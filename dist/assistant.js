// Dispositionsassistent (A06/A07, Welle 3c). Schnittstelle docs/SCHNITTSTELLEN-0.14-W3c.md (W3c-S2).
// s.assistant={sites:{[siteId]:{enabled,dispatch,lines,gate,budget,spent,day,hold:{[ziel]:bisMinute}}},log:[]} (log max. LOG_MAX).
// Takt alle TICK Spielminuten je aktivem Standort. Handelt ausschließlich über api.command mit regulären Befehlen
// (updateLine, prioritizeArrival, dispatchAirShuttle, dispatchTour, dispatch): keine Sonderrechte, gleiche Kosten und Grenzen.
// Reihenfolge je Takt: Linien → Tor → Luftzubringer → Zustellung (Linien-Lkw und Zubringer zuerst, damit die Zustellung sie nicht belegt).
// Abgrenzung zu management.js: Delegationsregel 'dispatch' (Budgetregel je Auftragstyp) bleibt unverändert. Ist am Standort eine
// aktive Delegationsregel 'dispatch' vorhanden, überlässt der Assistent ihr die Zustellung (keine zwei Disponenten für dieselbe Ware).
// Der Assistent stellt nur Logistikaufträge (Fremdware, deliverySite = Standort) zu; eigene Fertigware bleibt Spieler/Regel.
// Budget: optional je Spieltag (null = nur Kasse). Angerechnet werden die vom Befehl verursachten Fahrtkosten
// (Zustellung 2 × 30 km × Betriebskosten, Sammeltour laut planTour, Zubringer laut Befehlsergebnis). Linienzuordnung und
// Vorziehen kosten nichts; Linienfahrten bucht linehaul.js weiterhin nach Fahrplan.
// Abgelehnte Befehle und Budget-/Kassenstopps werden einmal protokolliert und das Ziel HOLD Minuten gesperrt.
// Deterministisch: feste Sortierungen, keine Zufallszüge.
import {VEHICLES} from './catalog.js';
import {maxLoad,deliverableAt} from './transport.js';
import {committedQty,planTour} from './tours.js';
import {WAIT as LINE_WAIT,MIN_CONDITION} from './linehaul.js';

export const TICK=5;            // Spielminuten zwischen zwei Takten
export const URGENT=180;        // Zustellung starten, wenn Frist in weniger als 3 h
export const HOLD=60;           // Sperrfrist je Ziel nach Ablehnung
export const LOG_MAX=200;
export const DELIVERY_DISTANCE=30; // wie transport.dispatch (sh.distance)
const GATE_PHASES=new Set(['approach','gate','queue']);
const cents=n=>Math.round(n*100)/100;
const day=t=>Math.floor(t/1440);
const fail=message=>({ok:false,message});

export function init(s){s.assistant??={sites:{},log:[]};s.assistant.sites??={};s.assistant.log??=[];}
const fresh=()=>({enabled:false,dispatch:true,lines:true,gate:true,budget:null,spent:0,day:0,hold:{}});

export function handle(s,c,api){
 if(c.type!=='setAssistant')return null;
 init(s);const site=c.site??s.selectedSite;
 if(!s.sites.some(x=>x.id===site))return fail('Standort unbekannt.');
 for(const k of ['enabled','dispatch','lines','gate'])if(c[k]!==undefined&&typeof c[k]!=='boolean')return fail('Schalter müssen ein/aus sein.');
 if(c.budget!==undefined&&c.budget!==null&&!(typeof c.budget==='number'&&Number.isFinite(c.budget)&&c.budget>=0&&c.budget<=1e9))return fail('Tagesbudget: Betrag ab 0 € oder leer (nur Kasse).');
 const cfg=s.assistant.sites[site]??fresh();
 for(const k of ['enabled','dispatch','lines','gate'])if(c[k]!==undefined)cfg[k]=c[k];
 if(c.budget!==undefined)cfg.budget=c.budget===null?null:cents(c.budget);
 if(!cfg.enabled)cfg.hold={};
 s.assistant.sites[site]=cfg;
 api.log('assistant',`Dispositionsassistent ${cfg.enabled?'eingeschaltet':'ausgeschaltet'}.`,[site]);
 return {ok:true};
}

function record(s,api,site,kind,text,refs,reason){
 s.assistant.log.push({t:s.t,site,kind,text,refs,reason});
 if(s.assistant.log.length>LOG_MAX)s.assistant.log.splice(0,s.assistant.log.length-LOG_MAX);
 api.log('assistant',`Assistent: ${text} – ${reason}`,refs);
}
const held=(s,cfg,key)=>cfg.hold[key]!==undefined&&cfg.hold[key]>s.t;
function refuse(s,api,site,cfg,key,kind,text,refs,reason){cfg.hold[key]=s.t+HOLD;record(s,api,site,kind,text,refs,reason);}

