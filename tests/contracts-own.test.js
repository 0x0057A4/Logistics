// Eigene Prüfungen A08: Frachtverträge (W1-S1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import {splitParcels,SCHEDULE_LEAD,MAX_OFFERS,TERMS} from '../dist/contracts.js';
const cmd=(s,c)=>{const r=s.command(c);assert.equal(r.ok,true,r.message);return r;};
const hubOrders=(s,id)=>s.state.orders.filter(o=>o.contractId===id);
const offer=s=>s.state.contracts.find(k=>k.status==='offer');
const clone=x=>JSON.parse(JSON.stringify(x));

test('Neues Spiel bietet genau einen kleinen gültigen Vertrag an',()=>{
 const s=new Simulation(),k=s.state.contracts;
 assert.equal(k.length,1);assert.equal(k[0].status,'offer');
 // Spannen aus TERMS (Balancing A02 W1b, docs/BALANCING-0.9-W1.md): Startvertrag 100–130 Pakete, 1 Ankunft am Vormittag.
 assert.equal(k[0].arrivals.length,1);assert.ok(k[0].arrivals[0].parcels>=TERMS.start.parcels[0]*10&&k[0].arrivals[0].parcels<=TERMS.start.parcels[1]*10);
 assert.ok(TERMS.start.minutes.includes(k[0].arrivals[0].minute));assert.equal(k[0].pricePerParcel,TERMS.start.price);
 assert.ok(k[0].lanes.length>=1&&k[0].lanes.length<=2);
 assert.equal(k[0].laneShare.reduce((a,b)=>a+b,0),1);assert.ok(k[0].pricePerParcel>0&&k[0].slaMinutes>0);
 assert.equal(hubOrders(s,k[0].id).length,0);assert.doesNotThrow(()=>validateState(s.state));
});

test('Annahme ist kostenlos und nur einmal möglich',()=>{
 const s=new Simulation(),k=offer(s),money=s.state.money,ledger=s.state.ledger.length;
 cmd(s,{type:'acceptContract',id:k.id});
 assert.equal(k.status,'active');assert.equal(k.acceptedAt,480);assert.ok(k.startT>k.acceptedAt&&k.endT>k.startT);
 assert.equal(s.state.money,money);assert.equal(s.state.ledger.length,ledger);
 assert.equal(s.command({type:'acceptContract',id:k.id}).ok,false);
 assert.equal(s.command({type:'acceptContract',id:'contract-999'}).ok,false);
});

test('Fälligkeit legt je Gebiet Aufträge an, Mengen exakt, auch über den Tageswechsel',()=>{
 const s=new Simulation(),k=offer(s),a=k.arrivals[0];cmd(s,{type:'acceptContract',id:k.id});
 const first=a.minute;            // Starttag: Ankunft liegt nach startT (480+60)
 s.step(first-SCHEDULE_LEAD-480-1);assert.equal(hubOrders(s,k.id).length,0);
 s.step(1);let orders=hubOrders(s,k.id);assert.equal(s.state.t,first-SCHEDULE_LEAD);
 assert.ok(orders.length>=1&&orders.length<=k.lanes.length);
 assert.equal(orders.reduce((n,o)=>n+o.qty,0),a.parcels);assert.ok(orders.every(o=>Number.isInteger(o.qty)&&o.qty>0));
 for(const o of orders){
  const lane=k.lanes.find(l=>l.id===o.lane);
  assert.deepEqual({kind:o.kind,source:o.source,item:o.item,price:o.price,due:o.due,quality:o.quality,site:o.site,status:o.status,delivered:o.delivered,paid:o.paid,customer:o.customer},
   {kind:'logistics',source:'hub',item:'parcel',price:k.pricePerParcel,due:first+k.slaMinutes,quality:0,site:k.site,status:'active',delivered:0,paid:0,customer:`${lane.name} (${k.shipper})`});
 }
 if(typeof yard.schedule!=='function')assert.ok(s.state.events.some(e=>e.kind==='warning'&&e.refs.includes(k.id)));
 // Nächster Tag: genau eine weitere Ankunft, keine doppelte am selben Tag.
 s.step(1440-1);assert.equal(hubOrders(s,k.id).length,orders.length);
 s.step(1);orders=hubOrders(s,k.id);assert.equal(orders.reduce((n,o)=>n+o.qty,0),2*a.parcels);
 assert.ok(orders.filter(o=>o.due===1440+first+k.slaMinutes).length>=1);
 assert.equal(k.issued,2);assert.doesNotThrow(()=>validateState(s.state));
});

test('Annahme nach der Ankunftsminute beginnt am Folgetag',()=>{
 const s=new Simulation(),k=offer(s);s.step(k.arrivals[0].minute-480);cmd(s,{type:'acceptContract',id:k.id});
 s.step(1440-SCHEDULE_LEAD-1);assert.equal(hubOrders(s,k.id).length,0);s.step(1);assert.ok(hubOrders(s,k.id).length>0);
 assert.ok(hubOrders(s,k.id).every(o=>o.due===1440+k.arrivals[0].minute+k.slaMinutes));
});

test('Aufteilung ist ganzzahlig und ergibt exakt die Paketzahl',()=>{
 for(const shares of [[1],[.55,.45],[.25,.25,.5],[.35,.3,.35],[1/3,1/3,1/3]])for(let n=1;n<=400;n++){
  const q=splitParcels(n,shares);assert.equal(q.reduce((a,b)=>a+b,0),n);assert.ok(q.every(x=>Number.isInteger(x)&&x>=0));
  q.forEach((x,i)=>assert.ok(Math.abs(x-shares[i]*n)<1));
 }
});

