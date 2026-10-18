// 0.17 S1 (A05): Gemeinsame, reine Bestandsrechnung für Lager, Ressourcen, Aufträge und Auftragsleiste.
// Kein DOM, keine Mutation des Zustands, keine Buchung. Alle Mengen aus s.batches/s.reservations/s.purchases/s.jobs.
// Begriffe (verbindlich in allen Ansichten):
//  gesamt      = physisch am Standort (Lagerplatz, Wareneingang ohne laufende Einkaufsannahme, Quarantäne).
//  reserviert  = an Vorgänge gebundene Menge (Lieferung, Tour, Fracht, Linie, Fertigung, Wartung …).
//  frei        = Lagerplatz, nicht reserviert, nicht gesperrt/blockiert/Quarantäne/Kühlschaden.
//  gesperrt    = nicht reservierte Menge in Quarantäne, gesperrt (Rückruf, Kühlschaden) oder blockiert.
//  Eingang     = nicht reservierte Menge im Wareneingang, die noch sortiert/eingelagert wird (z. B. Fremdpakete).
//  im Zulauf   = bestellte Ware (Einkauf noch nicht eingelagert), zählt erst nach Einlagerung zum Bestand.
//  in Fertigung= Ausgabe laufender Fertigungsjobs.
// Die Verfügbarkeitsanzeige ist keine Zusage: verbindlich ist nur eine vorhandene Reservierung (inventory.js).
import {ITEMS,RECIPES} from './catalog.js';
import {activeBatches} from './inventory.js';
import {displayName,siteDisplayName} from './ui-explain.js';

const STORED=new Set(['stock','inbound','quarantine']);
// Hinweis: Summen in eigenen Anzeigeobjekten über ['qty']/['reserved'], damit die Prüfung „nur inventory.js schreibt Chargenmengen“
// (tests/perf-index.test.js) eindeutig bleibt; Chargen selbst werden hier nie verändert.
const EPS=1e-9;
const round=n=>Math.abs(n)<EPS?0:Math.round(n*1e6)/1e6;
/** Charge nicht verwendbar (nicht frei), auch wenn sie auf einem Lagerplatz liegt. */
export const unusable=b=>!!(b.blocked||b.locked||b.coldDamaged||b.location==='quarantine');
/** Eigentümerklasse: eigene Ware oder Kundenware (Fremdeigentum je Auftrag). */
export const ownerClass=owner=>owner==='company'?'company':'customer';
/** Mengeneinheit eines Artikels (alle Artikel werden stückweise geführt). */
export function unitOf(item){return {parcel:'Pakete',parcel_cold:'Kühlpakete',pallet:'Paletten'}[item]||'Stück';}
/** Rezept, das einen Artikel herstellt (erstes Rezept, das ihn nicht selbst verbraucht – Nacharbeit ausgeschlossen). */
export function chainRecipe(item){for(const [id,r] of Object.entries(RECIPES))if(r.output?.item===item&&!(item in r.inputs))return {id,...r};return null;}
/** Eigentümer, aus dessen Bestand ein Auftrag beliefert wird (wie transport/tours/multimodal). */
export const orderOwner=o=>o.kind==='logistics'||o.kind==='vas'?o.id:'company';
const deliverySite=o=>o?.deliverySite??o?.site;
/** Qualitätsband (Varianten nicht vermischen). */
export function qualityBand(q){return q>=90?'Q ≥ 90 %':q>=75?'Q 75–89 %':'Q < 75 %';}

// ---- Laufzeitcache je Zustand und Datenstand (nicht je Frame) -------------------------------------------------
const caches=new WeakMap();
/** Stempel des Datenstands: Spielminute, ID-Zähler (jede Meldung/jeder neue Vorgang erhöht ihn), Listenlängen, Kontostand.
 *  Konstant billig (kein Durchlauf), damit Aufrufe je Auftrag den Cache nicht verteuern. */
export function stamp(s){return `${s.t}|${s.seq}|${s.batches.length}|${s.reservations.length}|${s.purchases.length}|${(s.jobs||[]).length}|${s.money}|${s.orders.length}`;}
function cache(s){const k=stamp(s);let c=caches.get(s);if(!c||c.stamp!==k){c={stamp:k,base:null,rows:new Map(),cover:new Map(),needs:new Map()};caches.set(s,c);}return c;}
/** Verwirft den Cache (z. B. nach Befehlen, die keinen Stempelteil ändern). */
export function invalidate(s){caches.delete(s);}

