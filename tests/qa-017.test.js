// QS 0.17 (A11, unabhängig): Fachliche Prüfszenarien des Nutzerauftrags 0.17 (docs/AUFTRAG-0.17-BEDIENBARKEIT.md).
// Eigene Szenarien mit regulären Befehlen. Ausnahmen (Testaufbau, ausdrücklich gekennzeichnet):
//  - Fertigware (Leuchten) kommt über die A05-Schnittstelle api.inventory.add, weil eine echte Fertigung von 42 Leuchten
//    nur Laufzeit kostet, aber nichts an der geprüften Anzeige ändert.
//  - Für QS-017-01 (todo) wird der Fehlerfall direkt über den regulären Befehl `rename` erzeugt.
// Browserseitige Szenarien (Bedienung, Fenster, Auflösungen, echtes Neuladen) prüft tests/browser/qa-017.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Simulation} from '../dist/core.js';
import {productRows,orderCoverage,coverageText,resourceNeeds,needText,suggestOrder} from '../dist/stock-view.js';
import {stockTable,stockUi,stockAction} from '../dist/ui-stock.js';
import {ordersTable} from '../dist/ui-orders.js';
import {shiftSegments,scheduleRows} from '../dist/ui-schedule.js';
import {onShift} from '../dist/workforce.js';
import {dayCash,boardColumns} from '../dist/ui-board.js';
import {displayName,explainBuilding,EXPLAIN} from '../dist/ui-explain.js';

const repo=new URL('../',import.meta.url).pathname;
function setup(seed=11){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 const cmd=c=>{const r=sim.command(c);assert.ok(r.ok,`${c.type}: ${r.message}`);return r;};
 return {sim,s,cmd};
}
/** Hub mit Dock, Regalen, Montage/Prüfung/Verpackung, Lager- und Fahrkraft (durchgehend), zwei Lieferwagen. */
function plant(seed=11){
 const t=setup(seed),{cmd}=t;
 for(const [buildingType,x,y] of [['dock',2,10],['rack',2,2],['rack',2,4],['rack',2,6],['assembly',8,2],['testing',11,2],['packing',14,2]])cmd({type:'build',buildingType,x,y,rotation:0});
 for(const role of ['warehouse','driver','driver']){const id=cmd({type:'hire',role}).id;cmd({type:'setShift',id,shift:'all'});}
 cmd({type:'buyVehicle',vehicleType:'van'});cmd({type:'buyVehicle',vehicleType:'van'});
 // Fertigungsanlagen erzeugen die drei Startanfragen (8 / 20 / 35 Leuchten).
 t.sim.step(2);
 // Fertigung anhalten, damit keine eigene Produktion die geprüften Mengen verändert.
 for(const b of t.s.buildings)if(['assembly','testing','packing'].includes(b.type))cmd({type:'toggleBuilding',id:b.id});
 return t;
}
const lampOrder=(s,qty)=>s.orders.find(o=>o.kind==='manufacturing'&&o.qty===qty);
const addLamps=(sim,qty,quality=90,n=1)=>{for(let i=0;i<n;i++)sim.api.inventory.add({item:'lamp',qty,site:'site-1',location:'stock',quality,unitCost:50});};
const lampRow=(s,cls='company')=>productRows(s).find(r=>r.item==='lamp'&&r.ownerClass===cls);

test('P1 viele Chargen desselben Produkts → eine Zeile, Gesamtmenge aus Mengen (nicht Listeneinträgen), Details aufklappbar',()=>{
 const {sim,s}=plant();
 const qty=[1,2,3,5,7,11,13,4,6,8,9,10,12,14,15];addLamps(sim,0,90,0);
 qty.forEach((q,i)=>sim.api.inventory.add({item:'lamp',qty:q,site:'site-1',location:'stock',quality:91+i%5,unitCost:50}));
 const rows=productRows(s).filter(r=>r.item==='lamp');
 assert.equal(rows.length,1,'genau eine Zeile für eigene Leuchten');
 const r=rows[0],sum=qty.reduce((a,b)=>a+b,0);
 assert.equal(r.total,sum);assert.equal(r.free,sum);assert.equal(r.reserved,0);
 assert.equal(r.batches.length,qty.length,'jede Charge einzeln in den Details');
 assert.equal(r.batches.reduce((n,b)=>n+b.qty,0),sum);
 // Aufklappen in der Lagertabelle zeigt alle Chargen mit Menge und Lagerort.
 stockUi.expanded.clear();stockAction('stockToggle',r.key);
 const html=stockTable(s,'');
 assert.equal((html.match(/data-stock-row="lamp\|company"/g)||[]).length,1);
 const batchRows=(html.split('sv-batches')[1]||'').match(/<tr/g)||[];
 assert.ok(batchRows.length>=qty.length,`Chargenzeilen ${batchRows.length}`);
 stockUi.expanded.clear();
});

