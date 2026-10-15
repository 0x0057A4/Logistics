// A11 · unabhängige QS Welle 0 (0.9): Laufzeitindexe (A03), Determinismus, Laden/Weiterspielen, forecast,
// Rückruf über Nullchargen, Speichern/Migration (A12), HUD-Kennzahlen gegen eigene Rechnung (A10).
// Eigene Referenzformeln, keine Übernahme der Entwicklerprüfungen. Befundtests: test.todo bzw. { todo } mit Verweis auf docs/QS-0.9-W0.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,migrate} from '../dist/core.js';
import {ITEMS,BUILDINGS} from '../dist/catalog.js';
import {onShift} from '../dist/workforce.js';
import * as P from './perf-scenarios.mjs';
import {boot} from './ui-harness.js';

const hash=t=>createHash('sha256').update(t).digest('hex');
const STORED=new Set(['stock','inbound','quarantine']);
const refUsed=(s,site)=>s.batches.filter(b=>b.site===site&&STORED.has(b.location)).reduce((n,b)=>n+b.qty,0);
const refCap=(s,site)=>40+s.buildings.filter(b=>b.site===site).reduce((n,b)=>n+(BUILDINGS[b.type]?.capacity||0),0);
const refAvail=(s,item,site,owner='company')=>s.batches.filter(b=>b.item===item&&b.site===site&&b.owner===owner&&b.location==='stock'&&!b.locked&&!b.blocked).reduce((n,b)=>n+b.qty-b.reserved,0);
function checkIndex(sim,tag){
 const s=sim.state,inv=sim.api.inventory,owners=new Set(['company',...s.batches.map(b=>b.owner)]);
 for(const site of s.sites){
  assert.equal(inv.used(site.id),refUsed(s,site.id),`${tag}: used ${site.id}`);
  assert.equal(inv.capacity(site.id),refCap(s,site.id),`${tag}: capacity ${site.id}`);
  for(const item of Object.keys(ITEMS))for(const owner of owners)assert.equal(inv.available(item,site.id,owner),refAvail(s,item,site.id,owner),`${tag}: available ${item}@${site.id}/${owner}`);
 }
}
// Lauf mit Spielerpolitik; reloadEvery: Spielstand serialisieren und neu laden (wie Neuladen/Import der App).
function play(make,minutes,{reloadEvery=0,check=false,warm=0}={}){
 const sc=make();let reloads=0;
 // services(): plan() hält eine Referenz auf die ursprüngliche Simulation → Vorlauf ohne Laden, danach plan aus.
 if(warm){P.run(sc,warm);sc.plan=null;sc.offset=(sc.offset||0)+warm;}
 for(let i=0;i<minutes;i++){
  sc.plan?.(i);P.policy(sc.sim,(sc.offset||0)+i,sc.opts);
  if(check&&i%7===0)checkIndex(sc.sim,'vor Schritt '+i);
  sc.sim.step(1);
  if(check&&i%7===3)checkIndex(sc.sim,'nach Schritt '+i);
  if(reloadEvery&&(i+1)%reloadEvery===0){sc.sim=Simulation.fromJSON(sc.sim.serialize());reloads++;if(check)checkIndex(sc.sim,'nach Laden '+i);}
 }
 return {hash:hash(sc.sim.serialize()),sim:sc.sim,reloads};
}

test('QS-W0 Index: Laden-Weiterspielen-Laden ergibt denselben Zustand wie ein durchgehender Lauf (klein, 900 Min., 25 Ladevorgänge)',()=>{
 const a=play(()=>P.small(),900),b=play(()=>P.small(),900,{reloadEvery:36});
 assert.equal(b.reloads,25);assert.equal(b.hash,a.hash);
});

test('QS-W0 Index: Dienste-Szenario (Tour, Retoure, Rückruf, Kühlkette, Fracht; 300 Min. Vorlauf) mit Laden alle 17 Min. und Indexprüfung gegen lineare Formeln',()=>{
 const a=play(()=>P.services(),400,{warm:300}),b=play(()=>P.services(),400,{warm:300,reloadEvery:17,check:true});
 assert.equal(b.hash,a.hash);
});

