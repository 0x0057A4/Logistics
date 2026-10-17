// Entladung → Sortierung (A05, W1-S3, docs/SCHNITTSTELLEN-0.9-W1.md).
// Pakete (item 'parcel') in location 'inbound' wandern je Auftrag (owner bleibt) nach 'stock' und sind erst dann
// per dispatch/tour reservierbar (inventory eligible: nur stock, nur owner=Auftrag). Ware bucht nur inventory.js.
// Sortierplatz: throughput/60 Pakete je Minute, Akkumulator b.sortAcc in Sechzigsteln (ganzzahlig bei ganzzahligem
// Durchsatz, daher exakt); bewegt werden nur ganze Pakete bzw. Restmengen einer Charge. Nicht genutzte Kapazität
// verfällt (kein Vorrat), der Bruchteil (< 1 Paket) bleibt. Lagerkraft-Bindung `${b.id}:sort`.
// Ohne eingeschalteten Sortierplatz am Standort: Handsortierung HAND_RATE/min durch freie Lagerkraft `${site}:handsort`.
// Reihenfolge: früheste Fälligkeit des Auftrags (owner), dann Arrayreihenfolge (FIFO).
// Laufzeitzustand nur in Chargen, b.sortAcc, b.status und s.sorting (erst beim ersten Sortierbedarf angelegt,
// damit Spielstände ohne Hub-Betrieb bitgleich bleiben).
import {BUILDINGS} from './catalog.js';
import {siteItemBatches} from './inventory.js';
import {onShift, workRate} from './workforce.js';
import {forkliftAvailable, forkliftKey, PALLET} from './yard.js';
import {staffNeed as containerNeed} from './containers.js';

export const ITEM = 'parcel';
// 3 Pakete/min Grundleistung vor workRate (A01 W1c, vorher 2): eine Lagerkraft sortiert eine Startanlieferung
// (100–130 Pakete) in 35–45 statt 50–65 Minuten; der Sortierplatz (4/min) bleibt schneller und damit ein Ausbau.
export const HAND_RATE = 3;
const HAND_STATES = new Set(['idle', 'working', 'staff', 'storage', 'off']);
export const handKey = site => `${site}:handsort`;
export const sorterKey = b => `${b.id}:sort`;

export function handle() { return null; }

/** Sortierbare Inbound-Pakete eines Standorts in Arrayreihenfolge. */
function inbound(s, site) {
  const out = [];
  for (const b of siteItemBatches(s, site, ITEM)) if (b.site === site && b.location === 'inbound' && !b.blocked && !b.locked && b.qty - b.reserved > 1e-9) out.push(b);
  return out;
}