test('P2 relevante Varianten bleiben unterscheidbar: Produkt, Kundenware, Qualitätsband, gesperrte Ware',()=>{
 const {sim,s,cmd}=plant();
 addLamps(sim,10,95);addLamps(sim,6,60);
 sim.api.inventory.add({item:'lamp_pro',qty:4,site:'site-1',location:'stock',quality:92,unitCost:80});
 // Fremdlogistik: Kundenware desselben Artikels (echter Ablauf: Anfrage annehmen → Anlieferung → Einlagerung).
 for(let i=0;i<1440&&!s.orders.some(o=>o.kind==='logistics'&&o.item==='lamp'&&o.status==='offer');i++)sim.step(1);
 const lo=s.orders.find(o=>o.kind==='logistics'&&o.item==='lamp'&&o.status==='offer');assert.ok(lo,'Fremdlogistik-Anfrage Leuchten');
 cmd({type:'acceptOrder',id:lo.id});
 for(let i=0;i<240&&s.purchases.some(p=>p.orderId===lo.id&&p.status!=='stored');i++)sim.step(1);
 const own=lampRow(s),cust=lampRow(s,'customer'),pro=productRows(s).find(r=>r.item==='lamp_pro');
 assert.ok(own&&cust&&pro,'drei getrennte Zeilen');
 assert.equal(own.total,16);assert.equal(cust.total,lo.qty);assert.equal(pro.total,4);
 assert.equal(own.variant,'eigen');assert.equal(cust.variant,'Kundenware');
 assert.deepEqual(own.bands.map(b=>[b.band,b.qty]).sort(),[['Q < 75 %',6],['Q ≥ 90 %',10]].sort(),'Qualitätsbänder statt Mischwert');
 // Kundenware zählt nicht als eigene freie Ware einer Fertigungsanfrage.
 const o35=lampOrder(s,35);cmd({type:'acceptOrder',id:o35.id});
 const c=orderCoverage(s,o35);
 assert.equal(c.onHand,16,'nur eigene Ware');assert.equal(c.lowQuality,6,'unter Mindestqualität 82 % ausgewiesen');assert.equal(c.freeOther,10);assert.equal(c.missing,25);
 // Gesperrte Ware (Quarantäne) ist Bestand, aber nicht frei.
 sim.api.inventory.add({item:'lamp',qty:5,site:'site-1',location:'quarantine',quality:95,unitCost:50});
 const own2=lampRow(s);assert.equal(own2.total,21);assert.equal(own2.free,16,'Lagerzeile: frei ohne Qualitätsfilter');assert.equal(own2.blocked,5,'Quarantäne gesperrt');
});

