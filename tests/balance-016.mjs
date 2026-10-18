// A02 Balancing 0.16 (docs/BALANCING-0.16.md). Deterministisch, nur reguläre Spielerbefehle (sim.command) und sim.step,
// außer wo ausdrücklich als Teilsimulation gekennzeichnet (belt). Methodik wie tests/balance-015.mjs (ware/belt).
//   node tests/balance-016.mjs disrupt  – Störungen/Wetter: gleicher Betrieb mit/ohne Störungen, Gegenmaßnahmen (Energie, Puffer)
//   node tests/balance-016.mjs roles    – Personalrollen: Staplerfahrer/Torposten gegen Lagerkraft bzw. kein Zusatzpersonal
//   node tests/balance-016.mjs service  – Kundendienst: Anliegen ignorieren / beantworten / mit Kundendienstkraft beantworten
//   node tests/balance-016.mjs cold     – Kühlpaket (wie balance-015 ware „kuehl“/„kuehlvoll“) mit und ohne Störungen
//   node tests/balance-016.mjs belt     – TEILSIMULATION Sortierstufe (Hand, Sortierplätze, Quergurt) wie balance-015 belt
// Optionen: --seeds 1,2  --days 15  --only a,b  --serial  --json
//   --set disruptions.EVENTS.grid.p=0.3,catalog.ROLES.gate.wage=17,catalog.BUILDINGS.sorter.throughput=360,
//         workforce.SPECIALIST_FACTOR=…(nur Anzeige: Konstante, siehe unten), contracts.SATISFACTION.priceSpan=0.1,
//         service.AUTO.riskLead=60, service.RESPONSE_MINUTES.status=240
//   überschreibt veränderliche Objektwerte nur in diesem Prozess (so entstehen die „vorher“-Spalten).
//   Exportierte Skalare (SPECIALIST_FACTOR, HAND_RATE, WEATHER_CHANGE) sind unveränderlich; sie wurden für die
//   Vorher/Nachher-Messung im Quelltext umgestellt (im Bericht genannt).
import {Simulation} from '../dist/core.js';
import * as catalog from '../dist/catalog.js';
import * as disruptions from '../dist/disruptions.js';
import * as contracts from '../dist/contracts.js';
import * as service from '../dist/customer-service.js';
import {maxLoad} from '../dist/transport.js';
import {guv} from '../dist/accounting.js';
import {fileURLToPath} from 'node:url';

const {BUILDINGS,VEHICLES,RESEARCH}=catalog,{unitOf,wareOf}=contracts;
const START=480,DAY=1440,SHIFT_END=960;
const part=process.argv[2]||'disrupt';
const arg=(name,def)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:def;};
const SEEDS=arg('--seeds','1,2,3,4,5').split(',').map(Number),DAYS=Number(arg('--days',15));
const setArg=arg('--set',null);
const MODS={catalog,disruptions,contracts,service};
if(setArg)for(const kv of setArg.split(',')){const [path,val]=kv.split('='),v=val.includes(':')?val.split(':').map(Number):Number(val);
 const parts=path.split('.');let o=MODS[parts[0]];for(const k of parts.slice(1,-1))o=o[k];o[parts.at(-1)]=v;}
const cmd=(sim,c)=>{const r=sim.command(c);if(!r.ok)throw new Error(`${c.type}: ${r.message}`);return r;};
const cents=n=>Math.round(n*100)/100;
const fmt=n=>Math.round(n).toLocaleString('de-DE');
const pct=n=>(n*100).toFixed(1).replace('.',',')+' %';

