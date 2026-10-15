// A02 Balancing Depot-Stufe (Welle 1b, Volumen/Preis Welle 1c, Strafen + Paletten Welle 2b). Deterministisch: Seeds 1–5,
// Modus „economy“ (Startkapital 85.000 €). Bericht nach 5 und 10 Spieltagen, Amortisation bis 20 Tage.
// Aufruf: node tests/balance-hub.mjs [--json] [--only gut,start] [--seeds 1,2] [--serial]
//   Ohne --serial läuft je Szenario ein eigener Node-Prozess (gleiche Zahlen, kürzere Laufzeit).
// Szenarien (Depot-Grundausstattung jeweils: Dock, Regal, Lieferwagen). Paketszenarien nehmen nur Paketangebote an (W2b;
// seit W2a gibt es ab Tag 3 Palettenangebote, die ohne Stapler nicht entladen werden können).
//  start    – 1 Lagerkraft, 1 Fahrer, nur Startvertrag (trägt sich der erste Vertrag allein?).
//  gut      – 1 Lagerkraft, 1 Fahrer; Startvertrag sofort. Weitere Angebote nimmt der Spieler nur an, solange die
//             Tagesmenge aller laufenden Verträge CAPACITY (380 Pakete/Tag, gemessene Leistung 1 Lagerkraft + 1 Lieferwagen)
//             nicht übersteigt; unter passenden Angeboten das mit dem höchsten Tageserlös.
//             Disposition: Sammeltour (2–4 Aufträge) bzw. Einzellieferung, sobald ein Auftrag fertig sortiert ist,
//             frühe Fälligkeit zuerst; keine Abfahrt, die nach Schichtende zurückkäme.
//  ausbau   – ab Tag 2 Sortierplatz, stets drei Verträge (nächstes Angebot), kein zweites Fahrzeug (erster Ausbau).
//  ueberlast – stets drei Paketverträge (nächstes Angebot) ohne Sortierplatz und ohne zweites Fahrzeug (Überannahme).
//  traege   – wie gut, aber Disposition erst ab 14:00 und ohne Rücksicht aufs Schichtende (Wirkung von Verspätung).
//  schlecht – wie gut, aber ohne Fahrer (zu wenig Personal): Pakete bleiben liegen.
//  zweitwagen – wie gut; zu Beginn von Tag 2 zweiter Lieferwagen + zweiter Fahrer, Kapazität 2 × 380 Pakete/Tag (W2b).
//  zweitwagenlager – wie zweitwagen, zusätzlich zweite Lagerkraft (Sortierung/Beladung für 760 Pakete/Tag).
//  paletten – wie gut; zu Beginn von Tag 2 Staplerplatz + Lkw + zweiter Fahrer. Palettenverträge bis PALLET_CAP
//             Paletten/Tag, zugestellt nur mit dem Lkw (volle Touren bis 20 Paletten), Pakete weiter mit dem Lieferwagen (W2b).
//  paltraege – wie paletten, aber Paletten werden erst ab 14:00 und ohne Rücksicht aufs Schichtende disponiert.
// Ist das Angebotsfenster voll (3 offene Angebote) und passt keins, lehnen zweitwagen/paletten/paltraege das älteste
// unpassende Angebot ab, damit neue erscheinen (regulärer Befehl cancelContract auf ein Angebot).
// Ausbau-Amortisation (zweitwagen, zweitwagenlager, paletten): Tage nach dem Ausbau, bis das kumulierte Mehr-Betriebsergebnis gegenüber
// „gut“ (gleicher Seed) die Investition des Ausbaus erreicht. Nur reguläre Spielerbefehle über sim.command.
import {Simulation} from '../dist/core.js';
import {VEHICLES,ITEMS} from '../dist/catalog.js';
import {maxLoad} from '../dist/transport.js';
import {unitOf} from '../dist/contracts.js';
import {fileURLToPath} from 'node:url';

