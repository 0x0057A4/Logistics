// Hof, Tor und Docks (A07). Schnittstelle: docs/SCHNITTSTELLEN-0.9-W1.md (W1-S2).
// Fremde Lkw durchlaufen approach→gate→queue→toDock→docking→unloading→exit→gone.
// Dock-Regel wie transport.js/tours.js/service.js: Dock frei, wenn type 'dock', enabled, condition>0 und ohne b.task.
// Belegung b.task=arrival.id von toDock bis Ende unloading. Eigene Abläufe prüfen ebenfalls !b.task → keine Doppelbelegung.
import {workRate,UNLOAD_BASE,GATE_ROLE} from './workforce.js';
import {BUILDINGS,ITEMS} from './catalog.js';
import {coolingCapacity,coolingFree} from './special.js';
// W3b-S2: Containerchassis (a.kind==='container') nutzen approach→gate→queue→toYard→drop→exit→gone (Logik containers.js).
export const PHASES=['approach','gate','queue','toDock','docking','unloading','exit','gone'];
export const CONTAINER_PHASES=['approach','gate','queue','toYard','drop','exit','gone'];
export const DURATION={approach:15,gate:2,toDock:2,docking:1,exit:3,toYard:2,drop:2};
export const UNLOAD_RATE=UNLOAD_BASE; // Pakete je Minute einer Standardkraft; tatsächlich workRate(Kraft) (A06 W1b)
export const SORT_RATE=4;           // Pakete je Minute für die atRisk-Schätzung (Sortierplatz 240/h)
export const KEEP_GONE=1440;        // abgefertigte Einträge bleiben einen Spieltag im Torbuch
export const WAIT={gate:'Keine Torkontrolle',dock:'Kein freies Dock',staff:'Keine Lagerkraft am Standort',full:'Lager voll',dockOff:'Dock außer Betrieb'};
// W2-S2 Paletten (A05/A07): Ankunft mit a.item==='pallet' (nur gesetzt bei Paletten; Paketankünfte unverändert).
WAIT.forklift='Kein Stapler';WAIT.forkliftCharge='Stapler lädt';WAIT.forkliftPower='Kein Strom für Stapler';
// W3b-S2 Containerhof (A07/A05).
WAIT.yardFull='Containerhof voll';WAIT.noYard='Kein Containerhof';
/** Haken für containers.js (registriert beim Laden des Moduls; kein Importzyklus). schedule: Container-Ankunft anlegen;
 * step: Container-Chassis (queue/toYard/drop) und Containerumschlag – läuft in yard.step vor tickForklifts, damit
 * Staplernutzung in denselben Akkutakt fällt; holder(id): Staplerbindung eines Containers aktiv. */
