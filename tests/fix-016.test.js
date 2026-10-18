// A04/A05 · 0.16 S4: Befunde QS-015-01 (Energie-Lastverteilung mit Vorrang Kühlung) und QS-015-03 (Storno Lohnfertigung
// gibt Fremdeigentum zurück). Grundlage docs/SCHNITTSTELLEN-0.16.md S4, docs/QS-0.15.md.
// Nur reguläre Befehle; Ausnahmen sind am Test vermerkt (Lastrechnung an Zustandsattrappen, Altspielstand-Nachbildung).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import {BUILDINGS} from '../dist/catalog.js';
import {coolingCapacity,powerBalance} from '../dist/special.js';

const SITE='site-1';
const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
function until(sim,cond,max,each){for(let i=0;i<max;i++){if(cond())return true;each?.(sim);sim.step(1);}return cond();}

// ------------------------------------------------------------------------------------------------------------------
// QS-015-01 Lastverteilung. Zustandsattrappe {sites,buildings}: coolingCapacity liest nur diese beiden Listen.
const B=(type,i,extra={})=>({id:`b-${i}`,type,site:SITE,enabled:true,condition:100,...extra});
const st=(energy,types)=>({sites:[{id:SITE,energy}],buildings:types.map((t,i)=>typeof t==='string'?B(t,i):B(t[0],i,t[1]))});
/** Bisherige Regel (0.15) zum Vergleich ohne Engpass. */
function oldCapacity(s){const en=s.buildings.filter(b=>b.enabled&&b.condition>0),sup=s.sites[0].energy+en.reduce((n,b)=>n+(BUILDINGS[b.type].energy||0),0),dem=en.reduce((n,b)=>n+(BUILDINGS[b.type].power||0),0);
 return sup<dem?0:en.filter(b=>b.type==='coldstore').reduce((n,b)=>n+BUILDINGS[b.type].capacity,0);}

test('QS-015-01: ohne Engpass identisch zur bisherigen Regel (alle Kombinationen bis Angebot = Last)', ()=>{
 const pool=['dock','coldstore','assembly','research','coldstore','packing','terminal','power','coldstore',['coldstore',{enabled:false}],['coldstore',{condition:0}]];
 let checked=0;
 for(let mask=0;mask<1<<pool.length;mask++){const s=st(30,pool.filter((_,i)=>mask>>i&1));const p=powerBalance(s,SITE);
  if(p.shortage)continue;checked++;assert.equal(coolingCapacity(s,SITE),oldCapacity(s),`Maske ${mask}`);}
 assert.ok(checked>100,`${checked} Kombinationen ohne Engpass`);
 assert.equal(coolingCapacity(st(30,[]),'site-x'),0,'unbekannter Standort');
});

test('QS-015-01: Engpass – Kühlung zuerst, stehende Verbraucher nehmen ihr nichts weg; Teilversorgung in Gebäudereihenfolge', ()=>{
 // Lage aus dem Befund: Quergurt 12 + Labor 4 + Rampe 1 + 2 Kühllager 16 = 33 > 30 → alt 0, neu 200.
 const s=st(30,['dock','research','crossbelt','coldstore','coldstore']);
 assert.equal(oldCapacity(s),0);assert.equal(coolingCapacity(s,SITE),200);assert.equal(powerBalance(s,SITE).shortage,true);
 // 4 Kühllager (32) bei 30 kW: drei versorgt, das vierte (letzte in Gebäudereihenfolge) nicht.
 const four=st(30,['coldstore','coldstore','coldstore','coldstore','assembly']);
 assert.equal(coolingCapacity(four,SITE),300);assert.deepEqual(powerBalance(four,SITE).cooling.map(b=>b.id),['b-0','b-1','b-2']);
 // Angebot kleiner als ein Kühllager: keine Kühlung, nie negativ.
 assert.equal(coolingCapacity(st(5,['coldstore','dock']),SITE),0);
 // Energiegebäude zählt zum Angebot; ausgeschaltete/defekte Kühllager zählen weder als Last noch als Kapazität.
 assert.equal(coolingCapacity(st(0,['power','coldstore','crossbelt','crossbelt','crossbelt','coldstore']),SITE),200);
 assert.equal(coolingCapacity(st(8,[['coldstore',{enabled:false}],'coldstore','sorter']),SITE),100);
});

