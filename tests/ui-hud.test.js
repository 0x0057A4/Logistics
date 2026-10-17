import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
// Leitstand-HUD 0.9: Kennzahlen, Suche „/“, Meldungsglocke und Fahrzeugleiste zeigen nur echten Zustand.
const text=(ui,id)=>ui.nodes.get('#'+id).textContent;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
// Seit A02 W1b baut „Startbetrieb einrichten“ nur die Depot-Grundausstattung (Dock, Regal, Lager, Fahrer, Lieferwagen).
// Diese HUD-Prüfungen brauchen zusätzlich eine Fertigungslinie (Mehrwertdienste); sie wird über dieselben regulären
// Bau-/Einstellbefehle ergänzt wie der frühere Aufbauassistent. Ergebnis: wieder 5 Anlagen, 5 Beschäftigte, 1 Fahrzeug.
const LINE="for(const [buildingType,x,y]of [['assembly',5,3],['testing',9,3],['packing',13,3]])send({type:'build',buildingType,x,y,rotation:0},true);for(const role of ['production','production','production'])send({type:'hire',role},true);render(true)";
async function line(){const ui=await boot();await ui.click('start');ui.click('starter');ui.run(LINE);return ui;}
// Fertigungsanfragen erscheinen eine Minute nach dem Bau der Fertigungslinie (A01 W1c).
const offers=ui=>{ui.run('sim.step(1)');ui.run('render(true)');return ui;};
function deliver(ui,qty,{late=false}={}){
 const o=ui.run("sim.state.orders.find(o=>o.kind==='manufacturing'&&o.status!=='fulfilled').id");
 if(ui.run(`sim.state.orders.find(o=>o.id==='${o}').status`)==='offer')ui.click('accept',o);
 if(late)ui.run(`sim.state.orders.find(o=>o.id==='${o}').due=sim.state.t-1`);
 ui.run(`sim.api.inventory.add({item:'lamp',qty:${qty},quality:95,unitCost:50,site:'site-1',location:'stock',owner:'company'})`);
 ui.submit('dispatch',{vehicleId:ui.run('sim.state.vehicles[0].id'),qty:String(qty)},o);
 const id=ui.run('sim.state.shipments.at(-1).id');
 for(let i=0;i<400&&ui.run(`sim.state.shipments.find(s=>s.id==='${id}').status`)!=='complete';i++)ui.run('sim.step(1)');
 assert.equal(ui.run(`sim.state.shipments.find(s=>s.id==='${id}').status`),'complete');ui.run('render(true)');
}

test('HUD: Kopfzeile, Statuszeile und Standortfluss zeigen Werte aus echten Befehlen',async()=>{
 const ui=await boot();await ui.click('start');
 assert.equal(text(ui,'sbDocks'),'Rampen 0/0');assert.equal(text(ui,'sbStaff'),'Personal 0/0 im Dienst');assert.equal(text(ui,'kpiPunctual'),'—');assert.equal(text(ui,'kpiPunctualSub'),'Noch keine Zustellung');
 ui.click('starter');
 assert.equal(text(ui,'sbDocks'),'Rampen 0/1');assert.equal(text(ui,'sbStaff'),'Personal 2/2 im Dienst');assert.equal(ui.run("sim.state.buildings.map(b=>b.type).join()"),'dock,rack');
 ui.run(LINE);
 assert.equal(text(ui,'siteCode'),'DM-01');assert.equal(text(ui,'siteName'),'Depot Morgenfeld');
 assert.equal(text(ui,'sbDocks'),'Rampen 0/1');assert.equal(text(ui,'sbVehicles'),'Fahrzeuge 1');assert.equal(text(ui,'sbStaff'),'Personal 5/5 im Dienst');
 const cap=ui.run("sim.api.inventory.capacity('site-1')");assert.equal(text(ui,'sbStock'),`Lager 0/${cap}`);assert.equal(text(ui,'siteStatus'),`Rampen 0/1 · Lager 0/${cap}`);
 assert.equal(text(ui,'kpiVehicles'),'1 / 0');assert.equal(text(ui,'st-production-n'),'0/1');assert.equal(text(ui,'st-quality-n'),'0/2');assert.equal(text(ui,'st-unload-n'),'0/1');assert.equal(ui.nodes.get('#stl-production').hidden,false,'Fertigungsstationen sichtbar, sobald Fertigungsanlagen existieren');
 assert.equal(text(ui,'clock'),'Tag 1 · 08:00');assert.equal(text(ui,'shiftName'),'Tagschicht');
 ui.click('buy-kit');assert.equal(text(ui,'st-inbound-sub'),'3 unterwegs');
 ui.run('sim.step(1)');ui.run('render(true)');assert.match(text(ui,'st-production-sub'),/^Engpass: Material fehlt$/);assert.match(ui.nodes.get('#st-production').className,/tone-wait/);
});