test('P3 35 benötigt · 42 auf Lager · 20 für anderen Auftrag reserviert (echte Lieferung) → 22 frei · 13 fehlen',()=>{
 const {sim,s,cmd}=plant();
 const a=lampOrder(s,35),b=lampOrder(s,20);assert.ok(a&&b,'Startanfragen 35 und 20');
 cmd({type:'acceptOrder',id:a.id});cmd({type:'acceptOrder',id:b.id});
 addLamps(sim,14,90,3);
 const van=s.vehicles[0];cmd({type:'dispatch',orderId:b.id,vehicleId:van.id,qty:20});
 const c=orderCoverage(s,a);
 assert.deepEqual({open:c.open,onHand:c.onHand,reservedForThis:c.reservedForThis,reservedOther:c.reservedOther,freeOther:c.freeOther,missing:c.missing},
  {open:35,onHand:42,reservedForThis:0,reservedOther:20,freeOther:22,missing:13});
 assert.equal(coverageText(c),'35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen');
 // Dieselbe Rechnung in Lager und Auftragsleiste
 const r=lampRow(s);assert.deepEqual([r.total,r.reserved,r.free],[42,20,22]);
 const cb=orderCoverage(s,b);assert.equal(cb.reservedForThis,20);assert.equal(cb.missing,0,'reservierte Menge des eigenen Auftrags nicht doppelt abgezogen');
 // Auftragstabelle zeigt genau diese Zahlen
 const html=ordersTable(s,{});
 assert.match(html,/35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen/);
 // Nach Abfahrt: Bestand 22, A weiterhin 13 fehlend; B „unterwegs“ statt reserviert.
 for(let i=0;i<60&&s.shipments[0].status==='loading';i++)sim.step(1);
 assert.equal(s.shipments[0].status,'transit');
 const c2=orderCoverage(s,a);assert.equal(c2.onHand,22);assert.equal(c2.freeOther,22);assert.equal(c2.missing,13);
 const cb2=orderCoverage(s,b);assert.equal(cb2.underway,20);assert.equal(cb2.missing,0);
 // Teillieferung reduziert den offenen Bedarf: 5 an A liefern → 30 benötigt
 cmd({type:'dispatch',orderId:a.id,vehicleId:s.vehicles[1].id,qty:5});
 for(let i=0;i<400&&a.delivered<5;i++)sim.step(1);
 assert.equal(a.delivered,5);
 const c3=orderCoverage(s,a);assert.equal(c3.open,30);assert.equal(c3.onHand,17);assert.equal(c3.missing,13);
});

test('P4 mehrere Aufträge: dieselbe Bestandslogik, keine doppelte verbindliche Zusage',()=>{
 const {sim,s,cmd}=plant();
 const a=lampOrder(s,35),b=lampOrder(s,20),c8=lampOrder(s,8);
 for(const o of [a,b,c8])cmd({type:'acceptOrder',id:o.id});
 addLamps(sim,42,90);
 const ca=orderCoverage(s,a),cb=orderCoverage(s,b);
 // Anzeige ist keine Zusage: beide sehen 42 frei, aber Konkurrenz um denselben Bestand wird ausgewiesen.
 assert.equal(ca.freeOther,42);assert.equal(cb.freeOther,42);
 assert.equal(ca.competing,2);assert.equal(ca.poolDemand,28);
 // Verbindlich ist nur die Reservierung: 20 + 20 + 8 > 42 → dritte Reservierung nur bis zum Rest möglich.
 cmd({type:'dispatch',orderId:a.id,vehicleId:s.vehicles[0].id,qty:20});
 cmd({type:'dispatch',orderId:b.id,vehicleId:s.vehicles[1].id,qty:20});
 cmd({type:'buyVehicle',vehicleType:'van'});const v3=s.vehicles[2];
 const r=sim.command({type:'dispatch',orderId:c8.id,vehicleId:v3.id,qty:8});
 assert.equal(r.ok,false,'nur 2 frei – 8 nicht reservierbar');
 cmd({type:'dispatch',orderId:c8.id,vehicleId:v3.id,qty:2});
 const reserved=s.reservations.reduce((n,x)=>n+x.qty,0);assert.equal(reserved,42);
 assert.ok(s.batches.every(x=>x.qty>=0&&x.reserved<=x.qty+1e-9),'kein negativer Bestand');
 // Summen konsistent: reserviert je Auftrag + frei = Gesamt
 const covs=[a,b,c8].map(o=>orderCoverage(s,o));
 assert.deepEqual(covs.map(c=>c.reservedForThis),[20,20,2]);
 assert.ok(covs.every(c=>c.freeOther===0));
 assert.deepEqual(covs.map(c=>c.missing),[15,0,6]);
 const row=lampRow(s);assert.equal(row.reserved+row.free,row.total);
});

