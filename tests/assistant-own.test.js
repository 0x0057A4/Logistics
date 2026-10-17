// Eigene Prüfungen A06/A07: Dispositionsassistent (W3c-S2, docs/SCHNITTSTELLEN-0.14-W3c.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import * as A from '../dist/assistant.js';
import * as yard from '../dist/yard.js';
import {WAIT} from '../dist/linehaul.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const reload=sim=>Simulation.fromJSON(sim.serialize());

/** Sandbox: Hub A (Dock, 2 Regale, 2 Lagerkräfte, Fahrer, Lkw) und Hub B. Vertrag angenommen und sofort beendet (wie linehaul-own). */
function setup({vehicles=['truck'],drivers=1}={}){
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,SA='site-1',SB=cmd(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(const site of [SA,SB]){cmd(sim,{type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});cmd(sim,{type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});}
 cmd(sim,{type:'build',buildingType:'rack',site:SA,x:5,y:2,rotation:0});
 cmd(sim,{type:'hire',role:'warehouse',site:SA});cmd(sim,{type:'hire',role:'warehouse',site:SA});
 for(let i=0;i<drivers;i++)cmd(sim,{type:'hire',role:'driver',site:SA});
 const ids=vehicles.map(t=>cmd(sim,{type:'buyVehicle',vehicleType:t,site:SA}).id);
 const k=s.contracts[0];cmd(sim,{type:'acceptContract',id:k.id});cmd(sim,{type:'cancelContract',id:k.id});
 return {sim,s,SA,SB,ids,k};
}
function order(env,{qty,due,to,stock=qty,air=false}){
 const {sim,s,SA,k}=env,id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:k.lanes?.[0]?.id??'lane-1',customer:`Gebiet ${id} (Testversand)`,item:'parcel',qty,price:9,due,quality:0,site:SA,deliverySite:to??SA,status:'active',delivered:0,paid:0,...(air?{airExport:true}:{})});
 if(stock)assert.ok(sim.api.inventory.add({item:'parcel',qty:stock,site:SA,owner:id,location:'stock',quality:100,unitCost:0}));
 return id;
}
const on=(env,extra={})=>cmd(env.sim,{type:'setAssistant',site:env.SA,enabled:true,dispatch:true,lines:true,gate:true,...extra});
const started=(s,id)=>s.shipments.some(sh=>sh.orderId===id)||s.tours.some(t=>t.stops.some(p=>p.orderId===id));
// Pünktlich zugestellte Einheiten (Einzelzustellung und Sammeltour).
const onTime=s=>{let n=0;for(const sh of s.shipments){const o=s.orders.find(o=>o.id===sh.orderId);if(sh.deliveredAt!=null&&sh.deliveredAt<=o.due)n+=sh.qty;}
 for(const t of s.tours)for(const p of t.stops){const o=s.orders.find(o=>o.id===p.orderId);if(p.status==='delivered'&&p.deliveredAt!=null&&p.deliveredAt<=o.due)n+=p.qty;}return n;};

test('setAssistant prüft Eingaben, speichert Einstellung, validate lehnt Fehler ab',()=>{
 const env=setup(),{sim,s,SA}=env;
 assert.equal(sim.command({type:'setAssistant',site:'site-999',enabled:true}).ok,false);
 assert.equal(sim.command({type:'setAssistant',site:SA,enabled:'ja'}).ok,false);
 assert.equal(sim.command({type:'setAssistant',site:SA,enabled:true,budget:-1}).ok,false);
 on(env,{budget:250});
 assert.deepEqual(s.assistant.sites[SA],{enabled:true,dispatch:true,lines:true,gate:true,budget:250,spent:0,day:0,hold:{}});
 cmd(sim,{type:'setAssistant',site:SA,gate:false,budget:null});assert.equal(s.assistant.sites[SA].gate,false);assert.equal(s.assistant.sites[SA].budget,null);assert.equal(s.assistant.sites[SA].enabled,true);
 validateState(s);assert.deepEqual(reload(sim).state.assistant,JSON.parse(JSON.stringify(s.assistant)));
 const bad=f=>{const c=JSON.parse(sim.serialize());f(c);assert.throws(()=>A.validate(c));};
 bad(c=>{c.assistant.sites['site-999']=c.assistant.sites[SA];});
 bad(c=>{c.assistant.sites[SA].enabled=1;});
 bad(c=>{c.assistant.sites[SA].budget=-5;});
 bad(c=>{c.assistant.log=Array.from({length:A.LOG_MAX+1},()=>({t:0,site:SA,kind:'x',text:'',refs:[],reason:''}));});
 bad(c=>{c.assistant.log=[{t:0,site:SA,kind:'x',text:'ohne Grund',refs:[]}];});
});

