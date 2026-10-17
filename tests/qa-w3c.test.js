// A11 · unabhängige QS Release 0.14 (Welle 3c: Luftexport, Dispositionsassistent). Eigene Szenarien, nur reguläre Befehle.
// Grundlage docs/SCHNITTSTELLEN-0.14-W3c.md (Abnahme) und AGENTS.md (Pflicht-Übergänge). Bericht docs/QS-0.14.md.
// Browserteil (Replay, Fenster X/J): tests/browser/qa-w3c.mjs (nicht Teil von npm test).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import * as AX from '../dist/airexport.js';
import {VEHICLES} from '../dist/catalog.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const reload=sim=>Simulation.fromJSON(sim.serialize());
const cents=n=>Math.round(n*100)/100;
const keys=(s,p)=>s.ledger.filter(l=>l.key.startsWith(p));
const ACTIVE=new Set(['loading','transit','unloading','returning','handover','collecting']);

/** Zwei Standorte (A Hub, B Nord), Personal rund um die Uhr, 2 Lkw + Lieferwagen an A. Läuft bis Tag 2 09:00 (alle
 *  Angebotsarten im Strom). accept: welche Angebote angenommen werden ('parcel','remote','air'). */
function world({seed=7,accept=['parcel','remote','air'],line=true}={}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 const SB=cmd(sim,{type:'buySite',name:'Nordlager Testfeld'}).id;
 for(const [t,x,y] of [['dock',2,10],['dock',6,10],['rack',2,2],['rack',5,2],['rack',8,2]])cmd(sim,{type:'build',buildingType:t,x,y,rotation:0});
 for(const [t,x,y] of [['dock',2,10],['rack',2,2]])cmd(sim,{type:'build',buildingType:t,site:SB,x,y,rotation:0});
 for(let i=0;i<3;i++){cmd(sim,{type:'hire',role:'warehouse'});cmd(sim,{type:'hire',role:'driver'});}
 cmd(sim,{type:'hire',role:'driver',site:SB});cmd(sim,{type:'hire',role:'warehouse',site:SB});
 for(const w of s.workers)cmd(sim,{type:'setShift',id:w.id,shift:'all'});
 const fleet=['truck','truck','van'].map(t=>cmd(sim,{type:'buyVehicle',vehicleType:t}).id);cmd(sim,{type:'buyVehicle',vehicleType:'van',site:SB});
 sim.step(1980-s.t);
 const pick={parcel:s.contracts.find(k=>k.status==='offer'&&k.unit==='parcel'&&k.lanes.every(l=>!l.site)),
  remote:s.contracts.find(k=>k.status==='offer'&&k.unit==='parcel'&&k.lanes.some(l=>l.site===SB)),
  air:s.contracts.find(k=>k.status==='offer'&&k.unit==='air')};
 for(const a of accept){assert.ok(pick[a],`Angebot ${a} fehlt (Seed ${seed})`);cmd(sim,{type:'acceptContract',id:pick[a].id});}
 if(line)cmd(sim,{type:'createLine',from:'site-1',to:SB,departures:[720,1080],vehicleId:null});
 return {sim,s,SB,fleet,k:pick};
}
/** Spielerdisposition Luft: frei verfügbares Fahrzeug startet Zubringer, sobald Annahmeschluss in ≤ 150 Min. und Ware sortiert. */
function playerAir(sim){
 const s=sim.state;for(const f of AX.upcomingFlights(s,'site-1')){
  if(f.cutoffAt-s.t>150)continue;
  for(const v of s.vehicles.filter(v=>v.site==='site-1'&&v.status==='idle'&&AX.AIR.vehicles.includes(v.type)&&!(s.lines||[]).some(l=>l.vehicleId===v.id))){
   const r=sim.command({type:'dispatchAirShuttle',vehicleId:v.id,departAt:f.flight});if(!r.ok)break;
  }
 }
}
/** Invarianten alle 5 Minuten. seen: Rechnungsbeträge je Zubringer (bleibt über Aufräumen erhalten). */
function check(s,seen,label){
 for(const b of s.batches)assert.ok(b.qty>=-1e-9&&(b.reserved||0)<=b.qty+1e-7,`${label}: Charge ${b.id} negativ/überreserviert`);
 for(const sh of s.airShuttles)if(sh.deliveredAt!=null)seen.set(sh.id,sh.invoiceAmount);
 const pay=keys(s,'air:');assert.equal(pay.length,seen.size,`${label}: Zahlungen je Zubringer`);
 for(const l of pay)assert.equal(l.amount,seen.get(l.key.slice(4)),`${label}: Betrag ${l.key}`);
 for(const o of s.orders.filter(AX.isAirOrder)){
  assert.ok(o.delivered<=o.qty,`${label}: ${o.id} überliefert`);
  if(o.status!=='cancelled')assert.ok(Math.abs(o.paid-cents(o.delivered*o.price))<0.011,`${label}: ${o.id} bezahlt ${o.paid} statt ${cents(o.delivered*o.price)}`);
  assert.equal(o.missedFlights||0,keys(s,`air-missed:${o.id}:`).length,`${label}: Strafzähler ${o.id}`);
  const owned=s.batches.filter(b=>b.owner===o.id).reduce((n,b)=>n+b.qty,0);assert.ok(owned+o.delivered<=o.qty+1e-7,`${label}: Mengen ${o.id}`);
 }
 const use=new Map();
 for(const list of [s.shipments,s.tours,s.airShuttles,s.linehauls])for(const x of list||[])if(ACTIVE.has(x.status)&&x.vehicleId){assert.ok(!use.has(x.vehicleId),`${label}: Fahrzeug ${x.vehicleId} doppelt (${use.get(x.vehicleId)} + ${x.id})`);use.set(x.vehicleId,x.id);}
 validateState(s);
}