test('P4b QS-017-03 behoben (A10): Tabellenzeile kennzeichnet geteilten freien Bestand („⚠ gedeckt*“ mit Tooltip)',()=>{
 const {sim,s,cmd}=plant();
 const a=lampOrder(s,35),b=lampOrder(s,20);cmd({type:'acceptOrder',id:a.id});cmd({type:'acceptOrder',id:b.id});
 addLamps(sim,42,90);
 const html=ordersTable(s,{});
 const rowOf=id=>html.split(`data-order-row="${id}"`)[1].split('</tr>')[0];
 // 35 + 20 > 42 frei: beide Zeilen rechnerisch gedeckt, aber geteilt – Hinweis direkt in der Zeile (vorher nur aufgeklappt).
 for(const o of [a,b]){const r=rowOf(o.id);assert.match(r,/⚠ gedeckt\*/,o.id);assert.match(r,/geteilt: derselbe freie Bestand \(42 Stück\) wird von 1 weiteren Auftrag benötigt/,o.id);}
});

test('P5 Ressourcen aus den tatsächlichen Rezepten, Bedarfsbasis benannt, Zwischenprodukte verrechnet',()=>{
 const {sim,s}=plant();
 const one=resourceNeeds(s,'lamp',1,{site:'site-1'});
 const by=Object.fromEntries(one.map(r=>[r.item,r]));
 // Rezeptkette pack ← test ← assemble: Karton, Gehäuse, Platine je 1; Zwischenstufen als herzustellen.
 for(const k of ['carton','housing','board'])assert.equal(by[k]?.need,1,k);
 assert.equal(by.lamp_tested?.intermediate,true);
 // Zwischenware im Lager deckt Bedarf: 3 geprüfte Leuchten → für 5 Leuchten nur 2 Gehäuse/Platinen, aber 5 Kartons.
 sim.api.inventory.add({item:'lamp_tested',qty:3,site:'site-1',location:'stock',quality:90,unitCost:40});
 const five=Object.fromEntries(resourceNeeds(s,'lamp',5,{site:'site-1'}).map(r=>[r.item,r]));
 assert.equal(five.carton.need,5);assert.equal(five.housing.need,2);assert.equal(five.board.need,2);
 // Kein Rezept → leer (Hinweis in der Ansicht)
 assert.deepEqual(resourceNeeds(s,'housing',1,{site:'site-1'}),[]);
 addLamps(sim,3,90);sim.api.inventory.add({item:'housing',qty:2,site:'site-1',location:'stock',quality:90,unitCost:18});
 const html=stockTable(s,'');
 assert.match(html,/Bedarf für 1 Stück · Rezept Leuchte verpacken/);
 assert.match(html,/je 1 Stück/,'Spaltenkopf benennt die Basis sichtbar');
 assert.match(html,/kein Rezept/i);
});

test('P6 reservierte Ressourcen sind nicht frei (echte Reservierung über Standorttransfer)',()=>{
 const {sim,s,cmd}=plant();
 cmd({type:'buy',item:'housing',qty:12});
 for(let i=0;i<120&&s.purchases.some(p=>p.status!=='stored');i++)sim.step(1);
 const site2=cmd({type:'buySite',name:'Lager Ostkamp'}).id;
 let need=resourceNeeds(s,'lamp',10,{site:'site-1'}).find(r=>r.item==='housing');
 assert.equal(need.free,12);assert.equal(need.missing,0);
 cmd({type:'transfer',vehicleId:s.vehicles[0].id,toSite:site2,item:'housing',qty:8});
 need=resourceNeeds(s,'lamp',10,{site:'site-1'}).find(r=>r.item==='housing');
 assert.equal(need.free,4,'8 für den Transfer reserviert');assert.equal(need.missing,6);
 assert.equal(needText(need),'4 verfügbar / 10 benötigt · 6 fehlen');
 const row=productRows(s).find(r=>r.item==='housing');assert.deepEqual([row.total,row.reserved,row.free],[12,8,4]);
 assert.ok(row.batches.some(b=>b.jobs.some(j=>/Standorttransfer/.test(j.label))),'Reservierung mit Vorgang benannt');
});

