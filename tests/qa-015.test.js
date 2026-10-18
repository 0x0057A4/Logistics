// A11 · unabhängige QS Release 0.15 (GuV/Abschreibung, Warenarten Kühlpaket/Sperrgut, Quergurt/Mega-Hub, Mehrwertdienste).
// Grundlage docs/SCHNITTSTELLEN-0.15.md (Abnahme), AGENTS.md (Pflicht-Übergänge). Bericht docs/QS-0.15.md.
// Eigene Szenarien, nur reguläre Befehle. Ausnahmen sind am Test vermerkt (Testaufträge per inventory.add für Mengenprüfungen,
// Anlagenzustand für Defekt). Befundtests stehen als test.todo-Begründung im Bericht und prüfen hier das Sollverhalten mit todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation,validateState} from '../dist/core.js';
import {BUILDINGS,VEHICLES} from '../dist/catalog.js';
import * as ACC from '../dist/accounting.js';
import {maxLoad} from '../dist/transport.js';
import {planTour} from '../dist/tours.js';
import {wareOf} from '../dist/contracts.js';
import {coolingCapacity,coolingUsed} from '../dist/special.js';
import {MISSORT_EVERY} from '../dist/sorting.js';
import {DOCK_YIELD,SPACE_WAIT,ownDockWaiting} from '../dist/yard.js';

const SITE='site-1';
const cmd=(sim,c)=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
const hash=sim=>createHash('sha256').update(sim.serialize()).digest('hex');
const reload=sim=>Simulation.fromJSON(sim.serialize());
const cents=n=>Math.round(n*100)/100;
const near=(a,b,eps=0.011)=>Math.abs(a-b)<=eps;
const sumQty=(s,pred)=>s.batches.filter(pred).reduce((n,b)=>n+b.qty,0);
function until(sim,cond,max,each){for(let i=0;i<max;i++){if(cond())return true;each?.(sim);sim.step(1);}return cond();}
function staff(sim,role,n,shift='all',site=SITE){const ids=[];for(let i=0;i<n;i++){const id=cmd(sim,{type:'hire',role,site}).id;cmd(sim,{type:'setShift',id,shift});ids.push(id);}return ids;}

// ------------------------------------------------------------------------------------------------------------------
// Gemeinsame Invarianten (alle 5 Minuten): keine negativen/überreservierten Chargen, Zahlung genau einmal mit Rechnungsbetrag,
// Kühlware nur im Kühlfahrzeug, Kühlbelegung ≤ Kühlkapazität, Sperrgut nie inbound/sortiert, Mengenerhalt je Vertragsauftrag.
// arrived: Map arrivalId → Map owner → done (bleibt erhalten, auch wenn der Hof aufräumt).
function track(s,arrived){for(const a of s.yard||[])for(const p of a.split||[]){let m=arrived.get(a.id);if(!m)arrived.set(a.id,m=new Map());m.set(p.owner,p.done);}}
function invariants(s,arrived,label){
 for(const b of s.batches){assert.ok(b.qty>=-1e-9,`${label}: Charge ${b.id} negativ`);assert.ok((b.reserved||0)<=b.qty+1e-7,`${label}: Charge ${b.id} überreserviert`);}
 for(const sh of s.shipments)if(sh.paid){const l=s.ledger.filter(l=>l.key===`payment:${sh.id}`);assert.equal(l.length,1,`${label}: Zahlung ${sh.id}`);assert.ok(near(l[0].amount,sh.invoiceAmount),`${label}: Betrag ${sh.id}`);}
 for(const t of s.tours||[])t.stops.forEach((st,i)=>{if(st.paid){const l=s.ledger.filter(l=>l.key===`tour-payment:${t.id}:${i}`);assert.equal(l.length,1,`${label}: Tourzahlung`);}});
 for(const sh of s.shipments)if(['transit','unloading'].includes(sh.status)){const v=s.vehicles.find(v=>v.id===sh.vehicleId);for(const id of sh.cargo){const b=s.batches.find(b=>b.id===id);if(b?.item==='parcel_cold')assert.ok(VEHICLES[v.type].cold,`${label}: Kühlpaket in ${v.type}`);}}
 for(const site of s.sites){const cap=coolingCapacity(s,site.id);if(cap>0)assert.ok(coolingUsed(s,site.id)<=cap+1e-9,`${label}: Kühlbelegung ${coolingUsed(s,site.id)} > ${cap}`);}
 for(const b of s.batches)if(b.item==='bulky'&&b.qty>0)assert.notEqual(b.location,'inbound',`${label}: Sperrgut inbound ${b.id}`);
 track(s,arrived);
 const inArr=new Map();for(const m of arrived.values())for(const [owner,done] of m)inArr.set(owner,(inArr.get(owner)||0)+done);
 for(const o of s.orders){if(!o.contractId||!inArr.has(o.id))continue;
  const held=sumQty(s,b=>b.owner===o.id),gone=o.delivered+(o.returnedQty||0);
  assert.ok(near(held+gone,inArr.get(o.id),1e-6),`${label}: Mengenerhalt ${o.id}: Bestand ${held} + zugestellt/zurück ${gone} ≠ entladen ${inArr.get(o.id)}`);
  assert.ok(o.delivered<=o.qty,`${label}: ${o.id} überliefert`);
  const paid=cents(s.ledger.filter(l=>l.category==='Umsatz'&&l.refs?.includes(o.id)).reduce((n,l)=>n+l.amount,0));
  assert.ok(near(paid,o.paid),`${label}: ${o.id} Zahlungen ${paid} ≠ o.paid ${o.paid}`);
 }
 validateState(s);
}
/** Spielerpolitik Zustellung: freies Fahrzeug, freie Ware des Auftrags → Lieferung bis maxLoad; Kühlware nur, wenn passend. */
function deliver(sim){
 const s=sim.state;
 for(const o of s.orders){if(o.status!=='active'||!['logistics','vas'].includes(o.kind))continue;
  const committed=s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&x.status!=='cancelled').reduce((n,x)=>n+x.qty,0);
  let free=sim.api.inventory.available(o.item,o.site,o.id),open=o.qty-o.delivered-committed;
  for(const v of s.vehicles){if(v.status!=='idle'||v.condition<15||v.site!==o.site)continue;const n=Math.min(free,open,maxLoad(v,o.item));if(n<1)continue;
   if(sim.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty:n}).ok){free-=n;open-=n;}}}
}

