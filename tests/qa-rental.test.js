import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {lampGame, lampOffers, withManufacturing} from './fertigung-fixture.mjs';
const cmd=(sim,type,data={})=>{const r=sim.command({type,...data});assert.equal(r.ok,true,r.message);return r;};
function setup(){const sim=new Simulation({mode:'sandbox',seed:83});cmd(sim,'build',{buildingType:'dock',x:2,y:10});for(const role of ['warehouse','driver','service'])cmd(sim,'hire',{role});const rental=cmd(sim,'rentVehicle',{vehicleType:'van'});withManufacturing(sim);const orders=sim.state.orders.filter(o=>o.kind==='manufacturing').slice(0,2);for(const o of orders)cmd(sim,'acceptOrder',{id:o.id});sim.api.inventory.add({item:'lamp',qty:6,quality:95,site:sim.state.selectedSite});return {sim,rental,orders};}
function until(sim,predicate){for(let i=0;i<3000&&!predicate();i++)sim.step();assert.ok(predicate(),'Zielzustand erreicht');}
test('QS Miete: Rückladetour blockiert Rückgabe in allen Phasen; volle Rampe verliert keine Ware',()=>{
 const {sim,rental,orders}=setup(),s=sim.state;
 const dispatch=returnQty=>cmd(sim,'dispatchTour',{vehicleId:rental.vehicleId,stops:orders.map(o=>({orderId:o.id,qty:1,returnQty}))});
 dispatch(0);until(sim,()=>s.tours[0].status==='complete');dispatch(1);const t=s.tours[1],seen=new Set();
 until(sim,()=>{seen.add(t.status);if(t.status!=='complete')assert.equal(sim.command({type:'returnRental',id:rental.id}).ok,false);return t.status==='returnUnloading';});
 const fill=sim.api.inventory.add({item:'carton',qty:sim.api.inventory.free(s.selectedSite),site:s.selectedSite});sim.step(20);
 assert.equal(t.status,'returnUnloading');assert.equal(sim.command({type:'returnRental',id:rental.id}).ok,false);
 const copy=Simulation.fromJSON(sim.serialize());assert.equal(copy.serialize(),sim.serialize());
 sim.api.inventory.remove(fill.id,fill.qty);until(sim,()=>t.status==='complete');cmd(sim,'returnRental',{id:rental.id});until(sim,()=>s.returns.every(r=>r.status==='decision'));
 assert.equal(s.ledger.filter(l=>l.key.startsWith('return-refund:')).length,2);assert.equal(s.returns.reduce((n,r)=>n+r.qty,0),2);
 for(const phase of ['loading','transit','unloading','collecting','returning','returnUnloading'])assert.ok(seen.has(phase),phase);
 validateState(s);assert.equal(Simulation.fromJSON(sim.serialize()).serialize(),sim.serialize());
});
test('QS Miete: Ladegrenze nach Save/Load erzeugt genau eine Tagesbuchung je Vertrag',()=>{
 const sim=new Simulation({mode:'sandbox'});const a=cmd(sim,'rentVehicle',{vehicleType:'van'});sim.step(100);const b=cmd(sim,'rentVehicle',{vehicleType:'truck'});sim.step(1339);
 const copy=Simulation.fromJSON(sim.serialize());copy.step();assert.deepEqual(copy.state.rentals.map(r=>r.paidDays),[2,1]);copy.step(100);assert.deepEqual(copy.state.rentals.map(r=>r.paidDays),[2,2]);
 for(const r of [a,b])assert.equal(copy.state.ledger.filter(l=>l.key.startsWith(`vehicle-rent:${r.id}:`)).length,2);
 cmd(copy,'returnRental',{id:a.id});copy.step(1440);assert.deepEqual(copy.state.rentals.map(r=>r.paidDays),[2,3]);validateState(copy.state);
});
test('QS Miete: Fremdes Fahrzeug darf bestehenden Vertrag nicht mitbenutzen',()=>{
 const sim=new Simulation({mode:'sandbox'}),r=cmd(sim,'rentVehicle',{vehicleType:'van'});cmd(sim,'buyVehicle',{vehicleType:'van'});const data=JSON.parse(sim.serialize());data.vehicles[1].rentalId=r.id;assert.throws(()=>Simulation.fromJSON(JSON.stringify(data)),/Mietfahrzeug/);
});
test('QS Miete: Altstand ohne Mietfeld bleibt nutzbar und neue Miete roundtript',()=>{
 const old=new Simulation({mode:'sandbox'});delete old.state.rentals;const loaded=Simulation.fromJSON(old.serialize());const r=cmd(loaded,'rentVehicle',{vehicleType:'refrigerated'});loaded.step(1440);const again=Simulation.fromJSON(loaded.serialize());assert.equal(again.state.rentals[0].paidDays,2);cmd(again,'returnRental',{id:r.id});validateState(again.state);
});
