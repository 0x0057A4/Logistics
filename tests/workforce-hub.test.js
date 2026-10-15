// A06 Welle 1b: Hub-Personal – Entladerate nach Erfahrung/Müdigkeit, Torkontrolle mit Lagerkraft,
// Schichtende/Pause während gate/unloading/Sortierung, Lesesicht describeAssignment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import {workRate, describeAssignment, UNLOAD_BASE} from '../dist/workforce.js';
import {HAND_RATE} from '../dist/sorting.js';

const SITE='site-1';
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
function setup({workers=1,sorter=false}={}){
 const sim=new Simulation({mode:'sandbox',seed:5}),s=sim.state;
 ok(sim,{type:'build',buildingType:'dock',x:2,y:10});
 ok(sim,{type:'build',buildingType:'rack',x:2,y:2});ok(sim,{type:'build',buildingType:'rack',x:5,y:2});
 if(sorter)ok(sim,{type:'build',buildingType:'sorter',x:8,y:2});
 for(let i=0;i<workers;i++)ok(sim,{type:'hire',role:'warehouse'});
 const c=s.contracts[0];ok(sim,{type:'acceptContract',id:c.id});ok(sim,{type:'cancelContract',id:c.id});
 return {sim,s};
}
function arrive(sim,qty,eta){
 const s=sim.state,c=s.contracts.find(k=>k.status==='ended'),id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:c.id,lane:c.lanes[0].id,customer:'Gebiet Test (Versand)',item:'parcel',qty,price:1.2,due:eta+600,quality:0,site:SITE,status:'active',delivered:0,paid:0});
 return yard.schedule(s,sim.api,{contractId:c.id,site:SITE,parcels:qty,eta,orderIds:[id]});
}
const parcels=(s,loc)=>s.batches.filter(b=>b.item==='parcel'&&(!loc||b.location===loc)).reduce((n,b)=>n+b.qty,0);
function runUntil(sim,cond,max=900){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);noDouble(sim.state);}assert.fail('Bedingung nicht erreicht');}
// Keine Person mit zwei Bindungen (ein task-Feld), kein Schlüssel bei zwei Personen, keine Bindung außerhalb der Schicht/Pause.
function noDouble(s){
 const keys=s.workers.filter(w=>w.task).map(w=>w.task);assert.equal(new Set(keys).size,keys.length,'Schlüssel doppelt vergeben');
 for(const w of s.workers)if(w.breakRemaining>0||w.training||w.relocation)assert.equal(w.task,null,'Bindung trotz Pause');
}
const reload=sim=>Simulation.fromJSON(sim.serialize());

test('workRate: Standardkraft = Basis, Erfahrung bis ×1,5, Müdigkeit ab 50 bis ×0,8, ganzzahlig',()=>{
 assert.equal(workRate({skill:1,fatigue:0},20),20);assert.equal(workRate({skill:1,fatigue:50},20),20);
 assert.equal(workRate({skill:1.25,fatigue:0},20),25);assert.equal(workRate({skill:1.5,fatigue:0},20),30);assert.equal(workRate({skill:3,fatigue:0},20),30);
 assert.equal(workRate({skill:1,fatigue:65},20),18);assert.equal(workRate({skill:1,fatigue:80},20),16);
 assert.equal(workRate({skill:1,fatigue:0},HAND_RATE),HAND_RATE);assert.equal(workRate({skill:1.25,fatigue:0},HAND_RATE),3);
 assert.equal(workRate({skill:0,fatigue:0},20),1,'mindestens 1');
 for(const w of [{skill:1.75,fatigue:63.3},{skill:1,fatigue:79.99}])assert.ok(Number.isInteger(workRate(w,UNLOAD_BASE)));
});

test('Erfahrene Lagerkraft entlädt schneller, müde langsamer; Menge exakt',()=>{
 for(const [skill,fatigue,steps] of [[1.5,0,[30,50]],[1,65,[18,36,50]]]){
  const {sim,s}=setup();const a=arrive(sim,50,481);
  runUntil(sim,()=>a.phase==='unloading');
  s.workers[0].skill=skill;s.workers[0].fatigue=fatigue;
  for(const n of steps){sim.step(1);assert.equal(a.unloaded,n,`skill ${skill}/fatigue ${fatigue}`);}
  assert.equal(a.phase,'exit');assert.equal(parcels(s),50);
 }
});