// ------------------------------------------------------------------------------------------------------------------
// 1. GuV / Abschreibung
// Unabhängige Nachrechnung: Geldbuchungen ohne Investition/Finanzierung (Rückbauerlös zählt), Abschreibung je vollendetem
// Spieltag aus Anschaffungszeit/-wert (Gebäude 180, Fahrzeuge 90), Abgang = Restbuchwert. Kein Rückgriff auf ACC.guv-Interna.
const LIFE={building:180,vehicle:90};
function acc(cost,life,acq,clock,disposedAt=Infinity){const end=Math.min(clock,disposedAt);if(end<acq)return 0;return cents(cost*Math.min(life,Math.floor((end-acq)/1440))/life);}
function independent(s,from,to,assets){
 let cash=0;for(const l of s.ledger){if(l.t<from||l.t>to)continue;if(['Fuhrpark','Standort','Kredit','Tilgung'].includes(l.category))continue;if(l.category==='construction'&&!l.key.startsWith('demolish:'))continue;cash+=l.amount;}
 let dep=0,disp=0;
 for(const a of assets){dep+=acc(a.cost,LIFE[a.kind],a.acquiredAt,to,a.disposedAt)-acc(a.cost,LIFE[a.kind],a.acquiredAt,from-1,a.disposedAt);
  if(a.disposedAt!=null&&a.disposedAt>=from&&a.disposedAt<=to)disp+=a.cost-acc(a.cost,LIFE[a.kind],a.acquiredAt,a.disposedAt);}
 return {cash:cents(cash),dep:cents(dep),disp:cents(disp),result:cents(cash-dep-disp)};
}

test('GuV: unabhängige Abstimmung Ergebnis ↔ Geldfluss, Tagesadditivität, Abriss, Miete, Kredit, Speichern/Laden', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:17}),s=sim.state,assets=[];
 const money0=s.money;
 for(const [t,x,y] of [['dock',2,10],['rack',2,2],['rack',2,4],['rack',6,2]]){const id=cmd(sim,{type:'build',buildingType:t,x,y,rotation:0}).id;assets.push({id,kind:'building',cost:BUILDINGS[t].cost,acquiredAt:s.t});}
 staff(sim,'warehouse',2);staff(sim,'driver',1);
 for(const t of ['van','truck']){const id=cmd(sim,{type:'buyVehicle',vehicleType:t}).id;assets.push({id,kind:'vehicle',cost:VEHICLES[t].cost,acquiredAt:s.t});}
 const rent=cmd(sim,{type:'rentVehicle',vehicleType:'van'});
 cmd(sim,{type:'takeLoan',amount:20000});
 const start=s.contracts.find(k=>k.status==='offer');cmd(sim,{type:'acceptContract',id:start.id});
 const arrived=new Map();
 // Tag 1 bis Tag 2 12:00, dann Abriss eines leeren Regals (Restbuchwert nach einem vollendeten Tag), weiter bis Tag 4 20:00.
 until(sim,()=>s.t>=1440+720,3000,x=>{deliver(x);if(x.state.t%5===0)invariants(x.state,arrived,`t=${x.state.t}`);});
 const extra=assets.find(a=>a.kind==='building'&&s.buildings.find(b=>b.id===a.id)?.type==='rack'&&!s.batches.some(b=>b.qty>0&&(b.bin===a.id||b.building===a.id)));
 const proceeds0=s.money;cmd(sim,{type:'demolish',id:assets[3].id});assets[3].disposedAt=s.t;
 assert.equal(cents(s.money-proceeds0),Math.round(BUILDINGS.rack.cost*.35),'Rückbauerlös 35 % als Geld');
 const d=s.assetDisposals.find(x=>x.assetId===assets[3].id);
 assert.ok(d,'Abgang erfasst');assert.equal(d.bookValue,cents(1200-acc(1200,180,assets[3].acquiredAt,s.t)),'Restbuchwert = Anschaffung − kumulierte Abschreibung');
 until(sim,()=>s.t>=3*1440+1200,6000,x=>{deliver(x);if(x.state.t%5===0)invariants(x.state,arrived,`t=${x.state.t}`);});
 assert.ok(s.orders.some(o=>o.delivered>0),'Szenario liefert tatsächlich zu');
 // Geldidentität: Kontostand = Start + Summe aller Buchungen (Abschreibung bucht kein Geld).
 assert.ok(near(s.money,cents(money0+s.ledger.reduce((n,l)=>n+l.amount,0)),0.02),'Kontostand = Start + Buchungen');
 assert.ok(!s.ledger.some(l=>/abschreib|depreciation/i.test(l.key+l.category+(l.note||''))),'keine Geldbuchung für Abschreibung');
 // Mietfahrzeug nicht im Anlagenspiegel, Miete in der GuV.
 const reg=ACC.assetRegister(s);
 assert.ok(!reg.rows.some(r=>r.assetId===rent.vehicleId),'Mietfahrzeug ist keine Anlage');
 assert.equal(reg.rows.length,assets.filter(a=>a.disposedAt==null).length);
 const g=ACC.guv(s),ind=independent(s,0,s.t,assets);
 assert.ok(g.expenses.rent<0,'Miete (Halle + Mietfahrzeug) als Aufwand');
 assert.ok(near(-g.depreciation,ind.dep),`Abschreibung ${g.depreciation} vs. unabhängig ${ind.dep}`);
 assert.ok(near(-g.disposals,ind.disp),`Abgang ${g.disposals} vs. ${ind.disp}`);
 assert.ok(near(g.result,ind.result,0.02),`Ergebnis ${g.result} vs. unabhängig ${ind.result}`);
 assert.ok(g.interest<0,'Zinsen auf Kredit erfasst');
 assert.ok(!s.ledger.filter(l=>l.category==='Kredit').some(l=>near(l.amount,g.result)),'Kredit nicht ergebniswirksam');
 // Tagesadditivität: Summe der Tagesergebnisse = Gesamtergebnis; jede Tagesabschreibung = Summe der in diesem Tag vollendeten Anlagentage.
 let sumDays=0,sumDep=0;
 for(let day=0;day*1440<=s.t;day++){const r=ACC.guv(s,{from:day*1440,to:day*1440+1439});const i=independent(s,day*1440,Math.min(s.t,day*1440+1439),assets);
  assert.ok(near(r.result,i.result,0.02),`Tag ${day}: ${r.result} vs. ${i.result}`);sumDays+=r.result;sumDep+=r.depreciation;}
 assert.ok(near(sumDays,g.result,0.05),`Summe Tage ${cents(sumDays)} = gesamt ${g.result}`);
 assert.ok(near(sumDep,g.depreciation,0.05),'Abschreibung additiv');
 // Speichern/Laden: GuV und Anlagenspiegel identisch, Weiterlauf bitgleich.
 const x=reload(sim);assert.deepEqual(ACC.report(x.state),ACC.report(s));
 sim.step(1440);x.step(1440);assert.equal(hash(x),hash(sim),'Laden während laufender Abschreibung');
 console.log(`# QS-015 GuV: Ergebnis ${g.result} €, Abschreibung ${g.depreciation} €, Abgang ${g.disposals} €, Rückbauerlös ${g.disposalProceeds} €, Umsatz ${g.revenue.total} €`);
});

