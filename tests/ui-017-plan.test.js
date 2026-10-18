// 0.17 A06/A08/A10-P: Belegungsplan, Liquidität heute, Kundendienst-/Rücklauf-Board. Reine Lesesichten auf echte Spielstände.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {onShift} from '../dist/workforce.js';
import {shiftSegments,scheduleRows,coverageGaps,renderSchedule,scheduleClick,scheduleChange,workplace,DAY} from '../dist/ui-schedule.js';
import {dayCash,ledgerDay,renderDayCash,boardCards,boardColumns,renderBoard,boardClick,RETURN_STATUS} from '../dist/ui-board.js';
import {lampGame,lampOffers} from './fertigung-fixture.mjs';
import {boot} from './ui-harness.js';

const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,c.type+': '+r.message);return r;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.005,`${a} ≠ ${b}`);

test('Schicht über Mitternacht: Nachtschicht am Tagesrand geteilt, Abschnitte exakt wie onShift',()=>{
 for(const day of [0,3]){
  const night=shiftSegments({shift:'night'},day);
  assert.deepEqual(night,[{from:0,to:480,fromPrev:true,toNext:false},{from:960,to:1440,fromPrev:false,toNext:true}]);
  assert.deepEqual(shiftSegments({shift:'day'},day),[{from:480,to:960,fromPrev:false,toNext:false}]);
  assert.deepEqual(shiftSegments({shift:'all'},day),[{from:0,to:1440,fromPrev:true,toNext:true}]);
  assert.deepEqual(shiftSegments({},day),shiftSegments({shift:'day'},day),'fehlende Schicht wie onShift = Tagschicht');
  for(const shift of ['day','night','all'])for(let m=0;m<DAY;m+=7){
   const inSeg=shiftSegments({shift},day).some(x=>m>=x.from&&m<x.to);assert.equal(inSeg,onShift({shift},day*DAY+m),`${shift} ${m}`);
  }
 }
 const sim=new Simulation({mode:'sandbox',seed:5}),s=sim.state;
 const id=cmd(sim,{type:'hire',role:'warehouse'}).id;cmd(sim,{type:'setShift',id,shift:'night'});
 sim.step(1440-s.t+120); // Tag 2, 02:00 → Nachtschicht vom Vortag läuft
 const [row]=scheduleRows(s,Math.floor(s.t/DAY),{site:'all'});
 assert.equal(row.planned,true);assert.equal(row.segments.length,2);assert.equal(row.segments[0].fromPrev,true);assert.equal(row.segments[1].toNext,true);
 const html=renderSchedule(s,{dayOffset:0,site:'all',role:'all',act:'all',shift:'*',q:''});
 assert.match(html,/sched-bar shift-night from-prev/);assert.match(html,/sched-bar shift-night to-next/);
 assert.match(html,/beginnt am Vortag 16:00/);assert.match(html,/läuft bis 08:00 Folgetag/);
 assert.match(html,/class="sched-now" style="left:8.33%"/,'Zeitlinie 02:00');
 assert.match(html,/Plan: im Dienst/);
 // Folgetag: nur Plan, keine Zeitlinie; Tagwahl ist reine Ansicht (keine Simulation).
 const t=s.t,next=renderSchedule(s,{dayOffset:1,site:'all',role:'all',act:'all',shift:'*',q:''});assert.doesNotMatch(next,/class="sched-now"/);assert.equal(s.t,t);
 assert.match(next,/Spieltag 3/);
});

