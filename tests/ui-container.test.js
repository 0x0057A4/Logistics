// Welle 3b-2 (A10): Containerhof und Seeimport in der Oberfläche. Vertragskarte Container (Inhalt über itemOf, Handling, Freizeit,
// Lagergeld, Hinweis Containerhof/Stapler mit Bauknopf), Fenster „Containerhof“ (Rail, Kürzel C, Palette, TEU, Containerliste,
// Vorziehen, Lagergeld aus dem Journal, Abholung), Torbuch (Chassis-Phasen, Wartegründe), Station, Glocke, Finanzen, Akte.
// Echte Fachmodule (contracts.js, yard.js, containers.js); Eingriffe in die Ausgangslage sind benannt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';
import {Simulation} from '../dist/core.js';
import * as yard from '../dist/yard.js';
import {OFFER_INTERVAL,OFFER_PHASE} from '../dist/contracts.js';

const body=ui=>ui.nodes.get('#panelBody').innerHTML;
const press=(ui,dataset)=>ui.listeners.click({target:{closest:()=>({dataset,matches:()=>false})}});
const key=(ui,k)=>ui.listeners.keydown({key:k,target:{matches:()=>false},preventDefault(){}});
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const alerts=ui=>JSON.parse(ui.run('JSON.stringify(hudData.alerts)'));
const st=(ui,k)=>ui.run(`sim.state.${k}`);
const json=(ui,k)=>JSON.parse(ui.run(`JSON.stringify(sim.state.${k})`));
async function load(sim){const ui=await boot();await ui.click('start');
 assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);ui.run('render(true)');ui.run('flushHud(true)');return ui;}
const until=(ui,cond,max=3000)=>assert.equal(ui.run(`(()=>{let i=0;while(!(${cond})&&i++<${max})sim.step(1);hudPending=true;flushHud(true);render(true);return !!(${cond});})()`),true,'Bedingung nicht erreicht: '+cond);
const nextPhase=t=>{const r=((OFFER_PHASE-t)%OFFER_INTERVAL+OFFER_INTERVAL)%OFFER_INTERVAL;return r||OFFER_INTERVAL;};

/** Echtes Seeimport-Angebot mit Paletteninhalt (Containerhof am Standort schaltet frei). Ausgangslage: Lagerkraft, Fahrer, Lkw,
 *  Staplerplatz, zwei Regale, aber noch KEIN Dock (Container bleiben im Hof, bis das Dock gebaut ist). */
function offerSetup(){
 for(let seed=1;seed<80;seed++){
  const sim=new Simulation({seed,mode:'sandbox'}),s=sim.state;
  const yardId=ok(sim,{type:'build',buildingType:'containeryard',x:12,y:8}).id;sim.step(nextPhase(s.t));
  const k=s.contracts.find(x=>x.status==='offer'&&x.unit==='container');
  if(!k||k.content!=='pallet'||k.arrivals[0].containers<2)continue;
  for(const [t,x,y] of [['rack',2,2],['rack',5,2],['forklift',12,2]])ok(sim,{type:'build',buildingType:t,x,y});
  ok(sim,{type:'hire',role:'warehouse'});ok(sim,{type:'hire',role:'driver'});for(const w of s.workers)w.shift='all';
  ok(sim,{type:'buyVehicle',vehicleType:'truck'});
  return {sim,s,k,yardId};
 }
 assert.fail('kein Palettencontainer-Angebot mit ≥ 2 Containern');
}

