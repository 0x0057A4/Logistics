// 0.17 (A04/A10-E): Anlagenerklärung (ui-explain.js) und Umbenennen in der Oberfläche. Echte Fachmodule, nur reguläre Befehle;
// Eingriffe in die Ausgangslage sind je Test benannt (Netzanschluss 0 kW, Ware per inventory-API eingebucht).
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {BUILDINGS} from '../dist/catalog.js';
import {EXPLAIN,buildInfo,explainBuilding,explainHtml,currentState,displayName,defaultName,walkMinutes} from '../dist/ui-explain.js';
import {boot} from './ui-harness.js';

const SITE='site-1';
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const build=(sim,type,x,y)=>ok(sim,{type:'build',buildingType:type,x,y,rotation:0}).id;
const bld=(sim,id)=>sim.state.buildings.find(b=>b.id===id);
const nextText=st=>st.next.map(n=>n.text).join(' | ');
const add=(sim,item,qty,location='stock')=>assert.ok(sim.api.inventory.add({item,qty,site:SITE,owner:'company',location,quality:90,unitCost:10,parents:[]}));

test('Erklärung je Gebäudetyp: Zweck, Voraussetzungen, Ablauf, Platzierung, Baumenü-Text', () => {
  for (const type of Object.keys(BUILDINGS)) {
    const x = EXPLAIN[type];
    assert.ok(x, 'Erklärung fehlt: ' + type);
    for (const k of ['short', 'purpose']) assert.ok(typeof x[k] === 'string' && x[k].length > 5, `${type}.${k}`);
    for (const k of ['needs', 'flow', 'place']) assert.ok(Array.isArray(x[k]) && x[k].length, `${type}.${k}`);
    assert.ok(x.place.some(t => /Tor/.test(t)), type + ': Torregel');
    const i = buildInfo(type);
    assert.equal(i.name, BUILDINGS[type].name); assert.match(i.title, /Platzierung:/);
  }
  // Keine erfundene Nachbarschaftsmechanik: Sortierplatz/Regal erklären ausdrücklich, dass Nähe nichts bewirkt.
  assert.ok(EXPLAIN.sorter.place.some(t => /keine Wirkung/.test(t)));
  assert.ok(EXPLAIN.rack.place.some(t => /spielt keine Rolle/.test(t)));
  assert.ok(EXPLAIN.testing.place.some(t => /Nähe zum Tor/.test(t)));
});

test('Sortierplatz: Zustand und nächster Schritt aus echtem Zustand (keine Ware, kein Personal, arbeitet)', () => {
  const sim = new Simulation({mode:'sandbox', seed:5});
  const sorter = build(sim, 'sorter', 8, 2);
  // Ohne Laderampe: nicht angeschlossen, kein Betrieb vorgetäuscht.
  sim.step(1); let st = currentState(sim.state, bld(sim, sorter));
  assert.match(st.title, /keine Laderampe/); assert.notEqual(st.tone, 'good');
  build(sim, 'dock', 2, 10); sim.step(1);
  st = currentState(sim.state, bld(sim, sorter));
  assert.equal(st.title, 'Wartet auf Pakete im Wareneingang');
  assert.match(nextText(st), /Keine Lagerkraft am Standort – Lagerkraft einstellen/);
  add(sim, 'parcel', 40, 'inbound'); sim.step(1);
  assert.equal(bld(sim, sorter).status, 'staff');
  st = currentState(sim.state, bld(sim, sorter));
  assert.equal(st.title, 'Wartet auf Lagerkraft'); assert.match(nextText(st), /Lagerkraft einstellen/);
  assert.ok(explainBuilding(sim.state, bld(sim, sorter)).checks.some(c => c.ok === false && /Lagerkraft/.test(c.text)));
  const w = ok(sim, {type:'hire', role:'warehouse'}).id; ok(sim, {type:'setShift', id:w, shift:'all'});
  sim.step(2);
  assert.equal(bld(sim, sorter).status, 'working');
  st = currentState(sim.state, bld(sim, sorter));
  assert.equal(st.tone, 'good'); assert.match(st.title, /5 Pakete\/min/);
  const html = explainHtml(sim.state, bld(sim, sorter));
  for (const h of ['1</span> Zweck', '2</span> Voraussetzungen', '3</span> Ablauf', '4</span> Aktueller Zustand', '5</span> Nächster Schritt']) assert.ok(html.includes(h), h);
});

