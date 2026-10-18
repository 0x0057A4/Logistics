// A04 0.15 S3: Mega-Hub – Quergurtsorter (dist/sorting.js crossbelt, management.buildResearchMissing, core build).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation, validateState} from '../dist/core.js';
import {BUILDINGS} from '../dist/catalog.js';
import {summary, MISSORT_EVERY, sorterKey, sorterKey2} from '../dist/sorting.js';
import * as yard from '../dist/yard.js';

const SITE = 'site-1';
const ok = (sim, c) => { const r = sim.command(c); assert.equal(r.ok, true, `${c.type}: ${r.message}`); return r; };
const hash = sim => createHash('sha256').update(sim.serialize()).digest('hex');
const CB = {type:'build', buildingType:'crossbelt', x:8, y:2, site:SITE, rotation:0};

// Grundstand: Rampe, Labor, echte Forschung Mega-Hub (startResearch + Spielzeit), Vertrag für Auftragsreferenzen.
let BASE = null;
function base() {
  if (BASE) return Simulation.fromJSON(BASE);
  const sim = new Simulation({mode:'sandbox', seed:11}), s = sim.state;
  ok(sim, {type:'build', buildingType:'dock', x:2, y:10, site:SITE});
  ok(sim, {type:'build', buildingType:'research', x:15, y:12, site:SITE});
  ok(sim, {type:'build', buildingType:'rack', x:16, y:2, site:SITE});
  ok(sim, {type:'build', buildingType:'rack', x:16, y:4, site:SITE});
  ok(sim, {type:'hire', role:'research', site:SITE});
  const c = s.contracts[0];
  ok(sim, {type:'acceptContract', id:c.id}); ok(sim, {type:'cancelContract', id:c.id}); c.settled = true;
  const blocked = sim.command(CB);
  assert.equal(blocked.ok, false); assert.match(blocked.message, /Mega-Hub/);
  ok(sim, {type:'startResearch', key:'megahub', site:SITE});
  for (let i = 0; i < 400 && !s.research.some(r => r.key === 'megahub' && r.status === 'completed'); i++) sim.step(1);
  assert.ok(s.research.some(r => r.key === 'megahub' && r.status === 'completed'), 'Forschung abgeschlossen');
  // Forschungskraft entlassen ist nicht nötig; sie ist keine Lagerkraft.
  BASE = sim.serialize();
  return Simulation.fromJSON(BASE);
}
function hub({workers = 2, crossbelt = true} = {}) {
  const sim = base();
  if (crossbelt) ok(sim, CB);
  // Lagerkräfte ganztägig, damit Schichtwechsel die Durchsatzmessung nicht stört.
  for (let i = 0; i < workers; i++) { const id = ok(sim, {type:'hire', role:'warehouse', site:SITE}).id; ok(sim, {type:'setShift', id, shift:'all'}); }
  sim.state.sites[0].energy = 60;
  return sim;
}
function order(sim, qty, due) {
  const s = sim.state, id = sim.api.id('order'), c = s.contracts.find(k => k.status === 'ended');
  s.orders.push({id, kind:'logistics', source:'hub', contractId:c.id, lane:c.lanes[0].id, customer:'Nordbezirk (Versand Test)', item:'parcel', qty, price:1.2, due, quality:0, site:SITE, status:'active', delivered:0, paid:0});
  return id;
}
const parcels = (sim, owner, qty, item = 'parcel') => assert.ok(sim.api.inventory.add({item, qty, site:SITE, location:'inbound', owner}), 'Anlage');
const count = (s, loc, item = 'parcel') => s.batches.filter(b => b.item === item && (!loc || b.location === loc)).reduce((n, b) => n + b.qty, 0);
const resort = s => s.batches.filter(b => b.resort && b.location === 'inbound').reduce((n, b) => n + b.qty, 0);
const belt = s => s.buildings.find(b => b.type === 'crossbelt');
const st = s => s.sorting.sites[SITE];

