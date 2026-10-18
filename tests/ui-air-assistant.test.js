// Welle 3c-2 (A10): Luftexport und Dispositionsassistent in der Oberfläche. Vertragskarte Luftexport, Fenster „Luftexport“
// (Rail, X, Palette, Flüge mit Countdown, Luftpakete, Zubringer starten/stornieren, Strafen/Lagergeld), Fenster „Assistent“
// (Rail, J, Kopfzeilen-Schalter, Schalter, Tagesbudget, Protokoll mit Bezug), Fahrzeugleiste/Akte/Dock, Glocke, Paketreise,
// Replay-Sperre. Echte Fachmodule (contracts.js, airexport.js, assistant.js); Eingriffe in die Ausgangslage sind benannt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';

const body=ui=>ui.nodes.get('#panelBody').innerHTML;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
const key=(ui,k)=>ui.listeners.keydown({key:k,target:{matches:()=>false},preventDefault(){}});
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const alerts=ui=>JSON.parse(ui.run('hudPending=true;flushHud(true);JSON.stringify(hudData.alerts)'));
const st=(ui,k)=>ui.run(`sim.state.${k}`);
const step=(ui,n)=>ui.run(`sim.step(${n});hudPending=true;flushHud(true);render(true)`);
const until=(ui,cond,max=3000)=>assert.equal(ui.run(`(()=>{let i=0;while(!(${cond})&&i++<${max})sim.step(1);hudPending=true;flushHud(true);render(true);return !!(${cond});})()`),true,'Bedingung nicht erreicht: '+cond);
async function load(sim){const ui=await boot();await ui.click('start');
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');ui.run('flushHud(true)');return ui;}
const FLIGHT=1290,CUTOFF=90,FT=1440+FLIGHT; // Tag 2 21:30, Annahmeschluss 20:00

/** Hub wie tests/air-export.test.js: Dock, 2 Regale, 2 Lagerkräfte, Fahrer, Lkw. Läuft bis zum ersten Luftangebot (Tag 1, 23:00). */
function hub({truck=true}={}){
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state;
 ok(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});ok(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});ok(sim,{type:'build',buildingType:'rack',x:5,y:2,rotation:0});
 ok(sim,{type:'hire',role:'warehouse'});ok(sim,{type:'hire',role:'warehouse'});ok(sim,{type:'hire',role:'driver'});
 const truckId=truck?ok(sim,{type:'buyVehicle',vehicleType:'truck'}).id:null;
 if(!truck)s.t=3*1440+1300; // Ausgangslage ohne Fahrzeug: Spieltag 4 schaltet Luftangebote frei
 for(let i=0;i<3000&&!s.contracts.some(k=>k.unit==='air');i++)sim.step(1);
 const k=s.contracts.find(k=>k.unit==='air');assert.ok(k,'Luftangebot');return {sim,s,truck:truckId,k};
}
/** Fixture: Luftvertrag mit festem Flug 21:30 angenommen und gekündigt (keine weiteren Ankünfte), Abrechnung Vertragsende aus,
 *  Personal rund um die Uhr, Tag 2 10:00. Aufträge mit sortierter Ware direkt im Lager (wie air-export.test.js). */
function fixture(){
 const env=hub(),{sim,s,k}=env;k.flights=[FLIGHT];
 ok(sim,{type:'acceptContract',id:k.id});ok(sim,{type:'cancelContract',id:k.id});delete k.penaltyOpen;
 for(const w of s.workers)ok(sim,{type:'setShift',id:w.id,shift:'all'});
 sim.step(2040-s.t);return env;
}
function order(env,{qty,stock=qty,inbound=0,flightT=FT}){
 const {sim,s,k}=env,id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:'lane-1',customer:`Luftfracht (Testversand ${id})`,item:'parcel',qty,price:k.pricePerParcel,due:flightT-CUTOFF,quality:0,site:'site-1',status:'active',delivered:0,paid:0,airExport:true,flightT});
 if(stock)assert.ok(sim.api.inventory.add({item:'parcel',qty:stock,site:'site-1',owner:id,location:'stock',quality:100,unitCost:0}));
 if(inbound)assert.ok(sim.api.inventory.add({item:'parcel',qty:inbound,site:'site-1',owner:id,location:'inbound',quality:100,unitCost:0}));
 return id;
}