test('Pausen, Fortbildung und Versetzung aus echten Restzählern; Filter Standort/Tätigkeit/Schicht; Plan vs. Ist',()=>{
 const sim=new Simulation({mode:'sandbox',seed:9}),s=sim.state;
 const a=cmd(sim,{type:'hire',role:'warehouse'}).id,b=cmd(sim,{type:'hire',role:'service'}).id,c=cmd(sim,{type:'hire',role:'driver'}).id;
 sim.step(60); // 09:00
 const wa=s.workers.find(w=>w.id===a);wa.fatigue=80;sim.step(1); // Pflichtpause der Simulation
 assert.ok(wa.breakRemaining>0);
 cmd(sim,{type:'train',id:b});
 const day=Math.floor(s.t/DAY),rows=scheduleRows(s,day,{site:'all'}),ra=rows.find(r=>r.id===a),rb=rows.find(r=>r.id===b),rc=rows.find(r=>r.id===c);
 assert.equal(ra.activity.cls,'break');assert.equal(ra.marks[0].kind,'break');
 assert.equal(ra.marks[0].from,s.t-day*DAY);assert.equal(ra.marks[0].to,s.t-day*DAY+wa.breakRemaining,'Pause endet nach Restminuten (in der Schicht)');
 assert.equal(rb.activity.cls,'training');assert.equal(rb.marks[0].kind,'training');assert.equal(rb.marks[0].to-rb.marks[0].from,90);
 assert.equal(rc.activity.cls,'idle');assert.match(rc.activity.text,/nicht zugeordnet/);assert.equal(rc.marks.length,0);
 // Fortbildung über Schichtende hinaus: zählt nur Schichtminuten → Markierung endet am Schichtende (16:00) und am Tagesende geklemmt.
 const late=new Simulation({mode:'sandbox',seed:9});const w=cmd(late,{type:'hire',role:'warehouse'}).id;late.step(7*60);cmd(late,{type:'train',id:w}); // 15:00
 const [lr]=scheduleRows(late.state,0,{site:'all'});assert.equal(lr.marks[0].to,DAY,'Rest läuft am Folgetag weiter, Balken bis Tagesende');
 // Filter
 assert.deepEqual(scheduleRows(s,day,{site:'all',act:'break'}).map(r=>r.id),[a]);
 assert.deepEqual(scheduleRows(s,day,{site:'all',role:'driver'}).map(r=>r.id),[c]);
 cmd(sim,{type:'setShift',id:c,shift:'night'});
 assert.deepEqual(scheduleRows(s,day,{site:'all',shift:'night'}).map(r=>r.id),[c]);
 assert.equal(scheduleRows(s,day,{site:'all',shift:'night'})[0].planned,false,'Nachtschicht um 09:00 nicht im Dienst');
 assert.equal(scheduleRows(s,day,{site:'site-x'}).length,0);
 assert.deepEqual(scheduleRows(s,day,{site:'all',q:'kundenservice'}).map(r=>r.id),[b]);
 // Ansichtsereignisse ändern nur den Ansichtszustand
 const view={dayOffset:0,site:'all',role:'all',act:'all',shift:'*',q:''};
 assert.equal(scheduleChange({dataset:{schedFilter:'act'},value:'training'},view),true);assert.equal(view.act,'training');
 assert.deepEqual(scheduleClick({dataset:{schedDay:'1'}},view),{render:true});assert.equal(view.dayOffset,1);
 assert.equal(scheduleClick({dataset:{schedDay:'7'}},view),null,'kein Zeitsprung über ±1 Tag hinaus');
 assert.deepEqual(scheduleClick({dataset:{schedWorker:a}},view),{worker:a});
 // Versetzung: 30 Minuten Wandzeit, Person erscheint auch im Filter des Zielstandorts
 const B=cmd(sim,{type:'buySite',name:'Zweitstandort Test'}).id;cmd(sim,{type:'moveWorker',id:c,toSite:B});
 const rr=scheduleRows(s,day,{site:B});assert.deepEqual(rr.map(r=>r.id),[c]);assert.equal(rr[0].activity.cls,'relocation');
 assert.equal(rr[0].marks[0].kind,'relocation');assert.equal(rr[0].marks[0].to-rr[0].marks[0].from,30);
 validateState(s);
});

test('Arbeitsplatz aus Aufgabenschlüssel; Unbesetzt nur aus Ankunftsplan aktiver Verträge',()=>{
 const sim=new Simulation({mode:'sandbox',seed:13}),s=sim.state;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});const dock=s.buildings.at(-1);
 const id=cmd(sim,{type:'hire',role:'warehouse'}).id,w=s.workers.find(x=>x.id===id);
 // Attrappe nur für die Lesesicht: Rampe mit Aufgabe, Person gebunden (wie transport.js: dock.task = Sendung, Person `${id}:warehouse`).
 const view={...s,buildings:s.buildings.map(b=>b.id===dock.id?{...b,task:'shipment-x'}:b),workers:[{...w,task:'shipment-x:warehouse'}]};
 assert.deepEqual(workplace(view,view.workers[0]),{buildingId:dock.id,text:'Laderampe 1'});
 assert.deepEqual(workplace(view,{...w,task:null}),null);
 const labelled={...view,buildings:view.buildings.map(b=>b.id===dock.id?{...b,label:'Rampe Nord'}:b)};
 assert.equal(workplace(labelled,view.workers[0]).text,'Rampe Nord','eigener Anlagenname (0.17 Umbenennen) hat Vorrang');
 // Kein Vertrag → keine erfundenen Lücken
 assert.deepEqual(coverageGaps(s,0),[]);
 const k={id:'contract-t',status:'active',site:'site-1',shipper:'Versender Test',arrivals:[{minute:510,parcels:40},{minute:1000,parcels:20}],startT:0,endT:5*DAY};
 const st={...s,contracts:[k]};
 assert.deepEqual(coverageGaps(st,1).map(g=>g.minute),[1000],'Tagschicht deckt 08:30, nicht 16:40');
 const night={...st,workers:[...s.workers,{id:'w-n',role:'forklift',site:'site-1',shift:'night'}]};
 assert.deepEqual(coverageGaps(night,1),[],'Staplerfahrer in Nachtschicht deckt 16:40');
 assert.deepEqual(coverageGaps({...st,contracts:[{...k,startT:3*DAY}]},1),[],'Vertrag noch nicht gestartet');
 assert.match(renderSchedule(st,{dayOffset:0,site:'site-1',role:'all',act:'all',shift:'*',q:''}),/Unbesetzt laut Ankunftsplan/);
 assert.match(renderSchedule({...s,workers:[]},{dayOffset:0,site:'all',role:'all',act:'all',shift:'*',q:''}),/Nicht geplant/);
});