const START=480,DAY=1440,REPORT=START+5*DAY,REPORT10=START+10*DAY,END=START+20*DAY,SHIFT_END=960,MARGIN=20;
const SCENARIOS={
 start:{staff:['warehouse','driver'],dispatchFrom:480,contracts:1},
 gut:{staff:['warehouse','driver'],dispatchFrom:480,capacity:380},
 ausbau:{staff:['warehouse','driver'],dispatchFrom:480,contracts:3,sorter:true},
 ueberlast:{staff:['warehouse','driver'],dispatchFrom:480,contracts:3},
 traege:{staff:['warehouse','driver'],dispatchFrom:840,ignoreShift:true,capacity:380},
 schlecht:{staff:['warehouse'],dispatchFrom:480,capacity:380},
 zweitwagen:{staff:['warehouse','driver'],dispatchFrom:480,capacity:380,second:{capacity:760,vehicle:'van'},reject:true},
 zweitwagenlager:{staff:['warehouse','driver'],dispatchFrom:480,capacity:380,second:{capacity:760,vehicle:'van',staff:['warehouse']},reject:true},
 paletten:{staff:['warehouse','driver'],dispatchFrom:480,capacity:380,second:{vehicle:'truck',forklift:true},pallets:true,reject:true},
 paltraege:{staff:['warehouse','driver'],dispatchFrom:480,capacity:380,second:{vehicle:'truck',forklift:true},pallets:true,reject:true,palletFrom:840,palletIgnoreShift:true}
};
const PALLET_CAP=40,perDay=k=>k.arrivals.reduce((n,a)=>n+a.parcels,0);
const cmd=(sim,c)=>{const r=sim.command(c);if(!r.ok)throw new Error(`${c.type}: ${r.message}`);return r;};
const cents=n=>Math.round(n*100)/100;

function ready(s,o){return s.batches.filter(b=>b.item===o.item&&b.location==='stock'&&b.owner===o.id&&b.site===o.site).reduce((n,b)=>n+b.qty-(b.reserved||0),0);}
function committed(s,o){
 const sh=s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0);
 const tr=(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
 return sh+tr;
}

