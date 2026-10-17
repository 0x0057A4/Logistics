// Containerhof und Seeimport (A07/A05, Welle 3b). Schnittstelle docs/SCHNITTSTELLEN-0.13-W3b.md (W3b-S2).
// Container {id,site,contractId,orderIds,content,qty,unloaded,status,arrivedAt,freeUntil,dock,split,teu,freeMinutes,
//  demurrageMinutes,priority,waitReason,waitSince,statusAt,moveEnd,arrivalId,emptyAt,pickupAt,pickupArrival,goneAt}.
// Status arriving → yard → toDock → unstuffing → empty → pickup → gone (nach KEEP_GONE entfernt).
// Anlieferung: yard.schedule mit kind:'container' (oder unit 'container' bzw. Vertrag unit 'container') landet hier.
//  Eingaben: containers (Anzahl; fehlt → ceil(Gesamtmenge/unitsPerContainer), sonst 1), parcels (Gesamtinhalt ohne Aufträge), unitsPerContainer (fehlt → Vertrag), content (fehlt → Vertrag, sonst
//  Auftrags-item), freeMinutes (fehlt → Vertrag, sonst 1440), orderIds (Inhalt je Auftrag; Summe der Auftragsmengen ist
//  die Gesamtmenge, sonst containers × unitsPerContainer). Mengen je Container gleichmäßig (größte Reste), Aufträge der
//  Reihe nach auf die Container verteilt (Summe exakt).
// Chassis = Hof-Ankunft {kind:'container',pickup,containerIds,parcels:Anzahl}: approach→gate (Torkontrolle wie Lkw)→
//  queue→toYard (2)→drop (2)→exit→gone. Anlieferung braucht freie TEU (Containerhof eingeschaltet, Zustand > 0), sonst
//  Wartegrund „Kein Containerhof“ bzw. „Containerhof voll“ (FIFO je Standort). Abholung braucht keine TEU.
// TEU-Belegung: Container yard/toDock/unstuffing/empty/pickup sowie angelieferte Container ab toYard. Der Hofplatz bleibt
//  auch während der Umfuhr zum Dock reserviert (Rückweg immer frei).
// Entladen automatisch, älteste zuerst (vorgezogene zuerst, dann arrivedAt, dann Anlagereihenfolge). Start nur wenn
//  freies Dock, Lagerraum, Lagerkraft und (Paletten) Stapler einsatzbereit sind; dann Bindung Dock (b.task=c.id),
//  Lagerkraft `${id}:warehouse`, Stapler `${id}:forklift` für Hofumfuhr (MOVE Min.) und Entladen.
//  Rate je Minute: Paletten workRate(Kraft,1) → stock; Pakete workRate(Kraft,20) → inbound (danach Sortierung).
//  inventory.add owner = Auftrag, mergeKey = Container-ID. Pakete brauchen keinen Stapler (wie Hof-Lkw/Linie).
//  Wartegrund während Umfuhr/Entladen (Schichtende, Dock aus, Strom/Stapler weg, Lager voll): alle Bindungen frei,
//  Container zurück in den Hof (status yard, Fortschritt bleibt), neuer Start erst wenn alles wieder bereit ist.
// Leer → status empty, Abholchassis kommt 120–240 Min. später (deterministisch aus der Container-ID, kein Zufallszug).
// Lagergeld: demurrageMinutes +1 je Spielminute ab freeUntil in yard/toDock/unstuffing/empty (Buchung A08).
// Läuft über yard.containerHooks innerhalb yard.step (vor tickForklifts), damit Staplernutzung im selben Akkutakt zählt.
import {containerHooks,WAIT,PALLET,PALLET_BASE,acquireForklift,releaseForklift,useForklift,forkliftKey,forkliftAvailable,
 sitePowered,freeDock,unloadMinute,apportion,pick,makePlate,setPhase,wait,DURATION,KEEP_GONE} from './yard.js';
import {workRate,UNLOAD_BASE,onShift} from './workforce.js';
import {BUILDINGS,ITEMS} from './catalog.js';

