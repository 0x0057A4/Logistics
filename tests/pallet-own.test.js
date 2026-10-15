// W2-S2 Paletten und Stapler (A05/A07): Entladen mit Stapler + Lagerkraft direkt nach stock, Akku, Strom,
// exklusive Staplerbindung, Beladen eigener Lkw, maxLoad. Fixture wie yard-own (Vertrag sofort beendet) + Aufträge item 'pallet'.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import {maxLoad} from '../dist/transport.js';

const cid=sim=>sim.state.contracts.find(c=>c.status==='ended')?.id??'vertrag-test';
function setup({docks=1,racks=2,workers=1,drivers=0,forklifts=1}={}){
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;
 const dockPos=[[2,10],[6,10]],rackPos=[[2,2],[5,2],[8,2]],forkPos=[[12,2],[14,2]];
 const dockIds=[],forkIds=[];
 for(let i=0;i<docks;i++){const r=sim.command({type:'build',buildingType:'dock',x:dockPos[i][0],y:dockPos[i][1]});assert.equal(r.ok,true,r.message);dockIds.push(r.id);}
 for(let i=0;i<racks;i++){const r=sim.command({type:'build',buildingType:'rack',x:rackPos[i][0],y:rackPos[i][1]});assert.equal(r.ok,true,r.message);}
 for(let i=0;i<forklifts;i++){const r=sim.command({type:'build',buildingType:'forklift',x:forkPos[i][0],y:forkPos[i][1]});assert.equal(r.ok,true,r.message);forkIds.push(r.id);}
 for(let i=0;i<workers;i++)assert.equal(sim.command({type:'hire',role:'warehouse'}).ok,true);
 for(let i=0;i<drivers;i++)assert.equal(sim.command({type:'hire',role:'driver'}).ok,true);
 const c=s.contracts[0];assert.equal(sim.command({type:'acceptContract',id:c.id}).ok,true);assert.equal(sim.command({type:'cancelContract',id:c.id}).ok,true);
 const fork=i=>s.buildings.find(b=>b.id===forkIds[i]);
 return {sim,s,dockIds,forkIds,fork};
}
function orders(sim,qtys,item='pallet',eta=520,sla=600){const s=sim.state;return qtys.map((qty,i)=>{const id=sim.api.id('order');// Ohne contractId: contracts.validate (A08) erlaubt bis W2-S1 nur item 'parcel' in Vertragsaufträgen.
  s.orders.push({id,kind:'logistics',source:'hub',lane:`lane-${i}`,customer:`Gebiet ${i+1} (Testversand)`,item,qty,price:40,due:eta+sla,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});return id;});}
function arrive(sim,qtys,eta,item='pallet'){const ids=orders(sim,qtys,item,eta);return yard.schedule(sim.state,sim.api,{contractId:cid(sim),site:sim.state.selectedSite,parcels:qtys.reduce((n,q)=>n+q,0),eta,orderIds:ids});}
const pallets=(s,loc)=>s.batches.filter(b=>b.item==='pallet'&&(!loc||b.location===loc)).reduce((n,b)=>n+b.qty,0);
function runUntil(sim,cond,max=600){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);}assert.fail('Bedingung nicht erreicht');}
const reload=sim=>Simulation.fromJSON(sim.serialize());
const key=a=>`${a.id}:forklift`;

test('Palettenankunft am Auftrags-item erkannt; Paketankunft unverändert ohne item',()=>{
 const {sim}=setup();const p=arrive(sim,[6,4],485),q=arrive(sim,[20],485,'parcel');
 assert.equal(p.item,'pallet');assert.equal(q.item,undefined);assert.ok(!('item' in q));
 assert.deepEqual(p.split.map(x=>x.target),[6,4]);
});

test('Entladen mit Stapler: 1 Palette/min, direkt nach stock, Bindung exklusiv, Akku −0,5/min, danach Laden',()=>{
 const {sim,s,fork}=setup();const a=arrive(sim,[6,4],485);
 runUntil(sim,()=>a.phase==='unloading');
 sim.step(1);assert.equal(a.unloaded,1);assert.equal(fork(0).task,key(a));assert.equal(s.workers[0].task,`${a.id}:warehouse`);
 assert.equal(fork(0).charge,99.5);
 sim.step(3);assert.equal(a.unloaded,4);assert.equal(fork(0).charge,98);
 assert.equal(pallets(s,'inbound'),0);assert.equal(pallets(s,'stock'),4);
 runUntil(sim,()=>a.phase==='exit');
 assert.equal(a.unloaded,10);assert.equal(pallets(s,'stock'),10);assert.equal(fork(0).task,null);
 a.orderIds.forEach((id,i)=>assert.equal(s.batches.filter(b=>b.owner===id&&b.item==='pallet').reduce((n,b)=>n+b.qty,0),[6,4][i]));
 assert.ok(s.batches.filter(b=>b.item==='pallet').every(b=>Number.isInteger(b.qty)&&b.location==='stock'));
 // Sortierung ignoriert Paletten: kein Sortierzustand angelegt.
 assert.equal(s.sorting,undefined);
 const c=fork(0).charge;sim.step(3);assert.equal(fork(0).charge,Math.min(100,c+3));
 sim.step(20);assert.equal(fork(0).charge,100);
 yard.validate(s);
});