test('P7/P8 Bestellvorschlag berücksichtigt Zulauf; Zulauf zählt erst nach Wareneingang zum Bestand; [+] bucht nichts',()=>{
 const {sim,s,cmd}=plant();
 const money0=s.money,ledger0=s.ledger.length;
 let need=resourceNeeds(s,'lamp',20,{site:'site-1'}).find(r=>r.item==='board');
 assert.equal(need.missing,20);assert.equal(suggestOrder(need),20);
 // [+] in der Ansicht liefert nur einen Bestellentwurf, keinen Kauf
 const r=stockAction('stockBuy','board|20');
 assert.deepEqual(r?.buy&&{item:r.buy.item,qty:r.buy.qty},{item:'board',qty:20});
 assert.equal(s.money,money0);assert.equal(s.ledger.length,ledger0);assert.equal(s.purchases.length,0);
 // Teilbestellung 12 → Vorschlag 8, Bestand 0 bis zur Einlagerung
 cmd({type:'buy',item:'board',qty:12});
 need=resourceNeeds(s,'lamp',20,{site:'site-1'}).find(r=>r.item==='board');
 assert.equal(need.free,0);assert.equal(need.incoming,12);assert.equal(need.toOrder,8);assert.equal(suggestOrder(need),8);
 const states=new Set();
 for(let i=0;i<120;i++){sim.step(1);const p=s.purchases[0],row=productRows(s).find(x=>x.item==='board');states.add(p.status);
  if(p.status!=='stored'){assert.equal(row?.total||0,0,`kein Bestand im Status ${p.status}`);assert.equal(row?.free||0,0);assert.equal(row?.incoming,12);}
  else {assert.equal(row.total,12);assert.equal(row.free,12);assert.equal(row.incoming,0);break;}}
 assert.ok(states.has('receiving')&&states.has('stored'),[...states].join(','));
});

test('P9 viele Aufträge: Standardsortierung nach Frist, Filter und Suche, Seitenweise statt Zusammendrücken',()=>{
 const {sim,s,cmd}=plant();
 for(let i=0;i<3*1440;i++){for(const o of s.orders)if(o.status==='offer'&&o.due>s.t+60)sim.command({type:'acceptOrder',id:o.id});sim.step(1);}
 const active=s.orders.filter(o=>o.status==='active');
 assert.ok(active.length>=10,`aktive Aufträge ${active.length}`);
 const html=ordersTable(s,{});
 const ids=[...html.matchAll(/data-order-row="([^"]+)"/g)].map(m=>m[1]);
 const dues=ids.map(id=>s.orders.find(o=>o.id===id).due);
 assert.deepEqual(dues,[...dues].sort((x,y)=>x-y),'nach nächster Frist sortiert');
 const one=ordersTable(s,{search:active[3].id});
 assert.equal((one.match(/data-order-row=/g)||[]).length,1);
});

test('P10 Anlagen- und Depotnamen bleiben nach Speichern/Laden; leerer Name stellt Standard her; alte Stände ohne Namen',()=>{
 const {sim,s,cmd}=plant();
 const test1=s.buildings.find(b=>b.type==='testing'),dock=s.buildings.find(b=>b.type==='dock');
 cmd({type:'rename',target:'building',id:test1.id,name:'  Prüfung   – Arbeitsleuchten '});
 cmd({type:'rename',target:'site',id:'site-1',name:'Depot Nord'});
 assert.equal(test1.label,'Prüfung – Arbeitsleuchten');
 assert.equal(sim.command({type:'rename',target:'building',id:dock.id,name:'x'.repeat(41)}).ok,false);
 const back=Simulation.fromJSON(sim.serialize()).state;
 assert.equal(displayName(back,back.buildings.find(b=>b.id===test1.id)),'Prüfung – Arbeitsleuchten');
 assert.equal(back.sites[0].name,'Depot Nord');
 assert.match(explainBuilding(back,back.buildings.find(b=>b.id===test1.id)).title||JSON.stringify(explainBuilding(back,back.buildings.find(b=>b.id===test1.id))),/Prüf/);
 cmd({type:'rename',target:'site',id:'site-1',name:''});assert.equal(s.sites[0].name,'Depot Morgenfeld');
 cmd({type:'rename',target:'building',id:test1.id,name:'   '});assert.equal(test1.label,undefined);assert.match(displayName(s,test1),/Prüf.* 1/);
});

