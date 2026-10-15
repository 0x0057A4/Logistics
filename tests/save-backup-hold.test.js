// A12 · QS-W0-05/11: „Gründen“ über vorhandenem Unternehmen legt dessen letzten gültigen Stand in den Platz `-backup-prev`
// (bis „verwerfen“ oder erneutes Gründen); die laufende Sicherung rotiert normal. Willkommensdialog und Einstellungen bieten „Letzte Sicherung laden“ nur bei gültiger Sicherung.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {boot} from './ui-harness.js';

const K='industrie-logistik-v1-guided';
const tick=()=>new Promise(r=>setImmediate(r));
function validSave(minutes=30){const sim=new Simulation({mode:'guided',seed:9});sim.step(minutes);return sim.serialize();}
const autosave=(ui,n=1)=>{for(let i=0;i<n;i++){ui.run('sim.step(5)');ui.run('dirty=true');assert.equal(ui.run('save()'),true);}};
const settingsHtml=ui=>{ui.run("openPanel('settings')");return ui.nodes.get('#panelBody').innerHTML;};

test('QS-W0-05: beschädigter Hauptstand + gültige Sicherung → Willkommensdialog bietet „Letzte Sicherung laden“; lädt t=510',async()=>{
 const memory=new Map(),good=validSave();memory.set(K,good.slice(0,-40));memory.set(K+'-backup',good);
 const ui=await boot({memory});
 assert.equal(ui.run('started'),false);assert.equal(ui.nodes.get('#welcome').open,true);
 assert.equal(ui.nodes.get('#welcomeBackup').hidden,false,'Button sichtbar');
 await ui.click('welcomeBackup');assert.equal(ui.nodes.get('#confirm').open,true);await ui.click('confirmOk');await tick();
 assert.equal(ui.run('sim.state.t'),510);assert.equal(JSON.parse(memory.get(K)).t,510);assert.equal(memory.get(K+'-backup'),good);
 assert.equal(ui.nodes.get('#welcome').open,false);
 ui.run('guard.dispose()');
});

test('QS-W0-05: Willkommensdialog ohne Sicherung oder mit beschädigter Sicherung zeigt keinen Sicherungsbutton',async()=>{
 for(const backup of [null,'{kaputt',validSave().slice(0,-10)]){
  const memory=new Map([[K,'{kaputt']]);if(backup!==null)memory.set(K+'-backup',backup);
  const ui=await boot({memory});
  assert.equal(ui.nodes.get('#welcome').open,true);assert.equal(ui.nodes.get('#welcomeBackup').hidden,true,'Sicherung: '+String(backup).slice(0,12));
  assert.doesNotMatch(settingsHtml(ui),/data-action="backup"/,'Einstellungen ohne Ladebutton');
  ui.run('guard.dispose()');
 }
});

test('QS-W0-05/11: gültiger Hauptstand, „Neues Unternehmen“ → Gründen: altes Unternehmen im eigenen Platz, laufende Sicherung rotiert für das neue',async()=>{
 const memory=new Map(),oldMain=validSave(120),oldBackup=validSave(60);memory.set(K,oldMain);memory.set(K+'-backup',oldBackup);
 const ui=await boot({memory});assert.equal(ui.run('started'),true);assert.equal(ui.run('sim.state.t'),600);
 await ui.click('new');await ui.click('confirmOk');assert.equal(ui.nodes.get('#welcome').open,true);
 assert.equal(ui.nodes.get('#welcomeBackup').hidden,false,'Sicherung im Dialog angeboten');
 await ui.click('start');assert.equal(ui.nodes.get('#confirm').open,true);
 assert.match(ui.nodes.get('#confirmText').textContent,/Sicherung bleibt erhalten/);assert.doesNotMatch(ui.nodes.get('#confirmText').textContent,/ältere Sicherung/);await ui.click('confirmOk');
 assert.equal(ui.run('sim.state.t'),480);
 autosave(ui,4);
 assert.equal(memory.get(K+'-backup-prev'),oldMain,'Platz „vorheriges Unternehmen“ = letzter Stand des alten Unternehmens');
 assert.equal(JSON.parse(memory.get(K+'-backup')).t,495,'laufende Sicherung = vorheriger Stand des neuen Unternehmens');
 assert.equal(JSON.parse(memory.get(K)).t,500);assert.equal(memory.has(K+'-backup-hold'),false);
 const html=settingsHtml(ui);
 assert.match(html,/Sicherung des vorherigen Unternehmens \(Tag 1 · 10:00\) bleibt erhalten/);assert.match(html,/data-action="discardBackup"/);assert.match(html,/data-action="loadPrevious"/);assert.match(html,/data-action="backup"/);
 ui.run('guard.dispose()');
});

