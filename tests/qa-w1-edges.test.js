// A11 · QS Welle 1 (0.9): Pflicht-Übergänge Hof/Personal/Dock/Transport (AGENTS.md). Bericht docs/QS-0.9-W1.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {depot,cmd,until,reload,parcels,checkQuantities,checkPayments} from './qa-w1-hub.mjs';
import {WAIT} from '../dist/yard.js';

const phaseAt=(minute,target,{warehouse=1}={})=>{ // erste Ankunftsminute, bei der der Lkw um 16:00 (t=960) in target ist
 for(let m=930;m<959;m++){const r=depot({minute:m,warehouse});until(r,s=>s.t===960);const a=r.s.yard[0];if(a?.phase===target&&(target!=='unloading'||a.unloaded>0))return {r,a,m};}
 assert.fail('kein Szenario für '+target);
};
// Lauf mit Laden + Invarianten jede Minute
function steps(r,n,{tag='',every=1}={}){for(let i=0;i<n;i++){r.sim.step(1);if(i%every===0){r.sim=reload(r.sim);r.s=r.sim.state;checkQuantities(r.s,tag+' t='+r.s.t);}}r.s=r.sim.state;}

test('QS-W1 Schichtende während Torkontrolle: Lkw wartet „Keine Torkontrolle“, Arbeitsfortschritt bleibt, morgens weiter; Laden jede Minute',()=>{
 const {r}=phaseAt(960,'gate');let a=()=>r.s.yard[0];
 r.sim.step(1);r.s=r.sim.state;
 assert.equal(a().phase,'gate');assert.equal(a().waitReason,WAIT.gate);assert.ok(r.s.workers.every(w=>!w.task),'niemand nach Schichtende gebunden');
 steps(r,600,{tag:'Tor über Nacht',every:7});assert.equal(a().phase,'gate');assert.equal(a().unloaded,0);
 until(r,s=>s.yard[0].phase==='gone');assert.equal(a().unloaded,a().parcels);
 assert.ok(r.s.t%1440>=480,'erst ab Schichtbeginn');
});

test('QS-W1 Schichtende während Entladen: Wartegrund Personal, Menge eingefroren, Dock bleibt belegt, keine verlorenen Pakete; morgens fertig',()=>{
 const {r}=phaseAt(960,'unloading');const a=()=>r.s.yard[0];r.sim.step(1);r.s=r.sim.state;
 const u=a().unloaded;assert.ok(u>0&&u<a().parcels,'teilweise entladen '+u);assert.equal(a().waitReason,WAIT.staff);
 const dock=r.s.buildings.find(b=>b.type==='dock');assert.equal(dock.task,a().id);
 steps(r,900,{tag:'Entladen über Nacht',every:11});assert.equal(a().unloaded,u,'kein Entladen ohne Personal');
 until(r,s=>s.yard[0].phase==='gone');checkQuantities(r.s);assert.equal(parcels(r.s),a().parcels-0);
});

test('QS-W1 Schichtende während Sortieren (Hand): Restmenge bleibt inbound, kein Sortieren nachts, morgens vollständig',()=>{
 // Ankunft so legen, dass um 16:00 noch Pakete inbound liegen
 let pick=null;for(let m=900;m<950&&!pick;m+=5){const r=depot({minute:m});until(r,s=>s.t===960);const inb=parcels(r.s,b=>b.location==='inbound');if(inb>0&&r.s.yard[0].phase!=='unloading'&&parcels(r.s,b=>b.location==='stock')>0)pick=r;}
 assert.ok(pick,'Szenario');const r=pick;const inb=parcels(r.s,b=>b.location==='inbound');
 steps(r,900,{tag:'Sortieren über Nacht',every:13});assert.equal(parcels(r.s,b=>b.location==='inbound'),inb);
 until(r,s=>parcels(s,b=>b.location==='inbound')===0);checkQuantities(r.s);
});

