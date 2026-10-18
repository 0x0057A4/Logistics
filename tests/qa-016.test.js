// A11 · unabhängige QS Release 0.16 (Wetter/Störungen, Personalrollen, Kundendienst-Ausbau, Fixes QS-015-01/03).
// Grundlage docs/SCHNITTSTELLEN-0.16.md (Abnahme), docs/BALANCING-0.16.md, AGENTS.md (Pflicht-Übergänge). Bericht docs/QS-0.16.md.
// Eigene Szenarien, Entwicklertests nicht übernommen. Fachzustand nur über sim.command/sim.step. Ausnahmen sind am Test vermerkt:
// - Störungslage per Testaufbau (s.disruptions mit day = heutiger Spieltag, damit die Tagesplanung sie nicht überschreibt);
// - Testaufträge/-ware per s.orders.push bzw. inventory.add (wie linehaul-own/air-export), Vertrag angenommen und beendet.
// Befundtests prüfen das Sollverhalten und stehen als todo (IDs QS-016-xx im Bericht).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import {VEHICLES,BUILDINGS} from '../dist/catalog.js';
import * as D from '../dist/disruptions.js';
import * as yard from '../dist/yard.js';
import * as AX from '../dist/airexport.js';
import {coolingCapacity,powerBalance} from '../dist/special.js';
import {lampGame,lampOffers} from './fertigung-fixture.mjs';

const SITE='site-1';
const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const reload=sim=>Simulation.fromJSON(sim.serialize());
const dayOf=t=>Math.floor(t/1440)+1;
const T=2*1440+540; // Spieltag 3, 09:00
function until(sim,cond,max,each){for(let i=0;i<max;i++){if(cond())return true;each?.(sim);sim.step(1);}return cond();}
/** Testaufbau Störungslage ab Minute t (Spielzeit auf t−1, Zustand für den laufenden Tag fest). */
function lage(sim,t,{weather={},events=[]}={}){
 const s=sim.state;s.t=t-1;
 s.disruptions={day:dayOf(t),weather:Object.fromEntries(s.sites.map(x=>[x.id,{kind:weather[x.id]||weather.all||'clear',since:t-1,until:dayOf(t)*1440}])),events:events.map(e=>({...e})),log:[]};
}
const ev=(kind,site,startT,endT,extra={})=>({id:`disruption-qa-${kind}-${site}`,kind,site,startT,endT,text:`QA ${kind}`,...extra});
const parcels=(s,owner)=>s.batches.filter(b=>b.item==='parcel'&&(!owner||b.owner===owner)).reduce((n,b)=>n+b.qty,0);
const moneyOk=(s,start)=>Math.abs(s.money-(start+s.ledger.reduce((n,l)=>n+l.amount,0)))<1e-6;

// Gemeinsamer Hub: Dock(s), Regale, Personal, Fahrzeuge; Vertrag angenommen und beendet (Auftragsreferenzen mit Gebieten).
function hub({seed=31,docks=1,van=true,truck=false,warehouse=1,driver=1,shift='all',site2=false}={}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 for(let i=0;i<docks;i++)cmd(sim,{type:'build',buildingType:'dock',x:2+4*i,y:10,rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:5,y:2,rotation:0});
 const ids=[];for(const [role,n] of [['warehouse',warehouse],['driver',driver]])for(let i=0;i<n;i++){const id=cmd(sim,{type:'hire',role}).id;cmd(sim,{type:'setShift',id,shift});ids.push(id);}
 const v=van?cmd(sim,{type:'buyVehicle',vehicleType:'van'}).id:null,tr=truck?cmd(sim,{type:'buyVehicle',vehicleType:'truck'}).id:null;
 let B=null;if(site2){B=cmd(sim,{type:'buySite',name:'Ziel-Hub Lindental'}).id;cmd(sim,{type:'build',buildingType:'dock',site:B,x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site:B,x:2,y:2,rotation:0});
  for(const role of ['warehouse','driver']){const id=cmd(sim,{type:'hire',role,site:B}).id;cmd(sim,{type:'setShift',id,shift:'all'});}}
 const k=s.contracts[0];cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});delete k.penaltyOpen; // Abrechnung Vertragsende aus (wie air-export-Fixture)
 k.lanes=[{id:'lane-1',name:'Nordbezirk',distance:30,site:SITE},{id:'lane-2',name:'Südbezirk',distance:30,site:SITE},...(B?[{id:'lane-3',name:'Fernbezirk',distance:25,site:B}]:[])];
 k.laneShare=B?[0.4,0.3,0.3]:[0.5,0.5];
 return {sim,s,k,van:v,truck:tr,B};
}
function order(env,{qty,lane='lane-1',due,stock=qty,deliverySite,item='parcel'}){
 const {sim,s,k}=env,id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane,customer:`QA-Gebiet ${lane} (${k.shipper})`,item,qty,price:7,due:due??s.t+3000,quality:0,site:SITE,...(deliverySite?{deliverySite}:{}),status:'active',delivered:0,paid:0});
 if(stock)assert.ok(sim.api.inventory.add({item,qty:stock,site:SITE,owner:id,location:'stock',quality:100,unitCost:0}));
 return id;
}

// ------------------------------------------------------------------------------------------------------------------
// 1. Wetter und Störungen
test('Determinismus: Störungen ziehen kein api.random; gleicher Seed und gleiche Befehle → gleiche Tagespläne, auch nach Laden am Tageswechsel', ()=>{
 const run=incidents=>{const sim=new Simulation({mode:'sandbox',seed:11});if(!incidents)cmd(sim,{type:'settings',incidents:false});sim.step(6*1440-sim.state.t);return sim;};
 const on=run(true),off=run(false);
 assert.equal(on.state.seed,off.state.seed,'Gemeinsamer Zufallsstrom unberührt');
 const strip=list=>list.map(({id,...k})=>k);
 assert.deepEqual(strip(on.state.contracts),strip(off.state.contracts),'Angebote inhaltlich gleich');
 assert.equal(off.state.disruptions,undefined);
 // Laden 1 Minute vor Tageswechsel: die Tagesplanung des Folgetags ist im geladenen Spiel identisch.
 const a=new Simulation({mode:'sandbox',seed:23});a.step(4*1440-1-a.state.t);const b=reload(a);a.step(1441);b.step(1441);
 assert.equal(hash(a),hash(b));
 assert.ok(a.state.events.some(e=>e.kind==='disruption'),'Störungsmeldungen vorhanden');
});