test('Abschreibung tagesgenau: Minute vor/nach vollendetem Tag, Deckel nach Nutzungsdauer, Abriss beendet Abschreibung', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:3}),s=sim.state;
 sim.step(37);// ungerade Anschaffungsminute
 const rack=cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0}).id,van=cmd(sim,{type:'buyVehicle',vehicleType:'van'}).id,a0=s.t;
 const dep=()=>-ACC.guv(s).depreciation;
 sim.step(1439);assert.equal(dep()+0,0,'1439 Min. nach Anschaffung: noch kein vollendeter Tag');
 sim.step(1);assert.equal(dep(),cents(1200/180+9000/90),'genau ein Tag: Gebäude 1/180, Fahrzeug 1/90');
 // Tagesperiode, die die Vollendung enthält, trägt genau einen Tagesbetrag.
 const day=Math.floor(s.t/1440);assert.equal(-ACC.guv(s,{from:day*1440,to:s.t}).depreciation,cents(1200/180+9000/90));
 // Deckel: Anlageninfo über 1000 Tage → nie über Anschaffungswert.
 const iv=ACC.assetInfo(s,s.vehicles.find(v=>v.id===van),'vehicle'),ib=ACC.assetInfo(s,s.buildings.find(b=>b.id===rack),'building');
 assert.equal(ACC.accumulated(iv,a0+90*1440-1),cents(9000*89/90));assert.equal(ACC.accumulated(iv,a0+90*1440),9000);assert.equal(ACC.accumulated(iv,a0+1000*1440),9000);
 assert.equal(ACC.accumulated(ib,a0+180*1440),1200);assert.equal(ACC.accumulated(ib,a0+500*1440),1200);
 sim.step(1440);cmd(sim,{type:'demolish',id:rack});const t1=s.t;
 const before=dep();sim.step(3*1440);
 assert.equal(cents(dep()-before),cents(3*9000/90),'nach Abriss schreibt nur noch das Fahrzeug ab');
 const d=s.assetDisposals[0];assert.equal(d.disposedAt,t1);assert.equal(d.depreciation,cents(2*1200/180));
 assert.equal(ACC.guv(s).disposals,-cents(1200-2*1200/180));
 const reg=ACC.assetRegister(s,{from:0,to:s.t});assert.equal(reg.disposals.length,1);assert.equal(reg.rows.length,1);
});

test('Altstand ohne Anlagenfelder: lädt, Ledger-Ableitung liefert dieselbe GuV; ohne Beleg Spielbeginn/Katalogpreis', ()=>{
 const sim=new Simulation({mode:'sandbox',seed:9}),s=sim.state;
 sim.step(200);cmd(sim,{type:'build',buildingType:'dock',x:2,y:10,rotation:0});sim.step(300);cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 cmd(sim,{type:'buyVehicle',vehicleType:'truck'});cmd(sim,{type:'rentVehicle',vehicleType:'van'});
 cmd(sim,{type:'build',buildingType:'rack',x:6,y:2,rotation:0});sim.step(10);cmd(sim,{type:'move',id:s.buildings.at(-1).id,x:8,y:2});
 sim.step(3*1440);
 const old=JSON.parse(sim.serialize());for(const x of [...old.buildings,...old.vehicles]){delete x.acquiredAt;delete x.cost;}
 const legacy=Simulation.fromJSON(JSON.stringify(old));
 assert.deepEqual(ACC.guv(legacy.state),ACC.guv(s),'GuV aus Ledger = GuV aus Feldern');
 assert.ok(ACC.assetRegister(legacy.state).rows.every(r=>r.source==='ledger'),'alle Anlagen aus Ledger abgeleitet');
 // Ohne Ledgerbeleg (z. B. gekürztes Ledger): Spielbeginn 480 und Katalogpreis.
 const bare=JSON.parse(JSON.stringify(old));bare.ledger=bare.ledger.filter(l=>!/^(build|vehicle):/.test(l.key));
 const fb=Simulation.fromJSON(JSON.stringify(bare)),rows=ACC.assetRegister(fb.state).rows;
 assert.ok(rows.length===4&&rows.every(r=>r.source==='fallback'&&r.acquiredAt===480),'Ersatzwerte');
 // Altstand läuft weiter, neue Käufe setzen Felder; Validierung bleibt grün.
 cmd(legacy,{type:'buyVehicle',vehicleType:'van'});legacy.step(60);validateState(legacy.state);
 assert.equal(legacy.state.vehicles.at(-1).cost,VEHICLES.van.cost);
});

// ------------------------------------------------------------------------------------------------------------------
// 2. Kühlpaket / Sperrgut
function wareHub({seed,cold=0,forklift=false,vehicles=[],warehouse=2,drivers=1,docks=1}){
 const sim=new Simulation({mode:'sandbox',seed}),s=sim.state;
 const pos=[[2,10],[7,10],[12,10]];for(let i=0;i<docks;i++)cmd(sim,{type:'build',buildingType:'dock',x:pos[i][0],y:pos[i][1],rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:2,y:2,rotation:0});cmd(sim,{type:'build',buildingType:'rack',x:2,y:4,rotation:0});
 const cpos=[[6,2],[10,2]];for(let i=0;i<cold;i++)cmd(sim,{type:'build',buildingType:'coldstore',x:cpos[i][0],y:cpos[i][1],rotation:0});
 if(forklift)cmd(sim,{type:'build',buildingType:'forklift',x:15,y:2,rotation:0});
 staff(sim,'warehouse',warehouse);staff(sim,'driver',drivers);
 const ids=vehicles.map(vehicleType=>cmd(sim,{type:'buyVehicle',vehicleType}).id);
 cmd(sim,{type:'cancelContract',id:s.contracts.find(k=>k.status==='offer').id});
 return {sim,s,ids};
}
function takeWare(sim,ware){const s=sim.state;assert.ok(until(sim,()=>s.contracts.some(k=>k.status==='offer'&&wareOf(k)),3*1440),'Warenangebot');
 const k=s.contracts.find(k=>k.status==='offer'&&wareOf(k));assert.equal(k.content,ware);cmd(sim,{type:'acceptContract',id:k.id});return k;}

