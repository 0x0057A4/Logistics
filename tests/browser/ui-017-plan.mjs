// 0.17 A06/A08/A10-P: Browserprüfung Belegungsplan, Liquidität heute, Kundendienst-Board bei 1366×768 und 1920×1080.
// Kein Teil von `npm test`. Aufruf: node tests/browser/ui-017-plan.mjs [--shots <Verzeichnis>].
// Spielstand mit echten Modulen: Nacht- und Tagschicht, Pflichtpause, Kredit, offenes Kundenanliegen; Import wie ein Spieler.
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {lampGame,lampOffers} from '../fertigung-fixture.mjs';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const sim=lampGame({mode:'sandbox',seed:31}),s=sim.state;
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
const o=lampOffers(sim)[0];cmd({type:'acceptOrder',id:o.id});
cmd({type:'build',buildingType:'dock',x:2,y:10,rotation:0});
const svc=cmd({type:'hire',role:'service'}).id;
const night=cmd({type:'hire',role:'warehouse'}).id;cmd({type:'setShift',id:night,shift:'night'});
const tired=cmd({type:'hire',role:'warehouse'}).id;
cmd({type:'hire',role:'driver'});
for(let i=0;i<6;i++)cmd({type:'hire',role:i%2?'production':'warehouse'});
sim.step(120);s.workers.find(w=>w.id===tired).fatigue=80;sim.step(1);
cmd({type:'takeLoan',amount:2000});
const ticket=cmd({type:'createTicket',orderId:o.id,kind:'status'}).id;
const dir=mkdtempSync(join(tmpdir(),'ui017p-')),file=join(dir,'stand.json');writeFileSync(file,sim.serialize());

const {root,cleanup}=prepareRoot();const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);
const log=[],errors=[];
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name}${detail?' · '+detail:''}`);if(!cond)process.exitCode=1;};
try{
 for(const [w,h] of [[1366,768],[1920,1080]]){
  const tag=`${w}×${h}`,page=await browser.newPage({viewport:{width:w,height:h}});watch(page,errors,tag);
  const wait=ms=>page.waitForTimeout(ms),text=sel=>page.textContent(sel).catch(()=>'');
  const noOverflow=()=>page.evaluate(()=>{const b=document.querySelector('#panelBody'),d=document.documentElement;return b.scrollWidth<=b.clientWidth+1&&d.scrollWidth<=window.innerWidth+1;});
  const shot=async n=>{if(shots)await page.screenshot({path:join(shots,`ui-017-plan-${w}-${n}.png`)});};
  await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
  await page.click('#welcome [data-action="start"]');await wait(600);
  await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
  await page.click('#confirm [data-action="confirmOk"]');await wait(800);
  await page.click('[data-speed="0"]');await wait(300);
  const cash0=await text('#cash');
  // Belegungsplan
  await page.click('[data-panel="staff"]');await wait(500);
  ok(`${tag} Gantt sichtbar`,await page.isVisible('#panelBody .sched-table')&&await page.locator('#panelBody .sched-row').count()===s.workers.length,String(await page.locator('#panelBody .sched-row').count()));
  ok(`${tag} Zeitlinie sichtbar`,await page.locator('#panelBody .sched-scale .sched-now').isVisible());
  ok(`${tag} Nachtschicht geteilt (◂ / ▸)`,await page.locator('#panelBody .sched-bar.from-prev').count()>0&&await page.locator('#panelBody .sched-bar.to-next').count()>0);
  ok(`${tag} Pause markiert`,await page.locator('#panelBody .sched-mark.break').count()===1);
  ok(`${tag} Plan ohne Überlauf`,await noOverflow());await shot('plan');
  const before=await page.locator('#panelBody .sched-row').count();
  await page.selectOption('#panelBody select[data-sched-filter="shift"]','night');await wait(300);
  ok(`${tag} Filter Schicht Nacht`,await page.locator('#panelBody .sched-row').count()===1,`${before} → ${await page.locator('#panelBody .sched-row').count()}`);
  await page.selectOption('#panelBody select[data-sched-filter="shift"]','*');await wait(200);
  await page.fill('#schedSearch','Kunden');await wait(300);
  ok(`${tag} Suche behält Fokus und filtert`,await page.evaluate(()=>document.activeElement?.id==='schedSearch')&&await page.locator('#panelBody .sched-row').count()===1);
  await page.fill('#schedSearch','');await wait(200);
  await page.click('#panelBody [data-sched-day="1"]');await wait(200);
  ok(`${tag} Folgetag ohne Zeitlinie, Uhr unverändert`,await page.locator('#panelBody .sched-scale .sched-now').count()===0&&(await text('#cash'))===cash0);
  await page.click('#panelBody [data-sched-day="0"]');await wait(200);
  await page.click(`#panelBody [data-sched-worker="${svc}"]`);await wait(300);
  ok(`${tag} Klick öffnet Mitarbeiterakte`,(await text('#panelTitle'))==='Objektakte');
  // Liquidität
  await page.click('[data-panel="finance"]');await wait(400);const fin=await text('#panelBody');
  ok(`${tag} Liquidität drei Werte`,await page.locator('#panelBody .dc-val').count()===3&&/Heute eingenommen/.test(fin)&&/Heute ausgegeben/.test(fin)&&/Saldo heute/.test(fin));
  ok(`${tag} Kredit separat, Hinweis`,/Kreditauszahlung \+2\.000,00 € – kein Erlös/.test(fin)&&/Zahlungseingänge minus Zahlungsausgänge/.test(fin)&&/Zahlungsströme nach Bereich/.test(fin));
  ok(`${tag} Finanzen ohne Überlauf`,await noOverflow());await shot('finanzen');
  // Board
  await page.click('[data-panel="service"]');await wait(400);
  const count=k=>page.textContent(`#panelBody .bcol.col-${k} .bcount`).then(Number).catch(()=>-1);
  ok(`${tag} Board mit Zählern`,await count('open')===1&&await count('work')===0&&await count('done')===0,`${await count('open')}/${await count('work')}/${await count('done')}`);
  ok(`${tag} Board ohne Überlauf`,await noOverflow());await shot('board');
  // Echte Bearbeitung über die vorhandene Antwortaktion → Karte wechselt Spalte
  await page.click(`#panelBody .bcard[data-board-id="${ticket}"] [data-action="ticket-inform"]`);await wait(400);
  ok(`${tag} Antwort → In Bearbeitung`,await count('open')===0&&await count('work')===1);
  await page.click('[data-speed="1"]');await page.waitForFunction(()=>Number(document.querySelector('#panelBody .bcol.col-done .bcount')?.textContent)===1,null,{timeout:30000}).catch(()=>{});
  await page.click('[data-speed="0"]');await wait(300);
  ok(`${tag} nach Bearbeitungszeit → Abgeschlossen`,await count('done')===1&&await count('work')===0);
  await page.selectOption('#panelBody select[data-board-filter="type"]','return');await wait(200);
  ok(`${tag} Filter Art Rückläufe`,await count('done')===0);
  await page.close();
 }
}finally{await browser.close();server.kill();cleanup();}
ok('keine Konsolenfehler',errors.length===0,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));
