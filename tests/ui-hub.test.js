import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
import {hubProbe} from './ui-hub-probe.js';
// Hub-Kreislauf W1-S4 (A10): Verträge, Hof & Docks, Standortfluss, Glocke, Suche, Fahrzeugleiste, Tutorial.
const text=(ui,id)=>ui.nodes.get('#'+id).textContent;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
async function probe(options){const ui=await boot();await ui.click('start');const {sim,ids}=hubProbe(Simulation,options);
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');return {ui,ids};}

test('Verträge: Startangebot zeigen, annehmen über acceptContract, Ankunftsplan, Kündigung mit Rückfrage',async()=>{
 const ui=await boot();await ui.click('start');
 const c=ui.run("sim.state.contracts[0]");assert.equal(c.status,'offer');
 assert.equal(text(ui,'missionTitle'),'Ersten Frachtvertrag annehmen');assert.equal(ui.nodes.get('#missionAction').dataset.panel,'contracts');
 press(ui,{panel:'contracts'});assert.equal(ui.run('panel'),'contracts');const body=()=>ui.nodes.get('#panelBody').innerHTML;
 assert.ok(body().includes(c.shipper));for(const l of c.lanes)assert.ok(body().includes(l.name),l.name);
 const perDay=c.arrivals.reduce((n,a)=>n+a.parcels,0);assert.ok(body().includes(`<b>${perDay}</b><small>Pakete / Tag`));
 assert.match(body(),/Preis \/ Paket/);assert.match(body(),/Frist ab Tor/);assert.match(body(),new RegExp(`data-action="acceptContract" data-id="${c.id}"`));
 ui.click('acceptContract',c.id);assert.equal(ui.run(`sim.state.contracts.find(x=>x.id==='${c.id}').status`),'active');
 assert.match(body(),/Ankunftsplan heute und morgen/);assert.match(body(),/<td>(Heute|Morgen)<\/td>/);assert.match(body(),/Geplant/);
 assert.equal(text(ui,'missionTitle'),'Sortierplatz bauen');assert.equal(ui.nodes.get('#missionAction').dataset.id,'sorter');
 ui.click('cancelContract',c.id);assert.equal(ui.nodes.get('#confirm').open,true,'Kündigung fragt nach');assert.match(text(ui,'confirmText'),/Vertrag endet/);
 ui.click('confirmCancel');assert.equal(ui.run(`sim.state.contracts.find(x=>x.id==='${c.id}').status`),'active');
 ui.click('cancelContract',c.id);ui.click('confirmOk');assert.equal(ui.run(`sim.state.contracts.find(x=>x.id==='${c.id}').status`),'ended');
 assert.match(body(),/Beendete Verträge · 1/);
});

test('Verträge: fehlender Befehl ({ok:false}) erscheint als verständliche Meldung, Zustand unverändert',async()=>{
 const ui=await boot();await ui.click('start');const id=ui.run('sim.state.contracts[0].id'),before=ui.run('sim.serialize()');
 ui.run("const real=sim.command.bind(sim);sim.command=c=>c.type==='acceptContract'?{ok:false,message:'Befehl unbekannt.'}:real(c)");
 ui.click('acceptContract',id);assert.match(text(ui,'toast'),/Vertragsannahme noch nicht verfügbar.*acceptContract/);assert.match(ui.nodes.get('#toast').className,/error/);
 assert.equal(ui.run('sim.serialize()'),before);
});

test('Hof & Docks: Torbuch, Dock-Belegung, Standortfluss und Fremd-Lkw in der Fahrzeugleiste aus echtem Hofeintrag',async()=>{
 const {ui,ids}=await probe();const a=ui.run(`sim.state.yard.find(a=>a.id==='${ids.arrival}')`);assert.equal(a.phase,'unloading');
 press(ui,{panel:'yard'});const body=ui.nodes.get('#panelBody').innerHTML;
 assert.ok(body.includes(`<b>${a.plate}</b>`));assert.ok(body.includes(a.carrier));assert.match(body,/<span class="chip tone-good">Entladen<\/span>/);
 assert.ok(body.includes(`${a.unloaded} / ${a.parcels}`));assert.match(body,/<td>Dock 1<\/td>/);assert.doesNotMatch(body,/prioritizeArrival/,'am Dock nicht vorziehbar');
 assert.match(body,/Dock 1 <span class="chip tone-move">Fremd-Lkw<\/span>/);assert.match(body,/Dock 2 <span class="chip tone-move">Eigene Ladung<\/span>/);
 const inbound=ui.run("sim.state.batches.filter(b=>b.item==='parcel'&&b.location==='inbound').reduce((n,b)=>n+b.qty,0)");
 assert.equal(text(ui,'st-gate-n'),'1');assert.equal(text(ui,'st-gate-sub'),'1 am Dock');assert.equal(text(ui,'st-unload-n'),'2/2');assert.equal(text(ui,'st-unload-sub'),'1 Lkw entladen · 1 eigene Ladung');
 assert.equal(text(ui,'st-sort-n'),String(inbound));assert.equal(text(ui,'st-sort-sub'),'1/1 Sortierplätze arbeitend');assert.match(ui.nodes.get('#st-sort').className,/tone-move/);
 const lane=ui.run(`(()=>{const o=sim.state.orders.find(o=>o.id==='${ids.orders[0]}'),c=sim.state.contracts.find(c=>c.id===o.contractId);return c.lanes.find(l=>l.id===o.lane).name;})()`);
 const out=ui.run(`sim.state.batches.filter(b=>b.item==='parcel'&&b.location==='stock'&&b.owner==='${ids.orders[0]}').reduce((n,b)=>n+b.qty,0)`),outAll=ui.run("sim.state.batches.filter(b=>b.item==='parcel'&&b.location==='stock').reduce((n,b)=>n+b.qty,0)");
 assert.ok(out>0);assert.equal(text(ui,'st-out-n'),String(outAll));assert.ok(text(ui,'st-out-sub').includes(`${lane} ${out}`),text(ui,'st-out-sub'));
 assert.equal(text(ui,'st-delivery-n'),'2');assert.match(text(ui,'st-delivery-sub'),/Pakete offen/);
 for(const id of ['inbound','production','quality','service'])assert.equal(ui.nodes.get('#stl-'+id).hidden,true,id+' ohne Fertigungsanlagen ausgeblendet');
 const row=ui.nodes.get('#vbarList').children.find(r=>r.dataset.arrival===a.id);assert.ok(row,'Fremd-Lkw in Fahrzeugleiste');
 assert.equal(row._id.textContent,'Fremd');assert.equal(row._name.textContent,a.plate);assert.equal(row._chip.textContent,'Entladen');assert.match(row.className,/foreign/);assert.match(text(ui,'vbarSummary'),/1 Fremd-Lkw/);
 press(ui,{panel:'overview'});press(ui,{arrival:a.id});assert.equal(ui.run('panel'),'yard');assert.match(ui.nodes.get('#panelBody').innerHTML,new RegExp(`<tr class="selected" data-arrival-row="${a.id}"`));
 press(ui,{station:'gate'});assert.equal(ui.run('panel'),'yard');press(ui,{station:'delivery'});assert.equal(ui.run('panel'),'orders');
});

test('Hof: Lkw wartet > 15 min → Glocke; Vorziehen sendet prioritizeArrival; Suche findet Kennzeichen und Vertrag',async()=>{
 const {ui,ids}=await probe({blockDocks:true});const a=ui.run(`sim.state.yard.find(a=>a.id==='${ids.arrival}')`);
 assert.equal(a.phase,'queue');assert.ok(ui.run('sim.state.t')-a.waitSince>15);
 const alert=ui.run(`hudData.alerts.find(x=>x.key==='yw:${a.id}')`);assert.ok(alert,'Wartemeldung');assert.match(alert.title,new RegExp(`Lkw ${a.plate} wartet seit \\d+ Min\\.`));assert.match(alert.sub,/Kein freies Dock/);
 press(ui,{panel:'yard'});let body=ui.nodes.get('#panelBody').innerHTML;assert.match(body,/<span class="chip tone-wait">Wartet auf Dock<\/span>/);assert.match(body,/Kein freies Dock<br><small class="money-minus">seit \d+ Min\.<\/small>/);
 assert.match(body,new RegExp(`data-action="prioritizeArrival" data-id="${a.id}"`));
 ui.click('prioritizeArrival',a.id);assert.equal(ui.run(`sim.state.yard.find(x=>x.id==='${a.id}').priority`),true);
 body=ui.nodes.get('#panelBody').innerHTML;assert.doesNotMatch(body,/prioritizeArrival/,'nur einmal vorziehbar');assert.match(body,/vorgezogen/);
 ui.run(`sim.state.yard.find(x=>x.id==='${a.id}').atRisk=true`);ui.run('render(true)');assert.ok(ui.run(`hudData.alerts.some(x=>x.key==='yr:${a.id}'&&x.tone==='bad')`),'Frist gefährdet');
 press(ui,{alert:'yw:'+a.id});assert.equal(ui.run('panel'),'yard');
 const cmd=ui.nodes.get('#cmd'),box=ui.nodes.get('#cmdResults');cmd.value=a.plate.slice(0,6).toLowerCase();cmd.oninput();assert.match(box.innerHTML,new RegExp(`data-hit="${a.id}"`));assert.match(box.innerHTML,/Fremd-Lkw/);
 const shipper=ui.run(`sim.state.contracts.find(c=>c.id==='${ids.contract}').shipper`);cmd.value=shipper.split(' ')[0].toLowerCase();cmd.oninput();assert.match(box.innerHTML,new RegExp(`data-hit="${ids.contract}"`));assert.match(box.innerHTML,/Vertrag/);
 press(ui,{hit:ids.contract});assert.equal(ui.run('panel'),'contracts');assert.match(ui.nodes.get('#panelBody').innerHTML,new RegExp(`card selected" data-contract="${ids.contract}"`));
});

test('Glocke: verspätete Vertragsaufträge gebündelt je Vertrag statt je Auftrag',async()=>{
 const {ui,ids}=await probe();ui.run(`for(const o of sim.state.orders)if(o.contractId)o.due=sim.state.t-1`);ui.run('render(true)');
 const ct=ui.run(`hudData.alerts.find(x=>x.key==='ct:${ids.contract}')`);assert.ok(ct);assert.match(ct.title,/· 2 Aufträge verspätet$/);
 assert.ok(!ui.run(`hudData.alerts.some(x=>x.key.startsWith('o:'))`),'keine Einzelmeldungen für Hub-Aufträge');
 assert.equal(text(ui,'st-delivery-sub').includes('2 verspätet'),true);assert.match(ui.nodes.get('#st-delivery').className,/tone-bad/);
});

test('KPI „Verarbeitet heute“ nur mit Sortierzähler; Build-Tray-Icon Sortierplatz; Anzeige verändert keinen Zustand',async()=>{
 let ui=await boot();await ui.click('start');assert.equal(ui.run('sim.state.sorting'),undefined);assert.equal(ui.nodes.get('#kpiSortedBox').hidden,true,'ohne Zähler kein KPI');
 ({ui}=await probe());
 const before=ui.run('sim.serialize()');for(const p of ['contracts','yard'])press(ui,{panel:p});ui.run('render(true)');assert.equal(ui.run('sim.serialize()'),before);
 ui.click('build','sorter');assert.equal(ui.run('build'),'sorter');assert.match(ui.nodes.get('#buildItems').innerHTML,/data-build="sorter" class="active"><i>⇶<\/i><b>Sortierplatz/);
 const sorted=ui.run("sim.state.sorting.sites['site-1'].today");assert.ok(sorted>0);assert.equal(ui.run("sim.state.sorting.day"),ui.run('Math.floor(sim.state.t/1440)'));
 assert.equal(ui.nodes.get('#kpiSortedBox').hidden,false);assert.equal(text(ui,'kpiSorted'),String(sorted));assert.equal(text(ui,'kpiSortedSub'),`Pakete · gesamt ${sorted}`);
 ui.run('sim.state.sorting.day-=1');ui.run('render(true)');assert.equal(text(ui,'kpiSorted'),'0','Vortag zählt nicht als heute');
});

test('Phasenlabels deutsch (W1-S4); Sendungs-Entladung bleibt „Entladung“',async()=>{
 const ui=await boot();
 assert.deepEqual(JSON.parse(ui.run("JSON.stringify(['approach','gate','queue','toDock','docking','unloading','exit'].map(phaseLabel))")),['Anfahrt','Torkontrolle','Wartet auf Dock','Zum Dock','Andocken','Entladen','Ausfahrt']);
 assert.equal(ui.run("label('unloading')"),'Entladung');
});