test('Vertragskarte Container: Inhalt über itemOf („n Container à m Paletten“), Handling, Freizeit, Lagergeld, Hinweis mit Bauknopf',async()=>{
 const {sim,k,yardId}=offerSetup(),a=k.arrivals[0],per=k.unitsPerContainer;
 const ui=await load(sim);press(ui,{panel:'contracts'});
 let card=body(ui).slice(body(ui).indexOf(`data-contract="${k.id}"`));
 assert.ok(card.includes(`<b>${a.containers}</b><small>Container / Tag</small>`),'Container je Tag');
 assert.match(card,/<small>Handling \/ Container<\/small>/);assert.match(card,/<small>Inhalt \/ Palette<\/small>/);
 assert.ok(card.includes(`(${a.containers} Container à ${per} Paletten)`),'Ankunft mit Containerzahl und Inhalt');
 assert.ok(card.includes(`${a.containers} Container à ${per} Paletten = ${a.containers*per} Paletten / Tag`));
 assert.match(card,/Freizeit im Containerhof<\/span><b>24 Std\. ab Abstellen/);assert.match(card,/Lagergeld nach Freizeit<\/span><b>12 € \/ Std\. je Container/);
 assert.match(card,/je verspäteter Palette/,'Strafsatz in Paletten (itemOf)');assert.doesNotMatch(card,/Palettenvertrag:/,'kein Palettenhinweis, sondern Seeimport');
 assert.match(card,/<b>Seeimport:<\/b>/);assert.doesNotMatch(card,/Fehlt am Standort/,'Containerhof, Stapler, Lkw vorhanden');
 const handling=a.containers*k.pricePerContainer,content=a.parcels*k.pricePerParcel;
 const euro=v=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(v)+' €';
 assert.ok(card.includes(`(Inhalt ${euro(content)} + Handling ${euro(handling)})`),'Erlös Inhalt + Handling');
 // Ohne Containerhof und Staplerplatz: Hinweis mit Bauknöpfen. Containerhof leer → Abriss erlaubt.
 const fork=ui.run(`sim.state.buildings.find(b=>b.type==='forklift').id`);
 assert.equal(ui.run(`sim.command({type:'demolish',id:'${yardId}'}).ok`),true);assert.equal(ui.run(`sim.command({type:'demolish',id:'${fork}'}).ok`),true);ui.run('render(true)');
 card=body(ui).slice(body(ui).indexOf(`data-contract="${k.id}"`));
 assert.match(card,/Fehlt am Standort: Containerhof und Staplerplatz/);
 assert.ok(card.includes('data-action="build" data-id="containeryard"'),'Bauknopf Containerhof');assert.ok(card.includes('data-action="build" data-id="forklift"'),'Bauknopf Staplerplatz');
 // Ankunftsplan nach Annahme: Paletten, Containerzahl
 assert.equal(ui.run(`sim.command({type:'acceptContract',id:'${k.id}'}).ok`),true);ui.run('render(true)');
 assert.match(body(ui),/Ankunftsplan heute und morgen<\/h3><span class="badge ">[\d.]+ Paletten/);assert.ok(body(ui).includes(`<small class="muted">${a.containers} Container</small>`));
 ui.run('hudPending=true;flushHud(true)');const cy=alerts(ui).find(x=>x.key==='cy:'+k.id);assert.ok(cy,'Glocke: Containerhof fehlt');assert.equal(cy.tone,'bad');
 assert.ok(alerts(ui).some(x=>x.key==='pk:'+k.id&&/^Seeimport \(Paletten\)/.test(x.title)),'Staplerplatz fehlt für Paletteninhalt');
 ui.run('guard.dispose()');
});