export const STATUSES=['arriving','yard','toDock','unstuffing','empty','pickup','gone'];
export const CONTENTS=['pallet','parcel'];
export const TEU=2;            // 40-Fuß-Container (18–22 Paletten bzw. 500–700 Pakete) = 2 TEU
export const MOVE=3;           // Hofumfuhr Containerhof → Dock in Minuten
export const PICKUP=[120,240]; // Abholung leer: Minuten nach Entladeende
export const FREE_DEFAULT=1440;
const OCCUPY=new Set(['yard','toDock','unstuffing','empty','pickup']);
const DEMURRAGE=new Set(['yard','toDock','unstuffing','empty']);
const AT_DOCK=new Set(['toDock','unstuffing']);
const CHASSIS_A=['Nordkai','Seewiesen','Hafenfeld','Deichland','Marschtor','Kaiwerder'];
const CHASSIS_B=['Containerdienst','Hafenlogistik','Chassisdienst','Kaispedition'];
export const workKey=c=>`${c.id}:warehouse`;
const vol=item=>ITEMS[item]?.volume||1;
const isPal=c=>c.content===PALLET;
const int=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;

/** Abholverzögerung 120–240 Min., deterministisch aus der ID (FNV-1a), ohne den Zufallsstrom zu verändern. */
export function pickupDelay(id){let h=2166136261;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return PICKUP[0]+h%(PICKUP[1]-PICKUP[0]+1);}
/** TEU-Kapazität eines Standorts. active=true: nur eingeschaltete, intakte Containerhöfe (für neue Anlieferungen). */
export function teuCapacity(s,site,active=true){let n=0;for(const b of s.buildings)if(b.type==='containeryard'&&b.site===site&&(!active||(b.enabled&&b.condition>0)))n+=BUILDINGS.containeryard.teu||0;return n;}
/** Belegte TEU eines Standorts (inkl. angelieferter Container ab toYard). */
export function teuUsed(s,site){
 let n=0;const admitted=new Set();
 for(const a of s.yard||[])if(a.kind==='container'&&!a.pickup&&a.site===site&&(a.phase==='toYard'||a.phase==='drop'))for(const id of a.containerIds)admitted.add(id);
 for(const c of s.containers||[])if(c.site===site&&(OCCUPY.has(c.status)||(c.status==='arriving'&&admitted.has(c.id))))n+=c.teu;
 return n;
}

export function init(s){s.containers??=[];}

