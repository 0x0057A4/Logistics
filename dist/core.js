import * as inventory from './inventory.js';
import * as workforce from './workforce.js';
import * as production from './production.js';
import * as economy from './economy.js';
import * as transport from './transport.js';
import * as management from './management.js';
import * as service from './service.js';
import * as network from './network.js';
import * as tours from './tours.js';
import * as special from './special.js';
import * as multimodal from './multimodal.js';
import * as rental from './rental.js';
import * as customerService from './customer-service.js';
import * as contracts from './contracts.js';
import * as yard from './yard.js';
import * as sorting from './sorting.js';
import { BUILDINGS, ITEMS, RECIPES, VEHICLES, ROLES } from './catalog.js';
import { reachable, footprint } from './world.js';
const MODULES=[inventory,workforce,economy,transport,production,management,service,network,tours,special,multimodal,rental,customerService,contracts,yard,sorting];
const ARRAYS=['sites','buildings','workers','batches','reservations','jobs','purchases','orders','vehicles','shipments','ledger','events','research','rules','returns','milestones','transfers','tours','freights','tickets','contracts','yard'];
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=m=>{throw new Error('Spielstand ungültig: '+m);};
function finite(n,min=-Infinity,max=Infinity){return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;}
/** Aktuelles Speicherformat. Welle 0 bleibt bei Schema 1 (docs/SCHNITTSTELLEN-0.9.md, S3). */
export const SCHEMA=1;
/** Migrationsschritte from→to. Jeder Schritt erhält den Zustand von Schema `from`, ändert ihn an Ort und Stelle und setzt `schema` auf `to`. Welle 1 ergänzt hier {from:1,to:2,...}. */
export const MIGRATIONS=[];
/** Auffüllungen innerhalb einer Schemastufe: ältere Stände derselben Stufe erhalten definierte Standardwerte. */
const FILLS={1(s){for(const key of ['research','rules','transfers','tours','freights','tickets','contracts','yard'])if(s[key]===undefined)s[key]=[];}};
/** Bringt einen geparsten Stand auf SCHEMA. Unbekannte oder neuere Stände bleiben unverändert und werden von validateState abgelehnt. */
export function migrate(state,{steps=MIGRATIONS,target=SCHEMA,fills=FILLS}={}){
 if(!state||typeof state!=='object'||Array.isArray(state)||!Number.isSafeInteger(state.schema)||state.schema>target)return state;
 fills[state.schema]?.(state);
 while(state.schema<target){
  const from=state.schema,step=steps.find(m=>m.from===from);
  if(!step)return state;
  if(step.to!==from+1)throw new Error('Migrationsschritt '+from+'→'+step.to+' ungültig.');
  step.migrate(state);state.schema=step.to;fills[step.to]?.(state);
 }
 return state;
}
/** Zuletzt fehlerfrei geladener Spielstandtext (nur Laufzeit, nie gespeichert). */
let lastValidText=null;
/** Validation never repairs or mutates its input. Unknown module fields survive. */
export function validateState(s){
 if(!s||typeof s!=='object'||Array.isArray(s))fail('Zustand fehlt.');
 if(s.schema!==1)fail('Speicherformat nicht unterstützt.');
 if(!['guided','economy','sandbox'].includes(s.mode))fail('Spielmodus fehlt.');
 for(const k of ARRAYS)if(!Array.isArray(s[k])||s[k].length>100000)fail(k+' fehlt oder zu groß.');
 if(!Number.isSafeInteger(s.t)||s.t<480||!Number.isSafeInteger(s.seq)||s.seq<1||!Number.isSafeInteger(s.seed)||s.seed<0||s.seed>4294967295||!finite(s.money)||!finite(s.reputation,0,100))fail('Grundwerte beschädigt.');
 if(!s.settings||typeof s.settings.incidents!=='boolean'||!s.stats||!['produced','delivered','revenue','costs'].every(k=>finite(s.stats[k],0)))fail('Einstellungen oder Statistik beschädigt.');
 // Reject non-finite values and prototype-shaped keys anywhere, including extensions.
 function walk(v,depth=0){if(depth>60)fail('Verschachtelung zu tief.');if(typeof v==='number'&&!Number.isFinite(v))fail('Ungültiger Zahlenwert.');if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))fail('Verbotener Schlüssel.');walk(x,depth+1);}}walk(s);
 const ids=new Set();let maxSeq=0;for(const k of ['sites','buildings','workers','batches','reservations','jobs','purchases','orders','vehicles','shipments','ledger','events','returns','research','rules','transfers','tours','freights','rentals','tickets','contracts','yard'])for(const row of s[k]||[]){if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||ids.has(row.id))fail('Fehlende oder doppelte ID in '+k+'.');ids.add(row.id);const m=row.id.match(/-(\d+)$/);if(m)maxSeq=Math.max(maxSeq,+m[1]);}
 if(s.seq<=maxSeq)fail('ID-Zähler beschädigt.');
 const sites=new Set(s.sites.map(x=>x.id));if(!sites.has(s.selectedSite)||!sites.size)fail('Standortauswahl ungültig.');
 for(const a of s.sites)if(!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<2||a.height<2||a.width>200||a.height>200||!finite(a.energy,0)||!finite(a.x)||!finite(a.y))fail('Standortwerte beschädigt.');
 for(const k of ['buildings','workers','batches','purchases','orders','vehicles'])for(const row of s[k])if(row.site!==undefined&&!sites.has(row.site))fail('Standortreferenz beschädigt.');
 for(const b of s.buildings){if(!BUILDINGS[b.type]||![0,90,180,270].includes(b.rotation)||!finite(b.condition,0,100)||typeof b.enabled!=='boolean'||!finite(b.progress,0))fail('Gebäude beschädigt.');if(b.recipe&&!RECIPES[b.recipe])fail('Rezept fehlt.');}
 for(const site of s.sites){const result=reachable(s,site.id,s.buildings,false);if(!result.ok)fail(result.message);}
 const batches=new Map(s.batches.map(b=>[b.id,b]));const reserved=new Map();
 for(const b of s.batches)if(!ITEMS[b.item]||!finite(b.qty,0)||!finite(b.reserved,0,b.qty)||!finite(b.quality,0,100)||!finite(b.unitCost,0)||!['stock','inbound','machine','vehicle','quarantine'].includes(b.location)||typeof b.owner!=='string'||!Array.isArray(b.parents))fail('Charge beschädigt.');
 for(const r of s.reservations){if(!batches.has(r.batchId)||!finite(r.qty,Number.EPSILON)||typeof r.job!=='string')fail('Reservierung beschädigt.');reserved.set(r.batchId,(reserved.get(r.batchId)||0)+r.qty);}
 for(const b of s.batches)if(Math.abs((reserved.get(b.id)||0)-b.reserved)>1e-7)fail('Reservierte Menge widersprüchlich.');
 const buildings=new Set(s.buildings.map(b=>b.id));const workers=new Set(s.workers.map(w=>w.id));const jobs=new Set(s.jobs.map(j=>j.id));
 for(const b of s.buildings)if(b.job&&!jobs.has(b.job))fail('Maschinenauftrag fehlt.');
 for(const j of s.jobs)if(!buildings.has(j.building)||!(RECIPES[j.recipe]||(j.recipe===null&&j.status==='maintenance'))||!finite(j.remaining,0)||!finite(j.duration,0)||(j.worker&&!workers.has(j.worker)))fail('Fertigungsauftrag beschädigt.');
 for(const w of s.workers)if(!ROLES[w.role]||!finite(w.fatigue,0,100)||!finite(w.skill,0)||!finite(w.wage,0)||!['day','night','all'].includes(w.shift))fail('Personaldaten beschädigt.');
 const keys=new Set();for(const l of s.ledger){if(typeof l.key!=='string'||keys.has(l.key)||!finite(l.amount)||!finite(l.t,0))fail('Buchung beschädigt.');keys.add(l.key);}
 for(const o of s.orders)if(!ITEMS[o.item]||!finite(o.qty,Number.EPSILON)||!finite(o.delivered,0,o.qty)||!finite(o.price,0)||!finite(o.paid,0)||!finite(o.due,0))fail('Kundenauftrag beschädigt.');
 const vehicles=new Map(s.vehicles.map(v=>[v.id,v]));const orders=new Map(s.orders.map(o=>[o.id,o]));const shipments=new Map(s.shipments.map(sh=>[sh.id,sh]));
 for(const o of s.orders)if(!['offer','active','fulfilled','cancelled'].includes(o.status)||!finite(o.quality,0,100))fail('Auftragsstatus beschädigt.');
 for(const v of s.vehicles){if(!VEHICLES[v.type]||v.capacity!==VEHICLES[v.type].capacity||!finite(v.condition,0,100)||!['idle','loading','transit','unloading','returning','maintenance','service','transfer','tour','rentalReturned'].includes(v.status))fail('Fahrzeug beschädigt.');if(v.shipment&&!(shipments.has(v.shipment)&&shipments.get(v.shipment).vehicleId===v.id)&&!s.returns.some(r=>r.id===v.shipment&&r.vehicleId===v.id)&&!s.transfers.some(r=>r.id===v.shipment&&r.vehicleId===v.id))fail('Fahrzeugzuordnung beschädigt.');}
 for(const p of s.purchases){if(!ITEMS[p.item]||!Number.isInteger(p.qty)||p.qty<1||!finite(p.cost,0)||!finite(p.quality,0,100)||!finite(p.eta,0)||!finite(p.remaining,0)||!['ordered','waiting','receiving','checking','storing','stored'].includes(p.status)||!['standard','express','quality'].includes(p.supplier))fail('Einkauf beschädigt.');if(['receiving','checking','storing'].includes(p.status)&&(!batches.has(p.batchId)||batches.get(p.batchId).item!==p.item))fail('Liefercharge fehlt.');}
 for(const sh of s.shipments){const o=orders.get(sh.orderId),v=vehicles.get(sh.vehicleId);if(!o||!v||!sites.has(sh.site)||!Number.isInteger(sh.qty)||sh.qty<1||sh.qty>o.qty||!finite(sh.remaining,0)||!finite(sh.distance,0)||!Array.isArray(sh.cargo)||typeof sh.paid!=='boolean'||!['loading','transit','unloading','returning','complete','cancelled'].includes(sh.status))fail('Transport beschädigt.');
  if(!['complete','cancelled'].includes(sh.status)&&(v.shipment!==sh.id||v.status!==sh.status))fail('Aktive Fahrzeugzuordnung widersprüchlich.');
  if(['transit','unloading'].includes(sh.status)){let qty=0;const seenCargo=new Set();for(const id of sh.cargo){const b=batches.get(id);if(seenCargo.has(id)||!b||b.location!=='vehicle'||b.item!==o.item)fail('Fahrzeugladung beschädigt.');seenCargo.add(id);qty+=b.qty;}if(Math.abs(qty-sh.qty)>1e-7)fail('Ladungsmenge widersprüchlich.');}
  if(sh.paymentAt!=null&&(!finite(sh.paymentAt,0)||!finite(sh.invoiceAmount,0)))fail('Forderung beschädigt.');
 }
 for(const v of s.vehicles)if(v.status==='tour'&&!s.tours.some(t=>t.id===v.tour&&t.vehicleId===v.id&&!['complete','cancelled'].includes(t.status)))fail('Sammeltourzuweisung beschädigt.');
 if(s.accountingWatermarks!==undefined){if(!s.accountingWatermarks||typeof s.accountingWatermarks!=='object'||Array.isArray(s.accountingWatermarks))fail('Buchungszeitmarken beschädigt.');for(const [key,value]of Object.entries(s.accountingWatermarks))if(!/^(energy|rent|interest|wage:[^:]+)$/.test(key)||!Number.isSafeInteger(value)||value<0||value>s.t)fail('Buchungszeitmarke beschädigt.');}
 for(const mod of MODULES)if(mod.validate)mod.validate(s);
 return true;
}
export class Simulation{
 constructor({mode='guided',seed=123}={}){
 if(!['guided','economy','sandbox'].includes(mode))throw new Error('Unbekannter Spielmodus.');
 this.state={schema:1,mode,seed:Number(seed)>>>0,t:480,seq:2,money:mode==='sandbox'?500000:85000,reputation:50,selectedSite:'site-1',sites:[{id:'site-1',name:'Werk Morgenfeld',x:0,y:0,width:20,height:16,energy:30}],buildings:[],workers:[],batches:[],reservations:[],jobs:[],purchases:[],orders:[],vehicles:[],shipments:[],ledger:[],events:[],research:[],rules:[],returns:[],stats:{produced:0,delivered:0,revenue:0,costs:0},settings:{incidents:true},milestones:[]};
 this.makeAPI();for(const mod of MODULES)mod.init?.(this.state,this.api);this.api.log('system','Unternehmen gegründet. Halle bereit.');
 }
 makeAPI(){const s=this.state;const api={command:c=>this.command(c),id:prefix=>`${prefix}-${s.seq++}`,random:()=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;},log:(kind,text,refs=[])=>{s.events.push({id:api.id('event'),t:s.t,kind,text,refs});if(s.events.length>3000)s.events.splice(0,s.events.length-3000);},book:(...args)=>economy.book(s,...args),distance:b=>reachable(s,b.site).distances?.[b.id]??0,reachable:site=>reachable(s,site)};
 api.inventory=inventory.createAPI(s,api);api.workforce=workforce.createAPI(s,api);this.api=api;
 }
 command(c){if(!c||typeof c.type!=='string')return {ok:false,message:'Befehl fehlt.'};
 const result=this.worldCommand(c);if(result)return result;
 for(const mod of MODULES){const handled=mod.handle?.(this.state,c,this.api);if(handled!==null&&handled!==undefined)return handled;}
 return {ok:false,message:'Befehl unbekannt.'};}
 worldCommand(c){const s=this.state,api=this.api;
 if(c.type==='selectSite'){if(!s.sites.some(a=>a.id===c.id))return {ok:false,message:'Standort fehlt.'};s.selectedSite=c.id;return {ok:true};}
 if(c.type==='settings'){if(typeof c.incidents!=='boolean')return {ok:false,message:'Einstellung ungültig.'};s.settings.incidents=c.incidents;return {ok:true};}
 if(!['build','move','demolish'].includes(c.type))return null;
 const old=s.buildings.find(x=>x.id===c.id);if(c.type!=='build'&&!old)return {ok:false,message:'Gebäude fehlt.'};
 if(old&&(s.research.some(r=>r.building===old.id&&r.status==='active')||old.serviceJob||old.maintenanceTask||old.freightTask||old.task||old.job||s.jobs.some(j=>j.building===old.id&&!['done','cancelled','completed'].includes(j.status))||s.batches.some(b=>b.qty>0&&(b.building===old.id||b.bin===old.id))))return {ok:false,message:'Anlage belegt. Vorgang zuerst abschließen.'};
 if(c.type==='demolish'){
 const d=BUILDINGS[old.type];const check=reachable(s,old.site,s.buildings.filter(b=>b!==old));if(!check.ok)return check;if(d.capacity){const used=api.inventory.used(old.site),capacity=api.inventory.capacity(old.site)-d.capacity;if(used>capacity)return {ok:false,message:'Lagerinhalt schützt Gebäude vor Abriss.'};}
 if(!api.book('demolish:'+old.id,Math.round(d.cost*.35),'construction','Rückbau '+d.name,[old.id]))return {ok:false,message:'Rückbau konnte nicht gebucht werden.'};s.buildings=s.buildings.filter(b=>b!==old);api.log('build','Gebäude zurückgebaut.',[old.id]);return {ok:true};}
 const type=c.type==='build'?c.buildingType:old.type,d=BUILDINGS[type];if(!d)return {ok:false,message:'Gebäudetyp unbekannt.'};
 const site=c.type==='build'?(c.site||s.selectedSite):old.site;const rotation=c.rotation??old?.rotation??0;if(![0,90,180,270].includes(rotation))return {ok:false,message:'Drehung ungültig.'};
 const candidate={...(old||{}),id:old?.id||'proposed',type,site,x:c.x,y:c.y,rotation,status:'idle',progress:0,job:null,condition:old?.condition??100,recipe:old?.recipe??null,enabled:old?.enabled??true};
 const list=[...s.buildings.filter(b=>b!==old),candidate];const check=reachable(s,site,list);if(!check.ok)return check;
 if(c.type==='build'){if(!api.book('build:'+s.seq,-d.cost,'construction',d.name))return {ok:false,message:'Kapital reicht nicht.'};candidate.id=api.id('building');s.buildings.push(candidate);}else Object.assign(old,candidate);
 api.log('build',d.name+(c.type==='build'?' errichtet.':' versetzt.'),[candidate.id]);return {ok:true,id:candidate.id};
 }
 step(minutes=1){if(!Number.isInteger(minutes)||minutes<0||minutes>100000)throw new Error('Spielschritte müssen ganze Minuten sein.');for(let n=0;n<minutes;n++){this.state.t++;for(const mod of MODULES)mod.step?.(this.state,this.api);}return this.state;}
 serialize(){return JSON.stringify(this.state);}
 static fromJSON(text){if(typeof text!=='string'||text.length>30000000)throw new Error('Spielstand fehlt oder zu groß.');let state;try{state=JSON.parse(text);}catch{throw new Error('Spielstand enthält ungültiges JSON.');}migrate(state);validateState(state);const sim=Object.create(Simulation.prototype);sim.state=state;sim.makeAPI();lastValidText=text;return sim;}
 /** true, wenn genau dieser Text zuletzt fehlerfrei durch fromJSON geladen wurde. Spart der Speicherroutine eine erneute Vollvalidierung. */
 static wasValidated(text){return typeof text==='string'&&text===lastValidText;}
 forecast(minutes,commands=[]){const sim=Simulation.fromJSON(this.serialize());for(const c of commands){const r=sim.command(clone(c));if(!r.ok)throw new Error(r.message);}sim.step(minutes);return sim.state;}
}
