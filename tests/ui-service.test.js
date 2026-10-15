import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-harness.js';

async function setup(){const ui=await boot();await ui.click('start');ui.run(`sim.state.orders[0].status='active';sim.state.orders[0].customer='<img src=x onerror=alert(1)>';sim.state.orders[0].paid=1000;sim.state.tickets=[{id:'T<1',orderId:sim.state.orders[0].id,site:sim.state.selectedSite,kind:'deadline',status:'open',createdAt:sim.state.t,remaining:30,blocked:'<script>unsafe</script>',response:null,originalDue:900,requestedDue:1140,cost:0,outcome:null,completedAt:null}];openPanel('service')`);return ui;}

test('Kundendienst zeigt Ticketfristen, Kosten, Personalbedarf und erhält Retouren',async()=>{
 const ui=await setup(),html=ui.nodes.get('#panelBody').innerHTML;
 for(const text of ['Ursprüngliche Frist','Beantragte Frist','Aktuelle Auftragsfrist','Vorgemerkte Kosten','30 Spielminuten','Servicepersonal','Schicht und Pause','Retouren','data-form="return"','data-form="ticket"','data-action="ticket-approve"'])assert.ok(html.includes(text),text);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(html,/&lt;script&gt;unsafe&lt;\/script&gt;/);assert.doesNotMatch(html,/<img src=x|<script>unsafe/);assert.match(html,/data-id="T&lt;1"/);
});

test('Kostenpflichtige Antwort wartet auf Bestätigung; Abbrechen bleibt ohne Befehl',async()=>{
 const ui=await setup();ui.run("globalThis.commands=[];sim.command=c=>{commands.push(c);return {ok:true}}");
 await ui.click('ticket-approve','T<1');assert.equal(ui.run('commands.length'),0);assert.equal(ui.nodes.get('#confirm').open,true);assert.match(ui.nodes.get('#confirmText').textContent,/Voraussichtliche Kosten: .* €/);
 await ui.click('confirmCancel');assert.equal(ui.run('commands.length'),0);
 await ui.click('ticket-approve','T<1');await ui.click('confirmOk');assert.deepEqual(JSON.parse(ui.run('JSON.stringify(commands)')),[{type:'respondTicket',id:'T<1',response:'approve'}]);
});

test('Ticketformular sendet numerische Verlängerung, kostenlose Antwort ohne Dialog',async()=>{
 const ui=await setup();ui.run("globalThis.commands=[];sim.command=c=>{commands.push(c);return {ok:true}}");
 ui.submit('ticket',{orderId:'O1',kind:'deadline',extensionMinutes:'240'});assert.deepEqual(JSON.parse(ui.run('JSON.stringify(commands[0])')),{type:'createTicket',orderId:'O1',kind:'deadline',extensionMinutes:240});
 await ui.click('ticket-reject','T<1');assert.equal(ui.run('commands[1].response'),'reject');assert.ok(!ui.nodes.get('#confirm').open);
});

test('Kulanz braucht Zahlung, laufende und geschlossene Tickets zeigen keine Antwortaktionen',async()=>{
 const ui=await setup();ui.run("sim.state.orders[0].paid=0;sim.state.tickets[0].kind='complaint';renderPanel()");let html=ui.nodes.get('#panelBody').innerHTML;
 assert.doesNotMatch(html,/data-action="ticket-goodwill"/);assert.match(html,/Kulanz erst nach Kundenzahlung/);assert.match(html,/data-action="ticket-apologize"/);
 ui.run("sim.state.orders[0].paid=100;renderPanel()");html=ui.nodes.get('#panelBody').innerHTML;assert.match(html,/Kulanz gewähren · ca. 5 €/);
 for(const status of ['processing','closed']){ui.run(`sim.state.tickets[0].status='${status}';sim.state.tickets[0].completedAt=1000;sim.state.tickets[0].response='apologize';sim.state.tickets[0].outcome='<svg onload=alert(1)>';renderPanel()`);html=ui.nodes.get('#panelBody').innerHTML;assert.doesNotMatch(html,/data-action="ticket-/);assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);}
});

test('Alter Spielstand ohne Tickets öffnet Kundendienst',async()=>{
 const ui=await boot();await ui.click('start');ui.run("delete sim.state.tickets;openPanel('service')");assert.match(ui.nodes.get('#panelBody').innerHTML,/Keine Tickets/);
});

test('Gegenstandslose Frist zeigt keine gebuchte Gebühr und deutsche Antwort',async()=>{
 const ui=await setup();ui.run("sim.state.tickets[0].status='closed';sim.state.tickets[0].completedAt=1000;sim.state.tickets[0].cost=250;sim.state.tickets[0].outcome='obsolete';sim.state.tickets[0].response='approve';renderPanel()");const html=ui.nodes.get('#panelBody').innerHTML;assert.match(html,/Gebuchte Kosten<\/span><b>0 €/);assert.match(html,/Anliegen nicht mehr anwendbar/);assert.match(html,/Frist genehmigen/);
});

test('Abgeschlossene Serviceantwort erscheint als sicherer Klartext',async()=>{
 const ui=await setup();ui.run("sim.state.tickets[0].status='closed';sim.state.tickets[0].completedAt=1000;sim.state.tickets[0].reply='Lieferung <img src=x onerror=alert(1)> geplant.';renderPanel()");const html=ui.nodes.get('#panelBody').innerHTML;assert.match(html,/Lieferung &lt;img src=x onerror=alert\(1\)&gt; geplant\./);assert.doesNotMatch(html,/<img src=x/);
});
