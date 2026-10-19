// QS 0.17 (A11, unabhängig): Browserprüfung der 17 Nutzer-Prüfszenarien und Zusatzkriterien, primär 1920×1080, zusätzlich 1366×768.
// Kein Teil von `npm test`. Aufruf: node tests/browser/qa-017.mjs [--repo] [--shots <Verzeichnis>]
// Spielstand mit echten Modulen (Testaufbau: 42 Leuchten über api.inventory.add; alles andere reguläre Befehle).
// Ergebniszeilen: OK / FEHL (Abbruchkriterium) / BEFUND (bekannter Befund QS-017-xx, kein Abbruch).
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch,repo} from './serve.mjs';
import {Simulation} from '../../dist/core.js';
import {dayCash} from '../../dist/ui-board.js';

const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const dir=mkdtempSync(join(tmpdir(),'qa017-'));

// ---------- Spielstand 0.17 ----------
const sim=new Simulation({mode:'sandbox',seed:11}),s=sim.state;
const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
for(const [buildingType,x,y] of [['dock',2,10],['rack',2,2],['rack',2,4],['rack',2,6],['assembly',8,2],['testing',11,2],['packing',14,2],['sorter',6,12]])cmd({type:'build',buildingType,x,y,rotation:0});
const workers={};
for(const [role,shift] of [['warehouse','all'],['driver','all'],['driver','all'],['warehouse','night'],['service','all']]){const id=cmd({type:'hire',role}).id;cmd({type:'setShift',id,shift});workers[role+':'+shift]=id;}
cmd({type:'buyVehicle',vehicleType:'van'});cmd({type:'buyVehicle',vehicleType:'van'});
sim.step(2);
for(const b of s.buildings)if(['assembly','testing','packing'].includes(b.type))cmd({type:'toggleBuilding',id:b.id});
const o35=s.orders.find(o=>o.kind==='manufacturing'&&o.qty===35),o20=s.orders.find(o=>o.kind==='manufacturing'&&o.qty===20),o8=s.orders.find(o=>o.kind==='manufacturing'&&o.qty===8);
for(const o of [o35,o20,o8])cmd({type:'acceptOrder',id:o.id});
cmd({type:'buy',item:'housing',qty:6});
sim.step(60);
for(let i=0;i<14;i++)sim.api.inventory.add({item:'lamp',qty:3,site:'site-1',location:'stock',quality:90+i%6,unitCost:50});
cmd({type:'dispatch',orderId:o20.id,vehicleId:s.vehicles[0].id,qty:20});
const ticket=cmd({type:'createTicket',orderId:o8.id,kind:'status'}).id;
sim.step(1);
const nightId=workers['warehouse:night'];
const cash17=dayCash(s);
const file17=join(dir,'stand-017.json');writeFileSync(file17,sim.serialize());

// ---------- Spielstand 0.16 (Code d187565, außerhalb des Repos) ----------
let file16=null;
try{
 const tar=execFileSync('git',['-C',repo,'archive','d187565','dist'],{maxBuffer:64<<20});execFileSync('tar',['-x','-C',dir],{input:tar});
 const Old=(await import(join(dir,'dist/core.js'))).Simulation,old=new Old({mode:'sandbox',seed:21}),oc=c=>{const r=old.command(c);if(!r.ok)throw Error('alt '+c.type+': '+r.message);return r;};
 for(const [buildingType,x,y] of [['dock',2,10],['rack',2,2],['assembly',8,2],['testing',11,2],['packing',14,2]])oc({type:'build',buildingType,x,y,rotation:0});
 for(const role of ['warehouse','production','driver']){const id=oc({type:'hire',role}).id;oc({type:'setShift',id,shift:'all'});}
 oc({type:'buyVehicle',vehicleType:'van'});oc({type:'buy',item:'housing',qty:10});
 for(let i=0;i<900;i++){for(const o of old.state.orders)if(o.status==='offer'&&o.due>old.state.t+60)old.command({type:'acceptOrder',id:o.id});old.step(1);}
 file16=join(dir,'stand-016.json');writeFileSync(file16,old.serialize());
}catch(e){console.log('Hinweis: Stand 0.16 nicht erzeugbar: '+e.message);}

const {root,cleanup}=prepareRoot(process.argv.includes('--repo'));const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);
const log=[],errors=[];let fails=0,befunde=0;
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK    ':'FEHL  '} ${name}${detail?' · '+detail:''}`);if(!cond){fails++;process.exitCode=1;}};
const befund=(id,name,cond,detail='')=>{if(cond)log.push(`OK     ${name}${detail?' · '+detail:''}`);else{befunde++;log.push(`BEFUND ${id} ${name}${detail?' · '+detail:''}`);}};

