// A12 · W1b (QS-W0-03/11): Spielstände in IndexedDB. Einheit dist/storage.js gegen IDB-Stub (tests/idb-stub.js)
// und App-Ablauf im UI-Harness mit IndexedDB-Pfad. Echte Browserprüfung: tests/browser/smoke.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {createSaveStore} from '../dist/storage.js';
import {createIDB,memoryStorage} from './idb-stub.js';
import {boot,makeLocks} from './ui-harness.js';

const P='industrie-logistik-v1',K=P+'-guided',DB=P;
const tick=()=>new Promise(r=>setImmediate(r));
const settle=async(n=40)=>{for(let i=0;i<n;i++)await tick();};
const valid=(min=30,seed=9)=>{const s=new Simulation({mode:'guided',seed});s.step(min);return s.serialize();};
const make=(idb,ls,extra={})=>createSaveStore({prefix:P,indexedDB:idb,storage:ls,...extra});
const rec=(idb,key)=>idb.peek(DB,'saves',key)?.value;

test('Migration: localStorage → IndexedDB atomar, Rücklesen, Originale erst beim nächsten Start entfernt',async()=>{
 const idb=createIDB(),ls=memoryStorage(),a=valid(),b=valid(60);
 ls.setItem(K,a);ls.setItem(K+'-backup',b);ls.setItem(K+'-backup-hold','{"t":510}');ls.setItem(P+'-prefs','{}');ls.setItem(K+'-writer','{}');
 const s1=make(idb,ls);assert.equal(await s1.open(),'idb');
 assert.equal(rec(idb,K),a);assert.equal(rec(idb,K+'-backup'),b);assert.equal(rec(idb,K+'-backup-hold'),'{"t":510}');
 assert.equal(rec(idb,P+'-prefs'),undefined,'Einstellungen bleiben in localStorage');assert.equal(rec(idb,K+'-writer'),undefined,'Sperre bleibt in localStorage');
 assert.equal(s1.migration.count,3);assert.equal(ls.getItem(K),a,'Original bleibt bis zum nächsten Start');assert.equal(ls.getItem(P+'-backend'),'idb');
 await s1.load(s1.keysFor('guided'));assert.equal(s1.get(K),a);assert.equal(s1.has(K),true);assert.equal(s1.has(P+'-economy'),false);
 // Weiterspielen in IndexedDB, dann zweiter Start: Originale weg, IndexedDB unverändert maßgeblich.
 const newer=valid(90);assert.equal((await s1.write({[K]:newer})).ok,true);
 const s2=make(idb,ls);assert.equal(await s2.open(),'idb');assert.equal(s2.migration.count,0);assert.equal(s2.migration.removed,3);
 assert.equal(ls.getItem(K),null);assert.equal(ls.getItem(K+'-backup'),null);assert.equal(ls.getItem(P+'-prefs'),'{}');
 await s2.load([K]);assert.equal(s2.get(K),newer);
});

test('Migration: zwei gleichzeitig startende Tabs übernehmen genau einmal; späterer Start überschreibt neueren Stand nicht',async()=>{
 const idb=createIDB(),ls=memoryStorage(),a=valid();ls.setItem(K,a);
 const s1=make(idb,ls),s2=make(idb,ls);
 const [k1,k2]=await Promise.all([s1.open(),s2.open()]);assert.deepEqual([k1,k2],['idb','idb']);
 assert.equal(s1.migration.count+s2.migration.count,1,'genau eine Übernahme');
 const newer=valid(120);await s1.write({[K]:newer});
 const s3=make(idb,ls);await s3.open();await s3.load([K]);assert.equal(s3.get(K),newer);
});

test('Migration nicht bestätigt (Schreibfehler) → Rückfall localStorage, Originale unangetastet, später erneut',async()=>{
 const idb=createIDB({failPut:k=>k===K?Object.assign(new Error('voll'),{name:'QuotaExceededError'}):null}),ls=memoryStorage(),a=valid();ls.setItem(K,a);
 const s1=make(idb,ls);assert.equal(await s1.open(),'local');assert.equal(s1.get(K),a);assert.equal(ls.getItem(P+'-backend'),null);
 idb.options.failPut=null;const s2=make(idb,ls);assert.equal(await s2.open(),'idb');assert.equal(rec(idb,K),a);assert.equal(ls.getItem(K),a);
});

