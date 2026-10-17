// A11 · QS Release 0.13 (Welle 3b): Containerhof und Seeimport mit echtem Containervertrag aus dem Angebotsstrom, Ende-zu-Ende
// bis Zahlung. Nur reguläre Spielerbefehle. Testdaten (dokumentiert in docs/QS-0.13.md): Vertragslaufzeit und Freizeit werden
// VOR der Annahme gesetzt; TEU-Fall setzt zwei Ankünfte à 3 Container vor der Annahme; Pflichtfälle setzen Staplerladung 0,
// Standortenergie 0 bzw. füllen das Lager mit Firmenware über inventory.add.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {maxLoad} from '../dist/transport.js';
import {deliverySiteOf,TERMS} from '../dist/contracts.js';
import * as C from '../dist/containers.js';
import {WAIT} from '../dist/yard.js';
import {hash,cmd,reload,checkPayments} from './qa-w1-hub.mjs';

const A='site-1';
const cents=n=>Math.round(n*100)/100;
const units=(s,pred)=>s.batches.filter(pred).reduce((n,b)=>n+b.qty,0);
const DEM=new Set(['yard','toDock','unstuffing','empty']),HANDLED=new Set(['empty','pickup','gone']);

/** Zwei Standorte. A: 2 Docks, 3 Regale, Stapler, Containerhof, 3 Lagerkräfte, 3 Fahrer, Lkw + Lieferwagen, Linien-Lkw.
 *  B: Dock, 2 Regale, Stapler, 2 Lagerkräfte, Fahrer, Lkw + Lieferwagen. Linie A→B 12:00/15:00. Echter Containervertrag:
 *  nth-tes Containerangebot des Angebotsstroms (optional mit Inhalt). */
function net({seed=1,nth=1,content=null,days=2,free=null,mutate=null}={}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 const B=cmd(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 const b=(t,site,x,y)=>cmd(sim,{type:'build',buildingType:t,site,x,y,rotation:0}).id;
 b('containeryard',A,12,8);b('forklift',A,9,6);
 const docks=[b('dock',A,2,10),b('dock',A,6,10)];
 for(const x of [2,5,8])b('rack',A,x,2);
 b('dock',B,2,10);b('rack',B,2,2);b('rack',B,5,2);b('forklift',B,9,6);
 for(let i=0;i<3;i++){cmd(sim,{type:'hire',role:'warehouse',site:A});cmd(sim,{type:'hire',role:'driver',site:A});}
 for(let i=0;i<2;i++)cmd(sim,{type:'hire',role:'warehouse',site:B});cmd(sim,{type:'hire',role:'driver',site:B});
 for(const site of [A,B])for(const t of ['truck','van'])cmd(sim,{type:'buyVehicle',vehicleType:t,site});
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:'truck',site:A}).id;
 const seen=new Set();let k=null;
 for(let i=0;i<12000&&!k;i++){sim.step(1);for(const x of s.contracts)if(x.status==='offer'&&x.unit==='container'&&!seen.has(x.id)){seen.add(x.id);if(seen.size>=nth&&(!content||x.content===content)){k=x;break;}}}
 assert.ok(k,'kein Containerangebot');
 if(days!=null)k.durationDays=days;if(free!=null)k.freeMinutes=free;mutate?.(k);
 cmd(sim,{type:'acceptContract',id:k.id});
 const lineId=cmd(sim,{type:'createLine',from:A,to:B,departures:[720,900],vehicleId:truck}).id;
 return {sim,s,B,truck,k,lineId,docks,dm:new Map(),exp:new Map(),seen:new Map()};
}

