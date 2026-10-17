// A11 · QS Release 0.12 (Welle 3a): Linienverkehr A → B mit echtem Mischvertrag (Gebiete an A und an B), Ende-zu-Ende bis Zahlung.
// Nur reguläre Spielerbefehle. Testdaten (dokumentiert in docs/QS-0.12.md): Vertragslaufzeit wird VOR der Annahme gesetzt
// (Vertragsende im Prüfzeitraum); Pflichtfälle setzen Kasse (1 €) bzw. füllen das Ziellager mit Firmenware über inventory.add.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {maxLoad} from '../dist/transport.js';
import {remoteTerms,deliverySiteOf} from '../dist/contracts.js';
import * as L from '../dist/linehaul.js';
import {hash,cmd,reload,checkPayments} from './qa-w1-hub.mjs';

const A='site-1';
const cents=n=>Math.round(n*100)/100;
const units=(s,pred)=>s.batches.filter(pred).reduce((n,b)=>n+b.qty,0);

/** Zwei Standorte, echter Mischvertrag aus dem Angebotsstrom (Gebiete an A und an B). A: 2 Docks, 2 Regale, 3 Lagerkräfte,
 *  3 Fahrer, 2 Lieferwagen, Linien-Lkw. B: Dock, Regal, 2 Lagerkräfte, Fahrer, Lieferwagen. Linie A→B 12:00/15:00. */
function net({seed=1,unit='parcel',days=2,warehouseB=2,forkB=true,line=true}={}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 const B=cmd(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(const [x,y] of [[2,10],[6,10]])cmd(sim,{type:'build',buildingType:'dock',site:A,x,y,rotation:0});
 for(const x of [2,5])cmd(sim,{type:'build',buildingType:'rack',site:A,x,y:2,rotation:0});
 cmd(sim,{type:'build',buildingType:'dock',site:B,x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site:B,x:2,y:2,rotation:0});
 if(unit==='pallet'){cmd(sim,{type:'build',buildingType:'forklift',site:A,x:9,y:6,rotation:0});if(forkB)cmd(sim,{type:'build',buildingType:'forklift',site:B,x:9,y:6,rotation:0});}
 for(let i=0;i<3;i++){cmd(sim,{type:'hire',role:'warehouse',site:A});cmd(sim,{type:'hire',role:'driver',site:A});}
 for(let i=0;i<warehouseB;i++)cmd(sim,{type:'hire',role:'warehouse',site:B});cmd(sim,{type:'hire',role:'driver',site:B});
 const local=unit==='pallet'?'truck':'van';
 for(let i=0;i<2;i++)cmd(sim,{type:'buyVehicle',vehicleType:local,site:A});
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:'truck',site:A}).id;
 cmd(sim,{type:'buyVehicle',vehicleType:local,site:B});
 let k=null;for(let i=0;i<8000&&!k;i++){sim.step(1);k=s.contracts.find(c=>c.status==='offer'&&c.unit===unit&&c.lanes.some(l=>l.site===B)&&c.lanes.some(l=>l.site===A));}
 assert.ok(k,'kein Mischangebot');
 if(days!=null)k.durationDays=days;
 cmd(sim,{type:'acceptContract',id:k.id});
 const lineId=line?cmd(sim,{type:'createLine',from:A,to:B,departures:[720,900],vehicleId:truck}).id:null;
 return {sim,s,B,truck,k,lineId,local};
}