/** Vorgang einer Reservierung (job) → Auftrag bzw. Text. */
function jobIndex(s){
 const single=new Map(),multi=new Map(),text=new Map();
 for(const sh of s.shipments||[]){single.set(sh.id,sh.orderId);}
 for(const t of s.tours||[])for(const st of t.stops||[])if(st.reservationKey)single.set(st.reservationKey,st.orderId);
 for(const f of s.freights||[])single.set(f.id,f.orderId);
 for(const l of s.linehauls||[])if(Array.isArray(l.orders))multi.set(l.id,{kind:'Linienfahrt',orders:l.orders});
 for(const a of s.airShuttles||[])if(Array.isArray(a.orders))multi.set(a.id,{kind:'Luftzubringer',orders:a.orders});
 for(const j of s.jobs||[])text.set(j.id,(j.status==='maintenance'?'Wartung':'Fertigung')+(j.building?' · '+displayName(s,j.building):''));
 for(const tr of s.transfers||[])text.set(tr.id,'Standorttransfer');
 return {single,multi,text};
}
/** Lesbare Bezeichnung eines Reservierungsvorgangs. */
function jobLabel(idx,job){
 if(idx.single.has(job))return 'Auftrag '+idx.single.get(job);
 if(idx.multi.has(job)){const m=idx.multi.get(job);return m.kind+' · '+[...new Set(m.orders.map(x=>x.orderId))].join(', ');}
 if(idx.text.has(job))return idx.text.get(job);
 if(/^maintenance-/.test(job))return 'Wartung';
 if(/:spare$/.test(job))return 'Retourenreparatur';
 if(/^transfer-/.test(job))return 'Standorttransfer';
 return job;
}

/** Basisindex: eine Iteration über aktive Chargen, Reservierungen, Einkäufe, Jobs und Lieferungen. */
function base(s){
 const c=cache(s);if(c.base)return c.base;
 const idx=jobIndex(s),pendingBatch=new Set(),incoming=new Map(),incomingList=new Map(),production=new Map();
 const key=(site,item,owner)=>site+'|'+item+'|'+owner;
 for(const p of s.purchases){
  if(p.status==='stored')continue;
  if(p.batchId&&['receiving','checking','storing'].includes(p.status))pendingBatch.add(p.batchId);
  const k=key(p.site,p.item,p.owner||'company');incoming.set(k,(incoming.get(k)||0)+p.qty);
  (incomingList.get(k)||incomingList.set(k,[]).get(k)).push(p);
 }
 const sites=new Map(s.buildings.map(b=>[b.id,b.site]));
 for(const j of s.jobs||[]){if(j.status==='maintenance'||!j.output?.item)continue;const k=key(sites.get(j.building),j.output.item,j.owner||'company');production.set(k,(production.get(k)||0)+(j.output.qty||0));}
 // Reservierungen je Charge mit Vorgang und je Auftrag.
 const byBatch=new Map(),jobTotal=new Map(),byOrder=new Map();
 for(const r of s.reservations){(byBatch.get(r.batchId)||byBatch.set(r.batchId,[]).get(r.batchId)).push(r);jobTotal.set(r.job,(jobTotal.get(r.job)||0)+r.qty);}
 for(const [job,qty] of jobTotal){
  if(idx.single.has(job)){const o=idx.single.get(job);byOrder.set(o,(byOrder.get(o)||0)+qty);continue;}
  const m=idx.multi.get(job);if(!m)continue;let rest=qty;
  for(const x of m.orders){const n=Math.min(rest,x.qty||0);if(n>0){byOrder.set(x.orderId,(byOrder.get(x.orderId)||0)+n);rest-=n;}}
 }
 // Unterwegs je Auftrag (wie tours.committedQty: Lieferung, Tourstopp, Fracht, Luftzubringer) plus Linienfahrt in Fahrt.
 const committed=new Map(),add=(o,n)=>{if(o&&n>0)committed.set(o,(committed.get(o)||0)+n);},line=new Map();
 for(const sh of s.shipments||[])if(['loading','transit','unloading'].includes(sh.status))add(sh.orderId,sh.qty);
 for(const t of s.tours||[])if(!['complete','cancelled'].includes(t.status))for(const st of t.stops||[])if(st.status==='pending')add(st.orderId,st.qty);
 for(const f of s.freights||[])if(!['complete','cancelled'].includes(f.status)&&f.deliveredAt==null)add(f.orderId,f.qty);
 for(const a of s.airShuttles||[])if(a.status==='loading'||a.status==='transit'||(a.status==='handover'&&a.deliveredAt==null))for(const x of a.orders||[])add(x.orderId,x.qty);
 for(const l of s.linehauls||[])if(l.status==='transit'||l.status==='unloading')for(const x of l.orders||[])if(x.qty>0)line.set(x.orderId,(line.get(x.orderId)||0)+x.qty);
 // Bestandsgruppen je Standort|Artikel|Eigentümer.
 const groups=new Map();
 for(const b of activeBatches(s)){
  if(!(b.qty>EPS||b.reserved>EPS))continue;
  const k=key(b.site,b.item,b.owner);let g=groups.get(k);
  if(!g)groups.set(k,g={site:b.site,item:b.item,owner:b.owner,total:0,reserved:0,free:0,blocked:0,pending:0,vehicle:0,machine:0,batches:[]});
  if(b.location==='vehicle'){g.vehicle+=b.qty;continue;}
  if(b.location==='machine'){g.machine+=b.qty;continue;}
  if(!STORED.has(b.location)||pendingBatch.has(b.id))continue;
  const rest=Math.max(0,b.qty-b.reserved),state=unusable(b)?'blocked':b.location==='stock'?'free':'pending';
  g.total+=b.qty;g['reserved']+=b.reserved;g[state]+=rest;
  g.batches.push({id:b.id,qty:b.qty,reserved:b.reserved,free:state==='free'?rest:0,state,site:b.site,location:b.location,quality:b.quality,owner:b.owner,
   recall:b.recallId||null,coldDamaged:!!b.coldDamaged,blocked:!!b.blocked,locked:!!b.locked,created:b.created,
   jobs:(byBatch.get(b.id)||[]).map(r=>({job:r.job,qty:r.qty,label:jobLabel(idx,r.job)}))});
 }
 for(const g of groups.values())for(const f of ['total','reserved','free','blocked','pending','vehicle','machine'])g[f]=round(g[f]);
 return c.base={groups,incoming,incomingList,production,byOrder,committed,line,key,idx};
}