const committed=(s,o)=>s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0)
 +(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
const ready=(s,o,site)=>s.batches.filter(b=>b.owner===o.id&&b.site===site&&b.location==='stock').reduce((n,b)=>n+b.qty-b.reserved,0);
/** Spielerpolitik je Standort: freies Nahverkehrsfahrzeug stellt fertige Aufträge des eigenen Gebiets zu (Artikel passend). */
function policy(env){
 const {sim,s,truck}=env,m=s.t%1440;if(m<480||m>=930)return;
 for(const site of [A,env.B])for(const v of s.vehicles.filter(v=>v.site===site&&v.id!==truck&&v.status==='idle'&&v.condition>=15)){
  if(v.condition<40){sim.command({type:'serviceVehicleExternal',id:v.id});continue;}
  const cand=s.orders.filter(o=>o.source==='hub'&&o.status==='active'&&deliverySiteOf(o)===site&&maxLoad(v,o.item)>0).map(o=>({o,rest:o.qty-o.delivered-committed(s,o)})).filter(x=>x.rest>0&&ready(s,x.o,site)>=Math.min(x.rest,maxLoad(v,x.o.item))).sort((a,b)=>a.o.due-b.o.due);
  if(!cand.length)continue;const item=cand[0].o.item,max=maxLoad(v,item);const stops=[];let load=0;
  for(const x of cand){if(x.o.item!==item)continue;if(stops.length===4)break;const q=Math.min(x.rest,max-load,ready(s,x.o,site));if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
  if(!stops.length)continue;
  const r=stops.length>1?sim.command({type:'dispatchTour',vehicleId:v.id,stops,site}):sim.command({type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty,site});
  assert.equal(r.ok,true,`Disposition ${site}: ${r.message}`);
 }
}

/** Mengen je Vertragsauftrag: offen (Lkw-Hof) + Container-Rest + Bestand A + Bestand B + unterwegs + zugestellt + zurück = qty. */
function checkQty(s,B,tag=''){
 for(const b of s.batches){assert.ok(b.qty>=0,`${tag} negative Menge ${b.id}`);assert.ok(b.reserved>=-1e-9&&b.reserved<=b.qty+1e-9,`${tag} Reservierung ${b.id}`);}
 const pending=new Map(),add=(k,n)=>pending.set(k,(pending.get(k)||0)+n);
 for(const a of s.yard)for(const p of a.split)add(p.owner,p.target-p.done);
 const box=new Map();for(const c of s.containers)for(const p of c.split)box.set(p.owner,(box.get(p.owner)||0)+p.target-p.done);
 for(const o of s.orders.filter(o=>o.source==='hub')){
  const at=site=>units(s,b=>b.owner===o.id&&b.site===site&&b.location!=='vehicle'),moving=units(s,b=>b.owner===o.id&&b.location==='vehicle');
  const sum=(pending.get(o.id)||0)+(box.get(o.id)||0)+at(A)+at(B)+moving+o.delivered+(o.returnedQty||0);
  assert.equal(sum,o.qty,`${tag} ${o.id}: offen ${pending.get(o.id)||0}+Container ${box.get(o.id)||0}+A ${at(A)}+B ${at(B)}+unterwegs ${moving}+zugestellt ${o.delivered}+zurück ${o.returnedQty||0} ≠ ${o.qty}`);
  assert.ok(o.delivered<=o.qty,`${tag} überliefert ${o.id}`);
 }
 for(const sh of s.shipments){const o=s.orders.find(o=>o.id===sh.orderId);if(o?.source==='hub')assert.equal(sh.site,deliverySiteOf(o),`${tag} Zustellung ${sh.id} ab ${sh.site}`);}
 for(const t of s.tours||[])for(const st of t.stops){const o=s.orders.find(o=>o.id===st.orderId);if(o?.source==='hub')assert.equal(t.site,deliverySiteOf(o),`${tag} Tour ${t.id} ab ${t.site}`);}
}
function checkPenalties(s,tag=''){
 const P=new Map();for(const l of s.ledger)if(/^penalty/.test(l.key)){assert.ok(!P.has(l.key),`${tag} doppelt ${l.key}`);P.set(l.key,l);}
 for(const o of s.orders){const key=`penalty-open:${o.id}`;
  if(o.cancelReason==='contractEnd'){const k=s.contracts.find(k=>k.id===o.contractId),open=o.qty-o.delivered;
   if(open>0){assert.ok(P.has(key),`${tag} Endstrafe fehlt ${o.id}`);assert.equal(P.get(key).amount,-cents(open*k.penaltyOpen));}}
  else assert.ok(!P.has(key),`${tag} Endstrafe ohne Storno ${o.id}`);}
}
/** Vor jedem Schritt: eigene Lagergeld-Minuten (Status nach letztem Schritt in DEM, t ≥ freeUntil) und Stand vor dem Schritt. */
function before(env){const s=env.s;for(const c of s.containers){env.dm.set(c.id,c.demurrageMinutes);if(DEM.has(c.status)&&c.freeUntil!==null&&s.t+1>=c.freeUntil)env.exp.set(c.id,(env.exp.get(c.id)||0)+1);}}
/** Nach jedem Schritt: Lagergeld je Container = floor(Minuten nach Freizeit / 60) (Buchung im Folgeschritt), Handling genau einmal,
 *  TEU nie über Kapazität. */
function checkContainers(env,tag=''){
 const s=env.s,dem=new Map(),hand=new Map();
 for(const l of s.ledger){let m=l.key.match(/^demurrage:(.+):(\d+)$/);if(m){const set=dem.get(m[1])||new Set();assert.ok(!set.has(+m[2]),`${tag} Lagergeld doppelt ${l.key}`);set.add(+m[2]);dem.set(m[1],set);continue;}
  m=l.key.match(/^container-handling:(.+)$/);if(m){assert.ok(!hand.has(m[1]),`${tag} Handling doppelt ${l.key}`);hand.set(m[1],l);}}
 for(const c of s.containers){
  const k=s.contracts.find(k=>k.id===c.contractId);
  assert.equal(c.demurrageMinutes,env.exp.get(c.id)||0,`${tag} Lagergeld-Minuten ${c.id}`);
  const want=Math.floor((env.dm.has(c.id)?env.dm.get(c.id):0)/60),got=dem.get(c.id)?.size||0;
  assert.equal(got,want,`${tag} Lagergeld-Stunden ${c.id}: gebucht ${got}, erwartet ${want}`);
  for(const n of dem.get(c.id)||[])assert.ok(n>=1&&n<=want,`${tag} Lagergeld-Stunde ${n}`);
  if(HANDLED.has(c.status)&&c.statusAt<s.t){assert.ok(hand.has(c.id),`${tag} Handling fehlt ${c.id}`);assert.equal(hand.get(c.id).amount,k.pricePerContainer);}
  else if(!HANDLED.has(c.status))assert.ok(!hand.has(c.id),`${tag} Handling vor Entladeende ${c.id}`);
 }
 for(const site of [A,env.B])assert.ok(C.teuUsed(s,site)<=C.teuCapacity(s,site,false),`${tag} TEU ${C.teuUsed(s,site)} > ${C.teuCapacity(s,site,false)}`);
}
const lagergeld=s=>s.ledger.filter(l=>/^demurrage:/.test(l.key));

function step(env,{check=true,each=null}={}){
 policy(env);each?.(env);before(env);env.sim.step(1);
 for(const c of env.s.containers)env.seen.set(c.id,c);
 if(check){checkContainers(env,`t=${env.s.t}`);if(env.s.t%5===0){const tag=`t=${env.s.t}`;checkQty(env.s,env.B,tag);checkPayments(env.s,tag);checkPenalties(env.s,tag);validateState(env.s);}}
}
function run(env,minutes,o={}){const end=env.s.t+minutes;let n=0;while(env.s.t<end){step(env,o);n++;}return n;}
const until=(env,cond,max=4000,o={check:true})=>{for(let i=0;i<max;i++){if(cond(env.s))return;step(env,o);}assert.fail(`Bedingung nicht erreicht t=${env.s.t}`);};
const mine=env=>env.s.containers.filter(c=>c.contractId===env.k.id);
const bound=(s,c)=>({dock:s.buildings.filter(b=>b.task===c.id).length,fork:s.buildings.filter(b=>b.task===`${c.id}:forklift`).length,worker:s.workers.filter(w=>w.task===`${c.id}:warehouse`).length});
const NONE={dock:0,fork:0,worker:0};

const stats=[];
for(const seed of [1,2,3])test(`Ende-zu-Ende Seed ${seed}: echter Containervertrag (Paletten), 4 Tage, Mengen/Lagergeld/Handling/TEU/Zahlung`,()=>{
 const env=net({seed,free:30}),{s,k,B}=env;
 const checks=run(env,4*1440);
 const cs=[...env.seen.values()].filter(c=>c.contractId===k.id),orders=s.orders.filter(o=>o.contractId===k.id);
 assert.ok(cs.length>0,'Container angelegt');
 const handled=s.ledger.filter(l=>/^container-handling:/.test(l.key)&&cs.some(c=>l.key.endsWith(c.id)));
 assert.equal(handled.length,cs.filter(c=>HANDLED.has(c.status)).length,'Handling je entladenem Container');
 assert.ok(cs.some(c=>c.status==='gone'),'Leercontainer abgeholt');
 assert.ok(orders.reduce((n,o)=>n+o.paid,0)>0,'Inhalt bezahlt');
 assert.ok(lagergeld(s).length>0,'Lagergeld gebucht (Freizeit 30 Min)');
 assert.ok(orders.every(o=>o.status!=='active'),'Vertrag abgerechnet');
 const row={seed,content:k.content,per:k.unitsPerContainer,containers:cs.length,lanes:k.lanes.map(l=>l.site===B?'B':'A').join(''),qty:orders.reduce((n,o)=>n+o.qty,0),
  delivered:orders.reduce((n,o)=>n+o.delivered,0),paid:cents(orders.reduce((n,o)=>n+o.paid,0)),handling:cents(handled.reduce((n,l)=>n+l.amount,0)),
  demurrage:lagergeld(s).length,demurrageEuro:cents(lagergeld(s).reduce((n,l)=>n+l.amount,0)),late:s.ledger.filter(r=>/^penalty:/.test(r.key)).length,open:s.ledger.filter(r=>/^penalty-open:/.test(r.key)).length,checks};
 stats.push(row);console.log('# '+JSON.stringify(row));
});

test('Zusammenspiel Linie: Container-Pakete für Fremdgebiet gehen per Linie, Zustellung ab B mit Zahlung',()=>{
 const env=net({seed:9,nth:2,content:'parcel',free:30}),{s,k,B}=env;
 assert.ok(k.lanes.some(l=>l.site===B)&&k.lanes.some(l=>l.site===A),'Mischvertrag');
 let viaLine=0;const ids=new Set();
 run(env,3*1440,{each:e=>{for(const lh of e.s.linehauls)if(!ids.has(lh.id)&&lh.status==='transit'){ids.add(lh.id);viaLine+=lh.qty;}}});
 const bo=s.orders.filter(o=>o.contractId===k.id&&deliverySiteOf(o)===B);
 const bDel=bo.reduce((n,o)=>n+o.delivered,0),bPaid=bo.reduce((n,o)=>n+o.paid,0);
 assert.ok(viaLine>0,'Linie fährt Container-Pakete');assert.ok(bDel>0&&bPaid>0,`B zugestellt ${bDel}, bezahlt ${bPaid}`);
 console.log(`# Linie seed 9: ${k.unitsPerContainer} Pakete/Container, B-Aufträge ${bo.length}, B zugestellt ${bDel}/${bo.reduce((n,o)=>n+o.qty,0)}, bezahlt ${cents(bPaid)} €, per Linie ${viaLine}, Fahrten ${ids.size}`);
});

test('Laden in jeder Container-Phase (auch +1 Min, über Lagergeld-Stunde) ergibt denselben Endhash',()=>{
 const MIN=2*1440,o={check:false};
 const ref=net({seed:2,free:30});const t0=ref.s.t;run(ref,MIN,o);const want=hash(ref.sim.serialize());
 const probes=[...['approach','gate','toYard','drop','exit'].map(p=>['chassis '+p,s=>s.yard.some(a=>a.kind==='container'&&!a.pickup&&a.phase===p)]),
  ...['yard','toDock','unstuffing','empty','pickup','gone'].map(p=>['container '+p,s=>s.containers.some(c=>c.status===p)]),
  ['Lagergeld 59 Min',s=>s.containers.some(c=>c.demurrageMinutes===59)],['Lagergeld 60 Min',s=>s.containers.some(c=>c.demurrageMinutes===60)]];
 for(const [name,cond] of probes)for(const late of [0,1]){
  const env=net({seed:2,free:30});let done=false,armed=false;
  run(env,MIN,{check:false,each:e=>{if(!done&&cond(e.s)){if(late&&!armed){armed=true;return;}done=true;const r=reload(e.sim);e.sim=r;e.s=r.state;}}});
  assert.ok(done,`${name} nicht erreicht`);assert.equal(env.s.t,t0+MIN);
  assert.equal(hash(env.sim.serialize()),want,`${name}${late?' +1':''}`);
 }
});

/** Pflichtfälle während Entladen: Container mitten im Entladen (Paletten, Seed 2: nur Gebiete an A). */
function midUnstuff(){
 const env=net({seed:2,free:30});
 until(env,s=>mine(env).some(c=>c.status==='unstuffing'&&c.unloaded>=3));
 return {env,c:mine(env).find(c=>c.status==='unstuffing')};
}
function disrupt(name,apply,restore,reason){
 test(`Pflicht: ${name} während Entladen → Container zurück in den Hof, keine Bindung, Fortschritt bleibt, danach fertig`,()=>{
  const {env,c}=midUnstuff(),{s}=env;const ctx=apply(env,c);
  step(env);const done=c.unloaded;
  for(let i=0;i<20;i++){step(env);for(const x of mine(env))if(x.status==='yard'||x.status==='arriving')assert.deepEqual(bound(s,x),NONE,`${x.id} gebunden ohne Fortschritt`);}
  assert.equal(c.status,'yard');assert.ok([reason].flat().includes(c.waitReason),`Wartegrund ${c.waitReason}`);assert.equal(c.unloaded,done,'kein Fortschritt');assert.ok(done>=3,'Fortschritt bleibt');
  assert.deepEqual(bound(s,c),NONE);
  for(const x of mine(env))if(x!==c&&x.unloaded<x.qty)assert.ok(['yard','arriving'].includes(x.status),`anderer Container ${x.status}`);
  checkQty(s,env.B);validateState(s);validateState(reload(env.sim).state);
  restore(env,c,ctx);until(env,()=>HANDLED.has(c.status),600);
  assert.equal(c.unloaded,c.qty);checkQty(s,env.B);validateState(s);
 });
}
const whs=env=>env.s.workers.filter(w=>w.site===A&&w.role==='warehouse');
disrupt('Schichtende aller Lagerkräfte',env=>{for(const w of whs(env))cmd(env.sim,{type:'setShift',id:w.id,shift:'night'});},env=>{for(const w of whs(env))cmd(env.sim,{type:'setShift',id:w.id,shift:'day'});},WAIT.staff);
disrupt('Dock aus (beide Docks)',env=>{for(const id of env.docks)cmd(env.sim,{type:'toggleBuilding',id});},env=>{for(const id of env.docks)cmd(env.sim,{type:'toggleBuilding',id});},[WAIT.dockOff,WAIT.dock]);
disrupt('Stapler leer',env=>{const f=env.s.buildings.find(b=>b.type==='forklift'&&b.site===A);f.charge=0;},()=>{},WAIT.forkliftCharge);
disrupt('Strom weg',env=>{const st=env.s.sites.find(x=>x.id===A),old=st.energy;st.energy=0;return old;},(env,c,old)=>{env.s.sites.find(x=>x.id===A).energy=old;},WAIT.forkliftPower);
disrupt('Lager voll',env=>{const free=env.sim.api.inventory.free(A);assert.ok(env.sim.api.inventory.add({item:'housing',qty:Math.floor(free),site:A,owner:'company',location:'stock',quality:100,unitCost:0}));},
 env=>{const f=env.s.batches.find(b=>b.item==='housing'&&b.site===A&&b.owner==='company');env.sim.api.inventory.remove(f.id,f.qty);},WAIT.full);

test('Pflicht: belegten Containerhof abreißen/versetzen → abgelehnt; leer → erlaubt',()=>{
 const env=net({seed:2,free:30}),{s}=env;const y=s.buildings.find(b=>b.type==='containeryard');
 until(env,s=>mine(env).some(c=>c.status==='yard'));
 const r=env.sim.command({type:'demolish',id:y.id});assert.equal(r.ok,false,'Abriss belegt');
 const m=env.sim.command({type:'move',id:y.id,x:12,y:12});assert.equal(m.ok,false,'Versetzen belegt');
 assert.ok(s.buildings.includes(y));validateState(s);
 until(env,s=>mine(env).length>0&&mine(env).every(c=>c.status==='gone')&&!s.yard.some(a=>a.kind==='container'&&!['exit','gone'].includes(a.phase)),3000);
 assert.equal(C.teuUsed(s,A),0);assert.equal(env.sim.command({type:'demolish',id:y.id}).ok,true,'Abriss leer');
 console.log(`# Abriss: belegt „${r.message}“`);
});

test('Pflicht: Vertragsende mit Container im Hof → Abrechnung wartet, danach genau einmal',()=>{
 const env=net({seed:2,days:1,free:30}),{s,k}=env;
 for(const id of env.docks)cmd(env.sim,{type:'toggleBuilding',id});
 until(env,s=>k.status==='ended'&&s.t>=k.endT+TERMS.penalty.openGrace+30,6000);
 const orders=s.orders.filter(o=>o.contractId===k.id);
 assert.ok(mine(env).some(c=>c.status==='yard'),'Container im Hof');
 assert.ok(orders.every(o=>o.status==='active'&&o.settleWait==='Container im Hof'),'Abrechnung wartet');
 assert.equal(s.ledger.filter(l=>/^penalty-open:/.test(l.key)).length,0,'keine Endstrafe vor Entladen');
 for(const id of env.docks)cmd(env.sim,{type:'toggleBuilding',id});
 until(env,s=>orders.every(o=>o.status!=='active'),3000);
 for(const o of orders){const rows=s.ledger.filter(l=>l.key===`penalty-open:${o.id}`);assert.ok(rows.length<=1);}
 run(env,60);checkQty(s,env.B);validateState(s);
 console.log(`# Vertragsende: ${orders.map(o=>`${o.id} ${o.cancelReason} zurück ${o.returnedQty}`).join(', ')}, Lagergeld ${lagergeld(s).length} Std.`);
});

test('Pflicht: TEU-Grenze nie überschritten, zweites Chassis wartet „Containerhof voll“, danach alles entladen',()=>{
 const env=net({seed:2,free:30,mutate:k=>{k.arrivals=[{minute:540,containers:3,parcels:3*k.unitsPerContainer},{minute:600,containers:3,parcels:3*k.unitsPerContainer}];}}),{s}=env;
 for(const id of env.docks)cmd(env.sim,{type:'toggleBuilding',id});
 until(env,s=>s.yard.some(a=>a.kind==='container'&&!a.pickup&&a.waitReason===WAIT.yardFull),3000);
 const waiting=s.yard.find(a=>a.kind==='container'&&a.waitReason===WAIT.yardFull);
 assert.equal(waiting.phase,'queue');assert.equal(C.teuUsed(s,A),6,'3 Container = 6 TEU');
 run(env,30);assert.equal(waiting.phase,'queue','wartet weiter');
 for(const id of env.docks)cmd(env.sim,{type:'toggleBuilding',id});
 until(env,()=>waiting.phase==='exit'||waiting.phase==='gone',2000);
 until(env,s=>s.containers.filter(c=>waiting.containerIds.includes(c.id)).every(c=>HANDLED.has(c.status)),2000);
 checkQty(s,env.B);validateState(s);
 console.log(`# TEU: Chassis ${waiting.id} wartete bis ${waiting.phaseStart}, max TEU 8`);
});

// Befund QS-W3b-01 (todo bis Behebung): Docks abgeschaltet während Entladen → Wartegrund springt im selben Takt auf
// „Kein freies Dock“; der Spieler sieht nicht, dass die Docks außer Betrieb sind.
test('QS-W3b-01: Docks aus → Wartegrund „Dock außer Betrieb“ statt „Kein freies Dock“',()=>{
 const {env,c}=midUnstuff();for(const id of env.docks)cmd(env.sim,{type:'toggleBuilding',id});
 for(let i=0;i<3;i++)step(env);
 assert.equal(c.waitReason,WAIT.dockOff);
});
// Befund QS-W3b-02 (todo bis Behebung): Versionsanzeige.
test('QS-W3b-02: Versionsanzeige 0.13',async()=>{
 const {readFileSync}=await import('node:fs');
 assert.match(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),/VERSION='0\.13/);
});