test('Liquidität heute stimmt mit gebuchten Zahlungen überein; Kredit separat, nicht als Einnahme',()=>{
 const sim=new Simulation({mode:'sandbox',seed:21}),s=sim.state,m0=s.money;
 assert.deepEqual([dayCash(s).inflow,dayCash(s).outflow,dayCash(s).net],[0,0,0]);
 cmd(sim,{type:'takeLoan',amount:5000});
 cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 const id=cmd(sim,{type:'hire',role:'warehouse'}).id;cmd(sim,{type:'setShift',id,shift:'all'});
 sim.step(200); // Lohn-Sammelbuchung des Tages wächst
 cmd(sim,{type:'repayLoan',amount:1000});
 let d=dayCash(s);
 assert.equal(d.day,0);near(d.financing.loanIn,5000);near(d.financing.repayment,1000);
 assert.equal(d.inflow,0,'Kreditauszahlung ist keine Einnahme');
 const ops=s.ledger.filter(l=>!['Kredit','Tilgung'].includes(l.category));
 near(d.outflow,-ops.reduce((n,l)=>n+Math.min(0,l.amount),0));near(d.net,d.inflow-d.outflow);
 near(d.accountChange,s.money-m0);near(d.net+d.financing.loanIn-d.financing.repayment,d.accountChange);
 near(d.openingBalance,m0);
 // Tageswechsel: neuer Tag beginnt bei 0, Vortag bleibt abstimmbar; Sammelbuchung zählt am Tag ihres Schlüssels.
 sim.step(DAY-s.t%DAY+90);d=dayCash(s);
 assert.equal(d.day,1);near(d.financing.loanIn,0);
 const rows1=s.ledger.filter(l=>ledgerDay(l)===1);assert.ok(rows1.some(l=>/^wage:.*:day:1$/.test(l.key)));
 near(d.accountChange,rows1.reduce((n,l)=>n+l.amount,0));
 near(dayCash(s,0).accountChange+d.accountChange,s.money-m0);
 const html=renderDayCash(s);
 for(const t of ['Heute eingenommen','Heute ausgegeben','Saldo heute','Zahlungseingänge minus Zahlungsausgänge'])assert.ok(html.includes(t),t);
 assert.match(html,/Saldo heute<\/small><b>−/,'negativer Saldo mit Vorzeichen');assert.match(html,/Fehlbetrag/);
 // Vortag mit Kredit: Finanzierung separat benannt
 const sim2=new Simulation({mode:'sandbox',seed:2});cmd(sim2,{type:'takeLoan',amount:300});const h2=renderDayCash(sim2.state);
 assert.match(h2,/Kreditauszahlung \+300,00 € – kein Erlös/);assert.match(h2,/Saldo heute<\/small><b>±0,00 €/);assert.match(h2,/ausgeglichen/);
 // Umsatz zählt erst als Zahlung: positive Zeile → eingenommen, Überschuss mit +
 const paid={...sim2.state,ledger:[...sim2.state.ledger,{id:'l-x',key:'payment:x',t:sim2.state.t,amount:120,category:'Umsatz'}]};
 assert.equal(dayCash(paid).inflow,120);assert.match(renderDayCash(paid),/Saldo heute<\/small><b>\+120,00 €/);
});

