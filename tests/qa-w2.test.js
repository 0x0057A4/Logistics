// A11 · QS Release 0.10 (Welle 2): Palettenvertrag Ende-zu-Ende mit Staplerplatz, Lkw, Fahrer, Lagerkraft; Vertragsstrafen.
// Nur reguläre Spielerbefehle. Testdaten (dokumentiert in docs/QS-0.10.md): Ankunftsminute bzw. Laufzeit eines Angebots
// werden VOR der Annahme gesetzt; im Pflichtfall „Fahrzeug fällt aus“ wird der Ausfall als Zustand 0 nach Rückkehr gesetzt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {maxLoad} from '../dist/transport.js';
import * as yard from '../dist/yard.js';
import {hash,cmd,reload,checkPayments} from './qa-w1-hub.mjs';

const PAL='pallet';
const fk=s=>s.buildings.filter(b=>b.type==='forklift');
const pal=(s,pred=()=>true)=>s.batches.filter(b=>b.item===PAL&&pred(b)).reduce((n,b)=>n+b.qty,0);

/** Palettenhub: Dock(s), Regale, Staplerplatz, Lagerkraft, Fahrer, Lkw. Wartet auf das erste Palettenangebot (17:00 Tag 1). */
function hub({seed=11,mode='economy',docks=1,trucks=1,warehouse=1,drivers=1,minute=null,days=null,accept=true}={}){
 const sim=new Simulation({mode,seed}),s=sim.state;
 const spots=[[2,13],[6,13],[10,13]];
 for(let i=0;i<docks;i++)cmd(sim,{type:'build',buildingType:'dock',x:spots[i][0],y:spots[i][1],rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:8,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:4,y:2,rotation:0});
 cmd(sim,{type:'build',buildingType:'forklift',x:14,y:2,rotation:0});
 for(let i=0;i<warehouse;i++)cmd(sim,{type:'hire',role:'warehouse'});
 for(let i=0;i<drivers;i++)cmd(sim,{type:'hire',role:'driver'});
 for(let i=0;i<trucks;i++)cmd(sim,{type:'buyVehicle',vehicleType:'truck'});
 let k=null;for(let i=0;i<1500&&!k;i++){sim.step(1);k=s.contracts.find(c=>c.status==='offer'&&c.unit===PAL);}
 assert.ok(k,'kein Palettenangebot');
 if(minute!=null)k.arrivals=[{minute,parcels:k.arrivals[0].parcels}];
 if(days!=null)k.durationDays=days;
 if(accept)cmd(sim,{type:'acceptContract',id:k.id});
 return {sim,k};
}
function until(r,cond,max=6000){for(let i=0;i<max;i++){if(cond(r.sim.state))return i;r.sim.step(1);}assert.fail('Bedingung nicht erreicht (t='+r.sim.state.t+')');}

