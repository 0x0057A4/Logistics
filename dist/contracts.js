// Frachtverträge und Ankunftsplan (A08). Schnittstelle: docs/SCHNITTSTELLEN-0.9-W1.md, W1-S1; W2-S1 (Vertragsstrafe) und
// Vertragsfeld unit (W2-S2) in docs/SCHNITTSTELLEN-0.10-W2.md; Gebiete an anderen eigenen Standorten (W3-S1, lane.site,
// order.deliverySite) in docs/SCHNITTSTELLEN-0.12-W3.md. Containerverträge (W3b-S1: unit 'container', Inhalt, Handling,
// Lagergeld) in docs/SCHNITTSTELLEN-0.13-W3b.md. Warenarten Kühlpaket/Sperrgut (0.15 S2: unit 'parcel' + content
// 'parcel_cold'|'bulky', eigener Angebotsplatz) in docs/SCHNITTSTELLEN-0.15.md.
// Vertrag annehmen ist kostenlos. Geld fließt über die vorhandenen Pfade (Zustellung → Rechnung → Zahlung, Abschlag bei Verspätung)
// und zusätzlich über Vertragsstrafen (penalty:<lieferungId>, penalty-open:<auftragId>), jeweils genau einmal.
import * as yardApi from './yard.js';
import {committedQty} from './tours.js';
import {AIRPORT,airportDistance,nextFlight} from './airexport.js';

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
 penalty:{parcel:{late:2.5,open:8},pallet:{late:25,open:60},openGrace:1440},
 // Fremdgebiete (W3-S1): nur Folgeangebote und nur bei ≥ 2 Standorten. Je Gebiet mit Wahrscheinlichkeit chance an einem anderen
 // eigenen Standort (Zielstandort gleichverteilt). Zuschlag je Einheit = Basis + €/km × Standortdistanz (Hauptlauf), Fristzuschlag
 // = Basis + min/km × Distanz, aufgerundet auf volle 30 Minuten. Distanz wie Standorttransfer: max(15, gerundete Luftlinie).
 remote:{chance:0.35,price:{parcel:[0.6,0.012],pallet:[8,0.15]},sla:[180,2],slaStep:30},
 // Seeimport (W3b-S1, A08-Vorschlag, Balancing A02 offen): erst mit Containerhof am Angebotsstandort oder ab Spieltag fromDay.
 // Je Ankunft containers Container (1–3), je Container units Einheiten des Inhalts (Paletten bzw. Pakete in Zehnern),
 // Inhaltspreis je Einheit [Basis €, Schritt €, Schritte], Handling je Container [Basis €, Schritt €, Schritte] (Gutschrift
 // nach vollständigem Entladen), freeMinutes Freizeit im Hof, demurragePerHour Lagergeld €/Std. je Container danach.
 // arrivals: Ankünfte je Tag. Strafen nach Inhalt (TERMS.penalty[content]).
 container:{fromDay:5,containers:[1,3],arrivals:[1,1],sla:[8,12],days:[5,10],freeMinutes:1440,demurragePerHour:12,handling:[250,25,8],
  content:{pallet:{units:[18,22],price:[95,5,6]},parcel:{units:[50,70],price:[6,0.25,6]}}},
 // Luftexport (W3c-S1, A08-Vorschlag, Balancing A02 offen): erst mit Dock und Lkw/Lieferwagen am Angebotsstandort oder ab
 // Spieltag fromDay. Eigener Angebotsplatz einmal täglich um Minute phase (höchstens ein offenes Luftangebot, zählt nicht zu
 // MAX_OFFERS) mit eigenem, aus dem Zustand abgeleitetem Zufall (airRandom): api.random wird nicht berührt, Paket-/Paletten-/
 // Containerangebote bleiben inhaltlich gleich. parcels/days wie offer, price [Basis €, Schritt €, Schritte] je Paket (11–14 €),
 // der Fristzug wählt den Flugplan (flightPlans[0..2], Minuten des Tages). cutoff: Annahmeschluss in Minuten vor Abflug;
 // minLead: Mindestvorlauf Ankunft im Hof → Annahmeschluss des gebuchten Flugs; penaltyMissed: Strafe je Paket und verpasstem
 // Flug (air-missed:<auftrag>:<flug>). Ein Zustellgebiet „Luftfracht <Flughafen>“ am Annahme-Hub (ohne lane.site).
 air:{fromDay:4,phase:1380,parcels:[6,11],price:[11,0.5,6],sla:[0,2],days:[5,10],flightPlans:[[1050],[990,1290],[1110]],cutoff:90,minLead:180,penaltyMissed:3},
 // Warenarten (0.15 S2, A08-Vorschlag, Balancing A02 offen): eigener Angebotsplatz einmal täglich um Minute phase (06:00, damit
 // frühestens am 2. Spieltag) mit eigenem Zufall (slotRandom, api.random unberührt), höchstens ein offenes Warenangebot,
 // zählt nicht zu MAX_OFFERS. Kühlpaket nur mit Kühllager am Angebotsstandort oder abgeschlossener Forschung coldchain;
 // parcels in Zehnern wie offer, price [Basis €, Schritt €, Schritte] + surcharge (Kühlzuschlag je Paket, im Preis enthalten
 // und als k.surcharge ausgewiesen). Sperrgut ab Spieltag fromDay oder mit Staplerplatz am Angebotsstandort; units Stück je
 // Ankunft (ohne Zehnerfaktor; 0,6 Volumen/25 kg → Lieferwagen 3 Stück, Lkw 133), Preis je Stück. Kein Container-/Luftweg.
 ware:{phase:360,
  parcel_cold:{parcels:[4,8],price:[7,0.25,6],surcharge:3.5,sla:[5,8],days:[5,10]},
  bulky:{units:[8,24],price:[22,1,6],sla:[8,12],days:[5,10],fromDay:3}}
};
// Strafen der Warenarten (≈ 30 %/100 % des Preises wie Paket).
Object.assign(TERMS.penalty,{parcel_cold:{late:3,open:11},bulky:{late:7,open:25}});
const STATUSES=['offer','active','ended'];
export const UNITS=['parcel','pallet','container','air'];
export const CONTENTS=['pallet','parcel'];
/** 0.15 S2: Warenarten eines Paketvertrags (k.content bei unit 'parcel'); Container und Luftexport führen sie nicht. */
export const WARES=['parcel_cold','bulky'];
/** Warenart eines Vertrags oder null (Paket/Palette/Container/Luft). */
export const wareOf=k=>unitOf(k)==='parcel'&&WARES.includes(k?.content)?k.content:null;
/** Einheit eines Vertrags; Verträge ohne Feld (bis 0.9) sind Paketverträge. W3b: 'container' möglich (Inhalt in k.content). */
export const unitOf=k=>k?.unit==='pallet'||k?.unit==='container'||k?.unit==='air'?k.unit:'parcel';
/** Ware der Vertragsaufträge (order.item): Paket/Palette bzw. bei Containerverträgen der Inhalt. */
export const itemOf=k=>unitOf(k)==='container'?(k.content==='pallet'?'pallet':'parcel'):unitOf(k)==='air'?'parcel':wareOf(k)||unitOf(k);
const WARE_WORD={parcel_cold:['Kühlpaket','Kühlpakete'],bulky:['Sperrgutstück','Sperrgutstücke']};
const unitWord=(k,n)=>itemOf(k)==='pallet'?(n===1?'Palette':'Paletten'):WARE_WORD[itemOf(k)]?WARE_WORD[itemOf(k)][n===1?0:1]:(n===1?'Paket':'Pakete');
/** Palettenangebote möglich: Staplerplatz vorhanden oder ab Spieltag TERMS.pallet.fromDay. */
export const palletsUnlocked=s=>s.buildings.some(b=>b.type==='forklift')||Math.floor(s.t/1440)+1>=TERMS.pallet.fromDay;
/** Containerangebote möglich (W3b-S1): Containerhof am Standort site (Standard: gewählter Standort) oder ab Spieltag TERMS.container.fromDay. */
export const containersUnlocked=(s,site=s.selectedSite)=>s.buildings.some(b=>b.type==='containeryard'&&b.site===site)||Math.floor(s.t/1440)+1>=TERMS.container.fromDay;
/** Luftexportangebote möglich (W3c-S1): Dock und Lkw/Lieferwagen am Standort site oder ab Spieltag TERMS.air.fromDay. */
/** Kühlpaketangebote möglich (0.15 S2): Kühllager am Standort site oder Forschung coldchain abgeschlossen. */
export const coldUnlocked=(s,site=s.selectedSite)=>s.buildings.some(b=>b.type==='coldstore'&&b.site===site)||(s.research||[]).some(r=>r.key==='coldchain'&&r.status==='completed');
/** Sperrgutangebote möglich (0.15 S2): Staplerplatz am Standort site oder ab Spieltag TERMS.ware.bulky.fromDay. */
export const bulkyUnlocked=(s,site=s.selectedSite)=>s.buildings.some(b=>b.type==='forklift'&&b.site===site)||Math.floor(s.t/1440)+1>=TERMS.ware.bulky.fromDay;
export const airUnlocked=(s,site=s.selectedSite)=>(s.buildings.some(b=>b.type==='dock'&&b.site===site)&&s.vehicles.some(v=>v.site===site&&(v.type==='truck'||v.type==='van')))||Math.floor(s.t/1440)+1>=TERMS.air.fromDay;

