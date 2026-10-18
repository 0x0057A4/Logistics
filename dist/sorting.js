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
import {BUILDINGS, ITEMS} from './catalog.js';
import {gridEnergy} from './disruptions.js'; // 0.16 S1: Netzstörung → nur Energiegebäude
import {siteItemBatches} from './inventory.js';
import {onShift, workRate, freeCount} from './workforce.js';
import {forkliftAvailable, forkliftKey, COLD, forkItem} from './yard.js';
import {coolingCapacity, coolingFree} from './special.js';
import {staffNeed as containerNeed} from './containers.js';

export const ITEM = 'parcel';
// 3 Pakete/min Grundleistung vor workRate (A01 W1c, vorher 2): eine Lagerkraft sortiert eine Startanlieferung
// (100–130 Pakete) in 35–45 statt 50–65 Minuten; der Sortierplatz (4/min) bleibt schneller und damit ein Ausbau.
export const HAND_RATE = 3;
const HAND_STATES = new Set(['idle', 'working', 'staff', 'storage', 'off']);
export const handKey = site => `${site}:handsort`;
export const sorterKey = b => `${b.id}:sort`;
// Quergurtsorter (A04, 0.15 S3): zweite Lagerkraft-Bindung `${b.id}:sort2`; Fehlwurf jedes MISSORT_EVERY-te Paket (1 %).
export const CROSSBELT = 'crossbelt';
export const MISSORT_EVERY = 100;
export const sorterKey2 = b => `${b.id}:sort2`;
const SORT_TYPES = new Set(['sorter', CROSSBELT]);
const keysOf = b => b.type === CROSSBELT ? [sorterKey(b), sorterKey2(b)] : [sorterKey(b)];
const releaseAll = (api, b) => { for (const k of keysOf(b)) api.workforce.release(k); };

export function handle() { return null; }

const sortable = (b, site) => b.site === site && b.location === 'inbound' && !b.blocked && !b.locked && b.qty - b.reserved > 1e-9;
/** Sortierbare Inbound-Pakete eines Standorts in Arrayreihenfolge. 0.15 S2: Kühlpakete (COLD) danach, aber nur mit
 *  einsatzbereitem Kühllager am Standort (special.coolingCapacity > 0); Sperrgut kommt nie hierher (Staplerumschlag nach stock).
 *  Ohne Kühlpakete bleibt die Liste bitgleich zu 0.14 (die Prioritätssortierung ist stabil). */
function inbound(s, site) {
  const out = [];
  for (const b of siteItemBatches(s, site, ITEM)) if (!b.resort && sortable(b, site)) out.push(b);
  const cold = siteItemBatches(s, site, COLD);
  if (cold.length) { let any = false; for (const b of cold) if (!b.resort && sortable(b, site)) { if (!any && !(coolingCapacity(s, site) > 0)) break; any = true; out.push(b); } }
  return out;
}
/** Fehlwürfe des Quergurts (b.resort) warten inbound auf Nachsortierung von Hand; Arrayreihenfolge (FIFO). Kühlpakete nur mit Kühllager. */
function resortList(s, site) {
  const out = [];
  for (const b of siteItemBatches(s, site, ITEM)) if (b.resort && sortable(b, site)) out.push(b);
  if (coolingCapacity(s, site) > 0) for (const b of siteItemBatches(s, site, COLD)) if (b.resort && sortable(b, site)) out.push(b);
  return out;
}