// ── Anlieferung ─────────────────────────────────────────────────────────────────────────────────────────────
function scheduleContainers(s,api,p){
 const {site,eta}=p,contractId=typeof p.contractId==='string'?p.contractId:null;
 if(!s.sites.some(x=>x.id===site)||!Number.isInteger(eta))return null;
 const k=(s.contracts||[]).find(c=>c.id===contractId);
 const ids=Array.isArray(p.orderIds)?p.orderIds.filter(id=>typeof id==='string'):[];
 const orders=ids.map(id=>s.orders.find(o=>o.id===id));if(orders.some(o=>!o))return null;
 const content=CONTENTS.includes(p.content)?p.content:CONTENTS.includes(k?.content)?k.content:CONTENTS.includes(orders[0]?.item)?orders[0].item:'parcel';
 const per=int(p.unitsPerContainer,1)?p.unitsPerContainer:int(k?.unitsPerContainer,1)?k.unitsPerContainer:null;
 let n=int(p.containers,1)?p.containers:null;
 const total=orders.length?orders.reduce((x,o)=>x+o.qty,0):n&&per?n*per:int(p.parcels,1)?p.parcels:null;
 if(!int(total,1))return null;
 if(!n)n=per?Math.ceil(total/per):1;
 if(!int(n,1))return null;
 n=Math.min(n,total);
 const free=int(p.freeMinutes)?p.freeMinutes:int(k?.freeMinutes)?k.freeMinutes:FREE_DEFAULT;
 const qtys=apportion(total,Array(n).fill(1));
 const left=orders.length?orders.map(o=>({owner:o.id,left:o.qty})):[{owner:`contract:${contractId??'unbekannt'}`,left:total}];
 const carrier=`${pick(api,CHASSIS_A)} ${pick(api,CHASSIS_B)}`,plate=makePlate(api);
 const aid=api.id('arrival'),list=[];let oi=0;
 for(let i=0;i<n;i++){
  const split=[];let need=qtys[i];
  while(need>0){const o=left[oi];const q=Math.min(need,o.left);split.push({owner:o.owner,target:q,done:0});o.left-=q;need-=q;if(!o.left)oi++;}
  const c={id:api.id('container'),site,contractId,orderIds:split.map(x=>x.owner).filter(x=>ids.includes(x)),content,qty:qtys[i],unloaded:0,
   status:'arriving',arrivedAt:null,freeUntil:null,dock:null,split,teu:TEU,freeMinutes:free,demurrageMinutes:0,priority:false,
   waitReason:null,waitSince:null,statusAt:s.t,moveEnd:null,arrivalId:aid,emptyAt:null,pickupAt:null,pickupArrival:null,goneAt:null};
  list.push(c);s.containers.push(c);
 }
 const a=chassis(s,aid,{site,contractId,orderIds:ids,carrier,plate,eta,containerIds:list.map(c=>c.id),pickup:false,parcels:total});
 api.log('yard',`${carrier} (${plate}) angekündigt: ${n} Container mit ${total} ${content===PALLET?'Paletten':'Paketen'}, Ankunft Minute ${eta}.`,[a.id,...a.containerIds]);
 return a;
}
// parcels: Anlieferung = gesamter Inhalt (wie Lkw-Ankunft, A08), Abholung = Anzahl Leercontainer; unloaded = parcels ab drop-Ende.
function chassis(s,id,{site,contractId,orderIds,carrier,plate,eta,containerIds,pickup,parcels}){
 const a={id,kind:'container',pickup,site,contractId,orderIds,carrier,plate,parcels,containers:containerIds.length,containerIds,
  phase:'approach',phaseStart:eta-DURATION.approach,phaseEnd:eta,eta,dock:null,waitReason:null,waitSince:null,
  unloaded:0,atRisk:false,forecast:null,gateAt:null,priority:false,split:[]};
 s.yard.push(a);return a;
}
function schedulePickup(s,api,c,t){
 const eta=t+pickupDelay(c.id),carrier=`${pick(api,CHASSIS_A)} ${pick(api,CHASSIS_B)}`,plate=makePlate(api);
 const a=chassis(s,api.id('arrival'),{site:c.site,contractId:c.contractId,orderIds:[],carrier,plate,eta,containerIds:[c.id],pickup:true,parcels:1});
 c.pickupAt=eta;c.pickupArrival=a.id;
 api.log('yard',`Leercontainer ${c.id}: Abholung durch ${carrier} (${plate}) um Minute ${eta}.`,[c.id,a.id]);
}

// ── Befehle ─────────────────────────────────────────────────────────────────────────────────────────────────
export function handle(s,c,api){
 if(c.type==='unstuffContainer'){
  const x=(s.containers||[]).find(k=>k.id===c.id);if(!x)return {ok:false,message:'Container nicht gefunden.'};
  if(!['arriving','yard'].includes(x.status)||x.unloaded>=x.qty)return {ok:false,message:'Container wird bereits entladen oder ist leer.'};
  if(x.priority)return {ok:false,message:'Container ist bereits vorgezogen.'};
  x.priority=true;api.log('yard',`Container ${x.id}: Entladung vorgezogen.`,[x.id]);return {ok:true};
 }
 return null;
}

// ── Takt ────────────────────────────────────────────────────────────────────────────────────────────────────
function release(s,api,c){
 for(const b of s.buildings)if(b.task===c.id)b.task=null;
 api.workforce.release(workKey(c));releaseForklift(s,forkliftKey(c.id));c.dock=null;c.moveEnd=null;
}
function backToYard(s,api,c,reason,t){
 release(s,api,c);c.status='yard';c.statusAt=t;wait(c,reason,t);
 api.log('yard',`Container ${c.id}: ${reason}, zurück in den Containerhof (${c.unloaded}/${c.qty} entladen).`,[c.id]);
}
const freeWorker=(s,site)=>s.workers.some(w=>w.role==='warehouse'&&w.site===site&&!w.task&&!w.training&&!w.relocation&&!(w.breakRemaining>0)&&onShift(w,s.t)&&w.fatigue<80);
function forkReason(s,site){
 if(!sitePowered(s,site))return WAIT.forkliftPower;let any=false,charging=false;
 for(const b of s.buildings)if(b.type==='forklift'&&b.site===site&&b.enabled&&b.condition>0){any=true;if(!b.task&&(b.charging||(b.charge??100)<10))charging=true;}
 return !any?WAIT.forklift:charging?WAIT.forkliftCharge:WAIT.forklift;
}

