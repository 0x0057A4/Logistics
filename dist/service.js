import {VEHICLES,ITEMS} from './catalog.js';
const deliverySources=s=>[...s.shipments,...(s.tours||[]).flatMap(t=>t.stops.map((p,i)=>({...p,id:`${t.id}:stop:${i}`}))),...(s.freights||[])];
const cents=n=>Math.round(n*100)/100;
const activeTrip=r=>['collecting','returning','unloading'].includes(r.status);
export function init(s){s.returns??=[];}
// Gemeinsamer Herkunftsnachweis für Einzelabholung und Tour-Rückladung.
export function returnSources(s,orderId,qty){
 const sources=[];let left=qty;
 for(const sh of deliverySources(s).filter(sh=>sh.orderId===orderId&&sh.deliveredAt!=null)){
  const taken=(s.returns||[]).flatMap(r=>r.sources).filter(x=>x.shipment===sh.id).reduce((n,x)=>n+x.qty,0),n=Math.min(left,sh.qty-taken);
  if(n>0){sources.push({shipment:sh.id,qty:n,parents:[...sh.cargo],unitPrice:sh.invoiceAmount/sh.qty});left-=n;}
  if(!left)break;
 }
 return left?null:sources;
}
export function handle(s,c,api){
 if(c.type==='createReturn'){
  const o=s.orders.find(o=>o.id===c.orderId),qty=c.qty,site=c.site||o?.site||s.selectedSite;
  if(!o||!Number.isInteger(qty)||qty<1||qty>o.delivered-s.returns.filter(r=>r.orderId===o.id).reduce((n,r)=>n+r.qty,0))return {ok:false,message:'Retourenmenge überschreitet bereits gelieferte, noch nicht retournierte Ware.'};
  if(o.kind==='logistics')return {ok:false,message:'Fremdeigentum benötigt Rückführung gemäß Logistikvertrag; Warenwerterstattung ausgeschlossen.'};
  const v=s.vehicles.find(v=>(!c.vehicleId||v.id===c.vehicleId)&&v.site===site&&v.status==='idle'&&v.condition>=15&&(!ITEMS[o.item]?.cold||VEHICLES[v.type]?.cold)&&v.capacity>=qty*(ITEMS[o.item]?.volume||1)&&(VEHICLES[v.type].weightCapacity||v.capacity*4)>=qty*(ITEMS[o.item]?.weight||1));
  if(!v)return {ok:false,message:'Freies, ausreichend großes Fahrzeug am Standort fehlt.'};
  const sources=returnSources(s,o.id,qty);if(!sources)return {ok:false,message:'Zustellnachweis für Retourenmenge fehlt.'};
  const id=api.id('return'),cost=60*VEHICLES[v.type].runningCost;
  if(!api.book('return-trip:'+id,-cost,'Retouren','Rückholung beim Kunden',[id,o.id]))return {ok:false,message:'Kapital für Rücktransport fehlt.'};
  s.returns.push({id,orderId:o.id,item:o.item,qty,site,vehicleId:v.id,status:'collecting',remaining:Math.ceil(30/VEHICLES[v.type].speed),sources,cargo:[],refunded:false,refund:Math.round(sources.reduce((n,x)=>n+x.qty*x.unitPrice,0)*100)/100,createdAt:s.t,blocked:null});
  v.status='service';v.shipment=id;api.log('service',`Rückholung: ${qty} Stück von ${o.customer}.`,[id,o.id]);return {ok:true,id};
 }
 if(c.type==='resolveReturn'){
  const r=s.returns.find(r=>r.id===c.id);if(!r||r.status!=='decision'||!['repair','recycle'].includes(c.resolution))return {ok:false,message:'Geprüfte Retoure und gültige Bearbeitung wählen.'};
  if(c.resolution==='repair'){
   if(ITEMS[r.item]?.cold)return {ok:false,message:'Empfindliche Kalibriermodule können nach Rücknahme nur verwertet werden.'};
   const w=s.buildings.find(b=>b.site===r.site&&b.type==='workshop'&&b.enabled&&!b.serviceJob&&!b.maintenanceTask);
   if(!w)return {ok:false,message:'Freie eingeschaltete Wartungswerkstatt fehlt.'};
   if(!api.inventory.reserve('spare',r.qty,r.site,r.id+':spare'))return {ok:false,message:'Ein Ersatzteil pro Retourenstück benötigt.'};
   w.serviceJob=r.id;r.workshop=w.id;r.status='repair';r.remaining=8*r.qty;r.sparesConsumed=false;
  }else{r.status='recycling';r.remaining=2*r.qty;}
  return {ok:true,id:r.id};
 }
 return null;
}
export function step(s,api){
 for(const r of s.returns){
  if(['repaired','recycled','decision','scheduled','onTour'].includes(r.status))continue;
  const v=s.vehicles.find(v=>v.id===r.vehicleId);r.blocked=null;
  if(activeTrip(r)){
   const driver=api.workforce.acquire('driver',r.site,r.id+':driver');
   if(!driver){r.blocked='Fahrpersonal oder Schicht fehlt';continue;}
   if(r.status==='collecting'){
    if(--r.remaining>0)continue;
    for(const source of r.sources){const b=api.inventory.add({item:r.item,qty:source.qty,site:r.site,location:'vehicle',quality:45,unitCost:source.unitPrice,parents:source.parents});r.cargo.push(b.id);}
    r.status='returning';r.remaining=Math.ceil(30/VEHICLES[v.type].speed);
   }else if(r.status==='returning'){
    if(--r.remaining>0)continue;r.status='unloading';r.remaining=2+Math.ceil(r.qty/5);
   }else{
    let dock=s.buildings.find(b=>b.task===r.id&&b.type==='dock');
    dock??=s.buildings.find(b=>b.site===r.site&&b.type==='dock'&&b.enabled&&!b.task);
    if(!dock){r.blocked='Freie Laderampe fehlt';continue;}dock.task=r.id;r.dock=dock.id;
    if(!api.workforce.acquire('warehouse',r.site,r.id+':warehouse')){r.blocked='Lagerpersonal fehlt';continue;}
    if(api.inventory.free(r.site)<r.qty){r.blocked='Quarantänelager voll';continue;}
    if(--r.remaining>0)continue;
    for(const id of r.cargo)api.inventory.move(id,'quarantine');
    dock.task=null;api.workforce.release(r.id+':warehouse');api.workforce.release(r.id+':driver');v.status='idle';v.shipment=null;v.condition=Math.max(0,v.condition-2);
    r.status='inspection';r.remaining=3*r.qty;
   }
  }else if(r.status==='inspection'){
   if(!api.workforce.acquire('service',r.site,r.id+':service')){r.blocked='Kundenservice für Retourenprüfung fehlt';continue;}
   if(r.remaining>0)r.remaining--;
   if(r.remaining>0)continue;
   const o=s.orders.find(o=>o.id===r.orderId),refunded=s.returns.filter(x=>x.orderId===o.id&&x.refunded).reduce((n,x)=>n+x.refund,0);
   if(o.paid+1e-7<refunded+r.refund){r.blocked='Kundenzahlung für Rückerstattung noch offen';continue;}
   if(!api.book('return-refund:'+r.id,-r.refund,'Erstattungen','Geprüfte Kundenretoure',[r.id,o.id])){r.blocked='Kapital für Rückerstattung fehlt';continue;}
   r.refunded=true;r.status='decision';r.inspectedAt=s.t;api.workforce.release(r.id+':service');api.log('service','Retoure geprüft und erstattet. Reparatur oder Verwertung wählen.',[r.id]);
  }else if(r.status==='repair'){
   const w=s.buildings.find(w=>w.id===r.workshop);
   if(!w?.enabled){r.blocked='Werkstatt ausgeschaltet';continue;}
   if(!api.workforce.acquire('technician',r.site,r.id+':technician')){r.blocked='Technikpersonal fehlt';continue;}
   if(!r.sparesConsumed){const parts=api.inventory.consume(r.id+':spare');if(!parts){r.blocked='Reservierte Ersatzteile fehlen';continue;}r.spares=parts;r.sparesConsumed=true;}
   if(--r.remaining>0)continue;
   for(const id of r.cargo)api.inventory.restore(id,95);
   w.serviceJob=null;r.status='repaired';r.completedAt=s.t;api.workforce.release(r.id+':technician');api.log('service','Retoure repariert und wieder verkaufbar.',[r.id]);
  }else if(r.status==='recycling'){
   if(!api.workforce.acquire('warehouse',r.site,r.id+':warehouse')){r.blocked='Lagerpersonal für Verwertung fehlt';continue;}
   if(--r.remaining>0)continue;
   for(const id of r.cargo){const b=s.batches.find(b=>b.id===id);api.inventory.remove(id,b.qty);}
   r.status='recycled';r.completedAt=s.t;api.workforce.release(r.id+':warehouse');api.log('service','Retourenware verwertet.',[r.id]);
  }
 }
}
export function validate(s){
 const occupied=new Set(),cargoIds=new Set();
 for(const t of s.tours||[])if(!["complete","cancelled","loading"].includes(t.status))for(const stop of t.stops)if(stop.status==='pending')for(const id of stop.cargo)cargoIds.add(id);
 for(const sh of s.shipments||[])if(["transit","unloading"].includes(sh.status))for(const id of sh.cargo)cargoIds.add(id);
 for(const r of s.returns){
  if(!s.orders.some(o=>o.id===r.orderId)||!Number.isInteger(r.qty)||r.qty<1||!Number.isFinite(r.remaining)||r.remaining<0||!Number.isFinite(r.refund)||r.refund<0||!Array.isArray(r.sources)||!Array.isArray(r.cargo)||!['scheduled','onTour','collecting','returning','unloading','inspection','decision','repair','recycling','repaired','recycled'].includes(r.status))throw new Error('Retourendaten beschädigt.');
  if(r.sources.reduce((n,x)=>n+x.qty,0)!==r.qty||r.sources.some(x=>!Number.isInteger(x.qty)||x.qty<1||!deliverySources(s).some(sh=>sh.id===x.shipment&&sh.orderId===r.orderId&&sh.deliveredAt!=null)))throw new Error('Retourenherkunft beschädigt.');
  const order=s.orders.find(o=>o.id===r.orderId);
  if(r.item!==order.item||order.kind==='logistics'||typeof r.refunded!=='boolean'||!s.sites.some(site=>site.id===r.site))throw new Error('Retourenauftrag beschädigt.');
  for(const source of r.sources){const sh=deliverySources(s).find(sh=>sh.id===source.shipment);if(!Number.isFinite(source.unitPrice)||source.unitPrice<0||Math.abs(source.unitPrice-sh.invoiceAmount/sh.qty)>1e-7||!Array.isArray(source.parents)||JSON.stringify(source.parents)!==JSON.stringify(sh.cargo))throw new Error('Retourenbewertung beschädigt.');}
  if(Math.abs(cents(r.sources.reduce((n,x)=>n+x.qty*x.unitPrice,0))-r.refund)>0.001)throw new Error('Retourenwert beschädigt.');
  if(['scheduled','collecting'].includes(r.status)&&r.cargo.length)throw new Error('Retoure vor Abholung bereits beladen.');
  if(r.tourId&&!s.tours?.some(t=>t.id===r.tourId&&t.vehicleId===r.vehicleId&&t.site===r.site&&t.stops.some(stop=>stop.returnId===r.id&&stop.orderId===r.orderId)))throw new Error('Retourentour fehlt.');
  if(r.refunded&&!s.ledger.some(l=>l.key==='return-refund:'+r.id&&Math.abs(l.amount+r.refund)<0.001))throw new Error('Retourenerstattung beschädigt.');
  if(r.status==='repair'&&!s.buildings.some(b=>b.id===r.workshop&&b.serviceJob===r.id))throw new Error('Retourenwerkstatt fehlt.');
  if(['scheduled','onTour'].includes(r.status)){const t=(s.tours||[]).find(t=>t.id===r.tourId),v=s.vehicles.find(v=>v.id===r.vehicleId);if(!t||['complete','cancelled'].includes(t.status)||t.vehicleId!==r.vehicleId||t.site!==r.site||!t.stops.some(stop=>stop.returnId===r.id&&stop.orderId===r.orderId)||v?.status!=='tour'||v.tour!==t.id)throw new Error('Tour-Rückladung falsch zugeordnet.');}
  if(activeTrip(r)){const v=s.vehicles.find(v=>v.id===r.vehicleId);if(!v||v.status!=='service'||v.shipment!==r.id||occupied.has(v.id))throw new Error('Retourenfahrzeug falsch zugeordnet.');occupied.add(v.id);}
  if(!['scheduled','collecting','repaired','recycled'].includes(r.status)){
   for(const id of r.cargo){if(cargoIds.has(id))throw new Error('Retourenladung mehrfach zugeordnet.');cargoIds.add(id);}
   const cargo=r.cargo.map(id=>s.batches.find(b=>b.id===id));if(new Set(r.cargo).size!==r.cargo.length||cargo.some(b=>!b||b.item!==r.item||b.owner!=='company'||b.site!==r.site||b.location!==(['onTour','returning','unloading'].includes(r.status)?'vehicle':'quarantine'))||cargo.reduce((n,b)=>n+b.qty,0)!==r.qty)throw new Error('Retourenbestand beschädigt.');
  }
 }
 for(const sh of deliverySources(s))if(s.returns.flatMap(r=>r.sources).filter(x=>x.shipment===sh.id).reduce((n,x)=>n+x.qty,0)>sh.qty)throw new Error('Zustellung mehrfach retourniert.');
 for(const o of s.orders)if(s.returns.filter(r=>r.orderId===o.id).reduce((n,r)=>n+r.qty,0)>o.delivered)throw new Error('Retourenmenge überschreitet Zustellung.');
}