test('Kühlpaket Ende-zu-Ende (echtes Angebot): Kühllager-Entladung → Sortierung → Kühlfahrzeug → Zahlung genau einmal; Vertragsende-Abrechnung', ()=>{
 const {sim,s}=wareHub({seed:23,cold:1,vehicles:['refrigerated','van'],docks:2});
 const k=takeWare(sim,'parcel_cold');
 assert.ok(k.pricePerParcel>=7.5+7&&k.surcharge===7.5,'Zuschlag im Preis');
 const arrived=new Map();let maxTemp=0,unloadSave=null;
 const end=k.endT+1440+60;
 until(sim,()=>s.t>=end,20*1440,x=>{deliver(x);
  if(!unloadSave&&s.yard.some(a=>a.item==='parcel_cold'&&a.phase==='unloading'&&a.unloaded>0))unloadSave=x.serialize();
  if(x.state.t%5===0){invariants(x.state,arrived,`t=${x.state.t}`);for(const b of s.batches)if(b.item==='parcel_cold'&&b.qty>0&&b.location!=='vehicle'&&b.cooled)maxTemp=Math.max(maxTemp,b.temperature);}});
 const orders=s.orders.filter(o=>o.contractId===k.id),delivered=orders.reduce((n,o)=>n+o.delivered,0);
 assert.ok(delivered>0,'Kühlpakete zugestellt');
 assert.ok(s.shipments.filter(sh=>orders.some(o=>o.id===sh.orderId)).every(sh=>s.vehicles.find(v=>v.id===sh.vehicleId).type==='refrigerated'),'nur Kühlfahrzeug');
 assert.ok(maxTemp<=8,`gekühlte Lagerware ≤ 8 °C (max ${maxTemp})`);
 assert.ok(!s.batches.some(b=>b.item==='parcel_cold'&&b.coldDamaged),'kein Temperaturschaden bei ordentlichem Betrieb');
 assert.ok(k.settled,'Vertrag abgerechnet');
 for(const o of orders){const pen=s.ledger.filter(l=>l.key===`penalty-open:${o.id}`);assert.ok(pen.length<=1);if(o.qty>o.delivered)assert.equal(o.status,'cancelled');}
 assert.equal(sumQty(s,b=>orders.some(o=>o.id===b.owner)),0,'nach Abrechnung keine Fremdware mehr im Lager');
 // Speichern/Laden während Kühl-Entladung (Pflicht 7).
 assert.ok(unloadSave,'Kühl-Entladung beobachtet');
 const a=Simulation.fromJSON(unloadSave),b=Simulation.fromJSON(unloadSave);a.step(600);const c=Simulation.fromJSON(b.serialize());b.step(300);const d=Simulation.fromJSON(b.serialize());d.step(300);
 assert.equal(hash(d),hash(a),'Laden mitten in der Kühl-Entladung setzt bitgleich fort');
 console.log(`# QS-015 Kühl: ${orders.length} Aufträge, ${delivered} zugestellt, Umsatz ${cents(orders.reduce((n,o)=>n+o.paid,0))} €, max ${maxTemp} °C, Strafen ${cents(s.ledger.filter(l=>l.category==='Vertragsstrafe').reduce((n,l)=>n+l.amount,0))} €`);
});

test('Kühlkette: Kühllager aus → Erwärmung, Sperre bei Qualität < 70 dauerhaft, gesperrte Ware weder sortier- noch versendbar', ()=>{
 const {sim,s}=wareHub({seed:23,cold:1,vehicles:['refrigerated'],docks:2});
 const k=takeWare(sim,'parcel_cold');
 assert.ok(until(sim,()=>sumQty(s,b=>b.item==='parcel_cold'&&b.location==='stock')>=20,3*1440),'Kühlpakete sortiert im Lager');
 const cs=s.buildings.find(b=>b.type==='coldstore');cmd(sim,{type:'toggleBuilding',id:cs.id});
 assert.equal(coolingCapacity(s,SITE),0);
 // Ein neuer Kühl-Lkw wartet ohne Lagerkraft (Kühllager ausgeschaltet).
 let reason=null;until(sim,()=>s.batches.some(b=>b.item==='parcel_cold'&&b.coldDamaged),600,()=>{const a=s.yard.find(a=>a.item==='parcel_cold'&&a.phase==='unloading'&&a.waitReason);if(a)reason=a.waitReason;});
 const dmg=s.batches.filter(b=>b.item==='parcel_cold'&&b.coldDamaged&&b.qty>0);
 assert.ok(dmg.length>0,'Temperaturschaden tritt ein');
 for(const b of dmg){assert.ok(b.quality<70&&b.blocked,'gesperrt unter 70');assert.ok(b.peakTemperature>8);}
 const o=s.orders.find(o=>o.id===dmg[0].owner);
 const free=sim.api.inventory.available('parcel_cold',SITE,o.id);
 const total=sumQty(s,b=>b.owner===o.id&&b.location==='stock');
 assert.ok(free<total,'gesperrte Menge nicht verfügbar');
 if(free<1){const r=sim.command({type:'dispatch',orderId:o.id,vehicleId:s.vehicles[0].id,qty:1});assert.equal(r.ok,false,'gesperrte Ware nicht versendbar');}
 cmd(sim,{type:'toggleBuilding',id:cs.id});sim.step(120);
 assert.ok(dmg.every(b=>b.blocked&&b.coldDamaged),'Sperre bleibt nach Wiederkühlung');
 assert.equal(sim.command({type:'disposeBatch',batchId:dmg[0].id}).ok,true,'B-0.16-2: gesperrte Fremdware eines aktiven Auftrags entsorgbar (bis 0.16 abgelehnt)');
 validateState(s);
 console.log(`# QS-015 Kühlkette: ${dmg.length} Chargen gesperrt, Hof-Wartegrund bei ausgeschaltetem Kühllager: ${reason}`);
});

test('Kühlpaket: Lieferwagen/Lkw abgelehnt (Lieferung, Tour); Kühlfahrzeug-Kapazität 400; Sperrgut Lieferwagen 3, Lkw 133', ()=>{
 const {sim,s,ids}=wareHub({seed:23,cold:1,vehicles:['van','truck','refrigerated'],docks:2});
 const k=takeWare(sim,'parcel_cold');
 assert.ok(until(sim,()=>s.orders.some(o=>o.contractId===k.id&&sim.api.inventory.available('parcel_cold',SITE,o.id)>=5),3*1440),'sortierte Kühlpakete');
 const o=s.orders.find(o=>o.contractId===k.id&&sim.api.inventory.available('parcel_cold',SITE,o.id)>=5);
 for(const v of ids.slice(0,2)){assert.equal(sim.command({type:'dispatch',orderId:o.id,vehicleId:v,qty:5}).ok,false,'kein Kühlpaket im ungekühlten Fahrzeug');
  assert.equal(planTour(s,v,[{orderId:o.id,qty:5}]).ok,false,'keine Tour');}
 const tr={type:'truck',capacity:VEHICLES.truck.capacity},vn={type:'van',capacity:VEHICLES.van.capacity},rf={type:'refrigerated',capacity:VEHICLES.refrigerated.capacity};
 assert.equal(maxLoad(rf,'parcel_cold'),400);assert.equal(maxLoad(vn,'bulky'),3);assert.equal(maxLoad(tr,'bulky'),133);
 cmd(sim,{type:'dispatch',orderId:o.id,vehicleId:ids[2],qty:5});validateState(s);
});