// Budget/Kasse vor dem Befehl prüfen. Liefert Grund oder null.
function affordable(s,cfg,cost){
 if(cfg.budget!==null&&Math.round((cfg.spent+cost)*100)>Math.round(cfg.budget*100))return `Tagesbudget ${cfg.budget} € reicht nicht (verbraucht ${cfg.spent} €, benötigt ${cost} €).`;
 if(s.money<cost)return `Kasse reicht nicht für Fahrtkosten ${cost} €.`;
 return null;
}
const spend=(cfg,cost)=>{cfg.spent=cents(cfg.spent+cost);};

// Freie eigene Fahrzeuge am Standort, die keine Linie bedienen. Feste Reihenfolge (Anlage).
function freeVehicles(s,site,used){
 const lineVehicles=new Set((s.lines||[]).filter(l=>l.active&&l.vehicleId).map(l=>l.vehicleId));
 return s.vehicles.filter(v=>v.site===site&&v.status==='idle'&&v.condition>=MIN_CONDITION&&!lineVehicles.has(v.id)&&!used.has(v.id));
}

// (2) Linien: aktive Linie ab diesem Standort ohne (gültigen) Lkw → freien Lkw am Start zuordnen.
function stepLines(s,api,site,cfg,used){
 for(const l of s.lines||[]){
  if(!l.active||l.from!==site)continue;
  const v=l.vehicleId?s.vehicles.find(x=>x.id===l.vehicleId):null;
  const need=!v||(l.wait===LINE_WAIT.away&&v.site!==l.from&&v.status==='idle');
  if(!need)continue;const key='line:'+l.id;if(held(s,cfg,key))continue;
  const assigned=new Set(s.lines.filter(x=>x.vehicleId&&x.id!==l.id).map(x=>x.vehicleId));
  const pool=freeVehicles(s,site,used).filter(x=>!assigned.has(x.id)&&x.type!=='van');
  const truck=pool.find(x=>x.type==='truck')??pool[0];
  const reason=!v?(l.vehicleId?'Zugeordnetes Fahrzeug existiert nicht mehr.':LINE_WAIT.vehicle+'.'):`${LINE_WAIT.away}.`;
  if(!truck){refuse(s,api,site,cfg,key,'line','Linie ohne Lkw, kein freier Lkw am Startstandort.',[l.id],reason);continue;}
  const out=api.command({type:'updateLine',id:l.id,vehicleId:truck.id});
  if(out.ok){used.add(truck.id);record(s,api,site,'line',`${truck.name} der Linie zugeordnet.`,[l.id,truck.id],reason);}
  else refuse(s,api,site,cfg,key,'blocked','Linienzuordnung abgelehnt.',[l.id,truck.id],out.message);
 }
}

// (3) Tor: gefährdete Fremd-Lkw vor dem Dock vorziehen.
function stepGate(s,api,site,cfg){
 for(const a of s.yard||[]){
  if(a.site!==site||a.kind||!a.atRisk||a.priority||!GATE_PHASES.has(a.phase))continue;
  const key='gate:'+a.id;if(held(s,cfg,key))continue;
  const out=api.command({type:'prioritizeArrival',id:a.id});
  const reason=`Frist gefährdet (Prognose Minute ${a.forecast}).`;
  if(out.ok)record(s,api,site,'gate',`${a.plate} vorgezogen.`,[a.id],reason);
  else refuse(s,api,site,cfg,key,'blocked',`Vorziehen ${a.plate} abgelehnt.`,[a.id],out.message);
 }
}

// Nächster Flug eines Luftexport-Vertrags, dessen Annahmeschluss noch nicht vorbei ist.
function nextFlight(s,k){
 if(!k||!Array.isArray(k.flights)||!k.flights.length)return null;const cutoff=Number.isFinite(k.cutoff)?k.cutoff:90;let best=null;
 for(const m of k.flights){if(!Number.isInteger(m))continue;let t=s.t-(s.t%1440)+m;while(t-cutoff<=s.t)t+=1440;if(!best||t<best.departAt)best={flight:m,departAt:t,cutoffAt:t-cutoff};}
 return best;
}

