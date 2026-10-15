import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import * as yard from '../dist/yard.js';

// Aufbau: Sandbox, Docks und Regale an festen Plätzen, eine Lagerkraft. Aufträge wie W1-S1 (contracts.js kommt parallel).
function setup({docks=1,racks=2,workers=1,drivers=0}={}){
 const sim=new Simulation({mode:'sandbox'}),s=sim.state,site=s.selectedSite;
 const dockPos=[[2,10],[6,10]],rackPos=[[2,2],[5,2],[8,2]];
 const dockIds=[];
 for(let i=0;i<docks;i++){const r=sim.command({type:'build',buildingType:'dock',x:dockPos[i][0],y:dockPos[i][1]});assert.equal(r.ok,true,r.message);dockIds.push(r.id);}
 for(let i=0;i<racks;i++){const r=sim.command({type:'build',buildingType:'rack',x:rackPos[i][0],y:rackPos[i][1]});assert.equal(r.ok,true,r.message);}
 for(let i=0;i<workers;i++)assert.equal(sim.command({type:'hire',role:'warehouse'}).ok,true);
 for(let i=0;i<drivers;i++)assert.equal(sim.command({type:'hire',role:'driver'}).ok,true);
 return {sim,s,site,dockIds};
}
function orders(sim,qtys,eta=520,sla=240){const s=sim.state;return qtys.map((qty,i)=>{const id=sim.api.id('order');s.orders.push({id,kind:'logistics',source:'hub',contractId:'vertrag-test',lane:`lane-${i}`,customer:`Gebiet ${i+1} (Testversand)`,item:'parcel',qty,price:1.2,due:eta+sla,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});return id;});}
function arrive(sim,qtys,eta){const ids=orders(sim,qtys,eta);return yard.schedule(sim.state,sim.api,{contractId:'vertrag-test',site:sim.state.selectedSite,parcels:qtys.reduce((n,q)=>n+q,0),eta,orderIds:ids});}
const parcels=(s,owner)=>s.batches.filter(b=>b.item==='parcel'&&(!owner||b.owner===owner)).reduce((n,b)=>n+b.qty,0);
function runUntil(sim,cond,max=600){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);}assert.fail('Bedingung nicht erreicht');}
const reload=sim=>Simulation.fromJSON(sim.serialize());

test('schedule legt Ankunft deterministisch mit fiktivem Spediteur an',()=>{
 const a1=(()=>{const {sim}=setup();return arrive(sim,[30,20],520);})(),a2=(()=>{const {sim}=setup();return arrive(sim,[30,20],520);})();
 assert.deepEqual(a1,a2);
 assert.equal(a1.phase,'approach');assert.equal(a1.phaseStart,505);assert.equal(a1.phaseEnd,520);assert.equal(a1.dock,null);assert.equal(a1.unloaded,0);
 assert.match(a1.carrier,/^\S+ (Spedition|Logistik|Transporte|Frachtdienst|Güterverkehr)$/);assert.match(a1.plate,/^[A-Z]{3}-[A-Z]{2} \d{3,4}$/);
 assert.deepEqual(a1.split.map(p=>p.target),[30,20]);
});

test('Verteilung ganzzahlig, exakt und im Verhältnis der Auftragsmengen',()=>{
 assert.deepEqual(yard.apportion(10,[1,1,1]),[4,3,3]);assert.deepEqual(yard.apportion(7,[0,0]),[7,0]);
 const {sim,s}=setup();const a=arrive(sim,[17,11,5],481);
 runUntil(sim,()=>a.phase==='exit');
 assert.equal(a.unloaded,33);assert.equal(parcels(s),33);
 a.orderIds.forEach((id,i)=>assert.equal(parcels(s,id),[17,11,5][i]));
 assert.ok(s.batches.filter(b=>b.item==='parcel').every(b=>b.location==='inbound'&&Number.isInteger(b.qty)));
});

