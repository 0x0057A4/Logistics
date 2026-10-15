// A05 Welle 1a, W1-S3: Sortierung inbound → stock (dist/sorting.js, inventory.relocateQty).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation, validateState} from '../dist/core.js';
import {BUILDINGS} from '../dist/catalog.js';
import {summary, HAND_RATE} from '../dist/sorting.js';

const SITE = 'site-1';
const ok = (sim, c) => { const r = sim.command(c); assert.equal(r.ok, true, `${c.type}: ${r.message}`); return r; };
function hub({sorter = true, workers = 1, seed = 7} = {}) {
  const sim = new Simulation({mode:'sandbox', seed});
  ok(sim, {type:'build', buildingType:'dock', x:2, y:10, site:SITE});
  if (sorter) ok(sim, {type:'build', buildingType:'sorter', x:8, y:2, site:SITE});
  for (let i = 0; i < workers; i++) ok(sim, {type:'hire', role:'warehouse', site:SITE});
  return sim;
}
function order(sim, qty, due) {
  const s = sim.state, id = sim.api.id('order');
  s.orders.push({id, kind:'logistics', source:'hub', contractId:'contract-x', lane:'lane-1', customer:'Nordbezirk (Versand Test)', item:'parcel', qty, price:1.2, due, quality:0, site:SITE, status:'active', delivered:0, paid:0});
  return id;
}
const parcels = (sim, owner, qty) => assert.ok(sim.api.inventory.add({item:'parcel', qty, site:SITE, location:'inbound', owner}), 'Paket-Anlage');
const count = (s, owner, loc) => s.batches.filter(b => b.item === 'parcel' && (!owner || b.owner === owner) && (!loc || b.location === loc)).reduce((n, b) => n + b.qty, 0);
const sorterOf = sim => sim.state.buildings.find(b => b.type === 'sorter');
const hash = sim => createHash('sha256').update(sim.serialize()).digest('hex');

test('Mengen bleiben über 1000 Minuten exakt erhalten (Nachschub, Schicht, Pause, Laden)', () => {
  let sim = hub({workers:2});
  const ids = [order(sim, 400, 2000), order(sim, 300, 1500), order(sim, 250, 2600)];
  const injected = new Map(ids.map(id => [id, 0]));
  for (let m = 0; m < 1000; m++) {
    if (m % 50 === 0) for (const [i, id] of ids.entries()) { const q = 7 + i * 3; parcels(sim, id, q); injected.set(id, injected.get(id) + q); }
    sim.step(1);
    for (const id of ids) assert.equal(count(sim.state, id, 'inbound') + count(sim.state, id, 'stock'), injected.get(id), `Minute ${m}, ${id}`);
    for (const b of sim.state.batches) assert.ok(b.qty >= 0 && Number.isInteger(b.qty), 'ganze, nichtnegative Paketmengen');
    if (m % 250 === 249) { validateState(sim.state); sim = Simulation.fromJSON(sim.serialize()); }
  }
  const total = [...injected.values()].reduce((a, b) => a + b, 0);
  assert.ok(count(sim.state, null, 'inbound') > 0, 'nach Schichtende liegt Ware im Eingang');
  sim.step(700); // nächste Tagschicht
  assert.equal(count(sim.state, null, 'stock'), total, 'alles sortiert');
  assert.equal(count(sim.state, null, 'inbound'), 0);
  assert.equal(sim.state.sorting.sites[SITE].total, total);
});

test('Bruchteile: 100 Pakete/h → 1,2,2 je Minute, in 60 Minuten exakt 100', () => {
  const old = BUILDINGS.sorter.throughput;
  try {
    BUILDINGS.sorter.throughput = 100;
    const sim = hub(), id = order(sim, 500, 900);
    parcels(sim, id, 500);
    const seen = [];
    for (let m = 0; m < 3; m++) { const before = count(sim.state, id, 'stock'); sim.step(1); seen.push(count(sim.state, id, 'stock') - before); }
    assert.deepEqual(seen, [1, 2, 2]);
    sim.step(57);
    assert.equal(count(sim.state, id, 'stock'), 100);
    assert.equal(sorterOf(sim).sortAcc, 0);
    assert.equal(count(sim.state, id, 'inbound'), 400);
  } finally { BUILDINGS.sorter.throughput = old; }
});

test('Ungenutzte Kapazität verfällt: kein Mengengewinn nach Leerlauf', () => {
  const sim = hub(), id = order(sim, 50, 900);
  sim.step(30);
  assert.equal(sorterOf(sim).status, 'idle');
  assert.equal(sim.state.workers[0].task, null, 'Lagerkraft frei bei Leerlauf');
  parcels(sim, id, 50);
  sim.step(1);
  assert.equal(count(sim.state, id, 'stock'), 4, 'nur Nennrate, kein angesparter Vorrat');
});

