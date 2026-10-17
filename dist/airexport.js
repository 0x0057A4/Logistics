// Luftexport zum fiktiven Flughafen-Frachtterminal (A08+A07, Welle 3c). Schnittstelle docs/SCHNITTSTELLEN-0.14-W3c.md (W3c-S1).
// Vertrag unit 'air' (contracts.js): Pakete kommen wie bei Paketverträgen im Hof an, werden sortiert (inbound → stock) und
// müssen vor Annahmeschluss (Flug − cutoff) am Frachtterminal AIRPORT sein. Aufträge: item 'parcel', airExport:true,
// deliverySite = Annahme-Hub, flightT = gebuchter Flug (absolute Spielminute), due = Annahmeschluss dieses Flugs.
// Zubringer {id,vehicleId,site,flight,status,orders:[{orderId,qty,flightT}],qty,cargo,remaining,duration,distance,cost,…}:
//  loading   Dock + Lagerkraft am Hub, 2 + ceil(Menge/20) Minuten. Danach Abfahrt sofort: Fahrpersonal + Kasse ≥ Fahrtkosten,
//            Reservierung → Fahrzeug. Wartend (Personal/Kasse/Ladung) bleibt weder Dock noch Lagerkraft gebunden (QS-W2-01).
//  transit   ceil(Distanz / Fahrzeuggeschwindigkeit) mit Fahrpersonal.
//  handover  Übergabe am Terminal (2 + ceil(Menge/20) Min., Terminalpersonal) = Zustellung: Ware verlässt das Unternehmen,
//            o.delivered, Rechnung und Zahlung sofort und genau einmal (Buchung air:<id>, Umsatz). Übergabe nach
//            Annahmeschluss: Ware liegt am Terminal bis zum nächsten Flug, Lagergeld air-storage:<id> (klein, Pflicht).
//  returning leer zurück, gleiche Dauer; complete → Fahrzeug frei, Zustand −2.
// Verpasster Flug: Sobald der Annahmeschluss eines Auftrags vorbei ist und noch Pakete offen sind (im Hub, auf dem Zubringer
// oder noch nicht angekommen), Strafe offene Menge × penaltyMissed genau einmal je Auftrag und Flug
// (air-missed:<orderId>:<flightT>, Pflichtbuchung), danach Umbuchung auf den nächsten Flug.
// Fahrzeug exklusiv: v.status='airshuttle', v.airShuttle=Zubringer-ID bis zur Rückkehr. Storno (cancelAirShuttle) und Wartung
// (transport.maintainVehicle/serviceVehicleExternal) nur vor Abfahrt: Reservierung, Dock und Personal frei, Ware bleibt im Lager.
// Fahrtkosten distance × 2 × runningCost, Buchung air-trip:<id>, Kategorie Transport.
// Befehle: dispatchAirShuttle{vehicleId, flight (Minute des Tages aus contract.flights), departAt? (absolute Abflugminute), site?}
//  → {ok,id,qty,cost,flight (absolut),cutoffAt}; lädt Luftaufträge des Standorts mit flightT ≤ Flug (früheste zuerst) bis Kapazität.
//  cancelAirShuttle{id} nur vor Abfahrt.
// Modul importiert bewusst weder contracts.js noch linehaul.js (contracts.js importiert AIRPORT/nextFlight von hier).
import {ITEMS,VEHICLES} from './catalog.js';
import {UNLOAD_BASE} from './workforce.js';

