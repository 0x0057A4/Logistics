// A11 · Browser-QS Release 0.13 (Containerhof/Seeimport). Nicht Teil von `npm test`. Aufruf: node tests/browser/qa-w3b.mjs
// Probe-Zustand (Node, reguläre Befehle): Containerhof, Regale, Stapler, Lagerkraft, Lkw, offenes Seeimport-Angebot (Paletten).
// Import über die Oberfläche. Klicks: Fenster „Verträge“ (V) mit Containerkarte, Annahme per Knopf, Zeitsprung über
// __qa.sim().step (Testhilfe, tmp-Kopie) bis Container im Hof (kein Dock → bleibt im Hof), Fenster „Containerhof“ (C),
// Klick in der 3D-Szene auf einen Container öffnet das Fenster. Konsolenfehler werden gesammelt.
import {appendFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
import {Simulation} from '../../dist/core.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(2);}
const ok=(n,c,d='')=>{console.log(`${c?'OK  ':'FEHL'} ${n} ${d}`);if(!c)process.exitCode=1;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const sim=new Simulation({mode:'sandbox',seed:2}),s=sim.state,c=x=>{const r=sim.command(x);if(!r.ok)throw Error(x.type+': '+r.message);return r;};
c({type:'build',buildingType:'containeryard',x:12,y:8,rotation:0});
for(const [t,x,y] of [['rack',2,2],['rack',5,2],['forklift',16,2]])c({type:'build',buildingType:t,x,y,rotation:0});
c({type:'hire',role:'warehouse'});c({type:'hire',role:'driver'});c({type:'buyVehicle',vehicleType:'truck'});
let k=null;for(let i=0;i<6000&&!k;i++){sim.step(1);k=s.contracts.find(x=>x.status==='offer'&&x.unit==='container'&&x.content==='pallet');}
if(!k)throw Error('kein Seeimport-Angebot');
const dir=mkdtempSync(join(tmpdir(),'qa-w3b-'));const file=join(dir,'probe.json');writeFileSync(file,sim.serialize());
console.log(`Probe t=${s.t}, Angebot ${k.id}: ${k.arrivals.map(a=>`${a.containers}×${k.unitsPerContainer}`).join(',')} Paletten`);

const {root,cleanup}=prepareRoot(false);
appendFileSync(join(root,'dist/app.js'),'\n;globalThis.__qa={sim:()=>sim};\n');
const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];watch(page,errors,'w3b');
const S=(f,a)=>page.evaluate(f,a);
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await wait(600);
 await page.setInputFiles('#importFile',file);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
 await page.click('#confirm [data-action="confirmOk"]');await wait(1000);
 await page.keyboard.press('v');await wait(500);
 const card=await page.textContent(`[data-contract="${k.id}"]`).catch(()=>'');
 ok('Vertragskarte Container',/Container à \d+ Paletten/.test(card)&&/Handling/.test(card)&&/Lagergeld/.test(card)&&/Freizeit/.test(card),card.replace(/\s+/g,' ').slice(0,160));
 await page.click(`[data-contract="${k.id}"] [data-action="acceptContract"]`);await wait(500);
 ok('Annahme per Knopf',await S(id=>__qa.sim().state.contracts.find(x=>x.id===id)?.status,k.id)==='active');
 await page.keyboard.press(' ');await wait(200); // Pause
 await S(()=>{const sim=__qa.sim();for(let i=0;i<3000&&!sim.state.containers.some(c=>c.status==='yard');i++)sim.step(1);});await wait(1200);
 const inYard=await S(()=>__qa.sim().state.containers.filter(c=>c.status==='yard').map(c=>c.id));
 ok('Container im Hof',inYard.length>0,inYard.join(','));
 await page.keyboard.press('c');await wait(500);
 const title=await page.textContent('#panelTitle'),body=await page.textContent('#panelBody');
 ok('Fenster Containerhof (C)',title==='Containerhof'&&inYard.every(id=>body.includes(id.match(/\d+$/)[0])),`${title} · ${body.replace(/\s+/g,' ').slice(0,140)}`);
 await page.keyboard.press('Escape');await wait(300);
 ok('Fenster geschlossen',!(await page.isVisible('#panel').catch(()=>false))||await page.textContent('#panelTitle')!=='Containerhof');
 // Klick auf Container in der 3D-Szene
 const pos=await S(ids=>{const sc=document.querySelector('#world').__scene;sc.focus?.(ids[0]);const h=sc.boxes.find(h=>ids.includes(h.id));if(!h)return null;
  const b=h.box,v=sc.camera().position.clone().set((b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2);v.project(sc.camera());const r=document.querySelector('#world').getBoundingClientRect();return {x:r.left+(v.x+1)/2*sc.width,y:r.top+(1-v.y)/2*sc.height,id:h.id};},inYard);
 await wait(1200);
 const pos2=await S(ids=>{const sc=document.querySelector('#world').__scene;const h=sc.boxes.find(h=>ids.includes(h.id));if(!h)return null;
  const b=h.box,v=sc.camera().position.clone().set((b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2);v.project(sc.camera());const r=document.querySelector('#world').getBoundingClientRect();return {x:r.left+(v.x+1)/2*sc.width,y:r.top+(1-v.y)/2*sc.height,id:h.id};},inYard);
 ok('Container als Klickziel in der Szene',!!pos2,JSON.stringify(pos2));
 if(pos2){await page.mouse.click(pos2.x,pos2.y);await wait(600);
  const pb=await page.textContent('#panelBody');ok('Klick auf Container öffnet Fenster Containerhof (nicht Anlagenakte)',await page.textContent('#panelTitle')==='Containerhof'&&/Containerchassis bringen Seecontainer/.test(pb),pb.replace(/\s+/g,' ').slice(0,80));}
 await page.screenshot({path:join(dir,'containerhof.png')});console.log('Screenshot',dir);
}catch(e){ok('Ablauf',false,e.message);}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
await browser.close();server.kill();cleanup();
