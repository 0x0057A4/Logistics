import { BUILDINGS, ITEMS } from './catalog.js';

// Einzige Schreibstelle für physische Waren und deren Reservierungen.
const LOCATIONS = new Set(['stock', 'inbound', 'machine', 'vehicle', 'quarantine']);
const STORED = new Set(['stock', 'inbound', 'quarantine']);
const positive = n => Number.isFinite(n) && n > 0;
const clean = n => Math.abs(n) < 1e-9 ? 0 : n;
export function init(s) { s.batches ??= []; s.reservations ??= []; s.recalls ??= []; }
export function handle(s,c,api) {
  if(c.type!=='recallBatch')return null;
  const origin=s.batches.find(b=>b.id===c.batchId);
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
  const capacity = site => 40 + s.buildings.filter(b => b.site === site)
    .reduce((sum, b) => sum + (BUILDINGS[b.type]?.capacity || 0), 0);
  const used = site => s.batches.filter(b => b.site === site && STORED.has(b.location))
    .reduce((sum, b) => sum + b.qty, 0);
  const free = site => Math.max(0, capacity(site) - used(site));
  const eligible = (b,item,site,owner) => b.item === item && b.site === site && b.owner === owner && b.location === 'stock' && !b.locked && !b.blocked;
  const available = (item,site,owner='company') => s.batches.filter(b => eligible(b,item,site,owner)).reduce((n,b) => n + b.qty-b.reserved,0);
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
    const recalled=s.batches.find(b=>batch.parents.includes(b.id)&&b.blocked);
    if(recalled){batch.blocked=true;batch.recallId=recalled.recallId;const recall=s.recalls?.find(r=>r.id===batch.recallId);if(recall&&!recall.batches.includes(batch.id))recall.batches.push(batch.id);}
    s.batches.push(batch);
    return batch;
  }
  function reserve(item,qty,site,job,owner='company') {
    if (!positive(qty) || !job || available(item,site,owner) + 1e-9 < qty) return false;
    // FIFO: Reihenfolge bleibt auch nach Speichern/Laden stabil.
    let remaining = qty;
    for (const b of s.batches) {
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
      const b = s.batches.find(b => b.id === r.batchId);
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
      const b=s.batches.find(b=>b.id===id);
      if (!b || b.blocked || b.locked || b.qty+1e-9<qty || b.reserved+1e-9<qty) return false;
      parts.push({...b,qty,parents:[...b.parents],reserved:0});
    }
    return parts;
  }
  function consume(job) {
    const parts=selection(job);
    if (!parts) return false;
    for (const p of parts) {
      const b=s.batches.find(b=>b.id===p.id);
      b.qty=clean(b.qty-p.qty);
      b.reserved=clean(b.reserved-p.qty);
    }
    s.reservations=s.reservations.filter(r=>r.job!==job);
    return parts;
  }
  function move(batchId,location,site) {
    const b=s.batches.find(b=>b.id===batchId);
    if (!b || b.reserved || !LOCATIONS.has(location)) return false;
    site ??= b.site;
    if (!siteExists(site)) return false;
    const alreadyStored = b.site===site && STORED.has(b.location);
    if (STORED.has(location) && !alreadyStored && free(site)+1e-9<b.qty) return false;
    b.site=site; b.location=location;
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
    const b=s.batches.find(b=>b.id===batchId);
    if (!b || !positive(qty) || b.qty-b.reserved+1e-9<qty) return false;
    const part={...b,qty,reserved:0,parents:[...b.parents]};
    b.qty=clean(b.qty-qty);
    return part;
  }
  function relocate(batchIds,location,site) {
    if(!Array.isArray(batchIds)||!batchIds.length||new Set(batchIds).size!==batchIds.length||!LOCATIONS.has(location)||!siteExists(site))return false;
    const batches=batchIds.map(id=>s.batches.find(b=>b.id===id));
    if(batches.some(b=>!b||b.reserved))return false;
    const extra=STORED.has(location)?batches.reduce((n,b)=>n+(b.site===site&&STORED.has(b.location)?0:b.qty),0):0;
    if(free(site)+1e-9<extra)return false;
    for(const b of batches){b.site=site;b.location=location;}return true;
  }
  function restore(batchId,quality=90) {
    const b=s.batches.find(b=>b.id===batchId);
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
