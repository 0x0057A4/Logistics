// A02 Balancing 0.15 (docs/BALANCING-0.15.md). Deterministisch, nur reguläre Spielerbefehle (sim.command) und sim.step,
// außer wo ausdrücklich als Teilsimulation gekennzeichnet. Aufruf:
//   node tests/balance-015.mjs offers   – erreichbare Vertragsmenge Pakete/Tag (alle Paket- und Paketcontainer-Angebote angenommen)
//   node tests/balance-015.mjs belt     – Teilsimulation Sortierstufe: Handsortierung, n Sortierplätze, Quergurt je Tagesmenge
//   node tests/balance-015.mjs ware     – Vollsimulation Kühlpaket/Sperrgut gegen „gut“ (15 Spieltage, Seeds 1–5)
//   node tests/balance-015.mjs vas      – Vollsimulation Mehrwertdienste gegen eigene Fertigung (10 Spieltage, Seeds 1–5)
// Optionen: --seeds 1,2  --json
import {Simulation} from '../dist/core.js';
import {BUILDINGS,VEHICLES,ITEMS,RESEARCH} from '../dist/catalog.js';
import {unitOf,wareOf,TERMS} from '../dist/contracts.js';
import {maxLoad} from '../dist/transport.js';
import {guv,assetRegister} from '../dist/accounting.js';
import {fileURLToPath} from 'node:url';

const START=480,DAY=1440,SHIFT_END=960,MARGIN=20;
const part=process.argv[2]||'belt';
const seedArg=process.argv.indexOf('--seeds'),SEEDS=seedArg>0?process.argv[seedArg+1].split(',').map(Number):[1,2,3,4,5];
// Erkundung: --set crossbelt.cost=68000,megahub.cost=12000 überschreibt Katalogwerte nur in diesem Prozess.
const setArg=process.argv.indexOf('--set');
// TERMS-Pfade mit Präfix T. (z. B. T.ware.parcel_cold.surcharge=6, Listen mit „:“ wie T.ware.bulky.units=20:40), VAS-Satz: vas=0.25.
export const OVERRIDE={vas:null};
if(setArg>0)for(const kv of process.argv[setArg+1].split(',')){const [path,val]=kv.split('='),v=val.includes(':')?val.split(':').map(Number):Number(val);
 if(path==='vas'){OVERRIDE.vas=v;continue;}
 const parts=path.split('.');let o=parts[0]==='T'?TERMS:BUILDINGS[parts[0]]||RESEARCH[parts[0]];const keys=parts[0]==='T'?parts.slice(1):parts.slice(1);
 for(const k of keys.slice(0,-1))o=o[k];o[keys.at(-1)]=v;}
const cmd=(sim,c)=>{const r=sim.command(c);if(!r.ok)throw new Error(`${c.type}: ${r.message}`);return r;};
const cents=n=>Math.round(n*100)/100;
const fmt=n=>Math.round(n).toLocaleString('de-DE');

// ---------------------------------------------------------------------------------------------------------------
// offers: Wie viele Pakete/Tag kann ein Spieler an einem Standort überhaupt unter Vertrag nehmen?
function offers(){
 const out=[];
 for(const seed of SEEDS){
  const sim=new Simulation({mode:'economy',seed}),s=sim.state;
  s.money=1e9; // nur Angebotsfluss messen; Betrieb findet nicht statt
  cmd(sim,{type:'build',buildingType:'dock',x:2,y:13,rotation:0});
  const vols=[];
  while(s.t<START+20*DAY){
   for(const k of s.contracts.filter(k=>k.status==='offer')){const u=unitOf(k);if((u==='parcel'&&!wareOf(k))||(u==='container'&&k.content==='parcel'))cmd(sim,{type:'acceptContract',id:k.id});}
   sim.step(1);
   if((s.t-START)%DAY===720)vols.push(s.contracts.filter(k=>k.status==='active'&&k.startT<=s.t&&(unitOf(k)==='parcel'&&!wareOf(k)||unitOf(k)==='container')).reduce((n,k)=>n+k.arrivals.reduce((m,a)=>m+a.parcels,0),0));
  }
  out.push({seed,vols});
 }
 return out;
}

