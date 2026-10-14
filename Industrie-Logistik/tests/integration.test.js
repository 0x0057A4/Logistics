import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';

const SITE='site-1';
const command=(sim,type,data={})=>{const result=sim.command({type,...data});assert.equal(result.ok,true,`${type}: ${result.message}`);return result;};
const until=(sim,predicate,max=900)=>{for(let n=0;n<max&&!predicate();n++)sim.step(1);assert.ok(predicate(),`Bedingung nach ${max} Minuten unerfüllt, t=${sim.state.t}`);};
const stock=(sim,item)=>sim.state.batches.filter(b=>b.item===item&&b.location==='stock'&&b.owner==='company').reduce((n,b)=>n+b.qty,0);
function integrity(sim){
  const s=sim.state;
  assert.ok(Number.isFinite(s.money));
  for(const b of s.batches){assert.ok(b.qty>=0,`Negative Charge ${b.id}`);assert.ok(b.reserved>=0&&b.reserved<=b.qty,`Ungültige Reservierung ${b.id}`);}
  const keys=s.ledger.map(e=>e.key);assert.equal(new Set(keys).size,keys.length,'Doppelte Geldbuchung');
  const amounts=s.ledger.reduce((n,e)=>n+e.amount,0);
  assert.ok(Math.abs(s.money-(85000+amounts))<0.011,`Geldbilanz ${s.money} / ${85000+amounts}`);
  for(const r of s.reservations)assert.ok(s.batches.some(b=>b.id===r.batchId),`Reservierung ohne Charge ${r.id}`);
}
function setup(){
  const sim=new Simulation({mode:'guided',seed:123});
  for(const [buildingType,x,y]of[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11]])command(sim,'build',{buildingType,x,y,site:SITE,rotation:0});
  for(const role of ['production','production','production','warehouse','driver'])command(sim,'hire',{role,site:SITE});
  for(const [type,recipe]of[['assembly','assemble'],['testing','test'],['packing','pack']])command(sim,'setRecipe',{id:sim.state.buildings.find(b=>b.type===type).id,recipe});
  command(sim,'buyVehicle',{vehicleType:'van',site:SITE});
  return sim;
}
function purchase(sim,qty=4){for(const item of ['housing','board','carton'])command(sim,'buy',{item,qty,supplier:'standard',site:SITE});}
function equivalentContinuation(sim,minutes=80){const clone=Simulation.fromJSON(sim.serialize());assert.equal(clone.serialize(),sim.serialize());sim.step(minutes);clone.step(minutes);assert.equal(clone.serialize(),sim.serialize());integrity(sim);}