test('HUD: Ausgeliefert heute, Fahrzeuge unterwegs und Pünktlichkeit folgen echten Zustellungen',async()=>{
 const ui=offers(await line());
 const o=ui.run("sim.state.orders.find(o=>o.kind==='manufacturing').id");ui.click('accept',o);
 ui.run("sim.api.inventory.add({item:'lamp',qty:3,quality:95,unitCost:50,site:'site-1',location:'stock',owner:'company'})");
 ui.submit('dispatch',{vehicleId:ui.run('sim.state.vehicles[0].id'),qty:'3'},o);
 for(let i=0;i<200&&ui.run("sim.state.shipments[0].status")!=='transit';i++)ui.run('sim.step(1)');ui.run('render(true)');
 assert.equal(text(ui,'kpiVehicles'),'0 / 1');const row=ui.nodes.get('#vbarList').children[0];
 assert.equal(row.dataset.vehicle,ui.run('sim.state.vehicles[0].id'));assert.equal(row._chip.textContent,'Unterwegs');assert.match(row._chip.className,/tone-move/);assert.match(row._route.textContent,/→ Lichtbogen Bürobedarf$/);assert.match(row._rest.textContent,/^\d+ Min\.$/);
 for(let i=0;i<400&&ui.run('sim.state.shipments[0].status')!=='complete';i++)ui.run('sim.step(1)');ui.run('render(true)');
 assert.equal(text(ui,'kpiDelivered'),'3');assert.equal(text(ui,'kpiDelivered'),String(ui.run('sim.state.stats.delivered')));
 assert.equal(text(ui,'kpiPunctual'),'100 %');assert.equal(text(ui,'kpiPunctualSub'),'1 pünktlich · 0 verspätet');assert.equal(text(ui,'kpiVehicles'),'1 / 0');
 deliver(ui,2,{late:true});
 assert.equal(text(ui,'kpiDelivered'),'5');assert.equal(text(ui,'kpiPunctual'),'50 %');assert.equal(text(ui,'kpiPunctualSub'),'1 pünktlich · 1 verspätet');
 assert.ok(ui.run("sim.state.shipments.at(-1).invoiceAmount")<ui.run("2*sim.state.orders.find(o=>o.id===sim.state.shipments.at(-1).orderId).price"),'Verspätung entspricht dem gebuchten Preisabschlag');
 ui.run('sim.step(1440)');ui.run('render(true)');assert.equal(text(ui,'kpiDelivered'),'0');assert.match(text(ui,'kpiDeliveredSub'),/Δ −5 ggü\. gestern \(5\)/);
});

test('HUD: Suche „/“ findet reale Anlagen, Fahrzeuge, Aufträge und Personen und öffnet die Akte',async()=>{
 const ui=offers(await line());const cmd=ui.nodes.get('#cmd');
 ui.listeners.keydown({key:'/',target:{matches:()=>false},preventDefault(){}});assert.equal(ui.run('document.activeElement'),cmd);
 cmd.value='montage';cmd.oninput();const box=ui.nodes.get('#cmdResults');assert.equal(box.hidden,false);
 const assembly=ui.run("sim.state.buildings.find(b=>b.type==='assembly').id");assert.match(box.innerHTML,new RegExp(`data-hit="${assembly}"`));assert.match(box.innerHTML,/Montageplatz/);
 for(const [query,id] of [['lieferwagen',"sim.state.vehicles[0].id"],['lichtbogen',"sim.state.orders.find(o=>o.customer==='Lichtbogen Bürobedarf').id"],[ui.run('sim.state.workers[0].name').toLowerCase(),'sim.state.workers[0].id']]){cmd.value=query;cmd.oninput();assert.match(box.innerHTML,new RegExp(`data-hit="${ui.run(id)}"`),query);}
 cmd.value='keintreffer-xyz';cmd.oninput();assert.match(box.innerHTML,/Kein Treffer/);assert.doesNotMatch(box.innerHTML,/data-hit/);
 const before=ui.run('sim.serialize()');
 cmd.value='prüf';cmd.oninput();cmd.onkeydown({key:'Enter',preventDefault(){}});
 assert.equal(ui.run('panel'),'detail');assert.equal(ui.run('selected'),ui.run("sim.state.buildings.find(b=>b.type==='testing').id"));assert.equal(cmd.value,'');assert.equal(box.hidden,true);
 const vehicle=ui.run('sim.state.vehicles[0].id');press(ui,{hit:vehicle});assert.equal(ui.run('selected'),vehicle);assert.match(ui.nodes.get('#panelBody').innerHTML,new RegExp(vehicle));
 assert.equal(ui.run('sim.serialize()'),before,'Suche verändert keinen Spielzustand');
});

