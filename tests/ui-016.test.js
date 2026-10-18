// 0.16 (A10): Oberfläche für Wetter & Störungen, Personalrollen, Kundendienst-Ausbau, Lohnfertigung-Storno, Linienankunft
// nach Schichtende (QS-W3-02) und Kapazitätsangaben in Warenangeboten (B-0.15-2). Echte Fachmodule über den UI-Harness.
// Eingriffe in die Ausgangslage sind je Test benannt. Die Oberfläche bucht weder Geld noch Ware (Zustandsvergleich).
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
import {wareOf,shipperScore} from '../dist/contracts.js';
import {coolingCapacity,coolingFree} from '../dist/special.js';
import {maxLoad} from '../dist/transport.js';
import {WEATHER_NAME,weatherAt} from '../dist/disruptions.js';

const SITE='site-1';
const body=ui=>ui.nodes.get('#panelBody').innerHTML;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
const change=(ui,target)=>ui.listeners.change({target:{dataset:{},closest:()=>null,name:'',...target}});
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const alerts=ui=>JSON.parse(ui.run('JSON.stringify(hudData.alerts)'));
const de=(v,d=0)=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:d}).format(v);
async function load(sim){const ui=await boot();await ui.click('start');
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');ui.run('hudPending=true;flushHud(true)');return ui;}
const frozen=ui=>ui.run('JSON.stringify({m:sim.state.money,l:sim.state.ledger.length,b:sim.state.batches.map(b=>[b.id,b.qty,b.location]),w:sim.state.workers.length,t:sim.state.t})');

/** Hub mit Dock, Regal, 2 Lagerkräften (durchgehend) und Lieferwagen; nimmt bis zu drei Vertragsangebote an (Seed 13: Torstörung
 *  mit wartendem Fremd-Lkw bei Minute 3.412, wetterbedingt verspätete Ankunft ab 3.375). Nur reguläre Befehle. */
function hub(seed=13){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 ok(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});ok(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 for(let i=0;i<2;i++){const id=ok(sim,{type:'hire',role:'warehouse'}).id;ok(sim,{type:'setShift',id,shift:'all'});}
 ok(sim,{type:'buyVehicle',vehicleType:'van'});
 const run=(cond,max)=>{for(let i=0;i<max&&!cond();i++){for(const k of s.contracts)if(k.status==='offer'&&s.contracts.filter(x=>x.status==='active').length<3)sim.command({type:'acceptContract',id:k.id});sim.step(1);}return cond();};
 return {sim,s,run};
}

test('Wetter & Störungen: Kopfzeile, Station, Glocke, Fenster mit Restdauer, Torbuch „Torstörung“ mit Hinweis, Fremd-Lkw-Verspätung',async()=>{
 const {sim,s,run}=hub();
 assert.ok(run(()=>s.yard.some(a=>a.waitReason==='Torstörung'),6*1440),'Fremd-Lkw wartet wegen Torstörung');
 const gate=s.disruptions.events.find(e=>e.kind==='gate'&&e.site===SITE&&s.t>=e.startT&&s.t<e.endT);assert.ok(gate,'aktive Torstörung');
 const late=s.yard.find(a=>a.delay>0&&(a.phase!=='gone'||Math.floor(a.eta/1440)===Math.floor(s.t/1440)));
 const ui=await load(sim),before=frozen(ui);
 // Kopfzeile: Wettersymbol + Text des aktiven Standorts.
 assert.equal(ui.nodes.get('#siteWeather').hidden,false,'Wetteranzeige sichtbar');
 const kind=weatherAt(s,SITE);assert.equal(ui.nodes.get('#siteWeatherText').textContent,kind==='clear'?'Klar':WEATHER_NAME[kind]);
 assert.ok(ui.nodes.get('#siteWeatherIc').innerHTML.length>10,'Wettersymbol gesetzt');
 // Station im Standortfluss und Glocke.
 assert.equal(ui.nodes.get('#stl-disrupt').hidden,false);assert.match(ui.nodes.get('#st-disrupt-sub').textContent,/Torstörung noch \d+ Min\./);
 const a=alerts(ui).find(x=>x.key==='ds:'+gate.id);assert.ok(a,'Glocke meldet Torstörung');assert.match(a.title,/^Torstörung · /);assert.match(a.sub,/noch \d+/);assert.equal(a.target,'disruptions');
 // Torbuch: Wartegrund „Torstörung“ mit Restdauer und Sprung ins Störungsfenster; Verspätung durch Wetter.
 ui.run("openPanel('yard')");let h=body(ui);
 assert.ok(h.includes('Torstörung'));assert.match(h,new RegExp(`Torkontrolle steht bis ${String(Math.floor(gate.endT%1440/60)).padStart(2,'0')}:${String(gate.endT%60).padStart(2,'0')}`));
 assert.match(h,/data-action="panel-disruptions"/);
 assert.ok(late,'wetterbedingt verspäteter Fremd-Lkw im Torbuch');assert.ok(h.includes(`+${late.delay} Min. Wetter`),'Verspätung im Torbuch');
 // Fenster „Wetter & Störungen“.
 press(ui,{action:'panel-disruptions',id:''});assert.equal(ui.run('panel'),'disruptions');h=body(ui);
 for(const t of ['Wetter je Standort','Aktive Störungen','Torstörung','Torkontrolle steht','noch '])assert.ok(h.includes(t),'fehlt: '+t);
 assert.ok(ui.run("paletteHits('wetter').some(h=>h.title==='Wetter & Störungen')"),'Befehlspalette findet das Fenster');
 // Chronik übersetzt die Meldungsart.
 ui.run("openPanel('history')");assert.match(body(ui),/· Störung<\/small>/);
 // Station öffnet das Fenster.
 ui.run("openStation('disrupt')");assert.equal(ui.run('panel'),'disruptions');
 assert.equal(frozen(ui),before,'Anzeige bucht nichts');
});

test('Einstellung „Störungen“: vorhandener Befehl settings schaltet ab und an, Fenster und Einstellungen zeigen den Zustand',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:21});sim.step(2700);
 const ui=await load(sim),before=frozen(ui);
 ui.run("openPanel('settings')");assert.match(body(ui),/data-setting="incidents" checked/);
 change(ui,{dataset:{setting:'incidents'},checked:false});
 assert.equal(ui.run('sim.state.settings.incidents'),false,'Befehl settings ausgeführt');
 ui.run("openPanel('disruptions')");assert.match(body(ui),/Aus: keine neuen Störungen/);assert.doesNotMatch(body(ui),/data-setting="incidents" checked/);
 change(ui,{dataset:{setting:'incidents'},checked:true});assert.equal(ui.run('sim.state.settings.incidents'),true);
 assert.equal(frozen(ui),before);
 // Vor Spieltag 2 ohne Störungsdaten: keine Wetteranzeige, Station verborgen, Fenster erklärt den Beginn.
 const fresh=await load(new Simulation({mode:'sandbox',seed:21}));
 assert.equal(fresh.nodes.get('#siteWeather').hidden,true);assert.equal(fresh.nodes.get('#stl-disrupt').hidden,true);
 fresh.run("openPanel('disruptions')");assert.match(body(fresh),/ab Spieltag 2/);
});