test('QS-015-01 integriert: Ausfall der Energieversorgung mit Fertigungslinie – Maschinen stehen „power“, Kühllager bleibt, Laden bitgleich', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:5}),s=sim.state;
 const pw=cmd(sim,{type:'build',buildingType:'power',x:16,y:2,rotation:0}).id;
 for(const [t,x,y] of [['dock',2,11],['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['coldstore',8,6],['coldstore',12,6],['research',15,12],['terminal',2,6]])cmd(sim,{type:'build',buildingType:t,x,y,rotation:0});
 sim.step(2);assert.equal(coolingCapacity(s,SITE),200);
 cmd(sim,{type:'toggleBuilding',id:pw});sim.step(2);
 const p=powerBalance(s,SITE);assert.equal(p.shortage,true,`Angebot ${p.supply} < Last ${p.demand}`);
 assert.ok(s.buildings.some(b=>BUILDINGS[b.type].recipes.length&&b.status==='power'),'mindestens eine Maschine ohne Strom');
 assert.equal(coolingCapacity(s,SITE),200,'Kühlung hat Vorrang');
 const a=Simulation.fromJSON(sim.serialize());a.step(30);sim.step(30);assert.equal(hash(a),hash(sim));validateState(s);
});

// ------------------------------------------------------------------------------------------------------------------
// QS-015-03 Storno Lohnfertigung. Gleiche Fertigungslinie wie qa-015 (Seed 31).
const LINE=[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11],['rack',2,4],['rack',6,11],['rack',9,11]];
function factory(seed){
 const sim=new Simulation({mode:'sandbox',seed});for(const [t,x,y] of LINE)cmd(sim,{type:'build',buildingType:t,x,y,rotation:0});
 for(const role of ['production','warehouse','warehouse']){const id=cmd(sim,{type:'hire',role,site:SITE}).id;cmd(sim,{type:'setShift',id,shift:'all'});}
 return sim;
}
const vasOffer=sim=>{const s=sim.state;let o;assert.ok(until(sim,()=>!!(o=s.orders.find(o=>o.kind==='vas'&&o.status==='offer')),4000),'VAS-Angebot');return o;};
const byItem=list=>{const m={};for(const x of list)if(x.qty>0)m[x.item]=Math.round(((m[x.item]||0)+x.qty)*1e6)/1e6;return m;};
const held=(s,owner)=>byItem(s.batches.filter(b=>b.owner===owner));
const refsOf=(s,id)=>s.ledger.filter(l=>l.refs?.includes(id));
function noNegative(s,label){for(const b of s.batches){assert.ok(b.qty>=-1e-9,`${label}: Charge ${b.id} negativ`);assert.ok(b.reserved<=b.qty+1e-7,`${label}: ${b.id} überreserviert`);}}
/** Nach dem Storno: kein Fremdeigentum, kein Job, keine Reservierung/Bindung, keine offene Anlieferung des Auftrags. */
function clean(s,o,jobIds=[],label=''){
 assert.deepEqual(held(s,o.id),{},`${label} Kundeneigentum im Lager`);
 assert.equal(s.jobs.filter(j=>j.owner===o.id).length,0,`${label} Job des Auftrags`);
 for(const id of jobIds){assert.equal(s.reservations.some(r=>r.job===id),false,`${label} Reservierung ${id}`);assert.equal(s.workers.some(w=>w.task===id),false,`${label} Bindung ${id}`);assert.equal(s.buildings.some(b=>b.job===id),false,`${label} Anlage hält ${id}`);}
 assert.equal(s.purchases.some(p=>p.orderId===o.id&&p.status!=='stored'),false,`${label} offene Anlieferung`);
}

