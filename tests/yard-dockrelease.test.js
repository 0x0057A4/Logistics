// A07 B-0.15-1 (docs/BALANCING-0.15.md): Ein Fremd-Lkw, der in unloading auf Platz wartet („Kühllager voll“/„Lager voll“),
// gibt sein Dock nach yard.DOCK_YIELD Minuten frei, sobald ein eigenes Fahrzeug am Standort auf ein Dock wartet. Er geht
// mit Teilstand zurück in die Warteschlange und erhält erst wieder ein Dock, wenn Platz ist (oder kein eigenes Fahrzeug wartet).
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import {coolingFree} from '../dist/special.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
function runUntil(sim,cond,max=4000,each=null){for(let i=0;i<max;i++){if(cond())return i;each?.(sim);sim.step(1);}assert.fail(`Bedingung nicht erreicht (t=${sim.state.t})`);}
const qty=(s,pred)=>s.batches.filter(pred).reduce((n,b)=>n+b.qty,0);

/** Hub mit n Docks, einem Kühllager (100 Plätze), Lagerkräften und Fahrern rund um die Uhr, Fahrzeugen. */
function hub({docks=1,vehicles=['refrigerated'],seed=11}={}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 const pos=[[2,10],[6,10]];for(let i=0;i<docks;i++)cmd(sim,{type:'build',buildingType:'dock',x:pos[i][0],y:pos[i][1],rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'coldstore',x:6,y:2,rotation:0});
 for(let i=0;i<3;i++){const id=cmd(sim,{type:'hire',role:'warehouse'}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
 for(let i=0;i<vehicles.length;i++){const id=cmd(sim,{type:'hire',role:'driver'}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
 const ids=vehicles.map(vehicleType=>cmd(sim,{type:'buyVehicle',vehicleType}).id);
 cmd(sim,{type:'cancelContract',id:s.contracts[0].id});
 return {sim,s,vehicles:ids};
}
/** Ankunft ohne Vertrag (wie ware-own/pallet-own) mit eigenem Auftrag je Menge. */
function arrive(sim,qtys,item,eta=sim.state.t+20){const s=sim.state,ids=qtys.map((q,i)=>{const id=sim.api.id('order');
  s.orders.push({id,kind:'logistics',source:'hub',lane:`lane-${i}`,customer:`Gebiet ${i+1} (Testversand)`,item,qty:q,price:20,due:eta+6000,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});return id;});
 return yard.schedule(s,sim.api,{contractId:'vertrag-test',site:s.selectedSite,parcels:qtys.reduce((n,q)=>n+q,0),eta,orderIds:ids});}
const dockOf=(s,id)=>s.buildings.filter(b=>b.type==='dock'&&b.task===id);
const coldIn=(s,owners)=>qty(s,b=>b.item==='parcel_cold'&&owners.includes(b.owner)&&['inbound','stock'].includes(b.location));
const delivered=(s,owners)=>s.orders.filter(o=>owners.includes(o.id)).reduce((n,o)=>n+o.delivered,0);
/** Kühlankunft vollständig entladen und sortiert (Bestand in stock). */
function landed(sim,qtys){const s=sim.state,a=arrive(sim,qtys,'parcel_cold');runUntil(sim,()=>a.phase==='exit');
 runUntil(sim,()=>qty(s,b=>b.item==='parcel_cold'&&a.orderIds.includes(b.owner)&&b.location==='stock')===a.parcels);return a;}

test('1 Dock: Kühllager voll + eigene Lieferung wartet → Dock frei, Lieferung lädt, Fremd-Lkw entlädt später vollständig; Speichern/Laden bitgleich',()=>{
 const {sim,s,vehicles:[reefer]}=hub();
 const a1=landed(sim,[80]),A=a1.orderIds[0];
 const a2=arrive(sim,[60],'parcel_cold');const B=a2.orderIds[0];
 runUntil(sim,()=>a2.waitReason==='Kühllager voll');
 assert.equal(a2.phase,'unloading');assert.equal(a2.unloaded,20);assert.equal(coolingFree(s,'site-1'),0);
 // Ohne wartendes eigenes Fahrzeug behält der Lkw sein Dock (bisheriges Verhalten).
 sim.step(yard.DOCK_YIELD+3);assert.equal(a2.phase,'unloading');assert.equal(dockOf(s,a2.id).length,1);
 // Eigene Kühllieferung für A: wartet auf das Dock.
 const shId=cmd(sim,{type:"dispatch",orderId:A,vehicleId:reefer,qty:80}).id,sh=s.shipments.find(x=>x.id===shId);
 sim.step(1);assert.equal(sh.status,'loading');assert.equal(sh.blocked,'Warteschlange: freie Laderampe fehlt');assert.equal(yard.ownDockWaiting(s,'site-1'),1);
 const t0=s.t;let snap=null;
 runUntil(sim,()=>a2.phase==='queue',60,()=>{assert.equal(a2.phase,'unloading');});
 assert.ok(s.t-t0<=yard.DOCK_YIELD+1,`Freigabe nach Frist (${s.t-t0} Min.)`);
 // Rückstellung: Teilstand und Wartegrund erhalten, Dock, Lagerkraft frei, keine Dockbelegung.
 assert.equal(a2.unloaded,20);assert.equal(a2.split[0].done,20);assert.equal(a2.waitReason,'Kühllager voll');assert.equal(a2.dock,null);
 assert.equal(dockOf(s,a2.id).length,0);assert.ok(!s.workers.some(w=>w.task===`${a2.id}:warehouse`));
 assert.ok(s.events.some(e=>e.text.includes('Dock für eigenes Fahrzeug freigegeben')));
 assert.doesNotThrow(()=>validateState(s));
 snap=[s.t,sim.serialize()];
 // Lieferung belegt das Dock, Fremd-Lkw bekommt es ohne Platz nicht zurück.
 sim.step(1);assert.equal(dockOf(s,sh.id).length,1);assert.equal(a2.phase,'queue');
 runUntil(sim,()=>sh.status!=='loading',200,()=>{assert.equal(a2.phase,'queue');assert.ok(['Kühllager voll','Kein freies Dock'].includes(a2.waitReason));});
 // Platz entsteht → Rest entladen, dann vollständig abgefertigt.
 runUntil(sim,()=>['exit','gone'].includes(a2.phase),600);
 assert.equal(a2.unloaded,60);assert.equal(a2.split[0].done,60);
 runUntil(sim,()=>sh.deliveredAt!=null,600);
 // Mengenbilanz: angeliefert = Bestand + zugestellt (keine Doppelbuchung, nichts verloren).
 const owners=[A,B];
 assert.equal(a1.parcels+a2.parcels,coldIn(s,owners)+delivered(s,owners)+qty(s,b=>owners.includes(b.owner)&&b.location==='vehicle'));
 assert.equal(delivered(s,[A]),80);assert.equal(coldIn(s,[B]),60);
 assert.doesNotThrow(()=>validateState(s));
 // Laden während der Rückstellung läuft bitgleich weiter.
 const end=s.t,final=sim.serialize(),r=Simulation.fromJSON(snap[1]);
 const ra=r.state.yard.find(x=>x.id===a2.id);assert.equal(ra.phase,'queue');assert.equal(ra.unloaded,20);assert.equal(ra.waitReason,'Kühllager voll');
 r.step(end-snap[0]);assert.equal(r.serialize(),final);
});

test('2 Docks: zwei wartende Kühl-Lkw blockieren nicht dauerhaft; eigene Lieferung lädt, beide entladen vollständig',()=>{
 const {sim,s,vehicles:[reefer]}=hub({docks:2});
 const a1=landed(sim,[90]),A=a1.orderIds[0];
 const a2=arrive(sim,[30],'parcel_cold'),a3=arrive(sim,[40],'parcel_cold',s.t+21);
 runUntil(sim,()=>[a2,a3].every(a=>a.phase==='unloading'&&['Kühllager voll'].includes(a.waitReason)));
 assert.equal(a2.unloaded+a3.unloaded,10);assert.equal(s.buildings.filter(b=>b.type==='dock'&&b.task).length,2);
 const shId=cmd(sim,{type:"dispatch",orderId:A,vehicleId:reefer,qty:90}).id,sh=s.shipments.find(x=>x.id===shId);
 // Eine wartende Lieferung → genau ein Lkw gibt sein Dock frei, der andere behält seins.
 runUntil(sim,()=>dockOf(s,sh.id).length===1,60);
 assert.deepEqual([a2,a3].map(a=>a.phase).sort(),['queue','unloading']);
 const back=[a2,a3].find(a=>a.phase==='queue');assert.equal(back.waitReason,'Kühllager voll');assert.equal(dockOf(s,back.id).length,0);
 assert.doesNotThrow(()=>validateState(s));
 runUntil(sim,()=>sh.status==='transit',60);
 runUntil(sim,()=>a2.phase==='exit'||a2.phase==='gone',600);runUntil(sim,()=>a3.phase==='exit'||a3.phase==='gone',600);
 assert.equal(a2.unloaded,30);assert.equal(a3.unloaded,40);
 runUntil(sim,()=>sh.deliveredAt!=null,600);
 const owners=[A,...a2.orderIds,...a3.orderIds];
 assert.equal(160,coldIn(s,owners)+delivered(s,owners)+qty(s,b=>owners.includes(b.owner)&&b.location==='vehicle'));
 assert.equal(delivered(s,[A]),90);
 assert.equal(s.buildings.filter(b=>b.type==='dock'&&b.task).length,0);
 assert.doesNotThrow(()=>validateState(s));
});

test('Staplermangel ist kein Platzmangel: Paletten-Lkw ohne Stapler behält das Dock trotz wartender Lieferung',()=>{
 const {sim,s,vehicles:[reefer]}=hub();
 const a1=landed(sim,[40]),A=a1.orderIds[0];
 const a2=arrive(sim,[5],'pallet');
 runUntil(sim,()=>a2.phase==='unloading'&&a2.waitReason===yard.WAIT.forklift);
 const shId=cmd(sim,{type:'dispatch',orderId:A,vehicleId:reefer,qty:40}).id,sh=s.shipments.find(x=>x.id===shId);
 sim.step(yard.DOCK_YIELD*3);
 assert.equal(sh.blocked,'Warteschlange: freie Laderampe fehlt');
 assert.equal(a2.phase,'unloading');assert.equal(a2.waitReason,yard.WAIT.forklift);assert.equal(dockOf(s,a2.id).length,1);
 assert.doesNotThrow(()=>validateState(s));
});

test('Warteschlange: Ankunft ohne Platz bekommt kein Dock vor wartender eigener Lieferung, mit Platz FIFO wie bisher',()=>{
 const {sim,s,vehicles:[reefer]}=hub();
 const a1=landed(sim,[100]),A=a1.orderIds[0];
 // Dock durch Paletten-Lkw ohne Stapler belegt; dahinter Kühl-Lkw ohne Platz und Paket-Lkw mit Platz.
 const p=arrive(sim,[2],'pallet');runUntil(sim,()=>p.phase==='unloading');
 const c=arrive(sim,[30],'parcel_cold'),q=arrive(sim,[10],'parcel',s.t+21);
 runUntil(sim,()=>c.phase==='queue'&&q.phase==='queue');
 const shId=cmd(sim,{type:'dispatch',orderId:A,vehicleId:reefer,qty:100}).id,sh=s.shipments.find(x=>x.id===shId);
 sim.step(2);assert.equal(c.waitReason,'Kühllager voll');assert.equal(q.waitReason,yard.WAIT.dock);
 // Paletten-Lkw abgefertigt (Stapler gebaut): Dock frei. Der Paket-Lkw (mit Platz) rückt nach FIFO nach, der Kühl-Lkw
 // ohne Platz bleibt hinter der wartenden Lieferung und entlädt erst, nachdem sie geladen hat (Platz frei).
 cmd(sim,{type:'build',buildingType:'forklift',x:14,y:2,rotation:0});
 runUntil(sim,()=>p.phase==='exit',60,()=>assert.equal(c.phase,'queue'));
 runUntil(sim,()=>sh.status==='transit',120,()=>assert.ok(c.phase==='queue',`Kühl-Lkw ohne Platz vorgezogen (${c.phase})`));
 const out=a=>['exit','gone'].includes(a.phase);runUntil(sim,()=>out(c)&&out(q),600);
 assert.equal(c.unloaded,30);assert.equal(q.unloaded,10);
 assert.doesNotThrow(()=>validateState(s));
});
