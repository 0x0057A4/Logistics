// Eigene Prüfungen A08: 0.16 S3 Kundendienst-Ausbau (docs/SCHNITTSTELLEN-0.16.md): automatische Anliegen aus echten
// Ereignissen, Antwortfrist, Versenderzufriedenheit und deren Wirkung auf neue Angebote, Kulanz genau einmal, Speichern/Laden.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {SATISFACTION,OFFER_INTERVAL,OFFER_PHASE,shipperScore} from '../dist/contracts.js';
import {RESPONSE_MINUTES,AUTO} from '../dist/customer-service.js';

const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
function run(sim,cond,max=4000){for(let i=0;i<max;i++){if(cond())return;sim.step(1);}assert.fail('Bedingung nicht erreicht');}
const reload=sim=>Simulation.fromJSON(sim.serialize());
const stock=(s,owner)=>s.batches.filter(b=>b.owner===owner&&b.location==='stock').reduce((n,b)=>n+b.qty,0);
function hub(seed=7,staff=true){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 for(const c of [{type:'build',buildingType:'dock',x:2,y:13,rotation:0},{type:'build',buildingType:'rack',x:8,y:2,rotation:0},{type:'hire',role:'warehouse'},{type:'hire',role:'driver'},{type:'buyVehicle',vehicleType:'van'}])ok(sim,c);
 if(staff)ok(sim,{type:'hire',role:'service'});
 const c=s.contracts[0];ok(sim,{type:'acceptContract',id:c.id});
 return {sim,s,c};
}
/** Erste Ankunft vollständig eingelagert; Vertragsaufträge aktiv, nichts zugestellt. */
function arrived(sim,s,c){
 run(sim,()=>s.yard.length&&s.yard[0].phase==='gone'&&s.orders.filter(o=>o.contractId===c.id).every(o=>stock(s,o.id)===o.qty));
 return s.orders.filter(o=>o.contractId===c.id);
}
const tickets=(s,o,kind)=>s.tickets.filter(t=>t.orderId===o.id&&(!kind||t.kind===kind));

test('Drohende Verspätung → Statusanfrage, Fristüberschreitung → Beschwerde; je Auftrag und Art genau einmal',()=>{
 const {sim,s,c}=hub(),[o]=arrived(sim,s,c);
 assert.equal(tickets(s,o).length,0,'ohne nahende Frist keine Anliegen');
 o.due=s.t+AUTO.riskLead+5;sim.step(4);assert.equal(tickets(s,o).length,0,'außerhalb des Vorlaufs nichts');
 sim.step(2);const status=tickets(s,o,'status');assert.equal(status.length,1);
 assert.equal(status[0].source,'automatic');assert.equal(status[0].trigger,'risk');assert.equal(status[0].respondBy,status[0].createdAt+RESPONSE_MINUTES.status);
 run(sim,()=>s.t>o.due);sim.step(1);const complaint=tickets(s,o,'complaint');assert.equal(complaint.length,1);assert.equal(complaint[0].trigger,'late');
 assert.ok(s.events.some(e=>e.kind==='service'&&e.text.includes('drohende Verspätung')));
 sim.step(600);assert.equal(tickets(s,o,'status').length,1);assert.equal(tickets(s,o,'complaint').length,1);
 assert.equal(sim.command({type:'createTicket',orderId:o.id,kind:'status'}).ok,false,'manuelles Doppel abgewiesen');
 validateState(s);
});

test('Teillieferung: Teil zugestellt, Rest nicht unterwegs und Frist nah → automatisches Anliegen Teillieferung',()=>{
 const {sim,s,c}=hub(),orders=arrived(sim,s,c),o=orders.reduce((a,b)=>b.qty>a.qty?b:a);
 o.due=s.t+2000;ok(sim,{type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty:5});
 run(sim,()=>o.delivered>0);assert.ok(o.delivered<o.qty);sim.step(1);
 assert.equal(tickets(s,o,'partial').length,0,'Frist noch fern');
 o.due=s.t+AUTO.partialLead;sim.step(1);
 const [t]=tickets(s,o,'partial');assert.ok(t,'Teillieferung angelegt');assert.equal(t.trigger,'partial');assert.equal(tickets(s,o,'status').length,0,'nach Teilzustellung keine Risiko-Statusanfrage');
 assert.equal(sim.command({type:'createTicket',orderId:o.id,kind:'partial'}).ok,false,'Teillieferung nur automatisch');
 assert.equal(sim.command({type:'respondTicket',id:t.id,response:'inform'}).ok,false);
 ok(sim,{type:'respondTicket',id:t.id,response:'apologize'});sim.step(20);assert.equal(t.status,'closed');assert.match(t.reply,/Teillieferung/);
 sim.step(200);assert.equal(tickets(s,o,'partial').length,1);validateState(s);
});

