// Welle 3a-2 (A10): Fenster „Linien“ (Rail, Kürzel N, Befehlspalette), Formular, Bearbeiten/Löschen, laufende Fahrten mit
// Storno, Vertragskarte (Gebiet mit Standort, Zuschlag, Frist, „Hauptlauf nötig“), Station „Hauptlauf“, Glocke, Fahrzeugleiste,
// Paketreise in der Auftragsakte, ausgegrautes Versandformular. Echte Fachmodule, zwei Standorte.
// Eingriffe in die Ausgangslage sind benannt (Vertragsgebiete mit Standort, Auftrag mit Ware im Lager, Kasse leer).
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
import {nextDeparture,WAIT} from '../dist/linehaul.js';

const body=ui=>ui.nodes.get('#panelBody').innerHTML;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const alerts=ui=>JSON.parse(ui.run('JSON.stringify(hudData.alerts)'));
const st=(ui,k)=>ui.run(`sim.state.${k}`);
async function load(sim){const ui=await boot();await ui.click('start');
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');return ui;}
const until=(ui,cond,max=4000)=>assert.equal(ui.run(`(()=>{let i=0;while(!(${cond})&&i++<${max})sim.step(1);render(true);return !!(${cond});})()`),true,'Bedingung nicht erreicht: '+cond);

/** A (Annahme-Hub) und B (Ziel-Hub). A: Dock, 2 Regale, 2 Lagerkräfte, Fahrer, Lkw. B: Dock, Regal, Lagerkraft, Fahrer, Lieferwagen.
 *  Ausgangslage: Vertrag mit Gebiet am Standort A und Gebiet an B (Zuschlag/Frist), Aufträge mit sortierter Ware im Lager von A. */
function setup(){
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,A='site-1',B=ok(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(const site of [A,B]){ok(sim,{type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});ok(sim,{type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});}
 ok(sim,{type:'build',buildingType:'rack',site:A,x:5,y:2,rotation:0});
 for(const role of ['warehouse','warehouse','driver'])ok(sim,{type:'hire',role,site:A});
 for(const role of ['warehouse','driver'])ok(sim,{type:'hire',role,site:B});
 for(const w of s.workers)w.shift='all';
 const truck=ok(sim,{type:'buyVehicle',vehicleType:'truck',site:A}).id,van=ok(sim,{type:'buyVehicle',vehicleType:'van',site:B}).id;
 const k=s.contracts[0];ok(sim,{type:'acceptContract',id:k.id});
 k.lanes=[{id:'lane-1',name:'Nahbezirk',distance:20,site:A},{id:'lane-2',name:'Fernbezirk',distance:25,site:B,surcharge:1.2,extraSla:240}];k.laneShare=[0.5,0.5];
 const order=(to,qty)=>{const id=sim.api.id('order');
  s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:to===B?'lane-2':'lane-1',customer:`${to===B?'Fernbezirk':'Nahbezirk'} (Testversand)`,item:'parcel',qty,price:9,due:s.t+1400,quality:0,site:A,deliverySite:to,status:'active',delivered:0,paid:0});
  assert.ok(sim.api.inventory.add({item:'parcel',qty,site:A,owner:id,location:'stock',quality:100,unitCost:0}));return id;};
 const remote=order(B,40),local=order(A,30);
 return {sim,s,A,B,truck,van,k,remote,local};
}