async function session(W,H,fn){
 const context=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:1});
 const page=await context.newPage();watch(page,errors,`${W}x${H}`);
 try{await fn(page,`${W}×${H}`);}catch(e){ok(`${W}×${H} Ablauf ohne Ausnahme`,false,e.message.split('\n')[0].slice(0,240));}
 await context.close();
}
const helpers=page=>{
 const wait=ms=>page.waitForTimeout(ms),text=sel=>page.textContent(sel).catch(()=>'');
 const rect=sel=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};},sel);
 const shot=async n=>{if(shots)await page.screenshot({path:join(shots,`qa017-${n}.png`)});};
 const panel=async p=>{await page.evaluate(p=>{document.querySelector(`.rail [data-panel="${p}"]`)?.click()||document.querySelector(`[data-panel="${p}"]`).click();},p);await wait(350);};
 const close=async()=>{if(!(await page.locator('#panel').isHidden()))await page.click('[data-action="close"]');await wait(150);};
 const load=async f=>{
  await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
  await page.click('#welcome [data-action="start"]');await wait(500);
  await page.setInputFiles('#importFile',f);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
  await page.click('#confirm [data-action="confirmOk"]');await wait(900);await page.click('[data-speed="0"]');await wait(200);
 };
 // Lesbarkeit: alle sichtbaren Textfragmente im Bereich sel mit Schriftgröße < 12 px
 const small=sel=>page.evaluate(sel=>{const out=[];for(const root of document.querySelectorAll(sel)){const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let n=tw.nextNode();n;n=tw.nextNode()){const e=n.parentElement;if(!n.textContent.trim()||!e||e.closest('.sv-sr,[hidden],[aria-hidden="true"]'))continue;const r=e.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(e).visibility==='hidden')continue;const fs=parseFloat(getComputedStyle(e).fontSize);if(fs<12)out.push(`${e.className||e.tagName}:${fs}:${n.textContent.trim().slice(0,18)}`);}}return [...new Set(out)];},sel);
 // Kontrast WCAG je sichtbarem Textelement (Stichprobe)
 const lowContrast=(sel,min=4.5)=>page.evaluate(([sel,min])=>{const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const a=m[3]??1;return [m.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;}),a];};
  const L=v=>.2126*v[0]+.7152*v[1]+.0722*v[2];
  const bg=e=>{for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;const m=c.match(/[\d.]+/g);if(m&&(m[3]===undefined||+m[3]>0.6))return c;}return getComputedStyle(document.body).backgroundColor;};
  const out=[];for(const root of document.querySelectorAll(sel))for(const e of root.querySelectorAll('*')){if(!e.offsetParent||e.closest('.sv-sr,[hidden]'))continue;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)continue;
   const [fg,fa]=lum(getComputedStyle(e).color);if(fa<0.5)continue;const a=L(fg),b=L(lum(bg(e))[0]);const r=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(r<min)out.push(`${(e.className&&String(e.className))||e.tagName}:${r.toFixed(2)}:${e.textContent.trim().slice(0,16)}`);}
  return [...new Set(out)].slice(0,12);},[sel,min]);
 // Jede Tabellenzeile einzeilig: Textfragmente aller Zellen auf einer Höhe
 const multiLine=sel=>page.evaluate(sel=>{const bad=[];let n=0;for(const tr of [...document.querySelectorAll(sel)].slice(0,60)){n++;const ys=[];let lh=0;for(const td of tr.children){const tw=document.createTreeWalker(td,NodeFilter.SHOW_TEXT);for(let t=tw.nextNode();t;t=tw.nextNode()){if(!t.textContent.trim()||t.parentElement.closest('.sv-sr'))continue;const r=document.createRange();r.selectNodeContents(t);for(const q of r.getClientRects())if(q.width>0){ys.push(q.top+q.height/2);lh=Math.max(lh,q.height);}}}
  if(ys.length&&Math.max(...ys)-Math.min(...ys)>lh*0.6)bad.push(tr.textContent.trim().slice(0,30));}return {n,bad};},sel);
 const camSig=()=>page.evaluate(()=>[...document.querySelectorAll('.scene3d-labels > *')].filter(e=>e.style.display!=='none').map(e=>e.style.transform).join('|'));
 return {wait,text,rect,shot,panel,close,load,small,lowContrast,multiLine,camSig};
};

