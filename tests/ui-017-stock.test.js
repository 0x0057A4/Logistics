// 0.17 A05/A10-S: Gemeinsame Bestandsrechnung (stock-view.js), Lager-/Auftragstabelle und Auftrags-Tab.
// Prüffälle 1–8 des Nutzerauftrags (docs/AUFTRAG-0.17-BEDIENBARKEIT.md) mit echten Modulen und Befehlen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {committedQty} from '../dist/tours.js';
import * as sv from '../dist/stock-view.js';
import {SUPPLIERS,buyQuote,stockTable,stockUi,stockAction} from '../dist/ui-stock.js';
import {orderRows,orderStatus,dueInfo,orderBarRows,ordersUi} from '../dist/ui-orders.js';
import {boot} from './ui-harness.js';

const SITE='site-1';
function factory(seed=5){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 const ok=c=>{const r=sim.command(c);assert.ok(r.ok,c.type+': '+r.message);return r;};
 for(const [buildingType,x,y] of [['rack',2,2],['rack',2,4],['assembly',6,2],['dock',2,11]])ok({type:'build',buildingType,x,y,rotation:0});
 sim.step(1);
 const add=(item,qty,extra={})=>{const b=sim.api.inventory.add({item,qty,site:SITE,location:'stock',quality:95,unitCost:10,...extra});assert.ok(b,'add '+item);return b;};
 const byQty=q=>s.orders.find(o=>o.kind==='manufacturing'&&o.qty===q);
 return {sim,s,ok,add,byQty};
}
const row=(s,item,cls='company')=>sv.productRows(s,{site:SITE}).find(r=>r.item===item&&r.ownerClass===cls);

test('Prüffall 1: viele Chargen eines Produkts ergeben eine Zeile mit korrekter Gesamtmenge und Chargenliste',()=>{
 const {s,add}=factory();
 for(let i=0;i<9;i++)add('lamp',i+1);
 const rows=sv.productRows(s,{site:SITE}).filter(r=>r.item==='lamp');
 assert.equal(rows.length,1);assert.equal(rows[0].total,45);assert.equal(rows[0].free,45);assert.equal(rows[0].batches.length,9);
 assert.equal(rows[0].batches.reduce((n,b)=>n+b.qty,0),45);
 // Darstellung: eine Zeile, Chargen erst nach Aufklappen
 stockUi.expanded.clear();let h=stockTable(s,'');
 assert.equal((h.match(/data-stock-row="lamp\|company"/g)||[]).length,1);assert.doesNotMatch(h,/class="data-table sv-batches"/);
 assert.equal(stockAction('stockToggle','lamp|company'),true);h=stockTable(s,'');
 assert.match(h,/sv-batches/);for(const b of rows[0].batches)assert.ok(h.includes(b.id));
 stockUi.expanded.clear();
});

test('Prüffall 2: Varianten bleiben getrennt (Artikelstufen, Eigentum, Qualitätsbänder)',()=>{
 const {s,add}=factory();
 add('lamp',5);add('lamp_tested',4);add('lamp_raw',3);add('lamp',2,{quality:70});add('lamp',6,{owner:'order-x'});
 const lamp=row(s,'lamp');assert.equal(lamp.total,7);assert.deepEqual(lamp.bands.map(b=>[b.band,b.qty]).sort(),[['Q < 75 %',2],['Q ≥ 90 %',5]]);
 assert.equal(row(s,'lamp_tested').total,4);assert.equal(row(s,'lamp_raw').total,3);
 const foreign=row(s,'lamp','customer');assert.equal(foreign.total,6);assert.equal(foreign.variant,'Kundenware');
});

test('Prüffall 3: 35 offen, 42 auf Lager, 20 für andere reserviert → 13 fehlen',()=>{
 const {s,ok,add,byQty}=factory();
 for(let i=0;i<6;i++)add('lamp',7);
 const o20=byQty(20),o35=byQty(35);ok({type:'acceptOrder',id:o20.id});ok({type:'acceptOrder',id:o35.id});
 const v=ok({type:'buyVehicle',vehicleType:'van'}).id;ok({type:'dispatch',orderId:o20.id,vehicleId:v,qty:20});
 const c=sv.orderCoverage(s,o35);
 assert.equal(sv.coverageText(c),'35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen');
 assert.deepEqual([c.open,c.onHand,c.reservedOther,c.reservedForThis,c.freeOther,c.missing],[35,42,20,0,22,13]);
 // Der beliefernde Auftrag: Reservierung zählt für ihn, nicht doppelt abgezogen
 const c20=sv.orderCoverage(s,o20);assert.equal(c20.reservedForThis,20);assert.equal(c20.missing,0);assert.equal(c20.freeOther,22);
 // Lager zeigt dieselben Mengen
 const r=row(s,'lamp');assert.deepEqual([r.total,r.reserved,r.free],[42,20,22]);
 // Unterwegs-Menge entspricht tours.committedQty (gleiche Regeln)
 assert.equal(c20.reservedForThis+c20.underway,committedQty(s,o20.id));
});