test('Vollständiger Phasenablauf mit Dauern, Rate 20/min und Freigabe bei exit',()=>{
 const {sim,s,dockIds}=setup();const a=arrive(sim,[50],485);const seen=[];
 runUntil(sim,()=>{if(seen.at(-1)!==a.phase)seen.push(a.phase);return a.phase==='gone';});
 assert.deepEqual(seen,['approach','gate','queue','toDock','docking','unloading','exit','gone'].filter(p=>p!=='queue'));
 assert.equal(s.buildings.find(b=>b.id===dockIds[0]).task,null);assert.equal(s.workers[0].task,null);
});

test('Entladen dauert ceil(parcels/20) Minuten',()=>{
 const {sim}=setup();const a=arrive(sim,[50],481);runUntil(sim,()=>a.phase==='unloading');
 sim.step(1);assert.equal(a.unloaded,20);sim.step(1);assert.equal(a.unloaded,40);sim.step(1);assert.equal(a.unloaded,50);assert.equal(a.phase,'exit');assert.equal(a.phaseEnd,a.phaseStart+3);
});

test('Zwei Lkw, ein Dock: FIFO nach Torankunft, zweiter wartet sichtbar',()=>{
 const {sim,s,dockIds}=setup();const late=arrive(sim,[40],490),early=arrive(sim,[160],485);
 runUntil(sim,()=>late.phase==='queue');
 assert.equal(early.dock,dockIds[0]);assert.equal(late.dock,null);assert.equal(late.waitReason,yard.WAIT.dock);assert.equal(late.phaseEnd,null);
 runUntil(sim,()=>late.phase==='toDock');
 assert.equal(early.phase,'exit');assert.equal(s.buildings.find(b=>b.id===dockIds[0]).task,late.id);assert.equal(late.waitReason,null);
 runUntil(sim,()=>late.phase==='gone');assert.equal(parcels(s),200);
});

test('prioritizeArrival zieht Lkw in der Warteschlange vor',()=>{
 const {sim,dockIds}=setup();const first=arrive(sim,[200],485),b=arrive(sim,[20],486),c=arrive(sim,[20],487);
 runUntil(sim,()=>c.phase==='queue');
 assert.equal(sim.command({type:'prioritizeArrival',id:c.id}).ok,true);assert.equal(sim.command({type:'prioritizeArrival',id:c.id}).ok,false);
 assert.equal(sim.command({type:'prioritizeArrival',id:first.id}).ok,false);assert.equal(sim.command({type:'prioritizeArrival',id:'fehlt'}).ok,false);
 runUntil(sim,()=>first.phase==='exit');assert.equal(c.dock,dockIds[0]);assert.equal(b.phase,'queue');
});

test('Lagerkraft beendet Schicht während Entladen: wartet, setzt fort, Menge erhalten',()=>{
 const {sim,s}=setup();const a=arrive(sim,[100],481);runUntil(sim,()=>a.phase==='unloading');sim.step(2);
 assert.equal(a.unloaded,40);const w=s.workers[0];
 assert.equal(sim.command({type:'setShift',id:w.id,shift:'night'}).ok,true);sim.step(3);
 assert.equal(a.unloaded,40);assert.equal(a.waitReason,yard.WAIT.staff);assert.equal(a.phase,'unloading');assert.equal(w.task,null);
 const saved=reload(sim);assert.equal(saved.state.yard[0].waitReason,yard.WAIT.staff);
 assert.equal(sim.command({type:'setShift',id:w.id,shift:'day'}).ok,true);sim.step(1);
 assert.equal(a.unloaded,60);assert.equal(a.waitReason,null);
 runUntil(sim,()=>a.phase==='exit');assert.equal(parcels(s,a.orderIds[0]),100);
});

