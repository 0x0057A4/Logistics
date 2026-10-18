// 0.16 S2 Personalrollen (A06): Staplerfahrer (forklift) und Torposten (gate) über workforce.acquireAny,
// Spezialistenrate ×1,25, Vorrangregeln der Sortierung, Schichtende mitten im Entladen, Speichern/Laden.
// Fixture wie pallet-own (Vertrag sofort beendet, Aufträge ohne Vertrag).
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import {workRate, FORK_ROLES, GATE_ROLES, onShift} from '../dist/workforce.js';
import * as wf from '../dist/workforce.js';

const cid=sim=>sim.state.contracts.find(c=>c.status==='ended')?.id??'vertrag-test';
function setup({warehouse=1,forklift=0,gate=0,forklifts=1}={}){
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;
 const ok=c=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
 ok({type:'build',buildingType:'dock',x:2,y:10});
 for(const [x,y] of [[2,2],[5,2],[8,2]])ok({type:'build',buildingType:'rack',x,y});
 for(let i=0;i<forklifts;i++)ok({type:'build',buildingType:'forklift',x:12+2*i,y:2});
 const ids={warehouse:[],forklift:[],gate:[]};
 for(const [role,n] of [['warehouse',warehouse],['forklift',forklift],['gate',gate]])for(let i=0;i<n;i++)ids[role].push(ok({type:'hire',role}).id);
 const c=s.contracts[0];ok({type:'acceptContract',id:c.id});ok({type:'cancelContract',id:c.id});c.settled=true;
 const w=id=>s.workers.find(x=>x.id===id);
 return {sim,s,ids,w};
}
function orders(sim,qtys,item){const s=sim.state;return qtys.map((qty,i)=>{const id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',lane:`lane-${i}`,customer:`Gebiet ${i+1} (Testversand)`,item,qty,price:40,due:5000,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});return id;});}
function arrive(sim,qtys,eta,item='pallet'){const ids=orders(sim,qtys,item);return yard.schedule(sim.state,sim.api,{contractId:cid(sim),site:sim.state.selectedSite,parcels:qtys.reduce((n,q)=>n+q,0),eta,orderIds:ids});}
const qtyOf=(s,item,loc)=>s.batches.filter(b=>b.item===item&&(!loc||b.location===loc)).reduce((n,b)=>n+b.qty,0);
function runUntil(sim,cond,max=900,each){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);each?.();}assert.fail('Bedingung nicht erreicht');}
const reload=sim=>Simulation.fromJSON(sim.serialize());
// Keine Person mit zwei Tätigkeiten: jeder Aufgabenschlüssel höchstens einmal vergeben.
function uniqueTasks(s){const seen=new Set();for(const w of s.workers)if(w.task){assert.ok(!seen.has(w.task),`Schlüssel doppelt: ${w.task}`);seen.add(w.task);}}

test('workRate: ohne passende Spezialrolle unverändert, Spezialist Mittel 1,25 ganzzahlig und zustandslos',()=>{
 const std={role:'warehouse',skill:1,fatigue:0},fk={role:'forklift',skill:1,fatigue:0};
 assert.equal(workRate(std,1),1);assert.equal(workRate(std,1,'forklift',123),1);assert.equal(workRate(std,20,'forklift',5),20);
 assert.equal(workRate({role:'warehouse',skill:1.5,fatigue:0},1,'forklift',9),2); // bisherige Rundung bleibt
 let sum=0;for(let t=480;t<480+40;t++){const n=workRate(fk,1,'forklift',t);assert.ok(Number.isInteger(n)&&n>=1);sum+=n;}
 assert.equal(sum,50);
 assert.equal(workRate(fk,1,'forklift'),1.25); // Prognose: Mittelwert
 assert.equal(workRate(fk,20,'forklift',777),25);
 assert.equal(workRate(fk,20,'gate',777),20); // Rolle passt nicht zur Tätigkeit → wie Lagerkraft
});

test('Staplerfahrer übernimmt Palettenentladung vor der Lagerkraft und ist schneller; Mengen exakt',()=>{
 const run=forklift=>{
  const {sim,s,ids,w}=setup({warehouse:1,forklift});const a=arrive(sim,[12,8],485);
  runUntil(sim,()=>a.phase==='unloading');sim.step(1);
  const holder=s.workers.find(x=>x.task===yard.unloadKey(a));
  const start=s.t;runUntil(sim,()=>a.phase==='exit',900,()=>uniqueTasks(s));
  assert.equal(qtyOf(s,'pallet','stock'),20);
  a.orderIds.forEach((id,i)=>assert.equal(s.batches.filter(b=>b.owner===id&&b.item==='pallet').reduce((n,b)=>n+b.qty,0),[12,8][i]));
  assert.ok(s.batches.filter(b=>b.item==='pallet').every(b=>Number.isInteger(b.qty)));
  yard.validate(s);
  return {minutes:s.t-start,holder,ids};
 };
 const spec=run(1),base=run(0);
 assert.equal(spec.holder.role,'forklift');assert.equal(spec.holder.id,spec.ids.forklift[0]);
 assert.equal(base.holder.role,'warehouse'); // ohne Spezialist übernimmt die Lagerkraft
 assert.ok(spec.minutes<base.minutes,`Spezialist ${spec.minutes} min, Lagerkraft ${base.minutes} min`);
 assert.equal(base.minutes,19); // 20 Paletten à 1/min (erste Minute vor start)
});

test('Torposten übernimmt die Torkontrolle, Lagerkraft bleibt frei; ohne Torposten wie bisher die Lagerkraft',()=>{
 {
  const {sim,s,ids}=setup({warehouse:1,gate:1});const a=arrive(sim,[5],485,'parcel');
  runUntil(sim,()=>a.phase==='gate');sim.step(1);
  const g=s.workers.find(x=>x.task===yard.gateKey(a));
  assert.ok(g&&g.role==='gate'&&g.id===ids.gate[0]);
  assert.equal(s.workers.find(x=>x.role==='warehouse').task,null);
  runUntil(sim,()=>a.phase==='queue'||a.phase==='toDock'||a.phase==='docking');
  assert.equal(g.task,null);
 }
 {
  const {sim,s}=setup({warehouse:1});const a=arrive(sim,[5],485,'parcel');
  runUntil(sim,()=>a.phase==='gate');sim.step(1);
  assert.equal(s.workers.find(x=>x.task===yard.gateKey(a)).role,'warehouse');
 }
 // Nur Spezialisten: Staplerfahrer macht keine Torkontrolle.
 {
  const {sim,s}=setup({warehouse:0,forklift:1});const a=arrive(sim,[5],485,'parcel');
  runUntil(sim,()=>a.phase==='gate');sim.step(3);
  assert.equal(a.phase,'gate');assert.equal(a.waitReason,yard.WAIT.gate);assert.equal(s.workers[0].task,null);
 }
 assert.deepEqual(GATE_ROLES,['gate','warehouse']);assert.deepEqual(FORK_ROLES,['forklift','warehouse']);
});

test('Spezialisten sortieren nie und entladen keine Pakete',()=>{
 const {sim,s}=setup({warehouse:0,forklift:1,gate:1});const a=arrive(sim,[40],485,'parcel');
 runUntil(sim,()=>a.phase==='unloading');sim.step(5);
 assert.equal(a.unloaded,0);assert.equal(a.waitReason,yard.WAIT.staff);
 // Inbound-Pakete vorhanden: Hand-Sortierung findet keine Kraft.
 const [o]=orders(sim,[30],'parcel');assert.ok(sim.api.inventory.add({item:'parcel',qty:30,site:s.selectedSite,location:'inbound',owner:o}));
 for(let i=0;i<60;i++){sim.step(1);for(const w of s.workers)assert.ok(!/:(sort|sort2|handsort)$/.test(w.task||''),`${w.role} sortiert: ${w.task}`);}
 assert.equal(qtyOf(s,'parcel','inbound'),30);assert.equal(s.sorting.sites[s.selectedSite].hand,'staff');
});

test('Vorrang Sortierung: freier Staplerfahrer deckt Palettenbedarf, Sortierkraft wird nicht abgezogen',()=>{
 const scenario=forklift=>{
  const {sim,s}=setup({warehouse:1,forklift,gate:1}); // Torposten deckt das Tor in beiden Fällen
  const [o]=orders(sim,[200],'parcel');assert.ok(sim.api.inventory.add({item:'parcel',qty:200,site:s.selectedSite,location:'inbound',owner:o}));
  sim.step(2);const sorter=s.workers.find(x=>x.role==='warehouse');assert.equal(sorter.task,`${s.selectedSite}:handsort`);
  const a=arrive(sim,[6],s.t+1);
  let yieldedSorter=false;
  runUntil(sim,()=>a.phase==='exit',300,()=>{uniqueTasks(s);if(sorter.task!==`${s.selectedSite}:handsort`)yieldedSorter=true;
   for(const w of s.workers)if(w.role==='forklift')assert.ok(!/:(sort|sort2|handsort)$/.test(w.task||''));});
  assert.equal(qtyOf(s,'pallet','stock'),6);
  assert.equal(qtyOf(s,'parcel')+0,200);
  return yieldedSorter;
 };
 assert.equal(scenario(1),false,'mit Staplerfahrer sortiert die Lagerkraft durchgehend');
 assert.equal(scenario(0),true,'ohne Staplerfahrer gibt die Sortierung ihre Kraft ans Entladen ab (bisheriger Vorrang)');
});

test('Schichtende des Staplerfahrers mitten im Entladen: Lagerkraft übernimmt bzw. Wartegrund, Mengen erhalten',()=>{
 const run=warehouseShift=>{
  const {sim,s,w,ids}=setup({warehouse:1,forklift:1});
  const wh=w(ids.warehouse[0]),fk=w(ids.forklift[0]);wh.shift=warehouseShift;
  // Ankunft so, dass die Entladung über 16:00 (t%1440=960) läuft.
  sim.step(930-s.t);
  const a=arrive(sim,[60],s.t+1);
  runUntil(sim,()=>a.phase==='unloading');sim.step(1);
  assert.equal(s.workers.find(x=>x.task===yard.unloadKey(a)).id,fk.id);
  runUntil(sim,()=>!onShift(fk,s.t));sim.step(1);
  const before=a.unloaded;assert.ok(before>0&&before<60,`Teilentladung ${before} t=${s.t} start=${a.phaseStart}`);
  assert.equal(fk.task,null);assert.equal(fk.activity,'Feierabend');
  return {sim,s,a,wh,fk,before};
 };
 {
  const {sim,s,a,wh,before}=run('all');
  assert.equal(wh.task,yard.unloadKey(a)); // Lagerkraft übernimmt in derselben Minute
  runUntil(sim,()=>a.phase==='exit',300,()=>uniqueTasks(s));
  assert.equal(qtyOf(s,'pallet','stock'),60);assert.ok(a.unloaded===60&&before<60);
 }
 {
  const {sim,s,a,before}=run('day'); // niemand mehr im Dienst
  sim.step(5);
  assert.equal(a.waitReason,yard.WAIT.staff);assert.equal(a.unloaded,before);assert.equal(qtyOf(s,'pallet','stock'),before);
  assert.ok(!s.buildings.some(b=>b.type==='forklift'&&b.task)); // Stapler nicht festgehalten
  yard.validate(s);
 }
});

test('Speichern/Laden mitten in Staplerentladung und Torkontrolle bitgleich',()=>{
 const {sim,s}=setup({warehouse:1,forklift:1,gate:1});
 const a=arrive(sim,[25],485),b=arrive(sim,[10],500,'parcel');
 runUntil(sim,()=>a.phase==='unloading'&&a.unloaded>3);
 runUntil(sim,()=>b.phase==='gate');
 const r=reload(sim);assert.equal(r.serialize(),sim.serialize());
 for(let i=0;i<120;i++){sim.step(1);r.step(1);if(i%7===0)assert.equal(r.serialize(),sim.serialize());}
 assert.equal(r.serialize(),sim.serialize());
 assert.equal(qtyOf(s,'pallet','stock'),25);
});

test('Personalbefehle für neue Rollen: Einstellung kostet ROLES-Betrag, Lohn, Fortbildung, Versetzung, Entlassung',()=>{
 const {sim,s,ids,w}=setup({warehouse:0});
 const m0=s.money;const r1=sim.command({type:'hire',role:'forklift'}),r2=sim.command({type:'hire',role:'gate'});
 assert.ok(r1.ok&&r2.ok);assert.equal(Math.round((m0-s.money)*100)/100,700);
 const f=w(r1.id),g=w(r2.id);assert.equal(f.wage,20);assert.equal(g.wage,17);
 const m1=s.money;sim.step(60);assert.ok(m1-s.money>=37-0.05,'Löhne laufen'); // (20+17) je Stunde im Dienst
 assert.equal(sim.command({type:'train',id:f.id}).ok,true);assert.ok(f.training);
 assert.equal(sim.command({type:'fire',id:f.id}).ok,false); // lernt
 sim.step(90);assert.equal(f.skill,1.25);
 assert.equal(sim.command({type:'fire',id:f.id}).ok,true);assert.ok(!s.workers.includes(f));
 assert.ok(ids&&g);
});

test('acquireAny: Rollenreihenfolge, gültige Bindung bleibt, gleiche Sperren wie acquire (Schicht, Pause, Müdigkeit, Schulung, Versetzung)',()=>{
 const s={t:600,seq:1,selectedSite:'a',sites:[{id:'a'},{id:'b'}],workers:[],money:1e5};
 const api={id:p=>p+'-'+s.seq++,log(){},book(k,n){s.money+=n;return true;}};api.workforce=wf.createAPI(s,api);
 for(const role of ['warehouse','forklift','gate'])assert.equal(wf.handle(s,{type:'hire',role},api).ok,true);
 const [wh,fk,gt]=s.workers;
 assert.equal(api.workforce.acquireAny(FORK_ROLES,'a','x').id,fk.id);
 // Bindung bleibt auch bei erneutem Aufruf, zweite Aufgabe bekommt die Lagerkraft, dritte niemanden.
 assert.equal(api.workforce.acquireAny(FORK_ROLES,'a','x').id,fk.id);
 assert.equal(api.workforce.acquireAny(FORK_ROLES,'a','y').id,wh.id);
 assert.equal(api.workforce.acquireAny(FORK_ROLES,'a','z'),null);
 assert.equal(api.workforce.acquireAny(GATE_ROLES,'a','g').id,gt.id);
 // Bestehende Lagerkraft-Bindung bleibt, auch wenn ein Staplerfahrer frei wird.
 api.workforce.release('x');assert.equal(api.workforce.acquireAny(FORK_ROLES,'a','y').id,wh.id);
 // Rolle nicht in der Liste → Bindung gelöst.
 assert.equal(api.workforce.acquireAny(['gate'],'a','y'),null);assert.equal(wh.task,null);
 api.workforce.release('g');
 for(const [field,val] of [['fatigue',80],['breakRemaining',5],['training',{id:'t',remaining:5,duration:90}],['relocation',{toSite:'b',remaining:5,duration:30}]]){
  const old=fk[field];fk[field]=val;
  assert.notEqual(api.workforce.acquireAny(['forklift'],'a','q')?.id,fk.id,field);
  fk[field]=old;api.workforce.release('q');
 }
 fk.shift='night';assert.equal(api.workforce.acquireAny(['forklift'],'a','q'),null);fk.shift='day';
 assert.equal(api.workforce.acquireAny(['forklift'],'b','q'),null); // anderer Standort
 // Versetzung und Entlassung über Befehle.
 assert.equal(wf.handle(s,{type:'moveWorker',id:gt.id,toSite:'b'},api).ok,true);
 for(let n=0;n<30;n++)wf.step(s,api);assert.equal(gt.site,'b');
 assert.equal(api.workforce.acquireAny(GATE_ROLES,'b','gb').id,gt.id);
 assert.equal(wf.handle(s,{type:'fire',id:gt.id},api).ok,false);api.workforce.release('gb');
 assert.equal(wf.handle(s,{type:'fire',id:gt.id},api).ok,true);
 wf.validate(s);
});
