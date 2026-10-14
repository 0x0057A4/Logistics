import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {vehicleAtSite} from '../dist/scene.js';

test('Mietangebot zeigt Anfangsrate und Folgekosten vor verbindlicher Buchung',async()=>{
 const ui=await boot();await ui.click('start');ui.run("openPanel('fleet')");
 const html=ui.nodes.get('#panelBody').innerHTML;
 assert.match(html,/180 € sofort und je Spieltag/);assert.match(html,/1.440 Spielminuten/);assert.match(html,/auch bei Stillstand/);assert.match(html,/Keine anteilige Erstattung/);
 const before=ui.run('sim.state.money');ui.submit('rental',{vehicleType:'van'});
 assert.equal(ui.run('sim.state.money'),before-180);assert.equal(ui.run('sim.state.rentals.length'),1);
 assert.equal(ui.run('sim.state.rentals[0].homeSite'),ui.run('sim.state.selectedSite'));
 assert.match(ui.nodes.get('#panelBody').innerHTML,/Nächste Rate/);
});
test('Mietrückgabe verschiebt Fahrzeug in Historie und entfernt sichtbares Weltobjekt',async()=>{
 const ui=await boot();await ui.click('start');ui.submit('rental',{vehicleType:'truck'});ui.run("openPanel('fleet')");
 const id=ui.run('sim.state.rentals[0].id');ui.click('returnRental',id);
 assert.equal(ui.run('sim.state.rentals[0].status'),'active');await ui.click('confirmOk');
 assert.equal(ui.run('sim.state.rentals[0].status'),'returned');
 const html=ui.nodes.get('#panelBody').innerHTML;assert.match(html,/Abgeschlossene Fahrzeugmieten/);assert.doesNotMatch(html,/data-action="returnRental"/);assert.doesNotMatch(html,/data-action="vehicleMaintain"/);
 const state=JSON.parse(ui.run('sim.serialize()'));const actual=state.state||state;assert.equal(vehicleAtSite(actual,actual.vehicles[0],actual.vehicles[0].site),false);
});
test('Beschäftigtes Mietfahrzeug bleibt nach abgewiesener Rückgabe aktiv',async()=>{
 const ui=await boot();await ui.click('start');ui.submit('rental',{vehicleType:'van'});
 ui.run("sim.state.vehicles[0].status='maintenance'");const id=ui.run('sim.state.rentals[0].id');
 ui.click('returnRental',id);await ui.click('confirmOk');
 assert.equal(ui.run('sim.state.rentals[0].status'),'active');assert.match(ui.nodes.get('#toast').textContent,/leer, frei/);
});