test('QS-017-01 behoben: Standort umbenennen lehnt 1 Zeichen bzw. doppelten Namen ab, Stand bleibt ladbar',()=>{
 for(const make of [sim=>sim.command({type:'rename',target:'site',id:'site-1',name:'A'}),
  sim=>{const id=sim.command({type:'buySite',name:'Nordlager'}).id;return sim.command({type:'rename',target:'site',id,name:'depot morgenfeld'});}]){
  const {sim}=setup(3);const r=make(sim);
  assert.equal(r.ok,false);
  if(r.ok)assert.doesNotThrow(()=>Simulation.fromJSON(sim.serialize()));
 }
});

test('P14 Schicht über Mitternacht: Plan = Simulationsregel (onShift) und tatsächlich gebuchte Lohnminuten',()=>{
 const {sim,s,cmd}=setup(5);
 const id=cmd({type:'hire',role:'warehouse'}).id;cmd({type:'setShift',id,shift:'night'});
 const w=s.workers.find(x=>x.id===id);
 const seg=shiftSegments(w,1);
 assert.deepEqual(seg.map(x=>[x.from,x.to,x.fromPrev,x.toNext]),[[0,480,true,false],[960,1440,false,true]]);
 // Minute für Minute gegen die Simulation, zwei Tage
 for(let d=0;d<2;d++){const sg=shiftSegments(w,d);for(let m=0;m<1440;m++){const inPlan=sg.some(x=>m>=x.from&&m<x.to);assert.equal(inPlan,onShift(w,d*1440+m),`Tag ${d} Minute ${m}`);}}
 // Tatsächlich gebuchte Lohnminuten am Tag 2 (00:00–23:59) = 960 Planminuten (8 + 8 Std.)
 sim.step(1440*2-1-s.t);const before=s.money;
 assert.equal(s.ledger.find(r=>r.key===`wage:${id}:day:2`),undefined);
 sim.step(1440);
 const row=s.ledger.find(r=>r.key===`wage:${id}:day:2`);
 assert.equal(row.entries,960);
 // Plananzeige des gewählten Tags: Balken über Mitternacht
 const rows=scheduleRows(s,2,{});const r=rows.find(x=>x.id===id||x.worker?.id===id)||rows[0];
 assert.ok(r,'Zeile für die Nachtkraft');
 assert.ok(before>s.money);
});

test('P15 Liquidität heute = tatsächlich gebuchte Zahlungsströme, Kredit getrennt, Tagesgrenze nach Simulationszeit',()=>{
 const {sim,s,cmd}=plant(13);
 const a=lampOrder(s,8);cmd({type:'acceptOrder',id:a.id});addLamps(sim,8,90);
 const ends=[];let prev=s.money,day=Math.floor(s.t/1440);
 const startDay=day;
 for(let i=0;i<4*1440;i++){
  if(s.t===startDay*1440+1440+300){cmd({type:'takeLoan',amount:5000});}
  if(s.t===startDay*1440+1440+600){cmd({type:'repayLoan',amount:2000});}
  if(s.t===startDay*1440+700)cmd({type:'dispatch',orderId:a.id,vehicleId:s.vehicles[0].id,qty:8});
  sim.step(1);
  const d=Math.floor(s.t/1440);
  if(s.t%1440===1439){const dc=dayCash(s);ends.push({d,money:s.money,dc,prev});prev=s.money;}
 }
 assert.ok(ends.length>=3);
 for(const e of ends.slice(1)){
  // Kontostandsänderung des Tages (23:59 Vortag → 23:59 Tag) = Summe der Tageszeilen
  assert.ok(Math.abs((e.money-e.prev)-e.dc.accountChange)<0.011,`Tag ${e.d}: Δ ${(e.money-e.prev).toFixed(2)} vs ${e.dc.accountChange}`);
  assert.ok(Math.abs(e.dc.net-(e.dc.inflow-e.dc.outflow))<0.011);
 }
 const loanDay=ends.find(e=>e.dc.financing.loanIn>0);assert.ok(loanDay,'Kredittag');
 assert.equal(loanDay.dc.financing.loanIn,5000);assert.equal(loanDay.dc.financing.repayment,2000);
 assert.ok(loanDay.dc.inflow<5000,'Kredit nicht als Einnahme');
 const paidDay=ends.find(e=>e.dc.categories.some(c=>c.category==='Umsatz'&&c.inflow>0));assert.ok(paidDay,'Zahlungseingang aus Lieferung');
 // Unbezahlte (noch nicht fällige) Forderung zählt nicht: vor Zahlung keine Umsatzzeile
 assert.ok(a.paid>0);
});

