// Linienverkehr zwischen eigenen Standorten (A07/A05, Welle 3a). Schnittstelle docs/SCHNITTSTELLEN-0.12-W3.md (W3-S2).
// Linie {id,from,to,departures:[Minute 0–1439],vehicleId|null,cutoff,active,missed,wait,waitAt}: fester Fahrplan.
// Ladeschluss = Abfahrt − cutoff. Genau zu diesem Zeitpunkt entsteht eine Fahrt, wenn der Lkw frei, gewartet und am
// Startstandort ist. Sie reserviert alle freien Einheiten in `stock` am Standort `from`, deren Auftrag nach `to` zugestellt
// wird (deliverySiteOf(o)===to, nur Fremdware: owner=Auftrag), früheste Frist zuerst, bis zur Fahrzeugkapazität
// (Volumen/Gewicht/Kühlung wie transport.maxLoad, bei Mischladung gemeinsam). Kann der Lkw nicht starten oder liegt
// nichts bereit, gilt die Abfahrt als verpasst (line.missed, line.wait) → nächste Abfahrt.
// Fahrt {id,lineId,vehicleId,from,to,status,cargo,orders:[{orderId,qty}],qty,remaining,duration,distance,departAt,…}:
//  loading   Dock + Fahrpersonal + (Stapler bei Paletten) + Lagerkraft am Start; danach abfahrbereit bis departAt
//            (frühere Abfahrt nicht, spätere bei Verzögerung). Abfahrt: Kasse ≥ Fahrtkosten, Reservierung → Fahrzeug.
//  transit   ceil(distance / Fahrzeuggeschwindigkeit) Minuten mit Fahrpersonal (wie Standorttransfer).
//  unloading Dock + (Stapler) + Lagerkraft am Ziel; danach Pakete → inbound am Ziel (Sortierung B), Paletten → stock.
//            Eigentum (Auftrag), Qualität und Kosten bleiben; Standortwechsel nur über inventory.relocate.
//  returning leer zurück, gleiche Dauer; complete → Fahrzeug frei, Zustand −2.
// Fahrzeug exklusiv: v.status='linehaul', v.linehaul=Fahrt-ID von Ladeschluss bis Rückkehr.
// Fahrtkosten wie Transfer: distance × 2 × runningCost, Buchung `linehaul:<id>`, Kategorie Transport, kein Umsatz.
// Ausfall vor Abfahrt (Storno cancelLinehaul, Wartung über transport.maintainVehicle/serviceVehicleExternal):
// Reservierung, Dock, Personal und Stapler frei, Pakete bleiben am Standort; nächste Abfahrt nimmt sie mit.
import {ITEMS,VEHICLES} from './catalog.js';
import {UNLOAD_BASE} from './workforce.js';
import {acquireForklift,releaseForklift,useForklift,forkliftKey,PALLET,PALLET_BASE} from './yard.js';
import {deliverySiteOf,siteDistance} from './contracts.js';

