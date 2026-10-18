// 0.17 A05/A10-S: Browserprüfung Lager-/Auftragstabelle und Auftrags-Tab der Betriebsleiste bei 1366×768 und 1920×1080.
// Kein Teil von `npm test`. Aufruf: node tests/browser/ui-017-stock.mjs [--shots <Verzeichnis>].
// Spielstand mit echten Modulen: Hub mit Frachtverträgen (viele Aufträge) plus Fertigungslinie, Leuchten in vielen Chargen.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state;
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
for(const [buildingType,x,y] of [['dock',2,10],['rack',2,2],['rack',2,4],['rack',2,6],['assembly',8,2],['testing',11,2],['packing',14,2]])cmd({type:'build',buildingType,x,y,rotation:0});
for(const role of ['warehouse','warehouse','driver']){const id=cmd({type:'hire',role}).id;cmd({type:'setShift',id,shift:'all'});}
cmd({type:'buyVehicle',vehicleType:'van'});
for(let i=0;i<2*1440;i++){for(const k of s.contracts)if(k.status==='offer'&&s.contracts.filter(x=>x.status==='active').length<3)sim.command({type:'acceptContract',id:k.id});sim.step(1);}
for(const o of s.orders)if(o.status==='offer'&&o.kind==='manufacturing'&&o.due>s.t)sim.command({type:'acceptOrder',id:o.id});
for(let i=0;i<12;i++)sim.api.inventory.add({item:'lamp',qty:3,site:'site-1',location:'stock',quality:90+i%8,unitCost:50});
sim.api.inventory.add({item:'housing',qty:4,site:'site-1',location:'stock',quality:88,unitCost:18});
// Lastdaten für „viele Aufträge“: Kopien echter aktiver Aufträge mit neuen IDs und gestaffelten Fristen (nur Prüfstand).
{const base=s.orders.filter(o=>o.status==='active');for(let i=0;i<150&&base.length;i++){const o=base[i%base.length];s.orders.push({...JSON.parse(JSON.stringify(o)),id:`order-${s.seq++}`,customer:`Prüfkunde ${i+1}`,due:s.t-120+i*37});}}
const nOrders=s.orders.length,active=s.orders.filter(o=>o.status==='active').length;
const dir=mkdtempSync(join(tmpdir(),'ui017-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);
const log=[],errors=[];
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name}${detail?' · '+detail:''}`);if(!cond)process.exitCode=1;};
log.push(`Spielstand: ${nOrders} Aufträge, ${active} aktiv`);
for(const [w,h] of [[1366,768],[1920,1080]]){
 const page=await browser.newPage({viewport:{width:w,height:h}});watch(page,errors,`${w}x${h}`);
 const L=`${w}×${h}`,wait=ms=>page.waitForTimeout(ms),text=sel=>page.textContent(sel).catch(()=>'');
 const noOverflow=()=>page.evaluate(()=>{const b=document.querySelector('#panelBody'),d=document.documentElement;return b.scrollWidth<=b.clientWidth+1&&d.scrollWidth<=window.innerWidth+1;});
 const shot=async n=>{if(shots)await page.screenshot({path:join(shots,`${n}-${w}.png`)});};
 try{
  await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
  await page.click('#welcome [data-action="start"]');await wait(600);
  await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
  await page.click('#confirm [data-action="confirmOk"]');await wait(800);await page.click('[data-speed="0"]');await wait(300);
  const cash0=await text('#cash');
  // Lager
  await page.click('.rail [data-panel="inventory"]');await wait(400);
  const lampRows=await page.locator('[data-stock-row="lamp|company"]').count();
  ok(`${L} Lager: eine Zeile für 12 Leuchten-Chargen`,lampRows===1);
  const cells=await page.locator('[data-stock-row="lamp|company"] td').allTextContents();
  ok(`${L} Lager: Gesamt 36, Frei sichtbar`,/36/.test(cells[1])&&/36/.test(cells[3]),cells.slice(1,4).join(' | '));
  ok(`${L} Lager: Ressourcen mit Bedarfsbasis`,/Bedarf für 1 Stück/.test(cells[5]),cells[5].slice(0,80));
  await page.click('[data-stock-row="lamp|company"] [data-action="stockToggle"]');await wait(300);
  ok(`${L} Lager: Chargen aufgeklappt`,await page.locator('.sv-batches tbody tr').count()>=12);
  await page.click('[data-action="stockSort"][data-id="total"]');await wait(300);
  ok(`${L} Lager: Sortierung nach Gesamt`,/▼|▲/.test(await text('[data-action="stockSort"][data-id="total"]')));
  ok(`${L} Lager ohne horizontalen Überlauf`,await noOverflow());
  const sticky=await page.evaluate(()=>getComputedStyle(document.querySelector('.sv-table thead')).position);ok(`${L} Lager: Tabellenkopf sticky`,sticky==='sticky',sticky);
  await shot('ui017-lager');
  const plus=page.locator('[data-stock-row="lamp|company"] [data-action="stockBuy"]').first();
  ok(`${L} [+] mit Tooltip`,(await plus.getAttribute('title'))==='Ressource bestellen');
  const want=(await plus.getAttribute('data-id')).split('|');
  await plus.click();await wait(400);
  ok(`${L} [+] öffnet Einkauf vorbelegt`,(await text('#panelTitle'))==='Beschaffung'&&await page.inputValue('#panelBody select[name="item"]')===want[0]&&await page.inputValue('#panelBody input[name="qty"]')===want[1],want.join('|'));
  ok(`${L} Einkauf zeigt Preis, Gesamtkosten, Lieferzeit`,/Stückpreis .* Gesamtkosten .* Lieferzeit \d+ Spielminuten/.test(await text('[data-buy-quote]')));
  await page.fill('#panelBody input[name="qty"]','7');await wait(150);
  ok(`${L} Menge anpassbar, Kosten folgen`,/^7 × /.test(await text('[data-buy-quote]')));
  ok(`${L} [+] kauft nichts`,(await text('#cash'))===cash0,`${cash0} → ${await text('#cash')}`);
  await shot('ui017-einkauf');
  // Aufträge
  await page.click('.rail [data-panel="orders"]');await wait(500);
  const rows=await page.locator('.ov-row').count();
  ok(`${L} Auftragstabelle mit vielen Aufträgen`,rows>=Math.min(active,60)&&rows>0,`${rows} Zeilen`);
  const dues=await page.$$eval('.ov-row',rs=>rs.map(r=>r.children[6].textContent));ok(`${L} Termin und Restzeit sichtbar`,dues.every(t=>/Tag \d+ · \d\d:\d\d/.test(t)));
  await page.click('[data-action="ordersFilter"][data-id="done"]');await wait(300);
  const doneRows=await page.locator('.ov-row').count();
  await page.click('[data-action="ordersFilter"][data-id="current"]');await wait(300);
  ok(`${L} Filter wirkt`,doneRows!==rows||doneRows===0,`erledigt ${doneRows}`);
  const first=s.orders.find(o=>o.status==='active');
  await page.fill('#search',first.id);await wait(400);
  ok(`${L} Suche findet Auftrag`,await page.locator('.ov-row').count()===1&&await page.locator(`[data-order-row="${first.id}"]`).count()===1);
  await page.fill('#search','');await wait(300);
  ok(`${L} Aufträge ohne horizontalen Überlauf`,await noOverflow());
  ok(`${L} Erklärung Aufträge/Verträge`,/Aufträge und Verträge/.test(await text('#panelBody')));
  await shot('ui017-auftraege');
  // Untere Leiste
  await page.click('[data-action="close"]');await wait(200);
  await page.click('#vbarTabOrders');await wait(500);
  const barRows=await page.locator('#vbarOrderList .vrow').count();
  ok(`${L} Auftrags-Tab unten mit aktiven Aufträgen`,barRows>0&&await page.isVisible('#vbarOrders')&&!(await page.isVisible('#vbarVehicles')),`${barRows} Zeilen, Zähler ${await text('#vbarOrdersCount')}`);
  const target=await page.locator('#vbarOrderList .vrow').first().getAttribute('data-order');
  await page.locator('#vbarOrderList .vrow').first().click();await wait(500);
  ok(`${L} Klick öffnet Auftrag im Auftragsfenster`,(await text('#panelTitle'))==='Markt & Aufträge'&&await page.locator(`.ov-row.open[data-order-row="${target}"]`).count()===1,target);
  await shot('ui017-leiste');
  await page.click('[data-action="close"]');await page.click('#vbarTabVehicles');await wait(200);
  ok(`${L} Fahrzeuge-Tab zurück`,await page.isVisible('#vbarVehicles'));
  ok(`${L} Seite ohne horizontalen Überlauf`,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 }catch(e){ok(`${L} Ablauf ohne Ausnahme`,false,e.message.slice(0,200));}
 await page.close();
}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));await browser.close();server.kill();cleanup();
