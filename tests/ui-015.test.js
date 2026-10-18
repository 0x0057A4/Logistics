// 0.15 (A10): Oberfläche für GuV & Anlagen, Warenarten (Kühlpaket/Sperrgut), Quergurtsorter (Mega-Hub) und Mehrwertdienste.
// Echte Fachmodule (accounting.js, contracts.js, yard.js, sorting.js, management.js, economy.js) über den UI-Harness.
// Eingriffe in die Ausgangslage sind je Test benannt. Die Oberfläche bucht weder Geld noch Ware: geprüft über Zustandsvergleich.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
import {report,periods} from '../dist/accounting.js';
import {wareOf} from '../dist/contracts.js';
import {WAIT as YARD_WAIT} from '../dist/yard.js';

const SITE='site-1';
const body=ui=>ui.nodes.get('#panelBody').innerHTML;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const euroDe=v=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(v)+' €';
async function load(sim){const ui=await boot();await ui.click('start');
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');ui.run('flushHud(true)');return ui;}
/** Zustand, den die Oberfläche nie verändern darf (Geld, Journal, Bestände, Anlagen). */
const frozen=ui=>ui.run('JSON.stringify({m:sim.state.money,l:sim.state.ledger.length,b:sim.state.batches.map(b=>[b.id,b.qty,b.location]),d:sim.state.assetDisposals||null,t:sim.state.t})');

test('GuV & Anlagen: Tab, Zeiträume, GuV-Werte aus report(), Anlagenspiegel und Abgang nach Abriss, keine Buchung',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:7});
 const dock=ok(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0}).id;ok(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 const rack2=ok(sim,{type:'build',buildingType:'rack',x:6,y:2,rotation:0}).id;ok(sim,{type:'buyVehicle',vehicleType:'van'});
 ok(sim,{type:'hire',role:'warehouse'});
 sim.step(3*1440);ok(sim,{type:'demolish',id:rack2});sim.step(30);
 const ui=await load(sim),before=frozen(ui);
 ui.run("openPanel('finance')");
 assert.match(body(ui),/Zahlungen &amp; Journal/);assert.match(body(ui),/GuV &amp; Anlagen/);assert.match(body(ui),/Buchungsjournal/,'Standard-Tab bleibt Zahlungsübersicht');
 press(ui,{action:'financeTab',id:'guv'});
 let h=body(ui);
 for(const t of ['Gewinn- und Verlustrechnung','Anlagenspiegel','Abgänge im Zeitraum','Umsatzerlöse gesamt','EBITDA','Abschreibung','Betriebsergebnis (EBIT)','Zinsen','Ergebnis','Abstimmung','stimmt mit dem Ergebnis überein','Laderampe','Lieferwagen','Kum. Abschreibung','Buchwert'])assert.ok(h.includes(t),'fehlt: '+t);
 assert.match(h,/aria-selected="true"[^>]*data-id="week"/,'Standardzeitraum 7 Tage');
 const s=ui.run('sim.state'),ps=periods(s);
 for(const k of ['today','week','total']){
  press(ui,{action:'guvPeriod',id:k});h=body(ui);const g=report(s,ps[k]).guv,a=report(s,ps[k]).assets;
  assert.match(h,new RegExp(`aria-selected="true"[^>]*data-id="${k}"`));
  assert.ok(h.includes(euroDe(g.result)),`${k}: Ergebnis ${g.result}`);assert.ok(h.includes(euroDe(g.depreciation)),`${k}: Abschreibung ${g.depreciation}`);
  assert.ok(h.includes(euroDe(a.total.bookValue)),`${k}: Buchwert gesamt`);
  assert.ok(g.depreciation<0,'Abschreibung im Zeitraum vorhanden');
 }
 // Abriss am Tag 4 liegt in allen drei Zeiträumen: Abgang mit Restbuchwert.
 assert.match(h,/Abgänge im Zeitraum<\/h3><span class="badge ">1<\/span>/);assert.ok(h.includes(rack2));
 const disp=report(s,ps.total).assets.disposals[0];assert.ok(h.includes(euroDe(-disp.bookValue)),'Restbuchwert als Abgang');
 // Akte: Buchwert mit Sprung in den Anlagenspiegel.
 ui.run(`selected='${dock}';openPanel('detail')`);assert.match(body(ui),/Buchwert/);assert.match(body(ui),/data-action="openGuv"/);
 press(ui,{action:'openGuv',id:''});assert.equal(ui.run('panel'),'finance');assert.match(body(ui),/Anlagenspiegel/);
 // Befehlspalette findet GuV.
 assert.ok(ui.run("paletteHits('guv').some(h=>h.title==='GuV & Anlagen')"));
 assert.equal(frozen(ui),before,'Oberfläche bucht nichts');
});