// Entladen und Torkontrolle haben Vorrang (A01/A06): Fremd-Lkw in gate ohne Torkraft bzw. docking/unloading ohne gebundene Lagerkraft (yard-Schlüssel
// `${arrival.id}:warehouse`). So viele freie Lagerkräfte bleiben fürs Entladen reserviert; reicht das nicht, geben
// Sortierbindungen ihre Person ab (zuerst Handsortierung, dann Sortierplätze von hinten). yard.step läuft vor
// sorting.step und bindet die freigegebene Person in der nächsten Minute.
function unloadNeed(s, site, out) {
  if (!s.yard?.length) return 0;
  let n = 0;
  for (const a of s.yard) {
    if (a.site !== site) continue;
    // Torkontrolle (A06 W1b, yard-Schlüssel `${arrival.id}:gate`) hat denselben Vorrang wie das Entladen.
    if (a.phase === 'gate') { if (!s.workers.some(w => w.task === `${a.id}:gate`)) { n++; if (out) out.gate++; } continue; }
    if ((a.phase !== 'docking' && a.phase !== 'unloading') || a.unloaded >= a.parcels) continue;
    // Paletten (W2-S2) gehen nicht durchs Sortieren; ohne einsatzbereiten Stapler braucht die Entladung keine Lagerkraft.
    if (forkItem(a.item) && !forkliftAvailable(s, site, forkliftKey(a.id))) continue;
    // Kühlpakete ohne freien Kühlplatz warten ohne Lagerkraft (yard.js) → kein Vorrang.
    if (a.item === COLD && coolingFree(s, site) < 1) continue;
    const key = `${a.id}:warehouse`;
    if (!s.workers.some(w => w.task === key) && s.buildings.some(b => b.id === a.dock && b.enabled && b.condition > 0)) { n++; if (out && forkItem(a.item)) out.fork++; }
  }
  return n;
}
// Beladen eigener Fahrzeuge hat denselben Vorrang (A01 W1c, Befund B1): Lieferung (transport.js, status loading),
// Sammeltour (tours.js, loading bzw. returnUnloading) und Standorttransfer (loading am Start, unloading am Ziel), die
// Rampe und Fahrpersonal schon gebunden haben, aber keine Lagerkraft `${id}:warehouse`. transport/tours laufen vor
// sorting.step und binden die freigegebene Person in der nächsten Minute. So wartet kein Fahrzeug dauerhaft aufs Sortieren.
let loadPriority = true; // nur für Gegenprobe-Tests abschaltbar
export function setLoadPriority(on) { loadPriority = !!on; }
function loadNeed(s, site, out) {
  if (!loadPriority) return 0;
  let n = 0;
  const waits = (id, at) => !s.workers.some(w => w.task === `${id}:warehouse`) && s.workers.some(w => w.task === `${id}:driver`)
    && s.buildings.some(b => b.task === id && b.type === 'dock' && b.site === at && b.enabled && b.condition > 0);
  // Palettenbeladung (W2-S2) ohne einsatzbereiten Stapler bindet keine Lagerkraft → kein Vorrang.
  const noFork = (id, pallet) => pallet && !forkliftAvailable(s, site, forkliftKey(id));
  for (const sh of s.shipments || []) if (sh.status === 'loading' && sh.site === site && waits(sh.id, site) && !noFork(sh.id, palletOrder(s, sh.orderId))) { n++; if (out && palletOrder(s, sh.orderId)) out.fork++; }
  for (const t of s.tours || []) if ((t.status === 'loading' || t.status === 'returnUnloading') && t.site === site && waits(t.id, site) && !(t.status === 'loading' && noFork(t.id, t.stops.some(x => forkItem(x.item))))) { n++; if (out && t.status === 'loading' && t.stops.some(x => forkItem(x.item))) out.fork++; }
  for (const tr of s.transfers || []) {
    const at = tr.status === 'loading' ? tr.site : tr.status === 'unloading' ? tr.toSite : null;
    if (at === site && waits(tr.id, site)) n++;
  }
  // Linienfahrt (W3-S2): Beladen am Start vor Ladeende, Entladen am Ziel; Fahrpersonal ist dem Startstandort gebunden.
  for (const lh of s.linehauls || []) {
    const at = lh.status === 'loading' && !lh.loadDone ? lh.from : lh.status === 'unloading' && lh.remaining > 0 ? lh.to : null;
    if (at === site && waits(lh.id, site) && !noFork(lh.id, lh.pallet)) { n++; if (out && lh.pallet) out.fork++; }
  }
  return n;
}
const palletOrder = (s, id) => forkItem(s.orders.find(o => o.id === id)?.item); // Palette oder Sperrgut (Staplerumschlag)
// Gleiche Bedingungen wie workforce.acquire (ohne task).
const ready = (s, w, site) => w.role === 'warehouse' && w.site === site && !w.training && !w.relocation && !(w.breakRemaining > 0) && onShift(w, s.t) && w.fatigue < 80;
const freeWarehouse = (s, site) => { let n = 0; for (const w of s.workers) if (!w.task && ready(s, w, site)) n++; return n; };