test('Schichtende und Pause unterbrechen ohne Verlust; danach Fortsetzung', () => {
  const sim = hub(), id = order(sim, 200, 2000), s = sim.state;
  parcels(sim, id, 200);
  s.t = 955; sim.step(4); // Minuten 956–959 in Schicht
  assert.equal(count(s, id, 'stock'), 16);
  assert.equal(sorterOf(sim).status, 'working');
  sim.step(10); // ab 960 Feierabend
  assert.equal(count(s, id, 'stock'), 16);
  assert.equal(sorterOf(sim).status, 'staff');
  assert.equal(s.workers[0].task, null);
  assert.equal(count(s, id, 'inbound') + count(s, id, 'stock'), 200);
  s.t = 1440 + 479; sim.step(2); // nächster Morgen 8:00
  assert.equal(sorterOf(sim).status, 'working');
  const before = count(s, id, 'stock');
  s.workers[0].fatigue = 80; sim.step(1);
  assert.equal(sorterOf(sim).status, 'staff', 'Pause');
  assert.equal(count(s, id, 'stock'), before);
  sim.step(30);
  assert.equal(sorterOf(sim).status, 'working');
  assert.ok(count(s, id, 'stock') > before);
  assert.equal(count(s, id, 'inbound') + count(s, id, 'stock'), 200);
});

test('Strom fehlt: Status power, keine Bewegung, keine Handsortierung, Lagerkraft frei', () => {
  const sim = hub(), id = order(sim, 40, 900), s = sim.state;
  parcels(sim, id, 40);
  s.sites[0].energy = 3; // Dock 1 + Sortierplatz 3 > 3
  sim.step(5);
  assert.equal(sorterOf(sim).status, 'power');
  assert.equal(count(s, id, 'stock'), 0);
  assert.equal(s.workers[0].task, null);
  assert.equal(summary(s, SITE).hand, 'off');
  s.sites[0].energy = 30; sim.step(1);
  assert.equal(sorterOf(sim).status, 'working');
  assert.equal(count(s, id, 'stock'), 4);
});

test('Lager voll: Sortierung inbound→stock ändert Belegung nicht und läuft weiter; neue Anlieferung abgewiesen', () => {
  const sim = hub(), id = order(sim, 100, 900), s = sim.state, inv = sim.api.inventory;
  parcels(sim, id, 100); // 5 Volumen
  assert.ok(inv.add({item:'housing', qty:inv.free(SITE), site:SITE}));
  assert.equal(inv.free(SITE), 0);
  const used = inv.used(SITE);
  assert.equal(inv.add({item:'parcel', qty:1, site:SITE, location:'inbound', owner:id}), false, 'kein Platz für weitere Pakete');
  sim.step(5);
  assert.equal(count(s, id, 'stock'), 20);
  assert.equal(inv.used(SITE), used);
  // Ortswechsel von außerhalb des Lagers in den Bestand braucht Platz.
  const v = inv.add({item:'parcel', qty:2, site:SITE, location:'vehicle', owner:id});
  assert.equal(inv.relocateQty(v.id, 1, 'stock'), false);
  assert.equal(v.qty, 2);
});

test('Paketvolumen 0,05 zählt in used', () => {
  const sim = hub(), id = order(sim, 100, 900), inv = sim.api.inventory;
  const before = inv.used(SITE);
  parcels(sim, id, 100);
  assert.ok(Math.abs(inv.used(SITE) - before - 5) < 1e-9);
});

test('Handsortierung ohne Sortierplatz: 2/min durch freie Lagerkraft; ausgeschalteter Sortierplatz zählt nicht', () => {
  const sim = hub({sorter:false}), id = order(sim, 30, 900), s = sim.state;
  parcels(sim, id, 30);
  const busy = sim.api.workforce.acquire('warehouse', SITE, 'fremd');
  sim.step(3);
  assert.equal(count(s, id, 'stock'), 0);
  assert.equal(summary(s, SITE).hand, 'staff');
  sim.api.workforce.release('fremd');
  assert.ok(busy);
  sim.step(5);
  assert.equal(count(s, id, 'stock'), 5 * HAND_RATE);
  assert.equal(summary(s, SITE).hand, 'working');
  assert.equal(s.workers[0].task, `${SITE}:handsort`);
  sim.step(20);
  assert.equal(count(s, id, 'stock'), 30);
  assert.equal(s.workers[0].task, null, 'nach Abschluss frei');
  // Ausgeschalteter Sortierplatz → Handsortierung
  const sim2 = hub(), id2 = order(sim2, 10, 900);
  parcels(sim2, id2, 10);
  ok(sim2, {type:'toggleBuilding', id:sorterOf(sim2).id});
  sim2.step(1);
  assert.equal(sorterOf(sim2).status, 'paused');
  assert.equal(count(sim2.state, id2, 'stock'), HAND_RATE);
});

test('Priorität: früheste Fälligkeit zuerst, gleiche Fälligkeit FIFO', () => {
  const sim = hub(), s = sim.state;
  const late = order(sim, 12, 1400), early = order(sim, 12, 700), early2 = order(sim, 4, 700);
  parcels(sim, late, 12); parcels(sim, early, 12); parcels(sim, early2, 4);
  sim.step(3);
  assert.equal(count(s, early, 'stock'), 12);
  assert.equal(count(s, early2, 'stock'), 0, 'gleiche Frist: frühere Anlage zuerst');
  assert.equal(count(s, late, 'stock'), 0);
  sim.step(1);
  assert.equal(count(s, early2, 'stock'), 4);
  assert.equal(count(s, late, 'stock'), 0);
  sim.step(1);
  assert.equal(count(s, late, 'stock'), 4);
});