test('Vertragskarte Luftexport: Flugzeiten, Annahmeschluss, Preis, Strafe verpasster Flug, Zubringer-Hinweis (ohne Fahrzeug: fehlt)',async()=>{
 {const {sim,k}=hub();const ui=await load(sim);press(ui,{panel:'contracts'});
  const html=body(ui),card=html.slice(html.indexOf(`data-contract="${k.id}"`));
  assert.match(card,/ · Luftexport<\/small>/);
  const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  assert.ok(card.includes(`Flugzeiten</span><b>${k.flights.map(clock).join(' · ')} täglich · Frachtterminal Flughafen Heidmoor`),'Flugzeiten');
  assert.ok(card.includes(`<b>${k.cutoff} Min.</b><small>Annahmeschluss vor Abflug</small>`),'Kennzahl Annahmeschluss');
  assert.ok(card.includes(`Annahmeschluss</span><b>${k.cutoff} Min. vor Abflug · ${k.flights.map(m=>clock(m-k.cutoff)).join(' · ')} Uhr`));
  assert.match(card,/<small>Preis \/ Paket<\/small>/);assert.match(card,/Strafe verpasster Flug<\/span><b>3 € je Paket und verpasstem Flug · Weiterflug mit dem nächsten Flug/);
  assert.match(card,/<b>Luftexport:<\/b> Pakete werden am Hub angenommen und sortiert\. Ein eigener Zubringer/);assert.doesNotMatch(card,/Fehlt am Standort: Lkw oder Lieferwagen/);
  assert.doesNotMatch(card.slice(0,card.indexOf('</div></div>')),/Frist ab Tor/);
  ui.run('guard.dispose()');}
 {const {sim,k}=hub({truck:false});const ui=await load(sim);press(ui,{panel:'contracts'});
  const card=body(ui).slice(body(ui).indexOf(`data-contract="${k.id}"`));
  assert.match(card,/Fehlt am Standort: Lkw oder Lieferwagen/);assert.ok(card.includes('data-action="panel-fleet"'));ui.run('guard.dispose()');}
});

