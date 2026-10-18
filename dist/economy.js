import {committedQty} from './tours.js';
import {ITEMS,BUILDINGS,RECIPES} from './catalog.js';
import {assetInfo,accumulated} from './accounting.js';
import {abortJobs} from './production.js';
import {activeBatches} from './inventory.js';
import {gridDown} from './disruptions.js';
import {powerBalance} from './special.js';
export const suppliers={standard:{factor:1,lead:30,quality:88},express:{factor:1.3,lead:10,quality:86},quality:{factor:1.18,lead:45,quality:98}};
const ledgerIndexes=new WeakMap();
function keys(s){let index=ledgerIndexes.get(s);if(!index||index.rows!==s.ledger||index.length!==s.ledger.length){index={rows:s.ledger,length:s.ledger.length,keys:new Set(s.ledger.map(l=>l.key)),byKey:new Map(s.ledger.map(l=>[l.key,l]))};ledgerIndexes.set(s,index);}return index;}
const cents=n=>Math.round(n*100)/100;
export function book(s,key,amount,category,note,refs=[]){
 if(typeof key!=='string'||!key||!Number.isFinite(amount)||keys(s).keys.has(key))return false;
 const match=key.match(/^((?:wage:[^:]+)|energy|rent|interest):(\d+)$/),watermark=match?Number(match[2]):null;
 if(match&&(s.accountingWatermarks?.[match[1]]??-1)>=watermark)return false;
 amount=cents(amount);const mandatory=!!match||/^vehicle-rent:rental-\d+:\d+$/.test(key)||/^penalty(-open)?:/.test(key)||/^demurrage:/.test(key)||/^air-(missed|storage):/.test(key);if(amount<0&&s.money+amount<0&&!mandatory)return false;
 const index=keys(s);s.money=cents(s.money+amount);
 const ledgerKey=match?`${match[1]}:day:${Math.floor(watermark/1440)}`:key,row=index.byKey.get(ledgerKey);
 if(row){row.amount=cents(row.amount+amount);row.lastAt=s.t;row.entries=(row.entries||1)+1;}
 else {const entry={id:`ledger-${s.seq++}`,key:ledgerKey,t:s.t,amount,category,note,refs};s.ledger.push(entry);index.keys.add(ledgerKey);index.byKey.set(ledgerKey,entry);index.length=s.ledger.length;}
 if(match){s.accountingWatermarks??={};s.accountingWatermarks[match[1]]=watermark;}
 if(amount>0&&category==='Umsatz')s.stats.revenue=cents(s.stats.revenue+amount);else if(amount<0&&category!=='Tilgung')s.stats.costs=cents(s.stats.costs-amount);s.overdraft=Math.max(0,-s.money);return true;
}
/** 0.15 S1: Abgang einer Anlage (Abriss). Hält Restbuchwert zum Zeitpunkt s.t fest; keine Geldbuchung (Rückbauerlös bucht core). */
export function recordDisposal(s,asset,kind){
 const info=assetInfo(s,asset,kind);if(!info)return null;
 const depreciation=accumulated(info,s.t),row={assetId:info.assetId,kind,type:info.type,name:info.name,acquiredAt:info.acquiredAt,cost:info.cost,disposedAt:s.t,depreciation,bookValue:cents(info.cost-depreciation),source:info.source};
 (s.assetDisposals??=[]).push(row);return row;
}
/** Fertigungsanlage vorhanden: mindestens ein Gebäude mit Rezept (Montage, Prüfung, Verpackung) an irgendeinem Standort. */
export const hasManufacturing=s=>s.buildings.some(b=>BUILDINGS[b.type]?.recipes?.length>0);
// ---- Mehrwertdienste / Lohnfertigung (A04, 0.15 S3) ----------------------------------------------------------
// Auftragsart kind 'vas': Kunde liefert das Material (Einkauf kostenlos, owner=Auftrag), wir fertigen mit den bestehenden
// Rezepten unter Kundeneigentum (production.js: nur Material genau dieses Auftrags, Ausgabe owner=Auftrag), Vergütung
// o.price je fertigem Stück bei Zustellung über den bestehenden Zahlungsweg (transport/tours: invoiceAmount=qty·price).
// Angebote nur mit Fertigungsanlage, frühestens ab Tag 2 einmal täglich um 14:00 (VAS_OFFER_AT), höchstens ein offenes
// Angebot. Werte deterministisch aus Tag und Katalog, kein api.random: der übrige Zufall bleibt unberührt.
export const VAS_OFFER_AT=840,VAS_FROM_DAY=1;
const VAS_CUSTOMERS=['Kranichsteg Elektro','Talgrund Montage','Sonnwiese Technik','Lindenhof Gerätebau'];
/** Materialbedarf (Einkaufsteile) je Stück eines Endprodukts aus der Rezeptkette; null, wenn nicht herstellbar.
 * Gewählt wird je Zwischenprodukt das erste Rezept, das es nicht selbst verbraucht (keine Nacharbeit). */