test('Sammeltour: Wetter und Stau verlängern jede Etappe beim Start; Ware und Geld unverändert; Laden mitten in der Etappe bitgleich', ()=>{
 const run=(weather,events=[])=>{
  const env=hub({warehouse:1,driver:1}),{sim,s,van}=env;
  const o1=order(env,{qty:10,lane:'lane-1'}),o2=order(env,{qty:10,lane:'lane-2'});
  lage(sim,T,{weather:{all:weather},events});
  const id=cmd(sim,{type:'dispatchTour',vehicleId:van,stops:[{orderId:o1,qty:10},{orderId:o2,qty:10}]}).id,tour=()=>s.tours.find(t=>t.id===id);
  const legs=[];let last=null,saved=null;
  assert.ok(until(sim,()=>tour().status==='complete',600,()=>{const t=tour();const k=t.status+':'+t.stopIndex;if(k!==last&&['transit','returning'].includes(t.status)){legs.push(t.duration);last=k;if(!saved&&t.status==='transit'&&t.stopIndex===1)saved=sim.serialize();}if(!['transit','returning'].includes(t.status))last=k;}),'Tour abgeschlossen');
  sim.step(90);// Zahlung
  return {legs,s,saved,o:[o1,o2].map(id=>s.orders.find(o=>o.id===id)),tour:tour()};
 };
 const clear=run('clear'),snow=run('snow'),jam=run('clear',[ev('jam',SITE,T-5,T+600,{pct:50})]);
 const base=[30,20,30].map(d=>Math.ceil(d/VEHICLES.van.speed));
 assert.deepEqual(clear.legs,base,'ohne Störung exakt die Grunddauer');
 assert.deepEqual(snow.legs,base.map(m=>Math.ceil(m*1.35-1e-9)),'Schnee ×1,35 je Etappe');
 assert.deepEqual(jam.legs,base.map(m=>Math.ceil(m*1.5-1e-9)),'Stau ohne Ziel ×1,5 je Etappe');
 for(const r of [snow,jam]){
  assert.deepEqual(r.o.map(o=>[o.delivered,o.paid]),clear.o.map(o=>[o.delivered,o.paid]),'gleiche Zustellung und Zahlung');
  assert.equal(r.tour.transportCost,clear.tour.transportCost,'gleiche Fahrtkosten');
  assert.equal(parcels(r.s),parcels(clear.s));
 }
 // Laden während der zweiten Etappe im Schnee.
 const x=Simulation.fromJSON(snow.saved),y=Simulation.fromJSON(snow.saved);x.step(3);const z=reload(x);z.step(200);y.step(203);assert.equal(hash(z),hash(y));
});

// Befund QS-016-01: Gebietsstau (Ziel lane/contract) trifft die Einzellieferung, aber nicht die Sammeltour zum selben Gebiet.
test('QS-016-01 Gebietsstau wirkt auf Einzellieferung und Sammeltour zum selben Zustellgebiet gleich', {todo:'QS-016-01: tours.js ruft travelMinutes ohne {lane,contract} auf'}, ()=>{
 const jam=env=>[ev('jam',SITE,T-5,T+600,{pct:60,target:{contract:env.k.id,lane:'lane-1',name:'Nordbezirk'}})];
 // Einzellieferung
 const e1=hub();const o=order(e1,{qty:10,lane:'lane-1'});lage(e1.sim,T,{events:jam(e1)});
 const sid=cmd(e1.sim,{type:'dispatch',orderId:o,vehicleId:e1.van,qty:10}).id,sh=()=>e1.s.shipments.find(x=>x.id===sid);
 assert.ok(until(e1.sim,()=>sh().status==='transit',100));const single=sh().remaining;
 // Sammeltour mit erstem Stopp im gleichen Gebiet
 const e2=hub();const a=order(e2,{qty:10,lane:'lane-1'}),b=order(e2,{qty:10,lane:'lane-2'});lage(e2.sim,T,{events:jam(e2)});
 const tid=cmd(e2.sim,{type:'dispatchTour',vehicleId:e2.van,stops:[{orderId:a,qty:10},{orderId:b,qty:10}]}).id,tr=()=>e2.s.tours.find(x=>x.id===tid);
 assert.ok(until(e2.sim,()=>tr().status==='transit',100));
 const base=Math.ceil(30/VEHICLES.van.speed);
 assert.equal(single,Math.ceil(base*1.6-1e-9),'Einzellieferung im Stau');
 assert.equal(tr().duration,single,`Sammeltour erste Etappe ${tr().duration} Min. statt ${single}`);
});

test('Linie: Stau auf der Linie verlängert die Hinfahrt, Wetter am Ziel die Rückfahrt; Mengen erhalten; Laden während der Fahrt bitgleich', ()=>{
 const run=(weather,events)=>{
  const env=hub({site2:true,van:false,truck:true,warehouse:2}),{sim,s,B,truck}=env;
  const o=order(env,{qty:60,lane:'lane-3',deliverySite:B,due:5000});
  const line=cmd(sim,{type:'createLine',from:SITE,to:B,departures:[T%1440+60],vehicleId:truck}).id;
  lage(sim,T,{weather:weather(B),events:events(line)});
  let saved=null;const durs={};
  assert.ok(until(sim,()=>s.linehauls.some(l=>l.status==='complete'),900,()=>{for(const l of s.linehauls){if(['transit','returning'].includes(l.status)&&durs[l.status]==null)durs[l.status]=l.duration;if(!saved&&l.status==='transit'&&l.remaining<l.duration-2)saved=sim.serialize();}}),'Linienfahrt abgeschlossen');
  const total=s.batches.filter(b=>b.owner===o).reduce((n,b)=>n+b.qty,0);
  return {durs,saved,total,s,o,lh:s.linehauls[0],B};
 };
 const clear=run(()=>({}),()=>[]),dis=run(B=>({[B]:'storm'}),line=>[ev('jam',SITE,T,T+400,{pct:40,target:{line,name:'A → B'}})]);
 const base=clear.durs.transit;assert.equal(clear.durs.returning,clear.lh.duration);
 assert.equal(dis.durs.transit,Math.ceil(base*1.4-1e-9),'Linienstau ×1,4');
 assert.equal(dis.durs.returning,Math.ceil(clear.durs.returning*1.25-1e-9),'Rückfahrt mit Sturm am Ziel ×1,25 (ohne Linienstau)');
 assert.equal(dis.total,60);assert.equal(clear.total,60);
 const x=Simulation.fromJSON(dis.saved),y=Simulation.fromJSON(dis.saved);x.step(5);const z=reload(x);z.step(300);y.step(305);assert.equal(hash(z),hash(y),'Laden während Linienfahrt');
 validateState(dis.s);
});