test('HUD: Glocke zählt echte Wartegründe, listet sie schlüsselbasiert und öffnet die betroffene Akte',async()=>{
 const ui=await line();assert.equal(ui.nodes.get('#bellCount').hidden,true);
 ui.run('sim.step(1)');ui.run('render(true)');
 const alerts=ui.run("sim.state.buildings.filter(b=>['materials','staff','power','storage','broken'].includes(b.status)).length");assert.ok(alerts>0);
 assert.equal(text(ui,'bellCount'),String(alerts));assert.equal(ui.nodes.get('#bellCount').hidden,false);
 press(ui,{toggle:'bell'});assert.equal(ui.nodes.get('#bellMenu').hidden,false);
 const list=ui.nodes.get('#bellList'),rows=[...list.children];assert.equal(rows.length,alerts);assert.match(rows[0]._title.textContent,/Material fehlt/);
 ui.run('render(true)');assert.deepEqual([...list.children],rows,'Zeilen bleiben bei unverändertem Zustand dieselben DOM-Knoten');
 const o=ui.run("sim.state.orders.find(o=>o.kind==='manufacturing').id");ui.click('accept',o);ui.run(`sim.state.orders.find(o=>o.id==='${o}').due=sim.state.t-1`);ui.run('render(true)');
 assert.equal(text(ui,'bellCount'),String(alerts+1));assert.equal(list.children.length,alerts+1);assert.ok(rows.every(r=>list.children.includes(r)),'bestehende Meldungen werden nicht neu erzeugt');
 const late=list.children.find(r=>r.dataset.alert==='o:'+o);assert.match(late._title.textContent,/Frist überschritten/);
 press(ui,{alert:'o:'+o});assert.equal(ui.run('panel'),'detail');assert.equal(ui.run('selected'),o);assert.equal(ui.nodes.get('#bellMenu').hidden,true);
});

test('HUD: Werte höchstens 4× je Sekunde und nur bei Änderung ins DOM; Panel ohne Datenänderung nicht neu geschrieben',async()=>{
 const ui=await line();
 ui.nodes.get('#sbVehicles').textContent='SENTINEL';ui.run('render(true)');assert.equal(text(ui,'sbVehicles'),'SENTINEL','unveränderter Wert wird nicht erneut geschrieben');
 ui.run("sim.command({type:'buyVehicle',vehicleType:'van'})");ui.run('render()');assert.equal(text(ui,'sbVehicles'),'SENTINEL','innerhalb von 250 ms gedrosselt');
 ui.run('flushHud(true)');assert.equal(text(ui,'sbVehicles'),'Fahrzeuge 2');
 ui.run("openPanel('production')");const body=ui.nodes.get('#panelBody');assert.match(body.innerHTML,/Montageplatz/);
 body.innerHTML='UNVERÄNDERT';ui.run('renderPanel()');assert.equal(body.innerHTML,'UNVERÄNDERT');
 ui.run("sim.command({type:'toggleBuilding',id:sim.state.buildings.find(b=>b.type==='assembly').id})");ui.run('renderPanel()');assert.match(body.innerHTML,/Fortsetzen/);
 body.innerHTML='UNVERÄNDERT';ui.click('refresh');assert.match(body.innerHTML,/Montageplatz/,'Aktualisieren erzwingt Neuaufbau');
});