// Disposition: freier Lkw nimmt Paletten fertiger Aufträge (früheste Frist), 2–4 Aufträge als Tour, sonst Einzellieferung.
const committed=(s,o)=>s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0)
 +(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
const ready=(s,o)=>pal(s,b=>b.location==='stock'&&b.owner===o.id)-s.batches.filter(b=>b.item===PAL&&b.owner===o.id).reduce((n,b)=>n+b.reserved,0);
function dispatch(sim,{tours=true,from=480,to=930,minStops=1}={}){
 const s=sim.state,m=s.t%1440;if(m<from||m>=to)return null;
 const v=s.vehicles.find(v=>v.type==='truck'&&v.status==='idle'&&v.condition>=15);if(!v)return null;
 const max=maxLoad(v,PAL);
 const cand=s.orders.filter(o=>o.item===PAL&&o.status==='active').map(o=>({o,rest:o.qty-o.delivered-committed(s,o)})).filter(x=>x.rest>0&&ready(s,x.o)>=x.rest).sort((a,b)=>a.o.due-b.o.due);
 const stops=[];let load=0;for(const x of cand){if(stops.length===(tours?4:1))break;const q=Math.min(x.rest,max-load);if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
 if(stops.length<Math.max(1,minStops))return null;
 return stops.length>1?sim.command({type:'dispatchTour',vehicleId:v.id,stops}):sim.command({type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty});
}

/** Mengeninvariante Paletten je Vertragsauftrag: qty = offen im Hof + Bestand (stock/vehicle) + zugestellt + zurückgegeben. */
function checkPallets(s,tag=''){
 for(const b of s.batches){assert.ok(b.qty>=0,`${tag} negative Menge ${b.id}`);assert.ok(b.reserved>=-1e-9&&b.reserved<=b.qty+1e-9,`${tag} Reservierung ${b.id}`);}
 for(const b of s.batches.filter(b=>b.item===PAL&&b.qty>0)){assert.ok(['stock','vehicle'].includes(b.location),`${tag} Palette in ${b.location}`);assert.ok(s.orders.some(o=>o.id===b.owner),`${tag} Palette ohne Auftrag`);}
 const pending=new Map();for(const a of s.yard)for(const p of a.split)pending.set(p.owner,(pending.get(p.owner)||0)+p.target-p.done);
 for(const o of s.orders.filter(o=>o.item===PAL)){
  const held=pal(s,b=>b.owner===o.id),ret=o.returnedQty||0;
  assert.equal((pending.get(o.id)||0)+held+o.delivered+ret,o.qty,`${tag} Auftrag ${o.id}: offen ${pending.get(o.id)||0}+Bestand ${held}+zugestellt ${o.delivered}+zurück ${ret} ≠ ${o.qty}`);
 }
 // Stapler: höchstens eine Bindung je Schlüssel, Akku 0–100, Ladezwang nur unter 30.
 const keys=new Set();for(const b of fk(s)){if(b.task){assert.ok(!keys.has(b.task),`${tag} Stapler doppelt`);keys.add(b.task);}assert.ok(b.charge==null||(b.charge>=0&&b.charge<=100));if(b.charging)assert.ok(b.charge<30,`${tag} Ladezwang ab 30`);}
}
/** Strafen: je verspäteter Lieferung/Stopp genau eine Buchung qty×Satz, pünktlich keine; penalty-open je storniertem Auftrag. */
function checkPenalties(s,tag=''){
 const L=new Map();for(const l of s.ledger)if(/^penalty/.test(l.key)){assert.ok(!L.has(l.key),`${tag} doppelt ${l.key}`);L.set(l.key,l);}
 const late=(id,qty,at,key)=>{const o=s.orders.find(o=>o.id===id),k=s.contracts.find(k=>k.id===o?.contractId);if(!k)return;
  if(at>o.due&&k.penaltyLate>0){if(s.t>at||L.has(key)){assert.ok(L.has(key),`${tag} Strafe fehlt ${key}`);assert.equal(L.get(key).amount,-Math.round(qty*k.penaltyLate*100)/100);}}
  else assert.ok(!L.has(key),`${tag} Strafe ohne Verspätung ${key}`);};
 for(const sh of s.shipments)if(sh.deliveredAt!=null)late(sh.orderId,sh.qty,sh.deliveredAt,`penalty:${sh.id}`);else assert.ok(!L.has(`penalty:${sh.id}`));
 for(const t of s.tours||[])t.stops.forEach((st,i)=>{if(st.status==='delivered')late(st.orderId,st.qty,st.deliveredAt,`penalty:${t.id}:${i}`);else assert.ok(!L.has(`penalty:${t.id}:${i}`));});
 for(const o of s.orders){const key=`penalty-open:${o.id}`;
  if(o.cancelReason==='contractEnd'){const k=s.contracts.find(k=>k.id===o.contractId),open=o.qty-o.delivered;
   if(open>0){assert.ok(L.has(key),`${tag} Endstrafe fehlt ${o.id}`);assert.equal(L.get(key).amount,-Math.round(open*k.penaltyOpen*100)/100);}
   assert.equal(o.returnedQty+o.delivered,o.qty,`${tag} Rückgabe ${o.id}`);}
  else assert.ok(!L.has(key),`${tag} Endstrafe ohne Storno ${o.id}`);}
 const sum=[...L.values()].reduce((n,l)=>n+l.amount,0);
 assert.ok(Math.abs(sum-s.ledger.filter(l=>l.category==='Vertragsstrafe').reduce((n,l)=>n+l.amount,0))<0.011,`${tag} Strafkategorie`);
}
const checkAll=(s,tag)=>{checkPallets(s,tag);checkPayments(s,tag);checkPenalties(s,tag);yard.validate(s);};

/** Kompletter Lauf: n Tage mit Disposition; onMinute(sim) optional (Laden etc.), Invarianten alle 5 Min. */
function run(r,days,{policy={},each=null}={}){
 const end=r.sim.state.t+days*1440;
 while(r.sim.state.t<end){dispatch(r.sim,policy);r.sim.step(1);if(each)each(r);if(r.sim.state.t%5===0)checkAll(r.sim.state,`t=${r.sim.state.t}`);}
}

// ── 1. Ende-zu-Ende ─────────────────────────────────────────────────────────────────────────────────────────────
test('E2E Palettenvertrag: Lkw kommt → Stapler entlädt nach stock → Lkw-Zustellung mit Stapler → Zahlung je Palette; Mengen exakt',()=>{
 const r=hub({minute:540});const {k}=r;const s=()=>r.sim.state;
 assert.equal(k.unit,PAL);assert.ok(k.pricePerParcel>=110&&k.pricePerParcel<=140,`Preis ${k.pricePerParcel}`);
 assert.equal(maxLoad({type:'van',capacity:20},PAL),0);
 const seen={approach:0,gate:0,queue:0,unloading:0,forkUnload:0,stockBeforeDispatch:0,forkLoad:0,transit:0,paid:0};
 run(r,4,{each:r=>{const S=r.sim.state;
  for(const a of S.yard){if(a.item!==PAL)continue;seen[a.phase]=(seen[a.phase]||0)+1;if(a.phase==='unloading'&&fk(S)[0].task===`${a.id}:forklift`)seen.forkUnload++;}
  if(S.shipments.some(x=>x.status==='loading'&&fk(S)[0].task===`${x.id}:forklift`)||(S.tours||[]).some(t=>t.status==='loading'&&fk(S)[0].task===`${t.id}:forklift`))seen.forkLoad++;
 }});
 const S=s(),orders=S.orders.filter(o=>o.contractId===k.id);
 assert.ok(orders.length>=3,`Aufträge ${orders.length}`);
 assert.ok(seen.forkUnload>0,'Stapler beim Entladen gebunden');assert.ok(seen.forkLoad>0,'Stapler beim Beladen gebunden');
 assert.ok(S.yard.filter(a=>a.item===PAL).every(a=>a.phase!=='unloading'||a.unloaded<=a.parcels));
 const delivered=orders.reduce((n,o)=>n+o.delivered,0),total=orders.reduce((n,o)=>n+o.qty,0);
 assert.ok(delivered>0,'nichts zugestellt');
 // Zahlung je Palette: Summe der Umsatzbuchungen = Σ zugestellt × Preis (pünktlich) bzw. ×0,9.
 const paid=orders.reduce((n,o)=>n+o.paid,0);assert.ok(paid>0);
 assert.ok(S.shipments.concat((S.tours||[]).flatMap(t=>t.stops)).filter(x=>x.invoiceAmount!=null&&S.orders.find(o=>o.id===x.orderId)?.item===PAL).every(x=>x.invoiceAmount===Math.round(x.qty*k.pricePerParcel*(x.deliveredAt>S.orders.find(o=>o.id===x.orderId).due?0.9:1)*100)/100));
 assert.ok(!S.vehicles.some(v=>v.type==='van'));
 checkAll(S,'Ende');
 console.log(`# E2E seed 11: ${orders.length} Aufträge, ${total} Paletten, zugestellt ${delivered}, bezahlt ${paid.toFixed(2)} €, Touren ${(S.tours||[]).length}, Lieferungen ${S.shipments.length}`);
});

test('E2E Seeds 1–3, je 6 Tage, Einzel- und Tourdisposition: Invarianten alle 5 Min., Akku-Hysterese im Ablauf ohne Pendeln',()=>{
 for(const seed of [1,2,3]){
  const r=hub({seed});let prev=null,switches=0,lowSeen=false,blockMinutes=0,unloadInBlock=0;
  run(r,6,{policy:{tours:seed!==2},each:r=>{const S=r.sim.state,f=fk(S)[0];const w=!!f.charging;
   if(prev!=null&&w!==prev)switches++;prev=w;if(w){lowSeen=true;blockMinutes++;if(f.task)unloadInBlock++;}}});
  const S=r.sim.state,pals=S.orders.filter(o=>o.item===PAL);
  // Hysterese: Ladezwang nie ohne Ende; während Ladezwang nie gebunden.
  assert.equal(unloadInBlock,0,`seed ${seed}: Stapler gebunden im Ladezwang`);
  if(lowSeen)assert.ok(blockMinutes/(switches/2||1)>=20,`seed ${seed}: Ladeblock < 20 Min.`);
  console.log(`# seed ${seed}: Touren ${(S.tours||[]).length}, Lieferungen ${S.shipments.length}, ${pals.length} Aufträge, ${pals.reduce((n,o)=>n+o.qty,0)} Paletten, zugestellt ${pals.reduce((n,o)=>n+o.delivered,0)}, Ladezwang-Wechsel ${switches}, Lademinuten ${blockMinutes}, Strafe ${S.ledger.filter(l=>l.category==='Vertragsstrafe').reduce((n,l)=>n+l.amount,0).toFixed(2)} €`);
  checkAll(S,`seed ${seed}`);
 }
});

test('Akku-Hysterese im echten Ablauf: Stapler bei 12 % vor Entladen → ein Ladeblock bis 30, danach weiter, Menge exakt',()=>{
 const r=hub({minute:540});until(r,s=>s.yard.some(a=>a.item===PAL&&a.phase==='docking'));
 const S=r.sim.state,f=fk(S)[0],a=S.yard.find(a=>a.item===PAL&&a.phase==='docking');f.charge=12; // Testdatum: Akku fast leer
 const twin=reload(r.sim);
 const tr=[];until(r,s=>{tr.push({u:a.unloaded,c:f.charge,w:!!f.charging,why:a.waitReason});return a.phase==='exit';},400);
 let sw=0;for(let i=1;i<tr.length;i++)if(tr[i].w!==tr[i-1].w)sw++;
 assert.equal(sw,2,`Wechsel ${sw}`);const on=tr.findIndex(x=>x.w),off=tr.findIndex((x,i)=>i>on&&!x.w);
 assert.equal(tr[off-1].u,tr[on].u,'Entladung im Ladezwang');assert.ok(off-on>=20);
 assert.ok(tr.slice(on+1,off).every(x=>x.why==='Stapler lädt'),'Wartegrund');
 assert.equal(a.unloaded,a.parcels);checkAll(S,'Akku');
 // Laden im Ladezwang und in der ersten Minute danach → gleicher Endstand.
 r.sim.step(60);const end=r.sim.state.t,want=hash(r.sim.serialize());
 const t={sim:twin};let reloads=0,was=false;
 while(t.sim.state.t<end){t.sim.step(1);const g=fk(t.sim.state)[0];if(!!g.charging!==was||(g.charging&&reloads===1)){was=!!g.charging;t.sim=reload(t.sim);reloads++;}}
 assert.ok(reloads>=3,`Ladevorgänge ${reloads}`);assert.equal(hash(t.sim.serialize()),want,'Endhash nach Laden im Ladezwang');
});

// ── 2. Strafen ──────────────────────────────────────────────────────────────────────────────────────────────────
test('Strafe verspätet genau einmal: Einzellieferung und Tour (Disposition erst nach Frist), über Laden hinweg',()=>{
 for(const tours of [false,true]){
  const r=hub({minute:510,seed:tours?5:4});
  // Erst nach Frist disponieren: SLA ≥ 6 h ab 08:30 → Disposition ab 15:30 (Fenster 930–1000 bis in die Nacht).
  let loads=0;run(r,3,{policy:{tours,from:960,to:1430},each:r=>{if(r.sim.state.t%97===0){r.sim=reload(r.sim);loads++;}}});
  const S=r.sim.state,keys=S.ledger.filter(l=>/^penalty:/.test(l.key)).map(l=>l.key);
  const lateUnits=S.shipments.filter(x=>x.deliveredAt>S.orders.find(o=>o.id===x.orderId).due).length+(S.tours||[]).flatMap(t=>t.stops).filter(x=>x.status==='delivered'&&x.deliveredAt>S.orders.find(o=>o.id===x.orderId).due).length;
  assert.ok(lateUnits>0,'keine Verspätung erzeugt');assert.equal(keys.length,lateUnits,'Strafbuchungen ≠ verspätete Zustellungen');
  if(tours)assert.ok(keys.some(k=>/^penalty:tour-/.test(k)),'keine Tourstrafe');else assert.ok(keys.some(k=>/^penalty:shipment-/.test(k)),'keine Lieferstrafe');
  checkAll(S,'spät');console.log(`# spät ${tours?'Tour':'Einzel'}: ${keys.length} Strafbuchungen, ${loads} Ladevorgänge, Summe ${S.ledger.filter(l=>/^penalty:/.test(l.key)).reduce((n,l)=>n+l.amount,0).toFixed(2)} €`);
 }
});

test('Vertragsende: penalty-open genau einmal, Ware an Versender zurück; nicht solange Ware unterwegs',()=>{
 const r=hub({minute:540,days:1});const {k}=r;
 // Tag 2: Ankunft 09:00, keine Disposition → Ende = start+1 Tag; Abrechnung ab endT+1440.
 until(r,s=>s.yard.some(a=>a.item===PAL&&a.phase==='gone'));
 const S0=r.sim.state,orders=S0.orders.filter(o=>o.contractId===k.id);assert.ok(orders.length);
 // Eine Teillieferung so starten, dass sie zur Abrechnungszeit noch unterwegs ist.
 const settleAt=S0.contracts.find(c=>c.id===k.id).endT+1440;
 until(r,s=>s.t>=settleAt-3);
 const o1=orders[0],v=r.sim.state.vehicles[0];const res=cmd(r.sim,{type:'dispatch',orderId:o1.id,vehicleId:v.id,qty:1});
 // Nacht: Fahrer nicht im Dienst → Lieferung bleibt loading mit Reservierung über die Abrechnung hinweg.
 until(r,s=>s.t>=settleAt+2);
 let S=r.sim.state;const o=id=>S.orders.find(x=>x.id===id);
 assert.equal(o(o1.id).status,'active','Auftrag mit Ware unterwegs/reserviert abgerechnet');assert.ok(o(o1.id).settleWait);
 assert.ok(!S.ledger.some(l=>l.key===`penalty-open:${o1.id}`));
 for(const x of orders.slice(1)){assert.equal(o(x.id).status,'cancelled');assert.equal(o(x.id).returnedQty,x.qty);}
 assert.equal(S.ledger.filter(l=>/^penalty-open:/.test(l.key)).length,orders.length-1);
 checkAll(S,'Ende1');
 // Laden + weiterlaufen: Lieferung fährt, danach Restmenge bestraft, genau einmal.
 r.sim=reload(r.sim);until(r,s=>s.shipments.find(x=>x.id===res.id).status==='complete'&&s.orders.find(x=>x.id===o1.id).status!=='active',3000);
 r.sim.step(200);r.sim=reload(r.sim);r.sim.step(1500);S=r.sim.state;
 const L=S.ledger.filter(l=>l.key===`penalty-open:${o1.id}`);assert.equal(L.length,1);
 assert.equal(L[0].amount,-Math.round((o1.qty-1)*k.penaltyOpen*100)/100);assert.equal(o(o1.id).returnedQty,o1.qty-1);
 assert.equal(pal(S),0,'Paletten nach Rückgabe');assert.equal(S.contracts.find(c=>c.id===k.id).settled,true);
 checkAll(S,'Ende2');
});

// ── 3. Laden in jeder Palettenphase ─────────────────────────────────────────────────────────────────────────────
test('Laden beim ersten Auftreten jeder Palettenphase → Endhash wie ohne Laden (Seeds 1–3)',()=>{
 const phase=s=>{const out=[];for(const a of s.yard)if(a.item===PAL)out.push('yard:'+a.phase+(a.waitReason?':'+a.waitReason:''));
  for(const x of s.shipments)if(!['complete','cancelled'].includes(x.status))out.push('ship:'+x.status+(x.blocked?':'+x.blocked:''));
  for(const t of s.tours||[])if(!['complete','cancelled'].includes(t.status))out.push('tour:'+t.status+(t.blocked?':'+t.blocked:''));
  for(const b of fk(s)){out.push('fork:'+(b.task?b.task.split('-')[0]:'frei')+(b.charging?':lädt':''));}
  for(const x of s.shipments.concat((s.tours||[]).flatMap(t=>t.stops)))if(x.paymentAt!=null&&!x.paid)out.push('zahlung offen');
  return out;};
 for(const [seed,policy] of [[1,{}],[2,{}],[3,{}],[1,{minStops:2}],[3,{minStops:2}]]){
  const base=hub({seed});run(base,4,{policy});const want=hash(base.sim.serialize());
  const r=hub({seed});const seenP=new Set();let loads=0;
  run(r,4,{policy,each:r=>{for(const p of phase(r.sim.state))if(!seenP.has(p)){seenP.add(p);r.sim=reload(r.sim);loads++;}}});
  assert.equal(hash(r.sim.serialize()),want,`seed ${seed}: Endhash abweichend`);
  const needs=policy.minStops?['yard:unloading','tour:loading','tour:transit','tour:unloading','tour:returning','fork:tour','zahlung offen']:['yard:approach','yard:gate','yard:unloading','yard:exit','ship:loading','ship:transit','ship:unloading','ship:returning','fork:arrival','fork:shipment','zahlung offen'];
  for(const need of needs)assert.ok([...seenP].some(p=>p.startsWith(need)),`seed ${seed}: Phase ${need} nicht erreicht`);
  console.log(`# Laden seed ${seed}${policy.minStops?' Touren':''}: ${loads} Ladevorgänge, Phasen: ${[...seenP].sort().join(', ')}`);
 }
});

// ── 4. Pflichtfall Fahrzeug fällt aus nach Reservierung ─────────────────────────────────────────────────────────
test('Pflichtfall: Lkw mit reservierten Paletten fällt aus → Wartung abgelehnt; Storno gibt Reservierung und Stapler frei, Ersatz-Lkw liefert',()=>{
 const r=hub({minute:540,trucks:2});until(r,s=>s.yard.some(a=>a.item===PAL&&a.phase==='gone')&&s.t%1440>=600);
 let S=r.sim.state;const o=S.orders.find(o=>o.item===PAL&&o.status==='active');const [v1,v2]=S.vehicles;
 const res=cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:v1.id,qty:o.qty});r.sim.step(1);S=r.sim.state;
 assert.equal(fk(S)[0].task,`${res.id}:forklift`);assert.equal(S.reservations.filter(x=>x.job===res.id).reduce((n,x)=>n+x.qty,0),o.qty);
 // Ausfall während Beladung: Wartung nicht möglich (nicht frei), zweiter Lkw kann dieselbe Ware nicht doppelt reservieren.
 assert.equal(r.sim.command({type:'serviceVehicleExternal',id:v1.id}).ok,false);
 assert.equal(r.sim.command({type:'dispatch',orderId:o.id,vehicleId:v2.id,qty:1}).ok,false,'Doppelreservierung');
 r.sim=reload(r.sim);cmd(r.sim,{type:'cancelShipment',id:res.id});S=r.sim.state;
 assert.equal(fk(S)[0].task,null);assert.equal(S.reservations.filter(x=>x.job===res.id).length,0);
 assert.ok(S.buildings.every(b=>b.task!==res.id),'Dock frei');assert.ok(S.workers.every(w=>!String(w.task).startsWith(res.id)));
 // v1 außer Betrieb (Testdatum: Zustand 0) → Disposition abgelehnt, Wartung möglich; v2 liefert.
 S.vehicles[0].condition=0;assert.equal(r.sim.command({type:'dispatch',orderId:o.id,vehicleId:S.vehicles[0].id,qty:1}).ok,false);
 const r2=cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:S.vehicles[1].id,qty:o.qty});
 assert.equal(cmd(r.sim,{type:'serviceVehicleExternal',id:S.vehicles[0].id}).ok,true);
 until(r,s=>s.shipments.find(x=>x.id===r2.id).paid,800);S=r.sim.state;
 assert.equal(S.orders.find(x=>x.id===o.id).delivered,o.qty);checkAll(S,'Ausfall');
});