function dispatchVehicle(sim,cfg,v,item){
 const s=sim.state,minute=s.t%DAY,pallet=item==='pallet';
 const from=pallet&&cfg.palletFrom?cfg.palletFrom:cfg.dispatchFrom,ignoreShift=pallet?!!cfg.palletIgnoreShift:!!cfg.ignoreShift;
 if(minute<from||(!ignoreShift&&minute>=SHIFT_END))return;
 const maxQty=pallet?maxLoad(v,'pallet'):Math.floor((VEHICLES[v.type].weightCapacity||v.capacity*4)/ITEMS.parcel.weight);
 // Nur vollständig eingelagerte/sortierte Restmengen eines Auftrags fahren (keine Kleinstfahrten).
 const cand=s.orders.filter(o=>o.source==='hub'&&o.status==='active'&&o.item===item).map(o=>({o,rest:o.qty-o.delivered-committed(s,o),ready:ready(s,o)}))
  .filter(x=>x.rest>0&&x.ready>=x.rest).sort((a,b)=>a.o.due-b.o.due);
 const stops=[];let load=0;
 for(const x of cand){if(stops.length===4)break;const q=Math.min(x.rest,maxQty-load);if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
 // Planzeit wie tours.js (Beladen, Anfahrt, je Stopp Entladen, Weiterfahrt, Rückfahrt; Fahrzeiten / Tempo).
 const sp=VEHICLES[v.type].speed,minutes=list=>2+Math.ceil(list.reduce((n,x)=>n+x.qty,0)/5)+Math.ceil(30/sp)+list.reduce((n,x,i)=>n+(i?Math.ceil(20/sp):0)+2+Math.ceil(x.qty/10),0)+Math.ceil(30/sp);
 while(stops.length&&!ignoreShift&&minute+minutes(stops)+MARGIN>SHIFT_END)stops.pop();
 if(!stops.length)return;
 if(stops.length>1)cmd(sim,{type:'dispatchTour',vehicleId:v.id,stops});
 else cmd(sim,{type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty});
}
function dispatch(sim,cfg){
 for(const v of sim.state.vehicles)if(v.status==='idle'&&v.condition>=15)dispatchVehicle(sim,cfg,v,v.type==='truck'?'pallet':'parcel');
}

function contractsStep(sim,cfg){
 const s=sim.state,active=s.contracts.filter(k=>k.status==='active'),offers=s.contracts.filter(k=>k.status==='offer');
 const second=cfg.second&&s.t>=START+DAY,cap=second&&cfg.second.capacity||cfg.capacity;
 const parcelLoad=active.filter(k=>unitOf(k)==='parcel').reduce((n,k)=>n+perDay(k),0);
 const palletLoad=active.filter(k=>unitOf(k)==='pallet').reduce((n,k)=>n+perDay(k),0);
 const fitsParcel=k=>unitOf(k)==='parcel'&&parcelLoad+perDay(k)<=cap;
 const fitsPallet=k=>cfg.pallets&&second&&unitOf(k)==='pallet'&&palletLoad+perDay(k)<=PALLET_CAP;
 if(cfg.capacity){
  const best=list=>list.sort((a,b)=>perDay(b)*b.pricePerParcel-perDay(a)*a.pricePerParcel)[0];
  const offer=best(offers.filter(fitsPallet))||best(offers.filter(fitsParcel));
  if(offer){cmd(sim,{type:'acceptContract',id:offer.id});return;}
  if(cfg.reject&&second&&offers.length>=3){cmd(sim,{type:'cancelContract',id:offers[0].id});}
 }
 else if(active.length<cfg.contracts){const offer=offers.find(k=>unitOf(k)==='parcel');if(offer)cmd(sim,{type:'acceptContract',id:offer.id});}
}

const CATEGORY={'Umsatz':'umsatz','personal':'personal','construction':'bau','Fuhrpark':'fuhrpark','Transport':'transport','Energie':'energie','Miete':'miete','Zinsen':'zinsen','Vertragsstrafe':'strafe'};
function report(s,name,seed,money0,invest,daily){
 const cat={};for(const l of s.ledger){const k=CATEGORY[l.category]||l.category;cat[k]=cents((cat[k]||0)+l.amount);}
 const hub=s.orders.filter(o=>o.source==='hub'),due=new Map(hub.map(o=>[o.id,o]));
 // Pünktlichkeit je zugestellter Einheit (Lieferung bzw. Tourstopp): Zustellzeit gegen Auftragsfrist, getrennt nach Paket/Palette.
 const u={parcel:{in:0,onTime:0,late:0},pallet:{in:0,onTime:0,late:0}};let lateDiscount=0;
 for(const o of hub)u[o.item].in+=o.qty;
 const legs=[...s.shipments.filter(x=>x.deliveredAt!=null),...(s.tours||[]).flatMap(t=>t.stops).filter(x=>x.deliveredAt!=null)];
 for(const x of legs){const o=due.get(x.orderId);if(!o)continue;if(x.deliveredAt>o.due){u[o.item].late+=x.qty;lateDiscount+=x.qty*o.price*0.1;}else u[o.item].onTime+=x.qty;}
 const pct=x=>x.onTime+x.late?+(x.onTime/(x.onTime+x.late)*100).toFixed(1):0;
 const open=hub.filter(o=>o.status==='active').reduce((n,o)=>n+o.qty-o.delivered,0);
 return {scenario:name,seed,invest,money:cents(s.money),result:cents(s.money-money0),daily,cat,
  contracts:s.contracts.filter(k=>k.status!=='offer'&&k.acceptedAt<=s.t).map(k=>({unit:unitOf(k),shipper:k.shipper,price:k.pricePerParcel,sla:k.slaMinutes,days:k.durationDays,arrivals:k.arrivals.map(a=>`${a.minute/60}h:${a.parcels}`).join('+')})),
  parcelsIn:u.parcel.in,delivered:u.parcel.onTime+u.parcel.late,onTime:u.parcel.onTime,late:u.parcel.late,punctuality:pct(u.parcel),
  palletsIn:u.pallet.in,palletsDelivered:u.pallet.onTime+u.pallet.late,palletsLate:u.pallet.late,palletPunctuality:pct(u.pallet),
  open,lateDiscount:cents(lateDiscount),reputation:s.reputation};
}
const pos={forklift:[12,2],sorter:[8,6]};
function run(name,seed){
 const cfg=SCENARIOS[name],sim=new Simulation({mode:'economy',seed}),s=sim.state,money0=s.money;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:13,rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:8,y:2,rotation:0});
 for(const role of cfg.staff)cmd(sim,{type:'hire',role});
 cmd(sim,{type:'buyVehicle',vehicleType:'van'});
 let invest=cents(money0-s.money),expansion=0;
 cmd(sim,{type:'acceptContract',id:s.contracts[0].id});
 const daily=[],opDaily=[];let payback=null,out=null,out10=null;
 const opResult=()=>s.ledger.filter(l=>!['construction','Fuhrpark'].includes(l.category)&&!/^hire:/.test(l.key)).reduce((n,l)=>n+l.amount,0);
 while(s.t<END){
  contractsStep(sim,cfg);
  // Ausbau zu Beginn des zweiten Spieltags (HUD „Tag 2“).
  if(s.t===START+DAY&&(cfg.sorter||cfg.second)){const m=s.money;
   if(cfg.sorter)cmd(sim,{type:'build',buildingType:'sorter',x:pos.sorter[0],y:pos.sorter[1],rotation:0});
   if(cfg.second?.forklift)cmd(sim,{type:'build',buildingType:'forklift',x:pos.forklift[0],y:pos.forklift[1],rotation:0});
   if(cfg.second){cmd(sim,{type:'buyVehicle',vehicleType:cfg.second.vehicle});cmd(sim,{type:'hire',role:'driver'});for(const role of cfg.second.staff||[])cmd(sim,{type:'hire',role});}
   expansion=cents(m-s.money);invest=cents(invest+expansion);}
  dispatch(sim,cfg);
  sim.step(1);
  if(payback==null&&opResult()>=invest)payback=cents((s.t-START)/DAY);
  if((s.t-START)%DAY===0){if(s.t<=REPORT)daily.push(cents(s.money));opDaily.push(cents(opResult()));}
  if(s.t===REPORT)out=report(s,name,seed,money0,invest,daily);
  if(s.t===REPORT10)out10=report(s,name,seed,money0,invest,daily);
 }
 out.payback=payback;out.expansion=expansion;out.opDaily=opDaily;
 out.d10={result:out10.result,strafe:out10.cat.strafe||0,punctuality:out10.punctuality,palletPunctuality:out10.palletPunctuality,open:out10.open,palletsDelivered:out10.palletsDelivered,palletsLate:out10.palletsLate,umsatz:out10.cat.umsatz||0};
 return out;
}

