import {RENTAL_RATES} from '../dist/rental.js';
import * as tours from '../dist/tours.js';
// Isolierte JavaScript-/Bindungsprüfung. Kein Browser, kein Layouttest.
import {createSaveGuard as realGuard} from '../dist/save-guard.js';
import {report} from '../dist/accounting.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {Simulation} from '../dist/core.js';
import * as catalog from '../dist/catalog.js';
import {onShift} from '../dist/workforce.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const code=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
export async function boot(options={}){
 const listeners={},nodes=new Map(),memory=options.memory||new Map();
 const node=()=>({dataset:{},innerHTML:'',textContent:'',value:'',scrollTop:0,hidden:false,classList:{toggle(){},add(){},remove(){}},contains(){return false;},addEventListener(type,fn){this['on'+type]=fn;},showModal(){this.open=true;},close(){this.open=false;},click(){}});
 for(const [,id]of html.matchAll(/id="([^"]+)"/g))nodes.set('#'+id,node());
 const document={body:node(),hidden:false,activeElement:null,querySelector(s){if(s==='dialog[open]')return [...nodes.values()].find(n=>n.open)||null;if(s==='input[name=mode]:checked')return{value:'guided'};assert.ok(nodes.has(s),'Unbekannter DOM-Selektor '+s);return nodes.get(s);},querySelectorAll(){return[];},addEventListener(type,fn){listeners[type]=fn;},createElement:node};
 class Scene{setState(){}setBuild(){}setView(){}zoom(){}rotate(){}home(){}}
 const locks=options.locks||makeLocks();
 const storage=options.storage||{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const createSaveGuard=opts=>realGuard({...opts,storage:options.storageGetterError?null:storage,locks,setInterval:()=>1,clearInterval:()=>{}});
 const context=vm.createContext({...catalog,RENTAL_RATES,planTour:tours.planTour,createSaveGuard,report,Simulation,onShift,Scene,document,window:{addEventListener(){}},localStorage:storage,matchMedia:()=>({matches:false}),performance:{now:()=>1000},setTimeout(){},clearTimeout(){},setInterval(){},Blob,URL,FormData:class{constructor(f){return Object.entries(f.values);}}});
 if(options.storageGetterError)Object.defineProperty(context,'localStorage',{get(){throw new DOMException('Access denied','SecurityError');}});
 vm.runInContext(code,context);await vm.runInContext('ready',context);
 const run=source=>vm.runInContext(source,context);
 function click(action,id){const b={dataset:{action,id},matches:()=>false};return listeners.click({target:{closest:()=>b}});}
 function submit(form,values,id){const f={dataset:{form,id},values};return listeners.submit({preventDefault(){},target:{closest:()=>f}});}
 return {run,click,submit,nodes,memory,listeners};
}

export function makeLocks(){const held=new Set();return {request:async(name,options,fn)=>{if(held.has(name))return fn(null);held.add(name);try{return await fn({name});}finally{held.delete(name);}}};}
