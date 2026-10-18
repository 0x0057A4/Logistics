// Eigene Prüfungen A05/A08: Warenarten Kühlpaket und Sperrgut (0.15 S2, docs/SCHNITTSTELLEN-0.15.md).
// Kühlpaket: Vertrag nur mit Kühllager/coldchain (Zuschlag), Entladen nur in freie Kühlplätze, Sortierung nur mit Kühllager,
// Zustellung/Linie/Tour nur im Kühlfahrzeug, Temperaturschaden außerhalb der Kühlung (special.js).
// Sperrgut: Vertrag ab Tag 3 oder mit Staplerplatz, nie Sortierung, Handumschlag mit Lagerkraft + Stapler direkt nach stock,
// Lieferwagen nur 3 Stück (Volumen/Gewicht). Container/Luft führen keine Warenarten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import {maxLoad} from '../dist/transport.js';
import {planTour} from '../dist/tours.js';
import {TERMS,itemOf,wareOf,coldUnlocked,bulkyUnlocked,MAX_OFFERS} from '../dist/contracts.js';
import {coolingCapacity,coolingFree} from '../dist/special.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const reload=sim=>Simulation.fromJSON(sim.serialize());
function runUntil(sim,cond,max=4000,each=null){for(let i=0;i<max;i++){if(cond())return i;each?.(sim);sim.step(1);}assert.fail(`Bedingung nicht erreicht (t=${sim.state.t})`);}
const qty=(s,pred)=>s.batches.filter(pred).reduce((n,b)=>n+b.qty,0);

/** Sandbox-Hub: Dock, Regal, n Kühllager, Staplerplatz, Lagerkräfte (Tag+Nacht), Fahrer, Fahrzeuge. Startangebot abgelehnt. */
function hub({cold=0,forklift=false,vehicles=[],warehouse=2,seed=11}={}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 const coldPos=[[6,2],[10,2]];for(let i=0;i<cold;i++)cmd(sim,{type:'build',buildingType:'coldstore',x:coldPos[i][0],y:coldPos[i][1],rotation:0});
 if(forklift)cmd(sim,{type:'build',buildingType:'forklift',x:14,y:2,rotation:0});
 for(let i=0;i<warehouse;i++){const id=cmd(sim,{type:'hire',role:'warehouse'}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
 const driver=cmd(sim,{type:'hire',role:'driver'}).id;cmd(sim,{type:'setShift',id:driver,shift:'all'});
 const ids=vehicles.map(vehicleType=>cmd(sim,{type:'buyVehicle',vehicleType}).id);
 cmd(sim,{type:'cancelContract',id:s.contracts[0].id});
 return {sim,s,vehicles:ids};
}
/** Wartet auf das Warenangebot (eigener Angebotsplatz 06:00) und nimmt es an. */
function acceptWare(sim,ware){
 const s=sim.state;runUntil(sim,()=>s.contracts.some(k=>k.status==='offer'&&wareOf(k)),3*1440);
 const k=s.contracts.find(k=>k.status==='offer'&&wareOf(k));assert.equal(k.content,ware);assert.equal(s.t%1440,TERMS.ware.phase);
 cmd(sim,{type:'acceptContract',id:k.id});return k;
}
/** Zustell-Politik (deterministisch aus dem Zustand): freies Fahrzeug, freie Ware des Auftrags → Lieferung bis maxLoad. */
function deliver(sim){
 const s=sim.state;
 for(const o of s.orders){if(o.status!=='active'||o.kind!=='logistics')continue;
  const free=sim.api.inventory.available(o.item,o.site,o.id),open=o.qty-o.delivered-s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&x.status!=='cancelled').reduce((n,x)=>n+x.qty,0);
  for(const v of s.vehicles){if(v.status!=='idle'||v.condition<15)continue;const n=Math.min(free,open,maxLoad(v,o.item));if(n<1)continue;
   if(sim.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty:n}).ok)break;}}
}

