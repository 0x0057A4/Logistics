import { BUILDINGS, ITEMS } from './catalog.js';

// Einzige Schreibstelle für physische Waren und deren Reservierungen.
const LOCATIONS = new Set(['stock', 'inbound', 'machine', 'vehicle', 'quarantine']);
const STORED = new Set(['stock', 'inbound', 'quarantine']);
const positive = n => Number.isFinite(n) && n > 0;
const clean = n => Math.abs(n) < 1e-9 ? 0 : n;
const EMPTY = Object.freeze([]);

// Laufzeitlokale Indexe (Welle 0, S4). WeakMap am Zustand: nie serialisiert, nie aufzählbar, nach fromJSON neu.
// Sie ersetzen nur lineare Suchen; Reihenfolge (FIFO) und Summationsreihenfolge bleiben die des Arrays.
// pos: Chargen-ID -> Arrayposition. Vollständiger Neuaufbau, wenn s.batches ersetzt, gekürzt oder umsortiert
//      wurde (Referenz, Länge, letztes Element); angehängte Chargen werden nachgetragen. Treffer werden an der
//      Arrayposition gegengeprüft.
// aktiv: Chargen mit Menge oder Reservierung (qty!==0||reserved!==0) in Arrayreihenfolge, gesamt, je Standort
//      und je Standort+Artikel. Nullchargen tragen zu allen Summen exakt 0 bei und werden übersprungen; sie
//      bleiben als Herkunft für Rückrufe im Array. Menge und Reservierung schreibt ausschließlich diese Datei
//      (Prüfung in tests/perf-index.test.js); eine Nullcharge wird nie wieder befüllt, neue Ware entsteht als
//      neue Charge. Deshalb genügt je Spielminute (s.t) eine Auffrischung aus der bisherigen Aktivliste plus
//      angehängten Chargen: O(aktive Chargen) statt O(alle Chargen). Sie ordnet auch nach direkten
//      Standortänderungen neu; Standortwechsel über move/relocate frischen sofort auf. Felder wie location,
//      owner, blocked, locked werden bei jeder Abfrage live geprüft.
const indexes = new WeakMap();
const isActive = b => b.qty !== 0 || b.reserved !== 0;
function addActive(x, b) {
  x.active.push(b);
  let site = x.bySite.get(b.site); if (!site) x.bySite.set(b.site, site = {all:[], items:new Map()});
  site.all.push(b);
  let list = site.items.get(b.item); if (!list) site.items.set(b.item, list = []);
  list.push(b);
}
// Gruppen aus Kandidaten (Arrayreihenfolge) neu bilden; danach angehängte Zeilen ab `from`.
function regroup(x, candidates, rows, from) {
  x.active = []; x.bySite = new Map(); x.dirty = false;
  for (let i = 0; i < candidates.length; i++) { const b = candidates[i]; if (isActive(b)) addActive(x, b); }
  for (let i = from; i < rows.length; i++) { const b = rows[i]; if (isActive(b)) addActive(x, b); }
  x.groupsLen = rows.length;
}
export function batchIndex(s) {
  const rows = s.batches;
  let x = indexes.get(s);
  if (!x || x.rows !== rows || rows.length < x.len || (x.len && rows[x.len-1] !== x.last)) {
    x = {rows, t:s.t, len:rows.length, pos:new Map(), buildings:null, buildingsLen:-1, buildingsT:null, capacity:new Map()};
    for (let i = 0; i < rows.length; i++) if (!x.pos.has(rows[i].id)) x.pos.set(rows[i].id, i);
    regroup(x, EMPTY, rows, 0); indexes.set(s, x);
  } else {
    for (let i = x.len; i < rows.length; i++) if (!x.pos.has(rows[i].id)) x.pos.set(rows[i].id, i);
    x.len = rows.length;
    if (x.dirty || x.t !== s.t) { x.t = s.t; regroup(x, x.active, rows, x.groupsLen); }
    else if (x.groupsLen < rows.length) { for (let i = x.groupsLen; i < rows.length; i++) if (isActive(rows[i])) addActive(x, rows[i]); x.groupsLen = rows.length; }
  }
  x.last = rows[rows.length-1];
  return x;
}
/** Charge per ID wie s.batches.find(b=>b.id===id), aber über den Laufzeitindex. */
export function findBatch(s, id) {
  let x = batchIndex(s), i = x.pos.get(id), b = i === undefined ? undefined : s.batches[i];
  if (i !== undefined && (!b || b.id !== id)) { indexes.delete(s); x = batchIndex(s); i = x.pos.get(id); b = i === undefined ? undefined : s.batches[i]; }
  return b;
}
/** Chargen mit Menge/Reservierung in Arrayreihenfolge (Obermenge aller qty>0). Nur lesen. */
export function activeBatches(s) { return batchIndex(s).active; }
export function init(s) { s.batches ??= []; s.reservations ??= []; s.recalls ??= []; }
export function handle(s,c,api) {
  if(c.type!=='recallBatch')return null;
  const origin=findBatch(s,c.batchId);
  if(!origin)return {ok:false,message:'Charge nicht gefunden.'};
  s.recalls??=[];
  if(s.recalls.some(r=>r.batchId===origin.id))return {ok:false,message:'Rückruf dieser Charge bereits aktiv.'};
  const affected=new Set([origin.id]);let changed=true;
  while(changed){changed=false;for(const b of s.batches)if(!affected.has(b.id)&&b.parents.some(id=>affected.has(id))){affected.add(b.id);changed=true;}}
  const id=api.id('recall');
  for(const b of s.batches)if(affected.has(b.id)){b.blocked=true;b.recallId=id;}
  const deliverySources=[...s.shipments,...(s.tours||[]).flatMap(t=>t.stops.map((p,i)=>({...p,id:`${t.id}:stop:${i}`}))),...(s.freights||[])];
  const deliveries=deliverySources.filter(sh=>sh.deliveredAt!=null&&sh.cargo.some(id=>affected.has(id))).map(sh=>({shipmentId:sh.id,orderId:sh.orderId,qty:sh.qty,deliveredAt:sh.deliveredAt}));
  s.recalls.push({id,batchId:origin.id,createdAt:s.t,batches:[...affected],deliveries});
  api.log('recall',`Chargenrückruf: ${affected.size} betroffene Chargen, ${deliveries.length} Zustellungen.`,[id,origin.id]);
  return {ok:true,id};
}
export function step() {}

