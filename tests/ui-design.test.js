import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './ui-harness.js';
// Leitstand-Design 0.11 (A10): Tastenkürzel, Befehlspalette im Suchfeld „/“, Farbschema-Einstellung, Icon-Set, Tokens.
// Alle Kürzel und Befehle nutzen bestehende Pfade; reine Anzeige verändert den Spielstand nicht.
const key=(ui,k,extra={})=>ui.listeners.keydown({key:k,code:k===' '?'Space':'',target:{matches:()=>false},preventDefault(){},...extra});
const j=(ui,expr)=>JSON.parse(ui.run(`JSON.stringify(${expr})`));
const prefsOf=ui=>JSON.parse(ui.memory.get('industrie-logistik-v1-prefs')||'{}');
async function started(){const ui=await boot();await ui.click('start');ui.click('starter');return ui;}
function palette(ui,text){const cmd=ui.nodes.get('#cmd');cmd.value=text;cmd.oninput();return ui.nodes.get('#cmdResults');}
function enter(ui){ui.nodes.get('#cmd').onkeydown({key:'Enter',preventDefault(){}});}

test('Kürzel: Tempo 1–4, Leertaste setzt letztes Tempo fort, Fenster H/V, Bauen/Drehen/Esc, Nur Szene',async()=>{
 const ui=await started();
 key(ui,'3');assert.equal(ui.run('speed'),12);key(ui,'4');assert.equal(ui.run('speed'),0);key(ui,'2');assert.equal(ui.run('speed'),4);key(ui,'1');assert.equal(ui.run('speed'),1);
 key(ui,'3');key(ui,' ');assert.equal(ui.run('speed'),0,'Leertaste pausiert');key(ui,' ');assert.equal(ui.run('speed'),12,'Leertaste setzt mit letztem Tempo fort');
 key(ui,'h');assert.equal(ui.run('panel'),'yard');key(ui,'h');assert.equal(ui.run('panel'),'','H erneut schließt Hof & Docks');
 key(ui,'v');assert.equal(ui.run('panel'),'contracts');key(ui,'V');assert.equal(ui.run('panel'),'','Großbuchstabe wirkt gleich');
 key(ui,'r');assert.equal(ui.run('rotation'),0,'R ohne Baumodus ohne Wirkung');
 key(ui,'b');assert.equal(ui.nodes.get('#buildTray').hidden,false);key(ui,'r');assert.equal(ui.run('rotation'),90);
 key(ui,'Escape');assert.equal(ui.nodes.get('#buildTray').hidden,true,'Esc beendet den Baumodus');
 key(ui,'p');assert.equal(ui.run("document.body.classList.contains('scene-only')"),true);key(ui,'p');assert.equal(ui.run("document.body.classList.contains('scene-only')"),false);
 ui.run('guard.dispose()');
});

test('Kürzel: Kamera Q/E/+/−/Pos1, L nur mit setLabels, F/T nur mit follow()/tour() der Szene',async()=>{
 const ui=await started();
 ui.run("globalThis.calls=[];scene.rotate=d=>calls.push('rot'+d);scene.zoom=d=>calls.push('zoom'+d);scene.home=()=>calls.push('home')");
 for(const k of ['q','e','+','-','−','Home'])key(ui,k);
 assert.deepEqual(j(ui,'calls'),['rot-1','rot1','zoom1','zoom-1','zoom-1','home']);
 key(ui,'l');assert.equal(ui.run('labelMode'),'all','ohne setLabels keine Änderung');
 ui.run("globalThis.labels=[];scene.setLabels=m=>labels.push(m)");key(ui,'l');key(ui,'l');assert.deepEqual(j(ui,'labels'),['fleet','infra']);assert.equal(ui.run('labelMode'),'infra');
 ui.run('render(true)');assert.equal(ui.nodes.get('#followBtn').hidden,true,'Verfolgen ausgeblendet ohne scene.follow');assert.equal(ui.nodes.get('#tourBtn').hidden,true);
 key(ui,'f');key(ui,'t');assert.deepEqual(j(ui,'calls'),['rot-1','rot1','zoom1','zoom-1','zoom-1','home']);
 ui.run("globalThis.followed=[];globalThis.tours=0;scene.follow=id=>followed.push(id);scene.tour=()=>tours++");ui.run('render(true)');
 assert.equal(ui.nodes.get('#followBtn').hidden,false);assert.equal(ui.nodes.get('#tourBtn').hidden,false);
 key(ui,'f');assert.deepEqual(j(ui,'followed'),[],'ohne ausgewähltes Fahrzeug kein Verfolgen');
 const v=ui.run('sim.state.vehicles[0].id');ui.listeners.click({target:{closest:()=>({dataset:{vehicle:v},matches:()=>false})}});
 key(ui,'f');assert.deepEqual(j(ui,'followed'),[v]);key(ui,'t');assert.equal(ui.run('tours'),1);
 ui.run('guard.dispose()');
});