/** Standort eines Zustellgebiets (W3-S1). Gebiete ohne Feld (bis 0.11) liegen am Vertragsstandort. */
export const laneSite=(k,lane)=>lane?.site??k?.site;
/** Zustellstandort eines Auftrags (W3-S1). Aufträge ohne Feld werden am Annahme-Hub order.site zugestellt. */
export const deliverySiteOf=o=>o?.deliverySite??o?.site;
/** Distanz zwischen zwei Standorten in km, wie Standorttransfer (transport.js): mindestens 15 km. */
export function siteDistance(s,fromId,toId){
 const a=s.sites.find(x=>x.id===fromId),b=s.sites.find(x=>x.id===toId);if(!a||!b)return null;
 return Math.max(15,Math.round(Math.hypot(b.x-a.x,b.y-a.y)));
}
/** Preis- und Fristzuschlag für ein Fremdgebiet (W3-S1, TERMS.remote). */
export function remoteTerms(s,unit,fromId,toId){
 const km=siteDistance(s,fromId,toId),R=TERMS.remote,[p0,pk]=R.price[unit==='pallet'?'pallet':'parcel'];
 return {distance:km,surcharge:cents(p0+pk*km),extraSla:Math.ceil((R.sla[0]+R.sla[1]*km)/R.slaStep)*R.slaStep};
}

