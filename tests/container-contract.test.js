// Eigene Prüfungen A08, Welle 3b (W3b-S1, docs/SCHNITTSTELLEN-0.13-W3b.md): Containervertrag, Übergabe an den Hof,
// Lagergeld (demurrage:<id>:<n>) und Handling (container-handling:<id>). Container-Datensätze legt der Test direkt an
// (containers.js baut A07/A05 parallel; Felder status, qty, unloaded, demurrageMinutes laut Schnittstelle).
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {report} from '../dist/accounting.js';
import {TERMS,OFFER_INTERVAL,OFFER_PHASE,SCHEDULE_LEAD,arrivalPayload,containersUnlocked,itemOf,unitOf} from '../dist/contracts.js';

const cmd=(s,c)=>{const r=s.command(c);assert.equal(r.ok,true,r.message);return r;};
const reload=sim=>Simulation.fromJSON(sim.serialize());
const containerOffer=s=>s.state.contracts.find(k=>k.status==='offer'&&k.unit==='container');
const nextPhase=t=>{const r=((OFFER_PHASE-t)%OFFER_INTERVAL+OFFER_INTERVAL)%OFFER_INTERVAL;return r||OFFER_INTERVAL;};
const ledger=(s,prefix)=>s.state.ledger.filter(l=>l.key.startsWith(prefix));

/** Spiel mit Containerhof am Startstandort und einem Containerangebot (nächste Angebotsminute). */
function withOffer(seed){
 const sim=new Simulation(seed===undefined?{}:{seed});
 cmd(sim,{type:'build',buildingType:'containeryard',x:2,y:2});
 assert.equal(containerOffer(sim),undefined);
 sim.step(nextPhase(sim.state.t));
 const k=containerOffer(sim);assert.ok(k,'Containerangebot mit Containerhof');
 return {sim,k};
}
/** Containervertrag annehmen und bis zur ersten Ankündigung laufen lassen. */
function activeContract(seed){
 const {sim,k}=withOffer(seed);cmd(sim,{type:'acceptContract',id:k.id});
 for(let i=0;i<3000&&!sim.state.orders.some(o=>o.contractId===k.id);i++)sim.step(1);
 const orders=sim.state.orders.filter(o=>o.contractId===k.id);assert.ok(orders.length>0,'Aufträge zur Ankunft');
 return {sim,k,orders};
}
/** Container-Datensatz wie containers.js (W3b-S2), direkt angelegt (A07/A05: vollständige Felder, damit Laden validiert). */
function addContainer(sim,k,fields={}){
 const s=sim.state,c={id:sim.api.id('container'),site:k.site,contractId:k.id,orderIds:[],content:itemOf(k),qty:k.unitsPerContainer,unloaded:0,
  status:'yard',arrivedAt:s.t,freeUntil:s.t+k.freeMinutes,dock:null,teu:2,freeMinutes:k.freeMinutes,demurrageMinutes:0,priority:false,
  waitReason:null,waitSince:null,statusAt:s.t,moveEnd:null,arrivalId:null,emptyAt:null,pickupAt:null,pickupArrival:null,goneAt:null,...fields};
 c.split=[{owner:c.orderIds[0]??`contract:${k.id}`,target:c.qty,done:c.unloaded}];
 s.containers.push(c);return c;
}
/** Status wie containers.js nach vollständigem Entladen bzw. Abholung (Felder für validate). */
function finish(sim,c,status){c.unloaded=c.qty;c.split[0].done=c.qty;c.status=status;c.emptyAt??=sim.state.t;c.pickupAt??=sim.state.t;if(status==='gone')c.goneAt=sim.state.t;}

test('Containerangebote erst ab Tag 5 ohne Containerhof; Werte aus TERMS.container',()=>{
 const sim=new Simulation();let first=null;
 for(let h=0;h<8*24;h++){sim.step(60);const k=containerOffer(sim);if(k&&first===null)first=k;}
 assert.ok(first,'Containerangebot bis Tag 8');assert.ok(first.offeredAt>=(TERMS.container.fromDay-1)*1440,'nicht vor Tag 5');
 const C=TERMS.container;
 for(const k of sim.state.contracts.filter(k=>k.unit==='container')){
  assert.equal(unitOf(k),'container');assert.ok(['pallet','parcel'].includes(k.content));
  const [lo,hi]=C.content[k.content].units.map(x=>x*(k.content==='parcel'?10:1));
  assert.ok(k.unitsPerContainer>=lo&&k.unitsPerContainer<=hi);
  assert.ok(k.arrivals.length>=C.arrivals[0]&&k.arrivals.length<=C.arrivals[1]);
  for(const a of k.arrivals){assert.ok(a.containers>=1&&a.containers<=3);assert.equal(a.parcels,a.containers*k.unitsPerContainer);}
  const [pb,ps,pn]=C.content[k.content].price,[hb,hs,hn]=C.handling;
  assert.ok(k.pricePerParcel>=pb&&k.pricePerParcel<=pb+ps*pn);assert.ok(k.pricePerContainer>=hb&&k.pricePerContainer<=hb+hs*hn);
  assert.equal(k.freeMinutes,C.freeMinutes);assert.equal(k.demurragePerHour,C.demurragePerHour);
  assert.equal(k.penaltyLate,TERMS.penalty[k.content].late);assert.equal(k.penaltyOpen,TERMS.penalty[k.content].open);
 }
 // Höchstens ein offenes Containerangebot.
 assert.ok(sim.state.contracts.filter(k=>k.status==='offer'&&k.unit==='container').length<=1);
 assert.doesNotThrow(()=>validateState(sim.state));
});

