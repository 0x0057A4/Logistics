// A04 0.15 S3: Mehrwertdienste/Lohnfertigung (economy.js kind 'vas', production.js Kundeneigentum, Zustellung/Zahlung).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation, validateState} from '../dist/core.js';
import {ITEMS} from '../dist/catalog.js';
import {vasBom, VAS_OFFER_AT} from '../dist/economy.js';

const SITE = 'site-1';
const ok = (sim, c) => { const r = sim.command(c); assert.equal(r.ok, true, `${c.type}: ${r.message}`); return r; };
const hash = sim => createHash('sha256').update(sim.serialize()).digest('hex');
const LINE = [['rack', 2, 2], ['assembly', 5, 2], ['testing', 9, 2], ['packing', 13, 2], ['dock', 2, 11], ['rack', 2, 4], ['rack', 6, 11], ['rack', 9, 11]];
const qtyOf = (s, item, owner, loc = 'stock') => s.batches.filter(b => b.item === item && b.owner === owner && (!loc || b.location === loc)).reduce((n, b) => n + b.qty, 0);

function factory({ownMaterial = 0} = {}) {
  const sim = new Simulation({mode:'sandbox', seed:21});
  for (const [buildingType, x, y] of LINE) ok(sim, {type:'build', buildingType, site:SITE, x, y, rotation:0});
  for (const role of ['production', 'production', 'production', 'warehouse', 'warehouse', 'driver']) { const id = ok(sim, {type:'hire', role, site:SITE}).id; ok(sim, {type:'setShift', id, shift:'all'}); }
  ok(sim, {type:'buyVehicle', vehicleType:'van', site:SITE});
  if (ownMaterial) for (const item of ['housing', 'board', 'carton']) ok(sim, {type:'buy', item, qty:ownMaterial, supplier:'standard', site:SITE});
  return sim;
}
// Bis zum ersten Mehrwertdienst-Angebot (frühestens Tag 2, 14:00).
function untilOffer(sim) {
  for (let i = 0; i < 3000; i++) { const o = sim.state.orders.find(o => o.kind === 'vas' && o.status === 'offer'); if (o) return o; sim.step(1); }
  assert.fail('kein Mehrwertdienst-Angebot');
}
// Invariante je Minute: Lohnfertigungsjobs verbrauchen nur Material ihres Auftrags, eigene Jobs nur eigenes.
function checkJobs(s) {
  for (const j of s.jobs) if (j.status !== 'maintenance' && Array.isArray(j.inputs)) {
    const owner = j.owner || 'company';
    for (const x of j.inputs) assert.equal(x.owner, owner, `Job ${j.id}: Eingang ${x.item} von ${x.owner} statt ${owner}`);
  }
}

test('Angebot nur mit Fertigungsanlage, frühestens Tag 2 um 14:00; Material aus Rezeptkette', () => {
  const hub = new Simulation({mode:'sandbox', seed:5});
  ok(hub, {type:'build', buildingType:'dock', site:SITE, x:2, y:11, rotation:0});
  hub.step(2400);
  assert.ok(!hub.state.orders.some(o => o.kind === 'vas'), 'reiner Hub: keine Lohnfertigung');
  const sim = factory(), o = untilOffer(sim);
  assert.equal(sim.state.t, 1440 + VAS_OFFER_AT);
  assert.equal(o.service, 'Lohnfertigung');
  assert.deepEqual(vasBom('lamp'), {housing:1, board:1, carton:1});
  assert.equal(o.item, 'lamp', 'ohne Forschung nur die Grundleuchte');
  assert.deepEqual(o.materials, {housing:o.qty, board:o.qty, carton:o.qty});
  assert.ok(o.price > 0 && o.price < ITEMS.lamp.price, 'Stückvergütung statt Warenpreis');
  sim.step(1440);
  assert.equal(sim.state.orders.filter(x => x.kind === 'vas' && x.status === 'offer').length, 1, 'höchstens ein offenes Angebot');
  validateState(sim.state);
});

// Ende-zu-Ende: Annahme → Kundenmaterial kostenlos (owner=Auftrag) → Einlagerung → Fertigung unter Kundeneigentum →
// Zustellung → Zahlung je Stück. Gleichzeitig eigene Fertigung mit eigenem Material. reload: Laden bei jedem Phasenwechsel.
function e2e({reload}) {
  let sim = factory({ownMaterial:6});
  const offer = untilOffer(sim), id = offer.id, qty = offer.qty;
  const money0 = sim.state.money;
  ok(sim, {type:'acceptOrder', id});
  const s0 = sim.state;
  const vasBuys = s0.purchases.filter(p => p.orderId === id);
  assert.equal(vasBuys.length, 3);
  assert.ok(vasBuys.every(p => p.cost === 0 && p.owner === id));
  assert.equal(s0.money, money0, 'Kundenmaterial kostet nichts');
  const phases = new Set();
  let last = '', reloads = 0, shipments = 0;
  for (let i = 0; i < 3000; i++) {
    const s = sim.state, o = s.orders.find(x => x.id === id);
    const sh = s.shipments.filter(x => x.orderId === id);
    const sig = [vasBuys.map(p => s.purchases.find(x => x.id === p.id).status).join(','), s.jobs.filter(j => j.owner === id).map(j => j.status).join(','), sh.map(x => x.status + (x.paid ? 'P' : '')).join(','), o.status].join('|');
    if (sig !== last) { phases.add(sig); last = sig; if (reload) { const x = Simulation.fromJSON(sim.serialize()); assert.equal(x.serialize(), sim.serialize()); sim = x; reloads++; } }
    checkJobs(sim.state);
    if (o.status === 'fulfilled' && sh.every(x => x.paid)) break;
    // Versand, sobald genug Fertigware des Auftrags bereitliegt.
    const ready = qtyOf(sim.state, o.item, id), open = o.qty - o.delivered - sh.filter(x => x.deliveredAt == null && x.status !== 'cancelled').reduce((n, x) => n + x.qty, 0);
    const v = sim.state.vehicles.find(v => v.status === 'idle');
    if (v && open > 0 && ready >= Math.min(open, 10)) { ok(sim, {type:'dispatch', orderId:id, vehicleId:v.id, qty:Math.min(ready, open, v.capacity), site:SITE}); shipments++; }
    sim.step(1);
  }
  return {sim, id, qty, phases:phases.size, reloads, shipments};
}