test('Pflichtfall Tour: Ausfall nach Reservierung der Sammeltour → cancelTour gibt alles frei, keine Strafe/Zahlung doppelt',()=>{
 const r=hub({minute:540,trucks:2});until(r,s=>s.yard.some(a=>a.item===PAL&&a.phase==='gone')&&s.t%1440>=600);
 let S=r.sim.state;const os=S.orders.filter(o=>o.item===PAL&&o.status==='active');
 assert.ok(os.length>=2,`Tourfall braucht zwei Aufträge (${os.length})`);
 const stops=os.slice(0,2).map(o=>({orderId:o.id,qty:Math.min(o.qty,10)}));
 const t=cmd(r.sim,{type:'dispatchTour',vehicleId:S.vehicles[0].id,stops});r.sim.step(2);S=r.sim.state;
 assert.equal(fk(S)[0].task,`${t.id}:forklift`);
 r.sim=reload(r.sim);cmd(r.sim,{type:'cancelTour',id:t.id});S=r.sim.state;
 assert.equal(fk(S)[0].task,null);assert.equal(S.reservations.filter(x=>x.job.startsWith(t.id)).length,0);assert.ok(S.buildings.every(b=>b.task!==t.id));
 const t2=cmd(r.sim,{type:'dispatchTour',vehicleId:S.vehicles[1].id,stops});until(r,s=>s.tours.find(x=>x.id===t2.id).stops.every(x=>x.paid),800);
 checkAll(r.sim.state,'Tourausfall');
});