const chainRecipe=item=>Object.values(RECIPES).find(x=>x.output.item===item&&!(item in x.inputs));
export function vasBom(item,depth=0){
 if(ITEMS[item]?.purchasable)return {[item]:1};
 const r=chainRecipe(item);if(!r||depth>8)return null;
 const out={};for(const [k,q] of Object.entries(r.inputs)){const sub=vasBom(k,depth+1);if(!sub)return null;for(const [m,n] of Object.entries(sub))out[m]=(out[m]||0)+n*q/r.output.qty;}return out;
}
/** Forschungsschlüssel aller Rezepte der Kette. */
function chainResearch(item,out=new Set(),depth=0){const r=chainRecipe(item);if(!r||depth>8)return out;if(r.research)out.add(r.research);for(const k of Object.keys(r.inputs))chainResearch(k,out,depth+1);return out;}
/** Lohnfertigbare Produkte: verkaufsfähig, herstellbar, alle Rezepte der Kette ohne offene Forschung. */
function vasItems(s){return Object.keys(ITEMS).filter(item=>ITEMS[item].sellable&&!ITEMS[item].cold&&vasBom(item)&&[...chainResearch(item)].every(key=>s.research.some(r=>r.key===key&&r.status==='completed')));}
function vasOffer(s,api){
 const day=Math.floor(s.t/1440),items=vasItems(s);if(!items.length)return;
 const item=items[day%items.length],qty=10+(day*7)%21,bom=vasBom(item),materials={};for(const [k,n] of Object.entries(bom))materials[k]=Math.ceil(n*qty);
 const site=s.buildings.find(b=>BUILDINGS[b.type]?.recipes?.length>0).site;
 // Stückvergütung: 35 % des Produktwerts, gerundet (A02 0.15, docs/BALANCING-0.15.md; vorher 18 %); Material stellt der Kunde.
 const price=Math.round(ITEMS[item].price*.35);
 s.orders.push({id:api.id('order'),kind:'vas',service:'Lohnfertigung',customer:VAS_CUSTOMERS[day%VAS_CUSTOMERS.length],item,qty,price,due:s.t+2880,quality:75,site,status:'offer',delivered:0,paid:0,materials});
 api.log('order',`Mehrwertdienst-Anfrage: ${qty} × ${ITEMS[item].name} in Lohnfertigung (Kundenmaterial).`,[s.orders.at(-1).id]);
}
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
/** QS-015-03 (A04/A05/A08): Storno Lohnfertigung (kind 'vas') gibt Fremdeigentum an den Kunden zurück, ohne Geldbuchung.
 *  1. Noch nicht eingelagerte Kundenanlieferungen (Einkauf owner=Auftrag, kostenlos) entfallen; Lagerkraft wird frei.
 *  2. Laufende Fertigungsjobs des Auftrags werden abgebrochen (production.abortJobs); ihre verbrauchten Eingänge gehen zurück.
 *  3. Freie Chargen des Auftrags (Material, Halbfabrikate, Fertigware) gehen per inventory.returnOwner ab.
 *  Idempotent (auch stündliche Nachlese für Reste/ältere Spielstände). Protokoll o.returnedQty/o.returnedItems + Meldung. */
