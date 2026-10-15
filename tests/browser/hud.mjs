// Echter Browser-Check des Leitstand-HUD (A10). Kein Teil von `npm test`.
// Voraussetzung: `python3 scripts/package.py` hat die Root-index.html erzeugt.
// Aufruf: node tests/browser/hud.mjs [--out docs/assets]
// Playwright wird global erwartet; Chromium wird unter $PW_CHROMIUM oder /opt/pw-browsers gesucht.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const extra=process.argv.includes('--extra');
const outDir=path.resolve(root,process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'docs/assets');
let chromium;
try{({chromium}=await import('playwright'));}
catch{const global=execSync('npm root -g',{encoding:'utf8'}).trim();({chromium}=await import(pathToFileURL(path.join(global,'playwright','index.mjs')).href));}
function findChromium(){
 if(process.env.PW_CHROMIUM)return process.env.PW_CHROMIUM;
 const base='/opt/pw-browsers';if(!fs.existsSync(base))return undefined;
 for(const dir of fs.readdirSync(base).filter(d=>/^chromium-\d+$/.test(d)).sort().reverse()){const exe=path.join(base,dir,'chrome-linux','chrome');if(fs.existsSync(exe))return exe;}
 return undefined;
}
if(!fs.existsSync(path.join(root,'index.html')))throw Error('Root-index.html fehlt. Zuerst python3 scripts/package.py ausführen.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
const server=http.createServer((req,res)=>{const url=decodeURIComponent(new URL(req.url,'http://x').pathname);const file=path.join(root,url==='/'?'index.html':url);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('nicht gefunden');return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:findChromium(),headless:true});
const failures=[],log=[];
const check=(ok,msg)=>{(ok?log:failures).push((ok?'OK   ':'FEHLER ')+msg);};
const HUD=['.topbar','.rail','.kpis','.view-switch','#flow','.camera-controls','#vbar','#mission','.statusbar'];
async function rects(page,selectors){return page.evaluate(sel=>sel.map(s=>{const e=document.querySelector(s);if(!e)return {s,visible:false};const st=getComputedStyle(e),r=e.getBoundingClientRect();return {s,visible:st.display!=='none'&&st.visibility!=='hidden'&&!e.hidden&&r.width>0&&r.height>0,x:r.left,y:r.top,w:r.width,h:r.height};}),selectors);}
const hit=(a,b)=>a.x<b.x+b.w-0.5&&b.x<a.x+a.w-0.5&&a.y<b.y+b.h-0.5&&b.y<a.y+a.h-0.5;
async function overlapCheck(page,label,withPanel){
 const list=(await rects(page,withPanel?[...HUD,'#panel']:HUD)).filter(r=>r.visible);
 const pairs=[];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(hit(list[i],list[j]))pairs.push(list[i].s+' ↔ '+list[j].s);
 check(!pairs.length,`${label}: keine Überlappung sichtbarer HUD-Flächen${withPanel?' mit Panel':''}${pairs.length?' – '+pairs.join(', '):''}`);
 const vw=page.viewportSize();const outside=list.filter(r=>r.x<-0.5||r.y<-0.5||r.x+r.w>vw.width+0.5||r.y+r.h>vw.height+0.5).map(r=>r.s);
 check(!outside.length,`${label}: alle HUD-Flächen im Bildschirm${outside.length?' – '+outside.join(', '):''}`);
}
for(const [width,height] of [[1920,1080],[1280,800]]){
 const label=`${width}×${height}`;
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});const page=await context.newPage();
 const errors=[];page.on('console',m=>{if(m.type()!=='error')return;const where=m.location()?.url||'';if(/\/favicon\.ico$/.test(where)){log.push(`${label}: Hinweis – Browser fragt /favicon.ico ab (404, kein Spielfehler)`);return;}errors.push(m.text()+(where?' @ '+where:''));});page.on('pageerror',e=>errors.push(String(e)));
 page.on('dialog',d=>d.dismiss());
 await page.goto(base+'index.html');
 await page.waitForSelector('#welcome[open]');await page.click('[data-action="start"]');
 // Start über „Unternehmen gründen“. Verweigert der Browser die Schreibsperre, bleibt der Dialog offen:
 // dann wird der vorhandene Weg „Ohne lokale Speicherung spielen“ genutzt und der Grund protokolliert.
 try{await page.waitForFunction(()=>!document.querySelector('#welcome').open,null,{timeout:4000});log.push(`${label}: Start über data-action="start"`);}
 catch{const reason=await page.textContent('#statusText');log.push(`${label}: HINWEIS – Start mit lokaler Speicherung verweigert („${reason}“); Ersatzweg temporärer Modus`);
  await page.click('#welcome [data-action="temporary"]');await page.click('#confirm [data-action="confirmOk"]');await page.waitForFunction(()=>!document.querySelector('#welcome').open);}
 // Echte Bedienpfade: Startbetrieb (Depot-Grundausstattung, A02 W1b) über die Zentrale, danach öffnet das Vertragsfenster:
 // Startvertrag annehmen, Zeitraffer.
 await page.click('.rail [data-panel="overview"]');await page.click('#panelBody [data-action="starter"]');
 await page.click('#panelBody [data-action="acceptContract"]');
 await page.click('[data-action="close"]');
 await page.click('[data-speed="12"]');await page.waitForTimeout(6000);await page.click('[data-speed="0"]');await page.waitForTimeout(400);
 const hud=await page.evaluate(()=>Object.fromEntries(['siteCode','siteName','siteStatus','clock','shiftName','kpiDelivered','kpiVehicles','kpiPunctual','st-inbound-sub','st-production-n','sbDocks','sbStaff','bellCount','vbarCount'].map(id=>[id,document.getElementById(id).textContent])));
 log.push(`${label}: HUD ${JSON.stringify(hud)}`);
 check(hud.sbStaff==='Personal 2/2 im Dienst',`${label}: Statuszeile Personal aus Zustand`);
 // Nach Vertragsannahme kann im Zeitraffer bereits der erste Fremd-Lkw in der Leiste stehen; geprüft wird das eigene Fahrzeug.
 check(Number(hud.vbarCount)>=1&&await page.locator('#vbarList .vrow:not(.foreign)').count()===1,`${label}: Fahrzeugleiste zeigt das gekaufte Fahrzeug`);
 check(/^Tag 1 · \d\d:\d\d$/.test(hud.clock)&&hud.clock!=='Tag 1 · 08:00',`${label}: Uhr läuft im Zeitraffer`);
 await overlapCheck(page,label,false);
 fs.mkdirSync(outDir,{recursive:true});await page.screenshot({path:path.join(outDir,`hud-0.9-${width}.png`)});
 // Suche „/“ → Treffer → Akte.
 await page.keyboard.press('/');check(await page.evaluate(()=>document.activeElement?.id==='cmd'),`${label}: Taste / fokussiert die Suche`);
 await page.keyboard.type('Laderampe');await page.waitForSelector('#cmdResults [data-hit]');await page.keyboard.press('Enter');
 check(await page.evaluate(()=>!document.querySelector('#panel').hidden&&document.querySelector('#panelTitle').textContent==='Objektakte'),`${label}: Suchtreffer öffnet Objektakte`);
 await overlapCheck(page,label+' Akte',true);
 // Breites Fachfenster (Finanzen) neben dem HUD.
 await page.click('.rail [data-panel="finance"]');await overlapCheck(page,label+' Finanzen (breit)',true);
 if(extra)await page.screenshot({path:path.join(outDir,`hud-0.9-${width}-panel.png`)});
 // Glocke öffnen.
 await page.click('[data-action="close"]');await page.click('#bellBtn');if(extra)await page.screenshot({path:path.join(outDir,`hud-0.9-${width}-bell.png`)});
 const bellRows=await page.locator('#bellList .drop-row').count();check(!(await page.locator('#bellMenu').isHidden())&&String(bellRows)===(hud.bellCount||'0'),`${label}: Glocke listet ${bellRows} Meldungen`);
 await page.keyboard.press('Escape');check(await page.locator('#bellMenu').isHidden(),`${label}: Escape schließt Meldungen`);
 // Nur Szene.
 await page.click('#sceneOnlyBtn');check(await page.locator('#flow').isHidden()&&await page.locator('.kpis').isHidden(),`${label}: Panels ausblenden zeigt nur die Szene`);await page.click('#sceneOnlyBtn');
 // Größere Schrift über die bestehende Einstellung: HUD bleibt überlappungsfrei.
 await page.click('button.square[data-panel="settings"]');await page.click('#panelBody [data-pref="large"]');await page.click('[data-action="close"]');
 check(await page.evaluate(()=>document.body.classList.contains('large')),`${label}: Einstellung „Größere Schrift“ aktiv`);await overlapCheck(page,label+' große Schrift',false);
 await page.click('button.square[data-panel="settings"]');await page.click('#panelBody [data-pref="large"]');await page.click('[data-action="close"]');
 check(!errors.length,`${label}: keine Konsolenfehler${errors.length?' – '+errors.join(' | '):''}`);
 await context.close();
}
// Hub W1-S4: Probe-Zustand (echte Verträge, Hof und Sortierung; Platzhalter-Dockbelegung) über den echten Importweg laden; Hof & Docks und Verträge.
{
 const {Simulation}=await import(pathToFileURL(path.join(root,'dist/core.js')).href);
 const {hubProbe}=await import(pathToFileURL(path.join(root,'tests/ui-hub-probe.js')).href);
 const queued=hubProbe(Simulation,{blockDocks:true}).sim.serialize(),unloading=hubProbe(Simulation).sim.serialize();
 for(const [width,height,json,shot] of [[1920,1080,unloading,'hof-ui-0.9.png'],[1280,800,queued,null]]){
  const label=`Hub ${width}×${height}`;const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});const page=await context.newPage();
  const errors=[];page.on('console',m=>{if(m.type()==='error'&&!/favicon\.ico/.test(m.location()?.url||''))errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'index.html');await page.waitForSelector('#welcome[open]');await page.click('[data-action="start"]');
  try{await page.waitForFunction(()=>!document.querySelector('#welcome').open,null,{timeout:4000});}
  catch{await page.click('#welcome [data-action="temporary"]');await page.click('#confirm [data-action="confirmOk"]');await page.waitForFunction(()=>!document.querySelector('#welcome').open);}
  await page.setInputFiles('#importFile',{name:'hub-probe.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.waitForSelector('#confirm[open]');await page.click('#confirm [data-action="confirmOk"]');
  await page.waitForFunction(()=>document.getElementById('st-gate-n').textContent==='1');
  const flow=await page.evaluate(()=>Object.fromEntries(['gate','unload','sort','out','delivery'].map(k=>[k,document.getElementById(`st-${k}-n`).textContent+' · '+document.getElementById(`st-${k}-sub`).textContent])));
  log.push(`${label}: Standortfluss ${JSON.stringify(flow)}`);
  check(await page.locator('#vbarList .vrow.foreign').count()===1,`${label}: Fremd-Lkw in der Fahrzeugleiste`);
  check(await page.isVisible('#kpiSortedBox'),`${label}: KPI „Verarbeitet heute“ mit Sortierzähler sichtbar`);
  await overlapCheck(page,label,false);
  await page.click('.rail [data-panel="yard"]');await page.waitForSelector('#panelBody .yard-table');
  check(await page.locator('#panelBody .yard-table tbody tr').count()===1&&await page.locator('#panelBody .dock-row').count()===2,`${label}: Torbuch und Dock-Belegung`);
  await overlapCheck(page,label+' Hof & Docks',true);
  if(json===queued){await page.click('#panelBody [data-action="prioritizeArrival"]');check(await page.locator('#panelBody [data-action="prioritizeArrival"]').count()===0&&/vorgezogen/.test(await page.textContent('#panelBody')),`${label}: Vorziehen über echten Befehl`);
   await page.click('#bellBtn');check(/wartet seit \d+ Min\./.test(await page.textContent('#bellList')),`${label}: Glocke meldet wartenden Lkw`);await page.keyboard.press('Escape');}
  if(shot){fs.mkdirSync(outDir,{recursive:true});await page.screenshot({path:path.join(outDir,shot)});}
  await page.click('.rail [data-panel="contracts"]');check(/Ankunftsplan heute und morgen/.test(await page.textContent('#panelBody')),`${label}: Vertragsfenster mit Ankunftsplan`);await overlapCheck(page,label+' Verträge',true);
  check(!errors.length,`${label}: keine Konsolenfehler${errors.length?' – '+errors.join(' | '):''}`);
  await context.close();
 }
}
await browser.close();server.close();
console.log(log.join('\n'));
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Browser-Check bestanden. Bildschirmfotos: ${path.relative(root,outDir)}/hud-0.9-1920.png, hud-0.9-1280.png, hof-ui-0.9.png`);