function stats(s, site) {
  const day = Math.floor(s.t / 1440);
  s.sorting ??= {day, sites:{}};
  if (s.sorting.day !== day) { s.sorting.day = day; for (const x of Object.values(s.sorting.sites)) { x.today = 0; if (x.rejectsToday !== undefined) x.rejectsToday = 0; } }
  return s.sorting.sites[site] ??= {hand:'idle', today:0, total:0};
}

export function step(s, api) {
  let sorters = null;
  for (const b of s.buildings) if (SORT_TYPES.has(b.type)) { sorters ??= new Map(); let l = sorters.get(b.site); if (!l) sorters.set(b.site, l = []); l.push(b); }
  // Strom wie production.js: Grundlast aller eingeschalteten Nebenanlagen (ohne Sortierplätze), dann Sortierplätze
  // in Gebäudereihenfolge. production.js zählt Sortierplätze als Grundlast vor den Maschinen.
  let power = null;
  if (sorters) {
    power = new Map();
    const supply = new Map(), demand = new Map();
    for (const b of s.buildings) { if (!b.enabled || SORT_TYPES.has(b.type)) continue; const d = BUILDINGS[b.type]; if (b.type === 'power') supply.set(b.site, (supply.get(b.site) ?? 0) + (d.energy || 0)); if (!d?.recipes.length) demand.set(b.site, (demand.get(b.site) ?? 0) + (d?.power || 0)); }
    for (const site of s.sites) power.set(site.id, gridEnergy(s, site.id) + (supply.get(site.id) ?? 0) - (demand.get(site.id) ?? 0));
  }
  let orders = null;
  for (const site of s.sites) {
    const id = site.id, list = sorters?.get(id), cand = inbound(s, id), rs = resortList(s, id);
    if (!list && !cand.length && !rs.length) { if (s.sorting?.sites[id]) { api.workforce.release(handKey(id)); s.sorting.sites[id].hand = 'idle'; } continue; }
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
    // 0.16 S2: Stapler- bzw. Torbedarf, den freie Staplerfahrer/Torposten decken (acquireAny bindet sie zuerst),
    // zieht keine Sortierkraft ab. Spezialisten selbst sortieren nie (ready: nur Lagerkraft). Ohne Spezialisten
    // ist cover 0 und der Ablauf bitgleich.
    const out = {fork:0, gate:0};
    let need = unloadNeed(s, id, out) + loadNeed(s, id, out) + containerNeed(s, id, out);
    const yielded = new Set();
    if (out.fork) need -= Math.min(out.fork, freeCount(s, 'forklift', id));
    if (out.gate) need -= Math.min(out.gate, freeCount(s, 'gate', id));
    let spare = Infinity;
    if (need) {
      spare = freeWarehouse(s, id) - need;
      const holders = [handKey(id), ...(list || []).flatMap(keysOf).reverse()];
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
      if (!b.enabled) { b.status = 'paused'; releaseAll(api, b); continue; }
      active = true;
      if (b.condition <= 5) { b.status = 'broken'; releaseAll(api, b); continue; }
      const p = power.get(id);
      if (p < spec.power) { b.status = 'power'; releaseAll(api, b); continue; }
      power.set(id, p - spec.power);
      if (b.type === CROSSBELT) {
        const q = {list:cand, i:ci, blocked};
        crossbelt(s, api, b, q, st, grab);
        ci = q.i; blocked = q.blocked;
        continue;
      }
      if (ci >= cand.length || blocked) { b.status = blocked ? 'storage' : 'idle'; api.workforce.release(key); continue; }
      const w = grab(b.site, key);
      if (!w) { b.status = 'staff'; continue; }
      const acc = (b.sortAcc || 0) + spec.throughput, n = Math.floor(acc / 60);
      b.sortAcc = acc - n * 60;
      const moved = n > 0 ? take(n) : 0;
      b.status = blocked && !moved ? 'storage' : 'working';
      w.activity = 'Sortierung';
    }
    const main = !(active || !cand.length || ci >= cand.length);
    // Nachsortierung von Quergurt-Fehlwürfen (A04, 0.15 S3) läuft von Hand, auch wenn Sortieranlagen arbeiten.
    // Ohne Fehlwürfe (rs leer) ist der Ablauf unverändert.
    if (!main && !rs.length) { api.workforce.release(handKey(id)); st.hand = active ? 'off' : 'idle'; continue; }
    const w = grab(id, handKey(id));
    if (!w) { st.hand = 'staff'; continue; }
    const rate = workRate(w, HAND_RATE); // Standardkraft = HAND_RATE, Erfahrung bis ×1,5 (A06 W1b)
    let moved = 0;
    if (rs.length) {
      const q = {list:rs, i:0, blocked:false};
      moved = takeQueue(api, q, rate, st);
      if (q.blocked) blocked = true;
    }
    if (main && rate - moved > 1e-9 && !blocked) moved += take(rate - moved);
    st.hand = blocked && !moved ? 'storage' : 'working';
    w.activity = rs.length ? 'Nachsortierung' : 'Handsortierung';
  }
}