// Luftzubringer: keine eigenen Entwicklertests für Störungen. Aufbau wie air-export (Vertrag angenommen/gekündigt, fester Flugplan).
const FLIGHT=1290;
function airHub(seed=31){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:5,y:2,rotation:0});
 for(const role of ['warehouse','warehouse','driver']){const id=cmd(sim,{type:'hire',role}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:'truck'}).id;
 assert.ok(until(sim,()=>s.contracts.some(k=>k.unit==='air'),3000));
 const k=s.contracts.find(k=>k.unit==='air');k.flights=[FLIGHT];
 cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});delete k.penaltyOpen;
 return {sim,s,k,truck};
}
test('Luftzubringer: Wetter/Stau verlängern Hin- und Rückfahrt beim Start; verspätete Übergabe genau einmal Lagergeld, Zahlung genau einmal; Laden während Fahrt bitgleich', ()=>{
 const run=(weather,events=[])=>{
  const {sim,s,k,truck}=airHub(),flightT=2*1440+FLIGHT,qty=100,cut=flightT-k.cutoff;
  const base=Math.ceil(AX.airportDistance(s,SITE)/VEHICLES.truck.speed),h=AX.handlingMinutes(qty);
  // Abfahrt so, dass ohne Störung die Übergabe 3 Min. vor Annahmeschluss endet.
  const start=cut-(h+base+h)-3;sim.step(start-1-s.t);
  const id=sim.api.id('order');
  s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:k.lanes[0].id,customer:`Luftfracht (QA ${id})`,item:'parcel',qty,price:k.pricePerParcel,due:cut,quality:0,site:SITE,status:'active',delivered:0,paid:0,airExport:true,flightT});
  assert.ok(sim.api.inventory.add({item:'parcel',qty,site:SITE,owner:id,location:'stock',quality:100,unitCost:0}));
  lage(sim,s.t+1,{weather:{all:weather},events});
  cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT,departAt:flightT,site:SITE});
  const sh=s.airShuttles.at(-1),durs={};let saved=null;
  assert.ok(until(sim,()=>sh.status==='complete',800,()=>{if(['transit','returning'].includes(sh.status)&&durs[sh.status]==null)durs[sh.status]=sh.duration;if(!saved&&sh.status==='transit'&&sh.remaining<sh.duration-1)saved=sim.serialize();}),'Zubringer abgeschlossen');
  sim.step(5);
  const o=s.orders.find(x=>x.id===id);
  return {durs,base,sh,o,s,saved,lateKeys:s.ledger.filter(l=>l.key===`air-storage:${sh.id}`),payKeys:s.ledger.filter(l=>l.key===`air:${sh.id}`)};
 };
 const clear=run('clear'),snow=run('snow'),jam=run('clear',[ev('jam',SITE,T,4*1440,{pct:30})]);
 assert.deepEqual(clear.durs,{transit:clear.base,returning:clear.base});
 assert.deepEqual(snow.durs,{transit:Math.ceil(clear.base*1.35-1e-9),returning:Math.ceil(clear.base*1.35-1e-9)},'Schnee am Standort');
 assert.equal(jam.durs.transit,Math.ceil(clear.base*1.3-1e-9),'Stau ohne Ziel trifft auch den Zubringer');
 // Ohne Störung pünktlich, mit Schnee verspätet: Lagergeld genau einmal, Zahlung genau einmal und gleich hoch.
 assert.equal(clear.sh.lateQty,0);assert.equal(clear.lateKeys.length,0);
 assert.equal(snow.sh.lateQty,100,'Schnee lässt den Annahmeschluss reißen');assert.equal(snow.lateKeys.length,1);assert.equal(snow.lateKeys[0].amount,-10);
 for(const r of [clear,snow,jam]){assert.equal(r.payKeys.length,1);assert.equal(r.payKeys[0].amount,clear.payKeys[0].amount);assert.equal(r.o.delivered,100);assert.equal(r.o.paid,clear.o.paid);assert.equal(parcels(r.s,r.o.id),0);validateState(r.s);}
 const x=Simulation.fromJSON(snow.saved),y=Simulation.fromJSON(snow.saved);x.step(4);const z=reload(x);z.step(150);y.step(154);assert.equal(hash(z),hash(y),'Laden während Zubringerfahrt');
});

test('Fremd-Lkw über echten Vertrag: Wetterverspätung nur an der Ankunft, Auftragsfrist bleibt am Plan; Meldung', ()=>{
 const make=weather=>{
  const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state;
  cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
  for(const role of ['warehouse','warehouse'])cmd(sim,{type:'hire',role});
  cmd(sim,{type:'settings',incidents:false}); // keine geplanten Störungen, nur die gesetzte Lage
  const k=s.contracts.find(k=>k.status==='offer');cmd(sim,{type:'acceptContract',id:k.id});
  sim.step(T-1-s.t);lage(sim,s.t+1,{weather:{all:weather}});
  const n0=new Set(s.yard.map(a=>a.id));assert.ok(until(sim,()=>s.yard.some(a=>!n0.has(a.id)),1440),'neue Ankunft');
  const a=s.yard.find(a=>!n0.has(a.id));
  return {sim,s,k,a,orders:s.orders.filter(o=>a.orderIds.includes(o.id)),n0};
 };
 const clear=make('clear'),snow=make('snow');
 assert.equal(clear.a.delay,undefined);
 assert.ok(snow.a.delay>=30&&snow.a.delay<=45,`Verspätung ${snow.a.delay}`);
 assert.equal(snow.a.eta-snow.a.delay,clear.a.eta,'geplante Ankunft gleich');
 assert.deepEqual(snow.orders.map(o=>o.due),clear.orders.map(o=>o.due),'Fristen unverändert');
 for(const o of snow.orders)assert.equal(o.due,clear.a.eta+snow.k.slaMinutes+(snow.k.lanes.find(l=>l.id===o.lane)?.extraSla||0));
 assert.ok(snow.s.events.some(e=>e.kind==='disruption'&&/Lkw-Ankunft \d+ Min\. später/.test(e.text)));
 validateState(snow.s);
});

test('Torstörung während laufender Torkontrolle durch Torposten: Kraft frei, geleistete Minuten bleiben, Fortsetzung nach Ende; Laden an Beginn/Ende bitgleich', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:5}),s=sim.state;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 const wh=cmd(sim,{type:'hire',role:'warehouse'}).id,gate=cmd(sim,{type:'hire',role:'gate'}).id;
 const k=s.contracts[0];cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});delete k.penaltyOpen;
 lage(sim,T);
 const id=sim.api.id('order');s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:k.lanes[0].id,customer:'QA Torbezirk',item:'parcel',qty:40,price:7,due:T+900,quality:0,site:SITE,status:'active',delivered:0,paid:0});
 // Ankunft so wählen, dass die erste Kontrollminute des Torpostens genau 1 Minute leistet (Rate 1/2 im Wechsel, Mittel 1,25).
 let eta=T+2;while(Math.floor(1.25*(eta+2))-Math.floor(1.25*(eta+1))!==1)eta++;
 const a=yard.schedule(s,sim.api,{contractId:k.id,site:SITE,parcels:40,eta,orderIds:[id]});
 assert.ok(until(sim,()=>a.phase==='gate'&&(a.gateDone||0)>=1,30),`Torkontrolle läuft (${a.phase}, ${a.gateDone})`);
 const done=a.gateDone,W=x=>s.workers.find(w=>w.id===x);
 assert.equal(W(gate).task,yard.gateKey(a),'Torposten kontrolliert');assert.equal(W(wh).task,null,'Lagerkraft frei');
 s.disruptions.events.push(ev('gate',SITE,s.t+1,s.t+26)); // Störung ab nächster Minute, 25 Min.
 const startSave=sim.serialize();sim.step(1);
 assert.equal(a.waitReason,'Torstörung');assert.equal(a.gateDone,done,'geleistete Kontrollminuten bleiben');
 assert.equal(W(gate).task,null,'Torposten nicht gebunden');assert.ok(!s.workers.some(w=>w.task===yard.gateKey(a)));
 sim.step(23);assert.equal(a.phase,'gate');assert.equal(a.gateDone,done);
 const endSave=sim.serialize();
 for(const save of [startSave,endSave]){const x=Simulation.fromJSON(save),y=Simulation.fromJSON(save);x.step(2);const z=reload(x);z.step(60);y.step(62);assert.equal(hash(z),hash(y));}
 assert.ok(until(sim,()=>a.phase!=='gate',20));
 assert.ok(s.t>=s.disruptions.log.at(-1).endT,'Kontrolle erst nach Störungsende fertig');
 assert.ok(until(sim,()=>a.unloaded===40,200),'Entladen danach vollständig');
 assert.equal(parcels(s,id),40);validateState(s);
});

