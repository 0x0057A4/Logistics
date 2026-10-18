import {ITEMS,VEHICLES} from './catalog.js';
import {travelMinutes} from './disruptions.js'; // 0.16 S1: Fahrtdauer beim Start inkl. Wetter/Stau
import {returnSources} from './service.js';
import {onShift} from './workforce.js';
import {acquireForklift,releaseForklift,useForklift,forkliftKey,forkItem} from './yard.js';
import {FORK_ROLES,forkStep,afterStep} from './workforce.js';
const active=t=>!['complete','cancelled'].includes(t.status);
// Mehrwertdienst (vas, 0.15 S3): Fertigware gehört dem Auftrag wie bei Fremdlogistik.
const owner=o=>o.kind==='logistics'||o.kind==='vas'?o.id:'company';
const cents=n=>Math.round(n*100)/100;
export function init(s){s.tours??=[];}
// W3c-S1: Flughafen-Zubringer vor Übergabe binden die Menge ebenfalls (gleiche Regel wie airexport.shuttleQty, ohne Import).
const airQty=(s,orderId)=>{let n=0;for(const sh of s.airShuttles||[])if(sh.status==='loading'||sh.status==='transit'||(sh.status==='handover'&&sh.deliveredAt==null))for(const x of sh.orders)if(x.orderId===orderId)n+=x.qty;return n;};
export function committedQty(s,orderId){return airQty(s,orderId)+s.shipments.filter(sh=>sh.orderId===orderId&&['loading','transit','unloading'].includes(sh.status)).reduce((n,sh)=>n+sh.qty,0)+(s.tours||[]).filter(active).flatMap(t=>t.stops).filter(stop=>stop.orderId===orderId&&stop.status==='pending').reduce((n,stop)=>n+stop.qty,0)+(s.freights||[]).filter(f=>f.orderId===orderId&&!['complete','cancelled'].includes(f.status)&&f.deliveredAt==null).reduce((n,f)=>n+f.qty,0);}
// Isolierte Personalprognose: identische Müdigkeits-/Schichtregeln wie workforce.step,
// aber ohne Buchungen, Mutationen und unbekannte Konkurrenz um Rampe/Lagerpersonal.
function driverForecast(s,site,workMinutes){
 const assumption='Freie Rampe und Lagerpersonal; keine konkurrierenden Aufgaben oder neuen Störungen.';
 const pool=(s.workers||[]).filter(w=>w.role==='driver'&&w.site===site&&!w.task&&!w.training&&!w.relocation).map(w=>({...w}));
 if(!pool.length)return {elapsedMinutes:null,waitMinutes:null,breakMinutes:0,shiftMinutes:0,assumption,reason:'Kein ungebundenes Fahrpersonal am Standort.'};
 let remaining=workMinutes,elapsedMinutes=0,waitMinutes=0,breakMinutes=0,shiftMinutes=0,assigned=null;
 while(remaining>0&&elapsedMinutes<20160){
  elapsedMinutes++;const now=s.t+elapsedMinutes;
  for(const w of pool){
   if(!onShift(w,now)){if(assigned===w.id)assigned=null;w.fatigue=Math.max(0,w.fatigue-0.5);continue;}
   if(w.fatigue>=80&&!w.breakRemaining){w.breakRemaining=30;if(assigned===w.id)assigned=null;}
   if(w.breakRemaining>0){w.breakRemaining--;w.fatigue=Math.max(0,w.fatigue-1.2);continue;}
   w.fatigue=Math.max(0,Math.min(100,w.fatigue+(assigned===w.id?0.18:-0.4)));
  }
  let driver=pool.find(w=>w.id===assigned);
  if(driver&&(!onShift(driver,now)||driver.breakRemaining>0||driver.fatigue>=80)){assigned=null;driver=null;}
  driver??=pool.find(w=>onShift(w,now)&&!(w.breakRemaining>0)&&w.fatigue<80);
  if(driver){assigned=driver.id;remaining--;}
  else {waitMinutes++;if(pool.some(w=>onShift(w,now)))breakMinutes++;else shiftMinutes++;}
 }
 return {elapsedMinutes:remaining?null:elapsedMinutes,waitMinutes:remaining?null:waitMinutes,breakMinutes,shiftMinutes,assumption};
}
// Prognose enthält reale Fahr-/Arbeitsminuten. Schicht- und Ressourcenwartezeiten
// bleiben zustandsabhängig und werden während der Tour als blocked ausgewiesen.
export function planTour(s,vehicleId,entries){
 const v=s.vehicles.find(v=>v.id===vehicleId),fail=message=>({ok:false,message});
 if(!v||v.status!=='idle'||v.condition<15)return fail('Freies, gewartetes Fahrzeug benötigt.');
 if(!Array.isArray(entries)||entries.length<2||entries.length>4||new Set(entries.map(x=>x?.orderId)).size!==entries.length)return fail('Zwei bis vier unterschiedliche Aufträge wählen.');
 let volume=0,weight=0,total=0;const stops=[],type=VEHICLES[v.type];
 for(const entry of entries){
  const o=s.orders.find(o=>o.id===entry.orderId),returnQty=entry.returnQty??0;
  if(!o||o.status!=='active'||!Number.isInteger(entry.qty)||entry.qty<1||entry.qty>o.qty-o.delivered-committedQty(s,o.id))return fail('Stopp benötigt aktiven Auftrag und freie Restmenge.');
  if(!Number.isInteger(returnQty)||returnQty<0)return fail('Rückladung benötigt ganze, nicht negative Menge.');
  if(returnQty&&(o.kind==='logistics'||o.kind==='vas'||!returnSources(s,o.id,returnQty)))return fail('Rückladung benötigt eigene, bereits gelieferte und noch nicht retournierte Ware.');
  if(o.airExport)return fail('Luftexport: Pakete per Flughafen-Zubringer zum Frachtterminal bringen.');
  if(ITEMS[o.item].cold&&!type.cold)return fail('Kühlware benötigt gekühltes Fahrzeug.');
  // W3-S2: Fremdware nur am Zustellstandort (wie contracts.deliverySiteOf; Import dort wäre ein Modulzyklus).
  if(o.kind==='logistics'&&(o.deliverySite??o.site)!==undefined&&(o.deliverySite??o.site)!==v.site)return fail('Zustellgebiet gehört zu einem anderen Standort. Ware per Linie dorthin bringen.');
  volume+=entry.qty*(ITEMS[o.item].volume||1);weight+=entry.qty*(ITEMS[o.item].weight||1);total+=entry.qty;
  stops.push({orderId:o.id,item:o.item,qty:entry.qty,returnQty,distance:stops.length?20:30});
 }
 const capacity=()=>volume<=v.capacity&&weight<=(type.weightCapacity||v.capacity*4);
 if(!capacity())return fail('Gesamtladung überschreitet Volumen oder Gewicht.');
 const initialVolume=volume,initialWeight=weight;let minutes=2+Math.ceil(total/5),returnTotal=0;
 for(const stop of stops){
  volume+=(stop.returnQty-stop.qty)*(ITEMS[stop.item].volume||1);weight+=(stop.returnQty-stop.qty)*(ITEMS[stop.item].weight||1);
  if(!capacity())return fail('Rückladung überschreitet Volumen oder Gewicht nach Stopp.');
  stop.volume=volume;stop.weight=weight;stop.minutes=Math.ceil(stop.distance/type.speed)+2+Math.ceil(stop.qty/10)+(stop.returnQty?2+Math.ceil(stop.returnQty/5):0);minutes+=stop.minutes;returnTotal+=stop.returnQty;
 }
 const distance=stops.reduce((n,p)=>n+p.distance,30);minutes+=Math.ceil(30/type.speed)+(returnTotal?2+Math.ceil(returnTotal/5):0);
 return {ok:true,stops,minutes,distance,cost:cents(distance*type.runningCost),initialVolume,initialWeight,driverForecast:driverForecast(s,v.site,minutes)};
}
export function handle(s,c,api){
 if(c.type==='cancelTour'){const t=(s.tours||[]).find(t=>t.id===c.id);if(!t||t.status!=='loading')return {ok:false,message:'Nur vor Abfahrt kann Sammeltour storniert werden.'};for(const stop of t.stops){api.inventory.release(stop.reservationKey);stop.status='cancelled';delete stop.returnId;}s.returns=(s.returns||[]).filter(r=>r.tourId!==t.id);release(s,t,api);t.status='cancelled';return {ok:true};}
 if(c.type!=='dispatchTour')return null;
 const plan=planTour(s,c.vehicleId,c.stops);if(!plan.ok)return plan;const v=s.vehicles.find(v=>v.id===c.vehicleId);
 const id=api.id('tour'),stops=[];for(const [index,entry]of c.stops.entries()){const o=s.orders.find(o=>o.id===entry.orderId),reservationKey=`${id}:stop:${index}`;stops.push({orderId:o.id,item:o.item,qty:entry.qty,owner:owner(o),reservationKey,status:'pending',cargo:[],paid:false,distance:index===0?30:20});
  if(!api.inventory.reserve(o.item,entry.qty,v.site,reservationKey,owner(o))||s.reservations.filter(r=>r.job===reservationKey).some(r=>(s.batches.find(b=>b.id===r.batchId)?.quality||0)<o.quality)){for(const stop of stops)api.inventory.release(stop.reservationKey);return {ok:false,message:'Gesamttour benötigt passenden Bestand und Qualität für jeden Stopp.'};}}
 s.returns??=[];
 for(const [index,entry] of c.stops.entries())if(entry.returnQty){
  const stop=stops[index],sources=returnSources(s,stop.orderId,entry.returnQty),returnId=api.id('return');stop.returnId=returnId;
  s.returns.push({id:returnId,tourId:id,orderId:stop.orderId,item:stop.item,qty:entry.returnQty,site:v.site,vehicleId:v.id,status:'scheduled',remaining:0,sources,cargo:[],refunded:false,refund:cents(sources.reduce((n,x)=>n+x.qty*x.unitPrice,0)),createdAt:s.t,blocked:null});
 }
 const total=stops.reduce((n,x)=>n+x.qty,0);s.tours??=[];s.tours.push({id,vehicleId:v.id,site:v.site,status:'loading',stops,stopIndex:0,remaining:2+Math.ceil(total/5),duration:2+Math.ceil(total/5),returnDistance:30,driver:null,worker:null,createdAt:s.t,plannedMinutes:plan.minutes,plannedCost:plan.cost});v.status='tour';v.tour=id;v.shipment=null;api.log('tour',`Sammeltour mit ${stops.length} Stopps reserviert.`,[id,v.id]);return {ok:true,id};
}
function release(s,t,api){const v=s.vehicles.find(v=>v.id===t.vehicleId);if(v){v.status='idle';v.tour=null;v.shipment=null;}for(const b of s.buildings)if(b.task===t.id)b.task=null;api.workforce.release(`${t.id}:warehouse`);api.workforce.release(`${t.id}:driver`);releaseForklift(s,forkliftKey(t.id));t.worker=null;t.driver=null;}
function setPhase(t,status,minutes){t.status=status;t.remaining=minutes;t.duration=minutes;}
function nextStop(t,v,s){t.stopIndex++;if(t.stopIndex<t.stops.length)setPhase(t,'transit',travelMinutes(s,t.site,Math.ceil(t.stops[t.stopIndex].distance/VEHICLES[v.type].speed)));else setPhase(t,'returning',travelMinutes(s,t.site,Math.ceil(t.returnDistance/VEHICLES[v.type].speed)));}
function cargoValid(s,stop){const batches=stop.cargo.map(id=>s.batches.find(b=>b.id===id));return batches.length>0&&batches.every(b=>b&&b.location==='vehicle'&&!b.blocked&&!b.locked&&b.owner===stop.owner&&b.item===stop.item)&&batches.reduce((n,b)=>n+b.qty,0)===stop.qty;}
export function step(s,api){for(const t of s.tours||[]){
 for(const [i,stop] of t.stops.entries())if(stop.paymentAt!=null&&s.t>=stop.paymentAt&&!stop.paid){const o=s.orders.find(o=>o.id===stop.orderId);if(api.book(`tour-payment:${t.id}:${i}`,stop.invoiceAmount,'Umsatz',`Sammeltour: ${o.customer}`,[t.id,o.id])){stop.paid=true;o.paid=cents(o.paid+stop.invoiceAmount);}}
 if(!active(t))continue;const v=s.vehicles.find(v=>v.id===t.vehicleId);if(!v)continue;
 const pallet=t.status==='loading'&&t.stops.some(x=>forkItem(x.item)); // 0.15 S2: Palette oder Sperrgut
 const driver=api.workforce.acquire('driver',t.site,`${t.id}:driver`);if(!driver){t.blocked='Fahrpersonal oder Schicht fehlt';t.driver=null;if(pallet)releaseForklift(s,forkliftKey(t.id));continue;}t.driver=driver.id;
 if(t.status==='loading'){
  let dock=s.buildings.find(b=>b.type==='dock'&&b.site===t.site&&b.enabled&&b.condition>0&&b.task===t.id);dock??=s.buildings.find(b=>b.type==='dock'&&b.site===t.site&&b.enabled&&b.condition>0&&!b.task);if(!dock){t.blocked='Freie Laderampe fehlt';continue;}dock.task=t.id;t.dock=dock.id;
  // Paletten (W2-S2): Stapler zuerst, dann Lagerkraft (wie transport.js).
  // QS-W2-01: Ladezeit erfüllt → Abfahrt ohne Stapler/Lagerkraft prüfen, kein Akkuverbrauch beim Warten.
  if(t.loadDone){if(pallet)releaseForklift(s,forkliftKey(t.id));api.workforce.release(`${t.id}:warehouse`);t.worker=null;}else{
  let fork=null;if(pallet){const f=acquireForklift(s,t.site,forkliftKey(t.id));if(!f.forklift){api.workforce.release(`${t.id}:warehouse`);t.worker=null;t.blocked=f.reason;continue;}fork=f.forklift;}
  const worker=pallet?api.workforce.acquireAny(FORK_ROLES,t.site,`${t.id}:warehouse`):api.workforce.acquire('warehouse',t.site,`${t.id}:warehouse`);if(!worker){t.blocked='Lagerpersonal fehlt';if(fork)releaseForklift(s,forkliftKey(t.id));continue;}t.worker=worker.id;t.blocked=null;if(fork)useForklift(s,fork);t.remaining=afterStep(t.remaining,pallet?forkStep(worker,s.t):1);if(t.remaining>0)continue;t.loadDone=true;}
  const allValid=t.stops.every(stop=>{const rs=s.reservations.filter(r=>r.job===stop.reservationKey);return rs.reduce((n,r)=>n+r.qty,0)===stop.qty&&rs.every(r=>{const b=s.batches.find(b=>b.id===r.batchId);return b&&!b.blocked&&!b.locked&&b.qty>=r.qty&&b.reserved>=r.qty&&b.owner===stop.owner&&b.item===stop.item;});});if(!allValid){t.blocked='Reservierte Gesamtladung gesperrt oder unvollständig';t.remaining=1;/* QS-W2-01 */if(pallet)releaseForklift(s,forkliftKey(t.id));api.workforce.release(`${t.id}:warehouse`);continue;}
  const cost=cents((t.stops.reduce((n,x)=>n+x.distance,0)+t.returnDistance)*VEHICLES[v.type].runningCost);if(s.money<cost){t.blocked='Fahrtkosten nicht gedeckt';t.remaining=1;/* QS-W2-01 */if(pallet)releaseForklift(s,forkliftKey(t.id));api.workforce.release(`${t.id}:warehouse`);continue;}
  // Alle Reservierungen vorab geprüft; synchrone Fahrzeugtransfers benötigen keinen Lagerplatz.
  for(const stop of t.stops){const cargo=api.inventory.transfer(stop.reservationKey,'vehicle',t.site);stop.cargo=cargo.map(b=>b.id);stop.materialCost=stop.owner==='company'?cents(cargo.reduce((n,b)=>n+b.qty*b.unitCost,0)):0;}
  delete t.loadDone;api.book(`tour-trip:${t.id}`,-cost,'Transport','Mehrstoppige Sammeltour',[t.id,v.id]);t.transportCost=cost;t.departedAt=s.t;{const k=dock.task;for(const b of s.buildings)if(b.task===k)b.task=null;};api.workforce.release(`${t.id}:warehouse`);if(pallet)releaseForklift(s,forkliftKey(t.id));t.worker=null;setPhase(t,'transit',travelMinutes(s,t.site,Math.ceil(t.stops[0].distance/VEHICLES[v.type].speed)));continue;
 }
 if(t.status==='returnUnloading'){
  const returns=(s.returns||[]).filter(r=>r.tourId===t.id&&r.status==='onTour');
  let dock=s.buildings.find(b=>b.type==='dock'&&b.site===t.site&&b.enabled&&b.condition>0&&b.task===t.id);dock??=s.buildings.find(b=>b.type==='dock'&&b.site===t.site&&b.enabled&&b.condition>0&&!b.task);
  if(!dock){t.blocked='Freie Laderampe für Rückladung fehlt';continue;}dock.task=t.id;t.dock=dock.id;
  const worker=api.workforce.acquire('warehouse',t.site,`${t.id}:warehouse`);if(!worker){t.blocked='Lagerpersonal für Rückladung fehlt';continue;}t.worker=worker.id;
  if(api.inventory.free(t.site)<returns.reduce((n,r)=>n+r.qty,0)){t.blocked='Quarantänelager voll';continue;}
  t.blocked=null;if(--t.remaining>0)continue;
  for(const r of returns){for(const id of r.cargo)api.inventory.move(id,'quarantine');r.status='inspection';r.remaining=3*r.qty;r.receivedAt=s.t;}
  t.status='complete';t.completedAt=s.t;v.condition=Math.max(0,v.condition-t.stops.length);release(s,t,api);continue;
 }
 t.blocked=null;if(--t.remaining>0)continue;
 if(t.status==='transit'){setPhase(t,'unloading',2+Math.ceil(t.stops[t.stopIndex].qty/10));continue;}
 if(t.status==='unloading'){
  const stop=t.stops[t.stopIndex],o=s.orders.find(o=>o.id===stop.orderId);if(!cargoValid(s,stop)){t.blocked='Rückruf oder beschädigte Fahrzeugladung';t.remaining=1;continue;}
  for(const id of stop.cargo){const b=s.batches.find(b=>b.id===id);api.inventory.remove(id,b.qty);}stop.status='delivered';stop.deliveredAt=s.t;stop.invoiceAmount=cents(stop.qty*o.price*(s.t>o.due?0.9:1));stop.paymentAt=s.t+60;o.delivered+=stop.qty;s.stats.delivered+=stop.qty;if(o.delivered>=o.qty){o.status='fulfilled';s.reputation=Math.min(100,s.reputation+3);}api.log('delivery',`Sammeltour: ${o.customer}, ${stop.qty} Stück zugestellt.`,[t.id,o.id]);
  const r=(s.returns||[]).find(r=>r.id===stop.returnId);if(r)setPhase(t,'collecting',2+Math.ceil(r.qty/5));else nextStop(t,v,s);continue;
 }
 if(t.status==='collecting'){
  const stop=t.stops[t.stopIndex],r=s.returns.find(r=>r.id===stop.returnId);
  if(!r||r.status!=='scheduled'){t.blocked='Rückladung bereits aufgenommen oder nicht geplant';t.remaining=1;continue;}
  for(const source of r.sources){const b=api.inventory.add({item:r.item,qty:source.qty,site:r.site,location:'vehicle',quality:45,unitCost:source.unitPrice,parents:source.parents});r.cargo.push(b.id);}
  r.status='onTour';r.collectedAt=s.t;api.log('service',`Rückladung: ${r.qty} Stück aufgenommen.`,[t.id,r.id]);nextStop(t,v,s);continue;
 }
 if(t.status==='returning'){
  const qty=(s.returns||[]).filter(r=>r.tourId===t.id&&r.status==='onTour').reduce((n,r)=>n+r.qty,0);if(qty){setPhase(t,'returnUnloading',2+Math.ceil(qty/5));continue;}
  t.status='complete';t.completedAt=s.t;v.condition=Math.max(0,v.condition-t.stops.length);release(s,t,api);}
}}
export function validate(s){const fail=m=>{throw new Error('Sammeltour beschädigt: '+m);};const assigned=new Set(),cargoIds=new Set();for(const t of s.tours||[]){
 if(typeof t.id!=='string'||!Array.isArray(t.stops)||t.stops.length<2||t.stops.length>4||!['loading','transit','unloading','collecting','returning','returnUnloading','complete','cancelled'].includes(t.status)||!Number.isFinite(t.remaining)||t.remaining<0||!Number.isInteger(t.stopIndex)||t.stopIndex<0||t.stopIndex>t.stops.length||!s.sites.some(x=>x.id===t.site))fail('Grundwerte');
 const v=s.vehicles.find(v=>v.id===t.vehicleId);if(!v)fail('Fahrzeug fehlt');if(active(t)){if(v.status!=='tour'||v.tour!==t.id||assigned.has(v.id))fail('Fahrzeugzuweisung');assigned.add(v.id);}
 if(t.status==='loading'&&t.stopIndex!==0||['returning','returnUnloading','complete'].includes(t.status)&&t.stopIndex!==t.stops.length)fail('Phasenindex');
 if(!Number.isFinite(t.returnDistance)||t.returnDistance<=0)fail('Rückweg');
 let volume=0,weight=0;const orderIds=new Set();for(const [i,stop]of t.stops.entries()){
 const o=s.orders.find(o=>o.id===stop.orderId);if(!o||orderIds.has(o.id)||stop.item!==o.item||stop.owner!==owner(o)||!Number.isInteger(stop.qty)||stop.qty<1||stop.qty>o.qty||!Array.isArray(stop.cargo)||typeof stop.paid!=='boolean'||!['pending','delivered','cancelled'].includes(stop.status)||!Number.isFinite(stop.distance)||stop.distance<=0)fail('Stopp');orderIds.add(o.id);volume+=stop.qty*(ITEMS[stop.item].volume||1);weight+=stop.qty*(ITEMS[stop.item].weight||1);
 const expected=t.status==='cancelled'?'cancelled':t.status==='loading'?'pending':['returning','returnUnloading','complete'].includes(t.status)?'delivered':i<t.stopIndex||t.status==='collecting'&&i===t.stopIndex?'delivered':'pending';
 if(stop.status!==expected)fail('Stoppfolge');
 if(stop.reservationKey!==`${t.id}:stop:${i}`)fail('Reservierungsschlüssel');
 if(t.status==='loading'&&s.reservations.filter(r=>r.job===stop.reservationKey).reduce((n,r)=>n+r.qty,0)!==stop.qty)fail('Reservierung fehlt');
 if(stop.status==='pending'&&['transit','unloading','collecting'].includes(t.status)){let total=0;for(const id of stop.cargo){const b=s.batches.find(b=>b.id===id);if(cargoIds.has(id)||!b||b.location!=='vehicle'||b.owner!==stop.owner||b.item!==stop.item)fail('Ladung');cargoIds.add(id);total+=b.qty;}if(total!==stop.qty)fail('Ladungsmenge');}
 if(stop.status==='delivered'&&(!Number.isFinite(stop.paymentAt)||!Number.isFinite(stop.invoiceAmount)||stop.invoiceAmount<0||!Number.isFinite(stop.deliveredAt)))fail('Rechnung');
 }
 if(volume>v.capacity||weight>(VEHICLES[v.type].weightCapacity||v.capacity*4))fail('Kapazität');
 for(const stop of t.stops){
  const r=(s.returns||[]).find(r=>r.id===stop.returnId);
  if(stop.returnId&&(!r||r.tourId!==t.id||r.orderId!==stop.orderId||r.item!==stop.item||r.vehicleId!==v.id))fail('Rückladung');
  if(stop.returnId&&active(t)&&((stop.status==='pending'&&r.status!=='scheduled')||(stop.status==='delivered'&&r.status==='scheduled'&&!(t.status==='collecting'&&t.stops[t.stopIndex]===stop))))fail('Rückladungsphase');
  if(r&&active(t)&&stop.status==='delivered'&&!(t.status==='collecting'&&t.stops[t.stopIndex]===stop)&&r.status!=='onTour')fail('Aufgenommene Rückladung fehlt');
  volume+=((r?.qty||0)-stop.qty)*(ITEMS[stop.item].volume||1);weight+=((r?.qty||0)-stop.qty)*(ITEMS[stop.item].weight||1);
  if(volume>v.capacity||weight>(VEHICLES[v.type].weightCapacity||v.capacity*4))fail('Rückladungskapazität');
 }
if(t.status==='collecting'&&!(s.returns||[]).some(r=>r.id===t.stops[t.stopIndex]?.returnId&&r.status==='scheduled'))fail('Abholung ohne geplante Retoure');
if(t.status==='returnUnloading'&&!(s.returns||[]).some(r=>r.tourId===t.id&&r.status==='onTour'))fail('Entladung ohne Retoure');
if(['transit','unloading','collecting'].includes(t.status)&&t.stopIndex>=t.stops.length)fail('Stoppindex');
 }for(const v of s.vehicles)if(v.status==='tour'&&!assigned.has(v.id))fail('Fahrzeug ohne Tour');return true;}