test('Lager voll: Entladen stoppt mit Grund, setzt nach Platz fort',()=>{
 const {sim,s}=setup({racks:0});const cap=sim.api.inventory.capacity(s.selectedSite);assert.equal(cap,40);
 const a=arrive(sim,[50],481);runUntil(sim,()=>a.phase==='unloading');sim.step(4);
 assert.equal(a.unloaded,40);assert.equal(a.waitReason,yard.WAIT.full);assert.equal(parcels(s),40);
 assert.equal(sim.command({type:'build',buildingType:'rack',x:2,y:2}).ok,true);
 runUntil(sim,()=>a.phase==='exit');assert.equal(parcels(s),50);
});

test('Dock deaktiviert oder abgerissen während Warten und Anfahrt',()=>{
 const {sim,s,dockIds}=setup({docks:2,racks:3});const dock=s.buildings.find(b=>b.id===dockIds[0]);
 assert.equal(sim.command({type:'toggleBuilding',id:dockIds[1]}).ok,true);
 const a=arrive(sim,[200],485),b=arrive(sim,[20],486);
 runUntil(sim,()=>b.phase==='queue');assert.equal(b.waitReason,yard.WAIT.dock);
 // Belegtes Dock ist vor Abriss geschützt, freies deaktiviertes nicht.
 assert.equal(sim.command({type:'demolish',id:dockIds[0]}).ok,false);
 assert.equal(sim.command({type:'demolish',id:dockIds[1]}).ok,true);
 sim.step(5);assert.equal(b.phase,'queue');
 // Deaktivieren am Dock während Entladen: Wartegrund, kein Wechsel, Dock bleibt belegt.
 assert.equal(sim.command({type:'toggleBuilding',id:dock.id}).ok,true);const n=a.unloaded;sim.step(2);
 assert.equal(a.unloaded,n);assert.equal(a.waitReason,yard.WAIT.dockOff);assert.equal(dock.task,a.id);
 assert.equal(sim.command({type:'toggleBuilding',id:dock.id}).ok,true);
 runUntil(sim,()=>b.phase==='toDock');
 // Deaktivieren während toDock: zurück in die Warteschlange, Dock frei.
 assert.equal(sim.command({type:'toggleBuilding',id:dock.id}).ok,true);sim.step(1);
 assert.equal(b.phase,'queue');assert.equal(b.dock,null);assert.equal(dock.task,null);assert.equal(b.waitReason,yard.WAIT.dock);
 assert.equal(sim.command({type:'toggleBuilding',id:dock.id}).ok,true);
 runUntil(sim,()=>b.phase==='gone');assert.equal(parcels(s),220);
});

test('Eigene Lieferung und Fremd-Lkw konkurrieren ohne Doppelbelegung',()=>{
 const {sim,s,dockIds}=setup({workers:2,racks:3,drivers:1});
 assert.equal(sim.command({type:'buyVehicle',vehicleType:'van'}).ok,true);
 const o=s.orders.find(o=>o.kind==='manufacturing'&&o.status==='offer');assert.ok(o);assert.equal(sim.command({type:'acceptOrder',id:o.id}).ok,true);
 sim.api.inventory.add({item:o.item,qty:o.qty,quality:100,site:s.selectedSite,unitCost:10});
 // Fremd-Lkw belegt das Dock zuerst; eigene Lieferung wartet.
 const a=arrive(sim,[200],481);runUntil(sim,()=>a.phase==='toDock');
 assert.equal(sim.command({type:'dispatch',vehicleId:s.vehicles[0].id,orderId:o.id,qty:Math.min(o.qty,5)}).ok,true);
 const sh=s.shipments.at(-1);sim.step(1);
 assert.match(sh.blocked||'',/Laderampe/);assert.equal(s.buildings.find(b=>b.id===dockIds[0]).task,a.id);
 // Zweiter Fremd-Lkw kommt, während eigene Lieferung wartet. Nach exit gewinnt, wer im selben Takt zuerst prüft – nie beide.
 const b=arrive(sim,[20],s.t+16);
 for(let i=0;i<200;i++){sim.step(1);const holders=s.buildings.filter(x=>x.task);assert.ok(holders.length<=1);yard.validate(s);}
 assert.equal(a.phase,'gone');assert.equal(b.phase,'gone');assert.notEqual(sh.status,'loading');
});