test('Backend-Wahl: ohne IndexedDB localStorage; Marker „idb“ ohne erreichbare IndexedDB → error (kein stiller Rückfall); Zeitlimit',async()=>{
 const ls=memoryStorage();ls.setItem(K,valid());
 const local=make(null,ls);assert.equal(await local.open(),'local');assert.equal(local.lazy,false);assert.equal(local.get(K),ls.getItem(K));
 ls.setItem(P+'-backend','idb');
 const gone=make(null,ls);assert.equal(await gone.open(),'error');assert.throws(()=>gone.get(K));assert.throws(()=>gone.write({[K]:'x'}));
 const failing=make(createIDB({failOpen:true}),ls);assert.equal(await failing.open(),'error');
 const hanging=make(createIDB({hangOpen:true}),memoryStorage(),{openTimeoutMs:20});assert.equal(await hanging.open(),'local');assert.equal(hanging.reason,'idb-open');
 // Erneuter Versuch nach Behebung
 const idb=createIDB({failOpen:true}),retry=make(idb,ls);assert.equal(await retry.open(),'error');idb.options.failOpen=false;assert.equal(await retry.retry(),'idb');
});

test('Schreiben: eine Transaktion je Aufruf, Reihenfolge erhalten; Fehler → onWriteError, Cache aus IndexedDB nachgeladen',async()=>{
 const errors=[],commits=[],idb=createIDB(),ls=memoryStorage();
 const s=make(idb,ls,{onWriteError:e=>errors.push(e),onCommit:c=>commits.push(c.seq)});await s.open();await s.load([K,K+'-backup']);
 const p1=s.write({[K+'-backup']:'A',[K]:'B'}),p2=s.write({[K+'-backup']:'B',[K]:'C'});
 assert.equal(s.get(K),'C','Cache sofort');assert.equal(s.pendingFor(K),2);
 assert.deepEqual((await Promise.all([p1,p2])).map(r=>r.ok),[true,true]);assert.deepEqual(commits,[1,2]);
 assert.equal(rec(idb,K),'C');assert.equal(rec(idb,K+'-backup'),'B');assert.equal(s.pending,0);
 idb.options.failPut=k=>k===K?Object.assign(new Error('voll'),{name:'QuotaExceededError'}):null;
 const r=await s.write({[K+'-backup']:'C',[K]:'D'});assert.equal(r.ok,false);assert.equal(errors.length,1);assert.equal(errors[0].error.name,'QuotaExceededError');
 assert.equal(rec(idb,K+'-backup'),'B','Transaktion atomar verworfen');await settle();assert.equal(s.get(K),'C','Cache wieder = IndexedDB');
});

test('Notfall-Kopie: unbestätigter Commit beim Schließen → nächster Start übernimmt Kopie; Bestätigung entfernt sie; veraltete Kopie verworfen; Größengrenze',async()=>{
 const idb=createIDB(),ls=memoryStorage();
 const s1=make(idb,ls);await s1.open();await s1.load([K]);await s1.write({[K]:'alt'});
 idb.options.freeze=true;s1.write({[K]:'neu'});assert.equal(s1.emergency(K,'neu'),true);await settle();idb.options.freeze=false;
 assert.equal(rec(idb,K),'alt','Commit blieb aus');assert.match(ls.getItem(K+'-emergency'),/\nneu$/);
 const s2=make(idb,ls);await s2.open();await s2.load([K]);const em=s2.takeEmergency(K);assert.equal(em?.value,'neu');
 await s2.write({[K]:'neu'});assert.equal(ls.getItem(K+'-emergency'),null,'nach bestätigtem Schreiben entfernt');
 // Kopie älter als Datensatz → verworfen
 ls.setItem(K+'-emergency','1\nuralt');const s3=make(idb,ls);await s3.open();await s3.load([K]);assert.equal(s3.takeEmergency(K),null);assert.equal(ls.getItem(K+'-emergency'),null);
 // Zu groß → nicht abgelegt, ältere Kopie entfernt (nie veraltete Kopie über neuerem Stand)
 const s4=make(idb,ls,{emergencyLimit:10});await s4.open();await s4.load([K]);ls.setItem(K+'-emergency','9\nx');s4.write({[K]:'01234567890'});
 assert.equal(s4.emergency(K,'01234567890'),false);assert.equal(ls.getItem(K+'-emergency'),null);await s4.flush();
 // localStorage voll → false, keine Ausnahme
 const full=memoryStorage(new Map(),{quota:5}),s5=make(idb,full);await s5.open();await s5.load([K]);s5.write({[K]:'abcdefgh'});assert.equal(s5.emergency(K,'abcdefgh'),false);await s5.flush();
});

