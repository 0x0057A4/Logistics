// Frachtverträge und Ankunftsplan (A08). Schnittstelle: docs/SCHNITTSTELLEN-0.9-W1.md, W1-S1; W2-S1 (Vertragsstrafe) und
// Vertragsfeld unit (W2-S2) in docs/SCHNITTSTELLEN-0.10-W2.md.
// Vertrag annehmen ist kostenlos. Geld fließt über die vorhandenen Pfade (Zustellung → Rechnung → Zahlung, Abschlag bei Verspätung)
// und zusätzlich über Vertragsstrafen (penalty:<lieferungId>, penalty-open:<auftragId>), jeweils genau einmal.
import * as yardApi from './yard.js';
import {committedQty} from './tours.js';

/** Minuten vor eta, zu denen der Lkw angekündigt (yard.schedule) und die Aufträge angelegt werden. Der Lkw erscheint dann als „approach“. */
export const SCHEDULE_LEAD=15;
/** Mindestvorlauf zwischen Annahme und erster Ankunft. */
export const START_DELAY=60;
/** Höchstzahl offener Angebote; neue Angebote alle OFFER_INTERVAL Minuten (Minute OFFER_PHASE des Intervalls). */
export const MAX_OFFERS=3,OFFER_INTERVAL=720,OFFER_PHASE=300,OFFER_VALIDITY=2880;

// Fiktive Versender und Gebiete (anonymisiert, eigenständig erzeugt).
const SHIPPERS=['Kranichfeld Versandhaus','Lindenstein Online-Handel','Talbrück Modeversand','Sonnhalde Haushaltswaren','Eichenrode Buchversand','Mühlbach Elektroversand','Weidenau Spielwaren','Brunnhof Gartenversand'];
const LANES=['Nordviertel','Altstadt Süd','Am Kanal','Hügelfeld','Westring','Bachgrund','Ostpark','Lerchenhöhe','Fischerdorf','Industriegebiet Nord'];
// Depot-Stufe (A02 W1b): Ankünfte 08:30–12:00, damit Tagschicht (08–16 Uhr) sortieren und zustellen kann.
const ARRIVAL_MINUTES=[510,540,570,600,630,660,690,720];
/** Spielwerte Depot-Stufe (A02 W1b, Preis/Volumen W1c: 7–8,50 €/Paket (A01), Volumen füllt 1 Lagerkraft + 1 Lieferwagen;
 *  docs/BALANCING-0.9-W1.md Abschnitt 9). start = Startangebot, offer = Folgeangebote.
 *  parcels: Spanne in Zehnern je Ankunft; price (offer): [Basis €, Schritt €, Schritte]; sla: start in Minuten, offer in Stunden; days: Laufzeit in Tagen. */
export const TERMS={
 start:{minutes:[540,570],parcels:[20,25],price:8,sla:360,days:7},
 offer:{parcels:[6,11],price:[7,0.25,6],sla:[5,8],days:[5,10]},
 // Palettenverträge (W2-S2): units = Paletten je Ankunft (ohne Zehnerfaktor), price [Basis €, Schritt €, Schritte] je Palette (W2b A02: 110–140 €,
 // Ausbau Staplerplatz + Lkw + Fahrer amortisiert in 8–12 Tagen, docs/BALANCING-0.10-W2.md),
 // erst mit Staplerplatz (BUILDINGS.forklift) oder ab Spieltag fromDay (Anzeige „Tag n“). Gleiche Zahl Zufallszüge wie Paketangebote.
 pallet:{units:[6,20],price:[110,5,6],sla:[6,10],days:[5,10],fromDay:3},
 // Vertragsstrafe (W2-S1) je Einheit: late = zugestellt nach order.due (zusätzlich zum Abschlag 10 %),
 // open = bei Vertragsende + openGrace Minuten nicht zugestellt (Ware geht an den Versender zurück). W2b A02: Paket
 // 2,50/8 € (≈ 30 %/100 % des Preises), Palette 25/60 € (≈ 20 %/50 %); Überlast wird damit teurer als guter Betrieb.
 penalty:{parcel:{late:2.5,open:8},pallet:{late:25,open:60},openGrace:1440}
};
const STATUSES=['offer','active','ended'];
export const UNITS=['parcel','pallet'];
/** Einheit eines Vertrags; Verträge ohne Feld (bis 0.9) sind Paketverträge. */
export const unitOf=k=>k?.unit==='pallet'?'pallet':'parcel';
const unitWord=(k,n)=>unitOf(k)==='pallet'?(n===1?'Palette':'Paletten'):(n===1?'Paket':'Pakete');
/** Palettenangebote möglich: Staplerplatz vorhanden oder ab Spieltag TERMS.pallet.fromDay. */
export const palletsUnlocked=s=>s.buildings.some(b=>b.type==='forklift')||Math.floor(s.t/1440)+1>=TERMS.pallet.fromDay;