function returnVas(s,api,o){
 const open=s.purchases.filter(p=>p.orderId===o.id&&p.owner===o.id&&p.status!=='stored');
 for(const p of open)api.workforce.release(p.id);
 if(open.length)s.purchases=s.purchases.filter(p=>!open.includes(p));
 const jobs=abortJobs(s,api,o.id),parts=api.inventory.returnOwner(o.id);
 const back=[...jobs.flatMap(j=>Array.isArray(j.inputs)?j.inputs:[]),...parts];
 if(!open.length&&!jobs.length&&!back.length)return false;
 const items=o.returnedItems||{};let qty=0;for(const x of back){items[x.item]=Math.round(((items[x.item]||0)+x.qty)*1e6)/1e6;qty+=x.qty;}
 if(back.length){o.returnedItems=items;o.returnedQty=Math.round(((o.returnedQty||0)+qty)*1e6)/1e6;}
 const text=Object.entries(back.reduce((m,x)=>(m[x.item]=(m[x.item]||0)+x.qty,m),{})).map(([k,n])=>`${Math.round(n*100)/100} × ${ITEMS[k]?.name||k}`).join(', ');
 api.log('inventory',`Storno Lohnfertigung ${o.id}: ${text?`${text} an ${o.customer} zurückgegeben`:'kein Kundenmaterial im Lager'}`+(jobs.length?`, ${jobs.length} Fertigungsjob(s) abgebrochen`:'')+(open.length?`, ${open.length} Anlieferung(en) storniert`:'')+'.',[o.id,...jobs.map(j=>j.id),...open.map(p=>p.id),...parts.map(p=>p.id)]);
 return true;
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
  }
  // Mehrwertdienst: Kunde liefert Material kostenlos an den Auftragsstandort; Eigentum bleibt beim Auftrag.
  if(o.kind==='vas')for(const [item,qty] of Object.entries(o.materials)){const id=api.id('purchase');s.purchases.push({id,orderId:o.id,item,qty,owner:o.id,site:o.site,supplier:'standard',cost:0,quality:92,status:'ordered',eta:s.t+30,remaining:0,batchId:null,worker:null});}
  api.log('order',`Auftrag von ${o.customer} angenommen.`,[o.id]);return {ok:true,id:o.id};
 }
 if(c.type==='cancelOrder'){
  const o=s.orders.find(x=>x.id===c.id);if(!o||!['offer','active'].includes(o.status))return {ok:false,message:'Auftrag kann nicht storniert werden.'};
  if(committedQty(s,o.id)>0||(s.freights||[]).some(f=>f.orderId===o.id&&!f.deliveredAt&&!['complete','cancelled'].includes(f.status))||s.shipments.some(x=>x.orderId===o.id&&!['complete','cancelled'].includes(x.status)))return {ok:false,message:'Erst laufende Lieferung abschließen.'};
  o.status='cancelled';if(o.delivered<o.qty)s.reputation=Math.max(0,s.reputation-3);api.log('order',`Auftrag ${o.id} storniert. Bereits erfolgte Lieferungen bleiben zahlbar.`,[o.id]);if(o.kind==='vas')returnVas(s,api,o);return {ok:true};
 }
 return null;
}
export function step(s,api){
 if(s.t%60===0){
  // QS-016-02: Bei Netzstörung nur den Teil abrechnen, den eigene Energiegebäude decken (powerBalance ohne Netzanteil).
  let power=0;for(const site of s.sites){const d=s.buildings.filter(b=>b.site===site.id&&b.enabled&&b.condition>0).reduce((n,b)=>n+(BUILDINGS[b.type]?.power||0),0);power+=gridDown(s,site.id)?Math.min(d,powerBalance(s,site.id).supply):d;}
  api.book(`energy:${s.t}`,-cents(power*.32),'Energie',`Strom ${power} kWh`);
  api.book(`rent:${s.t}`,-cents(s.sites.reduce((n,site)=>n+site.width*site.height*.0025,0)),'Miete','Hallenmiete pro Stunde');
  const interest=cents(((s.loanBalance||0)*.08+Math.max(0,-s.money)*.15)/8760);
  if(interest)api.book(`interest:${s.t}`,-interest,'Zinsen','Kredit 8 % / Kontoüberziehung 15 % p.a.');
  // QS-015-03: Nachlese für stornierte Lohnfertigung (zuvor reservierte Reste, Spielstände von vor 0.16).
  let gone=null;for(const o of s.orders)if(o.kind==='vas'&&o.status==='cancelled')(gone??=new Set()).add(o.id);
  if(gone){const hit=new Set();for(const p of s.purchases)if(p.status!=='stored'&&gone.has(p.owner))hit.add(p.owner);for(const j of s.jobs||[])if(gone.has(j.owner))hit.add(j.owner);
   for(const b of activeBatches(s))if(gone.has(b.owner)&&b.location!=='vehicle'&&b.qty-b.reserved>1e-9)hit.add(b.owner);
   if(hit.size)for(const o of s.orders)if(hit.has(o.id))returnVas(s,api,o);}
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
 if(s.t%1440===VAS_OFFER_AT&&Math.floor(s.t/1440)>=VAS_FROM_DAY&&hasManufacturing(s)&&!s.orders.some(o=>o.kind==='vas'&&o.status==='offer'&&o.due>s.t))vasOffer(s,api);
 if(s.t%720===0&&s.orders.filter(o=>o.status==='offer'&&o.kind!=='vas').length<5){const n=api.id('order'),products=Object.keys(ITEMS).filter(k=>ITEMS[k].sellable||k==='lamp'),item=products[Math.floor(api.random()*products.length)],drawn=api.random()<.25,qty=12+Math.floor(api.random()*30),r=api.random(),kind=drawn||!hasManufacturing(s)?'logistics':'manufacturing';s.orders.push({id:n,kind,customer:`Werkverbund ${s.seq}`,item,qty,price:Math.round(ITEMS[item].price*(1.12+r*.15)),due:s.t+2160,quality:75,site:s.selectedSite,status:'offer',delivered:0,paid:0});const offer=s.orders.at(-1);if(drawn)offer.price=Math.round(12+api.random()*12);else if(kind==='logistics')offer.price=Math.round(12+r*12);}
}
export function validate(s){
 const bad=m=>{throw new Error('Spielstand ungültig: '+m);};
 // 0.15 S1: Anlagenfelder optional (Altbestand), wenn vorhanden dann beide gültig; Mietfahrzeuge ohne Anschaffungswert.
 const assetOk=a=>(a.acquiredAt===undefined&&a.cost===undefined)||(Number.isSafeInteger(a.acquiredAt)&&a.acquiredAt>=480&&a.acquiredAt<=s.t&&Number.isFinite(a.cost)&&a.cost>=0);
 for(const b of s.buildings)if(!assetOk(b))bad('Anlagenwert Gebäude beschädigt.');
 for(const v of s.vehicles){if(!assetOk(v))bad('Anlagenwert Fahrzeug beschädigt.');if(v.rentalId&&v.cost!==undefined)bad('Mietfahrzeug mit Anschaffungswert: Miete ist keine Anlage.');}
 if(s.assetDisposals!==undefined){
  if(!Array.isArray(s.assetDisposals)||s.assetDisposals.length>100000)bad('Anlagenabgänge beschädigt.');
  const seen=new Set(),live=new Set([...s.buildings,...s.vehicles].map(x=>x.id));
  for(const d of s.assetDisposals){
   if(!d||typeof d.assetId!=='string'||seen.has(d.assetId)||live.has(d.assetId)||!['building','vehicle'].includes(d.kind)||!Number.isSafeInteger(d.acquiredAt)||!Number.isSafeInteger(d.disposedAt)||d.acquiredAt>d.disposedAt||d.disposedAt>s.t||!Number.isFinite(d.cost)||d.cost<0||!Number.isFinite(d.depreciation)||d.depreciation<0||d.depreciation>d.cost+0.005||!Number.isFinite(d.bookValue)||Math.abs(d.bookValue-cents(d.cost-d.depreciation))>0.005)bad('Anlagenabgang beschädigt.');
   seen.add(d.assetId);
  }
 }
 if(s.loanBalance!==undefined&&(!Number.isFinite(s.loanBalance)||s.loanBalance<0||s.loanBalance>50000))bad('Kredit beschädigt.');
 for(const o of s.orders)if(o.kind==='vas'&&(!o.materials||typeof o.materials!=='object'||Array.isArray(o.materials)||!Object.keys(o.materials).length||Object.entries(o.materials).some(([k,n])=>!ITEMS[k]?.purchasable||!Number.isInteger(n)||n<1)))bad('Mehrwertdienstauftrag beschädigt.');
 for(const p of s.purchases){
  if(!ITEMS[p.item]||!Number.isInteger(p.qty)||p.qty<1||!suppliers[p.supplier]||!['ordered','waiting','receiving','checking','storing','stored'].includes(p.status)||!Number.isFinite(p.cost)||p.cost<0||!Number.isFinite(p.eta)||!Number.isFinite(p.remaining))bad('Einkauf beschädigt.');
  if(['receiving','checking','storing'].includes(p.status)&&!s.batches.some(b=>b.id===p.batchId&&b.item===p.item&&b.qty===p.qty&&b.location==='inbound'))bad('Laufende Anlieferung ohne Ware.');
 }
}
