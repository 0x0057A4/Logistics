// Befundbehebung 0.16b (A06/A08/A05):
//  1. Staplerfahrer beim Be-/Entladen eigener Fahrzeuge (transport/tours/linehaul) mit Spezialistenrate (workforce.forkStep).
//  2. B-0.16-1: Antwortfrist eines Kundendienst-Anliegens erst mit abgeschlossener Bearbeitung erfüllt.
//  3. B-0.16-2: Gesperrte Fremdware (Kühlschaden) entsorgbar; Menge gilt als nicht zustellbar, Kühlplatz wird frei.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import {forkStep,afterStep,workRate} from '../dist/workforce.js';
import {RESPONSE_MINUTES} from '../dist/customer-service.js';
import {SATISFACTION} from '../dist/contracts.js';
import {coolingUsed} from '../dist/special.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const reload=sim=>Simulation.fromJSON(sim.serialize());
function runUntil(sim,cond,max=3000){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);}assert.fail(`Bedingung nicht erreicht (t=${sim.state.t})`);}
const qty=(s,pred)=>s.batches.filter(pred).reduce((n,b)=>n+b.qty,0);

// ---------------------------------------------------------------------------------------------------------------- 1 (A06)
/** Zwei Standorte (wie linehaul-own): A mit Dock, Regalen, Stapler, Lkw, Fahrpersonal; B als Linienziel. Umschlagkraft an A und B
 *  ist entweder eine Lagerkraft oder ein Staplerfahrer. Palettenaufträge mit Ware direkt im Lager. */
function palletEnv(role){
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,A='site-1',B=cmd(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(const site of [A,B]){cmd(sim,{type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'forklift',site,x:9,y:6,rotation:0});}
 cmd(sim,{type:'build',buildingType:'rack',site:A,x:5,y:2,rotation:0});
 for(const site of [A,B]){const w=cmd(sim,{type:'hire',role,site}).id;cmd(sim,{type:'setShift',id:w,shift:'all'});const d=cmd(sim,{type:'hire',role:'driver',site}).id;cmd(sim,{type:'setShift',id:d,shift:'all'});}
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:'truck',site:A}).id;
 const k=s.contracts[0];cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});k.settled=true;
 k.unit='pallet';k.lanes=[{id:'lane-1',name:'Nahbezirk',distance:20,site:A},{id:'lane-2',name:'Fernbezirk',distance:25,site:B}];k.laneShare=[0.5,0.5];
 const order=(n,to=A)=>{const id=sim.api.id('order');
  s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:to===B?'lane-2':'lane-1',customer:`${to===B?'Fernbezirk':'Nahbezirk'} (Testversand)`,item:'pallet',qty:n,price:9,due:9000,quality:0,site:A,deliverySite:to,status:'active',delivered:0,paid:0});
  assert.ok(sim.api.inventory.add({item:'pallet',qty:n,site:A,owner:id,location:'stock',quality:100,unitCost:0}));return id;};
 return {sim,s,A,B,truck,order};
}
/** Minuten bis zum Ende der Lade-/Entladezeit eines Eintrags (Personal und Stapler durchgehend verfügbar). */
function loadMinutes(sim,entry,doneWhen){const start=entry().remaining,n=runUntil(sim,()=>doneWhen(entry()));return {n,start};}

test('forkStep: Staplerfahrer Mittel 1,25 ganzzahlig, Lagerkraft/ohne Person genau 1; afterStep nie negativ, bei 1 exakt',()=>{
 const fk={role:'forklift',skill:1,fatigue:0},wh={role:'warehouse',skill:1.5,fatigue:0};
 let sum=0;for(let t=480;t<520;t++){const d=forkStep(fk,t);assert.ok(Number.isInteger(d)&&d>=1);assert.equal(d,workRate(fk,1,'forklift',t));sum+=d;}
 assert.equal(sum,50);
 for(let t=480;t<520;t++){assert.equal(forkStep(wh,t),1,'Lagerkraft (auch erfahren) unverändert 1/min');assert.equal(forkStep(null,t),1);}
 assert.equal(afterStep(5,1),4);assert.equal(afterStep(1,2),0);assert.equal(afterStep(3,2),1);
});

