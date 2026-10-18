import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clampGeom,defaultGeom,maxGeom,resizeGeom,readGeom,toRel,fromRel,avoidRects,WIN_MIN,REF} from '../dist/ui-window.js';
// A10-W 0.17: reine Fenstergeometrie (Klemmen, Startgröße, Maximieren, Ränder) und Grundregeln für Schrift/Leiste/Tastatur.
// Nutzervorgabe 18.10.2026: Referenz 1920 × 1080, Fenster skalieren mit (relative Geometrie {rx,ry,rw,rh,max} in prefs.windows).

test('Fenster: Klemmen in den sichtbaren Bereich, Mindestgröße, beschädigte Werte',()=>{
 const area={w:1366,h:682};
 assert.deepEqual(clampGeom({x:1300,y:600,w:500,h:400},area),{x:866,y:282,w:500,h:400},'rechts unten hinein geschoben');
 assert.deepEqual(clampGeom({x:-50,y:-20,w:100,h:50},area),{x:0,y:0,w:WIN_MIN.w,h:WIN_MIN.h},'Mindestgröße und linker/oberer Rand');
 assert.deepEqual(clampGeom({x:0,y:0,w:5000,h:5000},area),{x:0,y:0,w:1366,h:682},'höchstens Bereichsgröße');
 const tiny=clampGeom({x:10,y:10,w:600,h:600},{w:300,h:200});assert.deepEqual(tiny,{x:0,y:0,w:300,h:200},'Bereich kleiner als Mindestgröße');
 assert.equal(readGeom({x:'a',y:1,w:2,h:3},area),null);assert.equal(readGeom(null),null);assert.equal(readGeom({x:1,y:1,w:0,h:3},area),null);
 assert.equal(readGeom({rx:.1,ry:.1,rw:0,rh:.5}),null);assert.equal(readGeom({rx:.1,ry:'x',rw:.3,rh:.5}),null);assert.equal(readGeom({rx:.1,ry:.1,rw:3,rh:.5}),null,'Anteil > 1');
 assert.deepEqual(readGeom({rx:.5,ry:.01,rw:.25,rh:.9,max:true}),{rx:.5,ry:.01,rw:.25,rh:.9,max:true,migrated:false});
});

test('Fenster: alte absolute Geometrie wird beim Lesen einmalig in Anteile umgerechnet (nur Einstellungen)',()=>{
 const area={w:1366,h:682},g=readGeom({x:683,y:12,w:460,h:500,max:true},area);
 assert.equal(g.migrated,true);assert.equal(g.max,true);assert.deepEqual([g.rx,g.ry],[0.5,+(12/682).toFixed(6)]);
 assert.deepEqual(fromRel(g,area),{x:683,y:12,w:460,h:500},'Umrechnung verlustfrei für dieselbe Fläche');
 assert.equal(readGeom({x:683,y:12,w:460,h:500}),null,'ohne Fläche nicht umrechenbar (dann Startlage)');
 // Außerhalb liegende Altwerte werden vor der Umrechnung in den sichtbaren Bereich geklemmt
 const out=readGeom({x:3000,y:2000,w:600,h:400},area);assert.deepEqual(fromRel(out,area),{x:766,y:282,w:600,h:400});
});