test('Vollständig unterwegs: keine Risiko-Statusanfrage; manuelles Ticket blockiert automatisches gleicher Art',()=>{
 const {sim,s,c}=hub(),orders=arrived(sim,s,c),[a,b]=orders;assert.ok(b,'Fixture: zwei Aufträge');
 ok(sim,{type:'createTicket',orderId:a.id,kind:'status'});a.due=s.t+30;sim.step(2);assert.equal(tickets(s,a,'status').length,1);assert.equal(tickets(s,a,'status')[0].source,'manual');
 // Gesamte offene Menge auf Lkw verladen (unterwegs) → drohende Verspätung wird nicht gemeldet.
 for(let i=0;i<4;i++){ok(sim,{type:'buyVehicle',vehicleType:'truck'});ok(sim,{type:'hire',role:'driver'});}
 const trucks=s.vehicles.filter(v=>v.type==='truck');let free=b.qty;
 for(const v of trucks){if(free<=0)break;const n=Math.min(80,free);ok(sim,{type:'dispatch',orderId:b.id,vehicleId:v.id,qty:n});free-=n;}
 assert.equal(free,0,'Fixture: Menge passt auf vier Lkw');b.due=s.t+30;sim.step(2);
 assert.equal(tickets(s,b,'status').length,0,'gesamte Menge unterwegs');
 validateState(s);
});

test('Antwortfrist: unbeantwortet abgelaufen senkt Zufriedenheit genau einmal; späte Antwort bleibt möglich',()=>{
 const {sim,s,c}=hub(),[o]=arrived(sim,s,c);
 o.due=s.t+30;sim.step(1);const [t]=tickets(s,o,'status');assert.ok(t);assert.equal(s.shippers,undefined,'Zufriedenheit erst bei Bedarf angelegt');
 run(sim,()=>s.t===t.respondBy);assert.equal(t.expired,undefined);
 sim.step(1);assert.equal(t.expired,true);
 // Jede abgelaufene Frist eines Vertragsauftrags zählt genau einmal (auch andere Aufträge desselben Versenders).
 const expired=()=>s.tickets.filter(x=>x.expired&&s.orders.find(y=>y.id===x.orderId).contractId===c.id).length;
 const r=s.shippers[c.shipper];assert.ok(r.ignored>=1);assert.equal(r.ignored,expired());
 const after=r.score;sim.step(300);
 assert.equal(s.shippers[c.shipper].ignored,expired(),'nicht erneut gezählt');
 validateState(s);
 ok(sim,{type:'respondTicket',id:t.id,response:'inform'});run(sim,()=>t.status==='closed');validateState(s);
 assert.ok(after<=SATISFACTION.start+SATISFACTION.ignored,'Score gesunken');
 // Import prüft Fristfelder.
 for(const mutate of [x=>{x.tickets[0].respondBy++;},x=>{x.tickets[0].expired=false;},x=>{x.tickets[0].trigger='partial';},x=>{x.shippers[c.shipper].score=101;},x=>{x.shippers[c.shipper].extra=1;}]){
  const state=JSON.parse(sim.serialize());mutate(state);assert.throws(()=>Simulation.fromJSON(JSON.stringify(state)));
 }
});

test('Aufträge ohne Versender: abgelaufene Antwortfrist senkt Ruf um 1, keine Versenderdaten',()=>{
 const {sim,s}=hub(),o=s.orders.find(x=>!x.contractId&&['offer','active'].includes(x.status));assert.ok(o,'Fixture: Auftrag ohne Vertrag');
 // Manuell angelegtes Ticket auf einem Nicht-Vertragsauftrag (Auftrag annehmen, falls Angebot).
 if(o.status==='offer')ok(sim,{type:'acceptOrder',id:o.id});
 o.due=s.t+100000;const {id}=ok(sim,{type:'createTicket',orderId:o.id,kind:'status'});const t=s.tickets.find(x=>x.id===id);
 const rep=s.reputation;sim.step(RESPONSE_MINUTES.status+1);assert.equal(t.expired,true);
 assert.ok(s.reputation<=rep-1+1e-9);assert.equal(s.shippers?.[o.customer],undefined);validateState(s);
});

