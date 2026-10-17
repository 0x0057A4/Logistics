// W3b-S2 Containerhof (A07/A05): Chassis-Ankunft, TEU, Umfuhr + Entladen, Leerabholung, Lagergeld-Minuten, Wartegründe,
// Speichern/Laden. Fixture wie pallet-own (Sandbox, Vertrag sofort beendet, Aufträge direkt) + Containerhof; zusätzlich
// Ende-zu-Ende mit echtem Containervertrag (A08, contracts.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import * as C from '../dist/containers.js';
import {OFFER_INTERVAL,OFFER_PHASE} from '../dist/contracts.js';

const cid=sim=>sim.state.contracts.find(c=>c.status==='ended')?.id??null;
function setup({docks=1,racks=2,workers=1,drivers=0,forklifts=1,yards=1}={}){
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;
 const build=(t,x,y)=>{const r=sim.command({type:'build',buildingType:t,x,y});assert.equal(r.ok,true,r.message);return r.id;};
 const dockIds=[[2,10],[6,10]].slice(0,docks).map(([x,y])=>build('dock',x,y));
 [[2,2],[5,2],[8,2]].slice(0,racks).forEach(([x,y])=>build('rack',x,y));
 const forkIds=[[12,2],[14,2]].slice(0,forklifts).map(([x,y])=>build('forklift',x,y));
 const yardIds=[[12,8],[12,12]].slice(0,yards).map(([x,y])=>build('containeryard',x,y));
 for(let i=0;i<workers;i++)assert.equal(sim.command({type:'hire',role:'warehouse'}).ok,true);
 for(let i=0;i<drivers;i++)assert.equal(sim.command({type:'hire',role:'driver'}).ok,true);
 const c=s.contracts[0];assert.equal(sim.command({type:'acceptContract',id:c.id}).ok,true);assert.equal(sim.command({type:'cancelContract',id:c.id}).ok,true);
 const b=id=>s.buildings.find(x=>x.id===id);
 return {sim,s,site:s.selectedSite,dockIds,forkIds,yardIds,b};
}
function orders(sim,qtys,item){const s=sim.state;return qtys.map((qty,i)=>{const id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',lane:`lane-${i}`,customer:`Gebiet ${i+1} (Testversand)`,item,qty,price:item==='pallet'?40:1.2,due:3000,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});return id;});}
function ship(sim,{qtys=[20],item='pallet',containers=1,eta=500,freeMinutes}={}){
 const ids=orders(sim,qtys,item);
 return yard.schedule(sim.state,sim.api,{kind:'container',contractId:cid(sim),site:sim.state.selectedSite,eta,orderIds:ids,containers,content:item,parcels:qtys.reduce((n,q)=>n+q,0),...(freeMinutes!==undefined?{freeMinutes}:{})});
}
const boxes=(s,a)=>a.containerIds.map(id=>s.containers.find(c=>c.id===id));
const qty=(s,item,{owner,loc}={})=>s.batches.filter(b=>b.item===item&&(!owner||b.owner===owner)&&(!loc||b.location===loc)).reduce((n,b)=>n+b.qty,0);
function runUntil(sim,cond,max=900){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);}assert.fail('Bedingung nicht erreicht');}
const reload=sim=>Simulation.fromJSON(sim.serialize());
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const bound=(s,c)=>({dock:s.buildings.some(b=>b.task===c.id),fork:s.buildings.some(b=>b.task===`${c.id}:forklift`),worker:s.workers.some(w=>w.task===`${c.id}:warehouse`)});
const free={dock:false,fork:false,worker:false};

test('schedule: Chassis kind container, Container arriving, Inhalt je Auftrag exakt verteilt, deterministisch',()=>{
 const one=()=>{const {sim,s}=setup();const a=ship(sim,{qtys:[25,15],containers:2});return {a,cs:boxes(s,a)};};
 const x=one(),y=one();assert.deepEqual(x,y);
 const {a,cs}=x;
 assert.equal(a.kind,'container');assert.equal(a.pickup,false);assert.equal(a.phase,'approach');assert.equal(a.parcels,40,'parcels = Inhalt gesamt (A08)');assert.equal(a.containers,2);
 assert.match(a.plate,/^[A-Z]{3}-[A-Z]{2} \d{3,4}$/);
 assert.deepEqual(cs.map(c=>c.qty),[20,20]);assert.ok(cs.every(c=>c.status==='arriving'&&c.content==='pallet'&&c.teu===C.TEU&&c.freeMinutes===1440));
 assert.deepEqual(cs.map(c=>c.split.map(p=>p.target)),[[20],[5,15]]);
 const per=new Map();for(const c of cs)for(const p of c.split)per.set(p.owner,(per.get(p.owner)||0)+p.target);
 assert.deepEqual([...per.values()],[25,15]);
 // Ohne containers-Feld: Anzahl aus unitsPerContainer.
 const {sim,s}=setup();const ids=orders(sim,[30],'parcel');
 const b=yard.schedule(s,sim.api,{kind:'container',site:s.selectedSite,eta:500,orderIds:ids,unitsPerContainer:20,content:'parcel'});
 assert.deepEqual(boxes(s,b).map(c=>c.qty),[15,15]);validateState(s);
});

test('Phasen approach→gate→queue→toYard→drop→exit→gone, Container im Hof mit Freizeit, TEU belegt',()=>{
 const {sim,s,site}=setup();const a=ship(sim,{qtys:[10,10],containers:2});const seen=[];
 runUntil(sim,()=>{if(seen.at(-1)!==a.phase)seen.push(a.phase);if(a.phase==='toYard')assert.equal(C.teuUsed(s,site),4);return a.phase==='gone';});
 assert.deepEqual(seen,['approach','gate','queue','toYard','drop','exit','gone'].filter(p=>p!=='queue'));
 const cs=boxes(s,a);const dropAt=cs[0].arrivedAt;
 assert.equal(dropAt,a.eta+2+2+2);assert.ok(cs.every(c=>c.freeUntil===c.arrivedAt+1440));
 assert.equal(C.teuCapacity(s,site),8);validateState(s);
});

test('Ohne Containerhof: Wartegrund „Kein Containerhof“, keine Bindung; nach Bau geht es weiter',()=>{
 const {sim,s}=setup({yards:0});const a=ship(sim);
 runUntil(sim,()=>a.phase==='queue');sim.step(5);
 assert.equal(a.phase,'queue');assert.equal(a.waitReason,yard.WAIT.noYard);assert.ok(s.workers.every(w=>!w.task));
 assert.equal(sim.command({type:'build',buildingType:'containeryard',x:12,y:8}).ok,true);
 runUntil(sim,()=>a.phase==='exit');assert.equal(boxes(s,a)[0].status!=='arriving',true);
});

test('TEU-Grenze: zweites Chassis wartet „Containerhof voll“ bis Leercontainer abgeholt sind',()=>{
 const {sim,s,site}=setup({docks:0});
 const a=ship(sim,{qtys:[60],containers:3,eta:500}),b=ship(sim,{qtys:[40],containers:2,eta:505});
 runUntil(sim,()=>a.phase==='exit');assert.equal(C.teuUsed(s,site),6);
 runUntil(sim,()=>b.phase==='queue');sim.step(1);
 assert.equal(b.waitReason,yard.WAIT.yardFull);assert.equal(b.phaseEnd,null);
 // Dock bauen → entladen → leer → Abholung → Platz frei.
 assert.equal(sim.command({type:'build',buildingType:'dock',x:2,y:10}).ok,true);
 runUntil(sim,()=>b.phase==='toYard',2000);
 assert.ok(boxes(s,a).some(c=>c.status==='gone'));assert.ok(C.teuUsed(s,site)<=8);validateState(s);
});

test('Paletten: Umfuhr 3 Min., 1 Palette/min nach stock, Eigentum Auftrag, eine Charge je Auftrag und Container',()=>{
 const {sim,s,b,dockIds,forkIds}=setup();const a=ship(sim,{qtys:[12,8],containers:1});
 const [c]=boxes(s,a);
 runUntil(sim,()=>c.status==='toDock');const t0=s.t;
 assert.equal(c.dock,dockIds[0]);assert.equal(b(dockIds[0]).task,c.id);assert.equal(b(forkIds[0]).task,`${c.id}:forklift`);assert.equal(s.workers[0].task,`${c.id}:warehouse`);
 runUntil(sim,()=>c.status==='unstuffing');assert.equal(s.t,t0+C.MOVE);
 sim.step(1);assert.equal(c.unloaded,1);sim.step(1);assert.equal(c.unloaded,2);
 runUntil(sim,()=>c.status==='empty');
 assert.equal(qty(s,'pallet',{owner:a.orderIds[0],loc:'stock'}),12);assert.equal(qty(s,'pallet',{owner:a.orderIds[1],loc:'stock'}),8);
 assert.equal(s.batches.filter(x=>x.item==='pallet').length,2,'mergeKey = Container-ID');assert.ok(s.batches.every(x=>x.item!=='pallet'||x.mergeKey===c.id));
 assert.deepEqual(bound(s,c),free);assert.equal(c.dock,null);
 // Abholung 120–240 Min. nach Entladeende, deterministisch.
 assert.equal(c.pickupAt-c.emptyAt,C.pickupDelay(c.id));assert.ok(c.pickupAt-c.emptyAt>=120&&c.pickupAt-c.emptyAt<=240);
 const p=s.yard.find(x=>x.id===c.pickupArrival);assert.equal(p.pickup,true);assert.equal(p.kind,'container');
 runUntil(sim,()=>c.status==='pickup',400);runUntil(sim,()=>c.status==='gone');assert.equal(C.teuUsed(s,s.selectedSite),0);
 validateState(s);sim.step(1441);assert.ok(!s.containers.includes(c),'nach 1 Tag entfernt');validateState(s);
});

test('Pakete: 20/min × workRate nach inbound, kein Stapler nötig, Sortierung bringt sie nach stock',()=>{
 const {sim,s}=setup({forklifts:0});const a=ship(sim,{qtys:[70,30],item:'parcel',containers:1});const [c]=boxes(s,a);
 runUntil(sim,()=>c.status==='unstuffing');sim.step(1);assert.equal(c.unloaded,20);
 assert.ok(qty(s,'parcel',{loc:'inbound'})+qty(s,'parcel',{loc:'stock'})===20);
 runUntil(sim,()=>c.status==='empty');assert.equal(qty(s,'parcel'),100);
 runUntil(sim,()=>qty(s,'parcel',{loc:'stock'})===100,200);
 assert.equal(qty(s,'parcel',{owner:a.orderIds[0]}),70);
});

test('Älteste zuerst; unstuffContainer zieht vor; Befehlsfehler',()=>{
 const {sim,s}=setup({docks:0});const a=ship(sim,{qtys:[5],eta:500}),b=ship(sim,{qtys:[5],eta:520});
 runUntil(sim,()=>b.phase==='exit');const [ca]=boxes(s,a),[cb]=boxes(s,b);
 assert.equal(ca.waitReason,yard.WAIT.dock);
 assert.equal(sim.command({type:'unstuffContainer',id:'container-x'}).ok,false);
 assert.equal(sim.command({type:'unstuffContainer',id:cb.id}).ok,true);assert.equal(sim.command({type:'unstuffContainer',id:cb.id}).ok,false);
 assert.equal(sim.command({type:'build',buildingType:'dock',x:2,y:10}).ok,true);sim.step(1);
 assert.equal(cb.status,'toDock');assert.equal(ca.status,'yard');
 runUntil(sim,()=>cb.status==='empty');sim.step(1);assert.equal(ca.status,'toDock');
 assert.equal(sim.command({type:'unstuffContainer',id:cb.id}).ok,false,'leer');
});

test('Wartefälle: Schichtende, Dock aus, Strom weg, Lager voll → zurück in den Hof, nichts gebunden, Mengen exakt',()=>{
 const {sim,s,b,dockIds,site}=setup();const a=ship(sim,{qtys:[20],containers:1});const [c]=boxes(s,a);const w=s.workers[0];
 const check=(...reasons)=>{sim.step(1);assert.equal(c.status,'yard');assert.ok(reasons.includes(c.waitReason),c.waitReason);assert.deepEqual(bound(s,c),free);
  sim.step(3);assert.equal(c.status,'yard');assert.deepEqual(bound(s,c),free);assert.equal(qty(s,'pallet'),c.unloaded);validateState(s);};
 runUntil(sim,()=>c.status==='unstuffing'&&c.unloaded===3);
 w.shift='night';check(yard.WAIT.staff);w.shift='day';
 runUntil(sim,()=>c.status==='unstuffing'&&c.unloaded===5);
 b(dockIds[0]).enabled=false;check(yard.WAIT.dockOff,yard.WAIT.dock);b(dockIds[0]).enabled=true;
 runUntil(sim,()=>c.status==='unstuffing'&&c.unloaded===7);
 const energy=s.sites[0].energy;s.sites[0].energy=0;check(yard.WAIT.forkliftPower);s.sites[0].energy=energy;
 runUntil(sim,()=>c.status==='unstuffing'&&c.unloaded===9);
 const fill=sim.api.inventory.free(site);sim.api.inventory.add({item:'housing',qty:Math.floor(fill),site});
 const before=c.unloaded;check(yard.WAIT.full);assert.ok(c.unloaded-before<=1);
 s.batches.find(x=>x.item==='housing').qty=0;
 runUntil(sim,()=>c.status==='empty');assert.equal(qty(s,'pallet'),20);assert.equal(c.split[0].done,20);
});

test('Lagergeld-Minuten: ab freeUntil je Minute bis zur Abholung, danach fest',()=>{
 const {sim,s}=setup({docks:0});const a=ship(sim,{qtys:[5],freeMinutes:30});const [c]=boxes(s,a);
 runUntil(sim,()=>c.status==='yard');assert.equal(c.demurrageMinutes,0);
 sim.step(30);assert.equal(c.demurrageMinutes,1,'Minute freeUntil zählt');sim.step(29);assert.equal(c.demurrageMinutes,30);
 assert.equal(sim.command({type:'build',buildingType:'dock',x:2,y:10}).ok,true);
 runUntil(sim,()=>c.status==='pickup',600);const m=c.demurrageMinutes;assert.equal(m,c.statusAt-c.freeUntil+1,'Minuten freeUntil … Abholbeginn einschließlich');
 sim.step(30);assert.equal(c.demurrageMinutes,m);
});

function scenario(){const env=setup();ship(env.sim,{qtys:[12,8],containers:2,freeMinutes:20});ship(env.sim,{qtys:[60],item:'parcel',containers:1,eta:530});return env;}
test('Speichern/Laden in jeder Phase = gleicher Endhash; 1-min- und 60-min-Schritte gleich',()=>{
 const END=900;
 const ref=scenario();ref.sim.step(END-ref.s.t);const want=hash(ref.sim);
 assert.ok(ref.s.containers.every(c=>['pickup','gone','empty'].includes(c.status)),ref.s.containers.map(c=>c.status).join());
 const run=scenario(),statuses=new Set(),phases=new Set();
 for(let t=run.s.t;t<END;t+=7){
  for(const c of run.s.containers)statuses.add(c.status);for(const a of run.s.yard)phases.add(a.phase);
  const copy=reload(run.sim);copy.step(END-copy.state.t);assert.equal(hash(copy),want,`Laden bei Minute ${t}`);
  run.sim.step(7);
 }
 for(const st of ['arriving','yard','toDock','unstuffing','empty','pickup'])assert.ok(statuses.has(st),st);
 for(const p of yard.CONTAINER_PHASES)if(p!=='queue')assert.ok(phases.has(p),p); // queue ohne Wartegrund dauert 0 Min.
 const big=scenario();const n=END-big.s.t,h=Math.floor(n/60);big.sim.step(h*60);big.sim.step(n-h*60);assert.equal(hash(big.sim),want);
});

test('validate lehnt TEU-Überlauf, Mengen- und Bindungsfehler ab; belegter Containerhof nicht abreißbar',()=>{
 const {sim,s,yardIds}=setup();const a=ship(sim,{qtys:[20],containers:1});const [c]=boxes(s,a);
 runUntil(sim,()=>c.status==='unstuffing');sim.step(2);validateState(s);
 const bad=(f,msg)=>{const st=JSON.parse(sim.serialize());f(st,st.containers.find(x=>x.id===c.id));assert.throws(()=>validateState(st),msg);};
 bad((st,x)=>{x.unloaded++;},/Verteilungssumme/);
 bad((st,x)=>{x.dock=null;},/Dockbelegung/);
 bad((st,x)=>{st.buildings.find(b=>b.task===x.id).task=null;},/Dockbelegung/);
 bad((st,x)=>{x.status='yard';},/Dock ohne Umschlag|Verwaiste|Personalbindung|Staplerbindung/);
 bad((st,x)=>{x.teu=2;for(let i=0;i<4;i++)st.containers.push({...structuredClone(x),id:`container-${900+i}`,status:'yard',dock:null,moveEnd:null});st.seq=10000;},/TEU|Dock/);
 bad((st,x)=>{x.status='empty';},/Leercontainer/);
 assert.equal(s.buildings.find(b=>b.id===yardIds[0]).task,C.yardMark(s.selectedSite));
 assert.equal(sim.command({type:'demolish',id:yardIds[0]}).ok,false);
 bad(st=>{st.buildings.find(b=>b.id===yardIds[0]).task='x';},/Containerhofbelegung/);
});

// Echter Containervertrag (A08): Angebot mit Containerhof, Annahme, Ankunft, Entladen, Zustellung, Lagergeld + Handling genau einmal.
const nextPhase=t=>{const r=((OFFER_PHASE-t)%OFFER_INTERVAL+OFFER_INTERVAL)%OFFER_INTERVAL;return r||OFFER_INTERVAL;};
function realContract(){
 for(let seed=1;seed<60;seed++){
  const sim=new Simulation({seed,mode:'sandbox'}),s=sim.state;
  const build=(t,x,y)=>assert.equal(sim.command({type:'build',buildingType:t,x,y}).ok,true);
  build('containeryard',12,8);sim.step(nextPhase(s.t));
  const k=s.contracts.find(x=>x.status==='offer'&&x.unit==='container');
  if(!k||k.content!=='pallet'||k.arrivals[0].containers>2)continue;
  build('dock',2,10);build('rack',2,2);build('rack',5,2);build('forklift',12,2);
  assert.equal(sim.command({type:'hire',role:'warehouse'}).ok,true);assert.equal(sim.command({type:'hire',role:'driver'}).ok,true);
  for(const x of s.workers)x.shift='all';
  assert.equal(sim.command({type:'buyVehicle',vehicleType:'truck'}).ok,true);
  k.freeMinutes=30;
  assert.equal(sim.command({type:'acceptContract',id:k.id}).ok,true);
  return {sim,s,k};
 }
 assert.fail('kein Palettencontainer-Angebot');
}
test('Ende-zu-Ende Containervertrag: Chassis → Hof → Entladen → Paletten → Zustellung; Lagergeld und Handling genau einmal',()=>{
 const {sim,s,k}=realContract();
 runUntil(sim,()=>s.containers.some(c=>c.contractId===k.id),3000);
 const a=s.yard.find(x=>x.kind==='container'&&x.contractId===k.id);const cs=boxes(s,a);
 assert.equal(a.parcels,k.arrivals[0].parcels);assert.equal(cs.length,k.arrivals[0].containers);assert.ok(cs.every(c=>c.qty===k.unitsPerContainer&&c.freeMinutes===30));
 runUntil(sim,()=>cs.every(c=>c.status==='gone'),3000);
 const o=s.orders.find(x=>x.id===a.orderIds[0]);
 assert.ok(cs.every(c=>c.demurrageMinutes>=60),'Lagergeld angefallen');
 for(const c of cs){
  assert.equal(s.ledger.filter(l=>l.key===`container-handling:${c.id}`).length,1);
  const rows=s.ledger.filter(l=>l.key.startsWith(`demurrage:${c.id}:`));assert.equal(rows.length,Math.floor(c.demurrageMinutes/60));
 }
 const copy=reload(sim);copy.step(120);
 for(const c of cs){assert.equal(copy.state.ledger.filter(l=>l.key===`container-handling:${c.id}`).length,1);assert.equal(copy.state.ledger.filter(l=>l.key.startsWith(`demurrage:${c.id}:`)).length,Math.floor(c.demurrageMinutes/60));}
 // Zustellung eines Teils mit dem eigenen Lkw.
 const n=Math.min(o.qty,5);assert.equal(qty(s,'pallet',{owner:o.id}),o.qty-o.delivered);
 const r=sim.command({type:'dispatch',vehicleId:s.vehicles[0].id,orderId:o.id,qty:n});assert.equal(r.ok,true,r.message);
 const sh=s.shipments.find(x=>x.id===r.id);runUntil(sim,()=>sh.status==='complete',900);
 assert.equal(o.delivered,n);assert.ok(s.batches.every(b=>b.qty>=0));validateState(s);
});