// ---- App-Ablauf (UI-Harness) mit IndexedDB-Pfad ----
const bootIdb=(idb,memory,more={})=>boot({memory,indexedDB:idb,...more});

test('App: Migration beim ersten Start, Weiterspielen schreibt nur IndexedDB; zweiter Start entfernt Original und lädt neuesten Stand',async()=>{
 const idb=createIDB(),memory=new Map(),a=valid();memory.set(K,a);memory.set(P+'-prefs',JSON.stringify({mode:'guided'}));
 const ui=await bootIdb(idb,memory);assert.equal(ui.run('store.kind'),'idb');assert.equal(ui.run('started'),true);assert.equal(ui.run('sim.state.t'),510);
 ui.run('sim.step(5);dirty=true');assert.equal(ui.run('save()'),true);assert.match(ui.nodes.get('#statusText').textContent,/^Wird gesichert/);
 await ui.run('store.flush()');assert.match(ui.nodes.get('#statusText').textContent,/^Gesichert · /);
 assert.equal(JSON.parse(rec(idb,K)).t,515);assert.equal(rec(idb,K+'-backup'),a,'Rotation in IndexedDB');assert.equal(memory.get(K),a,'Original unverändert');
 ui.run('guard.dispose()');await tick();
 const ui2=await bootIdb(idb,memory);assert.equal(memory.has(K),false,'Original nach bestätigter Migration entfernt');assert.equal(ui2.run('sim.state.t'),515);
 ui2.run('guard.dispose()');
});

test('App (IndexedDB): Befund 11 – neues Unternehmen behält eigene rotierende Sicherung, altes im Platz -backup-prev',async()=>{
 const idb=createIDB(),memory=new Map(),good=valid();memory.set(K,good);
 const ui=await bootIdb(idb,memory);
 await ui.click('new');await ui.click('confirmOk');await ui.click('start');await ui.click('confirmOk');await ui.run('store.flush()');
 assert.equal(rec(idb,K+'-backup-prev'),good);
 const written=new Set();for(let i=0;i<3;i++){ui.run('sim.step(15)');ui.run('dirty=true');assert.ok(ui.run('save()'));written.add(ui.run('lastWritten.get(store.keysFor("guided")[0])'));}
 await ui.run('store.flush()');assert.ok(written.has(rec(idb,K+'-backup')),'laufende Sicherung = neues Unternehmen');assert.equal(rec(idb,K+'-backup-prev'),good);
 ui.run('guard.dispose()');
});

test('App (IndexedDB): zweiter Tab bleibt schreibgeschützt, Speichern ändert IndexedDB nicht',async()=>{
 const idb=createIDB(),memory=new Map(),locks=makeLocks();
 const a=await bootIdb(idb,memory,{locks});await a.click('start');await a.run('store.flush()');const saved=rec(idb,K);
 const b=await bootIdb(idb,memory,{locks});assert.equal(b.run('writable'),false);assert.equal(b.run('started'),true,'Lesezugriff zeigt Stand');
 b.run('sim.step(3);dirty=true');assert.equal(b.run('save()'),false);await b.run('store.flush()');assert.equal(rec(idb,K),saved);
 a.run('guard.dispose()');b.run('guard.dispose()');
});

test('App (IndexedDB): Schreibfehler nach save() → NICHT GESPEICHERT, dirty bleibt, Sicherung unversehrt',async()=>{
 const idb=createIDB(),memory=new Map();
 const ui=await bootIdb(idb,memory);await ui.click('start');ui.run('sim.step(5);dirty=true;save()');await ui.run('store.flush()');const before=rec(idb,K),backup=rec(idb,K+'-backup');
 idb.options.failPut=()=>Object.assign(new Error('voll'),{name:'QuotaExceededError'});
 ui.run('sim.step(5);dirty=true');assert.equal(ui.run('save()'),true,'synchron eingereiht');await ui.run('store.flush()');await settle();
 assert.equal(ui.run('dirty'),true);assert.match(ui.nodes.get('#statusText').textContent,/NICHT GESPEICHERT/);assert.equal(rec(idb,K),before);assert.equal(rec(idb,K+'-backup'),backup);
 idb.options.failPut=null;assert.equal(ui.run('save()'),true);await ui.run('store.flush()');assert.equal(rec(idb,K),ui.run('sim.serialize()'));
 assert.ok(Simulation.fromJSON(rec(idb,K+'-backup')),'Sicherung gültig (Cache nach Fehler nachgeladen, Altstand geprüft)');
 ui.run('guard.dispose()');
});

