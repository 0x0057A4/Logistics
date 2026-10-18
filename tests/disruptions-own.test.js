// 0.16 S1 (A03/A07): Wetter und Störungen – Determinismus, Wirkung, Speichern/Laden, Bilanzen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {VEHICLES} from '../dist/catalog.js';
import * as D from '../dist/disruptions.js';
import * as yard from '../dist/yard.js';
import {coolingCapacity} from '../dist/special.js';
import {lampGame,lampOffers} from './fertigung-fixture.mjs';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,r.message);return r;};
const T=2*1440+540; // Spieltag 3, 09:00 (Tagschicht)
const dayOf=t=>Math.floor(t/1440)+1;
/** Spielzeit für Testaufbauten vorstellen; s.disruptions als fester Zustand (keine Tagesplanung am selben Tag). */
function at(sim,t,{weather='clear',events=[]}={}){
 const s=sim.state;s.t=t-1;
 s.disruptions={day:dayOf(t),weather:Object.fromEntries(s.sites.map(x=>[x.id,{kind:weather,since:t-1,until:dayOf(t)*1440}])),events,log:[]};
}
const ev=(kind,site,startT,endT,extra={})=>({id:`disruption-t-${kind}`,kind,site,startT,endT,text:`Test ${kind}`,...extra});
const disruptionLog=s=>s.events.filter(e=>e.kind==='disruption').map(e=>[e.t,e.text]);

test('vor START_T (Spieltag 2, 14:00) kein Zustand und keine Wirkung, danach Tagesplan',()=>{
 const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state;
 sim.step(D.START_T-1-s.t);assert.equal(s.t,D.START_T-1);
 assert.equal(s.disruptions,undefined);
 assert.equal(D.travelFactor(s,'site-1'),1);assert.equal(D.arrivalDelay(s,'site-1','k'),0);
 assert.equal(D.gateDown(s,'site-1'),false);assert.equal(D.gridDown(s,'site-1'),false);assert.deepEqual(D.active(s,'site-1'),[]);
 assert.equal(D.travelMinutes(s,'site-1',17),17);
 assert.equal(disruptionLog(s).length,0);
 sim.step(1);
 assert.equal(s.disruptions.day,2);assert.ok(D.WEATHER.includes(s.disruptions.weather['site-1'].kind));
 assert.equal(s.disruptions.weather['site-1'].since,D.START_T);
 assert.ok(s.disruptions.events.every(e=>e.startT>=D.START_T&&e.startT<2*1440));
 assert.ok(validateState(s));
});

test('Determinismus: gleicher Seed → gleiche Wetter- und Ereignisfolge; anderer Seed → andere Folge',()=>{
 const run=seed=>{const sim=new Simulation({mode:'sandbox',seed}),seen=[];
  for(let day=2;day<=29;day++){sim.step(day*1440-sim.state.t);const d=sim.state.disruptions;seen.push(JSON.stringify([d.weather,d.events]));}
  return {seen,log:disruptionLog(sim.state),state:sim.state};};
 const a=run(11),b=run(11),c=run(12);
 assert.deepEqual(a.seen,b.seen);assert.deepEqual(a.log,b.log);
 assert.notDeepEqual(a.seen,c.seen);
 // Häufigkeit (vorläufig ≈ 1–2 je Art und Woche): über 4 Wochen je Art 1…20 Ereignisse, mehrere Wetterlagen.
 const all=[...a.state.disruptions.log];const kinds=new Set(a.seen.map(x=>JSON.parse(x)[0]['site-1'].kind));
 assert.ok(kinds.size>=3,'mehrere Wetterlagen');
 const count=a.log.filter(([,t])=>/^Behoben/.test(t)).length;assert.ok(count>=6&&count<=60,`Ereignisse ${count}`);
 assert.ok(all.length<=30);
 assert.ok(validateState(a.state));
});