test('Prüffall 4: mehrere Aufträge sehen denselben freien Bestand ohne verbindliche Zusage',()=>{
 const {s,ok,add,byQty}=factory();
 add('lamp',30);
 for(const q of [8,20,35])ok({type:'acceptOrder',id:byQty(q).id});
 const before=JSON.stringify([s.reservations,s.batches]);
 const cs=[8,20,35].map(q=>sv.orderCoverage(s,byQty(q)));
 for(const c of cs){assert.equal(c.freeOther,30);assert.equal(c.competing,2);}
 assert.equal(cs[0].missing,0);assert.equal(cs[1].missing,0);assert.equal(cs[2].missing,5);
 assert.equal(JSON.stringify([s.reservations,s.batches]),before,'Rechnung reserviert nichts');
 assert.match(stockTable(s,''),/Verpackte Arbeitsleuchte/);
 ordersUi.expanded.add(byQty(35).id);
 const html=orderRows(s).length&&ordersUi;assert.ok(html);
});

test('Prüffall 5: Ressourcen aus echten Rezepten, Bedarfsbasis benannt, Fertig-/Zwischenware verrechnet',()=>{
 const {s,add}=factory();
 const one=sv.resourceNeeds(s,'lamp',1);
 assert.deepEqual(one.map(r=>[r.item,r.perUnit]).sort(),[['board',1],['carton',1],['housing',1],['lamp_raw',1],['lamp_tested',1]]);
 assert.deepEqual(sv.resourceNeeds(s,'housing',1),[],'Einkaufsteil ohne Rezept');
 add('lamp_tested',5);add('carton',20);
 const eight=Object.fromEntries(sv.resourceNeeds(s,'lamp',8).map(r=>[r.item,r]));
 assert.equal(eight.lamp_tested.need,8);assert.equal(eight.lamp_tested.missing,3);assert.equal(eight.lamp_raw.need,3);assert.equal(eight.housing.need,3);
 assert.equal(eight.carton.missing,0);assert.equal(sv.needText(eight.housing),'0 verfügbar / 3 benötigt · 3 fehlen');
 stockUi.basis='one';assert.match(stockTable(s,''),/Bedarf für 1 Stück/);
});

test('Prüffall 6: reservierte, gesperrte, Quarantäne- und Kühlschaden-Ware ist nicht frei',()=>{
 const {sim,s,add}=factory();
 add('housing',10);assert.ok(sim.api.inventory.reserve('housing',4,SITE,'job-test'));
 add('housing',3,{location:'quarantine'});const b=add('housing',2);b.blocked=true;
 const r=row(s,'housing');assert.deepEqual([r.total,r.reserved,r.free,r.blocked],[15,4,6,5]);
 assert.equal(sv.resourceNeeds(s,'lamp_raw',10).find(x=>x.item==='housing').free,6);
 const cold=add('cold_module',4,{coldDamaged:true});assert.equal(cold.blocked,true);assert.equal(row(s,'cold_module').free,0);
});

test('Prüffall 7 + 8: [+] belegt den Einkauf vor (ohne Kauf); bestellte Ware erst nach Einlagerung im Bestand',async()=>{
 const {sim,s,ok,add}=factory();
 const w=ok({type:'hire',role:'warehouse'}).id;ok({type:'setShift',id:w,shift:'all'});
 add('housing',2);
 ok({type:'buy',item:'housing',qty:3});
 const need=sv.resourceNeeds(s,'lamp_raw',10).find(x=>x.item==='housing');
 assert.deepEqual([need.free,need.need,need.missing,need.incoming,need.toOrder,sv.suggestOrder(need)],[2,10,8,3,5,5]);
 let r=row(s,'housing');assert.equal(r.total,2);assert.equal(r.incoming,3);
 for(let i=0;i<200&&s.purchases.some(p=>p.status!=='stored');i++){sim.step(1);if(s.purchases[0].status==='receiving'){const x=row(s,'housing');assert.equal(x.total,2,'Wareneingang noch kein Bestand');assert.equal(x.incoming,3);}}
 r=row(s,'housing');assert.equal(r.total,5);assert.equal(r.incoming,0);assert.equal(r.free,5);
 // Oberfläche: [+] öffnet Einkauf vorbelegt, kauft nicht
 add('lamp',1);
 const ui=await boot();await ui.click('start');assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);
 const money=ui.run('sim.state.money'),purchases=ui.run('sim.state.purchases.length');
 ui.run("openPanel('inventory')");let h=ui.nodes.get('#panelBody').innerHTML;
 assert.match(h,/data-action="stockBuy" data-id="carton\|1" title="Ressource bestellen"/);
 ui.click('stockBuy','housing|5');
 assert.equal(ui.run('panel'),'purchasing');assert.equal(ui.run('sim.state.money'),money);assert.equal(ui.run('sim.state.purchases.length'),purchases);
 h=ui.nodes.get('#panelBody').innerHTML;
 assert.match(h,/<option value="housing" selected>/);assert.match(h,/name="qty" type="number" min="1" max="1000" value="5"/);
 assert.match(h,/5 × Leuchtengehäuse · Stückpreis 18 € · Gesamtkosten 90 € · Lieferzeit 30 Spielminuten/);
 ui.submit('buy',{item:'housing',qty:'5',supplier:'standard'});assert.equal(ui.run('sim.state.purchases.length'),purchases+1);assert.equal(ui.run('sim.state.money'),money-90);
 ui.run('guard.dispose()');
});