export const CUTOFF=30;
export const MIN_CONDITION=15;
export const KEEP=2880; // abgeschlossene/stornierte Fahrten bleiben zwei Spieltage sichtbar
export const MAX_DEPARTURES=24;
export const WAIT=Object.freeze({vehicle:'Kein Lkw zugeordnet',away:'Lkw nicht am Startstandort',busy:'Fahrzeug belegt',maintenance:'Fahrzeug benötigt Wartung',empty:'Keine Sendungen zum Ladeschluss',dock:'Kein freies Dock',staff:'Keine Lagerkraft',forklift:'Kein Stapler',driver:'Kein Fahrpersonal',cash:'Kasse reicht nicht für Fahrtkosten',cargo:'Ladung gesperrt oder unvollständig',full:'Lager am Ziel voll'});
const STATUSES=['loading','transit','unloading','returning','complete','cancelled'];
const ACTIVE=new Set(['loading','transit','unloading','returning']);
const cents=n=>Math.round(n*100)/100;
const rate=item=>item==='parcel'?UNLOAD_BASE:item===PALLET?PALLET_BASE:5;
/** Lade- bzw. Entlademinuten: 2 + je Artikel ceil(Menge / Rate) (Paket 20/min, Palette 1/min, sonst 5/min). */
export function handlingMinutes(orders,s){let n=2;const by=new Map();for(const x of orders){const item=s.orders.find(o=>o.id===x.orderId)?.item;by.set(item,(by.get(item)||0)+x.qty);}for(const [item,qty]of by)n+=Math.ceil(qty/rate(item));return n;}
export const tripCost=(v,distance)=>cents(distance*2*VEHICLES[v.type].runningCost);
const weightCap=v=>{const spec=VEHICLES[v.type];return spec.weightCapacity||spec.maxWeight||v.capacity*4;};
// Gleiche Prüfung wie transport.fits, erweitert um bereits belegtes Volumen/Gewicht (Mischladung).
const fitsMix=(v,usedV,usedW,item,n)=>(!ITEMS[item].cold||VEHICLES[v.type].cold)&&usedV+n*(ITEMS[item].volume||1)<=v.capacity&&usedW+n*(ITEMS[item].weight||1)<=weightCap(v);
/** Höchste zusätzliche Stückzahl bei bereits belegtem Volumen/Gewicht. Ohne Vorbelegung identisch mit transport.maxLoad. */
export function room(v,item,usedV=0,usedW=0){
 const it=ITEMS[item],spec=VEHICLES[v?.type];if(!it||!spec)return 0;if(it.cold&&!spec.cold)return 0;
 let n=Math.max(0,Math.floor(Math.min((v.capacity-usedV)/(it.volume||1),(weightCap(v)-usedW)/(it.weight||1))+1e-9));
 while(n>0&&!fitsMix(v,usedV,usedW,item,n))n--;while(fitsMix(v,usedV,usedW,item,n+1))n++;return n;
}
const key=(lh,role)=>`${lh.id}:${role}`;
const activeTrip=(s,lineId)=>s.linehauls.find(x=>x.lineId===lineId&&ACTIVE.has(x.status));
const validDepartures=d=>Array.isArray(d)&&d.length>=1&&d.length<=MAX_DEPARTURES&&d.every(m=>Number.isInteger(m)&&m>=0&&m<=1439)&&new Set(d).size===d.length;
const validCutoff=c=>Number.isInteger(c)&&c>=0&&c<=720;

export function init(s){s.lines??=[];s.linehauls??=[];}

export function handle(s,c,api){
 if(c.type==='createLine'){
  const from=s.sites.find(x=>x.id===c.from),to=s.sites.find(x=>x.id===c.to),cutoff=c.cutoff??CUTOFF,vehicleId=c.vehicleId??null;
  if(!from||!to||from.id===to.id)return {ok:false,message:'Linie benötigt zwei verschiedene eigene Standorte.'};
  if(!validDepartures(c.departures))return {ok:false,message:`Fahrplan: 1 bis ${MAX_DEPARTURES} verschiedene Abfahrtsminuten zwischen 0 und 1439.`};
  if(!validCutoff(cutoff))return {ok:false,message:'Ladeschluss: 0 bis 720 Minuten vor Abfahrt.'};
  if(vehicleId!==null&&!s.vehicles.some(v=>v.id===vehicleId&&v.site===from.id))return {ok:false,message:'Lkw muss am Startstandort stehen.'};
  if(s.lines.some(l=>l.from===from.id&&l.to===to.id))return {ok:false,message:'Linie zwischen diesen Standorten besteht bereits.'};
  const id=api.id('line');s.lines.push({id,from:from.id,to:to.id,departures:[...c.departures].sort((a,b)=>a-b),vehicleId,cutoff,active:true,missed:0,wait:null,waitAt:null});
  api.log('linehaul',`Linie ${from.name} → ${to.name} eingerichtet.`,[id]);return {ok:true,id};
 }
 if(c.type==='updateLine'){
  const l=s.lines.find(x=>x.id===c.id);if(!l)return {ok:false,message:'Linie fehlt.'};
  if(c.departures!==undefined&&!validDepartures(c.departures))return {ok:false,message:`Fahrplan: 1 bis ${MAX_DEPARTURES} verschiedene Abfahrtsminuten zwischen 0 und 1439.`};
  if(c.cutoff!==undefined&&!validCutoff(c.cutoff))return {ok:false,message:'Ladeschluss: 0 bis 720 Minuten vor Abfahrt.'};
  if(c.active!==undefined&&typeof c.active!=='boolean')return {ok:false,message:'Status ungültig.'};
  if(c.vehicleId!==undefined&&c.vehicleId!==null&&!s.vehicles.some(v=>v.id===c.vehicleId&&v.site===l.from))return {ok:false,message:'Lkw muss am Startstandort stehen.'};
  // Laufende Fahrt behält Fahrzeug und Ladung; Änderungen gelten ab dem nächsten Ladeschluss.
  if(c.departures!==undefined)l.departures=[...c.departures].sort((a,b)=>a-b);
  if(c.cutoff!==undefined)l.cutoff=c.cutoff;if(c.active!==undefined)l.active=c.active;if(c.vehicleId!==undefined)l.vehicleId=c.vehicleId;
  return {ok:true};
 }
 if(c.type==='deleteLine'){
  const l=s.lines.find(x=>x.id===c.id);if(!l)return {ok:false,message:'Linie fehlt.'};
  if(activeTrip(s,l.id))return {ok:false,message:'Linie hat eine laufende Fahrt.'};
  s.lines.splice(s.lines.indexOf(l),1);api.log('linehaul','Linie aufgelöst.',[l.id]);return {ok:true};
 }
 if(c.type==='cancelLinehaul'){
  const lh=s.linehauls.find(x=>x.id===c.id);if(!lh||lh.status!=='loading')return {ok:false,message:'Nur eine noch nicht abgefahrene Linienfahrt kann storniert werden.'};
  abortLinehaul(s,api,lh,'Storno');return {ok:true};
 }
 return null;
}