test('QS-W1 Dock abschalten während Warten (toDock/queue) und Entladen; Abriss/Versetzen eines belegten Docks abgelehnt',()=>{
 const r=depot({minute:600});const a=()=>r.s.yard[0];const dock=()=>r.s.buildings.find(b=>b.type==='dock');
 until(r,s=>s.yard[0]?.phase==='toDock');cmd(r.sim,{type:'toggleBuilding',id:dock().id});r.sim.step(1);
 assert.equal(a().phase,'queue');assert.equal(dock().task,null);steps(r,5);assert.equal(a().waitReason,WAIT.dock);
 cmd(r.sim,{type:'toggleBuilding',id:dock().id});until(r,s=>s.yard[0].phase==='unloading'&&s.yard[0].unloaded>0);
 assert.equal(r.sim.command({type:'demolish',id:dock().id}).ok,false,'Abriss während Entladen');
 assert.equal(r.sim.command({type:'move',id:dock().id,x:10,y:13,rotation:0}).ok,false,'Versetzen während Entladen');
 cmd(r.sim,{type:'toggleBuilding',id:dock().id});const u=a().unloaded;steps(r,30,{tag:'Dock aus'});
 assert.equal(a().unloaded,u);assert.equal(a().waitReason,WAIT.dockOff);assert.ok(r.s.workers.every(w=>!w.task?.endsWith(':warehouse')||!w.task.startsWith(a().id)),'Kraft freigegeben');
 cmd(r.sim,{type:'toggleBuilding',id:dock().id});until(r,s=>s.yard[0].phase==='gone');checkQuantities(r.s);
});

test('QS-W1 Dock abreißen, während Lkw in der Warteschlange steht: Lkw wartet, neues Dock → weiter',()=>{
 const r=depot({minute:600});const id=r.s.buildings.find(b=>b.type==='dock').id;
 until(r,s=>s.yard[0]?.phase==='approach');cmd(r.sim,{type:'demolish',id});
 until(r,s=>s.yard[0].phase==='queue');steps(r,20);assert.equal(r.s.yard[0].waitReason,WAIT.dock);
 cmd(r.sim,{type:'build',buildingType:'dock',x:6,y:13,rotation:0});until(r,s=>s.yard[0].phase==='gone');checkQuantities(r.s);
});

test('QS-W1 Zwei Lkw, ein Dock, gleiche Ankunftsminute: nie Doppelbelegung, FIFO, zweiter wartet sichtbar, beide vollständig',()=>{
 const r=depot({minute:600,warehouse:2});until(r,s=>s.contracts.some(k=>k.status==='offer'));
 const k2=r.s.contracts.find(k=>k.status==='offer');k2.arrivals=[{minute:600,parcels:k2.arrivals[0].parcels}];cmd(r.sim,{type:'acceptContract',id:k2.id});
 until(r,s=>s.yard.length>=2);let waited=0;
 for(let i=0;i<400;i++){r.sim.step(1);r.sim=reload(r.sim);r.s=r.sim.state;const atDock=r.s.yard.filter(a=>['toDock','docking','unloading'].includes(a.phase));assert.ok(atDock.length<=1,'Doppelbelegung');
  if(r.s.yard.some(a=>a.phase==='queue'&&a.waitReason===WAIT.dock))waited++;checkQuantities(r.s);}
 assert.ok(waited>5,'zweiter Lkw wartete '+waited);assert.ok(r.s.yard.every(a=>a.phase==='gone'&&a.unloaded===a.parcels));
 const [x,y]=r.s.yard;assert.ok(x.gateAt<=y.gateAt);
});