const onlyArg=process.argv.indexOf('--only'),only=onlyArg>0?process.argv[onlyArg+1].split(','):Object.keys(SCENARIOS);
const seedArg=process.argv.indexOf('--seeds'),SEEDS=seedArg>0?process.argv[seedArg+1].split(',').map(Number):[1,2,3,4,5];
let rows=[];
if(only.length>1&&!process.argv.includes('--serial')){
 const self=fileURLToPath(import.meta.url);
 const jobs=only.map(name=>new Promise((res,rej)=>{import('node:child_process').then(({execFile})=>execFile(process.execPath,[self,'--json','--serial','--only',name,'--seeds',SEEDS.join(',')],{maxBuffer:1<<28},(e,out)=>e?rej(e):res(JSON.parse(out))));}));
 rows=(await Promise.all(jobs)).flat();
}else for(const name of only)for(const seed of SEEDS)rows.push(run(name,seed));
// Ausbau-Amortisation gegen „gut“ (gleicher Seed): volle Tage seit dem Ausbau (Beginn Tag 2), bis Δ Betriebsergebnis ≥ Ausbauinvestition.
// opDaily[i] = Betriebsergebnis am Ende von Spieltag i+1, also i Tage nach dem Ausbau.
for(const r of rows){if(!r.expansion)continue;const g=rows.find(x=>x.scenario==='gut'&&x.seed===r.seed);if(!g)continue;
 const d=r.opDaily.findIndex((v,i)=>v-g.opDaily[i]>=r.expansion);r.expansionPayback=d<0?null:d;r.extraPerDay=cents((r.opDaily[9]-g.opDaily[9]-(r.opDaily[1]-g.opDaily[1]))/8);}