test('aus = keine Aktion: kein Versand, keine Linienzuordnung, kein Vorziehen, Zustand identisch zu ohne Einstellung',()=>{
 const run=off=>{const env=setup();const {sim,s,SA,SB}=env;order(env,{qty:30,due:s.t+90});
  cmd(sim,{type:'createLine',from:SA,to:SB,departures:[900],vehicleId:null});
  if(off)cmd(sim,{type:'setAssistant',site:SA,enabled:false});
  sim.step(120);return env;};
 const a=run(false),b=run(true);
 for(const {s}of [a,b]){assert.equal(s.shipments.length,0);assert.equal(s.tours.length,0);assert.equal(s.lines[0].vehicleId,null);assert.equal(s.assistant.log.length,0);}
 // Unterschied nur der gespeicherte Schalter und dessen Ereigniszeile.
 const strip=x=>{const o=JSON.parse(x.sim.serialize());delete o.assistant;o.events=o.events.filter(e=>e.kind!=='assistant');delete o.seq;return o.events.map(e=>[e.t,e.kind,e.text]).concat([o.orders,o.vehicles,o.batches,o.ledger.map(l=>[l.amount,l.category])]);};
 assert.deepEqual(strip(a),strip(b));
});

test('an: dringender Auftrag startet im nächsten Takt und kommt pünktlich an; nicht dringender Kleinauftrag wartet',()=>{
 const env=setup({vehicles:['truck','van']}),{sim,s}=env;
 const urgent=order(env,{qty:200,due:s.t+150}),later=order(env,{qty:10,due:s.t+1000});
 on(env);sim.step(A.TICK-(s.t%A.TICK));
 assert.equal(started(s,urgent),true);assert.equal(started(s,later),false);
 const sh=s.shipments.find(x=>x.orderId===urgent);assert.equal(s.vehicles.find(v=>v.id===sh.vehicleId).type,'truck','kleinstes ausreichendes Fahrzeug (Lieferwagen 160 < 200 Pakete)');
 const e=s.assistant.log.at(-1);assert.equal(e.kind,'dispatch');assert.match(e.reason,/Frist/);assert.ok(e.refs.includes(urgent));assert.ok(s.events.some(x=>x.kind==='assistant'&&x.refs.includes(urgent)));
 sim.step(200);assert.ok(onTime(s)>=200,'pünktlich zugestellt');
 // Kein zweiter Versand derselben Menge, kein Spam im Protokoll.
 assert.equal(s.shipments.filter(x=>x.orderId===urgent).length,1);
 validateState(s);
});

test('an: volle Ladung startet auch ohne knappe Frist',()=>{
 const env=setup({vehicles:['van']}),{sim,s}=env;
 const big=order(env,{qty:200,due:s.t+2000});on(env);sim.step(A.TICK);
 const sh=s.shipments.find(x=>x.orderId===big);assert.ok(sh);assert.equal(sh.qty,160);assert.match(s.assistant.log.at(-1).reason,/Volle Ladung/);
});

test('an: mehrere dringende Kleinaufträge fahren als Sammeltour',()=>{
 const env=setup({vehicles:['truck']}),{sim,s}=env;
 const o1=order(env,{qty:10,due:s.t+100}),o2=order(env,{qty:12,due:s.t+120}),o3=order(env,{qty:8,due:s.t+150});
 on(env);sim.step(A.TICK);
 assert.equal(s.tours.length,1);assert.deepEqual(s.tours[0].stops.map(p=>p.orderId),[o1,o2,o3]);assert.equal(s.shipments.length,0);
 assert.equal(s.assistant.log.at(-1).kind,'tour');
});

test('an: Linie ohne Lkw bekommt freien Lkw am Start, Lieferwagen nicht; Zustellung belegt Linien-Lkw nicht',()=>{
 const env=setup({vehicles:['van','truck']}),{sim,s,SA,SB,ids}=env;
 const id=cmd(sim,{type:'createLine',from:SA,to:SB,departures:[900],vehicleId:null}).id;
 order(env,{qty:30,due:s.t+100});
 on(env);sim.step(A.TICK);
 const l=s.lines.find(x=>x.id===id);assert.equal(l.vehicleId,ids[1]);
 assert.ok(s.assistant.log.some(e=>e.kind==='line'&&e.refs.includes(id)&&/Kein Lkw/.test(e.reason)));
 assert.ok(!s.shipments.some(sh=>sh.vehicleId===ids[1]),'Linien-Lkw bleibt frei');
 // Ohne freien Lkw: einmal protokolliert, Sperrfrist statt Wiederholung.
 const env2=setup({vehicles:['van']});cmd(env2.sim,{type:'createLine',from:env2.SA,to:env2.SB,departures:[900],vehicleId:null});on(env2);env2.sim.step(A.HOLD-5);
 assert.equal(env2.s.assistant.log.filter(e=>e.kind==='line').length,1);
 assert.equal(WAIT.vehicle,'Kein Lkw zugeordnet');
});