test('Eigentum: inbound nicht reservierbar, stock nur für eigenen Auftrag; nie für Produktion/Verkauf/Transfer', () => {
  const sim = hub({workers:2}), s = sim.state, inv = sim.api.inventory;
  const a = order(sim, 20, 900), b = order(sim, 20, 900);
  parcels(sim, a, 20);
  const v = ok(sim, {type:'buyVehicle', vehicleType:'van', site:SITE}).id;
  assert.equal(sim.command({type:'dispatch', orderId:a, vehicleId:v, qty:5, site:SITE}).ok, false, 'inbound nicht versandfähig');
  assert.equal(s.reservations.length, 0);
  sim.step(2); // 8 sortiert
  assert.equal(inv.available('parcel', SITE, a), 8);
  assert.equal(inv.available('parcel', SITE, b), 0);
  assert.equal(inv.available('parcel', SITE), 0, 'nicht als eigene Ware');
  assert.equal(inv.reserve('parcel', 1, SITE, 'eigen'), false);
  assert.equal(sim.command({type:'dispatch', orderId:b, vehicleId:v, qty:5, site:SITE}).ok, false, 'fremder Auftrag');
  assert.equal(sim.command({type:'transfer', item:'parcel', qty:1, site:SITE, toSite:SITE}).ok, false);
  ok(sim, {type:'dispatch', orderId:a, vehicleId:v, qty:6, site:SITE});
  assert.equal(s.reservations.reduce((n, r) => n + r.qty, 0), 6);
  for (const r of s.reservations) { const x = s.batches.find(y => y.id === r.batchId); assert.equal(x.location, 'stock'); assert.equal(x.owner, a); }
  // Reservierte Teilmenge bleibt reserviert, Sortierung füllt dieselbe Kindcharge weiter auf.
  sim.step(1);
  validateState(s);
  assert.equal(count(s, a, 'inbound') + count(s, a, 'stock') + count(s, a, 'vehicle'), 20);
});

test('Teilmengen: ein Kind je Quellcharge, Herkunft erhalten, letzte Restmenge ohne Nullrest', () => {
  const sim = hub(), id = order(sim, 10, 900), s = sim.state;
  parcels(sim, id, 10);
  const src = s.batches.find(b => b.item === 'parcel');
  sim.step(3);
  const kids = s.batches.filter(b => b.parents.includes(src.id));
  assert.equal(kids.length, 1);
  assert.equal(kids[0].qty, 10);
  assert.equal(kids[0].owner, id);
  assert.equal(src.qty, 0);
  assert.equal(src.sortedTo, kids[0].id);
  // Ganze Charge ohne Kind: nur Ortswechsel, gleiche ID.
  const one = sim.api.inventory.add({item:'parcel', qty:3, site:SITE, location:'inbound', owner:id});
  assert.equal(sim.api.inventory.relocateQty(one.id, 3, 'stock'), one);
  assert.equal(one.location, 'stock');
});

test('fromJSON mitten in der Sortierung setzt bitgleich fort', () => {
  const old = BUILDINGS.sorter.throughput;
  try {
    BUILDINGS.sorter.throughput = 100;
    const sim = hub({workers:2}), s = sim.state;
    const a = order(sim, 90, 1200), b = order(sim, 70, 800);
    parcels(sim, a, 90); parcels(sim, b, 70);
    sim.step(7);
    assert.ok(sorterOf(sim).sortAcc > 0, 'Bruchteil offen');
    assert.equal(s.workers.filter(w => w.task).length, 1);
    const copy = Simulation.fromJSON(sim.serialize());
    sim.step(120); copy.step(120);
    assert.equal(copy.serialize(), sim.serialize());
    assert.equal(count(copy.state, a, 'stock') + count(copy.state, b, 'stock'), 160);
  } finally { BUILDINGS.sorter.throughput = old; }
});

test('Determinismus: gleicher Ablauf, gleicher Zustand', () => {
  const run = () => { const sim = hub({workers:2, seed:99}); const ids = [order(sim, 60, 900), order(sim, 60, 700)]; for (let m = 0; m < 200; m++) { if (m % 40 === 0) for (const id of ids) parcels(sim, id, 11); sim.step(1); } return hash(sim); };
  assert.equal(run(), run());
});

test('Validierung lehnt beschädigte Sortierdaten ab', () => {
  const sim = hub(), id = order(sim, 5, 900);
  parcels(sim, id, 5); sim.step(1);
  const bad = JSON.parse(sim.serialize());
  bad.sorting.sites[SITE].hand = 'x';
  assert.throws(() => Simulation.fromJSON(JSON.stringify(bad)), /Sortierdaten/);
  const bad2 = JSON.parse(sim.serialize());
  bad2.buildings.find(b => b.type === 'sorter').sortAcc = -1;
  assert.throws(() => Simulation.fromJSON(JSON.stringify(bad2)), /Sortierdaten/);
});
