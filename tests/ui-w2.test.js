// Welle 2b (A10): Vertragskarten mit Einheit und Strafsätzen, angefallene Strafen, Abrechnung wartet, Torbuch mit Einheit,
// Stapler-Wartegründen und Stapler-Bindung, Staplerplatz im Build-Tray und in der Objektakte, Glocke (Akku, Palettenvertrag
// ohne Ausstattung, drohende Strafe), Finanzen (Vertragsstrafe), Handbuch. Echte Fachmodule; Eingriffe in den Zustand sind
// je Test benannt (Fristen vorziehen, Akku/Strom setzen) und betreffen nur Ausgangslagen, keine Buchungen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
import {TERMS,OFFER_INTERVAL,OFFER_PHASE} from '../dist/contracts.js';
import {hubProbe} from './ui-hub-probe.js';

const text=(ui,id)=>ui.nodes.get('#'+id).textContent;
const body=ui=>ui.nodes.get('#panelBody').innerHTML;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
async function load(sim){const ui=await boot();await ui.click('start');
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');return ui;}
const alerts=ui=>JSON.parse(ui.run('JSON.stringify(hudData.alerts)'));
const until=(ui,cond,max=4000)=>assert.equal(ui.run(`(()=>{let i=0;while(!(${cond})&&i++<${max})sim.step(1);render(true);return !!(${cond});})()`),true,'Bedingung nicht erreicht: '+cond);

/** Palettenstand: Dock, 2 Regale, Staplerplatz, 2 Lagerkräfte (durchgehend), Fahrer; Palettenangebot am Tag 1 (contracts.js). */
function palletSim({forklift=true}={}){
 const sim=new Simulation({mode:'sandbox',seed:5}),s=sim.state;
 for(const c of [{type:'build',buildingType:'dock',x:2,y:10,rotation:0},{type:'build',buildingType:'rack',x:2,y:2,rotation:0},{type:'build',buildingType:'rack',x:5,y:2,rotation:0},{type:'hire',role:'warehouse'},{type:'hire',role:'warehouse'},{type:'hire',role:'driver'}])ok(sim,c);
 if(forklift)ok(sim,{type:'build',buildingType:'forklift',x:12,y:2,rotation:0});
 for(const w of s.workers)w.shift='all'; // Ausgangslage: Schicht durchgehend, damit die Ankunft sofort bedient wird.
 sim.step(OFFER_PHASE+OFFER_INTERVAL-480);
 return sim;
}

test('Vertragskarte Paletten: Einheit, Preis je Palette, Strafsätze, Hinweis Staplerplatz + Lkw; Glocke bis Lkw vorhanden',async()=>{
 const sim=palletSim(),p=sim.state.contracts.find(k=>k.status==='offer'&&k.unit==='pallet');assert.ok(p,'Palettenangebot');
 const ui=await load(sim);press(ui,{panel:'contracts'});
 const card=body(ui).slice(body(ui).indexOf(`data-contract="${p.id}"`));
 const perDay=p.arrivals.reduce((n,a)=>n+a.parcels,0);
 assert.ok(card.includes(`<b>${perDay}</b><small>Paletten / Tag`));assert.match(card,/Preis \/ Palette/);
 assert.ok(card.includes(`${TERMS.penalty.pallet.late} € je verspäteter Palette`),'Verspätungssatz');
 assert.ok(card.includes(`${TERMS.penalty.pallet.open} € je liegengebliebener Palette bei Vertragsende`),'Satz bei Vertragsende');
 assert.match(card,/Palettenvertrag:<\/b> Entladen nur mit Staplerplatz \(Stapler\) und Lagerkraft, Zustellung nur mit Lkw/);
 assert.match(card,/Fehlt am Standort: Lkw\./);assert.doesNotMatch(card,/Fehlt am Standort: Staplerplatz/);
 assert.ok(card.includes(`(${p.arrivals[0].parcels} Paletten)`),'Ankunft mit Einheit');
 assert.ok(!alerts(ui).some(a=>a.key==='pk:'+p.id),'Angebot allein meldet nichts');
 ui.click('acceptContract',p.id);assert.equal(ui.run(`sim.state.contracts.find(c=>c.id==='${p.id}').status`),'active');
 const pk=alerts(ui).find(a=>a.key==='pk:'+p.id);assert.ok(pk,'Glocke: Palettenvertrag ohne Lkw');assert.equal(pk.tone,'bad');assert.match(pk.title,/· Lkw fehlt$/);
 assert.match(body(ui),/Angefallene Strafen<\/span><b>0 €/);
 press(ui,{alert:'pk:'+p.id});assert.equal(ui.run('panel'),'contracts');
 ui.submit('vehicle',{vehicleType:'truck'});assert.equal(ui.run("sim.state.vehicles.filter(v=>v.type==='truck').length"),1);ui.run('render(true)');
 assert.ok(!alerts(ui).some(a=>a.key==='pk:'+p.id),'mit Lkw keine Meldung');
 press(ui,{panel:'contracts'});assert.doesNotMatch(body(ui),/Fehlt am Standort/);
});

test('Palettenvertrag ohne Staplerplatz: Karte nennt beides, Glocke „Staplerplatz und Lkw fehlen“, Bau-Knopf',async()=>{
 const sim=palletSim();const p=sim.state.contracts.find(k=>k.status==='offer'&&k.unit==='pallet');ok(sim,{type:'acceptContract',id:p.id});
 const fork=sim.state.buildings.find(b=>b.type==='forklift');sim.state.buildings.splice(sim.state.buildings.indexOf(fork),1); // Ausgangslage: Staplerplatz fehlt
 const ui=await load(sim);
 const pk=alerts(ui).find(a=>a.key==='pk:'+p.id);assert.ok(pk);assert.match(pk.title,/Staplerplatz und Lkw fehlen$/);
 press(ui,{panel:'contracts'});assert.match(body(ui),/Fehlt am Standort: Staplerplatz und Lkw\./);assert.match(body(ui),/data-action="build" data-id="forklift"/);
 ui.click('build','forklift');assert.equal(ui.run('build'),'forklift');
});

test('Torbuch Paletten: Einheit, Stapler-Bindung, Tempo; Personal „Paletten“; Objektakte mit Akku und Tätigkeit; Anzeige ändert nichts',async()=>{
 const sim=palletSim(),p=sim.state.contracts.find(k=>k.status==='offer'&&k.unit==='pallet');ok(sim,{type:'acceptContract',id:p.id});
 const ui=await load(sim);
 until(ui,"sim.state.yard.some(a=>a.item==='pallet'&&a.phase==='unloading'&&a.unloaded>=2)");
 const a=JSON.parse(ui.run("JSON.stringify(sim.state.yard.find(a=>a.item==='pallet'&&a.phase==='unloading'))")),fork=JSON.parse(ui.run("JSON.stringify(sim.state.buildings.find(b=>b.type==='forklift'))"));
 assert.equal(fork.task,`${a.id}:forklift`);const w=JSON.parse(ui.run(`JSON.stringify(sim.state.workers.find(w=>w.task==='${a.id}:warehouse'))`));assert.ok(w);
 const before=ui.run('sim.serialize()');
 press(ui,{panel:'yard'});const yard=body(ui);
 assert.match(yard,/<th class="num">Menge<\/th>/);
 assert.ok(yard.includes(`${a.unloaded} / ${a.parcels} Paletten<br><small class="muted crew">${w.name} · 1 Paletten/min · Stapler 1 · Akku ${String(fork.charge).replace('.',',')} %</small>`),'Einheit + Stapler-Bindung');
 assert.match(yard,/<h3>Stapler<\/h3>/);assert.ok(yard.includes(`Entlädt ${a.plate} (${a.unloaded}/${a.parcels} Paletten)`));assert.match(yard,/role="meter" aria-label="Stapler-Akku"/);
 press(ui,{panel:'staff'});assert.ok(body(ui).includes(`Entlädt ${a.plate} mit Stapler (${a.unloaded}/${a.parcels} Paletten, 1/min)`),'describeAssignment mit Einheit');assert.doesNotMatch(body(ui),/Paletten Pakete|\/\d+ Pakete, /);
 ui.run(`selected='${fork.id}'`);press(ui,{panel:'detail'});const akte=body(ui);
 assert.match(akte,/<span>Akku<\/span><b>\d+(,\d)? %<\/b>/);assert.match(akte,new RegExp(`aria-valuenow="${Math.round(fork.charge)}"`));
 assert.match(akte,/<span class="chip tone-move">Im Einsatz<\/span>/);assert.ok(akte.includes(`Entlädt ${a.plate}`));assert.match(akte,new RegExp(`data-arrival="${a.id}"`));
 assert.match(akte,/Unter 10 % nicht einsatzbereit/);
 for(const panel of ['contracts','yard','finance','help'])press(ui,{panel});ui.run('render(true)');
 assert.equal(ui.run('sim.serialize()'),before,'Anzeige ohne Zustandsänderung');
});

test('Wartegründe Stapler: „Stapler lädt“ mit Akku, Glocke Akku < 20 %, „Kein Strom für Stapler“, „Kein Stapler“ mit Bau-Knopf',async()=>{
 const sim=palletSim(),p=sim.state.contracts.find(k=>k.status==='offer'&&k.unit==='pallet');ok(sim,{type:'acceptContract',id:p.id});
 const ui=await load(sim);
 until(ui,"sim.state.yard.some(a=>a.item==='pallet'&&a.phase==='unloading'&&a.unloaded>=1)");
 const fk="sim.state.buildings.find(b=>b.type==='forklift')";
 ui.run(`${fk}.charge=18`);ui.run('render(true)');
 let fa=alerts(ui).find(a=>a.key.startsWith('fk:'));assert.ok(fa,'Akku unter 20 %');assert.equal(fa.tone,'wait');assert.match(fa.title,/^Stapler-Akku 18 %$/);
 ui.run(`${fk}.charge=5`);ui.run('sim.step(1)');ui.run('render(true)'); // Ausgangslage: Akku leer
 const a=()=>JSON.parse(ui.run("JSON.stringify(sim.state.yard.find(a=>a.item==='pallet'&&a.phase==='unloading'))"));
 assert.equal(a().waitReason,'Stapler lädt');fa=alerts(ui).find(x=>x.key.startsWith('fk:'));assert.equal(fa.tone,'bad');assert.match(fa.sub,/Nicht einsatzbereit/);
 press(ui,{panel:'yard'});assert.match(body(ui),/Stapler lädt<br><small class="muted">Akku \d+ % · einsatzbereit ab 10 %<\/small>/);
 assert.match(body(ui),/Lädt · nicht einsatzbereit/);
 ui.run(`${fk}.charge=100;sim.state.sites.find(x=>x.id===sim.state.selectedSite).energy=-50`);ui.run('sim.step(1)');ui.run('render(true)'); // Ausgangslage: Strom fehlt
 assert.equal(a().waitReason,'Kein Strom für Stapler');press(ui,{panel:'yard'});assert.match(body(ui),/Kein Strom für Stapler<br><small class="muted">Energieversorgung am Standort ausbauen/);
 assert.match(body(ui),/<span class="chip tone-bad">Kein Strom<\/span>/);
 ui.run(`sim.state.sites.find(x=>x.id===sim.state.selectedSite).energy=50;sim.state.buildings.splice(sim.state.buildings.indexOf(${fk}),1)`);ui.run('sim.step(1)');ui.run('render(true)'); // Ausgangslage: Staplerplatz entfernt
 assert.equal(a().waitReason,'Kein Stapler');press(ui,{panel:'yard'});assert.match(body(ui),/Kein Stapler<br><small class="muted">Staplerplatz fehlt<\/small> <button class="" data-action="build" data-id="forklift">Staplerplatz bauen/);
});

test('Build-Tray: Staplerplatz mit Icon',async()=>{
 const ui=await boot();await ui.click('start');ui.click('build','forklift');
 assert.match(ui.nodes.get('#buildItems').innerHTML,/data-build="forklift" class="active"><i>⇈<\/i><b>Staplerplatz<\/b>/);
});

test('Paketvertrag: Strafsätze 1,50 € / 4 €, angefallene Strafen aus Journal, Finanzen „Vertragsstrafe“, drohende Strafe in der Glocke, Abrechnung wartet',async()=>{
 const {sim,ids}=hubProbe(Simulation);const s=sim.state,c=s.contracts.find(k=>k.id===ids.contract);
 assert.equal(c.penaltyLate,1.5);assert.equal(c.penaltyOpen,4);
 const ui=await load(sim);press(ui,{panel:'contracts'});
 assert.ok(body(ui).includes('1,50 € je verspätetem Paket · 4 € je liegengebliebenem Paket bei Vertragsende'));assert.match(body(ui),/Pakete \/ Tag/);assert.match(body(ui),/Preis \/ Paket/);
 assert.doesNotMatch(body(ui),/Palettenvertrag/);
 // Drohende Strafe: Ausgangslage Frist eines Auftrags in 30 Minuten.
 const o=ids.orders[0];ui.run(`sim.state.orders.find(o=>o.id==='${o}').due=sim.state.t+30`);ui.run('render(true)');
 const pd=alerts(ui).find(a=>a.key==='pd:'+c.id);assert.ok(pd,'Strafe droht');assert.match(pd.title,/^Strafe droht · /);assert.match(pd.sub,/Pakete offen, fällig \d\d:\d\d \(30 Min\.\) · 1,50 € je verspäteter Einheit, bis /);
 // Verspätete Zustellung über echte Fachmodule: Frist vorbei, Lieferung mit Lieferwagen.
 until(ui,`sim.state.batches.some(b=>b.owner==='${o}'&&b.location==='stock'&&b.qty>=10)`);
 ui.run(`sim.state.orders.find(o=>o.id==='${o}').due=sim.state.t-1`);
 ui.submit('dispatch',{vehicleId:ui.run("sim.state.vehicles[0].id"),qty:'10'},o);
 assert.equal(ui.run("sim.state.shipments.length"),1,ui.nodes.get('#toast').textContent);
 until(ui,"sim.state.ledger.some(l=>l.key.startsWith('penalty:'))");
 assert.ok(!alerts(ui).some(a=>a.key==='pd:'+c.id&&/fällig.*\(-/.test(a.sub)),'nur künftige Fristen');
 const sum=ui.run(`sim.state.ledger.filter(l=>/^penalty(-open)?:/.test(l.key)&&l.refs.includes('${c.id}')).reduce((n,l)=>n+l.amount,0)`);assert.equal(sum,-15);
 press(ui,{panel:'contracts'});assert.match(body(ui),/Angefallene Strafen<\/span><b><span class="money-minus">-15 €<\/span> · 1 Buchung</);assert.match(body(ui),/1 Buchung/);
 press(ui,{panel:'finance'});assert.match(body(ui),/<span>Vertragsstrafe<\/span><b><span class="money-minus">-15 €<\/span>/);assert.match(body(ui),/<span>Vertragsstrafen<\/span><b><span class="money-minus">-15 €<\/span> · 1 Buchung/);
 // Abrechnung wartet: Vertrag kündigen, kurz vor Abrechnung abfahren (Ware unterwegs).
 ui.click('cancelContract',c.id);ui.click('confirmOk');
 const endT=ui.run(`sim.state.contracts.find(k=>k.id==='${c.id}').endT`);press(ui,{panel:'contracts'});
 assert.ok(body(ui).includes('Abrechnung offener Mengen'),'Termin der Abrechnung');
 until(ui,`sim.state.t>=${endT+TERMS.penalty.openGrace-3}&&sim.state.vehicles[0].status==='idle'`);
 const o2=ui.run(`sim.state.orders.find(o=>o.contractId==='${c.id}'&&o.status==='active'&&sim.state.batches.some(b=>b.owner===o.id&&b.location==='stock'&&b.qty>0)).id`);
 ui.submit('dispatch',{vehicleId:ui.run("sim.state.vehicles[0].id"),qty:'5'},o2);ui.run('sim.step(4)');ui.run('render(true)');
 assert.equal(ui.run(`sim.state.orders.find(o=>o.id==='${o2}').settleWait`),'Ware unterwegs');
 press(ui,{panel:'contracts'});assert.match(body(ui),/Abrechnung wartet<\/span><b><span class="money-minus">[^<]*Ware unterwegs/);
});

test('Finanzen: Kategorie Vertragsstrafe mit aktivem Vertrag auch bei 0 € sichtbar; Handbuch mit Paletten und Vertragsstrafen',async()=>{
 const {sim}=hubProbe(Simulation);const ui=await load(sim);
 press(ui,{panel:'finance'});assert.match(body(ui),/<span>Vertragsstrafe<\/span><b><span class="money-plus">0 €<\/span>/);assert.match(body(ui),/<span>Vertragsstrafen<\/span><b><span class="">0 €<\/span> · 0 Buchungen/);
 press(ui,{panel:'help'});const h=body(ui);
 assert.match(h,/Paletten und Stapler/);assert.match(h,/Kein Strom für Stapler/);assert.match(h,/Vertragsstrafen/);assert.match(h,/Paket 1,50 €, Palette 8 €/);assert.match(h,/Paket 4 €, Palette 20 €/);assert.match(h,/Abrechnung wartet/);
});
