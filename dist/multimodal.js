import {ITEMS} from './catalog.js';
import {committedQty} from './tours.js';
export const FREIGHT_MODES={rail:{name:'Bahn',period:60,duration:90,capacity:150,weightCapacity:600,cost:60,unitCost:1.5},sea:{name:'Schiff',period:180,duration:240,capacity:500,weightCapacity:2000,cost:100,unitCost:0.8},air:{name:'Luftfracht',period:30,duration:40,capacity:50,weightCapacity:200,cost:150,unitCost:4}};
const round=n=>Math.round(n*100)/100;
export function init(s){s.freights??=[];}
export function handle(s,c,api){
 if(c.type==='cancelFreight'){
  const f=(s.freights||[]).find(f=>f.id===c.id);
  if(!f||!['loading','waiting'].includes(f.status))return {ok:false,message:'Abbruch nur vor Abfahrt möglich.'};
  if(f.status==='waiting'&&!api.inventory.relocate(f.cargo,'stock',f.site))return {ok:false,message:'Abbruch benötigt freien Lagerplatz. Ladung bleibt vollständig im Terminal.'};
  api.inventory.release(f.id);api.workforce.release(`${f.id}:loading`);api.workforce.release(`${f.id}:documents`);
  const terminal=s.buildings.find(b=>b.freightTask===f.id);if(terminal)terminal.freightTask=null;
  for(const id of f.cargo){const b=s.batches.find(b=>b.id===id);if(b)delete b.freightId;}
  f.status='cancelled';f.cancelledAt=s.t;f.worker=null;f.documentWorker=null;f.blocked=null;f.documentBlocked=null;
  api.log('freight','Fracht abgebrochen. Ware freigegeben; bereits bezahlte Transportgebühren verfallen.',[f.id,f.orderId]);
  return {ok:true,message:'Fracht abgebrochen. Bereits bezahlte Transportgebühren verfallen.'};
 }

 if(c.type==='approveDocuments'){
  const f=(s.freights||[]).find(f=>f.id===c.id);if(!f||f.documents!=='pending')return {ok:false,message:'Dokumentenprüfung nicht verfügbar.'};
  f.documents='processing';f.documentRemaining=10;return {ok:true,message:'Dokumentenprüfung beauftragt: Servicepersonal benötigt 10 Minuten.'};
 }
 if(c.type!=='bookFreight')return null;
 const o=s.orders.find(o=>o.id===c.orderId),mode=FREIGHT_MODES[c.mode],site=c.site||s.selectedSite;
 if(o?.airExport)return {ok:false,message:'Luftexport: Pakete per Flughafen-Zubringer zum Frachtterminal bringen.'};
 if(!o||o.status!=='active'||!mode||!Number.isInteger(c.qty)||c.qty<1||c.qty>o.qty-o.delivered-committedQty(s,o.id))return {ok:false,message:'Auftrag, Verkehrsart oder offene Menge ungültig.'};
 if(!s.buildings.some(b=>b.site===site&&b.type==='terminal'&&b.enabled&&b.condition>0))return {ok:false,message:'Betriebsbereites Logistikterminal fehlt.'};
 const item=ITEMS[o.item];if(c.qty*(item.volume||1)>mode.capacity||c.qty*(item.weight||1)>mode.weightCapacity)return {ok:false,message:'Volumen oder Gewicht überschreitet Verkehrsmittelkapazität.'};
 const cold=!!item.cold;if(cold&&!s.research.some(r=>r.key==='coldchain'&&r.status==='completed'))return {ok:false,message:'Kühlkettenforschung für temperaturgeführte Fracht fehlt.'};
 const id=api.id('freight'),cost=round(mode.cost+c.qty*mode.unitCost);
 if(!api.inventory.reserve(o.item,c.qty,site,id,o.kind==='logistics'?o.id:'company'))return {ok:false,message:'Verfügbarer Warenbestand fehlt.'};
 const reserved=s.reservations.filter(r=>r.job===id);if(reserved.some(r=>(s.batches.find(b=>b.id===r.batchId)?.quality||0)<o.quality)){api.inventory.release(id);return {ok:false,message:'Qualitätsanforderung nicht erfüllt.'};}
 if(!api.book(`freight-book:${id}`,-cost,'Transport',`${mode.name}: externe Transportleistung`,[id,o.id])){api.inventory.release(id);return {ok:false,message:'Kapital für Frachtbuchung fehlt.'};}
 s.freights.push({id,orderId:o.id,site,item:o.item,mode:c.mode,qty:c.qty,status:'loading',remaining:5+Math.ceil(c.qty/10),duration:5+Math.ceil(c.qty/10),documents:'pending',documentRemaining:10,cargo:[],terminal:null,nextDeparture:(Math.floor(s.t/mode.period)+1)*mode.period,period:mode.period,transportCost:cost,tripCost:cost,materialCost:0,paid:false,cold,storageDue:0,storageCost:0,missedConnections:0,createdAt:s.t});
 api.log('freight',`${mode.name} gebucht. Dokumente prüfen lassen, Terminal abfertigen.`,[id,o.id]);return {ok:true,id};
}
export function step(s,api){
 for(const f of s.freights||[]){
  const o=s.orders.find(o=>o.id===f.orderId),mode=FREIGHT_MODES[f.mode];if(!o||!mode)continue;
  if(f.paymentAt!=null&&s.t>=f.paymentAt&&!f.paid){if(api.book(`freight-payment:${f.id}`,f.invoiceAmount,'Umsatz',`Frachtzahlung ${o.customer}`,[f.id,o.id])){o.paid=round(o.paid+f.invoiceAmount);f.paid=true;}}
  if(['complete','cancelled'].includes(f.status))continue;
  if(f.documents==='processing'){
   const worker=api.workforce.acquire('service',f.site,`${f.id}:documents`);
   if(worker){f.documentBlocked=null;f.documentWorker=worker.id;if(--f.documentRemaining<=0){f.documents='approved';f.documentsApprovedAt=s.t;api.workforce.release(`${f.id}:documents`);f.documentWorker=null;}}
   else f.documentBlocked='Servicepersonal oder Schicht fehlt';
  }
  if(f.status==='loading'){
   let terminal=s.buildings.find(b=>b.id===f.terminal&&b.enabled&&b.condition>0);
   terminal??=s.buildings.find(b=>b.site===f.site&&b.type==='terminal'&&b.enabled&&b.condition>0&&!b.freightTask);
   if(!terminal){f.blocked='Freies Terminal fehlt';}
   else{
    terminal.freightTask=f.id;f.terminal=terminal.id;const w=api.workforce.acquire('warehouse',f.site,`${f.id}:loading`);
    if(!w)f.blocked='Lagerpersonal zur Abfertigung fehlt';
    else {f.worker=w.id;f.blocked=null;if(--f.remaining<=0){const cargo=api.inventory.transfer(f.id,'vehicle',f.site);if(!cargo){f.remaining=1;f.blocked='Reservierte Ladung gesperrt oder nicht verfügbar';}else{f.cargo=cargo.map(b=>{b.freightId=f.id;return b.id;});f.materialCost=o.kind==='logistics'?0:round(cargo.reduce((n,b)=>n+b.qty*b.unitCost,0));f.status='waiting';f.readyAt=s.t;api.workforce.release(`${f.id}:loading`);f.worker=null;}}}
   }
  }
  if(['loading','waiting'].includes(f.status)){
   if(f.status==='waiting')f.storageDue=round(f.storageDue+0.03*f.qty);
   if(s.t>=f.nextDeparture){
    if(f.status==='waiting'&&f.documents==='approved'&&!f.cargo.some(id=>{const b=s.batches.find(b=>b.id===id);return !b||b.blocked||b.quality<o.quality;})){
     if(api.book(`freight-storage:${f.id}:${f.nextDeparture}`,-f.storageDue,'Lagergebühren','Terminalwartezeit',[f.id,o.id])){
      f.storageCost=round(f.storageCost+f.storageDue);f.tripCost=round(f.transportCost+f.storageCost);f.storageDue=0;f.status='transit';f.remaining=mode.duration;f.duration=mode.duration;f.departedAt=s.t;f.blocked=null;const terminal=s.buildings.find(b=>b.id===f.terminal);if(terminal?.freightTask===f.id)terminal.freightTask=null;
     }else f.blocked='Terminalgebühren nicht bezahlt';
    }else f.blocked=f.documents!=='approved'?'Dokumentensperre: Anschluss verpasst':'Abfertigung oder gesperrte Ware verhindert Abfahrt';
    if(f.status!=='transit'){f.missedConnections++;f.nextDeparture=(Math.floor(s.t/mode.period)+1)*mode.period;api.log('warning',`${mode.name}: Anschluss verpasst, nächste Abfahrt Minute ${f.nextDeparture}.`,[f.id]);}
   }
   continue;
  }
  if(f.status==='transit'){if(--f.remaining<=0){f.status='unloading';f.remaining=3+Math.ceil(f.qty/20);f.duration=f.remaining;}continue;}
  if(f.status==='unloading'){
   if(f.cargo.some(id=>{const b=s.batches.find(b=>b.id===id);return !b||b.blocked||b.quality<o.quality;})){f.blocked='Gesperrte Fracht: Zustellung ausgesetzt';continue;}
   if(--f.remaining>0)continue;
   for(const id of f.cargo){const b=s.batches.find(b=>b.id===id);if(b)api.inventory.remove(id,b.qty);}
   f.status='complete';f.deliveredAt=s.t;f.invoiceAmount=round(f.qty*o.price*(s.t>o.due?.9:1));f.paymentAt=s.t+60;o.delivered+=f.qty;s.stats.delivered+=f.qty;if(o.delivered>=o.qty){o.status='fulfilled';s.reputation=Math.min(100,s.reputation+3);}api.log('delivery',`${mode.name}: ${f.qty} Stück bei ${o.customer} zugestellt.`,[f.id,o.id]);
  }
 }
}
export function validate(s){
 for(const f of s.freights||[]){
  const bad=()=>{throw new Error('Spielstand ungültig: Multimodale Fracht beschädigt.');};
  if(!FREIGHT_MODES[f.mode]||!s.orders.some(o=>o.id===f.orderId)||!s.sites.some(a=>a.id===f.site)||!Number.isInteger(f.qty)||f.qty<1||!Number.isFinite(f.remaining)||f.remaining<0||!Array.isArray(f.cargo)||!['loading','waiting','transit','unloading','complete','cancelled'].includes(f.status)||!['pending','processing','approved'].includes(f.documents)||!Number.isFinite(f.nextDeparture)||!Number.isFinite(f.storageDue)||f.storageDue<0)bad();
  if(f.status==='loading'&&s.reservations.filter(r=>r.job===f.id).reduce((n,r)=>n+r.qty,0)!==f.qty)bad();
  if(['waiting','transit','unloading'].includes(f.status)){const cargo=f.cargo.map(id=>s.batches.find(b=>b.id===id));if(new Set(f.cargo).size!==f.cargo.length||cargo.some(b=>!b||b.location!=='vehicle'||b.freightId!==f.id)||cargo.reduce((n,b)=>n+b.qty,0)!==f.qty)bad();}
 }
}
