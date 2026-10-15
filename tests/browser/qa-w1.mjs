// A11 · unabhängige Browser-QS Welle 1 (0.9). Nicht Teil von `npm test`.
// Aufruf: node tests/browser/qa-w1.mjs [--only=unload,transit,tabs,migrate,entry] [--state08=<pfad>]
// Echtes Chromium (Playwright global). tmp-Kopie wie qa-w0.mjs; nur Lesehaken globalThis.__qa in der tmp-Kopie von app.js.
// Bedienung ausschließlich über die Oberfläche (Klicks); __qa nur zum Beobachten des Fachzustands.
// --state08: 0.8-Spielstand (localStorage-Format), erzeugt mit dist aus `git archive bf76e22 dist` (siehe docs/QS-0.9-W1.md).
import {readFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';

const opt=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')).map(([k,v])=>[k,v??true]));
const only=opt.only?new Set(String(opt.only).split(',')):null;const run=n=>!only||only.has(n);
const STORE='industrie-logistik-v1';
const results=[];const check=(sec,name,ok,detail='')=>{results.push({sec,name,ok:!!ok});console.log(ok?'  ok ':'  FEHLER',`[${sec}]`,name,detail?('· '+String(detail).slice(0,300)):'');};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const pw=loadPlaywright();if(!pw){console.error('Playwright nicht gefunden.');process.exit(2);}
const {root,cleanup}=prepareRoot(false);
appendFileSync(join(root,'dist/app.js'),'\n;globalThis.__qa={sim:()=>sim,writable:()=>writable,speed:()=>speed,started:()=>started};\n');
const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);

