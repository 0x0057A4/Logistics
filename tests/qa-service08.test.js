import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation,validateState} from '../dist/core.js';
import {injectPortableSave} from '../dist/portable-save.js';
import {lampGame, lampOffers, withManufacturing} from './fertigung-fixture.mjs';
const cmd=(sim,type,data={})=>{const result=sim.command({type,...data});assert.equal(result.ok,true,result.message);return result;};
const ticket=(sim,order,kind,response)=>{const {id}=cmd(sim,'createTicket',{orderId:order.id,kind,extensionMinutes:120});if(response)cmd(sim,'respondTicket',{id,response});return sim.state.tickets.find(t=>t.id===id);};
function setup(staff=true){const sim=lampGame({mode:'sandbox',seed:873});const o=sim.state.orders.find(o=>o.kind==='manufacturing');cmd(sim,'acceptOrder',{id:o.id});if(staff)cmd(sim,'hire',{role:'service'});return {sim,o};}
const until=(sim,predicate,max=3000)=>{for(let i=0;i<max&&!predicate();i++)sim.step();assert.ok(predicate(),'Erwarteter Zustand erreicht');};
const charges=(sim,id)=>sim.state.ledger.filter(l=>l.key==='ticket-cost:'+id);

test('QS0.8: fehlendes Personal, Feierabend und Pause stoppen Arbeit ohne vorzeitige Terminänderung',()=>{
 const {sim,o}=setup(false),due=o.due,t=ticket(sim,o,'deadline','approve');sim.step(3);assert.equal(t.remaining,30);assert.equal(o.due,due);
 const {id}=cmd(sim,'hire',{role:'service'});cmd(sim,'setShift',{id,shift:'night'});sim.step(3);assert.equal(t.remaining,30);
 cmd(sim,'setShift',{id,shift:'day'});const w=sim.state.workers.find(w=>w.id===id);w.breakRemaining=3;sim.step(2);assert.equal(t.remaining,30);
 sim.step();assert.equal(t.remaining,29);assert.equal(o.due,due);until(sim,()=>t.status==='closed');assert.equal(o.due,due+120);assert.equal(charges(sim,t.id).length,1);validateState(sim.state);
});
test('QS0.8: Geldknappheit wartet nach Arbeitsende; Wiederladen bucht exakt einmal',()=>{
 const {sim,o}=setup(),due=o.due,t=ticket(sim,o,'deadline','approve');sim.state.money=0;sim.step(30);assert.equal(t.remaining,0);assert.equal(t.status,'processing');assert.equal(o.due,due);assert.equal(charges(sim,t.id).length,0);
 const copy=Simulation.fromJSON(sim.serialize());copy.state.money=100000;copy.step();assert.equal(copy.state.orders.find(x=>x.id===o.id).due,due+120);assert.equal(charges(copy,t.id).length,1);
 const reloaded=Simulation.fromJSON(copy.serialize());reloaded.step(50);assert.equal(charges(reloaded,t.id).length,1);assert.equal(reloaded.command({type:'respondTicket',id:t.id,response:'approve'}).ok,false);
 const tampered=JSON.parse(copy.serialize()),edited=tampered.tickets.find(x=>x.id===t.id);Object.assign(edited,{status:'processing',completedAt:null,outcome:null});assert.throws(()=>Simulation.fromJSON(JSON.stringify(tampered)),/Kundendienst/);
});
test('QS0.8: inzwischen erfüllter Auftrag macht Friständerung kostenfrei gegenstandslos',()=>{
 const {sim,o}=setup(),t=ticket(sim,o,'deadline','approve'),due=o.due;sim.step(10);o.delivered=o.qty;o.status='fulfilled';sim.step(20);assert.equal(t.status,'closed');assert.equal(t.outcome,'obsolete');assert.equal(o.due,due);assert.equal(charges(sim,t.id).length,0);validateState(sim.state);
});
test('QS0.8: überfälliger Auftrag erzeugt Beschwerde einmal; Terminänderung setzt Rufverlust nicht zurück',()=>{
 const {sim,o}=setup();o.due=sim.state.t+1;sim.step(2);const complaint=sim.state.tickets.find(t=>t.kind==='complaint');assert.ok(complaint);const reputation=sim.state.reputation,t=ticket(sim,o,'deadline','approve');sim.step(30);assert.equal(t.status,'closed');assert.ok(sim.state.reputation<=reputation);cmd(sim,'respondTicket',{id:complaint.id,response:'apologize'});sim.step(150);assert.equal(sim.state.tickets.filter(t=>t.orderId===o.id&&t.kind==='complaint').length,1);validateState(sim.state);
});
test('QS0.8: Teilzustellung, Retoure und Ticket teilen Servicepersonal; JSON und HTML erhalten laufende Arbeit',()=>{
 const {sim,o}=setup();cmd(sim,'build',{buildingType:'dock',x:2,y:10});for(const role of ['driver','warehouse'])cmd(sim,'hire',{role});cmd(sim,'buyVehicle',{vehicleType:'van'});sim.api.inventory.add({item:o.item,qty:1,quality:95,site:o.site});cmd(sim,'dispatch',{orderId:o.id,qty:1,vehicleId:sim.state.vehicles[0].id});until(sim,()=>sim.state.shipments[0].status==='complete'&&o.paid>0);cmd(sim,'createReturn',{orderId:o.id,qty:1});until(sim,()=>sim.state.returns[0].status==='inspection');
 sim.step();const r=sim.state.returns[0],t=ticket(sim,o,'status','inform'),before=t.remaining;assert.ok(r.remaining>0);sim.step();assert.equal(t.remaining,before,'Retourenprüfung belegt einzige Serviceperson');until(sim,()=>r.status==='decision');sim.step(2);assert.ok(t.remaining>0&&t.remaining<15);
 const raw=sim.serialize(),copy=Simulation.fromJSON(raw);assert.equal(copy.serialize(),raw);const html=injectPortableSave(fs.readFileSync(new URL('../dist/portable.html',import.meta.url),'utf8'),raw),embedded=html.match(/<script id="embedded-save" type="application\/json">([\s\S]*?)<\/script>/)[1];assert.equal(Simulation.fromJSON(embedded).serialize(),raw);
 until(copy,()=>copy.state.tickets.find(x=>x.id===t.id).status==='closed');assert.equal(copy.state.ledger.filter(l=>l.key==='return-refund:'+r.id).length,1);validateState(copy.state);
});
test('QS0.8: Altstand ohne Tickets migriert; fehlende Ticketreferenzen und doppelte Anliegen abgewiesen',()=>{
 const {sim,o}=setup(),old=JSON.parse(sim.serialize());delete old.tickets;assert.deepEqual(Simulation.fromJSON(JSON.stringify(old)).state.tickets,[]);const t=ticket(sim,o,'status','inform'),broken=JSON.parse(sim.serialize());broken.tickets[0].orderId='missing';assert.throws(()=>Simulation.fromJSON(JSON.stringify(broken)),/Kundendienst/);assert.equal(sim.command({type:'createTicket',orderId:o.id,kind:'status'}).ok,false);sim.step(15);assert.equal(t.status,'closed');assert.equal(sim.command({type:'createTicket',orderId:o.id,kind:'status'}).ok,false);
});
test('QS0.8: Gebühren beziehen sich auf Restwert; Kulanz bleibt bei fünf Prozent und höchstens 50 Euro',()=>{
 const {sim,o}=setup();o.delivered=2;const deadline=ticket(sim,o,'deadline','approve');assert.equal(deadline.cost,Math.round((o.qty-2)*o.price*.02*100)/100);
 o.paid=500;const complaint=ticket(sim,o,'complaint','goodwill');assert.equal(complaint.cost,25);sim.step(50);assert.equal(charges(sim,complaint.id)[0].amount,-25);
 const second=sim.state.orders.find(x=>x.kind==='manufacturing'&&x.id!==o.id);cmd(sim,'acceptOrder',{id:second.id});second.paid=2000;const capped=ticket(sim,second,'complaint','goodwill');assert.equal(capped.cost,50);sim.step(20);assert.equal(charges(sim,capped.id)[0].amount,-50);const copy=Simulation.fromJSON(sim.serialize());copy.step(20);assert.equal(charges(copy,capped.id).length,1);assert.equal(charges(copy,complaint.id).length,1);
});