function freeAll(s,api,lh){
 for(const b of s.buildings)if(b.task===lh.id)b.task=null;
 api.workforce.release(key(lh,'warehouse'));api.workforce.release(key(lh,'driver'));releaseForklift(s,forkliftKey(lh.id));lh.worker=null;lh.driver=null;lh.dock=null;
}
/** Bricht eine Fahrt vor Abfahrt ab (Storno, Wartung, Fahrzeugausfall): Reservierung frei, Ware bleibt am Standort. */
export function abortLinehaul(s,api,lh,reason){
 if(!lh||lh.status!=='loading')return false;
 api.inventory.release(lh.id);freeAll(s,api,lh);
 const v=s.vehicles.find(v=>v.id===lh.vehicleId);if(v&&v.status==='linehaul'&&v.linehaul===lh.id){v.status='idle';v.linehaul=null;}
 delete lh.loadDone;lh.status='cancelled';lh.cancelReason=reason;lh.completedAt=s.t;lh.blocked=null;
 api.log('warning',`Linienfahrt storniert (${reason}): ${lh.qty} Einheiten bleiben am Standort und fahren mit der nächsten Abfahrt.`,[lh.id,lh.lineId,lh.vehicleId]);
 return true;
}
/** Laufende Linienfahrt eines Fahrzeugs vor Abfahrt (für Wartung/Storno aus transport.js); sonst null. */
export function loadingTrip(s,vehicleId){return (s.linehauls||[]).find(x=>x.vehicleId===vehicleId&&x.status==='loading')||null;}

