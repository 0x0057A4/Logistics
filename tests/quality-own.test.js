// Grafikqualität (0.15-S4, A12+A09): reine Funktionen ohne DOM/WebGL. Browserprüfung der Budgets: tests/browser/quality.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {QUALITY,QUALITY_LEVELS,QUALITY_MODES,QUALITY_BUDGET,QUALITY_NAMES,qualityConfig,qualityRatio,lodFor,checkBudget,autoQualityState,autoQuality,nightLights,yardLayout,MAX_LABELS,AUTO_WINDOW_MS,AUTO_UP_HOLD_MS} from '../dist/scene3d.js';
import {qualityLabel,formatReport,frameStats} from '../dist/perf-overlay.js';

test('Stufen: Grenzen steigen monoton von Niedrig zu Hoch, Hoch = bisheriges Verhalten',()=>{
 assert.deepEqual(QUALITY_MODES,['auto','low','medium','high']);
 for(const k of ['auto',...QUALITY_LEVELS])assert.ok(QUALITY_NAMES[k]);
 const [l,m,h]=QUALITY_LEVELS.map(qualityConfig);
 assert.deepEqual([l.maxRatio,m.maxRatio,h.maxRatio],[1,1.25,1.5]);
 assert.ok(l.minRatio<=m.minRatio&&m.minRatio<=h.minRatio);
 assert.ok(l.labels<m.labels&&m.labels<=h.labels&&h.labels===MAX_LABELS);
 for(const key of Object.keys(h.cap))assert.ok(l.cap[key]<=m.cap[key]&&m.cap[key]<=h.cap[key],key);
 for(const key of ['vehicle','person','parcel'])assert.ok(l.lod[key]<m.lod[key]&&m.lod[key]<h.lod[key],key);
 assert.equal(l.shadow,false);assert.equal(h.shadow,true);assert.equal(l.night.cones,false);assert.equal(h.night.seg,18);
 assert.equal(qualityConfig('unbekannt'),QUALITY.high);
});
test('Pixelratio-Grenzen: Gerät begrenzt nach oben, min ≤ max',()=>{
 assert.deepEqual(qualityRatio('high',2),{max:1.5,min:.75});
 assert.deepEqual(qualityRatio('medium',2),{max:1.25,min:.7});
 assert.deepEqual(qualityRatio('low',2),{max:1,min:.6});
 assert.deepEqual(qualityRatio('high',1),{max:1,min:.75});
 const r=qualityRatio('low',.5);assert.ok(r.min<=r.max);
});
test('LOD: Fahrzeuge → Box, Personen aus, Pakete reduziert erst jenseits des Stufenabstands',()=>{
 assert.deepEqual(lodFor('high',30),{vehicleBox:false,personHidden:false,parcelReduced:false});
 assert.deepEqual(lodFor('low',200),{vehicleBox:true,personHidden:true,parcelReduced:true});
 const d=QUALITY.medium.lod.person+1;assert.equal(lodFor('medium',d).personHidden,true);assert.equal(lodFor('high',d).personHidden,false);
});
test('Budget: Draw Calls ≤ 150 überall, Dreiecke 60k/120k/250k',()=>{
 assert.deepEqual(Object.values(QUALITY_BUDGET).map(b=>b.drawCalls),[150,150,150]);
 assert.deepEqual(QUALITY_LEVELS.map(k=>QUALITY_BUDGET[k].triangles),[60000,120000,250000]);
 assert.equal(checkBudget('low',{drawCalls:150,triangles:60000}).ok,true);
 const bad=checkBudget('low',{drawCalls:151,triangles:60001});assert.equal(bad.ok,false);assert.equal(bad.issues.length,2);
 assert.equal(checkBudget('high',{drawCalls:90,triangles:200000}).ok,true);
 assert.equal(checkBudget('medium',null).ok,false);
});
// Simulierte Frame-Folge: dt ms je Frame über dauer ms ab t0; sammelt Wechsel [{t,level}].
function feed(st,dt,dauer,t0,out=[]){let t=t0;for(;t<t0+dauer;t+=dt){const n=autoQuality(st,dt,t);if(n)out.push({t,level:n});}return {t,out};}
test('Automatik: runter bei p95 > 18 ms erst mit vollem 10-s-Fenster',()=>{
 const st=autoQualityState('high');
 let r=feed(st,25,AUTO_WINDOW_MS-600,0);assert.equal(r.out.length,0,'vor vollem Fenster keine Entscheidung');
 r=feed(st,25,1200,r.t);assert.equal(r.out.length,1);assert.equal(st.level,'medium');
 const t1=r.out[0].t;r=feed(st,25,9000,r.t);assert.equal(st.level,'medium','kein sofortiges Nachrutschen');
 r=feed(st,25,3000,r.t);assert.equal(st.level,'low');assert.ok(r.out[0].t-t1>=AUTO_WINDOW_MS);
 r=feed(st,40,30000,r.t);assert.equal(st.level,'low','unterste Stufe bleibt');
});
test('Automatik: hoch erst nach 30 s durchgehend p95 < 13 ms; Zwischenbereich hält die Stufe',()=>{
 const st=autoQualityState('low');
 let r=feed(st,8.3,AUTO_WINDOW_MS+AUTO_UP_HOLD_MS-1000,0);assert.equal(st.level,'low','vor 30 s schnell kein Wechsel');
 r=feed(st,8.3,2000,r.t);assert.equal(st.level,'medium');
 r=feed(st,15,120000,r.t);assert.equal(st.level,'medium');assert.equal(st.changes,1);
 // Unterbrechung der schnellen Phase setzt die 30 s zurück.
 r=feed(st,8.3,AUTO_WINDOW_MS+20000,r.t);r=feed(st,15,11000,r.t);r=feed(st,8.3,AUTO_WINDOW_MS+15000,r.t);assert.equal(st.level,'medium');
});
test('Automatik flattert nicht: Wechsellast führt zu höchstens einem Wechsel je 10 s und nie zurück nach oben',()=>{
 const st=autoQualityState('high'),changes=[];let t=0;
 // Abwechselnd 20 s schwer (22 ms), 20 s leicht (9 ms), 6 Minuten.
 for(let k=0;k<18;k++){const r=feed(st,k%2?9:22,20000,t,changes);t=r.t;}
 for(let i=1;i<changes.length;i++)assert.ok(changes[i].t-changes[i-1].t>=AUTO_WINDOW_MS,'Abstand ≥ 10 s');
 const ups=changes.filter((c,i)=>i&&QUALITY_LEVELS.indexOf(c.level)>QUALITY_LEVELS.indexOf(changes[i-1].level));
 assert.equal(ups.length,0,'20-s-Erholungen reichen nie für eine höhere Stufe (30 s nötig)');
 // Ausreißer (Tabwechsel > 250 ms) zählen nicht.
 const s2=autoQualityState('medium');feed(s2,16,12000,0);autoQuality(s2,4000,12100);feed(s2,16,2000,12200);assert.equal(s2.level,'medium');
});
test('Nachtlicht: Niedrig ohne Hallenlichtflächen, Masten bleiben',()=>{
 const site={width:20,height:16},L=yardLayout(site),full=nightLights(site,L,[],[]),low=nightLights(site,L,[],[],{hall:false});
 assert.equal(low.masts.length,full.masts.length);assert.ok(low.pools.length<full.pools.length);
});
test('Messanzeige zeigt Stufe; Szene/App verdrahtet (Einstellung, prefs.quality Standard auto)',()=>{
 assert.equal(qualityLabel({quality:'medium',qualityMode:'auto'}),'Mittel (automatisch)');assert.equal(qualityLabel({quality:'low',qualityMode:'low'}),'Niedrig');assert.equal(qualityLabel({}),null);
 const txt=formatReport({stats:frameStats([16,17],1000),longTasks:null,sim:{perFrame:0,steps:0,maxMs:0},render:{drawCalls:40,triangles:1000,pixelRatio:1,quality:'high',qualityMode:'auto'},seconds:1});
 assert.match(txt,/Grafikqualität Hoch \(automatisch\)/);
 const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),scene=fs.readFileSync(new URL('../dist/scene3d.js',import.meta.url),'utf8');
 assert.match(app,/quality:'auto'\}/);assert.match(app,/data-setting="quality"/);assert.match(app,/scene\.setQuality\?\.\(qualityPref\(\)\)/);
 assert.match(scene,/setQuality\(mode\)/);assert.match(scene,/quality\(\) \{/);
});