test('Katalog/Kapazität: Kühlpaket nur im Kühlfahrzeug, Sperrgut im Lieferwagen nur 3 Stück, Lkw 133',()=>{
 const {s,vehicles:[van,truck,reefer]}=hub({vehicles:['van','truck','refrigerated']});
 const v=id=>s.vehicles.find(x=>x.id===id);
 assert.equal(maxLoad(v(van),'parcel_cold'),0);assert.equal(maxLoad(v(truck),'parcel_cold'),0);assert.equal(maxLoad(v(reefer),'parcel_cold'),400);
 assert.equal(maxLoad(v(van),'bulky'),3);assert.equal(maxLoad(v(truck),'bulky'),133);
 assert.equal(maxLoad(v(van),'parcel'),160);// Bestand unverändert (Gewicht 80 kg)
});

test('Warenangebote: Freischaltung, eigener Angebotsplatz, Zuschlag, höchstens eines offen, Validierung',()=>{
 // Ohne Kühllager/Forschung und vor Tag 3 ohne Staplerplatz: kein Warenangebot.
 const a=hub();assert.equal(coldUnlocked(a.s),false);assert.equal(bulkyUnlocked(a.s),false);
 a.sim.step(2*1440-a.s.t+300);assert.ok(!a.s.contracts.some(k=>wareOf(k)),'vor Freischaltung kein Warenangebot');
 // Tag 3: Sperrgut freigeschaltet.
 a.sim.step(120);assert.equal(bulkyUnlocked(a.s),true);const b=a.s.contracts.find(k=>wareOf(k));
 assert.equal(b.content,'bulky');assert.equal(itemOf(b),'bulky');assert.equal(b.offeredAt,2*1440+TERMS.ware.phase);
 const [lo,hi]=TERMS.ware.bulky.units;assert.ok(b.arrivals.every(x=>x.parcels>=lo&&x.parcels<=hi));
 assert.equal(b.penaltyLate,TERMS.penalty.bulky.late);assert.equal(b.surcharge,undefined);
 // Kühllager: Kühlangebot mit Zuschlag im Preis.
 const c=hub({cold:1});assert.equal(coldUnlocked(c.s),true);const k=acceptWare(c.sim,'parcel_cold');
 const [p0,st,n]=TERMS.ware.parcel_cold.price,sur=TERMS.ware.parcel_cold.surcharge;
 assert.equal(k.surcharge,sur);assert.ok(k.pricePerParcel>=p0+sur&&k.pricePerParcel<=p0+st*n+sur);assert.equal(k.offeredAt,1440+TERMS.ware.phase);
 // Höchstens ein offenes Warenangebot; zählt nicht zu MAX_OFFERS.
 const e=hub({cold:1,forklift:true});for(let h=0;h<24*10;h++){e.sim.step(60);const open=e.s.contracts.filter(k=>k.status==='offer');
  // Warenangebote nach Sichtung ablehnen, damit der Platz täglich neu zieht (beide Arten erscheinen).
  if(h%24===23)for(const k of open.filter(k=>wareOf(k)&&e.s.t-k.offeredAt>600))cmd(e.sim,{type:'cancelContract',id:k.id});assert.ok(open.filter(k=>wareOf(k)).length<=1);assert.ok(open.filter(k=>k.unit!=='air'&&!wareOf(k)).length<=MAX_OFFERS);}
 assert.ok(e.s.events.some(x=>x.text.startsWith('Neues Vertragsangebot (Sperrgut'))&&e.s.events.some(x=>x.text.startsWith('Neues Vertragsangebot (Kühlpakete')),'beide Warenarten angeboten');
 assert.doesNotThrow(()=>validateState(e.s));
 // Validierung lehnt Warenfelder an falscher Stelle ab.
 const bad=(f)=>{const x=JSON.parse(e.sim.serialize());f(x);assert.throws(()=>validateState(x));};
 runUntil(e.sim,()=>e.s.contracts.some(k=>wareOf(k)),1440);const wi=e.s.contracts.findIndex(k=>wareOf(k));
 bad(x=>{x.contracts[wi].content='kaputt';});
 bad(x=>{x.contracts[wi].surcharge=-2;});
 bad(x=>{x.contracts[wi].unit='air';});
});

