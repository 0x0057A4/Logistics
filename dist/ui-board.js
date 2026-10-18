// 0.17 (A08/A10-P, docs/SCHNITTSTELLEN-0.17-UI.md, Nutzerabschnitte 11 und 12).
// Reine Lesesichten: Tagesliquidität aus dem Journal (s.ledger) und Kundendienst-/Rücklauf-Board aus s.tickets und s.returns.
// Keine Buchung, kein Befehl, keine Zustandsänderung. Statuswechsel entstehen nur über die vorhandenen Befehle
// (respondTicket, resolveReturn) und die Simulation; das Board ordnet lediglich die echten Status den Spalten zu.
import {ITEMS} from './catalog.js';
import {KIND_TEXT} from './customer-service.js';

export const DAY=1440;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
const pad=n=>String(n).padStart(2,'0');
const clock=t=>`Tag ${Math.floor(t/DAY)+1} · ${pad(Math.floor(t%DAY/60))}:${pad(Math.floor(t%60))}`;
const hhmm=t=>`${pad(Math.floor(t%DAY/60))}:${pad(Math.floor(t%60))}`;
const rest=m=>{m=Math.max(0,Math.ceil(m));return m>=60?`${Math.floor(m/60)} Std. ${pad(m%60)} Min.`:`${m} Min.`;};
const NF=new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
export const money=v=>NF.format(Math.abs(v))+' €';
/** Betrag mit Vorzeichen: „+12,00 €“, „−3,50 €“, „±0,00 €“. */
export const signed=v=>(v>0.004?'+':v<-0.004?'−':'±')+money(v);

/* ======================= Abschnitt 11: Liquidität heute ======================= */
/** Finanzierung: kein Erlös bzw. keine betriebliche Ausgabe; wird separat ausgewiesen (accounting.js: financing). */
export const FINANCING=new Set(['Kredit','Tilgung']);
/** Tagessammelbuchungen (economy.book): Schlüssel `<art>:day:<Spieltag>`; der Spieltag steht im Schlüssel. */
const DAY_KEY=/^(?:wage:[^:]+|energy|rent|interest):day:(\d+)$/;
/** Spieltag einer Journalzeile nach Simulationszeit. */
export function ledgerDay(row){const m=typeof row?.key==='string'?DAY_KEY.exec(row.key):null;return m?Number(m[1]):Math.floor((Number(row?.t)||0)/DAY);}
/**
 * Geldbewegungen eines Spieltags (Standard: laufender Spieltag) aus tatsächlich gebuchten Journalzeilen.
 * - inflow/outflow/net: Zahlungseingänge/-ausgänge ohne Finanzierung; net = inflow − outflow (Saldo heute, kein Gewinn).
 * - financing: Kreditauszahlung (loanIn) und Tilgung (repayment) separat – Kredit ist kein Erlös.
 * - accountChange = Summe aller Zeilen des Tages = net + loanIn − repayment (Abstimmung mit dem Kontostand).
 * Unbezahlte Rechnungen erzeugen keine Journalzeile und zählen daher nicht. Das Modell hat ein einziges Geldkonto:
 * Standorttransfers, Umlagerungen und Reservierungen buchen kein Geld, interne Umbuchungen gibt es im Journal nicht –
 * jede Zeile wird genau einmal gezählt (Sammelbuchungen als eine Zeile mit Tagessumme).
 */
