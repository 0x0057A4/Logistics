import {ITEMS,BUILDINGS,VEHICLES} from './catalog.js';
import {activeBatches,findBatch,siteItemBatches} from './inventory.js';
import {gridDown} from './disruptions.js';
const COLD_ITEMS=Object.keys(ITEMS).filter(k=>ITEMS[k].cold);
const COLD_STORED=new Set(['stock','inbound','quarantine']);
export function init(){}
// Netzstrom eines Standorts (Anschlussleistung). 0.16 S1 (A03/A07): bei Netzstörung (disruptions.gridDown) 0 – Energiegebäude speisen weiter.
function gridEnergy(s,site){return gridDown(s,site.id)?0:site.energy;}
/** QS-015-01 (A04/A05): Lastverteilung eines Standorts mit Vorrang. Angebot = Netz + eingeschaltete Energiegebäude.
 *  Ohne Engpass (Angebot ≥ Summe aller eingeschalteten Verbraucher) laufen alle, bitgleich zum bisherigen Verhalten.
 *  Bei Engpass werden zuerst Kühllager in Gebäudereihenfolge versorgt, danach die übrigen Verbraucher; eine Anlage,
 *  die mangels Strom steht (Status „power“), nimmt der Kühlung daher keine Leistung weg. Rein lesend.
 *  Rückgabe {supply, demand, cooling:[versorgte Kühllager], shortage}. */
export function powerBalance(s,siteId){
 const site=s.sites.find(x=>x.id===siteId);if(!site)return {supply:0,demand:0,cooling:[],shortage:false};
 const enabled=s.buildings.filter(b=>b.site===siteId&&b.enabled&&b.condition>0);
 const supply=gridEnergy(s,site)+enabled.reduce((n,b)=>n+(BUILDINGS[b.type]?.energy||0),0);
 const demand=enabled.reduce((n,b)=>n+(BUILDINGS[b.type]?.power||0),0);
 const stores=enabled.filter(b=>b.type==='coldstore');
 if(supply>=demand)return {supply,demand,cooling:stores,shortage:false};
 const cooling=[];let left=supply;
 for(const b of stores){const p=BUILDINGS[b.type].power||0;if(left>=p){left-=p;cooling.push(b);}}
 return {supply,demand,cooling,shortage:true};
}
// Ganze Chargen werden FIFO auf reale Kühlplätze verteilt. Kein virtueller Überlauf.
export function coolingCapacity(s,siteId){
 return powerBalance(s,siteId).cooling.reduce((n,b)=>n+(BUILDINGS[b.type].capacity||0),0);
}
/** 0.15 S2: Belegte Kühlplätze eines Standorts (Menge aller Kühlartikel in stock/inbound/quarantine). Nur lesend. */
export function coolingUsed(s,siteId){
 let n=0;for(const item of COLD_ITEMS)for(const b of siteItemBatches(s,siteId,item))if(b.site===siteId&&b.qty>0&&COLD_STORED.has(b.location))n+=b.qty;
 return n;
}
/** 0.15 S2: Freie Kühlplätze (Kühllagerkapazität − Belegung, nie negativ). Neue Kühlware wird nur bis hierhin angenommen
 *  (yard/linehaul), damit step() jede Charge gekühlt einplant (FIFO, ganze Chargen, Summe ≤ Kapazität). */