test('Eigene Lkw-Beladung (transport) mit Staplerfahrer im Mittel 1,25× schneller; Lagerkraft unverändert; Mengen und Speichern/Laden',()=>{
 const run=role=>{
  const {sim,s,truck,order}=palletEnv(role),o=order(20);
  const id=cmd(sim,{type:'dispatch',orderId:o,vehicleId:truck,qty:20}).id,sh=()=>s.shipments.find(x=>x.id===id);
  sim.step(1);assert.equal(s.workers.find(w=>w.task===`${id}:warehouse`)?.role,role,'gebundene Umschlagkraft');
  const mid=reload(sim);
  const r=loadMinutes(sim,sh,e=>e.status!=='loading');
  assert.equal(qty(s,b=>b.owner===o&&b.location==='vehicle'),20,'gesamte Ladung im Fahrzeug');
  // Laden mitten in der Beladung setzt bitgleich fort.
  runUntil(mid,()=>mid.state.t===s.t);assert.equal(hash(mid),hash(sim));validateState(s);
  return r;
 };
 const base=run('warehouse'),spec=run('forklift');
 assert.equal(base.start,5,'2+20/5 Minuten, eine davon vor Messbeginn');
 assert.equal(base.n,base.start,'Lagerkraft: genau 1 Restminute je Arbeitsminute (wie bisher)');
 assert.ok(spec.n<base.n,`Staplerfahrer ${spec.n} < Lagerkraft ${base.n} Arbeitsminuten (vorher gleich)`);
 assert.ok(spec.n>=Math.ceil(base.start/2),'höchstens 2 Restminuten je Minute');
});

test('Sammeltour (tours) und Linienfahrt (linehaul): Staplerfahrer verkürzt Lade-/Entladezeit, Lagerkraft unverändert',()=>{
 const tour=role=>{
  const {sim,s,truck,order}=palletEnv(role),a=order(8),b=order(8);
  const id=cmd(sim,{type:'dispatchTour',vehicleId:truck,stops:[{orderId:a,qty:8},{orderId:b,qty:8}]}).id,t=()=>s.tours.find(x=>x.id===id);
  const init=t().remaining,r=loadMinutes(sim,t,e=>e.status!=='loading');
  assert.equal(qty(s,x=>[a,b].includes(x.owner)&&x.location==='vehicle'),16);validateState(s);
  return {n:r.n,init};
 };
 const tb=tour('warehouse'),ts=tour('forklift');
 assert.equal(tb.n,tb.init,'Tour mit Lagerkraft wie bisher');
 assert.ok(ts.n<tb.n,`Tour: Staplerfahrer ${ts.n} < ${tb.n}`);

 const line=role=>{
  const {sim,s,A,B,truck,order}=palletEnv(role),o=order(12,B);
  cmd(sim,{type:'createLine',from:A,to:B,departures:[(s.t%1440)+120],vehicleId:truck});
  runUntil(sim,()=>s.linehauls?.length>0);const lh=()=>s.linehauls[0];
  const load=loadMinutes(sim,lh,e=>e.loadDone||e.status!=='loading');
  runUntil(sim,()=>lh().status==='unloading');const mid=reload(sim);
  const unload=loadMinutes(sim,lh,e=>e.remaining===0||e.status!=='unloading');
  runUntil(sim,()=>lh().status!=='unloading');
  assert.equal(qty(s,b=>b.owner===o&&b.site===B&&b.location==='stock'),12,'Paletten am Ziel eingelagert');
  runUntil(mid,()=>mid.state.t===s.t);assert.equal(hash(mid),hash(sim),'Laden mitten im Entladen bitgleich');validateState(s);
  return {load:load.n,loadInit:load.start,unload:unload.n,unloadInit:unload.start};
 };
 const lb=line('warehouse'),ls=line('forklift');
 assert.equal(lb.load,lb.loadInit,'Linie Beladung mit Lagerkraft wie bisher');assert.equal(lb.unload,lb.unloadInit,'Linie Entladung mit Lagerkraft wie bisher');
 assert.ok(ls.load<lb.load,`Linie Beladung: ${ls.load} < ${lb.load}`);assert.ok(ls.unload<lb.unload,`Linie Entladung: ${ls.unload} < ${lb.unload}`);
});