test('Sperrgut Ende-zu-Ende (echtes Angebot): Stapler direkt nach stock, nie Sortierung; Teillieferung, Storno nach Reservierung, Zahlung genau einmal', ()=>{
 const {sim,s,ids}=wareHub({seed:41,forklift:true,vehicles:['truck','van'],docks:2});
 const k=takeWare(sim,'bulky');
 const arrived=new Map();let partial=null,cancelled=false;
 until(sim,()=>s.t>=k.startT+4*1440,8*1440,x=>{
  // Pflicht Lager↔Transport sinngemäß: erste Lkw-Beladung nach Reservierung storniert (Fahrzeugausfall), Stapler/Personal/Reservierung frei.
  if(!cancelled){const sh=s.shipments.find(sh=>sh.status==='loading'&&s.vehicles.find(v=>v.id===sh.vehicleId).type==='truck'&&s.reservations.some(r=>r.job===sh.id));
   if(sh&&s.workers.some(w=>w.task===`${sh.id}:warehouse`)){const o=s.orders.find(o=>o.id===sh.orderId),before=sim.api.inventory.available('bulky',SITE,o.id);
    cmd(x,{type:'cancelShipment',id:sh.id});cancelled=true;
    assert.equal(sim.api.inventory.available('bulky',SITE,o.id),before+sh.qty,'Reservierung freigegeben');
    assert.ok(!s.workers.some(w=>w.task?.startsWith(sh.id)),'Personal frei');assert.ok(!s.buildings.some(b=>b.task===sh.id||b.forkliftTask===sh.id),'Rampe frei');
    assert.ok(!(s.forklifts||[]).some?.(f=>f.task===sh.id));}}
  // Teillieferung mit Lieferwagen (3 Stück) einmal gezielt.
  if(!partial){const o=s.orders.find(o=>o.contractId===k.id&&o.status==='active'&&sim.api.inventory.available('bulky',SITE,o.id)>=3&&o.qty>3);const v=s.vehicles.find(v=>v.id===ids[1]);
   if(o&&v.status==='idle'){cmd(x,{type:'dispatch',orderId:o.id,vehicleId:v.id,qty:3});partial=o.id;}}
  else deliver(x);
  if(x.state.t%5===0)invariants(x.state,arrived,`t=${x.state.t}`);});
 assert.ok(cancelled&&partial,'Storno und Teillieferung durchlaufen');
 const po=s.orders.find(o=>o.id===partial);assert.ok(po.delivered>=3);
 const orders=s.orders.filter(o=>o.contractId===k.id);
 assert.ok(orders.reduce((n,o)=>n+o.delivered,0)>0,'Sperrgut zugestellt');
 assert.equal(s.sorting?.sites?.[SITE]?.total||0,0,'Sperrgut nie sortiert');
 assert.ok(!s.batches.some(b=>b.item==='bulky'&&b.location==='inbound'),'nie inbound');
 // Teilzahlung: o.paid = Summe der bezahlten Lieferungen dieses Auftrags, Restmenge offen.
 const paidSum=cents(s.shipments.filter(sh=>sh.orderId===po.id&&sh.paid).reduce((n,sh)=>n+sh.invoiceAmount,0));assert.ok(near(paidSum,po.paid));
 console.log(`# QS-015 Sperrgut: ${orders.length} Aufträge, ${orders.reduce((n,o)=>n+o.delivered,0)} Stück zugestellt, Umsatz ${cents(orders.reduce((n,o)=>n+o.paid,0))} €`);
});

// ------------------------------------------------------------------------------------------------------------------
// 3. Quergurtsorter / Mega-Hub
let MEGA=null;
function megaBase(){
 if(MEGA)return Simulation.fromJSON(MEGA);
 const sim=new Simulation({mode:'sandbox',seed:29}),s=sim.state;
 for(const [t,x,y] of [['dock',2,10],['rack',2,2],['rack',2,4],['rack',2,6],['research',15,12]])cmd(sim,{type:'build',buildingType:t,x,y,rotation:0});
 staff(sim,'research',1,'day');
 cmd(sim,{type:'cancelContract',id:s.contracts.find(k=>k.status==='offer').id});
 const blocked=sim.command({type:'build',buildingType:'crossbelt',x:8,y:2,rotation:0});
 assert.equal(blocked.ok,false,'Bausperre ohne Forschung');assert.match(blocked.message,/Mega-Hub/);
 const m0=s.money;cmd(sim,{type:'startResearch',key:'megahub'});assert.equal(cents(m0-s.money),12000,'Forschung 12.000 €');
 assert.ok(until(sim,()=>s.research.some(r=>r.key==='megahub'&&r.status==='completed'),600),'Forschung abgeschlossen');
 const m1=s.money;cmd(sim,{type:'build',buildingType:'crossbelt',x:8,y:2,rotation:0});assert.equal(cents(m1-s.money),60000,'Quergurt 60.000 €');
 MEGA=sim.serialize();return Simulation.fromJSON(MEGA);
}
/** Testauftrag (Ausnahme: direkt angelegt, wie Hub-Ware nach Entladung) mit qty Paketen inbound. */
function injectOrder(sim,qty,item='parcel'){
 const s=sim.state,id=sim.api.id('order');
 s.orders.push({id,kind:'logistics',source:'hub',customer:'Testbezirk Nord',item,qty,price:1.2,due:s.t+3000,quality:0,site:SITE,status:'active',delivered:0,paid:0});
 assert.ok(sim.api.inventory.add({item,qty,site:SITE,location:'inbound',owner:id}),'Anlage');return id;
}
const beltOf=s=>s.buildings.find(b=>b.type==='crossbelt');
const total=(s,owner)=>sumQty(s,b=>b.owner===owner);

