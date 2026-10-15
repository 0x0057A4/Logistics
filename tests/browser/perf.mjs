// Browser-Leistungsmessung (Playwright, Chromium headless). Nicht Teil von `npm test`.
// Aufruf: npm run perf:browser [-- --seconds=20 --state-mb=2 --out=perf.json --swiftshader --ref=<commit>]
// Misst requestAnimationFrame-Abstände (Median/p95/p99, Anteile > 16,7/20/33,4 ms) und Long Tasks (> 50 ms) bei 12×.
// Hinweis: Bei 60 Hz liegen viele Abstände bei 16,7–16,8 ms; „over16_7“ zählt dieses Rauschen mit, „over20“ nicht.
// Szenarien: „start“ (neues Unternehmen mit Startbetrieb) und „gross“ (vorab gespeicherter großer Stand, Autosave im Fenster).
// ACHTUNG: Headless-Chromium rendert per Software (SwiftShader). Werte sind NICHT repräsentativ für echte GPUs;
// sie taugen für Vergleiche vorher/nachher auf derselben Maschine und für Long Tasks des Main-Threads.
import {writeFileSync} from 'node:fs';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch,repo} from './serve.mjs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {bigState} from './big-state.mjs';

const opt=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')).map(([k,v])=>[k,v??true]));
const seconds=Number(opt.seconds||20),stateMB=Number(opt['state-mb']||2);
const STORE='industrie-logistik-v1';

const INIT=()=>{
 window.__perf={longtasks:[],deltas:[],recording:false};
 try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(window.__perf.recording)window.__perf.longtasks.push({start:Math.round(e.startTime),ms:Math.round(e.duration)});}).observe({type:'longtask',buffered:true});}catch(e){window.__perf.longtaskError=String(e);}
 let last=0;const loop=now=>{if(window.__perf.recording&&last)window.__perf.deltas.push(now-last);last=now;requestAnimationFrame(loop);};requestAnimationFrame(loop);
};
function summary(deltas,longtasks,windowMs){
 const v=[...deltas].sort((a,b)=>a-b),q=p=>v.length?+v[Math.min(v.length-1,Math.floor(p*v.length))].toFixed(2):null;
 return {frames:v.length,fps:+(v.length/(windowMs/1000)).toFixed(1),medianMs:q(0.5),p95Ms:q(0.95),p99Ms:q(0.99),maxMs:v.length?+v[v.length-1].toFixed(1):null,
  over16_7:+(v.filter(d=>d>16.7).length/Math.max(1,v.length)).toFixed(3),over20:+(v.filter(d=>d>20).length/Math.max(1,v.length)).toFixed(3),over33_4:+(v.filter(d=>d>33.4).length/Math.max(1,v.length)).toFixed(3),
  longTasks:longtasks.length,longTaskTotalMs:longtasks.reduce((n,t)=>n+t.ms,0),longestTasksMs:longtasks.map(t=>t.ms).sort((a,b)=>b-a).slice(0,5)};
}
async function record(page,ms){
 await page.evaluate(()=>{window.__perf.deltas=[];window.__perf.longtasks=[];window.__perf.recording=true;});
 const status0=await page.locator('#statusText').textContent();
 await page.waitForTimeout(ms);
 const data=await page.evaluate(()=>{window.__perf.recording=false;return window.__perf;});
 return {...summary(data.deltas,data.longtasks,ms),statusBefore:status0,statusAfter:await page.locator('#statusText').textContent(),longtaskError:data.longtaskError};
}

const pw=loadPlaywright({swiftshader:opt.swiftshader===true||undefined});
if(!pw){console.error('Playwright nicht gefunden.');process.exit(2);}
const {root,cleanup}=prepareRoot(!!opt.repo);
// Vergleich: --ref=<commit> ersetzt app.js und core.js der tmp-Kopie durch den Stand dieses Commits (z. B. alter Speicherablauf).
if(opt.ref&&!opt.repo)for(const file of ['dist/app.js','dist/core.js'])writeFileSync(join(root,file),execFileSync('git',['show',opt.ref+':'+file],{cwd:repo,encoding:'utf8'}));
const {server,url}=await startServer(root);
const launchOptions=pw.launchOptions;
const browser=await pw.chromium.launch(launchOptions);
const errors=[],result={date:new Date().toISOString(),ref:opt.ref||'Arbeitskopie',flags:launchOptions.args,chromium:browser.version(),seconds,viewport:'1600x900',renderer:null,scenarios:{},
 hinweis:'Headless-Software-Rendering (SwiftShader), nicht repräsentativ für GPU-Hardware. Für 60-FPS-Aussagen auf Referenzgerät messen.'};
try{
 const context=await browser.newContext({viewport:{width:1600,height:900}});
 await context.addInitScript(INIT);
 const page=await context.newPage();watch(page,errors,'perf');
 await page.goto(url+'index.html');
 await page.waitForFunction(()=>document.querySelector('#welcome')?.open===true);
 result.renderer=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl');const ext=gl?.getExtension('WEBGL_debug_renderer_info');return gl?(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'webgl'):'kein WebGL';});
 result.localStorageQuotaChars=await page.evaluate(()=>{let ok=0;for(const mb of [1,2,3,4,5,6,8,10]){try{localStorage.setItem('__quota',('x').repeat(mb*1e6));ok=mb*1e6;}catch{break;}}localStorage.removeItem('__quota');return ok;});
 // Szenario start
 await page.click('#welcome [data-action="start"]');
 await page.waitForFunction(()=>!document.querySelector('#welcome').open);
 await page.click('.rail button[data-panel="overview"]');
 const starter=page.locator('#panelBody [data-action="starter"]');if(await starter.count())await starter.first().click();
 await page.keyboard.press('Escape');
 await page.click('[data-speed="12"]');await page.waitForTimeout(1000);
 result.scenarios.start=await record(page,seconds*1000);
 // Szenario gross: großer gültiger Stand im Modus „sandbox“, dann Neuladen
 const big=bigState(stateMB).serialize();
 await page.click('[data-speed="0"]');
 // Spiel verlassen (Verlassen speichert „guided“ samt Einstellungen), dann auf neutraler Seite desselben Ursprungs einspielen.
 await page.goto(url+'dist/styles.css');
 const stored=await page.evaluate(({k,raw})=>{try{localStorage.setItem(k+'-sandbox',raw);localStorage.removeItem(k+'-sandbox-backup');localStorage.setItem(k+'-prefs',JSON.stringify({mode:'sandbox'}));return true;}catch(e){return String(e);}},{k:STORE,raw:big});
 if(stored!==true)throw Error('Großer Stand passt nicht in localStorage: '+stored);
 await page.goto(url+'index.html');
 await page.waitForFunction(()=>/Tag [2-9]/.test(document.querySelector('#clock').textContent),null,{timeout:30000}).catch(async e=>{throw Error(e.message+' · Uhr: '+await page.locator('#clock').textContent()+' · Toast: '+await page.locator('#toast').textContent());});
 await page.click('[data-speed="12"]');await page.waitForTimeout(1000);
 result.scenarios.gross={stateMB:+(big.length/1e6).toFixed(2),...await record(page,Math.max(seconds,25)*1000)};
 result.scenarios.gross.backupWritten=await page.evaluate(k=>!!localStorage.getItem(k+'-sandbox-backup'),STORE);
 result.errors=errors;
}catch(e){result.error=String(e.stack||e);result.errors=errors;}
finally{await browser.close();server.kill();cleanup();}
const text=JSON.stringify(result,null,1);console.log(text);if(opt.out)writeFileSync(opt.out,text);
process.exit(result.error||errors.length?1:0);
