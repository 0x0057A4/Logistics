import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
import {hubProbe} from './ui-hub-probe.js';
import {workRate,UNLOAD_BASE} from '../dist/workforce.js';
// Personal W1c (A10): Tätigkeit aus describeAssignment, Torbuch mit „Keine Torkontrolle“ und Entladetempo. Nur Anzeige.
const body=ui=>ui.nodes.get('#panelBody').innerHTML;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
async function probe(options){const ui=await boot();await ui.click('start');const {sim,ids}=hubProbe(Simulation,options);
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');return {ui,ids};}
const card=(html,name)=>{const i=html.indexOf(`<h3>${name}</h3>`);assert.ok(i>=0,name);return html.slice(i,html.indexOf('</div></div><select',i));};

test('Personalfenster: Tätigkeit aus describeAssignment, Klick auf Bezug öffnet Hof & Docks bzw. Anlage',async()=>{
 const {ui,ids}=await probe();const ws=ui.run('sim.state.workers.map(w=>({id:w.id,name:w.name,task:w.task}))'),a=ui.run(`sim.state.yard.find(a=>a.id==='${ids.arrival}')`);
 const unloader=ws.find(w=>w.task===a.id+':warehouse'),sorter=ws.find(w=>w.task===ids.sorter+':sort'),free=ws.find(w=>!w.task);
 assert.ok(unloader&&sorter&&free);
 const before=ui.run('sim.serialize()');press(ui,{panel:'staff'});const html=body(ui);
 const u=card(html,unloader.name);assert.ok(u.includes(`Entlädt ${a.plate} (${a.unloaded}/${a.parcels} Pakete, 20/min)`),u);assert.ok(u.includes(`data-arrival="${a.id}"`));assert.match(u,/badge good">Entladen/);
 const so=card(html,sorter.name);assert.match(so,/Sortierplatz/);assert.ok(so.includes(`data-action="select" data-id="${ids.sorter}"`));
 assert.match(card(html,free.name),/<b>Bereit<\/b>/);assert.equal(ui.run('sim.serialize()'),before,'Anzeige ändert keinen Zustand');
 press(ui,{arrival:a.id});assert.equal(ui.run('panel'),'yard');assert.match(body(ui),new RegExp(`<tr class="selected" data-arrival-row="${a.id}"`));
 ui.click('select',ids.sorter);assert.equal(ui.run('panel'),'detail');assert.equal(ui.run('selected'),ids.sorter);
 ui.click('select',unloader.id);assert.ok(body(ui).includes(`<span>Tätigkeit</span><b>Entlädt ${a.plate}`),'Objektakte zeigt lesbare Tätigkeit');assert.doesNotMatch(body(ui),/:warehouse/);
 ui.click('select',free.id);assert.match(body(ui),/<span>Tätigkeit<\/span><b>Bereit<\/b>/);
 // Handsortierung, Pause, Feierabend (Anzeige der Lesesicht; Zustand nur für die Anzeige gesetzt).
 ui.run(`sim.state.workers.find(w=>w.id==='${free.id}').task='site-1:handsort'`);press(ui,{panel:'staff'});const h=card(body(ui),free.name);assert.match(h,/Handsortierung/);assert.match(h,/data-station="sort"/);
 press(ui,{station:'sort'});assert.equal(ui.run('panel'),'inventory');
 ui.run(`Object.assign(sim.state.workers.find(w=>w.id==='${free.id}'),{task:null,breakRemaining:12})`);press(ui,{panel:'staff'});assert.match(card(body(ui),free.name),/Erholungspause \(12 min\)/);
 assert.match(card(body(ui),free.name),/badge warn">Pause/);
});

test('Torbuch: gebundene Entladekraft mit Tempo aus workRate (nur Anzeige)',async()=>{
 const {ui,ids}=await probe();const a=ui.run(`sim.state.yard.find(a=>a.id==='${ids.arrival}')`),w=ui.run(`sim.state.workers.find(w=>w.task==='${a.id}:warehouse')`);
 press(ui,{panel:'yard'});assert.ok(body(ui).includes(`${a.unloaded} / ${a.parcels}<br><small class="muted crew">${w.name} · 20 Pakete/min</small>`));
 ui.run(`Object.assign(sim.state.workers.find(x=>x.id==='${w.id}'),{skill:1.5,fatigue:65})`);const rate=workRate({skill:1.5,fatigue:65},UNLOAD_BASE);assert.notEqual(rate,UNLOAD_BASE);
 const before=ui.run('sim.serialize()');ui.run('render(true)');assert.ok(body(ui).includes(`${w.name} · ${rate} Pakete/min`));assert.equal(ui.run('sim.serialize()'),before);
});

test('Torbuch und Glocke: „Keine Torkontrolle“ mit Wartezeit, Meldung > 15 min, danach Torkontrolle mit Person',async()=>{
 const {ui}=await probe({minutes:560});
 ui.run(`for(const w of sim.state.workers)if(w.role==='warehouse'){w.task=null;sim.command({type:'setShift',id:w.id,shift:'night'});}`);
 ui.run('while(sim.state.t<590)sim.step(1)');ui.run('render(true)');
 const a=ui.run('sim.state.yard[0]');assert.equal(a.phase,'gate');assert.equal(a.waitReason,'Keine Torkontrolle');assert.ok(590-a.waitSince>15);
 const alert=ui.run(`hudData.alerts.find(x=>x.key==='yw:${a.id}')`);assert.ok(alert,'Glocke greift auch in der Torkontrolle');assert.match(alert.title,/wartet seit (1[6-9]|20) Min\./);assert.match(alert.sub,/^Keine Torkontrolle/);
 press(ui,{panel:'yard'});let html=body(ui);assert.match(html,/<span class="chip tone-wait">Torkontrolle<\/span>/);assert.match(html,/Keine Torkontrolle<br><small class="money-minus">seit \d+ Min\.<\/small>/);
 assert.match(html,/<td class="num">wartet<\/td>/,'kein scheinbarer Rest während des Wartens');
 const row=ui.nodes.get('#vbarList').children.find(r=>r.dataset.arrival===a.id);assert.ok(row);
 const w=ui.run("sim.state.workers.find(w=>w.role==='warehouse')");ui.run(`sim.command({type:'setShift',id:'${w.id}',shift:'day'})`);ui.run('sim.step(1)');ui.run('render(true)');
 const g=ui.run(`sim.state.yard.find(a=>a.id==='${a.id}')`);assert.equal(g.phase,'gate');assert.equal(g.waitReason,null);
 html=body(ui);assert.ok(html.includes(`Torkontrolle: ${w.name}`));assert.ok(!ui.run(`hudData.alerts.some(x=>x.key==='yw:${a.id}')`),'Meldung endet mit Kontrolle');
 press(ui,{panel:'staff'});const c=card(body(ui),w.name);assert.ok(c.includes(`Torkontrolle ${a.plate}`));assert.ok(c.includes(`data-arrival="${a.id}"`));
});