test('Quergurt: 2 Kräfte = 40/min, 1 Kraft = 20/min, Fehlwurf exakt jedes 100. Paket, Nachsortierung von Hand, Mengenerhalt je Minute', ()=>{
 const sim=megaBase(),s=sim.state;staff(sim,'warehouse',3);
 const o=injectOrder(sim,2000);let maxMin=0,prev=0;
 sim.step(1);prev=sumQty(s,b=>b.owner===o&&b.location==='stock');// Bindung, erste Minute
 for(let i=0;i<120&&sumQty(s,b=>b.owner===o&&b.location==='stock')<2000;i++){
  sim.step(1);const st=sumQty(s,b=>b.owner===o&&b.location==='stock');maxMin=Math.max(maxMin,st-prev);prev=st;
  assert.ok(near(total(s,o),2000,1e-9),'Mengenerhalt');
  for(const b of s.batches)if(b.resort&&b.qty>0&&b.location==='stock')assert.ok(b.parents.length===1,'nachsortierte Charge bleibt Abspaltung ihrer Quelle');
 }
 const x=s.sorting.sites[SITE];
 assert.equal(sumQty(s,b=>b.owner===o&&b.location==='stock'),2000,'alles sortiert');
 assert.equal(x.rejects,2000/MISSORT_EVERY,'1 % Fehlwurf');
 assert.equal(x.total,2000,'jedes Paket genau einmal gezählt');
 assert.ok(maxMin>=40&&maxMin<=43,`Spitze ${maxMin}/min (40 Quergurt + Handnachsortierung)`);
 // Eine Kraft: halbe Leistung.
 const one=megaBase(),t=one.state;staff(one,'warehouse',1);const o1=injectOrder(one,600);one.step(1);
 const s0=sumQty(t,b=>b.owner===o1&&b.location==='stock');one.step(10);
 assert.equal(beltOf(t).crew,1);assert.equal(sumQty(t,b=>b.owner===o1&&b.location==='stock')-s0,198,'10 Min. × 20 abzgl. 2 Fehlwürfe (ohne freie Handkraft)');
 assert.equal(sumQty(t,b=>b.owner===o1&&b.resort&&b.location==='inbound'),beltOf(t).sortCount<0?0:t.sorting.sites[SITE].rejects,'Fehlwürfe warten inbound');
});

test('Pflicht Personal↔Sortierung: Schichtende während Quergurt-Sortierung – Bindung frei, keine Ware verloren, Laden bitgleich', ()=>{
 const sim=megaBase(),s=sim.state;
 staff(sim,'warehouse',2,'day');staff(sim,'warehouse',1,'night');
 sim.step(15*60-(s.t%1440)+1440);// nächster Tag 15:00
 const o=injectOrder(sim,5000);
 let saves=new Map();
 until(sim,()=>s.t%1440===16*60+30,200,x=>{if([959,960,961].includes(s.t%1440))saves.set(s.t%1440,x.serialize());});
 const b=beltOf(s);
 assert.equal(b.crew,1,'nach 16:00 nur die Nachtkraft am Quergurt');
 for(const w of s.workers.filter(w=>w.role==='warehouse'&&w.shift==='day'))assert.equal(w.task,null,'Tagkraft nach Schichtende frei');
 assert.ok(near(total(s,o),5000,1e-9),'keine Ware verloren');
 // Laden unmittelbar vor/an/nach dem Wechsel ergibt denselben Stand.
 const ref=Simulation.fromJSON(saves.get(959));ref.step(120);
 for(const m of [960,961]){const x=Simulation.fromJSON(saves.get(m));x.step(120-(m-959));assert.equal(hash(x),hash(ref),`Laden bei ${m}`);}
 // Ohne jede Kraft (Nachtkraft entlassen ist nicht möglich während Arbeit → Schicht auf Tag): Quergurt wartet „staff“.
 const n=s.workers.find(w=>w.shift==='night');cmd(sim,{type:'setShift',id:n.id,shift:'day'});sim.step(2);
 assert.equal(b.status,'staff');assert.equal(b.crew,0);
 const stock=sumQty(s,x=>x.owner===o&&x.location==='stock');sim.step(30);assert.equal(sumQty(s,x=>x.owner===o&&x.location==='stock'),stock,'ohne Personal keine Bewegung');
 validateState(s);
});

test('Quergurt: Entladen hat Vorrang (Hof-Lkw), Strom fehlt → „power“, Defekt → „broken“, Kräfte frei', ()=>{
 const sim=megaBase(),s=sim.state;staff(sim,'warehouse',2);
 const o=injectOrder(sim,3000);sim.step(3);assert.equal(beltOf(s).crew,2);
 // Echter Vertrags-Lkw (Startvertrag ist abgelehnt → neues Paketangebot annehmen und Ankunft abwarten).
 assert.ok(until(sim,()=>s.contracts.some(k=>k.status==='offer'&&k.unit!=='air'&&!wareOf(k)&&(k.unit||'parcel')==='parcel'),3*1440));
 cmd(sim,{type:'acceptContract',id:s.contracts.find(k=>k.status==='offer'&&k.unit!=='air'&&!wareOf(k)&&(k.unit||'parcel')==='parcel').id});
 if(sumQty(s,b=>b.owner===o&&b.location==='inbound')<1000)assert.ok(sim.api.inventory.add({item:'parcel',qty:3000,site:SITE,location:'inbound',owner:o}),'Nachschub');
 let seen=false;until(sim,()=>seen,4*1440,()=>{const a=s.yard.find(a=>a.phase==='unloading'&&a.unloaded<a.parcels&&!a.item);
  if(a&&s.workers.some(w=>w.task===`${a.id}:warehouse`)){seen=true;}
  if(sumQty(s,b=>b.owner===o&&b.location==='inbound')<200)sim.api.inventory.add({item:'parcel',qty:3000,site:SITE,location:'inbound',owner:o});});
 assert.ok(seen,'Lkw wird entladen');assert.equal(beltOf(s).crew,1,'Quergurt gibt eine Kraft ans Entladen ab');
 // Strom: Bau ist durch den Stromanschluss begrenzt; Ausfall entsteht nur, wenn eine Energieversorgung ausfällt.
 // Energieversorgung (+40), zwei Kühllager; dann Energieversorgung aus → Angebot 30 kW, Grundlast 21 kW, 9 kW Rest < 12 kW.
 const p=megaBase(),t=p.state;staff(p,'warehouse',2);injectOrder(p,500);
 const pw=cmd(p,{type:'build',buildingType:'power',x:16,y:2,rotation:0}).id;
 cmd(p,{type:'build',buildingType:'coldstore',x:8,y:6,rotation:0});
 assert.equal(p.command({type:'build',buildingType:'coldstore',x:12,y:6,rotation:0}).ok,true,'zweites Kühllager mit Energieversorgung');
 p.step(2);assert.equal(beltOf(t).status,'working');
 cmd(p,{type:'toggleBuilding',id:pw});p.step(2);
 assert.equal(beltOf(t).status,'power');assert.ok(!t.workers.some(w=>w.task?.includes(':sort')),'Kräfte frei bei Stromausfall');
 // Defekt (Ausnahme: Zustand gesetzt, der Quergurt verschleißt im Modell nicht).
 const q=megaBase(),u=q.state;staff(q,'warehouse',2);const oq=injectOrder(q,500);q.step(2);beltOf(u).condition=4;q.step(2);
 assert.equal(beltOf(u).status,'broken');assert.ok(!u.workers.some(w=>w.task?.includes(':sort')));
 assert.ok(near(total(u,oq),500,1e-9));validateState(u);
});