test('Containerhof am Standort schaltet Angebote vor Tag 5 frei; anderer Standort nicht',()=>{
 const sim=new Simulation();assert.equal(containersUnlocked(sim.state),false);
 cmd(sim,{type:'build',buildingType:'containeryard',x:2,y:2});
 assert.equal(containersUnlocked(sim.state),true);assert.equal(containersUnlocked(sim.state,'site-anders'),false);
 const {k}=withOffer();assert.ok(k.offeredAt<1440*2);
});

test('Fälligkeit: Aufträge für den Inhalt je Gebiet, Übergabe mit kind/containers/unitsPerContainer/content',()=>{
 const {sim,k,orders}=activeContract(11),a=k.arrivals[0];
 assert.equal(orders.reduce((n,o)=>n+o.qty,0),a.parcels);
 for(const o of orders){const lane=k.lanes.find(l=>l.id===o.lane);
  assert.equal(o.item,k.content);assert.equal(o.kind,'logistics');assert.equal(o.site,k.site);assert.equal(o.price,k.pricePerParcel);
  assert.equal(o.customer,`${lane.name} (${k.shipper})`);assert.equal(o.deliverySite,undefined,'Ein-Standort: kein deliverySite');}
 const eta=sim.state.t+SCHEDULE_LEAD,p=arrivalPayload(k,a,eta,orders.map(o=>o.id),[]);
 assert.deepEqual({kind:p.kind,containers:p.containers,unitsPerContainer:p.unitsPerContainer,content:p.content,item:p.item,unit:p.unit,parcels:p.parcels},
  {kind:'container',containers:a.containers,unitsPerContainer:k.unitsPerContainer,content:k.content,item:k.content,unit:'container',parcels:a.containers*k.unitsPerContainer});
 // Hof erhält die Ankunft über yard.schedule wie bisher (Inhalt gesamt).
 const arrival=sim.state.yard.find(x=>x.contractId===k.id);assert.ok(arrival);assert.equal(arrival.parcels,a.parcels);
 // Paketvertrag: Übergabe ohne Containerfelder.
 const q=arrivalPayload({id:'c',site:'s',unit:'parcel'},{parcels:10},5);assert.ok(!('kind' in q)&&!('containers' in q));
 assert.doesNotThrow(()=>validateState(sim.state));assert.doesNotThrow(()=>validateState(reload(sim).state));
});

test('Lagergeld: je volle Stunde demurrageMinutes genau einmal, Nachholen nach Sprung, Laden ohne Doppelbuchung',()=>{
 const {sim,k}=withOffer();cmd(sim,{type:'acceptContract',id:k.id});
 const c=addContainer(sim,k),money=sim.state.money;
 sim.step(1);assert.equal(ledger(sim,'demurrage:').length,0);
 c.demurrageMinutes=59;sim.step(1);assert.equal(ledger(sim,'demurrage:').length,0);
 c.demurrageMinutes=60;sim.step(1);assert.equal(ledger(sim,`demurrage:${c.id}:`).length,1);
 sim.step(5);assert.equal(ledger(sim,'demurrage:').length,1,'keine Wiederholung');
 c.demurrageMinutes=4*60+10;sim.step(1);   // Sprung (z. B. Laden eines älteren Standes): Stunden 2–4 nachholen
 const rows=ledger(sim,`demurrage:${c.id}:`);assert.deepEqual(rows.map(r=>r.key).sort(),[1,2,3,4].map(n=>`demurrage:${c.id}:${n}`));
 assert.ok(rows.every(r=>r.amount===-k.demurragePerHour&&r.category==='Lagergeld'&&r.refs.includes(c.id)));
 const re=reload(sim);re.step(10);assert.equal(ledger(re,'demurrage:').length,4);
 // Geldbewegung nur durch Lagergeld und reguläre Stundenkosten: Summe der Lagergeld-Buchungen exakt.
 assert.equal(rows.reduce((n,r)=>n+r.amount,0),-4*k.demurragePerHour);assert.ok(sim.state.money<money);
 const rep=report(sim.state),cat=rep.categories.find(x=>x.category==='Lagergeld');
 assert.equal(cat.net,-4*k.demurragePerHour);assert.equal(rep.cashflow.other,report({...sim.state,ledger:sim.state.ledger.filter(l=>l.category!=='Lagergeld')}).cashflow.other,'Lagergeld zählt operativ');
 assert.doesNotThrow(()=>validateState(sim.state));
});

