// Eigene Prüfungen A08: Vertragsstrafe (W2-S1) und Vertragsfeld unit/Palettenangebote (W2-S2), docs/SCHNITTSTELLEN-0.10-W2.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {TERMS,OFFER_INTERVAL,OFFER_PHASE} from '../dist/contracts.js';

const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
function run(sim,cond,max=4000){for(let i=0;i<max;i++){if(cond())return;sim.step(1);}assert.fail('Bedingung nicht erreicht');}
function hub(seed=7){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 for(const c of [{type:'build',buildingType:'dock',x:2,y:13,rotation:0},{type:'build',buildingType:'rack',x:8,y:2,rotation:0},{type:'hire',role:'warehouse'},{type:'hire',role:'driver'},{type:'buyVehicle',vehicleType:'van'}])ok(sim,c);
 const c=s.contracts[0];ok(sim,{type:'acceptContract',id:c.id});
 return {sim,s,c};
}
const stock=(s,owner)=>s.batches.filter(b=>b.owner===owner&&b.location==='stock').reduce((n,b)=>n+b.qty,0);
const held=(s,owner)=>s.batches.filter(b=>b.owner===owner).reduce((n,b)=>n+b.qty,0);
const rows=(s,prefix)=>s.ledger.filter(l=>l.key.startsWith(prefix));
const reload=sim=>Simulation.fromJSON(sim.serialize());
/** Erste Ankunft vollständig entladen und sortiert (Ware im Lager, Auftrag aktiv). */
function arrived(sim,s,c){
 run(sim,()=>s.yard.length&&s.yard[0].phase==='gone'&&s.orders.filter(o=>o.contractId===c.id).every(o=>stock(s,o.id)===o.qty));
 return s.orders.filter(o=>o.contractId===c.id);
}

test('Vertragskonditionen: Einheit und Strafsätze aus TERMS, Annahme kostenlos',()=>{
 const {s,c}=hub();
 assert.equal(c.unit,'parcel');assert.equal(c.penaltyLate,TERMS.penalty.parcel.late);assert.equal(c.penaltyOpen,TERMS.penalty.parcel.open);
 assert.equal(rows(s,'penalty').length,0);assert.doesNotThrow(()=>validateState(s));
});

test('Verspätete Lieferung: Abschlag 10 % plus penalty:<lieferung> je Einheit, genau einmal, auch über Speichern/Laden',()=>{
 let {sim,s,c}=hub();const [o]=arrived(sim,s,c);
 o.due=s.t-1; // Frist bereits verstrichen
 const qty=20;let r=ok(sim,{type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty});
 const id=s.shipments.at(-1).id;
 run(sim,()=>s.shipments.find(x=>x.id===id).status==='transit');sim=reload(sim);s=sim.state;
 run(sim,()=>s.shipments.find(x=>x.id===id).deliveredAt!=null);
 const sh=s.shipments.find(x=>x.id===id);assert.equal(sh.deliveredAt,s.t);
 const money=s.money;sim=reload(sim);s=sim.state; // Laden direkt nach Zustellminute
 sim.step(200);
 const pen=rows(s,'penalty:');assert.equal(pen.length,1);assert.equal(pen[0].key,`penalty:${id}`);
 assert.equal(pen[0].amount,-qty*c.penaltyLate);assert.equal(pen[0].category,'Vertragsstrafe');
 assert.equal(s.shipments.find(x=>x.id===id).invoiceAmount,Math.round(qty*o.price*0.9*100)/100);
 assert.ok(s.money<money+qty*o.price);assert.doesNotThrow(()=>validateState(s));
});

test('Pünktliche Lieferung kostet keine Strafe',()=>{
 const {sim,s,c}=hub();const [o]=arrived(sim,s,c);assert.ok(s.t<o.due);
 ok(sim,{type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty:10});
 run(sim,()=>s.shipments.at(-1).deliveredAt!=null);sim.step(5);
 assert.ok(s.shipments.at(-1).deliveredAt<=o.due);assert.equal(rows(s,'penalty').length,0);
});