test('Personalrollen: Erklärung beim Einstellen, Einstellung über hire, Spezialistenrate mit workRate(…,"forklift")',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:7}),ui=await load(sim);
 ui.run("openPanel('staff')");let h=body(ui);
 assert.match(h,/<option value="forklift"[^>]*>Staplerfahrer<\/option>/);assert.match(h,/<option value="gate"[^>]*>Torposten<\/option>/);
 assert.match(h,/<b>Staplerfahrer<\/b>[^<]*25 % schneller beim Staplerumschlag[^<]*springt eine Lagerkraft ein/);
 assert.match(h,/<b>Torposten<\/b>[^<]*25 % schneller bei der Torkontrolle/);
 const money=ui.run('sim.state.money');
 ui.submit('hire',{role:'forklift'});ui.submit('hire',{role:'gate'});
 const ws=ui.run('sim.state.workers.map(w=>w.role)');assert.deepEqual([...ws],['forklift','gate']);
 assert.equal(ui.run('sim.state.money'),money-400-250,'Einstellungskosten aus dem Fachmodul'); // A02 0.16: Torposten 250 €
 ui.run('render(true)');h=body(ui);assert.match(h,/Staplerfahrer · Spezialist \+25 %/);assert.match(h,/Torposten · Spezialist \+25 %/);
 // Anzeige der Staplerrate (Zustandsattrappe nur für die Lesesicht): Staplerfahrer 1,25 Paletten/min, Lagerkraft 1.
 const crew=role=>ui.run(`arrivalCrew({workers:[{id:'w',name:'Kim',role:'${role}',task:'y-1:warehouse',skill:1,fatigue:0}],buildings:[],yard:[]},{id:'y-1',phase:'unloading',item:'pallet'})`);
 assert.match(crew('forklift'),new RegExp(`Kim \\(Staplerfahrer\\) · ${de(1.25,1)} Paletten/min`));
 assert.match(crew('warehouse'),/Kim · 1 Paletten\/min/);
 assert.match(ui.run(`arrivalCrew({workers:[{id:'w',name:'Ute',role:'gate',task:'y-1:gate',skill:1,fatigue:0}],buildings:[],yard:[]},{id:'y-1',phase:'gate'})`),/Torkontrolle: Ute \(Torposten, \+25 %\)/);
});

