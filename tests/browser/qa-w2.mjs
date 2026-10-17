// A11 · Browser-QS Release 0.10 (Paletten). Nicht Teil von `npm test`. Aufruf: node tests/browser/qa-w2.mjs
// Probe-Zustand (Node, reguläre Befehle): Dock, 2 Regale, Lagerkraft, Fahrer, Lkw, t = 16:55 Tag 1, kein Staplerplatz.
// Import über die Oberfläche (#importFile). Danach nur Klicks: Staplerplatz bauen, Tempo 12, Palettenangebot annehmen,
// Hof & Docks: Torbuch zeigt Palettenankunft, Stapler-Abschnitt mit Akku. __qa (tmp-Kopie) nur zum Beobachten.
import {appendFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(2);}
const log=[];const ok=(n,c,d='')=>{log.push(`${c?'OK  ':'FEHL'} ${n} ${d}`);console.log(log.at(-1));if(!c)process.exitCode=1;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// Probe-Zustand
const sim=new Simulation({mode:'economy',seed:11});const c=x=>{const r=sim.command(x);if(!r.ok)throw Error(x.type+': '+r.message);};
c({type:'build',buildingType:'dock',x:2,y:13,rotation:0});c({type:'build',buildingType:'rack',x:8,y:2,rotation:0});c({type:'build',buildingType:'rack',x:4,y:2,rotation:0});
c({type:'hire',role:'warehouse'});c({type:'hire',role:'driver'});c({type:'buyVehicle',vehicleType:'truck'});
sim.step(1015-sim.state.t);
const dir=mkdtempSync(join(tmpdir(),'qa-w2-'));const file=join(dir,'probe.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot(false);
appendFileSync(join(root,'dist/app.js'),'\n;globalThis.__qa={sim:()=>sim};\n');
const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];watch(page,errors,'w2');
const S=f=>page.evaluate(f);
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('input[name="mode"][value="economy"]',{force:true});await page.click('#welcome [data-action="start"]');await wait(600);
 await page.setInputFiles('#importFile',file);await wait(400);await page.click('#confirm [data-action="confirmOk"]');await wait(1200);
 const t0=await S(()=>__qa.sim().state.t);ok('Probe importiert',t0===1015,`t=${t0}`);
 // Staplerplatz über den Baumodus
 await page.click('.rail [data-action="build"]');await wait(300);await page.click('[data-build="forklift"]');await wait(300);
 const p=await S(()=>{const c=document.querySelector('#world'),r=c.getBoundingClientRect(),p=c.__scene.cellToScreen(14,2);return {x:r.left+p.x,y:r.top+p.y};});
 await page.mouse.move(p.x,p.y);await wait(150);await page.mouse.click(p.x,p.y);await wait(400);
 // Rechtsklick beendet Baumodus ohne zweiten Bau
 await page.mouse.click(p.x+80,p.y+80,{button:'right'});await wait(300);
 const forks=await S(()=>__qa.sim().state.buildings.filter(b=>b.type==='forklift').length);ok('Staplerplatz gebaut (genau einer)',forks===1,`${forks}`);
 ok('Baumodus nach Rechtsklick zu',await page.locator('#buildTray').isHidden());
 // Tempo 12 bis Palettenangebot
 await page.click('[data-speed="12"]');
 await page.waitForFunction(()=>__qa.sim().state.contracts.some(k=>k.status==='offer'&&k.unit==='pallet'),null,{timeout:60000});
 await page.click('[data-speed="0"]');await wait(300);
 const offer=await S(()=>__qa.sim().state.contracts.find(k=>k.status==='offer'&&k.unit==='pallet').id);
 await page.click('[data-panel="contracts"]');await wait(400);
 const card=await page.locator('#panel').innerText();ok('Vertragsfenster nennt Palette/Stapler/Lkw',/Palette/.test(card)&&/Stapler/.test(card)&&/Lkw/.test(card));
 const pc=card.slice(card.indexOf('Paletten / Tag'));ok('Strafsätze im Palettenangebot sichtbar',/25\s*€/.test(pc)&&/60\s*€/.test(pc),(pc.match(/Vertragsstrafe[^\n]*/)||[''])[0]);
 await page.click(`[data-action="acceptContract"][data-id="${offer}"]`);await wait(500);
 ok('Palettenvertrag über UI angenommen',await S(()=>__qa.sim().state.contracts.find(k=>k.unit==='pallet'&&k.status==='active')!=null));
 // Bis Entladen (Tempo 12), dann Hof & Docks
 await page.click('[data-panel="yard"]');await wait(400);await page.click('[data-speed="12"]');
 await page.waitForFunction(()=>__qa.sim().state.yard.some(a=>a.item==='pallet'&&a.phase==='docking'),null,{timeout:180000});
 await page.click('[data-speed="1"]');
 await page.waitForFunction(()=>__qa.sim().state.yard.some(a=>a.item==='pallet'&&a.phase==='unloading'&&a.unloaded>=1),null,{timeout:30000});
 await page.click('[data-speed="0"]');await wait(600);
 const y=await page.locator('#panel').innerText();
 ok('Torbuch: Palettenankunft mit Menge in Paletten',/Torbuch/.test(y)&&/Paletten/.test(y),y.match(/\d+ \/ \d+ Palett\w*/)?.[0]||'');
 ok('Stapler-Abschnitt mit Akku',/Stapler 1/.test(y)&&/Akku \d+/.test(y),y.match(/Akku[^\n]{0,60}/)?.[0]||'');
 const fs=y.slice(y.lastIndexOf('Stapler 1'));ok('Stapler-Bindung sichtbar (Entladen)',/Akku \d+/.test(fs)&&/(KRM|TGD|WST|OHD|LCT|FBR|ESF|MWS)-|Entl/.test(fs),fs.slice(0,160).replace(/\n/g,' '));
 // Ladezwang: Akku auf 8 setzen ist Fachmanipulation → hier nur beobachten, ob Wartegrund bei Ladezwang angezeigt würde: übersprungen.
 await page.screenshot({path:join(dir,'yard.png')});console.log('Screenshot',join(dir,'yard.png'));
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,300));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
await browser.close();server.kill();cleanup();