test('QS-015-03: Storno direkt nach Annahme – Anlieferungen entfallen, keine Ware, keine Geldbuchung, Laden bitgleich', ()=>{
 const sim=factory(31),s=sim.state;const o=vasOffer(sim);cmd(sim,{type:'acceptOrder',id:o.id});
 const pids=s.purchases.filter(p=>p.orderId===o.id).map(p=>p.id);assert.equal(pids.length,Object.keys(o.materials).length);
 const money0=s.money,ledger0=s.ledger.length,company0=held(s,'company');
 cmd(sim,{type:'cancelOrder',id:o.id});
 assert.equal(o.status,'cancelled');assert.equal(s.purchases.some(p=>pids.includes(p.id)),false,'Kundenanlieferungen storniert');
 assert.equal(s.money,money0,'Storno bucht kein Geld');assert.equal(s.ledger.length,ledger0);
 assert.ok(s.events.some(e=>e.text?.includes(`Storno Lohnfertigung ${o.id}`)&&e.text.includes('Anlieferung')),'Protokoll der Stornierung');
 const saved=sim.serialize();
 sim.step(1440);clean(s,o,[],'nach 1 Tag');
 assert.equal(o.returnedQty??0,0,'nichts zurückzugeben');
 for(const id of pids)assert.equal(refsOf(s,id).length,0,'keine Buchung zur Anlieferung');
 assert.deepEqual(held(s,'company'),company0,'Eigenmaterial unverändert');
 const b=Simulation.fromJSON(saved);b.step(1440);assert.equal(hash(b),hash(sim),'Laden nach Storno bitgleich');validateState(s);
});

test('QS-015-03: Storno während laufender Fertigung – Job abgebrochen, Reservierung/Personal frei, Mengenbilanz, Eigenmaterial und Fremdauftrag unberührt', ()=>{
 const sim=factory(31),s=sim.state;
 // Eigenmaterial am Lager (owner company) und ein laufender Bestand, der nicht angetastet werden darf.
 for(const item of ['housing','board','carton'])cmd(sim,{type:'buy',item,qty:10,supplier:'standard'});
 const o=vasOffer(sim);cmd(sim,{type:'acceptOrder',id:o.id});
 let job=null;
 assert.ok(until(sim,()=>!!(job=s.jobs.find(j=>j.owner===o.id&&j.remaining<j.duration))&&s.jobs.some(j=>j.owner===o.id),1440),'laufender Lohnfertigungsjob');
 const before=sim.serialize();
 const runningIds=s.jobs.filter(j=>j.owner===o.id).map(j=>j.id),workerOf=new Map(s.jobs.filter(j=>j.owner===o.id).map(j=>[j.id,j.worker]));
 const expect=byItem([...s.batches.filter(b=>b.owner===o.id),...s.jobs.filter(j=>j.owner===o.id).flatMap(j=>j.inputs)]);
 const company0=held(s,'company'),companyJobs=s.jobs.filter(j=>!j.owner).map(j=>j.id),money0=s.money,ledger0=s.ledger.length,rep0=s.reputation;
 cmd(sim,{type:'cancelOrder',id:o.id});
 clean(s,o,runningIds,'sofort');
 assert.deepEqual(o.returnedItems,expect,'Rückgabe = Bestand + Eingänge laufender Jobs (Mengenbilanz)');
 assert.ok(Math.abs(o.returnedQty-Object.values(expect).reduce((n,x)=>n+x,0))<1e-6);
 assert.deepEqual(held(s,'company'),company0,'Eigenmaterial unverändert');
 assert.deepEqual(s.jobs.filter(j=>!j.owner).map(j=>j.id),companyJobs,'eigene Jobs unverändert');
 assert.equal(s.money,money0,'keine Geldbuchung');assert.equal(s.ledger.length,ledger0);assert.equal(s.reputation,rep0-3,'bestehende Rufregel');
 for(const [,w] of workerOf)if(w){const x=s.workers.find(x=>x.id===w);assert.ok(!x.task||!runningIds.includes(x.task),'Fertigungskraft frei');}
 for(const b of s.buildings)if(BUILDINGS[b.type].recipes.length&&!b.job)assert.notEqual(b.status,'working');
 validateState(s);
 // Weiterlaufen: keine Ausgabe für den stornierten Auftrag, Linie arbeitet mit Eigenmaterial weiter, nie negativ.
 const saved=sim.serialize();
 for(let i=0;i<1440;i++){sim.step(1);if(s.t%5===0){noNegative(s,`t=${s.t}`);assert.deepEqual(held(s,o.id),{},`t=${s.t} Kundeneigentum`);}}
 assert.equal(s.jobs.some(j=>j.owner===o.id),false);validateState(s);
 const x=Simulation.fromJSON(saved);x.step(1440);assert.equal(hash(x),hash(sim),'Laden nach Storno bitgleich');
 // Laden vor dem Storno und gleiches Storno → derselbe Zustand.
 const y=Simulation.fromJSON(before);cmd(y,{type:'cancelOrder',id:o.id});y.step(1440);assert.equal(hash(y),hash(sim),'Storno nach Laden bitgleich');
});

