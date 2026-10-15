import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {lampGame, lampOffers, withManufacturing} from './fertigung-fixture.mjs';
const SITE='site-1';
const cmd=(s,type,data={})=>{const r=s.command({type,...data});assert.equal(r.ok,true,`${type}: ${r.message}`);return r;};
function until(s,fn,max=1000){for(let i=0;i<max&&!fn();i++)s.step(1);assert.ok(fn(),`Zeitlimit bei ${s.state.t}`);}
function depot(){const s=new Simulation({mode:'sandbox',seed:83});cmd(s,'build',{buildingType:'dock',x:2,y:10,site:SITE,rotation:0});for(const role of ['warehouse','driver','service'])cmd(s,'hire',{role,site:SITE});cmd(s,'buyVehicle',{vehicleType:'van',site:SITE});return withManufacturing(s);}
function copy(s,n){const before=s.serialize(),forecast=s.forecast(n);assert.equal(s.serialize(),before,'Prognose verändert Ursprung');const other=Simulation.fromJSON(before);s.step(n);other.step(n);assert.equal(s.serialize(),other.serialize());assert.equal(s.serialize(),JSON.stringify(forecast));}
test('Sammeltour behält mehrere Aufträge und spätere Zahlungen bei Speicherung',()=>{
 const s=depot(),orders=s.state.orders.filter(o=>o.kind==='manufacturing').slice(0,2);for(const o of orders)cmd(s,'acceptOrder',{id:o.id});
 // Kontrollierte Fertigwaren-Fixture fokussiert Tour-/Zahlungsübergang.
 s.api.inventory.add({item:'lamp',qty:4,quality:95,unitCost:50,site:SITE,location:'stock',owner:'company'});
 cmd(s,'dispatchTour',{vehicleId:s.state.vehicles[0].id,stops:orders.map(o=>({orderId:o.id,qty:2}))});copy(s,2);until(s,()=>s.state.tours[0].status==='transit');copy(s,4);
 until(s,()=>s.state.tours[0].status==='complete'&&orders.every(o=>o.paid===o.price*2));const revenue=s.state.stats.revenue;s.step(10);assert.equal(s.state.stats.revenue,revenue);assert.ok(orders.every(o=>o.delivered===2));copy(s,1);
});
test('Retoure nach Sammeltour nutzt tatsächlichen Zustellnachweis',()=>{
 const s=depot(),orders=s.state.orders.filter(o=>o.kind==='manufacturing').slice(0,2);for(const o of orders)cmd(s,'acceptOrder',{id:o.id});s.api.inventory.add({item:'lamp',qty:4,quality:95,unitCost:50,site:SITE,location:'stock',owner:'company'});
 cmd(s,'dispatchTour',{vehicleId:s.state.vehicles[0].id,stops:orders.map(o=>({orderId:o.id,qty:2}))});until(s,()=>s.state.tours[0].status==='complete'&&orders.every(o=>o.paid>0));
 cmd(s,'createReturn',{orderId:orders[0].id,qty:1});until(s,()=>s.state.returns[0].status==='decision');assert.equal(s.state.returns[0].refund,orders[0].price);copy(s,1);
});
test('Kühlkette verschlechtert ungeschützte Ware zeitabhängig und heilt Schaden nicht',()=>{
 const s=depot();const b=s.api.inventory.add({item:'cold_module',qty:4,quality:90,unitCost:80,site:SITE,location:'stock',owner:'company'});
 assert.equal(b.temperature,4);assert.equal(b.quality,90);s.step(16);assert.equal(b.temperature,8);assert.equal(b.quality,90);copy(s,20);assert.ok(b.quality<90);until(s,()=>b.coldDamaged);
 const quality=b.quality;cmd(s,'build',{buildingType:'coldstore',site:SITE,x:6,y:3,rotation:0});s.step(60);assert.equal(b.temperature,4);assert.ok(b.quality<=quality);assert.equal(b.blocked,true);assert.equal(s.api.inventory.available('cold_module',SITE),0);copy(s,1);
});
test('Kühlfracht wird für ungekühlten Lieferwagen abgelehnt',()=>{
 const s=depot(),target=cmd(s,'buySite',{name:'Kühlziel'}).id;s.api.inventory.add({item:'cold_module',qty:4,quality:90,unitCost:80,site:SITE,location:'stock',owner:'company'});
 assert.equal(s.command({type:'transfer',item:'cold_module',qty:4,site:SITE,toSite:target,vehicleId:s.state.vehicles[0].id}).ok,false);assert.equal(s.state.reservations.length,0);
 cmd(s,'buyVehicle',{vehicleType:'refrigerated',site:SITE});cmd(s,'transfer',{item:'cold_module',qty:4,site:SITE,toSite:target,vehicleId:s.state.vehicles.at(-1).id});until(s,()=>s.state.transfers[0].status==='transit');copy(s,10);const b=s.state.batches.find(b=>b.id===s.state.transfers[0].cargo[0]);assert.equal(b.temperature,4);assert.equal(b.quality,90);
});
test('Multimodale Fracht verpasst Anschluss ohne Dokumente und bezahlt Kundenleistung einmal',()=>{
 const s=new Simulation({mode:'sandbox',seed:29});cmd(s,'build',{buildingType:'terminal',site:SITE,x:4,y:4,rotation:0});cmd(s,'hire',{role:'warehouse',site:SITE});
 const o=s.state.orders.find(o=>o.kind==='logistics');cmd(s,'acceptOrder',{id:o.id});until(s,()=>s.api.inventory.available(o.item,SITE,o.id)===o.qty);
 cmd(s,'bookFreight',{orderId:o.id,qty:o.qty,mode:'rail',site:SITE});const f=s.state.freights[0];cmd(s,'approveDocuments',{id:f.id});s.step(12);assert.equal(f.documentRemaining,10,'Prüfung ohne Servicepersonal fortgeschritten');
 until(s,()=>f.missedConnections>0);assert.equal(f.status,'waiting');copy(s,3);assert.equal(f.documents,'processing');
 cmd(s,'hire',{role:'service',site:SITE});s.step(9);assert.equal(f.documentRemaining,1);s.step(1);assert.equal(f.documents,'approved');
 until(s,()=>f.status==='transit');copy(s,10);for(const id of f.cargo)assert.equal(s.state.batches.find(b=>b.id===id).owner,o.id);
 until(s,()=>f.paid);assert.equal(o.paid,o.qty*o.price);const paid=o.paid;copy(s,20);assert.equal(o.paid,paid);assert.equal(s.state.ledger.filter(l=>l.key==='freight-payment:'+f.id).length,1);
});
