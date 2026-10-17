// Eigene Prüfungen A08/A07: Luftexport zum fiktiven Frachtterminal (W3c-S1, docs/SCHNITTSTELLEN-0.14-W3c.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import * as AX from '../dist/airexport.js';
import {TERMS,airUnlocked,unitOf,itemOf} from '../dist/contracts.js';
import {VEHICLES} from '../dist/catalog.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const reload=sim=>Simulation.fromJSON(sim.serialize());
function runUntil(sim,cond,max=3000){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);}assert.fail(`Bedingung nicht erreicht (t=${sim.state.t})`);}
const keys=(s,prefix)=>s.ledger.filter(l=>l.key.startsWith(prefix));
const parcels=(s,owner)=>s.batches.filter(b=>b.item==='parcel'&&(!owner||b.owner===owner)).reduce((n,b)=>n+b.qty,0);
const FLIGHT=1290,CUTOFF=90; // 21:30, Annahmeschluss 20:00

/** Ein-Standort-Hub: Dock, 2 Regale, 2 Lagerkräfte, Fahrer, Lkw (+ optional Lieferwagen). Läuft bis zum ersten Luftangebot (23:00 Tag 1). */
function hub({van=false,seed=31}={}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:5,y:2,rotation:0});
 cmd(sim,{type:'hire',role:'warehouse'});cmd(sim,{type:'hire',role:'warehouse'});cmd(sim,{type:'hire',role:'driver'});
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:'truck'}).id,vanId=van?cmd(sim,{type:'buyVehicle',vehicleType:'van'}).id:null;
 runUntil(sim,()=>s.contracts.some(k=>k.unit==='air'));
 return {sim,s,truck,van:vanId,k:s.contracts.find(k=>k.unit==='air')};
}
/** Fixture: Luftvertrag mit festem Flugplan angenommen und gekündigt (keine Ankünfte); Abrechnung Vertragsende aus
 *  (penaltyOpen entfernt), damit Testaufträge über mehrere Tage bestehen. Personal Schicht 'all'. Aufträge mit sortierter Ware direkt im Lager. */
function fixture(opt){
 const env=hub(opt),{sim,s,k}=env;k.flights=[FLIGHT];
 cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});delete k.penaltyOpen;
 for(const w of s.workers)cmd(sim,{type:'setShift',id:w.id,shift:'all'}); // Abendflug 21:30: Personal rund um die Uhr
 sim.step(2040-s.t); // Tag 2, 10:00
 return env;
}
function order(env,{qty,stock=qty,flightT=1440+FLIGHT}){
 const {sim,s,k}=env,id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:'lane-1',customer:`Luftfracht (Testversand ${id})`,item:'parcel',qty,price:k.pricePerParcel,due:flightT-CUTOFF,quality:0,site:'site-1',status:'active',delivered:0,paid:0,airExport:true,flightT});
 if(stock)assert.ok(sim.api.inventory.add({item:'parcel',qty:stock,site:'site-1',owner:id,location:'stock',quality:100,unitCost:0}));
 return id;
}

test('Angebot: Freischaltung mit Dock + Lkw/Lieferwagen; vorher gleicher Zufallsstrom und gleiche Paketangebote (Gegenprobe)',()=>{
 const make=type=>{const sim=new Simulation({mode:'sandbox',seed:5});cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd(sim,{type:'buyVehicle',vehicleType:type});return sim;};
 const a=make('truck'),b=make('refrigerated'); // Kühlfahrzeug schaltet nicht frei
 assert.equal(airUnlocked(a.state),true);assert.equal(airUnlocked(b.state),false);
 a.step(4300-a.state.t);b.step(4300-b.state.t);
 assert.equal(a.state.seed,b.state.seed,'api.random unberührt');
 assert.equal(b.state.contracts.some(k=>k.unit==='air'),false);
 const strip=list=>list.filter(k=>k.unit!=='air').map(({id,...k})=>k);
 assert.deepEqual(strip(a.state.contracts),strip(b.state.contracts),'Paket-/Palettenangebote inhaltlich gleich');
 const air=a.state.contracts.filter(k=>k.unit==='air');assert.ok(air.length>=1);
 for(const k of air){
  assert.equal(itemOf(k),'parcel');assert.equal(unitOf(k),'air');assert.equal(k.offeredAt%1440,TERMS.air.phase);
  assert.ok(TERMS.air.flightPlans.some(p=>JSON.stringify(p)===JSON.stringify(k.flights)));
  assert.ok(k.pricePerParcel>=11&&k.pricePerParcel<=14);assert.equal(k.cutoff,TERMS.air.cutoff);assert.equal(k.penaltyMissed,TERMS.air.penaltyMissed);
  assert.equal(k.lanes.length,1);assert.equal('site' in k.lanes[0],false);assert.equal(k.lanes[0].distance,AX.airportDistance(a.state,'site-1'));
 }
 assert.ok(a.state.contracts.filter(k=>k.status==='offer'&&k.unit==='air').length<=1);
 validateState(a.state);validateState(b.state);
 // Ohne Dock: erst ab Spieltag 4.
 const c=new Simulation({seed:5});c.step(5*1440);
 assert.ok(!c.state.contracts.some(k=>k.unit==='air'&&k.offeredAt<3*1440));assert.ok(c.state.contracts.some(k=>k.unit==='air'));
 // Deterministisch: gleicher Seed → gleiche Luftangebote, auch nach Laden.
 const d=make('truck');d.step(2000-d.state.t);const e=reload(d);d.step(2300);e.step(2300);assert.equal(hash(d),hash(e));
});

