// A11 · QS Welle 1 (0.9): Befundtests (01–04 behoben, aktiv). Details docs/QS-0.9-W1.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation} from '../dist/core.js';
import {depot,cmd,until,reload} from './qa-w1-hub.mjs';
import {WAIT} from '../dist/yard.js';

const docks=s=>s.buildings.filter(b=>b.type==='dock');

test('QS-W1-01 Dock während Beladung abgeschaltet (2 Docks): nach Abfahrt bleibt keine verwaiste Dockbelegung',()=>{
 const r=depot({minute:600,warehouse:2,docks:2});until(r,s=>s.t===1440+480);
 const o=r.s.orders.find(o=>o.source==='hub');const sh=cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:r.s.vehicles[0].id,qty:40}).id;
 r.sim.step(1);const used=docks(r.sim.state).find(b=>b.task===sh);
 cmd(r.sim,{type:'toggleBuilding',id:used.id});r.sim.step(2);cmd(r.sim,{type:'toggleBuilding',id:used.id});
 until(r,s=>s.shipments[0].status==='complete');r.sim=reload(r.sim);
 assert.deepEqual(docks(r.sim.state).filter(b=>b.task).map(b=>b.id+':'+b.task),[],'Dock bleibt durch abgeschlossene Lieferung belegt');
});

test('QS-W1-01b Dock während Tour-Beladung abgeschaltet: abgeschaltetes Dock bleibt nicht bis Tourende belegt',()=>{
 const r=depot({seed:3,minute:600,warehouse:2,docks:2});until(r,s=>s.t===1440+480);
 const os=r.s.orders.filter(o=>o.source==='hub');assert.ok(os.length>=2);
 const t=cmd(r.sim,{type:'dispatchTour',vehicleId:r.s.vehicles[0].id,stops:os.slice(0,2).map(o=>({orderId:o.id,qty:20}))}).id;
 r.sim.step(1);const used=docks(r.sim.state).find(b=>b.task===t);
 cmd(r.sim,{type:'toggleBuilding',id:used.id});r.sim.step(2);until(r,s=>s.tours[0].status==='transit');cmd(r.sim,{type:'toggleBuilding',id:used.id});
 assert.deepEqual(docks(r.sim.state).filter(b=>b.task).map(b=>b.id+':'+b.task),[],'Dock während Fahrt weiter belegt');
});

test('QS-W1-03 Lkw am abgeschalteten Dock wechselt zum freien zweiten Dock (oder Warteschlange)',()=>{
 const r=depot({minute:600,warehouse:2,docks:2});until(r,s=>s.yard[0]?.phase==='unloading'&&s.yard[0].unloaded>0);
 const a=()=>r.sim.state.yard[0],dock=a().dock;cmd(r.sim,{type:'toggleBuilding',id:dock});r.sim.step(10);
 assert.notEqual(a().waitReason,WAIT.dockOff,'Lkw steht am abgeschalteten Dock, obwohl ein Dock frei ist');
});

test('QS-W1-04 Migrierter 0.8-Stand erhält sofort ein Vertragsangebot (nicht erst um 17:00/05:00)',()=>{
 // 0.8-Stand ohne contracts/yard (Format wie bf76e22): aktueller Neubeginn, Hub-Listen entfernt.
 const s=JSON.parse(new Simulation({mode:'guided',seed:808}).serialize());delete s.contracts;delete s.yard;s.t=780;
 const sim=Simulation.fromJSON(JSON.stringify(s));sim.step(1);
 assert.ok(sim.state.contracts.some(k=>k.status==='offer'),'kein Angebot nach Migration');
});

test('QS-W1-03b Wechsel: neues Dock, Fortschritt bleibt, Kraft frei, Ablauf vollständig; kein Dock frei → Wartegrund',()=>{
 const r=depot({minute:600,warehouse:2,docks:2});until(r,s=>s.yard[0]?.phase==='unloading'&&s.yard[0].unloaded>0);
 const a=()=>r.sim.state.yard[0],old=a().dock,u=a().unloaded;cmd(r.sim,{type:'toggleBuilding',id:old});r.sim.step(1);
 assert.equal(a().phase,'toDock');assert.notEqual(a().dock,old);assert.equal(a().unloaded,u);
 assert.equal(docks(r.sim.state).find(b=>b.id===old).task,null,'altes Dock frei');
 assert.ok(r.sim.state.workers.every(w=>w.task!==`${a().id}:warehouse`),'Lagerkraft gelöst');
 r.sim=reload(r.sim);until(r,s=>s.yard[0].phase==='gone');assert.equal(a().unloaded,a().parcels);
 const q=depot({minute:600,warehouse:2,docks:2});until(q,s=>s.yard[0]?.phase==='unloading'&&s.yard[0].unloaded>0);
 const b=()=>q.sim.state.yard[0];for(const d of docks(q.sim.state))if(d.id!==b().dock)cmd(q.sim,{type:'toggleBuilding',id:d.id});
 cmd(q.sim,{type:'toggleBuilding',id:b().dock});const n=b().unloaded;q.sim.step(5);
 assert.equal(b().phase,'unloading');assert.equal(b().waitReason,WAIT.dockOff);assert.equal(b().unloaded,n);
});
