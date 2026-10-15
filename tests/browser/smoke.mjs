// Browser-Rauchtest mit echtem Chromium (Playwright). Nicht Teil von `npm test`.
// Aufruf: npm run test:browser   (Optionen: --repo = Repo-Root direkt ausliefern statt tmp-Kopie, --headed)
// Ablauf: statischer Server → index.html (mit <base href="./dist/">) → Gründen → Panels → 30 s bei 12× →
// Autosave → Neuladen lädt Stand → JSON-Export → „Spiel als HTML speichern“ → Download per file:// öffnen.
// W1b (A12, QS-W0-03): Spielstände liegen in IndexedDB. Zusätzlich: zweiter Tab schreibgeschützt, Schließen mit
// ungespeicherter Änderung, 5-MB-Stand speichern/laden, Migration localStorage → IndexedDB (eigene Browserkontexte).
import {bigState} from './big-state.mjs';
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

// Bestätigter Stand direkt aus IndexedDB (Datenbank = Präfix, Objektspeicher saves, Datensatz {value,at}).
const idbGet=(page,key)=>page.evaluate(key=>new Promise((resolve,reject)=>{const r=indexedDB.open('industrie-logistik-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('saves')){db.close();resolve(null);return;}const g=db.transaction('saves').objectStore('saves').get(key);g.onsuccess=()=>{db.close();resolve(g.result?.value??null);};g.onerror=()=>reject(g.error);};}),key);
const storedT=async(page,key=STORE)=>{const raw=await idbGet(page,key);return raw?JSON.parse(raw).t:null;};
const lsSaveKeys=page=>page.evaluate(()=>Object.keys(localStorage).filter(k=>/^industrie-logistik-v1-(guided|economy|sandbox)(-backup(-prev|-hold)?)?$/.test(k)));
// App fertig geladen (bootstrap: IndexedDB öffnen, Stand laden, Sperre): Status nicht mehr „wird geladen“, Uhr gesetzt oder Willkommensdialog.
const waitLoaded=page=>page.waitForFunction(()=>!/wird geladen/.test(document.querySelector('#statusText').textContent)&&(document.querySelector('#welcome').open||document.querySelector('#clock').textContent!=='Tag 1 · 08:00'),null,{timeout:30000});
const waitIdle=page=>page.waitForFunction(()=>!/^Wird gesichert/.test(document.querySelector('#statusText').textContent),null,{timeout:15000});
const clock=page=>page.locator('#clock').textContent();
const minutesOf=text=>{const m=/Tag (\d+) · (\d\d):(\d\d)/.exec(text||'');return m?(+m[1]-1)*1440+ +m[2]*60+ +m[3]:NaN;};

async function persistenceChecks(browser,url,errors){
 // a) Schließen mit ungespeicherter Änderung (beforeunload/visibilitychange → IndexedDB-Transaktion + Notfall-Kopie).
 {const ctx=await browser.newContext();const p=await ctx.newPage();watch(p,errors,'close');await p.goto(url+'index.html');
  await p.waitForFunction(()=>document.querySelector('#welcome')?.open===true,null,{timeout:15000});await p.click('#welcome [data-action="start"]');await waitIdle(p);
  await p.click('[data-speed="12"]');await p.waitForTimeout(4000);await p.click('[data-speed="0"]');await p.waitForTimeout(600);// HUD-Uhr aktualisiert mit 4 Hz
  const t=minutesOf(await clock(p));
  const closed=new Promise(r=>p.once('close',r));await p.close({runBeforeUnload:true});await closed;
  const q=await ctx.newPage();watch(q,errors,'close2');await q.goto(url+'index.html');await waitLoaded(q);await q.waitForTimeout(300);
  const t2=minutesOf(await clock(q));check('Schließen ohne Autosave: Neustart lädt letzten Stand',t2===t&&t>480,`vor ${t} · nach ${t2} Min.`);await ctx.close();}
 // b) 5-MB-Stand über JSON-Import speichern und nach Neuladen laden (localStorage fasst Haupt+Sicherung nur bis ≈ 2,6 MB).
 {const big=bigState(5),raw=big.serialize(),mb=(raw.length/1e6).toFixed(2);
  const ctx=await browser.newContext();const p=await ctx.newPage();watch(p,errors,'big');await p.goto(url+'index.html');
  await p.waitForFunction(()=>document.querySelector('#welcome')?.open===true,null,{timeout:15000});await p.click('#welcome [data-action="start"]');await waitIdle(p);
  await p.setInputFiles('#importFile',{name:'gross.json',mimeType:'application/json',buffer:Buffer.from(raw)});
  await p.waitForFunction(()=>document.querySelector('#confirm')?.open,null,{timeout:20000});await p.click('[data-action="confirmOk"]');
  await p.waitForFunction(()=>/^Gesichert/.test(document.querySelector('#statusText').textContent),null,{timeout:30000}).catch(()=>{});
  const status=await p.locator('#statusText').textContent(),saved=await idbGet(p,'industrie-logistik-v1-sandbox');
  check(`5-MB-Stand gespeichert (${mb} MB, IndexedDB)`,saved===raw,status);
  await p.reload();await waitLoaded(p).catch(()=>{});
  const loaded=await p.evaluate(()=>({clock:document.querySelector('#clock').textContent,status:document.querySelector('#statusText').textContent,ls:Object.keys(localStorage).reduce((n,k)=>n+k.length+localStorage.getItem(k).length,0)}));
  check('5-MB-Stand nach Neuladen geladen',minutesOf(loaded.clock)===big.state.t,`Uhr ${minutesOf(loaded.clock)} · Stand ${big.state.t} · localStorage ${loaded.ls} Zeichen`);
  await ctx.close();}
 // c) Migration: Altbestand in localStorage (Haupt + Sicherung + W0-Marker) → erster Start übernimmt, zweiter Start entfernt Original.
 {const ctx=await browser.newContext();const p=await ctx.newPage();watch(p,errors,'migrate');
  await p.goto(url+'dist/styles.css');
  const {Simulation}=await import('../../dist/core.js');
  const a=new Simulation({mode:'guided',seed:9});a.step(30);const b=new Simulation({mode:'guided',seed:9});b.step(90);
  await p.evaluate(([k,main,backup])=>{localStorage.setItem(k,main);localStorage.setItem(k+'-backup',backup);localStorage.setItem(k+'-backup-hold',JSON.stringify({t:510}));localStorage.setItem('industrie-logistik-v1-prefs',JSON.stringify({mode:'guided'}));},[STORE,b.serialize(),a.serialize()]);
  await p.goto(url+'index.html');await waitLoaded(p).catch(()=>{});await p.waitForTimeout(300);
  const first={clock:minutesOf(await clock(p)),idb:await storedT(p),prev:await storedT(p,STORE+'-backup-prev'),ls:await lsSaveKeys(p)};
  check('Migration: erster Start lädt Altbestand aus IndexedDB, Original bleibt',first.clock===570&&first.idb===570&&first.ls.includes(STORE),JSON.stringify(first));
  check('Migration: W0-Marker → Platz „vorheriges Unternehmen“',first.prev===510&&await idbGet(p,STORE+'-backup-hold')===null,'prev t='+first.prev);
  await p.reload();await waitLoaded(p).catch(()=>{});await p.waitForTimeout(300);
  const second={clock:minutesOf(await clock(p)),ls:await lsSaveKeys(p),marker:await p.evaluate(()=>localStorage.getItem('industrie-logistik-v1-backend'))};
  check('Migration: zweiter Start entfernt Original, Stand bleibt',second.clock===570&&second.ls.length===0&&second.marker==='idb',JSON.stringify(second));
  await ctx.close();}
}

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
 await waitIdle(page);const t0=await storedT(page);check('Gründung gespeichert (IndexedDB)',t0===480,'t='+t0);
 check('Kein Spielstand in localStorage (nur Sperre/Einstellungen)',(await lsSaveKeys(page)).length===0,JSON.stringify(await lsSaveKeys(page)));
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
 check('Backup = zuvor geschriebener Stand',(await storedT(page,STORE+'-backup'))===480);
 // Zweiter Tab desselben Profils: Lesezugriff, schreibgeschützt, Speichern ändert IndexedDB nicht.
 // Erster Tab pausiert und gesichert, damit kein eigener Autosave in das Prüffenster fällt.
 await page.click('[data-speed="0"]');await page.locator('button[data-panel="settings"]:visible').first().click();await page.click('#panelBody [data-action="save"]');await waitIdle(page);await page.keyboard.press('Escape');
 {const second=await context.newPage();watch(second,errors,'tab2');await second.goto(url+'index.html');
  await second.waitForFunction(()=>/Schreibschutz/.test(document.querySelector('#statusText').textContent),null,{timeout:15000}).catch(()=>{});
  const status=await second.locator('#statusText').textContent(),before=await idbGet(page,STORE),clock2=await clock(second);
  await second.evaluate(()=>{document.querySelector('[data-speed="12"]').click();});await second.waitForTimeout(1500);
  await second.locator('button[data-panel="settings"]:visible').first().click();await second.click('#panelBody [data-action="save"]');await second.waitForTimeout(300);
  check('Zweiter Tab: schreibgeschützt (IndexedDB-Stand unverändert, Uhr steht)',/Schreibschutz/.test(status)&&await idbGet(page,STORE)===before&&await clock(second)===clock2,status);
  await second.close();}
 const beforeReload=minutesOf(await clock(page));
 await page.reload();
 await waitLoaded(page);
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
 await persistenceChecks(browser,url,errors);
 check('Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
 exitCode=checks.every(c=>c.ok)?0:1;
}catch(e){console.error(e);check('Ablauf ohne Ausnahme',false,e.message);}
finally{await browser.close();server.kill();cleanup();rmSync(downloads,{recursive:true,force:true});}
console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok).length,errors},null,1));
process.exit(exitCode);