function missLine(s,api,l,reason){
 l.missed=(l.missed||0)+1;l.wait=reason;l.waitAt=s.t;
 if(reason!==WAIT.empty)api.log('warning',`Linie: Abfahrt verpasst (${reason}). Nächste Abfahrt laut Fahrplan.`,[l.id]);
}
// Ladeschluss: Fahrt anlegen und Ware reservieren (frühere Frist zuerst, bis Kapazität).
function cutoffLine(s,api,l){
 const v=l.vehicleId?s.vehicles.find(v=>v.id===l.vehicleId):null;
 if(!v)return missLine(s,api,l,WAIT.vehicle);
 if(v.site!==l.from)return missLine(s,api,l,WAIT.away);
 if(v.status==='maintenance'||v.condition<MIN_CONDITION)return missLine(s,api,l,WAIT.maintenance);
 if(v.status!=='idle'||activeTrip(s,l.id))return missLine(s,api,l,WAIT.busy);
 const cand=[];
 for(let i=0;i<s.orders.length;i++){const o=s.orders[i];if(o.status==='active'&&o.kind==='logistics'&&deliverySiteOf(o)===l.to&&ITEMS[o.item])cand.push([o,i]);}
 cand.sort((a,b)=>a[0].due-b[0].due||a[1]-b[1]);
 const plan=[];let usedV=0,usedW=0,qty=0;
 for(const [o]of cand){
  const free=Math.floor(api.inventory.available(o.item,l.from,o.id)+1e-9);if(free<1)continue;
  const n=Math.min(free,room(v,o.item,usedV,usedW));if(n<1)continue;
  plan.push({o,n});usedV+=n*(ITEMS[o.item].volume||1);usedW+=n*(ITEMS[o.item].weight||1);qty+=n;
 }
 if(!qty)return missLine(s,api,l,WAIT.empty);
 const id=api.id('linehaul'),orders=[];
 for(const {o,n}of plan){if(!api.inventory.reserve(o.item,n,l.from,id,o.id)){api.inventory.release(id);return missLine(s,api,l,WAIT.cargo);}orders.push({orderId:o.id,qty:n});}
 const distance=siteDistance(s,l.from,l.to),pallet=orders.some(x=>s.orders.find(o=>o.id===x.orderId).item===PALLET),remaining=handlingMinutes(orders,s);
 s.linehauls.push({id,lineId:l.id,vehicleId:v.id,from:l.from,to:l.to,status:'loading',cargo:[],orders,qty,pallet,remaining,duration:remaining,distance,cutoffAt:s.t,departAt:s.t+l.cutoff,departedAt:null,arrivedAt:null,completedAt:null,cost:tripCost(v,distance),dock:null,driver:null,worker:null,blocked:null});
 v.status='linehaul';v.linehaul=id;l.wait=null;l.waitAt=null;
 api.log('linehaul',`Ladeschluss: ${qty} Einheiten für Linienfahrt reserviert.`,[id,l.id,v.id]);
}
function holdDock(s,lh,site){
 let dock=s.buildings.find(b=>b.task===lh.id&&b.type==='dock'&&b.site===site&&b.enabled&&b.condition>0);
 if(!dock){for(const b of s.buildings)if(b.task===lh.id)b.task=null;dock=s.buildings.find(b=>b.type==='dock'&&b.site===site&&b.enabled&&b.condition>0&&!b.task);}
 if(dock){dock.task=lh.id;lh.dock=dock.id;}else lh.dock=null;
 return dock||null;
}
// Eine Minute Umschlag (Beladen am Start bzw. Entladen am Ziel). true = Arbeitsminute geleistet.
function handling(s,api,lh,site){
 if(!holdDock(s,lh,site)){lh.blocked=WAIT.dock;api.workforce.release(key(lh,'warehouse'));lh.worker=null;if(lh.pallet)releaseForklift(s,forkliftKey(lh.id));return false;}
 let fork=null;
 if(lh.pallet){const f=acquireForklift(s,site,forkliftKey(lh.id));if(!f.forklift){api.workforce.release(key(lh,'warehouse'));lh.worker=null;lh.blocked=f.reason;return false;}fork=f.forklift;}
 const w=api.workforce.acquire('warehouse',site,key(lh,'warehouse'));
 if(!w){lh.worker=null;lh.blocked=WAIT.staff;if(fork)releaseForklift(s,forkliftKey(lh.id));return false;}
 w.activity=lh.status==='loading'?'Belädt Linien-Lkw':'Entlädt Linien-Lkw';lh.worker=w.id;lh.blocked=null;if(fork)useForklift(s,fork);
 return true;
}
function endHandling(s,api,lh){api.workforce.release(key(lh,'warehouse'));lh.worker=null;if(lh.pallet)releaseForklift(s,forkliftKey(lh.id));}

