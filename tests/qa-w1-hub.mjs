// A11 · QS Welle 1 (0.9): gemeinsame Hilfen für qa-w1-*.test.js. Nur reguläre Spielerbefehle; Szenario-Aufbau darf
// Angebots-Ankunftsminuten VOR der Annahme setzen (Testdaten, dokumentiert in docs/QS-0.9-W1.md).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation} from '../dist/core.js';
import {VEHICLES,ITEMS} from '../dist/catalog.js';

export const hash=t=>createHash('sha256').update(t).digest('hex');
export const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
export const reload=sim=>Simulation.fromJSON(sim.serialize());

/** Depot: Dock(s), Regal, Lagerkräfte, Fahrer, Lieferwagen. Startvertrag optional mit fester Ankunftsminute. */
export function depot({seed=7,mode='sandbox',docks=1,warehouse=1,drivers=1,vans=1,minute=null,accept=true}={}){
 const sim=new Simulation({mode,seed}),s=sim.state;
 const spots=[[2,13],[6,13],[10,13]];
 for(let i=0;i<docks;i++)cmd(sim,{type:'build',buildingType:'dock',x:spots[i][0],y:spots[i][1],rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:8,y:2,rotation:0});
 for(let i=0;i<warehouse;i++)cmd(sim,{type:'hire',role:'warehouse'});
 for(let i=0;i<drivers;i++)cmd(sim,{type:'hire',role:'driver'});
 for(let i=0;i<vans;i++)cmd(sim,{type:'buyVehicle',vehicleType:'van'});
 const c=s.contracts[0];
 if(minute!=null)c.arrivals[0].minute=minute;
 if(accept)cmd(sim,{type:'acceptContract',id:c.id});
 return {sim,s:sim.state,c};
}
export function until(ref,cond,max=4000){for(let i=0;i<max;i++){if(cond(ref.sim.state))return true;ref.sim.step(1);}assert.fail('Bedingung nicht erreicht (t='+ref.sim.state.t+')');}

export const parcels=(s,pred=()=>true)=>s.batches.filter(b=>b.item==='parcel'&&pred(b)).reduce((n,b)=>n+b.qty,0);
/** Mengeninvariante je Hub-Auftrag: qty = noch nicht entladen + Chargen (inbound/stock/vehicle) + zugestellt. */
export function checkQuantities(s,tag=''){
 for(const b of s.batches){assert.ok(b.qty>=0,`${tag} negative Menge ${b.id}`);assert.ok(b.reserved>=-1e-9&&b.reserved<=b.qty+1e-9,`${tag} Reservierung ${b.id}`);}
 const pending=new Map();for(const a of s.yard)for(const p of a.split)pending.set(p.owner,(pending.get(p.owner)||0)+p.target-p.done);
 for(const o of s.orders.filter(o=>o.source==='hub')){
  const held=parcels(s,b=>b.owner===o.id);
  assert.equal((pending.get(o.id)||0)+held+o.delivered,o.qty,`${tag} Pakete Auftrag ${o.id}: offen ${pending.get(o.id)||0} + Bestand ${held} + zugestellt ${o.delivered} ≠ ${o.qty}`);
  assert.ok(o.delivered<=o.qty,`${tag} überliefert ${o.id}`);
 }
 // Parcels nur als Auftragseigentum (keine Firmen-/Waisenpakete)
 const ids=new Set(s.orders.map(o=>o.id));
 for(const b of s.batches.filter(b=>b.item==='parcel'&&b.qty>0))assert.ok(ids.has(b.owner),`${tag} Paket ohne Auftrag ${b.owner}`);
}
/** Zahlungen: je Lieferung/Tourstopp höchstens eine Zahlungsbuchung, Betrag = Rechnung, o.paid = Summe, Abschlag korrekt. */
export function checkPayments(s,tag=''){
 const pay=new Map();for(const l of s.ledger)if(/^(payment|tour-payment):/.test(l.key)){assert.ok(!pay.has(l.key),`${tag} doppelte Buchung ${l.key}`);pay.set(l.key,l.amount);}
 const paidBy=new Map();
 for(const sh of s.shipments){const o=s.orders.find(o=>o.id===sh.orderId);if(o?.source!=='hub')continue;const k=`payment:${sh.id}`;
  if(sh.deliveredAt!=null){const exp=Math.round(sh.qty*o.price*(sh.deliveredAt>o.due?0.9:1)*100)/100;assert.equal(sh.invoiceAmount,exp,`${tag} Rechnung ${sh.id}`);}
  assert.equal(pay.has(k),!!sh.paid,`${tag} Zahlstatus ${sh.id}`);if(sh.paid){assert.equal(pay.get(k),sh.invoiceAmount);paidBy.set(o.id,(paidBy.get(o.id)||0)+sh.invoiceAmount);}}
 for(const t of s.tours||[])t.stops.forEach((st,i)=>{const o=s.orders.find(o=>o.id===st.orderId);if(o?.source!=='hub')return;const k=`tour-payment:${t.id}:${i}`;
  if(st.status==='delivered'){const exp=Math.round(st.qty*o.price*(st.deliveredAt>o.due?0.9:1)*100)/100;assert.equal(st.invoiceAmount,exp,`${tag} Rechnung Stopp ${k}`);}
  assert.equal(pay.has(k),!!st.paid,`${tag} Zahlstatus ${k}`);if(st.paid){assert.equal(pay.get(k),st.invoiceAmount);paidBy.set(o.id,(paidBy.get(o.id)||0)+st.invoiceAmount);}});
 for(const o of s.orders.filter(o=>o.source==='hub')){assert.ok(Math.abs((paidBy.get(o.id)||0)-o.paid)<0.011,`${tag} o.paid ${o.id} ${o.paid} vs ${paidBy.get(o.id)||0}`);assert.ok(o.paid<=o.qty*o.price+0.01,`${tag} Überzahlung ${o.id}`);}
}

// Spielerpolitik: nimmt Folgeangebote bis maxContracts an; disponiert fertig sortierte Aufträge (Tour 2–4 bzw. Einzel).
const ready=(s,o)=>s.batches.filter(b=>b.item==='parcel'&&b.location==='stock'&&b.owner===o.id).reduce((n,b)=>n+b.qty-b.reserved,0);
const committed=(s,o)=>s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0)
 +(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
export function policy(sim,{maxContracts=2}={}){
 const s=sim.state;
 if(s.contracts.filter(k=>k.status==='active').length<maxContracts){const k=s.contracts.find(k=>k.status==='offer');if(k)sim.command({type:'acceptContract',id:k.id});}
 const m=s.t%1440;if(m<480||m>=930)return;
 const v=s.vehicles.find(v=>v.status==='idle'&&v.condition>=15);if(!v)return;
 if(v.condition<40){sim.command({type:'serviceVehicleExternal',id:v.id});return;}
 const max=Math.floor((VEHICLES[v.type].weightCapacity||v.capacity*4)/ITEMS.parcel.weight);
 const cand=s.orders.filter(o=>o.source==='hub'&&o.status==='active').map(o=>({o,rest:o.qty-o.delivered-committed(s,o)})).filter(x=>x.rest>0&&ready(s,x.o)>=x.rest).sort((a,b)=>a.o.due-b.o.due);
 const stops=[];let load=0;for(const x of cand){if(stops.length===4)break;const q=Math.min(x.rest,max-load,Math.floor(v.capacity/ITEMS.parcel.volume)-load);if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
 if(!stops.length)return;
 const r=stops.length>1?sim.command({type:'dispatchTour',vehicleId:v.id,stops}):sim.command({type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty});
 return r;
}
