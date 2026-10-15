import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {boot} from './ui-harness.js';
test('UI startet und rendert alle Fachfenster ohne JavaScript-Ausnahme',async()=>{
 const ui=await boot();await ui.click('start');
 for(const panel of ['overview','production','inventory','purchasing','staff','orders','fleet','finance','research','rules','network','service','history','help','settings','detail','planning','special']){
  ui.run(`openPanel('${panel}')`);assert.ok(ui.nodes.get('#panelBody').innerHTML.length>0,panel);
 }
});
test('UI übergibt Versand-/Wartungsregeln und Spezialfracht samt Dokumentprüfung',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 for(const kind of ['dispatch','maintenance'])ui.submit('rule',{kind,item:'housing',threshold:'50',qty:'8',budget:'1000',cooldown:'120'});
 assert.equal(ui.run("sim.state.rules.map(r=>r.kind).join(',')"),'dispatch,maintenance');
 const id=ui.run("sim.state.orders.find(o=>o.kind==='manufacturing').id");ui.click('accept',id);
 ui.run("sim.command({type:'build',buildingType:'terminal',x:9,y:9,site:'site-1',rotation:0});sim.api.inventory.add({item:'lamp',qty:2,quality:95,unitCost:50,site:'site-1',location:'stock',owner:'company'});");
 ui.submit('freight',{orderId:id,qty:'2',mode:'air'});assert.equal(ui.run('sim.state.freights.length'),1);
 const fid=ui.run('sim.state.freights[0].id');ui.click('approveDocuments',fid);assert.equal(ui.run('sim.state.freights[0].documents'),'processing');ui.run("openPanel('special')");assert.ok(ui.nodes.get('#panelBody').innerHTML.includes('Frachtaufträge'));
 ui.click('cancelFreight',fid);await ui.click('confirmOk');assert.equal(ui.run('sim.state.freights[0].status'),'cancelled');
});
test('UI Aufbauassistent und Einkauf senden echte Fachbefehle',async()=>{
 // A02 W1b: Aufbauassistent richtet die Depot-Grundausstattung ein (Dock, Regal, Lagerkraft, Fahrer, Lieferwagen), kostenpflichtig 14.500 €.
 const ui=await boot();await ui.click('start');const money=ui.run('sim.state.money');ui.click('starter');assert.equal(ui.run("sim.state.buildings.map(b=>b.type).sort().join()"),'dock,rack');assert.equal(ui.run("sim.state.workers.map(w=>w.role).sort().join()"),'driver,warehouse');assert.equal(ui.run('sim.state.vehicles.length'),1);assert.equal(money-ui.run('sim.state.money'),14500);assert.equal(ui.run('panel'),'contracts');
 ui.click('starter');assert.equal(ui.run('sim.state.buildings.length'),2,'zweiter Klick kauft nichts doppelt');assert.equal(ui.run('sim.state.workers.length'),2);assert.equal(ui.run('sim.state.vehicles.length'),1);
 ui.submit('buy',{item:'housing',qty:'2',supplier:'standard'});assert.equal(ui.run('sim.state.purchases.length'),1);assert.equal(ui.run('sim.state.purchases[0].qty'),2);
 ui.click('save');assert.ok(ui.memory.has('industrie-logistik-v1-guided'));assert.doesNotThrow(()=>Simulation.fromJSON(ui.memory.get('industrie-logistik-v1-guided')));
 for(const panel of ['production','inventory','purchasing','staff','orders','fleet','finance','history'])assert.doesNotThrow(()=>ui.run(`openPanel('${panel}')`));
});
test('UI Suche verarbeitet Zahlen, Listen und leere Treffer ohne Ausnahme',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');ui.click('buy-kit');
 for(const query of ['leuchte','12','keintreffer','site-1','bereit'])for(const panel of ['production','inventory','purchasing','staff','orders','fleet','finance','history']){
  assert.doesNotThrow(()=>ui.run(`openPanel('${panel}');search=${JSON.stringify(query)};renderPanel()`),`${panel}: ${query}`);
 }
});
