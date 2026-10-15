// Browserprüfung Messanzeige ?perf=1 (A12, W1c): Server + portable HTML, keine Konsolenfehler, Kurzmessung, Screenshot.
// Aufruf: node tests/browser/perf-overlay-check.mjs [--shot=docs/assets/perf-overlay-0.9.png] [--measure-ms=5000]
// Headless-Chromium rendert per Software: Zahlen nicht repräsentativ, geprüft wird Funktion und Fehlerfreiheit.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch,repo} from './serve.mjs';
const opt=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')).map(([k,v])=>[k,v??true]));
const measureMs=Number(opt['measure-ms']||5000);
const pw=loadPlaywright();if(!pw){console.error('Playwright nicht gefunden.');process.exit(2);}
const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const errors=[],out={};
async function run(label,href,shot,denyClipboard=false){
 const page=await browser.newPage({viewport:{width:1600,height:900}});watch(page,errors,label);
 await page.goto(href);
 await page.waitForSelector('#perfOverlay');
 await page.waitForFunction(()=>document.querySelector('#welcome')?.open===true,null,{timeout:15000});
 await page.click('#welcome [data-action="start"]');
 await page.waitForFunction(()=>!document.querySelector('#welcome').open);
 await page.locator('button[data-panel="overview"]:visible').first().click();
 const starter=page.locator('#panelBody [data-action="starter"]');if(await starter.count())await starter.first().click();
 await page.keyboard.press('Escape');
 await page.click('[data-speed="12"]');await page.waitForTimeout(1500);
 await page.evaluate(ms=>window.__perfOverlay.measure(ms),measureMs);
 await page.waitForFunction(()=>window.__perfOverlay.report,null,{timeout:measureMs+10000});
 const r=await page.evaluate(()=>({text:window.__perfOverlay.report.text,live:document.querySelector('#perfOverlay [data-perf="live"]').innerText,steps:window.__perfOverlay.report.sim.steps}));
 // Kopieren: Zwischenablage ohne Berechtigung → Rückfall Textfeld, sonst „Kopiert“.
 if(denyClipboard)await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('verweigert'))},configurable:true});});
 await page.click('#perfOverlay [data-perf="copy"]');await page.waitForTimeout(200);
 r.copy=await page.locator('#perfOverlay [data-perf="copy"]').textContent();r.textarea=await page.locator('#perfOverlay textarea').count();
 if(shot)await page.screenshot({path:shot});
 // Ausblenden entfernt Anzeige vollständig.
 await page.click('#perfOverlay [data-perf="hide"]');r.removed=await page.locator('#perfOverlay').count()===0;
 // Ohne ?perf=1: keine Anzeige, kein Messgriff.
 await page.goto(href.replace(/[?&]perf=1/,''));await page.waitForTimeout(800);
 r.inactive=await page.evaluate(()=>!document.querySelector('#perfOverlay')&&!window.__perfOverlay);
 await page.close();return r;
}
try{
 out.server=await run('server',url+'index.html?perf=1',opt.shot?join(repo,opt.shot):null);
 out.portable=await run('portable',pathToFileURL(join(root,'dist/portable.html')).href+'?perf=1',null,true);
}catch(e){out.error=String(e.stack||e);}
finally{await browser.close();server.kill();cleanup();}
out.errors=errors;console.log(JSON.stringify(out,null,1));
const bad=out.error||errors.length||!out.server?.removed||!out.server?.inactive||!out.portable?.inactive||!out.server?.steps||!out.portable?.steps||out.portable?.textarea!==1;
process.exit(bad?1:0);