test('Kundendienst: Teillieferung, Auslöser, Antwortfrist mit Restzeit/abgelaufen, Glocke; Verträge: Zufriedenheit und Preisanpassung',async()=>{
 const {sim,s,run}=hub();
 assert.ok(run(()=>s.tickets.some(t=>t.source==='automatic'&&t.trigger)&&s.contracts.some(k=>k.status==='offer'&&k.priceAdjust),6*1440),'automatisches Anliegen und Angebot mit Preisanpassung');
 const ui=await load(sim),before=frozen(ui);
 assert.equal(ui.run('ticketKinds.partial'),'Teillieferung');
 ui.run("openPanel('service')");let h=body(ui);
 assert.ok(h.includes('Auslöser'));assert.ok(h.includes('Antwortfrist'));assert.match(h,/Teillieferungen/);
 const open=s.tickets.find(t=>t.status==='open'&&t.respondBy!=null);
 if(open){const rest=open.respondBy-s.t;assert.ok(rest<0?h.includes('abgelaufen seit'):h.includes('noch '));
  const a=alerts(ui).find(x=>x.key==='tk:'+open.id);assert.ok(a);assert.match(a.sub,rest<0?/Antwortfrist abgelaufen/:/Antwort bis \d\d:\d\d/);}
 // Lesesicht einzelner Karten (Attrappen der Ticketfelder, Zustand unverändert): Teillieferung offen mit Restzeit, abgelaufen.
 const o=s.orders.find(x=>x.contractId)||s.orders[0];
 const card=t=>ui.run(`ticketCard(sim.state,${JSON.stringify({id:'ticket-x',orderId:o.id,site:SITE,kind:'partial',source:'automatic',trigger:'partial',status:'open',createdAt:s.t-10,remaining:0,blocked:null,response:null,originalDue:o.due,requestedDue:null,cost:0,respondBy:s.t+350,...t})})`);
 h=card({});assert.match(h,/Teillieferung/);assert.match(h,/Teillieferung \(Rest nicht unterwegs\)/);assert.match(h,/noch 5 Std\. 50 Min\./);
 assert.match(h,/data-action="ticket-apologize"/,'Antworten wie Beschwerde');
 h=card({respondBy:s.t-5,expired:true});assert.match(h,/abgelaufen seit/);
 h=card({kind:'status',trigger:'disruption'});assert.match(h,/Störungsverzug/);
 // Verträge: Zufriedenheit je Versender (Balken 0–100) und Preisanpassung im Angebot.
 ui.run("openPanel('contracts')");h=body(ui);
 const k=s.contracts.find(x=>x.status==='offer'&&x.priceAdjust);
 assert.ok(h.includes('Zufriedenheit Versender'));assert.match(h,new RegExp(`aria-label="Zufriedenheit ${k.shipper}"[^>]*aria-valuenow="${Math.round(shipperScore(s,k.shipper))}"`));
 assert.ok(h.includes('Preisanpassung'));assert.ok(h.includes((k.priceAdjust>0?'+':'−')+de(Math.abs(k.priceAdjust*100),1)+' %'),'Preisanpassung in Prozent');
 if(Object.keys(s.shippers||{}).length)assert.ok(h.includes('Zufriedenheit der Versender'));
 assert.equal(frozen(ui),before);
});