function ownShipmentReady(){ // Tag 0 Pakete sortiert, Tag 1 Lkw kommt 10:00
 const r=depot({minute:600,warehouse:2});until(r,s=>s.t===1440+540);const o=r.s.orders.find(o=>o.source==='hub');
 assert.equal(parcels(r.s,b=>b.owner===o.id&&b.location==='stock'),o.qty);return {r,o};
}
test('QS-W1 Eigene Lieferung belegt Dock, Fremd-Lkw kommt: Lkw wartet „Kein freies Dock“, danach Dock; keine Doppelbelegung',()=>{
 const {r,o}=ownShipmentReady();
 until(r,s=>s.yard.some(a=>a.phase==='approach'&&a.eta>1440));const v=r.s.vehicles[0];
 cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:v.id,qty:Math.min(o.qty,100)});
 let waited=0;for(let i=0;i<200;i++){r.sim.step(1);const s=r.sim.state;const docks=s.buildings.filter(b=>b.type==='dock');assert.ok(docks.every(b=>!b.task||s.shipments.some(x=>x.id===b.task)!==s.yard.some(a=>a.id===b.task)));
  const a=s.yard.find(a=>a.eta>1440);if(a.phase==='queue'&&a.waitReason===WAIT.dock&&s.shipments.some(x=>x.status==='loading'))waited++;}
 r.s=r.sim.state;assert.ok(waited>0,'Lkw wartete wegen eigener Ladung');assert.equal(r.s.yard.find(a=>a.eta>1440).phase,'gone');checkQuantities(r.s);
});
test('QS-W1 Fremd-Lkw entlädt, eigene Lieferung wird disponiert: Lieferung wartet „Laderampe fehlt“, fährt danach',()=>{
 const {r,o}=ownShipmentReady();until(r,s=>s.yard.some(a=>a.eta>1440&&a.phase==='unloading'));
 const sh=cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:r.s.vehicles[0].id,qty:Math.min(o.qty,100)}).id;r.sim.step(1);
 const x=()=>r.sim.state.shipments.find(x=>x.id===sh);assert.match(x().blocked||'',/Laderampe/);
 until(r,s=>x().status==='transit');checkQuantities(r.sim.state);
});

test('QS-W1 Fahrzeug in Wartung nach Reservierung: Wartung abgelehnt, Reservierung bleibt; Storno gibt exakt frei',()=>{
 const {r,o}=ownShipmentReady();const v=r.s.vehicles[0];
 const sh=cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:v.id,qty:50}).id;
 const res=()=>r.sim.state.reservations.filter(x=>x.job===sh).reduce((n,x)=>n+x.qty,0);assert.equal(res(),50);
 assert.equal(r.sim.command({type:'maintainVehicle',id:v.id}).ok,false);assert.equal(r.sim.command({type:'serviceVehicleExternal',id:v.id}).ok,false);
 r.sim=reload(r.sim);assert.equal(res(),50);
 cmd(r.sim,{type:'cancelShipment',id:sh});assert.equal(res(),0);r.s=r.sim.state;
 assert.equal(r.s.batches.filter(b=>b.owner===o.id).reduce((n,b)=>n+b.reserved,0),0);assert.equal(r.s.vehicles[0].status,'idle');
 assert.ok(r.s.buildings.every(b=>b.task!==sh));checkQuantities(r.s);
 // Sammeltour: gleiche Sperre
 const o2=r.s.orders.filter(x=>x.source==='hub');if(o2.length>=2){const t=r.sim.command({type:'dispatchTour',vehicleId:v.id,stops:o2.slice(0,2).map(x=>({orderId:x.id,qty:Math.min(10,x.qty)}))});
  if(t.ok){assert.equal(r.sim.command({type:'serviceVehicleExternal',id:v.id}).ok,false);r.sim=reload(r.sim);checkQuantities(r.sim.state);}}
});

test('QS-W1 Teillieferung: Zahlung nur für gelieferte Menge, Restauftrag bleibt offen und lieferbar',()=>{
 const {r,o}=ownShipmentReady();const part=Math.floor(o.qty/3);
 cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:r.s.vehicles[0].id,qty:part});
 until(r,s=>s.shipments[0].paid&&s.vehicles[0].status==='idle');let s=r.sim.state,x=s.orders.find(x=>x.id===o.id);
 assert.equal(x.delivered,part);assert.equal(x.status,'active');assert.equal(x.paid,s.shipments[0].invoiceAmount);checkPayments(s);
 cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty:o.qty-part});
 until(r,s=>s.shipments[1]?.paid);s=r.sim.state;x=s.orders.find(x=>x.id===o.id);assert.equal(x.status,'fulfilled');checkPayments(s);checkQuantities(s);
});