const pick=(api,list)=>list[Math.floor(api.random()*list.length)];
const int=(api,min,max)=>min+Math.floor(api.random()*(max-min+1));
const cents=n=>Math.round(n*100)/100;

/** Deterministisches Angebot aus api.random. small=true: Startangebot (1 Ankunft/Tag, 200–250 Pakete).
 *  pallet=true: Palettenvertrag; zieht genau so viele Zufallszahlen wie ein Paketangebot (Zufallsstrom bleibt gleich). */
function makeOffer(s,api,small=false,pallet=false){
 const T=pallet?TERMS.pallet:TERMS.offer,unit=pallet?'pallet':'parcel',pen=TERMS.penalty[unit];
 const shipper=pick(api,SHIPPERS),laneCount=small?int(api,1,2):int(api,1,3),names=[...LANES],lanes=[];
 for(let i=0;i<laneCount;i++){const name=names.splice(Math.floor(api.random()*names.length),1)[0];lanes.push({id:`lane-${i+1}`,name,distance:int(api,15,45)});}
 // Anteile in Zwanzigsteln, jedes Gebiet mindestens 5/20; Summe exakt 1.
 const parts=lanes.map(()=>5);let rest=20-5*lanes.length;while(rest-->0)parts[Math.floor(api.random()*parts.length)]++;
 const laneShare=parts.map(p=>p/20);
 const arrivalCount=small?1:int(api,1,2),minutes=[...ARRIVAL_MINUTES],arrivals=[];
 for(let i=0;i<arrivalCount;i++){const minute=small?pick(api,TERMS.start.minutes):minutes.splice(Math.floor(api.random()*minutes.length),1)[0];arrivals.push({minute,parcels:small?int(api,...TERMS.start.parcels)*10:pallet?int(api,...T.units):int(api,...T.parcels)*10});}
 arrivals.sort((a,b)=>a.minute-b.minute);
 const id=api.id('contract');
 // pricePerParcel = Preis je Einheit (Paket bzw. Palette); arrivals[].parcels = Einheiten je Ankunft (Feldnamen bleiben für Altstände).
 return {id,shipper,site:s.selectedSite,status:'offer',unit,lanes,arrivals,laneShare,
  pricePerParcel:small?TERMS.start.price:cents(T.price[0]+int(api,0,T.price[2])*T.price[1]),slaMinutes:small?TERMS.start.sla:int(api,...T.sla)*60,
  durationDays:small?TERMS.start.days:int(api,...T.days),penaltyLate:pen.late,penaltyOpen:pen.open,offeredAt:s.t,expiresAt:s.t+OFFER_VALIDITY,
  startT:null,endT:null,acceptedAt:null,issued:0,lastEta:null};
}