if(process.argv.includes('--json')){console.log(JSON.stringify(rows));process.exit(0);}
const fmt=n=>n.toLocaleString('de-DE',{maximumFractionDigits:0});
console.log('Szenario    Seed  Invest  Erg.5T  Erg.10T  Umsatz5T  Strafe5T  Strafe10T  Amort.  AusbauAmort.  Pakete an/zu  pünktl.%  Pal an/zu  Pal pü.%  offen10T  Verträge');
for(const r of rows)console.log([r.scenario.padEnd(10),String(r.seed).padStart(4),fmt(r.invest).padStart(7),fmt(r.result).padStart(7),fmt(r.d10.result).padStart(8),fmt(r.cat.umsatz||0).padStart(9),fmt(r.cat.strafe||0).padStart(9),fmt(r.d10.strafe).padStart(10),String(r.payback??'>20').padStart(7),String(r.expansion?(r.expansionPayback??'>20'):'–').padStart(13),`${r.parcelsIn}/${r.delivered}`.padStart(13),String(r.punctuality).padStart(9),`${r.palletsIn}/${r.palletsDelivered}`.padStart(10),String(r.palletPunctuality).padStart(9),String(r.d10.open).padStart(9),' '+r.contracts.map(k=>`${k.unit==='pallet'?'P ':''}${k.price}€/${k.sla/60}h/${k.arrivals}`).join(' | ')].join(' '));
const avg=(name,f)=>{const list=rows.filter(r=>r.scenario===name);return list.reduce((n,r)=>n+f(r),0)/list.length;};
console.log('\nMittel Seeds 1–5:');
for(const name of only)console.log(`${name.padEnd(10)} Erg.5T ${fmt(avg(name,r=>r.result))} € · Erg.10T ${fmt(avg(name,r=>r.d10.result))} € · Umsatz5T ${fmt(avg(name,r=>r.cat.umsatz||0))} € · Strafe 5T/10T ${fmt(avg(name,r=>r.cat.strafe||0))}/${fmt(avg(name,r=>r.d10.strafe))} € · Pünktl. Pakete ${avg(name,r=>r.punctuality).toFixed(1)} % · Paletten 10T ${fmt(avg(name,r=>r.d10.palletsDelivered))} (pü. ${avg(name,r=>r.d10.palletPunctuality).toFixed(1)} %) · Amort. ${rows.filter(r=>r.scenario===name).map(r=>r.payback??'>20').join('/')}${rows.some(r=>r.scenario===name&&r.expansion)?` · Ausbau-Amort. ${rows.filter(r=>r.scenario===name).map(r=>r.expansionPayback??'>20').join('/')} (Mehrergebnis/Tag ${fmt(avg(name,r=>r.extraPerDay||0))} €)`:''}`);
