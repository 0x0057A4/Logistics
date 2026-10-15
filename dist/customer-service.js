// Auftragsbezogener Kundendienst. Ware, Rechnungen und Zahlungseingänge bleiben unverändert.
const DURATIONS={status:15,deadline:30,complaint:20};
const RESPONSES={status:['inform'],deadline:['approve','reject'],complaint:['goodwill','apologize']};
const cents=n=>Math.round(n*100)/100;
const task=t=>'ticket:'+t.id;
const costFor=(response,value)=>response==='approve'?cents(value*.02):response==='goodwill'?cents(Math.min(50,value*.05)):0;
export function init(s){s.tickets??=[];}
function create(s,o,kind,extension,source,api){
 const id=api.id('ticket');
 s.tickets.push({id,orderId:o.id,site:o.site,kind,source,status:'open',createdAt:s.t,remaining:0,blocked:null,response:null,originalDue:o.due,requestedDue:kind==='deadline'?o.due+extension:null,cost:0,valueAtResponse:null,startedAt:null,completedAt:null,outcome:null,reply:null});
 api.log('service',`Kundendienst: ${kind==='status'?'Statusanfrage':kind==='deadline'?'Fristverlängerung':'Beschwerde'} zu ${o.customer}.`,[id,o.id]);return {ok:true,id};
}
export function handle(s,c,api){
 if(c.type==='createTicket'){
  const o=s.orders.find(o=>o.id===c.orderId);
  if(!o||!['active','fulfilled'].includes(o.status)||!Object.hasOwn(DURATIONS,c.kind))return {ok:false,message:'Aktiven oder erfüllten Auftrag und gültigen Anliegen-Typ wählen.'};
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
export function step(s,api){
 for(const o of s.orders)if(o.status==='active'&&s.t>o.due&&!s.tickets.some(t=>t.orderId===o.id&&t.kind==='complaint'))create(s,o,'complaint',null,'automatic',api);
 for(const t of s.tickets){
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
  const status={active:'aktiv',fulfilled:'erfüllt',cancelled:'storniert',offer:'angeboten'}[o.status];
  t.reply=obsolete?'Friständerung gegenstandslos. Keine Gebühr berechnet.':t.response==='inform'?`Auftrag ${status}: ${o.delivered} von ${o.qty} Stück geliefert, ${Math.max(0,o.qty-o.delivered)} Stück offen. Lieferfrist: Spielminute ${o.due}.`:t.response==='approve'?`Lieferfrist auf Spielminute ${o.due} verlängert. Gebühr: ${t.cost.toFixed(2)} €.`:t.response==='reject'?'Fristverlängerung abgelehnt. Bisherige Lieferfrist bleibt bestehen.':t.response==='goodwill'?`Kulanz von ${t.cost.toFixed(2)} € ausgezahlt.`:'Beschwerde beantwortet. Entschuldigung ohne Auszahlung dokumentiert.';
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
  if(!o||t.site!==o.site||!s.sites.some(site=>site.id===t.site)||!Object.hasOwn(DURATIONS,t.kind)||pairs.has(pair)||!['manual','automatic'].includes(t.source)||t.source==='automatic'&&t.kind!=='complaint'||!['open','processing','closed'].includes(t.status))bad();pairs.add(pair);
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