test('Ende-zu-Ende: Annahme → Hof → Sortierung → Zubringer → Übergabe, Zahlung genau einmal, Laden in jeder Phase',()=>{
 const scenario=()=>{
  const env=hub();const {sim,s,k}=env;cmd(sim,{type:'acceptContract',id:k.id});
  const orders=()=>s.orders.filter(o=>o.contractId===k.id);
  runUntil(sim,()=>orders().length===k.arrivals.length&&s.yard.filter(a=>a.contractId===k.id).every(a=>a.phase==='gone')&&orders().every(o=>Math.floor(sim.api.inventory.available('parcel','site-1',o.id))===o.qty),4000);
  return {...env,orders};
 };
 const env=scenario(),{sim,s,k,truck,orders}=env;
 const os=orders(),qty=os.reduce((n,o)=>n+o.qty,0),flightT=Math.max(...os.map(o=>o.flightT)),firstCutoff=Math.min(...os.map(o=>o.flightT))-k.cutoff;
 for(const o of os){assert.equal(o.airExport,true);assert.equal(o.due,o.flightT-k.cutoff);assert.ok(k.flights.includes(o.flightT%1440));assert.ok(o.flightT-k.cutoff>=s.t);}
 const money0=s.money;
 const r=cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:flightT%1440,departAt:flightT,site:'site-1'});
 const sh=s.airShuttles[0];assert.equal(r.qty,sh.qty);assert.equal(r.cost,AX.tripCost(s.vehicles.find(v=>v.id===truck),AX.airportDistance(s,'site-1')));
 const loaded=os.filter(o=>o.flightT<=flightT);assert.equal(sh.qty,loaded.reduce((n,o)=>n+o.qty,0));
 assert.equal(s.vehicles.find(v=>v.id===truck).status,'airshuttle');
 // Zustand alle 5 Minuten gültig; Laden in jeder Phase (auch +1 Min.) ergibt denselben Endhash.
 const END=s.t+400,ref=reload(sim),seen=new Set();
 for(;s.t<END;){sim.step(5);validateState(s);seen.add(sh.status);}
 assert.ok(seen.has('transit')&&seen.has('returning')&&seen.has('complete'));
 assert.equal(sh.status,'complete');assert.equal(s.vehicles.find(v=>v.id===truck).status,'idle');
 const want=hash(sim);
 for(const phase of ['loading','transit','handover','returning'])for(const late of [0,1]){
  const x=reload(ref),xs=x.state;runUntil(x,()=>xs.airShuttles[0].status===phase);x.step(late);
  const y=reload(x);y.step(END-y.state.t);assert.equal(hash(y),want,`Phase ${phase}+${late}`);
 }
 // Geld und Mengen
 const pay=keys(s,'air:');assert.equal(pay.length,1);assert.equal(pay[0].key,`air:${sh.id}`);
 const value=Math.round(loaded.reduce((n,o)=>n+o.qty*o.price,0)*100)/100;assert.equal(pay[0].amount,value);assert.equal(sh.invoiceAmount,value);
 assert.equal(keys(s,'air-trip:').length,1);assert.equal(keys(s,'air-missed:').length,0);assert.equal(keys(s,'air-storage:').length,0);
 for(const o of loaded){const now=s.orders.find(x=>x.id===o.id);assert.equal(now.delivered,o.qty);assert.equal(now.status,'fulfilled');assert.equal(now.paid,Math.round(o.qty*o.price*100)/100);assert.equal(parcels(s,o.id),0);}
 assert.ok(sh.deliveredAt<=firstCutoff,'vor Annahmeschluss');assert.equal(sh.qty,qty);
 assert.ok(s.money>money0-1000);assert.equal(qty>=sh.qty,true);
});