test('Luftexport Ende-zu-Ende, echtes Angebot (Seeds 7, 11): Annahme → Sortierung → Zubringer → Zahlung genau einmal; Laden in jeder Phase', ()=>{
 for(const seed of [7,11]){
  const env=world({seed,accept:['air'],line:false}),{sim,s,k}=env,K=k.air,seen=new Map();
  const END=s.t+3*1440,phases=new Map(),departed=new Set();
  for(;s.t<END;){playerAir(sim);sim.step(1);for(const sh of s.airShuttles){if(sh.departedAt!=null)departed.add(sh.id);if(sh.status!=='complete'&&sh.status!=='cancelled'&&!phases.has(sh.status))phases.set(sh.status,sim.serialize());}if(s.t%5===0)check(s,seen,`Seed ${seed} t=${s.t}`);}
  const orders=s.orders.filter(o=>o.contractId===K.id),delivered=orders.reduce((n,o)=>n+o.delivered,0),paid=cents(keys(s,'air:').reduce((n,l)=>n+l.amount,0));
  assert.ok(delivered>0&&seen.size>=2,`Seed ${seed}: ${delivered} Pakete, ${seen.size} Übergaben`);
  assert.equal(paid,cents(orders.reduce((n,o)=>n+o.paid,0)),'Summe Zahlungen = Summe Auftragszahlungen');
  assert.equal(keys(s,'air-trip:').length,departed.size,'Fahrtkosten genau einmal je Abfahrt');
  assert.equal(keys(s,'air-missed:').length,0,`Seed ${seed}: Spieler fährt rechtzeitig, keine Strafe`);
  const want=hash(sim);
  for(const ph of ['loading','transit','handover','returning']){assert.ok(phases.has(ph),ph);const x=Simulation.fromJSON(phases.get(ph));while(x.state.t<END){playerAir(x);x.step(1);}assert.equal(hash(x),want,`Seed ${seed} Laden in ${ph}`);}
  console.log(`# QS-W3c E2E Seed ${seed}: Flüge ${K.flights} · ${orders.length} Aufträge · ${delivered} Pakete übergeben · ${seen.size} Übergaben · ${paid} € · Fahrtkosten ${cents(keys(s,'air-trip:').reduce((n,l)=>n+l.amount,0))} €`);
 }
});

