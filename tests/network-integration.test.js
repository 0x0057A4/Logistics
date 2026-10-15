import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {lampGame, lampOffers, withManufacturing} from './fertigung-fixture.mjs';
const cmd=(s,type,data={})=>{const r=s.command({type,...data});assert.equal(r.ok,true,`${type}: ${r.message}`);return r;};
function until(s,fn,max=700){for(let i=0;i<max&&!fn();i++)s.step(1);assert.ok(fn(),`Zeitlimit bei ${s.state.t}`);}
function stock(s,item,site,owner='company'){return s.state.batches.filter(b=>b.item===item&&b.site===site&&b.owner===owner&&b.location==='stock').reduce((n,b)=>n+b.qty,0);}
function continuation(s,n=5){const other=Simulation.fromJSON(s.serialize());s.step(n);other.step(n);assert.equal(s.serialize(),other.serialize());}
function depot(s,site){cmd(s,'build',{buildingType:'dock',site,x:2,y:10,rotation:0});cmd(s,'hire',{role:'warehouse',site});}

test('Standorttransfer hält volle Zielhalle sauber und erzeugt keinen Konzernumsatz',()=>{
 const s=new Simulation({mode:'sandbox',seed:49}),source='site-1',target=cmd(s,'buySite',{name:'Zielhalle'}).id;
 depot(s,source);depot(s,target);cmd(s,'hire',{role:'driver',site:source});cmd(s,'buyVehicle',{vehicleType:'van',site:source});
 cmd(s,'buy',{item:'housing',qty:8,site:source});cmd(s,'buy',{item:'carton',qty:40,site:target});until(s,()=>stock(s,'housing',source)===8&&stock(s,'carton',target)===40);
 cmd(s,'transfer',{item:'housing',qty:8,site:source,toSite:target,vehicleId:s.state.vehicles[0].id});continuation(s,1);
 until(s,()=>s.state.transfers[0].status==='transit');continuation(s,3);
 until(s,()=>s.state.transfers[0].status==='unloading');s.step(8);const tr=s.state.transfers[0];assert.equal(tr.status,'unloading');assert.equal(stock(s,'housing',target),0);
 assert.equal(tr.cargo.map(id=>s.state.batches.find(b=>b.id===id)).reduce((n,b)=>n+(b.location==='vehicle'?b.qty:0),0),8);continuation(s,3);
 cmd(s,'build',{buildingType:'rack',site:target,x:6,y:3,rotation:0});until(s,()=>tr.status==='complete');assert.equal(stock(s,'housing',target),8);assert.equal(stock(s,'housing',source),0);assert.equal(s.state.stats.revenue,0);continuation(s,1);
});
test('Kundenware bleibt fremdes Eigentum und kann nicht als eigene Ware verkauft werden',()=>{
 const s=new Simulation({mode:'guided',seed:18});depot(s,'site-1');withManufacturing(s);cmd(s,'hire',{role:'driver',site:'site-1'});cmd(s,'buyVehicle',{vehicleType:'van',site:'site-1'});
 const own=s.state.orders.find(o=>o.kind==='manufacturing'),external=s.state.orders.find(o=>o.kind==='logistics');cmd(s,'acceptOrder',{id:own.id});cmd(s,'acceptOrder',{id:external.id});
 until(s,()=>stock(s,external.item,'site-1',external.id)===external.qty);assert.equal(stock(s,external.item,'site-1'),0);
 assert.equal(s.command({type:'dispatch',orderId:own.id,vehicleId:s.state.vehicles[0].id,qty:1,site:'site-1'}).ok,false);
 cmd(s,'dispatch',{orderId:external.id,vehicleId:s.state.vehicles[0].id,qty:external.qty,site:'site-1'});continuation(s,2);until(s,()=>external.paid===external.qty*external.price);assert.equal(s.state.stats.revenue,external.qty*external.price);assert.equal(stock(s,external.item,'site-1',external.id),0);
});
test('Fremde Rohstoffe werden nicht durch Eigenfertigung verbraucht',()=>{
 const s=new Simulation();cmd(s,'build',{buildingType:'assembly',x:4,y:4,site:'site-1',rotation:0});cmd(s,'hire',{role:'production',site:'site-1'});
 // Kontrollierte Lager-Fixture: Kundenmaterial lässt sich derzeit nicht einkaufen.
 for(const item of ['housing','board'])s.api.inventory.add({item,qty:1,site:'site-1',owner:'customer-fixture',location:'stock',quality:90,unitCost:20});
 s.step(20);assert.equal(stock(s,'housing','site-1','customer-fixture'),1);assert.equal(stock(s,'board','site-1','customer-fixture'),1);assert.equal(s.state.jobs.length,0);
});
test('Gewichtsgrenze gilt zusätzlich zu Ladeplätzen',()=>{
 const s=new Simulation({mode:'sandbox'}),target=cmd(s,'buySite',{name:'Gewichtsziel'}).id;cmd(s,'buyVehicle',{vehicleType:'van',site:'site-1'});
 // 17 Profilleuchten: 17 Plätze, aber 85 Gewichtspunkte bei maximal 80.
 s.api.inventory.add({item:'lamp_pro',qty:17,site:'site-1',owner:'company',location:'stock',quality:90,unitCost:60});
 assert.equal(s.command({type:'transfer',item:'lamp_pro',qty:17,toSite:target,vehicleId:s.state.vehicles[0].id,site:'site-1'}).ok,false);assert.equal(s.state.reservations.length,0);
 cmd(s,'transfer',{item:'lamp_pro',qty:16,toSite:target,vehicleId:s.state.vehicles[0].id,site:'site-1'});continuation(s,1);
});