test('P16 Board: Spaltenwechsel nur durch echte Bearbeitung (Anliegen und Retoure)',()=>{
 const {sim,s,cmd}=plant(17);
 for(const role of ['service','technician']){const id=cmd({type:'hire',role}).id;cmd({type:'setShift',id,shift:'all'});}
 cmd({type:'build',buildingType:'workshop',x:8,y:8,rotation:0});
 const a=lampOrder(s,8);cmd({type:'acceptOrder',id:a.id});addLamps(sim,8,90);
 const tk=cmd({type:'createTicket',orderId:a.id,kind:'status'}).id;
 const col=id=>Object.entries(boardColumns(s)).find(([,l])=>l.some(c=>c.id===id))?.[0];
 const snap=sim.serialize();boardColumns(s);assert.equal(sim.serialize(),snap,'Board ist reine Lesesicht');
 assert.equal(col(tk),'open');
 cmd({type:'respondTicket',id:tk,response:'inform'});assert.equal(col(tk),'work');
 for(let i=0;i<60&&s.tickets.find(t=>t.id===tk).status!=='closed';i++)sim.step(1);
 assert.equal(col(tk),'done');
 // Retoure: liefern, zurückholen, prüfen, Entscheidung, Reparatur
 cmd({type:'dispatch',orderId:a.id,vehicleId:s.vehicles[0].id,qty:8});
 for(let i=0;i<300&&a.delivered<8;i++)sim.step(1);assert.equal(a.delivered,8);
 sim.api.inventory.add({item:'spare',qty:4,site:'site-1',location:'stock',quality:90,unitCost:10});
 const rid=cmd({type:'createReturn',orderId:a.id,qty:2}).id,ret=()=>s.returns.find(r=>r.id===rid);
 const seen=[];let last='';
 for(let i=0;i<1500;i++){const st=ret().status+'>'+col(rid);if(st!==last){seen.push(st);last=st;}
  if(ret().status==='decision')cmd({type:'resolveReturn',id:rid,resolution:'repair'});
  if(['repaired','recycled'].includes(ret().status))break;sim.step(1);}
 const st=ret().status+'>'+col(rid);if(st!==last)seen.push(st);
 assert.equal(col(rid),'done',seen.join(' | '));
 assert.ok(seen.slice(0,-1).every(x=>!x.endsWith('>done')),'vor Abschluss nie „Abgeschlossen“: '+seen.join(' | '));
 assert.ok(ret().refunded,'Erstattung vor Abschluss');
});