test('QS-015-03: Storno während der Anlieferung (Charge inbound, Lagerkraft gebunden) und anderer Lohnfertigungsauftrag bleibt unberührt', ()=>{
 const sim=factory(31),s=sim.state;const o1=vasOffer(sim);cmd(sim,{type:'acceptOrder',id:o1.id});
 assert.ok(until(sim,()=>s.purchases.filter(p=>p.orderId===o1.id).every(p=>p.status==='stored'),600),'Material Auftrag 1 eingelagert');
 const o2=vasOffer(sim);cmd(sim,{type:'acceptOrder',id:o2.id});
 let p=null;assert.ok(until(sim,()=>!!(p=s.purchases.find(p=>p.orderId===o2.id&&['receiving','checking','storing'].includes(p.status))),600),'Anlieferung Auftrag 2 läuft');
 const pid=p.id,batchId=p.batchId;assert.ok(s.workers.some(w=>w.task===pid));
 const o1Held=held(s,o1.id),o1Jobs=s.jobs.filter(j=>j.owner===o1.id).map(j=>j.id);
 cmd(sim,{type:'cancelOrder',id:o2.id});
 assert.equal(s.purchases.some(x=>x.id===pid),false,'laufende Anlieferung storniert');
 assert.equal(s.workers.some(w=>w.task===pid),false,'Lagerkraft frei');
 assert.equal(s.batches.find(b=>b.id===batchId).qty,0,'Charge der Anlieferung abgegangen');
 clean(s,o2,[],'Auftrag 2');
 assert.deepEqual(held(s,o1.id),o1Held,'Auftrag 1: Bestand unverändert');
 assert.deepEqual(s.jobs.filter(j=>j.owner===o1.id).map(j=>j.id),o1Jobs,'Auftrag 1: Jobs unverändert');
 validateState(s);
 sim.step(600);noNegative(s,'Ende');assert.deepEqual(held(s,o2.id),{});
 assert.ok(o1.status==='active'&&(Object.keys(held(s,o1.id)).length||s.jobs.some(j=>j.owner===o1.id)||o1.delivered>0),'Auftrag 1 läuft weiter');
});

test('QS-015-03: Spielstand von vor 0.16 (storniert ohne Rückgabe) wird zur nächsten vollen Stunde bereinigt', ()=>{
 const sim=factory(31),s=sim.state;const o=vasOffer(sim);cmd(sim,{type:'acceptOrder',id:o.id});
 assert.ok(until(sim,()=>s.purchases.filter(p=>p.orderId===o.id).every(p=>p.status==='stored')&&s.jobs.some(j=>j.owner===o.id),900));
 // Ausnahme: Altzustand nachgebildet (Status wie früheres cancelOrder ohne Rückgabe), dann über Speichern/Laden.
 o.status='cancelled';
 const old=Simulation.fromJSON(sim.serialize()),t=old.state;const left=held(t,o.id);assert.ok(Object.keys(left).length);
 assert.ok(until(old,()=>t.t%60===1,61));
 const ord=t.orders.find(x=>x.id===o.id);clean(t,ord,[],'nach Nachlese');assert.ok(ord.returnedQty>0);validateState(t);
 const money=t.money;old.step(120);assert.ok(t.ledger.filter(l=>l.refs?.includes(o.id)).length===0,'keine Geldbuchung zum Auftrag');void money;
});
