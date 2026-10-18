// A01: Ende-zu-Ende über die Oberfläche: Einstieg → Startbetrieb → Vertrag → Lkw → Sortierung → Versand → Zahlung.
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const {root,cleanup}=prepareRoot(process.argv.includes('--repo'));const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[],log=[];watch(page,errors,'flow');
const ok=(name,cond,detail='')=>{log.push(`${cond?'OK  ':'FEHL'} ${name} ${detail}`);if(!cond)process.exitCode=1;};
const txt=s=>page.locator(s).first().textContent().catch(()=>'');
const clickText=async(t)=>{const b=page.getByRole('button',{name:t}).first();await b.click();await page.waitForTimeout(250);};
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);
 await page.click('#welcome [data-action="start"]');await page.waitForTimeout(600);
 await page.click('[data-panel="overview"]');await page.waitForTimeout(300);
 await clickText(/Startbetrieb einrichten/);await page.waitForTimeout(800);
 ok('Startbetrieb: Rampe/Personal/Fahrzeug',/Rampen \d\/1/.test(await txt('.statusbar')),await txt('.statusbar'));
 const openP=async(k,t)=>{if(!new RegExp(t).test(await txt('#panelTitle'))||await page.locator('#panel').isHidden()){await page.click(`[data-panel="${k}"]`);await page.waitForTimeout(400);}};
 await openP('contracts','Vertr');
 await clickText(/Vertrag annehmen/);await page.waitForTimeout(400);
 ok('Vertrag angenommen',/1 aktiv/.test(await txt('#panelBody')));
 await page.click('[data-speed="12"]');
 await page.waitForFunction(()=>/Entladen|Sortier/.test(document.querySelector('#panelBody')?.textContent||'')||document.querySelector('#st-sort')?.textContent?.match(/[1-9]/),null,{timeout:240000}).catch(()=>{});
 await openP('yard','Hof');
 ok('Lkw im Torbuch',/[A-Z]{3}-[A-Z]{2} \d/.test(await txt('#panelBody')),(await txt('#panelBody')).slice(0,160));
 // warten bis Pakete versandfähig (Ausgang > 0) und Lkw abgefertigt
 await page.waitForFunction(()=>/Abgefertigt/.test(document.querySelector('#panelBody')?.textContent||''),null,{timeout:240000}).catch(()=>{});
 await page.waitForTimeout(8000);await page.click('[data-speed="0"]');
 await openP('orders','Auftr');
 // 0.17: Versandformular liegt in der aufklappbaren Auftragszeile (Auftragstabelle).
 { const t=page.locator('#panelBody [data-action="orderToggle"]',{hasText:'Liefern'}).first();if(await t.count()){await t.click();await page.waitForTimeout(400);} }
 const forms=page.locator('#panelBody form');const n=await forms.count();ok('Versandformular vorhanden',n>0,'Formulare '+n);
 if(n){const f=forms.first();const qty=await f.locator('input[type=number]').first().inputValue().catch(()=>'?');ok('Menge vorgeschlagen',+qty>20,'Menge '+qty);await f.locator('button').last().click();await page.waitForTimeout(500);}
 const cash=async()=>Number((await txt('#cash')).replace(/[^\d,]/g,'').replace(',','.'));const before=await cash();
 await page.click('[data-speed="12"]');
 await page.waitForFunction(()=>/[1-9]/.test(document.querySelector('#kpiDelivered,[data-kpi="delivered"]')?.textContent||'')||/Zahlung|bezahlt/i.test(document.querySelector('#toast')?.textContent||''),null,{timeout:240000}).catch(()=>{});
 await page.waitForTimeout(12000);await page.click('[data-speed="0"]');
 await openP('finance','Finanz');
 const after=await cash();ok('Zahlung eingegangen (Liquidität steigt trotz Löhnen)',after-before>500,`vor ${before} · nach ${after}`);
 await page.screenshot({path:new URL('../../docs/assets/qs-ui-flow-0.9.png',import.meta.url).pathname});
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,200));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));await browser.close();server.kill();cleanup();