test('Prüfstation: kein Personal, keine Ware, kein Strom, arbeitet', () => {
  const sim = new Simulation({mode:'sandbox', seed:6}), s = sim.state;
  const id = build(sim, 'testing', 5, 2);
  sim.step(1); let st = currentState(s, bld(sim, id));
  assert.equal(st.title, 'Wartet auf Material');
  assert.match(nextText(st), /Montierte Arbeitsleuchte – entsteht an Montageplatz/);
  add(sim, 'lamp_raw', 3); sim.step(1);
  assert.equal(bld(sim, id).status, 'staff');
  st = currentState(s, bld(sim, id));
  assert.equal(st.title, 'Wartet auf Fertigungskraft'); assert.match(nextText(st), /Keine Fertigungskraft am Standort – Fertigungskraft einstellen/);
  const w = ok(sim, {type:'hire', role:'production'}).id; ok(sim, {type:'setShift', id:w, shift:'all'});
  sim.step(1); assert.ok(['walking', 'setup', 'working'].includes(bld(sim, id).status), bld(sim, id).status);
  assert.equal(currentState(s, bld(sim, id)).tone, 'good');
  assert.ok(currentState(s, bld(sim, id)).lines.some(l => l.includes(`${walkMinutes(bld(sim, id))} Min.`)));
  for (let i = 0; i < 30 && bld(sim, id).status !== 'working'; i++) sim.step(1);
  assert.match(currentState(s, bld(sim, id)).title, /^Fertigt Elektrische Prüfung/);
  // Eingriff: Netzanschluss auf 0 kW → Station steht mit „Energie fehlt“.
  s.sites[0].energy = 0; sim.step(1);
  assert.equal(bld(sim, id).status, 'power');
  st = currentState(s, bld(sim, id));
  assert.equal(st.title, 'Energie fehlt'); assert.match(nextText(st), /Energieversorgung bauen/);
  ok(sim, {type:'toggleBuilding', id});
  assert.match(currentState(s, bld(sim, id)).title, /Pausiert/);
});

test('displayName mit und ohne eigenen Namen; Umbenennen über Befehl; Speichern/Laden', () => {
  const sim = new Simulation({mode:'sandbox', seed:7});
  const a = build(sim, 'testing', 5, 2), b = build(sim, 'testing', 9, 2), d = build(sim, 'dock', 2, 10);
  assert.equal(displayName(sim.state, bld(sim, a)), 'Prüfstation 1');
  assert.equal(displayName(sim.state, b), 'Prüfstation 2');
  assert.equal(displayName(sim.state, bld(sim, d)), 'Dock 1');
  ok(sim, {type:'rename', target:'building', id:b, name:'Prüfung – Arbeitsleuchten'});
  assert.equal(displayName(sim.state, bld(sim, b)), 'Prüfung – Arbeitsleuchten');
  assert.equal(defaultName(sim.state, bld(sim, b)), 'Prüfstation 2');
  assert.equal(explainBuilding(sim.state, bld(sim, b)).typeName, 'Prüfstation');
  const loaded = Simulation.fromJSON(sim.serialize());
  assert.equal(displayName(loaded.state, b), 'Prüfung – Arbeitsleuchten');
  ok(sim, {type:'rename', target:'building', id:b, name:''});
  assert.equal(displayName(sim.state, b), 'Prüfstation 2');
  // Altstand ohne Namen bleibt ladbar und zeigt Standardnamen.
  const old = JSON.parse(sim.serialize()); for (const x of old.buildings) delete x.label;
  assert.equal(displayName(Simulation.fromJSON(JSON.stringify(old)).state, a), 'Prüfstation 1');
});

