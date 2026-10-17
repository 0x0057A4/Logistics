import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplayBuffer,REPLAY,maxOffset,parseSnapshot,textBytes} from '../dist/replay.js';
import {boot} from './ui-harness.js';
// Replay 60 Min. (W3c-S3, A12/A10): Ringpuffer, Speicherbudget, keine Fachmutation, Befehlssperre, Live-Rückkehr, Speichern = Live.
const text=(ui,id)=>ui.nodes.get('#'+id).textContent;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
const key=(ui,k,code='')=>{let prevented=false;ui.listeners.keydown({key:k,code,target:{matches:()=>false},preventDefault(){prevented=true;}});return prevented;};
/** Startet ein Depot und lässt `minutes` Spielminuten laufen; nimmt fällige Momentaufnahmen wie der Leerlaufrückruf auf. */
async function running(minutes=65){
 const ui=await boot();await ui.click('start');ui.click('starter');ui.click('acceptContract',ui.run("sim.state.contracts.find(c=>c.status==='offer')?.id"));
 ui.run(`for(let i=0;i<${minutes};i++){sim.step(1);replayTake();}render(true)`);return ui;
}

test('Puffer: 13 Aufnahmen je 5 Spielminuten, höchstens 60 Min., nächster Treffer und Rücksprung leeren',()=>{
 assert.deepEqual({...REPLAY},{interval:5,window:60,slots:13,budget:30000000,speed:4});
 const b=createReplayBuffer();
 for(let t=480;t<=600;t++)if(b.due(t))assert.equal(b.add(t,'{"t":'+t+'}'),true);
 assert.equal(b.due(600),false,'gleiche 5-Minuten-Scheibe nicht doppelt');
 assert.equal(b.size,13);assert.deepEqual(b.list().map(e=>e.t),[540,545,550,555,560,565,570,575,580,585,590,595,600]);
 assert.equal(b.nearest(573).t,575);assert.equal(b.nearest(572.5).t,570,'Gleichstand: ältere Aufnahme');assert.equal(b.atOrBefore(574).t,570);assert.equal(b.atOrBefore(100).t,540);
 assert.equal(maxOffset(b,603),60,'Regler höchstens −60');assert.equal(maxOffset(b,560),20);
 assert.equal(parseSnapshot(b.nearest(560).text).t,560);
 assert.equal(b.due(300),true);b.add(300,'{}');assert.deepEqual(b.list().map(e=>e.t),[300],'Zeit rückwärts (anderer Stand) leert den Puffer');
 b.clear();assert.equal(b.size,0);assert.equal(b.nearest(1),null);assert.equal(maxOffset(b,600),0);
});

test('Speicherbudget: große Stände behalten weniger, ausgedünnte Aufnahmen, zu große werden verworfen',()=>{
 const big='x'.repeat(1000);assert.equal(textBytes(big),2000);
 const b=createReplayBuffer({budget:9000});
 for(let t=480;t<=540;t+=5)b.add(t,big);
 assert.equal(b.size,4,'4 × 2000 B ≤ 9000 B');assert.ok(b.bytes<=9000);assert.equal(b.capacity,4);
 const ts=b.list().map(e=>e.t);assert.equal(ts[0],480,'ausgedünnt: Rückblick reicht weiter bis −60');assert.equal(ts.at(-1),540);assert.deepEqual(ts,[480,500,515,540]);
 assert.equal(b.add(545,'y'.repeat(5000)),false,'Einzelaufnahme über Budget');assert.equal(b.stats.skipped,1);assert.equal(b.size,4,'vorhandene Aufnahmen bleiben');
 const real=createReplayBuffer();assert.equal(real.capacity,13);
});

test('Aufnahme und Replay ändern den Fachzustand nicht; Ansicht ist ein eigenes Objekt',async()=>{
 const ui=await running(65);
 assert.equal(ui.run('replayBuf.size'),13);assert.equal(ui.nodes.get('#replayBtn').dataset.snapshots,'13');
 const before=ui.run('sim.serialize()'),liveT=ui.run('sim.state.t');
 ui.run('globalThis.shown=[];scene.setState=s=>shown.push(s)');
 press(ui,{action:'replay'});
 assert.equal(ui.run('!!rp'),true);assert.equal(ui.run('speed'),0);
 ui.run('replaySeek(30)');
 const snapT=ui.run('rp.shownT');assert.ok(Math.abs(liveT-30-snapT)<=3,`Snapshot nahe −30 (${liveT}→${snapT})`);
 assert.equal(ui.run('shown.at(-1).t'),snapT,'Szene erhält Snapshot-Zustand');assert.equal(ui.run('shown.at(-1)!==sim.state'),true);
 assert.equal(ui.run('V().state!==sim.state&&V()!==sim'),true);
 ui.run("V().state.money=-1;V().state.buildings.length=0");assert.notEqual(ui.run('sim.state.money'),-1,'Ansicht teilt keine Objekte mit sim');
 ui.run('rp.cache.clear();rp.view=null;replaySeek(35);replaySeek(30)');
 ui.run('replayPlay()');for(let i=0;i<30;i++)ui.run('replayTick(1000)');
 assert.equal(ui.run('sim.serialize()'),before,'Replay inkl. Abspielen lässt sim unverändert');
 assert.equal(ui.run('replayTake()'),false,'im Replay keine Aufnahme');
 press(ui,{action:'replayLive'});assert.equal(ui.run('sim.serialize()'),before);
});