export const containerHooks={schedule:null,step:null,holder:null};
export const isContainerArrival=a=>a.kind==='container';
export const PALLET='pallet';
export const PALLET_BASE=1; // Paletten je Minute einer Standardkraft mit Stapler; tatsächlich workRate(Kraft,1)
// 0.15 S2 Warenarten (A05/A08): Kühlpaket (a.item 'parcel_cold') entlädt nur in freie Kühlplätze (special.coolingFree) nach
// inbound und wird nur mit Kühllager sortiert; Sperrgut (a.item 'bulky') geht nie über Sortierer, sondern per Handumschlag
// (Lagerkraft + Stapler, BULKY_BASE je Minute vor workRate) direkt nach stock – Ablauf wie Paletten (forkItem).
export const COLD='parcel_cold',BULKY='bulky',BULKY_BASE=2;
/** Ware mit Staplerumschlag (Palette, Sperrgut): Entladen/Beladen nur mit Stapler + Lagerkraft, nie Sortierung. */
export const forkItem=item=>item===PALLET||item===BULKY;
/** Sonderware im Hof (a.item gesetzt); Paketankünfte tragen kein Feld (Altstände/Hashes unverändert). */
export const ARRIVAL_ITEMS=[PALLET,COLD,BULKY];
WAIT.coldMissing='Kühllager fehlt';WAIT.coldFull='Kühllager voll';WAIT.coldOff='Kühllager außer Betrieb';
/** Wartegrund für Kühlware ohne freien Kühlplatz am Standort. */
// QS-015-04: vorhandenes, aber abgeschaltetes/stromloses/defektes Kühllager eigens benennen.
export const coldWait=(s,site)=>coolingCapacity(s,site)>0?WAIT.coldFull:s.buildings.some(b=>b.type==='coldstore'&&b.site===site)?WAIT.coldOff:WAIT.coldMissing;
// B-0.15-1 (A01): Dockfreigabe bei Platzmangel. Ein Fremd-Lkw in unloading, der ohne Fortschritt auf Platz wartet
// (SPACE_WAIT, nicht Personal/Stapler/Dock), gibt sein Dock nach DOCK_YIELD Minuten frei, sobald ein eigenes Fahrzeug
// an diesem Standort auf ein Dock wartet (ownDockWaiting). Er kehrt mit Teilstand (unloaded/split bleiben) in die
// Warteschlange (phase 'queue', Wartegrund und waitSince bleiben). Kraft, Stapler und alle Docks der Bindung werden
// frei; das freigegebene Dock wird in derselben Minute keiner anderen Fremdankunft zugeteilt (eigene Abläufe laufen
// im Minutentakt vor yard). In der Warteschlange erhält eine Ankunft ohne Platz kein Dock, solange ein eigenes
// Fahrzeug am Standort auf ein Dock wartet; mit Platz oder ohne wartende eigene Fahrzeuge gilt FIFO wie bisher.
// Kein neues gespeichertes Feld; Mengen, Vertragsfrist und Strafen laufen über die bestehenden Pfade.
export const SPACE_WAIT=new Set([WAIT.full,WAIT.coldFull,WAIT.coldMissing,WAIT.coldOff]);
export const DOCK_YIELD=5;
// Wartetexte eigener Abläufe, wenn kein Dock frei ist (transport.js, tours.js, service.js, linehaul.js, airexport.js).
const OWN_DOCK_WAIT=[
 [s=>s.shipments,x=>x.status==='loading'?x.site:null,b=>b==='Warteschlange: freie Laderampe fehlt'],
 [s=>s.transfers,x=>x.status==='loading'?x.site:x.status==='unloading'?x.toSite:null,b=>typeof b==='string'&&b.startsWith('Freie Rampe am ')],
 [s=>s.tours,x=>x.status==='loading'||x.status==='returnUnloading'?x.site:null,b=>b==='Freie Laderampe fehlt'||b==='Freie Laderampe für Rückladung fehlt'],
 [s=>s.returns,x=>x.status==='unloading'?x.site:null,b=>b==='Freie Laderampe fehlt'],
 [s=>s.linehauls,x=>x.status==='loading'?x.from:x.status==='unloading'?x.to:null,b=>b==='Kein freies Dock'],
 [s=>s.airShuttles,x=>x.status==='loading'?x.site:null,b=>b==='Kein freies Dock'],
];
/** Anzahl eigener Fahrzeuge (Lieferung, Transfer, Sammeltour, Retoure, Linienfahrt, Luftshuttle), die am Standort auf ein
 * Dock warten (0 = keines). Liest die Wartetexte des laufenden Minutentakts. */
export function ownDockWaiting(s,site){
 let n=0;for(const [list,at,blocked] of OWN_DOCK_WAIT)for(const x of list(s)||[])if(x.blocked&&blocked(x.blocked)&&at(x)===site)n++;
 return n;
}
const BASE_OF=item=>item===PALLET?PALLET_BASE:item===BULKY?BULKY_BASE:UNLOAD_BASE;
const WORD={pallet:['Palette','Paletten'],parcel_cold:['Kühlpaket','Kühlpakete'],bulky:['Sperrgutstück','Sperrgutstücke']};
const word=(a,n)=>(WORD[a.item]||['Paket','Pakete'])[n===1?0:1];
const AT_DOCK=new Set(['toDock','docking','unloading']);
const CARRIER_A=['Talgrund','Weidenstein','Ostheiden','Kranichmoor','Lerchental','Fuchsbrunn','Eschenfurt','Moorwiesen','Hohenkamp','Silberau'];
const CARRIER_B=['Spedition','Logistik','Transporte','Frachtdienst','Güterverkehr'];
const PLATE=['TGD','WST','OHD','KRM','LCT','FBR','ESF','MWS'];
const LETTERS='ABCDEFGHJKLMNPRSTUVWXYZ';

/** Einziges Kriterium für ein freies Dock (gemeinsam mit den eigenen Abläufen). */
export function isFreeDock(b,site){return b.type==='dock'&&b.site===site&&b.enabled&&b.condition>0&&!b.task;}
export function freeDock(s,site){return s.buildings.find(b=>isFreeDock(b,site))||null;}