test('E2E Kühlpaket: Vertrag → Kühllager-Entladung → Sortierung → Kühlfahrzeug → Zahlung; Speichern/Laden in jeder Phase',()=>{
 const {sim,s}=hub({cold:2,vehicles:['refrigerated','van']});
 const k=acceptWare(sim,'parcel_cold');
 runUntil(sim,()=>s.yard.some(a=>a.contractId===k.id));
 const a=s.yard.find(a=>a.contractId===k.id);assert.equal(a.item,'parcel_cold');
 const orders=s.orders.filter(o=>o.contractId===k.id);assert.ok(orders.every(o=>o.item==='parcel_cold'&&o.price>=k.pricePerParcel));
 // Laden in jeder Phase: Zustand bei jedem Phasenwechsel sichern, am Ende identisch weiterlaufen lassen.
 const snaps=[],seen=new Set();
 const phase=()=>{const sh=s.shipments.find(x=>x.orderId===orders[0].id&&x.status!=='complete');return `${a.phase}|${sh?.status||'-'}|${s.sorting?.sites['site-1']?.hand||'-'}`;};
 const each=()=>{const p=phase();if(!seen.has(p)){seen.add(p);snaps.push([s.t,sim.serialize()]);}deliver(sim);};
 const done=()=>orders.every(o=>o.status==='fulfilled')&&s.shipments.filter(x=>orders.some(o=>o.id===x.orderId)).every(x=>x.paid);
 runUntil(sim,done,3000,each);
 const end=s.t,final=sim.serialize();
 assert.ok(snaps.length>=8,`Phasen gesichert: ${[...seen].join(', ')}`);
 for(const [t,text] of snaps){const r=Simulation.fromJSON(text);for(let m=t;m<end;m++){deliver(r);r.step(1);}assert.equal(r.serialize(),final,`Laden bei t=${t}`);}
 // Ware: alle Kühlpakete gekühlt eingelagert, nie gesperrt, nie im Lieferwagen.
 assert.ok(s.batches.filter(b=>b.item==='parcel_cold').every(b=>!b.coldDamaged&&b.peakTemperature<=8));
 const vans=new Set(s.vehicles.filter(v=>v.type==='van').map(v=>v.id));assert.ok(!s.shipments.some(x=>vans.has(x.vehicleId)));
 assert.equal(qty(s,b=>orders.some(o=>o.id===b.owner)),0);
 // Umsatz enthält den Kühlzuschlag.
 const paid=orders.reduce((n,o)=>n+o.paid,0),units=orders.reduce((n,o)=>n+o.qty,0);assert.ok(paid>=units*k.pricePerParcel*0.9-1e-6);
 assert.doesNotThrow(()=>validateState(s));
});

/** Fixture wie pallet-own: Aufträge ohne Vertrag mit Warenart, Ankunft über yard.schedule. */
function arrive(sim,qtys,item,eta=sim.state.t+20){const s=sim.state,ids=qtys.map((q,i)=>{const id=sim.api.id('order');
  s.orders.push({id,kind:'logistics',source:'hub',lane:`lane-${i}`,customer:`Gebiet ${i+1} (Testversand)`,item,qty:q,price:20,due:eta+600,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});return id;});
 return yard.schedule(s,sim.api,{contractId:'vertrag-test',site:s.selectedSite,parcels:qtys.reduce((n,q)=>n+q,0),eta,orderIds:ids});}

test('Kühlpaket ohne Kühllager: Wartegrund „Kühllager fehlt“, keine Lagerkraft gebunden; Bau setzt fort; voll → „Kühllager voll“',()=>{
 const {sim,s}=hub();const a=arrive(sim,[60,60],'parcel_cold');
 runUntil(sim,()=>a.phase==='unloading');sim.step(3);
 assert.equal(a.unloaded,0);assert.equal(a.waitReason,'Kühllager fehlt');assert.equal(a.waitReason,yard.WAIT.coldMissing);
 assert.ok(!s.workers.some(w=>w.task===`${a.id}:warehouse`));
 assert.doesNotThrow(()=>validateState(reload(sim).state));
 cmd(sim,{type:'build',buildingType:'coldstore',x:6,y:2,rotation:0});assert.equal(coolingCapacity(s,'site-1'),100);
 runUntil(sim,()=>a.waitReason==='Kühllager voll');
 assert.equal(a.unloaded,100);assert.equal(coolingFree(s,'site-1'),0);assert.ok(!s.workers.some(w=>w.task===`${a.id}:warehouse`));
 // Sortierung bewegt Kühlpakete inbound → stock (beide gekühlt); Platz bleibt belegt.
 runUntil(sim,()=>qty(s,b=>b.item==='parcel_cold'&&b.location==='inbound')===0);
 assert.equal(qty(s,b=>b.item==='parcel_cold'&&b.location==='stock'),100);
 sim.step(5);assert.ok(s.batches.filter(b=>b.item==='parcel_cold'&&b.qty>0).every(b=>b.cooled===true));
 // Zweites Kühllager → Rest entladen.
 cmd(sim,{type:'build',buildingType:'coldstore',x:10,y:2,rotation:0});runUntil(sim,()=>a.phase==='exit');assert.equal(a.unloaded,120);
 assert.doesNotThrow(()=>validateState(s));
});