test('Wetter und Stau verlängern die Lieferfahrt beim Start; gespeicherte Dauer bleibt',()=>{
 const trip=(weather,events=[])=>{
  const sim=lampGame({mode:'sandbox'}),s=sim.state;cmd(sim,{type:'build',buildingType:'dock',x:10,y:6});for(const role of ['warehouse','driver'])cmd(sim,{type:'hire',role});
  const v=cmd(sim,{type:'buyVehicle',vehicleType:'van'}).id,o=lampOffers(sim)[0];cmd(sim,{type:'acceptOrder',id:o.id});
  Object.assign(o,{item:'parcel',qty:40,delivered:0,quality:0,due:T+5000});sim.api.inventory.add({item:'parcel',qty:40,site:'site-1',location:'stock',quality:95,unitCost:0});
  at(sim,T,{weather,events:events.map(e=>({...e}))});
  const id=cmd(sim,{type:'dispatch',orderId:o.id,vehicleId:v,qty:40}).id,sh=()=>s.shipments.find(x=>x.id===id);
  for(let i=0;i<200&&sh().status==='loading';i++)sim.step(1);
  assert.equal(sh().status,'transit');const transit=sh().remaining; // beim Start gespeicherte Fahrtdauer
  sim.step(2);const copy=Simulation.fromJSON(sim.serialize()); // Laden mitten in der Fahrt
  for(let i=0;i<500&&sh().status!=='complete';i++){sim.step(1);copy.step(1);}
  assert.equal(sh().status,'complete');assert.equal(copy.serialize(),sim.serialize(),'bitgleich nach Laden während Fahrt');
  return {transit,sim,o,sh:sh(),stock:s.batches.filter(b=>b.item==='parcel').reduce((n,b)=>n+b.qty,0)};
 };
 const base=Math.ceil(30/VEHICLES.van.speed);
 const clear=trip('clear'),snow=trip('snow'),jam=trip('clear',[ev('jam','site-1',T-10,T+500,{pct:40})]);
 assert.equal(clear.transit,base);
 assert.equal(snow.transit,Math.ceil(base*1.35));assert.ok(snow.transit>clear.transit);
 assert.equal(jam.transit,Math.ceil(base*1.4));
 // Störung erzeugt weder Ware noch Geld: gleiche Mengen, gleiche Fahrtkosten und Zahlung.
 for(const r of [snow,jam]){
  assert.equal(r.o.delivered,clear.o.delivered);assert.equal(r.stock,clear.stock);assert.equal(r.stock+r.o.delivered,40);
  assert.equal(r.sh.transportCost,clear.sh.transportCost);assert.equal(r.sh.invoiceAmount,clear.sh.invoiceAmount);
  const sum=l=>l.filter(x=>/^(trip|payment)/.test(x.key)).reduce((n,x)=>n+x.amount,0);
  assert.equal(sum(r.sim.state.ledger),sum(clear.sim.state.ledger));
  assert.ok(r.sim.state.batches.every(b=>b.qty>=0));
 }
});

test('Stau auf Zustellgebiet trifft nur dieses Gebiet bzw. diese Linie',()=>{
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;at(sim,T,{events:[ev('jam','site-1',T-5,T+60,{pct:50,target:{contract:'k-1',lane:'lane-2',name:'Nord'}})]});s.t=T;
 assert.equal(D.travelFactor(s,'site-1',{contract:'k-1',lane:'lane-2'}),1.5);
 assert.equal(D.travelFactor(s,'site-1',{contract:'k-1',lane:'lane-1'}),1);
 assert.equal(D.travelFactor(s,'site-1',{contract:'k-2',lane:'lane-2'}),1);
 assert.equal(D.travelFactor(s,'site-1',{line:'line-9'}),1);
 s.disruptions.weather['site-1'].kind='rain';
 assert.ok(Math.abs(D.travelFactor(s,'site-1',{contract:'k-1',lane:'lane-2'})-1.65)<1e-12);
 assert.equal(D.travelMinutes(s,'site-1',10,{contract:'k-1',lane:'lane-2'}),17);
 s.t=T+60;assert.ok(Math.abs(D.travelFactor(s,'site-1',{contract:'k-1',lane:'lane-2'})-1.1)<1e-12,'Stau beendet');
});