const pick=(api,list)=>list[Math.floor(api.random()*list.length)];
const int=(api,min,max)=>min+Math.floor(api.random()*(max-min+1));
const cents=n=>Math.round(n*100)/100;

/** Deterministisches Angebot aus api.random. small=true: Startangebot (1 Ankunft/Tag, 200–250 Pakete).
 *  pallet=true: Palettenvertrag; zieht genau so viele Zufallszahlen wie ein Paketangebot (Zufallsstrom bleibt gleich). */
function makeOffer(s,api,small=false,pallet=false,container=false,air=false,ware=null){
 if(container)return makeContainerOffer(s,api);
 const T=pallet?TERMS.pallet:air?TERMS.air:ware?TERMS.ware[ware]:TERMS.offer,unit=pallet?'pallet':air?'air':'parcel',pen=TERMS.penalty[pallet?'pallet':ware||'parcel'];
 const shipper=pick(api,SHIPPERS),laneCount=small?int(api,1,2):int(api,1,3),names=[...LANES],lanes=[];
 for(let i=0;i<laneCount;i++){const name=names.splice(Math.floor(api.random()*names.length),1)[0];lanes.push({id:`lane-${i+1}`,name,distance:int(api,15,45)});}
 // Anteile in Zwanzigsteln, jedes Gebiet mindestens 5/20; Summe exakt 1.
 const parts=lanes.map(()=>5);let rest=20-5*lanes.length;while(rest-->0)parts[Math.floor(api.random()*parts.length)]++;
 const laneShare=parts.map(p=>p/20);
 const arrivalCount=small?1:int(api,1,2),minutes=[...ARRIVAL_MINUTES],arrivals=[];
 for(let i=0;i<arrivalCount;i++){const minute=small?pick(api,TERMS.start.minutes):minutes.splice(Math.floor(api.random()*minutes.length),1)[0];arrivals.push({minute,parcels:small?int(api,...TERMS.start.parcels)*10:pallet||ware==='bulky'?int(api,...T.units):int(api,...T.parcels)*10});}
 arrivals.sort((a,b)=>a.minute-b.minute);
 const id=api.id('contract');
 // Zufallszüge in fester Reihenfolge: Preis, Frist (bei Luftexport: Flugplan), Laufzeit.
 const price=small?TERMS.start.price:cents(T.price[0]+int(api,0,T.price[2])*T.price[1]+(T.surcharge||0)),sla=small?null:int(api,...T.sla),days=small?TERMS.start.days:int(api,...T.days);
 // pricePerParcel = Preis je Einheit (Paket bzw. Palette); arrivals[].parcels = Einheiten je Ankunft (Feldnamen bleiben für Altstände).
 const k={id,shipper,site:s.selectedSite,status:'offer',unit,lanes,arrivals,laneShare,
  pricePerParcel:price,slaMinutes:small?TERMS.start.sla:air?TERMS.air.minLead:sla*60,
  durationDays:days,penaltyLate:pen.late,penaltyOpen:pen.open,offeredAt:s.t,expiresAt:s.t+OFFER_VALIDITY,
  startT:null,endT:null,acceptedAt:null,issued:0,lastEta:null};
 if(air){
  // W3c-S1: ein Gebiet „Luftfracht“ am Annahme-Hub (deliverySite = Hub), Flugplan aus dem Fristzug. Keine Fremdgebietszüge.
  const A=TERMS.air;
  Object.assign(k,{lanes:[{id:'lane-1',name:`Luftfracht ${AIRPORT.short}`,distance:airportDistance(s,k.site)}],laneShare:[1],
   flights:[...A.flightPlans[sla]],cutoff:A.cutoff,penaltyMissed:A.penaltyMissed});
  return k;
 }
 if(ware){k.content=ware;if(T.surcharge)k.surcharge=T.surcharge;}
 assignLaneSites(s,api,k,small);
 return k;
}