// Spielerpolitik je Standort: freies Nahverkehrsfahrzeug (nicht der Linien-Lkw) stellt fertige Aufträge des eigenen Gebiets zu.
const committed=(s,o)=>s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0)
 +(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
const ready=(s,o,site)=>s.batches.filter(b=>b.owner===o.id&&b.site===site&&b.location==='stock').reduce((n,b)=>n+b.qty-b.reserved,0);
function policy(env){
 const {sim,s,truck}=env,m=s.t%1440;if(m<480||m>=930)return;
 for(const site of [A,env.B]){
  const v=s.vehicles.find(v=>v.site===site&&v.id!==truck&&v.status==='idle'&&v.condition>=15);if(!v)continue;
  if(v.condition<40){sim.command({type:'serviceVehicleExternal',id:v.id});continue;}
  const cand=s.orders.filter(o=>o.source==='hub'&&o.status==='active'&&deliverySiteOf(o)===site).map(o=>({o,rest:o.qty-o.delivered-committed(s,o)})).filter(x=>x.rest>0&&ready(s,x.o,site)>=x.rest).sort((a,b)=>a.o.due-b.o.due);
  const max=maxLoad(v,cand[0]?.o.item||'parcel');const stops=[];let load=0;
  for(const x of cand){if(stops.length===4)break;const q=Math.min(x.rest,max-load);if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
  if(!stops.length)continue;
  const r=stops.length>1?sim.command({type:'dispatchTour',vehicleId:v.id,stops,site}):sim.command({type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty,site});
  assert.equal(r.ok,true,`Disposition ${site}: ${r.message}`);
 }
}

/** Mengen je Vertragsauftrag: offen im Hof + Bestand A + Bestand B + unterwegs (Fahrzeug) + zugestellt + zurück = qty. */
function checkQty(s,B,tag=''){
 for(const b of s.batches){assert.ok(b.qty>=0,`${tag} negative Menge ${b.id}`);assert.ok(b.reserved>=-1e-9&&b.reserved<=b.qty+1e-9,`${tag} Reservierung ${b.id}`);}
 const pending=new Map();for(const a of s.yard)for(const p of a.split)pending.set(p.owner,(pending.get(p.owner)||0)+p.target-p.done);
 for(const o of s.orders.filter(o=>o.source==='hub')){
  const at=site=>units(s,b=>b.owner===o.id&&b.site===site&&b.location!=='vehicle'),moving=units(s,b=>b.owner===o.id&&b.location==='vehicle');
  const sum=(pending.get(o.id)||0)+at(A)+at(B)+moving+o.delivered+(o.returnedQty||0);
  assert.equal(sum,o.qty,`${tag} ${o.id}: offen ${pending.get(o.id)||0}+A ${at(A)}+B ${at(B)}+unterwegs ${moving}+zugestellt ${o.delivered}+zurück ${o.returnedQty||0} ≠ ${o.qty}`);
  assert.ok(o.delivered<=o.qty,`${tag} überliefert ${o.id}`);
  // B-Gebiet: Ware ruht an A nie im Zustellbereich (keine Zustellung ab A).
  if(deliverySiteOf(o)===B)assert.equal(units(s,b=>b.owner===o.id&&b.site===A&&b.location==='vehicle'&&!s.linehauls.some(l=>l.cargo.includes(b.id))),0,`${tag} B-Ware auf A-Fahrzeug ${o.id}`);
 }
 for(const sh of s.shipments){const o=s.orders.find(o=>o.id===sh.orderId);if(o?.source==='hub')assert.equal(sh.site,deliverySiteOf(o),`${tag} Zustellung ${sh.id} ab ${sh.site}, Gebiet ${deliverySiteOf(o)}`);}
 for(const t of s.tours||[])for(const st of t.stops){const o=s.orders.find(o=>o.id===st.orderId);if(o?.source==='hub')assert.equal(t.site,deliverySiteOf(o),`${tag} Tour ${t.id} ab ${t.site}`);}
}
/** Strafen: je verspäteter Lieferung/Stopp genau eine Buchung qty×Satz, pünktlich keine; penalty-open je Storno zum Vertragsende. */
function checkPenalties(s,tag=''){
 const P=new Map();for(const l of s.ledger)if(/^penalty/.test(l.key)){assert.ok(!P.has(l.key),`${tag} doppelt ${l.key}`);P.set(l.key,l);}
 const late=(id,qty,at,key)=>{const o=s.orders.find(o=>o.id===id),k=s.contracts.find(k=>k.id===o?.contractId);if(!k)return;
  if(at>o.due){if(s.t>at){assert.ok(P.has(key),`${tag} Strafe fehlt ${key}`);assert.equal(P.get(key).amount,-cents(qty*k.penaltyLate));}}
  else assert.ok(!P.has(key),`${tag} Strafe ohne Verspätung ${key}`);};
 for(const sh of s.shipments)if(sh.deliveredAt!=null)late(sh.orderId,sh.qty,sh.deliveredAt,`penalty:${sh.id}`);
 for(const t of s.tours||[])t.stops.forEach((st,i)=>{if(st.status==='delivered')late(st.orderId,st.qty,st.deliveredAt,`penalty:${t.id}:${i}`);});
 for(const o of s.orders){const key=`penalty-open:${o.id}`;
  if(o.cancelReason==='contractEnd'){const k=s.contracts.find(k=>k.id===o.contractId),open=o.qty-o.delivered;
   if(open>0){assert.ok(P.has(key),`${tag} Endstrafe fehlt ${o.id}`);assert.equal(P.get(key).amount,-cents(open*k.penaltyOpen));}}
  else assert.ok(!P.has(key),`${tag} Endstrafe ohne Storno ${o.id}`);}
}
/** Fristen und Preise der Fremdgebiete (extraSla, surcharge) an neu erzeugten Aufträgen. */
function checkTerms(s,k,B,seen){
 for(const o of s.orders){if(seen.has(o.id)||o.contractId!==k.id)continue;seen.add(o.id);
  const lane=k.lanes.find(l=>l.id===o.lane);assert.equal(deliverySiteOf(o),lane.site,'deliverySite = lane.site');assert.equal(o.site,A,'Annahme-Hub');
  if(lane.site===B){const r=remoteTerms(s,k.unit,A,B);assert.equal(lane.extraSla,r.extraSla);assert.equal(lane.surcharge,r.surcharge);assert.equal(o.price,cents(k.pricePerParcel+r.surcharge));}
  else{assert.equal(o.price,k.pricePerParcel);}
  assert.equal(o.due,k.lastEta+k.slaMinutes+(lane.extraSla||0),`Frist ${o.id}`);
 }
}

function run(env,minutes,{each=null,check=true}={}){
 const end=env.s.t+minutes,seen=new Set(),trips=new Map();
 while(env.s.t<end){
  policy(env);each?.(env);env.sim.step(1);const s=env.s;
  checkTerms(s,s.contracts.find(k=>k.id===env.k.id),env.B,seen);
  for(const lh of s.linehauls)trips.set(lh.id,lh);
  if(check&&s.t%5===0){const tag=`t=${s.t}`;checkQty(s,env.B,tag);checkPayments(s,tag);checkPenalties(s,tag);validateState(s);}
 }
 return {trips:[...trips.values()]};
}

for(const seed of [1,2,3])test(`Ende-zu-Ende Seed ${seed}: Mischvertrag, Linie A→B, 4 Tage, Mengen/Fristen/Strafen/Zahlung alle 5 Min`,()=>{
 const env=net({seed}),{s,B,k}=env;
 // A darf B-Gebiet nicht zustellen (Einzel und Tour).
 const {trips}=run(env,4*1440,{each:e=>{const o=e.s.orders.find(o=>o.status==='active'&&deliverySiteOf(o)===B&&ready(e.s,o,A)>0);const v=e.s.vehicles.find(v=>v.site===A&&v.id!==e.truck&&v.status==='idle');
  if(o&&v){assert.equal(e.sim.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty:1,site:A}).ok,false,'Dispatch B-Gebiet ab A');assert.equal(e.sim.command({type:'dispatchTour',vehicleId:v.id,stops:[{orderId:o.id,qty:1}],site:A}).ok,false,'Tour B-Gebiet ab A');}}});
 const bOrders=s.orders.filter(o=>o.contractId===k.id&&deliverySiteOf(o)===B),aOrders=s.orders.filter(o=>o.contractId===k.id&&deliverySiteOf(o)===A);
 assert.ok(bOrders.length>0&&aOrders.length>0,'Mischvertrag erzeugt Aufträge für A und B');
 const bDelivered=bOrders.reduce((n,o)=>n+o.delivered,0),bPaid=bOrders.reduce((n,o)=>n+o.paid,0);
 assert.ok(bDelivered>0&&bPaid>0,`B-Gebiet zugestellt ${bDelivered}, bezahlt ${bPaid}`);
 const done=trips.filter(x=>x.status==='complete');assert.ok(done.length>=2,`abgeschlossene Linienfahrten ${done.length}`);
 for(const lh of trips.filter(x=>x.departedAt!=null)){const rows=s.ledger.filter(r=>r.key===`linehaul:${lh.id}`);assert.equal(rows.length,1,`Fahrtkosten ${lh.id}`);assert.equal(rows[0].amount,-lh.cost);assert.equal(rows[0].category,'Transport');}
 assert.equal(s.ledger.filter(r=>/^linehaul:/.test(r.key)&&r.amount>0).length,0,'kein Umsatz aus Linie');
 // Vertragsende (2 Tage + 1 Tag Karenz) im Prüfzeitraum: alle Aufträge abgeschlossen.
 assert.ok(s.orders.filter(o=>o.contractId===k.id).every(o=>o.status!=='active'),'Vertrag abgerechnet');
 const late=s.ledger.filter(r=>/^penalty:/.test(r.key)).length,open=s.ledger.filter(r=>/^penalty-open:/.test(r.key)).length;
 test.diagnostic?.(`seed ${seed}: B ${bOrders.length} Aufträge ${bDelivered} zugestellt ${bPaid.toFixed(2)} €, Fahrten ${done.length}, Strafen spät ${late}, offen ${open}`);
 console.log(`# seed ${seed}: A-Aufträge ${aOrders.length}, B-Aufträge ${bOrders.length}, B zugestellt ${bDelivered}/${bOrders.reduce((n,o)=>n+o.qty,0)}, bezahlt ${bPaid.toFixed(2)} €, Fahrten ${done.length} (verpasst ${s.lines[0].missed}), Strafen spät ${late}, offen ${open}`);
});