test('HUD und Panels zeigen Snapshot-Werte mit Banner',async()=>{
 const ui=await running(65);const liveClock=text(ui,'clock');
 press(ui,{action:'replay'});ui.run('replaySeek(25)');
 const ago=ui.run('replayAgo()');assert.equal(text(ui,'replayLabel'),`Replay −${ago} Min. · nur Ansicht`);assert.ok(Math.abs(ago-25)<=3);
 assert.equal(ui.nodes.get('#replayBar').hidden,false);assert.equal(text(ui,'clock'),ui.run('time(rp.shownT)'));assert.notEqual(text(ui,'clock'),liveClock);
 assert.equal(text(ui,'simState'),'Replay · nur Ansicht');
 press(ui,{panel:'overview'});assert.match(text(ui,'panelEyebrow'),/^REPLAY −\d+ MIN\. · NUR ANSICHT$/);
 assert.equal(ui.nodes.get('#replayRange').value,'-25');
 ui.run('replaySeek(0)');assert.equal(ui.run('V()===sim'),true,'Regler 0 = Live-Zustand (pausiert)');
});

test('Befehlssperre: send, Tempo, Bauen, Versetzen, Planung und Kürzel blocken mit Hinweis',async()=>{
 const ui=await running(30);ui.run('setSpeed(4)');press(ui,{action:'replay'});
 const before=ui.run('sim.serialize()');
 const r=ui.run("send({type:'hire',role:'driver'})");assert.equal(r.ok,false);assert.match(text(ui,'toast'),/Replay gesperrt · nur Ansicht/);
 press(ui,{action:'build'});assert.equal(ui.nodes.get('#buildTray').hidden,true,'Baumodus bleibt zu');
 const b=ui.run("sim.state.buildings[0].id");press(ui,{action:'move',id:b});assert.equal(ui.run('moving'),null);
 press(ui,{speed:'12'});assert.equal(ui.run('speed'),0);
 assert.equal(key(ui,' ','Space'),true);assert.equal(ui.run('speed'),0);key(ui,'3');assert.equal(ui.run('speed'),0);key(ui,'b');assert.equal(ui.nodes.get('#buildTray').hidden,true);
 ui.submit('forecast',{minutes:'60',alternative:''});assert.equal(ui.run('forecast'),null);
 ui.run("scene.setState=()=>{}");
 assert.equal(ui.run('sim.serialize()'),before,'kein Befehl hat den Live-Zustand verändert');
 // Ohne Replay laufen Befehle wie gewohnt.
 press(ui,{action:'replayLive'});assert.equal(ui.run("send({type:'hire',role:'driver'},true).ok"),true);
});

test('Live-Rückkehr: Live-Knopf, Esc, Rechtsklick und Z stellen Zustand und Tempo wieder her',async()=>{
 const ui=await running(65);const liveClock=text(ui,'clock');
 ui.run('setSpeed(12)');press(ui,{action:'replay'});ui.run('replaySeek(40)');assert.notEqual(text(ui,'clock'),liveClock);
 press(ui,{action:'replayLive'});assert.equal(ui.run('rp'),null);assert.equal(ui.run('speed'),12,'Tempo wiederhergestellt');assert.equal(text(ui,'clock'),liveClock);assert.equal(ui.nodes.get('#replayBar').hidden,true);assert.equal(ui.run('V()===sim'),true);
 ui.run('setSpeed(4)');key(ui,'z');assert.equal(ui.run('!!rp'),true);assert.equal(ui.run('speed'),0);key(ui,'Escape');assert.equal(ui.run('rp'),null);assert.equal(ui.run('speed'),4);
 ui.run('setSpeed(0)');press(ui,{action:'replay'});assert.equal(ui.run('cancelByContext()'),true);assert.equal(ui.run('rp'),null);assert.equal(ui.run('speed'),0,'pausiert bleibt pausiert');
 press(ui,{action:'replay'});key(ui,'z');assert.equal(ui.run('rp'),null,'Z schaltet zurück');
 ui.run("paletteHits('>replay')[0].run()");assert.equal(ui.run('!!rp'),true,'Palette „Replay“');ui.run("paletteHits('>live')[0].run()");assert.equal(ui.run('rp'),null);
 // Abspielen läuft bis Live-Zeit und bleibt dann bei 0 stehen.
 press(ui,{action:'replay'});ui.run('replaySeek(10);replayPlay()');for(let i=0;i<5;i++)ui.run('replayTick(1000)');assert.equal(ui.run('rp.playing'),false);assert.equal(ui.run('rp.offset'),0);
 press(ui,{action:'replayLive'});
});

test('Speichern während Replay schreibt den Live-Zustand',async()=>{
 const ui=await running(65);const live=ui.run('sim.serialize()'),liveT=ui.run('sim.state.t');
 press(ui,{action:'replay'});ui.run('replaySeek(30)');assert.notEqual(ui.run('V().state.t'),liveT);
 press(ui,{action:'save'});
 const stored=ui.memory.get('industrie-logistik-v1-guided');assert.equal(stored,live);assert.equal(JSON.parse(stored).t,liveT);
 press(ui,{action:'replayLive'});
});

test('Ohne Momentaufnahme startet kein Replay; neuer Spielstand leert den Puffer',async()=>{
 const ui=await boot();await ui.click('start');
 press(ui,{action:'replay'});assert.equal(ui.run('rp'),null);assert.match(text(ui,'toast'),/Noch keine Momentaufnahme/);
 ui.run('for(let i=0;i<20;i++){sim.step(1);replayTake();}');assert.equal(ui.run('replayBuf.size'),5);
 ui.run('sim=Simulation.fromJSON(sim.serialize())');assert.equal(ui.run('replayTake()'),true);assert.equal(ui.run('replayBuf.size'),1,'anderes sim-Objekt: Puffer neu');
});