test('Verpasster Flug (echtes Angebot, kein Zubringer): Strafe genau einmal je Auftrag/Flug, Umbuchung, Laden ändert nichts; Vertragsende-Abrechnung dokumentiert', ()=>{
 const env=world({seed:7,accept:['air'],line:false}),{sim,s,k}=env,K=k.air,seen=new Map();
 let mid=null;const end=s.t+(K.durationDays+3)*1440;
 for(;s.t<end;){sim.step(5);check(s,seen,`t=${s.t}`);if(!mid&&keys(s,'air-missed:').length)mid=reload(sim);}
 assert.ok(mid,'Strafe fiel an');
 const orders=s.orders.filter(o=>o.contractId===K.id);
 for(const o of orders){
  const miss=keys(s,`air-missed:${o.id}:`);const flights=miss.map(l=>Number(l.key.split(':')[2]));
  assert.equal(new Set(flights).size,flights.length,'je Flug höchstens einmal');
  for(const f of flights)assert.ok(K.flights.includes(f%1440),'nur Flugplanzeiten');
  for(const l of miss)assert.ok(Math.abs(l.amount)<=o.qty*K.penaltyMissed+1e-9);
 }
 const m2=Simulation.fromJSON(mid.serialize());m2.step(end-m2.state.t);assert.equal(hash(m2),hash(sim),'Laden nach erster Strafe');
 const missed=keys(s,'air-missed:'),open=keys(s,'penalty-open:'),both=orders.filter(o=>keys(s,`penalty-open:${o.id}`).length&&keys(s,`air-missed:${o.id}:`).length);
 console.log(`# QS-W3c verpasst: ${orders.length} Aufträge · ${missed.length} Flugstrafen ${cents(missed.reduce((n,l)=>n+l.amount,0))} € · ${open.length} Vertragsende-Strafen ${cents(open.reduce((n,l)=>n+l.amount,0))} € · beides: ${both.length}`);
 globalThis.__qaBoth={orders:orders.length,both:both.length,missed:missed.length,open:open.length};
});

test.todo('QS-W3c-01 Vertragsende: Luftauftrag mit Flugstrafen erhält zusätzlich penaltyOpen für dieselben offenen Pakete (Doppelstrafe)',()=>{
 const env=world({seed:7,accept:['air'],line:false}),{sim,s,k}=env;sim.step((k.air.durationDays+3)*1440);
 for(const o of s.orders.filter(o=>o.contractId===k.air.id))assert.ok(!(keys(s,`penalty-open:${o.id}`).length&&keys(s,`air-missed:${o.id}:`).length),o.id);
});

/** Ein-Standort-Fixture für Pflichtfälle: Luftvertrag angenommen, Aufträge mit sortierter Ware direkt im Lager. */
function airFixture(seed=19){
 const env=world({seed,accept:['air'],line:false}),{sim,s,k}=env;
 const f=AX.upcomingFlights(s,'site-1',s.t+200)[0];
 const order=(qty)=>{const id=sim.api.id('order');s.orders.push({id,kind:'logistics',source:'hub',contractId:k.air.id,lane:'lane-1',customer:`Luftfracht QS ${id}`,item:'parcel',qty,price:k.air.pricePerParcel,due:f.cutoffAt,quality:0,site:'site-1',status:'active',delivered:0,paid:0,airExport:true,flightT:f.flight});
  assert.ok(sim.api.inventory.add({item:'parcel',qty,site:'site-1',owner:id,location:'stock',quality:100,unitCost:0}));return id;};
 return {...env,f,order};
}

test('Pflicht: Fahrer beendet Schicht unterwegs → Zubringer wartet ohne Fortschritt, Strafe genau einmal, Zahlung genau einmal, Laden gleich', ()=>{
 const env=airFixture(),{sim,s,f,order}=env;const a=order(40);
 const driver=s.workers.find(w=>w.role==='driver'&&w.site==='site-1');
 // Einziger Fahrer an A mit Tagschicht (08–16); Abfahrt so, dass die Fahrt über 16:00 läuft.
 for(const w of s.workers.filter(w=>w.role==='driver'&&w.site==='site-1'&&w!==driver))cmd(sim,{type:'fire',id:w.id});
 cmd(sim,{type:'setShift',id:driver.id,shift:'day'});
 const v=s.vehicles.find(v=>v.type==='truck'&&v.status==='idle');
 const goal=Math.ceil(s.t/1440)*1440+16*60-20; // 15:40
 sim.step(Math.max(0,goal-5-s.t));
 const nf=AX.upcomingFlights(s,"site-1")[0];s.orders.find(o=>o.id===a).flightT=nf.flight;s.orders.find(o=>o.id===a).due=nf.cutoffAt;
 const id=cmd(sim,{type:'dispatchAirShuttle',vehicleId:v.id,departAt:nf.flight}).id,sh=s.airShuttles.find(x=>x.id===id);
 let guard=0;while(sh.status!=='transit'&&guard++<200)sim.step(1);
 assert.equal(sh.status,'transit','vor 16:00 abgefahren');
 while((s.t%1440)<16*60+1)sim.step(1);
 const rem=sh.remaining;sim.step(10);
 assert.equal(sh.blocked,AX.WAIT.driver);assert.equal(sh.remaining,rem,'kein Fortschritt ohne Fahrer');assert.equal(driver.task,null);
 const seen=new Map();check(s,seen,'Schichtende');const mid=reload(sim);
 let n=0;while(sh.status!=='complete'&&n++<2000){sim.step(1);if(s.t%5===0)check(s,seen,`t=${s.t}`);}
 assert.equal(sh.status,'complete');
 const o=s.orders.find(o=>o.id===a);assert.equal(o.delivered,40);assert.equal(keys(s,'air:').length,1);assert.equal(o.paid,cents(40*o.price));
 const miss=keys(s,`air-missed:${a}:`),fl=miss.map(l=>l.key.split(':')[2]);assert.equal(new Set(fl).size,fl.length,'je Flug höchstens eine Strafe');
 for(const l of miss)assert.equal(l.amount,-40*env.k.air.penaltyMissed);assert.equal(o.missedFlights,miss.length);
 const m=reload(mid);m.step(s.t-m.state.t);assert.equal(hash(m),hash(sim));
 console.log(`# QS-W3c Schichtende: Fahrt ${sh.arrivedAt-sh.departedAt} Min. (Soll ${Math.ceil(sh.distance/VEHICLES[v.type].speed)}), Strafen ${miss.length} (${fl.join(',')}), Lagergeld ${keys(s,'air-storage:').length}`);
});