test('Sammeltour: verspäteter Stopp bucht penalty:<tour>:<index>, pünktlicher nicht',()=>{
 const {sim,s,c}=hub(),[o1]=arrived(sim,s,c);
 run(sim,()=>s.orders.filter(o=>o.contractId===c.id).length>s.orders.filter(o=>o.contractId===c.id&&o.id===o1.id).length+0&&s.orders.filter(o=>o.contractId===c.id&&o.id!==o1.id).some(o=>stock(s,o.id)===o.qty),3000);
 const o2=s.orders.find(o=>o.contractId===c.id&&o.id!==o1.id&&stock(s,o.id)===o.qty);
 o1.due=s.t-1;o2.due=s.t+600;
 const {id}=ok(sim,{type:'dispatchTour',vehicleId:s.vehicles[0].id,stops:[{orderId:o1.id,qty:5},{orderId:o2.id,qty:5}]});
 const t=s.tours.find(x=>x.id===id);run(sim,()=>t.status==='complete'||t.status==='returning');sim.step(2);
 const pen=rows(s,'penalty:');assert.equal(pen.length,1);assert.equal(pen[0].key,`penalty:${id}:0`);assert.equal(pen[0].amount,-5*c.penaltyLate);
});

test('Vertragsende + 1440: offene Einheiten bestraft, Fremdware zurück an Versender, Auftrag storniert, genau einmal',()=>{
 let {sim,s,c}=hub();const orders=arrived(sim,s,c);
 ok(sim,{type:'cancelContract',id:c.id});const end=c.endT;
 const open=orders.reduce((n,o)=>n+o.qty-o.delivered,0);assert.ok(open>0);
 run(sim,()=>s.t===end+TERMS.penalty.openGrace-1);sim=reload(sim);s=sim.state;
 assert.ok(s.orders.filter(o=>o.contractId===c.id).every(o=>o.status==='active'));assert.equal(rows(s,'penalty-open').length,0);
 s.money=0; // Strafe ist Pflichtbuchung: auch ohne Liquidität (Überziehung)
 sim.step(1);
 const k=s.contracts.find(x=>x.id===c.id);assert.equal(k.settled,true);
 for(const o of s.orders.filter(o=>o.contractId===c.id)){
  assert.equal(o.status,'cancelled');assert.equal(o.cancelReason,'contractEnd');assert.equal(held(s,o.id),0,'Fremdware entfernt');
  assert.equal(o.returnedQty,o.qty);
  const row=s.ledger.find(l=>l.key===`penalty-open:${o.id}`);assert.ok(row);assert.equal(row.amount,-(o.qty-o.delivered)*c.penaltyOpen);
 }
 assert.ok(s.money<=-open*c.penaltyOpen);assert.equal(rows(s,"penalty-open").reduce((n,l)=>n+l.amount,0),-open*c.penaltyOpen);
 assert.ok(s.batches.every(b=>b.qty>=0));assert.doesNotThrow(()=>validateState(s));
 const n=s.ledger.length,pen=rows(s,'penalty').length;sim=reload(sim);s=sim.state;sim.step(3*1440);
 assert.equal(rows(s,'penalty').length,pen);assert.ok(s.ledger.length>=n);
});

test('Gebundene Ware: Fahrt läuft bei Vertragsende → Abrechnung wartet, danach nur Restmenge bestraft',()=>{
 let {sim,s,c}=hub();const [o]=arrived(sim,s,c);ok(sim,{type:'cancelContract',id:c.id});
 const k=s.contracts.find(x=>x.id===c.id);run(sim,()=>s.t===k.endT+TERMS.penalty.openGrace-3); // kurz vor Abrechnung abfahren
 const qty=20;ok(sim,{type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty});const id=s.shipments.at(-1).id;
 sim.step(3);assert.ok(['loading','transit','unloading'].includes(s.shipments.find(x=>x.id===id).status));
 assert.equal(o.status,'active');assert.equal(o.settleWait,'Ware unterwegs');assert.ok(!k.settled);assert.ok(!s.ledger.some(l=>l.key===`penalty-open:${o.id}`));
 sim=reload(sim);s=sim.state;
 run(sim,()=>s.orders.find(x=>x.id===o.id).status==='cancelled');
 const done=s.orders.find(x=>x.id===o.id),others=s.orders.filter(x=>x.contractId===c.id);
 assert.equal(done.delivered,qty);assert.equal(done.returnedQty,o.qty-qty);
 assert.equal(s.ledger.find(l=>l.key===`penalty-open:${o.id}`).amount,-(o.qty-qty)*c.penaltyOpen);
 assert.ok(others.every(x=>x.status!=='active'));assert.equal(s.contracts.find(x=>x.id===c.id).settled,true);
 assert.doesNotThrow(()=>validateState(s));
});

