// A11 · QS Welle 0: Leistungs-Plausibilität im Browser (nicht Teil von `npm test`).
// Aufruf: node tests/browser/qa-w0-perf.mjs [--seconds=120] [--renderers=3d,2d]
// Misst je Szene bei 12×: Heap nach GC (performance.memory, --expose-gc), DOM-Knoten, Long Tasks und rAF-Rate in 20-s-Fenstern;
// zweite Hälfte mit offenem Lagerpanel. Zusätzlich 2D: HUD sichtbar vs. „Nur Szene“ (Hinweis c).
// Headless + SwiftShader: absolute Werte NICHT repräsentativ, nur relative Auffälligkeiten.
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';

const opt=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')).map(([k,v])=>[k,v??true]));
const seconds=Number(opt.seconds||120),renderers=String(opt.renderers||'3d,2d').split(',');
const pw=loadPlaywright();if(!pw){console.error('Playwright nicht gefunden.');process.exit(2);}
const {root,cleanup}=prepareRoot(false);const {server,url}=await startServer(root);
const INIT=()=>{window.__p={lt:[],frames:0};try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__p.lt.push(Math.round(e.duration));}).observe({type:'longtask',buffered:true});}catch{}const f=()=>{window.__p.frames++;requestAnimationFrame(f);};requestAnimationFrame(f);};
const browser=await pw.chromium.launch({...pw.launchOptions,args:[...(pw.launchOptions.args||[]),'--js-flags=--expose-gc','--enable-precise-memory-info']});
const out={hinweis:'Headless/SwiftShader – nur relative Aussagen',seconds,runs:{}};const errors=[];
const sample=page=>page.evaluate(()=>{window.gc?.();const m=performance.memory;const r={heapMB:+(m.usedJSHeapSize/1048576).toFixed(1),nodes:document.getElementsByTagName('*').length,frames:window.__p.frames,lt:window.__p.lt.length,ltMax:Math.max(0,...window.__p.lt)};window.__p.frames=0;window.__p.lt=[];return r;});
try{
 for(const r of renderers){
  const ctx=await browser.newContext({viewport:{width:1600,height:900}});await ctx.addInitScript(INIT);const page=await ctx.newPage();watch(page,errors,r);
  await page.goto(url+'index.html?renderer='+r);await page.waitForFunction(()=>document.querySelector('#welcome')?.open===true);
  await page.click('#welcome [data-action="start"]');await page.waitForFunction(()=>!document.querySelector('#welcome').open);
  await page.locator('button[data-panel="overview"]:visible').first().click();const st=page.locator('#panelBody [data-action="starter"]');if(await st.count())await st.first().click();
  await page.locator('button[data-panel="purchasing"]:visible').first().click();const kit=page.locator('#panelBody [data-action="buy-kit"]');if(await kit.count())await kit.first().click();
  await page.keyboard.press('Escape');await page.click('[data-speed="12"]');await page.waitForTimeout(2000);await sample(page);
  const rows=[];
  for(let s=20;s<=seconds;s+=20){
   if(s===Math.ceil(seconds/2/20)*20+20)await page.locator('button[data-panel="inventory"]:visible').first().click();
   await page.waitForTimeout(20000);const x=await sample(page);rows.push({s,fps:+(x.frames/20).toFixed(1),...x,panel:!await page.evaluate(()=>document.querySelector('#panel').hidden),clock:await page.locator('#clock').textContent()});
   console.log(r,JSON.stringify(rows.at(-1)));
  }
  out.runs[r]=rows;
  if(r==='2d'){
   await page.keyboard.press('Escape');await page.waitForTimeout(1000);await sample(page);await page.waitForTimeout(15000);const hud=await sample(page);
   await page.evaluate(()=>document.querySelector('[data-toggle="scene"]')?.click()||document.body.classList.add('scene-only'));await page.waitForTimeout(1000);await sample(page);await page.waitForTimeout(15000);const only=await sample(page);
   await page.click('[data-speed="0"]').catch(()=>page.evaluate(()=>document.querySelector('[data-speed="0"]').click()));await page.evaluate(()=>document.body.classList.remove('scene-only'));await page.waitForTimeout(1000);await sample(page);await page.waitForTimeout(15000);const paused=await sample(page);
   await page.locator('button[data-panel="inventory"]:visible').first().click();await page.waitForTimeout(1000);await sample(page);await page.waitForTimeout(15000);const panelPaused=await sample(page);
   await page.click('[data-speed="12"]');await page.waitForTimeout(1000);await sample(page);await page.waitForTimeout(15000);const panel12=await sample(page);
   out.hudVsSceneOnly2d={panelPaused:{fps:+(panelPaused.frames/15).toFixed(1),lt:panelPaused.lt},panel12x:{fps:+(panel12.frames/15).toFixed(1),lt:panel12.lt},hud12x:{fps:+(hud.frames/15).toFixed(1),lt:hud.lt},sceneOnly12x:{fps:+(only.frames/15).toFixed(1),lt:only.lt},hudPaused:{fps:+(paused.frames/15).toFixed(1),lt:paused.lt}};
   console.log('2D HUD vs Nur Szene',JSON.stringify(out.hudVsSceneOnly2d));
  }
  await ctx.close();
 }
}catch(e){out.error=String(e.stack||e);}
finally{await browser.close();server.kill();cleanup();}
out.errors=errors;console.log(JSON.stringify(out,null,1));process.exit(out.error||errors.length?1:0);