export function coolingFree(s,siteId){return Math.max(0,coolingCapacity(s,siteId)-coolingUsed(s,siteId));}
// Ladungszuordnung je Minutenschritt, erst bei der ersten Fahrzeugcharge aufgebaut (laufzeitlokal).
// Erster Treffer gewinnt wie zuvor: Lieferungen, Transfers, Retouren, (0.15 S2) Linienfahrten, danach Sammeltouren.
function cargoIndex(s){
 const trips=new Map(),tours=new Map();
 for(const list of [s.shipments||[],s.transfers||[],s.returns||[],s.linehauls||[]])for(const t of list)if(Array.isArray(t.cargo))for(const id of t.cargo)if(!trips.has(id))trips.set(id,t);
 for(const t of s.tours||[])for(const stop of t.stops)if(Array.isArray(stop.cargo))for(const id of stop.cargo)if(!tours.has(id))tours.set(id,t);
 return {trips,tours};
}
function vehicleCooling(s,b,index){
 let trip=index.trips.get(b.id);
 trip??=index.tours.get(b.id);
 if(trip){const v=s.vehicles.find(v=>v.id===trip.vehicleId);return !!(v&&VEHICLES[v.type]?.cold&&v.condition>0);}
 return (s.freights||[]).some(f=>f.cold&&['waiting','transit','unloading'].includes(f.status)&&f.cargo?.includes(b.id));
}
export function handle(s,c,api){
 if(c.type!=='disposeBatch')return null;
 const b=findBatch(s,c.batchId);
 if(!b||!b.coldDamaged||b.owner!=='company'||b.reserved||!['stock','quarantine'].includes(b.location)||b.qty<=0)return {ok:false,message:'Nur eigene, unreservierte temperaturgeschädigte Lagerware kann entsorgt werden.'};
 if(!api.workforce.acquire('warehouse',b.site,'dispose:'+b.id))return {ok:false,message:'Lagerpersonal für Entsorgung fehlt.'};
 const qty=b.qty;if(!api.book('dispose:'+b.id,-qty*2,'Entsorgung','Temperaturgeschädigte Ware',[b.id])){api.workforce.release('dispose:'+b.id);return {ok:false,message:'Kapital für Entsorgung fehlt.'};}
 api.inventory.remove(b.id,qty);api.workforce.release('dispose:'+b.id);api.log('coldchain',`${qty} temperaturgeschädigte Einheiten entsorgt.`,[b.id]);return {ok:true};
}
export function step(s,api){
 const space=new Map(s.sites.map(site=>[site.id,coolingCapacity(s,site.id)]));
 let cargo=null;
 // Nur Chargen mit Menge (Arrayreihenfolge bleibt, Kühlplätze werden weiter FIFO verteilt).
 for(const b of activeBatches(s)){
  if(!ITEMS[b.item]?.cold||b.qty<=0)continue;
  b.temperature??=4;b.exposure??=0;b.peakTemperature??=b.temperature;
  let cooled=false;
  if(['stock','inbound','quarantine'].includes(b.location)&&space.get(b.site)>=b.qty){cooled=true;space.set(b.site,space.get(b.site)-b.qty);}
  else if(b.location==='vehicle')cooled=vehicleCooling(s,b,cargo??=cargoIndex(s));
  b.cooled=cooled;
  b.temperature=Math.round((cooled?Math.max(4,b.temperature-0.5):Math.min(24,b.temperature+0.25))*100)/100;
  b.peakTemperature=Math.max(b.peakTemperature,b.temperature);
  if(b.temperature>8){b.exposure++;b.quality=Math.max(0,Math.round((b.quality-(b.temperature-8)*0.035)*100)/100);}
  if(b.quality<70&&!b.coldDamaged){b.coldDamaged=true;b.blocked=true;api.log('coldchain','Temperaturgrenze verletzt: Charge dauerhaft gesperrt.',[b.id]);}
 }
}
export function validate(s){
 for(const b of s.batches)if(ITEMS[b.item]?.cold){
  if(!Number.isFinite(b.temperature)||b.temperature< -50||b.temperature>80||!Number.isFinite(b.exposure)||b.exposure<0||!Number.isFinite(b.peakTemperature)||b.peakTemperature<b.temperature)throw new Error('Temperaturprotokoll beschädigt.');
  if(b.coldDamaged&&!b.blocked)throw new Error('Temperaturschaden ohne Chargensperre.');
 }
 return true;
}