// ---------------------------------------------------------------------------------------------------------------- 2 (A08)
function serviceHub(staff){
 const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state;
 for(const c of [{type:'build',buildingType:'dock',x:2,y:13,rotation:0},{type:'build',buildingType:'rack',x:8,y:2,rotation:0},{type:'hire',role:'warehouse'},{type:'hire',role:'driver'},{type:'buyVehicle',vehicleType:'van'}])cmd(sim,c);
 if(staff)cmd(sim,{type:'hire',role:'service'});
 const c=s.contracts[0];cmd(sim,{type:'acceptContract',id:c.id});
 runUntil(sim,()=>s.yard.length&&s.yard[0].phase==='gone'&&s.orders.filter(o=>o.contractId===c.id).every(o=>qty(s,b=>b.owner===o.id&&b.location==='stock')===o.qty),4000);
 const o=s.orders.find(o=>o.contractId===c.id);o.due=s.t+100000;
 const id=cmd(sim,{type:'createTicket',orderId:o.id,kind:'status'}).id,t=s.tickets.find(x=>x.id===id);
 return {sim,s,c,o,t};
}

test('B-0.16-1: Antwort ohne Kundendienstkraft erfüllt die Frist nicht mehr; Ablauf wie unbeantwortet, genau einmal, Speichern/Laden',()=>{
 const {sim,s,c,t}=serviceHub(false);
 cmd(sim,{type:'respondTicket',id:t.id,response:'inform'});sim.step(1);
 assert.equal(t.status,'processing');assert.match(t.blocked,/Kundendienstpersonal/);
 runUntil(sim,()=>s.t===t.respondBy);assert.equal(t.expired,undefined,'bis zur Frist kein Ablauf');
 const expired=()=>s.tickets.filter(x=>x.expired&&s.orders.find(y=>y.id===x.orderId).contractId===c.id).length,mid=reload(sim);
 sim.step(1);
 assert.equal(t.expired,true,'Frist abgelaufen, obwohl geantwortet (vorher: entfiel)');
 assert.equal(s.shippers[c.shipper].ignored,expired(),'Zufriedenheit wie unbeantwortet gesenkt (je abgelaufenem Anliegen einmal)');
 assert.ok(s.events.some(e=>e.refs?.includes(t.id)&&e.text.includes('nicht fristgerecht bearbeitet')));
 sim.step(300);
 assert.equal(s.shippers[c.shipper].ignored,expired(),'nicht erneut gezählt');assert.equal(t.status,'processing');
 validateState(s);
 // Speichern/Laden kurz vor Ablauf: identischer Fortgang.
 mid.step(301);assert.equal(hash(mid),hash(sim));
 // Später eingestellte Kraft schließt das Anliegen ab; Erfüllung danach nur „beantwortet“, keine Rücknahme der Strafe.
 cmd(sim,{type:'hire',role:'service'});runUntil(sim,()=>t.status==='closed');
 assert.ok(t.completedAt>t.respondBy);assert.equal(t.expired,true);
 assert.equal(s.ledger.filter(l=>l.key==='ticket-cost:'+t.id).length,0,'Auskunft kostenlos');
 validateState(reload(sim).state);
 // Import: Ablaufkennzeichen bei fristgerechtem Abschluss wird abgewiesen.
 const state=JSON.parse(sim.serialize()),x=state.tickets.find(y=>y.id===t.id);x.completedAt=x.respondBy;x.startedAt=Math.min(x.startedAt,x.respondBy-15);
 assert.throws(()=>Simulation.fromJSON(JSON.stringify(state)));
});

test('B-0.16-1: Mit Kundendienstkraft fristgerecht abgeschlossen → kein Ablauf, Zufriedenheit steigt (bestehender Ablauf)',()=>{
 const {sim,s,c,t}=serviceHub(true);
 cmd(sim,{type:'respondTicket',id:t.id,response:'inform'});runUntil(sim,()=>t.status==='closed');
 assert.ok(t.completedAt<=t.respondBy);
 runUntil(sim,()=>s.t>t.respondBy+5);assert.equal(t.expired,undefined);
 assert.equal(s.shippers[c.shipper].ignored??0,0);assert.ok(s.shippers[c.shipper].score>=SATISFACTION.start);
 validateState(reload(sim).state);
 assert.equal(RESPONSE_MINUTES.status,240);
});