// ---------------------------------------------------------------------------------------------------------------
// belt: TEILSIMULATION der Sortierstufe. Pakete werden je Tag gleichmäßig auf die Ankunftsminuten 08:30–12:00 verteilt
// direkt inbound gebucht (inventory.add, wie megahub-own.test.js), sortierte Ware wird in der Folgeminute aus stock
// entnommen (ersetzt Zustellung). Entladen, Beladen und Zustellung finden NICHT statt. Sortierfrist = Ankunft + 270 Min.
// (Frist 5–8 h abzüglich ≈ 2 h Beladen/Zustellung). Kosten aus der echten GuV (Lohn, Strom, Abschreibung) als Differenz
// zu einem Lauf ohne Sortierausstattung; Forschung Mega-Hub wird als abgeschlossen gesetzt und gesondert ausgewiesen.
const ARRIVALS=[510,540,570,600,630,660,690,720],SORT_DEADLINE=270,BELT_DAYS=6;
function beltRun(volume,variant){
 const sim=new Simulation({mode:'economy',seed:1}),s=sim.state;s.money=1e7;
 const c=s.contracts[0];cmd(sim,{type:'acceptContract',id:c.id});cmd(sim,{type:'cancelContract',id:c.id});c.settled=true;
 // Hallenraster 20×16, Tor (0,8): Sortierer in zwei Reihen (y 0 und 3, Gang y 2/5), Regale in Reihen y 10/12/14.
 const racks=Math.ceil(volume*0.05/80)+1;
 for(let i=0;i<racks;i++)cmd(sim,{type:'build',buildingType:'rack',x:1+(i%9)*2,y:10+Math.floor(i/9)*2,rotation:0});
 const t0=s.t,base=s.ledger.length;
 let workers=0;
 if(variant.sorters){
  if(variant.sorters*3>30)cmd(sim,{type:'build',buildingType:'power',x:1,y:6,rotation:0});
  for(let i=0;i<variant.sorters;i++)cmd(sim,{type:'build',buildingType:'sorter',x:1+(i%6)*3,y:Math.floor(i/6)*3,rotation:0});
  workers=variant.sorters+(variant.extra||0);
 }else if(variant.belt){
  s.research.push({id:'research-x',key:'megahub',site:'site-1',status:'completed',duration:0,remaining:0,startedAt:s.t});
  cmd(sim,{type:'build',buildingType:'crossbelt',x:1,y:0,rotation:0});
  workers=2+(variant.extra||0);
 }else workers=variant.hand||0;
 for(let i=0;i<workers;i++)cmd(sim,{type:'hire',role:'warehouse'});
 const orders=[];let late=0,sorted=0,offered=0,left=0,busy=0;
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
  for(const w of s.workers)if(w.task&&/:(sort2?|handsort)$/.test(w.task)&&s.t>=START+DAY)busy+=w.wage/60;
  for(const b of s.batches.filter(b=>b.item==='parcel'&&b.location==='stock'&&b.qty>0)){
   const o=orders.find(o=>o.id===b.owner),q=b.qty;sim.api.inventory.remove(b.id,q);
   if(o&&o.day>=1){sorted+=q;if(s.t>o.due)late+=q;}
  }
  // Tagesende: nicht sortierte Pakete gelten als offen (Strafe wie offene Pakete) und verlassen den Standort.
  if(s.t%DAY===DAY-1)for(const b of s.batches.filter(b=>b.item==='parcel'&&b.location==='inbound'&&b.qty>0)){left+=b.qty;sim.api.inventory.remove(b.id,b.qty);}
 }
 // Kosten der Sortierstufe: Lohn/Strom/Abschreibung ab t0 abzüglich gleichem Lauf ohne Ausstattung (Miete, Regale).
 const g=guv(s,{from:START+DAY,to:end-1});
 const days=BELT_DAYS-1;
 return {volume,variant:variant.name,workers,busy:busy/days,personnel:-g.expenses.personnel/days,energy:-g.expenses.energy/days,depreciation:-g.depreciation/days,
  invest:(variant.sorters?variant.sorters*BUILDINGS.sorter.cost+(variant.sorters*3>30?BUILDINGS.power.cost:0):variant.belt?BUILDINGS.crossbelt.cost:0)+workers*350,
  onTime:sorted?(sorted-late)/offered:0,late,left,offered};
}
function belt(){
 const VOL=[500,1000,1500,2000,3000,4000,5000,6000,8000,10000];
 const rows=[],baseCost={};
 for(const v of VOL){
  const b=beltRun(v,{name:'leer'});baseCost[v]=b.energy+b.depreciation;
  const variants=[{name:'Hand',hand:1}];
  for(let n=1;n<=12;n++)variants.push({name:`${n} Sortierplätze`,sorters:n});
  variants.push({name:'Quergurt',belt:true},{name:'Quergurt+1',belt:true,extra:1});
  for(const vr of variants){const r=beltRun(v,vr);r.energy-=b.energy;r.depreciation-=b.depreciation;r.cost=r.personnel+r.energy+r.depreciation;
   // Verspätete Pakete: Strafe 2,50 € + Abschlag 10 % (≈ 0,78 €); nicht sortierte zählen wie offene Pakete (8 €).
   r.penalty=(r.late*(2.5+0.775)+r.left*8)/(BELT_DAYS-1);r.total=r.cost+r.penalty;r.pooled=r.busy+r.energy+r.depreciation+r.penalty;rows.push(r);}
 }
 return rows;
}
/** Je Tagesmenge: günstigste Sortierplatzzahl mit ≥ 99 % pünktlich gegen Quergurt (Kopfzahl- und Arbeitszeitsicht).
 *  Amortisation = Mehrinvestition (Quergurt + Forschung − Sortierplätze − Energieversorgung) / Geldersparnis je Tag (ohne AfA). */