test('Fenster Luftexport: Rail/X/Palette, Flüge mit Countdown, Luftpakete, Zubringer starten → stornieren → erneut → Übergabe, Leiste/Akte/Dock/Paketreise',async()=>{
 const env=fixture(),{sim,truck}=env,o1=order(env,{qty:40,inbound:5});
 const ui=await load(sim);
 assert.equal(ui.nodes.get('#rail-air').hidden,false,'Rail sichtbar mit Luftvertrag');assert.equal(ui.nodes.get('#rail-assistant').hidden,false);
 key(ui,'x');assert.equal(ui.run('panel'),'air');assert.equal(ui.nodes.get('#panelTitle').textContent,'Luftexport');
 let html=body(ui);
 assert.ok(html.includes(`data-flight="${FT}"`),'Flug in „Nächste Flüge“');assert.match(html,/<b>21:30<\/b>/);assert.match(html,/20:00<br><span class="countdown">in 10 Std\.<\/span>/);
 assert.match(html,/40 sortiert · 5 unsortiert/);assert.ok(html.includes(`data-air-order="${o1}"`));assert.match(html,/45 ohne Zubringer/);
 assert.match(html,/<b>40<\/b><small>Luftpakete sortiert bereit<\/small>/);
 assert.ok(html.includes(`<option value="${truck}" selected>`),'Lkw wählbar');assert.ok(html.includes(`<option value="${FT}" selected>Tag 2 · 21:30 · Annahmeschluss 20:00 · 40 Pakete bereit</option>`));
 assert.match(html,/Ankunft Terminal ca\. Tag 2 · \d\d:\d\d · <span class="money-plus">vor Annahmeschluss<\/span>/);
 key(ui,'x');assert.equal(ui.run('panel'),'');
 assert.ok(ui.run("paletteHits('luftexport').some(h=>h.title==='Luftexport'&&/· X/.test(h.sub))"));assert.ok(ui.run("KEYS.some(k=>k[0]==='X')&&KEYS.some(k=>k[0]==='J')"));
 // Starten über das Formular (send → dispatchAirShuttle)
 key(ui,'x');await ui.submit('air',{vehicleId:truck,departAt:String(FT)});
 assert.equal(st(ui,'airShuttles.length'),1);let sh=st(ui,'airShuttles[0].id');assert.equal(st(ui,'airShuttles[0].qty'),40);
 html=body(ui);assert.ok(html.includes(`data-airshuttle="${sh}"`));assert.match(html,/Beladung/);assert.ok(html.includes(`data-action="cancelAirShuttle" data-id="${sh}"`));
 assert.match(html,/Ankunft Terminal \(ohne Wartezeiten\)<\/span><b>Tag 2 · \d\d:\d\d · <span class="money-plus">vor Annahmeschluss/);
 const row=()=>JSON.parse(ui.run(`JSON.stringify(hudData.vehicles.find(v=>v.id==='${truck}'))`));
 step(ui,1);assert.match(row().status,/^Luftzubringer → Terminal · Beladung/);assert.match(row().route,/→ Frachtterminal Heidmoor$/);
 press(ui,{panel:'yard'});assert.match(body(ui),/Luftzubringer<\/span><\/strong><small>airshuttle-\d+ · Beladung · Flug 21:30 · 40 Pakete/);
 // Storno vor Abfahrt
 press(ui,{panel:'air'});press(ui,{action:'cancelAirShuttle',id:sh});assert.equal(ui.nodes.get('#confirm').open,true);press(ui,{action:'confirmOk'});
 assert.equal(st(ui,`airShuttles.find(x=>x.id==='${sh}').status`),'cancelled');assert.equal(st(ui,`vehicles.find(v=>v.id==='${truck}').status`),'idle');
 // Erneut starten, Fahrt, Übergabe
 await ui.submit('air',{vehicleId:truck,departAt:String(FT)});sh=st(ui,"airShuttles.find(x=>x.status==='loading').id");
 until(ui,`sim.state.airShuttles.find(x=>x.id==='${sh}').status==='transit'`,60);
 assert.match(row().status,/^Luftzubringer → Terminal · Fahrt zum Terminal/);
 press(ui,{action:'select',id:truck});html=body(ui);assert.match(html,/Luftzubringer<\/span><b>airshuttle-\d+ · Fahrt zum Terminal · Flug 21:30 · 40 Pakete/);assert.ok(html.includes(`data-action="openRef" data-id="${sh}"`));
 press(ui,{action:'select',id:o1});html=body(ui);assert.match(html,/Paketreise · Luftexport/);assert.match(html,/Zubringer → Terminal Heidmoor<\/b><strong>40<\/strong><small>Fahrt zum Terminal · airshuttle-\d+ · Ankunft \d\d:\d\d vor Annahmeschluss/);
 assert.match(html,/Zubringer · Beladung<\/b><strong>5<\/strong><small>5 sortiert bereit · Annahmeschluss 20:00/,'nachsortierte Pakete warten auf den nächsten Zubringer');
 press(ui,{action:'select',id:sh});assert.equal(ui.run('panel'),'air','Verlauf-Verweis auf Zubringer öffnet Luftexport');
 press(ui,{action:'openRef',id:sh});assert.equal(ui.run('panel'),'air');assert.equal(ui.run('hubFocus'),sh);
 until(ui,`sim.state.airShuttles.find(x=>x.id==='${sh}').status==='returning'`,200);
 assert.ok(st(ui,`ledger.some(l=>l.key==='air:${sh}')`));assert.match(row().status,/^Luftzubringer → Terminal · Rückfahrt/);assert.match(row().route,/^Heidmoor → /);
 html=body(ui);assert.match(html,/Umsatz bei Übergabe<\/span><b>[\d.,]+ € · 1 Übergabe/);assert.match(html,/Fahrtkosten Zubringer<\/span><b><span class="money-minus">-[\d.,]+ €<\/span> · 1 Fahrt/);
 until(ui,`sim.state.airShuttles.find(x=>x.id==='${sh}').status==='complete'`,200);
 assert.match(body(ui),/Letzte Zubringer · 2/);
 ui.run('guard.dispose()');
});