// Entladen und Torkontrolle haben Vorrang (A01/A06): Fremd-Lkw in gate ohne Torkraft bzw. docking/unloading ohne gebundene Lagerkraft (yard-Schlüssel
// `${arrival.id}:warehouse`). So viele freie Lagerkräfte bleiben fürs Entladen reserviert; reicht das nicht, geben
// Sortierbindungen ihre Person ab (zuerst Handsortierung, dann Sortierplätze von hinten). yard.step läuft vor
// sorting.step und bindet die freigegebene Person in der nächsten Minute.
function unloadNeed(s, site) {
  if (!s.yard?.length) return 0;
  let n = 0;
  for (const a of s.yard) {
    if (a.site !== site) continue;
    // Torkontrolle (A06 W1b, yard-Schlüssel `${arrival.id}:gate`) hat denselben Vorrang wie das Entladen.
    if (a.phase === 'gate') { if (!s.workers.some(w => w.task === `${a.id}:gate`)) n++; continue; }
    if ((a.phase !== 'docking' && a.phase !== 'unloading') || a.unloaded >= a.parcels) continue;
    // Paletten (W2-S2) gehen nicht durchs Sortieren; ohne einsatzbereiten Stapler braucht die Entladung keine Lagerkraft.
    if (a.item === PALLET && !forkliftAvailable(s, site, forkliftKey(a.id))) continue;
    const key = `${a.id}:warehouse`;
    if (!s.workers.some(w => w.task === key) && s.buildings.some(b => b.id === a.dock && b.enabled && b.condition > 0)) n++;
  }
  return n;
}
// Beladen eigener Fahrzeuge hat denselben Vorrang (A01 W1c, Befund B1): Lieferung (transport.js, status loading),
// Sammeltour (tours.js, loading bzw. returnUnloading) und Standorttransfer (loading am Start, unloading am Ziel), die
// Rampe und Fahrpersonal schon gebunden haben, aber keine Lagerkraft `${id}:warehouse`. transport/tours laufen vor
// sorting.step und binden die freigegebene Person in der nächsten Minute. So wartet kein Fahrzeug dauerhaft aufs Sortieren.
let loadPriority = true; // nur für Gegenprobe-Tests abschaltbar
export function setLoadPriority(on) { loadPriority = !!on; }
function loadNeed(s, site) {
  if (!loadPriority) return 0;
  let n = 0;
  const waits = (id, at) => !s.workers.some(w => w.task === `${id}:warehouse`) && s.workers.some(w => w.task === `${id}:driver`)
    && s.buildings.some(b => b.task === id && b.type === 'dock' && b.site === at && b.enabled && b.condition > 0);
  // Palettenbeladung (W2-S2) ohne einsatzbereiten Stapler bindet keine Lagerkraft → kein Vorrang.
  const noFork = (id, pallet) => pallet && !forkliftAvailable(s, site, forkliftKey(id));
  for (const sh of s.shipments || []) if (sh.status === 'loading' && sh.site === site && waits(sh.id, site) && !noFork(sh.id, palletOrder(s, sh.orderId))) n++;
  for (const t of s.tours || []) if ((t.status === 'loading' || t.status === 'returnUnloading') && t.site === site && waits(t.id, site) && !(t.status === 'loading' && noFork(t.id, t.stops.some(x => x.item === PALLET)))) n++;
  for (const tr of s.transfers || []) {
    const at = tr.status === 'loading' ? tr.site : tr.status === 'unloading' ? tr.toSite : null;
    if (at === site && waits(tr.id, site)) n++;
  }
  // Linienfahrt (W3-S2): Beladen am Start vor Ladeende, Entladen am Ziel; Fahrpersonal ist dem Startstandort gebunden.
  for (const lh of s.linehauls || []) {
    const at = lh.status === 'loading' && !lh.loadDone ? lh.from : lh.status === 'unloading' && lh.remaining > 0 ? lh.to : null;
    if (at === site && waits(lh.id, site) && !noFork(lh.id, lh.pallet)) n++;
  }
  return n;
}
const palletOrder = (s, id) => s.orders.find(o => o.id === id)?.item === PALLET;
// Gleiche Bedingungen wie workforce.acquire (ohne task).
const ready = (s, w, site) => w.role === 'warehouse' && w.site === site && !w.training && !w.relocation && !(w.breakRemaining > 0) && onShift(w, s.t) && w.fatigue < 80;
const freeWarehouse = (s, site) => { let n = 0; for (const w of s.workers) if (!w.task && ready(s, w, site)) n++; return n; };

function stats(s, site) {
  const day = Math.floor(s.t / 1440);
  s.sorting ??= {day, sites:{}};
  if (s.sorting.day !== day) { s.sorting.day = day; for (const x of Object.values(s.sorting.sites)) x.today = 0; }
  return s.sorting.sites[site] ??= {hand:'idle', today:0, total:0};
}