test('QS-W0 Index: großer Stand mit 3.000 Nullchargen, Laden alle 50 Min., Index stimmt nach jedem Laden',()=>{
 const make=()=>P.large(4242,{warmup:200,history:3000});
 const a=play(make,300),b=play(make,300,{reloadEvery:50,check:true});
 assert.equal(b.hash,a.hash);
});

test('QS-W0 Determinismus: 1× (step 1) gegen 12× (step 12) gegen Einzelschritt 600 gleicher Endhash; auch nach Laden',()=>{
 const base=P.small(91);P.run(base,120);const text=base.sim.serialize();
 const x=Simulation.fromJSON(text);for(let i=0;i<600;i++)x.step(1);
 const y=Simulation.fromJSON(text);for(let i=0;i<50;i++)y.step(12);
 const z=Simulation.fromJSON(text);z.step(600);
 // Unregelmäßige Takte wie app.js (floor(accumulator/1000) je 100-ms-Tick): 0..3 Minuten je Tick
 const w=Simulation.fromJSON(text);let left=600,k=0;while(left>0){const n=Math.min(left,[1,0,2,1,3,1,0,1][k++%8]);w.step(n);left-=n;}
 assert.equal(hash(y.serialize()),hash(x.serialize()));assert.equal(hash(z.serialize()),hash(x.serialize()));assert.equal(hash(w.serialize()),hash(x.serialize()));
});

test('QS-W0 forecast: nach 1.000 gespielten Minuten entspricht forecast(480) exakt echtem Weiterlaufen; Original unverändert; Index danach korrekt',()=>{
 const sc=P.services();P.run(sc,1000);const before=sc.sim.serialize();
 const f=sc.sim.forecast(480);assert.equal(sc.sim.serialize(),before,'forecast verändert Original');
 checkIndex(sc.sim,'nach forecast');
 sc.sim.step(480);assert.equal(hash(JSON.stringify(f)),hash(sc.sim.serialize()));
 // forecast mit Befehl gegen echte Ausführung
 const g=sc.sim.forecast(200,[{type:'hire',role:'production'}]);const r=sc.sim.command({type:'hire',role:'production'});assert.ok(r.ok);sc.sim.step(200);
 assert.equal(hash(JSON.stringify(g)),hash(sc.sim.serialize()));
});

test('QS-W0 Rückruf über Nullchargen: betroffene Menge = eigene Vorfahrenrechnung, Sperre wirkt in derselben Minute auf available',()=>{
 const sc=P.large(4242,{warmup:200,history:3000}),s=sc.sim.state;
 // Historische Nullcharge mit den meisten Nachfahren wählen
 const kids=new Map();for(const b of s.batches)for(const p of b.parents)(kids.get(p)||kids.set(p,[]).get(p)).push(b.id);
 const desc=id=>{const out=new Set([id]),q=[id];while(q.length){for(const k of kids.get(q.pop())||[])if(!out.has(k)){out.add(k);q.push(k);}}return out;};
 const zero=s.batches.filter(b=>b.qty===0&&kids.has(b.id)).map(b=>[b,desc(b.id)]).sort((a,b)=>b[1].size-a[1].size)[0];
 assert.ok(zero&&zero[1].size>3,'Kette mit Nachfahren vorhanden');
 // Eine aktive Charge an diese Kette hängen (über die Lager-API als Fixture), damit available betroffen ist.
 const child=sc.sim.api.inventory.add({item:'housing',qty:5,quality:90,unitCost:10,site:zero[0].site,location:'stock',owner:'company',parents:[[...zero[1]].at(-1)]});
 assert.ok(child,'Fixture-Charge angelegt');
 for(const p of child.parents)(kids.get(p)||kids.set(p,[]).get(p)).push(child.id);
 const availBefore=sc.sim.api.inventory.available('housing',zero[0].site);
 const r=sc.sim.command({type:'recallBatch',batchId:zero[0].id});assert.ok(r.ok,r.message);
 const recall=s.recalls.find(x=>x.id===r.id),expect=desc(zero[0].id);
 assert.deepEqual(new Set(recall.batches),expect);
 assert.ok(s.batches.find(b=>b.id===child.id).blocked);
 assert.equal(sc.sim.api.inventory.available('housing',zero[0].site),availBefore-5);
 checkIndex(sc.sim,'nach Rückruf');
 // Neue Charge aus gesperrtem Elternteil erbt Sperre; nach Laden identisch
 const heir=sc.sim.api.inventory.add({item:'housing',qty:1,site:zero[0].site,location:'stock',parents:[child.id]});
 assert.equal(heir.blocked,true);assert.ok(recall.batches.includes(heir.id));
 const re=Simulation.fromJSON(sc.sim.serialize());checkIndex(re,'Rückruf nach Laden');
 assert.equal(re.command({type:'recallBatch',batchId:zero[0].id}).ok,false,'Doppelrückruf abgelehnt');
});