function stepChassis(s,api,t){
 let byId=null;const get=id=>(byId??=new Map(s.containers.map(c=>[c.id,c]))).get(id);
 const queued=[];
 for(let i=0;i<s.yard.length;i++){
  const a=s.yard[i];if(a.kind!=='container')continue;
  if(a.phase==='toYard'&&t>=a.phaseEnd)setPhase(a,'drop',t);
  else if(a.phase==='drop'&&t>=a.phaseEnd){
   for(const id of a.containerIds){const c=get(id);if(!c)continue;
    if(a.pickup){c.status='gone';c.goneAt=t;}else{c.status='yard';c.arrivedAt=t;c.freeUntil=t+c.freeMinutes;}c.statusAt=t;}
   a.unloaded=a.parcels;setPhase(a,'exit',t);
   api.log('yard',`${a.plate}: ${a.containers} ${a.pickup?'Leercontainer abgeholt':'Container im Containerhof abgestellt'}.`,[a.id,...a.containerIds]);
  }
  else if(a.phase==='queue')queued.push([a,i]);
 }
 if(!queued.length)return;
 queued.sort((x,y)=>(y[0].priority-x[0].priority)||(x[0].gateAt-y[0].gateAt)||(x[1]-y[1]));
 const state=new Map();
 for(const [a] of queued){
  if(a.pickup){setPhase(a,'toYard',t);for(const id of a.containerIds){const c=get(id);if(c){c.status='pickup';c.statusAt=t;}}continue;}
  let st=state.get(a.site);if(!st)state.set(a.site,st={cap:teuCapacity(s,a.site),used:teuUsed(s,a.site),blocked:false});
  if(!st.cap){wait(a,WAIT.noYard,t);st.blocked=true;continue;}
  const need=a.containerIds.reduce((n,id)=>n+(get(id)?.teu||TEU),0);
  if(st.blocked||st.used+need>st.cap){wait(a,WAIT.yardFull,t);st.blocked=true;continue;}
  st.used+=need;setPhase(a,'toYard',t);
 }
}

function stepHandling(s,api,c,t){
 const b=s.buildings.find(x=>x.id===c.dock&&x.task===c.id);
 if(!b||!b.enabled||!(b.condition>0))return backToYard(s,api,c,WAIT.dockOff,t);
 let fork=null;
 if(isPal(c)){const f=acquireForklift(s,c.site,forkliftKey(c.id));if(!f.forklift)return backToYard(s,api,c,f.reason,t);fork=f.forklift;}
 const w=api.workforce.acquire('warehouse',c.site,workKey(c));
 if(!w)return backToYard(s,api,c,WAIT.staff,t);
 if(c.status==='toDock'){
  w.activity=`Holt Container ${c.id} zum Dock`;
  if(t>=c.moveEnd){c.status='unstuffing';c.statusAt=t;c.moveEnd=null;}
  return;
 }
 const item=isPal(c)?PALLET:'parcel',fit=Math.floor((api.inventory.free(c.site)+1e-9)/vol(item));
 const n=Math.min(workRate(w,isPal(c)?PALLET_BASE:UNLOAD_BASE),c.qty-c.unloaded,fit);
 if(n<1)return backToYard(s,api,c,WAIT.full,t);
 const r=unloadMinute(s,api,c,n,item,isPal(c)?'stock':'inbound');
 if(!r.added)return backToYard(s,api,c,WAIT.full,t);
 w.activity=`Entlädt Container ${c.id}${fork?' mit Stapler':''}`;if(fork)useForklift(s,fork);
 c.waitReason=null;c.waitSince=null;
 if(c.unloaded>=c.qty){
  release(s,api,c);c.status='empty';c.statusAt=t;c.emptyAt=t;
  api.log('yard',`Container ${c.id}: ${c.qty} ${isPal(c)?'Paletten':'Pakete'} entladen, Leercontainer im Hof.`,[c.id]);
  schedulePickup(s,api,c,t);
 }
}

