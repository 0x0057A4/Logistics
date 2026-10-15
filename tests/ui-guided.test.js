import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boot} from './ui-harness.js';
import {VEHICLES,ITEMS} from '../dist/catalog.js';
// A02 W1b: Geführter Einstieg Logistik. Reihenfolge der Missionen folgt dem ersten Hub-Kreislauf; jeder Schritt wird
// über reguläre Befehle erfüllt (kein Eingriff in den Zustand). Fertigung ist nicht Teil des Einstiegs.
const text=(ui,id)=>ui.nodes.get('#'+id).textContent;
const mission=ui=>{ui.run('render(true)');const a=ui.nodes.get('#missionAction');return {title:text(ui,'missionTitle'),no:text(ui,'missionNumber'),panel:a.dataset.panel,action:a.dataset.action,id:a.dataset.id};};
const until=(ui,cond,max=2000)=>{for(let i=0;i<max&&!ui.run(cond);i++)ui.run('sim.step(1)');assert.equal(ui.run(cond),true,cond);};
const send=(ui,c)=>{const r=ui.run(`send(${JSON.stringify(c)},true)`);assert.equal(r.ok,true,c.type+': '+r.message);};

test('Geführter Einstieg: Dock → Lagerkraft → Vertrag → Entladen → Fahrer + Lieferwagen → Zustellung → Zahlung → Sortierplatz (optional)',async()=>{
 const ui=await boot();await ui.click('start');
 assert.equal(ui.run('sim.state.mode'),'guided');assert.equal(ui.run('sim.state.money'),85000);
 const titles=JSON.parse(ui.run('JSON.stringify(requirements().map(r=>r.title))'));
 assert.deepEqual(titles,['Laderampe bauen','Lagerkraft einstellen','Ersten Frachtvertrag annehmen','Ersten Lkw entladen','Fahrer und Lieferwagen','Zustellung starten','Zahlung erhalten','Sortierplatz bauen (optional)']);
 assert.ok(!titles.some(t=>/Produktion|Fertig|Leuchte|Material/.test(t)),'keine Fertigungsschritte im Einstieg');
 let m=mission(ui);assert.equal(m.title,'Laderampe bauen');assert.equal(m.no,'01');assert.equal(m.action,'build');assert.equal(m.id,'dock');
 send(ui,{type:'build',buildingType:'dock',x:3,y:11,rotation:0});
 m=mission(ui);assert.equal(m.title,'Lagerkraft einstellen');assert.equal(m.panel,'staff');
 send(ui,{type:'hire',role:'warehouse'});
 m=mission(ui);assert.equal(m.title,'Ersten Frachtvertrag annehmen');assert.equal(m.panel,'contracts');
 const c=ui.run('sim.state.contracts[0].id');ui.click('acceptContract',c);
 m=mission(ui);assert.equal(m.title,'Ersten Lkw entladen');assert.equal(m.panel,'yard');
 until(ui,"sim.state.yard.some(a=>a.unloaded>0)");
 m=mission(ui);assert.equal(m.title,'Fahrer und Lieferwagen');assert.equal(m.panel,'staff');
 send(ui,{type:'hire',role:'driver'});
 m=mission(ui);assert.equal(m.title,'Fahrer und Lieferwagen');assert.equal(m.panel,'fleet','mit Fahrer weiter zum Fahrzeugkauf');
 send(ui,{type:'buyVehicle',vehicleType:'van'});
 m=mission(ui);assert.equal(m.title,'Zustellung starten');assert.equal(m.panel,'orders');
 // Erster vollständig sortierter Vertragsauftrag wird mit dem Lieferwagen zugestellt.
 const ready="sim.state.orders.find(o=>o.source==='hub'&&o.status==='active'&&sim.state.batches.filter(b=>b.item==='parcel'&&b.location==='stock'&&b.owner===o.id).reduce((n,b)=>n+b.qty-b.reserved,0)>=o.qty)";
 until(ui,`!!${ready}`);
 // Startvertrag ab W1c 200–250 Pakete: ein Gebiet kann mehr Pakete haben, als der Lieferwagen fasst (160 nach Gewicht) → Teilmenge.
 const o=ui.run(`${ready}.id`),qty=Math.min(ui.run(`${ready}.qty`),Math.floor(VEHICLES.van.weightCapacity/ITEMS.parcel.weight));
 send(ui,{type:'dispatch',orderId:o,vehicleId:ui.run('sim.state.vehicles[0].id'),qty});
 m=mission(ui);assert.equal(m.title,'Zahlung erhalten');assert.equal(m.panel,'finance');
 until(ui,`sim.state.orders.find(x=>x.id==='${o}').paid>0`);
 m=mission(ui);assert.equal(m.title,'Sortierplatz bauen (optional)');assert.equal(m.action,'build');assert.equal(m.id,'sorter');
 send(ui,{type:'build',buildingType:'sorter',x:8,y:6,rotation:0});
 m=mission(ui);assert.equal(m.no,'✓');assert.equal(m.title,'Erster Kreislauf geschlossen.');
});

test('Startbetrieb richtet Depot-Grundausstattung über reguläre Befehle ein; Einstieg springt zum Vertrag',async()=>{
 const ui=await boot();await ui.click('start');ui.run("openPanel('overview')");
 assert.match(ui.nodes.get('#panelBody').innerHTML,/Startbetrieb einrichten · ca\. 14\.500 €/);
 const ledger=ui.run('sim.state.ledger.length');ui.click('starter');
 assert.equal(ui.run('sim.state.money'),85000-14500);
 assert.deepEqual(JSON.parse(ui.run("JSON.stringify(sim.state.ledger.slice("+ledger+").map(l=>l.category))")),['construction','construction','personal','personal','Fuhrpark'],'jede Anschaffung einzeln gebucht');
 const m=mission(ui);assert.equal(m.title,'Ersten Frachtvertrag annehmen');assert.equal(ui.run('panel'),'contracts');
 assert.equal(ui.run("sim.state.buildings.some(b=>['assembly','testing','packing'].includes(b.type))"),false,'keine Fertigung im Startbetrieb');
});

test('Startbetrieb ohne ausreichendes Kapital bricht ohne Teilkauf darüber hinaus ab',async()=>{
 const ui=await boot();await ui.click('start');ui.run("sim.state.money=4000");ui.click('starter');
 // Dock (3.500 €) passt, Regal (1.200 €) nicht mehr: Abbruch, kein Personal, kein Fahrzeug.
 assert.equal(ui.run("sim.state.buildings.map(b=>b.type).join()"),'dock');assert.equal(ui.run('sim.state.workers.length'),0);assert.equal(ui.run('sim.state.vehicles.length'),0);
 assert.ok(ui.run('sim.state.money')>=0);
});

test('Willkommensdialog und Handbuch beschreiben das Logistikunternehmen; Fertigung nur als späteres Geschäftsfeld',async()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),welcome=html.slice(html.indexOf('<dialog id="welcome"'),html.indexOf('</dialog>',html.indexOf('<dialog id="welcome"')));
 assert.match(welcome,/Logistikunternehmen/);assert.match(welcome,/Frachtvertrag/);assert.doesNotMatch(welcome,/Produktionslinie|Arbeitsleuchte/);
 const ui=await boot();await ui.click('start');ui.run("openPanel('help')");const help=ui.nodes.get('#panelBody').innerHTML;
 assert.match(help,/Erste Zustellung/);assert.match(help,/Mehrwertdienste \(später\)/);assert.doesNotMatch(help,/acht verpackte Leuchten/);
});
