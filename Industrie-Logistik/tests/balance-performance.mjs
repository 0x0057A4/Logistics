import {performance} from 'node:perf_hooks';
import {Simulation} from '../dist/core.js';
const cmd=(s,type,data={})=>{const r=s.command({type,...data});if(!r.ok)throw Error(type+': '+r.message);return r;};
function setup(s,site){
 for(const [buildingType,x,y]of[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11]])cmd(s,'build',{buildingType,site,x,y,rotation:0});
 for(const role of ['production','production','production','warehouse','driver'])cmd(s,'hire',{role,site});cmd(s,'buyVehicle',{vehicleType:'van',site});
 for(const item of ['housing','board','carton'])cmd(s,'buy',{item,qty:40,supplier:'standard',site});
}
function run(count){
 const s=new Simulation({mode:count===1?'economy':'sandbox',seed:77});for(let i=1;i<count;i++)cmd(s,'buySite',{name:'Prüfwerk '+i});for(const site of s.state.sites)setup(s,site.id);
 for(const o of s.state.orders.filter(o=>o.kind!=='logistics'))cmd(s,'acceptOrder',{id:o.id});
 const begin=performance.now();
 for(let i=0;i<480;i++){
  for(const o of s.state.orders.filter(o=>o.status==='active')){
   const v=s.state.vehicles.find(v=>v.site===o.site&&v.status==='idle');if(!v)continue;
   const stock=s.state.batches.filter(b=>b.site===o.site&&b.item===o.item&&b.location==='stock'&&b.owner==='company').reduce((n,b)=>n+b.qty-b.reserved,0);
   const pending=s.state.shipments.filter(sh=>sh.orderId===o.id&&sh.deliveredAt==null&&sh.status!=='cancelled').reduce((n,sh)=>n+sh.qty,0);
   const qty=Math.min(stock,v.capacity,o.qty-o.delivered-pending);
   // Bündeln bis 8 Einheiten; Tagesende gibt kleinere Restcharge frei.
   if(qty>0&&(qty>=8||qty===o.qty-o.delivered-pending||i>400))s.command({type:'dispatch',orderId:o.id,vehicleId:v.id,qty,site:o.site});
  }
  s.step(1);
 }
 const tickMs=performance.now()-begin,serializeStart=performance.now(),json=s.serialize();const saveMs=performance.now()-serializeStart;const loadStart=performance.now();Simulation.fromJSON(json);const loadMs=performance.now()-loadStart;
 const byCategory={};for(const l of s.state.ledger)byCategory[l.category]=(byCategory[l.category]||0)+l.amount;
 const operational=s.state.ledger.filter(l=>!['construction','Fahrzeuge','vehicle','Standort','Kredit','Tilgung'].includes(l.category)&&!l.key.startsWith('hire:')&&!l.key.startsWith('vehicle:')).reduce((n,l)=>n+l.amount,0);
 return {sites:count,simulationMinutes:480,tickMs:+tickMs.toFixed(1),saveMs:+saveMs.toFixed(1),loadMs:+loadMs.toFixed(1),saveBytes:Buffer.byteLength(json),produced:s.state.stats.produced,delivered:s.state.stats.delivered,paidRevenue:s.state.stats.revenue,money:s.state.money,operationalCashflow:+operational.toFixed(2),receivables:s.state.shipments.filter(x=>x.invoiceAmount&&!x.paid).reduce((n,x)=>n+x.invoiceAmount,0),categories:Object.fromEntries(Object.entries(byCategory).map(([k,v])=>[k,+v.toFixed(2)])),workers:s.state.workers.length,buildings:s.state.buildings.length};
}
console.log(JSON.stringify([run(1),run(5)],null,2));
