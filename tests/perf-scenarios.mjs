// Gemeinsame, deterministische Lastszenarien für Benchmark (perf-sim.mjs) und Determinismustest.
// Alle Spielhandlungen laufen über reguläre Befehle. Ausnahmen sind ausdrücklich als Testaufbau markiert:
// (1) api.inventory.add als Ware-Fixture wie in den Bestandstests, (2) historische Nullchargen über fromJSON.
import {Simulation} from '../dist/core.js';
import {ITEMS} from '../dist/catalog.js';

export const cmd=(sim,type,data={})=>{const r=sim.command({type,...data});if(!r.ok)throw new Error(`${type}: ${r.message}`);return r;};
const stockOf=(s,site,item,owner='company')=>s.batches.reduce((n,b)=>b.site===site&&b.item===item&&b.owner===owner&&b.location==='stock'&&!b.blocked&&!b.locked?n+b.qty-b.reserved:n,0);

// Fertigungslinie je Standort. Rasterpositionen sind vom Tor (0,8) erreichbar.
const LINE=[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11]];
const EXTRA=[['rack',2,4],['assembly',5,5],['testing',9,5],['packing',13,5],['rack',6,11],['rack',9,11]];
export function setupSite(sim,site,{big=false}={}){
 for(const [buildingType,x,y]of big?[...LINE,...EXTRA]:LINE)cmd(sim,'build',{buildingType,site,x,y,rotation:0});
 const roles=big?['production','production','production','production','production','production','warehouse','warehouse','driver']:['production','production','production','warehouse','driver'];
 for(const role of roles){const id=cmd(sim,'hire',{role,site}).id;if(big&&role==='production'&&sim.state.workers.filter(w=>w.site===site).length%2)cmd(sim,'setShift',{id,shift:'all'});}
 cmd(sim,'buyVehicle',{vehicleType:'van',site});
 for(const item of ['housing','board','carton'])cmd(sim,'buy',{item,qty:40,supplier:'standard',site});
}

// Spielerpolitik pro Minute: Angebote annehmen, Material nachkaufen, Lieferungen bündeln, Kühltransfer.
export function policy(sim,i,{buy=true,cold=null}={}){
 const s=sim.state;
 if(i%60===0)for(const o of s.orders)if(o.status==='offer'&&o.kind==='manufacturing'&&o.item==='lamp'&&o.due>s.t+600)sim.command({type:'acceptOrder',id:o.id});
 if(buy&&i%90===0)for(const site of s.sites){if(!s.workers.some(w=>w.site===site.id&&w.role==='warehouse'))continue;const open=s.purchases.filter(p=>p.site===site.id&&p.status!=='stored').length;if(open>=3)continue;
  for(const item of ['housing','board','carton'])if(stockOf(s,site.id,item)<15)sim.command({type:'buy',item,qty:30,supplier:'standard',site:site.id});}
 for(const o of s.orders){if(o.status!=='active')continue;
  const v=s.vehicles.find(v=>v.site===o.site&&v.status==='idle'&&v.type==='van');if(!v)continue;
  const stock=stockOf(s,o.site,o.item,o.kind==='logistics'?o.id:'company');
  const pending=s.shipments.filter(sh=>sh.orderId===o.id&&sh.deliveredAt==null&&sh.status!=='cancelled').reduce((n,sh)=>n+sh.qty,0);
  const qty=Math.min(stock,v.capacity,o.qty-o.delivered-pending);
  if(qty>0&&(qty>=8||qty===o.qty-o.delivered-pending||i%480>400))sim.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty,site:o.site});
 }
 if(cold&&i%240===30){const v=s.vehicles.find(v=>v.type==='refrigerated'&&v.status==='idle');if(v&&stockOf(s,v.site,'cold_module')>=10)sim.command({type:'transfer',item:'cold_module',qty:10,site:v.site,toSite:cold.toSite,vehicleId:v.id});}
}

// Klein: Startbetrieb wie tests/balance-performance.mjs (ein Standort, Wirtschaftsmodus).
export function small(seed=77){
 const sim=new Simulation({mode:'economy',seed});setupSite(sim,'site-1');
 for(const o of sim.state.orders.filter(o=>o.kind!=='logistics'))cmd(sim,'acceptOrder',{id:o.id});
 return {sim,opts:{buy:true}};
}

// Groß: sechs Standorte im Sandkastenmodus (drei mit Doppellinie), Kühllager, Kühlfahrzeug.
// Das Startkapital des Sandkastens begrenzt den Ausbau; ein Betriebskredit deckt den Rest.
export function large(seed=4242,{warmup=600,history=25000}={}){
 const sim=new Simulation({mode:'sandbox',seed});
 cmd(sim,'takeLoan',{amount:50000,requestId:'perf'});
 for(let i=1;i<6;i++)cmd(sim,'buySite',{name:'Lastwerk '+i});
 sim.state.sites.forEach((site,i)=>setupSite(sim,site.id,{big:i<3}));
 const s=sim.state,a=s.sites[0].id,b=s.sites[1].id;
 for(const site of [a,b])cmd(sim,'build',{buildingType:'coldstore',site,x:16,y:12,rotation:0});
 cmd(sim,'buyVehicle',{vehicleType:'refrigerated',site:a});
 // Testaufbau (Fixture wie advanced-integration): Kühlware ohne Forschungsvorlauf.
 for(let k=0;k<6;k++)sim.api.inventory.add({item:'cold_module',qty:10,quality:95,unitCost:80,site:a,location:'stock',owner:'company'});
 for(const o of s.orders.filter(o=>o.kind!=='logistics'))cmd(sim,'acceptOrder',{id:o.id});
 const opts={buy:true,cold:{toSite:b}};
 for(let i=0;i<warmup;i++){policy(sim,i,opts);sim.step(1);}
 return {sim:withHistory(sim,history),opts,offset:warmup};
}