// ---- Quergurtsorter (A04, 0.15 S3) ----------------------------------------------------------------------------
// Durchsatz BUILDINGS.crossbelt.throughput (2.400/h) mit spec.staff (2) gebundenen Lagerkräften; eine Kraft = halbe
// Leistung. Akkumulator b.sortAcc in Sechzigsteln wie beim Sortierplatz (2400·k/2 ganzzahlig → exakt).
// Fehlwurf deterministisch über Zähler b.sortCount (0 ≤ x < MISSORT_EVERY): jedes 100. Paket wird nicht nach stock
// gebucht, sondern als eigene Charge (parents:[Quelle], resort:true, owner bleibt) inbound abgespalten und von Hand
// nachsortiert (Handsortierung, Vorrang wie bisher hinter Entladen/Beladen). Sperrgut (ITEMS.noSorter) nie.
// Statistik s.sorting.sites[site].rejects/rejectsToday; sortiert (today/total) zählt erst die tatsächlich nach stock
// gebuchten Pakete (Fehlwürfe nach der Nachsortierung), damit jedes Paket genau einmal zählt.
// Erschöpft: ganz verschoben (relocateQty wechselt bei ganzer Charge nur location) oder ohne freie Menge.
const spent = x => x.location !== 'inbound' || x.qty - x.reserved <= 1e-9;
const beltable = x => !ITEMS[x.item]?.noSorter && !spent(x);
function crossbelt(s, api, b, q, st, grab) {
  const spec = BUILDINGS[b.type];
  let work = false;
  if (!q.blocked) for (let j = q.i; j < q.list.length; j++) if (beltable(q.list[j])) { work = true; break; }
  if (!work) { b.status = q.blocked ? 'storage' : 'idle'; b.crew = 0; releaseAll(api, b); return; }
  let crew = 0, first = null;
  for (const key of keysOf(b)) { const w = grab(b.site, key); if (w) { crew++; first ??= w; w.activity = 'Sortierung'; } }
  b.crew = crew;
  if (!crew) { b.status = 'staff'; return; }
  const acc = (b.sortAcc || 0) + spec.throughput * crew / (spec.staff || 1), n = Math.floor(acc / 60);
  b.sortAcc = acc - n * 60;
  const moved = n > 0 ? crossbeltTake(s, api, b, q, n, st) : 0;
  b.status = q.blocked && !moved ? 'storage' : 'working';
}
function crossbeltTake(s, api, b, q, limit, st) {
  let left = limit, done = 0;
  for (let j = q.i; j < q.list.length && left > 1e-9; j++) {
    const x = q.list[j];
    if (!beltable(x)) { if (j === q.i && spent(x)) q.i++; continue; }
    const n = Math.min(x.qty - x.reserved, left), c0 = b.sortCount || 0, c1 = c0 + n;
    const miss = Math.min(Math.floor(n), Math.floor(c1 / MISSORT_EVERY) - Math.floor(c0 / MISSORT_EVERY));
    if (miss > 0) {
      // Abspaltung über inventory (remove + add am selben Ort): Lagerbedarf unverändert, add kann daher nicht scheitern.
      const part = api.inventory.remove(x.id, miss);
      if (!part) { q.blocked = true; break; }
      const spec = {item:x.item, qty:miss, site:x.site, owner:x.owner, location:'inbound', quality:x.quality, unitCost:x.unitCost, parents:[x.id]};
      for (const k of ['temperature', 'exposure', 'peakTemperature', 'coldDamaged']) if (x[k] !== undefined) spec[k] = x[k];
      const r = api.inventory.add(spec);
      if (r) r.resort = true;
      st.rejects = (st.rejects || 0) + miss; st.rejectsToday = (st.rejectsToday || 0) + miss;
    }
    const good = n - miss;
    if (good > 1e-9 && !api.inventory.relocateQty(x.id, good, 'stock')) { q.blocked = true; b.sortCount = (c0 + miss) % MISSORT_EVERY; break; }
    b.sortCount = c1 % MISSORT_EVERY;
    left -= n; done += n;
    st.today += good; st.total += good;
    if (spent(x) && j === q.i) q.i++;
  }
  return done;
}
/** Handsortierung einer Warteschlange (Nachsortierung), atomar je Teilmenge wie take in step. */
function takeQueue(api, q, limit, st) {
  let moved = 0;
  while (q.i < q.list.length && limit - moved > 1e-9) {
    const b = q.list[q.i], n = Math.min(b.qty - b.reserved, limit - moved);
    if (spent(b)) { q.i++; continue; }
    if (!api.inventory.relocateQty(b.id, n, 'stock')) { q.blocked = true; break; }
    moved += n;
    if (spent(b)) q.i++;
  }
  st.today += moved; st.total += moved;
  return moved;
}

