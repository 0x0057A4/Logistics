// Replay 60 Min. (W3c-S3, A12/A10) im echten Browser. Kein Teil von `npm test`.
// Aufruf: node tests/browser/replay.mjs  (isolierte tmp-Kopie wie rightclick.mjs)
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const {root,cleanup}=prepareRoot(process.argv.includes('--repo'));const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[],log=[];watch(page,errors,'replay');
const ok=(n,c,d='')=>{log.push(`${c?'OK  ':'FEHL'} ${n} ${d}`);if(!c)process.exitCode=1;};
const minutes=t=>{const m=/Tag (\d+) · (\d\d):(\d\d)/.exec(t||'');return m?(+m[1]-1)*1440+ +m[2]*60+ +m[3]:NaN;};
const clock=()=>page.textContent('#clock');
const shot=async()=>page.locator('#world').screenshot();
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);await page.click('#welcome [data-action="start"]');
 await page.waitForFunction(()=>!document.querySelector('#welcome').open);
 await page.click('.rail [data-panel="overview"]');await page.click('#panelBody [data-action="starter"]');await page.click('#panelBody [data-action="acceptContract"]');await page.click('[data-action="close"]');
 // Frame-Zeiten (rAF-Abstände) und Zeitpunkte der Momentaufnahmen (data-snapshots am Replay-Knopf) mitschreiben.
 await page.evaluate(()=>{window.__f=[];window.__cap=[];let last=performance.now();const loop=now=>{window.__f.push([now,now-last]);last=now;requestAnimationFrame(loop);};requestAnimationFrame(loop);
  new MutationObserver(()=>window.__cap.push(performance.now())).observe(document.getElementById('replayBtn'),{attributes:true,attributeFilter:['data-snapshots','data-capture-ms']});});
 const t0=minutes(await clock());
 await page.click('[data-speed="12"]');
 await page.waitForFunction(t=>{const m=/Tag (\d+) · (\d\d):(\d\d)/.exec(document.querySelector('#clock').textContent);const now=(+m[1]-1)*1440+ +m[2]*60+ +m[3];return now>=t+65&&document.getElementById('replayBtn').dataset.snapshots==='13';},t0,{timeout:30000,polling:200});
 const tLive=minutes(await clock());ok('60+ Spielminuten bei 12× gelaufen',tLive-t0>=65,`${t0}→${tLive}`);
 const stat=await page.evaluate(()=>{const f=window.__f.slice(5),cap=window.__cap,d=f.map(x=>x[1]).sort((a,b)=>a-b),isNear=([t])=>cap.some(c=>Math.abs(c-t)<120),near=f.filter(isNear).map(x=>x[1]),away=f.filter(x=>!isNear(x)).map(x=>x[1]).sort((a,b)=>a-b);
  return {frames:f.length,median:d[Math.floor(d.length/2)]||0,p99:d[Math.floor(d.length*.99)]||0,max:d.at(-1)||0,over50:d.filter(x=>x>50).length,nearCaptureMax:Math.max(0,...near),awayP99:away[Math.floor(away.length*.99)]||0,awayMax:away.at(-1)||0,captures:cap.length,captureMs:+document.getElementById('replayBtn').dataset.captureMs};});
 log.push(`INFO Frame-Zeiten: ${JSON.stringify(stat)}`);
 ok('13 Momentaufnahmen im Puffer',await page.getAttribute('#replayBtn','data-snapshots')==='13');
 // Headless-Chromium hat ohnehin unregelmäßige Frames; geprüft wird die gemessene Aufnahmedauer und dass Frames nahe einer Aufnahme nicht länger sind als sonst.
 ok('Aufnahme ohne spürbare Frame-Spitze',stat.captureMs<20&&stat.nearCaptureMax<=Math.max(stat.awayMax,stat.awayP99)+17,`Aufnahme max ${stat.captureMs} ms · Frame nahe Aufnahme max ${Math.round(stat.nearCaptureMax)} ms · sonst max ${Math.round(stat.awayMax)} ms`);
 // Replay per Taste Z: Simulation pausiert, Regler 0 = Live-Zustand.
 await page.locator('#world').focus();await page.keyboard.press('z');await page.waitForTimeout(200);
 ok('Replay-Leiste offen',!(await page.locator('#replayBar').isHidden()));ok('Simulation pausiert',await page.evaluate(()=>document.querySelector('[data-speed="0"]').classList.contains('active')));
 ok('Statustext Replay',(await page.textContent('#simState'))==='Replay · nur Ansicht');
 const setRange=v=>page.evaluate(v=>{const r=document.getElementById('replayRange');r.value=String(v);r.dispatchEvent(new Event('input',{bubbles:true}));},v);
 await setRange(0);await page.waitForTimeout(600);const frozen=await clock();const liveShot=await shot();
 await setRange(-30);await page.waitForTimeout(600);const pastShot=await shot();
 if(process.argv.includes('--out'))await page.screenshot({path:process.argv[process.argv.indexOf('--out')+1]+'/replay-0.14.png'});
 const label=await page.textContent('#replayLabel');const ago=+(/−(\d+) Min/.exec(label)?.[1]);
 ok('Banner „Replay −30 Min. · nur Ansicht“',/^Replay −\d+ Min\. · nur Ansicht$/.test(label)&&Math.abs(ago-30)<=4,label);
 ok('HUD-Uhr zeigt Snapshot-Zeit',Math.abs(minutes(frozen)-minutes(await clock())-ago)<=1,`${frozen} → ${await clock()}`);
 ok('Szene ändert sich zwischen Live und −30',!liveShot.equals(pastShot));
 // Befehle gesperrt.
 await page.keyboard.press('b');await page.waitForTimeout(150);ok('Taste B öffnet keinen Baumodus',await page.locator('#buildTray').isHidden());
 ok('Hinweis zur Sperre',/gesperrt/.test(await page.textContent('#toast')));
 await page.click('[data-speed="12"]');await page.waitForTimeout(300);ok('Tempo bleibt gesperrt',await page.evaluate(()=>document.querySelector('[data-speed="0"]').classList.contains('active')));
 await page.click('.rail [data-panel="staff"]');await page.waitForTimeout(200);
 const staffBefore=await page.textContent('#sbStaff');const hire=page.locator('#panelBody form[data-form="hire"] button').first();
 if(await hire.count()){await hire.click();await page.waitForTimeout(200);}
 ok('Einstellen im Replay ohne Wirkung',(await page.textContent('#sbStaff'))===staffBefore,staffBefore);
 ok('Panel-Kennzeichnung',/^REPLAY −\d+ MIN\. · NUR ANSICHT$/.test(await page.textContent('#panelEyebrow')));
 await page.click('[data-action="close"]');
 // Abspielen ×4.
 await page.click('#replayPlay');await page.waitForTimeout(2600);const label2=await page.textContent('#replayLabel');
 ok('Abspielen läuft vorwärts',+(/−(\d+) Min/.exec(label2)?.[1])<ago-4,`${label} → ${label2}`);
 // Live: Zustand und Tempo zurück.
 await page.click('#replayBar [data-action="replayLive"]');await page.waitForTimeout(200);
 ok('Live schließt Leiste',await page.locator('#replayBar').isHidden());ok('Tempo 12× wiederhergestellt',await page.evaluate(()=>document.querySelector('[data-speed="12"]').classList.contains('active')));
 await page.waitForTimeout(1200);ok('Live-Uhr läuft weiter',minutes(await clock())>minutes(frozen),await clock());
 // Rechtsklick und Esc beenden ebenfalls.
 await page.keyboard.press('z');await page.waitForTimeout(150);const c=await page.locator('#world').boundingBox();
 await page.mouse.click(c.x+c.width/2,c.y+c.height/2,{button:'right'});await page.waitForTimeout(200);ok('Rechtsklick beendet Replay',await page.locator('#replayBar').isHidden());
 await page.click('#replayBtn');await page.waitForTimeout(150);ok('Uhr-Knopf öffnet Replay',!(await page.locator('#replayBar').isHidden()));
 await page.keyboard.press('Escape');await page.waitForTimeout(150);ok('Esc beendet Replay',await page.locator('#replayBar').isHidden());
 await page.click('[data-speed="0"]');
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,300));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));await browser.close();server.kill();cleanup();