test('an: gefährdeter Fremd-Lkw am Tor wird vorgezogen, nicht gefährdeter nicht',()=>{
 const env=setup(),{sim,s,SA,k}=env;
 const mk=(qty,due)=>{const id=order(env,{qty,due,stock:0});return yard.schedule(s,sim.api,{contractId:k.id,site:SA,parcels:qty,eta:s.t+10,orderIds:[id]});};
 const safe=mk(20,s.t+2000),risk=mk(400,s.t+30);
 assert.equal(risk.atRisk,true);assert.equal(safe.atRisk,false);
 on(env);sim.step(A.TICK);
 assert.equal(risk.priority,true);assert.equal(safe.priority,false);
 const e=s.assistant.log.find(e=>e.kind==='gate');assert.ok(e.refs.includes(risk.id));assert.match(e.reason,/gefährdet/);
 sim.step(A.TICK);assert.equal(s.assistant.log.filter(e=>e.kind==='gate').length,1,'kein zweites Vorziehen');
});

test('Budget und Kasse: Assistent startet nichts darüber, protokolliert einmal je Sperrfrist',()=>{
 const env=setup(),{sim,s}=env;const id=order(env,{qty:30,due:s.t+100});
 on(env,{budget:10});sim.step(A.HOLD-A.TICK);
 assert.equal(started(s,id),false);const blocked=s.assistant.log.filter(e=>e.kind==='blocked');
 assert.equal(blocked.length,1);assert.match(blocked[0].reason,/Tagesbudget/);
 cmd(sim,{type:'setAssistant',site:env.SA,budget:24});sim.step(A.HOLD);assert.equal(started(s,id),true);assert.equal(s.assistant.sites[env.SA].spent,24);
 const env2=setup(),id2=order(env2,{qty:30,due:env2.s.t+100});env2.s.money=5;on(env2);env2.sim.step(A.TICK);
 assert.equal(started(env2.s,id2),false);assert.match(env2.s.assistant.log.at(-1).reason,/Kasse/);
});

test('Abgelehnter Befehl: Grund aus dem Ergebnis, Sperrfrist je Ziel',()=>{
 const env=setup(),{sim,s}=env;const id=order(env,{qty:30,due:s.t+100});
 // Qualitätsanforderung nicht erfüllbar → transport.dispatch lehnt ab.
 s.orders.find(o=>o.id===id).quality=101;
 on(env);sim.step(A.HOLD-A.TICK);
 const b=s.assistant.log.filter(e=>e.kind==='blocked');assert.equal(b.length,1);assert.match(b[0].reason,/Qualität/);assert.equal(started(s,id),false);
 sim.step(2*A.TICK);assert.equal(s.assistant.log.filter(e=>e.kind==='blocked').length,2,'nach Sperrfrist erneut versucht');
});

test('Luftzubringer: fehlender Befehl wird still übersprungen',()=>{
 const env=setup(),{sim,s,k}=env;k.flights=[s.t%1440+120];k.cutoff=90;
 const id=order(env,{qty:10,due:s.t+300,air:true});on(env);sim.step(30);
 if(sim.command({type:'dispatchAirShuttle'}).message==='Befehl unbekannt.'){assert.equal(s.assistant.log.length,0);assert.equal(started(s,id),false);}
 assert.ok(!s.assistant.log.some(e=>/Befehl unbekannt/.test(e.reason)));
 validateState(s);
});

function scenario(assist){
 const env=setup({vehicles:['truck','van'],drivers:2}),{sim,s,SA,SB}=env;
 order(env,{qty:30,due:s.t+150});order(env,{qty:15,due:s.t+260});order(env,{qty:80,due:s.t+1500});order(env,{qty:12,due:s.t+400});order(env,{qty:40,due:s.t+700});
 cmd(sim,{type:'createLine',from:SA,to:SB,departures:[1000],vehicleId:null});
 if(assist)on(env);return env;
}
test('Laden mitten im Betrieb ergibt denselben Endhash; deterministisch',()=>{
 const a=scenario(true);a.sim.step(97);let b=reload(a.sim);a.sim.step(400);b.step(400);assert.equal(hash(a.sim),hash(b));
 const c=scenario(true);c.sim.step(497);assert.equal(hash(c.sim),hash(a.sim));
 assert.ok(a.s.assistant.log.length>0);validateState(a.s);
});

test('Vergleich gleicher Seed: mit Assistent mindestens so pünktlich wie ohne',()=>{
 const off=scenario(false),onEnv=scenario(true);off.sim.step(1600);onEnv.sim.step(1600);
 const n0=onTime(off.s),n1=onTime(onEnv.s);
 assert.ok(n1>=n0,`mit ${n1} / ohne ${n0}`);assert.ok(n1>0);
 assert.ok(onEnv.s.assistant.log.length<=A.LOG_MAX);validateState(onEnv.s);
});
