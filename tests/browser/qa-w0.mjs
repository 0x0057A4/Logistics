// A11 · unabhängige Browser-QS Welle 0 (0.9). Nicht Teil von `npm test`.
// Aufruf: node tests/browser/qa-w0.mjs [--only=render,xss,...] [--headed]
// Echtes Chromium (Playwright global, /opt/pw-browsers). tmp-Kopie wie smoke.mjs; Downloads nur in tmp, nie im Repo.
// Prüfhaken: In der tmp-Kopie (nicht im Repo) wird an app.js ein Lesezugriff `globalThis.__qa` angehängt
// (sim, scene, save, render). Das gebündelte portable.html entsteht vorher und enthält ihn NICHT.
import {readFileSync,appendFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';
import {bigState} from './big-state.mjs';

const opt=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')).map(([k,v])=>[k,v??true]));
const only=opt.only?new Set(String(opt.only).split(',')):null;
const STORE='industrie-logistik-v1';
const hash=t=>createHash('sha256').update(t).digest('hex').slice(0,16);
const results=[];
function check(section,name,ok,detail=''){results.push({section,name,ok:!!ok,detail});console.log(ok?'  ok ':'  FEHLER',`[${section}]`,name,detail?('· '+String(detail).slice(0,400)):'');}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const pw=loadPlaywright();
if(!pw){console.error('Playwright nicht gefunden.');process.exit(2);}
const {root,cleanup}=prepareRoot(false);
appendFileSync(join(root,'dist/app.js'),'\n;globalThis.__qa={sim:()=>sim,scene:()=>scene,save:(...a)=>save(...a),render:(f)=>render(f),speed:()=>speed,writable:()=>writable};\n');
const downloads=mkdtempSync(join(tmpdir(),'qa-w0-dl-'));
const {server,url}=await startServer(root);

// Init-Skript: WebGL-Kontexte, Konsolenwarnungen und aktive window/document-Listener zählen.
const INIT=()=>{
 window.__cnt={gl:0,warn:[],listeners:0};
 const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...a){const c=g.call(this,type,...a);if(c&&/webgl/.test(type)&&!this.__counted){this.__counted=1;window.__cnt.gl++;}return c;};
 const add=EventTarget.prototype.addEventListener,rem=EventTarget.prototype.removeEventListener,keys=new WeakMap();
 EventTarget.prototype.addEventListener=function(t,f,o){if(this===window||this===document){const set=keys.get(this)||keys.set(this,new Set()).get(this);const k=t+'|'+(typeof o==='object'?!!o?.capture:!!o);const m=f&&(f.__k||(f.__k=new Map()));if(f&&!m.has(k)){m.set(k,1);window.__cnt.listeners++;}}return add.call(this,t,f,o);};
 EventTarget.prototype.removeEventListener=function(t,f,o){if((this===window||this===document)&&f?.__k){const k=t+'|'+(typeof o==='object'?!!o?.capture:!!o);if(f.__k.has(k)){f.__k.delete(k);window.__cnt.listeners--;}}return rem.call(this,t,f,o);};
};