test('Laden in jeder Linienphase (auch +1 Min) ergibt denselben Endhash',()=>{
 const MIN=2*1440;
 const ref=net({seed:1});const t0=ref.s.t;run(ref,MIN,{check:false});const want=hash(ref.sim.serialize());
 for(const phase of ['loading','transit','unloading','returning'])for(const late of [0,1]){
  const env=net({seed:1});let done=false;
  run(env,MIN,{check:false,each:e=>{if(!done&&e.s.linehauls.some(x=>x.status===phase)){if(late&&!e.lateArmed){e.lateArmed=true;return;}done=true;const r=reload(e.sim);e.sim=r;e.s=r.state;}}});
  assert.ok(done,`Phase ${phase} nicht erreicht`);assert.equal(env.s.t,t0+MIN);
  assert.equal(hash(env.sim.serialize()),want,`Phase ${phase}${late?' +1':''}`);
 }
});

const until=(env,cond,max=4000)=>{for(let i=0;i<max;i++){if(cond(env.s))return;policy(env);env.sim.step(1);}assert.fail(`Bedingung nicht erreicht t=${env.s.t}`);};
const trip=env=>env.s.linehauls.find(x=>!['complete','cancelled'].includes(x.status));
const resOf=(s,id)=>s.reservations.filter(r=>r.job===id).reduce((n,r)=>n+r.qty,0);
const bound=(s,id)=>({worker:s.workers.filter(w=>w.task===`${id}:warehouse`).length,fork:s.buildings.filter(b=>b.type==='forklift'&&b.task===`${id}:forklift`).length,dock:s.buildings.filter(b=>b.type==='dock'&&b.task===id).length});

