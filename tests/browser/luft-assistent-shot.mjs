// A10 W3c-2: Screenshot Fenster „Luftexport“ mit laufendem Zubringer, den der Dispositionsassistent gestartet hat; Kopfzeile
// „Assistent an“ (docs/assets/luft-assistent-0.14.png). Kein Teil von `npm test`. Aufruf: node tests/browser/luft-assistent-shot.mjs.
// Spielstand entsteht mit echten Modulen (Luftvertrag angenommen, Pakete angeliefert und sortiert); Import über das JSON-Importfeld.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch,repo} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state;
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
cmd({type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd({type:'build',buildingType:'rack',x:2,y:2,rotation:0});cmd({type:'build',buildingType:'rack',x:5,y:2,rotation:0});
cmd({type:'hire',role:'warehouse'});cmd({type:'hire',role:'warehouse'});cmd({type:'hire',role:'driver'});cmd({type:'buyVehicle',vehicleType:'truck'});cmd({type:'buyVehicle',vehicleType:'van'});
for(let i=0;i<3000&&!s.contracts.some(k=>k.unit==='air');i++)sim.step(1);
const k=s.contracts.find(k=>k.unit==='air');if(!k)throw Error('kein Luftangebot');
cmd({type:'acceptContract',id:k.id});for(const w of s.workers)cmd({type:'setShift',id:w.id,shift:'all'});
cmd({type:'setAssistant',site:s.selectedSite,enabled:true});
for(let i=0;i<4000&&!s.airShuttles.some(x=>x.status==='transit');i++)sim.step(1);
if(!s.airShuttles.length)throw Error('Assistent hat keinen Zubringer gestartet');
const dir=mkdtempSync(join(tmpdir(),'luft-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];watch(page,errors,'luft-assistent');
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await page.waitForTimeout(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await page.waitForTimeout(800);
 await page.keyboard.press('x');await page.waitForTimeout(500);
 const title=await page.textContent('#panelTitle'),bodyText=await page.textContent('#panelBody'),head=await page.textContent('#assistLabel');
 if(title!=='Luftexport'||!/Nächste Flüge/.test(bodyText)||!/Fahrt zum Terminal/.test(bodyText))throw Error('Fenster Luftexport nicht wie erwartet: '+title);
 if(head!=='Assistent an')throw Error('Kopfzeile: '+head);
 if(await page.isHidden('#rail-air'))throw Error('Rail Luftexport fehlt');
 await page.screenshot({path:join(repo,'docs/assets/luft-assistent-0.14.png')});
 await page.keyboard.press('j');await page.waitForTimeout(400);
 if(!/Luftzubringer mit/.test(await page.textContent('#panelBody')))throw Error('Protokoll ohne Luftzubringer');
 console.log('OK Screenshot docs/assets/luft-assistent-0.14.png · Fenster Assistent mit Protokoll');
}catch(e){console.log('FEHLER',e.message);process.exitCode=1;}
if(errors.length){console.log('Konsolenfehler',errors.slice(0,3).join(' | '));process.exitCode=1;}
await browser.close();server.kill();cleanup();