test('Netzstörung: Sortierplatz und Staplerentladung stehen ohne Energiegebäude (Wartegrund), laufen mit Energieversorgung; Mengen erhalten; Laden während Störung bitgleich', ()=>{
 const make=(withPower,pallet)=>{
  const env=hub({van:false,warehouse:2}),{sim,s,k}=env;if(pallet)k.unit='pallet';
  const sorter=cmd(sim,{type:'build',buildingType:'sorter',x:9,y:2,rotation:0}).id;cmd(sim,{type:'build',buildingType:'forklift',x:14,y:6,rotation:0});
  if(withPower)cmd(sim,{type:'build',buildingType:'power',x:14,y:2,rotation:0});
  lage(sim,T,{events:[ev('grid',SITE,T+5,T+65)]});
  let o=null,a=null;
  if(pallet){o=order(env,{qty:8,stock:0,item:'pallet',due:T+2000});a=yard.schedule(s,sim.api,{contractId:k.id,site:SITE,parcels:8,eta:T+8,orderIds:[o]});}
  else{o=order(env,{qty:400,stock:0,due:T+2000});assert.ok(sim.api.inventory.add({item:'parcel',qty:400,site:SITE,owner:o,location:'inbound',quality:100,unitCost:0}));}
  const inbound=()=>s.batches.filter(b=>b.location==='inbound'&&b.owner===o).reduce((n,b)=>n+b.qty,0);
  const total=()=>s.batches.filter(b=>b.owner===o).reduce((n,b)=>n+b.qty,0);
  sim.step(6);const inb0=inbound(),tot0=total();
  let saved=null;const seen=new Set();
  for(let i=0;i<58;i++){sim.step(1);const b=s.buildings.find(x=>x.id===sorter);seen.add(b.status);if(a?.waitReason)seen.add('hof:'+a.waitReason);if(!saved&&i===20)saved=sim.serialize();
   if(!pallet)assert.equal(total(),400,'Pakete erhalten');assert.ok(s.batches.every(b=>b.qty>=0));}
  const unloadedInGrid=a?.unloaded,sorted=inb0-inbound();
  const x=Simulation.fromJSON(saved),y=Simulation.fromJSON(saved);x.step(3);const z=reload(x);z.step(100);y.step(103);assert.equal(hash(z),hash(y));
  sim.step(200);validateState(s);
  return {seen,sorted,a,unloadedInGrid,total:total(),tot0};
 };
 const off=make(false,false),on=make(true,false),poff=make(false,true),pon=make(true,true);
 assert.ok(off.seen.has('power'),'Sortierplatz „power“');assert.equal(off.sorted,0,'ohne Energiegebäude nichts sortiert');
 assert.ok(!on.seen.has('power'));assert.ok(on.sorted>0,'mit Energieversorgung läuft die Sortierung');
 assert.equal(off.total,400);assert.equal(on.total,400);
 assert.ok(poff.seen.has('hof:'+yard.WAIT.forkliftPower),`Hof-Wartegrund Stapler ohne Strom: ${[...poff.seen]}`);
 assert.equal(poff.unloadedInGrid,0,'keine Palette während Netzstörung');assert.ok(pon.unloadedInGrid>0,'mit Energieversorgung entladen');
 for(const r of [poff,pon]){assert.equal(r.a.unloaded,8,'Paletten nach Störung vollständig');assert.equal(r.total,8);}
});

// Befund QS-016-02 (niedrig): Netzstörung – Stromkosten werden in voller Höhe weiter berechnet, obwohl das Netz nichts liefert.
test('QS-016-02 Netzstörung ohne Energiegebäude: keine Netzstromkosten für die Ausfallstunde', {todo:'QS-016-02: economy.step bucht power aller eingeschalteten Anlagen auch bei gridDown'}, ()=>{
 const sim=new Simulation({mode:'sandbox',seed:3}),s=sim.state;
 cmd(sim,{type:'build',buildingType:'assembly',x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'sorter',x:6,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'coldstore',x:10,y:2,rotation:0});
 lage(sim,2*1440+600,{events:[ev('grid',SITE,2*1440+590,2*1440+800)]});
 const energy=()=>s.ledger.filter(l=>l.category==='Energie').reduce((n,l)=>n+l.amount,0);
 sim.step(1);const e0=energy();sim.step(60); // genau eine volle Stunde (Abrechnung zur vollen Stunde) in der Störung
 assert.equal(D.gridDown(s,SITE),true);
 for(const b of s.buildings)if(b.type!=='coldstore')assert.equal(b.status,'power');
 assert.equal(coolingCapacity(s,SITE),0,'Kühlung ohne Strom');
 assert.equal(Math.round((energy()-e0)*100)/100,0,`Netzstrom während Netzstörung berechnet: ${(energy()-e0).toFixed(2)} €`);
});

test('Schalter Störungen aus (settings): laufendes Ereignis endet regulär, ab Folgetag keine Planung/Wirkung; wieder ein → Planung; Einstellung gespeichert', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:9}),s=sim.state;
 lage(sim,T,{weather:{all:'snow'},events:[ev('gate',SITE,T,T+40),ev('jam',SITE,T,T+600,{pct:30})]});sim.step(1);
 cmd(sim,{type:'settings',incidents:false});
 const x=reload(sim);assert.equal(x.state.settings.incidents,false,'Einstellung im Spielstand');
 assert.equal(D.gateDown(s,SITE),true,'laufende Torstörung bleibt bis zum Ende');
 sim.step(40);assert.equal(D.gateDown(s,SITE),false);
 assert.ok(s.events.some(e=>e.kind==='disruption'&&/^Behoben: QA gate/.test(e.text)),'Ende gemeldet');
 const wxToday=D.weatherAt(s,SITE);
 sim.step(dayOf(s.t)*1440-s.t+1); // Folgetag
 assert.deepEqual(s.disruptions.weather,{},'kein Wetter am Folgetag');assert.equal(s.disruptions.events.length,0,'keine neuen Ereignisse');
 assert.equal(D.travelFactor(s,SITE),1);assert.equal(D.arrivalDelay(s,SITE,'k'),0);
 sim.step(3*1440);assert.equal(s.disruptions.events.length,0);assert.deepEqual(s.disruptions.weather,{});
 cmd(sim,{type:'settings',incidents:true});const day=dayOf(s.t);
 sim.step(dayOf(s.t)*1440-s.t+1);assert.equal(s.disruptions.day,day+1,'Planung wieder aktiv');assert.ok(s.disruptions.weather[SITE]);
 validateState(s);
 console.log(`# QS-016 Schalter: Wetter am Abschalttag bleibt bis Mitternacht (${wxToday})`);
});

