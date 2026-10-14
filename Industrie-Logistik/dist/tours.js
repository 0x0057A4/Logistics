import {ITEMS,VEHICLES} from './catalog.js';
const active=t=>!['complete','cancelled'].includes(t.status);
const owner=o=>o.kind==='logistics'?o.id:'company';
const cents=n=>Math.round(n*100)/100;
export function init(s){s.tours??=[];}
export function committedQty(s,orderId){return s.shipments.filter(sh=>sh.orderId===orderId&&['loading','transit','unloading'].includes(sh.status)).reduce((n,sh)=>n+sh.qty,0)+(s.tours||[]).filter(active).flatMap(t=>t.stops).filter(stop=>stop.orderId===orderId&&stop.status==='pending').reduce((n,stop)=>n+stop.qty,0)+(s.freights||[]).filter(f=>f.orderId===orderId&&!['complete','cancelled'].includes(f.status)&&f.deliveredAt==null).reduce((n,f)=>n+f.qty,0);}
export function handle(s,c,api){
 if(c.type==='cancelTour'){const t=(s.tours||[]).find(t=>t.id===c.id);if(!t||t.status!=='loading')return {ok:false,message:'Nur vor Abfahrt kann Sammeltour storniert werden.'};for(const stop of t.stops){api.inventory.release(stop.reservationKey);stop.status='cancelled';}release(s,t,api);t.status='cancelled';return {ok:true};}
 if(c.type!=='dispatchTour')return null;
 const v=s.vehicles.find(v=>v.id===c.vehicleId);if(!v||v.status!=='idle'||v.condition<15)return {ok:false,message:'Freies, gewartetes Fahrzeug benötigt.'};
 if(!Array.isArray(c.stops)||c.stops.length<2||c.stops.length>4||new Set(c.stops.map(x=>x?.orderId)).size!==c.stops.length)return {ok:false,message:'Zwei bis vier unterschiedliche Aufträge wählen.'};
 let volume=0,weight=0;for(const entry of c.stops){const o=s.orders.find(o=>o.id===entry.orderId);if(!o||o.status!=='active'||!Number.isInteger(entry.qty)||entry.qty<1||entry.qty>o.qty-o.delivered-committedQty(s,o.id))return {ok:false,message:'Stopp benötigt aktiven Auftrag und freie Restmenge.'};volume+=entry.qty*(ITEMS[o.item].volume||1);weight+=entry.qty*(ITEMS[o.item].weight||1);}
 if(volume>v.capacity||weight>(VEHICLES[v.type].weightCapacity||v.capacity*4))return {ok:false,message:'Gesamtladung überschreitet Volumen oder Gewicht.'};
 const id=api.id('tour'),stops=[];for(const [index,entry]of c.stops.entries()){const o=s.orders.find(o=>o.id===entry.orderId),reservationKey=`${id}:stop:${index}`;stops.push({orderId:o.id,item:o.item,qty:entry.qty,owner:owner(o),reservationKey,status:'pending',cargo:[],paid:false,distance:index===0?30:20});
  if(!api.inventory.reserve(o.item,entry.qty,v.site,reservationKey,owner(o))||s.reservations.filter(r=>r.job===reservationKey).some(r=>(s.batches.find(b=>b.id===r.batchId)?.quality||0)<o.quality)){for(const stop of stops)api.inventory.release(stop.reservationKey);return {ok:false,message:'Gesamttour benötigt passenden Bestand und Qualität für jeden Stopp.'};}}
 const total=stops.reduce((n,x)=>n+x.qty,0);s.tours??=[];s.tours.push({id,vehicleId:v.id,site:v.site,status:'loading',stops,stopIndex:0,remaining:2+Math.ceil(total/5),duration:2+Math.ceil(total/5),returnDistance:30,driver:null,worker:null,createdAt:s.t});v.status='tour';v.tour=id;v.shipment=null;api.log('tour',`Sammeltour mit ${stops.length} Stopps reserviert.`,[id,v.id]);return {ok:true,id};
}
function release(s,t,api){const v=s.vehicles.find(v=>v.id===t.vehicleId);if(v){v.status='idle';v.tour=null;v.shipment=null;}for(const b of s.buildings)if(b.task===t.id)b.task=null;api.workforce.release(`${t.id}:warehouse`);api.workforce.release(`${t.id}:driver`);t.worker=null;t.driver=null;}
function setPhase(t,status,minutes){t.status=status;t.remaining=minutes;t.duration=minutes;}
function cargoValid(s,stop){const batches=stop.cargo.map(id=>s.batches.find(b=>b.id===id));return batches.length>0&&batches.every(b=>b&&b.location==='vehicle'&&!b.blocked&&!b.locked&&b.owner===stop.owner&&b.item===stop.item)&&batches.reduce((n,b)=>n+b.qty,0)===stop.qty;}
export function step(s,api){for(const t of s.tours||[]){
 for(const [i,stop] of t.stops.entries())if(stop.paymentAt!=null&&s.t>=stop.paymentAt&&!stop.paid){const o=s.orders.find(o=>o.id===stop.orderId);if(api.book(`tour-payment:${t.id}:${i}`,stop.invoiceAmount,'Umsatz',`Sammeltour: ${o.customer}`,[t.id,o.id])){stop.paid=true;o.paid=cents(o.paid+stop.invoiceAmount);}}
 if(!active(t))continue;const v=s.vehicles.find(v=>v.id===t.vehicleId);if(!v)continue;
 const driver=api.workforce.acquire('driver',t.site,`${t.id}:driver`);if(!driver){t.blocked='Fahrpersonal oder Schicht fehlt';t.driver=null;continue;}t.driver=driver.id;
 if(t.status==='loading'){
  let dock=s.buildings.find(b=>b.type==='dock'&&b.site===t.site&&b.enabled&&b.condition>0&&b.task===t.id);dock??=s.buildings.find(b=>b.type==='dock'&&b.site===t.site&&b.enabled&&b.condition>0&&!b.task);if(!dock){t.blocked='Freie Laderampe fehlt';continue;}dock.task=t.id;t.dock=dock.id;
  const worker=api.workforce.acquire('warehouse',t.site,`${t.id}:warehouse`);if(!worker){t.blocked='Lagerpersonal fehlt';continue;}t.worker=worker.id;t.blocked=null;if(--t.remaining>0)continue;
  const allValid=t.stops.every(stop=>{const rs=s.reservations.filter(r=>r.job===stop.reservationKey);return rs.reduce((n,r)=>n+r.qty,0)===stop.qty&&rs.every(r=>{const b=s.batches.find(b=>b.id===r.batchId);return b&&!b.blocked&&!b.locked&&b.qty>=r.qty&&b.reserved>=r.qty&&b.owner===stop.owner&&b.item===stop.item;});});if(!allValid){t.blocked='Reservierte Gesamtladung gesperrt oder unvollständig';t.remaining=1;continue;}
  const cost=cents((t.stops.reduce((n,x)=>n+x.distance,0)+t.returnDistance)*VEHICLES[v.type].runningCost);if(s.money<cost){t.blocked='Fahrtkosten nicht gedeckt';t.remaining=1;continue;}
  // Alle Reservierungen vorab geprüft; synchrone Fahrzeugtransfers benötigen keinen Lagerplatz.
  for(const stop of t.stops){const cargo=api.inventory.transfer(stop.reservationKey,'vehicle',t.site);stop.cargo=cargo.map(b=>b.id);stop.materialCost=stop.owner==='company'?cents(cargo.reduce((n,b)=>n+b.qty*b.unitCost,0)):0;}
  api.book(`tour-trip:${t.id}`,-cost,'Transport','Mehrstoppige Sammeltour',[t.id,v.id]);t.transportCost=cost;t.departedAt=s.t;dock.task=null;api.workforce.release(`${t.id}:warehouse`);t.worker=null;setPhase(t,'transit',Math.ceil(t.stops[0].distance/VEHICLES[v.type].speed));continue;
 }
 t.blocked=null;if(--t.remaining>0)continue;
 if(t.status==='transit'){setPhase(t,'unloading',2+Math.ceil(t.stops[t.stopIndex].qty/10));continue;}
 if(t.status==='unloading'){
  const stop=t.stops[t.stopIndex],o=s.orders.find(o=>o.id===stop.orderId);if(!cargoValid(s,stop)){t.blocked='Rückruf oder beschädigte Fahrzeugladung';t.remaining=1;continue;}
  for(const id of stop.cargo){const b=s.batches.find(b=>b.id===id);api.inventory.remove(id,b.qty);}stop.status='delivered';stop.deliveredAt=s.t;stop.invoiceAmount=cents(stop.qty*o.price*(s.t>o.due?0.9:1));stop.paymentAt=s.t+60;o.delivered+=stop.qty;s.stats.delivered+=stop.qty;if(o.delivered>=o.qty){o.status='fulfilled';s.reputation=Math.min(100,s.reputation+3);}api.log('delivery',`Sammeltour: ${o.customer}, ${stop.qty} Stück zugestellt.`,[t.id,o.id]);
  t.stopIndex++;if(t.stopIndex<t.stops.length)setPhase(t,'transit',Math.ceil(t.stops[t.stopIndex].distance/VEHICLES[v.type].speed));else setPhase(t,'returning',Math.ceil(t.returnDistance/VEHICLES[v.type].speed));continue;
 }
 if(t.status==='returning'){t.status='complete';t.completedAt=s.t;v.condition=Math.max(0,v.condition-t.stops.length);release(s,t,api);}
}}
export function validate(s){const fail=m=>{throw new Error('Sammeltour beschädigt: '+m);};const assigned=new Set(),cargoIds=new Set();for(const t of s.tours||[]){
 if(typeof t.id!=='string'||!Array.isArray(t.stops)||t.stops.length<2||t.stops.length>4||!['loading','transit','unloading','returning','complete','cancelled'].includes(t.status)||!Number.isFinite(t.remaining)||t.remaining<0||!Number.isInteger(t.stopIndex)||t.stopIndex<0||t.stopIndex>t.stops.length||!s.sites.some(x=>x.id===t.site))fail('Grundwerte');
 const v=s.vehicles.find(v=>v.id===t.vehicleId);if(!v)fail('Fahrzeug fehlt');if(active(t)){if(v.status!=='tour'||v.tour!==t.id||assigned.has(v.id))fail('Fahrzeugzuweisung');assigned.add(v.id);}
 let volume=0,weight=0;const orderIds=new Set();for(const [i,stop]of t.stops.entries()){
 const o=s.orders.find(o=>o.id===stop.orderId);if(!o||orderIds.has(o.id)||stop.item!==o.item||stop.owner!==owner(o)||!Number.isInteger(stop.qty)||stop.qty<1||stop.qty>o.qty||!Array.isArray(stop.cargo)||typeof stop.paid!=='boolean'||!['pending','delivered','cancelled'].includes(stop.status)||!Number.isFinite(stop.distance)||stop.distance<=0)fail('Stopp');orderIds.add(o.id);volume+=stop.qty*(ITEMS[stop.item].volume||1);weight+=stop.qty*(ITEMS[stop.item].weight||1);
 if(stop.reservationKey!==`${t.id}:stop:${i}`)fail('Reservierungsschlüssel');
 if(t.status==='loading'&&s.reservations.filter(r=>r.job===stop.reservationKey).reduce((n,r)=>n+r.qty,0)!==stop.qty)fail('Reservierung fehlt');
 if(stop.status==='pending'&&['transit','unloading'].includes(t.status)){let total=0;for(const id of stop.cargo){const b=s.batches.find(b=>b.id===id);if(cargoIds.has(id)||!b||b.location!=='vehicle'||b.owner!==stop.owner||b.item!==stop.item)fail('Ladung');cargoIds.add(id);total+=b.qty;}if(total!==stop.qty)fail('Ladungsmenge');}
 if(stop.status==='delivered'&&(!Number.isFinite(stop.paymentAt)||!Number.isFinite(stop.invoiceAmount)||stop.invoiceAmount<0||!Number.isFinite(stop.deliveredAt)))fail('Rechnung');
 }
 if(volume>v.capacity||weight>(VEHICLES[v.type].weightCapacity||v.capacity*4))fail('Kapazität');if(['transit','unloading'].includes(t.status)&&t.stopIndex>=t.stops.length)fail('Stoppindex');
 }for(const v of s.vehicles)if(v.status==='tour'&&!assigned.has(v.id))fail('Fahrzeug ohne Tour');return true;}