/** W3b-S1: Containerangebot (Seeimport). Gebiete, Anteile und Ankunftsminuten wie Folgeangebote; Inhalt, Einheiten je Container,
 *  Containerzahl je Ankunft, Inhaltspreis und Handling aus TERMS.container. Entsteht nur, wenn containersUnlocked gilt; Paket- und
 *  Palettenangebote bleiben davon unberührt (Spiele ohne Containerfreigabe ziehen dieselben Zufallszahlen wie bis 0.12). */
function makeContainerOffer(s,api){
 const C=TERMS.container,content=api.random()<0.5?'pallet':'parcel',CT=C.content[content],pen=TERMS.penalty[content];
 const shipper=pick(api,SHIPPERS),laneCount=int(api,1,3),names=[...LANES],lanes=[];
 for(let i=0;i<laneCount;i++){const name=names.splice(Math.floor(api.random()*names.length),1)[0];lanes.push({id:`lane-${i+1}`,name,distance:int(api,15,45)});}
 const parts=lanes.map(()=>5);let rest=20-5*lanes.length;while(rest-->0)parts[Math.floor(api.random()*parts.length)]++;
 const unitsPerContainer=int(api,...CT.units)*(content==='parcel'?10:1);
 const arrivalCount=int(api,...C.arrivals),minutes=[...ARRIVAL_MINUTES],arrivals=[];
 for(let i=0;i<arrivalCount;i++){const minute=minutes.splice(Math.floor(api.random()*minutes.length),1)[0],containers=int(api,...C.containers);arrivals.push({minute,containers,parcels:containers*unitsPerContainer});}
 arrivals.sort((a,b)=>a.minute-b.minute);
 const id=api.id('contract');
 const k={id,shipper,site:s.selectedSite,status:'offer',unit:'container',content,unitsPerContainer,lanes,arrivals,laneShare:parts.map(p=>p/20),
  pricePerParcel:cents(CT.price[0]+int(api,0,CT.price[2])*CT.price[1]),pricePerContainer:cents(C.handling[0]+int(api,0,C.handling[2])*C.handling[1]),
  freeMinutes:C.freeMinutes,demurragePerHour:C.demurragePerHour,slaMinutes:int(api,...C.sla)*60,durationDays:int(api,...C.days),
  penaltyLate:pen.late,penaltyOpen:pen.open,offeredAt:s.t,expiresAt:s.t+OFFER_VALIDITY,startT:null,endT:null,acceptedAt:null,issued:0,lastEta:null};
 assignLaneSites(s,api,k,false);
 return k;
}

/** W3-S1: Gebiete Standorten zuordnen. Nur bei ≥ 2 Standorten und nur für Folgeangebote; zusätzliche Zufallszüge erst NACH allen
 *  bisherigen Zügen, damit Ein-Standort-Spiele denselben Zufallsstrom und denselben Zustand (ohne neue Felder) behalten.
 *  Mischverträge sind erlaubt: Teil der Gebiete am Annahme-Hub (Gebietsstandort = Vertragsstandort), Teil an anderen Standorten. */
function assignLaneSites(s,api,k,small){
 if(small||s.sites.length<2)return;
 const others=s.sites.filter(x=>x.id!==k.site);if(!others.length)return;
 for(const lane of k.lanes){
  if(api.random()<TERMS.remote.chance){
   const to=others[Math.floor(api.random()*others.length)].id,r=remoteTerms(s,itemOf(k),k.site,to);
   Object.assign(lane,{site:to,surcharge:r.surcharge,extraSla:r.extraSla});
  }else Object.assign(lane,{site:k.site});
 }
}

/** Eigener Zufall für Luftangebote (W3c-S1): mulberry32 aus Seed und Spielminute, liest s.seed nur. Deterministisch über
 *  Speichern/Laden, ohne den gemeinsamen Zufallsstrom api.random zu verschieben. */