// Hofaufbau wie yard-own: Sandbox, Dock, Regale, eine Lagerkraft, beendeter Vertrag für Auftragsreferenzen.
function yardSetup(){
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:10});cmd(sim,{type:'build',buildingType:'rack',x:2,y:2});cmd(sim,{type:'build',buildingType:'rack',x:5,y:2});
 cmd(sim,{type:'hire',role:'warehouse'});
 const c=s.contracts[0];cmd(sim,{type:'acceptContract',id:c.id});cmd(sim,{type:'cancelContract',id:c.id});
 return {sim,s,c};
}
function arrival(sim,c,eta,qty=40){const s=sim.state,id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:c.id,lane:c.lanes[0].id,customer:'Gebiet Test',item:'parcel',qty,price:7,due:eta+600,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});
 return yard.schedule(s,sim.api,{contractId:c.id,site:s.selectedSite,parcels:qty,eta,orderIds:[id]});}

test('Wetter verspätet fremde Lkw beim Anlegen; Auftragsfrist bleibt am Plan',()=>{
 const one=weather=>{const {sim,s,c}=yardSetup();at(sim,T,{weather});s.t=T;const a=arrival(sim,c,T+15);return {a,s,o:s.orders.find(o=>o.id===a.orderIds[0])};};
 const clear=one('clear'),snow=one('snow'),fog=one('fog');
 assert.equal(clear.a.eta,T+15);assert.equal(clear.a.delay,undefined);
 assert.ok(snow.a.delay>=30&&snow.a.delay<=45,`Schnee ${snow.a.delay}`);assert.equal(snow.a.eta,T+15+snow.a.delay);assert.equal(snow.a.phaseEnd,snow.a.eta);
 assert.ok(fog.a.delay>=15&&fog.a.delay<=22);
 assert.equal(snow.o.due,clear.o.due,'Frist unverändert');
 assert.ok(snow.s.events.some(e=>e.kind==='disruption'&&/Lkw-Ankunft \d+ Min\. später/.test(e.text)));
 assert.ok(validateState(snow.s));
});

test('Torstörung: Lkw wartet mit Wartegrund „Torstörung“ ohne gebundene Kraft und fährt nach Ende weiter',()=>{
 const {sim,s,c}=yardSetup();at(sim,T,{events:[ev('gate','site-1',T,T+30)]});
 const a=arrival(sim,c,T+5);
 for(let i=0;i<10;i++)sim.step(1);
 assert.equal(a.phase,'gate');assert.equal(a.waitReason,'Torstörung');assert.equal(a.waitReason,yard.WAIT.gateDown);
 assert.ok(!s.workers.some(w=>w.task===yard.gateKey(a)),'keine Kraft gebunden');
 assert.equal(D.gateDown(s,'site-1'),true);assert.equal(D.active(s,'site-1')[0].kind,'gate');
 // Speichern/Laden während der Störung bitgleich.
 const copy=Simulation.fromJSON(sim.serialize());
 sim.step(60);copy.step(60);assert.equal(copy.serialize(),sim.serialize());
 assert.equal(D.gateDown(s,'site-1'),false);
 assert.notEqual(a.phase,'gate');assert.ok(a.gateAt<=T+5);
 assert.ok(disruptionLog(s).some(([t,x])=>t===T+30&&/^Behoben: Test gate/.test(x)));
 assert.equal(s.disruptions.events.length,0);assert.equal(s.disruptions.log.at(-1).kind,'gate');
 for(let i=0;i<200&&a.phase!=='gone';i++)sim.step(1);
 assert.equal(a.unloaded,40);
});