test('Kürzel: nicht in Eingabefeldern, nicht mit Strg/Alt/Meta, nicht bei offenem Dialog; „?“ zeigt Übersicht',async()=>{
 const ui=await started();
 ui.listeners.keydown({key:'3',target:{matches:()=>true},preventDefault(){}});assert.equal(ui.run('speed'),0,'Eingabefeld: kein Kürzel');
 key(ui,'3',{ctrlKey:true});assert.equal(ui.run('speed'),0,'Strg+3 bleibt dem Browser');
 key(ui,'?');const dlg=ui.nodes.get('#keys');assert.equal(dlg.open,true);
 const list=ui.nodes.get('#keysList').innerHTML;for(const t of ['Leertaste','Hof &amp; Docks','Nur Szene','Pos1','Abbrechen'])assert.ok(list.includes(t),t);
 assert.ok(!list.includes('Kamerarundgang')&&!list.includes('verfolgen'),'F/T nur, wenn die Szene sie anbietet');
 key(ui,'3');assert.equal(ui.run('speed'),0,'offener Dialog blockiert Kürzel');
 ui.click('keysClose');assert.equal(dlg.open,false);key(ui,'3');assert.equal(ui.run('speed'),12);
 ui.run('guard.dispose()');
});

test('Befehlspalette: echte Befehle über bestehende Pfade, Objekttreffer behalten Vorrang bei Namensgleichheit',async()=>{
 const ui=await started();
 let box=palette(ui,'>');assert.doesNotMatch(box.innerHTML,/data-hit=/,'„>“ zeigt nur Befehle');assert.match(box.innerHTML,/data-command="0"/);assert.match(box.innerHTML,/Befehl/);
 palette(ui,'tempo 12');assert.equal(ui.run('cmdHits[0].title'),'Tempo 12×');enter(ui);assert.equal(ui.run('speed'),12);assert.equal(ui.nodes.get('#cmd').value,'');assert.equal(ui.nodes.get('#cmdResults').hidden,true);
 palette(ui,'pause');assert.equal(ui.run('cmdHits[0].title'),'Pause');enter(ui);assert.equal(ui.run('speed'),0);
 palette(ui,'hof');enter(ui);assert.equal(ui.run('panel'),'yard');
 box=palette(ui,'laderampe');const dock=ui.run("sim.state.buildings.find(b=>b.type==='dock').id");
 assert.equal(ui.run('cmdHits[0].id'),dock,'Anlage „Laderampe“ vor dem Baubefehl');assert.match(box.innerHTML,/Bauen: Laderampe/);
 palette(ui,'bauen: laderampe');enter(ui);assert.equal(ui.run('build'),'dock');ui.click('endBuild');
 palette(ui,'zum dock 1');enter(ui);assert.equal(ui.run('selected'),dock);assert.equal(ui.run('panel'),'detail');
 palette(ui,'nur szene');ui.listeners.click({target:{closest:()=>({dataset:{command:'0'},matches:()=>false})}});assert.equal(ui.run("document.body.classList.contains('scene-only')"),true);
 const offer=ui.run("(sim.state.contracts||[]).find(c=>c.status==='offer')?.id");
 if(offer){palette(ui,'vertrag annehmen');assert.match(ui.run('cmdHits[0].title'),/^Vertrag annehmen · /);enter(ui);assert.equal(ui.run(`sim.state.contracts.find(c=>c.id==='${offer}').status`),'active','Annahme über den Fachbefehl acceptContract');}
 const before=ui.run('sim.serialize()');palette(ui,'keintreffer-xyz');assert.match(ui.nodes.get('#cmdResults').innerHTML,/Kein Treffer/);
 palette(ui,'ansicht: grundriss');enter(ui);assert.equal(ui.run('sim.serialize()'),before,'Anzeige-Befehle verändern den Spielstand nicht');
 ui.run('guard.dispose()');
});

