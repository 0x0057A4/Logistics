// A11 · QS Welle 1 (0.9): Mengen/Buchungen über 5 Spieltage mit 2 Verträgen (Seeds 1–3), Laden in jeder Hofphase.
// Eigene Invarianten (tests/qa-w1-hub.mjs), keine Übernahme der Entwicklerprüfungen. Bericht docs/QS-0.9-W1.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {depot,policy,checkQuantities,checkPayments,hash,reload} from './qa-w1-hub.mjs';

const DAYS=5,MIN=DAYS*1440;
function play(seed,{reloadAt=()=>false,check=false}={}){
 const ref=depot({seed,mode:'economy',warehouse:2});let reloads=0;const phases=new Set(),seen=new Set();
 for(let i=0;i<MIN;i++){
  policy(ref.sim);ref.sim.step(1);const s=ref.sim.state;
  if(check&&(i%5===0||i===MIN-1)){checkQuantities(s,`seed ${seed} t=${s.t}`);checkPayments(s,`seed ${seed} t=${s.t}`);}
  // Phasen-Merkmale für „Laden in jeder Phase“
  const marks=[...s.yard.filter(a=>a.phase!=='gone').map(a=>'hof:'+a.phase),...s.yard.filter(a=>a.waitReason).map(a=>'warte:'+a.waitReason),
   ...s.shipments.filter(x=>!['complete','cancelled'].includes(x.status)).map(x=>'lief:'+x.status),
   ...(s.tours||[]).filter(t=>!['complete','cancelled'].includes(t.status)).map(t=>'tour:'+t.status),
   ...(s.batches.some(b=>b.item==='parcel'&&b.location==='inbound'&&b.qty>0)?['sortieren']:[]),
   ...(s.shipments.some(x=>x.paymentAt!=null&&!x.paid)||(s.tours||[]).some(t=>t.stops.some(x=>x.paymentAt!=null&&!x.paid))?['zahlung-offen']:[])];
  for(const m of marks)phases.add(m);
  if(reloadAt(i,marks,seen)){ref.sim=reload(ref.sim);reloads++;}
 }
 return {ref,reloads,phases,seen};
}

for(const seed of [1,2,3]){
 test(`QS-W1 5 Spieltage, 2 Verträge, Seed ${seed}: keine negativen Bestände, Pakete erhalten, je Lieferung genau eine Zahlung`,()=>{
  const {ref}=play(seed,{check:true}),s=ref.sim.state;
  const hub=s.orders.filter(o=>o.source==='hub');
  assert.equal(s.contracts.filter(k=>k.status!=='offer').length,2,'zwei Verträge angenommen');
  const delivered=hub.reduce((n,o)=>n+o.delivered,0),qty=hub.reduce((n,o)=>n+o.qty,0);
  assert.ok(delivered>qty*0.6,`zugestellt ${delivered} von ${qty}`);
  const revenue=s.ledger.filter(l=>/^(payment|tour-payment):/.test(l.key)).reduce((n,l)=>n+l.amount,0);
  assert.ok(Math.abs(revenue-hub.reduce((n,o)=>n+o.paid,0))<0.05);
  console.log(`# Seed ${seed}: Aufträge ${hub.length}, Pakete ${qty}, zugestellt ${delivered}, Umsatz ${revenue.toFixed(2)} €, Geld ${s.money}`);
 });
 test(`QS-W1 Laden in jeder Hof-/Liefer-/Zahlphase (je erstes Auftreten), Seed ${seed}: gleicher Endzustand wie ohne Laden`,()=>{
  const a=play(seed);
  const b=play(seed,{reloadAt:(i,marks,seen)=>{let r=false;for(const m of marks)if(!seen.has(m)){seen.add(m);r=true;}return r;}});
  for(const need of ['hof:approach','hof:gate','hof:toDock','hof:docking','hof:unloading','hof:exit','sortieren','zahlung-offen'])assert.ok(b.seen.has(need),'Phase nie erreicht: '+need);
  assert.ok([...b.seen].some(m=>/^(lief|tour):transit/.test(m)),'Fahrt nie erreicht');
  console.log(`# Seed ${seed}: ${b.reloads} Ladevorgänge in Phasen ${[...b.seen].sort().join(', ')}`);
  assert.equal(hash(b.ref.sim.serialize()),hash(a.ref.sim.serialize()));
 });
}

test('QS-W1 Laden alle 37 Minuten über 5 Spieltage (Seeds 1–3): gleicher Endzustand, Invarianten nach jedem Laden',()=>{
 for(const seed of [1,2,3]){
  const a=play(seed),b=play(seed,{reloadAt:i=>(i+1)%37===0});
  assert.ok(b.reloads>190);checkQuantities(b.ref.sim.state);checkPayments(b.ref.sim.state);
  assert.equal(hash(b.ref.sim.serialize()),hash(a.ref.sim.serialize()),'Seed '+seed);
 }
});