test('Pflicht: Storno und externe Wartung nach Reservierung, Kasse leer bei Abfahrt (eigene Zahlen)', ()=>{
 const env=airFixture(23),{sim,s,f,order}=env;const a=order(60);
 const [t1,t2]=s.vehicles.filter(v=>v.type==='truck').map(v=>v.id);
 const id=cmd(sim,{type:'dispatchAirShuttle',vehicleId:t1,departAt:f.flight}).id;sim.step(1);
 assert.equal(sim.command({type:'dispatchAirShuttle',vehicleId:t2,departAt:f.flight}).ok,false,'letzte Pakete nicht doppelt reservierbar');
 s.vehicles.find(v=>v.id===t1).condition=50;cmd(sim,{type:'serviceVehicleExternal',id:t1});
 assert.equal(s.airShuttles.find(x=>x.id===id).status,'cancelled');assert.equal(s.reservations.length,0);validateState(s);
 const id2=cmd(sim,{type:'dispatchAirShuttle',vehicleId:t2,departAt:f.flight}).id;cmd(sim,{type:'cancelAirShuttle',id:id2});
 assert.equal(s.reservations.length,0);assert.equal(s.vehicles.find(v=>v.id===t2).status,'idle');
 const id3=cmd(sim,{type:'dispatchAirShuttle',vehicleId:t2,departAt:f.flight}).id,sh=s.airShuttles.find(x=>x.id===id3);
 const money=s.money;s.money=0;sim.step(sh.remaining+3);
 assert.equal(sh.status,'loading');assert.equal(sh.blocked,AX.WAIT.cash);assert.ok(!s.buildings.some(b=>b.task===id3));
 const r=reload(sim);validateState(r.state);
 s.money=money;const seen=new Map();let n=0;while(sh.status!=='complete'&&n++<1000){sim.step(1);if(s.t%5===0)check(s,seen,`t=${s.t}`);}
 assert.equal(keys(s,'air:').length,1);assert.equal(keys(s,'air-trip:').length,1);assert.equal(s.orders.find(o=>o.id===a).delivered,60);
});

/** Assistent-Szenario: Pakete lokal + Pakete nach B (Linie) + Luftexport, 4 Tage. Befehle während step werden mitgeschrieben. */
function assisted(on,{budget=null,days=4,seed=7}={}){
 const env=world({seed}),{sim,s}=env,calls=[];
 const orig=sim.command.bind(sim);let inStep=false;
 sim.command=c=>{const r=orig(c);if(inStep)calls.push({t:s.t,c:{...c},r});return r;};
 const step=sim.step.bind(sim);sim.step=n=>{inStep=true;try{return step(n);}finally{inStep=false;}};
 if(on)cmd(sim,{type:'setAssistant',site:'site-1',enabled:true,dispatch:true,lines:true,gate:true,budget});
 return {...env,calls,days};
}
const ALLOWED=new Set(['updateLine','prioritizeArrival','dispatchAirShuttle','dispatchTour','dispatch']);