test('Netzstörung: ohne Energiegebäude fällt Kühlung aus, Energieversorgung deckt weiter',()=>{
 const make=withPower=>{const sim=new Simulation({mode:'sandbox'}),s=sim.state;
  cmd(sim,{type:'build',buildingType:'coldstore',x:2,y:2});if(withPower)cmd(sim,{type:'build',buildingType:'power',x:8,y:2});
  cmd(sim,{type:'build',buildingType:'forklift',x:12,y:2});
  at(sim,T,{events:[ev('grid','site-1',T,T+40)]});
  const b=sim.api.inventory.add({item:'parcel_cold',qty:20,site:'site-1',location:'stock',quality:100,unitCost:0});
  return {sim,s,b};};
 for(const withPower of [false,true]){
  const {sim,s,b}=make(withPower);
  assert.equal(coolingCapacity(s,'site-1'),100,'vor Beginn');
  sim.step(1);assert.equal(D.gridDown(s,'site-1'),true);
  assert.equal(coolingCapacity(s,'site-1'),withPower?100:0);assert.equal(yard.sitePowered(s,'site-1'),withPower);
  const copy=Simulation.fromJSON(sim.serialize());
  sim.step(20);copy.step(20);assert.equal(copy.serialize(),sim.serialize(),'Laden während Netzstörung bitgleich');
  const batch=s.batches.find(x=>x.id===b.id);
  if(withPower)assert.equal(batch.cooled,true);else{assert.equal(batch.cooled,false);assert.ok(batch.temperature>4);}
  assert.equal(batch.qty,20);
  sim.step(40);assert.equal(D.gridDown(s,'site-1'),false);assert.equal(coolingCapacity(s,'site-1'),100);
  assert.ok(validateState(s));
 }
});

test('Speichern/Laden über einen Störungstag bitgleich; Spielstand mit Störung valide, Beschädigung erkannt',()=>{
 const sim=new Simulation({mode:'sandbox',seed:99});sim.step(4*1440-sim.state.t+600);
 const s=sim.state;assert.ok(s.disruptions);
 const copy=Simulation.fromJSON(sim.serialize());sim.step(1440);copy.step(1440);
 assert.equal(copy.serialize(),sim.serialize());
 const bad=JSON.parse(sim.serialize());bad.disruptions.weather['site-1'].kind='hagel';
 assert.throws(()=>Simulation.fromJSON(JSON.stringify(bad)),/Störungsdaten/);
 const bad2=JSON.parse(sim.serialize());bad2.disruptions.events.push({id:'x',kind:'jam',site:'site-1',startT:5,endT:4,text:''});
 assert.throws(()=>Simulation.fromJSON(JSON.stringify(bad2)),/Störungsdaten/);
 const old=JSON.parse(sim.serialize());delete old.disruptions;assert.ok(Simulation.fromJSON(JSON.stringify(old)),'Altstand ohne Feld ladbar');
});

test('Geldbilanz: Störungen buchen nie; Kontostand = Start + Buchungen; keine negativen Bestände',()=>{
 const sim=new Simulation({mode:'sandbox',seed:5}),start=sim.state.money;sim.step(9*1440-sim.state.t);
 const s=sim.state;assert.ok(s.disruptions.log.length>0||s.disruptions.events.length>0);
 const booked=s.ledger.reduce((n,l)=>n+l.amount,0);
 assert.ok(Math.abs(s.money-(start+booked))<1e-6);
 assert.ok(!s.ledger.some(l=>/disruption|stoer|stör/i.test(l.key+(l.category||''))));
 assert.ok(s.batches.every(b=>b.qty>=0&&b.reserved>=0));
});

test('Einstellung Störungen aus: keine Tagesplanung, keine Wirkung',()=>{
 const sim=new Simulation({mode:'sandbox',seed:3});cmd(sim,{type:'settings',incidents:false});sim.step(5*1440-sim.state.t);
 assert.equal(sim.state.disruptions,undefined);assert.equal(D.travelFactor(sim.state,'site-1'),1);
});