test('Verpasster Flug ohne Zubringer: Strafe genau einmal je Auftrag und Flug, Umbuchung, Laden ändert nichts',()=>{
 const env=fixture(),{sim,s,k}=env,a=order(env,{qty:40}),b=order(env,{qty:20,stock:5});
 const oa=s.orders.find(o=>o.id===a),ob=s.orders.find(o=>o.id===b),f1=1440+FLIGHT;
 sim.step(f1-CUTOFF-s.t);assert.equal(keys(s,'air-missed:').length,0,'genau zum Annahmeschluss noch keine Strafe');
 sim.step(1);
 assert.deepEqual(keys(s,'air-missed:').map(l=>[l.key,l.amount]).sort(),[[`air-missed:${a}:${f1}`,-40*k.penaltyMissed],[`air-missed:${b}:${f1}`,-20*k.penaltyMissed]].sort());
 assert.equal(oa.flightT,f1+1440);assert.equal(ob.flightT,f1+1440);assert.equal(oa.missedFlights,1);
 const re=reload(sim);re.step(60);sim.step(60);assert.equal(hash(re),hash(sim));assert.equal(keys(s,'air-missed:').length,2);
 validateState(s);
 // Nächster Flug: Zubringer rechtzeitig → keine weitere Strafe für a; b (nur 5 von 20 da) verpasst erneut mit 15 offenen.
 sim.step(f1+1440-CUTOFF-200-s.t);cmd(sim,{type:'dispatchAirShuttle',vehicleId:env.truck,flight:FLIGHT});
 runUntil(sim,()=>s.airShuttles[0].status==='complete');
 sim.step(Math.max(0,f1+1440-CUTOFF+1-s.t));
 assert.equal(oa.status,'fulfilled');assert.equal(s.ledger.some(l=>l.key===`air-missed:${a}:${f1+1440}`),false);
 /* QS-W3c-01 (A01): höchstens eine Flugstrafe je Auftrag – zweiter verpasster Flug kostet keine weitere Strafe */assert.equal(s.ledger.some(l=>l.key===`air-missed:${b}:${f1+1440}`),false);
 assert.equal(ob.delivered,5);assert.equal(keys(s,'air:').length,1);validateState(s);
});

test('Ankunft nach Annahmeschluss: Ware am Terminal für nächsten Flug, Strafe + Lagergeld genau einmal, Zahlung genau einmal',()=>{
 const env=fixture(),{sim,s,k,truck}=env,a=order(env,{qty:30}),f1=1440+FLIGHT;
 sim.step(f1-CUTOFF-40-s.t); // 40 Min. vor Annahmeschluss: Laden + 57 Min. Fahrt reichen nicht
 cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,departAt:f1});const sh=s.airShuttles[0];
 runUntil(sim,()=>s.t>f1-CUTOFF);
 assert.equal(sh.status,'transit');assert.equal(keys(s,'air-missed:').length,1);assert.equal(keys(s,'air-missed:')[0].key,`air-missed:${a}:${f1}`);
 runUntil(sim,()=>sh.status==='handover');const mid=reload(sim);
 runUntil(sim,()=>sh.status==='returning');
 const o=s.orders.find(o=>o.id===a);
 assert.equal(o.delivered,30);assert.equal(o.status,'fulfilled');assert.equal(sh.orders[0].late,true);assert.equal(sh.orders[0].nextFlightT,f1+1440);
 assert.equal(keys(s,'air-storage:').length,1);assert.equal(keys(s,'air-storage:')[0].amount,-Math.round(30*AX.AIR.storagePerParcel*100)/100);
 assert.equal(keys(s,'air:').length,1);assert.equal(o.paid,Math.round(30*o.price*100)/100);
 // Nach Laden während Übergabe: identischer Verlauf, keine doppelte Buchung.
 runUntil(mid,()=>mid.state.airShuttles[0].status==='returning');assert.equal(hash(mid),hash(sim));
 sim.step(2*1440);assert.equal(keys(s,'air-missed:').length,1);assert.equal(keys(s,'air:').length,1);validateState(s);
});