test('Glocke: Annahmeschluss < 60 Min. mit Luftpaketen ohne Zubringer, verpasster Flug mit Strafe; Vertragskarte und Fenster zeigen Strafe',async()=>{
 const env=fixture(),{sim,k}=env,o1=order(env,{qty:30});
 const ui=await load(sim);
 assert.equal(alerts(ui).some(a=>a.key.startsWith('acut:')),false,'10 Std. vor Annahmeschluss keine Meldung');
 step(ui,FT-CUTOFF-59-st(ui,'t'));
 const a=alerts(ui).find(x=>x.key===`acut:site-1@${FT}`);assert.ok(a,'Glocke Annahmeschluss');assert.equal(a.tone,'bad');assert.equal(a.target,'air');
 assert.equal(a.title,'Annahmeschluss in 59 Min. · 30 Luftpakete ohne Zubringer');assert.match(a.sub,/^Flug 21:30 · Annahmeschluss 20:00/);
 key(ui,'x');assert.match(body(ui),/countdown tone-bad/);assert.match(body(ui),/Zubringer fehlt/);
 step(ui,60);
 const key2=`air-missed:${o1}:${FT}`;assert.ok(st(ui,`ledger.some(l=>l.key==='${key2}')`),'Strafe gebucht');
 const m=alerts(ui).find(x=>x.key===`amiss:${o1}:${FT}`);assert.ok(m,'Glocke verpasster Flug');assert.equal(m.tone,'bad');assert.match(m.title,/^Flug verpasst · /);assert.match(m.sub,/Flug 21:30 verpasst, 30 Pakete · -90 €/);
 assert.equal(alerts(ui).some(x=>x.key.startsWith('acut:')),false,'umgebucht: nächster Annahmeschluss weit weg');
 const html=body(ui);assert.match(html,/Strafe verpasster Flug<\/span><b><span class="money-minus">-90 €<\/span> · 1 Buchung/);assert.match(html,/1× verpasst/);
 press(ui,{panel:'contracts'});assert.ok(body(ui).slice(body(ui).indexOf(`data-contract="${k.id}"`)).includes('Verpasste Flüge</span><b><span class="money-minus">-90 €</span> · 1 Buchung'));
 ui.run(`ordersUi.expanded.add('${o1}')`);press(ui,{panel:'orders'});assert.match(body(ui),/<b>Luftexport:<\/b> Zustellung per Flughafen-Zubringer/);assert.ok(body(ui).includes('data-action="panel-air"'));
 step(ui,AIR_RECENT_TEST);assert.equal(alerts(ui).some(x=>x.key.startsWith('amiss:')),false,'Meldung verpasster Flug läuft nach 3 Std. aus');
 ui.run('guard.dispose()');
});
const AIR_RECENT_TEST=181;