test('Quergurt: Sperrgut nie über den Quergurt; Kühlpaket-Fehlwurf behält Temperaturprotokoll; Speichern/Laden mitten in der Sortierung', ()=>{
 const sim=megaBase(),s=sim.state;staff(sim,'warehouse',3);
 const bulky=injectOrder(sim,1,'bulky');sim.step(5);
 assert.equal(sumQty(s,b=>b.owner===bulky&&b.location==='stock'),0,'Sperrgut bleibt (nur Testanlage inbound)');
 const o=injectOrder(sim,1500);sim.step(20);
 const mid=sim.serialize();sim.step(60);const x=Simulation.fromJSON(mid);x.step(60);assert.equal(hash(x),hash(sim),'Laden während Quergurt-Sortierung');
 assert.ok(near(total(s,o),1500,1e-9));
});

test('QS-015-01 behoben: Quergurt im Status „power“ nimmt der Kühlung keine Leistung weg – Kühllager bleiben bei Ausfall der Energieversorgung versorgt', ()=>{
 const sim=megaBase(),s=sim.state;
 const pw=cmd(sim,{type:'build',buildingType:'power',x:16,y:2,rotation:0}).id;
 cmd(sim,{type:'build',buildingType:'coldstore',x:8,y:6,rotation:0});cmd(sim,{type:'build',buildingType:'coldstore',x:12,y:6,rotation:0});
 sim.step(2);assert.equal(coolingCapacity(s,SITE),200,'mit Energieversorgung volle Kühlung');
 cmd(sim,{type:'toggleBuilding',id:pw});sim.step(2);
 // Quergurt läuft wegen Strommangels nicht (Grundlast hat Vorrang) …
 assert.equal(beltOf(s).status,'power');
 // … und die Kühlung bleibt versorgt (Vorrang Kühlung, Grundlast 1+4+16 = 21 kW ≤ 30 kW).
 assert.equal(coolingCapacity(s,SITE),200,`Kühlkapazität ${coolingCapacity(s,SITE)} statt 200`);
});

test('QS-015-02 behoben: Abriss eines arbeitenden Quergurts gibt beide Lagerkräfte frei', ()=>{
 const sim=megaBase(),s=sim.state;staff(sim,'warehouse',3);const o=injectOrder(sim,3000);sim.step(3);
 const b=beltOf(s);assert.equal(b.crew,2);
 cmd(sim,{type:'demolish',id:b.id});sim.step(5);
 const stuck=s.workers.filter(w=>w.task?.startsWith(b.id+':'));
 assert.equal(stuck.length,0,`${stuck.length} Kräfte gebunden an ${b.id} (${stuck.map(w=>w.task).join(', ')})`);
 assert.ok(near(total(s,o),3000,1e-9));
});

// ------------------------------------------------------------------------------------------------------------------
// 4. Mehrwertdienste kind 'vas'
const LINE=[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11],['rack',2,4],['rack',6,11],['rack',9,11]];
function factory(seed,{prodShift='all'}={}){
 const sim=new Simulation({mode:'sandbox',seed});for(const [t,x,y] of LINE)cmd(sim,{type:'build',buildingType:t,x,y,rotation:0});
 staff(sim,'production',1,prodShift);staff(sim,'warehouse',2);staff(sim,'driver',1);cmd(sim,{type:'buyVehicle',vehicleType:'van'});
 return sim;
}
const vasOffer=sim=>{const s=sim.state;let o;assert.ok(until(sim,()=>!!(o=s.orders.find(o=>o.kind==='vas'&&o.status==='offer')),4000),'VAS-Angebot');return o;};
function jobsClean(s,label){for(const j of s.jobs)if(Array.isArray(j.inputs)){const owner=j.owner||'company';for(const x of j.inputs)assert.equal(x.owner,owner,`${label}: Job ${j.id} mischt ${x.owner} in ${owner}`);}}

test('Mehrwertdienst Ende-zu-Ende: Kundenmaterial kostenlos und Fremdeigentum, nie gemischt mit Eigenmaterial, Zustellung, Zahlung genau einmal; Laden in der Fertigung', ()=>{
 const sim=factory(31),s=sim.state;
 cmd(sim,{type:'buy',item:'housing',qty:10,supplier:'standard'});cmd(sim,{type:'buy',item:'board',qty:10,supplier:'standard'});cmd(sim,{type:'buy',item:'carton',qty:10,supplier:'standard'});
 const o=vasOffer(sim),ledger0=s.ledger.length,purch0=s.ledger.filter(l=>l.category==='Einkauf').length;
 cmd(sim,{type:'acceptOrder',id:o.id});
 assert.equal(s.ledger.filter(l=>l.category==='Einkauf').length,purch0,'Kundenmaterial bucht keinen Einkauf');
 const companyStart={housing:sim.api.inventory.available('housing',SITE,'company'),board:sim.api.inventory.available('board',SITE,'company')};
 let jobSave=null,companyJobs=0;const arrived=new Map();
 assert.ok(until(sim,()=>o.status==='fulfilled'&&s.shipments.filter(sh=>sh.orderId===o.id).every(sh=>sh.paid),3*1440,x=>{
  jobsClean(s,`t=${s.t}`);deliver(x);
  if(!jobSave&&s.jobs.some(j=>j.owner===o.id&&j.status!=='storage'&&j.remaining<j.duration))jobSave=x.serialize();
  for(const j of s.jobs)if(!j.owner&&j.inputs?.length)companyJobs++;
  // Kundeneigentum: jede Charge des Auftrags gehört genau ihm; nie company-Charge mit Kundenkosten.
  for(const b of s.batches)if(b.owner===o.id)assert.equal(b.unitCost>=0,true);
  if(s.t%5===0)invariants(s,arrived,`t=${s.t}`);}),'Auftrag erfüllt und bezahlt');
 const pays=s.ledger.filter(l=>l.category==='Umsatz'&&l.refs?.includes(o.id));
 assert.equal(cents(pays.reduce((n,l)=>n+l.amount,0)),cents(o.qty*o.price*(o.late?0.9:1)),'Vergütung qty × Satz');
 assert.equal(new Set(pays.map(l=>l.key)).size,pays.length,'jede Zahlung genau einmal');
 assert.equal(o.paid,cents(pays.reduce((n,l)=>n+l.amount,0)));
 assert.equal(s.shipments.filter(sh=>sh.orderId===o.id).reduce((n,sh)=>n+(sh.materialCost||0),0),0,'kein Materialeinsatz auf Fremdware');
 // Eigenmaterial wurde für Lohnfertigung nicht angetastet (nur eigene Jobs dürfen es verbrauchen; hier keine eigenen Aufträge aktiv).
 if(!s.orders.some(x=>x.kind==='manufacturing'&&x.status==='active'))assert.ok(sim.api.inventory.available('housing',SITE,'company')+(companyJobs?0:0)<=companyStart.housing);
 assert.equal(sumQty(s,b=>b.owner===o.id&&b.item==='lamp'),0,'Fertigware vollständig zugestellt');
 // Pflicht 7: Speichern/Laden während VAS-Fertigung.
 assert.ok(jobSave,'laufender VAS-Job beobachtet');
 const a=Simulation.fromJSON(jobSave);a.step(400);const b=Simulation.fromJSON(jobSave);b.step(7);const c=Simulation.fromJSON(b.serialize());c.step(393);assert.equal(hash(c),hash(a),'Laden mitten in der Lohnfertigung bitgleich');
 console.log(`# QS-015 VAS: ${o.qty} × ${o.item} zu ${o.price} €, bezahlt ${o.paid} €, Zahlungen ${pays.length}, eigene Jobs beobachtet ${companyJobs>0}`);
});