async function newPage(context,label,errors,warns){
 const page=await context.newPage();watch(page,errors,label);
 page.on('console',m=>{if(m.type()==='warning')warns.push(label+': '+m.text());});
 return page;
}
async function found(page,{query='',mode=null}={}){
 await page.goto(url+'index.html'+query);
 await page.waitForFunction(()=>document.querySelector('#welcome')?.open===true||/Tag \d+/.test(document.querySelector('#clock')?.textContent||''),null,{timeout:20000});
 if(await page.evaluate(()=>document.querySelector('#welcome').open)){
  if(mode)await page.check(`#welcome input[name=mode][value=${mode}]`);
  await page.click('#welcome [data-action="start"]');
  if(await page.evaluate(()=>document.querySelector('#confirm').open))await page.click('[data-action="confirmOk"]');
  await page.waitForFunction(()=>!document.querySelector('#welcome').open,null,{timeout:10000});
 }
 await page.waitForFunction(()=>!!globalThis.__qa);
}
async function starterLine(page){
 await page.locator('button[data-panel="overview"]:visible').first().click();
 const b=page.locator('#panelBody [data-action="starter"]');if(await b.count())await b.first().click();
 await page.keyboard.press('Escape');
 const kit=await page.evaluate(()=>{const s=__qa.sim();for(const item of ['housing','board','carton'])s.command({type:'buy',item,qty:12,supplier:'standard',site:'site-1'});const o=s.state.orders.find(o=>o.kind==='manufacturing');s.command({type:'acceptOrder',id:o.id});__qa.render(true);return s.state.purchases.length;});
 return kit;
}
const ser=page=>page.evaluate(()=>__qa.sim().serialize());
const renderer=page=>page.evaluate(()=>document.querySelector('#world')?.dataset.renderer||'?');
const clockMin=page=>page.evaluate(()=>{const m=/Tag (\d+) · (\d\d):(\d\d)/.exec(document.querySelector('#clock').textContent);return m?(+m[1]-1)*1440+ +m[2]*60+ +m[3]:NaN;});