test('Assistent: Kopfzeilen-Schalter, Rail/J/Palette, Schalter, Tagesbudget, abgelehnt (Glocke gebündelt), Protokoll mit Bezug',async()=>{
 const env=fixture(),{sim}=env;order(env,{qty:20});
 const ui=await load(sim);
 assert.equal(ui.nodes.get('#assistLabel').textContent,'Assistent aus');assert.equal(ui.nodes.get('#assistBtn').attributes['aria-pressed'],'false');
 press(ui,{action:'assistToggle'});ui.run('hudPending=true;flushHud(true)');
 assert.equal(st(ui,"assistant.sites['site-1'].enabled"),true);assert.equal(ui.nodes.get('#assistLabel').textContent,'Assistent an');assert.equal(ui.nodes.get('#assistBtn').attributes['aria-pressed'],'true');
 key(ui,'j');assert.equal(ui.run('panel'),'assistant');assert.equal(ui.nodes.get('#panelTitle').textContent,'Dispositionsassistent');
 let html=body(ui);assert.match(html,/<b>Nutzt nur reguläre Befehle\.<\/b>/);assert.match(html,/Assistent an/);assert.match(html,/Noch keine Entscheidung/);
 assert.ok(html.includes('data-action="assistSwitch" data-id="gate" aria-pressed="true"'));
 press(ui,{action:'assistSwitch',id:'gate'});assert.equal(st(ui,"assistant.sites['site-1'].gate"),false);assert.ok(body(ui).includes('data-action="assistSwitch" data-id="gate" aria-pressed="false"'));
 assert.ok(ui.run("paletteHits('assistent').some(h=>h.title==='Assistent ausschalten')"));assert.ok(ui.run("paletteHits('assistent').some(h=>h.title==='Dispositionsassistent'&&/· J/.test(h.sub))"));
 // Budget 0 → Luftzubringer zurückgestellt (kurz vor Annahmeschluss < 3 h)
 await ui.submit('assistBudget',{dayBudget:'0'});assert.equal(st(ui,"assistant.sites['site-1'].budget"),0);assert.match(body(ui),/0 € \/ 0 €/);
 step(ui,FT-CUTOFF-175-st(ui,'t'));
 const log=JSON.parse(ui.run('JSON.stringify(sim.state.assistant.log)'));assert.ok(log.some(e=>e.kind==='blocked'),'zurückgestellt');assert.equal(st(ui,'airShuttles.length'),0);
 const b=alerts(ui).find(x=>x.key==='asb:site-1');assert.ok(b,'Glocke Assistent gebündelt');assert.equal(b.tone,'wait');assert.equal(b.target,'assistant');assert.match(b.title,/^Assistent: \d+ (Befehl|Befehle) abgelehnt oder zurückgestellt$/);assert.match(b.sub,/Tagesbudget/);
 html=body(ui);assert.match(html,/<span class="chip tone-wait">Abgelehnt<\/span>/);assert.match(html,/Zurückgestellt<\/h3>/);assert.match(html,/Flug 21:30/);
 // Budget aufheben → nach Sperrfrist startet der Assistent den Zubringer über den regulären Befehl
 await ui.submit('assistBudget',{dayBudget:''});assert.equal(st(ui,"assistant.sites['site-1'].budget"),null);assert.match(body(ui),/nur Kasse/);
 until(ui,"sim.state.airShuttles.length>0",80);
 const sh=st(ui,'airShuttles[0].id');html=body(ui);
 assert.match(html,/<span class="chip tone-move">Luftzubringer<\/span><\/td><td>Luftzubringer mit .* zum Flug 21:30 Uhr gestartet\.<\/td><td><small>Annahmeschluss Minute \d+ in \d+ Min\.<\/small>/);
 assert.ok(html.includes(`data-action="openRef" data-id="${sh}"`),'Bezug klickbar');
 press(ui,{action:'openRef',id:sh});assert.equal(ui.run('panel'),'air');assert.equal(ui.run('hubFocus'),sh);
 // Ausschalten über die Kopfzeile
 press(ui,{action:'assistToggle'});assert.equal(st(ui,"assistant.sites['site-1'].enabled"),false);ui.run('hudPending=true;flushHud(true)');assert.equal(ui.nodes.get('#assistLabel').textContent,'Assistent aus');
 ui.run('guard.dispose()');
});

test('Replay-Sperre: Assistent-Schalter und Zubringer-Start gesperrt, Fenster zeigen Snapshot',async()=>{
 const env=fixture(),{sim,truck}=env;order(env,{qty:20});
 const ui=await load(sim);
 ui.run('for(let i=0;i<20;i++){sim.step(1);replayTake();}render(true)');
 press(ui,{action:'replay'});assert.equal(ui.run('!!rp'),true);ui.run('replaySeek(10)');
 const before=ui.run('sim.serialize()');
 press(ui,{action:'assistToggle'});assert.equal(st(ui,"assistant.sites['site-1']"),undefined,'kein setAssistant im Replay');
 key(ui,'x');assert.equal(ui.run('panel'),'air');assert.match(body(ui),/Nächste Flüge/);
 await ui.submit('air',{vehicleId:truck,departAt:String(FT)});assert.equal(st(ui,'airShuttles.length'),0,'kein Zubringer im Replay');
 key(ui,'j');assert.equal(ui.run('panel'),'assistant');await ui.submit('assistBudget',{dayBudget:'100'});
 assert.equal(ui.run('sim.serialize()'),before,'Fachzustand unverändert');
 press(ui,{action:'replayLive'});press(ui,{action:'assistToggle'});assert.equal(st(ui,"assistant.sites['site-1'].enabled"),true,'live wieder möglich');
 ui.run('guard.dispose()');
});