const txt=(page,s)=>page.locator(s).first().textContent().catch(()=>'');
const openP=async(page,k,t)=>{if(!new RegExp(t).test(await txt(page,'#panelTitle'))||await page.locator('#panel').isHidden()){await page.click(`[data-panel="${k}"]`);await wait(400);}};
const st=(page,f)=>page.evaluate(f);
async function boot(page){await page.waitForFunction(()=>!!globalThis.__qa&&(document.querySelector('#welcome')?.open||__qa.started()),null,{timeout:30000});}
async function startHub(page){
 await page.goto(url+'index.html');await boot(page);
 await page.click('#welcome [data-action="start"]');await wait(600);
 await page.click('[data-panel="overview"]');await wait(300);
 await page.getByRole('button',{name:/Startbetrieb einrichten/}).first().click();await wait(800);
 await openP(page,'contracts','Vertr');await page.getByRole('button',{name:/Vertrag annehmen/}).first().click();await wait(400);
}
const summary=page=>st(page,()=>{const s=__qa.sim().state,p=s.batches.filter(b=>b.item==='parcel');return {t:s.t,money:s.money,yard:s.yard.map(a=>a.phase+':'+a.unloaded+'/'+a.parcels),inbound:p.filter(b=>b.location==='inbound').reduce((n,b)=>n+b.qty,0),stock:p.filter(b=>b.location==='stock').reduce((n,b)=>n+b.qty,0),vehicle:p.filter(b=>b.location==='vehicle').reduce((n,b)=>n+b.qty,0),ship:s.shipments.map(x=>x.status+':'+x.qty),ledger:s.ledger.length,ser:__qa.sim().serialize().length};});
async function reloadAndCompare(page,sec,label){
 const before=await summary(page);const raw=await st(page,()=>__qa.sim().serialize());
 await page.reload();await boot(page);await wait(500);
 const after=await summary(page);const raw2=await st(page,()=>__qa.sim().serialize());
 check(sec,`${label}: Stand nach Neuladen identisch (pausiert)`,raw===raw2,`vor ${JSON.stringify(before).slice(0,200)} · nach ${JSON.stringify(after).slice(0,200)}`);
 check(sec,`${label}: schreibbar nach Neuladen`,await st(page,()=>__qa.writable()));
 return {before,after};
}
try{
 if(run('resume')){
  const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await ctx.newPage();
  await page.goto(url+'index.html');await boot(page);await page.click('#welcome [data-action="start"]');await wait(500);
  const p=()=>page.evaluate(()=>({t:__qa.sim().state.t,speed:__qa.speed(),st:document.querySelector('#statusText').textContent,active:[...document.querySelectorAll('[data-speed].active')].map(b=>b.dataset.speed)}));
  const a=await p();await wait(2500);const b=await p();
  check('resume','neues Unternehmen startet pausiert',b.t===a.t&&b.speed===0,JSON.stringify([a,b]));
  await page.click('[data-speed="4"]');await wait(1500);await page.reload();await boot(page);await wait(300);const c=await p();await wait(3000);const d=await p();
  check('resume','nach Neuladen pausiert (kein Weiterlaufen ohne Spieleraktion)',d.t===c.t&&d.speed===0,JSON.stringify([c,d]));
  await ctx.close();
 }
 if(run('unload')||run('transit')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1600,height:900}});const page=await ctx.newPage();watch(page,errors,'hub');
  await startHub(page);await page.click('[data-speed="12"]');
  await page.waitForFunction(()=>__qa.sim().state.yard.some(a=>['approach','gate','queue','toDock','docking'].includes(a.phase)),null,{timeout:240000,polling:50});
  await page.click('[data-speed="1"]');
  await page.waitForFunction(()=>__qa.sim().state.yard.some(a=>a.phase==='unloading'&&a.unloaded>0),null,{timeout:240000,polling:50});
  await page.click('[data-speed="0"]');
  check('unload','Lkw beim Neuladen in Phase Entladen',await st(page,()=>__qa.sim().state.yard.some(a=>a.phase==='unloading'&&a.unloaded<a.parcels)));
  await reloadAndCompare(page,'unload','Entladen');
  // Neuladen während laufendem Spiel (F5 bei Tempo 12): Verlust höchstens bis letzte Spielminute vor beforeunload
  await page.click('[data-speed="12"]');await wait(1500);
  const t0=await st(page,()=>__qa.sim().state.t);await page.reload();await boot(page);const t1=await st(page,()=>__qa.sim().state.t);
  check('unload','Neuladen bei Tempo 12: kein Zeit-/Mengenverlust über 1 Spielminute',t1>=t0-1,`vor ${t0} nach ${t1}`);
  check('unload','nach Neuladen pausiert',await st(page,()=>__qa.speed())===0);
  // Weiter bis Abfertigung, Versand über Auftragsfenster
  await page.click('[data-speed="12"]');
  await page.waitForFunction(()=>{const s=__qa.sim().state;return s.yard[0]?.phase==='gone'&&!s.batches.some(b=>b.item==='parcel'&&b.location==='inbound'&&b.qty>0);},null,{timeout:240000});
  await page.click('[data-speed="0"]');
  await openP(page,'orders','Auftr');const f=page.locator('#panelBody form').first();await f.locator('button').last().click();await wait(500);
  await page.click('[data-speed="12"]');
  await page.waitForFunction(()=>__qa.sim().state.shipments.some(x=>x.status==='transit'),null,{timeout:240000});await page.click('[data-speed="0"]');
  const {after}=await reloadAndCompare(page,'transit','Fahrt');
  check('transit','Ladung im Fahrzeug erhalten',after.vehicle>0&&after.ship.some(x=>x.startsWith('transit')),JSON.stringify(after));
  const cash0=await st(page,()=>__qa.sim().state.money);
  await page.click('[data-speed="12"]');
  await page.waitForFunction(()=>__qa.sim().state.shipments.every(x=>x.paid),null,{timeout:240000});await page.click('[data-speed="0"]');
  const s=await st(page,()=>{const s=__qa.sim().state;const pay=s.ledger.filter(l=>/^payment:/.test(l.key));return {pay:pay.length,ship:s.shipments.length,sum:pay.reduce((n,l)=>n+l.amount,0),inv:s.shipments.reduce((n,x)=>n+x.invoiceAmount,0),money:s.money};});
  check('transit','nach Laden: genau eine Zahlung je Lieferung, Betrag = Rechnung',s.pay===s.ship&&Math.abs(s.sum-s.inv)<0.01,JSON.stringify(s));
  check('transit','Liquidität steigt durch Zahlung',s.money>cash0,`${cash0} → ${s.money}`);
  check('unload/transit','Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
  await ctx.close();
 }
 if(run('tabs')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1400,height:850}});const a=await ctx.newPage();watch(a,errors,'tabA');
  await startHub(a);await a.click('[data-speed="12"]');await wait(2000);
  const b=await ctx.newPage();watch(b,errors,'tabB');await b.goto(url+'index.html');await boot(b);await wait(800);
  check('tabs','zweiter Tab schreibgeschützt',!(await st(b,()=>__qa.writable())),await txt(b,'#statusText'));
  check('tabs','erster Tab bleibt schreibend',await st(a,()=>__qa.writable()));
  const lock=await txt(b,'#statusText');check('tabs','Sperrhinweis im zweiten Tab verständlich',/Tab|geöffnet|schreibgeschützt|Lesezugriff/i.test(lock),lock);
  await b.click('[data-speed="12"]').catch(()=>{});await wait(1500);
  check('tabs','Tempo im zweiten Tab wirkungslos',await st(b,()=>__qa.speed())===0);
  const before=await st(b,()=>__qa.sim().state.contracts.filter(k=>k.status==='active').length);
  await openP(b,'contracts','Vertr');const btn=b.getByRole('button',{name:/Vertrag (annehmen|kündigen)/}).first();if(await btn.count())await btn.click().catch(()=>{});await wait(300);
  check('tabs','Befehl im zweiten Tab ändert nichts',await st(b,()=>__qa.sim().state.contracts.filter(k=>k.status==='active').length)===before);
  await a.click('[data-speed="0"]');const tA=await st(a,()=>__qa.sim().state.t);
  await a.close({runBeforeUnload:true});await wait(500);
  await b.reload();await boot(b);await wait(500);
  const tB=await st(b,()=>__qa.sim().state.t);
  check('tabs','nach Schließen von Tab A übernimmt B den Stand von A schreibend',tB===tA&&await st(b,()=>__qa.writable()),`A ${tA} B ${tB}`);
  await wait(3000);const tB2=await st(b,()=>({t:__qa.sim().state.t,speed:__qa.speed()}));
  check('tabs','nach Übernahme pausiert (läuft nicht ungefragt weiter)',tB2.t===tB&&tB2.speed===0,JSON.stringify([tB,tB2]));
  check('tabs','Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
  await ctx.close();
 }
 if(run('migrate')&&opt.state08){
  const raw=readFileSync(opt.state08,'utf8');const errors=[];const ctx=await browser.newContext({viewport:{width:1400,height:850}});const page=await ctx.newPage();watch(page,errors,'mig');
  await page.goto(url+'dist/styles.css');
  await page.evaluate(({K,raw})=>{localStorage.clear();localStorage.setItem(K+'-guided',raw);localStorage.setItem(K+'-prefs',JSON.stringify({mode:'guided'}));},{K:STORE,raw});
  await page.goto(url+'index.html');await boot(page);await wait(1200);
  const s=await st(page,()=>{const s=__qa.sim().state;return {t:s.t,money:s.money,b:s.buildings.length,batches:s.batches.length,contracts:s.contracts.length,yard:Array.isArray(s.yard),w:__qa.writable(),welcome:document.querySelector('#welcome').open};});
  const o=JSON.parse(raw);
  check('migrate','0.8-Stand geladen (Anlagen, Chargen gleich, kein Willkommen)',s.b===o.buildings.length&&s.batches===o.batches.length&&!s.welcome&&s.w,JSON.stringify(s));
  const sp=await st(page,()=>({speed:__qa.speed(),t:__qa.sim().state.t}));await wait(3000);const sp2=await st(page,()=>({speed:__qa.speed(),t:__qa.sim().state.t}));
  check('migrate','nach Migration pausiert, Zeit unverändert (0.8: t='+o.t+')',s.t===o.t&&sp2.t===sp.t&&sp2.speed===0,JSON.stringify([s.t,sp,sp2]));
  const idb=await page.evaluate(async K=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open(K);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});const get=(store,key)=>new Promise(res=>{try{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);}catch(e){res('ERR '+e.message);}});const v=await get('saves',K+'-guided');const m=await get('meta','migrated');db.close();return {has:!!v,len:typeof v==='string'?v.length:JSON.stringify(v||'').length,migrated:!!m,ls:!!localStorage.getItem(K+'-guided')};},STORE);
  check('migrate','in IndexedDB übernommen, Marker gesetzt',idb.has&&idb.migrated,JSON.stringify(idb));
  await page.reload();await boot(page);await wait(800);
  const ls2=await page.evaluate(K=>!!localStorage.getItem(K+'-guided'),STORE);const t2=await st(page,()=>__qa.sim().state.t);
  check('migrate','zweiter Start: Stand aus IndexedDB, localStorage-Original entfernt',t2>=o.t&&!ls2,`t ${t2} ls ${ls2}`);
  // Hub nach Migration: Vertragsfenster
  await openP(page,'contracts','Vertr');const body=await txt(page,'#panelBody');
  check('migrate','Vertragsangebot nach Migration sofort sichtbar',/Vertrag annehmen/.test(body),body.slice(0,200));
  check('migrate','Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
  await ctx.close();
 }
 if(run('entry')){
  const errors=[];const ctx=await browser.newContext({viewport:{width:1366,height:768}});const page=await ctx.newPage();watch(page,errors,'entry');
  await page.goto(url+'index.html');await boot(page);
  const welcome=await txt(page,'#welcome');
  await page.click('#welcome [data-action="start"]');await wait(800);
  const hud=await page.evaluate(()=>document.body.innerText);
  await page.click('.rail [data-action="build"]').catch(()=>{});await wait(300);
  const tray=await txt(page,'#buildItems');await page.keyboard.press('Escape');
  await page.click('[data-panel="overview"]');await wait(300);const ov=await txt(page,'#panelBody');
  const prod=/Montage|Fertigung|Maschine|Rezept|Prüfstand|Verpackung|Gehäuse|Platine|Produktion/;
  console.log('--- Einstieg Willkommen:',welcome.replace(/\s+/g,' ').slice(0,300));
  console.log('--- HUD (Auszug):',hud.replace(/\s+/g,' ').slice(0,900));
  console.log('--- Baumenü:',tray.replace(/\s+/g,' '));
  console.log('--- Übersicht:',ov.replace(/\s+/g,' ').slice(0,700));
  check('entry','Willkommen ohne Fertigungsbegriffe',!prod.test(welcome),welcome.match(prod)?.[0]);
  check('entry','HUD/Mission ohne Fertigungsbegriffe',!prod.test(hud),hud.match(prod)?.[0]);
  check('entry','Baumenü ohne Fertigungsanlagen im Einstieg',!prod.test(tray),tray.match(prod)?.[0]);
  const ov2=ov.replace(/Fertigung folgt später[^.]*\./,'');check('entry','Übersicht ohne Fertigungsbegriffe (Hinweis „Fertigung folgt später“ zulässig)',!prod.test(ov2),ov2.match(prod)?.[0]);
  check('entry','Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
  await ctx.close();
 }
}catch(e){check('ablauf','ohne Ausnahme',false,e.stack?.slice(0,400));}
await browser.close();server.kill();cleanup();
const bad=results.filter(r=>!r.ok);console.log(`\nErgebnis: ${results.length-bad.length}/${results.length} ok`);process.exitCode=bad.length?1:0;