test('QS-W0 Index: Bau/Abriss eines Regals in derselben Minute aktualisiert capacity sofort',()=>{
 const sim=new Simulation({mode:'sandbox',seed:5}),inv=sim.api.inventory;
 assert.equal(inv.capacity('site-1'),40);
 const id=sim.command({type:'build',buildingType:'rack',x:2,y:2,rotation:0}).id;assert.equal(inv.capacity('site-1'),refCap(sim.state,'site-1'));
 assert.ok(sim.command({type:'move',id,x:6,y:2}).ok);assert.equal(inv.capacity('site-1'),refCap(sim.state,'site-1'));
 assert.ok(sim.command({type:'demolish',id}).ok);assert.equal(inv.capacity('site-1'),40);
});

// Befund QS-W0-07 (niedrig, A03): In-place-Tausch zweier Chargen (gleiche Referenz, Länge, letztes Element) wurde
// nicht erkannt. Behoben: Positionsprüfung der aktiven Chargen bei jeder Auffrischung (dist/inventory.js, regroup).
test('QS-W0 Befund 07: In-place-Umsortierung von s.batches → FIFO folgt nach der nächsten Spielminute der neuen Reihenfolge',()=>{
 const sim=new Simulation({mode:'sandbox',seed:5}),inv=sim.api.inventory,s=sim.state;
 const a=inv.add({item:'housing',qty:2,site:'site-1'}),b=inv.add({item:'housing',qty:2,site:'site-1'});inv.add({item:'board',qty:1,site:'site-1'});
 inv.available('housing','site-1');sim.step(1);inv.available('housing','site-1');
 const ia=s.batches.indexOf(a),ib=s.batches.indexOf(b);s.batches[ia]=b;s.batches[ib]=a;sim.step(1);
 assert.ok(inv.reserve('housing',2,'site-1','job-x'));
 assert.equal(s.reservations.at(-1).batchId,b.id,'FIFO nach Arrayreihenfolge erwartet');
});

test('QS-W0 Migration: Schema-1-Stand ohne optionale Listen lädt, gleicher Verlauf wie Original; fehlerhafter Stand setzt wasValidated nicht',()=>{
 const sc=P.services();P.run(sc,120);const full=JSON.parse(sc.sim.serialize());
 const stripped=JSON.parse(sc.sim.serialize());for(const k of ['research','rules'])if(Array.isArray(stripped[k])&&!stripped[k].length)delete stripped[k];
 const a=Simulation.fromJSON(JSON.stringify(full)),b=Simulation.fromJSON(JSON.stringify(stripped));a.step(200);b.step(200);
 // Schlüsselreihenfolge unterscheidet sich (migrate hängt Listen an) → kanonischer Vergleich
 const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([p],[q])=>p<q?-1:p>q?1:0)):x);
 assert.equal(hash(canon(a.state)),hash(canon(b.state)));
 const good=sc.sim.serialize();Simulation.fromJSON(good);assert.ok(Simulation.wasValidated(good));
 const bad=good.replace('"schema":1','"schema":2');assert.throws(()=>Simulation.fromJSON(bad));
 assert.ok(!Simulation.wasValidated(bad));assert.ok(Simulation.wasValidated(good),'letzter gültiger Text bleibt');
 assert.equal(migrate(null),null);assert.deepEqual(migrate({schema:3,x:1}),{schema:3,x:1});
});