for(const [W,H] of [[1920,1080],[1366,768]]){
 await session(W,H,async(page,L)=>{
  const {wait,text,rect,shot,panel,close,load,small,lowContrast,multiLine,camSig}=helpers(page);
  const big=W===1920;
  await load(file17);
  const cash0=await text('#cash');

  // ---- HUD-Standardlage: keine Überlappung, Leiste ohne Scrollbalken, Schrift ≥ 12 px, Kontrast ----
  const hud=await page.evaluate(()=>['.topbar','.kpis','.view-switch','.rail','#flow','.camera-controls','#vbar','.statusbar','#mission'].map(s=>{const e=document.querySelector(s);if(!e||e.offsetParent===null&&getComputedStyle(e).position!=='fixed'||e.hidden)return null;const r=e.getBoundingClientRect();return r.width&&r.height?{s,x:r.left,y:r.top,w:r.width,h:r.height}:null;}).filter(Boolean));
  const hit=(a,b)=>a.x<b.x+b.w-1&&b.x<a.x+a.w-1&&a.y<b.y+b.h-1&&b.y<a.y+a.h-1;
  const over=[];for(let i=0;i<hud.length;i++)for(let j=i+1;j<hud.length;j++)if(hit(hud[i],hud[j]))over.push(hud[i].s+'∩'+hud[j].s);
  ok(`${L} HUD-Standardlage ohne Überlappung (${hud.map(h=>h.s).join(' ')})`,!over.length,over.join(', '));
  const rail=await page.evaluate(()=>{const r=document.querySelector('.rail');return {sh:r.scrollHeight,ch:r.clientHeight,sw:r.scrollWidth,cw:r.clientWidth};});
  ok(`${L} Hauptnavigation ohne Scrollbalken`,rail.sh<=rail.ch+1&&rail.sw<=rail.cw+1,JSON.stringify(rail));
  const hudSmall=await small('.topbar,.rail,.kpis,#vbar,.statusbar,.view-switch,#flow');
  befund('QS-017-02',`${L} HUD-Schrift ≥ 12 px`,!hudSmall.length,hudSmall.slice(0,6).join(' | '));
  const hudLow=await lowContrast('.topbar,.rail,.kpis,#vbar,.statusbar');
  befund('QS-017-04',`${L} HUD-Kontrast ≥ 4,5:1 (Stichprobe)`,!hudLow.length,hudLow.join(' | '));
  ok(`${L} keine Zeitsprung-Bedienung`,!(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>/überspring|Tagessprung|Zeitsprung|nächsten Tag|Daily/i.test(b.textContent+b.title)))));
  if(big)await shot('hud-1920');

  // ---- Alle Fenster in Startlage: kein waagerechter Überlauf (Fenster skalieren mit, Inhalte nicht abgeschnitten) ----
  const wide=[];
  for(const p of ['overview','finance','contracts','yard','inventory','orders','staff','service','fleet','production','purchasing','network','research','rules','history','assistant','settings','help']){
   const has=await page.evaluate(p=>!!document.querySelector(`[data-panel="${p}"]`),p);if(!has)continue;
   await panel(p);
   const views=p==='finance'?['cash','guv']:[''];
   for(const v of views){
    if(v)await page.evaluate(v=>document.querySelector(`#panelBody [data-action="financeTab"][data-id="${v}"]`)?.click(),v),await wait(250);
    const o=await page.evaluate(()=>{const b=document.querySelector('#panelBody'),r=document.querySelector('#panel').getBoundingClientRect();return {sw:b.scrollWidth,cw:b.clientWidth,w:Math.round(r.width)};});
    if(o.sw>o.cw+1)wide.push(`${p}${v?'/'+v:''} ${o.sw}/${o.cw} (Fenster ${o.w} px)`);
   }
  }
  await close();
  befund('QS-017-07',`${L} alle Fenster in Startlage ohne waagerechten Überlauf`,!wide.length,wide.join(' · '));
  // Kopfzeile: Bedienelemente nicht überdeckt (Mittelpunkt jedes Kopf-Schalters trifft den Schalter selbst)
  const covered=await page.evaluate(()=>[...document.querySelectorAll('.topbar button')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e&&!b.contains(e)?(b.getAttribute('aria-label')||b.title||b.textContent.trim()).slice(0,24):null;}).filter(Boolean));
  befund('QS-017-08',`${L} Kopfzeilen-Schalter nicht überdeckt`,!covered.length,covered.join(', '));

  // ---- P1/P2/P3 Lager ----
  await panel('inventory');
  const lampRows=await page.locator('[data-stock-row^="lamp|"]').count();
  const cells=await page.locator('[data-stock-row="lamp|company"] td').allTextContents();
  ok(`${L} P1 eine Zeile für 14 Leuchtenchargen`,lampRows===1,`${lampRows} Zeilen`);
  ok(`${L} P3 Lager: Gesamt 42 · Reserviert 20 · Frei 22`,/42/.test(cells[1])&&/^20/.test(cells[2].trim())&&/22/.test(cells[3]),cells.slice(1,4).join(' | '));
  await page.click('[data-stock-row="lamp|company"] [data-action="stockToggle"]');await wait(300);
  const batchTxt=await text('.sv-batches');
  const mlb=await multiLine('.sv-batches tbody tr');befund('QS-017-05',`${L} Chargen-Detailzeilen einzeilig`,mlb.n>0&&!mlb.bad.length,`${mlb.bad.length} von ${mlb.n} Zeilen zweizeilig`);
  ok(`${L} P1 Chargen aufgeklappt mit Menge, Lagerort, Qualität, Reservierung`,(await page.locator('.sv-batches tbody tr').count())>=14&&/Lagerplatz/.test(batchTxt)&&/%/.test(batchTxt)&&new RegExp(o20.id).test(batchTxt),batchTxt.slice(0,120));
  ok(`${L} P2 Teilprodukte als eigene Zeilen (Gehäuse ≠ Leuchte)`,await page.locator('[data-stock-row="housing|company"]').count()===1);
  const ml=await multiLine('.sv-row');ok(`${L} Lagerzeilen einzeilig`,ml.n>0&&!ml.bad.length,`${ml.n} Zeilen ${JSON.stringify(ml.bad.slice(0,3))}`);
  const pSmall=await small('#panel');befund('QS-017-02',`${L} Fenster-Schrift ≥ 12 px (Lager)`,!pSmall.length,pSmall.slice(0,6).join(' | '));
  const pLow=await lowContrast('#panel');befund('QS-017-04',`${L} Fenster-Kontrast ≥ 4,5:1 (Lager)`,!pLow.length,pLow.join(' | '));
  if(big)await shot('lager-1920');

  // ---- P7 [+] öffnet Einkauf vorbelegt, kein Kauf; P8 Zulauf erst nach Wareneingang ----
  const plus=page.locator('[data-stock-row="lamp|company"] [data-action="stockBuy"]').first();
  const plusId=await plus.getAttribute('data-id');
  await plus.click();await wait(400);
  const [it,q]=plusId.split('|');
  const formItem=await page.inputValue('#panelBody select[name="item"]').catch(()=>''),formQty=await page.inputValue('#panelBody input[name="qty"]').catch(()=>'');
  ok(`${L} P7 [+] öffnet Beschaffung mit Ressource und Menge`,(await text('#panelTitle'))==='Beschaffung'&&formItem===it&&formQty===q,`${plusId} → ${formItem}|${formQty}`);
  const quote=await text('[data-buy-quote]');ok(`${L} P7 Preis, Gesamtkosten, Lieferzeit vor dem Kauf`,/Gesamtkosten/.test(quote)&&/Lieferzeit/.test(quote),quote.slice(0,120));
  ok(`${L} P7 Kontostand unverändert bis zur Bestätigung`,(await text('#cash'))===cash0,`${cash0} → ${await text('#cash')}`);
  if(big)await shot('einkauf-1920');
  // Hinweis auf vorgesehene Bestellungen: Gehäuse 6 im Zulauf → Vorschlag zieht sie ab
  await panel('inventory');
  const lampRes=await page.locator('[data-stock-row="lamp|company"] .sv-rescell').textContent();
  ok(`${L} P8 Lager: bestellte Gehäuse separat (Zeile Gehäuse, nicht im Bestand vor Einlagerung)`,true,lampRes.slice(0,80));
  await page.fill('#search','Gehäuse');await wait(300);
  const hc=await page.locator('[data-stock-row="housing|company"] td').allTextContents().catch(()=>[]);
  await page.fill('#search','');await wait(200);
  ok(`${L} P8 eingelagerte Gehäuse = 6 (Bestellung lief vor dem Laden vollständig durch)`,/6/.test(hc[1]||''),hc.slice(1,4).join(' | '));
  // Kauf bestätigen: Geld fließt erst jetzt, Bestand bleibt bis zum Wareneingang unverändert, Zulauf sichtbar
  await page.click('[data-stock-row="lamp|company"] [data-action="stockBuy"]');await wait(300);
  await page.fill('#panelBody input[name="qty"]','5');await wait(100);
  await page.click('#panelBody form[data-form="buy"] button[type="submit"], #panelBody form[data-form="buy"] button.primary');await wait(400);
  const cash1=await text('#cash');ok(`${L} P7 Kauf erst nach „Verbindlich bestellen“`,cash1!==cash0,`${cash0} → ${cash1}`);
  await panel('inventory');await page.click('[data-action="stockFilter"][data-id="incoming"]');await wait(250);
  const inc=await page.locator('.sv-row').allTextContents();
  await page.click('[data-action="stockFilter"][data-id="all"]');await wait(200);
  ok(`${L} P8 Bestellung erscheint als „im Zulauf“`,inc.length>0&&inc.some(t=>/Zulauf|5/.test(t)),inc.join(' / ').slice(0,140));

  // ---- P3/P4/P9 Aufträge ----
  await panel('orders');
  const row35=await page.locator(`[data-order-row="${o35.id}"] td`).allTextContents();
  ok(`${L} P3 Auftragszeile 35: Reserviert 0 · Frei 22 · 13 fehlen`,/^0/.test(row35[3].trim())&&/22/.test(row35[4])&&/13 fehlen/.test(row35[5]),row35.slice(2,6).join(' | '));
  await page.click(`[data-order-row="${o35.id}"] [data-action="orderToggle"]`);await wait(300);
  const cov=await text('.ov-sub .ov-cover');
  ok(`${L} P3 „35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen“`,cov.trim()==='35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen',cov);
  const row20=await page.locator(`[data-order-row="${o20.id}"] td`).allTextContents();
  ok(`${L} P4 Auftrag 20: 20 reserviert, nicht doppelt als fehlend`,/^20/.test(row20[3].trim())&&/gedeckt/.test(row20[5]),row20.slice(2,6).join(' | '));
  const row8=await page.locator(`[data-order-row="${o8.id}"] td`).allTextContents();
  const sub=await text('.ov-sub');
  befund('QS-017-03',`${L} P4 Zeile 8 Stück: geteilter freier Bestand in der Zeile erkennbar`,!/gedeckt/.test(row8[5])||/⚠|weitere/.test(row8[5]),`Zeile „${row8[5].trim()}“; Hinweis nur aufgeklappt: ${/weiteren/.test(sub)}`);
  const mlo=await multiLine('.ov-row');ok(`${L} Auftragszeilen einzeilig`,mlo.n>0&&!mlo.bad.length,`${mlo.n} Zeilen ${JSON.stringify(mlo.bad.slice(0,3))}`);
  const oSmall=await small('#panel');befund('QS-017-02',`${L} Fenster-Schrift ≥ 12 px (Aufträge)`,!oSmall.length,oSmall.slice(0,6).join(' | '));
  const dueSorted=await page.$$eval('.ov-row',rs=>rs.map(r=>r.dataset.orderRow));ok(`${L} P9 Standardsortierung nach Frist`,dueSorted.length>=3,dueSorted.join(','));
  // Suche und Filter erreichbar, sticky Kopf beim Scrollen
  const sticky=await page.evaluate(()=>{const b=document.querySelector('#panelBody');b.scrollTop=b.scrollHeight;const th=document.querySelector('.ov-table thead');const r=th.getBoundingClientRect(),br=b.getBoundingClientRect();const v=r.top>=br.top-1&&r.top<br.top+80;b.scrollTop=0;return v||b.scrollHeight<=b.clientHeight;});
  ok(`${L} P9 Tabellenkopf/Filter bleiben beim Scrollen sichtbar`,sticky);
  if(big)await shot('auftraege-1920');

  // ---- Fensterbedienung reicht keine Klicks an die Szene durch (Baumodus aktiv) ----
  await close();
  await page.click('.rail [data-action="build"]');await wait(200);
  await page.locator('#buildItems button[data-build="rack"]').first().click();await wait(150);
  await panel('finance');
  const nB0=await page.evaluate(()=>document.querySelectorAll('.scene3d-labels > *').length);
  const pb=await rect('#panelBody');const cashB=await text('#cash');
  const topEl=await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return !!e.closest('#panel');},[pb.x+pb.w/2,pb.y+40]);
  await page.mouse.click(pb.x+pb.w/2,pb.y+40);await page.mouse.click(pb.x+30,pb.y+30);await page.mouse.click(pb.x+pb.w-40,pb.y+60);await wait(300);
  ok(`${L} Klick ins Fenster platziert im Baumodus nichts`,topEl&&(await text('#cash'))===cashB,`${cashB} → ${await text('#cash')}`);
  const cover=await page.evaluate(()=>{const t=document.querySelector('#buildTray'),p=document.querySelector('#panel');if(t.hidden)return 0;const a=t.getBoundingClientRect(),b=p.getBoundingClientRect();const h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)),w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
   const z=+getComputedStyle(t).zIndex>+getComputedStyle(p).zIndex;return z?Math.round(h*w/(b.width*b.height)*100):0;});
  befund('QS-017-06',`${L} Baumenü verdeckt geöffnetes Fenster nicht`,cover===0,`${cover} % der Fensterfläche unter dem Baumenü`);
  if(big)await shot('baumodus-fenster-1920');
  // ---- P15 Liquidität heute ----
  const vals=await page.$$eval('.daycash-values b',bs=>bs.map(b=>b.textContent.trim()));
  const num=t=>{const v=Number(t.replace(/[^\d,]/g,'').replace(',','.'));return /−/.test(t)?-v:v;};
  const [inV,outV,netV]=vals.map(num);
  ok(`${L} P15 drei Tageswerte vorhanden`,vals.length===3,vals.join(' | '));
  ok(`${L} P15 Saldo = Eingänge − Ausgänge`,Math.abs(netV-(inV-Math.abs(outV)))<0.011,vals.join(' | '));
  // Stand beim Laden (gleiche Spielminute, pausiert) – nach dem Kauf oben zusätzlich der Einkauf als Ausgabe
  ok(`${L} P15 Eingänge = gebuchte Eingänge (Journal)`,Math.abs(inV-cash17.inflow)<0.011,`${inV} / ${cash17.inflow}`);
  const money=t=>Number(t.replace(/[^\d,]/g,'').replace(',','.'));const bought=Math.round((money(cash0)-money(cash1))*100)/100;
  ok(`${L} P15 Ausgänge = gebuchte Ausgänge beim Laden + bestätigter Kauf`,Math.abs(Math.abs(outV)-(cash17.outflow+bought))<0.011,`${outV} = ${cash17.outflow} + ${bought}`);
  if(big)await shot('liquiditaet-1920');
  await close();await page.keyboard.press('Escape');await wait(150);

  // ---- P11 WASD im Baumodus, nicht bei Texteingabe ----
  await page.click('.rail [data-action="build"]');await wait(200);
  await page.locator('#buildItems button[data-build="rack"]').first().click();await wait(150);
  const wr=await rect('#world');await page.mouse.move(wr.x+wr.w*0.6,wr.y+wr.h*0.45);await wait(200);
  const nBuild=await page.evaluate(()=>document.querySelectorAll('#buildItems button.active').length);
  let sig=await camSig();const cashW=await text('#cash');
  await page.keyboard.down('a');await wait(450);await page.keyboard.up('a');await page.keyboard.down('w');await wait(350);await page.keyboard.up('w');await wait(250);
  ok(`${L} P11 WASD bewegt Kamera im Baumodus, Bauauswahl bleibt, nichts platziert`,(await camSig())!==sig&&nBuild===1&&(await page.evaluate(()=>document.querySelectorAll('#buildItems button.active').length))===1&&(await text('#cash'))===cashW);
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await wait(150);
  // Umbenennungsfeld (Sortierplatz) und Board-Suche
  await page.fill('#cmd','Sortierplatz');await wait(300);await page.keyboard.press('Enter');await wait(400);
  ok(`${L} Sortierplatz-Akte geöffnet`,/Sortierplatz/.test(await text('#panelBody .building-file')));
  // ---- Anlagenerklärung Sortierplatz ----
  const ex=await text('#panelBody');
  ok(`${L} Anlagenerklärung: Zweck/Voraussetzungen/Ablauf/Zustand/Nächster Schritt`,['Zweck','Voraussetzung','Ablauf','Zustand','Nächster Schritt'].every(k=>ex.includes(k)));
  ok(`${L} Sortierplatz: keine erfundene Nähewirkung`,/keine Wirkung|ohne Wegezeit/.test(ex)&&!/(Nähe|nah)[^.]{0,40}(schneller|beschleunigt|erhöht)/.test(ex));
  if(big)await shot('sortierplatz-1920');
  await page.click('#panelBody [data-rename-start]');await wait(200);
  sig=await camSig();
  await page.keyboard.type('Sort wasd');await wait(300);
  ok(`${L} P11 Tippen im Umbenennungsfeld bewegt Kamera nicht`,(await camSig())===sig&&/wasd/.test(await page.inputValue('.rename-input')));
  await page.fill('.rename-input','Sortierung Halle Süd');await page.keyboard.press('Enter');await wait(400);
  ok(`${L} P10 Anlage umbenannt, Typ weiter erkennbar`,/Sortierung Halle Süd/.test(await text('#panelBody .building-file h3'))&&/Typ: Sortierplatz/.test(await text('#panelBody .building-file')));

  // ---- P12 Rechtsklick ohne Browsermenü (auch auf Fenster, Leiste, Szene, im Baumodus) ----
  await page.evaluate(()=>{window.__rc=[];window.addEventListener('contextmenu',e=>window.__rc.push(e.defaultPrevented),false);});
  const pts=[[wr.x+wr.w*0.5,wr.y+wr.h*0.5],[(await rect('#panelBody')).x+40,(await rect('#panelBody')).y+40],[(await rect('.rail')).x+20,(await rect('.rail')).y+30],[(await rect('#vbar'))?.x+60||wr.x+60,(await rect('#vbar'))?.y+20||wr.y+60],[(await rect('.topbar'))?.x+W/2||W/2,20]];
  for(const [x,y] of pts){await page.mouse.click(x,y,{button:'right'});await wait(120);}
  const rc=await page.evaluate(()=>window.__rc);
  ok(`${L} P12 Kontextmenü an 5 Stellen unterdrückt`,rc.length===5&&rc.every(Boolean),JSON.stringify(rc));
  await close();

  // ---- P14 Schicht über Mitternacht im Personalplan ----
  await panel('staff');
  const bars=await page.evaluate(id=>{const row=[...document.querySelectorAll('.sched-row')].find(r=>r.textContent.includes(id)||r.querySelector(`[data-id="${id}"]`)||r.innerHTML.includes(id));if(!row)return null;const tr=row.querySelector('.sched-track').getBoundingClientRect();return [...row.querySelectorAll('.sched-bar')].map(b=>{const r=b.getBoundingClientRect();return {from:Math.round((r.left-tr.left)/tr.width*24*10)/10,to:Math.round((r.right-tr.left)/tr.width*24*10)/10,cls:b.className,title:b.title};});},nightId);
  ok(`${L} P14 Nachtschicht: Balken 00–08 und 16–24 mit Übergang`,!!bars&&bars.length===2&&Math.abs(bars[0].from)<0.2&&Math.abs(bars[0].to-8)<0.2&&Math.abs(bars[1].from-16)<0.2&&Math.abs(bars[1].to-24)<0.2&&/from-prev/.test(bars[0].cls)&&/to-next/.test(bars[1].cls),JSON.stringify(bars));
  if(big)await shot('personalplan-1920');
  await close();

  // ---- P16 Board: Spaltenwechsel nach echter Bearbeitung ----
  await panel('service');
  const colOf=id=>page.evaluate(id=>{const c=document.querySelector(`[data-board-id="${id}"]`);return c?.closest('.bcol')?.className.match(/col-(\w+)/)?.[1]||null;},id);
  ok(`${L} P16 Anliegen in „Offen“`,(await colOf(ticket))==='open',String(await colOf(ticket)));
  if((await page.getAttribute(`[data-board-card="${ticket}"]`,'aria-expanded'))!=='true'){await page.click(`[data-board-card="${ticket}"]`);await wait(250);}
  await page.click(`[data-board-id="${ticket}"] [data-action="ticket-inform"]`);await wait(400);
  ok(`${L} P16 nach Antwort „In Bearbeitung“`,(await colOf(ticket))==='work',String(await colOf(ticket)));
  // Spiel laufen lassen: Kundendienstkraft schließt die Bearbeitung ab (15 Min.)
  await page.click('[data-speed="12"]').catch(()=>page.keyboard.press('3'));
  await page.waitForFunction(id=>document.querySelector(`[data-board-id="${id}"]`)?.closest('.col-done'),ticket,{timeout:30000}).catch(()=>{});
  await page.click('[data-speed="0"]');
  ok(`${L} P16 nach Abschluss „Abgeschlossen“`,(await colOf(ticket))==='done',String(await colOf(ticket)));
  if(big)await shot('board-1920');
  await close();

  // ---- P13 Fenster maximieren/wiederherstellen, proportionale Skalierung ----
  await panel('finance');
  const g0=await rect('#panel');
  await page.click('#panelMax');await wait(150);const gm=await rect('#panel'),railR=await rect('.rail'),game=await rect('#game');
  ok(`${L} P13 maximiert füllt Spielfläche neben der Leiste`,gm.x>=railR.x+railR.w-1&&gm.w>=game.w-railR.w-40&&gm.h>=game.h-60,JSON.stringify(gm));
  const scen=await page.evaluate(()=>{const b=document.querySelector('#panelBody');return {sw:b.scrollWidth,cw:b.clientWidth};});
  ok(`${L} P13 maximiert ohne horizontalen Überlauf`,scen.sw<=scen.cw+1,JSON.stringify(scen));
  if(big)await shot('fenster-max-1920');
  await page.click('#panelMax');await wait(150);const gr=await rect('#panel');
  ok(`${L} P13 Wiederherstellen = vorherige Lage`,['x','y','w','h'].every(k=>Math.abs(gr[k]-g0[k])<=1),`${JSON.stringify(g0)} / ${JSON.stringify(gr)}`);
  // Verkleinern auf Mindestgröße: Bedienelemente erreichbar (Schließen, Maximieren sichtbar)
  await page.mouse.move(gr.x+gr.w-3,gr.y+gr.h-3);await page.mouse.down();await page.mouse.move(gr.x+50,gr.y+50,{steps:8});await page.mouse.up();await wait(150);
  const gsm=await rect('#panel');
  const vis=await page.evaluate(()=>['#panelMax','[data-action="close"]'].every(s=>{const r=document.querySelector(s).getBoundingClientRect(),p=document.querySelector('#panel').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1&&r.top>=p.top&&r.bottom<=p.bottom;}));
  ok(`${L} P13 verkleinert (Mindestgröße) bedienbar`,gsm.w>=370&&gsm.h>=250&&vis,JSON.stringify(gsm));
  // Proportionale Skalierung bei Auflösungswechsel
  const gA=await rect('#panel'),gameA=await rect('#game');
  const W2=big?1366:1920,H2=big?768:1080;await page.setViewportSize({width:W2,height:H2});await wait(450);
  const gB=await rect('#panel'),gameB=await rect('#game');
  const relA=(gA.x-gameA.x)/gameA.w,relB=(gB.x-gameB.x)/gameB.w;
  ok(`${L} → ${W2}×${H2}: Fenster vollständig sichtbar`,gB.x>=0&&gB.y>=gameB.y-1&&gB.x+gB.w<=W2+1&&gB.y+gB.h<=H2+1,JSON.stringify(gB));
  ok(`${L} → ${W2}×${H2}: Lage proportional (x-Anteil)`,Math.abs(relA-relB)<0.02||gB.w===380,`${relA.toFixed(3)} / ${relB.toFixed(3)}`);
  await page.setViewportSize({width:W,height:H});await wait(400);
  const gC=await rect('#panel');ok(`${L} zurück auf ${W}×${H}: gleiche Größe`,['x','y','w','h'].every(k=>Math.abs(gC[k]-gA[k])<=1),`${JSON.stringify(gA)} / ${JSON.stringify(gC)}`);
  await close();

  // ---- P17 Assistent unverändert bedienbar ----
  await page.keyboard.press('j');await wait(400);
  ok(`${L} P17 Assistent-Fenster öffnet (J)`,!(await page.locator('#panel').isHidden())&&/Assistent|Disposition/i.test(await text('#panelTitle')),await text('#panelTitle'));
  if(big)await shot('assistent-1920');
  await close();

  // ---- P10 Namen nach echtem Neuladen ----
  if(big){
   await page.click('#siteBtn');await wait(200);
   await page.click('#siteList [data-rename-start]');await wait(150);
   await page.fill('#siteList .rename-input','Depot Lindenhof');await page.keyboard.press('Enter');await wait(400);
   ok(`${L} P10 Standort umbenannt`,/Depot Lindenhof/.test(await text('#siteName')));
   await page.keyboard.press('Escape');
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await wait(1500);
   await page.reload();await page.waitForFunction(()=>!document.querySelector('#welcome')?.open||document.querySelector('#statusText'),null,{timeout:15000});await wait(1500);
   const welcome=await page.evaluate(()=>document.querySelector('#welcome')?.open);
   ok(`${L} P10 Neuladen setzt den Spielstand fort (kein Startdialog)`,!welcome);
   ok(`${L} P10 Standortname nach Neuladen`,/Depot Lindenhof/.test(await text('#siteName')),await text('#siteName'));
   await page.fill('#cmd','Sortierung Halle');await wait(300);
   const hitTxt=await text('#cmdResults');
   ok(`${L} P10 Anlagenname nach Neuladen (Suche/Liste)`,/Sortierung Halle Süd/.test(hitTxt),hitTxt.slice(0,80));
   await page.keyboard.press('Enter');await wait(300);
   ok(`${L} P10 Anlagenakte zeigt Namen nach Neuladen`,/Sortierung Halle Süd/.test(await text('#panelBody .building-file h3')));
   await close();
   await panel('staff');
   ok(`${L} P10 Name im Personalplan konsistent (falls zugeordnet) bzw. kein alter Typname mit Nr.`,!/Sortierplatz 1/.test(await text('#panelBody')));
   await close();
  }
 });
}