test('Kühlpakete werden ohne Kühllager nicht sortiert; Temperaturschaden außerhalb der Kühlung sperrt die Charge',()=>{
 const {sim,s}=hub({cold:1});const store=s.buildings.find(b=>b.type==='coldstore');
 const a=arrive(sim,[40],'parcel_cold');runUntil(sim,()=>a.phase==='docking');
 // Kühllager ausschalten, bevor entladen wird: Lkw wartet.
 cmd(sim,{type:'toggleBuilding',id:store.id});sim.step(3);assert.equal(a.waitReason,'Kühllager außer Betrieb');assert.equal(a.unloaded,0);
 cmd(sim,{type:'toggleBuilding',id:store.id});runUntil(sim,()=>a.phase==='exit');
 const before=qty(s,b=>b.item==='parcel_cold'&&b.location==='inbound');
 // Ausfall nach Entladen (vor Sortierung): keine Sortierung, Temperatur steigt, Qualität sinkt, Sperre.
 cmd(sim,{type:'toggleBuilding',id:store.id});const sorted=s.sorting?.sites['site-1']?.total||0;
 sim.step(30);assert.equal(s.sorting?.sites['site-1']?.total||0,sorted,'ohne Kühllager keine Sortierung');
 assert.ok(before>0);const cold=s.batches.filter(b=>b.item==='parcel_cold'&&b.qty>0);
 assert.ok(cold.every(b=>b.cooled===false&&b.temperature>8&&b.quality<100));
 runUntil(sim,()=>cold.every(b=>b.coldDamaged),600);
 assert.ok(cold.every(b=>b.blocked&&b.quality<70));
 // Gesperrte Ware ist nicht zustellbar.
 const v=cmd(sim,{type:'buyVehicle',vehicleType:'refrigerated'}).id;
 assert.equal(sim.command({type:'dispatch',orderId:a.orderIds[0],vehicleId:v,qty:10}).ok,false);
 assert.doesNotThrow(()=>validateState(reload(sim).state));
});

test('Kühlpaket: Lieferwagen/Lkw abgelehnt (Lieferung und Tour)',()=>{
 const {sim,s,vehicles:[van,truck]}=hub({cold:1,vehicles:['van','truck']});
 const a=arrive(sim,[30,30],'parcel_cold');runUntil(sim,()=>a.phase==='exit');
 runUntil(sim,()=>qty(s,b=>b.item==='parcel_cold'&&b.location==='stock')===60);
 for(const v of [van,truck])assert.equal(sim.command({type:'dispatch',orderId:a.orderIds[0],vehicleId:v,qty:5}).ok,false);
 const plan=planTour(s,truck,a.orderIds.map(orderId=>({orderId,qty:5})));assert.equal(plan.ok,false);
});