function startUnstuffing(s,api,t){
 const cand=[];
 for(let i=0;i<s.containers.length;i++){const c=s.containers[i];if(c.status==='yard'&&c.unloaded<c.qty)cand.push([c,i]);}
 if(!cand.length)return;
 cand.sort((x,y)=>(y[0].priority-x[0].priority)||(x[0].arrivedAt-y[0].arrivedAt)||(x[1]-y[1]));
 const noDock=new Set();
 for(const [c] of cand){
  const site=c.site;
  if(noDock.has(site)){wait(c,WAIT.dock,t);continue;}
  const b=freeDock(s,site);if(!b){noDock.add(site);wait(c,WAIT.dock,t);continue;}
  if(api.inventory.free(site)+1e-9<vol(isPal(c)?PALLET:'parcel')){wait(c,WAIT.full,t);continue;}
  if(isPal(c)&&!forkliftAvailable(s,site,forkliftKey(c.id))){wait(c,forkReason(s,site),t);continue;}
  if(!freeWorker(s,site)){wait(c,WAIT.staff,t);continue;}
  b.task=c.id;c.dock=b.id;
  if(isPal(c))acquireForklift(s,site,forkliftKey(c.id));
  const w=api.workforce.acquire('warehouse',site,workKey(c));w.activity=`Holt Container ${c.id} zum Dock`;
  c.status='toDock';c.statusAt=t;c.moveEnd=t+MOVE;c.waitReason=null;c.waitSince=null;
 }
}

// Belegter Containerhof (TEU > 0) trägt b.task = yardMark(site): core.js lehnt Abriss/Versetzen belegter Anlagen ab, so
// kann die Kapazität nie unter die Belegung fallen. Leer → null.
export const yardMark=site=>`${site}:containeryard`;
function markYards(s){
 let used=null;
 for(const b of s.buildings){if(b.type!=='containeryard')continue;used??=new Map();let u=used.get(b.site);if(u===undefined)used.set(b.site,u=teuUsed(s,b.site));const want=u>0?yardMark(b.site):null;if(b.task!==want)b.task=want;}
}
function stepContainers(s,api){
 if(!s.containers?.length){if(s.buildings.some(b=>b.type==='containeryard'&&b.task))markYards(s);return;}const t=s.t;
 for(const c of s.containers)if(DEMURRAGE.has(c.status)&&c.freeUntil!==null&&t>=c.freeUntil)c.demurrageMinutes++;
 stepChassis(s,api,t);
 for(const c of s.containers)if(AT_DOCK.has(c.status))stepHandling(s,api,c,t);
 startUnstuffing(s,api,t);
 if(s.containers.some(c=>c.status==='gone'&&t-c.goneAt>KEEP_GONE))s.containers=s.containers.filter(c=>!(c.status==='gone'&&t-c.goneAt>KEEP_GONE));
 markYards(s);
}
export function step(){} // Takt über yard.containerHooks.step (s. Kopf)

/** Lagerkräfte, die der Containerumschlag eines Standorts gerade braucht (Vorrang vor Sortierung, sorting.unloadNeed). */
export function staffNeed(s,site){
 if(!s.containers?.length)return 0;
 let docks=0,n=0;for(const b of s.buildings)if(b.type==='dock'&&b.site===site&&b.enabled&&b.condition>0&&!b.task)docks++;
 for(const c of s.containers){
  if(c.site!==site)continue;
  if(AT_DOCK.has(c.status)){if(!s.workers.some(w=>w.task===workKey(c)))n++;continue;}
  if(c.status==='yard'&&c.unloaded<c.qty&&docks>0&&(!isPal(c)||forkliftAvailable(s,site,forkliftKey(c.id)))){docks--;n++;}
 }
 return n;
}

containerHooks.schedule=scheduleContainers;
containerHooks.step=stepContainers;
containerHooks.holder=(s,id)=>(s.containers||[]).some(c=>c.id===id&&AT_DOCK.has(c.status));

