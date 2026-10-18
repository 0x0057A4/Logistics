// 0.15 S1 (A08): GuV, lineare Abschreibung, Anlagenspiegel, Abgang beim Abriss. Reine Auswertung ohne Geldbuchung.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {report,guv,assetRegister,periods,assetInfo,DEPRECIATION_DAYS} from '../dist/accounting.js';
import * as P from './perf-scenarios.mjs';
const DAY=1440;
const ok=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,r.message);return r;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.006,`${a} ≠ ${b}`);
const fresh=()=>new Simulation({mode:'sandbox',seed:5});

test('Abschreibung tagesgenau linear: Gebäude 180, Fahrzeug 90 Spieltage, kein Geldfluss',()=>{
 assert.deepEqual(DEPRECIATION_DAYS,{building:180,vehicle:90});
 const sim=fresh(),s=sim.state;const b=ok(sim,{type:'build',buildingType:'rack',x:10,y:6}).id,v=ok(sim,{type:'buyVehicle',vehicleType:'van'}).id;
 const rack=s.buildings.find(x=>x.id===b),van=s.vehicles.find(x=>x.id===v);
 assert.deepEqual([rack.acquiredAt,rack.cost,van.acquiredAt,van.cost],[480,1200,480,9000]);
 sim.step(DAY-1);
 assert.equal(guv(s).depreciation,0);assert.equal(assetRegister(s).total.bookValue,10200);
 const money=s.money,text=sim.serialize();sim.step(1);
 const day1=guv(s,{from:480,to:s.t});near(day1.depreciation,-(1200/180+9000/90));
 assert.equal(sim.serialize().includes('depreciation'),false,'keine gespeicherte Abschreibung');
 const reg=assetRegister(s);near(reg.rows.find(r=>r.assetId===b).accumulated,6.67);near(reg.rows.find(r=>r.assetId===v).bookValue,8900);
 assert.equal(report(Simulation.fromJSON(text).state).cash.balance,money,'Auswertung bucht kein Geld');
 // Volle Nutzungsdauer: Fahrzeug nach 90, Gebäude nach 180 Tagen bei Buchwert 0, nie negativ.
 for(let i=0;i<4;i++)sim.step(DAY*50);const end=assetRegister(s);assert.equal(end.total.bookValue,0);assert.equal(end.total.accumulated,10200);
 // Periodenadditivität: Summe der Tageszeiträume = Gesamtzeitraum.
 let total=0;for(let d=0;d*DAY+480<=s.t;d++)total+=guv(s,{from:480+d*DAY,to:Math.min(s.t,480+(d+1)*DAY-1)}).depreciation;
 near(total,guv(s).depreciation);near(guv(s).depreciation,-10200);
});

test('Abriss: Restbuchwert als Abgang (Ergebnis), Rückbauerlös als Geld, Abschreibung endet',()=>{
 const sim=fresh(),s=sim.state;const b=ok(sim,{type:'build',buildingType:'rack',x:10,y:6}).id;sim.step(2*DAY+30);
 const money=s.money;ok(sim,{type:'demolish',id:b});assert.equal(s.money,money+420,'nur Rückbauerlös bewegt Geld');
 const d=s.assetDisposals[0];assert.equal(d.assetId,b);near(d.depreciation,13.33);near(d.bookValue,1186.67);assert.equal(d.disposedAt,s.t);
 const g=guv(s);near(g.disposals,-1186.67);assert.equal(g.disposalProceeds,420);near(g.depreciation,-13.33);
 assert.equal(assetRegister(s).rows.length,0);assert.equal(assetRegister(s).disposals.length,1);
 sim.step(5*DAY);near(guv(s).depreciation,-13.33);
 assert.equal(guv(s,{from:s.t-DAY,to:s.t}).disposals,0,'Abgang nur im Abrisszeitraum');
 const loaded=Simulation.fromJSON(sim.serialize());assert.deepEqual(report(loaded.state),report(s));
 const bad=JSON.parse(sim.serialize());bad.assetDisposals[0].bookValue=5;assert.throws(()=>Simulation.fromJSON(JSON.stringify(bad)),/Anlagenabgang/);
});

test('Mietfahrzeug ist keine Anlage: Miete Aufwand, keine Abschreibung',()=>{
 const sim=fresh(),s=sim.state;const r=ok(sim,{type:'rentVehicle',vehicleType:'van'});sim.step(DAY);
 const v=s.vehicles.find(x=>x.id===r.vehicleId);assert.equal(v.cost,undefined);assert.equal(assetInfo(s,v,'vehicle'),null);
 const g=guv(s);assert.equal(g.depreciation,0);assert.ok(g.expenses.rent<=-360);assert.equal(assetRegister(s).rows.length,0);
 const bad=JSON.parse(sim.serialize());bad.vehicles[0].cost=9000;bad.vehicles[0].acquiredAt=480;assert.throws(()=>Simulation.fromJSON(JSON.stringify(bad)),/Mietfahrzeug/);
});