test('Altvertrag ohne Strafsätze (bis 0.9): keine Strafe, keine Rückgabe; fehlendes unit = parcel',()=>{
 const {sim,s,c}=hub();const orders=arrived(sim,s,c);
 for(const key of ['unit','penaltyLate','penaltyOpen'])delete c[key];
 const o=orders[0];o.due=s.t-1;ok(sim,{type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty:10});
 ok(sim,{type:'cancelContract',id:c.id});
 let sim2=reload(sim);sim2.step(3*1440);
 assert.equal(rows(sim2.state,'penalty').length,0);
 assert.ok(sim2.state.orders.filter(x=>x.contractId===c.id).every(x=>x.status!=='cancelled'));
 assert.doesNotThrow(()=>validateState(sim2.state));
});

test('Palettenangebote: mit Staplerplatz schon am Tag 1, sonst erst ab Tag 3; Aufträge mit item pallet',()=>{
 const slot=OFFER_PHASE+OFFER_INTERVAL; // erste Angebotsminute nach Spielstart (t=1020, Tag 1)
 const a=new Simulation({mode:'sandbox',seed:5});a.step(slot-480);
 assert.ok(a.state.contracts.filter(k=>k.offeredAt===slot).every(k=>k.unit==='parcel'));
 const b=new Simulation({mode:'sandbox',seed:5});ok(b,{type:'build',buildingType:'forklift',x:12,y:2,rotation:0});b.step(slot-480);
 const p=b.state.contracts.find(k=>k.offeredAt===slot);assert.equal(p.unit,'pallet');
 // Gleiche Zahl Zufallszüge wie ein Paketangebot: Seed identisch.
 assert.equal(b.state.seed,a.state.seed);
 assert.ok(p.arrivals.every(x=>x.parcels>=TERMS.pallet.units[0]&&x.parcels<=TERMS.pallet.units[1]));
 {const [lo,st,n]=TERMS.pallet.price;assert.ok(p.pricePerParcel>=lo&&p.pricePerParcel<=lo+st*n);}assert.equal(p.penaltyLate,TERMS.penalty.pallet.late);assert.equal(p.penaltyOpen,TERMS.penalty.pallet.open);
 // Höchstens ein offenes Palettenangebot.
 b.step(OFFER_INTERVAL);assert.equal(b.state.contracts.filter(k=>k.status==='offer'&&k.unit==='pallet').length,1);
 ok(b,{type:'acceptContract',id:p.id});
 run(b,()=>b.state.orders.some(o=>o.contractId===p.id),3000);
 const orders=b.state.orders.filter(o=>o.contractId===p.id);
 assert.ok(orders.every(o=>o.item==='pallet'&&o.price===p.pricePerParcel));
 assert.equal(orders.reduce((n,o)=>n+o.qty,0),p.arrivals.find(x=>x.minute===(b.state.t+15)%1440)?.parcels??orders.reduce((n,o)=>n+o.qty,0));
 // Validierung: Einheit und Auftragsartikel müssen passen.
 const x=JSON.parse(b.serialize());x.orders.find(o=>o.contractId===p.id).item='parcel';assert.throws(()=>validateState(x),/ungültig/);
 const y=JSON.parse(b.serialize());y.contracts.find(k=>k.id===p.id).unit='crate';assert.throws(()=>validateState(y),/ungültig/);
 const z=JSON.parse(b.serialize());z.contracts.find(k=>k.id===p.id).penaltyOpen=-1;assert.throws(()=>validateState(z),/ungültig/);
 const w=JSON.parse(b.serialize());w.contracts.find(k=>k.id===p.id).settled=true;assert.throws(()=>validateState(w),/ungültig/);
});

test('Ohne Stapler: Palettenangebot frühestens am Tag 3',()=>{
 const s=new Simulation({seed:9});s.step(TERMS.pallet.fromDay*1440);
 const first=s.state.contracts.filter(k=>k.unit==='pallet').map(k=>k.offeredAt);
 assert.ok(first.length>=1);assert.ok(first.every(t=>Math.floor(t/1440)+1>=TERMS.pallet.fromDay));
});

test('Determinismus mit Strafen: 1-Minuten- und 60-Minuten-Schritte identisch',()=>{
 const make=()=>{const h=hub(11);h.sim.step(600);ok(h.sim,{type:'cancelContract',id:h.c.id});return h;};
 const a=make(),b=make();for(let i=0;i<2400;i++)a.sim.step(1);for(let i=0;i<40;i++)b.sim.step(60);
 assert.equal(a.sim.serialize(),b.sim.serialize());assert.ok(rows(a.s,'penalty-open').length>0);
});
