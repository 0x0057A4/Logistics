import {injectPortableSave,portableTemplate} from '../dist/portable-save.js';
import {RENTAL_RATES} from '../dist/rental.js';
import * as tours from '../dist/tours.js';
// Isolierte JavaScript-/Bindungsprüfung. Kein Browser, kein Layouttest.
import {createSaveGuard as realGuard} from '../dist/save-guard.js';
import {createSaveStore as realStore} from '../dist/storage.js';
import {report,periods,assetInfo,accumulated} from '../dist/accounting.js';
import {buildResearchMissing} from '../dist/management.js';
import {summary as sortSummary,CROSSBELT,MISSORT_EVERY} from '../dist/sorting.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {Simulation} from '../dist/core.js';
import * as catalog from '../dist/catalog.js';
import {onShift,describeAssignment,workRate,UNLOAD_BASE,SPECIALIST_FACTOR} from '../dist/workforce.js';
import {gateKey,unloadKey,forkliftKey,sitePowered,FORKLIFT,PALLET_BASE,WAIT as YARD_WAIT,forkItem,BULKY_BASE} from '../dist/yard.js';
import {unitOf,itemOf,containersUnlocked,TERMS,deliverySiteOf,laneSite,siteDistance,wareOf,shipperScore,shipperOf,SATISFACTION} from '../dist/contracts.js';
import {active as disruptionsActive,weatherAt,WEATHER_NAME,WEATHER_FACTOR} from '../dist/disruptions.js';
import {KIND_TEXT as TICKET_KIND_TEXT,RESPONSE_MINUTES as TICKET_RESPONSE_MINUTES} from '../dist/customer-service.js';
import {coolingCapacity,coolingFree} from '../dist/special.js';
import {teuCapacity,teuUsed,TEU} from '../dist/containers.js';
import {nextDeparture,MAX_DEPARTURES,WAIT as LINE_WAIT,CUTOFF as LINE_CUTOFF} from '../dist/linehaul.js';
import {createReplayBuffer,REPLAY,maxOffset,parseSnapshot} from '../dist/replay.js';
import {maxLoad,maintenanceCost,EXTERNAL_SERVICE,WEAR_WARN,deliverableAt} from '../dist/transport.js';
import {AIRPORT,AIR,handlingMinutes,tripCost,airportDistance,room as airRoom,nextFlight as airNextFlight} from '../dist/airexport.js';
import {TICK as ASSIST_TICK,LOG_MAX as ASSIST_LOG_MAX} from '../dist/assistant.js';
import * as uiExplain from '../dist/ui-explain.js'; // 0.17 A10-E
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const code=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
export async function boot(options={}){
 const downloads=[];
 const listeners={},nodes=new Map(),memory=options.memory||new Map();
 // Minimaler DOM-Ersatz: Kindlisten, Attribute und Klassen genügen für die schlüsselbasierten HUD-Listen.
 const node=()=>{const classes=new Set();return {dataset:{},innerHTML:'',textContent:'',value:'',scrollTop:0,hidden:false,children:[],parentNode:null,attributes:{},style:{},classList:{toggle(c,force){const on=force===undefined?!classes.has(c):!!force;on?classes.add(c):classes.delete(c);return on;},add(...c){c.forEach(x=>classes.add(x));},remove(...c){c.forEach(x=>classes.delete(x));},contains(c){return classes.has(c);}},contains(){return false;},addEventListener(type,fn){this['on'+type]=fn;},setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},removeAttribute(k){delete this.attributes[k];},focus(){document.activeElement=this;},blur(){if(document.activeElement===this)document.activeElement=null;},showModal(){this.open=true;},close(){this.open=false;},click(){if(this.download)downloads.push({href:this.href,name:this.download});},appendChild(c){return this.insertBefore(c,null);},insertBefore(c,ref){c.remove?.();const i=ref?this.children.indexOf(ref):-1;i<0?this.children.push(c):this.children.splice(i,0,c);c.parentNode=this;return c;},remove(){const p=this.parentNode;if(p){p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}}};};
 for(const [,id]of html.matchAll(/id="([^"]+)"/g))nodes.set('#'+id,node());
 if(options.embeddedSave!==undefined){nodes.set('#embedded-save',{...node(),textContent:options.embeddedSave});nodes.set('#embedded-prefs',{...node(),textContent:JSON.stringify(options.embeddedPrefs||{})});}
 const document={getElementById:id=>nodes.get('#'+id)||null,documentElement:{outerHTML:options.outerHTML||''},body:node(),hidden:false,activeElement:null,querySelector(s){if(s==='dialog[open]')return [...nodes.values()].find(n=>n.open)||null;if(s==='input[name=mode]:checked')return{value:'guided'};assert.ok(nodes.has(s),'Unbekannter DOM-Selektor '+s);return nodes.get(s);},querySelectorAll(){return[];},addEventListener(type,fn){listeners[type]=fn;},createElement:node};
 class Scene{setState(){}setBuild(){}setView(){}zoom(){}rotate(){}home(){}}
 const locks=options.locks||makeLocks();
 const storage=options.storage||{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const createSaveGuard=opts=>realGuard({...opts,storage:options.storageGetterError?null:storage,locks,setInterval:()=>1,clearInterval:()=>{}});
 // Spielstandspeicher: ohne options.indexedDB Rückfall localStorage (bisheriges Verhalten); mit Stub IndexedDB-Pfad.
 let context;
 const createSaveStore=opts=>realStore({...opts,storage:()=>context.localStorage,indexedDB:options.indexedDB??null,...(options.storeOptions||{})});
 context=vm.createContext({...catalog,injectPortableSave,portableTemplate,fetch:options.fetch,RENTAL_RATES,planTour:tours.planTour,committedQty:tours.committedQty,maxLoad,maintenanceCost,EXTERNAL_SERVICE,WEAR_WARN,createSaveGuard,createSaveStore,report,periods,assetInfo,accumulated,buildResearchMissing,sortSummary,CROSSBELT,MISSORT_EVERY,forkItem,BULKY_BASE,wareOf,shipperScore,shipperOf,SATISFACTION,disruptionsActive,weatherAt,WEATHER_NAME,WEATHER_FACTOR,TICKET_KIND_TEXT,TICKET_RESPONSE_MINUTES,coolingCapacity,coolingFree,SPECIALIST_FACTOR,Simulation,onShift,describeAssignment,workRate,UNLOAD_BASE,gateKey,unloadKey,forkliftKey,sitePowered,FORKLIFT,PALLET_BASE,YARD_WAIT,unitOf,itemOf,containersUnlocked,teuCapacity,teuUsed,TEU,TERMS,deliverySiteOf,laneSite,siteDistance,nextDeparture,MAX_DEPARTURES,LINE_WAIT,LINE_CUTOFF,deliverableAt,createReplayBuffer,REPLAY,maxOffset,parseSnapshot,AIRPORT,AIR,handlingMinutes,tripCost,airportDistance,airRoom,airNextFlight,ASSIST_TICK,ASSIST_LOG_MAX,Scene,document,window:{addEventListener(){}},localStorage:storage,matchMedia:()=>({matches:false}),performance:{now:()=>1000},setTimeout(){},clearTimeout(){},setInterval(){},Blob,URL,FormData:class{constructor(f){return Object.entries(f.values);}}});
 Object.assign(context,uiExplain); // 0.17 A10-E: ui-explain.js für app.js
 if(options.storageGetterError)Object.defineProperty(context,'localStorage',{get(){throw new DOMException('Access denied','SecurityError');}});
 vm.runInContext(code,context);await vm.runInContext('ready',context);
 const run=source=>vm.runInContext(source,context);
 function click(action,id){const b={dataset:{action,id},matches:()=>false};return listeners.click({target:{closest:()=>b}});}
 function submit(form,values,id){const f={dataset:{form,id},values};return listeners.submit({preventDefault(){},target:{closest:()=>f}});}
 return {run,click,submit,nodes,memory,listeners,downloads};
}

export function makeLocks(){const held=new Set();return {request:async(name,options,fn)=>{if(held.has(name))return fn(null);held.add(name);try{return await fn({name});}finally{held.delete(name);}}};}