test('Ende-zu-Ende Lohnfertigung: Kundenmaterial, Fertigung unter Kundeneigentum, Zustellung, Zahlung je Stück', () => {
  const {sim, id, qty, phases, shipments} = e2e({reload:false}), s = sim.state, o = s.orders.find(x => x.id === id);
  assert.equal(o.status, 'fulfilled');
  assert.equal(o.delivered, qty);
  const pays = s.ledger.filter(l => l.key.startsWith('payment:') && l.refs.includes(id));
  assert.equal(pays.length, shipments);
  assert.equal(Math.round(pays.reduce((n, l) => n + l.amount, 0) * 100), Math.round(o.paid * 100));
  assert.ok(o.paid > 0 && o.paid <= qty * o.price + 1e-9, 'Vergütung je Stück (ggf. Verspätungsabschlag)');
  // Kundenmaterial vollständig verbraucht, nichts Auftragseigenes mehr am Lager, nie als eigene Ware gezählt.
  for (const item of ['housing', 'board', 'carton', 'lamp_raw', 'lamp_tested', 'lamp']) assert.equal(qtyOf(s, item, id, null), 0, `${item} des Kunden übrig`);
  // Eigene Fertigung unverändert: 6 Sätze eigenes Material → 6 eigene Leuchten (Kundenmaterial nie eingeflossen).
  assert.equal(qtyOf(s, 'lamp', 'company'), 6);
  for (const item of ['housing', 'board', 'carton']) assert.equal(qtyOf(s, item, 'company'), 0);
  // Lieferkosten ohne Materialwert (Kundeneigentum).
  assert.ok(s.shipments.filter(x => x.orderId === id).every(x => x.materialCost === 0));
  assert.ok(phases >= 8, `zu wenige Phasen (${phases})`);
  validateState(s);
});

test('Laden in jeder Phase setzt bitgleich fort', () => {
  const a = e2e({reload:false}), b = e2e({reload:true});
  assert.ok(b.reloads >= 8, `nur ${b.reloads} Ladevorgänge`);
  assert.equal(hash(a.sim), hash(b.sim));
});

test('Fremdmaterial nie für eigene Produktion: ohne Lohnauftrag-Bedarf wartet die Anlage auf eigenes Material', () => {
  const sim = factory(), s = sim.state, o = untilOffer(sim);
  ok(sim, {type:'acceptOrder', id:o.id});
  // Kundenmaterial nur teilweise passend: Kartons fehlen (Testaufbau: Kartonlieferung gestrichen).
  s.purchases = s.purchases.filter(p => !(p.orderId === o.id && p.item === 'carton'));
  for (let i = 0; i < 400; i++) { sim.step(1); checkJobs(s); }
  const pack = s.buildings.find(b => b.type === 'packing');
  assert.equal(pack.status, 'materials', 'Verpackung wartet: Kundenkarton fehlt, eigene Ware nicht vorhanden');
  assert.equal(qtyOf(s, 'lamp', o.id), 0);
  assert.ok(qtyOf(s, 'lamp_tested', o.id) > 0, 'Vorstufen unter Kundeneigentum');
  // Eigene Kartons kommen: trotzdem keine Mischung (eigener Karton + Kundenleuchte); Kundenware bleibt Kundenware.
  ok(sim, {type:'buy', item:'carton', qty:5, supplier:'express', site:SITE});
  for (let i = 0; i < 200; i++) { sim.step(1); checkJobs(s); }
  assert.equal(qtyOf(s, 'lamp', o.id), 0);
  assert.equal(qtyOf(s, 'lamp', 'company'), 0, 'eigene Fertigung nutzt keine Kundenvorstufen');
  assert.equal(qtyOf(s, 'carton', 'company'), 5);
  // Eigene Aufträge/Rezeptwahl können Kundenware nicht reservieren.
  assert.equal(sim.api.inventory.available('lamp_tested', SITE), 0);
  validateState(s);
});

test('Validierung: beschädigter Lohnauftrag bzw. Job-Eigentum wird abgelehnt; Retoure von Kundenware gesperrt', () => {
  const sim = factory(), o = untilOffer(sim);
  ok(sim, {type:'acceptOrder', id:o.id});
  for (let i = 0; i < 120 && !sim.state.jobs.some(j => j.owner === o.id); i++) sim.step(1);
  assert.ok(sim.state.jobs.some(j => j.owner === o.id), 'Lohnfertigung läuft');
  const bad = mut => { const x = JSON.parse(sim.serialize()); mut(x); assert.throws(() => Simulation.fromJSON(JSON.stringify(x)), /Spielstand/); };
  bad(x => { x.orders.find(y => y.id === o.id).materials = {}; });
  bad(x => { x.orders.find(y => y.id === o.id).materials = {lamp:3}; });
  bad(x => { x.jobs.find(j => j.owner).owner = 'company-x'; });
  const r = sim.command({type:'createReturn', orderId:o.id, qty:1});
  assert.equal(r.ok, false);
});
