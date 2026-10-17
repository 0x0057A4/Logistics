// Eigene Prüfungen A07/A05: Linienverkehr zwischen eigenen Standorten (W3-S2, docs/SCHNITTSTELLEN-0.12-W3.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import * as L from '../dist/linehaul.js';
import {maxLoad} from '../dist/transport.js';
import {laneSite} from '../dist/contracts.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const reload=sim=>Simulation.fromJSON(sim.serialize());
const clone=x=>JSON.parse(JSON.stringify(x));
function runUntil(sim,cond,max=2000){for(let i=0;i<max;i++){if(cond())return i;sim.step(1);}assert.fail(`Bedingung nicht erreicht (t=${sim.state.t})`);}
const qtyAt=(s,owner,site,location)=>s.batches.filter(b=>b.owner===owner&&b.site===site&&(!location||b.location===location)).reduce((n,b)=>n+b.qty,0);
const total=(s,owner)=>s.batches.filter(b=>b.owner===owner).reduce((n,b)=>n+b.qty,0);

/** Sandbox mit Annahme-Hub A und Ziel-Hub B. A: Dock, 2 Regale, 2 Lagerkräfte, Fahrer, Lkw. B: Dock, Regal, Lagerkraft, Fahrer, Lieferwagen.
 *  Aufträge mit deliverySite direkt gesetzt (Vertrag wie tests/yard-own.test.js: angenommen und sofort beendet, Gebiete mit Standort). */
function setup({vehicle='truck',pallet=false,forkliftA=true,forkliftB=true,warehouseA=2}={}){
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,A='site-1',B=cmd(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(const site of [A,B]){cmd(sim,{type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});}
 cmd(sim,{type:'build',buildingType:'rack',site:A,x:5,y:2,rotation:0});
 if(pallet){if(forkliftA)cmd(sim,{type:'build',buildingType:'forklift',site:A,x:9,y:6,rotation:0});if(forkliftB)cmd(sim,{type:'build',buildingType:'forklift',site:B,x:9,y:6,rotation:0});}
 for(let i=0;i<warehouseA;i++)cmd(sim,{type:'hire',role:'warehouse',site:A});
 cmd(sim,{type:'hire',role:'warehouse',site:B});cmd(sim,{type:'hire',role:'driver',site:A});cmd(sim,{type:'hire',role:'driver',site:B});
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:vehicle,site:A}).id,van=cmd(sim,{type:'buyVehicle',vehicleType:'van',site:B}).id;
 const k=s.contracts[0];cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});
 k.unit=pallet?'pallet':'parcel';k.lanes=[{id:'lane-1',name:'Nahbezirk',distance:20,site:A},{id:'lane-2',name:'Fernbezirk',distance:25,site:B}];k.laneShare=[0.5,0.5];
 return {sim,s,A,B,truck,van,k};
}
/** Auftrag mit Ware direkt im Lager (Pakete bereits sortiert). */
function order(env,{qty,to,due=900,item,location='stock',stock=qty}){
 const {sim,s,A,B,k}=env,id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:to===B?'lane-2':'lane-1',customer:`${to===B?'Fernbezirk':'Nahbezirk'} (Testversand)`,item:item||(k.unit==='pallet'?'pallet':'parcel'),qty,price:9,due,quality:0,site:A,deliverySite:to,status:'active',delivered:0,paid:0});
 if(stock)assert.ok(sim.api.inventory.add({item:item||(k.unit==='pallet'?'pallet':'parcel'),qty:stock,site:A,owner:id,location,quality:100,unitCost:0}));
 return id;
}
const line=(env,departures=[600],extra={})=>cmd(env.sim,{type:'createLine',from:env.A,to:env.B,departures,vehicleId:env.truck,...extra}).id;

