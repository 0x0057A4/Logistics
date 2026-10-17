// A01: Rechtsklick bricht ab wie Esc; Browsermenü nur in Eingabefeldern.
import {loadPlaywright} from './playwright.mjs';
import {prepareRoot,startServer,watch} from './serve.mjs';
const pw=loadPlaywright();if(!pw){console.log('Playwright fehlt');process.exit(0);}
const {root,cleanup}=prepareRoot(process.argv.includes('--repo'));const {server,url}=await startServer(root);
const browser=await pw.chromium.launch(pw.launchOptions);const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[],log=[];watch(page,errors,'rc');
const ok=(n,c,d='')=>{log.push(`${c?'OK  ':'FEHL'} ${n} ${d}`);if(!c)process.exitCode=1;};
try{
 await page.goto(url+'index.html');await page.waitForFunction(()=>document.querySelector('#welcome')?.open);await page.click('#welcome [data-action="start"]');await page.waitForTimeout(500);
 // defaultPrevented am Ende der Ereigniskette protokollieren
 await page.evaluate(()=>{window.__rc=[];window.addEventListener('contextmenu',e=>window.__rc.push(e.defaultPrevented),false);});
 const c=await page.locator('#world').boundingBox(),cx=c.x+c.width/2,cy=c.y+c.height/2;
 await page.keyboard.press('b');await page.waitForTimeout(200);ok('Baumodus offen',!(await page.locator('#buildTray').isHidden()));
 await page.mouse.click(cx,cy,{button:'right'});await page.waitForTimeout(200);
 ok('Rechtsklick beendet Baumodus',await page.locator('#buildTray').isHidden());
 await page.click('[data-panel="contracts"]');await page.waitForTimeout(300);ok('Fenster offen',!(await page.locator('#panel').isHidden()));
 // Ziehen mit rechter Taste bricht nicht ab
 await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx+60,cy+20,{steps:5});await page.mouse.up({button:'right'});await page.waitForTimeout(200);
 ok('Rechts-Ziehen schließt Fenster nicht',!(await page.locator('#panel').isHidden()));
 await page.mouse.click(cx,cy,{button:'right'});await page.waitForTimeout(200);ok('Rechtsklick schließt Fenster',await page.locator('#panel').isHidden());
 const box=await page.locator('#cmd').boundingBox();await page.mouse.click(box.x+20,box.y+box.height/2,{button:'right'});await page.waitForTimeout(150);
 const rc=await page.evaluate(()=>window.__rc);ok('Browsermenü im Spielbereich unterdrückt',rc.slice(0,-1).every(Boolean),JSON.stringify(rc));ok('Browsermenü im Suchfeld erlaubt',rc.at(-1)===false);
}catch(e){ok('Ablauf ohne Ausnahme',false,e.message.slice(0,200));}
ok('Keine Konsolenfehler',!errors.length,errors.slice(0,3).join(' | '));
console.log(log.join('\n'));await browser.close();server.kill();cleanup();