test('App (IndexedDB): Verlassen mit offenem Commit legt Notfall-Kopie ab; Abbruch des Tabs → Neustart übernimmt sie',async()=>{
 const idb=createIDB(),memory=new Map();
 const ui=await bootIdb(idb,memory);await ui.click('start');await ui.run('store.flush()');
 idb.options.freeze=true;
 ui.run('sim.step(11);dirty=true;document.hidden=true');ui.listeners.visibilitychange();
 const expected=ui.run('sim.serialize()');assert.equal(memory.get(K+'-emergency')?.split('\n')[1],expected);
 await settle();idb.options.freeze=false;ui.run('guard.dispose()');await tick();
 assert.notEqual(rec(idb,K),expected,'Commit blieb aus (Tab beendet)');
 const ui2=await bootIdb(idb,memory);assert.equal(ui2.run('sim.serialize()'),expected,'Notfall-Kopie übernommen');
 await ui2.run('store.flush()');assert.equal(rec(idb,K),expected,'sofort in IndexedDB gesichert');assert.equal(memory.has(K+'-emergency'),false);
 ui2.run('guard.dispose()');
});

test('App: Marker „idb“, IndexedDB nicht erreichbar → Schreibschutz mit Hinweis, kein Gründen über localStorage',async()=>{
 const memory=new Map([[P+'-backend','idb']]);
 const ui=await bootIdb(createIDB({failOpen:true}),memory);
 assert.equal(ui.run('store.kind'),'error');assert.equal(ui.run('writable'),false);assert.match(ui.nodes.get('#statusText').textContent,/IndexedDB/);
 assert.equal(await ui.click('start'),false);assert.equal(memory.has(K),false);
 ui.run('guard.dispose()');
});

test('Ladegrenze: batches bis 1.000.000, andere Listen 100.000; save() verweigert nicht mehr ladbare Stände',async()=>{
 assert.equal(Simulation.LIMITS.lists.batches,1000000);assert.equal(Simulation.LIMITS.list,100000);
 const sim=new Simulation({mode:'guided',seed:3});const s=sim.state;
 const base={item:'housing',qty:0,site:s.selectedSite,owner:'company',location:'stock',quality:80,unitCost:1,parents:[],reserved:0,created:480};
 for(let i=0;i<100001;i++)s.batches.push({...base,id:'batch-'+(s.seq++)});
 assert.ok(Simulation.fromJSON(sim.serialize()),'100.001 Chargen ladbar');
 const ev=new Simulation({mode:'guided',seed:3});for(let i=0;i<100001;i++)ev.state.ledger.push({id:'ledger-'+(ev.state.seq++),key:'k'+i,t:480,amount:0,category:'x',note:'',refs:[]});
 assert.throws(()=>Simulation.fromJSON(ev.serialize()),/ledger fehlt oder zu groß/);
 assert.ok(Simulation.headroom(s,0).ratio>0.1&&Simulation.headroom(s,0).limit==='batches');
 assert.equal(Simulation.headroom(s,31000000).limit,'chars');
 // App: Stand über Ladegrenze wird nicht geschrieben, alter Stand bleibt.
 const memory=new Map(),ui=await boot({memory}),orig=Simulation.headroom;await ui.click('start');const kept=memory.get(K);
 try{
 ui.run('Simulation.headroom=()=>({ratio:1.2,limit:"chars"})');ui.run('dirty=true');assert.equal(ui.run('save()'),false);
 assert.equal(memory.get(K),kept);assert.match(ui.nodes.get('#statusText').textContent,/Ladegrenze/);
 ui.run('Simulation.headroom=()=>({ratio:0.7,limit:"chars"})');assert.equal(ui.run('save()'),true);assert.match(ui.nodes.get('#statusText').textContent,/Spielstand groß/);
 }finally{Simulation.headroom=orig;}
 ui.run('guard.dispose()');
});