function beltSummary(rows){
 const out=[];
 for(const v of [...new Set(rows.map(r=>r.volume))]){
  const list=rows.filter(r=>r.volume===v),ok=list.filter(r=>r.variant.includes('Sortierpl')&&r.onTime>=0.99);
  const sorter=ok.sort((a,b)=>a.total-b.total)[0],beltRow=list.find(r=>r.variant==='Quergurt'),hand=list.find(r=>r.variant==='Hand');
  const research=RESEARCH.megahub.cost,extra=beltRow.invest+research-sorter.invest;
  const cashS=sorter.total-sorter.depreciation,cashB=beltRow.total-beltRow.depreciation,cashSP=sorter.pooled-sorter.depreciation,cashBP=beltRow.pooled-beltRow.depreciation;
  out.push({volume:v,hand:hand.onTime,sorters:sorter.workers,sorterCost:sorter.total,sorterPooled:sorter.pooled,beltCost:beltRow.total,beltPooled:beltRow.pooled,beltOnTime:beltRow.onTime,
   diff:sorter.total-beltRow.total,diffPooled:sorter.pooled-beltRow.pooled,extra,payback:cashS>cashB?extra/(cashS-cashB):null,paybackPooled:cashSP>cashBP?extra/(cashSP-cashBP):null});
 }
 return out;
}

