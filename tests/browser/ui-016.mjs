// A10 0.16: Browserprüfung der neuen Oberflächen (Wetter & Störungen, Personalrollen, Kundendienst-Ausbau, Zufriedenheit,
// Linienankunft nach Schichtende) in Chromium. Kein Teil von `npm test`. Aufruf: node tests/browser/ui-016.mjs [--shots <Verzeichnis>].
// Spielstand entsteht mit echten Modulen (Seed 13: Torstörung mit wartendem Fremd-Lkw), danach zweiter Standort mit Linie, deren
// Nachmittagsabfahrt nach Schichtende der Ziel-Lagerkraft ankommt. Import über das JSON-Importfeld wie ein Spieler.
// Prüft zusätzlich: keine Konsolenfehler, kein waagerechter Überlauf (Fenster und Panel, auch bei 1024 px), Kontostand unverändert.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const sim=new Simulation({mode:'sandbox',seed:13}),s=sim.state;
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
cmd({type:'build',buildingType:'dock',x:2,y:10,rotation:0});cmd({type:'build',buildingType:'rack',x:2,y:2,rotation:0});
for(let i=0;i<2;i++){const id=cmd({type:'hire',role:'warehouse'}).id;cmd({type:'setShift',id,shift:'all'});}
cmd({type:'buyVehicle',vehicleType:'van'});
for(let i=0;i<6*1440&&!s.yard.some(a=>a.waitReason==='Torstörung');i++){for(const k of s.contracts)if(k.status==='offer'&&s.contracts.filter(x=>x.status==='active').length<3)sim.command({type:'acceptContract',id:k.id});sim.step(1);}
if(!s.yard.some(a=>a.waitReason==='Torstörung'))throw Error('keine Torstörung');
cmd({type:'hire',role:'forklift'});cmd({type:'hire',role:'gate'});
const B=cmd({type:'buySite',name:'Ziel-Hub Birkenau'}).id;cmd({type:'build',buildingType:'dock',site:B,x:2,y:10,rotation:0});cmd({type:'hire',role:'warehouse',site:B});
const truck=cmd({type:'buyVehicle',vehicleType:'truck',site:'site-1'}).id;cmd({type:'createLine',from:'site-1',to:B,departures:[950,540],vehicleId:truck});
const dir=mkdtempSync(join(tmpdir(),'ui016-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],log=[];watch(page,errors,'ui-016');
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name}${detail?' · '+detail:''}`);if(!cond)process.exitCode=1;};
const text=sel=>page.textContent(sel).catch(()=>'');
const wait=ms=>page.waitForTimeout(ms);
const noOverflow=()=>page.evaluate(()=>{const b=document.querySelector('#panelBody'),d=document.documentElement;return b.scrollWidth<=b.clientWidth+1&&d.scrollWidth<=window.innerWidth+1;});
const overflowWho=()=>page.evaluate(()=>{const b=document.querySelector('#panelBody'),r=b.getBoundingClientRect(),d=document.documentElement;const out=[`body ${b.scrollWidth}/${b.clientWidth} doc ${d.scrollWidth}/${window.innerWidth}`];for(const e of b.querySelectorAll('*')){const x=e.getBoundingClientRect();if(x.right>r.right+1&&x.width>0)out.push((e.tagName+'.'+e.className+' '+Math.round(x.right-r.right)).slice(0,80));}return out.slice(0,5).join(' | ');});
const shot=async name=>{if(shots)await page.screenshot({path:join(shots,name)});};
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await wait(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await wait(800);
 await page.click('[data-speed="0"]');await wait(300);
 const cash0=await text('#cash');
 // Kopfzeile, Standortfluss, Glocke
 ok('Wetter in der Kopfzeile sichtbar',await page.isVisible('#siteWeather'),await text('#siteWeather'));
 ok('Wettersymbol gezeichnet',await page.evaluate(()=>document.querySelector('#siteWeatherIc').childElementCount>0));
 ok('Station Wetter & Störungen mit Torstörung',await page.isVisible('#stl-disrupt')&&/Torstörung noch/.test(await text('#st-disrupt-sub')),await text('#st-disrupt-sub'));
 await page.click('#bellBtn');await wait(300);
 ok('Glocke meldet Torstörung',/Torstörung · /.test(await text('#bellList')));await shot('ui-016-glocke.png');
 await page.keyboard.press('Escape');await page.click('#bellBtn');await wait(200);
 if(await page.isVisible('#bellMenu'))await page.click('#bellBtn');
 // Torbuch
 await page.keyboard.press('h');await wait(400);let body=await text('#panelBody');
 ok('Torbuch: Wartegrund Torstörung mit Restdauer',/Torstörung/.test(body)&&/Torkontrolle steht bis \d\d:\d\d/.test(body));
 ok('Torbuch: Verspätung durch Wetter',/Min\. Wetter · geplant/.test(body));
 ok('Torbuch ohne Überlauf',await noOverflow());await shot('ui-016-torbuch.png');
 // Fenster Wetter & Störungen über die Station
 await page.click('#st-disrupt');await wait(400);body=await text('#panelBody');
 ok('Fenster Wetter & Störungen',(await text('#panelTitle'))==='Wetter & Störungen'&&/Wetter je Standort/.test(body)&&/Aktive Störungen/.test(body)&&/noch \d/.test(body),await text('#panelTitle'));
 ok('Störungsfenster ohne Überlauf',await noOverflow());await shot('ui-016-stoerungen.png');
 // Personal
 await page.click('[data-panel="staff"]');await wait(400);body=await text('#panelBody');
 ok('Personal: Rollenerklärung und Spezialisten',/25 % schneller beim Staplerumschlag/.test(body)&&/Staplerfahrer · Spezialist \+25 %/.test(body)&&/Torposten · Spezialist \+25 %/.test(body));
 ok('Personal ohne Überlauf',await noOverflow());
 // Kundendienst
 await page.click('[data-panel="service"]');await wait(400);body=await text('#panelBody');
 ok('Kundendienst: Auslöser und Antwortfrist',/Auslöser/.test(body)&&/Antwortfrist/.test(body));
 ok('Kundendienst ohne Überlauf',await noOverflow());
 // Verträge
 await page.keyboard.press('Escape');await wait(150);await page.keyboard.press('v');await wait(400);body=await text('#panelBody');
 ok('Verträge: Zufriedenheit Versender als Balken',/Zufriedenheit Versender/.test(body)&&await page.locator('#panelBody .progress.sat').count()>0);
 ok('Verträge ohne Überlauf',await noOverflow());await shot('ui-016-vertraege.png');
 // Linien
 await page.keyboard.press('Escape');await wait(150);await page.keyboard.press('n');await wait(400);body=await text('#panelBody');
 ok('Linie: Warnung Ankunft nach Schichtende',/Ankunft nach Schichtende/.test(body)&&/15:50 → Ankunft/.test(body)&&!/09:00 → Ankunft/.test(body));
 ok('Linien ohne Überlauf',await noOverflow(),await overflowWho());await shot('ui-016-linien.png');
 // Einstellungen: Schalter Störungen über den vorhandenen Befehl
 await page.click('.topbar .icon-btn[data-panel="settings"]');await wait(400);
 const box=page.locator('#panelBody input[data-setting="incidents"]');
 ok('Einstellung Wetter & Störungen vorhanden und an',await box.count()===1&&await box.isChecked());
 await box.uncheck();await wait(300);await page.click('#st-disrupt');await wait(400);
 ok('Störungen aus: Fenster zeigt Zustand',/Aus: keine neuen Störungen/.test(await text('#panelBody')));
 await page.locator('#panelBody input[data-setting="incidents"]').check();await wait(300);
 ok('Störungen wieder an',/An: Wetter je Standort/.test(await text('#panelBody')),await text('#toast'));
 // Schmales Fenster: Kopfzeile ohne Überlauf
 await page.setViewportSize({width:1024,height:768});await wait(400);
 ok('1024 px: kein waagerechter Überlauf',await noOverflow(),await overflowWho());await shot('ui-016-schmal.png');
 ok('Kontostand unverändert (pausiert, nur Anzeige)',(await text('#cash'))===cash0,cash0);
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,200));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));await browser.close();server.kill();cleanup();
