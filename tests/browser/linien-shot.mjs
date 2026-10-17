// A10 W3a-2: Screenshot Fenster „Linien“ mit zwei Standorten, Linie und laufender Fahrt (docs/assets/linien-0.12.png). Kein Teil von `npm test`.
// Aufruf: node tests/browser/linien-shot.mjs. Spielstand entsteht mit echten Modulen; Import über das JSON-Importfeld der Oberfläche.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch,repo} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
const A='site-1',B=cmd({type:'buySite',name:'Verteilzentrum Lindenhain'}).id;
for(const site of [A,B]){cmd({type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});cmd({type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});}
cmd({type:'build',buildingType:'rack',site:A,x:5,y:2,rotation:0});
for(const role of ['warehouse','warehouse','driver'])cmd({type:'hire',role,site:A});for(const role of ['warehouse','driver'])cmd({type:'hire',role,site:B});
for(const w of s.workers)w.shift='all';
const truck=cmd({type:'buyVehicle',vehicleType:'truck',site:A}).id;cmd({type:'buyVehicle',vehicleType:'van',site:B});
const k=s.contracts[0];cmd({type:'acceptContract',id:k.id});k.lastEta=1e9;
k.lanes=[{id:'lane-1',name:'Nordviertel',distance:20,site:A},{id:'lane-2',name:'Am Kanal',distance:25,site:B,surcharge:1.2,extraSla:240}];k.laneShare=[0.5,0.5];
for(const [to,qty] of [[B,60],[B,35],[A,40]]){const id=sim.api.id('order');s.orders.push({id,kind:'logistics',source:'hub',contractId:k.id,lane:to===B?'lane-2':'lane-1',customer:`${to===B?'Am Kanal':'Nordviertel'} (${k.shipper})`,item:'parcel',qty,price:9,due:s.t+1400,quality:0,site:A,deliverySite:to,status:'active',delivered:0,paid:0});sim.api.inventory.add({item:'parcel',qty,site:A,owner:id,location:'stock',quality:100,unitCost:0});}
cmd({type:'createLine',from:A,to:B,departures:[600,960],vehicleId:truck,cutoff:30});
for(let i=0;i<200&&!s.linehauls.some(x=>x.status==='transit');i++)sim.step(1);
const dir=mkdtempSync(join(tmpdir(),'linien-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];watch(page,errors,'linien');
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await page.waitForTimeout(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await page.waitForTimeout(800);
 await page.keyboard.press('n');await page.waitForTimeout(500);
 const title=await page.textContent('#panelTitle'),bodyText=await page.textContent('#panelBody');
 if(title!=='Linienverkehr'||!/Hauptlauf unterwegs/.test(bodyText))throw Error('Fenster Linien nicht wie erwartet: '+title);
 await page.screenshot({path:join(repo,'docs/assets/linien-0.12.png')});
 console.log('OK Screenshot docs/assets/linien-0.12.png');
}catch(e){console.log('FEHLER',e.message);process.exitCode=1;}
if(errors.length){console.log('Konsolenfehler',errors.slice(0,3).join(' | '));process.exitCode=1;}
await browser.close();server.kill();cleanup();