export function step(s, api) {
  let sorters = null;
  for (const b of s.buildings) if (b.type === 'sorter') { sorters ??= new Map(); let l = sorters.get(b.site); if (!l) sorters.set(b.site, l = []); l.push(b); }
  // Strom wie production.js: Grundlast aller eingeschalteten Nebenanlagen (ohne Sortierplätze), dann Sortierplätze
  // in Gebäudereihenfolge. production.js zählt Sortierplätze als Grundlast vor den Maschinen.
  let power = null;
  if (sorters) {
    power = new Map();
    const supply = new Map(), demand = new Map();
    for (const b of s.buildings) { if (!b.enabled || b.type === 'sorter') continue; const d = BUILDINGS[b.type]; if (b.type === 'power') supply.set(b.site, (supply.get(b.site) ?? 0) + (d.energy || 0)); if (!d?.recipes.length) demand.set(b.site, (demand.get(b.site) ?? 0) + (d?.power || 0)); }
    for (const site of s.sites) power.set(site.id, site.energy + (supply.get(site.id) ?? 0) - (demand.get(site.id) ?? 0));
  }
  let orders = null;
  for (const site of s.sites) {
    const id = site.id, list = sorters?.get(id), cand = inbound(s, id);
    if (!list && !cand.length) { if (s.sorting?.sites[id]) { api.workforce.release(handKey(id)); s.sorting.sites[id].hand = 'idle'; } continue; }
    if (cand.length > 1) {
      orders ??= new Map(s.orders.map(o => [o.id, o]));
      const due = b => orders.get(b.owner)?.due ?? Infinity;
      cand.sort((a, b) => { const x = due(a), y = due(b); return x < y ? -1 : x > y ? 1 : 0; });
    }
    const st = stats(s, id);
    let ci = 0, blocked = false;
    // Bewegt bis `limit` Pakete in Prioritätsreihenfolge, atomar je Teilmenge über inventory.relocateQty.
    const take = limit => {
      let moved = 0;
      while (ci < cand.length && limit - moved > 1e-9) {
        const b = cand[ci], q = Math.min(b.qty - b.reserved, limit - moved);
        if (q <= 1e-9) { ci++; continue; }
        if (!api.inventory.relocateQty(b.id, q, 'stock')) { blocked = true; break; }
        moved += q;
        if (b.qty - b.reserved <= 1e-9) ci++;
      }
      st.today += moved; st.total += moved;
      return moved;
    };
    // Personalvergabe mit Vorrang fürs Entladen und Beladen (s. unloadNeed, loadNeed).
    // Containerumschlag (W3b-S2) hat denselben Vorrang wie das Entladen von Hof-Lkw.
    const need = unloadNeed(s, id) + loadNeed(s, id) + containerNeed(s, id), yielded = new Set();
    let spare = Infinity;
    if (need) {
      spare = freeWarehouse(s, id) - need;
      const holders = [handKey(id), ...(list || []).map(sorterKey).reverse()];
      for (const key of holders) { if (spare >= 0) break; if (s.workers.some(w => w.task === key)) { api.workforce.release(key); yielded.add(key); spare++; } }
    }
    const grab = (site, key) => {
      if (yielded.has(key)) return null;
      const held = s.workers.find(w => w.task === key);
      if (held && ready(s, held, site)) return api.workforce.acquire('warehouse', site, key);
      if (held) api.workforce.release(key);
      if (spare <= 0) return null;
      const w = api.workforce.acquire('warehouse', site, key);
      if (w) spare--;
      return w;
    };
    let active = false;
    for (const b of list || []) {
      const key = sorterKey(b), spec = BUILDINGS[b.type];
      if (!b.enabled) { b.status = 'paused'; api.workforce.release(key); continue; }
      active = true;
      if (b.condition <= 5) { b.status = 'broken'; api.workforce.release(key); continue; }
      const p = power.get(id);
      if (p < spec.power) { b.status = 'power'; api.workforce.release(key); continue; }
      power.set(id, p - spec.power);
      if (ci >= cand.length || blocked) { b.status = blocked ? 'storage' : 'idle'; api.workforce.release(key); continue; }
      const w = grab(b.site, key);
      if (!w) { b.status = 'staff'; continue; }
      const acc = (b.sortAcc || 0) + spec.throughput, n = Math.floor(acc / 60);
      b.sortAcc = acc - n * 60;
      const moved = n > 0 ? take(n) : 0;
      b.status = blocked && !moved ? 'storage' : 'working';
      w.activity = 'Sortierung';
    }
    if (active || !cand.length || ci >= cand.length) { api.workforce.release(handKey(id)); st.hand = active ? 'off' : 'idle'; continue; }
    const w = grab(id, handKey(id));
    if (!w) { st.hand = 'staff'; continue; }
    const moved = take(workRate(w, HAND_RATE)); // Standardkraft = HAND_RATE, Erfahrung bis ×1,5 (A06 W1b)
    st.hand = blocked && !moved ? 'storage' : 'working';
    w.activity = 'Handsortierung';
  }
}

/** Lesesicht für Darstellung/HUD: Pakete inbound/stock, Nennrate je Minute, Handstatus, heute sortiert. */
export function summary(s, site) {
  let inb = 0, stock = 0;
  for (const b of siteItemBatches(s, site, ITEM)) if (b.site === site) { if (b.location === 'inbound') inb += b.qty; else if (b.location === 'stock') stock += b.qty; }
  const sorters = s.buildings.filter(b => b.type === 'sorter' && b.site === site && b.enabled);
  const x = s.sorting?.sites?.[site];
  return {inbound:inb, stock, rate:sorters.length ? sorters.reduce((n, b) => n + BUILDINGS.sorter.throughput / 60, 0) : HAND_RATE,
    sorters:sorters.map(b => ({id:b.id, status:b.status})), hand:sorters.length ? 'off' : (x?.hand || 'idle'), today:x?.today || 0, total:x?.total || 0};
}

export function validate(s) {
  const fail = m => { throw new Error('Sortierdaten beschädigt: ' + m); };
  const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  for (const b of s.buildings) if (b.type === 'sorter' && b.sortAcc !== undefined && !finite(b.sortAcc, 0, 60)) fail('Akkumulator');
  if (s.sorting === undefined) return;
  const x = s.sorting;
  if (!x || typeof x !== 'object' || Array.isArray(x) || !Number.isSafeInteger(x.day) || x.day < 0 || !x.sites || typeof x.sites !== 'object' || Array.isArray(x.sites)) fail('Struktur');
  const sites = new Set(s.sites.map(a => a.id));
  for (const [id, v] of Object.entries(x.sites)) if (!sites.has(id) || !v || !HAND_STATES.has(v.hand) || !finite(v.today, 0, Infinity) || !finite(v.total, v.today - 1e-6, Infinity)) fail('Standortwerte');
}