const text=(ui,id)=>ui.nodes.get('#'+id).textContent;
const fmt=v=>Number(v).toLocaleString('de-DE',{maximumFractionDigits:0});
test('QS-W0 HUD: Kennzahlen nach 600 Min. Betrieb gegen eigene Rechnung aus state (Kasse, Uhr, Lager, Personal, Rampen, Fahrzeuge, Glocke)',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');ui.click('buy-kit');
 const o=ui.run("sim.state.orders.find(o=>o.kind==='manufacturing').id");ui.click('accept',o);
 for(let i=0;i<600;i++)ui.run('sim.step(1)');ui.run('render(true)');
 const s=JSON.parse(ui.run('sim.serialize()')),site=s.selectedSite;
 assert.equal(text(ui,'cash'),Number(s.money).toLocaleString('de-DE',{maximumFractionDigits:2})+' €');
 const used=refUsed(s,site),cap=refCap(s,site);assert.equal(text(ui,'sbStock'),`Lager ${fmt(used)}/${fmt(cap)}`);
 const staff=s.workers.filter(w=>w.site===site);assert.equal(text(ui,'sbStaff'),`Personal ${staff.filter(w=>onShift(w,s.t)).length}/${staff.length} im Dienst`);
 const docks=s.buildings.filter(b=>b.site===site&&b.type==='dock');assert.equal(text(ui,'sbDocks'),`Rampen ${docks.filter(b=>b.task).length}/${docks.length}`);
 assert.equal(text(ui,'sbVehicles'),`Fahrzeuge ${s.vehicles.filter(v=>v.site===site&&v.status!=='rentalReturned').length}`);
 const blocked=s.buildings.filter(b=>['materials','staff','power','storage','broken'].includes(b.status)).length;
 const late=s.orders.filter(o=>o.status==='active'&&(o.late||s.t>o.due)).length;
 assert.ok(Number(text(ui,'bellCount')||0)>=blocked+late,'Glocke zählt mindestens blockierte Anlagen und Fristüberschreitungen');
 const day=Math.floor(s.t/1440);assert.equal(text(ui,'clock'),`Tag ${day+1} · ${String(Math.floor(s.t%1440/60)).padStart(2,'0')}:${String(s.t%60).padStart(2,'0')}`);
 ui.run('guard.dispose()');
});

// Befund QS-W0-06 (niedrig, A10): HUD „Lager x/y“ (Lager-API: stock+inbound+quarantine) und Panel Lager
// „Einheiten am Standort“ (alle außer vehicle, also auch machine) zeigen bei laufender Fertigung verschiedene Zahlen.
test('QS-W0 Befund 06: HUD-Lagerbelegung = Lagerpanel „Einheiten am Standort“ bei Ware in Anlage',{todo:'Befund QS-W0-06 (niedrig, A10), siehe docs/QS-0.9-W0.md'},async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 ui.run("sim.api.inventory.add({item:'housing',qty:3,site:'site-1',location:'machine'})");ui.run('render(true)');
 ui.run("openPanel('inventory')");const body=ui.nodes.get('#panelBody').innerHTML;const panelUsed=/<b>([\d.]+)<\/b><small>Einheiten am Standort/.exec(body)[1];
 const hud=/Lager ([\d.]+)\//.exec(text(ui,'sbStock'))[1];ui.run('guard.dispose()');
 assert.equal(panelUsed,hud);
});

