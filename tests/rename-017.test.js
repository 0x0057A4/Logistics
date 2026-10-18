import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';

test('0.17 S2: Umbenennen von Anlage und Standort, leer setzt zurück, Speichern/Laden erhält Namen', () => {
  const sim = new Simulation({mode:'sandbox', seed:3}), s = sim.state;
  assert.equal(sim.command({type:'build', buildingType:'testing', x:5, y:2, rotation:0}).ok, true);
  const b = s.buildings.at(-1), site = s.sites[0], orig = site.name;
  assert.equal(sim.command({type:'rename', target:'building', id:b.id, name:'  Prüfung –  Arbeitsleuchten '}).ok, true);
  assert.equal(b.label, 'Prüfung – Arbeitsleuchten'); assert.equal(b.type, 'testing');
  assert.equal(sim.command({type:'rename', target:'site', id:site.id, name:'Hub Nord'}).ok, true);
  assert.equal(site.name, 'Hub Nord'); assert.equal(site.defaultName, orig); assert.equal(site.id, s.sites[0].id);
  assert.equal(sim.command({type:'rename', target:'building', id:b.id, name:'x'.repeat(41)}).ok, false);
  assert.equal(sim.command({type:'rename', target:'building', id:'nope', name:'A'}).ok, false);
  const loaded = Simulation.fromJSON(sim.serialize());
  assert.equal(loaded.state.buildings.at(-1).label, 'Prüfung – Arbeitsleuchten'); assert.equal(loaded.state.sites[0].name, 'Hub Nord');
  assert.equal(sim.command({type:'rename', target:'building', id:b.id, name:'  '}).ok, true); assert.equal(b.label, undefined);
  assert.equal(sim.command({type:'rename', target:'site', id:site.id, name:''}).ok, true); assert.equal(site.name, orig); assert.equal(site.defaultName, undefined);
});