test('Pflicht: Lkw-Wartung und Storno nach Reservierung geben Ware frei, nächste Abfahrt nimmt sie mit',()=>{
 const env=net({seed:1}),{s,B,truck}=env;
 until(env,s=>trip(env)?.status==='loading');const lh=trip(env),qty=lh.qty;
 assert.equal(resOf(s,lh.id),qty);
 s.vehicles.find(v=>v.id===truck).condition=80; // Testdaten: Wartung erst unter 100 % möglich
 cmd(env.sim,{type:'serviceVehicleExternal',id:truck});
 assert.equal(lh.status,'cancelled');assert.equal(resOf(s,lh.id),0);assert.deepEqual(bound(s,lh.id),{worker:0,fork:0,dock:0});
 assert.equal(s.vehicles.find(v=>v.id===truck).status,'maintenance');checkQty(s,B);validateState(s);
 until(env,s=>trip(env)?.status==='loading'&&trip(env).id!==lh.id);const lh2=trip(env);
 assert.ok(lh2.qty>=qty,'nächste Abfahrt nimmt die Ware mit');
 cmd(env.sim,{type:'cancelLinehaul',id:lh2.id});assert.equal(resOf(s,lh2.id),0);assert.equal(s.vehicles.find(v=>v.id===truck).status,'idle');
 until(env,s=>trip(env)?.status==='transit');
 assert.equal(env.sim.command({type:'serviceVehicleExternal',id:truck}).ok,false,'Wartung während Fahrt abgewiesen');
 assert.equal(env.sim.command({type:'cancelLinehaul',id:trip(env).id}).ok,false,'Storno während Fahrt abgewiesen');
 until(env,s=>s.linehauls.some(x=>x.status==='complete'));checkQty(s,B);validateState(s);
});