test('QS-W0 Speichern: beschädigter Hauptstand + intakte Sicherung → „Gründen“ + Bestätigen überschreibt Sicherung beim ersten Schreiben nicht',async()=>{
 const memory=new Map(),K='industrie-logistik-v1-guided';
 const valid=new Simulation({mode:'guided',seed:9});valid.step(30);const good=valid.serialize();
 memory.set(K,good.slice(0,good.length-40));memory.set(K+'-backup',good);
 const ui=await boot({memory});
 assert.equal(ui.run('started'),false,'beschädigter Stand nicht geladen');
 await ui.click('start');assert.equal(ui.nodes.get('#confirm').open,true,'Rückfrage „Vorhandenen Spielstand ersetzen?“');await ui.click('confirmOk');
 assert.equal(memory.get(K+'-backup'),good,'Sicherung unverändert');
 assert.equal(Simulation.fromJSON(memory.get(K)).state.t,480,'Hauptstand jetzt neues Unternehmen');
 ui.run('guard.dispose()');
});

test('QS-W0 Speichern: beschädigter Hauptstand + intakte Sicherung → „Letzte Sicherung laden“ stellt Stand wieder her, Sicherung bleibt gültig',async()=>{
 const memory=new Map(),K='industrie-logistik-v1-guided';
 const valid=new Simulation({mode:'guided',seed:9});valid.step(30);const good=valid.serialize();
 memory.set(K,'{kaputt');memory.set(K+'-backup',good);
 const ui=await boot({memory});assert.equal(ui.run('started'),false);
 await ui.click('backup');await ui.click('confirmOk');await new Promise(r=>setImmediate(r));
 assert.equal(ui.run('sim.state.t'),510);assert.equal(JSON.parse(memory.get(K)).t,510);assert.equal(memory.get(K+'-backup'),good);
 ui.run('guard.dispose()');
});

// Befund QS-W0-05 (mittel, A12/A10): Die Rückfrage verspricht „Letzte Sicherung bleibt erhalten“. Nach dem zweiten
// Speichervorgang (Autosave nach 20 s) ist die einzige gültige Kopie des alten Unternehmens durch das neue ersetzt.
test('QS-W0 Befund 05: alte gültige Sicherung übersteht Weiterspielen nach „Gründen“ bei beschädigtem Hauptstand',{todo:'Befund QS-W0-05 (mittel, A12/A10), siehe docs/QS-0.9-W0.md'},async()=>{
 const memory=new Map(),K='industrie-logistik-v1-guided';
 const valid=new Simulation({mode:'guided',seed:9});valid.step(30);const good=valid.serialize();
 memory.set(K,good.slice(0,good.length-40));memory.set(K+'-backup',good);
 const ui=await boot({memory});await ui.click('start');await ui.click('confirmOk');
 ui.run('sim.step(5)');ui.run('dirty=true');ui.run('save()');ui.run('guard.dispose()');
 assert.equal(memory.get(K+'-backup'),good,'alte Sicherung (t=510) weiterhin vorhanden');
});

test('QS-W0 Speichern: Hauptstand wird während Betrieb von außen beschädigt → Sicherung behält letzten gültigen Stand',async()=>{
 const memory=new Map(),K='industrie-logistik-v1-guided';
 const ui=await boot({memory});await ui.click('start');ui.run('sim.step(3)');ui.run('dirty=true');assert.ok(ui.run('save()'));
 const lastGood=memory.get(K);memory.set(K,'{"schema":1,"mode":"guided"');
 ui.run('sim.step(3)');ui.run('dirty=true');assert.ok(ui.run('save()'));
 assert.notEqual(memory.get(K+'-backup'),'{"schema":1,"mode":"guided"');
 assert.ok(Simulation.fromJSON(memory.get(K+'-backup')),'Sicherung gültig');
 assert.ok(Simulation.fromJSON(memory.get(K)).state.t>JSON.parse(lastGood).t);
 ui.run('guard.dispose()');
});