test('Lagergeld ist Pflichtbuchung (auch ohne Guthaben) und läuft je Container getrennt',()=>{
 const {sim,k}=withOffer();cmd(sim,{type:'acceptContract',id:k.id});
 sim.state.money=1;const a=addContainer(sim,k,{demurrageMinutes:120}),b=addContainer(sim,k,{demurrageMinutes:60});
 sim.step(1);assert.equal(ledger(sim,`demurrage:${a.id}:`).length,2);assert.equal(ledger(sim,`demurrage:${b.id}:`).length,1);
 assert.ok(sim.state.money<0);assert.ok(sim.state.overdraft>0);
});

test('Handling: Gutschrift genau einmal bei Status empty, nicht vorher, nicht erneut bei pickup/gone oder nach Laden',()=>{
 const {sim,k}=withOffer();cmd(sim,{type:'acceptContract',id:k.id});
 const c=addContainer(sim,k,{unloaded:Math.floor(k.unitsPerContainer/2)}),rev=sim.state.stats.revenue;
 sim.step(2);assert.equal(ledger(sim,'container-handling:').length,0);
 finish(sim,c,'empty');sim.step(1);
 const rows=ledger(sim,'container-handling:');assert.equal(rows.length,1);assert.equal(rows[0].key,`container-handling:${c.id}`);
 assert.equal(rows[0].amount,k.pricePerContainer);assert.equal(rows[0].category,'Umsatz');
 assert.equal(sim.state.stats.revenue,Math.round((rev+k.pricePerContainer)*100)/100);
 c.status='pickup';sim.step(3);finish(sim,c,'gone');sim.step(3);assert.equal(ledger(sim,'container-handling:').length,1);
 const re=reload(sim);re.step(5);assert.equal(ledger(re,'container-handling:').length,1);
 // Unvollständig entladen (Status empty, aber unloaded < qty): keine Gutschrift.
 const d=addContainer(sim,k,{status:'empty',unloaded:1});sim.step(2);assert.equal(ledger(sim,`container-handling:${d.id}`).length,0);
});

test('Vertragsende wartet, solange ein Container des Auftrags im Hof steht',()=>{
 const {sim,k,orders}=activeContract(3);const o=orders[0];
 const c=addContainer(sim,k,{orderIds:[o.id],status:'yard'});
 cmd(sim,{type:'cancelContract',id:k.id});
 // Hofankunft zählt ebenfalls; nur den Containerblock prüfen: Hofankünfte entfernen.
 sim.state.yard=sim.state.yard.filter(a=>a.contractId!==k.id);
 sim.state.containers=sim.state.containers.filter(x=>x===c); // A07/A05: echte Container der Hofankunft ebenfalls entfernt
 sim.step(TERMS.penalty.openGrace+2);
 assert.equal(o.status,'active');assert.equal(o.settleWait,'Container im Hof');
 finish(sim,c,'empty');sim.step(1);assert.notEqual(o.settleWait,'Container im Hof');
});

test('validate lehnt beschädigte Containerverträge ab',()=>{
 const {sim,k}=withOffer();
 const bad=f=>{const st=JSON.parse(sim.serialize()),kk=st.contracts.find(x=>x.id===k.id);f(kk,st);assert.throws(()=>validateState(st));};
 bad(kk=>{kk.content='kiste';});
 bad(kk=>{kk.unitsPerContainer=0;});
 bad(kk=>{kk.arrivals[0].containers=4;kk.arrivals[0].parcels=4*kk.unitsPerContainer;});
 bad(kk=>{kk.arrivals[0].parcels+=1;});
 bad(kk=>{kk.pricePerContainer=-1;});
 bad(kk=>{kk.freeMinutes=1.5;});
 bad(kk=>{kk.demurragePerHour=-2;});
 bad((kk,st)=>{const p=st.contracts.find(x=>x.unit!=='container');p.unitsPerContainer=20;});
 assert.doesNotThrow(()=>validateState(JSON.parse(sim.serialize())));
});

test('Gegenprobe: ohne Freigabe (fromDay 999, kein Containerhof) keine Containerangebote, Determinismus gleich Seed',()=>{
 const old=TERMS.container.fromDay;TERMS.container.fromDay=999;
 try{
  const run=()=>{const s=new Simulation({seed:5});s.step(9*1440);return s;};
  const a=run(),b=run();assert.ok(!a.state.contracts.some(k=>k.unit==='container'));assert.equal(a.serialize(),b.serialize());
 }finally{TERMS.container.fromDay=old;}
});