test('Feste Minutenschritte bleiben deterministisch',()=>{
 const a=setup(),b=setup();purchase(a);purchase(b);a.step(180);for(let n=0;n<180;n++)b.step(1);assert.deepEqual(a.state,b.state);integrity(a);
});
test('Mehrfachbestellungen bleiben getrennt und vollständig',()=>{
 const s=new Simulation({mode:'guided',seed:3});command(s,'hire',{role:'warehouse',site:SITE});
 command(s,'buy',{item:'housing',qty:2,supplier:'standard',site:SITE});command(s,'buy',{item:'housing',qty:2,supplier:'standard',site:SITE});
 assert.equal(s.state.purchases.length,2);assert.notEqual(s.state.purchases[0].id,s.state.purchases[1].id);
 until(s,()=>stock(s,'housing')===4);s.step(30);assert.equal(stock(s,'housing'),4);integrity(s);
});
test('Echte Produktionskette erhält Materialmengen und Chargenherkunft',()=>{
 const s=setup();purchase(s);until(s,()=>stock(s,'lamp')===4);s.step(20);
 assert.equal(stock(s,'lamp'),4);for(const item of ['housing','board','carton','lamp_raw','lamp_tested'])assert.equal(stock(s,item),0,item);
 for(const batch of s.state.batches.filter(b=>b.item==='lamp'&&b.qty>0))assert.ok(batch.parents.length>0,'Herkunft fehlt');integrity(s);
});
test('Speichern während Fertigung erhält laufenden Vorgang',()=>{
 const s=setup();purchase(s);until(s,()=>s.state.jobs.some(j=>j.status!=='completed'&&j.remaining>0));equivalentContinuation(s);
});
test('Zwei Maschinen teilen letzte Materialien ohne Doppelverbrauch',()=>{
 const s=setup();command(s,'build',{buildingType:'assembly',site:SITE,x:9,y:7,rotation:0});
 command(s,'setRecipe',{id:s.state.buildings.at(-1).id,recipe:'assemble'});purchase(s,1);
 until(s,()=>stock(s,'lamp')===1);s.step(40);assert.equal(stock(s,'lamp'),1);assert.equal(stock(s,'housing'),0);assert.equal(stock(s,'board'),0);integrity(s);
});
test('Prognose verändert Ausgangsspielstand nicht',()=>{
 const s=setup();purchase(s);const before=s.serialize();const future=s.forecast(30);assert.equal(s.serialize(),before);assert.equal(future.t,s.state.t+30);
});
test('Pause erhält Material und laufenden Fertigungsauftrag beim Laden',()=>{
 const s=setup();purchase(s,1);until(s,()=>s.state.jobs.length>0);const job=s.state.jobs[0],id=job.id;
 command(s,'toggleBuilding',{id:job.building});const remaining=job.remaining;s.step(5);assert.equal(s.state.jobs.find(j=>j.id===id).remaining,remaining);
 const clone=Simulation.fromJSON(s.serialize());assert.deepEqual(clone.state,s.state);
 command(s,'toggleBuilding',{id:job.building});until(s,()=>stock(s,'lamp')===1);integrity(s);
});
test('Wartung lässt sich ohne Verlust speichern und fortsetzen',()=>{
 const s=setup();purchase(s,1);until(s,()=>stock(s,'lamp')===1);command(s,'hire',{role:'technician',site:SITE});
 command(s,'build',{buildingType:'workshop',site:SITE,x:9,y:8,rotation:0});command(s,'buy',{item:'spare',qty:1,supplier:'standard',site:SITE});until(s,()=>stock(s,'spare')===1);
 command(s,'maintain',{id:s.state.buildings.find(b=>b.type==='assembly').id});equivalentContinuation(s,20);
 assert.equal(s.state.buildings.find(b=>b.type==='assembly').condition,100);
});
test('Teilzustellung, spätere Zahlung und Speichern während Beladung/Fahrt',()=>{
 const s=setup();purchase(s);until(s,()=>stock(s,'lamp')>=4);
 const order=s.state.orders.find(o=>o.status==='offer'&&o.item==='lamp'&&o.qty>2);assert.ok(order,'Passender Startauftrag fehlt');command(s,'acceptOrder',{id:order.id});
 const vehicle=s.state.vehicles[0];command(s,'dispatch',{orderId:order.id,vehicleId:vehicle.id,qty:2,site:SITE});
 assert.ok(s.state.shipments.some(x=>x.status==='loading'),'Beladungszustand fehlt');
 let clone=Simulation.fromJSON(s.serialize());s.step(1);clone.step(1);assert.deepEqual(s.state,clone.state);
 until(s,()=>s.state.shipments.some(x=>x.status==='transit'));clone=Simulation.fromJSON(s.serialize());s.step(1);clone.step(1);assert.deepEqual(s.state,clone.state);
 until(s,()=>order.delivered===2);assert.equal(order.paid,0,'Zahlung erfolgt zu früh');assert.notEqual(order.status,'fulfilled');assert.equal(stock(s,'lamp'),2);
 until(s,()=>order.paid>0);const paid=order.paid;s.step(40);assert.equal(order.paid,paid,'Doppelte Zahlung');assert.ok(order.paid<=order.price*2);integrity(s);
});
test('Startauftrag durchläuft Einkauf bis vollständiger Bezahlung',()=>{
 const s=setup();const order=s.state.orders.find(o=>o.item==='lamp'&&o.qty===8);command(s,'acceptOrder',{id:order.id});purchase(s,8);
 until(s,()=>stock(s,'lamp')===8);command(s,'dispatch',{orderId:order.id,vehicleId:s.state.vehicles[0].id,qty:8,site:SITE});
 until(s,()=>order.paid===order.price*order.qty);assert.equal(order.delivered,8);assert.equal(order.status,'fulfilled');assert.equal(stock(s,'lamp'),0);integrity(s);
});
test('Bau verhindert Überlappung und blockiertes Eingangstor',()=>{
 const s=new Simulation({mode:'guided',seed:2});command(s,'build',{buildingType:'assembly',site:SITE,x:4,y:4,rotation:0});
 assert.equal(s.command({type:'build',buildingType:'testing',site:SITE,x:4,y:4,rotation:0}).ok,false);
 assert.equal(s.command({type:'build',buildingType:'assembly',site:SITE,x:0,y:8,rotation:0}).ok,false);integrity(s);
});
test('Ungültige Importdaten werden abgewiesen',()=>{
 const s=setup();
 for(const raw of ['kein JSON','null','{}',JSON.stringify({...s.state,schema:999}),JSON.stringify({...s.state,money:'unendlich'}),JSON.stringify({...s.state,buildings:[{id:'x',type:'unbekannt'}]})])assert.throws(()=>Simulation.fromJSON(raw),`Import akzeptiert: ${raw.slice(0,90)}`);
 const badVehicle=JSON.parse(s.serialize());badVehicle.vehicles[0].type='unbekannt';assert.throws(()=>Simulation.fromJSON(JSON.stringify(badVehicle)),'Unbekannter Fahrzeugtyp akzeptiert');
});
test('Negative und nichtendliche Einkaufsmengen werden abgewiesen',()=>{
 const s=setup();for(const qty of [-1,0,NaN,Infinity])assert.equal(s.command({type:'buy',item:'housing',qty,site:SITE,supplier:'standard'}).ok,false);assert.equal(s.state.purchases.length,0);integrity(s);
});