// Pflicht Spielstand ↔ alle Systeme: echter Betrieb mit Störungen, Spezialisten, Paletten und Paketen. Laden an Prüfpunkten
// (Fahrt im Wetter, Beladung, Pause, Torstörung, Netzstörung, Stau) und Vergleich mit dem durchlaufenden Original.
function deliver(sim){
 const s=sim.state;
 for(const o of s.orders){if(o.status!=='active'||o.kind!=='logistics'||o.airExport)continue;
  const committed=s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&x.status!=='cancelled').reduce((n,x)=>n+x.qty,0);
  let free=Math.floor(sim.api.inventory.available(o.item,o.site,o.id)+1e-9),open=o.qty-o.delivered-committed;
  for(const v of s.vehicles){if(v.status!=='idle'||v.condition<20||v.site!==o.site)continue;const n=Math.min(free,open,o.item==='pallet'?(v.type==='truck'?10:1):(v.type==='truck'?160:40));if(n<1)continue;
   if(sim.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty:n}).ok){free-=n;open-=n;}}}
 for(const v of s.vehicles)if(v.status==='idle'&&v.condition<35)sim.command({type:'serviceVehicleExternal',vehicleId:v.id});
}
const FORK_TASK=/:(warehouse|forklift)$/;
function roleInvariants(s,label){
 const tasks=new Map();
 for(const w of s.workers){if(!w.task)continue;
  assert.ok(!tasks.has(w.task),`${label}: Aufgabe ${w.task} doppelt vergeben`);tasks.set(w.task,w);
  if(w.role==='gate')assert.match(w.task,/:gate$/,`${label}: Torposten mit ${w.task}`);
  if(w.role==='forklift'){assert.match(w.task,FORK_TASK,`${label}: Staplerfahrer mit ${w.task}`);
   const id=w.task.replace(FORK_TASK,''),a=s.yard.find(x=>x.id===id),sh=s.shipments.find(x=>x.id===id),t=(s.tours||[]).find(x=>x.id===id),lh=(s.linehauls||[]).find(x=>x.id===id);
   const pal=a?['pallet','bulky'].includes(a.item):sh?['pallet','bulky'].includes(s.orders.find(o=>o.id===sh.orderId)?.item):t?t.stops.some(x=>['pallet','bulky'].includes(x.item)):lh?lh.pallet:true;
   assert.ok(pal,`${label}: Staplerfahrer an Paketvorgang ${w.task}`);}
  if(w.role!=='warehouse')assert.ok(!/:(sort|sort2|handsort)$/.test(w.task),`${label}: ${w.role} sortiert`);
 }
}
test('Pflicht Spielstand ↔ alle Systeme: Laden während Fahrt, Beladung, Pause, Tor-/Netzstörung und Stau bitgleich; keine Ware/kein Geld aus Störungen; Rollen ohne Doppeltätigkeit', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:4}),s=sim.state,money0=s.money;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'dock',x:6,y:10,rotation:0});
 for(const [x,y] of [[2,2],[5,2],[8,2],[11,2]])cmd(sim,{type:'build',buildingType:'rack',x,y,rotation:0});
 cmd(sim,{type:'build',buildingType:'forklift',x:14,y:6,rotation:0});
 for(const [role,shift] of [['warehouse','day'],['warehouse','night'],['warehouse','day'],['forklift','day'],['gate','day'],['driver','day'],['driver','night']]){const id=cmd(sim,{type:'hire',role}).id;cmd(sim,{type:'setShift',id,shift});}
 cmd(sim,{type:'buyVehicle',vehicleType:'truck'});cmd(sim,{type:'buyVehicle',vehicleType:'van'});cmd(sim,{type:'buyVehicle',vehicleType:'van'});
 cmd(sim,{type:'acceptContract',id:s.contracts.find(k=>k.status==='offer').id});
 const want={transit:0,loading:0,break:0,gate:0,grid:0,jam:0,weather:0},pending=[];let compared=0,palAccepted=false;
 const hit=()=>{const d=s.disruptions,act=d?D.active(s,SITE):[];const out=[];
  if(s.shipments.some(x=>x.status==='transit')&&act.some(e=>e.kind==='weather'))out.push('transit');
  if(s.shipments.some(x=>x.status==='loading'&&x.worker)||s.yard.some(a=>a.phase==='unloading'))out.push('loading');
  if(s.workers.some(w=>w.breakRemaining>0))out.push('break');
  for(const k of ['gate','grid','jam'])if(act.some(e=>e.kind===k))out.push(k);
  if(act.some(e=>e.kind==='weather'&&e.factor>=1.25))out.push('weather');return out;};
 const end=8*1440;
 while(s.t<end){
  if(!palAccepted){const k=s.contracts.find(k=>k.status==='offer'&&k.unit==='pallet');if(k&&sim.command({type:'acceptContract',id:k.id}).ok)palAccepted=true;}
  deliver(sim);for(const p of pending)if(!p.done){deliver(p.x);if(palAccepted&&!p.x.state.contracts.some(k=>k.unit==='pallet'&&k.status!=='offer')){const k=p.x.state.contracts.find(k=>k.status==='offer'&&k.unit==='pallet');if(k)p.x.command({type:'acceptContract',id:k.id});}}
  if(s.t>=D.START_T&&s.t%7===0)for(const h of hit())if(want[h]<2){want[h]++;pending.push({x:reload(sim),at:s.t+120,h});}
  sim.step(1);for(const p of pending)if(!p.done){p.x.step(1);if(s.t>=p.at){assert.equal(hash(p.x),hash(sim),`Laden bei „${p.h}“ (t=${p.at-120}) nicht bitgleich`);p.done=true;compared++;}}
  if(s.t%10===0){
   for(const b of s.batches){assert.ok(b.qty>=-1e-9,`t=${s.t}: Charge negativ`);assert.ok((b.reserved||0)<=b.qty+1e-7,`t=${s.t}: überreserviert`);}
   assert.ok(moneyOk(s,money0),`t=${s.t}: Kontostand ≠ Start + Buchungen`);
   roleInvariants(s,`t=${s.t}`);
  }
 }
 assert.ok(!s.ledger.some(l=>/disruption|stör|stoer|wetter|weather/i.test(l.key+(l.category||'')+(l.note||''))),'keine Störungsbuchung');
 const ev2=s.events.filter(e=>e.kind==='disruption').length;
 console.log(`# QS-016 Pflicht Spielstand: Prüfpunkte ${JSON.stringify(want)}, verglichen ${compared}, Störungsmeldungen ${ev2}, zugestellt ${s.stats.delivered}, Palettenvertrag ${palAccepted}`);
 for(const k of ['transit','loading','break'])assert.ok(want[k]>0,`Prüfpunkt ${k} erreicht`);
 assert.ok(want.gate+want.grid+want.jam>0,'mindestens ein Störungsereignis geprüft');
 assert.ok(compared>=pending.filter(p=>p.at<=s.t).length);
 validateState(s);
});