test('QS-W0-11: zweites Gründen legt das zuletzt ersetzte Unternehmen ab (mit Hinweis); „Alte Sicherung verwerfen“ löscht den Platz',async()=>{
 const memory=new Map(),good=validSave();memory.set(K,'{kaputt');memory.set(K+'-backup',good);
 const ui=await boot({memory});await ui.click('start');await ui.click('confirmOk');
 assert.equal(memory.get(K+'-backup-prev'),good,'beschädigter Hauptstand → gültige Sicherung abgelegt');autosave(ui,2);
 await ui.click('new');await ui.click('confirmOk');await ui.click('start');
 assert.match(ui.nodes.get('#confirmText').textContent,/ältere Sicherung wird dabei ersetzt/);await ui.click('confirmOk');autosave(ui,2);
 assert.equal(JSON.parse(memory.get(K+'-backup-prev')).t,490,'Platz = Unternehmen B');
 assert.equal(JSON.parse(memory.get(K+'-backup')).t,485,'laufende Sicherung = Unternehmen C');
 await ui.click('discardBackup');assert.match(ui.nodes.get('#confirmTitle').textContent,/verwerfen/);await ui.click('confirmOk');await tick();
 assert.equal(memory.has(K+'-backup-prev'),false);assert.equal(memory.has(K+'-backup-hold'),false);
 const afterDiscard=memory.get(K);autosave(ui,1);
 assert.equal(memory.get(K+'-backup'),afterDiscard,'Rotation unverändert');assert.doesNotMatch(settingsHtml(ui),/discardBackup/);
 ui.run('guard.dispose()');
});

test('QS-W0-11: Abbrechen beim Verwerfen; „Letzte Sicherung laden“ und Tausch über „Vorheriges Unternehmen laden“',async()=>{
 const memory=new Map(),good=validSave();memory.set(K,good.slice(0,-40));memory.set(K+'-backup',good);
 const ui=await boot({memory});await ui.click('start');await ui.click('confirmOk');autosave(ui,2);
 await ui.click('discardBackup');await ui.click('confirmCancel');assert.equal(memory.get(K+'-backup-prev'),good,'Abbrechen lässt Platz stehen');
 await ui.click('backup');await ui.click('confirmOk');await tick();
 assert.equal(ui.run('sim.state.t'),485,'laufende Sicherung = eigener Vorgängerstand');assert.equal(memory.get(K+'-backup-prev'),good);
 await ui.click('loadPrevious');assert.match(ui.nodes.get('#confirmTitle').textContent,/Vorheriges Unternehmen/);await ui.click('confirmOk');await tick();
 assert.equal(ui.run('sim.state.t'),510);assert.equal(JSON.parse(memory.get(K)).t,510);
 assert.equal(JSON.parse(memory.get(K+'-backup-prev')).t,485,'Tausch: Unternehmen B liegt jetzt im Platz');
 autosave(ui,1);assert.equal(JSON.parse(memory.get(K+'-backup')).t,510);assert.equal(JSON.parse(memory.get(K)).t,515);
 ui.run('guard.dispose()');
});

test('QS-W0-11: Altbestand mit W0-Marker -backup-hold wird beim Start in den eigenen Platz überführt',async()=>{
 const memory=new Map(),a=validSave(),b=validSave(60);memory.set(K,b);memory.set(K+'-backup',a);memory.set(K+'-backup-hold',JSON.stringify({t:510}));
 const ui=await boot({memory});assert.equal(ui.run('sim.state.t'),540);
 assert.equal(memory.get(K+'-backup-prev'),a);assert.equal(memory.has(K+'-backup-hold'),false);
 autosave(ui,1);assert.equal(memory.get(K+'-backup'),b,'laufende Sicherung rotiert wieder');assert.equal(memory.get(K+'-backup-prev'),a);
 ui.run('guard.dispose()');
});

test('QS-W0-11: Altbestand-Marker, Platz nicht schreibbar (localStorage voll) → W0-Festhalten gilt weiter',async()=>{
 const memory=new Map(),a=validSave(),b=validSave(60);memory.set(K,b);memory.set(K+'-backup',a);memory.set(K+'-backup-hold',JSON.stringify({t:510}));
 const storage={getItem:k=>memory.get(k)??null,setItem(k,v){if(k.endsWith('-backup-prev'))throw new DOMException('Full','QuotaExceededError');memory.set(k,v);},removeItem:k=>memory.delete(k)};
 const ui=await boot({memory,storage});assert.equal(memory.has(K+'-backup-hold'),true);
 autosave(ui,2);assert.equal(memory.get(K+'-backup'),a,'Sicherung des alten Unternehmens bleibt festgehalten');
 ui.run('guard.dispose()');
});

test('QS-W0-05: ohne vorhandenes Unternehmen kein Festhalten; normale Rotation bleibt (S3)',async()=>{
 const memory=new Map(),ui=await boot({memory});await ui.click('start');autosave(ui,2);
 assert.equal(memory.has(K+'-backup-hold'),false);assert.equal(JSON.parse(memory.get(K+'-backup')).t,485);
 ui.run('guard.dispose()');
});
