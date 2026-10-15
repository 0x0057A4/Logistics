import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {planTour} from '../dist/tours.js';
import {lampGame, lampOffers, withManufacturing} from './fertigung-fixture.mjs';
function setup(){
 const sim=new Simulation({mode:'sandbox',seed:83}),s=sim.state;
 const run=(type,data={})=>{const r=sim.command({type,...data});assert.equal(r.ok,true,r.message);return r;};
 run('build',{buildingType:'dock',x:2,y:10});for(const role of ['warehouse','driver'])run('hire',{role});run('buyVehicle',{vehicleType:'van'});
 withManufacturing(sim);const orders=s.orders.filter(o=>o.kind==='manufacturing').slice(0,2);for(const o of orders)run('acceptOrder',{id:o.id});
 sim.api.inventory.add({item:'lamp',qty:8,quality:95,site:s.selectedSite});
 const stops=orders.map(o=>({orderId:o.id,qty:1}));return {sim,s,orders,stops,run,driver:s.workers.find(w=>w.role==='driver')};
}
function finish(sim){for(let n=0;n<3000&&sim.state.tours.at(-1).status!=='complete';n++)sim.step(1);assert.equal(sim.state.tours.at(-1).status,'complete');}
for(const mode of ['pause','schicht'])test(`Fahrerprognose berücksichtigt ${mode} ohne Zustandsmutation`,()=>{
 const {sim,s,stops,run,driver}=setup();for(const w of s.workers)w.shift='all';
 if(mode==='pause'){driver.breakRemaining=20;driver.fatigue=79;}else{s.t=950;driver.shift='day';}
 const before=sim.serialize(),plan=planTour(s,s.vehicles[0].id,stops);assert.equal(sim.serialize(),before);assert.ok(plan.ok);
 assert.ok(plan.driverForecast.waitMinutes>0);assert.equal(plan.driverForecast.elapsedMinutes,plan.minutes+plan.driverForecast.waitMinutes);
 const start=s.t;run('dispatchTour',{vehicleId:s.vehicles[0].id,stops});finish(sim);assert.equal(s.t-start,plan.driverForecast.elapsedMinutes);
 if(mode==='pause')assert.ok(plan.driverForecast.breakMinutes>0);else assert.ok(plan.driverForecast.shiftMinutes>0);
});
test('Gebundenes Fahrpersonal ergibt keine erfundene Ankunftsprognose',()=>{const {s,stops,driver}=setup();driver.task='anderer-auftrag';const p=planTour(s,s.vehicles[0].id,stops);assert.equal(p.ok,true);assert.equal(p.driverForecast.elapsedMinutes,null);assert.match(p.driverForecast.reason,/Fahrpersonal/);});
test('Rückladung prüft Kapazität nach jedem Stopp statt nur am Tourende',()=>{
 const {s,orders,stops}=setup();const o=orders[0];o.qty=30;o.delivered=20;s.shipments.push({id:'prior',orderId:o.id,qty:20,deliveredAt:s.t-1,cargo:[],invoiceAmount:2000,status:'complete'});
 stops[0].returnQty=20;stops[1].qty=2;assert.equal(planTour(s,s.vehicles[0].id,stops).ok,false);
 // Zweiter Stopp zuerst: dessen Ware ist bereits entladen, wenn Rückladung aufgenommen wird.
 assert.equal(planTour(s,s.vehicles[0].id,[stops[1],stops[0]]).ok,true);
 // 18 Volumeneinheiten passen, 88 kg überschreiten jedoch 80 kg Fahrzeuggewicht.
 o.item='lamp_pro';stops[0].returnQty=16;assert.equal(planTour(s,s.vehicles[0].id,stops).ok,false);assert.equal(planTour(s,s.vehicles[0].id,[stops[1],stops[0]]).ok,true);
});
test('Import und laufende Tour verhindern zweite Warenanlage durch zurückgesetzte Abholphase',()=>{
 const {sim,s,stops,run}=setup();run('dispatchTour',{vehicleId:s.vehicles[0].id,stops});finish(sim);
 run('dispatchTour',{vehicleId:s.vehicles[0].id,stops:stops.map(p=>({...p,returnQty:1}))});
 const t=s.tours.at(-1);for(let n=0;n<150&&!(t.status==='transit'&&t.stopIndex===1);n++)sim.step(1);
 assert.equal(s.returns[0].status,'onTour');const json=JSON.parse(sim.serialize());json.tours.at(-1).status='collecting';json.tours.at(-1).stopIndex=0;
 assert.throws(()=>Simulation.fromJSON(JSON.stringify(json)),/Abholung/);
 const count=s.batches.length;t.status='collecting';t.stopIndex=0;t.remaining=1;sim.step(1);assert.equal(s.batches.length,count);assert.match(t.blocked,/bereits aufgenommen/);
});