function stepTrip(s,api,lh){
 const v=s.vehicles.find(v=>v.id===lh.vehicleId);if(!v)return;
 const speed=VEHICLES[v.type].speed;
 // Fahrpersonal des Startstandorts begleitet die Fahrt (wie Standorttransfer).
 const driver=api.workforce.acquire('driver',lh.from,key(lh,'driver'));
 if(!driver){lh.driver=null;lh.blocked=WAIT.driver;if(lh.status==='loading'||lh.status==='unloading')endHandling(s,api,lh);return;}
 lh.driver=driver.id;
 if(lh.status==='loading'){
  if(!lh.loadDone){if(!handling(s,api,lh,lh.from)||--lh.remaining>0)return;lh.loadDone=true;endHandling(s,api,lh);}
  if(s.t<lh.departAt){lh.blocked=null;return;}
  if(s.money<lh.cost){lh.blocked=WAIT.cash;return;}
  const cargo=api.inventory.transfer(lh.id,'vehicle',lh.from);if(!cargo){lh.blocked=WAIT.cargo;return;}
  lh.cargo=cargo.map(b=>b.id);api.book(`linehaul:${lh.id}`,-lh.cost,'Transport','Linienfahrt',[lh.id,lh.lineId,v.id]);
  for(const b of s.buildings)if(b.task===lh.id)b.task=null;lh.dock=null;delete lh.loadDone;lh.blocked=null;
  lh.status='transit';lh.remaining=lh.duration=Math.ceil(lh.distance/speed);lh.departedAt=s.t;
  api.log('linehaul',`Linien-Lkw abgefahren: ${lh.qty} Einheiten${s.t>lh.departAt?`, ${s.t-lh.departAt} Min. verspätet`:''}.`,[lh.id,lh.lineId,v.id]);
  return;
 }
 if(lh.status==='unloading'){
  if(lh.remaining>0){if(!handling(s,api,lh,lh.to))return;lh.remaining--;}
  if(lh.remaining>0)return;
  const cargo=lh.cargo.map(id=>s.batches.find(b=>b.id===id));
  if(cargo.some(b=>!b||b.location!=='vehicle')){lh.blocked=WAIT.cargo;endHandling(s,api,lh);return;}
  const need=cargo.reduce((n,b)=>n+b.qty*(ITEMS[b.item].volume||1),0);
  if(api.inventory.free(lh.to)+1e-9<need){lh.blocked=WAIT.full;endHandling(s,api,lh);return;/* QS-W3-01 */}
  const parcels=cargo.filter(b=>b.item!==PALLET).map(b=>b.id),pallets=cargo.filter(b=>b.item===PALLET).map(b=>b.id);
  // Pakete gehen durch die Sortierung am Ziel; Paletten direkt ins Lager (wie Hof-Entladung).
  if(parcels.length&&!api.inventory.relocate(parcels,'inbound',lh.to)){lh.blocked=WAIT.full;endHandling(s,api,lh);return;/* QS-W3-01 */}
  if(pallets.length&&!api.inventory.relocate(pallets,'stock',lh.to)){lh.blocked=WAIT.full;endHandling(s,api,lh);return;/* QS-W3-01 */}
  endHandling(s,api,lh);for(const b of s.buildings)if(b.task===lh.id)b.task=null;lh.dock=null;lh.blocked=null;
  lh.arrivedAt=s.t;lh.status='returning';lh.remaining=lh.duration=Math.ceil(lh.distance/speed);
  api.log('linehaul',`Linien-Lkw am Ziel entladen: ${lh.qty} Einheiten im Wareneingang.`,[lh.id,lh.lineId,lh.to]);
  return;
 }
 lh.blocked=null;if(--lh.remaining>0)return;
 if(lh.status==='transit'){lh.status='unloading';lh.remaining=lh.duration=handlingMinutes(lh.orders,s);return;}
 if(lh.status==='returning'){
  lh.status='complete';lh.completedAt=s.t;lh.cargo=[];v.status='idle';v.linehaul=null;v.condition=Math.max(0,v.condition-2);
  api.workforce.release(key(lh,'driver'));lh.driver=null;
 }
}

export function step(s,api){
 if(!s.lines?.length&&!s.linehauls?.length)return;
 for(const lh of s.linehauls)if(ACTIVE.has(lh.status))stepTrip(s,api,lh);
 for(const l of s.lines){if(!l.active)continue;const m=(s.t+l.cutoff)%1440;if(l.departures.includes(m))cutoffLine(s,api,l);}
 if(s.t%60===0&&s.linehauls.some(x=>!ACTIVE.has(x.status)&&x.completedAt<s.t-KEEP))s.linehauls=s.linehauls.filter(x=>ACTIVE.has(x.status)||x.completedAt>=s.t-KEEP);
}

/** Lesesicht für HUD/Fenster: nächste Abfahrt (absolute Spielminute) und Ladeschluss einer Linie. Ändert nichts. */
export function nextDeparture(s,l,from=s.t){
 let best=null;for(const d of l.departures){let t=from-(from%1440)+d;while(t-l.cutoff<=from)t+=1440;if(best===null||t<best)best=t;}
 return best===null?null:{departAt:best,cutoffAt:best-l.cutoff};
}