test('Ohne Stapler: Wartegrund „Kein Stapler“, keine Lagerkraft gebunden; Bau setzt fort',()=>{
 const {sim,s}=setup({forklifts:0});const a=arrive(sim,[5],485);
 runUntil(sim,()=>a.phase==='unloading');sim.step(3);
 assert.equal(a.unloaded,0);assert.equal(a.waitReason,yard.WAIT.forklift);assert.equal(a.waitReason,'Kein Stapler');
 assert.ok(!s.workers.some(w=>w.task===`${a.id}:warehouse`));
 assert.equal(sim.command({type:'build',buildingType:'forklift',x:12,y:2}).ok,true);
 runUntil(sim,()=>a.phase==='exit');assert.equal(pallets(s,'stock'),5);
});

test('Akku unter 10: „Stapler lädt“, nach Laden weiter; Grenze exakt',()=>{
 const {sim,s,fork}=setup();const a=arrive(sim,[5],485);
 runUntil(sim,()=>a.phase==='unloading');fork(0).charge=8;
 sim.step(1);assert.equal(a.unloaded,0);assert.equal(a.waitReason,'Stapler lädt');assert.ok(!fork(0).task);assert.equal(fork(0).charge,9);
 assert.ok(!s.workers.some(w=>w.task===`${a.id}:warehouse`));
 sim.step(1);assert.equal(fork(0).charge,10);assert.equal(a.unloaded,0);
 sim.step(1);assert.equal(a.unloaded,1);assert.equal(fork(0).charge,9.5);
 sim.step(1);assert.equal(a.unloaded,1);assert.equal(a.waitReason,'Stapler lädt');
 runUntil(sim,()=>a.phase==='exit');assert.equal(pallets(s,'stock'),5);yard.validate(s);
});

test('Ein Stapler, zwei Lkw an zwei Docks: nie doppelt gebunden, Mengen exakt',()=>{
 const {sim,s,fork}=setup({docks:2,workers:2});const a=arrive(sim,[8],485),b=arrive(sim,[7],485);
 let both=false;
 for(let i=0;i<120;i++){sim.step(1);yard.validate(s);
  const bound=s.buildings.filter(x=>x.type==='forklift'&&x.task).length;assert.ok(bound<=1);
  if(a.phase==='unloading'&&b.phase==='unloading'){both=true;const waiting=[a,b].find(x=>fork(0).task!==key(x));assert.ok(['Kein Stapler',null].includes(waiting.waitReason));}
 }
 assert.ok(both,'beide gleichzeitig am Dock');
 assert.equal(a.phase,'gone');assert.equal(b.phase,'gone');assert.equal(pallets(s,'stock'),15);
 // Bindung manipuliert: doppelt → validate lehnt ab.
 const {sim:s2,fork:f2}=setup({forklifts:2});f2(0).task='x:forklift';f2(1).task='x:forklift';
 assert.throws(()=>yard.validate(s2.state),/doppelt/);
 f2(1).task=null;f2(0).charge=101;assert.throws(()=>yard.validate(s2.state),/Staplerakku/);
});

test('Schichtende während Entladen: wartet, Stapler frei, Menge exakt; Speichern/Laden erhält Zustand',()=>{
 const {sim,s,fork}=setup();const a=arrive(sim,[10],485);
 runUntil(sim,()=>a.phase==='unloading');sim.step(3);assert.equal(a.unloaded,3);
 const w=s.workers[0];assert.equal(sim.command({type:'setShift',id:w.id,shift:'night'}).ok,true);sim.step(2);
 assert.equal(a.unloaded,3);assert.equal(a.waitReason,yard.WAIT.staff);assert.equal(fork(0).task,null);
 const r=reload(sim);assert.equal(r.state.yard.find(x=>x.id===a.id).unloaded,3);assert.equal(r.state.yard.find(x=>x.id===a.id).item,'pallet');
 assert.equal(sim.command({type:'setShift',id:w.id,shift:'day'}).ok,true);
 runUntil(sim,()=>a.phase==='exit');assert.equal(pallets(s,'stock'),10);
});

