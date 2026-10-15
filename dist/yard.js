// Hof, Tor und Docks (A07). Schnittstelle: docs/SCHNITTSTELLEN-0.9-W1.md (W1-S2).
// Fremde Lkw durchlaufen approach→gate→queue→toDock→docking→unloading→exit→gone.
// Dock-Regel wie transport.js/tours.js/service.js: Dock frei, wenn type 'dock', enabled, condition>0 und ohne b.task.
// Belegung b.task=arrival.id von toDock bis Ende unloading. Eigene Abläufe prüfen ebenfalls !b.task → keine Doppelbelegung.
export const PHASES=['approach','gate','queue','toDock','docking','unloading','exit','gone'];
export const DURATION={approach:15,gate:2,toDock:2,docking:1,exit:3};
export const UNLOAD_RATE=20;        // Pakete je Minute (vorläufig, A06 Welle 1b)
export const SORT_RATE=4;           // Pakete je Minute für die atRisk-Schätzung (Sortierplatz 240/h)
export const KEEP_GONE=1440;        // abgefertigte Einträge bleiben einen Spieltag im Torbuch
export const WAIT={dock:'Kein freies Dock',staff:'Keine Lagerkraft am Standort',full:'Lager voll',dockOff:'Dock außer Betrieb'};
const AT_DOCK=new Set(['toDock','docking','unloading']);
const CARRIER_A=['Talgrund','Weidenstein','Ostheiden','Kranichmoor','Lerchental','Fuchsbrunn','Eschenfurt','Moorwiesen','Hohenkamp','Silberau'];
const CARRIER_B=['Spedition','Logistik','Transporte','Frachtdienst','Güterverkehr'];
const PLATE=['TGD','WST','OHD','KRM','LCT','FBR','ESF','MWS'];
const LETTERS='ABCDEFGHJKLMNPRSTUVWXYZ';

/** Einziges Kriterium für ein freies Dock (gemeinsam mit den eigenen Abläufen). */
export function isFreeDock(b,site){return b.type==='dock'&&b.site===site&&b.enabled&&b.condition>0&&!b.task;}
export function freeDock(s,site){return s.buildings.find(b=>isFreeDock(b,site))||null;}

export function init(s){s.yard??=[];}