test('Pflicht: verpasste Abfahrt (Lkw in Wartung zum Ladeschluss) → nächste Abfahrt',()=>{
 const env=net({seed:1}),{s,truck,lineId}=env;const l=s.lines.find(x=>x.id===lineId);
 // Warten bis Ware für B im Lager A liegt, dann Lkw kurz vor Ladeschluss 11:30 in externe Wartung (120 Min).
 until(env,s=>s.t%1440===685&&s.orders.some(o=>deliverySiteOf(o)===env.B&&o.status==='active'));
 s.vehicles.find(v=>v.id===truck).condition=80; // Testdaten
 cmd(env.sim,{type:'serviceVehicleExternal',id:truck});
 until(env,s=>s.t%1440===691);assert.equal(l.missed,1);assert.equal(l.wait,L.WAIT.maintenance);assert.equal(s.linehauls.length,0);
 until(env,s=>s.t%1440===871);const lh=trip(env);assert.ok(lh&&lh.status==='loading','15:00-Abfahrt angelegt');assert.equal(l.wait,null);
});

test('Pflicht: Dock am Ziel während Entladen abgeschaltet → Wartet ohne Lagerkraft, danach fertig',()=>{
 const env=net({seed:1}),{s,B}=env;
 until(env,s=>trip(env)?.status==='unloading'&&trip(env).remaining<trip(env).duration);const lh=trip(env),dock=s.buildings.find(b=>b.type==='dock'&&b.site===B);
 cmd(env.sim,{type:'toggleBuilding',id:dock.id});const rem=lh.remaining;
 for(let i=0;i<30;i++){policy(env);env.sim.step(1);}
 assert.equal(lh.remaining,rem,'kein Fortschritt ohne Dock');assert.equal(lh.blocked,L.WAIT.dock);assert.equal(bound(s,lh.id).worker,0,'Lagerkraft frei');validateState(s);
 cmd(env.sim,{type:'toggleBuilding',id:dock.id});until(env,()=>lh.status==='returning',200);checkQty(s,B);validateState(s);
});

test('Pflicht: Schichtende der Lagerkräfte am Ziel während Entladen → Wartet, keine Bindung, danach fertig',()=>{
 const env=net({seed:1}),{s,B}=env;
 until(env,s=>trip(env)?.status==='unloading'&&trip(env).remaining<trip(env).duration);const lh=trip(env);
 const bw=s.workers.filter(w=>w.site===B&&w.role==='warehouse');for(const w of bw)cmd(env.sim,{type:'setShift',id:w.id,shift:'night'});
 const rem=lh.remaining;for(let i=0;i<20;i++){policy(env);env.sim.step(1);}
 assert.equal(lh.remaining,rem);assert.equal(lh.blocked,L.WAIT.staff);assert.equal(bound(s,lh.id).worker,0);validateState(s);
 for(const w of bw)cmd(env.sim,{type:'setShift',id:w.id,shift:'day'});until(env,()=>lh.status==='returning',200);checkQty(s,B);validateState(s);
});

test('Pflicht: Kasse leer bei Abfahrt → Lkw wartet, Stapler/Lagerkraft frei (QS-W2-01-Muster), Buchung genau einmal',()=>{
 for(const unit of ['parcel','pallet']){
  const env=net({seed:unit==='pallet'?2:1,unit}),{s,B}=env;
  until(env,s=>trip(env)?.loadDone,6000);const lh=trip(env);s.money=-10000;
  until(env,s=>{s.money=Math.min(s.money,-10000);return s.t>=lh.departAt+30;},200); // Testdaten: Kasse im Dispo (−10.000 €, Zahlungseingänge reichen nicht)
  assert.equal(lh.status,'loading');assert.equal(lh.blocked,L.WAIT.cash);
  const b=bound(s,lh.id);assert.equal(b.worker,0,`${unit}: Lagerkraft frei`);assert.equal(b.fork,0,`${unit}: Stapler frei`);
  s.money=50000;until(env,()=>lh.status==='transit',30);
  assert.equal(s.ledger.filter(r=>r.key===`linehaul:${lh.id}`).length,1);checkQty(s,B);validateState(s);
 }
});