// ── 5. Dockwechsel (QS-W1-03) mit Paletten-Lkw ──────────────────────────────────────────────────────────────────
test('QS-W1-03 Paletten-Lkw: Dock aus während Entladen → Wechsel, Stapler/Kraft frei, Menge bleibt, Laden; kein Dock frei → Wartegrund',()=>{
 const r=hub({minute:540,docks:2});until(r,s=>s.yard.some(a=>a.item===PAL&&a.phase==='unloading'&&a.unloaded>=2));
 let S=r.sim.state;const a=()=>r.sim.state.yard.find(x=>x.item===PAL&&x.plate===plate);const plate=S.yard.find(x=>x.item===PAL&&x.phase==='unloading').plate;
 const old=a().dock,u=a().unloaded;assert.equal(fk(S)[0].task,`${a().id}:forklift`);
 cmd(r.sim,{type:'toggleBuilding',id:old});r.sim.step(1);S=r.sim.state;
 assert.equal(a().phase,'toDock');assert.notEqual(a().dock,old);assert.equal(a().unloaded,u);
 assert.equal(fk(S)[0].task,null,'Stapler am alten Dock gebunden');assert.ok(S.workers.every(w=>w.task!==`${a().id}:warehouse`));
 assert.equal(S.buildings.find(b=>b.id===old).task,null);checkAll(S,'Wechsel');
 r.sim=reload(r.sim);until(r,()=>a().phase==='exit',200);assert.equal(a().unloaded,a().parcels);checkAll(r.sim.state,'Wechsel fertig');
 // kein freies Dock: Wartegrund, Stapler frei, Menge fix
 const q=hub({minute:540,docks:2});until(q,s=>s.yard.some(a=>a.item===PAL&&a.phase==='unloading'&&a.unloaded>=2));
 const b=q.sim.state.yard.find(x=>x.item===PAL&&x.phase==='unloading');for(const d of q.sim.state.buildings.filter(d=>d.type==='dock'&&d.id!==b.dock))cmd(q.sim,{type:'toggleBuilding',id:d.id});
 cmd(q.sim,{type:'toggleBuilding',id:b.dock});const n=b.unloaded;q.sim.step(5);
 assert.equal(b.phase,'unloading');assert.equal(b.waitReason,yard.WAIT.dockOff);assert.equal(b.unloaded,n);assert.equal(fk(q.sim.state)[0].task,null);
 checkAll(q.sim.state,'kein Dock');
});