test('Pflicht: Storno und Wartung nach Reservierung geben Ware, Dock und Personal frei; Neuversuch möglich',()=>{
 const env=fixture({van:true}),{sim,s,truck,van}=env,a=order(env,{qty:100});
 // Storno
 const id=cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT}).id;sim.step(2);
 assert.ok(s.reservations.some(r=>r.job===id));assert.ok(s.buildings.some(b=>b.task===id));assert.ok(s.workers.some(w=>w.task===`${id}:warehouse`));
 assert.equal(sim.command({type:'dispatchAirShuttle',vehicleId:van,flight:FLIGHT}).ok,false,'keine Doppelreservierung');
 cmd(sim,{type:'cancelAirShuttle',id});
 assert.equal(s.reservations.length,0);assert.ok(!s.buildings.some(b=>b.task===id));assert.ok(!s.workers.some(w=>w.task?.startsWith(id)));
 assert.equal(s.vehicles.find(v=>v.id===truck).status,'idle');assert.equal(parcels(s,a),100);validateState(s);
 assert.equal(sim.command({type:'cancelAirShuttle',id}).ok,false);
 // Wartung (extern) bricht den Zubringer vor Abfahrt ab
 s.vehicles.find(v=>v.id===truck).condition=60;
 const id2=cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT}).id;sim.step(1);
 cmd(sim,{type:'serviceVehicleExternal',id:truck});
 const sh2=s.airShuttles.find(x=>x.id===id2);assert.equal(sh2.status,'cancelled');assert.equal(sh2.cancelReason,'Wartung');
 assert.equal(s.vehicles.find(v=>v.id===truck).status,'maintenance');assert.equal(s.reservations.length,0);validateState(s);reload(sim);
 // Lieferwagen übernimmt (Gewichtsgrenze 160 Pakete), danach Lkw nach Wartung den Rest nicht nötig
 const id3=cmd(sim,{type:'dispatchAirShuttle',vehicleId:van,flight:FLIGHT}).id;
 runUntil(sim,()=>s.airShuttles.find(x=>x.id===id3).status==='complete');
 assert.equal(s.orders.find(o=>o.id===a).delivered,100);assert.equal(keys(s,'air:').length,1);assert.equal(keys(s,'air-trip:').length,1);
 // Unterwegs kein Storno
 const b=order(env,{qty:10});const id4=cmd(sim,{type:'dispatchAirShuttle',vehicleId:van,flight:FLIGHT}).id;runUntil(sim,()=>s.airShuttles.find(x=>x.id===id4).status==='transit');
 assert.equal(sim.command({type:'cancelAirShuttle',id:id4}).ok,false);assert.equal(sim.command({type:'maintainVehicle',id:van}).ok,false);
 validateState(s);assert.ok(b);
});

test('Pflicht: Kasse leer bei Abfahrt → wartet ohne Dock, Lagerkraft und Fahrer; Buchung genau einmal',()=>{
 const env=fixture(),{sim,s,truck}=env;order(env,{qty:50});
 const id=cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT}).id,sh=s.airShuttles[0],money=s.money;
 s.money=1;sim.step(sh.remaining+5);
 assert.equal(sh.status,'loading');assert.equal(sh.loadDone,true);assert.equal(sh.blocked,AX.WAIT.cash);
 assert.ok(!s.buildings.some(b=>b.task===id));assert.ok(!s.workers.some(w=>w.task?.startsWith(id)));
 assert.ok(s.reservations.some(r=>r.job===id),'Ware bleibt reserviert');
 const re=reload(sim);validateState(re.state);
 s.money=money;sim.step(1);assert.equal(sh.status,'transit');assert.equal(keys(s,'air-trip:').length,1);
 assert.equal(s.workers.find(w=>w.role==='driver').task,`${id}:driver`);
 runUntil(sim,()=>sh.status==='complete');assert.equal(keys(s,'air-trip:').length,1);assert.equal(keys(s,'air:').length,1);
 // Ohne Fahrer: wartet ohne Dock/Lagerkraft
 order(env,{qty:10});s.workers.find(w=>w.role==='driver').shift='night';sim.step(1);
 const id2=cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT}).id,sh2=s.airShuttles.find(x=>x.id===id2);
 runUntil(sim,()=>sh2.loadDone);sim.step(1);
 if(sh2.status==='loading'){assert.equal(sh2.blocked,AX.WAIT.driver);assert.ok(!s.buildings.some(b=>b.task===id2));assert.ok(!s.workers.some(w=>w.task?.startsWith(id2)));}
 validateState(s);
});