// ---------------------------------------------------------------------------------------------------------------
// ware: VOLLSIMULATION wie tests/balance-hub.mjs (Wirtschaftsbetrieb 85.000 €, Dock, Regal, Lieferwagen, 1 Lagerkraft,
// 1 Fahrer, Paketverträge bis 380 Pakete/Tag, gleiche Disposition). Ausbau zu Beginn von Tag 2 (00:00, damit der
// Warenangebotsplatz 06:00 ihn sieht). Unerwünschte Warenangebote lehnt der Spieler sofort ab (regulärer Befehl), damit
// am Folgetag ein neues erscheint. Fahrzeuge: Lieferwagen → Pakete, Kühlfahrzeug → Kühlpakete, Lkw → Paletten/Sperrgut.
//  gut        – nur Pakete (Referenz)
//  kuehl      – + Kühllager, Kühlfahrzeug, Fahrer; Kühlverträge bis COLD_CAP Kühlpakete/Tag
//  kuehlvoll  – wie kuehl, aber jedes Kühlangebot angenommen (Fehlplanung: Kühllager 100 Plätze, ein Kühlfahrzeug)
//  sperrgut   – + Staplerplatz, Lkw, Fahrer; Sperrgutverträge bis BULKY_CAP Stück/Tag
//  sperrvan   – + Staplerplatz, aber kein Lkw (Fehlplanung: Lieferwagen fasst 3 Stück); jedes Sperrgutangebot angenommen
//  paletten   – + Staplerplatz, Lkw, Fahrer; Palettenverträge bis 40 Paletten/Tag (wie BALANCING-0.10-W2)
//  palsperr   – wie paletten, zusätzlich Sperrgut bis BULKY_CAP auf demselben Lkw
const WARE_DAYS=15,COLD_CAP=160,BULKY_CAP=120,PALLET_CAP=40,PARCEL_CAP=380;
const WARE_SCEN={
 gut:{},
 kuehl:{exp:{build:['coldstore','dock'],vehicle:'refrigerated',driver:true},cold:COLD_CAP},
 kuehlvoll:{exp:{build:['coldstore','dock'],vehicle:'refrigerated',driver:true},cold:Infinity},
 sperrgut:{exp:{build:['forklift','dock','rack2','rack3'],vehicle:'truck',driver:true},bulky:BULKY_CAP},
 sperrvan:{exp:{build:['forklift','dock','rack2','rack3']},bulky:Infinity},
 paletten:{exp:{build:['forklift'],vehicle:'truck',driver:true},pallets:PALLET_CAP},
 palsperr:{exp:{build:['forklift','dock','rack2','rack3'],vehicle:'truck',driver:true},pallets:PALLET_CAP,bulky:BULKY_CAP}
};
const POS={coldstore:['coldstore',12,2],forklift:['forklift',16,2],dock:['dock',6,13],rack2:['rack',12,6],rack3:['rack',15,6]};
const perDay=k=>k.arrivals.reduce((n,a)=>n+a.parcels,0);
const kind=k=>k?wareOf(k)||unitOf(k):'parcel';
function readyQty(s,o){return s.batches.filter(b=>b.item===o.item&&b.location==='stock'&&b.owner===o.id&&b.site===o.site&&!b.blocked&&!b.locked).reduce((n,b)=>n+b.qty-(b.reserved||0),0);} // 0.16: gesperrte (Kühlschaden) Chargen sind nicht versandfähig
function committedQty(s,o){
 const sh=s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&!['cancelled','complete'].includes(x.status)).reduce((n,x)=>n+x.qty,0);
 const tr=(s.tours||[]).flatMap(t=>['cancelled','complete'].includes(t.status)?[]:t.stops).filter(x=>x.orderId===o.id&&x.status==='pending').reduce((n,x)=>n+x.qty,0);
 return sh+tr;
}
function wareDispatch(sim,v,items){
 const s=sim.state,minute=s.t%DAY;if(minute<START||minute>=SHIFT_END)return;
 const cand=s.orders.filter(o=>o.source==='hub'&&o.status==='active'&&items.includes(o.item)).map(o=>({o,rest:o.qty-o.delivered-committedQty(s,o),ready:readyQty(s,o)}))
  .filter(x=>x.rest>0&&x.ready>=Math.min(x.rest,maxLoad(v,x.o.item))).sort((a,b)=>a.o.due-b.o.due);
 if(!cand.length)return;
 const item=cand[0].o.item,maxQty=maxLoad(v,item);if(maxQty<1)return;
 const stops=[];let load=0;
 for(const x of cand){if(x.o.item!==item)continue;if(stops.length===4)break;const q=Math.min(x.rest,x.ready,maxQty-load);if(q<1)break;stops.push({orderId:x.o.id,qty:q});load+=q;}
 const sp=VEHICLES[v.type].speed,minutes=list=>2+Math.ceil(list.reduce((n,x)=>n+x.qty,0)/5)+Math.ceil(30/sp)+list.reduce((n,x,i)=>n+(i?Math.ceil(20/sp):0)+2+Math.ceil(x.qty/10),0)+Math.ceil(30/sp);
 while(stops.length&&minute+minutes(stops)+MARGIN>SHIFT_END)stops.pop();
 if(!stops.length)return;
 if(stops.length>1)cmd(sim,{type:'dispatchTour',vehicleId:v.id,stops});
 else cmd(sim,{type:'dispatch',orderId:stops[0].orderId,vehicleId:v.id,qty:stops[0].qty});
}
function wareContracts(sim,cfg,expanded){
 const s=sim.state,active=s.contracts.filter(k=>k.status==='active'),offers=s.contracts.filter(k=>k.status==='offer');
 const load=x=>active.filter(k=>kind(k)===x).reduce((n,k)=>n+perDay(k),0);
 const cap={parcel:PARCEL_CAP,parcel_cold:expanded?cfg.cold||0:0,bulky:expanded?cfg.bulky||0:0,pallet:expanded?cfg.pallets||0:0};
 // Warenangebote: passend annehmen, sonst sofort ablehnen (eigener Angebotsplatz).
 for(const k of offers.filter(k=>wareOf(k))){if(load(kind(k))+perDay(k)<=cap[kind(k)])cmd(sim,{type:'acceptContract',id:k.id});else cmd(sim,{type:'cancelContract',id:k.id});return;}
 const fits=k=>['parcel','pallet'].includes(kind(k))&&load(kind(k))+perDay(k)<=cap[kind(k)];
 const best=list=>list.sort((a,b)=>perDay(b)*b.pricePerParcel-perDay(a)*a.pricePerParcel)[0];
 const offer=best(offers.filter(k=>kind(k)==='pallet'&&fits(k)))||best(offers.filter(k=>kind(k)==='parcel'&&fits(k)));
 if(offer){cmd(sim,{type:'acceptContract',id:offer.id});return;}
 const regular=offers.filter(k=>!wareOf(k)&&unitOf(k)!=='air');
 if(expanded&&regular.length>=3)cmd(sim,{type:'cancelContract',id:regular[0].id});
}
function wareRun(name,seed){
 const cfg=WARE_SCEN[name],sim=new Simulation({mode:'economy',seed}),s=sim.state,money0=s.money;
 cmd(sim,{type:'build',buildingType:'dock',x:2,y:13,rotation:0});
 cmd(sim,{type:'build',buildingType:'rack',x:8,y:2,rotation:0});
 cmd(sim,{type:'hire',role:'warehouse'});cmd(sim,{type:'hire',role:'driver'});
 cmd(sim,{type:'buyVehicle',vehicleType:'van'});
 cmd(sim,{type:'acceptContract',id:s.contracts[0].id});
 let expansion=0,expanded=false;const opDaily=[],guvDaily=[];
 const opResult=()=>s.ledger.filter(l=>!['construction','Fuhrpark'].includes(l.category)&&!/^hire:/.test(l.key)).reduce((n,l)=>n+l.amount,0);
 while(s.t<START+WARE_DAYS*DAY){
  if(s.t===DAY&&cfg.exp){const m=s.money; // Tag 2, 00:00
   for(const b of cfg.exp.build)cmd(sim,{type:'build',buildingType:POS[b][0],x:POS[b][1],y:POS[b][2],rotation:0});
   if(cfg.exp.vehicle)cmd(sim,{type:'buyVehicle',vehicleType:cfg.exp.vehicle});
   if(cfg.exp.driver)cmd(sim,{type:'hire',role:'driver'});
   expansion=cents(m-s.money);expanded=true;}
  wareContracts(sim,cfg,expanded);
  for(const v of s.vehicles)if(v.status==='idle'&&v.condition>=15){
   const items=v.type==='van'?(cfg.exp&&!cfg.exp.vehicle&&cfg.bulky?['parcel','bulky']:['parcel']):v.type==='refrigerated'?['parcel_cold']:['pallet','bulky'];
   wareDispatch(sim,v,items);
  }
  sim.step(1);
  if(process.env.WDEBUG&&s.t%60===0&&s.t%DAY>=480&&s.t%DAY<=1020&&s.t<5*DAY){const it=process.env.WDEBUG;
   console.log(Math.floor(s.t/DAY)+1,Math.floor(s.t%DAY/60),'veh',s.vehicles.map(v=>v.type[0]+':'+v.status).join(' '),'yard',s.yard.filter(a=>a.phase!=='gone').map(a=>`${a.item||'p'}:${a.phase}${a.waitReason?'('+a.waitReason+')':''}${a.unloaded}/${a.parcels}`).join(','),'b',s.batches.filter(b=>b.item===it&&b.qty>0).map(b=>`${b.location}:${b.qty}`).join(','),'w',s.workers.map(w=>w.role[0]+':'+(w.task||'-')).join(' '),'o',s.orders.filter(o=>o.item===it&&o.status==='active').map(o=>`${o.qty}/${o.delivered}`).join(','));}
  if((s.t-START)%DAY===0){opDaily.push(cents(opResult()));guvDaily.push(guv(s,{from:0,to:s.t}).result);}
 }
 // Kennzahlen je Ware: Umsatz (Zahlungen der Aufträge), Strafen, Pünktlichkeit je Einheit.
 const byOrder=new Map(s.orders.map(o=>[o.id,o])),con=new Map(s.contracts.map(k=>[k.id,k]));
 const items={};const it=x=>items[x]??={in:0,delivered:0,late:0,revenue:0,penalty:0,contracts:0};
 for(const k of s.contracts)if(k.status!=='offer')it(kind(k)).contracts++;
 for(const o of s.orders)if(o.source==='hub'){const x=it(kind(con.get(o.contractId)));x.in+=o.qty;}
 const legs=[...s.shipments.filter(x=>x.deliveredAt!=null),...(s.tours||[]).flatMap(t=>t.stops).filter(x=>x.deliveredAt!=null)];
 for(const l of legs){const o=byOrder.get(l.orderId);if(!o||o.source!=='hub')continue;const x=it(kind(con.get(o.contractId)));x.delivered+=l.qty;if(l.deliveredAt>o.due)x.late+=l.qty;}
 for(const l of s.ledger){const ref=(l.refs||[]).map(r=>byOrder.get(r)).find(o=>o?.source==='hub');if(!ref)continue;const x=it(kind(con.get(ref.contractId)));if(l.category==='Umsatz')x.revenue+=l.amount;if(l.category==='Vertragsstrafe')x.penalty-=l.amount;}
 const g=guv(s,{from:0,to:s.t});
 return {scenario:name,seed,expansion,opDaily,guvDaily,items,guv:{revenue:g.revenue.total,personnel:g.expenses.personnel,energy:g.expenses.energy,penalties:g.expenses.penalties,transport:g.expenses.transport,depreciation:g.depreciation,result:g.result},money:cents(s.money-money0)};
}
function wareAll(){
 const names=process.argv.includes('--only')?process.argv[process.argv.indexOf('--only')+1].split(','):Object.keys(WARE_SCEN);
 return names.flatMap(n=>SEEDS.map(seed=>wareRun(n,seed)));
}
function wareReport(rows){
 // Mehrergebnis gegen gut (gleicher Seed): GuV-Ergebnis Tag 15 und Ausbau-Amortisation (Geld-Betriebsergebnis wie BALANCING-0.10-W2).
 for(const r of rows){const g=rows.find(x=>x.scenario==='gut'&&x.seed===r.seed);if(!g||r===g)continue;
  r.dGuv=cents(r.guv.result-g.guv.result);
  r.dGuvDay=cents((r.guvDaily[14]-g.guvDaily[14]-(r.guvDaily[4]-g.guvDaily[4]))/10);
  const d=r.opDaily.findIndex((v,i)=>v-g.opDaily[i]>=r.expansion);r.payback=d<0?null:d;}
 const names=[...new Set(rows.map(r=>r.scenario))];
 console.log('Szenario   Seed  Invest  GuV 15T  ΔGuV 15T  ΔGuV/Tag(6–15)  Amort.  Ware: Verträge in/zu (verspätet) Umsatz Strafe');
 for(const r of rows){const w=Object.entries(r.items).filter(([k])=>k!=='parcel').map(([k,x])=>`${k} ${x.contracts}V ${x.in}/${x.delivered} (${x.late}) ${fmt(x.revenue)}€ −${fmt(x.penalty)}€`).join(' | ');
  console.log(`${r.scenario.padEnd(10)} ${String(r.seed).padStart(4)} ${fmt(r.expansion).padStart(7)} ${fmt(r.guv.result).padStart(8)} ${r.dGuv==null?'       –':fmt(r.dGuv).padStart(9)} ${r.dGuvDay==null?'              –':fmt(r.dGuvDay).padStart(15)} ${String(r.scenario==='gut'?'–':r.payback??'>14').padStart(7)}  ${w}`);}
 console.log('\nMittel:');
 const avg=(n,f)=>{const l=rows.filter(r=>r.scenario===n);return l.reduce((a,r)=>a+(f(r)||0),0)/l.length;};
 for(const n of names)console.log(`${n.padEnd(10)} GuV 15T ${fmt(avg(n,r=>r.guv.result))} € · ΔGuV ${fmt(avg(n,r=>r.dGuv))} € · ΔGuV/Tag ${fmt(avg(n,r=>r.dGuvDay))} € · AfA ${fmt(avg(n,r=>r.guv.depreciation))} € · Strafen ${fmt(avg(n,r=>r.guv.penalties))} € · Amort. ${rows.filter(r=>r.scenario===n).map(r=>n==='gut'?'–':r.payback??'>14').join('/')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// vas: VOLLSIMULATION Fertigungsbetrieb (Wirtschaftsbetrieb 85.000 €): Montage, Prüfung, Verpackung, 2 Regale, Dock,
// Lieferwagen, 1 Lagerkraft, 1 Fahrer, n Fertigungskräfte (Tagschicht). Kein Hub-Vertrag (Startangebot abgelehnt).
//  leer    – nur Halle (Referenz: Miete)
//  vas1    – nur Lohnfertigung (Mehrwertdienst-Angebote), 1 Fertigungskraft
//  vas3    – nur Lohnfertigung, 3 Fertigungskräfte (Fehlplanung: Personal für Auslastung, die die Angebote nicht liefern)
//  fert1   – nur eigene Fertigungsaufträge (Leuchte), Material je Auftrag eingekauft, 1 Fertigungskraft
//  beide1  – eigene Fertigung zuerst, Lohnfertigung füllt auf, 1 Fertigungskraft
// Lohnfertigungserlös je Satz r: gemessen mit dem Satz aus economy.js; Varianten (--vasrates 0.18,0.25) skalieren nur den
// Lohnfertigungsumsatz (Kosten hängen nicht vom Satz ab; Rundung je Stück vernachlässigt) und sind so gekennzeichnet.
const VAS_DAYS=10;
const VAS_SCEN={leer:{line:false},vas1:{line:true,prod:1,vas:true},vas3:{line:true,prod:3,vas:true},fert1:{line:true,prod:1,fert:true},beide1:{line:true,prod:1,vas:true,fert:true}};
function vasRun(name,seed){
 const cfg=VAS_SCEN[name],sim=new Simulation({mode:'economy',seed}),s=sim.state;
 cmd(sim,{type:'cancelContract',id:s.contracts[0].id});
 if(cfg.line){
  for(const [b,x,y] of [['assembly',5,2],['testing',9,2],['packing',13,2],['rack',2,2],['rack',2,4],['dock',2,13]])cmd(sim,{type:'build',buildingType:b,x,y,rotation:0});
  for(let i=0;i<cfg.prod;i++)cmd(sim,{type:'hire',role:'production'});
  cmd(sim,{type:'hire',role:'warehouse'});cmd(sim,{type:'hire',role:'driver'});cmd(sim,{type:'buyVehicle',vehicleType:'van'});
 }
 const capPerDay=30*(cfg.prod||0); // Leuchten/Tag einer Kraft ≈ 30 (13 Min. Arbeit + Rüsten/Wege)
 while(s.t<START+VAS_DAYS*DAY){
  const open=s.orders.filter(o=>o.status==='active'&&['vas','manufacturing'].includes(o.kind)).reduce((n,o)=>n+o.qty-o.delivered,0);
  for(const o of s.orders.filter(o=>o.status==='offer'&&o.due>s.t+600)){
   if(cfg.fert&&o.kind==='manufacturing'&&o.item==='lamp'&&open+o.qty<=capPerDay*1.5){cmd(sim,{type:'acceptOrder',id:o.id});
    for(const item of ['housing','board','carton'])cmd(sim,{type:'buy',item,qty:o.qty,supplier:'standard'});break;}
   if(cfg.vas&&o.kind==='vas'&&open+o.qty<=capPerDay*1.5){cmd(sim,{type:'acceptOrder',id:o.id});break;}
  }
  const v=s.vehicles.find(v=>v.status==='idle'&&v.condition>=15);
  if(v&&s.t%DAY>=START&&s.t%DAY<SHIFT_END-90)for(const o of s.orders.filter(o=>o.status==='active'&&['vas','manufacturing'].includes(o.kind)).sort((a,b)=>a.due-b.due)){
   const owner=o.kind==='vas'?o.id:'company',free=sim.api.inventory.available(o.item,o.site,owner);
   const rest=o.qty-o.delivered-s.shipments.filter(x=>x.orderId===o.id&&x.deliveredAt==null&&x.status!=='cancelled').reduce((n,x)=>n+x.qty,0);
   const q=Math.min(free,rest,maxLoad(v,o.item));if(q>=Math.min(rest,10)&&q>0){if(sim.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty:q}).ok)break;}
  }
  sim.step(1);
 }
 const g=guv(s,{from:0,to:s.t}),pay=k=>s.ledger.filter(l=>l.category==='Umsatz'&&(l.refs||[]).some(r=>s.orders.find(o=>o.id===r)?.kind===k)).reduce((n,l)=>n+l.amount,0);
 const done=k=>s.orders.filter(o=>o.kind===k&&o.status!=='offer').reduce((n,o)=>n+o.delivered,0);
 // In einem Hub vorhandene, geteilte Mittel (Lagerkraft, Fahrer, Lieferwagen): Lohn, Einstellung, Abschreibung des Wagens.
 const sharedIds=new Set(s.workers.filter(w=>w.role!=='production').map(w=>w.id));
 const shared=-s.ledger.filter(l=>l.category==='personal'&&((l.refs||[]).some(r=>sharedIds.has(r))||[...sharedIds].some(id=>l.key===`hire:${id}`))).reduce((n,l)=>n+l.amount,0)
  +assetRegister(s).rows.filter(a=>a.kind==='vehicle').reduce((n,a)=>n+a.accumulated,0);
 return {scenario:name,seed,shared:cents(shared),result:g.result,revenue:g.revenue.total,vasRevenue:cents(pay('vas')),fertRevenue:cents(pay('manufacturing')),material:g.expenses.material,personnel:g.expenses.personnel,energy:g.expenses.energy,depreciation:g.depreciation,vasPieces:done('vas'),fertPieces:done('manufacturing'),late:s.orders.filter(o=>['vas','manufacturing'].includes(o.kind)&&o.late).length};
}
function vasAll(){
 const names=process.argv.includes('--only')?process.argv[process.argv.indexOf('--only')+1].split(','):Object.keys(VAS_SCEN);
 return names.flatMap(n=>SEEDS.map(seed=>vasRun(n,seed)));
}
function vasReport(rows){
 const rArg=process.argv.indexOf('--vasrates'),rates=rArg>0?process.argv[rArg+1].split(',').map(Number):[0.18,0.25,0.3,0.35,0.4];
 const base=0.35; // Satz in dist/economy.js zum Messzeitpunkt (anpassen, falls geändert)
 const avg=(n,f)=>{const l=rows.filter(r=>r.scenario===n);return l.reduce((a,r)=>a+f(r),0)/l.length;};
 const leer=avg('leer',r=>r.result);
 console.log(`Lohnfertigung gemessen mit Satz ${base}. ΔGuV gegen „leer“ (Mittel Seeds, ${VAS_DAYS} Spieltage):`);
 console.log('Szenario  Stück LF  Stück eig.  Umsatz LF  Umsatz eig.  Material  Personal  Strom  AfA  verspätet  '+rates.map(r=>`ΔGuV@${r}`.padStart(11)).join('')+'   geteilt  '+rates.map(r=>`Grenz@${r}`.padStart(11)).join(''));
 for(const n of [...new Set(rows.map(r=>r.scenario))]){
  const vr=avg(n,r=>r.vasRevenue);
  console.log(`${n.padEnd(9)} ${fmt(avg(n,r=>r.vasPieces)).padStart(8)} ${fmt(avg(n,r=>r.fertPieces)).padStart(11)} ${fmt(vr).padStart(10)} ${fmt(avg(n,r=>r.fertRevenue)).padStart(12)} ${fmt(avg(n,r=>r.material)).padStart(9)} ${fmt(avg(n,r=>r.personnel)).padStart(9)} ${fmt(avg(n,r=>r.energy)).padStart(6)} ${fmt(avg(n,r=>r.depreciation)).padStart(4)} ${fmt(avg(n,r=>r.late)).padStart(10)}  `+rates.map(rate=>fmt(avg(n,r=>r.result)-leer+vr*(rate/base-1)).padStart(11)).join('')+fmt(avg(n,r=>r.shared)).padStart(10)+'  '+rates.map(rate=>fmt(avg(n,r=>r.result+r.shared)-leer+vr*(rate/base-1)).padStart(11)).join(''));
 }
 console.log('Grenz = ΔGuV ohne die in einem Hub ohnehin vorhandene Lagerkraft, Fahrer und Lieferwagen (Lohn, Einstellung, Abschreibung).');
}

// ---------------------------------------------------------------------------------------------------------------
const self=fileURLToPath(import.meta.url);
if(part==='offers'){
 const r=offers();if(process.argv.includes('--json'))console.log(JSON.stringify(r));
 else{console.log('Seed  Pakete/Tag unter Vertrag (Tag 1..20, jeweils 20:00)');for(const x of r)console.log(String(x.seed).padStart(4),x.vols.map(v=>String(v).padStart(5)).join(''));}
}
if(part==='belt'){
 const rows=belt();if(process.argv.includes('--json')){console.log(JSON.stringify(rows));process.exit(0);}
 let v0=null;
 for(const r of rows){if(r.volume!==v0){v0=r.volume;console.log(`\nTagesmenge ${fmt(r.volume)} Pakete`);}
  if(!process.argv.includes('--full')&&!/^(Hand|[1-6] Sortier|Quergurt)/.test(r.variant))continue;
  console.log(`${r.variant.padEnd(18)} Kräfte ${String(r.workers).padStart(2)}  pünktl. ${(r.onTime*100).toFixed(1).padStart(5)} %  Lohn ${fmt(r.personnel).padStart(5)}  Strom ${fmt(r.energy).padStart(4)}  AfA ${fmt(r.depreciation).padStart(4)}  Kosten/Tag ${fmt(r.cost).padStart(5)}  Strafe/Tag ${fmt(r.penalty).padStart(6)}  gesamt/Tag ${fmt(r.total).padStart(6)}  Arbeitszeitkosten/Tag ${fmt(r.pooled).padStart(6)}  Invest ${fmt(r.invest)}`);}
 console.log(`\nZusammenfassung (Quergurt ${fmt(BUILDINGS.crossbelt.cost)} €, Forschung ${fmt(RESEARCH.megahub.cost)} €, Strom ${BUILDINGS.crossbelt.power}):`);
 console.log('Pakete/Tag  Hand pü.%  Sortierpl.  Kosten S/Q (Kopfzahl)  Δ/Tag  Amort.Tage | Kosten S/Q (Arbeitszeit)  Δ/Tag  Amort.Tage');
 for(const x of beltSummary(rows))console.log(`${fmt(x.volume).padStart(10)}  ${(x.hand*100).toFixed(0).padStart(8)}  ${String(x.sorters).padStart(10)}  ${(fmt(x.sorterCost)+' / '+fmt(x.beltCost)).padStart(21)}  ${fmt(x.diff).padStart(5)}  ${String(x.payback?Math.round(x.payback):'nie').padStart(10)} | ${(fmt(x.sorterPooled)+' / '+fmt(x.beltPooled)).padStart(24)}  ${fmt(x.diffPooled).padStart(5)}  ${String(x.paybackPooled?Math.round(x.paybackPooled):'nie').padStart(10)}`);
}
// Vollsimulationen: je Szenario ein eigener Node-Prozess (gleiche Zahlen wie --serial, kürzere Laufzeit).
async function parallel(name,scenarios,runAll,report){
 let rows;
 if(!process.argv.includes('--serial')&&!process.argv.includes('--only')){
  const {execFile}=await import('node:child_process');
  const extra=setArg>0?['--set',process.argv[setArg+1]]:[];
  rows=(await Promise.all(scenarios.map(n=>new Promise((res,rej)=>execFile(process.execPath,[self,name,'--json','--serial','--only',n,'--seeds',SEEDS.join(','),...extra],{maxBuffer:1<<28},(e,out)=>e?rej(e):res(JSON.parse(out))))))).flat();
 }else rows=runAll();
 if(process.argv.includes('--json')&&process.argv.includes('--serial')){console.log(JSON.stringify(rows));process.exit(0);}
 report(rows);
}
if(part==='ware')await parallel('ware',Object.keys(WARE_SCEN),wareAll,wareReport);
if(part==='vas')await parallel('vas',Object.keys(VAS_SCEN),vasAll,vasReport);