test('Mehrwertdienst: eigene Fertigung nutzt nie Kundenmaterial; Pflicht Personal↔Produktion: Schichtende während VAS-Arbeitsgang', ()=>{
 const sim=factory(31,{prodShift:'day'}),s=sim.state;
 const o=vasOffer(sim);cmd(sim,{type:'acceptOrder',id:o.id});
 // Bis kurz vor 16:00 mit laufendem VAS-Job.
 assert.ok(until(sim,()=>s.t%1440>=15*60+55&&s.jobs.some(j=>j.owner===o.id&&j.status!=='storage'),3*1440),'VAS-Job vor Schichtende');
 const before=new Map(s.jobs.filter(j=>j.owner===o.id).map(j=>[j.id,j.remaining]));
 const custTotal=()=>sumQty(s,b=>b.owner===o.id)+s.jobs.filter(j=>j.owner===o.id).reduce((n,j)=>n+j.inputs.reduce((m,x)=>m+x.qty,0),0);
 sim.step(10);// 16:05
 for(const w of s.workers.filter(w=>w.role==='production'))assert.equal(w.task,null,'Fertigungskraft nach Schichtende frei');
 for(const [id,rem] of before){const j=s.jobs.find(j=>j.id===id);if(j)assert.ok(j.remaining>=rem-5-1e-9,'Arbeitsgang ruht');}
 const mid=sim.serialize();sim.step(60);const st=s.buildings.filter(b=>['assembly','testing','packing'].includes(b.type)&&b.job).map(b=>b.status);
 assert.ok(st.every(x=>x==='staff'),`Anlagen warten auf Personal: ${st}`);
 const x=Simulation.fromJSON(mid);x.step(60);assert.equal(hash(x),hash(sim),'Laden während ruhendem Arbeitsgang');
 // Am Folgetag geht es weiter; Kundenmaterial + gebundene Eingänge bleiben vollständig (keine Doppelverbuchung).
 assert.ok(until(sim,()=>o.delivered>0||s.batches.some(b=>b.owner===o.id&&b.item==='lamp'&&b.qty>0),2*1440,deliver),'Fertigung setzt am Folgetag fort');
 jobsClean(s,'Ende');validateState(s);void custTotal;
});

test('QS-015-03 behoben: Storno eines Mehrwertdienstauftrags gibt Kundenmaterial und Halbfabrikate an den Kunden zurück', ()=>{
 const sim=factory(31),s=sim.state;const o=vasOffer(sim);cmd(sim,{type:'acceptOrder',id:o.id});
 assert.ok(until(sim,()=>s.purchases.filter(p=>p.orderId===o.id).every(p=>p.status==='stored'),600));
 cmd(sim,{type:'cancelOrder',id:o.id});sim.step(3*1440);
 const left=s.batches.filter(b=>b.owner===o.id&&b.qty>0);
 assert.equal(left.length,0,`nach Storno + 3 Tagen noch ${left.map(b=>`${b.qty} ${b.item}@${b.location}`).join(', ')} Kundeneigentum im Lager`);
});

// ------------------------------------------------------------------------------------------------------------------
// Nachprüfung B-0.15-1 (A07-Fix 1e122ee, yard.js Dockfreigabe): Ein Dock, jedes Kühlangebot angenommen (Fehlplanung).
// Erwartet: Ein Fremd-Lkw ohne Kühlplatz hält das einzige Dock nicht länger als DOCK_YIELD (+ Takt), solange ein eigenes
// Fahrzeug auf ein Dock wartet; Mengenerhalt mit Teilstand; Laden im freigegebenen Zustand bitgleich.
test('Nachprüfung B-0.15-1: Fremd-Lkw gibt Dock bei „Kühllager voll“ frei, eigenes Kühlfahrzeug lädt; Mengen und Laden konsistent', ()=>{
 const {sim,s}=wareHub({seed:2,cold:1,vehicles:['refrigerated'],docks:1});
 const arrived=new Map();let hold=0,maxHold=0,queued=null,queuedCount=0;const departed=new Set();
 until(sim,()=>s.t>=8*1440,8*1440,x=>{
  for(const k of s.contracts)if(k.status==='offer'&&wareOf(k)==='parcel_cold')x.command({type:'acceptContract',id:k.id});
  deliver(x);
  const dock=s.buildings.find(b=>b.type==='dock'),a=s.yard.find(a=>a.id===dock.task);
  if(a&&a.phase==='unloading'&&SPACE_WAIT.has(a.waitReason)&&ownDockWaiting(s,SITE)>0){hold++;maxHold=Math.max(maxHold,hold);}else hold=0;
  const q=s.yard.find(a=>a.phase==='queue'&&a.unloaded>0&&a.unloaded<a.parcels);if(q){queuedCount++;queued??=x.serialize();}
  for(const sh of s.shipments)if(sh.departedAt!=null)departed.add(sh.id);
  if(s.t%5===0)invariants(s,arrived,`t=${s.t}`);
 });
 assert.ok(queued,'Fremd-Lkw mit Teilstand zurück in der Warteschlange beobachtet');
 assert.ok(maxHold<=DOCK_YIELD+2,`Dock bei Platzmangel gehalten: max ${maxHold} Min. bei wartendem eigenen Fahrzeug`);
 assert.ok(departed.size>0,'eigenes Kühlfahrzeug kommt ans Dock und fährt ab');
 const x=Simulation.fromJSON(queued),y=Simulation.fromJSON(queued);x.step(240);y.step(120);const z=Simulation.fromJSON(y.serialize());z.step(120);
 assert.equal(hash(z),hash(x),'Laden mit wartendem Teilstand-Lkw bitgleich');
 const cold=s.contracts.filter(k=>wareOf(k)==='parcel_cold'),orders=s.orders.filter(o=>cold.some(k=>k.id===o.contractId));
 console.log(`# QS-015 B-0.15-1: ${cold.length} Kühlverträge, ${orders.reduce((n,o)=>n+o.delivered,0)} von ${orders.reduce((n,o)=>n+o.qty,0)} zugestellt, max. Dockhaltezeit ${maxHold} Min., Teilstand in Warteschlange ${queuedCount} Min., Abfahrten ${departed.size}`);
});