/** Hub mit Dock, Regal und 2 Lagerkräften ganztägig; optional Kühllager bzw. Staplerplatz. Läuft bis zum ersten Warenangebot. */
function wareHub({cold=false,fork=false}={}){
 const sim=new Simulation({mode:'sandbox',seed:13}),s=sim.state;
 ok(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});ok(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 if(cold)ok(sim,{type:'build',buildingType:'coldstore',x:8,y:2,rotation:0});
 if(fork)ok(sim,{type:'build',buildingType:'forklift',x:12,y:10,rotation:0});
 for(let i=0;i<2;i++){const id=ok(sim,{type:'hire',role:'warehouse'}).id;ok(sim,{type:'setShift',id,shift:'all'});}
 for(let i=0;i<3000&&!s.contracts.some(k=>wareOf(k));i++)sim.step(1);
 const k=s.contracts.find(k=>wareOf(k));assert.ok(k,'Warenangebot');return {sim,s,k};
}

test('Warenarten: Kühlpaket-Vertrag mit Zuschlag/Einheit/Fehlausstattung, Torbuch und Kühlstation, Wartegrund Kühllager',async()=>{
 const {sim,s,k}=wareHub({cold:true});
 assert.equal(wareOf(k),'parcel_cold');
 let ui=await load(sim);ui.run("openPanel('contracts')");let h=body(ui);
 for(const t of ['Kühlpaket','Kühlzuschlag','im Preis enthalten','Kühlpakete / Tag','Preis / Kühlpaket','Einheit: Kühlpakete','Fehlt am Standort: Kühlfahrzeug','Zustellung nur mit Kühlfahrzeug'])assert.ok(h.includes(t),'Vertrag: '+t);
 assert.ok(!h.includes('Fehlt am Standort: Kühllager'),'Kühllager vorhanden');
 assert.match(h,/verspätetem Kühlpaket/);
 // Annahme über die echte Oberfläche, dann bis der Kühl-Lkw entlädt.
 press(ui,{action:'acceptContract',id:k.id});assert.equal(ui.run(`sim.state.contracts.find(c=>c.id==='${k.id}').status`),'active');
 const got=ui.run(`(()=>{for(let i=0;i<3000;i++){const a=sim.state.yard.find(a=>a.item==='parcel_cold'&&a.unloaded>0);if(a)return a.id;sim.step(1);}return null;})()`);
 assert.ok(got,'Kühl-Lkw entlädt');ui.run('hudPending=true;flushHud(true);render(true)');
 ui.run("openPanel('yard')");h=body(ui);
 assert.match(h,/Kühlpakete<\/td>|Kühlpakete<br>|Kühlpakete</);assert.match(h,/ware-chip">Kühlpaket</);assert.match(h,/nur Kühllager, Kühlfahrzeug/);
 // Station „Kühlpakete“ im Standortfluss sichtbar, Zahlen aus sorting.summary.
 assert.equal(ui.nodes.get('#stl-cold').hidden,false);
 const sum=ui.run(`sortSummary(sim.state,'${SITE}').cold`);
 assert.equal(ui.nodes.get('#st-cold-n').textContent,new Intl.NumberFormat('de-DE').format(sum.inbound+sum.stock));
 assert.ok(sum.sortable);
 // Wartegrund „Kühllager voll/fehlt“ mit Handlungshinweis (Fixture: Wartegrund am Hofeintrag gesetzt).
 ui.run(`(()=>{const a=sim.state.yard.find(a=>a.id==='${got}');a.waitReason=${JSON.stringify(YARD_WAIT.coldFull)};a.waitSince=sim.state.t;})()`);
 ui.run("renderPanel(true)");h=body(ui);
 assert.ok(h.includes(YARD_WAIT.coldFull));assert.match(h,/Kühlplätze belegt/);assert.match(h,/data-action="build" data-id="coldstore"/);
 ui.run(`(()=>{const a=sim.state.yard.find(a=>a.id==='${got}');a.waitReason=${JSON.stringify(YARD_WAIT.coldMissing)};})()`);
 ui.run("renderPanel(true)");assert.match(body(ui),/Kühlpakete nur ins Kühllager/);
 // Glocke: aktiver Kühlvertrag ohne Kühlfahrzeug.
 const alerts=JSON.parse(ui.run('hudPending=true;flushHud(true);JSON.stringify(hudData.alerts)'));
 assert.ok(alerts.some(a=>a.key==='wk:'+k.id&&/Kühlfahrzeug fehlt/.test(a.title)),'Glocke Kühlfahrzeug');
});

test('Warenarten: Sperrgut-Vertrag mit Staplerinfo, Lieferwagen-Grenze, Torbuch-Einheit und Staplerbindung',async()=>{
 const {sim,s,k}=wareHub({fork:true});
 assert.equal(wareOf(k),'bulky');
 const ui=await load(sim);ui.run("openPanel('contracts')");let h=body(ui);
 for(const t of ['Sperrgut','Sperrgut-Stück / Tag','Preis / Sperrgut-Stück','nie über Sortierplatz oder Quergurt','Lieferwagen fasst','Fehlt am Standort: Lkw'])assert.ok(h.includes(t),'Vertrag: '+t);
 assert.ok(!h.includes('<span>Kühlzuschlag</span>'),'kein Kühlzuschlag bei Sperrgut');
 press(ui,{action:'acceptContract',id:k.id});
 const got=ui.run(`(()=>{for(let i=0;i<3000;i++){const a=sim.state.yard.find(a=>a.item==='bulky'&&a.phase==='unloading'&&sim.state.workers.some(w=>w.task===a.id+':warehouse'));if(a)return a.id;sim.step(1);}return null;})()`);
 assert.ok(got,'Sperrgut-Lkw entlädt mit Lagerkraft');ui.run('hudPending=true;flushHud(true);render(true)');
 ui.run("openPanel('yard')");h=body(ui);
 assert.match(h,/Sperrgut-Stück/);assert.match(h,/ware-chip">Sperrgut</);assert.match(h,/Stapler, kein Sortierer/);
 assert.match(h,/Sperrgut-Stück\/min · Stapler 1/,'Entladetempo und Stapler');
 assert.match(h,/<h3>Stapler<\/h3>/,'Staplerbereich');
 // Personal: Tätigkeit nennt Stapler und Sperrgut.
 ui.run("openPanel('staff')");assert.match(body(ui),/mit Stapler \(\d+\/\d+ Sperrgut-Stück/);
});

test('Quergurtsorter: Baumenü gesperrt bis Forschung Mega-Hub, Akte mit Besetzung, Fehlwürfen und Nachsortierung',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:11}),s=sim.state;
 ok(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});ok(sim,{type:'build',buildingType:'rack',x:16,y:2,rotation:0});ok(sim,{type:'build',buildingType:'rack',x:16,y:4,rotation:0});
 ok(sim,{type:'build',buildingType:'research',x:15,y:12,rotation:0});ok(sim,{type:'hire',role:'research'});
 let ui=await load(sim);
 ui.run('startBuild()');let items=ui.nodes.get('#buildItems').innerHTML;
 assert.match(items,/data-build="crossbelt" class=" locked" aria-disabled="true"/);assert.match(items,/Forschung Mega-Hub nötig/);
 assert.ok(items.indexOf('data-build="crossbelt"')<items.indexOf('Mehrwertdienste / Fertigung'),'Quergurt in Gruppe Hub');
 ui.listeners.click({target:{closest:()=>({dataset:{build:'crossbelt'},matches:()=>false})}});
 assert.equal(ui.run('build'),null,'gesperrt: kein Bauwerkzeug');assert.match(ui.nodes.get('#toast').textContent,/Forschung Mega-Hub nötig/);
 ui.run("startBuild('crossbelt')");assert.equal(ui.run('build'),null,'auch über Befehl gesperrt');
 ui.run("endBuild();openPanel('research')");assert.match(body(ui),/Schaltet frei<\/span><b>Quergurtsorter/);
 // Echte Forschung über die Oberfläche starten und abschließen.
 press(ui,{action:'research',id:'megahub'});
 ui.run(`(()=>{for(let i=0;i<400&&!sim.state.research.some(r=>r.key==='megahub'&&r.status==='completed');i++)sim.step(1);})()`);
 ui.run('startBuild()');items=ui.nodes.get('#buildItems').innerHTML;
 assert.doesNotMatch(items,/data-build="crossbelt" class="[^"]*locked/);assert.match(items,/Quergurtsorter<\/b><small>120\.000 €/);ui.run('endBuild()');
 // Bauen über regulären Befehl, eine Lagerkraft (halbe Leistung), 240 Pakete im Eingang.
 const cb=ui.run(`sim.command({type:'build',buildingType:'crossbelt',x:8,y:2,rotation:0}).id`);assert.ok(cb);
 ui.run(`(()=>{const r=sim.command({type:'hire',role:'warehouse'});sim.command({type:'setShift',id:r.id,shift:'all'});sim.state.sites[0].energy=60;
  const c=sim.state.contracts[0];sim.command({type:'acceptContract',id:c.id});sim.command({type:'cancelContract',id:c.id});c.settled=true;
  const id=sim.api.id('order');sim.state.orders.push({id,kind:'logistics',source:'hub',contractId:c.id,lane:c.lanes[0].id,customer:'Nordbezirk (Test)',item:'parcel',qty:240,price:1,due:sim.state.t+3000,quality:0,site:'${SITE}',status:'active',delivered:0,paid:0});
  sim.api.inventory.add({item:'parcel',qty:240,site:'${SITE}',location:'inbound',owner:id});
  for(let i=0;i<8;i++)sim.step(1);})()`);
 const b=ui.run(`sim.state.buildings.find(b=>b.id==='${cb}')`),sm=ui.run(`sortSummary(sim.state,'${SITE}')`);
 assert.equal(b.crew,1);assert.equal(b.status,'working');assert.ok(sm.rejects>=1,'Fehlwurf entstanden');
 ui.run(`selected='${cb}';openPanel('detail')`);const h=body(ui);
 for(const t of ['Besetzung','1 / 2','halbe Leistung (1 Kraft)','Fehlwürfe heute','Fehlwürfe gesamt','Nachsortierung offen','1.200'])assert.ok(h.includes(t),'Akte: '+t);
 assert.ok(h.includes(`${sm.resort} Pakete`),'Nachsortierung aus sorting.summary');
 // Standortfluss: Quergurt zählt als Sortieranlage, Nachsortierung im Untertext.
 ui.run('hudPending=true;flushHud(true)');assert.match(ui.nodes.get('#st-sort-sub').textContent,/1\/1 Sortierplätze arbeitend/);
 if(sm.resort)assert.match(ui.nodes.get('#st-sort-sub').textContent,/Nachsortierung/);
});