test('Pünktlich erfüllter Vertragsauftrag hebt, verspäteter senkt die Zufriedenheit; Bewertung genau einmal',()=>{
 const {sim,s,c}=hub(),[o]=arrived(sim,s,c);
 o.due=s.t+100000;
 // Zustellung in Lieferwagenladungen (Kapazität 20), bis der Auftrag erfüllt ist.
 const snap=()=>({score:shipperScore(s,c.shipper),ignored:s.shippers?.[c.shipper]?.ignored??0});let before=snap();
 run(sim,()=>{if(o.rated)return true;before=snap();const n=Math.min(20,stock(s,o.id));if(n>0)sim.command({type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty:n});return false;},6000);
 assert.equal(o.status,'fulfilled');assert.equal(o.late,undefined);
 const r=s.shippers[c.shipper];assert.equal(r.onTime,1);
 // Im Bewertungsschritt: genau +onTime (zuzüglich etwaiger gleichzeitig abgelaufener Antwortfristen anderer Aufträge).
 assert.equal(r.score,Math.min(100,before.score+SATISFACTION.onTime+SATISFACTION.ignored*(r.ignored-before.ignored)));
 sim.step(5);assert.equal(s.shippers[c.shipper].onTime,1);
 // Verspätet erfüllter Auftrag (o.late durch economy) → late.
 const o2=s.orders.find(x=>x.contractId===c.id&&x.id!==o.id&&x.status==='active');o2.due=s.t;sim.step(2);assert.equal(o2.late,true);
 run(sim,()=>{if(o2.rated)return true;before=snap();const n=Math.min(20,stock(s,o2.id));if(n>0)sim.command({type:'dispatch',orderId:o2.id,vehicleId:s.vehicles[0].id,qty:n});return false;},8000);
 assert.equal(s.shippers[c.shipper].late,1);assert.ok(s.shippers[c.shipper].penalties>=1,'Verspätungsstrafen gezählt');
 const state=JSON.parse(sim.serialize());state.orders.find(x=>x.id===o.id).rated=false;assert.throws(()=>Simulation.fromJSON(JSON.stringify(state)));
 validateState(s);
});

/** Spiel ohne Vertragsaufträge; erzeugt reguläre Folgeangebote durch Ablehnen offener Angebote vor jedem Angebotsplatz. */
function offers(shippers,days=4,seed=11){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state,seen=[];
 if(shippers)s.shippers=JSON.parse(JSON.stringify(shippers));
 const end=480+days*1440;
 while(s.t<end){
  // Ältestes reguläres Angebot ablehnen, damit der Platz frei wird; die Liste bleibt nie leer (sonst entstünde ein Startangebot).
  if((s.t+1)%OFFER_INTERVAL===OFFER_PHASE){const open=s.contracts.filter(k=>k.status==='offer'&&k.unit!=='air'&&!k.content);if(open.length>=3)ok(sim,{type:'cancelContract',id:open[0].id});}
  sim.step(1);
  for(const k of s.contracts)if(k.status==='offer'&&k.offeredAt===s.t&&!seen.includes(k))seen.push(k);
 }
 return {sim,s,seen};
}
const record=score=>({score,onTime:0,late:0,penalties:0,ignored:0});
const SHIPPERS=['Kranichfeld Versandhaus','Lindenstein Online-Handel','Talbrück Modeversand','Sonnhalde Haushaltswaren','Eichenrode Buchversand','Mühlbach Elektroversand','Weidenau Spielwaren','Brunnhof Gartenversand'];

