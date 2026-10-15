// Browser-Rauchtest mit echtem Chromium (Playwright). Nicht Teil von `npm test`.
// Aufruf: npm run test:browser   (Optionen: --repo = Repo-Root direkt ausliefern statt tmp-Kopie, --headed)
// Ablauf: statischer Server → index.html (mit <base href="./dist/">) → Gründen → Panels → 30 s bei 12× →
// Autosave → Neuladen lädt Stand → JSON-Export → „Spiel als HTML speichern“ → Download per file:// öffnen.
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';

const args=new Set(process.argv.slice(2));
const STORE='industrie-logistik-v1-guided';
const log=(...a)=>console.log('·',...a);
const checks=[];
function check(name,ok,detail=''){checks.push({name,ok:!!ok,detail});console.log(ok?'  ok ':'  FEHLER',name,detail?('· '+detail):'');}

const storedT=page=>page.evaluate(k=>{const raw=localStorage.getItem(k);return raw?JSON.parse(raw).t:null;},STORE);
const clock=page=>page.locator('#clock').textContent();
const minutesOf=text=>{const m=/Tag (\d+) · (\d\d):(\d\d)/.exec(text||'');return m?(+m[1]-1)*1440+ +m[2]*60+ +m[3]:NaN;};

const pw=loadPlaywright();
if(!pw){console.error('Playwright nicht gefunden (lokal oder global). Kein Download, keine Installation.');process.exit(2);}
const {root,cleanup}=prepareRoot(args.has('--repo'));
// Downloads immer in eigenes tmp-Verzeichnis, auch bei --repo (QS-W0-09): Repo bleibt unverändert.
const downloads=mkdtempSync(join(tmpdir(),'logistics-smoke-dl-'));
const {server,url}=await startServer(root);
const browser=await pw.chromium.launch({...pw.launchOptions,headless:!args.has('--headed')});
const errors=[];
let exitCode=1;
try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1600,height:900}});
 const page=await context.newPage();watch(page,errors,'http');
 log('Öffne',url+'index.html');
 await page.goto(url+'index.html');
 await page.waitForFunction(()=>document.querySelector('#welcome')?.open===true,null,{timeout:15000});
 check('Willkommensdialog sichtbar',true);
 check('WebGL verfügbar (Software)',await page.evaluate(()=>{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}));
 await page.click('#welcome [data-action="start"]');
 await page.waitForFunction(()=>!document.querySelector('#welcome').open,null,{timeout:10000}).catch(async e=>{throw Error(e.message+' · Toast: '+await page.locator('#toast').textContent()+' · Status: '+await page.locator('#statusText').textContent());});
 const renderer=page=>page.evaluate(()=>{const c=document.querySelector('#world');return c?.dataset.renderer||(c?.getContext&&'3d (kein 2D-Rückfall markiert)')||'?';});
 check('Szene: 3D aktiv (kein 2D-Rückfall)',(await renderer(page))!=='2d',await renderer(page));
 const t0=await storedT(page);check('Gründung gespeichert',t0===480,'t='+t0);
 await page.click('[data-speed="1"]');
 for(const panel of ['overview','production','inventory','purchasing','staff','orders','fleet','finance','service','settings']){
  await page.locator(`button[data-panel="${panel}"]:visible`).first().click();
  const visible=await page.evaluate(()=>!document.querySelector('#panel').hidden&&document.querySelector('#panelBody').innerHTML.length>0);
  check('Panel '+panel+' geöffnet',visible,await page.locator('#panelTitle').textContent());
 }
 await page.keyboard.press('Escape');
 await page.click('[data-speed="12"]');
 const clockStart=minutesOf(await clock(page));
 log('30 s Echtzeit bei 12× …');
 await page.waitForTimeout(30000);
 const clockEnd=minutesOf(await clock(page));
 check('Spielzeit läuft bei 12×',clockEnd-clockStart>=300,`${clockEnd-clockStart} Spielminuten in 30 s (Soll ≈ 360)`);
 const tAuto=await storedT(page);
 check('Autosave im Leerlauf geschrieben',tAuto>480,'gespeichert t='+tAuto+' · Status: '+await page.locator('#statusText').textContent());
 check('Backup = zuvor geschriebener Stand',await page.evaluate(k=>{const b=localStorage.getItem(k+'-backup');return !!b&&JSON.parse(b).t===480;},STORE));
 const beforeReload=minutesOf(await clock(page));
 await page.reload();
 await page.waitForFunction(()=>/Tag \d+/.test(document.querySelector('#clock').textContent),null,{timeout:15000});
 await page.waitForTimeout(500);
 const afterReload=minutesOf(await clock(page));
 check('Neuladen lädt Spielstand',!await page.evaluate(()=>document.querySelector('#welcome').open)&&afterReload>480&&afterReload<=beforeReload+5,`vor ${beforeReload} · nach ${afterReload} Min.`);
 await page.locator('button[data-panel="settings"]:visible').first().click();
 const [jsonDownload]=await Promise.all([page.waitForEvent('download'),page.click('#panelBody [data-action="export"]')]);
 const json=JSON.parse(readFileSync(await jsonDownload.path(),'utf8'));
 check('JSON-Export gültig',json.schema===1&&json.mode==='guided'&&json.t>=afterReload,`${jsonDownload.suggestedFilename()} · t=${json.t}`);
 const [htmlDownload]=await Promise.all([page.waitForEvent('download'),page.click('#panelBody [data-action="exportHtml"]')]);
 const htmlPath=join(downloads,'export-'+Date.now()+'.html');await htmlDownload.saveAs(htmlPath);
 const exported=readFileSync(htmlPath,'utf8');
 const embedded=JSON.parse(/<script id="embedded-save" type="application\/json">([\s\S]*?)<\/script>/.exec(exported)[1]);
 check('HTML-Download enthält Spielstand',embedded.t>=json.t,`${htmlDownload.suggestedFilename()} · ${(exported.length/1024).toFixed(0)} KB · t=${embedded.t}`);
 const file=await context.newPage();watch(file,errors,'file');
 await file.goto(pathToFileURL(htmlPath).href);
 await file.waitForFunction(()=>/Tag \d+/.test(document.querySelector('#clock').textContent),null,{timeout:15000});
 await file.waitForTimeout(300);
 const fileClock=minutesOf(await clock(file));
 const paused=await file.evaluate(()=>document.querySelector('[data-speed="0"]').classList.contains('active'));
 await file.waitForTimeout(2500);
 check('file://: Spielstand geladen und pausiert (Uhr steht 2,5 s)',fileClock===embedded.t&&minutesOf(await clock(file))===fileClock&&!await file.evaluate(()=>document.querySelector('#welcome').open),`Uhr ${fileClock} · eingebettet ${embedded.t}`);
 // Bekannter Anzeigefehler (A10): Simulation pausiert, Geschwindigkeitsleiste markiert aber weiter 1×. Nur Hinweis.
 const activeSpeed=await file.evaluate(()=>document.querySelector('#speeds .active')?.dataset.speed);
 if(!paused)console.log('  HINWEIS file://: Pause-Schaltfläche nicht markiert, aktive Stufe data-speed='+activeSpeed);
 check('file://: Szene 3D aktiv (gebündeltes three.js)',(await renderer(file))!=='2d',await renderer(file));
 check('file://: Hinweis temporärer Modus',(await file.locator('#toast').textContent()).includes('HTML-Spielstand geladen'),await file.locator('#toast').textContent());
 check('Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
 exitCode=checks.every(c=>c.ok)?0:1;
}catch(e){console.error(e);check('Ablauf ohne Ausnahme',false,e.message);}
finally{await browser.close();server.kill();cleanup();rmSync(downloads,{recursive:true,force:true});}
console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok).length,errors},null,1));
process.exit(exitCode);
