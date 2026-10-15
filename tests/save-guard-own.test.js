import test from 'node:test';
import assert from 'node:assert/strict';
import {SaveGuard} from '../dist/save-guard.js';
function harness() {
  const values=new Map(), held=new Set(), timers=new Map();
  let clock=0, tid=0;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const locks={async request(key,options,callback) {
    if(held.has(key)) return callback(null);
    held.add(key);
    try { return await callback({name:key}); } finally { held.delete(key); }
  }};
  const make=(extra={})=>new SaveGuard({storage,locks,now:()=>clock,setInterval:f=>{timers.set(++tid,f);return tid;},clearInterval:id=>timers.delete(id),...extra});
  return {make,values,storage,held,timers,advance:n=>{clock+=n;for(const f of timers.values())f();}};
}
test('Zweiter Tab kann denselben Modus nicht schreiben; andere Modi unabhängig', async()=>{
 const h=harness(),a=h.make(),b=h.make(),c=h.make();
 assert.equal(await a.acquire('guided'),true);assert.equal(await b.acquire('guided'),false);
 assert.equal(b.reason,'occupied');assert.equal(b.owns('guided'),false);
 assert.equal(await c.acquire('sandbox'),true);assert.equal(a.owns('sandbox'),false);
 a.dispose();b.dispose();c.dispose();
});
test('Freigabe ermöglicht Übernahme, alter Eigentümer verliert Schreibrecht',async()=>{
 const h=harness(),a=h.make(),b=h.make();await a.acquire('guided');a.release();
 await Promise.resolve();await Promise.resolve();
 assert.equal(await b.acquire('guided'),true);assert.equal(a.owns('guided'),false);b.dispose();
});
test('Lease wird erneuert und Hintergrundpause gibt Web Lock nicht frei',async()=>{
 const h=harness(),a=h.make(),b=h.make();await a.acquire('guided');
 const before=JSON.parse(h.values.get(a.key('guided'))).until;h.advance(60000);
 assert.ok(JSON.parse(h.values.get(a.key('guided'))).until>before);
 assert.equal(await b.acquire('guided'),false);a.dispose();b.dispose();
});
test('Fremder Lease führt dauerhaft zu Lesezugriff, Freigabe löscht ihn nicht',async()=>{
 const h=harness(),lost=[],a=h.make({onLost:(...x)=>lost.push(x)});await a.acquire('guided');
 h.values.set(a.key('guided'),JSON.stringify({owner:'fremd',until:99999}));
 assert.equal(a.owns('guided'),false);assert.equal(a.reason,'ownership-lost');
 assert.equal(lost.length,1);assert.equal(JSON.parse(h.values.get(a.key('guided'))).owner,'fremd');
 assert.equal(a.renew(),false);a.dispose();
});
test('Speicherfehler und fehlende Web Locks verweigern Schreibrecht',async()=>{
 const h=harness(),a=h.make({locks:null});assert.equal(await a.acquire('guided'),false);assert.equal(a.reason,'unsupported');
 const b=h.make({storage:{setItem(){throw Error('Quota');},getItem(){return null;}}});
 assert.equal(await b.acquire('guided'),false);assert.equal(b.owns('guided'),false);assert.equal(b.reason,'storage-error');a.dispose();b.dispose();
});
test('Lesefehler nach Erwerb entzieht Schreibrecht',async()=>{
 const h=harness(),a=h.make();await a.acquire('guided');h.storage.getItem=()=>{throw Error('blocked');};
 assert.equal(a.owns('guided'),false);assert.equal(a.reason,'storage-error');assert.equal(h.timers.size,0);a.dispose();
});
test('Freigabe während ausstehender Lock-Anfrage verhindert späte Übernahme',async()=>{
 const h=harness();let callback;
 const a=h.make({locks:{request:(_,__,cb)=>{callback=cb;return Promise.resolve();}}});
 const pending=a.acquire('guided');a.release();await callback({name:'test'});
 assert.equal(await pending,false);assert.equal(a.owns('guided'),false);a.dispose();
});
test('Moduswechsel gibt vorherigen Lock frei und dispose beendet Timer',async()=>{
 const h=harness(),a=h.make();await a.acquire('guided');await a.acquire('sandbox');
 assert.equal(a.owns('guided'),false);assert.equal(a.owns('sandbox'),true);assert.equal(h.timers.size,1);
 a.dispose();assert.equal(h.timers.size,0);assert.equal(await a.acquire('guided'),false);
});
test('Lock-API-Ablehnung bleibt geschlossen',async()=>{
 const h=harness(),a=h.make({locks:{request:()=>Promise.reject(Error('denied'))}});
 assert.equal(await a.acquire('guided'),false);assert.equal(a.reason,'lock-error');a.dispose();
});
test('Globaler Storage-Getter erholt sich nach Freigabe; explizites null bleibt gesperrt',async()=>{
 const h=harness(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 let denied=true;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){if(denied)throw new DOMException('Denied','SecurityError');return h.storage;}});
 const a=h.make({storage:undefined}),b=h.make({storage:null});
 try{
  assert.equal(await a.acquire('guided'),false);assert.equal(a.reason,'storage-error');
  denied=false;
  assert.equal(await a.acquire('guided'),true);assert.equal(a.owns('guided'),true);
  assert.equal(await b.acquire('sandbox'),false);assert.equal(b.reason,'storage-error');
 }finally{a.dispose();b.dispose();if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('Standard-Timer ohne Injektion: kein „Illegal invocation“ wie im Browser',async()=>{
 const h=harness(),orig=[globalThis.setInterval,globalThis.clearInterval];const ids=[];
 // Browser-Timer werfen, wenn this weder globalThis noch undefined ist.
 globalThis.setInterval=function(f,ms){if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');const id=orig[0](f,ms);ids.push(id);return id;};
 globalThis.clearInterval=function(id){if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');return orig[1](id);};
 try{const a=new SaveGuard({storage:h.storage,locks:{request:(k,o,cb)=>cb({name:k})},now:()=>0});
  assert.equal(await a.acquire('guided'),true);assert.equal(a.owns('guided'),true);assert.equal(a.reason,'owned');a.dispose();}
 finally{[globalThis.setInterval,globalThis.clearInterval]=orig;for(const id of ids)orig[1](id);}
});
