import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';

test('Tourformular übergibt vier geordnete Stopps und numerische Rückgabemengen',async()=>{
 const ui=await boot();await ui.click('start');
 ui.run('sim.command=c=>(globalThis.received=c,{ok:true})');
 ui.submit('tour',{vehicleId:'vehicle-1',order1:'a',qty1:'2',returnQty1:'1',order2:'b',qty2:'3',returnQty2:'0',order3:'c',qty3:'4',returnQty3:'2',order4:'d',qty4:'5',returnQty4:'3'});
 const command=JSON.parse(ui.run('JSON.stringify(received)'));
 assert.equal(command.type,'dispatchTour');assert.deepEqual(command.stops,[{orderId:'a',qty:2,returnQty:1},{orderId:'b',qty:3,returnQty:0},{orderId:'c',qty:4,returnQty:2},{orderId:'d',qty:5,returnQty:3}]);
});
test('Tourentwurf bleibt beim Neurendern erhalten und wird beim Spielstandwechsel verworfen',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 ui.run("tourDraft={qty1:'7',returnQty1:'3'};openPanel('fleet');renderPanel()");
 const html=ui.nodes.get('#panelBody').innerHTML;assert.match(html,/name="qty1"[^>]*value="7"/);assert.match(html,/name="returnQty1"[^>]*value="3"/);assert.match(html,/Stopp 4/);
 await ui.submit('loadMode',{mode:'sandbox'});assert.equal(ui.run('Object.keys(tourDraft).length'),0);
});
test('Tourkarte zeigt Rückladung, echte Fahrzeugladung und Wartegrund ohne HTML-Injektion',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 const html=ui.run(`(()=>{const s=sim.state,v=s.vehicles[0],o=s.orders[0];const batch=sim.api.inventory.add({item:o.item,qty:2,site:v.site,location:'vehicle',owner:'company',quality:45,unitCost:10});s.returns.push({id:'ret-ui',qty:2,status:'onTour',cargo:[batch.id]});return tourCard(s,{id:'tour-ui',vehicleId:v.id,status:'returnUnloading',remaining:4,transportCost:14.4,blocked:'<Rampe fehlt>',stopIndex:1,stops:[{orderId:o.id,qty:3,status:'delivered',cargo:[],returnId:'ret-ui'}]});})()`);
 assert.match(html,/Quarantäne entladen/);assert.match(html,/Rückladung an Bord/);assert.match(html,/&lt;Rampe fehlt&gt;/);assert.match(html,/2 \/ 20 Volumen/);assert.doesNotMatch(html,/Tour vor Abfahrt stornieren/);
});
test('Vorschau zeigt Fachprüfung und Kosten ohne Simulation zu verändern',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 // Fertigungsanfragen erst mit Fertigungsanlage (A01 W1c): Montageplatz bauen, eine Minute laufen lassen.
 ui.run("sim.command({type:'build',buildingType:'assembly',x:5,y:3,rotation:0});sim.step(1);globalThis.mf=sim.state.orders.filter(o=>o.kind==='manufacturing');mf.slice(0,2).forEach(o=>{o.status='active';o.item='lamp';o.qty=20;o.delivered=0;});");
 const before=ui.run('sim.serialize()');
 const html=ui.run("tourPreview(sim.state,{vehicleId:sim.state.vehicles[0].id,order1:mf[0].id,order2:mf[1].id,qty1:'2',qty2:'3',returnQty1:'0',returnQty2:'0'})");
 assert.match(html,/Fahrtkosten/);assert.match(html,/Arbeits- und Fahrtzeit/);assert.match(html,/ohne zusätzliche Schicht-/);assert.equal(ui.run('sim.serialize()'),before);
 const invalid=ui.run("tourPreview(sim.state,{vehicleId:sim.state.vehicles[0].id,order1:mf[0].id,order2:mf[1].id,qty1:'200',qty2:'3'})");assert.match(invalid,/notice/);assert.equal(ui.run('sim.serialize()'),before);
});

test('Fahrerprognose zeigt Wartezeiten und benennt fehlendes Fahrpersonal',async()=>{
 const ui=await boot();
 const html=ui.run("driverForecastCard({elapsedMinutes:180,waitMinutes:60,breakMinutes:20,shiftMinutes:40,assumption:'Freie Rampe <angenommen>'})");
 assert.match(html,/180 Min./);assert.match(html,/20 \/ 40 Min./);assert.match(html,/&lt;angenommen&gt;/);
 assert.match(ui.run("driverForecastCard({elapsedMinutes:null,assumption:'Fahrpersonal fehlt'})"),/Fahrpersonal fehlt/);
});
