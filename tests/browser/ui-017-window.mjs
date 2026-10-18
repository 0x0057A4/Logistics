// A10-W 0.17: Fenster (ziehen, vergrößern, maximieren, wiederherstellen, Geometrie nach Neuladen, Klemmen), Bereichsleiste ohne
// Scrollbalken, WASD im Baumodus (bewegt Kamera, platziert nicht, nicht im Suchfeld), Kontextmenü im Spielbereich unterdrückt.
// Kein Teil von `npm test`. Aufruf: node tests/browser/ui-017-window.mjs [--repo] [--shots <Verzeichnis>]
// Kamerabewegung wird an den Szenenbeschriftungen gemessen (pausiertes Spiel: Positionen ändern sich nur durch die Kamera).
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const {root,cleanup}=prepareRoot(process.argv.includes('--repo'));const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);
const log=[];let fails=0;
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name}${detail?' · '+detail:''}`);if(!cond){fails++;process.exitCode=1;}};

for(const [W,H] of [[1366,768],[1920,1080]]){
 const L=`${W}×${H}`;
 const context=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];watch(page,errors,L);
 const wait=ms=>page.waitForTimeout(ms);
 const rect=sel=>page.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};},sel);
 const shot=async n=>{if(shots)await page.screenshot({path:join(shots,`ui017-${W}-${n}.png`)});};
 // Kamerazustand: Transform aller sichtbaren Szenenbeschriftungen
 const camSig=()=>page.evaluate(()=>[...document.querySelectorAll('.scene3d-labels > *')].filter(e=>e.style.display!=='none').map(e=>e.style.transform).join('|'));
 const start=async()=>{
  if(await page.evaluate(()=>document.querySelector('#welcome')?.open)){await page.click('#welcome [data-action="start"]');await page.waitForFunction(()=>!document.querySelector('#welcome').open);}
 };
 try{
  await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);await start();await wait(400);
  await page.click('[data-speed="0"]');
  await page.click('.rail [data-panel="overview"]');await page.click('#panelBody [data-action="starter"]').catch(()=>{});await page.click('[data-action="close"]');await wait(300);
  ok(`${L} Theme hell aktiv`,await page.evaluate(()=>document.documentElement.dataset.theme==='day'));
  await shot('hud');

  // Bereichsleiste: kein Scrollbalken, auch mit allen fortgeschrittenen Einträgen; alles im Bild
  const railFit=()=>page.evaluate(()=>{const r=document.querySelector('.rail'),b=r.getBoundingClientRect(),sb=document.querySelector('.statusbar').getBoundingClientRect();return {sh:r.scrollHeight,ch:r.clientHeight,bottom:Math.round(b.bottom),sbTop:Math.round(sb.top),ov:getComputedStyle(r).overflowY};});
  let rf=await railFit();ok(`${L} Leiste ohne Scrollbalken (Einstieg)`,rf.sh<=rf.ch+1&&rf.bottom<=rf.sbTop,JSON.stringify(rf));
  await page.evaluate(()=>{for(const id of ['rail-production','rail-purchasing','rail-containers'])document.getElementById(id).hidden=false;});
  rf=await railFit();ok(`${L} Leiste ohne Scrollbalken (alle Einträge)`,rf.sh<=rf.ch+1&&rf.bottom<=rf.sbTop,JSON.stringify(rf));
  await page.evaluate(()=>{for(const id of ['rail-production','rail-purchasing','rail-containers'])document.getElementById(id).hidden=true;});
  const labels=await page.evaluate(()=>[...document.querySelectorAll('.rail>button')].filter(b=>!b.hidden).map(b=>{const sp=b.querySelector('span');return {t:sp.textContent,fs:parseFloat(getComputedStyle(sp).fontSize),title:!!b.title,cut:sp.scrollWidth>sp.clientWidth+1};}));
  ok(`${L} Leiste: Symbol + Kurztext ≥ 12 px + Tooltip, nicht abgeschnitten`,labels.every(l=>l.fs>=12&&l.title&&!l.cut),JSON.stringify(labels.filter(l=>l.fs<12||!l.title||l.cut)));
  await page.click('.rail-more');ok(`${L} Gruppe „Mehr“ klappt auf`,await page.locator('#railMore').isVisible());await shot('mehr');
  await page.click('#railMore [data-panel="history"]');await wait(200);
  ok(`${L} Eintrag aus „Mehr“ öffnet Fenster, Menü schließt`,await page.locator('#railMore').isHidden()&&/chronik/i.test(await page.textContent('#panelTitle')));
  ok(`${L} „Mehr“ als aktiv markiert`,await page.evaluate(()=>getComputedStyle(document.querySelector('.rail-more')).backgroundColor!=='rgba(0, 0, 0, 0)'));
  await page.click('[data-action="close"]');

  // Kontextmenü im Spielbereich ohne Fenster unterdrückt, Suchfeld behält es
  await page.evaluate(()=>{window.__rc=[];window.addEventListener('contextmenu',e=>window.__rc.push([e.target.id||e.target.className||e.target.tagName,e.defaultPrevented]));});
  const c=await rect('#world');
  for(const [x,y] of [[c.x+c.w/2,c.y+c.h/2],[c.x+c.w-20,c.y+c.h-60]])await page.mouse.click(x,y,{button:'right'});
  const sb=await rect('.statusbar');await page.mouse.click(sb.x+sb.w/2,sb.y+sb.h/2,{button:'right'});
  const rl=await rect('.rail');await page.mouse.click(rl.x+rl.w/2,rl.y+20,{button:'right'});
  // Rechtsklick-Ziehen über die Szene
  await page.mouse.move(c.x+300,c.y+300);await page.mouse.down({button:'right'});await page.mouse.move(c.x+420,c.y+340,{steps:6});await page.mouse.up({button:'right'});
  const cm=await rect('#cmd');await page.mouse.click(cm.x+30,cm.y+cm.h/2,{button:'right'});
  const rc=await page.evaluate(()=>window.__rc);
  ok(`${L} Kontextmenü im Spielbereich verhindert (Szene, Statuszeile, Leiste, Rechts-Ziehen)`,rc.length>=5&&rc.slice(0,-1).every(r=>r[1]),JSON.stringify(rc));
  ok(`${L} Suchfeld behält Browsermenü`,rc.at(-1)?.[1]===false);
  await page.keyboard.press('Escape');await page.locator('#world').focus();

  // Fenster öffnen: Startgeometrie, ein Scrollbereich, sticky Tabellenkopf
  await page.click('.rail [data-panel="finance"]');await wait(300);
  const g0=await rect('#panel');const game=await rect('#game');
  ok(`${L} Fenster im sichtbaren Bereich`,g0.x>=game.x&&g0.y>=game.y&&g0.x+g0.w<=W&&g0.y+g0.h<=H-28,JSON.stringify(g0));
  const scrollers=await page.evaluate(()=>[...document.querySelectorAll('#panel *')].filter(e=>{const st=getComputedStyle(e);return /(auto|scroll)/.test(st.overflowY)&&e.scrollHeight>e.clientHeight+1;}).map(e=>e.id||e.className));
  ok(`${L} genau ein vertikaler Scrollbereich im Fenster`,scrollers.length<=1&&(!scrollers.length||scrollers[0]==='panelBody'),JSON.stringify(scrollers));
  const sticky=await page.evaluate(()=>{const th=document.querySelector('#panelBody thead th');if(!th)return 'keine Tabelle';const b=document.querySelector('#panelBody');b.scrollTop=b.scrollHeight;const r=th.getBoundingClientRect(),br=b.getBoundingClientRect();const tbl=th.closest('table').getBoundingClientRect();b.scrollTop=0;return {pos:getComputedStyle(th).position,visible:tbl.bottom<br.top+5||(r.top>=br.top-1&&r.top<br.top+60)};});
  ok(`${L} Tabellenkopf sticky im Fensterinhalt`,sticky==='keine Tabelle'||sticky.pos==='sticky',JSON.stringify(sticky));

  // Klick/Ziehen/Mausrad im Fenster bewegt die Kamera nicht
  await page.evaluate(()=>{window.__canvasEv=0;const cv=document.querySelector('#world');for(const t of ['pointerdown','pointermove','wheel'])cv.addEventListener(t,()=>window.__canvasEv++);});
  let sig=await camSig();const pb=await rect('#panelBody');
  await page.mouse.move(pb.x+40,pb.y+40);await page.mouse.down();await page.mouse.move(pb.x+140,pb.y+120,{steps:8});await page.mouse.up();
  await page.mouse.wheel(0,400);await wait(400);
  ok(`${L} Ziehen/Mausrad im Fenster erreicht die Szene nicht`,await page.evaluate(()=>window.__canvasEv)===0&&(await camSig())===sig);

  // Ziehen an der Titelleiste
  const hd=await rect('.panel-head');
  await page.mouse.move(hd.x+60,hd.y+18);await page.mouse.down();await page.mouse.move(hd.x-240,hd.y+58,{steps:10});await page.mouse.up();
  const g1=await rect('#panel'),yMax=H-30-g0.h;ok(`${L} Titelleiste verschiebt Fenster (unten geklemmt)`,Math.abs(g1.x-(g0.x-300))<=2&&Math.abs(g1.y-Math.min(g0.y+40,yMax))<=2&&g1.w===g0.w,`${JSON.stringify(g0)} → ${JSON.stringify(g1)}`);
  ok(`${L} Ziehen der Titelleiste bewegt Kamera nicht`,await page.evaluate(()=>window.__canvasEv)===0&&(await camSig())===sig);
  // Größe an Ecke (unten rechts) und linkem Rand
  await page.mouse.move(g1.x+g1.w-4,g1.y+g1.h-4);await page.mouse.down();await page.mouse.move(g1.x+g1.w-104,g1.y+g1.h-124,{steps:8});await page.mouse.up();
  const g2=await rect('#panel');ok(`${L} Ecke ändert Größe`,Math.abs(g2.w-(g1.w-100))<=2&&Math.abs(g2.h-(g1.h-120))<=2&&g2.x===g1.x,JSON.stringify(g2));
  await page.mouse.move(g2.x+3,g2.y+g2.h/2);await page.mouse.down();await page.mouse.move(g2.x-57,g2.y+g2.h/2,{steps:6});await page.mouse.up();
  const g3=await rect('#panel');ok(`${L} linker Rand ändert Breite, rechte Kante bleibt`,Math.abs(g3.w-(g2.w+60))<=2&&Math.abs((g3.x+g3.w)-(g2.x+g2.w))<=2,JSON.stringify(g3));
  // Mindestgröße
  await page.mouse.move(g3.x+g3.w-4,g3.y+g3.h-4);await page.mouse.down();await page.mouse.move(g3.x+10,g3.y+10,{steps:8});await page.mouse.up();
  const gm=await rect('#panel');ok(`${L} Mindestgröße 380×260`,gm.w>=378&&gm.h>=258,JSON.stringify(gm));
  await page.mouse.move(gm.x+gm.w-4,gm.y+gm.h-4);await page.mouse.down();await page.mouse.move(g3.x+g3.w-4,g3.y+g3.h-4,{steps:8});await page.mouse.up();
  const gs=await rect('#panel');
  // Maximieren / Wiederherstellen (Knopf und Doppelklick)
  await page.click('#panelMax');await wait(100);const gx=await rect('#panel');const rail=await rect('.rail');
  ok(`${L} Maximieren füllt die Spielfläche neben der Leiste`,gx.x>=rail.x+rail.w&&gx.x<=rail.x+rail.w+12&&gx.w>=W-rail.x-rail.w-30&&gx.h>=H-56-30-30,JSON.stringify(gx));
  ok(`${L} Maximieren-Knopf meldet Zustand`,await page.getAttribute('#panelMax','aria-pressed')==='true');
  await shot('max');
  await page.click('#panelMax');await wait(100);const gr=await rect('#panel');
  ok(`${L} Wiederherstellen stellt Größe/Position zurück`,JSON.stringify(gr)===JSON.stringify(gs),`${JSON.stringify(gs)} / ${JSON.stringify(gr)}`);
  await page.dblclick('.panel-head h2');await wait(100);ok(`${L} Doppelklick Titelleiste maximiert`,(await rect('#panel')).w===gx.w);
  await page.dblclick('.panel-head h2');await wait(100);ok(`${L} Doppelklick erneut stellt wieder her`,JSON.stringify(await rect('#panel'))===JSON.stringify(gs));
  await shot('fenster');

  // Geometrie nach Neuladen
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('industrie-logistik-v1-prefs')||'{}').windows?.finance||null);
  ok(`${L} Geometrie in prefs.windows.finance`,!!stored&&stored.w===gs.w&&stored.max===false,JSON.stringify(stored));
  await page.click('[data-action="close"]');await wait(1500);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#statusText')?.textContent&&!/Lade|lädt/i.test(document.querySelector('#statusText').textContent),null,{timeout:15000}).catch(()=>{});await wait(800);await start();await wait(300);
  await page.click('.rail [data-panel="finance"]');await wait(300);
  ok(`${L} Geometrie bleibt nach Neuladen`,JSON.stringify(await rect('#panel'))===JSON.stringify(gs),JSON.stringify(await rect('#panel')));
  // Anderes Fenster hat eigene Geometrie
  await page.click('.rail [data-panel="contracts"]');await wait(200);const gc=await rect('#panel');ok(`${L} Verträge mit eigener Startgeometrie`,JSON.stringify(gc)!==JSON.stringify(gs),JSON.stringify(gc));
  // Klemmen nach Viewport-Wechsel: Fenster nach rechts unten schieben, dann Ansicht verkleinern
  const h2=await rect('.panel-head');await page.mouse.move(h2.x+60,h2.y+18);await page.mouse.down();await page.mouse.move(W-20,H-60,{steps:10});await page.mouse.up();
  await page.setViewportSize({width:1024,height:640});await wait(400);
  const gk=await rect('#panel');ok(`${L} → 1024×640: Fenster vollständig sichtbar`,gk.x>=0&&gk.y>=56&&gk.x+gk.w<=1024&&gk.y+gk.h<=640-28,JSON.stringify(gk));
  await shot('klein');
  await page.setViewportSize({width:W,height:H});await wait(300);
  const gb=await rect('#panel');ok(`${L} zurück: Fenster sichtbar`,gb.x+gb.w<=W&&gb.y+gb.h<=H-28,JSON.stringify(gb));
  await page.click('[data-action="close"]');

  // WASD im Baumodus
  await page.click('[data-speed="0"]').catch(()=>{});
  await page.click('.rail [data-action="build"]');await wait(200);
  const firstBuild=page.locator('#buildItems button[data-build]:not(.locked)').first();await firstBuild.click();await wait(200);
  const cw=await rect('#world');await page.mouse.move(cw.x+cw.w*0.55,cw.y+cw.h*0.4);await wait(300);
  const cash0=await page.textContent('#cash');sig=await camSig();
  await page.keyboard.down('d');await wait(500);await page.keyboard.up('d');await page.keyboard.down('ArrowUp');await wait(400);await page.keyboard.up('ArrowUp');await wait(300);
  const sig2=await camSig();
  ok(`${L} WASD/Pfeile bewegen die Kamera im Baumodus`,sig!==sig2&&sig2.length>0,`Beschriftungen ${sig2.split('|').length}`);
  ok(`${L} Baumodus und Auswahl bleiben aktiv, nichts platziert`,!(await page.locator('#buildTray').isHidden())&&await page.locator('#buildItems button.active').count()===1&&(await page.textContent('#cash'))===cash0,cash0+' / '+await page.textContent('#cash'));
  // Keine hängende Bewegung: nach Loslassen steht die Kamera
  await wait(200);const s3=await camSig();await wait(500);ok(`${L} keine Nachlaufbewegung nach Loslassen`,s3===await camSig());
  // Fokusverlust während gedrückter Taste
  await page.keyboard.down('a');await wait(200);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await wait(150);const s4=await camSig();await wait(500);
  ok(`${L} Fokusverlust stoppt Bewegung`,s4===await camSig());await page.keyboard.up('a');
  await page.keyboard.press('Escape');
  // Nicht im Suchfeld
  await page.click('#cmd');sig=await camSig();await page.keyboard.down('d');await wait(400);await page.keyboard.up('d');await page.keyboard.press('w');await wait(250);
  ok(`${L} Tippen im Suchfeld bewegt Kamera nicht`,sig===await camSig()&&/^d+w$/.test(await page.inputValue('#cmd')),await page.inputValue('#cmd'));
  await page.fill('#cmd','');await page.keyboard.press('Escape');

  // Dunkelmodus: Kontrast der Leiste und Fenstertexte (Stichprobe)
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','night'));await page.click('.rail [data-panel="finance"]');await wait(300);await shot('dunkel');
  const contrast=await page.evaluate(()=>{const lum=c=>{const m=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*m[0]+.7152*m[1]+.0722*m[2];};
   const bg=e=>{for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c)&&!/,\s*0\)$/.test(c))return c;}return 'rgb(255,255,255)';};
   const out=[];for(const e of document.querySelectorAll('.rail>button span,#panelBody td,#panelBody th,#panelBody small,#panelBody .fine,.kpi small,.panel-head .eyebrow')){if(!e.offsetParent||!e.textContent.trim())continue;const a=lum(getComputedStyle(e).color),b=lum(bg(e));const r=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(r<4.5)out.push(e.className||e.tagName+':'+r.toFixed(2));}return out.slice(0,6);});
  ok(`${L} Dunkelmodus: Textkontrast ≥ 4,5 (Stichprobe)`,!contrast.length,JSON.stringify(contrast));
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','day'));
 }catch(e){ok(`${L} Ablauf ohne Ausnahme`,false,e.message.slice(0,300));}
 ok(`${L} keine Konsolenfehler`,!errors.length,errors.slice(0,3).join(' | '));
 await context.close();
}
console.log(log.join('\n'));console.log(fails?`${fails} Fehler`:'Alle Prüfungen bestanden');
await browser.close();server.kill();cleanup();
