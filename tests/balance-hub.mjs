// A02 Balancing Depot-Stufe (Welle 1b). Deterministisch: Seeds 1–5, Modus „economy“ (Startkapital 85.000 €), 5 Spieltage.
// Aufruf: node tests/balance-hub.mjs [--json]
// Szenarien (Depot-Grundausstattung jeweils: Dock, Regal, Lieferwagen):
//  start    – 1 Lagerkraft, 1 Fahrer, nur Startvertrag (trägt sich der erste Vertrag allein?).
//  gut      – 1 Lagerkraft, 1 Fahrer; Startvertrag sofort, zweiter Vertrag sobald angeboten (endet ein Vertrag, wird das
//             nächste Angebot angenommen; gilt für alle Szenarien).
//             Disposition: Sammeltour (2–4 Aufträge) bzw. Einzellieferung, sobald ein Auftrag fertig sortiert ist,
//             frühe Fälligkeit zuerst; keine Abfahrt, die nach Schichtende zurückkäme.
//  ausbau   – wie gut, dazu ab Tag 1 Sortierplatz und dritter Vertrag (erster Ausbau).
//  traege   – wie gut, aber Disposition erst ab 14:00 und ohne Rücksicht aufs Schichtende (Wirkung von Verspätung).
//  schlecht – wie gut, aber ohne Fahrer (zu wenig Personal): Pakete bleiben liegen.
// Ausgabe nach 5 Spieltagen; Amortisation (kumuliertes Betriebsergebnis ≥ Investition) bis 15 Tage weitergerechnet.
// Nur reguläre Spielerbefehle über sim.command; keine Eingriffe in den Zustand.
import {Simulation} from '../dist/core.js';
import {VEHICLES,ITEMS} from '../dist/catalog.js';

const DAYS=5,START=480,REPORT=START+DAYS*1440,END=START+15*1440,SHIFT_END=960,MARGIN=20;
const SCENARIOS={
 start:{staff:['warehouse','driver'],dispatchFrom:480,contracts:1},
 gut:{staff:['warehouse','driver'],dispatchFrom:480,contracts:2},
 ausbau:{staff:['warehouse','driver'],dispatchFrom:480,contracts:3,sorter:true},
 traege:{staff:['warehouse','driver'],dispatchFrom:840,ignoreShift:true,contracts:2},
 schlecht:{staff:['warehouse'],dispatchFrom:480,contracts:2}
};
const cmd=(sim,c)=>{const r=sim.command(c);if(!r.ok)throw new Error(`${c.type}: ${r.message}`);return r;};
const cents=n=>Math.round(n*100)/100;

function ready(s,o){return s.batches.filter(b=>b.item==='parcel'&&b.location==='stock'&&b.owner===o.id&&b.site===o.site).reduce((n,b)=>n+b.qty-(b.reserved||0),0);}
function committed(s,o){
 const sh=s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0);
 const tr=(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
 return sh+tr;
}