test('Assistent über 4 Tage (Seed 7, Pakete + Linie + Luft): nur reguläre Befehle, Mengen/Zahlungen/Strafen konsistent alle 5 Min., Laden gleich', ()=>{
 const run=on=>{const e=assisted(on),seen=new Map();let mid=null;const end=e.s.t+e.days*1440;
  for(;e.s.t<end;){e.sim.step(5);check(e.s,seen,`${on?'mit':'ohne'} t=${e.s.t}`);if(on&&!mid&&e.s.t>=end-2*1440-3)mid=e.sim.serialize();}
  return {...e,mid,end};};
 const off=run(false),on=run(true);
 assert.equal(off.calls.length,0,'ohne Assistent keine Befehle aus der Simulation');
 for(const x of on.calls)assert.ok(ALLOWED.has(x.c.type),`verbotener Befehl ${x.c.type}`);
 const ok=on.calls.filter(x=>x.r.ok),by=t=>ok.filter(x=>x.c.type===t).length;
 assert.ok(by('updateLine')>=1&&by('dispatchAirShuttle')>=1&&(by('dispatch')+by('dispatchTour'))>=1,JSON.stringify([...ALLOWED].map(t=>[t,by(t)])));
 // Endhash nach Laden mitten im Betrieb
 const x=Simulation.fromJSON(on.mid);x.step(on.end-x.state.t);assert.equal(hash(x),hash(on.sim));
 const sum=(s,p)=>cents(keys(s,p).reduce((n,l)=>n+l.amount,0));
 const row=e=>({geld:cents(e.s.money),zugestellt:e.s.orders.filter(o=>o.kind==='logistics').reduce((n,o)=>n+o.delivered,0),luft:sum(e.s,'air:'),luftStrafe:sum(e.s,'air-missed:'),spaet:sum(e.s,'penalty:'),log:e.s.assistant?.log.length??0});
 console.log(`# QS-W3c Assistent 4 Tage ohne ${JSON.stringify(row(off))}`);console.log(`# QS-W3c Assistent 4 Tage mit  ${JSON.stringify(row(on))} Befehle ok ${ok.length}/${on.calls.length} ${JSON.stringify([...ALLOWED].map(t=>[t,by(t)]))}`);
 assert.ok(row(on).zugestellt>row(off).zugestellt);
});

test('Assistent Abschalten stoppt sofort: kein Befehl nach setAssistant enabled:false', ()=>{
 const e=assisted(true);e.sim.step(1440);const n=e.calls.length;assert.ok(n>0);
 cmd(e.sim,{type:'setAssistant',site:'site-1',enabled:false});e.sim.step(1440);
 assert.equal(e.calls.length,n,'nach Abschalten keine weiteren Befehle');
 validateState(e.s);
});

/** Tagesbudget gegen tatsächlich gebuchte Fahrtkosten der vom Assistenten gestarteten Fahrten. */
function budgetUse(e){
 const per=new Map();
 for(const x of e.calls.filter(x=>x.r.ok&&x.r.id)){const d=Math.floor(x.t/1440);const cost=-e.s.ledger.filter(l=>l.key.endsWith(':'+x.r.id)&&/trip/.test(l.key)).reduce((n,l)=>n+l.amount,0);per.set(d,cents((per.get(d)||0)+cost));}
 return per;
}
test('Assistent Tagesbudget 120 € (Pakete + Linie, ohne Luft): tatsächliche Fahrtkosten je Tag ≤ Budget', ()=>{
 const e=assisted(true,{budget:120});e.sim.step(3*1440);
 for(const [d,c] of budgetUse(e))assert.ok(c<=120+0.01,`Tag ${d+1}: ${c} €`);
});
test.todo('QS-W3c-02 Assistent-Budget: Luftzubringer wird mit 30-km-Schätzung geprüft, gebucht wird die Flughafendistanz (Budget überschritten)',()=>{
 const env=airFixture(),{sim,s,order}=env;order(30);
 const v=s.vehicles.find(v=>v.type==='truck'),est=cents(2*30*VEHICLES.truck.runningCost),real=AX.tripCost(v,AX.airportDistance(s,'site-1'));
 cmd(sim,{type:'setAssistant',site:'site-1',enabled:true,budget:est});sim.step(400);
 const spent=-keys(s,'air-trip:').reduce((n,l)=>n+l.amount,0);
 assert.ok(spent<=est+0.01,`Budget ${est} €, gebucht ${spent} € (Fahrt real ${real} €)`);
});
test.todo('QS-W3c-03 Versionsanzeige auf 0.14 anheben',async()=>{
 const {readFileSync}=await import('node:fs');assert.match(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),/VERSION='0\.14/);
});