test('Bau nur nach Forschung Mega-Hub; Katalogfeld research, Versetzen bleibt frei', () => {
  const fresh = new Simulation({mode:'sandbox', seed:3});
  const r = fresh.command(CB);
  assert.equal(r.ok, false); assert.match(r.message, /Forschung „Mega-Hub“/);
  assert.equal(fresh.state.buildings.length, 0, 'nichts gebaut, nichts gebucht');
  assert.equal(BUILDINGS.crossbelt.research, 'megahub');
  const sim = base(), money = sim.state.money;
  const id = ok(sim, CB).id;
  assert.equal(sim.state.money, money - BUILDINGS.crossbelt.cost);
  ok(sim, {type:'move', id, x:8, y:3});
  validateState(sim.state);
});

test('Durchsatz: 2 Lagerkräfte 2.400/h, eine Kraft halbe Leistung; Fehlwurf genau 1 % deterministisch', () => {
  const sim = hub({workers:2}), s = sim.state, o = order(sim, 3000, 5000);
  parcels(sim, o, 2000);
  sim.step(1); // Bindung
  const b = belt(s);
  assert.deepEqual(s.workers.filter(w => w.role === 'warehouse').map(w => w.task).sort(), [sorterKey(b), sorterKey2(b)].sort());
  const before = count(s, 'stock') + resort(s);
  sim.step(10);
  assert.equal(count(s, 'stock') + resort(s) - before, 400, '40 Pakete/min mit voller Besetzung');
  assert.equal(b.crew, 2);
  // Nur eine Lagerkraft: halbe Leistung (20/min).
  const one = hub({workers:1}), s1 = one.state, o1 = order(one, 3000, 5000);
  parcels(one, o1, 1000); one.step(1);
  const mid = count(s1, 'stock') + resort(s1);
  one.step(10);
  assert.equal(count(s1, 'stock') + resort(s1) - mid, 200, '20 Pakete/min mit einer Kraft');
  assert.equal(belt(s1).crew, 1);
  assert.equal(summary(s1, SITE).rate, 20);
  assert.equal(summary(s, SITE).rate, 40);
  // Fehlwürfe: jedes 100. verarbeitete Paket; Menge exakt erhalten.
  const processed = count(s, 'stock') + resort(s);
  assert.equal(st(s).rejects, Math.floor(processed / MISSORT_EVERY));
  assert.equal(count(s), 2000, 'keine Pakete verloren oder erzeugt');
  validateState(s);
});

test('Fehlwürfe gehen in die Nachsortierung von Hand; Statistik rejects; jedes Paket genau einmal sortiert', () => {
  const sim = hub({workers:3}), s = sim.state, o = order(sim, 1000, 5000);
  parcels(sim, o, 500);
  for (let i = 0; i < 60 && count(s, 'stock') < 500; i++) sim.step(1);
  assert.equal(count(s, 'stock'), 500, 'Quergurt + Nachsortierung räumen den Eingang vollständig');
  assert.equal(st(s).rejects, 5, '1 % von 500');
  assert.equal(st(s).total, 500, 'sortiert zählt jedes Paket genau einmal');
  const marked = s.batches.filter(b => b.resort);
  assert.ok(marked.length >= 1 && marked.every(b => b.owner === o && b.parents.length === 1), 'Fehlwurfcharge: Eigentum und Herkunft erhalten');
  validateState(s);
});

test('Ohne freie dritte Kraft warten Fehlwürfe inbound; sobald Hand frei ist, werden sie nachsortiert', () => {
  const sim = hub({workers:2}), s = sim.state, o = order(sim, 1000, 5000);
  parcels(sim, o, 1500);
  sim.step(31); // 31 Minuten à 40 = 1.240 verarbeitet (Bindung und Sortierung in derselben Minute)
  assert.equal(st(s).rejects, 12);
  assert.equal(resort(s), 12, 'beide Kräfte am Quergurt gebunden: Fehlwürfe warten');
  assert.equal(count(s, 'stock'), 1228);
  for (let i = 0; i < 20; i++) sim.step(1); // Eingang leer → Quergurt idle → Kräfte frei → Nachsortierung
  assert.equal(resort(s), 0); assert.equal(count(s, 'stock'), 1500);
  assert.equal(belt(s).status, 'idle');
});

