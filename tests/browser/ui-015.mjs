// A10 0.15: Browserprüfung der neuen Oberflächen (GuV & Anlagen, Warenarten, Quergurt-Sperre, Mehrwertdienste) in Chromium.
// Kein Teil von `npm test`. Aufruf: node tests/browser/ui-015.mjs [--shots <Verzeichnis>].
// Spielstand entsteht mit echten Modulen (Kühllager, Kühlvertrag angenommen und entladen, Fertigungslinie mit Lohnfertigungs-
// Angebot, ein Regal abgerissen); Import über das JSON-Importfeld wie ein Spieler. Prüft zusätzlich: keine Konsolenfehler,
// kein waagerechter Überlauf im Fenster, Oberfläche verändert Kontostand nicht (Spiel pausiert).
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';
import {wareOf} from '../../dist/contracts.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const sim=new Simulation({mode:'sandbox',seed:13}),s=sim.state;
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
for(const [buildingType,x,y] of [['dock',2,10],['rack',2,2],['coldstore',8,2],['assembly',14,2],['testing',14,5],['packing',14,8]])cmd({type:'build',buildingType,x,y,rotation:0});
const extra=cmd({type:'build',buildingType:'rack',x:2,y:5,rotation:0}).id;
for(const role of ['warehouse','warehouse','production']){const id=cmd({type:'hire',role}).id;cmd({type:'setShift',id,shift:'all'});}
cmd({type:'buyVehicle',vehicleType:'van'});
for(let i=0;i<3000&&!s.contracts.some(k=>wareOf(k)==='parcel_cold');i++)sim.step(1);
const k=s.contracts.find(k=>wareOf(k)==='parcel_cold');if(!k)throw Error('kein Kühlangebot');
cmd({type:'acceptContract',id:k.id});
for(let i=0;i<3000&&!(s.yard.some(a=>a.item==='parcel_cold'&&a.unloaded>0)&&s.orders.some(o=>o.kind==='vas'&&o.status==='offer'));i++)sim.step(1);
if(!s.yard.some(a=>a.item==='parcel_cold'&&a.unloaded>0))throw Error('kein Kühl-Lkw entladen');
if(!s.orders.some(o=>o.kind==='vas'))throw Error('kein Mehrwertdienst-Angebot');
cmd({type:'demolish',id:extra});sim.step(5);
const dir=mkdtempSync(join(tmpdir(),'ui015-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],log=[];watch(page,errors,'ui-015');
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name}${detail?' · '+detail:''}`);if(!cond)process.exitCode=1;};
const text=sel=>page.textContent(sel).catch(()=>'');
const wait=ms=>page.waitForTimeout(ms);
const noOverflow=()=>page.evaluate(()=>{const b=document.querySelector('#panelBody');return b.scrollWidth<=b.clientWidth+1;});
const shot=async name=>{if(shots)await page.screenshot({path:join(shots,name)});};
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await wait(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await wait(800);
 await page.click('[data-speed="0"]');await wait(200);
 const cash0=await text('#cash');
 // GuV & Anlagen
 await page.click('[data-panel="finance"]');await wait(400);
 await page.click('#panelBody [data-action="financeTab"][data-id="guv"]');await wait(300);
 let body=await text('#panelBody');
 ok('GuV-Tab: GuV, Anlagenspiegel, Abgang',/Gewinn- und Verlustrechnung/.test(body)&&/Anlagenspiegel/.test(body)&&/Abgänge im Zeitraum/.test(body)&&body.includes(extra),body.slice(0,120));
 ok('GuV-Tab: Abstimmung stimmt',/stimmt mit dem Ergebnis überein/.test(body));
 for(const [id,t] of [['today','Heute'],['total','Gesamt'],['week','7 Tage']]){await page.click(`#panelBody [data-action="guvPeriod"][data-id="${id}"]`);await wait(200);
  ok(`Zeitraum ${t} aktiv`,await page.getAttribute(`#panelBody [data-action="guvPeriod"][data-id="${id}"]`,'aria-selected')==='true');}
 ok('GuV ohne waagerechten Überlauf',await noOverflow());await shot('ui-015-guv.png');
 // Verträge: Kühlpaket
 await page.click('[data-panel="contracts"]');await wait(400);body=await text('#panelBody');
 ok('Vertrag Kühlpaket mit Zuschlag und Einheit',/Kühlzuschlag/.test(body)&&/Kühlpakete \/ Tag/.test(body)&&/Kühlfahrzeug/.test(body));
 ok('Verträge ohne Überlauf',await noOverflow());
 // Torbuch
 await page.keyboard.press('h');await wait(400);body=await text('#panelBody');
 ok('Torbuch zeigt Kühlpakete',/Kühlpakete/.test(body)&&/nur Kühllager/.test(body),(await text('#panelTitle')));await shot('ui-015-torbuch.png');
 // Standortfluss
 ok('Station Kühlpakete sichtbar',!(await page.isHidden('#stl-cold')),await text('#st-cold-sub'));
 // Baumenü: Quergurt gesperrt
 await page.keyboard.press('Escape');await wait(200);await page.keyboard.press('b');await wait(400);
 const cb=page.locator('#buildItems [data-build="crossbelt"]');
 ok('Quergurt im Baumenü gesperrt',(await cb.getAttribute('aria-disabled'))==='true'&&/Forschung Mega-Hub nötig/.test(await cb.textContent()));
 await cb.click({force:true});await wait(250); // aria-disabled: Playwright klickt sonst nicht, Browser aber schon
 ok('Klick auf gesperrten Quergurt: Hinweis statt Bauwerkzeug',/Forschung Mega-Hub nötig/.test(await text('#toast')),await text('#toast'));await shot('ui-015-bau.png');
 await page.keyboard.press('Escape');await wait(200);
 // Mehrwertdienste
 await page.click('[data-panel="orders"]');await wait(400);body=await text('#panelBody');
 ok('Auftragsliste: Mehrwertdienst mit Kundenmaterial und Vergütung',/Mehrwertdienst · Lohnfertigung/.test(body)&&/Kundenmaterial/.test(body)&&/Vergütung \/ Stück/.test(body));
 ok('Aufträge ohne Überlauf',await noOverflow());await shot('ui-015-mwd.png');
 ok('Kontostand unverändert (pausiert, nur Anzeige)',(await text('#cash'))===cash0,cash0);
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,200));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));await browser.close();server.kill();cleanup();