test('Strom weg während Entladen: wartet, kein Laden; Strom zurück → fertig, Menge exakt',()=>{
 const {sim,s,fork}=setup();const a=arrive(sim,[6],485);
 runUntil(sim,()=>a.phase==='unloading');sim.step(2);assert.equal(a.unloaded,2);
 const site=s.sites[0],energy=site.energy;site.energy=0;const c=fork(0).charge;
 sim.step(3);assert.equal(a.unloaded,2);assert.equal(a.waitReason,yard.WAIT.forkliftPower);assert.equal(fork(0).task,null);assert.equal(fork(0).charge,c,'ohne Strom kein Laden');
 site.energy=energy;runUntil(sim,()=>a.phase==='exit');assert.equal(pallets(s,'stock'),6);
});

test('Speichern/Laden mitten im Entladen: identischer Fortlauf',()=>{
 const {sim,fork}=setup();const a=arrive(sim,[9],485);
 runUntil(sim,()=>a.phase==='unloading');sim.step(2);assert.equal(fork(0).task,key(a));
 const copy=reload(sim);sim.step(30);copy.step(30);
 assert.equal(copy.serialize(),sim.serialize());assert.equal(copy.state.batches.filter(b=>b.item==='pallet').reduce((n,b)=>n+b.qty,0),9);
});

test('maxLoad: Lieferwagen 0 Paletten, Lkw nach Gewicht; Lieferwagen-Versand abgelehnt',()=>{
 const van={type:'van',capacity:20},truck={type:'truck',capacity:80};
 assert.equal(maxLoad(van,'pallet'),0);assert.equal(maxLoad(truck,'pallet'),20 /* A01: Nutzlast 6000 kg */);
 const {sim,s}=setup({drivers:1});const a=arrive(sim,[2],485);runUntil(sim,()=>a.phase==='exit');
 assert.equal(sim.command({type:'buyVehicle',vehicleType:'van'}).ok,true);
 const r=sim.command({type:'dispatch',vehicleId:s.vehicles[0].id,orderId:a.orderIds[0],qty:1});assert.equal(r.ok,false);
});

test('Beladen eigener Lkw mit Paletten braucht Stapler; Bindung bis Abfahrt, danach frei',()=>{
 const {sim,s,fork}=setup({drivers:1});const a=arrive(sim,[3],485);runUntil(sim,()=>a.phase==='exit');
 assert.equal(sim.command({type:'buyVehicle',vehicleType:'truck'}).ok,true);const v=s.vehicles[0];
 fork(0).enabled=false;
 const r=sim.command({type:'dispatch',vehicleId:v.id,orderId:a.orderIds[0],qty:1});assert.equal(r.ok,true,r.message);
 const sh=s.shipments.find(x=>x.id===r.id);sim.step(3);
 assert.equal(sh.status,'loading');assert.equal(sh.blocked,'Kein Stapler');assert.ok(!s.workers.some(w=>w.task===`${sh.id}:warehouse`));
 const rem=sh.remaining;fork(0).enabled=true;sim.step(1);
 assert.equal(fork(0).task,`${sh.id}:forklift`);assert.equal(sh.blocked,null);assert.equal(sh.remaining,rem-1);
 const copy=reload(sim);
 runUntil(sim,()=>sh.status==='transit');assert.equal(fork(0).task,null);
 runUntil(copy,()=>copy.state.shipments.find(x=>x.id===sh.id).status==='transit');assert.equal(copy.state.buildings.find(b=>b.id===fork(0).id).task,null);
 runUntil(sim,()=>sh.status==='complete');assert.equal(s.orders.find(o=>o.id===a.orderIds[0]).delivered,1);
 assert.equal(pallets(s),2);
});

test('Stornierte Palettenlieferung gibt Stapler frei',()=>{
 const {sim,s,fork}=setup({drivers:1});const a=arrive(sim,[2],485);runUntil(sim,()=>a.phase==='exit');
 assert.equal(sim.command({type:'buyVehicle',vehicleType:'truck'}).ok,true);
 const r=sim.command({type:'dispatch',vehicleId:s.vehicles[0].id,orderId:a.orderIds[0],qty:1});assert.equal(r.ok,true);
 sim.step(1);assert.equal(fork(0).task,`${r.id}:forklift`);
 assert.equal(sim.command({type:'cancelShipment',id:r.id}).ok,true);assert.equal(fork(0).task,null);
 reload(sim);
});
