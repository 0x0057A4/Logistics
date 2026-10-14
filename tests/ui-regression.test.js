import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {boot,makeLocks} from './ui-harness.js';
test('QS: Import eines anderen Modus erhält aktive Moduswahl nach Darstellungseinstellung',async()=>{
 const ui=await boot();await ui.click('start');
 const imported=new Simulation({mode:'sandbox'}).serialize();
 await ui.nodes.get('#importFile').onchange({target:{files:[{size:imported.length,text:async()=>imported}],value:''}});
 await ui.click('confirmOk');assert.equal(ui.run('sim.state.mode'),'sandbox');
 ui.listeners.change({target:{dataset:{pref:'large'},checked:true}});
 assert.equal(JSON.parse(ui.memory.get('industrie-logistik-v1-prefs')).mode,'sandbox');
});
test('QS: Neustart beendet vorheriges Versetzen und verwirft fremde Anlagen-ID',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 const id=ui.run('sim.state.buildings[0].id');ui.click('move',id);
 assert.equal(ui.run('moving'),id);
 ui.click('new');await ui.click('confirmOk');await ui.click('start');await ui.click('confirmOk');
 assert.equal(ui.run('moving'),null);assert.equal(ui.run('build'),null);
});

test('QS: Zweiter Tab blockiert Befehle und Speichern; Übernahme lädt jüngsten Stand',async()=>{
 const memory=new Map(),locks=makeLocks();
 const first=await boot({memory,locks});await first.click('start');
 const second=await boot({memory,locks});
 assert.equal(second.run('writable'),false);
 const initial=second.run('sim.serialize()'),saved=memory.get('industrie-logistik-v1-guided');
 second.click('starter');second.click('save');second.run('setSpeed(4)');
 assert.equal(second.run('sim.serialize()'),initial);assert.equal(second.run('speed'),0);
 assert.equal(memory.get('industrie-logistik-v1-guided'),saved);
 first.click('starter');first.click('save');const latest=first.run('sim.serialize()');
 first.run('guard.dispose()');await new Promise(resolve=>setImmediate(resolve));
 await second.submit('loadMode',{mode:'guided'});
 assert.equal(second.run('writable'),true);assert.equal(second.run('sim.serialize()'),latest);
 second.run('guard.dispose()');
});
test('QS: Moduswechsel erhält getrennte Unternehmen und kehrt zum gespeicherten Fortschritt zurück',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');const guided=ui.run('sim.serialize()');
 await ui.submit('loadMode',{mode:'sandbox'});assert.equal(ui.run('sim.state.mode'),'sandbox');assert.equal(ui.run('sim.state.buildings.length'),0);
 ui.submit('hire',{role:'production'});const sandbox=ui.run('sim.serialize()');
 await ui.submit('loadMode',{mode:'guided'});assert.equal(ui.run('sim.serialize()'),guided);
 await ui.submit('loadMode',{mode:'sandbox'});assert.equal(ui.run('sim.serialize()'),sandbox);
 ui.run('guard.dispose()');
});
test('QS: Sicherung laden stellt richtigen Stand her und löscht Auswahl, Vorschau und Baumodus',async()=>{
 const ui=await boot();await ui.click('start');const before=ui.run('sim.serialize()');
 ui.click('starter');ui.click('save');const changed=ui.run('sim.serialize()');
 ui.run("forecast=sim.forecast(1);selected=sim.state.buildings[0].id;moving=selected;build='assembly'");
 ui.click('backup');await ui.click('confirmOk');
 assert.equal(ui.run('sim.serialize()'),before);assert.equal(ui.run('forecast'),null);assert.equal(ui.run('selected'),null);assert.equal(ui.run('moving'),null);
 assert.equal(ui.memory.get('industrie-logistik-v1-guided-backup'),changed);
 ui.run('guard.dispose()');
});
test('QS: Belegter Zielmodus wird weder durch Laden noch Import überschrieben',async()=>{
 const memory=new Map(),locks=makeLocks();const a=await boot({memory,locks});await a.click('start');a.click('starter');
 const b=await boot({memory,locks});await b.submit('loadMode',{mode:'sandbox'});b.submit('hire',{role:'production'});b.click('save');
 const saved=memory.get('industrie-logistik-v1-sandbox'),source=a.run('sim.serialize()');
 const imported=new Simulation({mode:'sandbox'}).serialize();
 await a.nodes.get('#importFile').onchange({target:{files:[{size:imported.length,text:async()=>imported}],value:''}});await a.click('confirmOk');
 assert.equal(memory.get('industrie-logistik-v1-sandbox'),saved);assert.equal(a.run('sim.serialize()'),source);assert.equal(a.run('writable'),false);
 a.run('guard.dispose()');b.run('guard.dispose()');
});