/** Frei verfügbare Menge (Lagerplatz, unreserviert, verwendbar) eines Artikels für einen Eigentümer an Standorten. */
export function freeQty(s,item,sites,owner='company',minQuality=0){
 const B=base(s);let n=0;
 for(const site of sites){const g=B.groups.get(B.key(site,item,owner));if(!g)continue;
  if(minQuality<=0)n+=g.free;else for(const b of g.batches)if(b.quality>=minQuality)n+=b.free;}
 return round(n);
}
/** Im Zulauf (bestellt, noch nicht eingelagert) für Eigentümer an Standorten. */
export function incomingQty(s,item,sites,owner='company'){const B=base(s);let n=0;for(const site of sites)n+=B.incoming.get(B.key(site,item,owner))||0;return n;}

/** Lagerzeilen: eine Zeile je Artikel und Eigentümerklasse (eigen / Kundenware). Qualität als Bänder in der Zeile.
 *  opts.site: Standort (Standard: alle Standorte). Rückgabe nach Artikelname sortiert. */
export function productRows(s,opts={}){
 const site=opts.site??null,c=cache(s),ck=site||'*';if(c.rows.has(ck))return c.rows.get(ck);
 const B=base(s),rows=new Map(),siteName=id=>siteDisplayName(s,id);
 const row=(item,owner)=>{const cls=ownerClass(owner),k=item+'|'+cls;let r=rows.get(k);
  if(!r){const recipe=chainRecipe(item);rows.set(k,r={key:k,item,name:ITEMS[item]?.name||item,unit:unitOf(item),variant:cls==='company'?'eigen':'Kundenware',ownerClass:cls,
   total:0,reserved:0,free:0,blocked:0,pending:0,inProduction:0,incoming:0,inTransit:0,locations:[],batches:[],owners:new Set(),bands:[],qualityMin:null,qualityMax:null,
   recipe:recipe?{id:recipe.id,name:recipe.name,inputs:Object.entries(recipe.inputs).map(([i,q])=>({item:i,perUnit:q/recipe.output.qty}))}:null,purchasable:!!ITEMS[item]?.purchasable,incomingOrders:[]});}
  r.owners.add(owner);return r;};
 for(const g of B.groups.values()){
  if(site&&g.site!==site)continue;
  const r=row(g.item,g.owner);
  for(const f of ['total','reserved','free','blocked','pending'])r[f]+=g[f];r.inTransit+=g.vehicle;
  const locs=new Map();for(const b of g.batches){const lk=b.site+'|'+b.location;locs.set(lk,(locs.get(lk)||0)+b.qty);r.batches.push(b);}
  for(const [lk,qty] of locs){const [st,loc]=lk.split('|');const ex=r.locations.find(l=>l.site===st&&l.location===loc);if(ex)ex['qty']+=qty;else r.locations.push({site:st,siteName:siteName(st),location:loc,qty});}
 }
 for(const [k,n] of B.incoming){const [st,item,owner]=k.split('|');if(site&&st!==site)continue;const r=row(item,owner);r.incoming+=n;r.incomingOrders.push(...B.incomingList.get(k));}
 for(const [k,n] of B.production){const [st,item,owner]=k.split('|');if(site&&st!==site)continue;row(item,owner).inProduction+=n;}
 const out=[...rows.values()].map(r=>{
  for(const f of ['total','reserved','free','blocked','pending','inTransit'])r[f]=round(r[f]);
  const bands=new Map();for(const b of r.batches){const q=b.quality;r.qualityMin=r.qualityMin==null?q:Math.min(r.qualityMin,q);r.qualityMax=r.qualityMax==null?q:Math.max(r.qualityMax,q);const k=qualityBand(q),x=bands.get(k)||bands.set(k,{band:k,qty:0,free:0}).get(k);x['qty']+=b.qty;x.free+=b.free;}
  r.bands=[...bands.values()];r.owners=[...r.owners];r.batches.sort((a,b)=>(a.site<b.site?-1:a.site>b.site?1:0)||(a.created??0)-(b.created??0));
  r.locations.sort((a,b)=>b.qty-a.qty);return r;
 }).filter(r=>r.total>EPS||r.incoming>0||r.inProduction>0||r.inTransit>EPS).sort((a,b)=>a.name.localeCompare(b.name,'de')||(a.ownerClass<b.ownerClass?-1:1));
 c.rows.set(ck,out);return out;
}