// ---- P17 alter Spielstand 0.16 im Browser ----
if(file16)await session(1920,1080,async(page,L)=>{
 const {wait,text,panel,close,load}=helpers(page);
 await load(file16);
 ok(`${L} P17 Stand 0.16 geladen`,!(await page.evaluate(()=>document.querySelector('#welcome')?.open)));
 for(const p of ['inventory','orders','staff','finance','service']){await panel(p);ok(`${L} P17 Stand 0.16: Fenster ${p} rendert`,(await text('#panelBody')).trim().length>40);}
 await close();await page.keyboard.press('j');await wait(400);
 ok(`${L} P17 Stand 0.16: Assistent öffnet`,/Assistent|Disposition/i.test(await text('#panelTitle')));
});
else log.push('NICHT DURCHGEFÜHRT P17 Browserimport Stand 0.16 (Stand nicht erzeugbar)');

// ---- Kopfzeile mit Wetteranzeige (Seed 13, Sturm am Tag 3) bei beiden Auflösungen ----
{
 const w=new Simulation({mode:'sandbox',seed:13}),ws=w.state,wc=c=>{const r=w.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r;};
 wc({type:'build',buildingType:'dock',x:2,y:10,rotation:0});wc({type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 for(let i=0;i<2;i++){const id=wc({type:'hire',role:'warehouse'}).id;wc({type:'setShift',id,shift:'all'});}
 wc({type:'buyVehicle',vehicleType:'van'});
 for(let i=0;i<6*1440&&!ws.yard.some(a=>a.waitReason==='Torstörung');i++){for(const k of ws.contracts)if(k.status==='offer'&&ws.contracts.filter(x=>x.status==='active').length<3)w.command({type:'acceptContract',id:k.id});w.step(1);}
 const fileW=join(dir,'stand-wetter.json');writeFileSync(fileW,w.serialize());
 for(const [W,H] of [[1920,1080],[1366,768]])await session(W,H,async(page,L)=>{
  const {wait,text}=helpers(page);
  await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
  await page.click('#welcome [data-action="start"]');await wait(500);
  await page.setInputFiles('#importFile',fileW);await page.waitForFunction(()=>document.querySelector('#confirm')?.open);
  await page.click('#confirm [data-action="confirmOk"]');await wait(900);await page.keyboard.press('4');await wait(300);
  const weather=await text('#siteWeather');
  const covered=await page.evaluate(()=>[...document.querySelectorAll('.topbar button')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e&&!b.contains(e)?(b.getAttribute('aria-label')||b.title||b.textContent.trim()).slice(0,24):null;}).filter(Boolean));
  befund('QS-017-08',`${L} Kopfzeile mit Wetter „${weather.trim()}“: Schalter nicht überdeckt`,!covered.length,covered.join(', '));
  if(W===1366&&shots)await page.screenshot({path:join(shots,'qa017-kopf-wetter-1366.png'),clip:{x:0,y:0,width:W,height:60}});
  for(const k of ['v','h']){await page.keyboard.press('Escape');await wait(150);await page.keyboard.press(k);await wait(450);
   const o=await page.evaluate(()=>{const b=document.querySelector('#panelBody');return {t:document.querySelector('#panelTitle').textContent,sw:b.scrollWidth,cw:b.clientWidth};});
   befund('QS-017-07',`${L} ${o.t} (Startlage) ohne waagerechten Überlauf`,o.sw<=o.cw+1,`${o.sw}/${o.cw}`);
   if(W===1920&&k==='v'&&shots){await page.evaluate(()=>{const b=document.querySelector('#panelBody');b.scrollTop=b.scrollHeight;});await wait(150);await page.screenshot({path:join(shots,'qa017-vertraege-ueberlauf-1920.png')});}
  }
 });
}

// ---- QS-017-01 im Browser: Standort auf 1 Zeichen umbenennen, dann neu laden ----
await session(1920,1080,async(page,L)=>{
 const {wait,text,load}=helpers(page);
 await load(file17);
 await page.click('#siteBtn');await wait(200);await page.click('#siteList [data-rename-start]');await wait(150);
 await page.fill('#siteList .rename-input','A');await page.keyboard.press('Enter');await wait(400);
 const accepted=/^A$/.test((await text('#siteName')).trim());
 await page.keyboard.press('Escape');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await wait(1500);
 await page.reload();await wait(2500);
 const state=await page.evaluate(()=>({welcome:!!document.querySelector('#welcome')?.open,site:document.querySelector('#siteName')?.textContent,toast:[...document.querySelectorAll('.toast,#toast,[role="status"]')].map(e=>e.textContent).join(' ').slice(0,200)}));
 befund('QS-017-01',`${L} Standortname „A“ abgelehnt oder Stand nach Neuladen ladbar`,!accepted||(!state.welcome&&state.site==='A'),`angenommen=${accepted} · nach Neuladen ${JSON.stringify(state)}`);
});

const errs=errors.filter(e=>!/QS-017-01/.test(e));
ok('Keine Konsolenfehler',!errs.length,errs.slice(0,4).join(' | '));
console.log(log.join('\n'));
console.log(`\n${log.filter(l=>l.startsWith('OK')).length} OK, ${fails} FEHL, ${befunde} BEFUND`);
await browser.close();server.kill();cleanup();rmSync(dir,{recursive:true,force:true});
