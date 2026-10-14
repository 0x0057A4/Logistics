import {ITEMS,BUILDINGS,VEHICLES} from './catalog.js';
export function init(){}
// Ganze Chargen werden FIFO auf reale Kühlplätze verteilt. Kein virtueller Überlauf.
export function coolingCapacity(s,siteId){
 const site=s.sites.find(x=>x.id===siteId);if(!site)return 0;
 const enabled=s.buildings.filter(b=>b.site===siteId&&b.enabled&&b.condition>0);
 const supply=site.energy+enabled.reduce((n,b)=>n+(BUILDINGS[b.type]?.energy||0),0);
 const demand=enabled.reduce((n,b)=>n+(BUILDINGS[b.type]?.power||0),0);
 if(supply<demand)return 0;
 return enabled.filter(b=>b.type==='coldstore').reduce((n,b)=>n+(BUILDINGS[b.type].capacity||0),0);
}
function vehicleCooling(s,b){
 const trips=[...(s.shipments||[]),...(s.transfers||[]),...(s.returns||[])];
 let trip=trips.find(t=>t.cargo?.includes(b.id));
 trip??=(s.tours||[]).find(t=>t.stops.some(stop=>stop.cargo?.includes(b.id)));
 if(trip){const v=s.vehicles.find(v=>v.id===trip.vehicleId);return !!(v&&VEHICLES[v.type]?.cold&&v.condition>0);}
 return (s.freights||[]).some(f=>f.cold&&['waiting','transit','unloading'].includes(f.status)&&f.cargo?.includes(b.id));
}
export function handle(s,c,api){
 if(c.type!=='disposeBatch')return null;
 const b=s.batches.find(b=>b.id===c.batchId);
 if(!b||!b.coldDamaged||b.owner!=='company'||b.reserved||!['stock','quarantine'].includes(b.location)||b.qty<=0)return {ok:false,message:'Nur eigene, unreservierte temperaturgeschädigte Lagerware kann entsorgt werden.'};
 if(!api.workforce.acquire('warehouse',b.site,'dispose:'+b.id))return {ok:false,message:'Lagerpersonal für Entsorgung fehlt.'};
 const qty=b.qty;if(!api.book('dispose:'+b.id,-qty*2,'Entsorgung','Temperaturgeschädigte Ware',[b.id])){api.workforce.release('dispose:'+b.id);return {ok:false,message:'Kapital für Entsorgung fehlt.'};}
 api.inventory.remove(b.id,qty);api.workforce.release('dispose:'+b.id);api.log('coldchain',`${qty} temperaturgeschädigte Einheiten entsorgt.`,[b.id]);return {ok:true};
}
export function step(s,api){
 const space=new Map(s.sites.map(site=>[site.id,coolingCapacity(s,site.id)]));
 for(const b of s.batches){
  if(!ITEMS[b.item]?.cold||b.qty<=0)continue;
  b.temperature??=4;b.exposure??=0;b.peakTemperature??=b.temperature;
  let cooled=false;
  if(['stock','inbound','quarantine'].includes(b.location)&&space.get(b.site)>=b.qty){cooled=true;space.set(b.site,space.get(b.site)-b.qty);}
  else if(b.location==='vehicle')cooled=vehicleCooling(s,b);
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