export function createAPI(s, api) {
  const siteExists = id => s.sites.some(x => x.id === id);
  // Kapazität je Standort bis zur nächsten Spielminute oder Änderung der Gebäudeliste zwischengespeichert.
  const capacity = site => {
    const x = batchIndex(s);
    if (x.buildings !== s.buildings || x.buildingsLen !== s.buildings.length || x.buildingsT !== s.t) { x.buildings = s.buildings; x.buildingsLen = s.buildings.length; x.buildingsT = s.t; x.capacity.clear(); }
    let n = x.capacity.get(site);
    if (n === undefined) { n = 40 + s.buildings.filter(b => b.site === site).reduce((sum, b) => sum + (BUILDINGS[b.type]?.capacity || 0), 0); x.capacity.set(site, n); }
    return n;
  };
  const used = site => { let sum = 0; for (const b of batchIndex(s).bySite.get(site)?.all || EMPTY) if (b.site === site && STORED.has(b.location)) sum += b.qty; return sum; };
  const free = site => Math.max(0, capacity(site) - used(site));
  const eligible = (b,item,site,owner) => b.item === item && b.site === site && b.owner === owner && b.location === 'stock' && !b.locked && !b.blocked;
  const group = (item,site) => batchIndex(s).bySite.get(site)?.items.get(item) || EMPTY;
  const available = (item,site,owner='company') => { let n = 0; for (const b of group(item,site)) if (eligible(b,item,site,owner)) n = n + b.qty-b.reserved; return n; };
  const byId = id => findBatch(s, id);
  // Standortwechsel verschiebt Chargen zwischen Gruppen: beim nächsten Zugriff auffrischen.
  const resite = (b,site) => { if (b.site !== site) { b.site = site; batchIndex(s).dirty = true; } };
  function add(spec) {
    const {item,qty,site} = spec;
    const location = spec.location || 'stock';
    if (!item || !positive(qty) || !siteExists(site) || !LOCATIONS.has(location)) return false;
    if (STORED.has(location) && free(site) + 1e-9 < qty) return false;
    if (spec.quality != null && (!Number.isFinite(spec.quality) || spec.quality < 0 || spec.quality > 100)) return false;
    if (spec.unitCost != null && (!Number.isFinite(spec.unitCost) || spec.unitCost < 0)) return false;
    const batch = {id:api.id('batch'), item, qty, site, owner:spec.owner || 'company', location,
      quality:spec.quality ?? 100, unitCost:spec.unitCost ?? 0, parents:[...(spec.parents || [])], reserved:0,
      created:s.t};
    if(ITEMS[item]?.cold){batch.temperature=Number.isFinite(spec.temperature)?spec.temperature:4;batch.exposure=Number.isFinite(spec.exposure)?spec.exposure:0;batch.peakTemperature=Number.isFinite(spec.peakTemperature)?spec.peakTemperature:batch.temperature;batch.coldDamaged=!!spec.coldDamaged;if(batch.coldDamaged)batch.blocked=true;}
    if (spec.locked) batch.locked = true;
    // Erste gesperrte Elternteilcharge in Arrayreihenfolge (wie s.batches.find), über Positionsindex.
    let recalled, first=Infinity; const pos=batchIndex(s).pos;
    for(const id of batch.parents){const i=pos.get(id);if(i!==undefined&&i<first&&s.batches[i]?.id===id&&s.batches[i].blocked){first=i;recalled=s.batches[i];}}
    if(recalled){batch.blocked=true;batch.recallId=recalled.recallId;const recall=s.recalls?.find(r=>r.id===batch.recallId);if(recall&&!recall.batches.includes(batch.id))recall.batches.push(batch.id);}
    s.batches.push(batch);
    return batch;
  }
  function reserve(item,qty,site,job,owner='company') {
    if (!positive(qty) || !job || available(item,site,owner) + 1e-9 < qty) return false;
    // FIFO: Reihenfolge bleibt auch nach Speichern/Laden stabil.
    let remaining = qty;
    for (const b of group(item,site)) {
      if (!eligible(b,item,site,owner)) continue;
      const n = Math.min(remaining,b.qty-b.reserved);
      if (n <= 0) continue;
      s.reservations.push({id:api.id('reservation'),batchId:b.id,qty:n,job});
      b.reserved += n;
      remaining = clean(remaining-n);
      if (!remaining) break;
    }
    return true;
  }
  function release(job) {
    let qty=0;
    for (const r of s.reservations.filter(r => r.job === job)) {
      const b = byId(r.batchId);
      if (b) b.reserved = clean(b.reserved-r.qty);
      qty += r.qty;
    }
    s.reservations = s.reservations.filter(r => r.job !== job);
    return qty;
  }
  function selection(job) {
    const rs = s.reservations.filter(r => r.job === job);
    if (!rs.length) return false;
    const grouped = new Map();
    for (const r of rs) grouped.set(r.batchId,(grouped.get(r.batchId)||0)+r.qty);
    const parts=[];
    for (const [id,qty] of grouped) {
      const b=byId(id);
      if (!b || b.blocked || b.locked || b.qty+1e-9<qty || b.reserved+1e-9<qty) return false;
      parts.push({...b,qty,parents:[...b.parents],reserved:0});
    }
    return parts;
  }
  function consume(job) {
    const parts=selection(job);
    if (!parts) return false;
    for (const p of parts) {
      const b=byId(p.id);
      b.qty=clean(b.qty-p.qty);
      b.reserved=clean(b.reserved-p.qty);
    }
    s.reservations=s.reservations.filter(r=>r.job!==job);
    return parts;
  }
  function move(batchId,location,site) {
    const b=byId(batchId);
    if (!b || b.reserved || !LOCATIONS.has(location)) return false;
    site ??= b.site;
    if (!siteExists(site)) return false;
    const alreadyStored = b.site===site && STORED.has(b.location);
    if (STORED.has(location) && !alreadyStored && free(site)+1e-9<b.qty) return false;
    resite(b,site); b.location=location;
    return true;
  }
  function transfer(job,location,site) {
    const parts=selection(job);
    if (!parts || !LOCATIONS.has(location)) return false;
    const deltas=new Map();
    for (const p of parts) {
      const target=site ?? p.site;
      if (!siteExists(target)) return false;
      if (STORED.has(p.location)) deltas.set(p.site,(deltas.get(p.site)||0)-p.qty);
      if (STORED.has(location)) deltas.set(target,(deltas.get(target)||0)+p.qty);
    }
    for (const [target,delta] of deltas) if (used(target)+delta>capacity(target)+1e-9) return false;
    consume(job);
    return parts.map(p=>add({...p,site:site??p.site,location,parents:[p.id]}));
  }
  function remove(batchId,qty) {
    const b=byId(batchId);
    if (!b || !positive(qty) || b.qty-b.reserved+1e-9<qty) return false;
    const part={...b,qty,reserved:0,parents:[...b.parents]};
    b.qty=clean(b.qty-qty);
    return part;
  }
  function relocate(batchIds,location,site) {
    if(!Array.isArray(batchIds)||!batchIds.length||new Set(batchIds).size!==batchIds.length||!LOCATIONS.has(location)||!siteExists(site))return false;
    const batches=batchIds.map(byId);
    if(batches.some(b=>!b||b.reserved))return false;
    const extra=STORED.has(location)?batches.reduce((n,b)=>n+(b.site===site&&STORED.has(b.location)?0:b.qty),0):0;
    if(free(site)+1e-9<extra)return false;
    for(const b of batches){resite(b,site);b.location=location;}return true;
  }
  function restore(batchId,quality=90) {
    const b=byId(batchId);
    if(!b || b.coldDamaged || b.location!=='quarantine' || b.reserved || !Number.isFinite(quality) || quality<0 || quality>100) return false;
    b.quality=quality;b.locked=false;b.location='stock';return true;
  }
  return {add,available,reserve,release,consume,move,used,capacity,free,transfer,remove,restore,relocate};
}

export function validate(s) {
  const ids=new Set();
  for(const b of s.batches) {
    if(ids.has(b.id)||!Number.isFinite(b.qty)||b.qty<0||!Number.isFinite(b.reserved)||b.reserved<0||b.reserved>b.qty+1e-9||!LOCATIONS.has(b.location)) throw new Error('Ungültige Lagercharge.');
    ids.add(b.id);
    const reserved=s.reservations.filter(r=>r.batchId===b.id).reduce((n,r)=>n+r.qty,0);
    if(Math.abs(reserved-b.reserved)>1e-7) throw new Error('Reservierungssumme stimmt nicht.');
  }
  for(const r of s.reservations) if(!ids.has(r.batchId)||!positive(r.qty)||!r.job) throw new Error('Ungültige Materialreservierung.');
  return true;
}
