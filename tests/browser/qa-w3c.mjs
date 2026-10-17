// A11 · Browser-QS Release 0.14 (Replay, Fenster Luftexport X und Assistent J). Nicht Teil von `npm test`.
// Aufruf: node tests/browser/qa-w3c.mjs  (Playwright global, tmp-Kopie, Testhilfe __qa nur in der Kopie).
// Probe (Node, reguläre Befehle): Hub mit Luftvertrag, sortierte Luftpakete im Lager, freie Lkw, offene Paketangebote.
import {appendFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(2);}
const ok=(n,c,d='')=>{console.log(`${c?'OK  ':'FEHL'} ${n} ${d}`);if(!c)process.exitCode=1;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state,c=x=>{const r=sim.command(x);if(!r.ok)throw Error(x.type+': '+r.message);return r;};
for(const [t,x,y] of [['dock',2,10],['dock',6,10],['rack',2,2],['rack',5,2],['rack',8,2]])c({type:'build',buildingType:t,x,y,rotation:0});
for(let i=0;i<3;i++){c({type:'hire',role:'warehouse'});c({type:'hire',role:'driver'});}
for(const w of s.workers)c({type:'setShift',id:w.id,shift:'all'});
c({type:'buyVehicle',vehicleType:'truck'});c({type:'buyVehicle',vehicleType:'van'});
sim.step(1980-s.t);const k=s.contracts.find(x=>x.status==='offer'&&x.unit==='air');c({type:'acceptContract',id:k.id});
for(let i=0;i<3000&&!s.orders.some(o=>o.airExport&&sim.api.inventory.available('parcel','site-1',o.id)>=1);i++)sim.step(1);
const dir=mkdtempSync(join(tmpdir(),'qa-w3c-'));const file=join(dir,'probe.json');writeFileSync(file,sim.serialize());
console.log(`Probe t=${s.t}, Luftvertrag ${k.id} Flüge ${k.flights}, Angebote ${s.contracts.filter(x=>x.status==='offer').length}`);

const {root,cleanup}=prepareRoot(false);
appendFileSync(join(root,'dist/app.js'),'\n;globalThis.__qa={sim:()=>sim};\n');
const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];watch(page,errors,'w3c');
const S=(f,a)=>page.evaluate(f,a);
const live=()=>S(()=>__qa.sim().serialize());
const tNow=()=>S(()=>__qa.sim().state.t);
const speedOn=n=>S(n=>document.querySelector(`[data-speed="${n}"]`).classList.contains('active'),n);
const idb=()=>S(()=>new Promise((res,rej)=>{const r=indexedDB.open('industrie-logistik-v1');r.onsuccess=()=>{const g=r.result.transaction('saves','readonly').objectStore('saves').get('industrie-logistik-v1-sandbox');g.onsuccess=()=>res(g.result);g.onerror=()=>rej(g.error);};r.onerror=()=>rej(r.error);}));
const toastText=()=>page.textContent('#toast').catch(()=>'');
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await wait(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await wait(1000);
 ok('Probe importiert',await tNow()===s.t,String(await tNow()));
 // Fenster Luftexport (X) und Assistent (J)
 await page.locator('#world').focus();await page.keyboard.press('x');await wait(400);
 const air=await page.textContent('#panelBody');ok('Fenster Luftexport (X)',await page.textContent('#panelTitle')==='Luftexport'&&/Annahmeschluss/.test(air),air.replace(/\s+/g,' ').slice(0,160));
 const form=page.locator('#panelBody form[data-form="air"]');ok('Zubringer-Formular vorhanden',await form.count()>0);
 await page.keyboard.press('Escape');await wait(200);await page.keyboard.press('j');await wait(400);
 const asb=await page.textContent('#panelBody');ok('Fenster Assistent (J)',/assistent/i.test(await page.textContent('#panelTitle'))&&/Tagesbudget/.test(asb),asb.replace(/\s+/g,' ').slice(0,160));
 await page.click('#panelBody [data-action="assistToggle"]');await wait(300);
 ok('Assistent per Fenster eingeschaltet',await S(()=>!!__qa.sim().state.assistant?.sites?.['site-1']?.enabled));
 await page.click('#panelBody [data-action="assistToggle"]');await wait(300);
 ok('Assistent per Fenster ausgeschaltet',await S(()=>__qa.sim().state.assistant?.sites?.['site-1']?.enabled===false));
 await page.keyboard.press('Escape');await wait(200);
 // 60+ Spielminuten bei 12×
 const t0=await tNow();await page.click('[data-speed="12"]');
 await page.waitForFunction(t=>__qa.sim().state.t>=t+65&&document.getElementById('replayBtn').dataset.snapshots==='13',t0,{timeout:40000,polling:200});
 ok('65 Spielminuten bei 12×, 13 Momentaufnahmen',true,`${t0}→${await tNow()}`);
 // Replay öffnen (Z), −30
 await page.locator('#world').focus();await page.keyboard.press('z');await wait(300);
 const before=await live(),tB=await tNow();
 ok('Replay offen, Simulation pausiert',!(await page.locator('#replayBar').isHidden())&&await speedOn(0));
 await S(()=>{const r=document.getElementById('replayRange');r.value='-30';r.dispatchEvent(new Event('input',{bubbles:true}));});await wait(500);
 const label=await page.textContent('#replayLabel');ok('Replay −30',/Replay −(2[6-9]|3[0-4]) Min\./.test(label),label);
 // Sperren: Tasten
 await page.keyboard.press('b');await wait(150);ok('Taste B gesperrt',await page.locator('#buildTray').isHidden());
 await page.keyboard.press('3');await wait(150);ok('Taste 3 (Tempo) gesperrt',await speedOn(0));
 await page.keyboard.press(' ');await wait(150);ok('Leertaste gesperrt',await speedOn(0));
 await page.click('[data-speed="12"]');await wait(150);ok('Tempo-Knopf gesperrt',await speedOn(0));
 // Sperren: Palette
 const pal=async(q,n)=>{await page.click('#cmd');await page.fill('#cmd',q);await wait(250);await page.keyboard.press('Enter');await wait(300);const tt=await toastText();await page.fill('#cmd','');await page.locator('#world').focus();await wait(100);ok(`Replay noch offen nach Palette „${q}“`,!(await page.locator('#replayBar').isHidden()));return tt;};
 let tt=await pal('Tempo 12');ok('Palette Tempo gesperrt',await speedOn(0)&&/gesperrt/.test(tt),tt);
 tt=await pal('Vertrag annehmen');ok('Palette Vertrag annehmen gesperrt',/gesperrt/.test(tt)&&!(await S(()=>__qa.sim().state.contracts.filter(x=>x.status!=='offer').length>1)),tt);
 tt=await pal('Bauen: ');ok('Palette Bauen gesperrt',await page.locator('#buildTray').isHidden(),tt);
 tt=await pal('Assistent einschalten');ok('Palette Assistent gesperrt',await S(()=>__qa.sim().state.assistant?.sites?.['site-1']?.enabled===false),tt);
 // Sperren: Vertrag annehmen per Knopf, Zubringer starten per Formular
 await page.keyboard.press('v');await wait(400);
 const acc=page.locator('#panelBody [data-action="acceptContract"]').first();
 if(await acc.count()){await acc.click();await wait(200);}
 ok('Vertragsknopf im Replay ohne Wirkung',(await live())===before,`Knopf ${await acc.count()}`);
 await page.click('[data-action="close"]');await wait(100);await page.locator('#world').focus();await page.keyboard.press('x');await wait(400);
 const f2=page.locator('#panelBody form[data-form="air"]');
 if(await f2.count()){const btn=f2.locator('button[type="submit"], button:not([type])').first();if(await btn.count())await btn.click();else await f2.evaluate(f=>f.requestSubmit());await wait(200);}
 ok('Zubringer starten im Replay ohne Wirkung',(await live())===before&&!(await S(()=>__qa.sim().state.airShuttles.length)),`Formular ${await f2.count()}`);
 ok('Fenster Luftexport im Replay bedienbar',await page.textContent('#panelTitle')==='Luftexport');
 await page.click('[data-action="close"]');await wait(100);
 // Speichern im Replay = Live
 await page.click('#cmd');await page.fill('#cmd','Spiel speichern');await wait(250);await page.keyboard.press('Enter');await wait(800);
 const raw=await idb(),saved=typeof raw==='string'?raw:raw?.value;console.log('IDB-Typ',typeof raw,raw&&typeof raw==='object'?Object.keys(raw):'');ok('Speichern im Replay schreibt Live-Stand in IndexedDB',saved===before,`IDB ${saved?.length} Zeichen, t=${(()=>{try{return JSON.parse(saved).t;}catch{return '?';}})()} live t=${tB}`);
 // Abspielen ×4 kurz, dann Live
 await page.click('#replayPlay');await wait(1500);
 ok('Kein Fachzustand verändert durch Replay',(await live())===before);
 await page.click('#replayBar [data-action="replayLive"]');await wait(300);
 ok('Live: Leiste zu, Tempo 12× wieder',await page.locator('#replayBar').isHidden()&&await speedOn(12));
 await wait(1500);ok('Live läuft weiter',await tNow()>tB,`${tB}→${await tNow()}`);
 await page.click('[data-speed="0"]');await wait(200);
 // Zubringer live über das Fenster (Gegenprobe: Formular wirkt außerhalb Replay)
 await page.keyboard.press('x');await wait(400);
 const f3=page.locator('#panelBody form[data-form="air"]');
 if(await f3.count()){const btn=f3.locator('button[type="submit"], button:not([type])').first();if(await btn.count())await btn.click();else await f3.evaluate(f=>f.requestSubmit());await wait(300);}
 ok('Zubringer starten live wirkt',await S(()=>__qa.sim().state.airShuttles.length)>=1,await toastText());
 await page.screenshot({path:join(dir,'luftexport.png')});console.log('Screenshot',dir);
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,300));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
await browser.close();server.kill();cleanup();