test('Lohnfertigung-Storno: Auftragsakte zeigt Rückgabe an den Kunden (returnedItems/returnedQty)',async()=>{
 const LINE=[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11],['rack',2,4],['rack',6,11],['rack',9,11]];
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state;for(const [t,x,y] of LINE)ok(sim,{type:'build',buildingType:t,x,y,rotation:0});
 for(const role of ['production','warehouse','warehouse']){const id=ok(sim,{type:'hire',role}).id;ok(sim,{type:'setShift',id,shift:'all'});}
 let o;for(let i=0;i<4000&&!(o=s.orders.find(o=>o.kind==='vas'&&o.status==='offer'));i++)sim.step(1);assert.ok(o,'Lohnfertigungsangebot');
 ok(sim,{type:'acceptOrder',id:o.id});
 for(let i=0;i<1440&&!s.batches.some(b=>b.owner===o.id&&b.qty>0);i++)sim.step(1);
 ok(sim,{type:'cancelOrder',id:o.id});assert.ok(o.returnedQty>0,'Rückgabe protokolliert');
 const ui=await load(sim);ui.run(`selected='${o.id}';openPanel('detail')`);const h=body(ui);
 assert.ok(h.includes('Rückgabe an Kunden'));assert.ok(h.includes(de(o.returnedQty,2)+' Einheiten'));assert.match(h,/Storno Lohnfertigung/);
 for(const [item,n] of Object.entries(o.returnedItems))assert.ok(h.includes(`${de(n,2)} × `),'Artikel '+item);
});

test('QS-W3-02: Linienformular und Linienkarte warnen, wenn die Ankunft am Ziel nach Schichtende der Lagerkräfte liegt',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,A=SITE,B=ok(sim,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(const site of [A,B])ok(sim,{type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});
 ok(sim,{type:'hire',role:'warehouse',site:B});// Tagschicht 08–16 am Ziel
 const truck=ok(sim,{type:'buyVehicle',vehicleType:'truck',site:A}).id;
 ok(sim,{type:'createLine',from:A,to:B,departures:[15*60+50,9*60],vehicleId:truck});
 const ui=await load(sim);ui.run("openPanel('lines')");let h=body(ui);
 const km=ui.run(`siteDistance(sim.state,'${A}','${B}')`),travel=Math.ceil(km/0.85),arr=15*60+50+travel;
 assert.ok(arr%1440>=16*60,'Ankunft nach 16 Uhr (Fahrtzeit '+travel+')');
 const hh=m=>`${String(Math.floor(m%1440/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 assert.ok(h.includes('Ankunft nach Schichtende'),'Warnung auf Karte');assert.ok(h.includes(`15:50 → Ankunft ${hh(arr)}`));assert.ok(!h.includes('09:00 → Ankunft'),'Vormittagsabfahrt unkritisch');
 assert.ok(h.includes('Tagschicht bis 16:00'));
 // Formular (neue Linie B → A ohne Lagerkraft in A): Warnung je Abfahrt.
 ui.run(`lineDraft={from:'${B}',to:'${A}',departures:'10:00'};render(true)`);h=body(ui);
 assert.match(h,/keine Lagerkraft am Zielstandort/);
 // Mit Nachtschicht am Ziel entfällt die Warnung auf der Karte.
 const w=s.workers.find(x=>x.site===B).id;ui.run(`send({type:'setShift',id:'${w}',shift:'all'},true);lineDraft={};render(true)`);
 assert.ok(!body(ui).includes('15:50 → Ankunft'),'durchgehende Schicht deckt die Ankunft');
});

test('B-0.15-2: Warenangebote zeigen benötigte Kühlplätze (frei/gesamt) bzw. Sperrgut-Kapazität der Fahrzeuge',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:13}),s=sim.state;
 ok(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});ok(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 ok(sim,{type:'build',buildingType:'coldstore',x:8,y:2,rotation:0});ok(sim,{type:'build',buildingType:'forklift',x:12,y:10,rotation:0});
 ok(sim,{type:'buyVehicle',vehicleType:'van'});ok(sim,{type:'buyVehicle',vehicleType:'truck'});
 const find=w=>s.contracts.find(k=>k.status==='offer'&&wareOf(k)===w);
 for(let i=0;i<6000&&!(find('parcel_cold')&&find('bulky'));i++)sim.step(1);
 const ui=await load(sim);ui.run("openPanel('contracts')");const h=body(ui);
 const cold=find('parcel_cold'),bulky=find('bulky');assert.ok(cold||bulky,'mindestens ein Warenangebot');
 if(cold){const peak=Math.max(...cold.arrivals.map(a=>a.parcels));assert.ok(h.includes(`${de(peak)} je Ankunft benötigt`));
  assert.ok(h.includes(`am Standort ${de(Math.floor(coolingFree(s,SITE)))} frei von ${de(Math.floor(coolingCapacity(s,SITE)))}`));}
 if(bulky){const sum=s.vehicles.reduce((n,v)=>n+maxLoad(v,'bulky'),0);assert.ok(h.includes('Sperrgut-Kapazität'));assert.ok(h.includes(`${de(sum)} Stück je Umlauf`));}
});
