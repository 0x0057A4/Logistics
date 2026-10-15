import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,makeLocks} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
const key='industrie-logistik-v1-guided',backup=key+'-backup';

/** Zählt vollständige Validierungen über Simulation.fromJSON während fn. */
function countLoads(fn){const original=Simulation.fromJSON;let calls=0;Simulation.fromJSON=function(text){calls++;return original.call(this,text);};try{fn();}finally{Simulation.fromJSON=original;}return calls;}

test('Speichern: periodisches Sichern validiert den Altstand nicht erneut; Backup = zuletzt geschriebener Stand',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');assert.equal(ui.run('save()'),true);
 for(let i=0;i<3;i++){
  const previous=ui.memory.get(key);ui.run('sim.step(17);dirty=true');
  assert.equal(countLoads(()=>assert.equal(ui.run('save()'),true)),0);
  assert.equal(ui.memory.get(backup),previous);assert.equal(ui.memory.get(key),ui.run('sim.serialize()'));assert.equal(ui.run('dirty'),false);
 }
 ui.run('guard.dispose()');
});

test('Speichern: zuletzt geladener Stand gilt als geprüft; erster Autosave nach Neustart ohne Vollvalidierung',async()=>{
 const memory=new Map(),locks=makeLocks();
 const first=await boot({memory,locks});await first.click('start');first.click('starter');first.run('save()');const stored=memory.get(key);first.run('guard.dispose()');
 await new Promise(resolve=>setImmediate(resolve));
 const second=await boot({memory,locks});assert.equal(second.run('sim.serialize()'),stored);
 second.run('sim.step(5);dirty=true');
 assert.equal(countLoads(()=>assert.equal(second.run('save()'),true)),0);
 assert.equal(memory.get(backup),stored);second.run('guard.dispose()');
});

test('Speichern: fremder beschädigter Hauptstand überschreibt nie die intakte Sicherung; fremder gültiger Stand wird einmal geprüft',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');ui.run('save()');ui.run('sim.step(3);dirty=true');ui.run('save()');
 const intact=ui.memory.get(backup);assert.ok(intact);
 ui.memory.set(key,'{"schema":1,"kaputt":');ui.run('sim.step(3);dirty=true');
 assert.equal(countLoads(()=>assert.equal(ui.run('save()'),true)),1);
 assert.equal(ui.memory.get(backup),intact);assert.equal(ui.memory.get(key),ui.run('sim.serialize()'));
 const foreign=new Simulation({mode:'guided',seed:99}).serialize();ui.memory.set(key,foreign);ui.run('sim.step(3);dirty=true');
 assert.equal(countLoads(()=>ui.run('save()')),1);assert.equal(ui.memory.get(backup),foreign);
 ui.run('guard.dispose()');
});

test('Autosave: requestIdleCallback bündelt Anforderungen, prüft beim Ausführen erneut Sperre, Modus und Änderungen',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');ui.run('save()');
 ui.run('globalThis.idle=[];requestIdleCallback=(fn,o)=>{idle.push({fn,o});return idle.length;}');
 ui.run('sim.step(9);dirty=true;requestIdleSave();requestIdleSave()');
 assert.equal(ui.run('idle.length'),1);assert.equal(ui.run('idle[0].o.timeout'),5000);
 const before=ui.memory.get(key);assert.notEqual(before,ui.run('sim.serialize()'));
 ui.run('idle[0].fn({timeRemaining:()=>10,didTimeout:false})');
 assert.equal(ui.memory.get(key),ui.run('sim.serialize()'));assert.equal(ui.run('dirty'),false);
 // Unverändert: Rückruf schreibt nichts.
 ui.run('requestIdleSave()');const unchanged=new Map(ui.memory);ui.run('idle[1].fn({})');assert.deepEqual(new Map(ui.memory),unchanged);
 // Sperre verloren zwischen Anforderung und Leerlauf: kein Schreiben.
 ui.run('sim.step(4);dirty=true;requestIdleSave()');ui.run('guard.release()');const locked=ui.memory.get(key);
 ui.run('idle[2].fn({})');assert.equal(ui.memory.get(key),locked);assert.equal(ui.run('dirty'),true);
 ui.run('guard.dispose()');
});

test('Autosave: ohne requestIdleCallback Rückfall auf setTimeout; temporärer Modus schreibt nie',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');ui.run('save()');
 ui.run('globalThis.timers=[];setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;}');
 ui.run('sim.step(6);dirty=true;requestIdleSave()');assert.equal(ui.run('timers.length'),1);assert.equal(ui.run('timers[0].ms'),0);
 ui.run('timers[0].fn()');assert.equal(ui.memory.get(key),ui.run('sim.serialize()'));
 ui.run('temporary=true;sim.step(2);dirty=true;requestIdleSave()');const kept=ui.memory.get(key);ui.run('timers[1].fn()');assert.equal(ui.memory.get(key),kept);
 ui.run('guard.dispose()');
});

test('Verlassen: visibilitychange hidden speichert synchron ohne Leerlauf-Warteschlange',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');ui.run('save()');
 ui.run('globalThis.idle=[];requestIdleCallback=fn=>{idle.push(fn);return idle.length;}');
 ui.run('sim.step(11);dirty=true;document.hidden=true');ui.listeners.visibilitychange();
 assert.equal(ui.memory.get(key),ui.run('sim.serialize()'));assert.equal(ui.run('idle.length'),0);
 ui.run('guard.dispose()');
});
