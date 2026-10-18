// Auftragsbezogener Kundendienst. Ware, Rechnungen und Zahlungseingänge bleiben unverändert.
// 0.16 S3 (A08, docs/SCHNITTSTELLEN-0.16.md): automatische Anliegen aus echten Ereignissen, Antwortfrist je Anliegen und
// Versenderzufriedenheit (s.shippers, contracts.js). Geld weiterhin nur über api.book (Kulanz/Gebühr genau einmal).
import {committedQty} from './tours.js';
import {active as disruptionsActive} from './disruptions.js';
import {adjustShipper,shipperOf,SATISFACTION} from './contracts.js';
const DURATIONS={status:15,deadline:30,complaint:20,partial:15};
// partial (Teillieferung) nutzt dieselben Antworten wie die Beschwerde (Kulanz/Entschuldigung); die Oberfläche bietet für
// Arten außer Status/Frist bereits genau diese beiden Knöpfe an.
const RESPONSES={status:['inform'],deadline:['approve','reject'],complaint:['goodwill','apologize'],partial:['goodwill','apologize']};
/** Manuell anlegbare Arten; Teillieferung entsteht nur automatisch. */
const MANUAL=['status','deadline','complaint'];
/** 0.16 S3 Antwortfrist in Spielminuten ab Anlage (A08-Vorschlag, Balancing A02 offen). Gilt für alle neu angelegten Anliegen
 *  (Feld respondBy; Altstände ohne Feld haben keine Frist). Unbeantwortet abgelaufen → einmalig Versenderzufriedenheit
 *  SATISFACTION.ignored; bei Aufträgen ohne Versender sinkt der Ruf um 1. Das Anliegen bleibt danach beantwortbar. */
export const RESPONSE_MINUTES={status:240,deadline:480,complaint:240,partial:360};
/** 0.16 S3 Auslöser automatischer Anliegen (nur Vertragsaufträge, außer der bestehenden Beschwerde für alle Aufträge):
 *  risk: Frist in ≤ riskLead Min., nichts zugestellt und offene Menge nicht unterwegs (Statusanfrage, drohende Verspätung);
 *  partial: Teil zugestellt, Rest nicht unterwegs und Frist in ≤ partialLead Min. oder überschritten (Teillieferung);
 *  disruption: aktive Störung am Zustellstandort (disruptions.active, Liste nicht leer) und Frist in ≤ disruptionLead Min.
 *  (Statusanfrage, Störungsverzug). late: überfälliger aktiver Auftrag (Beschwerde, Regel bis 0.15). Vorläufig, A02 balanciert. */
