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

export const ITEM = 'parcel';
export const HAND_RATE = 2;
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
      const w = api.workforce.acquire('warehouse', b.site, key);
      if (!w) { b.status = 'staff'; continue; }
      const acc = (b.sortAcc || 0) + spec.throughput, n = Math.floor(acc / 60);
      b.sortAcc = acc - n * 60;
      const moved = n > 0 ? take(n) : 0;
      b.status = blocked && !moved ? 'storage' : 'working';
      w.activity = 'Sortierung';
    }
    if (active || !cand.length || ci >= cand.length) { api.workforce.release(handKey(id)); st.hand = active ? 'off' : 'idle'; continue; }
    const w = api.workforce.acquire('warehouse', id, handKey(id));
    if (!w) { st.hand = 'staff'; continue; }
    const moved = take(HAND_RATE);
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