// ── Befunde (todo bis Behebung) ─────────────────────────────────────────────────────────────────────────────────
test('QS-W2-01 Blockierte Palettenbeladung (Fahrtkosten nicht gedeckt) hält Stapler, leert Akku, Fremd-Lkw wartet „Kein Stapler“',()=>{
 const r=hub({minute:540,docks:2,warehouse:2});const S=r.sim.state,k=S.contracts.find(x=>x.unit===PAL&&x.status==='active');
 until(r,s=>s.yard.some(a=>a.phase==='gone'));
 // Testdatum: zusätzliche Ankunft 11:00 desselben Tages, gesetzt VOR deren Ankündigung
 k.arrivals.push({minute:660,parcels:12});
 const o=S.orders.find(o=>o.item===PAL&&o.status==='active');const res=cmd(r.sim,{type:'dispatch',orderId:o.id,vehicleId:S.vehicles[0].id,qty:o.qty});
 r.sim.step(1);S.money=1; // Testdatum: Kasse leer (erreichbar, da Pflichtstrafen und Löhne ins Minus buchen)
 const f=fk(S)[0],sh=S.shipments.find(x=>x.id===res.id);r.sim.step(60);
 assert.equal(sh.blocked,'Betriebskosten können nicht bezahlt werden');
 assert.ok(f.charge>=99,`Akku sinkt ohne Fortschritt: ${f.charge}`);
 until(r,s=>s.yard.some(a=>a.phase==='unloading'),300);r.sim.step(30);
 const a=S.yard.at(-1);/* Fix wirkt: Lkw kann schon fertig sein */assert.ok(a.unloaded>0,`Fremd-Lkw wartet „${a.waitReason}“, Stapler gebunden an ${f.task}`);
});