// ------------------------------------------------------------------------------------------------------------------
// 2. Personalrollen
function palletHub({forkShift='day',warehouseShift='night',fork=true,warehouse=true}={}){
 const env=hub({van:false,truck:true,warehouse:0,driver:1}),{sim,s,k}=env;k.unit='pallet';
 cmd(sim,{type:'build',buildingType:'forklift',x:14,y:6,rotation:0});
 const ids={};
 if(fork){ids.fork=cmd(sim,{type:'hire',role:'forklift'}).id;cmd(sim,{type:'setShift',id:ids.fork,shift:forkShift});}
 if(warehouse){ids.wh=cmd(sim,{type:'hire',role:'warehouse'}).id;cmd(sim,{type:'setShift',id:ids.wh,shift:warehouseShift});}
 return {...env,ids};
}
test('Pflicht Personal ↔ Lager: Schichtende des Staplerfahrers mitten im Entladen – Nachtlagerkraft übernimmt in derselben Minute, Stapler bleibt am Vorgang, Laden 15:59/16:00/16:01 bitgleich', ()=>{
 const env=palletHub(),{sim,s,k,ids}=env;
 const g=cmd(sim,{type:'hire',role:'gate'}).id;cmd(sim,{type:'setShift',id:g,shift:'all'});
 const day=2*1440,start=day+15*60+30;lage(sim,start);
 const o=order(env,{qty:40,stock:0,item:'pallet',due:day+3000});
 const a=yard.schedule(s,sim.api,{contractId:k.id,site:SITE,parcels:40,eta:start+1,orderIds:[o]});
 const W=id=>s.workers.find(w=>w.id===id),saves={};
 assert.ok(until(sim,()=>a.phase==='unloading'&&a.unloaded>0,60),'Entladen läuft vor 16:00');
 assert.ok(s.t<day+16*60,'Szenario vor Schichtende');assert.equal(W(ids.fork).task,yard.unloadKey(a),'Staplerfahrer entlädt');
 until(sim,()=>s.t>=day+16*60+2,30,()=>{if([959,960,961].includes(s.t%1440))saves[s.t%1440]=sim.serialize();});
 assert.equal(W(ids.fork).task,null,'Staplerfahrer nach Schichtende frei');
 assert.equal(W(ids.wh).task,yard.unloadKey(a),'Nachtlagerkraft übernimmt');
 assert.ok(s.buildings.some(b=>b.type==='forklift'&&b.task===yard.forkliftKey(a.id)),'Stapler bleibt am Vorgang');
 for(const [m,save] of Object.entries(saves)){const x=Simulation.fromJSON(save),y=Simulation.fromJSON(save);x.step(1);const z=reload(x);z.step(60);y.step(61);assert.equal(hash(z),hash(y),`Laden ${m}`);}
 assert.ok(until(sim,()=>a.unloaded===40,200));assert.equal(s.batches.filter(b=>b.owner===o).reduce((n,b)=>n+b.qty,0),40,'keine Palette verloren');
 // Ohne Ersatzkraft: Wartegrund Personal, Stapler frei.
 const e2=palletHub({warehouse:false}),s2=e2.s;{const g=cmd(e2.sim,{type:'hire',role:'gate'}).id;cmd(e2.sim,{type:'setShift',id:g,shift:'all'});}lage(e2.sim,start);
 const o2=order(e2,{qty:40,stock:0,item:'pallet',due:day+3000});const a2=yard.schedule(s2,e2.sim.api,{contractId:e2.k.id,site:SITE,parcels:40,eta:start+1,orderIds:[o2]});
 until(e2.sim,()=>s2.t>=day+16*60+2,80);
 assert.equal(a2.waitReason,yard.WAIT.staff);assert.ok(!s2.buildings.some(b=>b.type==='forklift'&&b.task),'Stapler ohne Kraft frei');
 const held=a2.unloaded;e2.sim.step(30);assert.equal(a2.unloaded,held,'keine Bewegung ohne Kraft');
 assert.equal(s2.batches.filter(b=>b.owner===o2).reduce((n,b)=>n+b.qty,0),held);validateState(s2);
});