test('E2E Sperrgut: Vertrag → Stapler-Handumschlag direkt nach stock (nie Sortierung) → Lkw → Zahlung; Speichern/Laden in jeder Phase',()=>{
 const {sim,s,vehicles:[van,truck]}=hub({forklift:true,vehicles:['van','truck']});
 const k=acceptWare(sim,'bulky');assert.equal(k.offeredAt,1440+TERMS.ware.phase,'Staplerplatz schaltet vor Tag 3 frei');
 runUntil(sim,()=>s.yard.some(a=>a.contractId===k.id&&a.phase==='unloading'));
 const a=s.yard.find(a=>a.contractId===k.id),fork=s.buildings.find(b=>b.type==='forklift');
 assert.equal(a.item,'bulky');sim.step(1);
 assert.equal(fork.task,`${a.id}:forklift`);assert.ok(s.workers.some(w=>w.task===`${a.id}:warehouse`));
 assert.ok(a.unloaded>=1&&a.unloaded<=3,'Handumschlag: kleine Rate (2/min vor workRate)');
 assert.equal(qty(s,b=>b.item==='bulky'&&b.location==='inbound'),0);
 // Lieferwagen: höchstens 3 Stück.
 const o=s.orders.find(o=>o.contractId===k.id);
 runUntil(sim,()=>a.phase==='exit');assert.equal(fork.task,null);
 assert.equal(qty(s,b=>b.item==='bulky'&&b.location==='inbound'),0);assert.equal(qty(s,b=>b.item==='bulky'&&b.location==='stock'),a.parcels);
 assert.equal(s.sorting,undefined,'Sortierung nie beteiligt');
 assert.equal(sim.command({type:'dispatch',orderId:o.id,vehicleId:van,qty:4}).ok,false);
 const snaps=[],seen=new Set(),orders=s.orders.filter(x=>x.contractId===k.id);
 const each=()=>{const sh=s.shipments.find(x=>x.status!=='complete');const p=`${sh?.status||'-'}|${s.vehicles.find(v=>v.id===truck).status}|${fork.task?'fork':'-'}`;if(!seen.has(p)){seen.add(p);snaps.push([s.t,sim.serialize()]);}deliver(sim);};
 runUntil(sim,()=>orders.every(x=>x.status==='fulfilled')&&s.shipments.every(x=>x.paid),3000,each);
 const end=s.t,final=sim.serialize();assert.ok(snaps.length>=5,[...seen].join(', '));
 for(const [t,text] of snaps){const r=Simulation.fromJSON(text);for(let m=t;m<end;m++){deliver(r);r.step(1);}assert.equal(r.serialize(),final,`Laden bei t=${t}`);}
 // Beladung mit Stapler: Lieferungen des Lkw nutzten den Staplerumschlag; Lieferwagen höchstens 3 je Fahrt.
 assert.ok(s.shipments.filter(x=>x.vehicleId===van).every(x=>x.qty<=3));
 assert.ok(s.shipments.some(x=>x.vehicleId===truck));
 assert.doesNotThrow(()=>validateState(s));
});

test('Sperrgut ohne Stapler: Wartegrund „Kein Stapler“ beim Entladen und Beladen, keine Lagerkraft gebunden',()=>{
 const {sim,s,vehicles:[truck]}=hub({vehicles:['truck']});const a=arrive(sim,[6],'bulky');
 runUntil(sim,()=>a.phase==='unloading');sim.step(3);
 assert.equal(a.unloaded,0);assert.equal(a.waitReason,'Kein Stapler');assert.ok(!s.workers.some(w=>w.task===`${a.id}:warehouse`));
 cmd(sim,{type:'build',buildingType:'forklift',x:14,y:2,rotation:0});runUntil(sim,()=>a.phase==='exit');
 const fork=s.buildings.find(b=>b.type==='forklift');cmd(sim,{type:'toggleBuilding',id:fork.id});
 const sh=cmd(sim,{type:'dispatch',orderId:a.orderIds[0],vehicleId:truck,qty:6}).id;sim.step(3);
 const x=s.shipments.find(x=>x.id===sh);assert.equal(x.status,'loading');assert.equal(x.blocked,'Kein Stapler');
 assert.ok(!s.workers.some(w=>w.task===`${sh}:warehouse`));
 cmd(sim,{type:'toggleBuilding',id:fork.id});runUntil(sim,()=>x.status==='transit');
});

