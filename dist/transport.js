import {committedQty} from './tours.js';
import {VEHICLES,ITEMS} from './catalog.js';
import {acquireForklift,releaseForklift,useForklift,forkliftKey,forkItem} from './yard.js';
import {FORK_ROLES} from './workforce.js';
import {deliverySiteOf} from './contracts.js';
import {loadingTrip,abortLinehaul} from './linehaul.js';
import {loadingAirShuttle,abortAirShuttle} from './airexport.js';
/** W3c-S1: laufende Linienfahrt bzw. Flughafen-Zubringer vor Abfahrt; Wartung bricht ihn ab (Reservierung frei, Ware bleibt am Standort). */
const pendingTrip=(s,v)=>v?.status==='linehaul'?loadingTrip(s,v.id):v?.status==='airshuttle'?loadingAirShuttle(s,v.id):null;
const abortTrip=(s,api,v,trip)=>v.status==='airshuttle'?abortAirShuttle(s,api,trip,'Wartung'):abortLinehaul(s,api,trip,'Wartung');
/** W3-S2: Fremdware (Logistikauftrag) wird nur am Zustellstandort zugestellt; eigene Fertigware bleibt standortfrei. */
export const deliverableAt=(o,site)=>o.kind!=='logistics'||deliverySiteOf(o)===undefined||deliverySiteOf(o)===site;
export function init(s){s.transfers??=[];}
const fits=(v,item,qty)=>(!ITEMS[item].cold||VEHICLES[v.type].cold)&&qty*(ITEMS[item].volume||1)<=v.capacity&&qty*(ITEMS[item].weight||1)<=(VEHICLES[v.type].weightCapacity||VEHICLES[v.type].maxWeight||v.capacity*4);
/** Höchste Stückzahl eines Artikels, die `fits` für dieses Fahrzeug zulässt (Volumen, Gewicht, Kühlung). Nur lesend. */
export function maxLoad(v,item){
 const it=ITEMS[item],spec=VEHICLES[v?.type];if(!it||!spec||!Number.isFinite(v.capacity))return 0;if(it.cold&&!spec.cold)return 0;
 const weightCap=spec.weightCapacity||spec.maxWeight||v.capacity*4;let n=Math.max(0,Math.floor(Math.min(v.capacity/(it.volume||1),weightCap/(it.weight||1))+1e-9));
 while(n>0&&!fits(v,item,n))n--;while(fits(v,item,n+1))n++;return n;
}
/** Wartungskosten: Werkstatt 8 € je fehlendem Zustandspunkt; externer Servicepartner ×1,5, 120 Spielminuten, ohne eigenes Ersatzteil. */
export const EXTERNAL_SERVICE={minutes:120,factor:1.5};
export const maintenanceCost=(v,external=false)=>Math.ceil((100-v.condition)*8*(external?EXTERNAL_SERVICE.factor:1));
export const WEAR_WARN=35;
export function handle(s,c,api){
 if(c.type==='transfer')return startTransfer(s,c,api);
 if(c.type==='buyVehicle'){
  const spec=VEHICLES[c.vehicleType],site=c.site||s.selectedSite;if(!spec||!s.sites.some(x=>x.id===site))return {ok:false,message:'Fahrzeug oder Standort ungültig.'};
  const id=api.id('vehicle');if(!api.book(`vehicle:${id}`,-spec.cost,'Fuhrpark',spec.name,[id]))return {ok:false,message:'Kapital für Fahrzeug fehlt.'};
  s.vehicles.push({id,name:spec.name,type:c.vehicleType,site,capacity:spec.capacity,condition:100,status:'idle',shipment:null,acquiredAt:s.t,cost:spec.cost});api.log('transport',`${spec.name} angeschafft.`,[id]);return {ok:true,id};
 }
 if(c.type==='dispatch'){
  const o=s.orders.find(x=>x.id===c.orderId),v=s.vehicles.find(x=>x.id===c.vehicleId),site=c.site||s.selectedSite;
  if(!o||o.status!=='active'||!v||v.status!=='idle'||v.site!==site)return {ok:false,message:'Aktiven Auftrag und freies Fahrzeug am Standort wählen.'};
  if(v.condition<15)return {ok:false,message:'Fahrzeug benötigt Wartung.'};
  if(!deliverableAt(o,site))return {ok:false,message:'Zustellgebiet gehört zu einem anderen Standort. Ware per Linie dorthin bringen.'};
  if(o.airExport)return {ok:false,message:'Luftexport: Pakete per Flughafen-Zubringer zum Frachtterminal bringen.'};
  const committed=committedQty(s,o.id);
  if(!Number.isInteger(c.qty)||c.qty<1||c.qty>o.qty-o.delivered-committed||!fits(v,o.item,c.qty))return {ok:false,message:'Menge überschreitet Restauftrag oder Fahrzeugkapazität.'};
  const id=api.id('shipment');if(!api.inventory.reserve(o.item,c.qty,site,id,(o.kind==='logistics'||o.kind==='vas')?o.id:'company'))return {ok:false,message:'Verfügbarer Fertigwarenbestand fehlt.'};
  const reservations=s.reservations.filter(r=>r.job===id);if(reservations.some(r=>(s.batches.find(b=>b.id===r.batchId)?.quality||0)<o.quality)){api.inventory.release(id);return {ok:false,message:'Reservierte Ware erfüllt Qualitätsanforderung nicht.'};}
  s.shipments.push({id,orderId:o.id,vehicleId:v.id,site,qty:c.qty,status:'loading',remaining:2+Math.ceil(c.qty/5),cargo:[],driver:null,worker:null,paid:false,createdAt:s.t,distance:30});v.status='loading';v.shipment=id;api.log('transport',`Teillieferung ${c.qty} Stück für ${o.customer} eingeplant.`,[id,o.id,v.id]);return {ok:true,id};
 }
 if(c.type==='cancelShipment'){
  const sh=s.shipments.find(x=>x.id===c.id);if(!sh||sh.status!=='loading')return {ok:false,message:'Nur noch nicht abgefahrene Lieferung kann storniert werden.'};
  api.inventory.release(sh.id);api.workforce.release(`${sh.id}:warehouse`);api.workforce.release(`${sh.id}:driver`);releaseForklift(s,forkliftKey(sh.id));sh.status='cancelled';const v=s.vehicles.find(x=>x.id===sh.vehicleId);v.status='idle';v.shipment=null;for(const b of s.buildings)if(b.task===sh.id)b.task=null;return {ok:true};
 }
 if(c.type==='maintainVehicle'){
  // W3-S2: Linienfahrt vor Abfahrt wird für die Wartung abgebrochen (Reservierung frei, Ware bleibt am Standort).
  const v=s.vehicles.find(x=>x.id===c.id),trip=pendingTrip(s,v);if(!v||(v.status!=='idle'&&!trip))return {ok:false,message:'Nur freies Fahrzeug kann gewartet werden.'};
  if(v.condition>=100)return {ok:false,message:'Fahrzeug bereits gewartet.'};
  const workshop=s.buildings.find(b=>b.site===v.site&&b.type==='workshop'&&b.enabled&&b.condition>0&&!b.maintenanceTask&&!b.serviceJob);
  if(!workshop)return {ok:false,message:'Freie Wartungswerkstatt fehlt.'};
  const id=api.id('maintenance');if(!api.inventory.reserve('spare',1,v.site,id))return {ok:false,message:'Ein Ersatzteil benötigt.'};
  const cost=maintenanceCost(v);if(!api.book(`vehicle-maintenance:${id}`,-cost,'Wartung',v.name,[v.id])){api.inventory.release(id);return {ok:false,message:'Kapital für Wartung fehlt.'};}
  api.inventory.consume(id);if(trip)abortTrip(s,api,v,trip);v.status='maintenance';v.maintenance={id,workshop:workshop.id,remaining:20};workshop.maintenanceTask=id;return {ok:true};
 }
 if(c.type==='serviceVehicleExternal'){
  // Mobiler Servicepartner am Standort: keine eigene Werkstatt, kein eigenes Ersatzteil, kein eigenes Personal; teurer.
  const v=s.vehicles.find(x=>x.id===c.id),trip=pendingTrip(s,v);if(!v||(v.status!=='idle'&&!trip)||!s.sites.some(a=>a.id===v.site))return {ok:false,message:'Nur freies Fahrzeug am Standort kann extern gewartet werden.'};
  if(v.condition>=100)return {ok:false,message:'Fahrzeug bereits gewartet.'};
  const id=api.id('maintenance'),cost=maintenanceCost(v,true);
  if(!api.book(`vehicle-service-external:${id}`,-cost,'Wartung',`${v.name} · externe Wartung`,[v.id]))return {ok:false,message:'Kapital für externe Wartung fehlt.'};
  if(trip)abortTrip(s,api,v,trip);v.status='maintenance';v.maintenance={id,external:true,remaining:EXTERNAL_SERVICE.minutes,duration:EXTERNAL_SERVICE.minutes,cost};
  api.log('maintenance',`${v.name}: externe Wartung beauftragt, ${EXTERNAL_SERVICE.minutes} Min. außer Betrieb.`,[v.id]);return {ok:true,id,cost};
 }
 return null;
}
export function step(s,api){
 stepTransfers(s,api);
 for(const v of s.vehicles.filter(v=>v.status==='maintenance')){
  const m=v.maintenance;
  if(m.external){m.blocked=null;if(--m.remaining<=0){v.condition=100;v.status='idle';v.maintenance=null;api.log('maintenance',`${v.name} extern gewartet.`,[v.id]);}continue;}
  const workshop=s.buildings.find(b=>b.id===m.workshop);
  if(!workshop||!workshop.enabled||workshop.condition<=0){m.blocked='Werkstatt nicht verfügbar';continue;}
  const w=api.workforce.acquire('technician',v.site,m.id);if(!w){m.blocked='Technikpersonal oder Schicht fehlt';continue;}
  m.blocked=null;m.worker=w.id;if(--m.remaining<=0){v.condition=100;v.status='idle';workshop.maintenanceTask=null;api.workforce.release(m.id);v.maintenance=null;api.log('maintenance',`${v.name} gewartet.`,[v.id]);}
 }

 for(const sh of s.shipments){
  if(['complete','cancelled'].includes(sh.status))continue;
  const v=s.vehicles.find(x=>x.id===sh.vehicleId),o=s.orders.find(x=>x.id===sh.orderId);if(!v||!o)continue;
  if(sh.status==='loading'){
   let dock=s.buildings.find(b=>b.task===sh.id&&b.type==='dock'&&b.enabled&&b.condition>0);
   if(!dock)dock=s.buildings.find(b=>b.site===sh.site&&b.type==='dock'&&b.enabled&&b.condition>0&&!b.task);
   if(!dock){sh.blocked='Warteschlange: freie Laderampe fehlt';continue;}dock.task=sh.id;sh.dock=dock.id;
  }
  const pallet=sh.status==='loading'&&forkItem(o.item); // 0.15 S2: Palette oder Sperrgut → Stapler + Lagerkraft
  const driver=api.workforce.acquire('driver',sh.site,`${sh.id}:driver`);if(!driver){sh.blocked='Fahrpersonal oder Schicht fehlt';if(pallet)releaseForklift(s,forkliftKey(sh.id));continue;}sh.driver=driver.id;
  if(sh.status==='loading'){
   // Paletten (W2-S2): Stapler zuerst; ohne Stapler bleibt keine Lagerkraft gebunden, ohne Lagerkraft kein Stapler.
   // QS-W2-01: Ladezeit erfüllt (loadDone) → Abfahrt braucht weder Stapler noch Lagerkraft; Warten auf Geld/Ladung verbraucht keinen Akku.
   if(sh.loadDone){if(pallet)releaseForklift(s,forkliftKey(sh.id));api.workforce.release(`${sh.id}:warehouse`);sh.worker=null;}else{
   let fork=null;if(pallet){const f=acquireForklift(s,sh.site,forkliftKey(sh.id));if(!f.forklift){api.workforce.release(`${sh.id}:warehouse`);sh.worker=null;sh.blocked=f.reason;continue;}fork=f.forklift;}
   const worker=pallet?api.workforce.acquireAny(FORK_ROLES,sh.site,`${sh.id}:warehouse`):api.workforce.acquire('warehouse',sh.site,`${sh.id}:warehouse`);if(!worker){sh.blocked='Lagerpersonal für Beladung fehlt';if(fork)releaseForklift(s,forkliftKey(sh.id));continue;}sh.worker=worker.id;sh.blocked=null;
   if(fork)useForklift(s,fork);
   if(--sh.remaining>0)continue;sh.loadDone=true;}
   const cost=Math.round(sh.distance*2*VEHICLES[v.type].runningCost*100)/100;
   if(s.money<cost){sh.remaining=1;sh.blocked='Betriebskosten können nicht bezahlt werden';/* QS-W2-01: Stapler/Kraft beim Warten freigeben */if(pallet)releaseForklift(s,forkliftKey(sh.id));api.workforce.release(`${sh.id}:warehouse`);sh.worker=null;continue;}
   const cargo=api.inventory.transfer(sh.id,'vehicle',sh.site);if(!cargo){sh.remaining=1;sh.blocked='Ladung nicht verfügbar';/* QS-W2-01: Stapler/Kraft beim Warten freigeben */if(pallet)releaseForklift(s,forkliftKey(sh.id));api.workforce.release(`${sh.id}:warehouse`);sh.worker=null;continue;}
   delete sh.loadDone;sh.cargo=cargo.map(b=>b.id);sh.materialCost=o.kind==='logistics'||o.kind==='vas'?0:Math.round(cargo.reduce((n,b)=>n+b.qty*b.unitCost,0)*100)/100;sh.transportCost=cost;sh.tripCost=cost;const dock=s.buildings.find(b=>b.task===sh.id);if(dock){const k=dock.task;for(const b of s.buildings)if(b.task===k)b.task=null;};api.book(`trip:${sh.id}`,-cost,'Transport',`Tour ${sh.id}`,[sh.id,v.id,o.id]);api.workforce.release(`${sh.id}:warehouse`);if(pallet)releaseForklift(s,forkliftKey(sh.id));sh.worker=null;sh.status='transit';v.status='transit';sh.remaining=Math.ceil(sh.distance/VEHICLES[v.type].speed);sh.departedAt=s.t;
  }else{
   sh.blocked=null;if(--sh.remaining>0)continue;
   if(sh.status==='transit'){sh.status='unloading';v.status='unloading';sh.remaining=2+Math.ceil(sh.qty/10);}
   else if(sh.status==='unloading'){
    if(sh.cargo.some(id=>{const b=s.batches.find(b=>b.id===id);return !b||b.blocked||b.quality<o.quality;})){sh.blocked='Rückruf: gesperrte Ware darf nicht zugestellt werden';sh.remaining=1;continue;}
    // Every unit is removed from its physical vehicle batch exactly once.
    for(const bid of sh.cargo){const b=s.batches.find(x=>x.id===bid);if(b)api.inventory.remove(b.id,b.qty);}
    o.delivered+=sh.qty;s.stats.delivered+=sh.qty;sh.deliveredAt=s.t;sh.invoiceAmount=Math.round(sh.qty*o.price*(s.t>o.due?0.9:1)*100)/100;sh.paymentAt=s.t+60;
    if(o.delivered>=o.qty){o.status='fulfilled';s.reputation=Math.min(100,s.reputation+3);}sh.status='returning';v.status='returning';sh.remaining=Math.ceil(sh.distance/VEHICLES[v.type].speed);api.log('delivery',`${o.customer}: ${sh.qty} Stück zugestellt. Zahlung in 60 Minuten.`,[sh.id,o.id]);
   }else if(sh.status==='returning'){sh.status='complete';sh.completedAt=s.t;v.status='idle';v.shipment=null;v.condition=Math.max(0,v.condition-2);api.workforce.release(`${sh.id}:driver`);sh.driver=null;}
  }
 }
}
export function validate(s){
 const bad=m=>{throw new Error('Spielstand ungültig: '+m);};
 for(const v of s.vehicles){if(!VEHICLES[v.type]||!Number.isFinite(v.capacity)||v.capacity!==VEHICLES[v.type].capacity||!Number.isFinite(v.condition)||v.condition<0||v.condition>100||!['idle','loading','transit','unloading','returning','maintenance','service','transfer','tour','rentalReturned','linehaul','airshuttle'].includes(v.status))bad('Fahrzeug beschädigt.');if(v.status==='maintenance'&&(!v.maintenance||(v.maintenance.external?!(Number.isFinite(v.maintenance.remaining)&&v.maintenance.remaining>=0&&v.maintenance.remaining<=EXTERNAL_SERVICE.minutes):!s.buildings.some(b=>b.id===v.maintenance.workshop&&b.maintenanceTask===v.maintenance.id))))bad('Fahrzeugwartung beschädigt.');if(v.status==='service'&&!s.returns.some(r=>r.id===v.shipment))bad('Rücktransport beschädigt.');if(!['idle','maintenance','service','transfer','tour','rentalReturned','linehaul','airshuttle'].includes(v.status)&&!s.shipments.some(sh=>sh.id===v.shipment&&sh.vehicleId===v.id&&sh.status===v.status))bad('Fahrzeugzuweisung beschädigt.');}
 validateTransfers(s,bad);
 const occupied=new Set();
 for(const sh of s.shipments){
  if(!s.orders.some(o=>o.id===sh.orderId)||!s.vehicles.some(v=>v.id===sh.vehicleId)||!Number.isInteger(sh.qty)||sh.qty<1||!Number.isFinite(sh.remaining)||sh.remaining<0||!Array.isArray(sh.cargo)||!['loading','transit','unloading','returning','complete','cancelled'].includes(sh.status))bad('Tour beschädigt.');
  if(!['complete','cancelled'].includes(sh.status)){if(occupied.has(sh.vehicleId))bad('Fahrzeug doppelt belegt.');occupied.add(sh.vehicleId);}
  if(['transit','unloading'].includes(sh.status)){
   if(new Set(sh.cargo).size!==sh.cargo.length)bad('Ladung doppelt zugeordnet.');
   const cargo=sh.cargo.map(id=>s.batches.find(b=>b.id===id));if(cargo.some(b=>!b||b.location!=='vehicle')||cargo.reduce((n,b)=>n+b.qty,0)!==sh.qty)bad('Fahrzeugladung beschädigt.');
  }
  if(sh.status==='loading'&&s.reservations.filter(r=>r.job===sh.id).reduce((n,r)=>n+r.qty,0)!==sh.qty)bad('Ladereservierung beschädigt.');
  if(sh.paymentAt!=null&&(!Number.isFinite(sh.paymentAt)||!Number.isFinite(sh.invoiceAmount)||sh.invoiceAmount<0||!['returning','complete'].includes(sh.status)))bad('Forderung beschädigt.');
 }
}
function startTransfer(s,c,api){
 const site=c.site||s.selectedSite,v=s.vehicles.find(v=>v.id===c.vehicleId),from=s.sites.find(a=>a.id===site),to=s.sites.find(a=>a.id===c.toSite);
 if(!v||v.status!=='idle'||v.site!==site||!from||!to||from.id===to.id||!ITEMS[c.item]||!Number.isInteger(c.qty)||c.qty<1||!fits(v,c.item,c.qty)||v.condition<15)return {ok:false,message:'Transfer prüfen: Standorte, freie Fahrzeugkapazität, Wartung und Menge.'};
 const id=api.id('transfer');if(!api.inventory.reserve(c.item,c.qty,site,id))return {ok:false,message:'Verfügbarer eigener Bestand fehlt.'};
 const distance=Math.max(15,Math.round(Math.hypot(to.x-from.x,to.y-from.y)));
 (s.transfers??=[]).push({id,item:c.item,qty:c.qty,owner:'company',site,fromSite:site,toSite:to.id,vehicleId:v.id,status:'loading',remaining:2+Math.ceil(c.qty/5),duration:2+Math.ceil(c.qty/5),cargo:[],distance,driver:null,worker:null});v.status='transfer';v.shipment=id;return {ok:true,id};
}
function stepTransfers(s,api){
 for(const tr of s.transfers||[]){
  if(['complete','cancelled'].includes(tr.status))continue;
  const v=s.vehicles.find(v=>v.id===tr.vehicleId);if(!v)continue;
  const driver=api.workforce.acquire('driver',tr.site,`${tr.id}:driver`);if(!driver){tr.blocked='Fahrpersonal oder Schicht fehlt';continue;}tr.driver=driver.id;
  if(['loading','unloading'].includes(tr.status)){
   const site=tr.status==='loading'?tr.site:tr.toSite;
   let dock=s.buildings.find(b=>b.type==='dock'&&b.site===site&&b.enabled&&b.condition>0&&b.task===tr.id);
   dock??=s.buildings.find(b=>b.type==='dock'&&b.site===site&&b.enabled&&b.condition>0&&!b.task);
   if(!dock){tr.blocked='Freie Rampe am '+(tr.status==='loading'?'Start':'Ziel')+' fehlt';continue;}dock.task=tr.id;tr.dock=dock.id;
   const worker=api.workforce.acquire('warehouse',site,`${tr.id}:warehouse`);if(!worker){tr.blocked='Lagerpersonal am '+(tr.status==='loading'?'Start':'Ziel')+' fehlt';continue;}tr.worker=worker.id;tr.blocked=null;
   if(--tr.remaining>0)continue;
   if(tr.status==='loading'){
    const cost=Math.round(tr.distance*2*VEHICLES[v.type].runningCost*100)/100;
    if(s.money<cost){tr.blocked='Transferkosten nicht gedeckt';tr.remaining=1;continue;}
    const cargo=api.inventory.transfer(tr.id,'vehicle',tr.site);if(!cargo){tr.blocked='Reservierte Transferladung fehlt';tr.remaining=1;continue;}
    tr.cargo=cargo.map(b=>b.id);tr.transportCost=cost;api.book(`transfer-trip:${tr.id}`,-cost,'Transport','Standorttransfer',[tr.id,v.id]);tr.status='transit';tr.remaining=Math.ceil(tr.distance/VEHICLES[v.type].speed);tr.duration=tr.remaining;
   }else{
    if(!api.inventory.relocate(tr.cargo,'stock',tr.toSite)){tr.blocked='Zielkapazität fehlt; Ware bleibt im Fahrzeug';tr.remaining=1;continue;}
    tr.deliveredAt=s.t;tr.status='returning';tr.remaining=Math.ceil(tr.distance/VEHICLES[v.type].speed);tr.duration=tr.remaining;api.log('transfer',`${tr.qty} × ${ITEMS[tr.item].name} am Zielstandort eingelagert.`,[tr.id,tr.toSite]);
   }
   {const k=dock.task;for(const b of s.buildings)if(b.task===k)b.task=null;};api.workforce.release(`${tr.id}:warehouse`);tr.worker=null;
  }else{
   tr.blocked=null;if(--tr.remaining>0)continue;
   if(tr.status==='transit'){tr.status='unloading';tr.remaining=2+Math.ceil(tr.qty/5);tr.duration=tr.remaining;}
   else if(tr.status==='returning'){tr.status='complete';tr.completedAt=s.t;v.status='idle';v.shipment=null;v.condition=Math.max(0,v.condition-2);api.workforce.release(`${tr.id}:driver`);tr.driver=null;}
  }
 }
}
function validateTransfers(s,bad){
 const assigned=new Set();
 for(const tr of s.transfers||[]){
  if(!ITEMS[tr.item]||!Number.isInteger(tr.qty)||tr.qty<1||!s.sites.some(a=>a.id===tr.site)||!s.sites.some(a=>a.id===tr.toSite)||tr.site===tr.toSite||!s.vehicles.some(v=>v.id===tr.vehicleId)||!Number.isFinite(tr.remaining)||tr.remaining<0||!Array.isArray(tr.cargo)||!['loading','transit','unloading','returning','complete','cancelled'].includes(tr.status))bad('Standorttransfer beschädigt.');
  if(!['complete','cancelled'].includes(tr.status)){
   const v=s.vehicles.find(v=>v.id===tr.vehicleId);if(v.status!=='transfer'||v.shipment!==tr.id||assigned.has(v.id))bad('Transferfahrzeug beschädigt.');assigned.add(v.id);
  }
  if(tr.status==='loading'&&s.reservations.filter(r=>r.job===tr.id).reduce((n,r)=>n+r.qty,0)!==tr.qty)bad('Transferreservierung beschädigt.');
  if(['transit','unloading'].includes(tr.status)){
   const cargo=tr.cargo.map(id=>s.batches.find(b=>b.id===id));if(new Set(tr.cargo).size!==tr.cargo.length||cargo.some(b=>!b||b.location!=='vehicle'||b.item!==tr.item||b.owner!==tr.owner)||cargo.reduce((n,b)=>n+b.qty,0)!==tr.qty)bad('Transferladung beschädigt.');
  }
 }
 for(const v of s.vehicles)if(v.status==='transfer'&&!assigned.has(v.id))bad('Fahrzeug ohne Standorttransfer.');
}