test('Fenster Linien: Rail, Kürzel N, Palette; Hauptlauf fehlt (Glocke, Vertragskarte, Station); Formular legt Linie an',async()=>{
 const env=setup(),{A,B,truck,van,k}=env;const ui=await load(env.sim);
 // Glocke + Station vor der Linie
 const nl=alerts(ui).find(a=>a.key===`nl:${A}>${B}`);assert.ok(nl,'Glocke: Hauptlauf fehlt');assert.equal(nl.tone,'bad');assert.match(nl.sub,/^40 Einheiten aus 1 Auftrag/);
 assert.equal(ui.nodes.get('#stl-linehaul').hidden,false);assert.equal(ui.nodes.get('#st-linehaul-n').textContent,'40');assert.match(ui.nodes.get('#st-linehaul-sub').textContent,/→ Ziel-Hub Birkenau 40 · keine Linie/);
 assert.equal(ui.nodes.get('#st-out-n').textContent,'30','Ausgang zählt nur Pakete für eigene Gebiete');
 // Vertragskarte
 press(ui,{panel:'contracts'});const card=body(ui).slice(body(ui).indexOf(`data-contract="${k.id}"`));
 assert.match(card,/Fernbezirk · 25 km · 50 % · <b>Zustellung ab Ziel-Hub Birkenau<\/b> · Zuschlag \+1,20 € je Paket · Frist \+4 Std\./);
 assert.match(card,/Hauptlauf nötig:<\/b> Keine Linie/);assert.ok(card.includes(`data-action="newLine" data-id="${A}&gt;${B}"`)||card.includes(`data-action="newLine" data-id="${A}>${B}"`));
 // Kürzel N, Palette
 ui.listeners.keydown({key:'n',target:{matches:()=>false},preventDefault(){}});assert.equal(ui.run('panel'),'lines');
 ui.listeners.keydown({key:'n',target:{matches:()=>false},preventDefault(){}});assert.equal(ui.run('panel'),'');
 assert.ok(ui.run("paletteHits('linien').some(h=>h.title==='Linienverkehr'&&/· N/.test(h.sub))"));assert.ok(ui.run("paletteHits('>linie anlegen').length>0"));
 assert.ok(ui.run("KEYS.some(k=>k[0]==='N')"));
 // Knopf aus Vertragskarte → Formular vorbelegt
 ui.click('newLine',`${A}>${B}`);assert.equal(ui.run('panel'),'lines');
 let html=body(ui);assert.match(html,/Hauptlauf fehlt/);assert.match(html,/Neue Linie/);
 assert.ok(html.includes(`<option value="${truck}" `),'freier Lkw am Start');assert.ok(!html.includes(`<option value="${van}"`),'Fahrzeug am Ziel nicht wählbar');
 // Ungültige Abfahrt → keine Linie
 ui.submit('line',{from:A,to:B,departures:'25:00',vehicleId:truck,cutoff:'30'});assert.equal(st(ui,'lines.length'),0);assert.match(ui.nodes.get('#toast').textContent,/ungültig/);
 ui.submit('line',{from:A,to:B,departures:'14:00, 6:30',vehicleId:truck,cutoff:'45'});
 assert.equal(st(ui,'lines.length'),1);const l=JSON.parse(ui.run('JSON.stringify(sim.state.lines[0])'));assert.deepEqual(l.departures,[390,840]);assert.equal(l.cutoff,45);assert.equal(l.vehicleId,truck);
 html=body(ui);const nd=nextDeparture(JSON.parse(ui.run('JSON.stringify({t:sim.state.t})')),l);
 const hh=m=>`${String(Math.floor(m%1440/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 assert.match(html,/<h3>[^<]+ → Ziel-Hub Birkenau<\/h3>/);assert.match(html,/06:30 · 14:00 · 2× täglich/);assert.ok(html.includes(`<b>${hh(nd.departAt)}</b><small>Nächste Abfahrt`));assert.ok(html.includes(`<b>${hh(nd.cutoffAt)}</b><small>Ladeschluss`));
 assert.match(html,/<b>40<\/b><small>Bereit für Ziel/);assert.doesNotMatch(html,/Hauptlauf fehlt/);
 ui.run('render(true)');assert.ok(!alerts(ui).some(a=>a.key.startsWith('nl:')),'Glocke ruhig mit Linie');
 assert.match(ui.nodes.get('#st-linehaul-sub').textContent,new RegExp(`Abfahrt ${hh(nd.departAt)}`));
 press(ui,{panel:'contracts'});assert.match(body(ui),/Hauptlauf .* über Linie · nächste Abfahrt/);
 // Bearbeiten, Pausieren, Löschen
 press(ui,{panel:'lines'});ui.click('editLine',l.id);assert.match(body(ui),/Linie bearbeiten/);assert.match(body(ui),/value="06:30, 14:00"/);
 ui.submit('line',{departures:'08:00',vehicleId:'',cutoff:'30'},l.id);assert.deepEqual(JSON.parse(ui.run('JSON.stringify(sim.state.lines[0].departures)')),[480]);assert.equal(st(ui,'lines[0].vehicleId'),null);
 assert.match(body(ui),/Kein Lkw zugeordnet/);
 ui.click('toggleLine',l.id);assert.equal(st(ui,'lines[0].active'),false);ui.run('render(true)');assert.ok(alerts(ui).some(a=>a.key==='lp:'+l.id),'pausierte Linie mit Ware');
 ui.click('deleteLine',l.id);ui.click('confirmOk');assert.equal(st(ui,'lines.length'),0);
 ui.run('guard.dispose()');
});

test('Linienfahrt: Ladeschluss, Fahrzeugleiste, Storno, verpasste Abfahrt, Verzug > 15 min, Paketreise bis Ziel-Hub',async()=>{
 const env=setup(),{sim,A,B,truck,remote,local}=env;
 env.k.lastEta=1e9; // Ausgangslage: Vertrag bleibt aktiv, erzeugt aber keine weiteren Ankünfte; nur die beiden Testaufträge
 const ui=await load(sim);
 // Linie ohne Lkw → Abfahrt verpasst
 ui.submit('line',{from:A,to:B,departures:'10:00',vehicleId:'',cutoff:'30'});const id=st(ui,'lines[0].id');
 until(ui,'sim.state.lines[0].wait');assert.equal(st(ui,'lines[0].wait'),WAIT.vehicle);
 const lm=alerts(ui).find(a=>a.key==='lm:'+id);assert.ok(lm,'Glocke: Abfahrt verpasst');assert.match(lm.sub,/^Kein Lkw zugeordnet · Tag/);
 press(ui,{alert:'lm:'+id});assert.equal(ui.run('panel'),'lines');assert.equal(ui.run('hubFocus'),id);
 // Lkw zuordnen → nächster Ladeschluss erzeugt Fahrt
 ui.submit('line',{departures:'10:00',vehicleId:truck,cutoff:'30'},id);
 until(ui,"sim.state.linehauls.some(x=>x.status==='loading')");
 const lh=JSON.parse(ui.run("JSON.stringify(sim.state.linehauls.find(x=>x.status==='loading'))"));assert.equal(lh.qty,40);
 const row=JSON.parse(ui.run(`JSON.stringify(hudData.vehicles.find(v=>v.id==='${truck}'))`));assert.match(row.status,/^Hauptlauf → Ziel-Hub Birkenau · /);assert.match(row.route,/→ Ziel-Hub Birkenau$/);
 press(ui,{panel:'lines'});assert.match(body(ui),/Laufende Fahrten/);assert.match(body(ui),/data-action="cancelLinehaul"/);assert.match(body(ui),/40 Einheiten · 1 Auftrag/);
 // Paketreise: Ware in Beladung, Abfahrt laut Fahrplan
 ui.click('select',remote);let j=body(ui);assert.match(j,/Paketreise/);assert.match(j,/Hauptlauf → Ziel-Hub Birkenau/);assert.match(j,/40 in Beladung · Abfahrt laut Fahrplan 10:00/);
 assert.match(j,/Annahme-Hub[^<]*<\/b><strong>✓/);
 ui.click('select',local);assert.doesNotMatch(body(ui),/Hauptlauf →/,'lokaler Auftrag ohne Hauptlauf');assert.match(body(ui),/Zustellung<\/b><strong>30/);
 // Fahrzeugakte
 ui.click('select',truck);assert.match(body(ui),/Hauptlauf<\/span><b>[^<]*→ Ziel-Hub Birkenau/);
 // Storno vor Abfahrt
 ui.click('cancelLinehaul',lh.id);ui.click('confirmOk');assert.equal(st(ui,`linehauls.find(x=>x.id==='${lh.id}').status`),'cancelled');assert.equal(st(ui,`vehicles.find(v=>v.id==='${truck}').status`),'idle');
 // Nächster Tag: Kasse leer (Ausgangslage) → Fahrt wartet nach Fahrplanabfahrt → Glocke nach > 15 min
 until(ui,"sim.state.linehauls.some(x=>x.status==='loading')");ui.run('sim.state.money=0');
 const lh2=st(ui,"linehauls.find(x=>x.status==='loading').id");
 until(ui,`sim.state.t>sim.state.linehauls.find(x=>x.id==='${lh2}').departAt+16`);
 const lw=alerts(ui).find(a=>a.key==='lw:'+lh2);assert.ok(lw,'Glocke: Linienfahrt wartet');assert.match(lw.sub,/Kasse reicht nicht/);
 ui.run('sim.state.money=50000');
 until(ui,`sim.state.linehauls.find(x=>x.id==='${lh2}').status==='transit'`);
 ui.click('select',remote);j=body(ui);assert.match(j,/Hauptlauf unterwegs · 40 an Bord · Ankunft \d\d:\d\d/);
 until(ui,`['returning','complete'].includes(sim.state.linehauls.find(x=>x.id==='${lh2}').status)`);
 ui.click('select',remote);j=body(ui);assert.match(j,/Hauptlauf → Ziel-Hub Birkenau<\/b><strong>✓/);
 assert.match(j,/Sortierung · Ziel-Hub Birkenau<\/b><strong>(\d+|✓)/);assert.match(j,/\d+\/40 zugestellt/);
 // Versandformular: an A ausgegraut, an B zustellbar
 press(ui,{panel:'orders'});const at=body(ui).indexOf('Fernbezirk (Testversand)'),part=body(ui).slice(at,at+2500);
 assert.match(part,/dispatch-off/);assert.match(part,/Zustellgebiet gehört zu Ziel-Hub Birkenau/);
 assert.match(ui.run('tourPanel(sim.state)'),new RegExp(`<option value="${remote}"[^>]*disabled`));
 ui.run(`send({type:'selectSite',id:'${B}'},true)`);press(ui,{panel:'orders'});const at2=body(ui).indexOf('Fernbezirk (Testversand)');assert.doesNotMatch(body(ui).slice(at2,at2+1500),/dispatch-off/);
 // Spielstand: Linien und Fahrten überstehen Speichern/Laden, Fenster gleich
 ui.run('panelHtml=null');press(ui,{panel:'lines'});const before=body(ui);
 ui.run('sim=Simulation.fromJSON(sim.serialize());render(true)');press(ui,{panel:'lines'});assert.equal(body(ui),before);
 ui.run('guard.dispose()');
});

test('Ein Standort: Linienfenster erklärt, Station Hauptlauf ausgeblendet, keine Linienmeldungen',async()=>{
 const ui=await boot();await ui.click('start');ui.run('render(true)');
 press(ui,{panel:'lines'});assert.match(body(ui),/Nur ein Standort/);assert.equal(ui.nodes.get('#stl-linehaul').hidden,true);
 assert.ok(!alerts(ui).some(a=>/^(nl|lm|lw|lp):/.test(a.key)));
 ui.run('guard.dispose()');
});