export function init(s){s.yard??=[];}
// Torkontrolle (A06 W1b): Phase gate braucht eine Lagerkraft (Schlüssel gateKey) für DURATION.gate Arbeitsminuten.
// a.gateDone zählt geleistete Minuten (fehlend = 0, alte Stände starten die Kontrolle neu); ohne Kraft wartet der Lkw
// mit WAIT.gate, phaseEnd zeigt dann das frühestmögliche Ende. Bindung nur während gate.
export const gateKey=a=>`${a.id}:gate`;
export const unloadKey=a=>`${a.id}:warehouse`;
const heldRate=(s,key,base=UNLOAD_BASE)=>{const w=s.workers.find(w=>w.task===key);return w?workRate(w,base):base;};
const isPallet=a=>forkItem(a.item); // Staplerumschlag (Palette oder Sperrgut)

// ── Staplerplatz (W2-S2) ─────────────────────────────────────────────────────────────────────────────────────
// Je Gebäude 'forklift' ein Stapler. b.charge 0–100 (fehlend = 100, beim ersten Takt gesetzt). Bindung exklusiv über
// b.task = forkliftKey(Vorgang) (Fremd-Lkw-Entladung `${arrival.id}:forklift`, Lieferung `${shipment.id}:forklift`,
// Sammeltour `${tour.id}:forklift`). Einsatzbereit: eingeschaltet, condition>0, Strom am Standort (Grundlast wie
// production.js: Standortenergie + Energieversorgung − Bedarf aller eingeschalteten Nebenanlagen ≥ 0) und Akku bereit.
// Hysterese (W2b): fällt charge unter 10, gilt b.charging=true (gespeichert) und der Stapler bleibt bis charge ≥ 30
// gesperrt (kein Minutentakt-Pendeln um 10). Feld fehlt = nicht im Ladezwang (Altstände).
// Akku: tickForklifts am Ende jeder Minute (yard.step läuft nach transport/tours): im Einsatz genutzt −0,5,
// sonst mit Strom +1 (max. 100). Nutzung meldet der Vorgang mit useForklift in derselben Minute (Laufzeitmarke, nicht
// gespeichert – zwischen zwei Minuten leer).
export const FORKLIFT={min:10,resume:30,work:0.5,charge:1,full:100};
export const forkliftKey=id=>`${id}:forklift`;
const forkUse=new WeakMap();
export function useForklift(s,b){let x=forkUse.get(s);if(!x||x.t!==s.t){x={t:s.t,ids:new Set()};forkUse.set(s,x);}x.ids.add(b.id);}
const usedNow=(s,b)=>{const x=forkUse.get(s);return !!x&&x.t===s.t&&x.ids.has(b.id);};
/** Strombilanz der Grundlast am Standort ≥ 0 (gleiche Rechnung wie production.js). */
export function sitePowered(s,site){
 const st=s.sites.find(x=>x.id===site);if(!st)return false;let bal=st.energy;
 for(const b of s.buildings){if(b.site!==site||!b.enabled)continue;const d=BUILDINGS[b.type];if(!d)continue;if(b.type==='power')bal+=d.energy||0;if(!d.recipes?.length)bal-=d.power||0;}
 return bal>=0;
}
const forkUsable=b=>b.enabled&&b.condition>0;
const charge=b=>b.charge??FORKLIFT.full;
/** Akku einsatzbereit: nicht im Ladezwang und charge ≥ min. */
const charged=b=>!b.charging&&charge(b)>=FORKLIFT.min;
/** Bindet bzw. hält den Stapler für key. Rückgabe {forklift} oder {forklift:null,reason}. Nicht mehr einsatzbereite
 * eigene Bindung wird gelöst (lädt dann frei weiter). */