const pick=(api,list)=>list[Math.floor(api.random()*list.length)%list.length];
// Größte-Reste-Verteilung: ganzzahlig, Summe exakt total, Verhältnis nach weights.
export function apportion(total,weights){
 const sum=weights.reduce((n,w)=>n+w,0);if(!(sum>0))return weights.map((_,i)=>i===0?total:0);
 const raw=weights.map(w=>total*w/sum),out=raw.map(Math.floor);let rest=total-out.reduce((n,x)=>n+x,0);
 const order=raw.map((r,i)=>[r-out[i],i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
 for(let k=0;rest>0;k=(k+1)%order.length,rest--)out[order[k][1]]++;
 return out;
}

/** Legt eine Ankunft an. Aufruf durch contracts.js zur Fälligkeit. */
export function schedule(s,api,{contractId,site,parcels,eta,orderIds=[],laneShare}={}){
 if(!s.sites.some(x=>x.id===site)||!Number.isInteger(parcels)||parcels<1||!Number.isInteger(eta))return null;
 const ids=Array.isArray(orderIds)?orderIds.filter(id=>typeof id==='string'):[];
 const orders=ids.map(id=>s.orders.find(o=>o.id===id));
 let weights;
 if(ids.length&&orders.every(Boolean))weights=orders.map(o=>o.qty);
 else if(ids.length&&Array.isArray(laneShare)&&laneShare.length===ids.length)weights=laneShare;
 else if(ids.length)weights=ids.map(()=>1);
 const targets=ids.length?apportion(parcels,weights):[parcels];
 const owners=ids.length?ids:[`contract:${contractId??'unbekannt'}`];
 const carrier=`${pick(api,CARRIER_A)} ${pick(api,CARRIER_B)}`;
 const plate=`${pick(api,PLATE)}-${pick(api,LETTERS.split(''))}${pick(api,LETTERS.split(''))} ${100+Math.floor(api.random()*9900)%9900}`;
 const a={id:api.id('arrival'),site,contractId:contractId??null,orderIds:ids,carrier,plate,parcels,
  phase:'approach',phaseStart:eta-DURATION.approach,phaseEnd:eta,eta,dock:null,waitReason:null,waitSince:null,
  unloaded:0,atRisk:false,forecast:null,gateAt:null,priority:false,
  split:owners.map((owner,i)=>({owner,target:targets[i],done:0}))};
 s.yard.push(a);api.log('yard',`${carrier} (${plate}) angekündigt: ${parcels} Pakete, Ankunft Minute ${eta}.`,[a.id]);
 updateRisk(s,a);
 return a;
}

function setPhase(a,phase,t){a.phase=phase;a.phaseStart=t;a.phaseEnd=DURATION[phase]&&phase!=='approach'?t+DURATION[phase]:null;a.waitReason=null;a.waitSince=null;}
function wait(a,reason,t){if(a.waitReason!==reason){a.waitReason=reason;a.waitSince=t;}}
function dockOf(s,a){return a.dock?s.buildings.find(b=>b.id===a.dock&&b.task===a.id)||null:null;}
function releaseDock(s,a){for(const b of s.buildings)if(b.task===a.id)b.task=null;a.dock=null;}
const usable=b=>b&&b.enabled&&b.condition>0;
// FIFO: vorgezogene zuerst, dann nach Ankunft am Tor, dann Anlagereihenfolge.
function queueOrder(s,site){return s.yard.map((a,i)=>[a,i]).filter(([a])=>a.site===site&&a.phase==='queue').sort((x,y)=>(y[0].priority-x[0].priority)||(x[0].gateAt-y[0].gateAt)||(x[1]-y[1])).map(([a])=>a);}

// Teilt n Pakete auf die Aufträge: jeweils an den Auftrag mit dem größten offenen Anteil. Monoton, Summe exakt.
function unloadMinute(s,api,a,n){
 const plan=new Map();
 for(let k=0;k<n;k++){let best=null,score=-1;for(const p of a.split){const open=p.target-p.done-(plan.get(p)||0);if(open<=0)continue;const f=open/p.target;if(f>score+1e-12){score=f;best=p;}}if(!best)break;plan.set(best,(plan.get(best)||0)+1);}
 let added=0;
 for(const p of a.split){const q=plan.get(p);if(!q)continue;
  const batch=api.inventory.add({item:'parcel',qty:q,site:a.site,location:'inbound',owner:p.owner,quality:100,unitCost:0,mergeKey:a.id});
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
 const unloadRest=Math.ceil((a.parcels-a.unloaded)/UNLOAD_RATE),t=s.t;let ready;
 const ahead=a.phase==='queue'?queueOrder(s,a.site).indexOf(a):0;
 const queueWait=ahead*Math.ceil(a.parcels/UNLOAD_RATE);
 switch(a.phase){
  case 'approach':ready=Math.max(t,a.phaseEnd)+DURATION.gate+DURATION.toDock+DURATION.docking+unloadRest;break;
  case 'gate':ready=Math.max(t,a.phaseEnd)+DURATION.toDock+DURATION.docking+unloadRest;break;
  case 'queue':ready=t+queueWait+DURATION.toDock+DURATION.docking+unloadRest;break;
  case 'toDock':ready=Math.max(t,a.phaseEnd)+DURATION.docking+unloadRest;break;
  case 'docking':ready=Math.max(t,a.phaseEnd)+unloadRest;break;
  case 'unloading':ready=t+unloadRest;break;
  default:ready=a.phaseStart;
 }
 const forecast=ready+Math.ceil(a.parcels/SORT_RATE),limit=due(s,a);
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

export function step(s,api){
 if(!s.yard?.length)return;const t=s.t;
 for(const a of s.yard){
  if(a.phase==='approach'&&t>=a.phaseEnd){setPhase(a,'gate',t);a.gateAt=t;}
  else if(a.phase==='gate'&&t>=a.phaseEnd){setPhase(a,'queue',t);}
  else if((a.phase==='toDock'||a.phase==='docking')){
   const b=dockOf(s,a);
   if(!usable(b)){releaseDock(s,a);setPhase(a,'queue',t);api.log('yard',`${a.plate}: Dock nicht verfügbar, zurück in die Warteschlange.`,[a.id]);}
   else if(t>=a.phaseEnd){if(a.phase==='toDock')setPhase(a,'docking',t);else setPhase(a,'unloading',t);}
  }
  else if(a.phase==='unloading'){
   const b=dockOf(s,a);
   if(!usable(b)){api.workforce.release(`${a.id}:warehouse`);wait(a,WAIT.dockOff,t);}
   else{
    const worker=api.workforce.acquire('warehouse',a.site,`${a.id}:warehouse`);
    if(!worker)wait(a,WAIT.staff,t);
    else{
     worker.activity=`Entlädt ${a.plate}`;
     const r=unloadMinute(s,api,a,Math.min(UNLOAD_RATE,a.parcels-a.unloaded));
     if(r.full){wait(a,WAIT.full,t);if(!r.added)api.workforce.release(`${a.id}:warehouse`);}
     else{a.waitReason=null;a.waitSince=null;}
    }
   }
   if(a.unloaded>=a.parcels){api.workforce.release(`${a.id}:warehouse`);releaseDock(s,a);setPhase(a,'exit',t);api.log('yard',`${a.plate}: ${a.parcels} Pakete entladen.`,[a.id]);}
  }
  else if(a.phase==='exit'&&t>=a.phaseEnd){setPhase(a,'gone',t);}
 }
 // Dock-Zuteilung je Standort in FIFO-Reihenfolge.
 const sites=new Set(s.yard.filter(a=>a.phase==='queue').map(a=>a.site));
 for(const site of sites){
  let blocked=false;
  for(const a of queueOrder(s,site)){
   const b=blocked?null:freeDock(s,site);
   if(!b){blocked=true;wait(a,WAIT.dock,t);continue;}
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
  if(!PHASES.includes(a.phase))fail('Phase');
  if(!s.sites.some(x=>x.id===a.site))fail('Standort');
  if(typeof a.carrier!=='string'||typeof a.plate!=='string')fail('Spediteur');
  if(!int(a.parcels,1)||!int(a.unloaded)||a.unloaded>a.parcels)fail('Paketmenge');
  if(!int(a.eta)||!int(a.phaseStart))fail('Zeitpunkt');
  if(a.phaseEnd!==null&&(!int(a.phaseEnd)||a.phaseEnd<a.phaseStart))fail('Phasenende');
  if(['queue','unloading','gone'].includes(a.phase)!==(a.phaseEnd===null))fail('Phasenende');
  if(a.waitReason!==null&&typeof a.waitReason!=='string')fail('Wartegrund');
  if(typeof a.atRisk!=='boolean'||typeof a.priority!=='boolean')fail('Gefährdung');
  if(a.phase!=='approach'&&!int(a.gateAt))fail('Torzeit');
  if(!Array.isArray(a.orderIds)||a.orderIds.some(id=>!s.orders.some(o=>o.id===id)))fail('Auftragsreferenz');
  if(!Array.isArray(a.split)||!a.split.length)fail('Verteilung');
  let done=0,target=0;for(const p of a.split){if(typeof p.owner!=='string'||!int(p.target)||!int(p.done)||p.done>p.target)fail('Verteilung');done+=p.done;target+=p.target;}
  if(target!==a.parcels||done!==a.unloaded)fail('Verteilungssumme');
  if(['exit','gone'].includes(a.phase)&&a.unloaded!==a.parcels)fail('Entladung unvollständig');
  if(['approach','gate'].includes(a.phase)&&a.unloaded)fail('Entladung vor Dock');
  if(AT_DOCK.has(a.phase)){
   const b=s.buildings.find(b=>b.id===a.dock);
   if(!b||b.type!=='dock'||b.site!==a.site||b.task!==a.id)fail('Dockbelegung');
   if(docks.has(b.id))fail('Doppelbelegung');docks.set(b.id,a.id);
  }else if(a.dock!==null)fail('Dock ohne Belegung');
 }
 for(const b of s.buildings)if(typeof b.task==='string'&&ids.has(b.task)&&docks.get(b.id)!==b.task)fail('Verwaiste Dockbelegung');
}