/** Lesesicht für Darstellung/HUD: Pakete inbound/stock, Nennrate je Minute, Handstatus, heute sortiert. */
export function summary(s, site) {
  let inb = 0, stock = 0, resort = 0, coldIn = 0, coldStock = 0;
  for (const b of siteItemBatches(s, site, ITEM)) if (b.site === site) { if (b.location === 'inbound') { inb += b.qty; if (b.resort) resort += b.qty; } else if (b.location === 'stock') stock += b.qty; }
  for (const b of siteItemBatches(s, site, COLD)) if (b.site === site) { if (b.location === 'inbound') { coldIn += b.qty; if (b.resort) resort += b.qty; } else if (b.location === 'stock') coldStock += b.qty; }
  const sorters = s.buildings.filter(b => SORT_TYPES.has(b.type) && b.site === site && b.enabled);
  const x = s.sorting?.sites?.[site];
  // Quergurt: Nennrate nach gebundener Besetzung (crew/staff); Sortierplatz wie bisher.
  const rate = b => b.type === CROSSBELT ? BUILDINGS[b.type].throughput / 60 * ((b.crew ?? BUILDINGS[b.type].staff) / BUILDINGS[b.type].staff) : BUILDINGS.sorter.throughput / 60;
  return {inbound:inb, stock, rate:sorters.length ? sorters.reduce((n, b) => n + rate(b), 0) : HAND_RATE,
    sorters:sorters.map(b => ({id:b.id, type:b.type, status:b.status, ...(b.type === CROSSBELT ? {crew:b.crew || 0} : {})})),
    hand:sorters.length && !resort ? 'off' : (x?.hand || 'idle'), today:x?.today || 0, total:x?.total || 0,
    rejects:x?.rejects || 0, rejectsToday:x?.rejectsToday || 0, resort,
    cold:{inbound:coldIn, stock:coldStock, sortable:coolingCapacity(s, site) > 0}};
}

export function validate(s) {
  const fail = m => { throw new Error('Sortierdaten beschädigt: ' + m); };
  const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  for (const b of s.buildings) if (SORT_TYPES.has(b.type) && b.sortAcc !== undefined && !finite(b.sortAcc, 0, 60)) fail('Akkumulator');
  for (const b of s.buildings) if (b.type === CROSSBELT && ((b.sortCount !== undefined && !finite(b.sortCount, 0, MISSORT_EVERY - 1e-9)) || (b.crew !== undefined && ![0, 1, 2].includes(b.crew)))) fail('Quergurt');
  for (const b of s.batches) if (b.resort !== undefined && b.resort !== true) fail('Nachsortierung');
  if (s.sorting === undefined) return;
  const x = s.sorting;
  if (!x || typeof x !== 'object' || Array.isArray(x) || !Number.isSafeInteger(x.day) || x.day < 0 || !x.sites || typeof x.sites !== 'object' || Array.isArray(x.sites)) fail('Struktur');
  const sites = new Set(s.sites.map(a => a.id));
  for (const [id, v] of Object.entries(x.sites)) if (!sites.has(id) || !v || !HAND_STATES.has(v.hand) || !finite(v.today, 0, Infinity) || !finite(v.total, v.today - 1e-6, Infinity)
    || (v.rejects !== undefined && !finite(v.rejects, 0, Infinity)) || (v.rejectsToday !== undefined && !finite(v.rejectsToday, 0, v.rejects ?? 0))) fail('Standortwerte');
}