export function airRandom(s){return slotRandom(s,0);}
/** Wie airRandom mit Salz (0.15 S2 Warenangebote: WARE_SALT), damit sich die Ströme der Angebotsplätze unterscheiden. */
const WARE_SALT=0x5bd1e995;
export function slotRandom(s,salt){
 let a=(s.seed^Math.imul(s.t,2654435761)^salt)>>>0;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
/** Verteilt parcels nach Anteil (größter Rest, bei Gleichstand niedrigerer Index). Ganzzahlig, Summe exakt = parcels. */
export function splitParcels(parcels,shares){
 const raw=shares.map(x=>x*parcels),qty=raw.map(Math.floor);let rest=parcels-qty.reduce((a,b)=>a+b,0);
 const order=raw.map((x,i)=>[x-Math.floor(x),i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
 for(let k=0;rest>0;k=(k+1)%order.length,rest--)qty[order[k][1]]++;
 return qty;
}

/** Übergabe an yard.schedule. W3b-S1: Containerankunft zusätzlich mit kind 'container', containers (Anzahl), unitsPerContainer,
 *  content (= item); parcels bleibt der gesamte Inhalt (containers × unitsPerContainer). Hofbehandlung in containers.js/yard.js. */
export function arrivalPayload(c,arrival,eta,orderIds=[],lanes=[]){
 return {contractId:c.id,site:c.site,parcels:arrival.parcels,unit:unitOf(c),item:itemOf(c),eta,orderIds,lanes,
  ...(unitOf(c)==='container'?{kind:'container',containers:arrival.containers,unitsPerContainer:c.unitsPerContainer,content:itemOf(c)}:{})};
}
function issue(s,api,c,arrival,eta){
 const qty=splitParcels(arrival.parcels,c.laneShare),orderIds=[],lanes=[];
 c.lanes.forEach((lane,i)=>{if(qty[i]<1)return;const id=api.id('order');
  // W3-S1: Fremdgebiet → Zuschlag auf Preis und Frist, deliverySite = lane.site. Gebiete ohne site (Altstände, Ein-Standort-Spiele)
  // erzeugen Aufträge ohne deliverySite (Zustellung am Annahme-Hub order.site, Zustand bitgleich zu 0.11).
  const o={id,kind:'logistics',source:'hub',contractId:c.id,lane:lane.id,customer:`${lane.name} (${c.shipper})`,item:itemOf(c),qty:qty[i],price:cents(c.pricePerParcel+(lane.surcharge||0)),due:eta+c.slaMinutes+(lane.extraSla||0),quality:0,site:c.site,status:'active',delivered:0,paid:0};
  if(lane.site!==undefined)o.deliverySite=lane.site;
  // W3c-S1: Luftexport bucht den frühesten Flug mit Annahmeschluss ≥ Ankunft + minLead; Frist = dessen Annahmeschluss.
  if(unitOf(c)==='air'){o.airExport=true;o.flightT=nextFlight(c.flights,c.cutoff,eta+TERMS.air.minLead);o.due=o.flightT-c.cutoff;}
  s.orders.push(o);
  orderIds.push(id);lanes.push({lane:lane.id,orderId:id,qty:qty[i]});});
 c.issued++;c.lastEta=eta;
 const container=unitOf(c)==='container',payload=arrivalPayload(c,arrival,eta,orderIds,lanes);
 if(typeof yardApi.schedule==='function')yardApi.schedule(s,api,payload);
 else api.log('warning',`Hof-Planung fehlt: Ankunft ${c.shipper} (${arrival.parcels} ${unitWord(c,arrival.parcels)}) nur als Aufträge angelegt.`,[c.id,...orderIds]);
 if(container)api.log('contract',`${c.shipper}: Containerchassis mit ${arrival.containers} ${arrival.containers===1?'Container':'Containern'} (${arrival.parcels} ${unitWord(c,arrival.parcels)}) angekündigt, Ankunft ${clock(eta)}.`,[c.id,...orderIds]);
 else api.log('contract',`${c.shipper}: Lkw mit ${arrival.parcels} ${wareOf(c)?unitWord(c,arrival.parcels):unitOf(c)==='pallet'?(arrival.parcels===1?'Palette':'Paletten'):(arrival.parcels===1?'Paket':'Paketen')} angekündigt, Ankunft ${clock(eta)}.`,[c.id,...orderIds]);
}
/** Logtext für Fremdgebiete: „Zustellung ab <Standort>“ je Gebiet an anderem Standort. */
function remoteText(s,k){
 const remote=k.lanes.filter(l=>laneSite(k,l)!==k.site);if(!remote.length)return '';
 return ' Hauptlauf nötig: '+remote.map(l=>`${l.name} ab ${s.sites.find(x=>x.id===l.site)?.name||l.site}`).join(', ')+'.';
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
  if(k.lanes.some(l=>!s.sites.some(x=>x.id===laneSite(k,l))))return {ok:false,message:'Standort eines Zustellgebiets fehlt.'};
  k.status='active';k.acceptedAt=s.t;k.startT=s.t+START_DELAY;k.endT=k.startT+k.durationDays*1440;
  // Angebote aus Ständen bis 0.9 erhalten bei Annahme Einheit und Strafsätze (bereits laufende Altverträge bleiben ohne Strafe).
  k.unit??='parcel';const pen=TERMS.penalty[itemOf(k)];k.penaltyLate??=pen.late;k.penaltyOpen??=pen.open;
  const air=unitOf(k)==='air'?` Luftexport zum ${AIRPORT.name}: Flüge ${k.flights.map(clock).join(', ')}, Annahmeschluss ${k.cutoff} Min. vor Abflug, ${k.penaltyMissed.toFixed(2)} € Strafe je Paket und verpasstem Flug.`:'';
  const cont=unitOf(k)==='container'?` Handling ${k.pricePerContainer.toFixed(2)} € je Container, Freizeit ${Math.round(k.freeMinutes/60)} Std., danach Lagergeld ${k.demurragePerHour.toFixed(2)} €/Std. je Container.`:'';
  api.log('contract',`Vertrag mit ${k.shipper} angenommen: ${k.arrivals.map(a=>`${a.containers?`${a.containers} × Container (`:''}${a.parcels} ${unitWord(k,a.parcels)}${a.containers?')':''} um ${clock(a.minute)}`).join(', ')} täglich, ${k.durationDays} Tage.${cont}${air}${remoteText(s,k)} Vertragsstrafe ${k.penaltyLate.toFixed(2)} € je verspätete, ${k.penaltyOpen.toFixed(2)} € je nicht zugestellte Einheit.`,[k.id]);
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
 // QS-W1-04 (A01): Stand ohne jeden Vertrag (z. B. migrierter 0.8-Stand, fromJSON ruft kein init) erhält sofort ein
 // Startangebot wie init – deterministisch aus api.random, unabhängig von Laden/Neuladen (Bedingung nur aus dem Zustand).
 if(!list.length){const k=makeOffer(s,api,true);list.push(k);api.log('contract',`Neues Vertragsangebot: ${k.shipper}.`,[k.id]);}
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
 if(s.t%OFFER_INTERVAL===OFFER_PHASE&&list.filter(k=>k.status==='offer'&&unitOf(k)!=='air'&&!wareOf(k)).length<MAX_OFFERS){
  // Höchstens ein offenes Paletten- und ein offenes Containerangebot; Auswahl ohne Zufallszug, Paletten zuerst (Verhalten bis 0.12 bleibt).
  const pallet=palletsUnlocked(s)&&!list.some(k=>k.status==='offer'&&unitOf(k)==='pallet');
  const container=!pallet&&containersUnlocked(s)&&!list.some(k=>k.status==='offer'&&unitOf(k)==='container');
  const offer=makeOffer(s,api,false,pallet,container);list.push(offer);api.log('contract',`Neues Vertragsangebot${pallet?' (Paletten)':container?` (Seeimport, Container mit ${offer.content==='pallet'?'Paletten':'Paketen'})`:''}: ${offer.shipper}.`,[offer.id]);
 }
 // W3c-S1: eigener Luftexport-Angebotsplatz. Vor Freischaltung kein Zugriff auf Zufall, IDs oder Zustand.
 if(s.t%1440===TERMS.air.phase&&airUnlocked(s)&&!list.some(k=>k.status==='offer'&&unitOf(k)==='air')){
  const offer=makeOffer(s,{random:airRandom(s),id:api.id},false,false,false,true);list.push(offer);
  api.log('contract',`Neues Vertragsangebot (Luftexport ${AIRPORT.short}, Flüge ${offer.flights.map(clock).join(', ')}): ${offer.shipper}.`,[offer.id]);
 }
 // 0.15 S2: eigener Warenarten-Angebotsplatz. Vor Freischaltung kein Zugriff auf Zufall, IDs oder Zustand.
 if(s.t%1440===TERMS.ware.phase&&!list.some(k=>k.status==='offer'&&wareOf(k))){
  const cold=coldUnlocked(s),bulky=bulkyUnlocked(s);
  if(cold||bulky){
   const random=slotRandom(s,WARE_SALT),ware=cold&&bulky?(random()<0.5?'parcel_cold':'bulky'):cold?'parcel_cold':'bulky';
   const offer=makeOffer(s,{random,id:api.id},false,false,false,false,ware);list.push(offer);
   api.log('contract',`Neues Vertragsangebot (${ware==='bulky'?'Sperrgut: Stapler und Lkw nötig':`Kühlpakete: Kühllager und Kühlfahrzeug nötig, Zuschlag ${offer.surcharge.toFixed(2)} € je Paket`}): ${offer.shipper}.`,[offer.id]);
  }
 }
 containerMoney(s,api);
 latePenalties(s,api);
 for(const k of list)if(k.status==='ended'&&!k.settled&&Number.isFinite(k.penaltyOpen)&&s.t>=k.endT+TERMS.penalty.openGrace)settle(s,api,k);
}

/** W3b-S1 Containergeld. Liest s.containers (Datensätze von containers.js, nur lesend):
 *  Lagergeld: je volle Stunde von container.demurrageMinutes ein Satz contract.demurragePerHour, Schlüssel demurrage:<id>:<n>
 *  (n = 1, 2, …; Pflichtbuchung wie Strafen, darf ins Minus). Nachholen nach Laden/Sprung: absteigend bis zur ersten vorhandenen Stunde.
 *  Handling: Status empty/pickup/gone (vollständig entladen) → einmalig contract.pricePerContainer als Umsatz, container-handling:<id>. */
const HANDLED=new Set(['empty','pickup','gone']);
function containerMoney(s,api){
 const rows=s.containers;if(!rows?.length)return;
 for(const c of rows){
  const k=s.contracts.find(k=>k.id===c.contractId);if(!k||unitOf(k)!=='container')continue;
  const hours=Math.floor((Number.isFinite(c.demurrageMinutes)?c.demurrageMinutes:0)/60);
  if(hours>0&&k.demurragePerHour>0)for(let n=hours;n>=1;n--)
   if(!api.book(`demurrage:${c.id}:${n}`,-k.demurragePerHour,'Lagergeld',`Lagergeld ${k.shipper}: Container ${c.id}, Stunde ${n} nach Freizeit`,[k.id,c.id]))break;
  if(HANDLED.has(c.status)&&k.pricePerContainer>0&&!(c.unloaded<c.qty)&&api.book(`container-handling:${c.id}`,k.pricePerContainer,'Umsatz',`Containerhandling ${k.shipper}: ${c.id} entladen`,[k.id,c.id]))
   api.log('payment',`Containerhandling ${k.shipper}: ${k.pricePerContainer.toFixed(2)} € für ${c.id}.`,[k.id,c.id]);
 }
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
 if((s.containers||[]).some(c=>c.orderIds?.includes(o.id)&&!HANDLED.has(c.status))){o.settleWait='Container im Hof';return false;}
 const batches=s.batches.filter(b=>b.owner===o.id&&b.qty>0);
 if(batches.some(b=>b.reserved>0||b.location==='vehicle')){o.settleWait='Ware reserviert';return false;}
 const parts=[];for(const b of batches){const part=api.inventory.remove(b.id,b.qty);if(part)parts.push(part);}
 const returned=parts.reduce((n,p)=>n+p.qty,0),open=Math.max(0,o.qty-o.delivered),amount=o.missedFlights?0:cents(open*k.penaltyOpen);/* QS-W3c-01: keine zweite Strafe nach Flugstrafe */
 if(amount>0)api.book(`penalty-open:${o.id}`,-amount,'Vertragsstrafe',`Vertragsstrafe ${k.shipper}: ${open} ${unitWord(k,open)} nicht zugestellt`,[k.id,o.id]);
 o.status='cancelled';o.cancelReason='contractEnd';o.returnedQty=returned;o.penaltyOpen=amount;delete o.settleWait;
 api.log('warning',`Vertragsende ${k.shipper}: ${open} ${unitWord(k,open)} nicht zugestellt (${o.customer}), Strafe ${amount.toFixed(2)} €; ${returned} ${unitWord(k,returned)} an Versender zurückgegeben.`,[k.id,o.id,...parts.map(p=>p.id)]);
 return true;
}

export function validate(s){
 const bad=m=>{throw new Error('Spielstand ungültig: Vertrag '+m);};
 const num=(n,min=-Infinity)=>typeof n==='number'&&Number.isFinite(n)&&n>=min;
 const sites=new Set(s.sites.map(x=>x.id));let offers=0,airOffers=0,wareOffers=0;
 for(const k of s.contracts){
  if(!k||typeof k.id!=='string'||typeof k.shipper!=='string'||!k.shipper||!sites.has(k.site)||!STATUSES.includes(k.status))bad('Grunddaten beschädigt.');
  if(k.status==='offer'){if(k.unit==='air')airOffers++;else if(wareOf(k))wareOffers++;else offers++;}
  if(!Array.isArray(k.lanes)||k.lanes.length<1||k.lanes.length>3)bad('Zustellgebiete beschädigt.');
  const laneIds=new Set();for(const l of k.lanes){if(!l||typeof l.id!=='string'||laneIds.has(l.id)||typeof l.name!=='string'||!l.name||!num(l.distance,Number.EPSILON))bad('Zustellgebiet beschädigt.');laneIds.add(l.id);
   if((l.site!==undefined&&!sites.has(l.site))||(l.surcharge!==undefined&&!num(l.surcharge,0))||(l.extraSla!==undefined&&(!Number.isInteger(l.extraSla)||l.extraSla<0)))bad('Standort/Zuschlag eines Zustellgebiets beschädigt.');}
  if(!Array.isArray(k.laneShare)||k.laneShare.length!==k.lanes.length||k.laneShare.some(x=>!num(x,0)||x>1)||Math.abs(k.laneShare.reduce((a,b)=>a+b,0)-1)>1e-9)bad('Gebietsanteile beschädigt.');
  if(!Array.isArray(k.arrivals)||k.arrivals.length<1||k.arrivals.length>3||k.arrivals.some(a=>!a||!Number.isInteger(a.minute)||a.minute<0||a.minute>1439||!Number.isInteger(a.parcels)||a.parcels<1)||new Set(k.arrivals.map(a=>a.minute)).size!==k.arrivals.length)bad('Ankunftsplan beschädigt.');
  if(!num(k.pricePerParcel,0)||!Number.isInteger(k.slaMinutes)||k.slaMinutes<1||!Number.isInteger(k.durationDays)||k.durationDays<1)bad('Konditionen beschädigt.');
  if(k.status==='offer'&&(k.acceptedAt!=null||k.startT!=null||!num(k.expiresAt,0)))bad('Angebot beschädigt.');
  if(k.status!=='offer'&&(!num(k.acceptedAt,0)||!num(k.startT,0)||!num(k.endT,0)||k.startT<k.acceptedAt||k.acceptedAt>s.t))bad('Laufzeit beschädigt.');
  if(!Number.isInteger(k.issued??0)||(k.issued??0)<0||(k.lastEta!=null&&!num(k.lastEta,0)))bad('Ankunftszähler beschädigt.');
  if(k.unit!==undefined&&!UNITS.includes(k.unit))bad('Einheit beschädigt.');
  if(k.unit==='container'){
   const C=TERMS.container;
   if(!CONTENTS.includes(k.content)||!Number.isInteger(k.unitsPerContainer)||k.unitsPerContainer<1)bad('Containerinhalt beschädigt.');
   if(k.arrivals.some(a=>!Number.isInteger(a.containers)||a.containers<C.containers[0]||a.containers>C.containers[1]||a.parcels!==a.containers*k.unitsPerContainer))bad('Containerankunft beschädigt.');
   if(!num(k.pricePerContainer,0)||!Number.isInteger(k.freeMinutes)||k.freeMinutes<0||!num(k.demurragePerHour,0))bad('Containerkonditionen beschädigt.');
  }else if((k.content!==undefined&&!(k.unit==='parcel'&&WARES.includes(k.content)))||k.unitsPerContainer!==undefined||k.pricePerContainer!==undefined||k.arrivals.some(a=>a.containers!==undefined))bad('Containerfelder ohne Containervertrag.');
  if(k.surcharge!==undefined&&(wareOf(k)!=='parcel_cold'||!num(k.surcharge,0)))bad('Kühlzuschlag beschädigt.');
  if(k.unit==='air'){
   if(!Array.isArray(k.flights)||k.flights.length<1||k.flights.length>4||k.flights.some(m=>!Number.isInteger(m)||m<0||m>1439)||new Set(k.flights).size!==k.flights.length)bad('Flugplan beschädigt.');
   if(!Number.isInteger(k.cutoff)||k.cutoff<0||k.cutoff>720||!num(k.penaltyMissed,0)||k.lanes.some(l=>laneSite(k,l)!==k.site))bad('Luftexportkonditionen beschädigt.');
  }else if(k.flights!==undefined||k.cutoff!==undefined||k.penaltyMissed!==undefined)bad('Flugfelder ohne Luftexportvertrag.');
  if((k.penaltyLate!==undefined&&!num(k.penaltyLate,0))||(k.penaltyOpen!==undefined&&!num(k.penaltyOpen,0)))bad('Vertragsstrafe beschädigt.');
  if(k.settled!==undefined&&(typeof k.settled!=='boolean'||(k.settled&&k.status!=='ended')))bad('Abrechnung beschädigt.');
 }
 if(offers>MAX_OFFERS||airOffers>1||wareOffers>1)bad('zu viele offene Angebote.');
 const contracts=new Map(s.contracts.map(k=>[k.id,k]));
 for(const o of s.orders){
  if(o.deliverySite!==undefined&&!sites.has(o.deliverySite))bad('Zustellstandort Auftrag '+o.id+' fehlt.');
  if(o.contractId===undefined)continue;
  const k=contracts.get(o.contractId);
  if(!k||k.status==='offer')bad('fehlt für Auftrag '+o.id+'.');
  if(o.kind!=='logistics'||o.item!==itemOf(k)||!Number.isInteger(o.qty)||o.qty<1||!k.lanes.some(l=>l.id===o.lane)||o.site!==k.site)bad('Vertragsauftrag '+o.id+' beschädigt.');
  if(o.deliverySite!==undefined){const lane=k.lanes.find(l=>l.id===o.lane);if(!sites.has(o.deliverySite)||o.deliverySite!==laneSite(k,lane))bad('Zustellstandort Auftrag '+o.id+' beschädigt.');}
  if(o.returnedQty!==undefined&&(o.status!=='cancelled'||!num(o.returnedQty,0)))bad('Rückgabe Auftrag '+o.id+' beschädigt.');
  if((o.airExport===true)!==(unitOf(k)==='air'))bad('Luftexportkennung Auftrag '+o.id+' beschädigt.');
 }
}