test('Forschung benötigt Labor und Personal, pausiert und bleibt speicherbar',()=>{
 const s=new Simulation({mode:'guided',seed:19});assert.equal(s.command({type:'startResearch',key:'efficiency'}).ok,false);
 command(s,'build',{buildingType:'research',site:SITE,x:5,y:5,rotation:0});assert.equal(s.command({type:'startResearch',key:'efficiency'}).ok,false);
 command(s,'hire',{role:'research',site:SITE});command(s,'startResearch',{key:'efficiency'});const r=s.state.research[0];
 assert.equal(s.command({type:'startResearch',key:'efficiency'}).ok,false);s.step(10);assert.equal(r.remaining,r.duration-10);
 command(s,'toggleBuilding',{id:r.building});const remaining=r.remaining;s.step(5);assert.equal(r.remaining,remaining);
 equivalentContinuation(s,5);command(s,'toggleBuilding',{id:r.building});until(s,()=>r.status==='completed');assert.equal(r.remaining,0);integrity(s);
});
test('Nachbestellregeln verhindern Doppelbestellungen und beachten Gesamtbudget',()=>{
 const s=new Simulation({mode:'guided',seed:8});command(s,'hire',{role:'warehouse',site:SITE});
 command(s,'addRule',{kind:'reorder',item:'housing',threshold:10,qty:2,budget:72,cooldown:100,site:SITE});
 assert.equal(s.command({type:'addRule',kind:'reorder',item:'housing',threshold:10,qty:2,budget:72,cooldown:100,site:SITE}).ok,false);
 s.step(99);assert.equal(s.state.purchases.length,1);s.step(2);assert.equal(s.state.purchases.length,2);s.step(150);assert.equal(s.state.purchases.length,2);assert.equal(s.state.rules[0].spent,72);equivalentContinuation(s,10);
});
test('Retoure erhält Menge und erstattet genau einmal; Reparatur benötigt Ersatzteile',()=>{
 const s=setup();const order=s.state.orders.find(o=>o.qty===8);command(s,'acceptOrder',{id:order.id});purchase(s,8);until(s,()=>stock(s,'lamp')===8);
 command(s,'dispatch',{orderId:order.id,vehicleId:s.state.vehicles[0].id,qty:8,site:SITE});until(s,()=>order.paid===order.price*8&&s.state.vehicles[0].status==='idle');
 command(s,'hire',{role:'service',site:SITE});command(s,'hire',{role:'technician',site:SITE});command(s,'build',{buildingType:'workshop',site:SITE,x:9,y:8,rotation:0});
 command(s,'createReturn',{orderId:order.id,qty:2});const r=s.state.returns[0];assert.equal(s.command({type:'createReturn',orderId:order.id,qty:7}).ok,false);
 equivalentContinuation(s,10);until(s,()=>r.status==='decision');assert.equal(stock(s,'lamp'),0);assert.equal(s.state.batches.filter(b=>b.location==='quarantine').reduce((n,b)=>n+b.qty,0),2);
 assert.equal(s.command({type:'resolveReturn',id:r.id,resolution:'repair'}).ok,false);
 command(s,'buy',{item:'spare',qty:2,supplier:'express',site:SITE});until(s,()=>stock(s,'spare')===2);command(s,'resolveReturn',{id:r.id,resolution:'repair'});
 equivalentContinuation(s,2);until(s,()=>r.status==='repaired');s.step(10);assert.equal(stock(s,'lamp'),2);assert.equal(stock(s,'spare'),0);assert.equal(s.state.ledger.filter(l=>l.key==='return-refund:'+r.id).length,1);assert.equal(s.command({type:'resolveReturn',id:r.id,resolution:'repair'}).ok,false);integrity(s);
});
test('Kredit ist Schuld, kein Umsatz; doppelte Buchung bleibt gesperrt',()=>{
 const s=new Simulation({mode:'guided',seed:1});command(s,'takeLoan',{amount:10000,requestId:'test-credit'});assert.equal(s.state.loanBalance,10000);assert.equal(s.state.stats.revenue,0);assert.equal(s.command({type:'takeLoan',amount:10000,requestId:'test-credit'}).ok,false);
 command(s,'repayLoan',{amount:1000});assert.equal(s.state.loanBalance,9000);integrity(s);
});