test('Angebotswirkung: Preisaufschlag/-abschlag nach Zufriedenheit, erst ab Spieltag 2, gemeinsamer Zufall unverändert',()=>{
 const base=offers(null),happy=offers(Object.fromEntries(SHIPPERS.map(n=>[n,record(100)]))),sad=offers(Object.fromEntries(SHIPPERS.map(n=>[n,record(0)])));
 assert.ok(base.seen.length>=4);assert.equal(happy.seen.length,base.seen.length);assert.equal(sad.seen.length,base.seen.length);
 assert.equal(happy.s.seed,base.s.seed,'api.random unberührt');assert.equal(sad.s.seed,base.s.seed);
 base.seen.forEach((k,i)=>{
  const h=happy.seen[i],d=sad.seen[i];assert.equal(h.shipper,k.shipper);assert.equal(d.shipper,k.shipper,'ohne zufriedenere Alternative kein Wechsel');
  if(k.offeredAt<SATISFACTION.effectFrom){assert.deepEqual(h,k,'vor Spieltag 2 identisch');assert.deepEqual(d,k);return;}
  assert.equal(h.priceAdjust,SATISFACTION.priceSpan);assert.equal(d.priceAdjust,-SATISFACTION.priceSpan);
  assert.equal(h.pricePerParcel,Math.round(k.pricePerParcel*(1+SATISFACTION.priceSpan)*100)/100);
  assert.equal(d.pricePerParcel,Math.round(k.pricePerParcel*(1-SATISFACTION.priceSpan)*100)/100);
  assert.equal(k.priceAdjust,undefined);
 });
 assert.ok(base.seen.some(k=>k.offeredAt<SATISFACTION.effectFrom)&&base.seen.some(k=>k.offeredAt>=SATISFACTION.effectFrom));
 validateState(happy.s);validateState(sad.s);
 const state=JSON.parse(happy.sim.serialize());state.contracts.find(k=>k.priceAdjust).priceAdjust=0.5;assert.throws(()=>Simulation.fromJSON(JSON.stringify(state)));
});

test('Angebotswirkung: unzufriedene Versender verzichten zugunsten zufriedener (eigener Zufall)',()=>{
 const fav='Weidenau Spielwaren',sh=Object.fromEntries(SHIPPERS.map(n=>[n,record(n===fav?100:0)]));
 const base=offers(null,8),moody=offers(sh,8);
 const late=list=>list.filter(k=>k.offeredAt>=SATISFACTION.effectFrom);
 const b=late(base.seen).filter(k=>k.shipper===fav).length,m=late(moody.seen).filter(k=>k.shipper===fav).length;
 assert.ok(m>b,`zufriedener Versender häufiger (${m} statt ${b})`);assert.ok(m>=late(moody.seen).length/3);
 assert.ok(moody.s.events.some(e=>e.kind==='contract'&&e.text.includes(`Angebot von ${fav} statt`)));
 assert.equal(moody.s.seed,base.s.seed);assert.equal(shipperScore(moody.s,fav),100);
 validateState(moody.s);
});

test('Kulanz auf automatische Beschwerde genau einmal, auch über Speichern/Laden; Zufriedenheit steigt einmal',()=>{
 let {sim,s,c}=hub(),[o]=arrived(sim,s,c);
 o.due=s.t;sim.step(1);const id=tickets(s,o,'complaint')[0].id;o.paid=400;
 ok(sim,{type:'respondTicket',id,response:'goodwill'});
 sim.step(10);sim=reload(sim);s=sim.state;
 run(sim,()=>s.tickets.find(t=>t.id===id).status==='closed');
 const score=s.shippers[c.shipper].score;
 sim=reload(sim);s=sim.state;sim.step(30);sim=reload(sim);s=sim.state;sim.step(30);
 const rows=s.ledger.filter(l=>l.key==='ticket-cost:'+id);assert.equal(rows.length,1);assert.equal(rows[0].amount,-20);
 assert.equal(s.tickets.find(t=>t.id===id).cost,20);
 assert.equal(s.tickets.find(t=>t.id===id).outcome,'goodwill');assert.ok(Number.isInteger(score));
 assert.equal(sim.command({type:'respondTicket',id,response:'goodwill'}).ok,false);
 validateState(s);
});

test('Speichern/Laden bitgleich mit Anliegen, Fristen und Zufriedenheit; Fortsetzung identisch',()=>{
 const {sim,s,c}=hub(5),orders=arrived(sim,s,c);
 orders[0].due=s.t+40;if(orders[1])orders[1].due=s.t+300;
 let a=sim;
 for(let i=0;i<6;i++){
  a.step(250);const raw=a.serialize(),b=Simulation.fromJSON(raw);assert.equal(b.serialize(),raw);
  a.step(97);b.step(97);assert.equal(b.serialize(),a.serialize());a=b;
 }
 assert.ok(a.state.tickets.length>=2);assert.ok(a.state.tickets.some(t=>t.expired));assert.ok(a.state.shippers&&a.state.shippers[c.shipper]);
 validateState(a.state);
});