export function acquireForklift(s,site,key){
 let held=null,any=false;for(const b of s.buildings)if(b.type==='forklift'&&b.task===key){held=b;break;}
 const powered=sitePowered(s,site);
 if(held){if(held.site===site&&forkUsable(held)&&powered&&charged(held))return {forklift:held};held.task=null;}
 let charging=false;
 for(const b of s.buildings){
  if(b.type!=='forklift'||b.site!==site||!forkUsable(b))continue;any=true;
  if(b.task||!powered)continue;if(!charged(b)){charging=true;continue;}
  b.charge=charge(b);b.task=key;return {forklift:b};
 }
 return {forklift:null,reason:!any?WAIT.forklift:!powered?WAIT.forkliftPower:charging?WAIT.forkliftCharge:WAIT.forklift};
}
/** Wie acquireForklift, aber nur lesend: wäre für key jetzt ein Stapler einsatzbereit? */
export function forkliftAvailable(s,site,key){
 const powered=sitePowered(s,site);if(!powered)return false;
 for(const b of s.buildings)if(b.type==='forklift'&&b.site===site&&forkUsable(b)&&(!b.task||b.task===key)&&charged(b))return true;
 return false;
}
export function releaseForklift(s,key){for(const b of s.buildings)if(b.type==='forklift'&&b.task===key)b.task=null;}
// Bindung gilt nur, solange der Vorgang in der Staplerphase ist; sonst (z. B. Abbruch durch Fremdmodul) gelöst.
function forkliftHolderActive(s,key){
 const id=key.slice(0,-':forklift'.length);
 return s.yard?.some(a=>a.id===id&&a.phase==='unloading')||!!containerHooks.holder?.(s,id)||s.shipments?.some(x=>x.id===id&&x.status==='loading')||(s.tours||[]).some(x=>x.id===id&&x.status==='loading')||(s.linehauls||[]).some(x=>x.id===id&&(x.status==='loading'||x.status==='unloading'));
}
export function tickForklifts(s){
 let power=null;
 for(const b of s.buildings){
  if(b.type!=='forklift')continue;
  if(b.charge===undefined)b.charge=FORKLIFT.full;
  if(b.task&&!forkliftHolderActive(s,b.task))b.task=null;
  if(usedNow(s,b))b.charge=Math.max(0,b.charge-FORKLIFT.work);
  else{power??=new Map();let p=power.get(b.site);if(p===undefined)power.set(b.site,p=sitePowered(s,b.site));
   if(p&&b.enabled&&b.charge<FORKLIFT.full)b.charge=Math.min(FORKLIFT.full,b.charge+FORKLIFT.charge);}
  if(b.charge<FORKLIFT.min)b.charging=true;else if(b.charging&&b.charge>=FORKLIFT.resume)delete b.charging;
 }
}