// Testaufbau Massendaten: historische, vollständig verbrauchte Chargen (qty=0) mit Herkunftsketten,
// wie sie in langen Spielen entstehen. Sie stehen VOR den aktiven Chargen (älter) und werden über
// fromJSON eines gültigen Zustands geladen; der Validator prüft den Stand vollständig.
export function withHistory(sim,count){
 if(!count)return sim;
 const s=JSON.parse(sim.serialize()),items=Object.keys(ITEMS).filter(k=>!ITEMS[k].cold&&k!=='parcel'),locs=['stock','stock','stock','machine','vehicle'],hist=[];
 for(let k=0;k<count;k++){const site=s.sites[k%s.sites.length].id,item=items[(k*7)%items.length],id=`batch-${s.seq++}`;
  hist.push({id,item,qty:0,site,owner:'company',location:locs[k%locs.length],quality:80+(k%20),unitCost:10+(k%13),parents:k>=s.sites.length&&k%3?[hist[k-s.sites.length].id]:[],reserved:0,created:480+(k%400)});}
 s.batches=[...hist,...s.batches];
 return Simulation.fromJSON(JSON.stringify(s));
}

// Lieferkette mit Tour, Retoure, Rückruf, Kühlkette, Wartung und multimodaler Fracht (für Determinismus).
export function services(seed=83){
 const sim=new Simulation({mode:'sandbox',seed}),site='site-1',s=sim.state;
 cmd(sim,'build',{buildingType:'dock',x:2,y:10,site,rotation:0});cmd(sim,'build',{buildingType:'terminal',site,x:4,y:4,rotation:0});cmd(sim,'build',{buildingType:'workshop',site,x:9,y:4,rotation:0});cmd(sim,'build',{buildingType:'assembly',site,x:13,y:4,rotation:0});
 for(const role of ['warehouse','warehouse','driver','driver','service','technician','production'])cmd(sim,'hire',{role,site});
 cmd(sim,'buyVehicle',{vehicleType:'van',site});cmd(sim,'buyVehicle',{vehicleType:'van',site});
 const orders=s.orders.filter(o=>o.kind==='manufacturing').slice(0,2);for(const o of orders)cmd(sim,'acceptOrder',{id:o.id});
 const lg=s.orders.find(o=>o.kind==='logistics');cmd(sim,'acceptOrder',{id:lg.id});
 // Fixture wie advanced-integration: Fertigware, Kühlmodul ohne Kühllager, Ersatzteil, Bauteile.
 const lamp=sim.api.inventory.add({item:'lamp',qty:6,quality:95,unitCost:50,site,location:'stock',owner:'company'});
 sim.api.inventory.add({item:'cold_module',qty:4,quality:90,unitCost:80,site,location:'stock',owner:'company'});
 for(const item of ['housing','board'])sim.api.inventory.add({item,qty:12,quality:92,unitCost:20,site,location:'stock',owner:'company'});
 cmd(sim,'buy',{item:'spare',qty:2,supplier:'express',site});
 cmd(sim,'dispatchTour',{vehicleId:s.vehicles[0].id,stops:orders.map(o=>({orderId:o.id,qty:2}))});
 const plan=i=>{
  if(i===40)cmd(sim,'build',{buildingType:'coldstore',site,x:13,y:10,rotation:0});
  const o=s.orders.find(o=>o.id===lg.id);if(i>=30&&!s.freights.length&&stockOf(s,site,o.item,o.id)===o.qty){const f=cmd(sim,'bookFreight',{orderId:o.id,qty:o.qty,mode:'rail',site}).id;cmd(sim,'approveDocuments',{id:f});}
  if(i===90){const a=s.buildings.find(b=>b.type==='assembly');if(a.condition<100)sim.command({type:'maintain',id:a.id});}
  if(i===200)sim.command({type:'createReturn',orderId:orders[0].id,qty:1});
  if(i===260)cmd(sim,'recallBatch',{batchId:lamp.id});};
 return {sim,opts:{buy:false},plan};
}

export function run(sc,minutes,{offset=0,timer=null}={}){
 const {sim,opts,plan}=sc;
 for(let i=0;i<minutes;i++){plan?.(i);policy(sim,offset+i,opts);if(timer){const t0=timer();sim.step(1);sc.samples.push(timer()-t0);}else sim.step(1);}
 return sim;
}