test('Storno: keine neuen Ankünfte, laufende Aufträge bleiben; Angebot ablehnen entfernt es',()=>{
 const s=new Simulation(),k=offer(s);cmd(s,{type:'acceptContract',id:k.id});s.step(k.arrivals[0].minute-SCHEDULE_LEAD-480);
 const before=hubOrders(s,k.id).map(o=>o.id);assert.ok(before.length>0);
 cmd(s,{type:'cancelContract',id:k.id});assert.equal(k.status,'ended');assert.equal(k.endReason,'cancelled');
 assert.equal(s.command({type:'cancelContract',id:k.id}).ok,false);
 s.step(3*1440);assert.deepEqual(hubOrders(s,k.id).map(o=>o.id),before);
 assert.ok(hubOrders(s,k.id).every(o=>o.status==='active'));assert.doesNotThrow(()=>validateState(s.state));
 const o=offer(s);if(o){cmd(s,{type:'cancelContract',id:o.id});assert.ok(!s.state.contracts.includes(o));}
});

test('Vertrag endet planmäßig nach Laufzeit',()=>{
 const s=new Simulation(),k=offer(s);cmd(s,{type:'acceptContract',id:k.id});s.step(k.durationDays*1440+120);
 assert.equal(k.status,'ended');assert.equal(k.endReason,'expired');assert.equal(k.issued,k.durationDays);
 assert.equal(hubOrders(s,k.id).reduce((n,o)=>n+o.qty,0),k.durationDays*k.arrivals[0].parcels);
});

test('Neue Angebote periodisch, höchstens drei offen, abgelaufene entfallen',()=>{
 const s=new Simulation();let max=0,seen=new Set();
 for(let d=0;d<10*24;d++){s.step(60);const open=s.state.contracts.filter(k=>k.status==='offer');max=Math.max(max,open.length);open.forEach(k=>{seen.add(k.id);assert.ok(s.state.t<k.expiresAt);});}
 assert.ok(max<=MAX_OFFERS);assert.ok(seen.size>3);assert.doesNotThrow(()=>validateState(s.state));
 for(const k of s.state.contracts)assert.ok(k.lanes.length<=3&&k.arrivals.length<=2&&k.arrivals.every(a=>a.parcels>=TERMS.offer.parcels[0]*10&&a.parcels<=TERMS.offer.parcels[1]*10&&a.minute>=480&&a.minute<=720));
});

test('Determinismus: gleicher Seed ergibt gleiche Angebote und Aufträge',()=>{
 const run=seed=>{const s=new Simulation({seed});cmd(s,{type:'acceptContract',id:offer(s).id});s.step(3*1440);return JSON.stringify([s.state.contracts,hubOrders(s,s.state.contracts[0].id)]);};
 assert.equal(run(7),run(7));assert.notEqual(run(7),run(8));
});

test('Speichern und Laden mitten im Vertrag erhält Ablauf bitgleich',()=>{
 const a=new Simulation({seed:42}),k=offer(a);cmd(a,{type:'acceptContract',id:k.id});a.step(k.arrivals[0].minute-480+30);
 let b=Simulation.fromJSON(a.serialize());assert.equal(b.state.contracts[0].status,'active');
 a.step(2*1440);b.step(1440);b=Simulation.fromJSON(b.serialize());b.step(1440);
 assert.equal(b.serialize(),a.serialize());assert.equal(hubOrders(b,k.id).reduce((n,o)=>n+o.qty,0),3*k.arrivals[0].parcels);
});

test('Validierung lehnt beschädigte Verträge und Referenzen ab',()=>{
 const s=new Simulation(),k=offer(s);cmd(s,{type:'acceptContract',id:k.id});s.step(k.arrivals[0].minute-480);
 const base=s.state,orderIndex=base.orders.findIndex(o=>o.contractId===k.id);assert.ok(orderIndex>=0);
 const broken=[
  x=>{x.orders[orderIndex].contractId='contract-9999';},
  x=>{x.contracts=[];},
  x=>{x.contracts[0].status='paused';},
  x=>{x.contracts[0].laneShare=x.contracts[0].laneShare.map(v=>v*0.9);},
  x=>{x.contracts[0].arrivals[0].minute=1440;},
  x=>{x.contracts[0].arrivals[0].parcels=12.5;},
  x=>{x.contracts[0].lanes=[];x.contracts[0].laneShare=[];},
  x=>{x.contracts[0].site='site-99';},
  x=>{x.contracts[0].acceptedAt=null;},
  x=>{x.orders[orderIndex].lane='lane-9';},
  x=>{x.orders[orderIndex].qty=2.5;},
  x=>{for(let i=0;i<4;i++)x.contracts.push({...clone(x.contracts[0]),id:`contract-${x.seq++}`,status:'offer',acceptedAt:null,startT:null,endT:null,expiresAt:x.t+60});},
 ];
 for(const [i,f] of broken.entries()){const x=clone(base);f(x);assert.throws(()=>validateState(x),/ungültig/,`Fall ${i}`);}
 assert.doesNotThrow(()=>Simulation.fromJSON(JSON.stringify(base)));
});