test('Torkontrolle braucht Lagerkraft: ohne Kraft wartet der Lkw mit Grund, Bindung nur 2 Minuten',()=>{
 const {sim,s}=setup({workers:0});ok(sim,{type:'hire',role:'service'});
 const a=arrive(sim,30,481);
 runUntil(sim,()=>a.phase==='gate');sim.step(10);
 assert.equal(a.phase,'gate');assert.equal(a.waitReason,yard.WAIT.gate);assert.equal(a.waitReason,'Keine Torkontrolle');assert.equal(a.gateDone,0);
 assert.equal(s.workers[0].task,null,'Kundenservice übernimmt keine Torkontrolle');
 const r=reload(sim);assert.equal(r.state.yard[0].waitReason,'Keine Torkontrolle');
 ok(sim,{type:'hire',role:'warehouse'});const w=s.workers.at(-1);
 sim.step(1);assert.equal(a.phase,'gate');assert.equal(w.task,`${a.id}:gate`);assert.equal(w.activity,`Torkontrolle ${a.plate}`);assert.equal(a.waitReason,null);
 assert.deepEqual(describeAssignment(s,w),{kind:'gate',text:`Torkontrolle ${a.plate}`,ref:a.id});
 sim.step(1);assert.ok(['queue','toDock'].includes(a.phase),a.phase);assert.notEqual(w.task,`${a.id}:gate`,'nach 2 Minuten frei');
 assert.equal(a.gateDone,undefined);
});

test('Mit Lagerkraft bleibt der Ablauf zeitgleich zu vorher (gate genau 2 Minuten)',()=>{
 const {sim}=setup();const a=arrive(sim,20,481);
 runUntil(sim,()=>a.phase==='gate');const t0=sim.state.t;
 runUntil(sim,()=>a.phase!=='gate');assert.equal(sim.state.t-t0,2);
});

test('Schichtende während Torkontrolle: Person frei, Fortschritt bleibt, Ablösung führt zu Ende (auch nach Laden)',()=>{
 const {sim,s}=setup();const w=s.workers[0];
 const a=arrive(sim,20,958); // gate ab 958, Minute 959 geleistet, 960 = 16:00 Schichtende
 runUntil(sim,()=>s.t===959);assert.equal(a.phase,'gate');assert.equal(a.gateDone,1);assert.equal(w.task,`${a.id}:gate`);
 sim.step(1);assert.equal(w.task,null);assert.equal(w.activity,'Feierabend');assert.equal(a.phase,'gate');assert.equal(a.gateDone,1);assert.equal(a.waitReason,'Keine Torkontrolle');
 assert.equal(describeAssignment(s,w).kind,'off');
 let r=reload(sim);assert.equal(r.state.yard[0].gateDone,1);
 sim.step(5);assert.equal(a.gateDone,1);
 ok(r,{type:'hire',role:'warehouse'});const n=r.state.workers.at(-1);ok(r,{type:'setShift',id:n.id,shift:'night'});
 r.step(1);const b=r.state.yard[0];assert.ok(['queue','toDock'].includes(b.phase),b.phase);assert.equal(b.gateDone,undefined);
 assert.notEqual(n.task,`${b.id}:gate`);assert.equal(r.state.workers[0].task,null);
});