test('HUD: Standortwahl, Stationen, Fahrzeugzeile und Einklappen nutzen bestehende Fachbefehle und Fenster',async()=>{
 const ui=await boot();await ui.click('start');await ui.submit('loadMode',{mode:'sandbox'});
 const site=ui.run("sim.command({type:'buySite',name:'Verteilzentrum Lindenhain'}).id");ui.run('render(true)');
 press(ui,{toggle:'sites'});assert.equal(ui.nodes.get('#siteMenu').hidden,false);assert.match(ui.nodes.get('#siteList').innerHTML,new RegExp(`data-site="${site}"`));assert.match(ui.nodes.get('#siteList').innerHTML,/VL-02 · Verteilzentrum Lindenhain/);
 press(ui,{site});assert.equal(ui.run('sim.state.selectedSite'),site);assert.equal(text(ui,'siteCode'),'VL-02');assert.equal(text(ui,'flowSite'),'VL-02 · Verteilzentrum Lindenhain');assert.equal(ui.nodes.get('#siteMenu').hidden,true);
 press(ui,{station:'stock'});assert.equal(ui.run('panel'),'inventory');press(ui,{station:'service'});assert.equal(ui.run('panel'),'service');
 ui.run("sim.command({type:'buyVehicle',vehicleType:'van'})");ui.run('render(true)');const id=ui.run('sim.state.vehicles[0].id');
 press(ui,{vehicle:id});assert.equal(ui.run('panel'),'detail');assert.equal(ui.run('selected'),id);
 press(ui,{toggle:'vbar'});assert.equal(ui.run('prefs.vbarCollapsed'),true);assert.equal(ui.run("document.body.classList.contains('vbar-collapsed')"),true);
 press(ui,{toggle:'flow'});assert.equal(ui.run("document.body.classList.contains('flow-collapsed')"),true);assert.equal(JSON.parse(ui.memory.get('industrie-logistik-v1-prefs')).flowCollapsed,true);
 press(ui,{toggle:'scene'});assert.equal(ui.run("document.body.classList.contains('scene-only')"),true);press(ui,{toggle:'scene'});assert.equal(ui.run("document.body.classList.contains('scene-only')"),false);
 assert.equal(ui.nodes.get('#labelGroup').hidden,true,'Labelgruppen nur, wenn die Szene setLabels anbietet');
 ui.run("scene.setLabels=m=>{globalThis.labels=m;}");ui.run('render(true)');assert.equal(ui.nodes.get('#labelGroup').hidden,false);press(ui,{labels:'fleet'});assert.equal(ui.run('labels'),'fleet');
 ui.run('guard.dispose()');
});

test('Version (QS-W0-10): Statuszeile, Einstellungen und Handbuch nennen „0.12 · ENTWICKLUNG“',async()=>{
 const ui=await boot();await ui.click('start');
 assert.equal(text(ui,'appVersion'),'0.12 · ENTWICKLUNG');
 for(const p of ['settings','help']){ui.run(`openPanel('${p}')`);const body=ui.nodes.get('#panelBody').innerHTML;assert.match(body,/0\.12 · ENTWICKLUNG/,p);assert.doesNotMatch(body,/Entwicklungsfassung 0\.8|0\.8 · ENTWICKLUNG/,p);}
 ui.run('guard.dispose()');
});

test('Lagerpanel (QS-W0-06): Belegung und Kapazität = Lager-API wie HUD, Ware in Anlage zählt nicht',async()=>{
 const ui=await line(),de=n=>new Intl.NumberFormat('de-DE').format(n);
 ui.run("sim.api.inventory.add({item:'housing',qty:5,site:'site-1',location:'stock'})");ui.run("sim.api.inventory.add({item:'housing',qty:3,site:'site-1',location:'machine'})");ui.run('render(true)');
 const used=ui.run("sim.api.inventory.used('site-1')"),cap=ui.run("sim.api.inventory.capacity('site-1')");assert.equal(used,5);
 ui.run("openPanel('inventory')");const body=ui.nodes.get('#panelBody').innerHTML;
 assert.ok(body.includes(`<b>${de(used)}</b><small>Einheiten am Standort`),'Panel Belegung');assert.ok(body.includes(`<b>${de(cap)}</b><small>Lagerkapazität`),'Panel Kapazität');
 assert.equal(text(ui,'sbStock'),`Lager ${de(used)}/${de(cap)}`);ui.run('guard.dispose()');
});