function ticketSetup(){const sim=lampGame({mode:'sandbox',seed:31});const o=lampOffers(sim)[0];cmd(sim,{type:'acceptOrder',id:o.id});const w=cmd(sim,{type:'hire',role:'service'}).id;return {sim,o,w};}
const colOf=(s,id)=>boardCards(s).find(c=>c.id===id)?.col;
test('Board: Anliegen wechselt die Spalte nur nach echter Bearbeitung durch Personal',()=>{
 const {sim,o,w}=ticketSetup(),s=sim.state;
 const id=cmd(sim,{type:'createTicket',orderId:o.id,kind:'status'}).id;
 assert.equal(colOf(s,id),'open');let c=boardCards(s).find(x=>x.id===id);
 assert.match(c.next,/Status mitteilen/);assert.match(c.deadline,/Antwort bis \d\d:\d\d · noch 4 Std\. 00 Min\./);assert.equal(c.customer,o.customer);
 cmd(sim,{type:'setShift',id:w,shift:'night'}); // keine Kraft im Dienst
 cmd(sim,{type:'respondTicket',id,response:'inform'});
 assert.equal(colOf(s,id),'work');sim.step(5);c=boardCards(s).find(x=>x.id===id);
 assert.equal(c.col,'work');assert.match(c.sub,/Wartet: Kundendienstpersonal/);assert.match(c.next,/Kundendienstkraft/);
 cmd(sim,{type:'setShift',id:w,shift:'day'});sim.step(14);assert.equal(colOf(s,id),'work','Abschluss erst nach 15 Arbeitsminuten');
 sim.step(1);assert.equal(s.tickets.find(t=>t.id===id).status,'closed');assert.equal(colOf(s,id),'done');
 const cols=boardColumns(s,{});assert.deepEqual([cols.open.length,cols.work.length,cols.done.length],[0,0,1]);
 const html=renderBoard(s,{type:'all',site:'all',prio:'all',q:'',sel:null},{detail:()=>'DETAIL'});
 assert.match(html,/Offen <span class="bcount">0<\/span>/);assert.match(html,/Abgeschlossen <span class="bcount">1<\/span>/);assert.match(html,/DETAIL/);
 assert.equal(renderBoard(s,{type:'return',site:'all',prio:'all',q:'',sel:null}).match(/class="bcard /g),null,'Filter Art');
 assert.equal(boardColumns(s,{q:'nichtvorhanden'}).done.length,0,'Suche');
 const view={sel:null};assert.equal(boardClick({dataset:{boardCard:id},getAttribute:()=>'false'},view),true);assert.equal(view.sel,id);
 assert.equal(boardClick({dataset:{boardCard:id},getAttribute:()=>'true'},view),true);assert.equal(view.sel,'');
 validateState(s);
});

test('Board: Rücklaufstatus → Spalten; Abschluss nur repariert/verwertet, Entscheidung bleibt in Bearbeitung',()=>{
 assert.deepEqual(Object.entries(RETURN_STATUS).filter(([,v])=>v.col==='done').map(([k])=>k),['repaired','recycled']);
 assert.equal(RETURN_STATUS.scheduled.col,'open');assert.match(RETURN_STATUS.collecting.sub,/Wartet auf Rücksendung/);
 assert.equal(RETURN_STATUS.decision.col,'work');assert.equal(RETURN_STATUS.inspection.col,'work');
 // Lesesicht einer Retoure (Attrappe der Statusfelder auf echtem Auftrag; Zustand bleibt unverändert)
 const {sim,o}=ticketSetup(),s=sim.state,base={id:'return-x',orderId:o.id,item:o.item,qty:2,site:s.selectedSite,remaining:6,refund:40,refunded:false,createdAt:s.t,blocked:null};
 const card=r=>boardCards({...s,tickets:[],returns:[{...base,...r}]})[0];
 assert.equal(card({status:'inspection'}).col,'work');assert.match(card({status:'inspection'}).next,/noch 6 Min\./);
 const dec=card({status:'decision',remaining:0,refunded:true});assert.equal(dec.col,'work');assert.equal(dec.attention,true);assert.match(dec.next,/Reparieren oder Verwerten/);
 const blk=card({status:'unloading',blocked:'Freie Laderampe fehlt'});assert.match(blk.next,/Blockiert: Freie Laderampe fehlt/);assert.equal(blk.priority,'blockiert');
 assert.equal(card({status:'repaired',remaining:0,completedAt:s.t}).col,'done');
 assert.equal(s.returns.length,0);
});

test('Oberfläche: Personalfenster mit Plan, Finanzfenster mit drei Tageswerten, Kundendienst als Board',async()=>{
 const ui=await boot();await ui.click('start');
 ui.run("sim.command({type:'hire',role:'warehouse'});openPanel('staff')");let h=ui.nodes.get('#panelBody').innerHTML;
 assert.match(h,/Belegungsplan/);assert.match(h,/data-sched-worker="worker-/);assert.match(h,/class="sched-now"/);assert.match(h,/data-form="hire"/);
 ui.run("openPanel('finance')");h=ui.nodes.get('#panelBody').innerHTML;
 for(const t of ['Heute eingenommen','Heute ausgegeben','Saldo heute','Zahlungsströme nach Bereich'])assert.ok(h.includes(t),t);
 ui.run("openPanel('service')");h=ui.nodes.get('#panelBody').innerHTML;
 for(const t of ['Offen <span class="bcount">','In Bearbeitung <span class="bcount">','Abgeschlossen <span class="bcount">','data-board-filter="type"','data-board-search','data-form="ticket"','data-form="return"'])assert.ok(h.includes(t),t);
});