test('Lieferbedingungen der Angebotsanzeige entsprechen dem Einkaufsbefehl',()=>{
 for(const supplier of Object.keys(SUPPLIERS)){
  const {sim,s}=factory();const r=sim.command({type:'buy',item:'board',qty:7,supplier});assert.ok(r.ok);
  const p=s.purchases.at(-1),q=buyQuote('board',7,supplier);assert.equal(q.total,p.cost);assert.equal(q.lead,p.eta-s.t);
 }
});

test('Aufträge: Status, Fristwarnung, Standardsortierung nach Frist, Filter und Auftragsleiste',()=>{
 const {s,ok,byQty}=factory();
 const o8=byQty(8),o20=byQty(20),o35=byQty(35);ok({type:'acceptOrder',id:o8.id});ok({type:'acceptOrder',id:o35.id});
 o35.due=s.t+60;
 assert.equal(orderStatus(s,o8).key,'open');assert.equal(orderStatus(s,o20).key,'offer');
 assert.equal(dueInfo(s,o35).warn,'Frist knapp');assert.match(dueInfo(s,o35).rest,/^noch 1 Std\.$/);
 const rows=orderRows(s,{filter:'current'});for(let i=1;i<rows.length;i++)assert.ok(rows[i-1].o.due<=rows[i].o.due);
 assert.ok(orderRows(s,{filter:'offer'}).every(r=>r.o.status==='offer'));
 o8.due=s.t-30;o8.late=true;assert.deepEqual(orderRows(s,{filter:'overdue'}).map(r=>r.o.id),[o8.id]);
 const bar=orderBarRows(s);assert.equal(bar.total,2);assert.equal(bar.warn,2);assert.equal(bar.rows[0].id,o8.id);assert.match(bar.rows[0].due,/überfällig seit 30 Min\./);
 assert.match(bar.rows[0].progress,/0\/8 geliefert · 8 fehlen/);
});

test('Cache je Datenstand: gleiche Referenz ohne Änderung, neue Werte nach Spielminute',()=>{
 const {sim,s,add}=factory();add('lamp',3);
 const a=sv.productRows(s,{site:SITE});assert.equal(sv.productRows(s,{site:SITE}),a);
 sim.step(1);add('lamp',2);const b=sv.productRows(s,{site:SITE});assert.notEqual(b,a);assert.equal(b.find(r=>r.item==='lamp').total,5);
});

test('Oberfläche: Auftragstabelle mit Suche/Filter, Auftrags-Tab unten öffnet den Auftrag',async()=>{
 const {sim,ok,byQty}=factory();ok({type:'acceptOrder',id:byQty(35).id});
 const id=byQty(35).id;
 const ui=await boot();await ui.click('start');assert.equal(await ui.run(`activate('sandbox',{candidate:Simulation.fromJSON(${JSON.stringify(sim.serialize())})})`),true);
 ui.run('render(true)');ui.run('hudPending=true;flushHud(true)');
 assert.equal(ui.nodes.get('#vbarOrdersCount').textContent,'1');
 ui.listeners.click({target:{closest:()=>({dataset:{vbarTab:'orders'},matches:()=>false})}});
 assert.equal(ui.run('prefs.vbarTab'),'orders');assert.equal(ui.nodes.get('#vbarOrders').hidden,false);assert.equal(ui.nodes.get('#vbarVehicles').hidden,true);
 const r=ui.nodes.get('#vbarOrderList').children[0];assert.equal(r.dataset.order,id);
 ui.listeners.click({target:{closest:()=>({dataset:{order:id},matches:()=>false})}});
 assert.equal(ui.run('panel'),'orders');const h=ui.nodes.get('#panelBody').innerHTML;
 assert.match(h,new RegExp(`class="ov-row open selected[^"]*" data-order-row="${id}"`));
 assert.match(h,/35 benötigt · 0 auf Lager · 0 frei verfügbar · 35 fehlen/);assert.match(h,/Lieferung starten/);
 assert.match(h,/Aufträge und Verträge/);
 ui.run(`search='keintreffer';renderPanel(true)`);assert.match(ui.nodes.get('#panelBody').innerHTML,/Keine Aufträge/);
 ui.run('guard.dispose()');
});
