// Messanzeige ?perf=1 (A12, W1c): reine Statistik- und Formatfunktionen, Inaktivität ohne Parameter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {perfEnabled,quantile,frameStats,rollingFps,trimBefore,longTaskSummary,assess,formatReport,startPerfOverlay,rendererInfo,speedLabel} from '../dist/perf-overlay.js';

test('perfEnabled: nur perf=1/true/ja',()=>{
 assert.equal(perfEnabled('?perf=1'),true);assert.equal(perfEnabled('?renderer=3d&perf=1'),true);assert.equal(perfEnabled('?perf=true'),true);
 assert.equal(perfEnabled(''),false);assert.equal(perfEnabled('?perf=0'),false);assert.equal(perfEnabled(undefined),false);assert.equal(perfEnabled('?perfx=1'),false);
});
test('quantile: nächstliegender Rang, leer → null',()=>{
 const v=Array.from({length:100},(_,i)=>i+1);
 assert.equal(quantile(v,.5),50);assert.equal(quantile(v,.95),95);assert.equal(quantile(v,.99),99);assert.equal(quantile(v,1),100);assert.equal(quantile(v,0),1);
 assert.equal(quantile([],.5),null);assert.equal(quantile([7],.99),7);
});
test('frameStats: 60 Hz sauber → Ziel erreicht, VSync-Rauschen toleriert',()=>{
 const d=Array.from({length:600},(_,i)=>i%3?16.67:16.75);
 const s=frameStats(d,10000);
 assert.equal(s.frames,600);assert.equal(s.fps,60);assert.equal(s.medianMs,16.67);
 assert.ok(s.overBudget>.3,'Rohanteil > 16,7 ms zählt Rauschen mit');assert.equal(s.overBudgetTol,0);
 assert.equal(assess(s).ok,true);
});
test('frameStats: 10 % Ruckler → verfehlt, Anteile und Perzentile stimmen',()=>{
 const d=[...Array(90).fill(16.6),...Array(10).fill(40)];
 const s=frameStats(d);
 assert.equal(s.p95Ms,40);assert.equal(s.p99Ms,40);assert.equal(s.maxMs,40);assert.equal(s.medianMs,16.6);
 assert.equal(s.overBudget,.1);assert.equal(s.over20,.1);assert.equal(s.over33,.1);
 assert.ok(Math.abs(s.fps-100/((90*16.6+400)/1000))<1e-9,'fps ohne Fenster aus Summe der Abstände');
 const a=assess(s);assert.equal(a.ok,false);assert.equal(a.p95ok,false);assert.equal(a.shareOk,false);assert.match(a.text,/verfehlt/);
 // 4 % Ruckler: p95 noch im Budget, Anteil < 5 %
 assert.equal(assess(frameStats([...Array(96).fill(16.6),...Array(4).fill(30)])).ok,true);
 assert.equal(assess(frameStats([])).ok,false);
});
test('rollingFps und trimBefore: Fenster (now-w, now]',()=>{
 const stamps=Array.from({length:201},(_,i)=>i*10);
 assert.equal(rollingFps(stamps,2000,1000),100);assert.equal(rollingFps(stamps,2000,500),100);
 assert.equal(rollingFps([],5000),0);
 const t=[1,2,3,4],a=['a','b','c','d'];assert.equal(trimBefore(t,2,a),2);assert.deepEqual(t,[3,4]);assert.deepEqual(a,['c','d']);
 assert.equal(trimBefore(t,0,a),0);
});
test('longTaskSummary',()=>{
 assert.deepEqual(longTaskSummary([{ms:60},{ms:120}]),{count:2,totalMs:180,maxMs:120});
 assert.deepEqual(longTaskSummary([]),{count:0,totalMs:0,maxMs:0});
});
test('formatReport: deutscher Text mit Kennzahlen, Ungültig-Hinweis',()=>{
 const stats=frameStats(Array(3600).fill(16.67),60000);
 const r={seconds:60,stats,hidden:false,longTasks:{count:2,totalMs:130,maxMs:80},render:{drawCalls:42,triangles:12345,pixelRatio:1.5},sim:{perFrame:.12,steps:720,maxMs:3.4},
  meta:{renderer:'WebGL 2 · Intel Iris Xe',speed:speedLabel(12),view:'Halle',viewport:'1600×900',dpr:1.5,version:'0.9',date:'x',ua:'Chrome'}};
 const t=formatReport(r);
 for(const s of ['60-s-Messung','Ziel erreicht','Frames: 3600','FPS Ø: 60,0','16,67 / 16,67 / 16,67','Long Tasks: 2 · Summe 130 ms','42 Draw Calls','12.345 Dreiecke','Pixelratio 1,50','Intel Iris Xe','Geschwindigkeit 12×','Ansicht Halle'])assert.ok(t.includes(s),s+' fehlt in:\n'+t);
 const t2=formatReport({...r,hidden:true,longTasks:null,render:null});
 assert.match(t2,/UNGÜLTIG/);assert.match(t2,/Long Tasks: nicht verfügbar/);assert.match(t2,/Darstellung: Canvas 2D/);
 assert.equal(speedLabel(0),'Pause');
});
test('startPerfOverlay ohne ?perf=1: null, kein rAF, kein DOM',()=>{
 let touched=0;const win={requestAnimationFrame(){touched++;},setInterval(){touched++;}},doc={createElement(){touched++;},addEventListener(){touched++;}};
 assert.equal(startPerfOverlay({search:'',win,doc}),null);assert.equal(startPerfOverlay({search:'?renderer=3d',win,doc}),null);assert.equal(touched,0);
 assert.equal(rendererInfo(null),'Canvas 2D');assert.equal(rendererInfo({renderer:{getContext:()=>{throw Error('x');}}}),'unbekannt');
});
test('app.js: Messpfad nur bei aktiver Anzeige, Einhängepunkt minimal',()=>{
 const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.match(app,/import \{startPerfOverlay\} from '\.\/perf-overlay\.js';/);
 assert.match(app,/const perf=typeof startPerfOverlay==='function'\?startPerfOverlay\(\{scene,speed:\(\)=>speed\}\):null;/);
 assert.match(app,/const p0=perf&&performance\.now\(\);sim\.step\(n\);if\(perf\)perf\.sim\(performance\.now\(\)-p0,n\);/);
 const src=fs.readFileSync(new URL('../dist/perf-overlay.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/,'keine Netzwerkzugriffe');
});