export function validate(s){
 const fail=m=>{throw new Error('Containerdaten beschädigt: '+m);};
 if(!Array.isArray(s.containers))fail('Liste');
 const arrivals=new Map();for(const a of s.yard||[])if(a.kind==='container')arrivals.set(a.id,a);
 const byId=new Map(),docks=new Set();
 for(const c of s.containers){
  if(!c||typeof c.id!=='string'||byId.has(c.id))fail('ID');byId.set(c.id,c);
  if(!STATUSES.includes(c.status))fail('Status');
  if(!s.sites.some(x=>x.id===c.site))fail('Standort');
  if(!CONTENTS.includes(c.content))fail('Inhalt');
  if(c.contractId!==null&&typeof c.contractId!=='string')fail('Vertrag');
  if(!Array.isArray(c.orderIds)||c.orderIds.some(id=>typeof id!=='string'))fail('Auftragsreferenz');
  if(c.status!=='gone'&&c.orderIds.some(id=>!s.orders.some(o=>o.id===id)))fail('Auftragsreferenz');
  if(!int(c.qty,1)||!int(c.unloaded)||c.unloaded>c.qty)fail('Menge');
  if(!Array.isArray(c.split)||!c.split.length)fail('Verteilung');
  let done=0,target=0;for(const p of c.split){if(!p||typeof p.owner!=='string'||!int(p.target,1)||!int(p.done)||p.done>p.target)fail('Verteilung');done+=p.done;target+=p.target;}
  if(target!==c.qty||done!==c.unloaded)fail('Verteilungssumme');
  if(!int(c.teu,1)||c.teu>2||!int(c.freeMinutes)||!int(c.demurrageMinutes)||!int(c.statusAt))fail('Werte');
  if(typeof c.priority!=='boolean'||(c.waitReason!==null&&typeof c.waitReason!=='string'))fail('Wartegrund');
  if(c.status==='arriving'){if(c.arrivedAt!==null||c.freeUntil!==null||c.unloaded||c.demurrageMinutes)fail('Ankunft');}
  else if(!int(c.arrivedAt)||c.freeUntil!==c.arrivedAt+c.freeMinutes)fail('Freizeit');
  if(['empty','pickup','gone'].includes(c.status)){if(c.unloaded!==c.qty||!int(c.emptyAt)||!int(c.pickupAt))fail('Leercontainer');}
  else if(c.emptyAt!==null||c.pickupArrival!==null)fail('Leercontainer');
  if(['empty','pickup'].includes(c.status)){const a=arrivals.get(c.pickupArrival);if(!a||!a.pickup||!a.containerIds.includes(c.id))fail('Abholung');}
  if(c.status==='gone'&&!int(c.goneAt))fail('Abholzeit');
  if(AT_DOCK.has(c.status)){
   const b=s.buildings.find(b=>b.id===c.dock);
   if(!b||b.type!=='dock'||b.site!==c.site||b.task!==c.id||docks.has(b.id))fail('Dockbelegung');docks.add(b.id);
   if(c.status==='toDock'?!int(c.moveEnd):c.moveEnd!==null)fail('Umfuhr');
  }else if(c.dock!==null||c.moveEnd!==null)fail('Dock ohne Umschlag');
 }
 for(const a of arrivals.values()){
  if(typeof a.pickup!=='boolean'||!Array.isArray(a.containerIds)||!a.containerIds.length||a.containers!==a.containerIds.length||a.dock!==null)fail('Chassis');
  if(a.pickup&&a.parcels!==a.containers)fail('Chassis');
  if(['exit','gone'].includes(a.phase))continue;
  if(!a.pickup&&a.parcels!==a.containerIds.reduce((n,id)=>n+(byId.get(id)?.qty||0),0))fail('Chassis-Menge');
  for(const id of a.containerIds){const c=byId.get(id);if(!c||c.site!==a.site)fail('Chassis-Container');
   const want=a.pickup?(['toYard','drop'].includes(a.phase)?'pickup':'empty'):'arriving';
   if(c.status!==want)fail('Chassis-Status');}
 }
 for(const b of s.buildings){
  if(b.type==='containeryard'&&b.task!=null&&b.task!==yardMark(b.site))fail('Containerhofbelegung');
  if(typeof b.task!=='string')continue;
  if(byId.has(b.task)&&!(b.type==='dock'&&byId.get(b.task).dock===b.id&&AT_DOCK.has(byId.get(b.task).status)))fail('Verwaiste Dockbelegung');
  if(b.type==='forklift'&&b.task.endsWith(':forklift')){const c=byId.get(b.task.slice(0,-9));if(c&&!(AT_DOCK.has(c.status)&&isPal(c)))fail('Staplerbindung');}
 }
 for(const w of s.workers)if(typeof w.task==='string'&&w.task.endsWith(':warehouse')){const c=byId.get(w.task.slice(0,-10));if(c&&!AT_DOCK.has(c.status))fail('Personalbindung');}
 const sites=new Set(s.containers.map(c=>c.site));
 for(const site of sites)if(teuUsed(s,site)>teuCapacity(s,site,false))fail('TEU-Kapazität');
}