/** Fester Zielknoten (fiktiv, kein kaufbarer Standort). Koordinaten im Standortnetz (km wie sites[].x/y). */
export const AIRPORT=Object.freeze({id:'airport',name:'Frachtterminal Flughafen Heidmoor',short:'Heidmoor',x:30,y:-38});
/** Spielwerte Zubringer. vehicles: zulässige Fahrzeugtypen; storagePerParcel: Lagergeld je Paket am Terminal bei verpasstem Flug. */
export const AIR=Object.freeze({vehicles:Object.freeze(['truck','van']),minCondition:15,base:2,storagePerParcel:0.1,keep:2880});
export const WAIT=Object.freeze({dock:'Kein freies Dock',staff:'Keine Lagerkraft',driver:'Kein Fahrpersonal',cash:'Kasse reicht nicht für Fahrtkosten',cargo:'Ladung gesperrt oder unvollständig'});
export const STATUSES=Object.freeze(['loading','transit','handover','returning','complete','cancelled']);
const ACTIVE=new Set(['loading','transit','handover','returning']);
const cents=n=>Math.round(n*100)/100;
const clock=t=>{const m=((t%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
const key=(sh,role)=>`${sh.id}:${role}`;

export const isAirOrder=o=>o?.airExport===true;
/** Straßendistanz Standort → Frachtterminal in km (wie Standorttransfer: mindestens 15 km). */
export function airportDistance(s,siteId){const a=s.sites.find(x=>x.id===siteId);return a?Math.max(15,Math.round(Math.hypot(AIRPORT.x-a.x,AIRPORT.y-a.y))):null;}
/** Frühester Flug (absolute Spielminute) mit Annahmeschluss ≥ from. flights: Minuten des Tages. */
export function nextFlight(flights,cutoff,from){
 let best=null;const day=from-(((from%1440)+1440)%1440);
 for(const m of flights){let t=day+m;while(t-cutoff<from)t+=1440;if(best===null||t<best)best=t;}
 return best;
}
/** Handlingminuten beim Beladen bzw. bei der Übergabe. */
export const handlingMinutes=qty=>AIR.base+Math.ceil(qty/UNLOAD_BASE);
export const tripCost=(v,distance)=>cents(distance*2*VEHICLES[v.type].runningCost);
const weightCap=v=>{const spec=VEHICLES[v.type];return spec.weightCapacity||spec.maxWeight||v.capacity*4;};
/** Zusätzliche Pakete bei bereits geladener Menge (Volumen/Gewicht wie transport.maxLoad). */
export function room(v,used=0){
 const it=ITEMS.parcel,spec=VEHICLES[v?.type];if(!it||!spec)return 0;
 const fits=n=>(used+n)*(it.volume||1)<=v.capacity+1e-9&&(used+n)*(it.weight||1)<=weightCap(v)+1e-9;
 let n=Math.max(0,Math.floor(Math.min(v.capacity/(it.volume||1),weightCap(v)/(it.weight||1))+1e-9)-used);
 while(n>0&&!fits(n))n--;while(fits(n+1))n++;return n;
}
const contractOf=(s,o)=>s.contracts?.find(k=>k.id===o.contractId);
/** Flugplan (Minuten des Tages, Annahmeschluss) aller angenommenen Luftverträge eines Standorts. Nur lesend (UI/Assistent). */
export function flightsAt(s,site){
 const out=[];for(const k of s.contracts||[])if(k.unit==='air'&&k.status!=='offer'&&k.site===site)for(const m of k.flights)out.push({contractId:k.id,minute:m,cutoff:k.cutoff});
 return out;
}
/** Nächste Abflüge eines Standorts ab from (absolute Minute) mit Annahmeschluss ≥ from. Nur lesend. */
export function upcomingFlights(s,site,from=s.t){
 const seen=new Map();for(const f of flightsAt(s,site)){const t=nextFlight([f.minute],f.cutoff,from);const c=t-f.cutoff;if(!seen.has(t)||seen.get(t).cutoffAt>c)seen.set(t,{flight:t,cutoffAt:c});}
 return [...seen.values()].sort((a,b)=>a.flight-b.flight);
}
/** In Zubringern gebundene Menge eines Auftrags (vor Übergabe). tours.committedQty nutzt dieselbe Regel. */
export function shuttleQty(s,orderId){let n=0;for(const sh of s.airShuttles||[])if(sh.status==='loading'||sh.status==='transit'||(sh.status==='handover'&&sh.deliveredAt==null))for(const x of sh.orders)if(x.orderId===orderId)n+=x.qty;return n;}
/** Laufender Zubringer eines Fahrzeugs vor Abfahrt (für Wartung aus transport.js); sonst null. */
export function loadingAirShuttle(s,vehicleId){return (s.airShuttles||[]).find(x=>x.vehicleId===vehicleId&&x.status==='loading')||null;}

export function init(s){s.airShuttles??=[];}

export function handle(s,c,api){
 if(c.type==='dispatchAirShuttle')return dispatch(s,c,api);
 if(c.type==='cancelAirShuttle'){
  const sh=(s.airShuttles||[]).find(x=>x.id===c.id);if(!sh||sh.status!=='loading')return {ok:false,message:'Nur ein noch nicht abgefahrener Zubringer kann storniert werden.'};
  abortAirShuttle(s,api,sh,'Storno');return {ok:true};
 }
 return null;
}

const mod=t=>((t%1440)+1440)%1440;
/** Annahmeschluss (absolut) eines Flugs am Standort: strengster cutoff der passenden Luftverträge. */
function cutoffOf(s,site,flight){let c=null;for(const f of flightsAt(s,site))if(f.minute===mod(flight)&&(c===null||f.cutoff>c))c=f.cutoff;return c===null?null:flight-c;}
/** Befehlsform (A01/Assistent): flight = Minute des Tages (0–1439) aus contract.flights, departAt = absolute Abflugminute.
 *  Nur departAt (oder flight ≥ 1440, absolut) → dieser Abflug. Nur flight → nächster Abflug mit Annahmeschluss ≥ jetzt.
 *  Beide → müssen zusammenpassen. Rückgabe absolute Minute oder Fehlermeldung. */
function resolveFlight(s,site,c){
 const plan=flightsAt(s,site);if(!plan.length)return 'Kein Luftexportvertrag an diesem Standort.';
 let abs=null;
 if(c.departAt!==undefined){if(!Number.isSafeInteger(c.departAt))return 'Abflugzeit ungültig.';abs=c.departAt;
  if(c.flight!==undefined&&!(c.flight===abs||c.flight===mod(abs)))return 'Flug und Abflugzeit passen nicht zusammen.';}
 else if(Number.isSafeInteger(c.flight)&&c.flight>=1440)abs=c.flight;
 else if(Number.isInteger(c.flight)&&c.flight>=0){const m=plan.filter(f=>f.minute===c.flight);if(!m.length)return 'Zu dieser Zeit startet kein Luftfrachtflug dieses Standorts.';abs=Math.min(...m.map(f=>nextFlight([f.minute],f.cutoff,s.t)));}
 else return 'Flug wählen (Minute des Tages oder Abflugzeit).';
 if(abs<=s.t)return 'Flug wählen (Abflug in der Zukunft).';
 if(!plan.some(f=>f.minute===mod(abs)))return 'Zu dieser Zeit startet kein Luftfrachtflug dieses Standorts.';
 return abs;
}
function dispatch(s,c,api){
 const v=s.vehicles.find(x=>x.id===c.vehicleId);
 if(!v)return {ok:false,message:'Fahrzeug fehlt.'};
 if(!AIR.vehicles.includes(v.type))return {ok:false,message:'Flughafen-Zubringer nur mit Lkw oder Lieferwagen.'};
 if(v.status!=='idle')return {ok:false,message:'Fahrzeug belegt.'};
 if(v.condition<AIR.minCondition)return {ok:false,message:'Fahrzeug benötigt Wartung.'};
 const site=v.site;if(c.site!==undefined&&c.site!==site)return {ok:false,message:'Fahrzeug steht nicht am gewählten Standort.'};
 const flight=resolveFlight(s,site,c);if(typeof flight==='string')return {ok:false,message:flight};
 const cand=[];
 for(let i=0;i<s.orders.length;i++){const o=s.orders[i];if(o.status==='active'&&isAirOrder(o)&&(o.deliverySite??o.site)===site&&Number.isSafeInteger(o.flightT)&&o.flightT<=flight)cand.push([o,i]);}
 cand.sort((a,b)=>a[0].flightT-b[0].flightT||a[0].due-b[0].due||a[1]-b[1]);
 const plan=[];let qty=0;
 for(const [o]of cand){
  const free=Math.floor(api.inventory.available('parcel',site,o.id)+1e-9),open=o.qty-o.delivered-shuttleQty(s,o.id);
  const n=Math.min(free,open,room(v,qty));if(n<1)continue;plan.push({o,n});qty+=n;
 }
 if(!qty)return {ok:false,message:'Keine sortierten Luftfrachtpakete für diesen Flug im Lager.'};
 const id=api.id('airshuttle'),orders=[];
 for(const {o,n}of plan){if(!api.inventory.reserve('parcel',n,site,id,o.id)){api.inventory.release(id);return {ok:false,message:'Ladung konnte nicht reserviert werden.'};}orders.push({orderId:o.id,qty:n,flightT:o.flightT});}
 const distance=airportDistance(s,site),remaining=handlingMinutes(qty);
 s.airShuttles.push({id,vehicleId:v.id,site,flight,status:'loading',orders,qty,cargo:[],remaining,duration:remaining,distance,cost:tripCost(v,distance),createdAt:s.t,departedAt:null,arrivedAt:null,deliveredAt:null,completedAt:null,dock:null,driver:null,worker:null,blocked:null,invoiceAmount:null,paid:false});
 v.status='airshuttle';v.airShuttle=id;
 api.log('airexport',`Flughafen-Zubringer für Flug ${clock(flight)}: ${qty} Pakete reserviert.`,[id,v.id,...orders.map(x=>x.orderId)]);
 return {ok:true,id,qty,cost:tripCost(v,distance),flight,cutoffAt:cutoffOf(s,site,flight)};
}

function freeAll(s,api,sh){
 for(const b of s.buildings)if(b.task===sh.id)b.task=null;
 api.workforce.release(key(sh,'warehouse'));api.workforce.release(key(sh,'driver'));sh.worker=null;sh.driver=null;sh.dock=null;
}
/** Bricht einen Zubringer vor Abfahrt ab (Storno, Wartung): Reservierung frei, Ware bleibt sortiert im Lager. */
export function abortAirShuttle(s,api,sh,reason){
 if(!sh||sh.status!=='loading')return false;
 api.inventory.release(sh.id);freeAll(s,api,sh);
 const v=s.vehicles.find(v=>v.id===sh.vehicleId);if(v&&v.status==='airshuttle'&&v.airShuttle===sh.id){v.status='idle';v.airShuttle=null;}
 delete sh.loadDone;sh.status='cancelled';sh.cancelReason=reason;sh.completedAt=s.t;sh.blocked=null;
 api.log('warning',`Flughafen-Zubringer storniert (${reason}): ${sh.qty} Pakete bleiben im Lager.`,[sh.id,sh.vehicleId]);
 return true;
}

function holdDock(s,sh){
 let dock=s.buildings.find(b=>b.task===sh.id&&b.type==='dock'&&b.site===sh.site&&b.enabled&&b.condition>0);
 if(!dock){for(const b of s.buildings)if(b.task===sh.id)b.task=null;dock=s.buildings.find(b=>b.type==='dock'&&b.site===sh.site&&b.enabled&&b.condition>0&&!b.task);}
 if(dock){dock.task=sh.id;sh.dock=dock.id;}else sh.dock=null;
 return dock||null;
}
function releaseLoading(s,api,sh){api.workforce.release(key(sh,'warehouse'));sh.worker=null;for(const b of s.buildings)if(b.task===sh.id)b.task=null;sh.dock=null;}

function stepShuttle(s,api,sh){
 const v=s.vehicles.find(v=>v.id===sh.vehicleId);if(!v)return;
 const speed=VEHICLES[v.type].speed;
 if(sh.status==='loading'){
  if(!sh.loadDone){
   if(!holdDock(s,sh)){sh.blocked=WAIT.dock;api.workforce.release(key(sh,'warehouse'));sh.worker=null;return;}
   const w=api.workforce.acquire('warehouse',sh.site,key(sh,'warehouse'));
   if(!w){sh.worker=null;sh.blocked=WAIT.staff;for(const b of s.buildings)if(b.task===sh.id)b.task=null;sh.dock=null;return;}
   w.activity='Belädt Flughafen-Zubringer';sh.worker=w.id;sh.blocked=null;
   if(--sh.remaining>0)return;
   sh.loadDone=true;releaseLoading(s,api,sh);
  }
  // Abfahrbereit: Fahrpersonal und Fahrtkosten. Wartend bleibt nur das Fahrzeug gebunden (QS-W2-01).
  const driver=api.workforce.acquire('driver',sh.site,key(sh,'driver'));
  if(!driver){sh.driver=null;sh.blocked=WAIT.driver;return;}
  if(s.money<sh.cost){api.workforce.release(key(sh,'driver'));sh.driver=null;sh.blocked=WAIT.cash;return;}
  const cargo=api.inventory.transfer(sh.id,'vehicle',sh.site);
  if(!cargo){api.workforce.release(key(sh,'driver'));sh.driver=null;sh.blocked=WAIT.cargo;return;}
  sh.driver=driver.id;driver.activity='Fährt Flughafen-Zubringer';
  sh.cargo=cargo.map(b=>b.id);api.book(`air-trip:${sh.id}`,-sh.cost,'Transport','Flughafen-Zubringer',[sh.id,v.id]);
  delete sh.loadDone;sh.blocked=null;sh.status='transit';sh.remaining=sh.duration=Math.ceil(sh.distance/speed);sh.departedAt=s.t;
  api.log('airexport',`Flughafen-Zubringer abgefahren: ${sh.qty} Pakete, Ankunft Terminal ca. ${clock(s.t+sh.remaining)}.`,[sh.id,v.id]);
  return;
 }
 const driver=api.workforce.acquire('driver',sh.site,key(sh,'driver'));
 if(!driver){sh.driver=null;sh.blocked=WAIT.driver;return;}
 sh.driver=driver.id;sh.blocked=null;
 if(--sh.remaining>0)return;
 if(sh.status==='transit'){sh.status='handover';sh.arrivedAt=s.t;sh.remaining=sh.duration=handlingMinutes(sh.qty);return;}
 if(sh.status==='handover'){
  const cargo=sh.cargo.map(id=>s.batches.find(b=>b.id===id));
  if(cargo.some(b=>!b||b.location!=='vehicle'||b.blocked)){sh.blocked=WAIT.cargo;sh.remaining=1;return;}
  for(const b of cargo)api.inventory.remove(b.id,b.qty);
  let amount=0,late=0;
  for(const x of sh.orders){
   const o=s.orders.find(o=>o.id===x.orderId),k=contractOf(s,o);
   o.delivered+=x.qty;s.stats.delivered+=x.qty;x.invoice=cents(x.qty*o.price);amount+=x.invoice;
   if(k&&s.t>x.flightT-k.cutoff){x.late=true;x.nextFlightT=o.flightT;late+=x.qty;}
   if(o.delivered>=o.qty){o.status='fulfilled';s.reputation=Math.min(100,s.reputation+3);}
  }
  sh.deliveredAt=s.t;sh.invoiceAmount=cents(amount);sh.lateQty=late;
  if(api.book(`air:${sh.id}`,sh.invoiceAmount,'Umsatz',`Luftfracht ${AIRPORT.short}: ${sh.qty} Pakete übergeben`,[sh.id,...sh.orders.map(x=>x.orderId)])){
   sh.paid=true;for(const x of sh.orders){const o=s.orders.find(o=>o.id===x.orderId);o.paid=cents(o.paid+x.invoice);}
  }
  if(late){const fee=cents(late*AIR.storagePerParcel);sh.storageFee=fee;api.book(`air-storage:${sh.id}`,-fee,'Lagergeld',`Terminal ${AIRPORT.short}: ${late} Pakete warten auf nächsten Flug`,[sh.id]);}
  const next=sh.orders.filter(x=>x.late).map(x=>x.nextFlightT).sort((a,b)=>a-b)[0];
  api.log(late?'warning':'payment',`Frachtterminal ${AIRPORT.short}: ${sh.qty} Pakete übergeben, Zahlung ${sh.invoiceAmount.toFixed(2)} €.${late?` ${late} Pakete nach Annahmeschluss: Weiterflug ${clock(next)}, Lagergeld ${sh.storageFee.toFixed(2)} €.`:''}`,[sh.id,...sh.orders.map(x=>x.orderId)]);
  sh.cargo=[];sh.status='returning';sh.remaining=sh.duration=Math.ceil(sh.distance/speed);
  return;
 }
 if(sh.status==='returning'){
  sh.status='complete';sh.completedAt=s.t;v.status='idle';v.airShuttle=null;v.condition=Math.max(0,v.condition-2);
  api.workforce.release(key(sh,'driver'));sh.driver=null;
 }
}

/** Annahmeschluss vorbei und Pakete offen → Strafe je Auftrag und Flug genau einmal, Umbuchung auf den nächsten Flug. */
function missedFlights(s,api){
 for(const o of s.orders){
  if(o.status!=='active'||!isAirOrder(o))continue;
  const k=contractOf(s,o);if(!k||!Array.isArray(k.flights)||!k.flights.length)continue;
  for(let guard=0;guard<400&&s.t>o.flightT-k.cutoff;guard++){
   const open=o.qty-o.delivered,flightT=o.flightT;
   if(open>0&&k.penaltyMissed>0){
    const amount=cents(open*k.penaltyMissed);
    if(api.book(`air-missed:${o.id}:${flightT}`,-amount,'Vertragsstrafe',`Luftfracht ${k.shipper}: Flug ${clock(flightT)} verpasst, ${open} Pakete`,[k.id,o.id])){
     o.missedFlights=(o.missedFlights||0)+1;
     api.log('warning',`Annahmeschluss Flug ${clock(flightT)} verpasst: ${open} Pakete (${o.customer}), Strafe ${amount.toFixed(2)} €. Umgebucht auf nächsten Flug.`,[k.id,o.id]);
    }
   }
   o.flightT=nextFlight(k.flights,k.cutoff,flightT-k.cutoff+1);
  }
 }
}

export function step(s,api){
 if(!s.airShuttles?.length&&!(s.contracts||[]).some(k=>k.unit==='air'&&k.status!=='offer'))return;
 // Erst Annahmeschluss prüfen, dann Zubringer: Übergabe genau zum Annahmeschluss ist rechtzeitig, eine Minute später nicht.
 missedFlights(s,api);
 for(const sh of s.airShuttles)if(ACTIVE.has(sh.status))stepShuttle(s,api,sh);
 if(s.t%60===0&&s.airShuttles.some(x=>!ACTIVE.has(x.status)&&x.completedAt<s.t-AIR.keep))s.airShuttles=s.airShuttles.filter(x=>ACTIVE.has(x.status)||x.completedAt>=s.t-AIR.keep);
}

export function validate(s){
 const bad=m=>{throw new Error('Luftexport beschädigt: '+m);};
 const int=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
 const num=(n,min=0)=>typeof n==='number'&&Number.isFinite(n)&&n>=min;
 if(!Array.isArray(s.airShuttles))bad('Zubringerliste');
 const sites=new Set(s.sites.map(x=>x.id)),vehicles=new Map(s.vehicles.map(v=>[v.id,v])),orders=new Map(s.orders.map(o=>[o.id,o]));
 for(const o of s.orders)if(o.airExport!==undefined&&(o.airExport!==true||o.item!=='parcel'||!int(o.flightT)||(o.missedFlights!==undefined&&!int(o.missedFlights))))bad('Luftfrachtauftrag '+o.id);
 const byJob=new Map();for(const r of s.reservations){if(typeof r.job==='string'&&r.job.startsWith('airshuttle-')){let a=byJob.get(r.job);if(!a)byJob.set(r.job,a=[]);a.push(r);}}
 const trips=new Map(),busy=new Set(),cargoIds=new Set();
 for(const sh of s.airShuttles){
  if(!sh||typeof sh.id!=='string'||!STATUSES.includes(sh.status)||!sites.has(sh.site)||!vehicles.has(sh.vehicleId))bad('Zubringer');
  if(!int(sh.qty,1)||!int(sh.flight)||!num(sh.remaining)||!num(sh.distance,Number.EPSILON)||!num(sh.cost)||!Array.isArray(sh.cargo)||!Array.isArray(sh.orders)||!sh.orders.length||typeof sh.paid!=='boolean')bad('Zubringerwerte');
  let sum=0;const seen=new Set();
  for(const x of sh.orders){const o=orders.get(x?.orderId);if(!o||!isAirOrder(o)||seen.has(o.id)||!int(x.qty,1)||!int(x.flightT)||(o.deliverySite??o.site)!==sh.site)bad('Zubringeraufträge');seen.add(o.id);sum+=x.qty;}
  if(sum!==sh.qty)bad('Zubringermenge');
  if(sh.invoiceAmount!=null&&!num(sh.invoiceAmount))bad('Rechnung');
  if(sh.paid&&sh.deliveredAt==null)bad('Zahlung vor Übergabe');
  trips.set(sh.id,sh);
  if(!ACTIVE.has(sh.status))continue;
  const v=vehicles.get(sh.vehicleId);if(v.status!=='airshuttle'||v.airShuttle!==sh.id||busy.has(v.id)||v.site!==sh.site)bad('Fahrzeugbindung');busy.add(v.id);
  const want=new Map(sh.orders.map(x=>[x.orderId,x.qty]));
  if(sh.status==='loading'){
   if(sh.cargo.length||sh.deliveredAt!=null)bad('Ladung vor Abfahrt');
   const got=new Map();for(const r of byJob.get(sh.id)||[]){const b=s.batches.find(b=>b.id===r.batchId);if(!b||b.site!==sh.site||b.location!=='stock'||b.item!=='parcel'||!want.has(b.owner))bad('Ladereservierung');got.set(b.owner,(got.get(b.owner)||0)+r.qty);}
   for(const [id,qty]of want)if(Math.abs((got.get(id)||0)-qty)>1e-7)bad('Reservierungsmenge');
   if(got.size!==want.size)bad('Reservierungsmenge');
  }else if(byJob.has(sh.id))bad('Reservierung nach Abfahrt');
  if(sh.status==='transit'||sh.status==='handover'){
   if(sh.deliveredAt!=null)bad('Übergabe doppelt');
   const got=new Map();for(const id of sh.cargo){const b=s.batches.find(b=>b.id===id);if(cargoIds.has(id)||!b||b.location!=='vehicle'||b.item!=='parcel'||!want.has(b.owner))bad('Fahrzeugladung');cargoIds.add(id);got.set(b.owner,(got.get(b.owner)||0)+b.qty);}
   for(const [id,qty]of want)if(Math.abs((got.get(id)||0)-qty)>1e-7)bad('Ladungsmenge');
   if(got.size!==want.size)bad('Ladungsmenge');
  }
  if(sh.status==='returning'&&(sh.deliveredAt==null||sh.cargo.length))bad('Rückfahrt ohne Übergabe');
  if(sh.dock!=null){const b=s.buildings.find(b=>b.id===sh.dock);if(sh.status!=='loading'||!b||b.type!=='dock'||b.site!==sh.site||b.task!==sh.id)bad('Dockbelegung');}
 }
 for(const job of byJob.keys())if(trips.get(job)?.status!=='loading')bad('Verwaiste Ladereservierung');
 for(const b of s.buildings){if(typeof b.task!=='string'||!trips.has(b.task))continue;const sh=trips.get(b.task);if(b.type!=='dock'||sh.dock!==b.id||sh.status!=='loading')bad('Verwaiste Dockbelegung');}
 for(const v of s.vehicles)if(v.status==='airshuttle'&&!busy.has(v.id))bad('Fahrzeug ohne Zubringer');
}