test('createLine/updateLine/deleteLine prüfen Standorte, Fahrplan, Ladeschluss und Fahrzeug',()=>{
 const env=setup(),{sim,s,A,B,truck,van}=env;
 const bad=c=>assert.equal(sim.command({type:'createLine',from:A,to:B,departures:[600],vehicleId:truck,...c}).ok,false);
 bad({to:A});bad({to:'site-999'});bad({departures:[]});bad({departures:[1440]});bad({departures:[600,600]});bad({departures:[6.5]});bad({cutoff:-1});bad({cutoff:721});bad({vehicleId:van});
 const id=line(env,[900,600]);const l=s.lines.find(x=>x.id===id);
 assert.deepEqual(l.departures,[600,900]);assert.equal(l.cutoff,L.CUTOFF);assert.equal(l.active,true);assert.equal(l.vehicleId,truck);
 bad({});// Doppelte Linie
 assert.equal(sim.command({type:'updateLine',id,departures:[2000]}).ok,false);assert.equal(sim.command({type:'updateLine',id,vehicleId:van}).ok,false);
 cmd(sim,{type:'updateLine',id,cutoff:45,departures:[700]});assert.equal(l.cutoff,45);assert.deepEqual(l.departures,[700]);
 assert.deepEqual(L.nextDeparture(s,l),{departAt:700,cutoffAt:655});
 validateState(s);assert.deepEqual(reload(sim).state.lines,clone(s.lines));
 cmd(sim,{type:'deleteLine',id});assert.equal(s.lines.length,0);
});

test('Kapazitätsrechnung entspricht transport.maxLoad, Mischladung teilt Volumen/Gewicht',()=>{
 const {s}=setup();const v=s.vehicles[0],van=s.vehicles[1];
 for(const veh of [v,van])for(const item of ['parcel','pallet','lamp'])assert.equal(L.room(veh,item),maxLoad(veh,item),`${veh.type}/${item}`);
 assert.equal(L.room(v,'parcel',79,0),20);assert.equal(L.room(v,'pallet',70,0),10);assert.equal(L.room(v,'pallet',0,5900),0);assert.equal(L.room(van,'parcel',0,79),2);
});

test('Ladeschluss reserviert Pakete für das Ziel nach Frist bis Kapazität; anderes Ziel, Inbound und fremde Standorte bleiben frei',()=>{
 const env=setup({vehicle:'van'}),{sim,s,A,B}=env;
 const late=order(env,{qty:100,to:B,due:1200}),early=order(env,{qty:100,to:B,due:800}),local=order(env,{qty:50,to:A});
 const id=line(env,[600]);
 sim.step(569-s.t);
 // Erst kurz vor Ladeschluss entladen: noch nicht sortiert (linehaul läuft vor sorting).
 const unsorted=order(env,{qty:30,to:B,due:700,location:'inbound'});assert.equal(s.linehauls.length,0);
 sim.step(1);assert.equal(s.t,570);
 const lh=s.linehauls[0];assert.equal(lh.status,'loading');assert.equal(lh.departAt,600);assert.equal(lh.lineId,id);
 const cap=maxLoad(s.vehicles.find(v=>v.id===lh.vehicleId),'parcel');assert.equal(cap,160);
 assert.deepEqual(lh.orders,[{orderId:early,qty:100},{orderId:late,qty:60}]);assert.equal(lh.qty,160);
 const res=o=>s.reservations.filter(r=>r.job===lh.id&&s.batches.find(b=>b.id===r.batchId).owner===o).reduce((n,r)=>n+r.qty,0);
 assert.equal(res(early),100);assert.equal(res(late),60);assert.equal(res(local),0);assert.equal(res(unsorted),0);
 const v=s.vehicles.find(v=>v.id===lh.vehicleId);assert.equal(v.status,'linehaul');assert.equal(v.linehaul,lh.id);
 // Exklusiv: andere Verwendungen des Fahrzeugs abgewiesen.
 assert.equal(sim.command({type:'transfer',item:'parcel',qty:1,toSite:B,vehicleId:v.id,site:A}).ok,false);
 assert.equal(sim.command({type:'cancelTour',id:'tour-0'}).ok,false);
 validateState(s);
});

