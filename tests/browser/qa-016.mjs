// A11 0.16: unabhängige Browserprüfung (Chromium) – Netzstörung in Station/Fenster, Entsorgung gesperrter Fremd-Kühlpakete über
// die Kühlkette (Nachprüfung B-0.16-2) mit Kontostand, Anliegen in Bearbeitung ohne Kundendienstkraft mit verfehlter Frist
// (Nachprüfung B-0.16-1). Kein Teil von `npm test`. Aufruf: node tests/browser/qa-016.mjs (nach python3 scripts/package.py).
// Spielstand mit echten Modulen; Störungslage und Kühlschaden als Testaufbau (wie tests/qa-016.test.js), Import wie ein Spieler.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state;
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
cmd({type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd({type:'build',buildingType:'rack',x:2,y:2,rotation:0});cmd({type:'build',buildingType:'coldstore',x:9,y:6,rotation:0});
for(const role of ['warehouse','driver']){const id=cmd({type:'hire',role}).id;cmd({type:'setShift',id,shift:'all'});}
cmd({type:'buyVehicle',vehicleType:'van'});
const k=s.contracts[0];cmd({type:'acceptContract',id:k.id});cmd({type:'cancelContract',id:k.id});delete k.penaltyOpen;k.content='parcel_cold';
const T=2*1440+600;s.t=T-1;
s.disruptions={day:3,weather:{'site-1':{kind:'clear',since:T-1,until:3*1440}},events:[{id:'disruption-qa-grid',kind:'grid',site:'site-1',startT:T-10,endT:T+120,text:'Netzstörung Depot Morgenfeld: Netzstrom fällt 130 Min. aus, nur Energiegebäude liefern Strom.'}],log:[]};
const oid=sim.api.id('order');
s.orders.push({id:oid,kind:'logistics',source:'hub',contractId:k.id,lane:k.lanes[0].id,customer:`QA Kühlbezirk (${k.shipper})`,item:'parcel_cold',qty:30,price:9,due:T+150,quality:0,site:'site-1',status:'active',delivered:0,paid:0});
if(!sim.api.inventory.add({item:'parcel_cold',qty:30,site:'site-1',owner:oid,location:'stock',quality:60,unitCost:0}))throw Error('Ware');
Object.assign(s.batches.find(b=>b.owner===oid),{coldDamaged:true,blocked:true});
sim.step(1);
// Anliegen (automatisch, Störungsverzug) beantworten ohne Kundendienstkraft und Frist verstreichen lassen.
const t=s.tickets.find(x=>x.orderId===oid&&x.kind==='status');if(!t)throw Error('kein Störungsanliegen');
cmd({type:'respondTicket',id:t.id,response:'inform'});sim.step(t.respondBy-s.t+2);
s.disruptions.events.push({id:'disruption-qa-grid2',kind:'grid',site:'site-1',startT:s.t-5,endT:s.t+90,text:'Netzstörung Depot Morgenfeld: Netzstrom fällt 95 Min. aus, nur Energiegebäude liefern Strom.'}); // im importierten Stand aktiv (Testaufbau)
// Zweites Anliegen: manuell, ohne Kraft beantwortet, Frist noch offen (Status processing vor respondBy).
const oid2=sim.api.id('order');
s.orders.push({id:oid2,kind:'logistics',source:'hub',contractId:k.id,lane:k.lanes[0].id,customer:`QA Zweitbezirk (${k.shipper})`,item:'parcel_cold',qty:5,price:9,due:s.t+2000,quality:0,site:'site-1',status:'active',delivered:0,paid:0});
const t2=cmd({type:'createTicket',orderId:oid2,kind:'complaint'}).id;cmd({type:'respondTicket',id:t2,response:'apologize'});sim.step(2);
const dir=mkdtempSync(join(tmpdir(),'qa016-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],log=[];watch(page,errors,'qa-016');
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name}${detail?' · '+detail:''}`);if(!cond)process.exitCode=1;};
const befund=(id,name,cond,detail='')=>log.push(`${cond?'OK  ':'BEFUND '+id} ${name}${detail?' · '+detail:''}`); // bekannter Befund, kein Abbruch
const text=sel=>page.textContent(sel).catch(()=>'');
const wait=ms=>page.waitForTimeout(ms);
const euro=x=>Number(String(x).replace(/[^\d,-]/g,'').replace(',','.'));
const open=async panel=>{await page.evaluate(p=>document.querySelector(`[data-panel="${p}"]`).click(),panel);await wait(400);return text('#panelBody');};
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await wait(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await wait(800);
 await page.click('[data-speed="0"]');await wait(300);
 ok('Station zeigt Netzstörung',/Netz/.test(await text('#st-disrupt-sub')),await text('#st-disrupt-sub'));
 let body=await open('disruptions');
 ok('Fenster Wetter & Störungen nennt Netzstörung mit Restdauer',/Netzstörung/.test(body)&&/noch \d/.test(body));
 body=await open('service');
 ok('Kundendienst: Anliegen in Bearbeitung ohne Kraft, Frist verfehlt („nicht fristgerecht“)',/nicht fristgerecht/.test(body));
 const card=await page.evaluate(()=>[...document.querySelectorAll('#panelBody .card')].map(c=>c.textContent).find(x=>/QA Zweitbezirk/.test(x))||'');
 befund('QS-016-03','Anliegen in Bearbeitung ohne Kraft vor Fristende zeigt nicht „eingehalten“',card&&!/eingehalten/.test(card),card.replace(/\s+/g,' ').slice(0,200));
 body=await open('special');
 const btn=page.locator('#panelBody button[data-action="disposeBatch"]');
 ok('Kühlkette: Entsorgen-Knopf für gesperrte Fremdware',await btn.count()===1);
 const cash0=euro(await text('#cash'));
 await btn.click();await page.waitForFunction(()=>document.querySelector('#confirm')?.open);await page.click('#confirm [data-action="confirmOk"]');await wait(600);
 body=await text('#panelBody');
 ok('Nach Entsorgung keine Kühlware mehr',/Keine temperaturgeführte Ware/.test(body));
 ok('Kontostand −60 € (2 €/Stk.)',Math.abs(euro(await text('#cash'))-(cash0-60))<0.02,`${cash0} → ${await text('#cash')}`);
 ok('Entsorgen-Knopf nicht erneut',await page.locator('#panelBody button[data-action="disposeBatch"]').count()===0);
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,200));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));await browser.close();server.kill();cleanup();