test('Farbschema: Einstellung auto|day|night, gespeichert in prefs, Szene erhält setTheme, Palette und Einstellungen',async()=>{
 const ui=await started();
 assert.equal(ui.run('prefs.theme'),'auto');assert.equal(ui.run('resolvedTheme()'),'day','auto ohne dunkles System = Tag');
 ui.run("globalThis.themes=[];scene.setTheme=t=>themes.push(t)");
 ui.run("openPanel('settings')");const html=ui.nodes.get('#panelBody').innerHTML;assert.match(html,/data-setting="theme"/);assert.match(html,/<option value="auto" selected>Automatisch/);
 ui.listeners.change({target:{dataset:{setting:'theme'},value:'night'}});
 assert.equal(ui.run('prefs.theme'),'night');assert.equal(prefsOf(ui).theme,'night');assert.deepEqual(j(ui,'themes'),['night']);
 assert.match(ui.nodes.get('#panelBody').innerHTML,/<option value="night" selected>Nacht/);
 palette(ui,'farbschema: tag');enter(ui);assert.equal(ui.run('prefs.theme'),'day');assert.deepEqual(j(ui,'themes'),['night','day']);
 ui.listeners.change({target:{dataset:{setting:'theme'},value:'kaputt'}});assert.equal(ui.run('prefs.theme'),'auto','unbekannter Wert fällt auf auto');
 ui.listeners.change({target:{dataset:{setting:'theme'},value:'night'}});
 const memory=ui.memory;ui.run('guard.dispose()');
 const again=await boot({memory});assert.equal(again.run('prefs.theme'),'night');assert.equal(again.run('resolvedTheme()'),'night','Einstellung überdauert Neuladen');
 again.run('guard.dispose()');
});

test('Icon-Set und Tokens: keine Unicode-Symbole in Rail/Werkzeugen, alle Icons definiert, kein backdrop-filter, Tag/Nacht-Tokens',async()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
 const ui=await boot();const defined=new Set(ui.run('Object.keys(ICONS)'));
 const used=[...html.matchAll(/data-i="([^"]+)"/g)].map(m=>m[1]);assert.ok(used.length>=40);for(const n of used)assert.ok(defined.has(n),'Icon fehlt: '+n);
 const rail=html.slice(html.indexOf('<nav class="rail"'),html.indexOf('</nav>'));assert.doesNotMatch(rail,/<i>/);assert.doesNotMatch(rail,/[◈⊞⚒▤♙≡§⇆▱€⌘⇄⌁❄↶◷]/u);
 const tools=html.slice(html.indexOf('class="camera-controls'),html.indexOf('<aside id="panel"'));assert.doesNotMatch(tools,/[↻⌖▢∅]/u);
 assert.match(html,/id="followBtn"[^>]*hidden/);assert.match(html,/id="tourBtn"[^>]*hidden/);assert.match(html,/<dialog id="keys"/);
 assert.doesNotMatch(css,/backdrop-filter\s*:/,'Leistungsregel QS-W0-02');
 assert.match(css,/:root\[data-theme=night\]\{/);assert.match(css,/prefers-color-scheme:dark\)\{:root:not\(\[data-theme\]\)/);
 for(const t of ['--c-surface','--c-ink','--c-accent','--r-lg','--sh-1','--s-3','--d-base'])assert.match(css,new RegExp(t+':'),t);
 ui.run('guard.dispose()');
});