export function dayCash(s,day=Math.floor((s?.t||0)/DAY)){
 let inflow=0,outflow=0,loanIn=0,repayment=0,count=0;const cats=new Map();
 for(const row of s?.ledger||[]){
  if(!Number.isFinite(row?.amount)||ledgerDay(row)!==day)continue;count++;
  const a=row.amount;
  if(FINANCING.has(row.category)){if(row.category==='Kredit')loanIn+=a;else repayment-=a;}
  else if(a>=0)inflow+=a;else outflow-=a;
  const c=cats.get(row.category)||{category:row.category,inflow:0,outflow:0,net:0,financing:FINANCING.has(row.category),rows:0};
  if(a>=0)c.inflow+=a;else c.outflow-=a;c.net+=a;c.rows++;cats.set(row.category,c);
 }
 inflow=cents(inflow);outflow=cents(outflow);loanIn=cents(loanIn);repayment=cents(repayment);
 const net=cents(inflow-outflow),accountChange=cents(net+loanIn-repayment);
 const today=Math.floor((s?.t||0)/DAY)===day;
 const categories=[...cats.values()].map(c=>({...c,inflow:cents(c.inflow),outflow:cents(c.outflow),net:cents(c.net)})).sort((a,b)=>a.financing-b.financing||Math.abs(b.net)-Math.abs(a.net));
 return {day,from:day*DAY,to:today?s.t:day*DAY+DAY-1,inflow,outflow,net,financing:{loanIn,repayment},accountChange,
  openingBalance:today&&Number.isFinite(s?.money)?cents(s.money-accountChange):null,rows:count,categories};
}
/** Drei große Tageswerte + Finanzierung + Tagesbuchungen nach Bereich. label(k) übersetzt Kategorienamen. */
export function renderDayCash(s,{label=k=>k}={}){
 const d=dayCash(s),tone=d.net>0.004?'pos':d.net<-0.004?'neg':'zero',word=tone==='pos'?'Überschuss':tone==='neg'?'Fehlbetrag':'ausgeglichen';
 const fin=d.financing.loanIn||d.financing.repayment;
 return `<section class="daycash" aria-label="Liquidität heute"><div class="daycash-head"><h3>Liquidität heute</h3><small>Spieltag ${d.day+1} · 00:00–${hhmm(s.t)} · nur gebuchte Zahlungen</small></div>
<div class="daycash-values">
<div class="dc-val in"><small>Heute eingenommen</small><b>${signed(d.inflow)}</b><span>Zahlungseingänge</span></div>
<div class="dc-val out"><small>Heute ausgegeben</small><b>${d.outflow?'−'+money(d.outflow):money(0)}</b><span>Zahlungsausgänge</span></div>
<div class="dc-val net ${tone}"><small>Saldo heute</small><b>${signed(d.net)}</b><span>${tone==='pos'?'▲':tone==='neg'?'▼':'●'} ${word}</span></div></div>
<p class="fine daycash-note">Saldo heute = Zahlungseingänge minus Zahlungsausgänge. Kein Gewinn: Einkauf und Investitionen zählen beim Bezahlen, unbezahlte Rechnungen gar nicht.${fin?'':' Kredit und Tilgung wären separat ausgewiesen.'}</p>
${fin?`<div class="daycash-fin" role="note"><b>Finanzierung (nicht im Saldo):</b> ${d.financing.loanIn?`Kreditauszahlung ${signed(d.financing.loanIn)} – kein Erlös`:''}${d.financing.loanIn&&d.financing.repayment?' · ':''}${d.financing.repayment?`Tilgung −${money(d.financing.repayment)}`:''} · Kontoveränderung heute ${signed(d.accountChange)}</div>`:''}
<details class="daycash-cats"><summary>Heutige Buchungen nach Bereich · ${d.rows} ${d.rows===1?'Journalzeile':'Journalzeilen'}</summary>${d.categories.map(c=>`<div class="kv"><span>${esc(label(c.category))}${c.financing?' <small class="muted">(Finanzierung)</small>':''}</span><b class="${c.net<0?'money-minus':'money-plus'}">${signed(c.net)}</b></div>`).join('')||'<p class="fine">Heute noch keine Zahlung gebucht.</p>'}</details></section>`;
}