// (4) Luftzubringer: Befehl dispatchAirShuttle nur versuchen; fehlt er (airexport.js noch Gerüst), still überspringen.
function stepAir(s,api,site,cfg,used,state){
 if(state.airUnknown)return;
 const orders=s.orders.filter(o=>o.status==='active'&&o.airExport&&o.kind==='logistics'&&deliverableAt(o,site)&&o.qty-o.delivered-committedQty(s,o.id)>0&&api.inventory.available(o.item,site,o.id)>=1);
 const flights=new Map();
 for(const o of orders){const k=(s.contracts||[]).find(k=>k.id===o.contractId),cut=Number.isFinite(k?.cutoff)?k.cutoff:90;/* gebuchter Flug des Auftrags (airexport) hat Vorrang */const f=Number.isFinite(o.flightT)&&o.flightT-cut>s.t?{flight:o.flightT%1440,departAt:o.flightT,cutoffAt:o.flightT-cut}:nextFlight(s,k);if(f&&f.cutoffAt-s.t<URGENT&&!flights.has(f.departAt))flights.set(f.departAt,{...f,orderIds:[]});if(f&&flights.has(f.departAt))flights.get(f.departAt).orderIds.push(o.id);}
 for(const f of [...flights.values()].sort((a,b)=>a.departAt-b.departAt)){
  const key='air:'+f.departAt;if(held(s,cfg,key))continue;
  const v=freeVehicles(s,site,used).sort((a,b)=>(b.capacity-a.capacity))[0];if(!v)continue;
  const est=cents(2*DELIVERY_DISTANCE*VEHICLES[v.type].runningCost),why=affordable(s,cfg,est);
  if(why){refuse(s,api,site,cfg,key,'blocked','Luftzubringer zurückgestellt.',[v.id,...f.orderIds],why);continue;}
  const out=api.command({type:'dispatchAirShuttle',vehicleId:v.id,flight:f.flight,departAt:f.departAt,site});
  if(!out.ok&&out.message==='Befehl unbekannt.'){state.airUnknown=true;return;}
  const reason=`Annahmeschluss Minute ${f.cutoffAt} in ${f.cutoffAt-s.t} Min.`;
  if(out.ok){used.add(v.id);spend(cfg,Number.isFinite(out.cost)?out.cost:0);record(s,api,site,'air',`Luftzubringer mit ${v.name} zum Flug ${String(Math.floor(f.flight/60)).padStart(2,'0')}:${String(f.flight%60).padStart(2,'0')} Uhr gestartet.`,[out.id,v.id,...f.orderIds].filter(Boolean),reason);}
  else refuse(s,api,site,cfg,key,'blocked','Luftzubringer abgelehnt.',[v.id,...f.orderIds],out.message);
 }
}

// (1) Zustellung: Hub-Aufträge mit Bestand am Zustellstandort, früheste Frist zuerst.
// Start, wenn Frist < URGENT oder ein freies Fahrzeug voll beladen werden kann. Mehrere dringende Kleinaufträge, die zusammen
// in ein Fahrzeug passen, fahren als Sammeltour (planTour/dispatchTour): ein Fahrzeug statt mehrerer, geringere Fahrtkosten.
function stepDispatch(s,api,site,cfg,used){
 if((s.rules||[]).some(r=>r.kind==='dispatch'&&r.enabled&&r.site===site))return;
 const cands=[];
 for(let i=0;i<s.orders.length;i++){const o=s.orders[i];
  if(o.status!=='active'||o.kind!=='logistics'||o.airExport||!deliverableAt(o,site))continue;
  const open=o.qty-o.delivered-committedQty(s,o.id);if(open<1)continue;
  const stock=Math.floor(api.inventory.available(o.item,site,o.id)+1e-9);if(stock<1)continue;
  cands.push({o,i,qty:Math.min(open,stock)});
 }
 cands.sort((a,b)=>a.o.due-b.o.due||a.i-b.i);
 const done=new Set();
 for(const c of cands){
  const key='order:'+c.o.id;if(done.has(c.o.id)||held(s,cfg,key))continue;
  const vehicles=freeVehicles(s,site,used).filter(v=>maxLoad(v,c.o.item)>0);if(!vehicles.length)break;
  const urgent=c.o.due-s.t<URGENT,full=vehicles.filter(v=>c.qty>=maxLoad(v,c.o.item));
  if(!urgent&&!full.length)continue;
  // Dringend: kleinstes Fahrzeug, das die ganze Menge fasst, sonst größtes. Sonst (volle Ladung): größtes voll beladbares.
  const bySize=[...vehicles].sort((a,b)=>maxLoad(a,c.o.item)-maxLoad(b,c.o.item));
  const v=urgent?(bySize.find(x=>maxLoad(x,c.o.item)>=c.qty)??bySize.at(-1)):full.sort((a,b)=>maxLoad(b,c.o.item)-maxLoad(a,c.o.item))[0];
  const qty=Math.min(c.qty,maxLoad(v,c.o.item));
  const reason=urgent?`Frist Minute ${c.o.due} in ${c.o.due-s.t} Min. (< ${URGENT/60} h).`:`Volle Ladung ${qty} Einheiten möglich.`;
  if(urgent&&qty===c.qty&&tryTour(s,api,site,cfg,used,v,c,cands,reason,done))continue;
  const cost=cents(2*DELIVERY_DISTANCE*VEHICLES[v.type].runningCost),why=affordable(s,cfg,cost);
  if(why){refuse(s,api,site,cfg,key,'blocked',`Zustellung ${c.o.customer} zurückgestellt.`,[c.o.id,v.id],why);continue;}
  const out=api.command({type:'dispatch',orderId:c.o.id,vehicleId:v.id,qty,site});
  if(out.ok){used.add(v.id);spend(cfg,cost);record(s,api,site,'dispatch',`Zustellung ${qty} × für ${c.o.customer} mit ${v.name} gestartet.`,[out.id,c.o.id,v.id],reason);}
  else refuse(s,api,site,cfg,key,'blocked',`Zustellung ${c.o.customer} abgelehnt.`,[c.o.id,v.id],out.message);
 }
}
// Sammeltour: weitere dringende, vollständig passende Aufträge (früheste Frist zuerst, max. 4 Stopps) zum Fahrzeug hinzufügen.
function tryTour(s,api,site,cfg,used,v,first,cands,reason,done){
 const stops=[{orderId:first.o.id,qty:first.qty}],refs=[first.o.id];
 for(const c of cands){
  if(stops.length>=4)break;if(c===first||done.has(c.o.id)||c.o.due-s.t>=URGENT||held(s,cfg,'order:'+c.o.id))continue;
  const trial=[...stops,{orderId:c.o.id,qty:c.qty}];if(planTour(s,v.id,trial).ok){stops.push(trial.at(-1));refs.push(c.o.id);}
 }
 if(stops.length<2)return false;
 const plan=planTour(s,v.id,stops);if(!plan.ok)return false;
 const key='order:'+first.o.id,why=affordable(s,cfg,plan.cost);
 if(why){refuse(s,api,site,cfg,key,'blocked','Sammeltour zurückgestellt.',[...refs,v.id],why);return true;}
 const out=api.command({type:'dispatchTour',vehicleId:v.id,stops});
 if(!out.ok)return false; // Einzelzustellung versuchen
 used.add(v.id);spend(cfg,plan.cost);for(const id of refs)done.add(id);
 record(s,api,site,'tour',`Sammeltour mit ${stops.length} Stopps und ${v.name} gestartet.`,[out.id,...refs,v.id],`${reason} ${stops.length} dringende Aufträge passen zusammen in ein Fahrzeug.`);
 return true;
}