/** Auftragsdeckung nach S1 (Prüffall 3): open = qty − delivered; reservedForThis = Reservierungen der Vorgänge dieses Auftrags;
 *  underway = bereits verladene/unterwegs befindliche Menge (ohne Reservierung); freeOther = frei verfügbarer Bestand des
 *  Liefereigentümers am Auftrags- und Zustellstandort mit Mindestqualität; missing = max(0, open − underway − reservedForThis − freeOther).
 *  competing/poolDemand: andere aktive Aufträge, die denselben freien Bestand benötigen (Anzeige ist keine Zusage). */
export function orderCoverage(s,o){
 const c=cache(s);if(c.cover.has(o.id))return c.cover.get(o.id);
 const B=base(s),owner=orderOwner(o),sites=[...new Set([o.site,deliverySite(o)].filter(Boolean))];
 const need=o.qty,delivered=o.delivered||0,live=o.status==='active'||o.status==='offer';
 const open=live?Math.max(0,round(need-delivered)):0;
 const reservedForThis=o.status==='active'?round(B.byOrder.get(o.id)||0):0;
 const committed=o.status==='active'?(B.committed.get(o.id)||0)+(B.line.get(o.id)||0):0;
 const underway=Math.max(0,round(committed-reservedForThis));
 let onHand=0,reservedAll=0,blocked=0,pending=0,free=0;
 for(const site of sites){const g=B.groups.get(B.key(site,o.item,owner));if(!g)continue;onHand+=g.total;reservedAll+=g.reserved;blocked+=g.blocked;pending+=g.pending;free+=g.free;}
 const freeOther=freeQty(s,o.item,sites,owner,o.quality||0);
 const lowQuality=round(free-freeOther);
 const reservedOther=Math.max(0,round(reservedAll-reservedForThis));
 const missing=live?Math.max(0,round(open-underway-reservedForThis-freeOther)):0;
 const r={need,delivered,open,reservedForThis,underway,onHand:round(onHand),reservedOther,freeOther,lowQuality,blocked:round(blocked),pending:round(pending),missing,
  owner,sites,item:o.item,incoming:incomingQty(s,o.item,sites,owner),inProduction:sites.reduce((n,st)=>n+(B.production.get(B.key(st,o.item,owner))||0),0),competing:0,poolDemand:0};
 // Wettbewerb um denselben freien Bestand (nur eigene Ware; Kundenware gehört genau einem Auftrag).
 if(live&&owner==='company'&&freeOther>0){
  for(const x of s.orders){if(x===o||x.status!=='active'||x.item!==o.item||orderOwner(x)!=='company'||!sites.includes(x.site))continue;
   const xr=round(B.byOrder.get(x.id)||0),xc=Math.max(0,(B.committed.get(x.id)||0)+(B.line.get(x.id)||0)-xr),rest=Math.max(0,x.qty-(x.delivered||0)-xr-xc);
   if(rest>0){r.competing++;r.poolDemand+=rest;}}
 }
 c.cover.set(o.id,r);return r;
}