export const AUTO={riskLead:90,partialLead:120,disruptionLead:240};
const TRIGGERS={complaint:['late'],status:['risk','disruption'],partial:['partial']};
export const KIND_TEXT={status:'Statusanfrage',deadline:'Fristverlängerung',complaint:'Beschwerde',partial:'Teillieferung'};
const cents=n=>Math.round(n*100)/100;
const task=t=>'ticket:'+t.id;
const costFor=(response,value)=>response==='approve'?cents(value*.02):response==='goodwill'?cents(Math.min(50,value*.05)):0;
export function init(s){s.tickets??=[];}
function create(s,o,kind,extension,source,api,trigger){
 const id=api.id('ticket');
 const t={id,orderId:o.id,site:o.site,kind,source,status:'open',createdAt:s.t,remaining:0,blocked:null,response:null,originalDue:o.due,requestedDue:kind==='deadline'?o.due+extension:null,cost:0,valueAtResponse:null,startedAt:null,completedAt:null,outcome:null,reply:null,respondBy:s.t+RESPONSE_MINUTES[kind]};
 if(trigger)t.trigger=trigger;
 s.tickets.push(t);
 const why=trigger==='risk'?' (drohende Verspätung)':trigger==='disruption'?' (Störungsverzug)':'';
 api.log('service',`Kundendienst: ${KIND_TEXT[kind]}${why} zu ${o.customer}. Antwort bis Spielminute ${t.respondBy}.`,[id,o.id]);return {ok:true,id};
}
export function handle(s,c,api){
 if(c.type==='createTicket'){
  const o=s.orders.find(o=>o.id===c.orderId);
  if(!o||!['active','fulfilled'].includes(o.status)||!MANUAL.includes(c.kind))return {ok:false,message:'Aktiven oder erfüllten Auftrag und gültigen Anliegen-Typ wählen.'};
  if(s.tickets.some(t=>t.orderId===o.id&&t.kind===c.kind))return {ok:false,message:'Dieses Anliegen wurde bereits angelegt.'};
  if(c.kind==='deadline'&&(o.status!=='active'||o.delivered>=o.qty||!Number.isInteger(c.extensionMinutes)||c.extensionMinutes<60||c.extensionMinutes>1440))return {ok:false,message:'Offener Restauftrag und Verlängerung von 60 bis 1440 ganzen Minuten erforderlich.'};
  return create(s,o,c.kind,c.extensionMinutes,'manual',api);
 }
 if(c.type==='respondTicket'){
  const t=s.tickets.find(t=>t.id===c.id);
  if(!t||t.status!=='open'||!RESPONSES[t.kind].includes(c.response))return {ok:false,message:'Offenes Anliegen und passende Antwort wählen.'};
  const o=s.orders.find(o=>o.id===t.orderId);
  if(c.response==='goodwill'&&costFor('goodwill',o.paid)<=0)return {ok:false,message:'Kulanz benötigt bereits eingegangene Kundenzahlung.'};
  t.response=c.response;t.status='processing';t.remaining=DURATIONS[t.kind];t.startedAt=s.t;
  t.valueAtResponse=c.response==='approve'?Math.max(0,(o.qty-o.delivered)*o.price):c.response==='goodwill'?o.paid:0;
  t.cost=costFor(t.response,t.valueAtResponse);t.blocked=null;return {ok:true,id:t.id};
 }
 return null;
}
/** Automatische Anliegen. Höchstens ein Anliegen je Auftrag und Art (auch gegenüber manuellen Tickets). Liest nur Zustand. */
function automatic(s,api){
 let pairs=null;const has=(o,kind)=>(pairs??=new Set(s.tickets.map(t=>t.orderId+':'+t.kind))).has(o.id+':'+kind);
 const add=(o,kind,trigger)=>{create(s,o,kind,null,'automatic',api,trigger);pairs?.add(o.id+':'+kind);};
 const disrupted=new Map(),disruption=site=>{if(!disrupted.has(site)){const list=disruptionsActive(s,site);disrupted.set(site,Array.isArray(list)&&list.length>0);}return disrupted.get(site);};
 for(const o of s.orders){
  if(o.status!=='active')continue;
  // Bestehende Regel (bis 0.15): überfälliger aktiver Auftrag → Beschwerde, für alle Auftragsarten.
  if(s.t>o.due&&!has(o,'complaint'))add(o,'complaint','late');
  if(!o.contractId||o.delivered>=o.qty)continue;
  const left=o.due-s.t,needStatus=!has(o,'status'),needPartial=o.delivered>0&&left<=AUTO.partialLead&&!has(o,'partial');
  if(needStatus&&left>=0&&left<=AUTO.disruptionLead&&disruption(o.deliverySite??o.site)){add(o,'status','disruption');continue;}
  const risk=needStatus&&o.delivered===0&&left>=0&&left<=AUTO.riskLead;
  if(!risk&&!needPartial)continue;
  if(o.delivered+committedQty(s,o.id)>=o.qty)continue;
  if(risk)add(o,'status','risk');else add(o,'partial','partial');
 }
}
export function step(s,api){
 automatic(s,api);
 for(const t of s.tickets){
  if(t.status==='open'&&t.respondBy!==undefined&&!t.expired&&s.t>t.respondBy){
   // Antwortfrist abgelaufen: genau einmal (Kennzeichen expired). Anliegen bleibt beantwortbar.
   t.expired=true;const o=s.orders.find(o=>o.id===t.orderId),shipper=shipperOf(s,o);
   if(shipper)adjustShipper(s,shipper,SATISFACTION.ignored,'ignored');else s.reputation=Math.max(0,s.reputation-1);
   api.log('warning',`Kundendienst: ${KIND_TEXT[t.kind]} zu ${o.customer} nicht fristgerecht beantwortet${shipper?`, Zufriedenheit ${shipper} sinkt`:', Ruf sinkt'}.`,[t.id,o.id]);
  }
  if(t.status!=='processing')continue;t.blocked=null;
  if(t.remaining>0){
   if(!api.workforce.acquire('service',t.site,task(t))){t.blocked='Kundendienstpersonal, Schicht oder Pause';continue;}
   t.remaining--;if(t.remaining>0)continue;
   api.workforce.release(task(t));
  }
  const o=s.orders.find(o=>o.id===t.orderId);
  const obsolete=t.response==='approve'&&(o.status!=='active'||o.delivered>=o.qty||o.due!==t.originalDue||t.requestedDue<=s.t);
  if(!obsolete&&t.cost>0&&!api.book('ticket-cost:'+t.id,-t.cost,'Kundendienst','Kundenanliegen '+t.id,[t.id,o.id])){t.blocked='Kapital für Kundendienst fehlt';continue;}
  if(!obsolete&&t.response==='approve')o.due=t.requestedDue;
  t.status='closed';t.outcome=obsolete?'obsolete':t.response;t.completedAt=s.t;t.blocked=null;
  // 0.16 S3: abgeschlossene Antwort an einen Versender hebt dessen Zufriedenheit (Kulanz stärker); Ablehnung/gegenstandslos neutral.
  const shipper=shipperOf(s,o),delta=t.outcome==='goodwill'?SATISFACTION.goodwill:['inform','apologize','approve'].includes(t.outcome)?SATISFACTION.answered:0;
  if(shipper&&delta)adjustShipper(s,shipper,delta,null);
  const status={active:'aktiv',fulfilled:'erfüllt',cancelled:'storniert',offer:'angeboten'}[o.status];
  t.reply=obsolete?'Friständerung gegenstandslos. Keine Gebühr berechnet.':t.response==='inform'?`Auftrag ${status}: ${o.delivered} von ${o.qty} Stück geliefert, ${Math.max(0,o.qty-o.delivered)} Stück offen. Lieferfrist: Spielminute ${o.due}.`:t.response==='approve'?`Lieferfrist auf Spielminute ${o.due} verlängert. Gebühr: ${t.cost.toFixed(2)} €.`:t.response==='reject'?'Fristverlängerung abgelehnt. Bisherige Lieferfrist bleibt bestehen.':t.response==='goodwill'?`Kulanz von ${t.cost.toFixed(2)} € ausgezahlt.`:t.kind==='partial'?'Teillieferung beantwortet. Entschuldigung ohne Auszahlung dokumentiert.':'Beschwerde beantwortet. Entschuldigung ohne Auszahlung dokumentiert.';
  api.workforce.release(task(t));
  api.log('service',obsolete?'Friständerung gegenstandslos; keine Kosten.':`Kundenanliegen abgeschlossen: ${o.customer}.`,[t.id,o.id]);
 }
}
export function validate(s){
 const bad=()=>{throw new Error('Kundendienstdaten beschädigt.');};
 const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const time=n=>Number.isSafeInteger(n)&&n>=480&&n<=s.t;
 if(!Array.isArray(s.tickets)||s.tickets.length>100000)bad();
 const pairs=new Set(),ids=new Set();
 for(const t of s.tickets){
  if(!t||typeof t!=='object'||typeof t.id!=='string'||!/^ticket-\d+$/.test(t.id)||ids.has(t.id))bad();ids.add(t.id);
  const o=s.orders.find(o=>o.id===t.orderId),pair=t.orderId+':'+t.kind;
  if(!o||t.site!==o.site||!s.sites.some(site=>site.id===t.site)||!Object.hasOwn(DURATIONS,t.kind)||pairs.has(pair)||!['manual','automatic'].includes(t.source)||t.source==='automatic'&&!Object.hasOwn(TRIGGERS,t.kind)||t.source==='manual'&&!MANUAL.includes(t.kind)||!['open','processing','closed'].includes(t.status))bad();pairs.add(pair);
  // 0.16 S3: Auslöser nur bei automatischen Anliegen (Altstände ohne Feld gültig); Teillieferung, Risiko und Störung nur bei Vertragsaufträgen.
  if(t.trigger!==undefined&&(t.source!=='automatic'||!TRIGGERS[t.kind].includes(t.trigger)||t.trigger!=='late'&&!o.contractId))bad();
  if(t.kind==='partial'&&t.trigger!=='partial'||t.kind==='status'&&t.source==='automatic'&&t.trigger===undefined)bad();
  if(t.respondBy!==undefined&&t.respondBy!==t.createdAt+RESPONSE_MINUTES[t.kind])bad();
  if(t.respondBy===undefined&&(t.kind==='partial'||t.trigger!==undefined))bad();
  if(t.expired!==undefined&&(t.expired!==true||t.respondBy===undefined||s.t<=t.respondBy||t.startedAt!==null&&t.startedAt<=t.respondBy))bad();
  if(t.status==='closed'?(typeof t.reply!=='string'||!t.reply.trim()||t.reply.length>1000):t.reply!==null)bad();
  if(!time(t.createdAt)||!number(t.originalDue)||!number(t.cost)||cents(t.cost)!==t.cost||!Number.isInteger(t.remaining)||t.remaining<0||t.remaining>DURATIONS[t.kind]||!(t.blocked===null||typeof t.blocked==='string'))bad();
  if(t.kind==='deadline'){const extension=t.requestedDue-t.originalDue;if(!number(t.requestedDue)||!Number.isInteger(extension)||extension<60||extension>1440)bad();}else if(t.requestedDue!==null)bad();
  if(t.status==='open'){
   if(t.response!==null||t.startedAt!==null||t.valueAtResponse!==null||t.cost!==0||t.remaining!==0||t.completedAt!==null||t.outcome!==null||t.blocked!==null)bad();
  }else{
   if(!RESPONSES[t.kind].includes(t.response)||!time(t.startedAt)||t.startedAt<t.createdAt||!number(t.valueAtResponse)||t.cost!==costFor(t.response,t.valueAtResponse))bad();
   // These immutable upper bounds catch forged excessive compensation even after deliveries.
   if(t.response==='approve'&&t.valueAtResponse>o.qty*o.price+1e-7||t.response==='goodwill'&&t.valueAtResponse>o.paid+1e-7||!['approve','goodwill'].includes(t.response)&&t.valueAtResponse!==0)bad();
   if(t.status==='processing'){if(t.completedAt!==null||t.outcome!==null||DURATIONS[t.kind]-t.remaining>s.t-t.startedAt)bad();}
   else if(t.remaining!==0||!time(t.completedAt)||t.completedAt<t.startedAt+DURATIONS[t.kind]||t.blocked!==null||!(t.outcome===t.response||t.response==='approve'&&t.outcome==='obsolete'))bad();
  }
  if(t.status==='closed'&&t.outcome==='approve'&&o.due!==t.requestedDue)bad();
  const rows=s.ledger.filter(l=>l.key==='ticket-cost:'+t.id),charged=t.status==='closed'&&t.outcome!=='obsolete'&&t.cost>0;
  if(rows.length!==(charged?1:0)||charged&&(rows[0].amount!==-t.cost||rows[0].t!==t.completedAt||rows[0].category!=='Kundendienst'||!Array.isArray(rows[0].refs)||!rows[0].refs.includes(t.id)||!rows[0].refs.includes(t.orderId)))bad();
  const assigned=s.workers.filter(w=>w.task===task(t));if(assigned.length>1||assigned.some(w=>w.role!=='service'||w.site!==t.site)||assigned.length&&(t.status!=='processing'||t.remaining===0))bad();
 }
 for(const l of s.ledger)if(l.key.startsWith('ticket-cost:')&&!ids.has(l.key.slice(12)))bad();
 for(const w of s.workers)if(typeof w.task==='string'&&w.task.startsWith('ticket:')&&!ids.has(w.task.slice(7)))bad();
}