export function step(s,api){
 if(s.t%TICK!==0||!s.assistant)return;
 const state={airUnknown:false};
 for(const site of Object.keys(s.assistant.sites).sort()){
  const cfg=s.assistant.sites[site];if(!cfg.enabled||!s.sites.some(x=>x.id===site))continue;
  if(cfg.day!==day(s.t)){cfg.day=day(s.t);cfg.spent=0;}
  for(const k of Object.keys(cfg.hold))if(cfg.hold[k]<=s.t)delete cfg.hold[k];
  const used=new Set();
  if(cfg.lines)stepLines(s,api,site,cfg,used);
  if(cfg.gate)stepGate(s,api,site,cfg);
  if(cfg.dispatch){stepAir(s,api,site,cfg,used,state);stepDispatch(s,api,site,cfg,used);}
 }
}

export function validate(s){
 const bad=m=>{throw new Error('Spielstand ungültig: Assistent '+m);};const a=s.assistant;if(a===undefined)return;
 if(!a||typeof a!=='object'||Array.isArray(a)||!a.sites||typeof a.sites!=='object'||Array.isArray(a.sites)||!Array.isArray(a.log)||a.log.length>LOG_MAX)bad('beschädigt.');
 for(const [site,c]of Object.entries(a.sites)){
  if(!s.sites.some(x=>x.id===site)||!c||typeof c!=='object')bad('Standort unbekannt.');
  if(!['enabled','dispatch','lines','gate'].every(k=>typeof c[k]==='boolean'))bad('Schalter beschädigt.');
  if(c.budget!==null&&!(Number.isFinite(c.budget)&&c.budget>=0))bad('Budget beschädigt.');
  if(!Number.isFinite(c.spent)||c.spent<0||!Number.isInteger(c.day)||c.day<0||!c.hold||typeof c.hold!=='object'||Array.isArray(c.hold)||!Object.values(c.hold).every(Number.isFinite))bad('Verbrauch/Sperrfrist beschädigt.');
 }
 for(const e of a.log)if(!e||!Number.isFinite(e.t)||typeof e.site!=='string'||typeof e.kind!=='string'||typeof e.text!=='string'||!Array.isArray(e.refs)||typeof e.reason!=='string')bad('Protokoll beschädigt.');
}