test('Pause während Entladen: Person frei, Lkw wartet, Ablösung ohne Doppeleinsatz, Menge exakt',()=>{
 const {sim,s}=setup({workers:2});const [w1,w2]=s.workers;
 const a=arrive(sim,200,481);
 runUntil(sim,()=>a.phase==='unloading'&&a.unloaded>0);
 const holder=s.workers.find(w=>w.task===`${a.id}:warehouse`),other=holder===w1?w2:w1;
 assert.equal(describeAssignment(s,holder).kind,'unload');assert.match(describeAssignment(s,holder).text,/Entlädt .* Pakete, 20\/min/);
 other.training={id:'training-test',remaining:90,duration:90};other.activity='Fortbildung'; // Ablösung erst später verfügbar
 holder.fatigue=80;const before=a.unloaded;
 sim.step(1);noDouble(s);
 assert.equal(holder.task,null);assert.ok(holder.breakRemaining>0);assert.equal(a.unloaded,before);assert.equal(a.waitReason,yard.WAIT.staff);assert.equal(a.phase,'unloading');
 assert.equal(describeAssignment(s,holder).kind,'break');
 const r=reload(sim);assert.equal(r.state.yard[0].unloaded,before);
 other.training=null;other.activity='Bereit';
 sim.step(1);noDouble(s);assert.equal(other.task,`${a.id}:warehouse`);assert.equal(holder.task,null);assert.equal(a.unloaded,before+20);
 runUntil(sim,()=>a.phase==='exit');assert.equal(a.unloaded,200);assert.equal(parcels(s),200);
});

test('Schichtende während Handsortierung: Bindung frei, Sortierung ruht, keine Pakete verloren',()=>{
 const {sim,s}=setup();const w=s.workers[0];
 const a=arrive(sim,100,930);
 runUntil(sim,()=>a.phase==='exit');
 runUntil(sim,()=>w.task===`${SITE}:handsort`);
 assert.equal(describeAssignment(s,w).kind,'handsort');assert.match(describeAssignment(s,w).text,/^Handsortierung /);
 runUntil(sim,()=>s.t===960);assert.equal(w.task,null);
 const stock=parcels(s,'stock');assert.ok(stock<100,'Sortierung bei Schichtende noch offen');
 sim.step(30);assert.equal(parcels(s,'stock'),stock);assert.equal(s.sorting.sites[SITE].hand,'staff');assert.equal(parcels(s),100);
});

test('Torkontrolle hat Vorrang vor Handsortierung (eine Lagerkraft)',()=>{
 const {sim,s}=setup();const w=s.workers[0];
 const a=arrive(sim,60,481);runUntil(sim,()=>a.phase==='exit');
 const b=arrive(sim,10,s.t+15);
 runUntil(sim,()=>b.phase==='approach'&&s.t===b.phaseEnd-1);assert.equal(w.task,`${SITE}:handsort`);
 sim.step(1);assert.equal(b.phase,'gate');assert.equal(w.task,null,'Handsortierung gibt ab');const t0=s.t;
 sim.step(1);assert.equal(w.task,`${b.id}:gate`);
 runUntil(sim,()=>b.phase!=='gate');assert.equal(s.t-t0,2,'Torkontrolle trotzdem 2 Minuten');
 runUntil(sim,()=>b.phase==='gone',60);assert.equal(b.unloaded,10);
});

test('describeAssignment: Sortierplatz, Bereit, Fremdbindung; ändert keinen Zustand',()=>{
 const {sim,s}=setup({sorter:true});const w=s.workers[0],sorter=s.buildings.find(b=>b.type==='sorter');
 assert.deepEqual(describeAssignment(s,w),{kind:'idle',text:'Bereit',ref:null});
 const json=sim.serialize();
 w.task=`${sorter.id}:sort`;assert.deepEqual(describeAssignment(s,w),{kind:'sort',text:'Sortierplatz',ref:sorter.id});
 w.task='job-99';w.activity='Fertigung';assert.deepEqual(describeAssignment(s,w),{kind:'task',text:'Fertigung',ref:'job-99'});
 w.task=null;w.activity='Bereit';assert.equal(sim.serialize(),json);
 assert.equal(describeAssignment(s,null),null);
});

test('Hub-Personal deterministisch: 1-Minuten- und 60-Minuten-Schritte mit Warten an Tor und Dock',()=>{
 const mk=()=>{const {sim}=setup({workers:0});arrive(sim,90,500);arrive(sim,30,505);return sim;};
 const x=mk(),y=mk();
 for(const sim of [x,y]){sim.step(40);ok(sim,{type:'hire',role:'warehouse'});}
 for(let i=0;i<300;i++)x.step(1);for(let i=0;i<5;i++)y.step(60);
 assert.equal(x.serialize(),y.serialize());assert.ok(x.state.yard.every(a=>a.phase==='gone'));
});