test('Linie: Sperrgut am Ziel direkt nach stock (Stapler), Kühlpakete nur mit Kühlfahrzeug und Kühllager am Ziel',()=>{
 const sim=new Simulation({mode:'sandbox',seed:5}),s=sim.state,A='site-1',B=cmd(sim,{type:'buySite',name:'Ziel-Hub Erlengrund'}).id;
 for(const site of [A,B]){cmd(sim,{type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'forklift',site,x:9,y:6,rotation:0});
  for(const role of ['warehouse','driver']){const id=cmd(sim,{type:'hire',role,site}).id;cmd(sim,{type:'setShift',id,shift:'all'});}}
 cmd(sim,{type:'build',buildingType:'coldstore',site:A,x:6,y:2,rotation:0});
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:'truck',site:A}).id,reefer=cmd(sim,{type:'buyVehicle',vehicleType:'refrigerated',site:A}).id;
 const k=s.contracts[0];cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});
 k.lanes=[{id:'lane-1',name:'Nahbezirk',distance:20,site:A},{id:'lane-2',name:'Fernbezirk',distance:25,site:B}];k.laneShare=[0.5,0.5];
 // Testaufbau: Vertragsaufträge Richtung B mit Ware im Lager A (Vertragsinhalt passend gesetzt).
 const order=(item,q,kc=k)=>{const id=sim.api.id('order');s.orders.push({id,kind:'logistics',source:'hub',contractId:kc.id,lane:'lane-2',customer:'Fernbezirk (Testversand)',item,qty:q,price:9,due:s.t+900,quality:0,site:A,deliverySite:B,status:'active',delivered:0,paid:0});
  assert.ok(sim.api.inventory.add({item,qty:q,site:A,owner:id,location:'stock',quality:100,unitCost:0}));return id;};
 k.content='bulky';const bulky=order('bulky',10);
 const dep=(s.t+60)%1440;const lb=cmd(sim,{type:'createLine',from:A,to:B,departures:[dep],vehicleId:truck}).id;
 runUntil(sim,()=>s.linehauls.some(x=>x.lineId===lb&&x.status==='returning'));
 const lh=s.linehauls.find(x=>x.lineId===lb);assert.equal(lh.pallet,true,'Staplerumschlag');
 assert.equal(qty(s,b=>b.owner===bulky&&b.site===B&&b.location==='stock'),10);assert.equal(qty(s,b=>b.owner===bulky&&b.location==='inbound'),0);
 // Kühlpakete: B ohne Kühllager → Linie nimmt sie nicht mit (auch nicht im Kühlfahrzeug).
 // Testaufbau: zweiter (beendeter) Vertrag mit Inhalt Kühlpaket, gleiche Gebiete.
 const k2={...JSON.parse(JSON.stringify(k)),id:sim.api.id('contract'),content:'parcel_cold'};s.contracts.push(k2);const cold=order('parcel_cold',20,k2);
 const lc=lb,missed=s.lines[0].missed||0;runUntil(sim,()=>s.vehicles.find(v=>v.id===truck).status==='idle');cmd(sim,{type:'updateLine',id:lc,vehicleId:reefer,departures:[(s.t+60)%1440]});
 runUntil(sim,()=>s.lines.find(l=>l.id===lc).missed>missed,200);assert.equal(s.lines.find(l=>l.id===lc).wait,'Keine Sendungen zum Ladeschluss');
 cmd(sim,{type:'build',buildingType:'coldstore',site:B,x:6,y:2,rotation:0});
 cmd(sim,{type:'updateLine',id:lc,departures:[(s.t+60)%1440]});// nächste Abfahrt vor Vertragsabrechnung (openGrace)
 runUntil(sim,()=>s.linehauls.some(x=>x.lineId===lc&&x.status==='returning'),200);
 assert.equal(qty(s,b=>b.owner===cold&&b.site===B&&['inbound','stock'].includes(b.location)),20);
assert.ok(s.batches.filter(b=>b.owner===cold&&b.qty>0).every(b=>!b.coldDamaged&&b.peakTemperature<=8));
 assert.doesNotThrow(()=>validateState(s));
});

test('Container und Luftexport führen keine Warenarten (begründet gesperrt)',()=>{
 const {sim,s}=hub({cold:1,forklift:true});sim.step(8*1440);
 for(const k of s.contracts){if(k.unit==='container')assert.ok(['pallet','parcel'].includes(k.content));if(k.unit==='air')assert.equal(itemOf(k),'parcel');}
 assert.ok(s.contracts.some(k=>wareOf(k)));
 const x=JSON.parse(sim.serialize()),c=x.contracts.find(k=>k.content==='bulky')||x.contracts.find(k=>k.content==='parcel_cold');c.unit='container';
 assert.throws(()=>validateState(x));
});