test('Fenster: proportionale Skalierung 1920×1080 → 1366×768 → 2560×1440 und zurück, Mindestgröße, Klemmen',()=>{
 const A1920={w:1920,h:994},A1366={w:1366,h:682},A2560={w:2560,h:1354};
 const g={x:900,y:100,w:800,h:600},rel=toRel(g,A1920);
 assert.deepEqual(fromRel(rel,A1920),g,'gleiche Fläche → gleiche Pixel');
 const s=fromRel(rel,A1366);assert.ok(Math.abs(s.w-800*1366/1920)<=1&&Math.abs(s.h-600*682/994)<=1&&Math.abs(s.x-900*1366/1920)<=1,JSON.stringify(s));
 const b=fromRel(rel,A2560);assert.ok(Math.abs(b.w-800*2560/1920)<=1&&Math.abs(b.y-100*1354/994)<=1,JSON.stringify(b));
 assert.deepEqual(fromRel(rel,A1920),g,'wieder 1920: gleiche Größe (Anteile unverändert)');
 // Mindestgröße: rechts liegendes Fenster wächst nach links, rechte Kante bleibt
 const small=toRel({x:1460,y:12,w:400,h:300},A1920),m=fromRel(small,A1366);
 assert.equal(m.w,WIN_MIN.w);assert.equal(m.x+m.w,Math.round((1460+400)/1920*1366));assert.ok(m.h>=WIN_MIN.h);
 // Linkes Fenster wächst nach rechts
 const l=fromRel(toRel({x:100,y:12,w:400,h:300},A1920),A1366);assert.equal(l.x,Math.round(100/1920*1366));assert.equal(l.w,WIN_MIN.w);
 // Fläche kleiner als das Fenster: vollständig sichtbar
 const tiny=fromRel(rel,{w:500,h:300});assert.ok(tiny.x>=0&&tiny.y>=0&&tiny.x+tiny.w<=500&&tiny.y+tiny.h<=300,JSON.stringify(tiny));
 assert.deepEqual(REF,{w:1920,h:994});
});

test('Fenster: Startlage auf 1920×1080 (Anteile), rechts neben den Werkzeugen; Tabellen unter den Kennzahlen; HUD wird gemieden',()=>{
 const a={w:1920,h:994};
 assert.deepEqual(defaultGeom(a),{x:1920-60-460,y:12,w:460,h:994-12-8});
 const wide=defaultGeom(a,{wide:true});assert.equal(wide.w,860);assert.equal(wide.x+wide.w,1920-60);
 const tab=defaultGeom(a,{table:true});assert.equal(tab.w,1400);assert.equal(tab.y,100,'Tabellen beginnen unterhalb der Kennzahlen');assert.equal(tab.x+tab.w,1860);
 // Kleinere Flächen: Anteile, Mindestgröße
 const s=defaultGeom({w:1366,h:682});assert.equal(s.w,WIN_MIN.w);assert.equal(s.x+s.w,1366-60);
 assert.equal(defaultGeom({w:1366,h:682},{wide:true}).w,Math.round(1366*860/1920));assert.equal(defaultGeom({w:2560,h:1354},{table:true}).w,Math.round(2560*1400/1920));
 // HUD-Flächen (Spielflächenkoordinaten wie bei 1920×1080): Kennzahlen 90..818×12..92, Umschalter 90..388×100..140, Fluss 90..342×146..486
 const kpis={x:90,y:12,w:728,h:80},vs={x:90,y:100,w:298,h:40},flow={x:90,y:146,w:252,h:340},hit=(p,q)=>p.x<q.x+q.w&&q.x<p.x+p.w&&p.y<q.y+q.h&&q.y<p.y+p.h;
 for(const [ar,o] of [[{w:1920,h:994},{table:true}],[{w:1366,h:682},{table:true}],[{w:1280,h:714},{wide:true}],[{w:1366,h:682},{wide:true}],[{w:1280,h:714},{}]]){
  const g=defaultGeom(ar,o,[kpis,vs,flow]);for(const r of [kpis,vs,flow])assert.ok(!hit(g,r),JSON.stringify({ar,o,g,r}));
  assert.ok(g.w>=WIN_MIN.w&&g.h>=WIN_MIN.h&&g.x+g.w<=ar.w&&g.y+g.h<=ar.h);
 }
 // Ausweichen wählt die Richtung mit mehr Fensterfläche: flache Kennzahlen → nach unten, hoher Fluss → nach rechts
 assert.equal(avoidRects({x:300,y:12,w:900,h:600},[kpis]).y,100);assert.equal(avoidRects({x:200,y:300,w:900,h:400},[flow]).x,350);
 assert.deepEqual(maxGeom({w:1366,h:682},{left:86}),{x:86,y:8,w:1366-86-8,h:682-16});
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
 const core=css.split(/\/\* [-=]{4} 0\.17 \(?A0[4-8]/)[0];
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
