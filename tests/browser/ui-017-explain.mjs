// 0.17 (A04/A10-E): Browserprüfung Anlagenerklärung und Umbenennen in Chromium bei 1366×768 und 1920×1080. Kein Teil von `npm test`.
// Aufruf: node tests/browser/ui-017-explain.mjs [--shots <Verzeichnis>]. Spielstand mit echten Modulen, Import über das JSON-Feld.
// Prüft: Sortierplatz-Akte mit 5 Abschnitten, Umbenennen per Stift/Enter/Escape (Escape schließt das Fenster nicht), Name in Akte,
// Suche/Liste, Torbuch und Anlagenspiegel, Standort umbenennen, Name bleibt nach Speichern + Neuladen, Baumenü-Beschreibung,
// keine Konsolenfehler, Kontostand unverändert.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const sim=new Simulation({mode:'sandbox',seed:21});
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
const dock=cmd({type:'build',buildingType:'dock',x:2,y:10,rotation:0}).id;
cmd({type:'build',buildingType:'sorter',x:8,y:2,rotation:0});cmd({type:'build',buildingType:'rack',x:2,y:2,rotation:0});
cmd({type:'build',buildingType:'testing',x:12,y:6,rotation:0});
const dir=mkdtempSync(join(tmpdir(),'ui017e-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);
const errors=[],log=[];
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name}${detail?' · '+detail:''}`);if(!cond)process.exitCode=1;};
try{
 for(const [w,h] of [[1366,768],[1920,1080]]){
  const tag=`${w}×${h}`;const ctx=await browser.newContext({viewport:{width:w,height:h}});const page=await ctx.newPage();watch(page,errors,tag);
  const text=sel=>page.textContent(sel).catch(()=>'');const wait=ms=>page.waitForTimeout(ms);
  const shot=async n=>{if(shots)await page.screenshot({path:join(shots,`ui-017-${n}-${w}.png`)});};
  const search=async(q,pick)=>{await page.keyboard.press('Escape');await page.click('#cmd');await page.fill('#cmd',q);await wait(250);
   const hit=page.locator('#cmdResults button',{hasText:pick}).first();await hit.click();await wait(350);};
  await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
  await page.click('#welcome [data-action="start"]');await wait(500);
  await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
  await page.click('#confirm [data-action="confirmOk"]');await wait(800);
  await page.click('[data-speed="0"]');await wait(200);
  const cash0=await text('#cash');
  // Sortierplatz-Akte
  await search('Sortierplatz','Anlage');
  let body=await text('#panelBody');
  const secs=await page.locator('#panelBody .explain .xp-sec').count();
  ok(`${tag}: Sortierplatz-Akte mit 5 Abschnitten`,secs===5&&['Zweck','Voraussetzungen','Ablauf','Aktueller Zustand','Nächster Schritt'].every(t=>body.includes(t)),`${secs} Abschnitte`);
  ok(`${tag}: Zustand aus echtem Stand (keine Pakete, keine Lagerkraft)`,/Wartet auf Pakete im Wareneingang/.test(body)&&/Keine Lagerkraft am Standort/.test(body));
  ok(`${tag}: Typ sichtbar, Kennzahlen bleiben`,body.includes('Typ: Sortierplatz')&&body.includes('Kennzahlen')&&body.includes('Buchwert'));
  await shot('akte');
  // Escape verwirft und schließt das Fenster nicht
  await page.click('#panelBody .rename-btn');await page.fill('#panelBody .rename-input','Verwerfen');await page.keyboard.press('Escape');await wait(250);
  ok(`${tag}: Escape verwirft, Fenster bleibt offen`,await page.isVisible('#panel')&&!(await page.locator('#panelBody .rename-input').count())&&(await text('#panelBody h3'))==='Sortierplatz 1',await text('#panelBody h3'));
  // Enter bestätigt
  await page.click('#panelBody .rename-btn');await page.fill('#panelBody .rename-input','Sorter Nord');await page.keyboard.press('Enter');await wait(300);
  ok(`${tag}: Enter bestätigt, Name in Akte`,(await text('#panelBody h3'))==='Sorter Nord'&&(await text('#panelBody')).includes('Typ: Sortierplatz'));
  await shot('umbenannt');
  // Suche/Liste
  await page.keyboard.press('Escape');await page.click('#cmd');await page.fill('#cmd','Sorter Nord');await wait(250);
  ok(`${tag}: Name in Suchliste`,(await text('#cmdResults')).includes('Sorter Nord'));
  await page.keyboard.press('Escape');
  // Dock umbenennen → Torbuch
  await search('Dock 1','Anlage');
  await page.click('#panelBody .rename-btn');await page.fill('#panelBody .rename-input','Rampe Ost');await page.keyboard.press('Enter');await wait(300);
  await page.keyboard.press('Escape');await page.keyboard.press('h');await wait(400);
  ok(`${tag}: Dockname im Torbuch`,(await text('#panelBody')).includes('Rampe Ost'));
  // Anlagenspiegel
  await search('Anlagenspiegel','GuV');
  body=await text('#panelBody');
  ok(`${tag}: Name im Anlagenspiegel`,body.includes('Sorter Nord (Sortierplatz)')&&body.includes('Rampe Ost (Laderampe)'));
  await page.keyboard.press('Escape');
  // Standort umbenennen
  await page.click('#siteBtn');await wait(200);await page.click('#siteList .rename-btn');await page.fill('#siteList .rename-input','Hub Nord');await page.keyboard.press('Enter');await wait(300);
  ok(`${tag}: Standortname in Kopfzeile und Menü`,(await text('#siteName'))==='Hub Nord'&&(await text('#siteList')).includes('Hub Nord'),await text('#siteName'));
  await page.keyboard.press('Escape');
  // Baumenü
  await page.keyboard.press('b');await wait(300);await page.click('[data-build="sorter"]');await wait(200);
  const tray=await text('#buildItems');
  ok(`${tag}: Baumenü mit Beschreibung und Platzierungshinweis`,tray.includes('Sortiert 300 Pakete/h')&&/keine Wirkung/.test(tray)&&/Tor/.test(tray));
  await shot('baumenue');
  await page.keyboard.press('Escape');await wait(200);
  ok(`${tag}: Kontostand unverändert`,(await text('#cash'))===cash0,`${cash0} → ${await text('#cash')}`);
  // Speichern und Neuladen
  await page.locator('button[data-panel="settings"]:visible').first().click();await page.click('#panelBody [data-action="save"]');await wait(800);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#clock')&&!document.querySelector('#welcome')?.open,null,{timeout:15000}).catch(()=>{});await wait(800);
  await search('Sorter Nord','Anlage');
  ok(`${tag}: Namen bleiben nach Neuladen`,(await text('#panelBody h3'))==='Sorter Nord'&&(await text('#siteName'))==='Hub Nord',`${await text('#panelBody h3')} · ${await text('#siteName')}`);
  await ctx.close();
 }
 ok('Keine Konsolen- oder Seitenfehler',!errors.length,errors.join(' | '));
}catch(e){ok('Ablauf',false,e.stack||e.message);}
finally{await browser.close();server.kill();cleanup();}
console.log(log.join('\n'));