test('Containerhof: Rail/C/Palette, Torbuch-Chassis, TEU, Liste, Vorziehen, Freizeit-/Lagergeld-Glocke, Abholung, Finanzen, Akte',async()=>{
 const {sim,s,k,yardId}=offerSetup();ok(sim,{type:'acceptContract',id:k.id});
 k.freeMinutes=30; // Ausgangslage: kurze Freizeit, damit Lagergeld im Test anfällt
 const ui=await load(sim);
 assert.equal(ui.nodes.get('#rail-containers').hidden,false,'Rail sichtbar mit Containerhof');
 key(ui,'c');assert.equal(ui.run('panel'),'containers');assert.equal(ui.nodes.get('#panelTitle').textContent,'Containerhof');
 assert.match(body(ui),/<b>0 \/ 8<\/b><small>TEU belegt/);assert.match(body(ui),/Keine Container am Standort/);
 key(ui,'c');assert.equal(ui.run('panel'),'');
 assert.ok(ui.run("paletteHits('containerhof').some(h=>h.title==='Containerhof'&&/· C/.test(h.sub))"));assert.ok(ui.run("KEYS.some(k=>k[0]==='C')"));
 // Chassis im Torbuch: Phasen deutsch
 until(ui,`sim.state.yard.some(a=>a.kind==='container'&&a.phase==='toYard')`);
 const aid=ui.run(`sim.state.yard.find(a=>a.kind==='container').id`),n=k.arrivals[0].containers;
 press(ui,{panel:'yard'});let html=body(ui);assert.match(html,/Zum Containerhof/);assert.match(html,/Containerchassis · Seeimport/);
 assert.ok(html.includes(`${n} Container<br><small class="muted">${n*k.unitsPerContainer} Paletten`),'Menge: Container und Inhalt');
 assert.equal(alerts(ui).find(x=>x.key==='y:'+aid),undefined);
 const vrow=JSON.parse(ui.run(`JSON.stringify(hudData.vehicles.find(v=>v.arrival==='${aid}'))`));assert.match(vrow.type,/^Containerchassis/);assert.equal(vrow.status,'Zum Containerhof');
 until(ui,`sim.state.yard.find(a=>a.id==='${aid}').phase==='drop'`,10);assert.match(body(ui),/Abstellen/);
 until(ui,`sim.state.containers.every(c=>c.status==='yard')`,10);
 // Fenster: TEU, Liste, Wartegrund (kein Dock), Freizeit bis
 const ids=json(ui,'containers.map(c=>c.id)');
 press(ui,{panel:'containers'});html=body(ui);
 assert.ok(html.includes(`<b>${n*2} / 8</b><small>TEU belegt`));for(const id of ids)assert.ok(html.includes(`data-container-row="${id}"`));
 assert.ok(html.includes(`${k.unitsPerContainer} Paletten`));assert.match(html,/Im Containerhof/);assert.match(html,/Kein freies Dock/);assert.match(html,/Freizeit bis Tag/);assert.ok(html.includes(k.shipper));
 // Station und Glocke (Freizeit < 2 h)
 assert.equal(ui.nodes.get('#stl-containeryard').hidden,false);assert.equal(ui.nodes.get('#st-containeryard-n').textContent,`${n*2}/8`);assert.match(ui.nodes.get('#st-containeryard-sub').textContent,new RegExp(`^${n} im Hof`));
 assert.ok(alerts(ui).some(x=>x.key==='ft:'+ids[0]&&x.tone==='wait'&&/^Freizeit endet in \d+ Min\./.test(x.title)));
 // Vorziehen (unstuffContainer)
 ui.click('unstuffContainer',ids[1]);assert.equal(st(ui,`containers.find(c=>c.id==='${ids[1]}').priority`),true);ui.run('render(true)');
 const row=body(ui).slice(body(ui).indexOf(`data-container-row="${ids[1]}"`));assert.match(row.slice(0,row.indexOf('</tr>')),/vorgezogen/);assert.ok(!row.slice(0,row.indexOf('</tr>')).includes('unstuffContainer'));
 // Lagergeld läuft: Glocke, Station, Fenster, Journal
 until(ui,`sim.state.ledger.some(l=>l.key==='demurrage:${ids[0]}:1')`,200);
 const dm=alerts(ui).find(x=>x.key==='dm:'+ids[0]);assert.ok(dm,'Glocke: Lagergeld läuft');assert.equal(dm.tone,'bad');assert.match(dm.sub,/12 €\/Std\. · bisher -12 €/);
 assert.match(ui.nodes.get('#st-containeryard-sub').textContent,/Lagergeld läuft/);assert.match(ui.nodes.get('#st-containeryard').className,/tone-bad/);
 html=body(ui);assert.match(html,/Lagergeld läuft seit Tag/);assert.ok(html.includes('<span class="money-minus">-12 €</span>'),'angefallenes Lagergeld je Container');
 press(ui,{panel:'finance'});html=body(ui);assert.match(html,/Lagergeld<\/span><b><span class="money-minus">-\d+ €<\/span>/);assert.match(html,/Containerhandling · im Umsatz<\/span><b>0 € · 0 Container/);
 // Akte Containerhof
 press(ui,{action:'select',id:yardId});html=body(ui);assert.match(html,new RegExp(`Belegt am Standort</span><b>${n*2} / 8 TEU`));assert.match(html,/Lagergeld läuft<\/span><b><span class="money-minus">\d+ Container/);assert.ok(html.includes('data-action="panel-containers"'));
 // Dock bauen → Umfuhr/Entladen (vorgezogener zuerst) → leer → Abholung geplant → Handling
 assert.equal(ui.run(`sim.command({type:'build',buildingType:'dock',x:2,y:10}).ok`),true);
 until(ui,`sim.state.containers.find(c=>c.id==='${ids[1]}').status==='unstuffing'`,30);
 assert.equal(st(ui,`containers.find(c=>c.id==='${ids[0]}').status`),'yard','vorgezogener Container zuerst');
 press(ui,{panel:'yard'});assert.match(body(ui),/<span class="chip tone-[a-z]+">Container<\/span><\/strong><small>container-\d+ · Wird entladen/);
 press(ui,{panel:'staff'});assert.match(body(ui),/Containerentladung/);
 until(ui,`sim.state.containers.find(c=>c.id==='${ids[1]}').status==='empty'`,200);
 press(ui,{panel:'containers'});html=body(ui);const r1=html.slice(html.indexOf(`data-container-row="${ids[1]}"`));assert.match(r1.slice(0,r1.indexOf('</tr>')),/Leer · wartet auf Abholung.*geplant Tag/);
 until(ui,`sim.state.ledger.some(l=>l.key==='container-handling:${ids[1]}')`,5);
 press(ui,{panel:'finance'});assert.match(body(ui),/Containerhandling · im Umsatz<\/span><b>[\d.,]+ € · 1 Container/);
 // Abholchassis: Phase „Abholung“
 until(ui,`sim.state.yard.some(a=>a.kind==='container'&&a.pickup&&a.phase==='drop')`,400);
 press(ui,{panel:'yard'});assert.match(body(ui),/Leercontainer-Abholung/);assert.match(body(ui),/>Abholung</);assert.match(body(ui),/1 Leercontainer/);
 ui.run('guard.dispose()');
});