function dispatch(sim,cfg){
 const s=sim.state,minute=s.t%1440;if(minute<cfg.dispatchFrom||(!cfg.ignoreShift&&minute>=SHIFT_END))return;
 const v=s.vehicles.find(v=>v.status==='idle'&&v.condition>=15);if(!v)return;
 const maxQty=Math.floor((VEHICLES[v.type].weightCapacity||v.capacity*4)/ITEMS.parcel.weight);
 // Nur vollständig sortierte Restmengen eines Auftrags fahren (keine Kleinstfahrten).
 const cand=s.orders.filter(o=>o.source==='hub'&&o.status==='active').map(o=>({o,rest:o.qty-o.delivered-committed(s,o),ready:ready(s,o)}))
  .filter(x=>x.rest>0&&x.ready>=x.rest).sort((a,b)=>a.o.due-b.o.due);
 const stops=[];let load=0;
 for(const x of cand){if(stops.length===4)break;const q=Math.min(x.rest,maxQty-load);if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
 if(!stops.length)return;
 const minutes=2+Math.ceil(load/5)+30+stops.reduce((n,x,i)=>n+(i?20:0)+2+Math.ceil(x.qty/10),0)+30;
 if(!cfg.ignoreShift&&minute+minutes+MARGIN>SHIFT_END)return;
 if(stops.length>1)cmd(sim,{type:'dispatchTour',vehicleId:v.id,stops});
 else cmd(sim,{type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty});
}

const CATEGORY={'Umsatz':'umsatz','personal':'personal','construction':'bau','Fuhrpark':'fuhrpark','Transport':'transport','Energie':'energie','Miete':'miete','Zinsen':'zinsen'};
function report(s,name,seed,money0,invest,daily,payback){
 const cat={};for(const l of s.ledger){const k=CATEGORY[l.category]||l.category;cat[k]=cents((cat[k]||0)+l.amount);}
 const hub=s.orders.filter(o=>o.source==='hub'),due=new Map(hub.map(o=>[o.id,o]));
 // Pünktlichkeit je zugestelltem Paket (Lieferung bzw. Tourstopp): Zustellzeit gegen Auftragsfrist.
 let onTime=0,late=0,lateDiscount=0;
 const legs=[...s.shipments.filter(x=>x.deliveredAt!=null),...(s.tours||[]).flatMap(t=>t.stops).filter(x=>x.deliveredAt!=null)];
 for(const x of legs){const o=due.get(x.orderId);if(!o)continue;if(x.deliveredAt>o.due){late+=x.qty;lateDiscount+=x.qty*o.price*0.1;}else onTime+=x.qty;}
 const parcelsIn=hub.reduce((n,o)=>n+o.qty,0),delivered=onTime+late;
 const receivable=[...s.shipments,...(s.tours||[]).flatMap(t=>t.stops)].filter(x=>x.invoiceAmount&&!x.paid).reduce((n,x)=>n+x.invoiceAmount,0);
 return {scenario:name,seed,invest,money:cents(s.money),result:cents(s.money-money0),daily,cat,receivable:cents(receivable),
  contracts:s.contracts.filter(k=>k.status!=='offer'&&k.acceptedAt<REPORT).map(k=>({shipper:k.shipper,price:k.pricePerParcel,sla:k.slaMinutes,days:k.durationDays,arrivals:k.arrivals.map(a=>`${a.minute/60}h:${a.parcels}`).join('+')})),
  parcelsIn,delivered,onTime,late,punctuality:delivered?+(onTime/delivered*100).toFixed(1):0,lateDiscount:cents(lateDiscount),payback,reputation:s.reputation};
}
function run(name,seed){
 const cfg=SCENARIOS[name],sim=new Simulation({mode:'economy',seed}),s=sim.state,money0=s.money;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:13,rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:8,y:2,rotation:0});
 for(const role of cfg.staff)cmd(sim,{type:'hire',role});
 cmd(sim,{type:'buyVehicle',vehicleType:'van'});
 let invest=cents(money0-s.money);
 cmd(sim,{type:'acceptContract',id:s.contracts[0].id});
 const daily=[];let payback=null,out=null;
 const opResult=()=>s.ledger.filter(l=>!['construction','Fuhrpark'].includes(l.category)&&!/^hire:/.test(l.key)).reduce((n,l)=>n+l.amount,0);
 while(s.t<END){
  // Laufende Verträge halten: endet einer, nimmt der Spieler das nächste Angebot an.
  if(s.contracts.filter(k=>k.status==='active').length<cfg.contracts){const offer=s.contracts.find(k=>k.status==='offer');if(offer)cmd(sim,{type:'acceptContract',id:offer.id});}
  // Erster Ausbau: Sortierplatz zu Beginn des zweiten Spieltags (HUD „Tag 2“).
  if(cfg.sorter&&s.t===START+1440){const m=s.money;cmd(sim,{type:'build',buildingType:'sorter',x:8,y:6,rotation:0});invest=cents(invest+m-s.money);}
  dispatch(sim,cfg);
  sim.step(1);
  if(payback==null&&opResult()>=invest)payback=cents((s.t-START)/1440);
  if((s.t-START)%1440===0&&s.t<=REPORT)daily.push(cents(s.money));
  if(s.t===REPORT)out=report(s,name,seed,money0,invest,daily,null);
  if(s.t>=REPORT&&payback!=null)break;
 }
 out.payback=payback;return out;
}

const rows=[];for(const name of Object.keys(SCENARIOS))for(let seed=1;seed<=5;seed++)rows.push(run(name,seed));
if(process.argv.includes('--json')){console.log(JSON.stringify(rows,null,1));process.exit(0);}
const fmt=n=>n.toLocaleString('de-DE',{maximumFractionDigits:0});
console.log('Szenario  Seed  Invest  Ergebnis5T  Umsatz  Personal  Transport  Energie+Miete  Amort.(Tage)  Pakete an/zu  pünktl.%  Abschlag  Verträge (Preis/Frist/Ankünfte)');
for(const r of rows)console.log([r.scenario.padEnd(8),String(r.seed).padStart(4),fmt(r.invest).padStart(7),fmt(r.result).padStart(10),fmt(r.cat.umsatz||0).padStart(7),fmt(r.cat.personal||0).padStart(9),fmt(r.cat.transport||0).padStart(9),fmt((r.cat.energie||0)+(r.cat.miete||0)).padStart(13),String(r.payback??'>15').padStart(12),`${r.parcelsIn}/${r.delivered}`.padStart(13),String(r.punctuality).padStart(9),fmt(r.lateDiscount).padStart(9),' '+r.contracts.map(k=>`${k.price}€/${k.sla/60}h/${k.arrivals}`).join(' | ')].join(' '));
const avg=(name,f)=>{const list=rows.filter(r=>r.scenario===name);return list.reduce((n,r)=>n+f(r),0)/list.length;};
console.log('\nMittel Seeds 1–5:');
for(const name of Object.keys(SCENARIOS))console.log(`${name.padEnd(8)} Ergebnis ${fmt(avg(name,r=>r.result))} € · Umsatz ${fmt(avg(name,r=>r.cat.umsatz||0))} € · Personal ${fmt(avg(name,r=>r.cat.personal||0))} € · Transport ${fmt(avg(name,r=>r.cat.transport||0))} € · Pünktlich ${avg(name,r=>r.punctuality).toFixed(1)} % · Amortisation ${rows.filter(r=>r.scenario===name).map(r=>r.payback??'>15').join('/')} Tage`);