const browser=await pw.chromium.launch({...pw.launchOptions,headless:!opt.headed});
const run=name=>!only||only.has(name);
try{
 // ---------- 1. Darstellung verändert keinen Fachzustand; Gleichschritt 3D/2D/Node ----------
 if(run('render')){
  const errors=[],warns=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});await ctx.addInitScript(INIT);
  const page=await newPage(ctx,'render',errors,warns);await found(page);await starterLine(page);
  await page.click('[data-speed="0"]');
  check('render','Szene 3D aktiv',await renderer(page)==='3d',await renderer(page));
  await page.evaluate(()=>__qa.sim().step(90));await page.evaluate(()=>__qa.render(true));
  const h0=await ser(page);
  const box=await page.locator('#world').boundingBox();
  for(const v of ['site','network','flat','hall']){await page.click(`[data-view="${v}"]`);await wait(250);}
  for(const c of ['plus','plus','minus','rotate','rotate','home'])await page.click(`[data-camera="${c}"]`);
  for(const l of ['fleet','infra','none','all']){const b=page.locator(`[data-labels="${l}"]`);if(await b.count())await b.click();}
  await page.mouse.move(box.x+box.width*0.5,box.y+box.height*0.5);await page.mouse.down();await page.mouse.move(box.x+box.width*0.3,box.y+box.height*0.6,{steps:8});await page.mouse.up();
  for(let i=0;i<6;i++){await page.mouse.wheel(0,i%2?-240:240);await wait(60);}
  for(let i=0;i<20;i++)await page.mouse.move(box.x+box.width*(0.2+i*0.03),box.y+box.height*0.5);
  await page.mouse.click(box.x+box.width*0.62,box.y+box.height*0.45);await page.keyboard.press('Escape');
  for(const p of ['inventory','fleet','finance'])await page.locator(`button[data-panel="${p}"]:visible`).first().click();
  await page.keyboard.press('Escape');
  await page.click('#bellBtn');await page.click('#bellBtn');
  await page.fill('#cmd','montage');await page.keyboard.press('Escape');
  await page.click('[data-toggle="flow"]');await page.click('[data-toggle="flow"]');await page.click('[data-toggle="vbar"]');await page.click('[data-toggle="vbar"]');
  await wait(1500);
  const h1=await ser(page);
  check('render','3D: Ansicht/Kamera/Zoom/Labels/Ziehen/Rad/Panels ändern Fachzustand nicht',h1===h0,`vor ${hash(h0)} · nach ${hash(h1)}`);
  // Gleichschritt: 240 Minuten, nach jeder Minute ein echter Frame (rAF) inklusive setClock-Zwischenwerten.
  const lock=async(p)=>p.evaluate(async snap=>{const S=__qa.sim().constructor;const sim=S.fromJSON(snap);const sc=__qa.scene();for(let i=0;i<240;i++){sim.step(1);sc.setState(sim.state);for(const f of [0.25,0.75]){sc.setClock?.(sim.state.t+f);await new Promise(r=>requestAnimationFrame(r));}}sc.setState(__qa.sim().state);return sim.serialize();},h0);
  const h3d=await lock(page);
  const p2=await newPage(ctx,'render2d',errors,warns);await p2.goto(url+'index.html?renderer=2d');await p2.waitForFunction(()=>!!globalThis.__qa);
  check('render','?renderer=2d erzwingt 2D (zweiter Tab, schreibgeschützt erlaubt)',await renderer(p2)==='2d',await renderer(p2));
  const h2d=await lock(p2);
  const ref=Simulation.fromJSON(h0);ref.step(240);const hn=ref.serialize();
  check('render','Gleichschritt 240 Min.: 3D-Frames = 2D-Frames = Node ohne Darstellung',h3d===hn&&h2d===hn,`3D ${hash(h3d)} · 2D ${hash(h2d)} · Node ${hash(hn)}`);
  check('render','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- 2. Suche und Namen mit HTML: kein XSS ----------
 if(run('xss')){
  const errors=[],warns=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});
  const page=await newPage(ctx,'xss',errors,warns);await found(page);await starterLine(page);await page.click('[data-speed="0"]');
  const payload='<img src=x onerror="window.__xss=(window.__xss||0)+1">';
  await page.keyboard.press('/');await page.keyboard.type(payload);await wait(300);
  const r1=await page.evaluate(()=>({img:document.querySelectorAll('#cmdResults img').length,text:document.querySelector('#cmdResults').textContent.slice(0,120)}));
  check('xss','Suche „/“: HTML im Suchtext wird als Text angezeigt',r1.img===0&&/<img/.test(r1.text),JSON.stringify(r1));
  await page.keyboard.press('Escape');
  await page.locator('button[data-panel="inventory"]:visible').first().click();await page.fill('#search',payload);await wait(300);await page.keyboard.press('Escape');
  // Namen aus importiertem Spielstand (Validator erlaubt beliebige Zeichenketten)
  const ids=await page.evaluate(p=>{const s=__qa.sim().state;s.orders[0].customer='Kunde '+p;s.workers[0].name='Person '+p;s.vehicles[0].name='Wagen '+p;__qa.render(true);return {o:s.orders[0].id,w:s.workers[0].id,v:s.vehicles[0].id};},payload);
  const text=await page.evaluate(()=>__qa.sim().serialize());
  // Standortname wird vom Validator begrenzt (beim Import abgelehnt); hier trotzdem für die Darstellung gesetzt.
  await page.evaluate(p=>{__qa.sim().state.sites[0].name='W'+p;__qa.render(true);},'<b onmouseover=x>');
  let loadErr='';try{Simulation.fromJSON(text);}catch(e){loadErr=e.message;}
  check('xss','Spielstand mit HTML-Namen ist gültig ladbar (Importweg)',!loadErr,loadErr);
  for(const p of ['orders','staff','fleet','network','inventory','finance','overview','service','history'])await page.locator(`button[data-panel="${p}"]`).first().evaluate(b=>b.click());
  await page.click('#siteBtn');await wait(200);await page.click('#siteBtn');
  await page.click('#bellBtn');await wait(200);await page.click('#bellBtn');
  for(const q of ['kunde','person','wagen','img']){await page.fill('#cmd',q);await wait(200);}
  await page.keyboard.press('Escape');
  for(const id of Object.values(ids)){await page.evaluate(id=>{document.querySelector('#cmd').value=id;document.querySelector('#cmd').dispatchEvent(new Event('input'));},id);await page.keyboard.press('Enter').catch(()=>{});await page.locator('#cmd').press('Enter');await wait(250);}
  await wait(800);
  const r2=await page.evaluate(()=>({xss:window.__xss||0,imgs:[...document.querySelectorAll("img")].filter(i=>i.getAttribute("src")==="x").length+document.querySelectorAll("[onmouseover]").length}));
  check('xss','Kein ausgeführtes onerror / kein eingeschleustes <img> in HUD, Panels, Akten, Suche, Glocke, Standortmenü, 3D-Beschriftung',r2.xss===0&&r2.imgs===0,JSON.stringify(r2));
  check('xss','Keine Konsolen-/Seitenfehler',errors.filter(e=>!/HTTP 404: .*\/x$|request: .*\/x /.test(e)).length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- 3. Baumodus 3D: belegte/ungültige Zelle bucht nichts ----------
 if(run('build')){
  const errors=[],warns=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});
  const page=await newPage(ctx,'build',errors,warns);await found(page,{mode:'sandbox'});await starterLine(page);await page.click('[data-speed="0"]');
  const snap=()=>page.evaluate(()=>{const s=__qa.sim().state;return {money:s.money,ledger:s.ledger.length,buildings:s.buildings.length,seq:s.seq};});
  const clickCell=async(x,y)=>{const p=await page.evaluate(([x,y])=>{const c=document.querySelector('#world'),r=c.getBoundingClientRect(),p=c.__scene.cellToScreen(x,y);return {x:r.left+p.x,y:r.top+p.y};},[x,y]);await page.mouse.move(p.x,p.y);await wait(120);await page.mouse.click(p.x,p.y);await wait(300);};
  await page.click('.rail [data-action="build"]');await page.click('[data-build="assembly"]');
  const occupied=await page.evaluate(()=>{const b=__qa.sim().state.buildings.find(b=>b.type==='assembly');return [b.x,b.y];});
  let before=await snap();await clickCell(occupied[0],occupied[1]);let after=await snap();
  check('build','Klick auf belegte Zelle: keine Buchung, kein Gebäude',JSON.stringify(before)===JSON.stringify(after),JSON.stringify({before,after,toast:await page.locator('#toast').textContent()}));
  before=await snap();await clickCell(0,8);after=await snap();
  check('build','Klick auf Torzelle (0,8): keine Buchung',JSON.stringify(before)===JSON.stringify(after),JSON.stringify({before,after,toast:await page.locator('#toast').textContent()}));
  before=await snap();await clickCell(19,15);after=await snap();
  check('build','Klick Randzelle (19,15) mit 2×2-Anlage über Rand: keine Buchung',JSON.stringify(before)===JSON.stringify(after),JSON.stringify({before,after,toast:await page.locator('#toast').textContent()}));
  before=await snap();await clickCell(30,30);after=await snap();
  check('build','Klick außerhalb des Rasters: keine Buchung',JSON.stringify(before)===JSON.stringify(after),JSON.stringify({before,after}));
  before=await snap();await clickCell(12,9);after=await snap();
  check('build','Gegenprobe: freie Zelle (12,9) baut genau 1 Anlage mit genau 1 Buchung',after.buildings===before.buildings+1&&after.ledger===before.ledger+1,JSON.stringify({before,after,toast:await page.locator('#toast').textContent()}));
  check('build','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- 4. Szenen-Lebenszyklus: Moduswechsel, destroy, WebGL-Kontexte, Listener ----------
 if(run('lifecycle')){
  const errors=[],warns=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});await ctx.addInitScript(INIT);
  const page=await newPage(ctx,'life',errors,warns);await found(page);
  const c0=await page.evaluate(()=>({canvas:document.querySelectorAll('canvas').length,gl:__cnt.gl,listeners:__cnt.listeners,labels:document.querySelectorAll('.scene3d-labels').length}));
  for(const m of ['sandbox','economy','guided','sandbox','guided']){
   await page.locator('button[data-panel="settings"]:visible').first().click();
   await page.selectOption('#panelBody select[name=mode]',m);await page.click('#panelBody form[data-form="loadMode"] button');await wait(500);
  }
  const c1=await page.evaluate(()=>({canvas:document.querySelectorAll('canvas').length,gl:__cnt.gl,listeners:__cnt.listeners,labels:document.querySelectorAll('.scene3d-labels').length,mode:__qa.sim().state.mode}));
  check('lifecycle','5 Moduswechsel: Canvas, WebGL-Kontexte, Listener und Beschriftungsebenen konstant',c1.canvas===c0.canvas&&c1.gl===c0.gl&&c1.labels===c0.labels&&c1.listeners===c0.listeners,JSON.stringify({c0,c1}));
  const life=await page.evaluate(async()=>{const C=__qa.scene().constructor,s=__qa.sim().state,l0=__cnt.listeners,g0=__cnt.gl;let lost=0;
   for(let i=0;i<24;i++){const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:300px;height:200px';const c=document.createElement('canvas');host.appendChild(c);document.body.appendChild(host);
    const sc=new C(c,{});sc.setState(s);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const gl=sc.renderer.getContext();sc.destroy();if(gl.isContextLost())lost++;host.remove();}
   await new Promise(r=>setTimeout(r,300));return {created:__cnt.gl-g0,lost,listenerDelta:__cnt.listeners-l0,labels:document.querySelectorAll('.scene3d-labels').length,mainAlive:!__qa.scene().renderer.getContext().isContextLost()};});
  const tooMany=warns.filter(w=>/Too many active WebGL contexts/i.test(w));
  check('lifecycle','24× Scene3D erzeugen+destroy: Kontexte freigegeben, keine Listener übrig, Hauptszene lebt',life.lost===24&&life.listenerDelta===0&&life.mainAlive,JSON.stringify(life));
  check('lifecycle','Keine Warnung „Too many active WebGL contexts“',tooMany.length===0,tooMany.slice(0,2).join(' | '));
  check('lifecycle','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- 5. Zwei Tabs im selben Browser-Kontext ----------
 if(run('tabs')){
  const errors=[],warns=[];const ctx=await browser.newContext({viewport:{width:1400,height:850}});
  const a=await newPage(ctx,'tabA',errors,warns);await found(a);await starterLine(a);await a.click('[data-speed="12"]');
  const b=await newPage(ctx,'tabB',errors,warns);await b.goto(url+'index.html');await b.waitForFunction(()=>!!globalThis.__qa);await wait(800);
  const bState=await b.evaluate(()=>({writable:__qa.writable(),status:document.querySelector('#statusText').textContent,sim:document.querySelector('#simState').textContent}));
  check('tabs','Tab B: schreibgeschützt mit Hinweis',!bState.writable&&/Schreibschutz/.test(bState.status),JSON.stringify(bState));
  await b.click('[data-speed="12"]');const tb0=await clockMin(b);await wait(3000);const tb1=await clockMin(b);
  check('tabs','Tab B: 12× startet keine Simulation',tb1===tb0&&await b.evaluate(()=>__qa.speed())===0,`${tb0}→${tb1}`);
  const bt=await b.evaluate(()=>{const n=__qa.sim().state.buildings.length;document.querySelector('[data-action="build"]').click();return n;});await b.keyboard.press('Escape');
  const before=await b.evaluate(k=>localStorage.getItem(k),STORE+'-guided');
  const bSave=await b.evaluate(()=>__qa.save(true));
  check('tabs','Tab B: save() verweigert, Speicher unverändert',bSave===false&&before===await b.evaluate(k=>localStorage.getItem(k),STORE+'-guided'));
  const s0=await a.evaluate(k=>JSON.parse(localStorage.getItem(k)).t,STORE+'-guided');await a.evaluate(()=>__qa.save());const s1=await a.evaluate(k=>JSON.parse(localStorage.getItem(k)).t,STORE+'-guided');
  check('tabs','Tab A schreibt weiter',s1>=s0&&await a.evaluate(()=>__qa.writable()),`${s0}→${s1}`);
  const aT=await a.evaluate(()=>__qa.sim().state.t);await a.close({runBeforeUnload:true});await wait(800);
  const stored=await b.evaluate(k=>JSON.parse(localStorage.getItem(k)).t,STORE+'-guided');
  await b.locator('button[data-panel="settings"]:visible').first().click();await b.click('#panelBody [data-action="retryStorage"]');await wait(800);
  const after=await b.evaluate(()=>({writable:__qa.writable(),t:__qa.sim().state.t}));
  check('tabs','Nach Schließen von A: B übernimmt per „Speicher erneut prüfen“ und lädt neueren Stand',after.writable&&after.t===stored&&stored>=aT,JSON.stringify({aT,stored,after}));
  check('tabs','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- 6. Autosave mit beschädigtem Hauptstand im echten Browser ----------
 if(run('autosave')){
  const errors=[],warns=[];const ctx=await browser.newContext({viewport:{width:1400,height:850}});
  const page=await newPage(ctx,'auto',errors,warns);await found(page);await starterLine(page);
  await page.evaluate(()=>{__qa.sim().step(30);});await page.evaluate(()=>__qa.save());await page.evaluate(()=>{__qa.sim().step(30);});await page.evaluate(()=>__qa.save());
  const good=await page.evaluate(k=>localStorage.getItem(k+'-backup'),STORE+'-guided');
  // a) Fremde Beschädigung während des Betriebs, danach echter Autosave-Pfad (dirty + Leerlauf).
  await page.evaluate(k=>localStorage.setItem(k,'{"schema":1,"mode":"guided","t":'),STORE+'-guided');
  await page.click('[data-speed="12"]');await wait(23000);await page.click('[data-speed="0"]');
  const r=await page.evaluate(k=>({main:localStorage.getItem(k),backup:localStorage.getItem(k+'-backup')}),STORE+'-guided');
  let mainOk=false;try{mainOk=Simulation.fromJSON(r.main).state.t>JSON.parse(good).t;}catch{}
  check('autosave','Autosave nach fremder Beschädigung: Sicherung unverändert, Hauptstand wieder gültig',r.backup===good&&mainOk,`backup gleich: ${r.backup===good} · main gültig/neuer: ${mainOk}`);
  // b) Beschädigter Hauptstand beim Start + intakte Sicherung
  await page.evaluate(k=>localStorage.setItem(k,'{kaputt'),STORE+'-guided');
  await page.evaluate(()=>{window.onbeforeunload=null;});
  await page.goto(url+'dist/styles.css');await page.evaluate(k=>localStorage.setItem(k,'{kaputt'),STORE+'-guided');
  await page.goto(url+'index.html');await page.waitForFunction(()=>!!globalThis.__qa);await wait(1200);
  const st=await page.evaluate(()=>({welcome:document.querySelector('#welcome').open,toast:document.querySelector('#toast').textContent}));
  check('autosave','Start mit beschädigtem Hauptstand: Fehlermeldung, Willkommensdialog',st.welcome&&/nicht geladen/.test(st.toast),JSON.stringify(st));
  // QS-W0-05 (A12-Fix): Willkommensdialog bietet „Letzte Sicherung laden“, weil eine gültige Sicherung existiert.
  check('autosave','Willkommensdialog bietet „Letzte Sicherung laden“ (QS-W0-05)',await page.locator('#welcome #welcomeBackup').isVisible(),'sichtbar');
  await wait(21000);
  check('autosave','Ohne Handlung nach 21 s: Sicherung unverändert',await page.evaluate(k=>localStorage.getItem(k+'-backup'),STORE+'-guided')===r.backup);
  await page.click('#welcomeBackup');await page.click('[data-action="confirmOk"]');
  await page.waitForFunction(()=>!document.querySelector('#welcome').open,null,{timeout:10000}).catch(()=>{});
  const restored=await page.evaluate(k=>({t:__qa.sim().state.t,main:JSON.parse(localStorage.getItem(k)).t,backup:localStorage.getItem(k+'-backup')}),STORE+'-guided');
  check('autosave','„Letzte Sicherung laden“ im Willkommensdialog stellt Stand wieder her (QS-W0-05)',restored.t===JSON.parse(r.backup).t&&restored.main===restored.t&&restored.backup===r.backup,JSON.stringify({t:restored.t,main:restored.main}));
  check('autosave','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- 7. Portable HTML: Generationen 1→2→3 per file:// ----------
 if(run('portable')){
  const errors=[],warns=[];const ctx=await browser.newContext({viewport:{width:1600,height:900},acceptDownloads:true});await ctx.addInitScript(INIT);
  const page=await newPage(ctx,'http',errors,warns);await found(page);await starterLine(page);
  await page.evaluate(()=>{__qa.sim().step(200);__qa.render(true);});
  const gen=[],htmls=[];let src=page,expectT=await page.evaluate(()=>__qa.sim().state.t);
  for(let g=1;g<=3;g++){
   await src.locator('button[data-panel="settings"]:visible').first().click();
   const [dl]=await Promise.all([src.waitForEvent('download'),src.click('#panelBody [data-action="exportHtml"]')]);
   const path=join(downloads,`gen${g}.html`);await dl.saveAs(path);const html=readFileSync(path,'utf8');htmls.push(html);
   const emb=JSON.parse(/<script id="embedded-save" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
   const f=await newPage(ctx,'file'+g,errors,warns);await f.goto(pathToFileURL(path).href);
   await f.waitForFunction(()=>/Tag \d+/.test(document.querySelector('#clock').textContent),null,{timeout:20000});await wait(500);
   const info=await f.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id),dup=ids.filter((x,i)=>ids.indexOf(x)!==i);return {canvas:document.querySelectorAll('canvas').length,labels:document.querySelectorAll('.scene3d-labels').length,dup:[...new Set(dup)],nodes:document.getElementsByTagName('*').length,welcome:document.querySelector('#welcome').open,active:document.querySelector('#speeds .active')?.dataset.speed,renderer:document.querySelector('#world').dataset.renderer,panelOpen:!document.querySelector('#panel').hidden,toast:document.querySelector('#toast').textContent,
    vrows:document.querySelectorAll('#vbarList .vrow').length,vbarCount:document.querySelector('#vbarCount').textContent,
    layers:[...document.querySelectorAll('.scene3d-labels')].map(l=>({chips:l.children.length,visible:l.getClientRects().length>0&&getComputedStyle(l).display!=='none',text:l.textContent.slice(0,60)}))};});
   if(opt.shots)await f.screenshot({path:join(String(opt.shots),`gen${g}.png`)});
   const t0=await clockMin(f);
   gen.push({g,kb:Math.round(html.length/1024),embT:emb.t,clock:t0,...info});
   check('portable',`Gen ${g}: eingebetteter Stand = Uhr = erwarteter Stand`,emb.t===expectT&&t0===expectT,`emb ${emb.t} · Uhr ${t0} · erwartet ${expectT}`);
   check('portable',`Gen ${g}: genau 1 Canvas, ≤1 Beschriftungsebene, keine doppelten IDs, Dialog zu, 3D`,info.canvas===1&&info.labels<=1&&!info.dup.length&&!info.welcome&&info.renderer==='3d',JSON.stringify(info));
   check('portable',`Gen ${g}: Fahrzeugleiste ohne doppelte Zeilen`,String(info.vrows)===info.vbarCount,`Zeilen ${info.vrows} · Zähler ${info.vbarCount}`);
   check('portable',`Gen ${g}: Pausiert-Anzeige korrekt (Hinweis b)`,info.active==='0',`aktive Stufe ${info.active}`);
   await f.click('[data-speed="12"]');await wait(4000);await f.click('[data-speed="0"]');await wait(600);
   const t1=await clockMin(f);check('portable',`Gen ${g}: weiterspielen im Dateimodus`,t1>t0+20,`${t0}→${t1}`);
   expectT=t1;src=f;
  }
  console.log('  Generationen:',JSON.stringify(gen));
  // QS-W0-01 (A12-Fix): Vorlage je Generation byte-identisch bis auf Spielstand-/Prefs-Slot.
  const tpl=h=>h.replace(/(<script id="embedded-(?:save|prefs)" type="application\/json">)[\s\S]*?(<\/script>)/g,'$1…$2');
  check('portable','Gen 1→2→3: Vorlage byte-identisch bis auf Spielstand-/Prefs-Slot',tpl(htmls[1])===tpl(htmls[0])&&tpl(htmls[2])===tpl(htmls[1]),htmls.map(h=>tpl(h).length).join(' / '));
  check('portable','Dateigröße wächst nicht unkontrolliert (Gen3 ≤ Gen1 + 5 %)',gen[2].kb<=gen[0].kb*1.05,gen.map(x=>x.kb+' KB').join(' → '));
  check('portable','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- 8. 2D-Rückfall: ?renderer=2d, WebGL abgeschaltet, ?renderer=3d ohne WebGL ----------
 if(run('fallback')){
  const errors=[],warns=[];
  const b2=await pw.chromium.launch({...pw.launchOptions,args:[...(pw.launchOptions.args||[]),'--disable-webgl','--disable-webgl2','--disable-3d-apis'],headless:true});
  try{
   for(const q of ['','?renderer=3d']){
    const ctx=await b2.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'nowebgl'+q,errors,warns);
    await found(page,{query:q});const gl=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl'));
    await starterLine(page);await page.click('[data-speed="12"]');const t0=await clockMin(page);await wait(5000);const t1=await clockMin(page);
    check('fallback',`WebGL aus ${q||'(auto)'}: 2D-Szene, spielbar`,!gl&&await renderer(page)==='2d'&&t1-t0>=40,`webgl=${gl} · renderer=${await renderer(page)} · ${t0}→${t1}`);
    await ctx.close();
   }
  }finally{await b2.close();}
  const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'2d',errors,warns);
  await found(page,{query:'?renderer=2d'});await starterLine(page);await page.click('[data-speed="12"]');const t0=await clockMin(page);await wait(5000);const t1=await clockMin(page);
  check('fallback','?renderer=2d: 2D-Szene, spielbar, Labelgruppe verborgen',await renderer(page)==='2d'&&t1-t0>=40,`${t0}→${t1} · labelGroup hidden=${await page.evaluate(()=>document.querySelector('#labelGroup').hidden)}`);
  await ctx.close();
  check('fallback','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  console.log('  Warnungen:',warns.slice(0,4).join(' | '));
 }

 // ---------- 9. localStorage-Grenze (Hinweis d): großer Stand speichern ----------
 if(run('quota')){
  const errors=[],warns=[];
  for(const mb of (opt.mb?String(opt.mb).split(",").map(Number):[2.2,2.6])){
   const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'quota'+mb,errors,warns);
   const big=bigState(mb).serialize();
   await page.goto(url+'dist/styles.css');
   await page.evaluate(({k,raw})=>{localStorage.clear();localStorage.setItem(k+'-sandbox',raw);localStorage.setItem(k+'-prefs',JSON.stringify({mode:'sandbox'}));},{k:STORE,raw:big});
   await page.goto(url+'index.html');await page.waitForFunction(()=>!!globalThis.__qa&&/Tag [2-9]/.test(document.querySelector('#clock').textContent),null,{timeout:30000});
   const t0=await page.evaluate(()=>__qa.sim().state.t);
   const r1=await page.evaluate(()=>{__qa.sim().step(5);return __qa.save();});
   const r2=await page.evaluate(()=>{__qa.sim().step(5);return __qa.save();});
   const info=await page.evaluate(k=>({status:document.querySelector('#statusText').textContent,mainT:JSON.parse(localStorage.getItem(k+'-sandbox')).t,backup:!!localStorage.getItem(k+'-backup')||!!localStorage.getItem(k+'-sandbox-backup'),simT:__qa.sim().state.t}),STORE);
   check('quota',`${(big.length/1e6).toFixed(2)} MB: zwei Speichervorgänge nach Laden`,r1&&r2&&info.mainT===info.simT,JSON.stringify({t0,r1,r2,...info}));
   await ctx.close();
  }
  check('quota','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
 }
}catch(e){console.error(e);check('ablauf','Ablauf ohne Ausnahme',false,e.message);}
finally{await browser.close();server.kill();cleanup();rmSync(downloads,{recursive:true,force:true});}
const failed=results.filter(r=>!r.ok);
console.log(JSON.stringify({passed:results.length-failed.length,failed:failed.length,failures:failed.map(f=>`[${f.section}] ${f.name}`)},null,1));
process.exit(failed.length?1:0);