test('Oberfläche: Akte mit fünf Abschnitten, Stift/Enter/Escape, Name in Akte, Liste, Torbuch, Anlagenspiegel; keine Buchung', async () => {
  const sim = new Simulation({mode:'sandbox', seed:8});
  const sorter = build(sim, 'sorter', 8, 2), dock = build(sim, 'dock', 2, 10);
  const ui = await boot(); await ui.click('start');
  assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`), true);
  ui.run('render(true)');
  const body = () => ui.nodes.get('#panelBody').innerHTML;
  const money0 = ui.run('sim.state.money'), ledger0 = ui.run('sim.state.ledger.length');
  ui.run(`selected=${JSON.stringify(sorter)};openPanel('detail')`);
  for (const h of ['Zweck', 'Voraussetzungen', 'Ablauf', 'Aktueller Zustand', 'Nächster Schritt', 'Kennzahlen', 'Typ: Sortierplatz', 'data-rename-start']) assert.ok(body().includes(h), h);
  assert.match(body(), /<h3>Sortierplatz 1<\/h3>/);
  // Stift öffnet Eingabe, Escape verwirft (Fenster bleibt offen).
  ui.run(`renameStart('building:${sorter}')`);
  assert.match(body(), /class="rename-input" data-rename="building:/);
  ui.run(`renameKeys({key:'Escape',target:{dataset:{rename:'building:${sorter}'},value:'Verworfen'},preventDefault(){},stopPropagation(){}})`);
  assert.equal(ui.run('panel'), 'detail'); assert.doesNotMatch(body(), /rename-input/);
  assert.equal(ui.run(`sim.state.buildings.find(b=>b.id==='${sorter}').label`), undefined);
  // Enter bestätigt.
  ui.run(`renameStart('building:${sorter}')`);
  ui.run(`renameKeys({key:'Enter',target:{dataset:{rename:'building:${sorter}'},value:'  Sorter Nord '},preventDefault(){},stopPropagation(){}})`);
  assert.equal(ui.run(`sim.state.buildings.find(b=>b.id==='${sorter}').label`), 'Sorter Nord');
  assert.match(body(), /<h3>Sorter Nord<\/h3>/); assert.ok(body().includes('Typ: Sortierplatz'));
  ui.run(`openPanel('production')`); assert.ok(body().includes('Sorter Nord'));
  ui.run(`openPanel('overview')`);
  // Dock umbenennen erscheint im Torbuch (Dock-Belegung).
  ui.run(`renameStart('building:${dock}')`);
  ui.run(`renameCommit({dataset:{rename:'building:${dock}'},value:'Rampe Ost'})`);
  ui.run(`openPanel('yard')`); assert.ok(body().includes('Rampe Ost'));
  ui.run(`financeTab='guv';openPanel('finance')`); assert.ok(body().includes('Sorter Nord (Sortierplatz)'), 'Anlagenspiegel');
  // Standort umbenennen im Standortmenü, leer = Startname.
  ui.run(`renderSiteMenu();renameStart('site:${SITE}')`);
  assert.match(ui.nodes.get('#siteList').innerHTML, /data-rename="site:site-1"/);
  ui.run(`renameCommit({dataset:{rename:'site:${SITE}'},value:'Hub Nord'})`);
  assert.equal(ui.run('sim.state.sites[0].name'), 'Hub Nord');
  assert.ok(ui.nodes.get('#siteList').innerHTML.includes('Hub Nord'));
  ui.run(`renameCommit({dataset:{rename:'site:${SITE}'},value:''})`);
  assert.equal(ui.run('sim.state.sites[0].name'), 'Depot Morgenfeld');
  // Baumenü: Infokarte und Kurzbeschreibung.
  ui.run(`startBuild('sorter')`);
  const items = ui.nodes.get('#buildItems').innerHTML;
  assert.match(items, /class="build-info"/); assert.ok(items.includes('Sortiert 300 Pakete/h')); assert.ok(items.includes('keine Wirkung'));
  ui.run('endBuild()');
  assert.equal(ui.run('sim.state.money'), money0); assert.equal(ui.run('sim.state.ledger.length'), ledger0);
});