test('Nachprüfung Fix 0.16b (forkStep): eigene Lkw mit Paletten – Staplerfahrer belädt schneller als Lagerkraft; Schichtende mitten in der Beladung, Lagerkraft übernimmt; Mengen und Laden bitgleich', ()=>{
 const load=(cfg,startMin,n=4)=>{
  const env=palletHub(cfg),{sim,s,truck}=env;const day=2*1440;
  const trucks=[truck];for(let i=1;i<n;i++)trucks.push(cmd(sim,{type:'buyVehicle',vehicleType:'truck'}).id);
  for(let i=1;i<n;i++){const id=cmd(sim,{type:'hire',role:'driver'}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
  for(const w of s.workers)if(w.role==='driver')cmd(sim,{type:'setShift',id:w.id,shift:'all'});
  lage(sim,day+startMin);
  const ids=trucks.map(v=>{const o=order(env,{qty:10,item:'pallet',due:day+3000});return cmd(sim,{type:'dispatch',orderId:o,vehicleId:v,qty:10}).id;});
  const shs=()=>s.shipments.filter(x=>ids.includes(x.id));
  const t0=s.t,saves={},roles=new Set();
  assert.ok(until(sim,()=>shs().every(x=>x.status!=='loading'),300,()=>{if([959,960,961].includes(s.t%1440))saves[s.t%1440]=sim.serialize();for(const w of s.workers)if(w.task&&ids.some(id=>w.task===`${id}:warehouse`))roles.add(w.role);}),'alle abgefahren');
  for(const [m,save] of Object.entries(saves)){const x=Simulation.fromJSON(save),y=Simulation.fromJSON(save);x.step(1);const z=reload(x);z.step(40);y.step(41);assert.equal(hash(z),hash(y),`Laden ${m}`);}
  const cargo=shs().flatMap(x=>x.cargo).map(b=>s.batches.find(x=>x.id===b)).reduce((n,b)=>n+b.qty,0);
  return {minutes:s.t-t0,cargo,roles:[...roles]};
 };
 const wh=load({fork:false,warehouseShift:'all'},600),fk=load({forkShift:'all',warehouse:false},600);
 assert.equal(wh.cargo,40);assert.equal(fk.cargo,40);
 assert.ok(fk.minutes<wh.minutes,`Staplerfahrer ${fk.minutes} Min. vs Lagerkraft ${wh.minutes} Min.`);
 const sw=load({forkShift:'day',warehouseShift:'night'},15*60+56);
 assert.equal(sw.cargo,40);assert.deepEqual(sw.roles.sort(),['forklift','warehouse'],`Rollenwechsel an der Schichtgrenze (${sw.roles}, ${sw.minutes} Min.)`);
 console.log(`# QS-016 forkStep: Beladung 4 × 10 Paletten Lagerkraft ${wh.minutes} Min., Staplerfahrer ${fk.minutes} Min., mit Schichtwechsel ${sw.minutes} Min.`);
});

test('Spezialisten sortieren nie und entladen keine Pakete: nur Staplerfahrer/Torposten → Torkontrolle ja, Entladen/Sortieren nein', ()=>{
 const env=hub({van:false,warehouse:0,driver:0}),{sim,s,k}=env;
 for(const role of ['forklift','gate']){const id=cmd(sim,{type:'hire',role}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
 lage(sim,T);
 const o=order(env,{qty:200,stock:0,due:T+2000});assert.ok(sim.api.inventory.add({item:'parcel',qty:200,site:SITE,owner:o,location:'inbound',quality:100,unitCost:0}));
 const p=order(env,{qty:30,stock:0,due:T+2000});const a=yard.schedule(s,sim.api,{contractId:k.id,site:SITE,parcels:30,eta:T+3,orderIds:[p]});
 let gateBy=null;
 for(let i=0;i<120;i++){sim.step(1);roleInvariants(s,`t=${s.t}`);const w=s.workers.find(w=>w.task===yard.gateKey(a));if(w)gateBy=w.role;}
 assert.equal(gateBy,'gate','Torposten kontrolliert');
 assert.equal(a.unloaded,0,'Pakete werden nicht von Spezialisten entladen');assert.equal(a.waitReason,yard.WAIT.staff);
 assert.equal(s.batches.filter(b=>b.owner===o&&b.location==='inbound').reduce((n,b)=>n+b.qty,0),200,'nichts sortiert');
 assert.equal(s.sorting.sites[SITE].hand,'staff');
});

// ------------------------------------------------------------------------------------------------------------------
// 3. Kundendienst
function serviceHub(staff){
 const env=hub({warehouse:1,driver:1});if(staff){const id=cmd(env.sim,{type:'hire',role:'service'}).id;cmd(env.sim,{type:'setShift',id,shift:'all'});}
 return env;
}
test('Automatisches Störungsanliegen: Ereignis oder schweres Wetter am Standort und Frist ≤ 240 Min. → Statusanfrage „disruption“ genau einmal; Regen löst nichts aus', ()=>{
 const one=(weather,events)=>{const env=serviceHub(false),{sim,s}=env;lage(sim,T,{weather:{all:weather},events});
  const o=order(env,{qty:20,due:T+200});sim.step(30);return {s,ts:s.tickets.filter(t=>t.orderId===o)};};
 const rain=one('rain',[]),snow=one('snow',[]),grid=one('clear',[ev('grid',SITE,T,T+60)]),gate=one('clear',[ev('gate',SITE,T,T+60)]);
 assert.equal(rain.ts.length,0,'Regen (1,1) unter Schwelle');
 for(const r of [snow,grid,gate]){assert.equal(r.ts.length,1);assert.equal(r.ts[0].kind,'status');assert.equal(r.ts[0].trigger,'disruption');assert.equal(r.ts[0].respondBy,r.ts[0].createdAt+240);validateState(r.s);}
 // Ohne Störung erst als Risiko 90 Min. vor Frist.
 const none=one('clear',[]);assert.equal(none.ts.length,0);
});

test('Nachprüfung B-0.16-1: Antwort ohne Kundendienstkraft hält die Frist nicht; Ablauf genau einmal, Laden um die Frist bitgleich; mit Kraft fristgerecht', ()=>{
 const run=staff=>{
  const env=serviceHub(staff),{sim,s,k}=env;lage(sim,T);
  const o=order(env,{qty:20,due:T+60});
  assert.ok(until(sim,()=>s.tickets.some(t=>t.orderId===o&&t.kind==='status'),60));
  const t=s.tickets.find(t=>t.orderId===o&&t.kind==='status');cmd(sim,{type:'respondTicket',id:t.id,response:'inform'});
  const score0=s.shippers?.[k.shipper]?.score??50;
  sim.step(t.respondBy-s.t-1);const save=sim.serialize();
  sim.step(5);const x=Simulation.fromJSON(save);x.step(2);const y=reload(x);y.step(3);assert.equal(hash(y),hash(sim),'Laden um die Frist');
  sim.step(600);
  return {t,score:s.shippers?.[k.shipper]?.score,score0,s,o};
 };
 const without=run(false),withStaff=run(true);
 assert.equal(withStaff.t.status,'closed');assert.ok(withStaff.t.completedAt<=withStaff.t.respondBy);assert.equal(withStaff.t.expired,undefined);
 assert.equal(without.t.status,'processing','ohne Kraft bleibt es in Bearbeitung');assert.equal(without.t.expired,true,'Frist verfehlt');
 const ignored=without.s.shippers[without.s.contracts.find(c=>c.id===without.s.orders.find(o=>o.id===without.o).contractId).shipper].ignored;
 assert.ok(ignored>=1);
 assert.equal(without.s.events.filter(e=>e.refs?.includes(without.t.id)&&/nicht fristgerecht/.test(e.text)).length,1,'Ablauf genau einmal gemeldet');
 validateState(without.s);validateState(withStaff.s);
});

test('Angebotswirkung: neue Folgeangebote ab Spieltag 2 mit Preisfaktor 1 + 0,12·(Zufriedenheit − 50)/50 des anbietenden Versenders', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:13}),s=sim.state;cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});
 sim.step(2300-s.t);
 // Testaufbau: Zufriedenheit aller Versender (aus bisherigen Angeboten) gestreut.
 const names=[...new Set(s.contracts.map(k=>k.shipper))];s.shippers={};
 names.forEach((n,i)=>{s.shippers[n]={score:[90,70,30,55,10][i%5],onTime:0,late:0,penalties:0,ignored:0};});
 const seen=new Set(s.contracts.map(k=>k.id));let checked=0;
 for(let i=0;i<4*1440;i++){sim.step(1);for(const k of s.contracts)if(!seen.has(k.id)){seen.add(k.id);
  const score=s.shippers[k.shipper]?.score??50,adj=Math.round(0.12*(score-50)/50*1000)/1000;
  if(adj===0)assert.equal(k.priceAdjust,undefined);else{assert.equal(k.priceAdjust,adj,`${k.shipper} (${score})`);checked++;}}}
 assert.ok(checked>=3,`geprüfte Angebote ${checked}`);validateState(s);
});

test('Kulanz genau einmal je Anliegen, auch über Speichern/Laden; Hinweis: Beschwerde und Teillieferung desselben Auftrags erlauben je eine Kulanz', ()=>{
 const env=serviceHub(true),{sim,s,van}=env;lage(sim,T);
 const o=order(env,{qty:60,due:T+100});
 cmd(sim,{type:'dispatch',orderId:o,vehicleId:van,qty:20});
 const O=()=>s.orders.find(x=>x.id===o);
 assert.ok(until(sim,()=>O().paid>0&&s.t>O().due+1&&s.tickets.some(t=>t.orderId===o&&t.kind==='partial')&&s.tickets.some(t=>t.orderId===o&&t.kind==='complaint'),600),'Teillieferung bezahlt, Anliegen da');
 const ts=s.tickets.filter(t=>t.orderId===o&&['partial','complaint'].includes(t.kind));
 for(const t of ts)cmd(sim,{type:'respondTicket',id:t.id,response:'goodwill'});
 for(const t of ts)assert.equal(sim.command({type:'respondTicket',id:t.id,response:'goodwill'}).ok,false,'zweite Kulanz abgelehnt');
 const x=reload(sim);sim.step(60);x.step(60);assert.equal(hash(x),hash(sim));
 for(const t of ts){const rows=s.ledger.filter(l=>l.key===`ticket-cost:${t.id}`);assert.equal(rows.length,1);assert.equal(rows[0].amount,-Math.min(50,Math.round(O().paid*5)/100));}
 console.log(`# QS-016 Kulanz: ${ts.length} Kulanzzahlungen auf Auftrag mit ${O().paid} € Zahlung (${ts.map(t=>t.kind)})`);
 validateState(s);
});