test('Ende-zu-Ende: A → Linie → B → Sortierung B → Zustellung ab B → Zahlung; A darf Fremdgebiet nicht zustellen',()=>{
 const env=setup(),{sim,s,A,B,truck,van}=env;
 const o1=order(env,{qty:120,to:B,due:1000}),o2=order(env,{qty:20,to:A,due:1000});
 const oB=s.orders.find(o=>o.id===o1);
 // A: Zustellung des Fremdgebiets abgewiesen, eigenes Gebiet erlaubt.
 assert.equal(sim.command({type:'dispatch',orderId:o1,vehicleId:truck,qty:10,site:A}).ok,false);
 line(env,[600]);const money0=s.money;
 runUntil(sim,()=>s.linehauls[0]?.status==='loading');const lh=s.linehauls[0];
 const phases=[];runUntil(sim,()=>{if(phases.at(-1)!==lh.status)phases.push(lh.status);return lh.status==='complete';});
 assert.deepEqual(phases,['loading','transit','unloading','returning','complete']);
 assert.ok(lh.departedAt>=600);assert.ok(lh.arrivedAt>lh.departedAt);
 const distance=Math.max(15,Math.round(Math.hypot(44,18)));assert.equal(lh.distance,distance);assert.equal(lh.departedAt+Math.ceil(distance/0.85)+L.handlingMinutes(lh.orders,s),lh.arrivedAt);
 const row=s.ledger.find(r=>r.key===`linehaul:${lh.id}`);assert.ok(row,'Buchung fehlt');assert.equal(row.amount,-Math.round(distance*2*0.4*100)/100);assert.equal(row.category,'Transport');
 assert.equal(s.stats.revenue,0);assert.ok(s.money<money0);
 // Eigentum bleibt, Ware am Ziel, nichts mehr an A, Fahrzeug frei.
 assert.equal(qtyAt(s,o1,A),0);assert.equal(qtyAt(s,o1,B),120);assert.equal(total(s,o1),120);
 assert.equal(s.vehicles.find(v=>v.id===truck).status,'idle');
 // Sortierung B: inbound → stock.
 runUntil(sim,()=>qtyAt(s,o1,B,'stock')===120);
 // Zustellung ab B, Zahlung.
 assert.equal(sim.command({type:'dispatch',orderId:o1,vehicleId:van,qty:120,site:B}).ok,true);
 runUntil(sim,()=>oB.paid>0,600);
 assert.equal(oB.status,'fulfilled');assert.equal(oB.delivered,120);assert.equal(oB.paid,120*9);assert.equal(total(s,o1),0);
 assert.ok(s.batches.every(b=>b.qty>=0));validateState(s);
});

function scenario(){const env=setup();order(env,{qty:120,to:env.B,due:1000});order(env,{qty:40,to:env.B,due:1300});line(env,[600,1020]);return env;}
test('Speichern/Laden in jeder Phase ergibt denselben Endzustand; 1-min- und 60-min-Schritte gleich',()=>{
 const END=1500;
 const ref=scenario();ref.sim.step(END-ref.s.t);const want=hash(ref.sim);
 assert.ok(ref.s.linehauls.length>=1&&ref.s.linehauls.every(x=>['complete'].includes(x.status)));
 for(const phase of ['loading','transit','unloading','returning']){
  for(const late of [false,true]){
   const {sim,s}=scenario();runUntil(sim,()=>s.linehauls[0]?.status===phase);if(late)sim.step(1);
   if(s.linehauls[0].status===phase){const lh=s.linehauls[0];if(phase==='loading'&&late)assert.ok(lh.remaining<lh.duration||lh.loadDone);}
   const re=reload(sim);re.step(END-re.state.t);assert.equal(hash(re),want,`Phase ${phase}${late?' +1':''}`);
  }
 }
 const {sim}=scenario();const start=sim.state.t;for(let t=start;t<END;){const n=Math.min(60,END-t);sim.step(n);t+=n;}assert.equal(hash(sim),want);
 const one=scenario();for(let t=one.s.t;t<END;t++)one.sim.step(1);assert.equal(hash(one.sim),want);
});

test('Verpasste Abfahrt: kein Lkw, Fahrzeug belegt, keine Sendungen → nächste Abfahrt fährt',()=>{
 const env=setup(),{sim,s,B,truck}=env;order(env,{qty:50,to:B});
 const id=line(env,[600,700,800]);const l=s.lines.find(x=>x.id===id);
 cmd(sim,{type:'updateLine',id,vehicleId:null});sim.step(570-s.t);
 assert.equal(s.linehauls.length,0);assert.equal(l.wait,L.WAIT.vehicle);assert.equal(l.missed,1);
 cmd(sim,{type:'updateLine',id,vehicleId:truck});
 const v=s.vehicles.find(v=>v.id===truck);v.status='maintenance';v.maintenance={id:'maintenance-x',external:true,remaining:120,duration:120,cost:0};
 sim.step(670-s.t);assert.equal(l.wait,L.WAIT.maintenance);assert.equal(l.missed,2);
 v.status='idle';v.maintenance=null;
 sim.step(770-s.t);assert.equal(s.linehauls.length,1);assert.equal(l.wait,null);assert.equal(s.linehauls[0].departAt,800);
 validateState(s);
 // Leerer Ladeschluss: keine Fahrt, keine Kosten.
 const env2=setup(),id2=line(env2,[600]),l2=env2.s.lines.find(x=>x.id===id2);env2.sim.step(570-env2.s.t);
 assert.equal(env2.s.linehauls.length,0);assert.equal(l2.wait,L.WAIT.empty);assert.ok(!env2.s.ledger.some(r=>r.key.startsWith('linehaul:')));
});

