// A11 · Nachprüfung der Behebungen QS-W0-01/02/04/05/06/10 (0.9). Nicht Teil von `npm test`.
// Aufruf: node tests/browser/qa-w0-recheck.mjs [--only=portable,inject,speed,backup,stock,version,perf] [--perf-seconds=12]
// Gleiche Umgebung wie qa-w0.mjs: tmp-Kopie, frisch gebautes portable.html, Prüfhaken `__qa` nur in tmp-app.js
// (nach dem Bündeln angehängt; portable.html enthält ihn nicht). Downloads nur in tmp.
import {readFileSync,appendFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const opt=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')).map(([k,v])=>[k,v??true]));
const only=opt.only?new Set(String(opt.only).split(',')):null;
const run=name=>!only||only.has(name);
const STORE='industrie-logistik-v1',K=STORE+'-guided';
const results=[];
function check(section,name,ok,detail=''){results.push({section,name,ok:!!ok,detail});console.log(ok?'  ok ':'  FEHLER',`[${section}]`,name,detail?('· '+String(detail).slice(0,500)):'');}
// Bekannter offener Befund (wie node:test todo): wird gemeldet, zählt aber nicht als Fehlschlag.
function known(section,name,ok,detail=''){console.log(ok?'  ok (Befund behoben?)':'  TODO',`[${section}]`,name,detail?('· '+String(detail).slice(0,500)):'');}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const pw=loadPlaywright();if(!pw){console.error('Playwright nicht gefunden.');process.exit(2);}
const {root,cleanup}=prepareRoot(false);
const gen0=readFileSync(join(root,'dist/portable.html'),'utf8');
appendFileSync(join(root,'dist/app.js'),'\n;globalThis.__qa={sim:()=>sim,scene:()=>scene,save:(...a)=>save(...a),render:(f)=>render(f),speed:()=>speed,writable:()=>writable};\n');
const downloads=mkdtempSync(join(tmpdir(),'qa-w0r-dl-'));
const {server,url}=await startServer(root);
const browser=await pw.chromium.launch({...pw.launchOptions,headless:!opt.headed});

// Slots, die je Export verschieden sein dürfen. Alles andere muss byte-identisch zu Gen 0 (Build) bleiben.
const SLOT=/(<script id="embedded-(?:save|prefs)" type="application\/json">)[\s\S]*?(<\/script>)/g;
const tpl=h=>h.replace(SLOT,'$1…$2');
const firstDiff=(a,b)=>{let i=0;while(i<a.length&&a[i]===b[i])i++;return i>=a.length&&a.length===b.length?-1:i;};
const PAYLOAD='</script><script>window.__pwn=(window.__pwn||0)+1</script><!--<script>';

async function newPage(ctx,label,errors){const p=await ctx.newPage();watch(p,errors,label);return p;}
async function found(page,{mode=null}={}){
 await page.goto(url+'index.html');
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
 await page.evaluate(()=>{const s=__qa.sim();for(const item of ['housing','board','carton'])s.command({type:'buy',item,qty:12,supplier:'standard',site:'site-1'});const o=s.state.orders.find(o=>o.kind==='manufacturing');if(o)s.command({type:'acceptOrder',id:o.id});__qa.render(true);});
}
const clockMin=page=>page.evaluate(()=>{const m=/Tag (\d+) · (\d\d):(\d\d)/.exec(document.querySelector('#clock').textContent);return m?(+m[1]-1)*1440+ +m[2]*60+ +m[3]:NaN;});
const activeSpeed=page=>page.evaluate(()=>[...document.querySelectorAll('#speeds [data-speed].active')].map(b=>b.dataset.speed).join(','));
async function exportFrom(page,name){
 await page.locator('button[data-panel="settings"]:visible').first().click();
 const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#panelBody [data-action="exportHtml"]')]);
 const path=join(downloads,name);await dl.saveAs(path);return {path,html:readFileSync(path,'utf8')};
}
async function openFile(ctx,path,label,errors){
 const f=await newPage(ctx,label,errors);await f.goto(pathToFileURL(path).href);
 await f.waitForFunction(()=>/Tag \d+/.test(document.querySelector('#clock').textContent),null,{timeout:20000});await wait(400);return f;
}
// Viele Laufzeit-DOM-Zustände erzeugen: alle Panels, Einklappen, Nur Szene, Ansichten, Labels, Suche, Glocke, Baumodus, Standortmenü.
async function churn(f){
 for(const p of ['overview','production','inventory','purchasing','staff','orders','fleet','finance','service','settings','help','history','network']){const b=f.locator(`button[data-panel="${p}"]`);if(await b.count())await b.first().evaluate(x=>x.click());await wait(60);}
 await f.fill('#search','gehäuse').catch(()=>{});await f.keyboard.press('Escape');
 for(const t of ['flow','vbar','flow','vbar','scene','scene','bell','bell','sites','sites'])await f.locator(`[data-toggle="${t}"]`).first().evaluate(x=>x.click()).catch(()=>{});
 for(const v of ['site','network','flat','hall']){const b=f.locator(`[data-view="${v}"]`);if(await b.count())await b.first().evaluate(x=>x.click());await wait(80);}
 for(const l of ['fleet','infra','none','all']){const b=f.locator(`[data-labels="${l}"]`);if(await b.count())await b.first().evaluate(x=>x.click());}
 await f.keyboard.press('/');await f.keyboard.type('montage');await wait(150);await f.keyboard.press('Escape');
 const bb=f.locator('.rail [data-action="build"]');if(await bb.count()){await bb.first().click();await f.keyboard.press('Escape');}
 await f.click('[data-speed="12"]');await wait(3000);await f.click('[data-speed="0"]');await wait(300);
}
const domInfo=f=>f.evaluate(()=>({labels:document.querySelectorAll('.scene3d-labels').length,vrows:document.querySelectorAll('#vbarList .vrow').length,vbarCount:document.querySelector('#vbarCount')?.textContent,canvas:document.querySelectorAll('canvas').length,scripts:document.querySelectorAll('script').length,pwn:window.__pwn??0,renderer:document.querySelector('#world')?.dataset.renderer}));

try{
 // ---------- QS-W0-01: Vorlage byte-identisch Gen 0 (Build) → 1 → 2 → 3, auch nach Weiterspielen und Panelwechseln ----------
 if(run('portable')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1600,height:900},acceptDownloads:true});
  const page=await newPage(ctx,'http',errors);await found(page);await starterLine(page);
  await page.evaluate(()=>{__qa.sim().step(200);__qa.render(true);});
  await churn(page);
  const gens=[await exportFrom(page,'p-gen1.html')];let src=null;
  for(let g=1;g<=3;g++){
   const f=await openFile(ctx,gens[g-1].path,'file'+g,errors);
   const a0=await activeSpeed(f);const info=await domInfo(f);
   check('portable',`Gen ${g}: Laden pausiert, Leiste zeigt Ⅱ (QS-W0-04)`,a0==='0',`aktiv=${a0}`);
   check('portable',`Gen ${g}: 1 Beschriftungsebene, Fahrzeugzeilen = Zähler, 1 Canvas`,info.labels<=1&&String(info.vrows)===info.vbarCount&&info.canvas===1,JSON.stringify(info));
   await churn(f);
   await f.click('[data-speed="12"]');const a12=await activeSpeed(f);await f.click('[data-speed="0"]');
   check('portable',`Gen ${g}: Leiste folgt Klick 12× → Ⅱ`,a12==='12'&&await activeSpeed(f)==='0',`12×→${a12}`);
   const after=await domInfo(f);
   check('portable',`Gen ${g}: nach Weiterspielen/Panelwechseln weiter 1 Ebene, Zeilen = Zähler`,after.labels<=1&&String(after.vrows)===after.vbarCount,JSON.stringify(after));
   if(g<3)gens.push(await exportFrom(f,`p-gen${g+1}.html`));
   src=f;
  }
  const t=[gen0,...gens.map(x=>x.html)].map(tpl);
  for(let g=1;g<=3;g++){const d=firstDiff(t[0],t[g]);check('portable',`Gen ${g} = Gen 0 (Build) byte-identisch bis auf Spielstand-/Prefs-Slot`,d===-1,d===-1?`${t[g].length} Zeichen`:`erste Abweichung bei ${d}: …${JSON.stringify(t[g].slice(Math.max(0,d-60),d+80))}`);}
  const slot=h=>/<script id="portable-template" type="application\/json">([\s\S]*?)<\/script>/.exec(h)?.[1];
  check('portable','Vorlagenslot #portable-template Gen 3 = Gen 0',slot(gens[2].html)===slot(gen0)&&!!slot(gen0),`${slot(gen0)?.length} Zeichen`);
  const shell=JSON.parse(slot(gen0));
  check('portable','Vorlage enthält keinen Spielstand (embedded-save/prefs = null)',/<script id="embedded-save" type="application\/json">null<\/script>/.test(shell)&&/<script id="embedded-prefs" type="application\/json">null<\/script>/.test(shell),'');
  check('portable','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- QS-W0-01 Injection: Namen/Suchtext mit </script><script> ----------
 if(run('inject')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1600,height:900},acceptDownloads:true});
  const page=await newPage(ctx,'inj-http',errors);await found(page);await starterLine(page);await page.click('[data-speed="0"]');
  await page.evaluate(p=>{const s=__qa.sim().state;s.orders.forEach(o=>o.customer='Kunde '+p);s.workers.forEach(w=>w.name='Person '+p);s.vehicles.forEach(v=>v.name='Wagen '+p);__qa.render(true);},PAYLOAD);
  await page.locator('button[data-panel="inventory"]:visible').first().click();await page.fill('#search',PAYLOAD);await page.keyboard.press('Escape');
  await page.keyboard.press('/');await page.keyboard.type(PAYLOAD);await page.keyboard.press('Escape');
  const g1=await exportFrom(page,'inj-gen1.html');
  const raw=n=>n.html.split('<script>window.__pwn').length-1;
  check('inject','Gen 1: Nutzlast nie roh im HTML (nur maskiert im Spielstand-Slot)',raw(g1)===0&&g1.html.includes('\\u003c/script\\u003e\\u003cscript\\u003e'),`roh=${raw(g1)}`);
  check('inject','Gen 1: Vorlage außerhalb der Slots = Gen 0 (Suchtext/Namen fließen nicht ein)',tpl(g1.html)===tpl(gen0),'');
  check('inject','Gen 1: Anzahl <script>-Tags = Gen 0',(g1.html.match(/<script\b/gi)||[]).length===(gen0.match(/<script\b/gi)||[]).length,'');
  const f1=await openFile(ctx,g1.path,'inj-file1',errors);
  const emb=JSON.parse(/<script id="embedded-save" type="application\/json">([\s\S]*?)<\/script>/.exec(g1.html)[1]);
  let i1=await domInfo(f1);
  await f1.locator('button[data-panel="orders"]').first().evaluate(b=>b.click());await f1.locator('button[data-panel="staff"]').first().evaluate(b=>b.click());await f1.locator('button[data-panel="fleet"]').first().evaluate(b=>b.click());await wait(300);
  const shown=await f1.evaluate(()=>document.body.innerText.includes('window.__pwn'));
  i1=await domInfo(f1);
  check('inject','file:// Gen 1: kein Ausbruch (__pwn=0), Namen als Text sichtbar, Stand unverändert eingebettet',i1.pwn===0&&shown&&emb.workers[0].name==='Person '+PAYLOAD,JSON.stringify({pwn:i1.pwn,shown,scripts:i1.scripts}));
  await f1.fill('#search',PAYLOAD).catch(()=>{});
  const g2=await exportFrom(f1,'inj-gen2.html');
  check('inject','Gen 2 (aus Datei mit Nutzlast exportiert): Vorlage = Gen 0, Nutzlast nur maskiert',tpl(g2.html)===tpl(gen0)&&raw(g2)===0,`roh=${raw(g2)}`);
  const f2=await openFile(ctx,g2.path,'inj-file2',errors);const i2=await domInfo(f2);
  check('inject','file:// Gen 2: kein Ausbruch',i2.pwn===0,JSON.stringify(i2));
  check('inject','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- QS-W0-04: Schreibschutz (zweiter Tab) ----------
 if(run('speed')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1400,height:850}});
  const a=await newPage(ctx,'spA',errors);await found(a);await starterLine(a);await a.click('[data-speed="4"]');
  const aAct=await activeSpeed(a);
  const b=await newPage(ctx,'spB',errors);await b.goto(url+'index.html');await b.waitForFunction(()=>!!globalThis.__qa);await wait(800);
  const b0=await activeSpeed(b);
  await b.click('[data-speed="12"]');await wait(500);const b1=await activeSpeed(b);
  await b.keyboard.press('Space');await wait(300);const b2=await activeSpeed(b);
  const st=await b.evaluate(()=>({speed:__qa.speed(),writable:__qa.writable(),status:document.querySelector('#statusText').textContent}));
  check('speed','Tab A: Leiste = gewählte Stufe 4×',aAct==='4',aAct);
  check('speed','Tab B (Schreibschutz): Leiste zeigt Ⅱ beim Laden, nach Klick 12× und nach Leertaste',b0==='0'&&b1==='0'&&b2==='0'&&st.speed===0&&!st.writable,JSON.stringify({b0,b1,b2,...st}));
  check('speed','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- QS-W0-05: festgehaltene Sicherung ----------
 if(run('backup')){
  const errors=[];
  const valid=new Simulation({mode:'guided',seed:9});valid.step(30);const good=valid.serialize(),goodT=JSON.parse(good).t;
  const setup=async(page,main,backup)=>{await page.goto(url+'dist/styles.css');await page.evaluate(({K,main,backup})=>{localStorage.clear();if(main!==null)localStorage.setItem(K,main);if(backup!==null)localStorage.setItem(K+'-backup',backup);localStorage.setItem('industrie-logistik-v1-prefs',JSON.stringify({mode:'guided'}));},{K,main,backup});await page.goto(url+'index.html');await page.waitForFunction(()=>!!globalThis.__qa);await wait(800);};
  const ls=page=>page.evaluate(K=>({main:localStorage.getItem(K),backup:localStorage.getItem(K+'-backup'),hold:localStorage.getItem(K+'-backup-hold')}),K);
  const foundConfirm=async page=>{await page.click('#welcome [data-action="start"]');if(await page.evaluate(()=>document.querySelector('#confirm').open))await page.click('[data-action="confirmOk"]');await page.waitForFunction(()=>!document.querySelector('#welcome').open,null,{timeout:10000});};
  const openSettings=async page=>{await page.locator('button[data-panel="settings"]:visible').first().click();await wait(200);};

  // a) beschädigter Hauptstand + intakte Sicherung → gründen → 3 echte Autosaves → Sicherung intakt → „Letzte Sicherung laden“
  {const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'bkA',errors);
   await setup(page,good.slice(0,good.length-40),good);
   check('backup','a) Willkommensdialog: „Letzte Sicherung laden“ sichtbar',await page.locator('#welcomeBackup').isVisible(),'');
   await foundConfirm(page);await starterLine(page);await page.click('[data-speed="12"]');
   const writes=[];let last=(await ls(page)).main;const t0=Date.now();
   while(writes.length<3&&Date.now()-t0<90000){await wait(500);const s=await ls(page);if(s.main!==last){last=s.main;writes.push({t:JSON.parse(s.main).t,backupSame:s.backup===good,hold:s.hold});}}
   await page.click('[data-speed="0"]');
   const s=await ls(page);
   check('backup','a) 3 echte Autosaves nach Gründen: Sicherung bitgleich alt (t='+goodT+'), Marker gesetzt',writes.length===3&&writes.every(w=>w.backupSame)&&s.backup===good&&!!s.hold,JSON.stringify(writes));
   await openSettings(page);const notice=await page.locator('#panelBody').innerText();
   check('backup','a) Einstellungen: Hinweis „Sicherung des vorherigen Unternehmens … bleibt erhalten“ + „Alte Sicherung verwerfen“',/Sicherung des vorherigen Unternehmens/.test(notice)&&await page.locator('#panelBody [data-action="discardBackup"]').count()===1,notice.slice(0,200));
   await page.click('#panelBody [data-action="backup"]');await page.click('[data-action="confirmOk"]');await wait(800);
   const r=await page.evaluate(()=>__qa.sim().state.t);const s2=await ls(page);
   check('backup','a) „Letzte Sicherung laden“ lädt alte Sicherung, Marker frei, Hauptstand = Sicherung',r===goodT&&!s2.hold&&JSON.parse(s2.main).t===goodT,JSON.stringify({t:r,hold:s2.hold,main:JSON.parse(s2.main).t}));
   await ctx.close();}

  // b) „Alte Sicherung verwerfen“ gibt frei, danach normale Rotation
  {const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'bkB',errors);
   await setup(page,'{kaputt',good);await foundConfirm(page);await starterLine(page);
   await page.evaluate(()=>{__qa.sim().step(20);__qa.save();__qa.sim().step(20);__qa.save();});
   const s0=await ls(page);
   await openSettings(page);await page.click('#panelBody [data-action="discardBackup"]');await page.click('[data-action="confirmOk"]');await wait(400);
   const s1=await ls(page);
   await page.evaluate(()=>{__qa.sim().step(20);__qa.save();});const s2=await ls(page);
   let bOk=false;try{bOk=Simulation.fromJSON(s1.backup).state.t===JSON.parse(s0.main).t;}catch{}
   check('backup','b) Vor Verwerfen: Sicherung alt; nach Verwerfen: Marker frei, Sicherung = vorheriger Hauptstand des neuen Unternehmens; danach rotiert',s0.backup===good&&!!s0.hold&&!s1.hold&&bOk&&s2.backup===s1.main,JSON.stringify({holdVor:!!s0.hold,holdNach:s1.hold,bOk,rot:s2.backup===s1.main}));
   const notice=(await openSettings(page),await page.locator('#panelBody').innerText());
   check('backup','b) Nach Verwerfen kein Hinweis mehr',!/Sicherung des vorherigen Unternehmens/.test(notice),'');
   await ctx.close();}

  // c) gültiger Hauptstand + gründen → Sicherung = altes Unternehmen, bleibt über 3 Speichervorgänge
  let cMainB='';
  {const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'bkC',errors);
   await setup(page,good,null);
   const welcome=await page.evaluate(()=>document.querySelector('#welcome').open);
   if(!welcome){await openSettings(page);await page.click('#panelBody [data-action="new"]');await page.click('[data-action="confirmOk"]');await wait(300);}
   await foundConfirm(page);await starterLine(page);
   const after=[];for(let i=0;i<3;i++){await page.evaluate(()=>{__qa.sim().step(15);__qa.save();});after.push((await ls(page)).backup===good);}
   const s=await ls(page);cMainB=s.main;
   check('backup','c) Gültiger Hauptstand + Gründen: Sicherung = altes Unternehmen (bitgleich), über 3 Speichervorgänge',after.every(Boolean)&&!!s.hold,JSON.stringify(after));
   // d) Risiko: Hauptstand des neuen Unternehmens wird später beschädigt → neues Unternehmen ohne eigene Sicherung
   await page.evaluate(()=>{window.onbeforeunload=null;});
   await page.goto(url+'dist/styles.css');await page.evaluate(K=>localStorage.setItem(K,'{kaputt'),K);
   await page.goto(url+'index.html');await page.waitForFunction(()=>!!globalThis.__qa);await wait(800);
   const d=await ls(page);const wb=await page.locator('#welcomeBackup').isVisible();
   let newCompanyRecoverable=false;for(const x of [d.main,d.backup]){try{if(x&&Simulation.fromJSON(x).state.seed===JSON.parse(cMainB).seed&&x!==good)newCompanyRecoverable=true;}catch{}}
   known('backup','d) Befund QS-W0-11: neues Unternehmen nach Beschädigung seines Hauptstands wiederherstellbar',newCompanyRecoverable,`Sicherung zeigt altes Unternehmen t=${JSON.parse(d.backup).t}; Willkommen „Letzte Sicherung laden“ sichtbar=${wb}`);
   await ctx.close();}

  // e) A gültig → gründen B → weiterspielen → gründen C: B ohne jede Kopie
  {const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'bkE',errors);
   await setup(page,good,null);
   const newCo=async()=>{if(!await page.evaluate(()=>document.querySelector('#welcome').open)){await openSettings(page);await page.click('#panelBody [data-action="new"]');await page.click('[data-action="confirmOk"]');await wait(300);}await foundConfirm(page);};
   await newCo();await starterLine(page);await page.evaluate(()=>{__qa.sim().step(120);__qa.save();});const bMain=(await ls(page)).main;
   await newCo();await page.evaluate(()=>{__qa.sim().step(5);__qa.save();});const s=await ls(page);
   const bKept=[s.main,s.backup].includes(bMain);
   check('backup','e) Hinweis: A → B (120 Min.) → C: Sicherung bleibt A; B ohne Kopie (Rückfrage warnt „vorher exportieren“)',s.backup===good&&!bKept,`backup=A:${s.backup===good} · B erhalten:${bKept}`);
   await ctx.close();}

  // f) keine/ungültige Sicherung → Knopf verborgen
  {const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await newPage(ctx,'bkF',errors);
   await setup(page,'{kaputt','{auch kaputt');const v=await page.locator('#welcomeBackup').isVisible();
   check('backup','f) Ungültige Sicherung: „Letzte Sicherung laden“ im Willkommensdialog verborgen',!v,'');
   await ctx.close();}
  check('backup','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
 }

 // ---------- QS-W0-06: HUD-Lager = Lagerpanel = Standortmenü während echter Fertigung ----------
 if(run('stock')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});
  const page=await newPage(ctx,'stock',errors);await found(page,{mode:'sandbox'});await starterLine(page);
  const samples=[];
  for(let i=0;i<6;i++){
   await page.click('[data-speed="12"]');await wait(2500);await page.click('[data-speed="0"]');await wait(300);
   // Laufende Fertigung legt keine Ware mit location 'machine' ab (verbraucht direkt); Befundfall daher ab Stichprobe 4 wie im Original-Repro über die Lager-API.
   if(i===3)await page.evaluate(()=>__qa.sim().api.inventory.add({item:'housing',qty:3,site:'site-1',location:'machine'}));
   const r=await page.evaluate(()=>{__qa.render(true);const s=__qa.sim().state,site=s.selectedSite;const m=/Lager ([\d.]+)\/([\d.]+)/.exec(document.querySelector('#sbStock').textContent);
    const inMachine=s.batches.filter(b=>b.site===site&&b.qty>0&&b.location==='machine').reduce((n,b)=>n+b.qty,0);return {hud:m&&m[1],cap:m&&m[2],inMachine,api:__qa.sim().api.inventory.used(site)};});
   await page.locator('button[data-panel="inventory"]:visible').first().click();await wait(200);
   const panel=await page.evaluate(()=>{const t=document.querySelector('#panelBody').innerHTML;return {used:/<b>([\d.]+)<\/b><small>Einheiten am Standort/.exec(t)?.[1],cap:/<b>([\d.]+)<\/b><small>Lagerkapazität/.exec(t)?.[1]};});
   await page.keyboard.press('Escape');
   await page.click('#siteBtn');await wait(150);const menu=await page.evaluate(()=>/Lager ([\d.]+)\/([\d.]+)/.exec(document.querySelector('#siteList').textContent)?.slice(1,3).join('/'));await page.click('#siteBtn');
   samples.push({...r,panel:panel.used+'/'+panel.cap,menu});
  }
  const ok=samples.every(x=>x.hud+'/'+x.cap===x.panel&&x.panel===x.menu&&Number(x.hud.replace('.',''))===x.api);
  check('stock','6 Stichproben während Fertigung: HUD = Panel = Standortmenü = api.used',ok,JSON.stringify(samples));
  check('stock','Stichproben 4–6 enthalten Ware in Anlagen (Fall des Befunds)',samples.some(x=>x.inMachine>0),samples.map(x=>x.inMachine).join(','));
  check('stock','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- QS-W0-10: Version 0.9 in Oberfläche ----------
 if(run('version')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});
  const page=await newPage(ctx,'ver',errors);await found(page);
  const texts=[await page.evaluate(()=>document.body.innerText)];
  for(const p of ['settings','help','overview']){await page.locator(`button[data-panel="${p}"]`).first().evaluate(b=>b.click());await wait(200);texts.push(await page.locator('#panelBody').innerText());}
  const all=texts.join('\n');const v08=all.match(/.{0,30}\b0[.,]8\b.{0,30}/g)||[];
  check('version','Statuszeile/Einstellungen/Handbuch: „0.9“, kein „0.8“',/0\.9 · ENTWICKLUNG/.test(texts[0])&&/0\.9/.test(texts[1])&&/0\.9/.test(texts[2])&&!v08.length,v08.join(' | ')||'kein 0.8');
  const g=readFileSync(join(root,'dist/portable.html'),'utf8');
  check('version','portable.html: 0.9, kein „Entwicklungsfassung 0.8“/„0.8 · ENTWICKLUNG“',/0\.9 · ENTWICKLUNG/.test(g)&&!/0\.8 · ENTWICKLUNG|Entwicklungsfassung 0\.8/.test(g),'');
  check('version','Keine Konsolen-/Seitenfehler',errors.length===0,errors.join(' | '));
  await ctx.close();
 }

 // ---------- QS-W0-02: relative Bildrate HUD / Lagerpanel / Nur Szene bei 12×, 2D und 3D ----------
 if(run('perf')){
  const secs=Number(opt['perf-seconds']||12);const out={};
  const INIT=()=>{window.__p={frames:0,lt:0};try{new PerformanceObserver(l=>{window.__p.lt+=l.getEntries().length;}).observe({type:'longtask'});}catch{}const f=()=>{window.__p.frames++;requestAnimationFrame(f);};requestAnimationFrame(f);};
  for(const r of ['2d','3d']){
   const errors=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});await ctx.addInitScript(INIT);
   const page=await newPage(ctx,'perf'+r,errors);await page.goto(url+'index.html?renderer='+r);await page.waitForFunction(()=>document.querySelector('#welcome')?.open===true);
   await page.click('#welcome [data-action="start"]');await page.waitForFunction(()=>!document.querySelector('#welcome').open);await page.waitForFunction(()=>!!globalThis.__qa);
   await starterLine(page);await page.click('[data-speed="12"]');await wait(2000);
   const measure=async()=>{await wait(1000);await page.evaluate(()=>{window.__p.frames=0;window.__p.lt=0;});await wait(secs*1000);return page.evaluate(s=>({fps:+(window.__p.frames/s).toFixed(1),lt:window.__p.lt}),secs);};
   const setMode=async m=>{await page.keyboard.press('Escape');await page.evaluate(()=>document.body.classList.remove('scene-only'));
    if(m==='scene')await page.evaluate(()=>{const b=document.querySelector('[data-toggle="scene"]');if(b)b.click();else document.body.classList.add('scene-only');});
    if(m==='panel')await page.locator('button[data-panel="inventory"]:visible').first().click();};
   const rows=[];
   for(const round of [1,2])for(const m of ['hud','scene','panel']){await setMode(m);if(m==='hud'||m==='panel'){const so=await page.evaluate(()=>document.body.classList.contains('scene-only'));if(so)await page.evaluate(()=>document.querySelector('[data-toggle="scene"]')?.click());}
    const x=await measure();rows.push({round,mode:m,...x,clock:await page.locator('#clock').textContent()});console.log(' ',r,JSON.stringify(rows.at(-1)));
    if(m==='scene')await page.evaluate(()=>{const b=document.querySelector('[data-toggle="scene"]');if(document.body.classList.contains('scene-only')&&b)b.click();document.body.classList.remove('scene-only');});}
   const avg=m=>+(rows.filter(x=>x.mode===m).reduce((n,x)=>n+x.fps,0)/2).toFixed(1);
   out[r]={hud:avg('hud'),scene:avg('scene'),panel:avg('panel')};
   const rel=k=>out[r].scene?+(out[r][k]/out[r].scene).toFixed(2):0;
   check('perf',`${r}: 12× HUD/Panel ≥ 90 % von „Nur Szene“ (relativ, headless)`,rel('hud')>=0.9&&rel('panel')>=0.9,`Nur Szene ${out[r].scene} · HUD ${out[r].hud} (${rel('hud')}) · Lagerpanel ${out[r].panel} (${rel('panel')}) fps`);
   check('perf',`${r}: keine Konsolen-/Seitenfehler`,errors.length===0,errors.join(' | '));
   await ctx.close();
  }
  console.log('  Bildrate:',JSON.stringify(out));
 }
}catch(e){console.error(e);check('ablauf','Ablauf ohne Ausnahme',false,e.message);}
finally{await browser.close();server.kill();cleanup();rmSync(downloads,{recursive:true,force:true});}
const failed=results.filter(r=>!r.ok);
console.log(JSON.stringify({passed:results.length-failed.length,failed:failed.length,failures:failed.map(f=>`[${f.section}] ${f.name}`)},null,1));
process.exit(failed.length?1:0);