export const pick=(api,list)=>list[Math.floor(api.random()*list.length)%list.length];
// Größte-Reste-Verteilung: ganzzahlig, Summe exakt total, Verhältnis nach weights.
export function apportion(total,weights){
 const sum=weights.reduce((n,w)=>n+w,0);if(!(sum>0))return weights.map((_,i)=>i===0?total:0);
 const raw=weights.map(w=>total*w/sum),out=raw.map(Math.floor);let rest=total-out.reduce((n,x)=>n+x,0);
 const order=raw.map((r,i)=>[r-out[i],i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
 for(let k=0;rest>0;k=(k+1)%order.length,rest--)out[order[k][1]]++;
 return out;
}

/** Kennzeichen im Hofformat (gleiche Zufallszüge wie schedule). */
export function makePlate(api){return `${pick(api,PLATE)}-${pick(api,LETTERS.split(''))}${pick(api,LETTERS.split(''))} ${100+Math.floor(api.random()*9900)%9900}`;}
/** Legt eine Ankunft an. Aufruf durch contracts.js zur Fälligkeit. */
export function schedule(s,api,payload={}){
 const {contractId,site,parcels,eta,orderIds=[],laneShare}=payload;
 if(containerHooks.schedule&&(payload.kind==='container'||payload.unit==='container'||(s.contracts||[]).find(c=>c.id===contractId)?.unit==='container'))return containerHooks.schedule(s,api,payload);
 if(!s.sites.some(x=>x.id===site)||!Number.isInteger(parcels)||parcels<1||!Number.isInteger(eta))return null;
 const ids=Array.isArray(orderIds)?orderIds.filter(id=>typeof id==='string'):[];
 const orders=ids.map(id=>s.orders.find(o=>o.id===id));
 let weights;
 if(ids.length&&orders.every(Boolean))weights=orders.map(o=>o.qty);
 else if(ids.length&&Array.isArray(laneShare)&&laneShare.length===ids.length)weights=laneShare;
 else if(ids.length)weights=ids.map(()=>1);
 const targets=ids.length?apportion(parcels,weights):[parcels];
 const owners=ids.length?ids:[`contract:${contractId??'unbekannt'}`];
 const k=(s.contracts||[]).find(c=>c.id===contractId);
 const first=orders[0]?.item,item=ids.length?(ARRIVAL_ITEMS.includes(first)&&orders.every(o=>o?.item===first)?first:null):k?.unit===PALLET?PALLET:ARRIVAL_ITEMS.includes(k?.content)&&k?.unit!=='container'?k.content:null;
 const pallet=item===PALLET;
 const carrier=`${pick(api,CARRIER_A)} ${pick(api,CARRIER_B)}`;
 const plate=`${pick(api,PLATE)}-${pick(api,LETTERS.split(''))}${pick(api,LETTERS.split(''))} ${100+Math.floor(api.random()*9900)%9900}`;
 const a={id:api.id('arrival'),site,contractId:contractId??null,orderIds:ids,carrier,plate,parcels,
  phase:'approach',phaseStart:eta-DURATION.approach,phaseEnd:eta,eta,dock:null,waitReason:null,waitSince:null,
  unloaded:0,atRisk:false,forecast:null,gateAt:null,priority:false,
  split:owners.map((owner,i)=>({owner,target:targets[i],done:0})),...(item?{item}:{})};
 s.yard.push(a);api.log('yard',`${carrier} (${plate}) angekündigt: ${parcels} ${pallet?'Paletten':item?word(a,2):'Pakete'}, Ankunft Minute ${eta}.`,[a.id]);
 updateRisk(s,a);
 return a;
}

export function setPhase(a,phase,t){a.phase=phase;a.phaseStart=t;a.phaseEnd=DURATION[phase]&&phase!=='approach'?t+DURATION[phase]:null;a.waitReason=null;a.waitSince=null;}
export function wait(a,reason,t){if(a.waitReason!==reason){a.waitReason=reason;a.waitSince=t;}}
function dockOf(s,a){return a.dock?s.buildings.find(b=>b.id===a.dock&&b.task===a.id)||null:null;}
function releaseDock(s,a){for(const b of s.buildings)if(b.task===a.id)b.task=null;a.dock=null;}
const usable=b=>b&&b.enabled&&b.condition>0;
// QS-W1-03 (A01): Dock in docking/unloading abgeschaltet und anderes Dock frei → Wechsel: altes Dock frei, Phase toDock
// zum neuen Dock, Fortschritt unloaded bleibt (Kraft/Stapler löst der Aufrufer). Kein Dock frei → false (Wartegrund).
function switchDock(s,api,a,t){
 const n=freeDock(s,a.site);if(!n)return false;
 const from=a.dock;releaseDock(s,a);n.task=a.id;a.dock=n.id;setPhase(a,'toDock',t);
 api.log('yard',`${a.plate}: Dock außer Betrieb, wechselt zu freiem Dock.`,[a.id,from,n.id].filter(Boolean));return true;
}
// FIFO: vorgezogene zuerst, dann nach Ankunft am Tor, dann Anlagereihenfolge.
/** Platzmangel für die nächste Einheit der Ankunft (Wartegrund) oder null, wenn mindestens eine Einheit Platz hat. */
function spaceLack(s,api,a){
 if(a.item===COLD&&Math.floor(coolingFree(s,a.site)+1e-9)<1)return coldWait(s,a.site);
 return api.inventory.free(a.site)+1e-9<(ITEMS[a.item||'parcel']?.volume??0)?WAIT.full:null;
}
// B-0.15-1: Dock freigeben und mit Teilstand zurück in die Warteschlange; Wartegrund/waitSince bleiben sichtbar.
function yieldDock(s,api,a,t){
 const reason=a.waitReason,since=a.waitSince,from=a.dock;
 api.workforce.release(unloadKey(a));if(isPallet(a))releaseForklift(s,forkliftKey(a.id));
 releaseDock(s,a);setPhase(a,'queue',t);a.waitReason=reason;a.waitSince=since;
 api.log('yard',`${a.plate}: ${reason} – Dock für eigenes Fahrzeug freigegeben, ${a.unloaded}/${a.parcels} ${a.item?word(a,2):'Pakete'} entladen, wartet in der Warteschlange.`,[a.id,from].filter(Boolean));
 return from;
}
function queueOrder(s,site){return s.yard.map((a,i)=>[a,i]).filter(([a])=>a.site===site&&a.phase==='queue'&&!a.kind).sort((x,y)=>(y[0].priority-x[0].priority)||(x[0].gateAt-y[0].gateAt)||(x[1]-y[1])).map(([a])=>a);}

// Teilt n Pakete auf die Aufträge: jeweils an den Auftrag mit dem größten offenen Anteil. Monoton, Summe exakt.
export function unloadMinute(s,api,a,n,item='parcel',location='inbound'){
 const plan=new Map();
 for(let k=0;k<n;k++){let best=null,score=-1;for(const p of a.split){const open=p.target-p.done-(plan.get(p)||0);if(open<=0)continue;const f=open/p.target;if(f>score+1e-12){score=f;best=p;}}if(!best)break;plan.set(best,(plan.get(best)||0)+1);}
 let added=0;
 for(const p of a.split){const q=plan.get(p);if(!q)continue;
  const batch=api.inventory.add({item,qty:q,site:a.site,location,owner:p.owner,quality:100,unitCost:0,mergeKey:a.id});
  if(!batch)return {added,full:true};
  p.done+=q;a.unloaded+=q;added+=q;}
 return {added,full:false};
}

function due(s,a){
 const ds=a.orderIds.map(id=>s.orders.find(o=>o.id===id)?.due).filter(Number.isFinite);
 if(ds.length)return Math.min(...ds);
 const c=(s.contracts||[]).find(c=>c.id===a.contractId);
 return Number.isFinite(c?.slaMinutes)?a.eta+c.slaMinutes:null;
}
// Einfache Prognose: Restzeit im Hof + Warteschlange + Entladen + Sortieren.
function updateRisk(s,a){
 if(a.kind){a.atRisk=false;a.forecast=null;return;}
 const base=BASE_OF(a.item);
 const unloadRest=Math.ceil((a.parcels-a.unloaded)/heldRate(s,unloadKey(a),base)),t=s.t;let ready;
 const ahead=a.phase==='queue'?queueOrder(s,a.site).indexOf(a):0;
 const queueWait=ahead*Math.ceil(a.parcels/base);
 switch(a.phase){
  case 'approach':ready=Math.max(t,a.phaseEnd)+DURATION.gate+DURATION.toDock+DURATION.docking+unloadRest;break;
  case 'gate':ready=Math.max(t,a.phaseEnd)+DURATION.toDock+DURATION.docking+unloadRest;break;
  case 'queue':ready=t+queueWait+DURATION.toDock+DURATION.docking+unloadRest;break;
  case 'toDock':ready=Math.max(t,a.phaseEnd)+DURATION.docking+unloadRest;break;
  case 'docking':ready=Math.max(t,a.phaseEnd)+unloadRest;break;
  case 'unloading':ready=t+unloadRest;break;
  default:ready=a.phaseStart;
 }
 const forecast=ready+(isPallet(a)?0:Math.ceil(a.parcels/SORT_RATE)),limit=due(s,a); // Paletten: kein Sortieren
 a.forecast=forecast;
 if(['exit','gone'].includes(a.phase))return;
 a.atRisk=limit!=null&&forecast>limit;
}

export function handle(s,c,api){
 if(c.type!=='prioritizeArrival')return null;
 const a=s.yard.find(x=>x.id===c.id);if(!a)return {ok:false,message:'Ankunft nicht gefunden.'};
 if(!['approach','gate','queue'].includes(a.phase))return {ok:false,message:'Lkw ist bereits am Dock oder abgefertigt.'};
 if(a.priority)return {ok:false,message:'Ankunft ist bereits vorgezogen.'};
 a.priority=true;api.log('yard',`${a.plate}: Dockzuteilung vorgezogen.`,[a.id]);return {ok:true};
}

// Paletten/Sperrgut entladen: Stapler zuerst (ohne Stapler bleibt keine Lagerkraft gebunden), dann Lagerkraft; direkt nach stock.
function unloadPallets(s,api,a,t){
 const fk=forkliftKey(a.id),f=acquireForklift(s,a.site,fk);
 if(!f.forklift){api.workforce.release(unloadKey(a));wait(a,f.reason,t);return;}
 const worker=api.workforce.acquire('warehouse',a.site,unloadKey(a));
 if(!worker){releaseForklift(s,fk);wait(a,WAIT.staff,t);return;}
 worker.activity=`Entlädt ${a.plate} mit Stapler`;
 const r=unloadMinute(s,api,a,Math.min(workRate(worker,BASE_OF(a.item)),a.parcels-a.unloaded),a.item,'stock');
 if(r.added)useForklift(s,f.forklift);
 if(r.full){wait(a,WAIT.full,t);if(!r.added){api.workforce.release(unloadKey(a));releaseForklift(s,fk);}}
 else{a.waitReason=null;a.waitSince=null;}
}

export function step(s,api){
 stepYard(s,api);
 containerHooks.step?.(s,api);
 // Akku nach allen Staplernutzungen der Minute (transport/tours laufen vorher, Entladen oben).
 for(const b of s.buildings)if(b.type==='forklift'){tickForklifts(s);break;}
}
function stepYard(s,api){
 if(!s.yard?.length)return;const t=s.t;let yielded=null; // in dieser Minute freigegebene Docks (B-0.15-1)
 for(const a of s.yard){
  if(a.phase==='approach'&&t>=a.phaseEnd){setPhase(a,'gate',t);a.gateAt=t;a.gateDone=0;}
  else if(a.phase==='gate'){
   const worker=api.workforce.acquire(GATE_ROLE,a.site,gateKey(a));
   if(!worker){wait(a,WAIT.gate,t);a.phaseEnd=t+DURATION.gate-(a.gateDone||0);}
   else{
    worker.activity=`Torkontrolle ${a.plate}`;a.waitReason=null;a.waitSince=null;
    a.gateDone=(a.gateDone||0)+1;
    if(a.gateDone>=DURATION.gate){api.workforce.release(gateKey(a));delete a.gateDone;setPhase(a,'queue',t);}
   }
  }
  else if(a.phase==='toDock'){
   const b=dockOf(s,a);
   if(!usable(b)){releaseDock(s,a);setPhase(a,'queue',t);api.log('yard',`${a.plate}: Dock nicht verfügbar, zurück in die Warteschlange.`,[a.id]);}
   else if(t>=a.phaseEnd)setPhase(a,'docking',t);
  }
  else if(a.phase==='docking'){
   const b=dockOf(s,a);
   if(!usable(b)){if(!switchDock(s,api,a,t))wait(a,WAIT.dockOff,t);}
   else if(t>=a.phaseEnd)setPhase(a,'unloading',t);
  }
  else if(a.phase==='unloading'){
   const b=dockOf(s,a),before=a.unloaded;
   if(!usable(b)){api.workforce.release(`${a.id}:warehouse`);if(isPallet(a))releaseForklift(s,forkliftKey(a.id));if(!switchDock(s,api,a,t))wait(a,WAIT.dockOff,t);}
   else if(isPallet(a))unloadPallets(s,api,a,t);
   else{
    // Kühlpakete: nur bis zu den freien Kühlplätzen; ohne Platz wartet der Lkw ohne gebundene Lagerkraft.
    const room=a.item===COLD?Math.floor(coolingFree(s,a.site)+1e-9):Infinity;
    const worker=room<1?null:api.workforce.acquire('warehouse',a.site,`${a.id}:warehouse`);
    if(room<1){api.workforce.release(`${a.id}:warehouse`);wait(a,coldWait(s,a.site),t);}
    else if(!worker)wait(a,WAIT.staff,t);
    else{
     worker.activity=`Entlädt ${a.plate}`;
     const r=room===Infinity?unloadMinute(s,api,a,Math.min(workRate(worker,UNLOAD_BASE),a.parcels-a.unloaded)):unloadMinute(s,api,a,Math.min(workRate(worker,UNLOAD_BASE),a.parcels-a.unloaded,room),COLD);
     if(r.full){wait(a,WAIT.full,t);if(!r.added)api.workforce.release(`${a.id}:warehouse`);}
     else{a.waitReason=null;a.waitSince=null;}
    }
   }
   if(a.unloaded>=a.parcels){api.workforce.release(`${a.id}:warehouse`);if(isPallet(a))releaseForklift(s,forkliftKey(a.id));releaseDock(s,a);setPhase(a,'exit',t);api.log('yard',`${a.plate}: ${a.parcels} ${a.item?word(a,2):'Pakete'} entladen.`,[a.id]);}
   // B-0.15-1: je wartendem eigenen Fahrzeug höchstens ein Dock je Minute freigeben.
   else if(a.unloaded===before&&SPACE_WAIT.has(a.waitReason)&&t-a.waitSince>=DOCK_YIELD&&ownDockWaiting(s,a.site)>(yielded?.get(a.site)?.size||0)){
    yielded??=new Map();if(!yielded.has(a.site))yielded.set(a.site,new Set());yielded.get(a.site).add(yieldDock(s,api,a,t));}
  }
  else if(a.phase==='exit'&&t>=a.phaseEnd){setPhase(a,'gone',t);}
 }
 // Dock-Zuteilung je Standort in FIFO-Reihenfolge.
 const sites=new Set(s.yard.filter(a=>a.phase==='queue'&&!a.kind).map(a=>a.site));
 for(const site of sites){
  let blocked=false,own;
  for(const a of queueOrder(s,site)){
   // B-0.15-1: ohne Platz kein Dock vor wartenden eigenen Fahrzeugen (überspringt, ohne Nachfolger zu blockieren).
   own??=ownDockWaiting(s,site)>0;
   const lack=own?spaceLack(s,api,a):null;
   if(lack){wait(a,lack,t);continue;}
   const b=blocked?null:yielded?.has(site)?s.buildings.find(b=>isFreeDock(b,site)&&!yielded.get(site).has(b.id))||null:freeDock(s,site);
   if(!b){blocked=true;wait(a,own?WAIT.dock:spaceLack(s,api,a)||WAIT.dock,t);continue;} // ohne Platz bleibt der Platzgrund sichtbar
   b.task=a.id;a.dock=b.id;setPhase(a,'toDock',t);
  }
 }
 for(const a of s.yard)updateRisk(s,a);
 if(s.yard.some(a=>a.phase==='gone'&&t-a.phaseStart>KEEP_GONE))s.yard=s.yard.filter(a=>!(a.phase==='gone'&&t-a.phaseStart>KEEP_GONE));
}

export function validate(s){
 const fail=m=>{throw new Error('Hofdaten beschädigt: '+m);};
 if(!Array.isArray(s.yard))fail('Liste');
 const int=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
 const ids=new Set(s.yard.map(a=>a.id)),docks=new Map();
 for(const a of s.yard){
  if(!(a.kind?CONTAINER_PHASES:PHASES).includes(a.phase))fail('Phase');
  if(a.item!==undefined&&!ARRIVAL_ITEMS.includes(a.item))fail('Ladeeinheit');
  if(a.kind!==undefined&&a.kind!=='container')fail('Art');
  if(!s.sites.some(x=>x.id===a.site))fail('Standort');
  if(typeof a.carrier!=='string'||typeof a.plate!=='string')fail('Spediteur');
  if(!int(a.parcels,1)||!int(a.unloaded)||a.unloaded>a.parcels)fail('Paketmenge');
  if(!int(a.eta)||!int(a.phaseStart))fail('Zeitpunkt');
  if(a.phaseEnd!==null&&(!int(a.phaseEnd)||a.phaseEnd<a.phaseStart))fail('Phasenende');
  if(['queue','unloading','gone'].includes(a.phase)!==(a.phaseEnd===null))fail('Phasenende');
  if(a.waitReason!==null&&typeof a.waitReason!=='string')fail('Wartegrund');
  if(typeof a.atRisk!=='boolean'||typeof a.priority!=='boolean')fail('Gefährdung');
  if(a.phase!=='approach'&&!int(a.gateAt))fail('Torzeit');
  if(a.gateDone!==undefined&&(a.phase!=='gate'||!int(a.gateDone)||a.gateDone>=DURATION.gate))fail('Torkontrolle');
  if(!Array.isArray(a.orderIds)||a.orderIds.some(id=>!s.orders.some(o=>o.id===id)))fail('Auftragsreferenz');
  if(a.kind){}// Rest (Container, Bindungen) prüft containers.validate
  else{
  if(!Array.isArray(a.split)||!a.split.length)fail('Verteilung');
  let done=0,target=0;for(const p of a.split){if(typeof p.owner!=='string'||!int(p.target)||!int(p.done)||p.done>p.target)fail('Verteilung');done+=p.done;target+=p.target;}
  if(target!==a.parcels||done!==a.unloaded)fail('Verteilungssumme');
  }
  if(['exit','gone'].includes(a.phase)&&a.unloaded!==a.parcels)fail('Entladung unvollständig');
  if(['approach','gate'].includes(a.phase)&&a.unloaded)fail('Entladung vor Dock');
  if(AT_DOCK.has(a.phase)){
   const b=s.buildings.find(b=>b.id===a.dock);
   if(!b||b.type!=='dock'||b.site!==a.site||b.task!==a.id)fail('Dockbelegung');
   if(docks.has(b.id))fail('Doppelbelegung');docks.set(b.id,a.id);
  }else if(a.dock!==null)fail('Dock ohne Belegung');
 }
 for(const b of s.buildings)if(typeof b.task==='string'&&ids.has(b.task)&&docks.get(b.id)!==b.task)fail('Verwaiste Dockbelegung');
 // Staplerplätze (W2-S2): Akku 0–100, Bindung nur Staplerschlüssel, je Schlüssel höchstens ein Stapler.
 const forks=new Set();
 for(const b of s.buildings){
  if(b.type!=='forklift')continue;
  if(b.charge!==undefined&&!(typeof b.charge==='number'&&Number.isFinite(b.charge)&&b.charge>=0&&b.charge<=FORKLIFT.full))fail('Staplerakku');
  if(b.charging!==undefined&&b.charging!==true)fail('Staplerakku');
  if(b.task==null)continue;
  if(typeof b.task!=='string'||!b.task.endsWith(':forklift'))fail('Staplerbindung');
  if(forks.has(b.task))fail('Stapler doppelt gebunden');forks.add(b.task);
 }
}
