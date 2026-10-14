import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,makeLocks} from './ui-harness.js';
const key='industrie-logistik-v1-guided';
test('QS Speicher: Dirty-Retry speichert weder vor Zustimmung noch nach Dialogschließen; Zustimmung speichert exakt eigenen Stand',async()=>{
 const memory=new Map(),ui=await boot({memory});await ui.click('start');const previous=memory.get(key);ui.click('starter');const pending=ui.run('sim.serialize()');
 assert.notEqual(pending,previous);await ui.click('retryStorage');assert.equal(ui.nodes.get('#confirm').open,true);
 assert.equal(ui.run('save()'),false);assert.equal(memory.get(key),previous);ui.nodes.get('#confirm').close();
 assert.equal(ui.run('save()'),false);ui.run('setSpeed(4)');assert.equal(ui.run('speed'),0);assert.equal(memory.get(key),previous);
 await ui.click('retryStorage');await ui.click('confirmOk');assert.equal(memory.get(key),pending);assert.equal(ui.run('dirty'),false);ui.run('guard.dispose()');
});
test('QS Speicher: JSON trägt keine Tabsperre mit; temporärer Fortschritt importiert in freie Sitzung',async()=>{
 const memory=new Map(),locks=makeLocks(),first=await boot({memory,locks});await first.click('start');const saved=memory.get(key);
 const temporary=await boot({memory,locks});temporary.click('temporary');await temporary.click('confirmOk');temporary.click('starter');const raw=temporary.run('sim.serialize()');
 assert.equal(memory.get(key),saved);assert.equal(Object.hasOwn(JSON.parse(raw),'writable'),false);assert.equal(Object.hasOwn(JSON.parse(raw),'temporary'),false);
 first.run('guard.dispose()');await new Promise(resolve=>setImmediate(resolve));
 const fresh=await boot({memory,locks});await fresh.nodes.get('#importFile').onchange({target:{files:[{size:raw.length,text:async()=>raw}],value:''}});await fresh.click('confirmOk');
 assert.equal(fresh.run('writable'),true);assert.equal(fresh.run('sim.serialize()'),raw);assert.equal(memory.get(key),raw);fresh.run('guard.dispose()');temporary.run('guard.dispose()');
});