test('Luftaufträge: normale Zustellung, Sammeltour, Fracht und Linie gesperrt; Befehlsprüfung',()=>{
 const env=fixture({van:true}),{sim,s,truck,van}=env,a=order(env,{qty:20}),b=order(env,{qty:20});
 assert.match(sim.command({type:'dispatch',orderId:a,vehicleId:van,qty:5}).message,/Luftexport/);
 assert.match(sim.command({type:'dispatchTour',vehicleId:van,stops:[{orderId:a,qty:5},{orderId:b,qty:5}]}).message,/Luftexport/);
 assert.match(sim.command({type:'bookFreight',orderId:a,mode:'air',qty:5}).message,/Luftexport/);
 const bad=c=>assert.equal(sim.command({type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT,...c}).ok,false);
 bad({vehicleId:'vehicle-999'});bad({flight:600});bad({flight:undefined});bad({departAt:s.t-10,flight:undefined});bad({departAt:1440+FLIGHT,flight:FLIGHT+1});bad({site:'site-999'});bad({departAt:1440+FLIGHT+1,flight:undefined});
 s.vehicles.find(v=>v.id===truck).condition=10;bad({});s.vehicles.find(v=>v.id===truck).condition=100;
 cmd(sim,{type:'buyVehicle',vehicleType:'refrigerated'});bad({vehicleId:s.vehicles.at(-1).id});
 // Flug nach Annahmeschluss-Umbuchung (Auftrag flightT später als gewählter Flug) → nichts zu laden
 s.orders.find(o=>o.id===a).flightT+=1440;s.orders.find(o=>o.id===b).flightT+=1440;bad({});
 s.orders.find(o=>o.id===a).flightT-=1440;s.orders.find(o=>o.id===b).flightT-=1440;
 const r=cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT});assert.equal(r.flight,1440+FLIGHT);assert.equal(r.cutoffAt,1440+FLIGHT-CUTOFF);assert.equal(r.qty,40);
 assert.equal(sim.command({type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT}).message,'Fahrzeug belegt.');
 assert.equal(sim.command({type:'dispatchAirShuttle',vehicleId:van,flight:FLIGHT}).ok,false,'alles schon reserviert');
 validateState(s);
});

test('validate lehnt beschädigte Zubringer, Fahrzeugbindung und Luftaufträge ab',()=>{
 const env=fixture(),{sim,s,truck}=env,a=order(env,{qty:20});cmd(sim,{type:'dispatchAirShuttle',vehicleId:truck,flight:FLIGHT});sim.step(1);
 const text=sim.serialize(),broken=f=>{const x=JSON.parse(text);f(x);assert.throws(()=>validateState(x));};
 validateState(JSON.parse(text));
 broken(x=>{x.vehicles.find(v=>v.id===truck).status='idle';});
 broken(x=>{x.airShuttles[0].qty=21;});
 broken(x=>{x.airShuttles[0].status='transit';});
 broken(x=>{x.reservations=x.reservations.filter(r=>!r.job.startsWith('airshuttle-'));for(const b of x.batches)b.reserved=0;});
 broken(x=>{delete x.orders.find(o=>o.id===a).flightT;});
 broken(x=>{x.orders.find(o=>o.id===a).airExport='ja';});
 broken(x=>{x.contracts.find(k=>k.unit==='air').flights=[2000];});
 broken(x=>{x.airShuttles.push({...x.airShuttles[0],id:'airshuttle-99999'});x.seq=100000;});
 broken(x=>{const v=x.vehicles.find(v=>v.id===truck);x.airShuttles=[];v.status='airshuttle';x.reservations=[];for(const b of x.batches)b.reserved=0;for(const b of x.buildings)b.task=null;});
});

test('Assistent startet den Zubringer über den regulären Befehl rechtzeitig vor Annahmeschluss',()=>{
 const env=fixture(),{sim,s}=env,a=order(env,{qty:30});
 cmd(sim,{type:'setAssistant',site:'site-1',enabled:true,dispatch:true,lines:true,gate:true});
 sim.step(1440+FLIGHT-CUTOFF-s.t);
 const sh=s.airShuttles.find(x=>x.orders.some(y=>y.orderId===a));assert.ok(sh,'Assistent hat Zubringer angelegt');
 runUntil(sim,()=>sh.status==='complete');
 assert.equal(s.orders.find(o=>o.id===a).status,'fulfilled');assert.equal(keys(s,'air-missed:').length,0);assert.ok(sh.deliveredAt<=1440+FLIGHT-CUTOFF);
 assert.ok(s.assistant.log.some(e=>e.kind==='air'));validateState(s);
});
