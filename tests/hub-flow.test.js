import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';

// A01 Welle 1: Gesamtkreislauf Vertrag → Lkw → Dock → Entladen → Sortieren → Zustellung → Zahlung.
function hub(seed=7){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 for(const c of [{type:'build',buildingType:'dock',x:2,y:13,rotation:0},{type:'build',buildingType:'rack',x:8,y:2,rotation:0},{type:'hire',role:'warehouse'},{type:'hire',role:'driver'},{type:'buyVehicle',vehicleType:'van'}])assert.equal(sim.command(c).ok,true,c.type);
 const c=s.contracts[0];assert.equal(sim.command({type:'acceptContract',id:c.id}).ok,true);
 return {sim,s,c};
}
const parcels=(s,loc)=>s.batches.filter(b=>b.item==='parcel'&&(!loc||b.location===loc)).reduce((n,b)=>n+b.qty,0);
function run(sim,cond,max=3000){for(let i=0;i<max;i++){if(cond())return;sim.step(1);}assert.fail('Bedingung nicht erreicht');}
function deliver(sim,s){
 for(const o of s.orders.filter(o=>o.source==='hub'&&o.status==='active'&&o.delivered<o.qty)){
  run(sim,()=>s.vehicles.every(v=>v.status==='idle'));
  const v=s.vehicles[0],r=sim.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty:o.qty-o.delivered});assert.equal(r.ok,true,r.message);
 }
}

test('Hub-Kreislauf: angeliefert = zugestellt, Zahlung genau einmal, Speichern in jeder Phase',()=>{
 let {sim,s,c}=hub();const money0=s.money;
 run(sim,()=>s.yard.some(a=>a.phase==='unloading'));
 sim=Simulation.fromJSON(sim.serialize());s=sim.state; // Laden während Entladen
 run(sim,()=>s.yard[0].phase==='gone'&&parcels(s,'inbound')===0);
 const arrived=s.yard[0].parcels,orders=s.orders.filter(o=>o.contractId===c.id);
 assert.equal(orders.reduce((n,o)=>n+o.qty,0),arrived);assert.equal(parcels(s,'stock'),arrived);
 deliver(sim,s);
 run(sim,()=>s.shipments.some(x=>x.status==='transit'));
 sim=Simulation.fromJSON(sim.serialize());s=sim.state; // Laden während Fahrt
 run(sim,()=>orders.every(o=>s.orders.find(x=>x.id===o.id).paid>0)&&s.vehicles.every(v=>v.status==='idle'),4000);
 const done=s.orders.filter(o=>o.contractId===c.id);
 assert.equal(done.reduce((n,o)=>n+o.delivered,0),arrived);assert.equal(parcels(s,'stock')+parcels(s,'inbound'),0);
 const revenue=s.ledger.filter(l=>done.some(o=>(l.refs||[]).includes(o.id)||l.key.includes(o.id))&&l.amount>0);
 assert.ok(revenue.length>=1);assert.equal(new Set(revenue.map(l=>l.key)).size,revenue.length);
 assert.ok(s.money!==money0);
});

test('Ohne Dock wartet der Lkw sichtbar; nach Dockbau geht es weiter',()=>{
 const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state;
 assert.equal(sim.command({type:'hire',role:'warehouse'}).ok,true);assert.equal(sim.command({type:'acceptContract',id:s.contracts[0].id}).ok,true);
 run(sim,()=>s.yard.some(a=>a.phase==='queue'));sim.step(30);
 const a=s.yard[0];assert.equal(a.phase,'queue');assert.match(a.waitReason||'',/Dock/);
 assert.equal(sim.command({type:'build',buildingType:'dock',x:2,y:13,rotation:0}).ok,true);
 run(sim,()=>a.phase==='gone');assert.equal(a.unloaded,a.parcels);
});

test('Gleiche Befehle, gleiche Minuten → gleicher Zustand (1-Minuten- vs. 60-Minuten-Schritte)',()=>{
 const a=hub(11),b=hub(11);for(let i=0;i<900;i++)a.sim.step(1);for(let i=0;i<15;i++)b.sim.step(60);
 assert.equal(a.sim.serialize(),b.sim.serialize());
});