test('Eigene Lieferung belegt Dock zuerst: Fremd-Lkw wartet',()=>{
 const {sim,s,dockIds}=setup({workers:2});
 assert.equal(sim.command({type:'buyVehicle',vehicleType:'van'}).ok,true);
 const o=s.orders.find(o=>o.kind==='manufacturing'&&o.status==='offer');assert.equal(sim.command({type:'acceptOrder',id:o.id}).ok,true);
 sim.api.inventory.add({item:o.item,qty:o.qty,quality:100,site:s.selectedSite,unitCost:10});
 assert.equal(sim.command({type:'dispatch',vehicleId:s.vehicles[0].id,orderId:o.id,qty:Math.min(o.qty,5)}).ok,true);
 const sh=s.shipments.at(-1);sim.step(1);assert.equal(s.buildings.find(b=>b.id===dockIds[0]).task,sh.id);
 const a=yard.schedule(s,sim.api,{contractId:'x',site:s.selectedSite,parcels:20,eta:s.t});
 // Lieferung hält das Dock (Fahrpersonal fehlt): Fremd-Lkw wartet, bis die eigene Ladung abfährt.
 sim.step(20);assert.equal(a.phase,'queue');assert.equal(a.waitReason,yard.WAIT.dock);assert.equal(s.buildings.find(b=>b.id===dockIds[0]).task,sh.id);
 assert.equal(sim.command({type:'hire',role:'driver'}).ok,true);
 runUntil(sim,()=>a.phase==='gone');assert.equal(parcels(s,'contract:x'),20);
});

test('Speichern und Laden in jeder Phase erhält Ablauf exakt',()=>{
 const {sim}=setup();const a=arrive(sim,[45,35],485),b=arrive(sim,[30],486);
 const phases=new Set();
 for(let i=0;i<80;i++){
  phases.add(a.phase);phases.add(b.phase);
  const copy=reload(sim);sim.step(1);copy.step(1);assert.equal(copy.serialize(),sim.serialize(),`Minute ${i}, Phase ${a.phase}/${b.phase}`);
 }
 for(const p of yard.PHASES)assert.ok(phases.has(p),p);
});

test('Determinismus: zwei Läufe gleicher Eingabe sind identisch',()=>{
 const run=()=>{const {sim}=setup({docks:2});arrive(sim,[60,40],490);arrive(sim,[25],492);arrive(sim,[90],493);sim.step(200);return sim.serialize();};
 assert.equal(run(),run());
});

test('atRisk bei knapper Frist, validate lehnt Fehler ab',()=>{
 const {sim,s,dockIds}=setup();const ids=orders(sim,[400],485,10);
 const a=yard.schedule(s,sim.api,{contractId:'c',site:s.selectedSite,parcels:400,eta:485,orderIds:ids});
 assert.equal(a.atRisk,true);
 runUntil(sim,()=>a.phase==='unloading');
 const bad=f=>{const c=JSON.parse(sim.serialize());f(c);assert.throws(()=>yard.validate(c));};
 bad(c=>{c.yard[0].phase='fliegt';});
 bad(c=>{c.yard[0].unloaded=c.yard[0].parcels+1;});
 bad(c=>{c.buildings.find(b=>b.id===dockIds[0]).task=null;});
 bad(c=>{c.yard[0].dock='building-fehlt';});
 bad(c=>{const x=JSON.parse(JSON.stringify(c.yard[0]));x.id='arrival-99999';c.yard.push(x);});
 bad(c=>{c.yard[0].split[0].done+=1;});
 bad(c=>{c.yard[0].orderIds=['order-fehlt'];});
 yard.validate(JSON.parse(sim.serialize()));
});