test('Pflichtfall: Fahrzeug fällt nach Reservierung aus (Wartung/Storno) → Reservierung frei, Pakete bleiben, nächste Abfahrt nimmt sie mit',()=>{
 for(const kind of ['wartung','storno']){
  const env=setup(),{sim,s,A,B,truck}=env;for(const w of s.workers)w.shift='all';const o=order(env,{qty:80,to:B});line(env,[600,900]);
  sim.step(575-s.t);const lh=s.linehauls[0];assert.equal(lh.status,'loading');assert.ok(s.reservations.some(r=>r.job===lh.id));
  assert.ok(s.buildings.some(b=>b.task===lh.id));assert.ok(s.workers.some(w=>w.task===`${lh.id}:driver`));
  const v=s.vehicles.find(v=>v.id===truck);
  if(kind==='wartung'){v.condition=90;cmd(sim,{type:'serviceVehicleExternal',id:truck});assert.equal(v.status,'maintenance');}
  else cmd(sim,{type:'cancelLinehaul',id:lh.id});
  assert.equal(lh.status,'cancelled');assert.equal(s.reservations.filter(r=>r.job===lh.id).length,0);
  assert.equal(qtyAt(s,o,A,'stock'),80);assert.ok(s.batches.filter(b=>b.owner===o).every(b=>b.reserved===0));
  assert.ok(!s.buildings.some(b=>b.task===lh.id));assert.ok(!s.workers.some(w=>w.task?.startsWith(lh.id)));
  assert.equal(v.linehaul,null);validateState(s);reload(sim);
  assert.equal(sim.command({type:'cancelLinehaul',id:lh.id}).ok,false);
  runUntil(sim,()=>s.linehauls.some(x=>x.status==='complete'),900);
  assert.equal(qtyAt(s,o,A),0);assert.equal(qtyAt(s,o,B),80);assert.equal(s.linehauls.find(x=>x.status==='complete').departAt,900);
  validateState(s);
 }
});

test('Wartegründe: keine Lagerkraft, kein Dock am Ziel, Kasse; Abfahrt verspätet statt verloren',()=>{
 const env=setup(),{sim,s,A,B}=env;const o=order(env,{qty:60,to:B});line(env,[600]);
 const wA=s.workers.filter(w=>w.site===A&&w.role==='warehouse');for(const w of wA)w.shift='night';
 sim.step(575-s.t);const lh=s.linehauls[0];assert.equal(lh.blocked,L.WAIT.staff);assert.equal(lh.remaining,lh.duration);
 for(const w of wA)w.shift='day';
 const money=s.money;s.money=1;sim.step(610-s.t);assert.equal(lh.status,'loading');assert.equal(lh.blocked,L.WAIT.cash);
 s.money=money;const dockB=s.buildings.find(b=>b.type==='dock'&&b.site===B);dockB.enabled=false;
 sim.step(1);assert.equal(lh.status,'transit');assert.ok(lh.departedAt>600);
 runUntil(sim,()=>lh.status==='unloading');sim.step(2);assert.equal(lh.blocked,L.WAIT.dock);assert.equal(lh.remaining,lh.duration);validateState(s);reload(sim);
 dockB.enabled=true;runUntil(sim,()=>lh.status==='returning');assert.equal(qtyAt(s,o,B),60);
 const wB=s.workers.find(w=>w.site===B&&w.role==='warehouse');assert.notEqual(wB.task,`${lh.id}:warehouse`);
});