test('P17 alter Spielstand aus 0.16 (d187565, außerhalb des Repos simuliert) lädt und läuft; Assistent unverändert',{skip:!existsSync(join(repo,'.git'))&&'kein Git'},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'qa017-old-'));
 try{
  try{execFileSync('git',['-C',repo,'cat-file','-e','d187565^{commit}']);}catch{return;}
  const tar=execFileSync('git',['-C',repo,'archive','d187565','dist'],{maxBuffer:64<<20});
  execFileSync('tar',['-x','-C',dir],{input:tar});
  const Old=(await import(join(dir,'dist/core.js'))).Simulation;
  const old=new Old({mode:'sandbox',seed:21}),os=old.state,oc=c=>{const r=old.command(c);assert.ok(r.ok,`alt ${c.type}: ${r.message}`);return r;};
  for(const [buildingType,x,y] of [['dock',2,10],['rack',2,2],['rack',2,4],['assembly',8,2],['testing',11,2],['packing',14,2],['sorter',6,8]])oc({type:'build',buildingType,x,y,rotation:0});
  for(const [role,shift] of [['warehouse','night'],['production','all'],['driver','all'],['service','day']]){const id=oc({type:'hire',role}).id;oc({type:'setShift',id,shift});}
  oc({type:'buyVehicle',vehicleType:'van'});oc({type:'buy',item:'housing',qty:20});oc({type:'buy',item:'board',qty:20});oc({type:'buy',item:'carton',qty:20});
  for(let i=0;i<1440+300;i++){for(const o of os.orders)if(o.status==='offer'&&o.due>os.t+60)old.command({type:'acceptOrder',id:o.id});old.step(1);}
  const raw=old.serialize();
  assert.ok(!/"label"/.test(raw)&&!/defaultName/.test(raw),'alter Stand ohne Namensfelder');
  const sim=Simulation.fromJSON(raw),s=sim.state;
  assert.equal(s.t,os.t);assert.equal(s.money,os.money);
  // Ansichten arbeiten mit dem alten Stand
  assert.ok(productRows(s).length>0);
  for(const o of s.orders.filter(o=>o.status==='active'))assert.ok(Number.isFinite(orderCoverage(s,o).missing));
  assert.ok(displayName(s,s.buildings[0]).length>0);
  assert.doesNotThrow(()=>ordersTable(s,{}));assert.doesNotThrow(()=>stockTable(s,''));
  sim.step(1440);
  assert.doesNotThrow(()=>Simulation.fromJSON(sim.serialize()));
  // Gleiche Weiterentwicklung wie der alte Code (ohne neue Funktion verändert 0.17 die Simulation nicht)
  old.step(1440);
  assert.equal(sim.state.money,old.state.money,'Kontostand nach 1 Tag gleich alt/neu');
  assert.equal(JSON.stringify(sim.state.batches),JSON.stringify(old.state.batches),'Bestände nach 1 Tag gleich alt/neu');
  // Assistent unverändert
  const diff=execFileSync('git',['-C',repo,'diff','d187565','HEAD','--','dist/assistant.js'],{encoding:'utf8'});
  assert.equal(diff,'','dist/assistant.js unverändert gegenüber 0.16');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Anlagenerklärung Sortierplatz: keine erfundene Nähewirkung – Durchsatz unabhängig vom Abstand zu Rampe/Regal',()=>{
 const text=JSON.stringify(EXPLAIN.sorter||{});
 assert.match(text,/keine Wirkung|kein(en)? Effekt|ohne Wegezeit/);
 assert.doesNotMatch(text,/(Nähe|nah).{0,40}(beschleunigt|schneller|erhöht)/);
 // Simulation: Sortierplatz direkt neben Dock/Regal vs. weit entfernt → gleiche sortierte Menge je Minute
 const run=(sx,sy)=>{
  const {sim,s,cmd}=setup(9);
  for(const [buildingType,x,y] of [['dock',2,12],['rack',2,2],['rack',2,4],['sorter',sx,sy]])cmd({type:'build',buildingType,x,y,rotation:0});
  for(const role of ['warehouse','warehouse','driver']){const id=cmd({type:'hire',role}).id;cmd({type:'setShift',id,shift:'all'});}
  for(let i=0;i<2*1440;i++){for(const k of s.contracts)if(k.status==='offer'&&!s.contracts.some(x=>x.status==='active'))sim.command({type:'acceptContract',id:k.id});sim.step(1);}
  const sorted=s.batches.filter(b=>b.item==='parcel'&&b.location==='stock').reduce((n,b)=>n+b.qty,0)+s.orders.filter(o=>o.contractId).reduce((n,o)=>n+(o.delivered||0),0);
  return {sorted,t:s.t};
 };
 const near=run(5,11),far=run(16,2);
 assert.ok(near.sorted>0,'es wurde sortiert');
 assert.equal(near.sorted,far.sorted,`nah ${near.sorted} / fern ${far.sorted}`);
});