function chassisSetup({withYard}){
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;
 ok(sim,{type:'build',buildingType:'rack',x:2,y:2});if(withYard)ok(sim,{type:'build',buildingType:'containeryard',x:12,y:8});
 ok(sim,{type:'hire',role:'warehouse'});for(const w of s.workers)w.shift='all';
 const c=s.contracts[0];ok(sim,{type:'acceptContract',id:c.id});ok(sim,{type:'cancelContract',id:c.id});
 // Ausgangslage: Chassis direkt über yard.schedule (wie container-own), Paketinhalt, kein Dock (Container bleiben im Hof)
 const ship=(qty,containers,eta)=>{const id=sim.api.id('order');s.orders.push({id,kind:'logistics',source:'hub',lane:'lane-1',customer:'Gebiet (Testversand)',item:'parcel',qty,price:1,due:9000,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});
  return yard.schedule(s,sim.api,{kind:'container',contractId:c.id,site:s.selectedSite,eta:s.t+eta,orderIds:[id],containers,content:'parcel'});};
 return {sim,s,ship};
}
test('Torbuch-Wartegründe: „Kein Containerhof“ (Bauknopf, Glocke bad), „Containerhof voll“ (Glocke wait, Station)',async()=>{
 {const {sim,ship}=chassisSetup({withYard:false});const a=ship(1200,2,20);
  const ui=await load(sim);assert.equal(ui.nodes.get('#rail-containers').hidden,false,'Rail sichtbar mit Containern');
  until(ui,`sim.state.yard[0].phase==='queue'&&!!sim.state.yard[0].waitReason`,60);
  const al=alerts(ui).find(x=>x.key==='cw:'+a.id);assert.ok(al);assert.equal(al.tone,'bad');assert.match(al.title,/^Kein Containerhof · Chassis/);
  press(ui,{panel:'yard'});const html=body(ui);assert.match(html,/Wartet auf Containerhof/);assert.match(html,/Abstellen am Dock nicht erlaubt/);assert.ok(html.includes('data-action="build" data-id="containeryard"'));
  press(ui,{panel:'containers'});assert.match(body(ui),/Kein Containerhof/);assert.match(body(ui),/1 Chassis wartet/);assert.match(body(ui),/Angekündigt/);
  ui.run('guard.dispose()');}
 {const {sim,ship}=chassisSetup({withYard:true});ship(1200,2,20);const a2=ship(1800,3,25);
  const ui=await load(sim);
  until(ui,`sim.state.yard.find(a=>a.id==='${a2.id}').waitReason==='Containerhof voll'`,60);
  const al=alerts(ui).find(x=>x.key==='cw:'+a2.id);assert.ok(al);assert.equal(al.tone,'wait');assert.match(al.title,/^Containerhof voll · Chassis/);assert.match(al.sub,/^3 Container/);
  until(ui,`sim.state.yard.find(a=>a.id==='${a2.id}').waitSince<sim.state.t-20`,40);
  assert.ok(!alerts(ui).some(x=>x.key==='yw:'+a2.id),'keine Doppelmeldung');assert.ok(alerts(ui).some(x=>x.key==='cw:'+a2.id));
  assert.match(ui.nodes.get('#st-containeryard-sub').textContent,/1 Chassis wartet/);assert.match(ui.nodes.get('#st-containeryard').className,/tone-wait/);
  press(ui,{panel:'yard'});const html=body(ui);assert.match(html,/4 \/ 8 TEU · entladen lassen oder weiteren Containerhof bauen/);assert.match(html,/<h3>Containerhof<\/h3>/);
  ui.run('guard.dispose()');}
});