export function validate(s){
 const bad=m=>{throw new Error('Linienverkehr beschädigt: '+m);};
 const int=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
 const sites=new Set(s.sites.map(x=>x.id)),vehicles=new Map(s.vehicles.map(v=>[v.id,v])),lines=new Map(),orders=new Map(s.orders.map(o=>[o.id,o]));
 for(const l of s.lines){
  if(!l||typeof l.id!=='string'||!sites.has(l.from)||!sites.has(l.to)||l.from===l.to||!validDepartures(l.departures)||!validCutoff(l.cutoff)||typeof l.active!=='boolean')bad('Linie');
  if(l.vehicleId!==null&&!vehicles.has(l.vehicleId))bad('Linienfahrzeug');
  if((l.missed!==undefined&&!int(l.missed))||(l.wait!=null&&typeof l.wait!=='string')||(l.waitAt!=null&&!int(l.waitAt)))bad('Linienstatus');
  lines.set(l.id,l);
 }
 const byJob=new Map();for(const r of s.reservations){if(typeof r.job==='string'&&r.job.startsWith('linehaul-')){let a=byJob.get(r.job);if(!a)byJob.set(r.job,a=[]);a.push(r);}}
 const trips=new Map(),busyVehicles=new Set(),busyLines=new Set(),cargoIds=new Set();
 for(const lh of s.linehauls){
  if(!lh||typeof lh.id!=='string'||!STATUSES.includes(lh.status)||!sites.has(lh.from)||!sites.has(lh.to)||lh.from===lh.to||!vehicles.has(lh.vehicleId))bad('Fahrt');
  if(!int(lh.qty,1)||!Number.isFinite(lh.remaining)||lh.remaining<0||!Number.isFinite(lh.distance)||lh.distance<=0||!int(lh.departAt)||!Number.isFinite(lh.cost)||lh.cost<0||!Array.isArray(lh.cargo)||!Array.isArray(lh.orders)||!lh.orders.length||typeof lh.pallet!=='boolean')bad('Fahrtwerte');
  let sum=0;const seen=new Set();
  for(const x of lh.orders){const o=orders.get(x?.orderId);if(!o||seen.has(o.id)||!int(x.qty,1))bad('Fahrtaufträge');seen.add(o.id);sum+=x.qty;}
  if(sum!==lh.qty)bad('Fahrtmenge');
  if(lh.pallet!==lh.orders.some(x=>orders.get(x.orderId).item===PALLET))bad('Ladeeinheit');
  trips.set(lh.id,lh);
  if(!ACTIVE.has(lh.status))continue;
  const l=lines.get(lh.lineId);if(!l||l.from!==lh.from||l.to!==lh.to)bad('Linienbezug');
  if(busyLines.has(l.id))bad('Linie doppelt unterwegs');busyLines.add(l.id);
  const v=vehicles.get(lh.vehicleId);if(v.status!=='linehaul'||v.linehaul!==lh.id||busyVehicles.has(v.id)||v.site!==lh.from)bad('Fahrzeugbindung');busyVehicles.add(v.id);
  const want=new Map(lh.orders.map(x=>[x.orderId,x.qty]));
  if(lh.status==='loading'){
   if(lh.cargo.length)bad('Ladung vor Abfahrt');
   const got=new Map();for(const r of byJob.get(lh.id)||[]){const b=s.batches.find(b=>b.id===r.batchId);if(!b||b.site!==lh.from||b.location!=='stock'||!want.has(b.owner))bad('Ladereservierung');got.set(b.owner,(got.get(b.owner)||0)+r.qty);}
   for(const [id,qty]of want)if(Math.abs((got.get(id)||0)-qty)>1e-7)bad('Reservierungsmenge');
   if(got.size!==want.size)bad('Reservierungsmenge');
  }else if(byJob.has(lh.id))bad('Reservierung nach Abfahrt');
  if(lh.status==='transit'||lh.status==='unloading'){
   const got=new Map();for(const id of lh.cargo){const b=s.batches.find(b=>b.id===id);if(cargoIds.has(id)||!b||b.location!=='vehicle'||!want.has(b.owner)||b.item!==orders.get(b.owner).item)bad('Fahrzeugladung');cargoIds.add(id);got.set(b.owner,(got.get(b.owner)||0)+b.qty);}
   for(const [id,qty]of want)if(Math.abs((got.get(id)||0)-qty)>1e-7)bad('Ladungsmenge');
   if(got.size!==want.size)bad('Ladungsmenge');
  }
  if(lh.dock!=null){
   const at=lh.status==='loading'?lh.from:lh.status==='unloading'?lh.to:null,b=s.buildings.find(b=>b.id===lh.dock);
   if(!at||!b||b.type!=='dock'||b.site!==at||b.task!==lh.id)bad('Dockbelegung');
  }
 }
 for(const job of byJob.keys())if(trips.get(job)?.status!=='loading')bad('Verwaiste Ladereservierung');
 for(const b of s.buildings){
  if(typeof b.task!=='string'||!trips.has(b.task))continue;
  const lh=trips.get(b.task);if(b.type!=='dock'||lh.dock!==b.id||!['loading','unloading'].includes(lh.status))bad('Verwaiste Dockbelegung');
 }
 for(const v of s.vehicles)if(v.status==='linehaul'&&!busyVehicles.has(v.id))bad('Fahrzeug ohne Linienfahrt');
}