test('GuV-Summe = operativer Geldfluss − Abschreibung − Abgang + Rückbauerlös (Abstimmung, echte Szenarioläufe)',()=>{
 const sc=P.services();P.run(sc,600);const s=sc.sim.state;
 const id=s.buildings.find(b=>b.type==='workshop'&&!b.maintenanceTask&&!b.serviceJob)?.id;ok(sc.sim,{type:'demolish',id});
 sc.sim.step(DAY*2);
 const before=sc.sim.serialize(),r=report(s),g=r.guv;assert.equal(sc.sim.serialize(),before,'rein');
 near(g.reconciliation.cashOperating,r.cashflow.operating+r.cashflow.other);
 near(g.result,g.reconciliation.result);
 near(g.result,r.cash.net-r.cashflow.investing-r.cashflow.financing+g.depreciation+g.disposals+g.disposalProceeds);
 const lines=g.revenue.delivery+g.revenue.handling+g.revenue.air+Object.values(g.expenses).reduce((n,x)=>n+x,0);
 near(g.ebitda,lines);near(g.ebit,g.ebitda+g.depreciation+g.disposals+g.disposalProceeds);near(g.result,g.ebit+g.interest);
 assert.ok(g.revenue.total>0&&g.expenses.personnel<0&&g.expenses.energy<0&&g.depreciation<0&&g.disposals<0&&g.disposalProceeds>0);
 // Zeiträume heute/7 Tage/gesamt; deterministisch bei gleichem Stand.
 const p=periods(s);assert.deepEqual(report(JSON.parse(before),p.week),report(s,p.week));
 assert.ok(guv(s,p.today).depreciation>=guv(s,p.week).depreciation&&guv(s,p.week).depreciation>=guv(s,p.total).depreciation);
});

test('Altstand ohne Anlagenfelder: Ledger-Ableitung, sonst Spielbeginn und Katalogpreis; Laden unverändert',()=>{
 const sim=fresh();sim.step(100);const b=ok(sim,{type:'build',buildingType:'dock',x:10,y:6}).id,v=ok(sim,{type:'buyVehicle',vehicleType:'truck'}).id;
 const old=JSON.parse(sim.serialize());for(const x of [...old.buildings,...old.vehicles]){delete x.acquiredAt;delete x.cost;}
 const text=JSON.stringify(old),loaded=Simulation.fromJSON(text),s=loaded.state;
 assert.equal(loaded.serialize(),text,'Laden schreibt keine Felder nach');
 const reg=assetRegister(s);
 assert.deepEqual(reg.rows.map(r=>[r.assetId,r.acquiredAt,r.cost,r.source]),[[b,580,3500,'ledger'],[v,580,28000,'ledger']]);
 const noLedger=JSON.parse(text);noLedger.ledger=noLedger.ledger.filter(l=>!/^(build|vehicle):/.test(l.key));
 assert.deepEqual(assetRegister(noLedger).rows.map(r=>[r.acquiredAt,r.cost,r.source]),[[480,3500,'fallback'],[480,28000,'fallback']]);
 // Abriss eines Altgebäudes nutzt dieselbe Ableitung.
 loaded.step(DAY);ok(loaded,{type:'demolish',id:b});near(s.assetDisposals[0].bookValue,3500-3500/180);assert.equal(s.assetDisposals[0].source,'ledger');validateState(s);
});

test('Validierung neuer Felder und Speichern/Laden während Abschreibung',()=>{
 const sim=fresh();ok(sim,{type:'build',buildingType:'rack',x:10,y:6});ok(sim,{type:'buyVehicle',vehicleType:'van'});sim.step(3*DAY+7);
 const text=sim.serialize(),again=Simulation.fromJSON(text);assert.deepEqual(report(again.state),report(sim.state));
 again.step(DAY);sim.step(DAY);assert.equal(again.serialize(),sim.serialize());
 for(const mutate of [d=>{d.buildings[0].acquiredAt=d.t+1;},d=>{d.vehicles[0].cost=-1;},d=>{delete d.buildings[0].cost;},d=>{d.assetDisposals=[{assetId:d.buildings[0].id,kind:'building',acquiredAt:480,disposedAt:500,cost:1,depreciation:0,bookValue:1}];}]){
  const d=JSON.parse(text);mutate(d);assert.throws(()=>Simulation.fromJSON(JSON.stringify(d)),/Anlage/);
 }
});