// ---------------------------------------------------------------------------------------------------------------- 3 (A05)
/** Kühlvertrag (beendet, noch nicht abgerechnet) mit einem aktiven Auftrag und dessen Kühlpaketen im Kühllager. */
function coldEnv(){
 const sim=new Simulation({mode:'sandbox',seed:23}),s=sim.state,A='site-1';
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:13,rotation:0});cmd(sim,{type:'build',buildingType:'coldstore',x:8,y:2,rotation:0});
 const w=cmd(sim,{type:'hire',role:'warehouse'}).id;cmd(sim,{type:'setShift',id:w,shift:'all'});
 const k=s.contracts[0];cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});
 k.content='parcel_cold';k.surcharge=7.5;k.penaltyOpen=15;
 const id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:k.lanes[0].id,customer:'Kühlkunde (Testversand)',item:'parcel_cold',qty:30,price:9,due:s.t+600,quality:0,site:A,status:'active',delivered:0,paid:0});
 const [good]=[sim.api.inventory.add({item:'parcel_cold',qty:20,site:A,owner:id,location:'stock',quality:100,unitCost:0})];
 const bad=sim.api.inventory.add({item:'parcel_cold',qty:10,site:A,owner:id,location:'stock',quality:100,unitCost:0});
 assert.ok(good&&bad);
 Object.assign(bad,{quality:60,coldDamaged:true,blocked:true,temperature:12,peakTemperature:14,exposure:90});
 sim.step(1);validateState(s);
 return {sim,s,k,o:s.orders.find(o=>o.id===id),bad,good,A};
}

test('B-0.16-2: Gesperrte Fremdware belegt Kühlplatz; Entsorgung gibt ihn frei, Menge nicht zustellbar, Strafe genau einmal',()=>{
 const {sim,s,k,o,bad,A}=coldEnv();
 const used=coolingUsed(s,A);assert.ok(used>=30,'gesperrte Fremdware belegt Kühlplätze (Fehlerfall)');
 const money=s.money;
 assert.equal(sim.command({type:'disposeBatch',batchId:bad.id}).ok,true,'Fremdware eines aktiven Auftrags entsorgbar (vorher abgelehnt)');
 assert.equal(bad.qty,0);assert.equal(coolingUsed(s,A),used-10,'Kühlplatz frei');
 assert.equal(o.disposedQty,10);assert.equal(o.delivered,0);
 const rows=s.ledger.filter(l=>l.key==='dispose:'+bad.id);assert.equal(rows.length,1);assert.equal(rows[0].amount,-20,'Entsorgung 2 €/Stk. wie Eigenware');
 assert.equal(Math.round((money-s.money)*100)/100,20,'Geldbilanz: nur Entsorgungsgebühr, keine Erstattung');
 assert.equal(sim.command({type:'disposeBatch',batchId:bad.id}).ok,false,'nicht doppelt');
 // Gute Fremdware und Fremdware ohne Kühlschaden bleiben nicht entsorgbar.
 const good=s.batches.find(b=>b.owner===o.id&&b.qty>0&&!b.coldDamaged);assert.equal(sim.command({type:'disposeBatch',batchId:good.id}).ok,false);
 const saved=reload(sim);validateState(saved.state);
 // Abrechnung über den vorhandenen Pfad: offene 30 (inkl. 10 entsorgte) bestraft, 20 an Versender zurück.
 runUntil(sim,()=>k.settled,4000);runUntil(saved,()=>saved.state.contracts.find(x=>x.id===k.id).settled,4000);
 assert.equal(hash(saved),hash(sim),'Speichern/Laden nach Entsorgung bitgleich');
 const pen=s.ledger.filter(l=>l.key===`penalty-open:${o.id}`);assert.equal(pen.length,1);assert.equal(pen[0].amount,-30*15);
 assert.equal(o.status,'cancelled');assert.equal(o.returnedQty,20);
 // Mengenbilanz: angeliefert 30 = zugestellt 0 + zurück 20 + entsorgt 10, kein Restbestand.
 assert.equal(o.delivered+o.returnedQty+o.disposedQty,30);assert.equal(qty(s,b=>b.owner===o.id),0);
 validateState(s);
});

test('B-0.16-2: Reservierte oder fremde Ware stornierter/fremder Eigentümer bleibt geschützt',()=>{
 const {sim,s,o,bad}=coldEnv();
 bad.reserved=1;assert.equal(sim.command({type:'disposeBatch',batchId:bad.id}).ok,false,'reserviert');bad.reserved=0;
 o.status='cancelled';assert.equal(sim.command({type:'disposeBatch',batchId:bad.id}).ok,false,'kein aktiver Auftrag');o.status='active';
 bad.location='inbound';assert.equal(sim.command({type:'disposeBatch',batchId:bad.id}).ok,true,'gesperrte Fremdware im Wareneingang');
 assert.equal(o.disposedQty,10);
});