test('Paletten: Stapler an Start und Ziel nötig, Akku wird belastet',()=>{
 const env=setup({pallet:true,forkliftA:false}),{sim,s,A,B}=env;const o=order(env,{qty:1,to:B});line(env,[600]);
 sim.step(575-s.t);const lh=s.linehauls[0];assert.equal(lh.pallet,true);assert.equal(lh.qty,1);assert.equal(lh.blocked,'Kein Stapler');
 cmd(sim,{type:'build',buildingType:'forklift',site:A,x:9,y:6,rotation:0});sim.step(2);
 const fA=s.buildings.find(b=>b.type==='forklift'&&b.site===A);assert.equal(fA.task,`${lh.id}:forklift`);assert.ok(fA.charge<100);
 validateState(s);reload(sim);
 runUntil(sim,()=>lh.status==='returning');assert.equal(qtyAt(s,o,B,'stock'),1);assert.ok(!s.buildings.some(b=>b.type==='forklift'&&b.task));
});

test('validate lehnt beschädigte Linienzustände ab',()=>{
 const env=setup(),{sim,s,B}=env;order(env,{qty:50,to:B});line(env,[600]);sim.step(575-s.t);
 const base=JSON.parse(sim.serialize()),bad=f=>{const x=clone(base);f(x);assert.throws(()=>validateState(x));};
 bad(x=>{x.linehauls[0].qty=51;});
 bad(x=>{x.linehauls[0].orders[0].qty=49;x.linehauls[0].qty=49;});
 bad(x=>{x.vehicles.find(v=>v.id===x.linehauls[0].vehicleId).status='idle';});
 bad(x=>{x.vehicles.find(v=>v.status==='idle').status='linehaul';});
 bad(x=>{x.linehauls[0].status='transit';});
 bad(x=>{x.lines[0].departures=[600,600];});
 bad(x=>{x.lines[0].to=x.lines[0].from;});
 bad(x=>{const d=x.buildings.find(b=>b.type==='dock'&&b.site===B);d.task=x.linehauls[0].id;});
 bad(x=>{x.linehauls.push({...clone(x.linehauls[0]),id:'linehaul-9999'});x.seq=10000;});
 assert.doesNotThrow(()=>validateState(clone(base)));
});

test('Echte Verträge: Fremdgebiet-Aufträge (deliverySite aus contracts) fahren per Linie nach B, eigenes Gebiet bleibt in A',()=>{
 const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state,A='site-1',B=cmd(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 let k=null;
 for(let day=0;day<60&&!k;day++){for(const c of s.contracts.filter(c=>c.status==='offer')){if(c.unit!=='pallet'&&c.lanes.some(l=>laneSite(c,l)===B)){k=c;break;}cmd(sim,{type:'cancelContract',id:c.id});}if(!k)sim.step(720);}
 assert.ok(k,'Angebot mit Fremdgebiet fehlt');
 for(const site of [A,B]){cmd(sim,{type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site,x:5,y:2,rotation:0});cmd(sim,{type:'hire',role:'warehouse',site});cmd(sim,{type:'hire',role:'warehouse',site});cmd(sim,{type:'hire',role:'driver',site});}
 for(const w of s.workers)w.shift='all';
 const truck=cmd(sim,{type:'buyVehicle',vehicleType:'truck',site:A}).id;
 cmd(sim,{type:'createLine',from:A,to:B,departures:[0,360,720,1080],vehicleId:truck});
 cmd(sim,{type:'acceptContract',id:k.id});
 runUntil(sim,()=>s.linehauls.some(x=>x.status==='complete'),4000);
 const lh=s.linehauls.find(x=>x.status==='complete');
 for(const x of lh.orders){const o=s.orders.find(o=>o.id===x.orderId);assert.equal(o.contractId,k.id);assert.equal(o.deliverySite,B);assert.equal(o.site,A);}
 for(const o of s.orders.filter(o=>o.contractId===k.id&&o.deliverySite===A)){assert.ok(!s.batches.some(b=>b.owner===o.id&&b.site===B&&b.qty>0));assert.equal(sim.command({type:'dispatch',orderId:o.id,vehicleId:truck,qty:1,site:B}).ok,false);}
 const carried=lh.orders[0].orderId;assert.ok(s.batches.some(b=>b.owner===carried&&b.site===B&&b.qty>0)||s.orders.find(o=>o.id===carried).delivered>0);
 validateState(s);const re=reload(sim);sim.step(120);re.step(120);assert.equal(sim.serialize(),re.serialize());
});
