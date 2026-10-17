import {committedQty} from './tours.js';
import {ITEMS,BUILDINGS} from './catalog.js';
const suppliers={standard:{factor:1,lead:30,quality:88},express:{factor:1.3,lead:10,quality:86},quality:{factor:1.18,lead:45,quality:98}};
const ledgerIndexes=new WeakMap();
function keys(s){let index=ledgerIndexes.get(s);if(!index||index.rows!==s.ledger||index.length!==s.ledger.length){index={rows:s.ledger,length:s.ledger.length,keys:new Set(s.ledger.map(l=>l.key)),byKey:new Map(s.ledger.map(l=>[l.key,l]))};ledgerIndexes.set(s,index);}return index;}
const cents=n=>Math.round(n*100)/100;
export function book(s,key,amount,category,note,refs=[]){
 if(typeof key!=='string'||!key||!Number.isFinite(amount)||keys(s).keys.has(key))return false;
 const match=key.match(/^((?:wage:[^:]+)|energy|rent|interest):(\d+)$/),watermark=match?Number(match[2]):null;
 if(match&&(s.accountingWatermarks?.[match[1]]??-1)>=watermark)return false;
 amount=cents(amount);const mandatory=!!match||/^vehicle-rent:rental-\d+:\d+$/.test(key)||/^penalty(-open)?:/.test(key)||/^demurrage:/.test(key);if(amount<0&&s.money+amount<0&&!mandatory)return false;
 const index=keys(s);s.money=cents(s.money+amount);
 const ledgerKey=match?`${match[1]}:day:${Math.floor(watermark/1440)}`:key,row=index.byKey.get(ledgerKey);
 if(row){row.amount=cents(row.amount+amount);row.lastAt=s.t;row.entries=(row.entries||1)+1;}
 else {const entry={id:`ledger-${s.seq++}`,key:ledgerKey,t:s.t,amount,category,note,refs};s.ledger.push(entry);index.keys.add(ledgerKey);index.byKey.set(ledgerKey,entry);index.length=s.ledger.length;}
 if(match){s.accountingWatermarks??={};s.accountingWatermarks[match[1]]=watermark;}
 if(amount>0&&category==='Umsatz')s.stats.revenue=cents(s.stats.revenue+amount);else if(amount<0&&category!=='Tilgung')s.stats.costs=cents(s.stats.costs-amount);s.overdraft=Math.max(0,-s.money);return true;
}
/** Fertigungsanlage vorhanden: mindestens ein Gebäude mit Rezept (Montage, Prüfung, Verpackung) an irgendeinem Standort. */
export const hasManufacturing=s=>s.buildings.some(b=>BUILDINGS[b.type]?.recipes?.length>0);
// Erste Fertigungsanfragen (früher Startaufträge in init). Nur einmal: Aufträge werden nie gelöscht, daher genügt
// „noch nie ein Fertigungsauftrag“ als Bedingung; alte Stände besitzen ihre Startaufträge bereits.
function startOffers(s,api){
 const site=s.buildings.find(b=>BUILDINGS[b.type]?.recipes?.length>0).site;
 for(const [i,qty,price,quality] of [[1,8,110,70],[2,20,117,75],[3,35,125,82]])s.orders.push({id:`order-${s.seq++}`,kind:'manufacturing',customer:['Lichtbogen Bürobedarf','Morgenrot Werkstätten','Hafenblick Handel'][i-1],item:'lamp',qty,price,due:s.t+1440*i,quality,site,status:'offer',delivered:0,paid:0});
 api.log('order','Erste Fertigungsanfragen für Arbeitsleuchten eingegangen (Mehrwertdienste).',s.orders.slice(-3).map(o=>o.id));
}
export function init(s){
 s.loanBalance??=0;s.overdraft??=Math.max(0,-s.money);
 // Neue Spiele sind Logistikunternehmen (A01 W1c, Befund B5): keine Leuchten-Startaufträge bei Gründung. Die drei
 // Fertigungsanfragen kommen erst mit der ersten Fertigungsanlage (step → startOffers). init läuft nur bei Neugründung.
 if(!s.orders.some(o=>o.kind==='logistics'))s.orders.push({id:`order-${s.seq++}`,kind:'logistics',customer:'Westbogen Versand',item:'lamp',qty:12,price:18,due:s.t+1800,quality:70,site:'site-1',status:'offer',delivered:0,paid:0});
}
export function handle(s,c,api){
 if(c.type==='takeLoan'||c.type==='repayLoan'){
  const n=c.amount;if(!Number.isInteger(n)||n<100||n>50000)return {ok:false,message:'Kreditbetrag: ganze Euro zwischen 100 und 50.000.'};
  const balance=s.loanBalance||0,key=c.requestId?`loan:${c.requestId}`:api.id('loan');
  if(s.ledger.some(l=>l.key===key))return {ok:false,message:'Kreditvorgang bereits gebucht.'};
  if(c.type==='takeLoan'){if(balance+n>50000)return {ok:false,message:'Kreditlinie 50.000 € ausgeschöpft.'};if(!api.book(key,n,'Kredit','Betriebskredit 8 % p.a.'))return {ok:false,message:'Kreditbuchung fehlgeschlagen.'};s.loanBalance=balance+n;}
  else {if(n>balance)return {ok:false,message:'Tilgung übersteigt Restkredit.'};if(!api.book(key,-n,'Tilgung','Kredittilgung'))return {ok:false,message:'Liquidität für Tilgung fehlt.'};s.loanBalance=balance-n;}return {ok:true};
 }
 if(c.type==='buy'){
  const item=ITEMS[c.item],supplier=suppliers[c.supplier||'standard'],site=c.site||s.selectedSite;
  if(!item||!item.purchasable||!supplier||!Number.isInteger(c.qty)||c.qty<1||c.qty>1000||!s.sites.some(x=>x.id===site))return {ok:false,message:'Einkauf ungültig: Material, Standort und Menge prüfen.'};
  if(item.cold&&!s.research.some(r=>r.key==='coldchain'&&r.status==='completed'))return {ok:false,message:'Kühlkettenforschung vor Einkauf erforderlich.'};
  const cost=cents(item.price*c.qty*supplier.factor),id=api.id('purchase');
  if(!api.book(`purchase:${id}`,-cost,'Einkauf',`${c.qty} × ${item.name}`,[id]))return {ok:false,message:'Kapital für Einkauf fehlt.'};
  s.purchases.push({id,item:c.item,qty:c.qty,site,supplier:c.supplier||'standard',cost,quality:supplier.quality,status:'ordered',eta:s.t+supplier.lead,remaining:0,batchId:null,worker:null});
  api.log('purchase',`Bestellung ${id}: ${c.qty} × ${item.name}. Ankunft in ${supplier.lead} Minuten.`,[id]);return {ok:true,id};
 }
 if(c.type==='acceptOrder'){
  const o=s.orders.find(x=>x.id===c.id);if(!o||o.status!=='offer')return {ok:false,message:'Auftrag nicht verfügbar.'};
  if(o.due<=s.t)return {ok:false,message:'Lieferfrist bereits abgelaufen.'};o.status='active';if(o.kind==='logistics'){
   const id=api.id('purchase');s.purchases.push({id,orderId:o.id,item:o.item,qty:o.qty,owner:o.id,site:o.site,supplier:'standard',cost:0,quality:94,status:'ordered',eta:s.t+20,remaining:0,batchId:null,worker:null});
  }api.log('order',`Auftrag von ${o.customer} angenommen.`,[o.id]);return {ok:true,id:o.id};
 }
 if(c.type==='cancelOrder'){
  const o=s.orders.find(x=>x.id===c.id);if(!o||!['offer','active'].includes(o.status))return {ok:false,message:'Auftrag kann nicht storniert werden.'};
  if(committedQty(s,o.id)>0||(s.freights||[]).some(f=>f.orderId===o.id&&!f.deliveredAt&&!['complete','cancelled'].includes(f.status))||s.shipments.some(x=>x.orderId===o.id&&!['complete','cancelled'].includes(x.status)))return {ok:false,message:'Erst laufende Lieferung abschließen.'};
  o.status='cancelled';if(o.delivered<o.qty)s.reputation=Math.max(0,s.reputation-3);api.log('order',`Auftrag ${o.id} storniert. Bereits erfolgte Lieferungen bleiben zahlbar.`,[o.id]);return {ok:true};
 }
 return null;
}
export function step(s,api){
 if(s.t%60===0){
  const power=s.buildings.filter(b=>b.enabled&&b.condition>0).reduce((n,b)=>n+(BUILDINGS[b.type]?.power||0),0);
  api.book(`energy:${s.t}`,-cents(power*.32),'Energie',`Strom ${power} kWh`);
  api.book(`rent:${s.t}`,-cents(s.sites.reduce((n,site)=>n+site.width*site.height*.0025,0)),'Miete','Hallenmiete pro Stunde');
  const interest=cents(((s.loanBalance||0)*.08+Math.max(0,-s.money)*.15)/8760);
  if(interest)api.book(`interest:${s.t}`,-interest,'Zinsen','Kredit 8 % / Kontoüberziehung 15 % p.a.');
 }

 for(const p of s.purchases){
  if(p.status==='stored')continue;
  if(p.status==='ordered'){if(s.t<p.eta)continue;p.status='waiting';}
  const worker=api.workforce.acquire('warehouse',p.site,p.id);if(!worker){p.worker=null;p.blocked='Lagerpersonal oder Schicht fehlt';continue;}p.worker=worker.id;
  if(p.status==='waiting'){
   const batch=api.inventory.add({item:p.item,qty:p.qty,site:p.site,owner:p.owner||'company',location:'inbound',quality:p.quality,unitCost:p.cost/p.qty,parents:[p.id]});
   if(!batch){p.blocked='Lagerkapazität fehlt';api.workforce.release(p.id);p.worker=null;continue;}
   p.batchId=batch.id;p.status='receiving';p.remaining=2+Math.ceil(p.qty/10);
  }
  p.blocked=null;if(--p.remaining>0)continue;
  if(p.status==='receiving'){p.status='checking';p.remaining=2;}
  else if(p.status==='checking'){p.status='storing';p.remaining=2+Math.ceil(p.qty/10);}
  else if(p.status==='storing'){
   if(!api.inventory.move(p.batchId,'stock',p.site)){p.blocked='Einlagerung blockiert';p.remaining=1;continue;}
   p.status='stored';p.storedAt=s.t;api.workforce.release(p.id);p.worker=null;api.log('inventory',`Lieferung ${p.id}: ${p.qty} Stück geprüft und eingelagert.`,[p.id,p.batchId]);
  }
 }
 for(const sh of s.shipments){
  if(sh.paymentAt==null||s.t<sh.paymentAt||sh.paid)continue;
  const o=s.orders.find(x=>x.id===sh.orderId);if(!o)continue;
  const value=cents(sh.invoiceAmount);
  if(api.book(`payment:${sh.id}`,value,'Umsatz',`Zahlung ${o.customer}: ${sh.qty} Stück`,[o.id,sh.id])){sh.paid=true;o.paid=cents(o.paid+value);api.log('payment',`Zahlung ${o.customer}: ${value.toFixed(2)} €.`,[o.id,sh.id]);}
  else if(s.ledger.some(x=>x.key===`payment:${sh.id}`))sh.paid=true;
 }
 for(const o of s.orders){if(o.status==='active'&&s.t>o.due&&!o.late){o.late=true;s.reputation=Math.max(0,s.reputation-4);api.log('warning',`Lieferfrist überschritten: ${o.customer}.`,[o.id]);}}
 if(hasManufacturing(s)&&!s.orders.some(o=>o.kind==='manufacturing'))startOffers(s,api);
 // New fictional tenders keep a completed company playable. Ohne Fertigungsanlage nur Fremdlogistik (A01 W1c).
 // Zufallszüge bleiben gleich: gezogene Fremdlogistik zieht wie bisher ihren Preis nach, umgewandelte Angebote
 // nutzen den schon gezogenen Preiszufall (gleiche Verteilung 12–24 €), damit Vertrags- und Störungszufall gleich bleiben.
 if(s.t%720===0&&s.orders.filter(o=>o.status==='offer').length<5){const n=api.id('order'),products=Object.keys(ITEMS).filter(k=>ITEMS[k].sellable||k==='lamp'),item=products[Math.floor(api.random()*products.length)],drawn=api.random()<.25,qty=12+Math.floor(api.random()*30),r=api.random(),kind=drawn||!hasManufacturing(s)?'logistics':'manufacturing';s.orders.push({id:n,kind,customer:`Werkverbund ${s.seq}`,item,qty,price:Math.round(ITEMS[item].price*(1.12+r*.15)),due:s.t+2160,quality:75,site:s.selectedSite,status:'offer',delivered:0,paid:0});const offer=s.orders.at(-1);if(drawn)offer.price=Math.round(12+api.random()*12);else if(kind==='logistics')offer.price=Math.round(12+r*12);}
}
export function validate(s){
 const bad=m=>{throw new Error('Spielstand ungültig: '+m);};
 if(s.loanBalance!==undefined&&(!Number.isFinite(s.loanBalance)||s.loanBalance<0||s.loanBalance>50000))bad('Kredit beschädigt.');
 for(const p of s.purchases){
  if(!ITEMS[p.item]||!Number.isInteger(p.qty)||p.qty<1||!suppliers[p.supplier]||!['ordered','waiting','receiving','checking','storing','stored'].includes(p.status)||!Number.isFinite(p.cost)||p.cost<0||!Number.isFinite(p.eta)||!Number.isFinite(p.remaining))bad('Einkauf beschädigt.');
  if(['receiving','checking','storing'].includes(p.status)&&!s.batches.some(b=>b.id===p.batchId&&b.item===p.item&&b.qty===p.qty&&b.location==='inbound'))bad('Laufende Anlieferung ohne Ware.');
 }
}
