import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultGeom,avoidRects,aboveRect,WIN_MIN} from '../dist/ui-window.js';
import {sharedCover} from '../dist/ui-orders.js';
// A10 0.17 QS-Nacharbeit (QS-017-02 … 08): Startbreite nach Inhalt, Baumenü/Fenster ohne Überdeckung, geteilte Deckung,
// Kopfzeile/Schriftgrößen/Kontrast als CSS-Regeln. Browserprüfung: tests/browser/qa-017.mjs (Befunde 02–08 OK).

const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');

test('QS-017-07: Startbreite mindestens Inhaltsbreite der Fensterart, höchstens Spielfläche',()=>{
 const a1366={w:1366,h:682},a1920={w:1920,h:994};
 assert.equal(defaultGeom(a1366,{wide:true}).w,612,'ohne minW unverändert relativ (860/1920)');
 assert.equal(defaultGeom(a1366,{wide:true,minW:860}).w,860,'Hof bei 1366: Inhaltsbreite');
 assert.equal(defaultGeom(a1920,{wide:true,minW:860}).w,860,'1920: Anteil und minW gleich');
 assert.equal(defaultGeom(a1920,{minW:700}).w,700,'Verträge bei 1920 breiter als 460');
 const g=defaultGeom({w:800,h:600},{minW:2000});
 assert.ok(g.w<=800-2*60-30+1&&g.x>=0,'begrenzt auf die Spielfläche: '+JSON.stringify(g));
});

test('QS-017-07: Ausweichen nach rechts nur, wenn die Inhaltsbreite erhalten bleibt (sonst unter der HUD-Fläche)',()=>{
 const area={w:1366,h:682},kpis={x:300,y:12,w:340,h:80};
 const g=defaultGeom(area,{wide:true,minW:760},[kpis]);
 assert.equal(g.w,760,'Breite bleibt');
 assert.ok(g.y>=kpis.y+kpis.h,'beginnt unterhalb der Kennzahlen: '+JSON.stringify(g));
});

test('QS-017-06: Fenster endet oberhalb des Baumenüs; zu wenig Platz → rückt nach oben, Mindesthöhe bleibt',()=>{
 const tray={x:90,y:440,w:1200,h:230};
 assert.deepEqual(aboveRect({x:500,y:12,w:600,h:660},tray),{x:500,y:12,w:600,h:420});
 const low=aboveRect({x:500,y:300,w:600,h:380},tray);
 assert.deepEqual(low,{x:500,y:52,w:600,h:380},'rückt nach oben, keine Überdeckung');assert.ok(low.h>=WIN_MIN.h);
 assert.deepEqual(aboveRect({x:0,y:0,w:100,h:100},tray),{x:0,y:0,w:100,h:100},'ohne Überdeckung unverändert');
 // Startlage: untere HUD-Fläche → Fenster wird gekürzt statt verschoben
 const r=avoidRects({x:500,y:12,w:600,h:660},[tray]);assert.equal(r.y,12);assert.ok(r.y+r.h<=tray.y-8);
 assert.match(app,/document\.body\.classList\.add\('build-open'\);[^\n]*windowCtl\(\)\?\.refit\(\)/,'Baumodus-Start passt das Fenster an');
});

test('QS-017-03: geteilte Deckung nur, wenn der freie Bestand nicht für alle konkurrierenden Aufträge reicht',()=>{
 const base={missing:0,open:8,underway:0,reservedForThis:0,freeOther:22,competing:1,poolDemand:35};
 assert.equal(sharedCover(base),true,'8 + 35 > 22');
 assert.equal(sharedCover({...base,poolDemand:10}),false,'8 + 10 ≤ 22: reicht für alle');
 assert.equal(sharedCover({...base,competing:0,poolDemand:0}),false,'kein Wettbewerb');
 assert.equal(sharedCover({...base,reservedForThis:8}),false,'vollständig reserviert');
 assert.equal(sharedCover({...base,missing:3}),false,'Fehlmenge wird separat angezeigt');
});

test('QS-017-02/04/05/08: CSS-Regeln (Schrift ≥ 12 px, Kontrast, einzeilige Chargen, Kopfzeile kürzt)',()=>{
 assert.match(css,/\.brand-sub\{font-size:12px/);
 assert.match(css,/\.bell-count\{font-size:12px\}/);
 assert.match(css,/\.panel-body small,\.data-table small,\.vrow small\{font-size:max\(12px,\.86em\)\}/);
 assert.match(css,/\.bell-count\.wait\{color:#000\}/);
 assert.match(css,/\.sv-batches td\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
 assert.match(css,/\.site-label\{max-width:100%\}/);
 assert.match(css,/@media\(max-width:1600px\)\{\.site-weather #siteWeatherText\{display:none\}/);
});

test('Umbenennen (A01-Hinweis zu QS-017-01): abgelehnter Standortname bleibt in der Eingabe, Hinweis im Standortmenü',async()=>{
 const {boot}=await import('./ui-harness.js');
 const ui=await boot();await ui.click('start');
 const list=()=>ui.nodes.get('#siteList').innerHTML;
 const name0=ui.run('sim.state.sites[0].name');
 ui.run(`renderSiteMenu();renameStart('site:site-1')`);
 const r=ui.run(`renameCommit({dataset:{rename:'site:site-1'},value:'A'})`);
 assert.equal(r.ok,false,'core lehnt 1 Zeichen ab');
 assert.equal(ui.run('sim.state.sites[0].name'),name0,'Name unverändert');
 assert.match(list(),/class="rename-input" data-rename="site:site-1" value="A"/,'Eingabe bleibt mit dem Wert offen');
 assert.match(list(),/<p class="rename-hint" role="alert">[^<]+<\/p>/,'Hinweis sichtbar');
 ui.run(`renameKeys({key:'Escape',target:{dataset:{rename:'site:site-1'},value:'A'},preventDefault(){},stopPropagation(){}})`);
 assert.doesNotMatch(list(),/rename-hint|rename-input/,'Escape verwirft Eingabe und Hinweis');
 ui.run(`renameStart('site:site-1')`);assert.doesNotMatch(list(),/rename-hint/,'neuer Versuch ohne alten Hinweis');
 assert.equal(ui.run(`renameCommit({dataset:{rename:'site:site-1'},value:'Hub Nord'})`).ok,true);
 assert.equal(ui.run('sim.state.sites[0].name'),'Hub Nord');assert.doesNotMatch(list(),/rename-hint|rename-input/);
});