/* ======================= Abschnitt 12: Kundendienst- und Rücklauf-Board ======================= */
export const COLUMNS={open:'Offen',work:'In Bearbeitung',done:'Abgeschlossen'};
const TRIGGER={late:'Lieferfrist überschritten',risk:'drohende Verspätung',disruption:'Störungsverzug',partial:'Rest nicht unterwegs'};
const OUTCOME={inform:'Status mitgeteilt',approve:'Frist verlängert',reject:'Fristverlängerung abgelehnt',goodwill:'Kulanz ausgezahlt',apologize:'Entschuldigung übermittelt',obsolete:'Anliegen gegenstandslos'};
const RESPONSE={inform:'Status mitteilen',approve:'Frist genehmigen',reject:'Frist ablehnen',goodwill:'Kulanz gewähren',apologize:'Entschuldigen'};
const RESPONSES={status:['inform'],deadline:['approve','reject'],complaint:['goodwill','apologize'],partial:['goodwill','apologize']};
/** Retourenstatus (service.js) → Spalte, Unterstatus, nächster Schritt. Abgeschlossen nur repaired/recycled. */
export const RETURN_STATUS={
 scheduled:{col:'open',sub:'Wartet auf Rücksendung · Abholung per Tour geplant',next:'Tour holt die Ware beim Kunden ab'},
 onTour:{col:'work',sub:'Wartet auf Rücksendung · Abholung auf Tour',next:'Tour bringt die Ware zum Standort'},
 collecting:{col:'work',sub:'Wartet auf Rücksendung · Abholung beim Kunden',next:'Fahrzeug holt die Ware ab'},
 returning:{col:'work',sub:'Rücktransport',next:'Fahrzeug fährt zum Standort'},
 unloading:{col:'work',sub:'Entladung an der Rampe',next:'Lagerkraft lagert in Quarantäne ein'},
 inspection:{col:'work',sub:'Prüfung und Erstattung',next:'Kundenservice prüft, danach Erstattung'},
 decision:{col:'work',sub:'Wartet auf deine Entscheidung',next:'Reparieren oder Verwerten wählen',action:true},
 repair:{col:'work',sub:'Reparatur in der Werkstatt',next:'Technik repariert mit Ersatzteilen'},
 recycling:{col:'work',sub:'Verwertung',next:'Lagerkraft verwertet die Ware'},
 repaired:{col:'done',sub:'Repariert · wieder verkaufbar',next:'Erledigt'},
 recycled:{col:'done',sub:'Verwertet',next:'Erledigt'}
};
const itemName=id=>ITEMS[id]?.name||id||'—';
function ticketCard(s,t,orders){
 const o=orders.get(t.orderId),col=t.status==='open'?'open':t.status==='processing'?'work':'done';
 const overdue=t.respondBy!=null&&col!=='done'&&(t.expired||s.t>t.respondBy),tight=!overdue&&t.respondBy!=null&&col!=='done'&&t.respondBy-s.t<=60;
 let sub,next;
 if(col==='open'){sub=overdue?'Antwortfrist abgelaufen · Antwort weiter möglich':'Wartet auf Antwort';next='Antwort wählen: '+(RESPONSES[t.kind]||[]).filter(r=>r!=='goodwill'||o?.paid>0).map(r=>RESPONSE[r]).join(' / ');}
 else if(col==='work'){sub=t.blocked?'Wartet: '+t.blocked:'Kundendienst bearbeitet';next=t.blocked?(/Kapital/.test(t.blocked)?'Kapital bereitstellen':'Kundendienstkraft am Standort einplanen (Schicht prüfen)'):`Bearbeitung läuft, noch ${t.remaining} Min.`;}
 else {sub=OUTCOME[t.outcome]||'Abgeschlossen';next='Erledigt';}
 const deadline=t.respondBy==null?(col==='done'?'':'keine Antwortfrist'):col==='done'?`Antwortfrist ${t.expired||t.completedAt>t.respondBy?'nicht eingehalten':'eingehalten'}`:overdue?`Antwortfrist abgelaufen seit ${clock(t.respondBy)}`:`Antwort bis ${hhmm(t.respondBy)} · noch ${rest(t.respondBy-s.t)}`;
 return {id:t.id,type:'ticket',col,sub,next,site:t.site,customer:o?.customer||'Unbekannter Kunde',orderId:t.orderId,product:o?itemName(o.item):'—',
  reason:(KIND_TEXT[t.kind]||t.kind)+(t.trigger&&TRIGGER[t.trigger]?' · '+TRIGGER[t.trigger]:t.source==='manual'?' · manuell':''),
  deadline,priority:overdue?'überfällig':tight||t.blocked?'dringend':'normal',attention:overdue||tight||!!t.blocked,
  sort:col==='done'?-(t.completedAt||0):(t.respondBy??t.createdAt+100000),created:t.createdAt,done:t.completedAt};
}
function returnCard(s,r,orders){
 const o=orders.get(r.orderId),st=RETURN_STATUS[r.status]||{col:'work',sub:r.status,next:'—'};
 const next=r.blocked?`Blockiert: ${r.blocked}`:st.col==='done'?st.next:r.remaining>0&&!st.action?`${st.next} · noch ${rest(r.remaining)}`:st.next;
 return {id:r.id,type:'return',col:st.col,sub:st.sub+(r.blocked?' · ⚠ blockiert':''),next,site:r.site,customer:o?.customer||'Unbekannter Kunde',orderId:r.orderId,
  product:`${r.qty} × ${itemName(r.item)}`,reason:'Kundenretoure · Grund nicht erfasst',deadline:'keine Frist',
  priority:r.blocked?'blockiert':st.action?'Aktion nötig':'normal',attention:!!r.blocked||!!st.action,
  sort:st.col==='done'?-(r.completedAt??r.createdAt??0):(st.action?-1e9:0)+(r.createdAt??0),created:r.createdAt,done:r.completedAt??null};
}
/** Alle Board-Karten aus echten Vorgängen. */
export function boardCards(s){
 const orders=new Map((s.orders||[]).map(o=>[o.id,o]));
 return [...(s.tickets||[]).map(t=>ticketCard(s,t,orders)),...(s.returns||[]).map(r=>returnCard(s,r,orders))];
}
/** Filter: type ('all'|'ticket'|'return'), site ('all'|ID), prio ('all'|'attention'), q. Ergebnis je Spalte sortiert. */
export function boardColumns(s,filter={}){
 const q=String(filter.q||'').trim().toLowerCase(),cols={open:[],work:[],done:[]};
 for(const c of boardCards(s)){
  if(filter.type&&filter.type!=='all'&&c.type!==filter.type)continue;
  if(filter.site&&filter.site!=='all'&&c.site!==filter.site)continue;
  if(filter.prio==='attention'&&!c.attention)continue;
  if(q&&![c.id,c.customer,c.orderId,c.product,c.reason,c.sub].some(x=>String(x||'').toLowerCase().includes(q)))continue;
  cols[c.col].push(c);
 }
 for(const k of Object.keys(cols))cols[k].sort((a,b)=>a.sort-b.sort||String(a.id).localeCompare(String(b.id)));
 return cols;
}
/** Ansichtszustand (nicht im Spielstand). sel = ausgewählte Karte; ohne Auswahl die dringendste. */
export const boardView={type:'all',site:'all',prio:'all',q:'',sel:null};
const DONE_MAX=25;
const opt=(v,t,cur)=>`<option value="${esc(v)}"${String(cur)===String(v)?' selected':''}>${esc(t)}</option>`;
/**
 * Board-HTML. opts.detail(card) liefert das Detail-HTML der gewählten Karte mit den vorhandenen Aktionen (app.js).
 * Klick: data-board-card, Filter: data-board-filter, Suche: data-board-search.
 */
