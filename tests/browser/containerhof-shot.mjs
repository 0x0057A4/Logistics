// A10 W3b-2: Screenshot Fenster „Containerhof“ mit Seeimport-Vertrag, Containern im Hof, Entladen und laufendem Lagergeld
// (docs/assets/containerhof-ui-0.13.png). Kein Teil von `npm test`. Aufruf: node tests/browser/containerhof-shot.mjs.
// Spielstand entsteht mit echten Modulen; Import über das JSON-Importfeld der Oberfläche.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch,repo} from './serve.mjs';
import {Simulation} from '../../dist/core.js';
import {OFFER_INTERVAL,OFFER_PHASE} from '../../dist/contracts.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const nextPhase=t=>{const r=((OFFER_PHASE-t)%OFFER_INTERVAL+OFFER_INTERVAL)%OFFER_INTERVAL;return r||OFFER_INTERVAL;};
let sim,s,k;
for(let seed=1;seed<80&&!k;seed++){
 sim=new Simulation({seed,mode:'sandbox'});s=sim.state;sim.command({type:'build',buildingType:'containeryard',x:12,y:8});sim.step(nextPhase(s.t));
 const x=s.contracts.find(c=>c.status==='offer'&&c.unit==='container');if(x&&x.content==='pallet'&&x.arrivals[0].containers>=3)k=x;
}
if(!k)throw Error('kein Seeimport-Angebot');
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
for(const [t,x,y] of [['rack',2,2],['rack',5,2],['rack',8,2],['forklift',16,2]])cmd({type:'build',buildingType:t,x,y});
cmd({type:'hire',role:'warehouse'});cmd({type:'hire',role:'driver'});for(const w of s.workers)w.shift='all';
cmd({type:'buyVehicle',vehicleType:'truck'});cmd({type:'acceptContract',id:k.id});k.freeMinutes=60;
for(let i=0;i<3000&&!s.containers.some(c=>c.demurrageMinutes>=70);i++)sim.step(1);
cmd({type:'build',buildingType:'dock',x:2,y:10});
for(let i=0;i<40&&!s.containers.some(c=>c.status==='unstuffing'&&c.unloaded>=4);i++)sim.step(1);
const dir=mkdtempSync(join(tmpdir(),'containerhof-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];watch(page,errors,'containerhof');
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await page.waitForTimeout(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await page.waitForTimeout(800);
 await page.keyboard.press('c');await page.waitForTimeout(500);
 const title=await page.textContent('#panelTitle'),bodyText=await page.textContent('#panelBody');
 if(title!=='Containerhof'||!/Lagergeld läuft seit/.test(bodyText)||!/Wird entladen/.test(bodyText))throw Error('Fenster Containerhof nicht wie erwartet: '+title);
 if(await page.isHidden('#stl-containeryard'))throw Error('Station Containerhof fehlt');
 await page.screenshot({path:join(repo,'docs/assets/containerhof-ui-0.13.png')});
 console.log('OK Screenshot docs/assets/containerhof-ui-0.13.png');
}catch(e){console.log('FEHLER',e.message);process.exitCode=1;}
if(errors.length){console.log('Konsolenfehler',errors.slice(0,3).join(' | '));process.exitCode=1;}
await browser.close();server.kill();cleanup();
