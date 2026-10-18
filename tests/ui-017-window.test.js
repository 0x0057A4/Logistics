import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clampGeom,defaultGeom,maxGeom,resizeGeom,readGeom,WIN_MIN} from '../dist/ui-window.js';
// A10-W 0.17: reine Fenstergeometrie (Klemmen, Startgröße, Maximieren, Ränder) und Grundregeln für Schrift/Leiste/Tastatur.

test('Fenster: Klemmen in den sichtbaren Bereich, Mindestgröße, beschädigte Werte',()=>{
 const area={w:1366,h:682};
 assert.deepEqual(clampGeom({x:1300,y:600,w:500,h:400},area),{x:866,y:282,w:500,h:400},'rechts unten hinein geschoben');
 assert.deepEqual(clampGeom({x:-50,y:-20,w:100,h:50},area),{x:0,y:0,w:WIN_MIN.w,h:WIN_MIN.h},'Mindestgröße und linker/oberer Rand');
 assert.deepEqual(clampGeom({x:0,y:0,w:5000,h:5000},area),{x:0,y:0,w:1366,h:682},'höchstens Bereichsgröße');
 const tiny=clampGeom({x:10,y:10,w:600,h:600},{w:300,h:200});assert.deepEqual(tiny,{x:0,y:0,w:300,h:200},'Bereich kleiner als Mindestgröße');
 assert.equal(readGeom({x:'a',y:1,w:2,h:3}),null);assert.equal(readGeom(null),null);assert.equal(readGeom({x:1,y:1,w:0,h:3}),null);
 assert.deepEqual(readGeom({x:1,y:2,w:400,h:300,max:true}),{x:1,y:2,w:400,h:300,max:true});
});

test('Fenster: Startgröße wie bisher (rechts, volle Höhe; breite Fensterarten breiter), Maximieren neben der Leiste',()=>{
 const a={w:1366,h:682};
 assert.deepEqual(defaultGeom(a),{x:1366-60-460,y:12,w:460,h:682-12-8});
 const wide=defaultGeom(a,{wide:true});assert.equal(wide.w,686);assert.equal(wide.x+wide.w,1366-60);
 assert.equal(defaultGeom({w:1920,h:1000},{wide:true}).w,860);
 assert.deepEqual(maxGeom(a,{left:86}),{x:86,y:8,w:1366-86-8,h:682-16});
});

test('Fenster: Größe an Rändern/Ecken hält gegenüberliegende Kante, Mindestgröße, Bereichsgrenzen',()=>{
 const a={w:1366,h:682},g={x:600,y:12,w:600,h:600};
 assert.deepEqual(resizeGeom(g,'w',-100,0,a),{x:500,y:12,w:700,h:600});
 assert.deepEqual(resizeGeom(g,'se',-50,-80,a),{x:600,y:12,w:550,h:520});
 assert.deepEqual(resizeGeom(g,'nw',500,500,a),{x:1200-WIN_MIN.w,y:612-WIN_MIN.h,w:WIN_MIN.w,h:WIN_MIN.h},'Mindestgröße, rechte/untere Kante fest');
 assert.deepEqual(resizeGeom(g,'e',900,0,a),{x:600,y:12,w:766,h:600},'nicht über den Rand');
 assert.deepEqual(resizeGeom(g,'n',0,-100,a),{x:600,y:0,w:600,h:612});
});

test('HUD 0.17: keine Inhaltsschrift unter 12 px, Leiste ohne Scrollbereich mit Gruppe „Mehr“, Panel-Kopf mit Maximieren',()=>{
 const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 // Geprüft wird der gemeinsame Grundstil; Blöcke anderer 0.17-Agenten am Dateiende verantworten diese selbst.
 const core=css.split(/\/\* ==== 0\.17 A0[4-8]/)[0];
 const small=[...core.matchAll(/([^{}]+)\{[^}]*font-size:(\d+)px/g)].filter(m=>+m[2]<12).map(m=>m[1].trim());
 assert.deepEqual(small.filter(s=>!['.brand-sub','.bell-count','.checklist li>span'].includes(s)),[],'nur Logo-Untertitel, Zählerplakette und Häkchenkreis dürfen kleiner sein');
 assert.match(css,/--font:15px/);assert.doesNotMatch(css,/url\s*\(/,'portable CSS ohne externe Verweise');
 const rail=html.slice(html.indexOf('<nav class="rail"'),html.indexOf('</nav>'));
 assert.match(rail,/class="rail-more"[^>]*aria-expanded="false"/);assert.match(rail,/id="railMore"[^>]*hidden/);
 for(const p of ['overview','inventory','staff','orders','contracts','yard','fleet','finance','service'])assert.ok(!new RegExp(`id="railMore"[\\s\\S]*data-panel="${p}"`).test(rail),p+' bleibt direkt sichtbar');
 for(const b of rail.matchAll(/<button[^>]*data-(?:panel|action)="[^"]+"[^>]*>/g))assert.match(b[0],/title="[^"]{8,}"/,'Tooltip: '+b[0].slice(0,60));
 assert.match(html,/id="panelMax"/);
 const railRule=css.match(/\n\.rail\{[^}]*\}/)[0];assert.match(railRule,/overflow:visible/);
});

test('Tastatur 0.17: WASD/Pfeile im Kürzelverzeichnis, Bewegung nur über onKey (nicht in Eingabefeldern), Stopp bei blur/visibilitychange',()=>{
 const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.match(app,/\['W · A · S · D · ← ↑ ↓ →','Kamera verschieben \(auch im Baumodus\)'\]/);
 assert.match(app,/if\(rp&&replayKey\(e,k,lk\)\)return;\n if\(panKeyDown\(e,lk\)\)return;/);
 assert.match(app,/window\.addEventListener\('blur',panStop\)/);assert.match(app,/if\(document\.hidden\)panStop\(\)/);
 assert.match(app,/document\.addEventListener\('contextmenu',e=>\{if\(!nativeMenu\(e\.target\)\)e\.preventDefault\(\);\},true\)/);
});