/** Verteilt parcels nach Anteil (größter Rest, bei Gleichstand niedrigerer Index). Ganzzahlig, Summe exakt = parcels. */
export function splitParcels(parcels,shares){
 const raw=shares.map(x=>x*parcels),qty=raw.map(Math.floor);let rest=parcels-qty.reduce((a,b)=>a+b,0);
 const order=raw.map((x,i)=>[x-Math.floor(x),i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
 for(let k=0;rest>0;k=(k+1)%order.length,rest--)qty[order[k][1]]++;
 return qty;
}

function issue(s,api,c,arrival,eta){
 const qty=splitParcels(arrival.parcels,c.laneShare),orderIds=[],lanes=[];
 c.lanes.forEach((lane,i)=>{if(qty[i]<1)return;const id=api.id('order');
  s.orders.push({id,kind:'logistics',source:'hub',contractId:c.id,lane:lane.id,customer:`${lane.name} (${c.shipper})`,item:unitOf(c),qty:qty[i],price:c.pricePerParcel,due:eta+c.slaMinutes,quality:0,site:c.site,status:'active',delivered:0,paid:0});
  orderIds.push(id);lanes.push({lane:lane.id,orderId:id,qty:qty[i]});});
 c.issued++;c.lastEta=eta;
 const payload={contractId:c.id,site:c.site,parcels:arrival.parcels,unit:unitOf(c),item:unitOf(c),eta,orderIds,lanes};
 if(typeof yardApi.schedule==='function')yardApi.schedule(s,api,payload);
 else api.log('warning',`Hof-Planung fehlt: Ankunft ${c.shipper} (${arrival.parcels} ${unitWord(c,arrival.parcels)}) nur als Aufträge angelegt.`,[c.id,...orderIds]);
 api.log('contract',`${c.shipper}: Lkw mit ${arrival.parcels} ${unitOf(c)==='pallet'?(arrival.parcels===1?'Palette':'Paletten'):(arrival.parcels===1?'Paket':'Paketen')} angekündigt, Ankunft ${clock(eta)}.`,[c.id,...orderIds]);
}
const clock=t=>{const m=((t%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};

export function init(s,api){
 s.contracts??=[];
 if(api&&!s.contracts.length)s.contracts.push(makeOffer(s,api,true));
}

export function handle(s,c,api){
 if(c.type==='acceptContract'){
  const k=s.contracts.find(x=>x.id===c.id);if(!k||k.status!=='offer')return {ok:false,message:'Vertragsangebot nicht verfügbar.'};
  if(s.t>=k.expiresAt)return {ok:false,message:'Vertragsangebot abgelaufen.'};
  if(!s.sites.some(x=>x.id===k.site))return {ok:false,message:'Standort des Vertrags fehlt.'};
  k.status='active';k.acceptedAt=s.t;k.startT=s.t+START_DELAY;k.endT=k.startT+k.durationDays*1440;
  // Angebote aus Ständen bis 0.9 erhalten bei Annahme Einheit und Strafsätze (bereits laufende Altverträge bleiben ohne Strafe).
  k.unit??='parcel';const pen=TERMS.penalty[unitOf(k)];k.penaltyLate??=pen.late;k.penaltyOpen??=pen.open;
  api.log('contract',`Vertrag mit ${k.shipper} angenommen: ${k.arrivals.map(a=>`${a.parcels} ${unitWord(k,a.parcels)} um ${clock(a.minute)}`).join(', ')} täglich, ${k.durationDays} Tage. Vertragsstrafe ${k.penaltyLate.toFixed(2)} € je verspätete, ${k.penaltyOpen.toFixed(2)} € je nicht zugestellte Einheit.`,[k.id]);
  return {ok:true,id:k.id};
 }
 if(c.type==='cancelContract'){
  const k=s.contracts.find(x=>x.id===c.id);if(!k||k.status==='ended')return {ok:false,message:'Vertrag kann nicht beendet werden.'};
  if(k.status==='offer'){s.contracts.splice(s.contracts.indexOf(k),1);api.log('contract',`Vertragsangebot von ${k.shipper} abgelehnt.`,[]);return {ok:true};}
  k.status='ended';k.endT=s.t;k.endReason='cancelled';
  api.log('contract',`Vertrag mit ${k.shipper} gekündigt. Keine neuen Ankünfte; angekündigte Lkw und offene Aufträge bleiben bestehen.`,[k.id]);return {ok:true};
 }
 return null;
}

export function step(s,api){
 const list=s.contracts;
 // Abgelaufene Angebote entfallen (keine Referenzen); erreichte Laufzeit beendet den Vertrag.
 for(let i=list.length-1;i>=0;i--){const k=list[i];
  if(k.status==='offer'&&s.t>=k.expiresAt){list.splice(i,1);api.log('contract',`Vertragsangebot von ${k.shipper} abgelaufen.`,[]);}
 }
 const eta=s.t+SCHEDULE_LEAD,minute=eta%1440;
 for(const k of list){
  if(k.status!=='active')continue;
  if(eta>=k.endT){k.status='ended';k.endReason='expired';api.log('contract',`Vertrag mit ${k.shipper} planmäßig beendet.`,[k.id]);continue;}
  if(eta<k.startT||(k.lastEta!=null&&eta<=k.lastEta))continue;
  for(const a of k.arrivals)if(a.minute===minute)issue(s,api,k,a,eta);
 }
 if(s.t%OFFER_INTERVAL===OFFER_PHASE&&list.filter(k=>k.status==='offer').length<MAX_OFFERS){
  // Höchstens ein offenes Palettenangebot; Auswahl ohne Zufallszug.
  const pallet=palletsUnlocked(s)&&!list.some(k=>k.status==='offer'&&unitOf(k)==='pallet');
  const offer=makeOffer(s,api,false,pallet);list.push(offer);api.log('contract',`Neues Vertragsangebot${pallet?' (Paletten)':''}: ${offer.shipper}.`,[offer.id]);
 }
 latePenalties(s,api);
 for(const k of list)if(k.status==='ended'&&!k.settled&&Number.isFinite(k.penaltyOpen)&&s.t>=k.endT+TERMS.penalty.openGrace)settle(s,api,k);
}

/** W2-S1 penaltyLate: je Einheit, die nach order.due zugestellt wurde. Zustellungen entstehen in transport/tours/multimodal
 *  (Modulreihenfolge vor contracts); Fenster [t-1, t] + Buchungsschlüssel machen die Buchung genau einmalig. */
function latePenalties(s,api){
 const since=s.t-1;
 for(const sh of s.shipments)if(sh.deliveredAt>=since)latePenalty(s,api,`penalty:${sh.id}`,sh.orderId,sh.qty,sh.deliveredAt,[sh.id]);
 for(const t of s.tours||[])if(t.status!=='loading'&&t.status!=='cancelled')t.stops.forEach((stop,i)=>{if(stop.deliveredAt>=since)latePenalty(s,api,`penalty:${t.id}:${i}`,stop.orderId,stop.qty,stop.deliveredAt,[t.id]);});
 for(const f of s.freights||[])if(f.deliveredAt>=since)latePenalty(s,api,`penalty:${f.id}`,f.orderId,f.qty,f.deliveredAt,[f.id]);
}
function latePenalty(s,api,key,orderId,qty,deliveredAt,refs){
 const o=s.orders.find(o=>o.id===orderId);if(!o?.contractId||!(deliveredAt>o.due))return;
 const k=s.contracts.find(k=>k.id===o.contractId);if(!(k?.penaltyLate>0)||!(qty>0))return;
 const amount=cents(qty*k.penaltyLate);
 if(api.book(key,-amount,'Vertragsstrafe',`Vertragsstrafe ${k.shipper}: ${qty} ${unitWord(k,qty)} verspätet`,[k.id,o.id,...refs]))
  api.log('warning',`Vertragsstrafe ${k.shipper}: ${qty} ${unitWord(k,qty)} nach Frist zugestellt, ${amount.toFixed(2)} €.`,[k.id,o.id,...refs]);
}
/** W2-S1 penaltyOpen: Vertragsende + openGrace. Je aktivem Vertragsauftrag: offene Einheiten bestrafen, freie Fremdware an den
 *  Versender zurückgeben (inventory.remove), Auftrag stornieren. Regel für gebundene Ware: Solange ein Lkw des Auftrags noch
 *  im Hof entlädt, Ware reserviert ist oder auf einem Fahrzeug/einer Tour/Fracht liegt, wartet die Abrechnung dieses Auftrags
 *  bis zum Abschluss (dann zugestellte Einheiten mindern die offene Menge). Je Auftrag in einem Schritt: atomar. */
function settle(s,api,k){
 let pending=false;
 for(const o of s.orders){
  if(o.contractId!==k.id||o.status!=='active')continue;
  if(!settleOrder(s,api,k,o))pending=true;
 }
 if(!pending){k.settled=true;k.settledAt=s.t;}
}
function settleOrder(s,api,k,o){
 if(committedQty(s,o.id)>0){o.settleWait='Ware unterwegs';return false;}
 if((s.yard||[]).some(a=>a.orderIds?.includes(o.id)&&!['exit','gone'].includes(a.phase))){o.settleWait='Lkw im Hof';return false;}
 const batches=s.batches.filter(b=>b.owner===o.id&&b.qty>0);
 if(batches.some(b=>b.reserved>0||b.location==='vehicle')){o.settleWait='Ware reserviert';return false;}
 const parts=[];for(const b of batches){const part=api.inventory.remove(b.id,b.qty);if(part)parts.push(part);}
 const returned=parts.reduce((n,p)=>n+p.qty,0),open=Math.max(0,o.qty-o.delivered),amount=cents(open*k.penaltyOpen);
 if(amount>0)api.book(`penalty-open:${o.id}`,-amount,'Vertragsstrafe',`Vertragsstrafe ${k.shipper}: ${open} ${unitWord(k,open)} nicht zugestellt`,[k.id,o.id]);
 o.status='cancelled';o.cancelReason='contractEnd';o.returnedQty=returned;o.penaltyOpen=amount;delete o.settleWait;
 api.log('warning',`Vertragsende ${k.shipper}: ${open} ${unitWord(k,open)} nicht zugestellt (${o.customer}), Strafe ${amount.toFixed(2)} €; ${returned} ${unitWord(k,returned)} an Versender zurückgegeben.`,[k.id,o.id,...parts.map(p=>p.id)]);
 return true;
}

export function validate(s){
 const bad=m=>{throw new Error('Spielstand ungültig: Vertrag '+m);};
 const num=(n,min=-Infinity)=>typeof n==='number'&&Number.isFinite(n)&&n>=min;
 const sites=new Set(s.sites.map(x=>x.id));let offers=0;
 for(const k of s.contracts){
  if(!k||typeof k.id!=='string'||typeof k.shipper!=='string'||!k.shipper||!sites.has(k.site)||!STATUSES.includes(k.status))bad('Grunddaten beschädigt.');
  if(k.status==='offer')offers++;
  if(!Array.isArray(k.lanes)||k.lanes.length<1||k.lanes.length>3)bad('Zustellgebiete beschädigt.');
  const laneIds=new Set();for(const l of k.lanes){if(!l||typeof l.id!=='string'||laneIds.has(l.id)||typeof l.name!=='string'||!l.name||!num(l.distance,Number.EPSILON))bad('Zustellgebiet beschädigt.');laneIds.add(l.id);}
  if(!Array.isArray(k.laneShare)||k.laneShare.length!==k.lanes.length||k.laneShare.some(x=>!num(x,0)||x>1)||Math.abs(k.laneShare.reduce((a,b)=>a+b,0)-1)>1e-9)bad('Gebietsanteile beschädigt.');
  if(!Array.isArray(k.arrivals)||k.arrivals.length<1||k.arrivals.length>3||k.arrivals.some(a=>!a||!Number.isInteger(a.minute)||a.minute<0||a.minute>1439||!Number.isInteger(a.parcels)||a.parcels<1)||new Set(k.arrivals.map(a=>a.minute)).size!==k.arrivals.length)bad('Ankunftsplan beschädigt.');
  if(!num(k.pricePerParcel,0)||!Number.isInteger(k.slaMinutes)||k.slaMinutes<1||!Number.isInteger(k.durationDays)||k.durationDays<1)bad('Konditionen beschädigt.');
  if(k.status==='offer'&&(k.acceptedAt!=null||k.startT!=null||!num(k.expiresAt,0)))bad('Angebot beschädigt.');
  if(k.status!=='offer'&&(!num(k.acceptedAt,0)||!num(k.startT,0)||!num(k.endT,0)||k.startT<k.acceptedAt||k.acceptedAt>s.t))bad('Laufzeit beschädigt.');
  if(!Number.isInteger(k.issued??0)||(k.issued??0)<0||(k.lastEta!=null&&!num(k.lastEta,0)))bad('Ankunftszähler beschädigt.');
  if(k.unit!==undefined&&!UNITS.includes(k.unit))bad('Einheit beschädigt.');
  if((k.penaltyLate!==undefined&&!num(k.penaltyLate,0))||(k.penaltyOpen!==undefined&&!num(k.penaltyOpen,0)))bad('Vertragsstrafe beschädigt.');
  if(k.settled!==undefined&&(typeof k.settled!=='boolean'||(k.settled&&k.status!=='ended')))bad('Abrechnung beschädigt.');
 }
 if(offers>MAX_OFFERS)bad('zu viele offene Angebote.');
 const contracts=new Map(s.contracts.map(k=>[k.id,k]));
 for(const o of s.orders){
  if(o.contractId===undefined)continue;
  const k=contracts.get(o.contractId);
  if(!k||k.status==='offer')bad('fehlt für Auftrag '+o.id+'.');
  if(o.kind!=='logistics'||o.item!==unitOf(k)||!Number.isInteger(o.qty)||o.qty<1||!k.lanes.some(l=>l.id===o.lane)||o.site!==k.site)bad('Vertragsauftrag '+o.id+' beschädigt.');
  if(o.returnedQty!==undefined&&(o.status!=='cancelled'||!num(o.returnedQty,0)))bad('Rückgabe Auftrag '+o.id+' beschädigt.');
 }
}