test('Strom fehlt: Status power, keine Bewegung, Lagerkräfte frei; Störung/Pause ebenso', () => {
  const sim = hub({workers:2}), s = sim.state, o = order(sim, 1000, 5000);
  parcels(sim, o, 100);
  s.sites[0].energy = 0;
  sim.step(3);
  const b = belt(s);
  assert.equal(b.status, 'power');
  assert.ok(!s.workers.some(w => w.task === sorterKey(b) || w.task === sorterKey2(b)));
  s.sites[0].energy = 60; b.condition = 3; sim.step(2); assert.equal(b.status, 'broken');
  b.condition = 100; ok(sim, {type:'toggleBuilding', id:b.id}); sim.step(2); assert.equal(b.status, 'paused');
  assert.equal(count(s), 100);
});

test('Sperrgut (noSorter) läuft nie über den Quergurt', () => {
  const sim = hub({workers:2}), s = sim.state, o = order(sim, 1000, 5000);
  parcels(sim, o, 200); parcels(sim, o, 5, 'bulky');
  for (let i = 0; i < 20; i++) sim.step(1);
  assert.equal(count(s, 'stock'), 200);
  assert.ok(!s.batches.some(b => b.item === 'bulky' && b.resort), 'kein Sperrgut als Fehlwurf');
  assert.equal(st(s).total, 200, 'Quergurt zählt nur Pakete');
  assert.equal(count(s, null, 'bulky'), 5, 'Sperrgut-Menge erhalten');
});

test('Entladen hat Vorrang vor dem Quergurt (zwei Lagerkräfte)', () => {
  const sim = hub({workers:2}), s = sim.state;
  const old = order(sim, 3000, 5000); parcels(sim, old, 2000);
  sim.step(2);
  const id = order(sim, 60, 900), c = s.contracts.find(k => k.status === 'ended');
  const a = yard.schedule(s, sim.api, {contractId:c.id, site:SITE, parcels:60, eta:s.t + 1, orderIds:[id]});
  let staffWait = 0, half = 0;
  for (let i = 0; i < 80 && a.phase !== 'exit'; i++) { sim.step(1); if (a.phase === 'unloading' && a.waitReason === yard.WAIT.staff) staffWait++; if (belt(s).crew === 1) half++; }
  assert.equal(a.phase, 'exit');
  assert.ok(staffWait <= 1, `Lkw wartete ${staffWait} min auf Personal`);
  assert.ok(half > 0, 'Quergurt lief währenddessen mit halber Besetzung');
  sim.step(2);
  assert.equal(belt(s).crew, 2, 'nach dem Entladen wieder volle Besetzung');
  assert.equal(count(s, 'inbound') + count(s, 'stock'), 2060);
});

test('Speichern/Laden mitten im Betrieb setzt bitgleich fort (Akkumulator, Zähler, Fehlwürfe)', () => {
  const run = reload => {
    let sim = hub({workers:2});
    const o = order(sim, 1000, 5000); parcels(sim, o, 700);
    for (let i = 0; i < 40; i++) { sim.step(1); if (reload && i % 7 === 3) sim = Simulation.fromJSON(sim.serialize()); }
    return sim;
  };
  const a = run(false), b = run(true);
  assert.equal(hash(a), hash(b));
  assert.ok(a.state.sorting.sites[SITE].rejects > 0);
});

test('Validierung lehnt beschädigte Quergurtdaten ab', () => {
  const sim = hub({workers:2}), o = order(sim, 1000, 5000); parcels(sim, o, 300); sim.step(5);
  const bad = mut => { const x = JSON.parse(sim.serialize()); mut(x); assert.throws(() => Simulation.fromJSON(JSON.stringify(x)), /Sortierdaten|Spielstand/); };
  bad(x => { x.buildings.find(b => b.type === 'crossbelt').sortCount = 100; });
  bad(x => { x.buildings.find(b => b.type === 'crossbelt').crew = 3; });
  bad(x => { x.sorting.sites[SITE].rejects = -1; });
  bad(x => { x.batches.find(b => b.item === 'parcel').resort = 'ja'; });
});