/** Text der Deckung, z. B. „35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen“. */
export function coverageText(c,fmt=n=>String(n)){
 const p=[`${fmt(c.open)} benötigt`];
 if(c.underway>0)p.push(`${fmt(c.underway)} unterwegs`);
 p.push(`${fmt(c.onHand)} auf Lager`);
 if(c.reservedForThis>0)p.push(`${fmt(c.reservedForThis)} für diesen Auftrag reserviert`);
 p.push(`${fmt(c.freeOther)} frei verfügbar`);
 p.push(c.missing>0?`${fmt(c.missing)} fehlen`:'gedeckt');
 return p.join(' · ');
}

/** Ressourcenbedarf aus den tatsächlichen Rezepten (mehrstufig, so weit hinterlegt). qty = herzustellende Menge
 *  (Standard 1 = Bedarf für ein Stück). Zwischenprodukte werden mit freiem Bestand verrechnet; nur der ungedeckte Rest
 *  erzeugt Bedarf an Vorstufen (durch Fertigware/Zwischenware gedeckte Mengen zählen nicht erneut).
 *  opts.site (Standard s.selectedSite), opts.owner (Standard company; Lohnfertigung: Auftrag), opts.orderId (nur Kennung).
 *  Rückgabe [] ohne Rezept; Zeilen {item,name,unit,perUnit,need,free,incoming,missing,toOrder,intermediate,purchasable,level}. */
export function resourceNeeds(s,item,qty=1,opts={}){
 const site=opts.site||s.selectedSite,owner=opts.owner||'company',key=`${item}|${qty}|${site}|${owner}`,c=cache(s);
 if(c.needs.has(key))return c.needs.get(key);
 const pool=new Map(),rows=new Map(),avail=k=>pool.has(k)?pool.get(k):freeQty(s,k,[site],owner);
 const expand=(it,n,level)=>{
  const r=chainRecipe(it);if(!r||level>8)return;
  for(const [k,q] of Object.entries(r.inputs)){
   const need=n*q/r.output.qty;
   let row=rows.get(k);if(!row)rows.set(k,row={item:k,name:ITEMS[k]?.name||k,unit:unitOf(k),perUnit:0,need:0,free:freeQty(s,k,[site],owner),incoming:incomingQty(s,k,[site],owner),missing:0,toOrder:0,produce:0,
    intermediate:!ITEMS[k]?.purchasable&&!!chainRecipe(k),purchasable:!!ITEMS[k]?.purchasable,level});
   row.need+=need;row.level=Math.min(row.level,level);
   if(row.intermediate){const a=avail(k),use=Math.min(a,need);pool.set(k,a-use);row.produce+=need-use;if(need-use>EPS)expand(k,need-use,level+1);}
  }
 };
 if(chainRecipe(item))expand(item,Math.max(0,qty),0);
 const out=[...rows.values()].map(r=>{r.need=round(r.need);r.perUnit=qty>0?round(r.need/qty):0;r.produce=round(r.produce);
  r.missing=r.intermediate?r.produce:Math.max(0,round(r.need-r.free));r.toOrder=r.purchasable?Math.max(0,Math.ceil(round(r.missing-r.incoming))):0;return r;})
  .sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name,'de'));
 c.needs.set(key,out);return out;
}
/** Text einer Ressourcenzeile, z. B. „12 verfügbar / 20 benötigt · 8 fehlen“. */
export function needText(r,fmt=n=>String(n)){
 return `${fmt(r.free)} verfügbar / ${fmt(r.need)} benötigt`+(r.missing>0?` · ${fmt(r.missing)} ${r.intermediate?'herzustellen':'fehlen'}`:'');
}
/** Vorschlag für die Bestellmenge (Fehlmenge minus bereits Bestelltes), begrenzt auf den Einkaufsbefehl (1–1000). */
export function suggestOrder(r){return Math.max(1,Math.min(1000,r.toOrder||Math.ceil(Math.max(0,(r.missing||0)-(r.incoming||0)))||1));}

/** Herzustellende Menge eines Auftrags: Fehlmenge nach Abzug von Fertigware (frei, reserviert, unterwegs). */
export function orderToProduce(s,o){const c=orderCoverage(s,o);return chainRecipe(o.item)&&o.kind!=='logistics'?c.missing:0;}
