// A11 · Browser-QS Release 0.12 (Linienverkehr). Nicht Teil von `npm test`. Aufruf: node tests/browser/qa-w3.mjs
// Probe-Zustand (Node, reguläre Befehle): zwei Standorte, echter Mischvertrag (Gebiete A und B), Pakete für B im Lager A, KEINE Linie.
// Import über die Oberfläche (#importFile). Danach Klicks: Fenster „Linien“ (Taste N), Formular ausfüllen, Linie einrichten,
// Tempo, Netzansicht, Auftragsakte mit Paketreise. __qa (tmp-Kopie) nur zum Beobachten.
import {appendFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(2);}
const ok=(n,c,d='')=>{console.log(`${c?'OK  ':'FEHL'} ${n} ${d}`);if(!c)process.exitCode=1;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const sim=new Simulation({mode:'sandbox',seed:1}),s=sim.state,c=x=>{const r=sim.command(x);if(!r.ok)throw Error(x.type+': '+r.message);return r;};
const A='site-1',B=c({type:'buySite',name:'Ziel-Hub Birkenau'}).id;
for(const [x,y] of [[2,10],[6,10]])c({type:'build',buildingType:'dock',site:A,x,y,rotation:0});
for(const x of [2,5])c({type:'build',buildingType:'rack',site:A,x,y:2,rotation:0});
c({type:'build',buildingType:'dock',site:B,x:2,y:10,rotation:0});c({type:'build',buildingType:'rack',site:B,x:2,y:2,rotation:0});
for(let i=0;i<3;i++){c({type:'hire',role:'warehouse',site:A});c({type:'hire',role:'driver',site:A});}
for(let i=0;i<2;i++)c({type:'hire',role:'warehouse',site:B});c({type:'hire',role:'driver',site:B});
c({type:'buyVehicle',vehicleType:'van',site:A});c({type:'buyVehicle',vehicleType:'truck',site:A});c({type:'buyVehicle',vehicleType:'van',site:B});
let k=null;for(let i=0;i<8000&&!k;i++){sim.step(1);k=s.contracts.find(x=>x.status==='offer'&&x.unit==='parcel'&&x.lanes.some(l=>l.site===B)&&x.lanes.some(l=>l.site===A));}
c({type:'acceptContract',id:k.id});
for(let i=0;i<3000&&!s.orders.some(o=>o.deliverySite===B&&s.batches.some(b=>b.owner===o.id&&b.site===A&&b.location==='stock'));i++)sim.step(1);
const bOrder=s.orders.find(o=>o.deliverySite===B);
const dir=mkdtempSync(join(tmpdir(),'qa-w3-'));const file=join(dir,'probe.json');writeFileSync(file,sim.serialize());
console.log(`Probe t=${s.t} (${Math.floor(s.t/1440)+1}. Tag ${String(Math.floor(s.t%1440/60)).padStart(2,'0')}:${String(s.t%60).padStart(2,'0')}), B-Auftrag ${bOrder.id}`);

const {root,cleanup}=prepareRoot(false);
appendFileSync(join(root,'dist/app.js'),'\n;globalThis.__qa={sim:()=>sim};\n');
const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];watch(page,errors,'w3');
const S=(f,a)=>page.evaluate(f,a);
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await wait(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await wait(1000);
 ok('Probe importiert',await S(()=>__qa.sim().state.sites.length)===2);
 // Glocke: Hauptlauf fehlt
 await page.click('#bellBtn');await wait(400);const bell=await S(()=>document.querySelector('#bellList')?.textContent||'');await page.keyboard.press('Escape');await wait(200);
 await page.keyboard.press('n');await wait(500);
 ok('Fenster Linien (N)',await page.textContent('#panelTitle')==='Linienverkehr');
 await page.fill('#lineForm input[name="departures"]','12:00, 15:00');
 const opts=await page.$$eval('#lineForm select[name="vehicleId"] option',os=>os.map(o=>[o.value,o.textContent]));
 const truck=opts.find(o=>/Lkw|truck/i.test(o[1]))?.[0]||opts.find(o=>o[0])?.[0];
 await page.selectOption('#lineForm select[name="vehicleId"]',truck);
 await page.click('#lineForm button.primary');await wait(600);
 const line=await S(()=>__qa.sim().state.lines[0]);
 ok('Linie über Formular angelegt',!!line&&line.from==='site-1'&&line.departures.join()==='720,900'&&line.vehicleId===truck,JSON.stringify(line&&{from:line.from,to:line.to,dep:line.departures,v:line.vehicleId}));
 ok('Linienkarte sichtbar',await page.locator('[data-line]').count()===1);
 ok('Glocke meldete fehlende Linie vorher',/Hauptlauf fehlt/.test(bell),bell.slice(0,120));
 // Tempo bis Hauptlauf unterwegs
 await page.click('[data-speed="12"]').catch(()=>page.keyboard.press('3'));
 for(let i=0;i<240&&!(await S(()=>__qa.sim().state.linehauls.some(x=>x.status==='transit')));i++)await wait(500);
 await page.keyboard.press(' ');await wait(300);
 const st=await S(()=>{const s=__qa.sim().state;return {t:s.t,lh:s.linehauls.map(x=>x.status)};});
 ok('Linienfahrt unterwegs',st.lh.includes('transit'),JSON.stringify(st));
 const body=await page.textContent('#panelBody').catch(()=>'');
 ok('Fenster zeigt laufende Fahrt',/Hauptlauf|unterwegs/i.test(body||''));
 // Netzansicht
 await S(()=>document.querySelector('#world').__scene?.setView?.('network'));await wait(1200);
 const net=await S(()=>{const sc=document.querySelector('#world').__scene;return {view:sc?.view,lines:sc?.netLineList?.length,trips:sc?.trips?.length};});
 ok('Netzansicht: Linie und Marker',net.lines===1&&net.trips===1,JSON.stringify(net));
 await page.screenshot({path:join(dir,'netz.png')});
 await S(()=>document.querySelector('#world').__scene?.setView?.('site'));await wait(300);
 // Auftragsakte mit Paketreise über die Suche
 await page.keyboard.press('/');await wait(300);
 await page.keyboard.type(bOrder.id);await wait(400);await page.keyboard.press('Enter');await wait(700);
 const title=await page.textContent('#panelTitle'),akte=await page.textContent('#panelBody');
 const journey=/Paketreise/.test(akte)&&/Hauptlauf/.test(akte)&&/Ziel-Hub|Birkenau/.test(akte);
 ok('Auftragsakte zeigt Paketreise',journey,`${title} · ${akte.slice(0,160).replace(/\s+/g,' ')}`);
 await page.screenshot({path:join(dir,'akte.png')});
 console.log('Screenshots',dir);
}catch(e){ok('Ablauf',false,e.message);}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
await browser.close();server.kill();cleanup();