// ------------------------------------------------------------------------------------------------------------------
// 4. Fixes QS-015-01/03 und B-0.16-2 im Zusammenspiel mit Netzstörung
test('QS-015-01 mit Netzstörung: Energieversorgung (40) deckt Kühlung vor Sortierplatz/Montage; ohne sie keine Kühlung; Nachprüfung B-0.16-2 Entsorgung gesperrter Fremdware', ()=>{
 const make=withPower=>{const sim=new Simulation({mode:'sandbox',seed:3}),s=sim.state;
  const pw=cmd(sim,{type:'build',buildingType:'power',x:12,y:8,rotation:0}).id; // Bau nur mit Energieversorgung möglich
  for(const [t,x,y] of [['coldstore',2,2],['coldstore',6,2],['coldstore',10,2],['coldstore',14,2],['sorter',2,8],['assembly',6,8],['dock',2,12],['forklift',16,12]])cmd(sim,{type:'build',buildingType:t,x,y,rotation:0});
  if(!withPower)cmd(sim,{type:'toggleBuilding',id:pw});
  lage(sim,T,{events:[ev('grid',SITE,T,T+200)]});sim.step(2);return {sim,s};};
 const on=make(true),off=make(false);
 // 4 × 8 kW Kühlung = 32 ≤ 40: versorgt; Sortierplatz/Montage/Dock/Stapler (3+4+1+2) überschreiten → stehen.
 assert.equal(powerBalance(on.s,SITE).shortage,true);assert.equal(coolingCapacity(on.s,SITE),400,'Kühlung vor allen anderen');
 assert.equal(on.s.buildings.find(b=>b.type==='assembly').status,'power','Montage steht (Engpass nach Kühlung und Grundlast)');
 assert.equal(coolingCapacity(off.s,SITE),0);
 // B-0.16-2: gesperrte Fremd-Kühlpakete eines aktiven Auftrags sind entsorgbar, Kühlplatz frei, keine Erstattung.
 const env=hub({warehouse:1});const {sim,s}=env;env.k.content='parcel_cold';cmd(sim,{type:'build',buildingType:'coldstore',x:9,y:6,rotation:0});
 const o=order(env,{qty:30,item:'parcel_cold',stock:0,due:T+5000});
 assert.ok(sim.api.inventory.add({item:'parcel_cold',qty:30,site:SITE,owner:o,location:'stock',quality:60,unitCost:0}));
 const b=s.batches.find(x=>x.owner===o);Object.assign(b,{coldDamaged:true,blocked:true}); // Testaufbau: Kühlschaden (wie nach Netzausfall)
 const m0=s.money;const r=sim.command({type:'disposeBatch',batchId:b.id});
 assert.equal(r.ok,true,r.message);
 assert.equal(s.batches.filter(x=>x.owner===o).reduce((n,x)=>n+x.qty,0),0);assert.equal(s.orders.find(x=>x.id===o).disposedQty,30);
 assert.equal(Math.round((s.money-m0)*100)/100,-60,'nur Entsorgungskosten');assert.equal(sim.command({type:'disposeBatch',batchId:b.id}).ok,false,'nicht doppelt');
 // Vertragsabrechnung (Testaufbau: Abrechnung wieder eingeschaltet, Satz 15 €): entsorgte Menge genau einmal als nicht zugestellt bestraft.
 env.k.penaltyOpen=15;const x=reload(sim);sim.step(5);x.step(5);assert.equal(hash(x),hash(sim));sim.step(1440);
 const pen=s.ledger.filter(l=>l.key===`penalty-open:${o}`);assert.equal(pen.length,1);assert.equal(pen[0].amount,-450);
 assert.equal(s.orders.find(x=>x.id===o).status,'cancelled');assert.equal(s.orders.find(x=>x.id===o).returnedQty,0);
 validateState(s);
});

test('QS-015-03 Storno Lohnfertigung mit Halbfabrikaten und Teilzustellung: Rückgabe ohne Geld, bezahlte Lieferung bleibt; Storno während Beladung abgelehnt', ()=>{
 const LINE=[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11],['rack',2,4],['rack',6,11],['rack',9,11]];
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state;for(const [t,x,y] of LINE)cmd(sim,{type:'build',buildingType:t,x,y,rotation:0});
 for(const role of ['production','warehouse','warehouse','driver']){const id=cmd(sim,{type:'hire',role}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
 const van=cmd(sim,{type:'buyVehicle',vehicleType:'van'}).id;
 let o;assert.ok(until(sim,()=>!!(o=s.orders.find(o=>o.kind==='vas'&&o.status==='offer')),4000),'VAS-Angebot');
 cmd(sim,{type:'acceptOrder',id:o.id});
 // Bis die erste Leuchte fertig ist, dann 1 Stück liefern.
 assert.ok(until(sim,()=>sim.api.inventory.available(o.item,SITE,o.id)>=1,3*1440),'erste Fertigware');
 const sid=cmd(sim,{type:'dispatch',orderId:o.id,vehicleId:van,qty:1}).id;
 assert.equal(sim.command({type:'cancelOrder',id:o.id}).ok,false,'Storno während Beladung abgelehnt');
 assert.ok(until(sim,()=>s.shipments.find(x=>x.id===sid).paid,400),'Teillieferung bezahlt');
 assert.ok(until(sim,()=>s.jobs.some(j=>j.owner===o.id&&j.status!=='storage'),300),'Job läuft');
 const money0=s.money,ledger0=s.ledger.length,paid=o.paid;
 const before=s.batches.filter(b=>b.owner===o.id).reduce((n,b)=>n+b.qty,0);
 cmd(sim,{type:'cancelOrder',id:o.id});
 assert.equal(s.ledger.length,ledger0,'Rückgabe bucht kein Geld');assert.equal(s.money,money0);
 assert.equal(s.batches.filter(b=>b.owner===o.id&&b.qty>0).length,0,'kein Fremdeigentum mehr');
 assert.ok(!s.jobs.some(j=>j.owner===o.id),'Jobs abgebrochen');assert.ok(!s.workers.some(w=>w.task&&s.jobs.every(j=>!w.task.startsWith(j.id))&&w.role==='production'&&w.task.includes(o.id)));
 assert.ok(o.returnedQty>=before,'zurückgegeben inkl. Jobeingänge');assert.equal(o.paid,paid,'bezahlte Lieferung bleibt');
 const x=reload(sim);sim.step(3*1440);x.step(3*1440);assert.equal(hash(x),hash(sim));
 assert.equal(s.batches.filter(b=>b.owner===o.id&&b.qty>0).length,0);assert.ok(!s.purchases.some(p=>p.owner===o.id&&p.status!=='stored'));
 validateState(s);
 console.log(`# QS-016 VAS-Storno: zurückgegeben ${JSON.stringify(o.returnedItems)}, bezahlt ${o.paid} €`);
});