export function renderBoard(s,view=boardView,opts={}){
 const cols=boardColumns(s,view),flat=[...cols.open,...cols.work,...cols.done];
 const sel=flat.find(c=>c.id===view.sel)||(view.sel===''?null:cols.open[0]||cols.work[0]||cols.done[0]||null);
 const tickets=(s.tickets||[]).length,returns=(s.returns||[]).length;
 const card=c=>{const on=sel&&c.id===sel.id;return `<article class="bcard type-${c.type}${c.attention?' attention':''}${on?' selected':''}" data-board-id="${esc(c.id)}">
<button type="button" class="bcard-head" data-board-card="${esc(c.id)}" aria-expanded="${!!on}"><span class="bcard-type">${c.type==='ticket'?'Anliegen':'Rücklauf'}</span><strong>${esc(c.customer)}</strong><small>${esc(c.id)} · Auftrag ${esc(c.orderId)}</small>
<span class="bcard-line"><b>${esc(c.product)}</b> · ${esc(c.reason)}</span>
<span class="bcard-sub">${esc(c.sub)}</span>
${c.deadline?`<span class="bcard-line${c.priority==='überfällig'?' money-minus':''}">${c.priority!=='normal'?`<span class="bprio prio-${c.priority==='überfällig'||c.priority==='blockiert'?'bad':'warn'}">${c.priority==='überfällig'||c.priority==='blockiert'?'⚠':'!'} ${esc(c.priority)}</span> `:''}${esc(c.deadline)}</span>`:c.priority!=='normal'?`<span class="bcard-line"><span class="bprio prio-warn">! ${esc(c.priority)}</span></span>`:''}
<span class="bcard-next">→ ${esc(c.next)}</span></button>
${on&&opts.detail?`<div class="bcard-detail">${opts.detail(c)}</div>`:''}</article>`;};
 const column=(k)=>{const list=cols[k],shown=k==='done'?list.slice(0,DONE_MAX):list;
  return `<section class="bcol col-${k}" aria-label="${COLUMNS[k]}"><h4>${COLUMNS[k]} <span class="bcount">${list.length}</span></h4>${shown.map(card).join('')||'<p class="fine bempty">Keine Vorgänge.</p>'}${list.length>shown.length?`<p class="fine">+ ${list.length-shown.length} ältere – Suche nutzen.</p>`:''}</section>`;};
 const tools=`<div class="board-tools" role="group" aria-label="Board filtern">
<label>Art<select data-board-filter="type">${opt('all','Alle Vorgänge',view.type)}${opt('ticket','Kundendienst-Anliegen',view.type)}${opt('return','Rückläufe / Retouren',view.type)}</select></label>
<label>Standort<select data-board-filter="site">${opt('all','Alle Standorte',view.site)}${(s.sites||[]).map(x=>opt(x.id,x.name||x.id,view.site)).join('')}</select></label>
<label>Priorität<select data-board-filter="prio">${opt('all','Alle',view.prio)}${opt('attention','Nur dringend / blockiert',view.prio)}</select></label>
<label class="board-q">Suche<input type="search" id="boardSearch" data-board-search value="${esc(view.q||'')}" placeholder="Kunde, Vorgang, Produkt …" autocomplete="off"></label></div>`;
 return `<section class="section board" aria-label="Kundendienst und Rückläufe"><h3>Vorgänge</h3>${tools}
<p class="fine board-sum">Kundendienst: ${tickets?`${tickets} ${tickets===1?'Anliegen':'Anliegen'}`:'Keine Tickets.'} · Rückläufe: ${returns||'keine'}. Spalten folgen dem echten Bearbeitungsstand; Abschluss erst nach tatsächlicher Bearbeitung, Prüfung, Erstattung bzw. Reparatur oder Verwertung. Karte anklicken für Details und Aktionen.</p>
<div class="board-cols">${column('open')}${column('work')}${column('done')}</div></section>`;
}
export function boardChange(el,view=boardView){const f=el?.dataset?.boardFilter;if(f&&['type','site','prio'].includes(f)){view[f]=el.value;return true;}return false;}
export function boardInput(el,view=boardView){if(el?.dataset&&'boardSearch' in el.dataset){view.q=String(el.value||'').slice(0,60);return true;}return false;}
/** Klick auf eine Karte wählt sie aus bzw. klappt sie zu (sel=''). */
export function boardClick(el,view=boardView){const id=el?.dataset?.boardCard;if(id===undefined)return false;view.sel=el.getAttribute?.('aria-expanded')==='true'?'':id;return true;}