// ---------------------------------------------------------------------------------------------------------------
// Hub-Betrieb (Vollsimulation, Disposition wie balance-015 ware). cfg:
//  docks, racks, vans, trucks, refr (Fahrzeuge), warehouse, drivers, gate, forklift, service (Personal), sorters, power,
//  coldstore, forkliftBay (Gebäude), cap:{parcel,pallet,parcel_cold,bulky} (Annahmegrenzen je Tag),
//  incidents (Störungen an/aus), margin (Rückkehrpuffer vor Schichtende in Min.), tickets ('ignore'|'respond'|'goodwill').
const POS={dock:[[2,13],[6,13],[10,13],[14,13]],rack:[[8,2],[12,6],[15,6],[12,8],[15,8],[12,10],[15,10]],sorter:[[1,2],[1,5],[4,5],[4,2]],
 power:[[16,2]],coldstore:[[12,2]],forkliftBay:[[17,5]]};
const perDay=k=>k.arrivals.reduce((n,a)=>n+a.parcels,0);
const kind=k=>k?wareOf(k)||unitOf(k):'parcel';
function readyQty(s,o){return s.batches.filter(b=>b.item===o.item&&b.location==='stock'&&b.owner===o.id&&b.site===o.site&&!b.blocked&&!b.locked).reduce((n,b)=>n+b.qty-(b.reserved||0),0);}
function committedQty(s,o){
 const sh=s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0);
 const tr=(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
 return sh+tr;
}
function dispatch(sim,v,items,margin){
 const s=sim.state,minute=s.t%DAY;if(minute<START||minute>=SHIFT_END)return;
 const cand=s.orders.filter(o=>o.source==='hub'&&o.status==='active'&&items.includes(o.item)).map(o=>({o,rest:o.qty-o.delivered-committedQty(s,o),ready:readyQty(s,o)}))
  .filter(x=>x.rest>0&&x.ready>=Math.min(x.rest,maxLoad(v,x.o.item))).sort((a,b)=>a.o.due-b.o.due);
 if(!cand.length)return;
 const item=cand[0].o.item,maxQty=maxLoad(v,item);if(maxQty<1)return;
 const stops=[];let load=0;
 for(const x of cand){if(x.o.item!==item)continue;if(stops.length===4)break;const q=Math.min(x.rest,x.ready,maxQty-load);if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
 const sp=VEHICLES[v.type].speed,minutes=list=>2+Math.ceil(list.reduce((n,x)=>n+x.qty,0)/5)+Math.ceil(30/sp)+list.reduce((n,x,i)=>n+(i?Math.ceil(20/sp):0)+2+Math.ceil(x.qty/10),0)+Math.ceil(30/sp);
 while(stops.length&&minute+minutes(stops)+margin>SHIFT_END)stops.pop();
 if(!stops.length)return;
 // Nicht ausführbare Disposition (z. B. Kühlschaden-Sperre) wird übersprungen, der Spieler versucht es in der nächsten Minute erneut.
 if(stops.length>1)sim.command({type:'dispatchTour',vehicleId:v.id,stops});
 else sim.command({type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty});
}
function acceptContracts(sim,cap){
 const s=sim.state,active=s.contracts.filter(k=>k.status==='active'),offers=s.contracts.filter(k=>k.status==='offer');
 const load=x=>active.filter(k=>kind(k)===x).reduce((n,k)=>n+perDay(k),0),c=x=>cap[x]||0;
 for(const k of offers.filter(k=>wareOf(k))){if(load(kind(k))+perDay(k)<=c(kind(k)))cmd(sim,{type:'acceptContract',id:k.id});else cmd(sim,{type:'cancelContract',id:k.id});return;}
 const fits=k=>['parcel','pallet'].includes(kind(k))&&load(kind(k))+perDay(k)<=c(kind(k));
 const best=list=>list.sort((a,b)=>perDay(b)*b.pricePerParcel-perDay(a)*a.pricePerParcel)[0];
 const offer=best(offers.filter(k=>kind(k)==='pallet'&&fits(k)))||best(offers.filter(k=>kind(k)==='parcel'&&fits(k)));
 if(offer){cmd(sim,{type:'acceptContract',id:offer.id});return;}
 // Unpassende reguläre Angebote ablehnen, damit der Angebotsfluss weiterläuft (wie balance-015 nach Ausbau).
 const regular=offers.filter(k=>!wareOf(k)&&unitOf(k)!=='air');
 if(regular.length>=3)cmd(sim,{type:'cancelContract',id:regular[0].id});
}
function answerTickets(sim,policy){
 if(!policy||policy==='ignore')return;
 const s=sim.state;
 for(const t of s.tickets)if(t.status==='open'){
  const o=s.orders.find(o=>o.id===t.orderId);
  const response=t.kind==='status'?'inform':t.kind==='deadline'?'reject':policy==='goodwill'&&o.paid>0?'goodwill':'apologize';
  sim.command({type:'respondTicket',id:t.id,response});
 }
}
export function hubRun(cfg,seed){
 const sim=new Simulation({mode:'economy',seed}),s=sim.state;
 if(cfg.incidents===false)cmd(sim,{type:'settings',incidents:false});
 if(cfg.loan)cmd(sim,{type:'takeLoan',amount:cfg.loan,requestId:'balance'}); // Betriebskredit für große Ausbauten (Zinsen in allen Varianten gleich)
 const used={};const build=(type,n)=>{for(let i=0;i<n;i++){const k=type==='forkliftBay'?'forklift':type,[x,y]=POS[type][used[type]=(used[type]||0)];used[type]++;cmd(sim,{type:'build',buildingType:k,x,y,rotation:0});}};
 build('dock',cfg.docks??1);build('rack',cfg.racks??1);build('sorter',cfg.sorters||0);build('power',cfg.power||0);build('coldstore',cfg.coldstore||0);build('forkliftBay',cfg.forkliftBay||0);
 const hire=(role,n)=>{for(let i=0;i<n;i++)cmd(sim,{type:'hire',role});};
 hire('warehouse',cfg.warehouse??1);hire('driver',cfg.drivers??1);hire('gate',cfg.gate||0);hire('forklift',cfg.forklift||0);hire('service',cfg.service||0);
 for(const [t,n] of [['van',cfg.vans??1],['truck',cfg.trucks||0],['refrigerated',cfg.refr||0]])for(let i=0;i<n;i++)cmd(sim,{type:'buyVehicle',vehicleType:t});
 cmd(sim,{type:'acceptContract',id:s.contracts[0].id});
 const cap={parcel:380,...cfg.cap},margin=cfg.margin??20;
 const daily=[],ticketCount={},damaged=new Map();let gateWait=0,staffWait=0;
 while(s.t<START+DAYS*DAY){
  acceptContracts(sim,cap);
  answerTickets(sim,cfg.tickets);
  // Externe Wartung nach Schichtende, sobald Zustand < 40 (ohne Wartung stünden die Fahrzeuge ab ≈ Tag 16 still).
  if(s.t%DAY===SHIFT_END+60)for(const v of s.vehicles)if(v.status==='idle'&&v.condition<40)cmd(sim,{type:'serviceVehicleExternal',id:v.id});
  for(const v of s.vehicles)if(v.status==='idle'&&v.condition>=15){
   const items=v.type==='van'?['parcel']:v.type==='refrigerated'?['parcel_cold']:['pallet','bulky'];
   dispatch(sim,v,items,margin);
  }
  sim.step(1);
  if(s.t%DAY===START+600){const w=s.disruptions?.weather?.['site-1'];daily.push({t:s.t,result:guv(s,{from:0,to:s.t}).result,pen:guv(s,{from:0,to:s.t}).expenses.penalties,w:w?w.kind+(w.next?'>'+w.next.kind:''):'-',ev:(s.disruptions?.events||[]).filter(e=>e.startT<s.t+DAY).map(e=>e.kind+(e.endT-e.startT)).join(' ')});}
  if(cfg.coldstore&&s.t%10===0)for(const b of s.batches)if(b.coldDamaged&&!damaged.has(b.id))damaged.set(b.id,b.qty);
  for(const a of s.yard||[]){if(a.waitReason==='Keine Torkontrolle')gateWait++;else if(a.waitReason==='Keine Lagerkraft am Standort')staffWait++;}
 }
 for(const t of s.tickets||[]){const k=t.kind+(t.trigger?':'+t.trigger:'');ticketCount[k]=(ticketCount[k]||0)+1;}
 // Kennzahlen: Einheiten je Ware, Pünktlichkeit, Strafen, Störungsprotokoll.
 const byOrder=new Map(s.orders.map(o=>[o.id,o])),con=new Map(s.contracts.map(k=>[k.id,k]));
 const items={};const it=x=>items[x]??={in:0,delivered:0,late:0,contracts:0};
 for(const k of s.contracts)if(k.status!=='offer')it(kind(k)).contracts++;
 for(const o of s.orders)if(o.source==='hub')it(kind(con.get(o.contractId))).in+=o.qty;
 const legs=[...s.shipments.filter(x=>x.deliveredAt!=null),...(s.tours||[]).flatMap(t=>t.stops).filter(x=>x.deliveredAt!=null)];
 for(const l of legs){const o=byOrder.get(l.orderId);if(!o||o.source!=='hub')continue;const x=it(kind(con.get(o.contractId)));x.delivered+=l.qty;if(l.deliveredAt>o.due)x.late+=l.qty;}
 const g=guv(s,{from:0,to:s.t});
 const evlog=s.disruptions?[...s.disruptions.log,...s.disruptions.events]:[];
 const ev={};for(const e of evlog){ev[e.kind]=(ev[e.kind]||0)+1;ev[e.kind+'Min']=(ev[e.kind+'Min']||0)+e.endT-e.startT;}
 const offers=s.contracts.filter(k=>k.priceAdjust!==undefined);
 return {seed,daily,coldDamaged:[...damaged.values()].reduce((a,b)=>a+b,0),result:g.result,revenue:g.revenue.total,personnel:g.expenses.personnel,penalties:g.expenses.penalties,transport:g.expenses.transport,energy:g.expenses.energy,
  depreciation:g.depreciation,items,ev,tickets:ticketCount,gateWait,staffWait,shippers:s.shippers?Object.fromEntries(Object.entries(s.shippers).map(([n,r])=>[n,r.score])):{},
  priceAdj:offers.length?offers.reduce((n,k)=>n+k.priceAdjust,0)/offers.length:0,adjOffers:offers.length,
  expired:(s.tickets||[]).filter(t=>t.expired).length,closed:(s.tickets||[]).filter(t=>t.status==='closed').length,
  contracts:s.contracts.filter(k=>k.status!=='offer').length,reputation:s.reputation};
}

// Basisbetriebe (gut = BALANCING-0.10-W2/0.15 „gut“; gross = gewachsener Hub mit Sortierplätzen; pal = Palettenausbau W2b; kuehl = 0.15)
const BASE={
 gut:{},
 gross:{docks:2,racks:4,sorters:2,vans:3,drivers:3,warehouse:3,cap:{parcel:1100}},
 pal:{forkliftBay:1,racks:2,trucks:1,drivers:2,cap:{pallet:40}},
 pal2:{loan:40000,forkliftBay:1,docks:2,racks:4,trucks:2,drivers:3,warehouse:2,cap:{pallet:80}},
 hof:{loan:40000,docks:3,racks:5,sorters:2,forkliftBay:1,vans:3,trucks:1,drivers:4,warehouse:3,cap:{parcel:1100,pallet:40}},
 kuehl:{coldstore:1,docks:2,refr:1,drivers:2,cap:{parcel_cold:160}},
 kuehlvoll:{coldstore:1,docks:2,refr:1,drivers:2,cap:{parcel_cold:Infinity}},
};
const S=(base,extra)=>({...BASE[base],...extra,cap:{...BASE[base].cap,...extra?.cap}});
const PARTS={
 disrupt:{
  'gut-aus':S('gut',{incidents:false}),'gut-an':S('gut'),'gut-an-puffer':S('gut',{margin:60}),'gut-aus-reserve':S('gut',{incidents:false,vans:2,drivers:2}),'gut-an-reserve':S('gut',{vans:2,drivers:2}),
  'gross-aus':S('gross',{incidents:false}),'gross-an':S('gross'),'gross-an-energie':S('gross',{power:1}),'gross-aus-energie':S('gross',{power:1,incidents:false}),'gross-an-puffer':S('gross',{margin:60}),'gross-aus-reserve':S('gross',{incidents:false,vans:4,drivers:4}),'gross-an-reserve':S('gross',{vans:4,drivers:4}),
  'pal-aus':S('pal',{incidents:false}),'pal-an':S('pal'),
  'kuehl-aus':S('kuehl',{incidents:false}),'kuehl-an':S('kuehl'),'kuehl-an-energie':S('kuehl',{power:1}),'kuehl-aus-energie':S('kuehl',{power:1,incidents:false}),
 },
 roles:{
  'gut':S('gut'),'gut+lager':S('gut',{warehouse:2}),'gut+tor':S('gut',{gate:1}),
  'gross':S('gross'),'gross+lager':S('gross',{warehouse:4}),'gross+tor':S('gross',{gate:1}),
  'pal':S('pal'),'pal+lager':S('pal',{warehouse:2}),'pal+stapler':S('pal',{forklift:1}),'pal+tor':S('pal',{gate:1}),
  'hofknapp':S('hof',{warehouse:2}),'hofknapp+lager':S('hof',{warehouse:3}),'hofknapp+tor':S('hof',{warehouse:2,gate:1}),'hofknapp+stapler':S('hof',{warehouse:2,forklift:1}),
  'hof':S('hof'),'hof+lager':S('hof',{warehouse:4}),'hof+tor':S('hof',{gate:1}),'hof+stapler':S('hof',{forklift:1}),
  'pal2':S('pal2'),'pal2+lager':S('pal2',{warehouse:3}),'pal2+stapler':S('pal2',{forklift:1}),'pal2+tor':S('pal2',{gate:1}),
 },
 service:{
  'gut-ignor':S('gut',{tickets:'ignore'}),'gut-antw':S('gut',{tickets:'respond'}),'gut-kd':S('gut',{tickets:'respond',service:1}),
  'gross-ignor':S('gross',{tickets:'ignore'}),'gross-antw':S('gross',{tickets:'respond'}),'gross-kd':S('gross',{tickets:'respond',service:1}),'gross-kd-kulanz':S('gross',{tickets:'goodwill',service:1}),
 },
 cold:{
  'gut-an':S('gut'),'gut-aus':S('gut',{incidents:false}),'kuehl-an':S('kuehl'),'kuehl-aus':S('kuehl',{incidents:false}),'kuehlvoll-an':S('kuehlvoll'),
 },
};
function report(name,rows){
 const names=[...new Set(rows.map(r=>r.scenario))];
 const avg=(n,f)=>{const l=rows.filter(r=>r.scenario===n);return l.reduce((a,r)=>a+(f(r)||0),0)/l.length;};
 console.log(`${name}: ${DAYS} Spieltage, Seeds ${SEEDS.join(',')}. GuV = accounting.guv Tag 0–${DAYS} (mit Abschreibung), Mittel der Seeds.`);
 console.log('Szenario              GuV       je Seed                                   Umsatz   Personal  Strafen  zugestellt (verspätet)          Störungen (Anzahl/Min.)            Tickets / abgelaufen / Zufr.Ø / Preis±');
 for(const n of names){
  const l=rows.filter(r=>r.scenario===n);
  const del=Object.keys(l[0].items).map(k=>`${k} ${fmt(avg(n,r=>r.items[k]?.delivered))} (${fmt(avg(n,r=>r.items[k]?.late))})`).join(' ');
  const ev=['jam','gate','grid'].map(k=>`${k} ${avg(n,r=>r.ev[k]).toFixed(1)}/${fmt(avg(n,r=>r.ev[k+'Min']))}`).join(' ');
  const tk=avg(n,r=>Object.values(r.tickets).reduce((a,b)=>a+b,0)),sat=avg(n,r=>{const v=Object.values(r.shippers);return v.length?v.reduce((a,b)=>a+b,0)/v.length:50;});
  console.log(`${n.padEnd(20)} ${fmt(avg(n,r=>r.result)).padStart(8)}  ${l.map(r=>fmt(r.result).padStart(7)).join('')}  ${fmt(avg(n,r=>r.revenue)).padStart(8)} ${fmt(avg(n,r=>r.personnel)).padStart(8)} ${fmt(avg(n,r=>r.penalties)).padStart(8)}  ${del.padEnd(30)}  ${ev.padEnd(34)} ${tk.toFixed(0)} / ${avg(n,r=>r.expired).toFixed(0)} / ${sat.toFixed(1)} / ${pct(avg(n,r=>r.priceAdj))} (${avg(n,r=>r.adjOffers).toFixed(1)})  Kühlschaden ${fmt(avg(n,r=>r.coldDamaged))} Torwarten ${fmt(avg(n,r=>r.gateWait))} Kraftwarten ${fmt(avg(n,r=>r.staffWait))}`);
 }
 // Paarvergleiche: an gegen aus (Störungsverlust), Gegenmaßnahme gegen ohne.
 const pairs=[];
 for(const n of names){
  if(n.includes('-an')){const off=n.replace('-an','-aus');if(names.includes(off)&&!n.endsWith('-puffer'))pairs.push([n,off,'Störungsverlust']);}
  if(n.endsWith('-puffer'))pairs.push([n,n.replace('-puffer',''),'Puffer 60 statt 20 Min.']);
  if(n.endsWith('-an-energie'))pairs.push([n,n.replace('-energie',''),'Energieversorgung (mit Störungen)']);
  if(n.endsWith('-reserve'))pairs.push([n,n.replace('-reserve',''),'Reserve Lieferwagen+Fahrer']);
  if(n.endsWith('-aus-energie'))pairs.push([n,n.replace('-energie',''),'Energieversorgung (ohne Störungen)']);
  const m=n.match(/^(\w+)\+(\w+)$/);if(m&&names.includes(m[1]))pairs.push([n,m[1],'Zusatzkraft '+m[2]]);
  const k=n.match(/^(\w+)-(antw|kd|kd-kulanz)$/);if(k&&names.includes(k[1]+'-ignor'))pairs.push([n,k[1]+'-ignor','gegen ignorieren']);
 }
 const ok=pairs.filter(([a,b])=>names.includes(a)&&names.includes(b));pairs.length=0;pairs.push(...ok);
 if(pairs.length)console.log('\nVergleiche (Mittel, gleiche Seeds):');
 for(const [a,b,label] of pairs){const da=avg(a,r=>r.result),db=avg(b,r=>r.result),per=rows.filter(r=>r.scenario===a).map(r=>fmt(r.result-rows.find(x=>x.scenario===b&&x.seed===r.seed).result)).join(' / ');
  console.log(`${(a+' − '+b).padEnd(38)} ${label.padEnd(34)} Δ ${fmt(da-db).padStart(7)} € (${pct((da-db)/Math.abs(db))})  je Seed ${per}`);}
}

// ---------------------------------------------------------------------------------------------------------------
// belt: TEILSIMULATION der Sortierstufe wie balance-015 belt (Pakete per inventory.add inbound gebucht, sortierte Ware
// entnommen; Entladen/Zustellung fehlen; Sortierfrist Ankunft + 270 Min.). Ausgabe: je Tagesmenge pünktlicher Anteil
// und Kosten/Tag für Hand, 1–6 Sortierplätze, Quergurt. Kosten aus echter GuV (Lohn, Strom, Abschreibung) abzüglich leerem Lauf.
const ARRIVALS=[510,540,570,600,630,660,690,720],SORT_DEADLINE=270,BELT_DAYS=6;
function beltRun(volume,variant){
 const sim=new Simulation({mode:'economy',seed:1}),s=sim.state;s.money=1e7;
 cmd(sim,{type:'settings',incidents:false}); // Sortierstufe ohne Netzstörungen vergleichen
 const c=s.contracts[0];cmd(sim,{type:'acceptContract',id:c.id});cmd(sim,{type:'cancelContract',id:c.id});c.settled=true;
 const racks=Math.ceil(volume*0.05/80)+1;
 for(let i=0;i<racks;i++)cmd(sim,{type:'build',buildingType:'rack',x:1+(i%9)*2,y:10+Math.floor(i/9)*2,rotation:0});
 let workers=0;
 if(variant.sorters){
  if(variant.sorters*3>30)cmd(sim,{type:'build',buildingType:'power',x:1,y:6,rotation:0});
  for(let i=0;i<variant.sorters;i++)cmd(sim,{type:'build',buildingType:'sorter',x:1+(i%6)*3,y:Math.floor(i/6)*3,rotation:0});
  workers=variant.sorters;
 }else if(variant.belt){
  s.research.push({id:'research-x',key:'megahub',site:'site-1',status:'completed',duration:0,remaining:0,startedAt:s.t});
  cmd(sim,{type:'build',buildingType:'crossbelt',x:1,y:0,rotation:0});workers=2;
 }else workers=variant.hand||0;
 for(let i=0;i<workers;i++)cmd(sim,{type:'hire',role:'warehouse'});
 const orders=[];let late=0,sorted=0,offered=0,left=0;
 const end=START+BELT_DAYS*DAY;
 while(s.t<end){
  const m=s.t%DAY,day=Math.floor((s.t-START)/DAY);
  if(day>=1&&ARRIVALS.includes(m)){
   const qty=Math.round(volume/ARRIVALS.length),id=sim.api.id('order');
   s.orders.push({id,kind:'logistics',source:'hub',contractId:c.id,lane:c.lanes[0].id,customer:'Benchmark',item:'parcel',qty,price:7.75,due:s.t+SORT_DEADLINE,quality:0,site:'site-1',status:'active',delivered:0,paid:0});
   if(!sim.api.inventory.add({item:'parcel',qty,site:'site-1',location:'inbound',owner:id}))throw new Error('Lager voll');
   orders.push({id,due:s.t+SORT_DEADLINE,day});offered+=qty;
  }
  sim.step(1);
  for(const b of s.batches.filter(b=>b.item==='parcel'&&b.location==='stock'&&b.qty>0)){
   const o=orders.find(o=>o.id===b.owner),q=b.qty;sim.api.inventory.remove(b.id,q);
   if(o&&o.day>=1){sorted+=q;if(s.t>o.due)late+=q;}
  }
  if(s.t%DAY===DAY-1)for(const b of s.batches.filter(b=>b.item==='parcel'&&b.location==='inbound'&&b.qty>0)){left+=b.qty;sim.api.inventory.remove(b.id,b.qty);}
 }
 const g=guv(s,{from:START+DAY,to:end-1}),days=BELT_DAYS-1;
 return {volume,variant:variant.name,workers,personnel:-g.expenses.personnel/days,energy:-g.expenses.energy/days,depreciation:-g.depreciation/days,
  invest:(variant.sorters?variant.sorters*BUILDINGS.sorter.cost+(variant.sorters*3>30?BUILDINGS.power.cost:0):variant.belt?BUILDINGS.crossbelt.cost:0),
  onTime:sorted?(sorted-late)/offered:0,late,left,offered};
}
function belt(){
 const VOL=(arg('--vol','500,1000,1500,2000,3000,4000,6000,8000')).split(',').map(Number),rows=[];
 for(const v of VOL){
  const b=beltRun(v,{name:'leer'});
  const variants=[{name:'Hand',hand:1}];for(let n=1;n<=8;n++)variants.push({name:`${n} Sortierplätze`,sorters:n});variants.push({name:'Quergurt',belt:true});
  for(const vr of variants){const r=beltRun(v,vr);r.energy-=b.energy;r.depreciation-=b.depreciation;r.cost=r.personnel+r.energy+r.depreciation;
   r.penalty=(r.late*(2.5+0.775)+r.left*8)/(BELT_DAYS-1);r.total=r.cost+r.penalty;rows.push(r);}
 }
 return rows;
}
function beltReport(rows){
 console.log(`Sortierplatz ${BUILDINGS.sorter.throughput}/h, ${fmt(BUILDINGS.sorter.cost)} €; Quergurt ${BUILDINGS.crossbelt.throughput}/h, ${fmt(BUILDINGS.crossbelt.cost)} € (+ Forschung ${fmt(RESEARCH.megahub.cost)} €).`);
 console.log('Pakete/Tag  Hand pü.%/gesamt  | günstigste Sortierplatzzahl ≥99 %: n, Kosten/Tag gesamt | Sortierplätze 1..8: pünktl. % | Quergurt pü.%/gesamt');
 for(const v of [...new Set(rows.map(r=>r.volume))]){
  const l=rows.filter(r=>r.volume===v),hand=l.find(r=>r.variant==='Hand'),belt=l.find(r=>r.variant==='Quergurt');
  const ok=l.filter(r=>r.variant.includes('Sortierpl')&&r.onTime>=0.99).sort((a,b)=>a.total-b.total)[0];
  const best=l.filter(r=>r.variant!=='Quergurt').sort((a,b)=>a.total-b.total)[0];
  console.log(`${fmt(v).padStart(10)}  ${(hand.onTime*100).toFixed(0).padStart(4)} / ${fmt(hand.total).padStart(6)} € | ${ok?`${ok.workers} × ${fmt(ok.total)} €`:'–'} (bestes ohne QG: ${best.variant} ${fmt(best.total)} €) | ${l.filter(r=>r.variant.includes('Sortierpl')).map(r=>(r.onTime*100).toFixed(0)).join(' ')} | ${(belt.onTime*100).toFixed(0)} / ${fmt(belt.total)} €`);
 }
}

// ---------------------------------------------------------------------------------------------------------------
const self=fileURLToPath(import.meta.url);
const main=process.argv[1]===self;
if(!main){}
else if(part==='belt'){const rows=belt();if(process.argv.includes('--json'))console.log(JSON.stringify(rows));else beltReport(rows);}
else if(PARTS[part]){
 const all=PARTS[part],names=process.argv.includes('--only')?arg('--only').split(','):Object.keys(all);
 let rows;
 if(!process.argv.includes('--serial')){
  const {execFile}=await import('node:child_process');
  const jobs=names.flatMap(n=>SEEDS.map(seed=>[n,seed]));let next=0;rows=[];
  const worker=async()=>{while(next<jobs.length){const [n,seed]=jobs[next++];
   const out=await new Promise((res,rej)=>execFile(process.execPath,[self,part,'--serial','--json','--only',n,'--seeds',String(seed),'--days',String(DAYS),...(setArg?['--set',setArg]:[])],{maxBuffer:1<<28},(e,o)=>e?rej(e):res(o)));
   rows.push(...JSON.parse(out));}};
  await Promise.all(Array.from({length:Number(arg('--jobs',4))},worker));
  rows.sort((a,b)=>names.indexOf(a.scenario)-names.indexOf(b.scenario)||a.seed-b.seed);
 }else rows=names.flatMap(n=>SEEDS.map(seed=>({scenario:n,...hubRun(all[n],seed)})));
 if(process.argv.includes('--json'))console.log(JSON.stringify(rows));else report(part,rows);
}