test('Pflicht: Paletten auf der Linie mit Stapler an A und B, Zustellung ab B mit Zahlung',()=>{
 const env=net({seed:2,unit:'pallet'}),{s,B,k}=env;let forkB=0;
 run(env,4*1440,{each:e=>{const lh=e.s.linehauls.find(x=>x.status==='unloading'&&x.pallet);if(lh&&e.s.buildings.some(b=>b.type==='forklift'&&b.site===B&&b.task===`${lh.id}:forklift`))forkB++;}});
 const bo=s.orders.filter(o=>o.contractId===k.id&&deliverySiteOf(o)===B);
 assert.ok(forkB>0,'Stapler B entlädt Linie');assert.ok(bo.reduce((n,o)=>n+o.paid,0)>0,'Paletten B bezahlt');
 console.log(`# Paletten seed 2: B-Aufträge ${bo.length}, zugestellt ${bo.reduce((n,o)=>n+o.delivered,0)}/${bo.reduce((n,o)=>n+o.qty,0)}, Stapler-B-Minuten ${forkB}`);
});

test('Pflicht: Paletten ohne Stapler am Ziel → Entladen wartet ohne Lagerkraft',()=>{
 const env=net({seed:2,unit:'pallet',forkB:false}),{s}=env;
 until(env,s=>trip(env)?.status==='unloading',6000);const lh=trip(env);for(let i=0;i<20;i++){policy(env);env.sim.step(1);}
 assert.equal(lh.remaining,lh.duration);assert.equal(lh.blocked,L.WAIT.forklift);assert.equal(bound(s,lh.id).worker,0);validateState(s);
});

// Befund QS-W3-01 (todo bis Behebung): Lager am Ziel voll – Fahrt hält nach der letzten Entlademinute Lagerkraft (und Stapler).
function fullB(unit){
 const env=net({seed:unit==='pallet'?2:1,unit,warehouseB:1}),{s,B}=env;
 until(env,s=>trip(env)?.status==='transit',6000);const lh=trip(env);
 const free=env.sim.api.inventory.free(B);assert.ok(env.sim.api.inventory.add({item:'housing',qty:Math.floor(free/1),site:B,owner:'company',location:'stock',quality:100,unitCost:0}),'Füllware');
 until(env,()=>lh.status==='unloading'&&lh.remaining===0&&lh.blocked===L.WAIT.full,300);
 for(let i=0;i<30;i++){policy(env);env.sim.step(1);}
 return {env,lh};
}
test('Pflicht: Lager am Ziel voll → Fahrt wartet, Ware bleibt auf dem Lkw, nach Platz fertig',()=>{
 const {env,lh}=fullB('parcel'),{s,B}=env;
 assert.equal(lh.status,'unloading');assert.equal(lh.blocked,L.WAIT.full);assert.ok(lh.cargo.every(id=>s.batches.find(b=>b.id===id).location==='vehicle'));
 checkQty(s,B);validateState(s);
 const filler=s.batches.find(b=>b.item==='housing'&&b.site===B);env.sim.api.inventory.remove(filler.id,filler.qty);
 until(env,()=>lh.status==='returning',30);checkQty(s,B);validateState(s);
});
test('QS-W3-01: Lager am Ziel voll → Linienfahrt hält die einzige Lagerkraft am Ziel ohne Fortschritt',{todo:'QS-W3-01 offen (A07/A05)'},()=>{
 const {env,lh}=fullB('parcel'),{s}=env;
 assert.equal(bound(s,lh.id).worker,0,'Lagerkraft am Ziel gebunden, obwohl nichts entladen wird');
});
test('QS-W3-01b: Paletten, Lager am Ziel voll → Stapler am Ziel bleibt gebunden',{todo:'QS-W3-01 offen (A07/A05)'},()=>{
 const {env,lh}=fullB('pallet'),{s}=env;
 assert.equal(bound(s,lh.id).fork,0,'Stapler am Ziel gebunden, obwohl nichts entladen wird');
});