test('Mehrwertdienste: Auftragsliste kennzeichnet Lohnfertigung, Kundenmaterial-Status und Vergütung; Akte zeigt Material',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:21});
 for(const [buildingType,x,y] of [['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11],['rack',2,4]])ok(sim,{type:'build',buildingType,x,y,rotation:0});
 for(const role of ['production','warehouse']){const id=ok(sim,{type:'hire',role}).id;ok(sim,{type:'setShift',id,shift:'all'});}
 let o=null;for(let i=0;i<3000&&!o;i++){o=sim.state.orders.find(o=>o.kind==='vas'&&o.status==='offer');if(!o)sim.step(1);}
 assert.ok(o,'Mehrwertdienst-Angebot');
 const ui=await load(sim);ui.run("openPanel('orders')");let h=body(ui);
 const card=h.slice(h.indexOf(`${o.id} · `)-400,h.indexOf(`${o.id} · `)+4000);
 for(const t of ['Mehrwertdienst · Lohnfertigung','badge vas','Vergütung / Stück','Vergütung gesamt','Kundenmaterial','liefert Kunde nach Annahme','nach Annahme'])assert.ok(card.includes(t),'Angebot: '+t);
 assert.ok(card.includes(euroDe(o.qty*o.price)),'Vergütung gesamt = Menge × Preis');
 const before=ui.run('sim.state.money');
 press(ui,{action:'accept',id:o.id});assert.equal(ui.run(`sim.state.orders.find(x=>x.id==='${o.id}').status`),'active');
 h=body(ui);assert.match(h,/unterwegs/);assert.match(h,/Ankunft Tag/);
 ui.run(`(()=>{for(let i=0;i<600;i++){if(sim.state.purchases.filter(p=>p.orderId==='${o.id}').every(p=>p.status==='stored'))return;sim.step(1);}})()`);
 ui.run("renderPanel(true)");h=body(ui);
 assert.match(h,/vollständig geliefert/);assert.match(h,/chip tone-good">geliefert/);
 ui.run(`selected='${o.id}';openPanel('detail')`);h=body(ui);
 assert.match(h,/Auftragsart<\/span><b>Mehrwertdienst · Lohnfertigung/);assert.match(h,/Kundenmaterial/);
 assert.equal(ui.run('sim.state.money')<=before+1e-9,true,'kein Geld durch Anzeige oder Kundenmaterial');
});
