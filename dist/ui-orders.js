// 0.17 Abschnitte 5 und 6 (A05/A10-S): Auftragstabelle und Auftrags-Tab der unteren Betriebsleiste.
// Mengen ausschließlich aus stock-view.js (dieselbe Rechnung wie das Lager). Aktionen bleiben die vorhandenen Befehle
// (acceptOrder, dispatch, cancelOrder, Akte); diese Datei sendet selbst keine Befehle.
import {ITEMS} from './catalog.js';
import {orderCoverage,coverageText,resourceNeeds,needText,suggestOrder,orderToProduce,chainRecipe,unitOf} from './stock-view.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NF=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}),EF=new Intl.NumberFormat('de-DE',{minimumFractionDigits:0,maximumFractionDigits:2});
const fmt=n=>NF.format(Number(n)||0),euro=n=>EF.format(Number(n)||0)+' €';
const clock=t=>`Tag ${Math.floor(t/1440)+1} · ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
/** Spieldauer in Minuten als kurzer Text. */
export function span(min){min=Math.max(0,Math.round(min));if(min<60)return `${min} Min.`;if(min<1440){const h=Math.floor(min/60),m=min%60;return m?`${h} Std. ${m} Min.`:`${h} Std.`;}const d=Math.floor(min/1440),h=Math.floor(min%1440/60);return h?`${d} T ${h} Std.`:`${d} T`;}
/** Restzeit kurz für die einzeilige Tabelle (volle Angabe im Tooltip): ab 1 Std. ohne Minuten. */
function shortRest(o,s,due){
 if(o.status!=='active'&&o.status!=='offer')return due.rest;
 const left=o.due-s.t,m=Math.abs(Math.round(left)),t=m<60?`${m} Min.`:m<1440?`${Math.floor(m/60)} Std.`:`${Math.floor(m/1440)} T${Math.floor(m%1440/60)?' '+Math.floor(m%1440/60)+' Std.':''}`;
 return left<0?`seit ${t}`:`noch ${t}`;
}
/** Knappe Frist (Warnschwelle) in Spielminuten. */
export const DUE_TIGHT=120,DUE_SOON=360;

/** Status nach Statusmodell (offer/active/fulfilled/cancelled + Fristüberschreitung o.late bzw. s.t > due). */
export function orderStatus(s,o,c=orderCoverage(s,o)){
 if(o.status==='offer')return {key:'offer',text:'Angebot',tone:'neutral'};
 if(o.status==='fulfilled')return {key:'done',text:o.late?'Erfüllt · verspätet':'Erfüllt',tone:o.late?'wait':'good'};
 if(o.status==='cancelled')return {key:'done',text:'Storniert',tone:'neutral'};
 const overdue=s.t>o.due,running=(o.delivered||0)>0||c.underway>0||c.reservedForThis>0;
 return {key:running?'running':'open',overdue,text:(overdue?'Überfällig · ':'')+(running?'Laufend':'Offen'),tone:overdue?'bad':running?'move':'neutral'};
}
/** Frist mit Restzeit und Warnstufe. Fertige/stornierte Aufträge ohne Warnung. */
export function dueInfo(s,o){
 const left=o.due-s.t,live=o.status==='active'||o.status==='offer';
 if(!live)return {text:clock(o.due),rest:o.status==='fulfilled'?'abgeschlossen':'—',tone:'neutral',warn:''};
 if(left<0)return {text:clock(o.due),rest:`überfällig seit ${span(-left)}`,tone:'bad',warn:'Frist überschritten'};
 if(left<=DUE_TIGHT)return {text:clock(o.due),rest:`noch ${span(left)}`,tone:'bad',warn:'Frist knapp'};
 if(left<=DUE_SOON)return {text:clock(o.due),rest:`noch ${span(left)}`,tone:'wait',warn:'Frist bald'};
 return {text:clock(o.due),rest:`noch ${span(left)}`,tone:'neutral',warn:''};
}
const KIND=o=>o.kind==='vas'?'Mehrwertdienst · '+(o.service||'Lohnfertigung'):o.contractId?'Frachtvertrag':o.kind==='logistics'?'Fremdlogistik':o.kind==='manufacturing'?'Auftragsfertigung':'Eigenprodukte';

export const ordersUi={sort:'due',dir:1,filter:'current',expanded:new Set(),limit:60,focus:null};
const FILTERS=[['current','Aktuell'],['offer','Angebote'],['open','Offen'],['running','Laufend'],['overdue','Überfällig'],['done','Erledigt'],['all','Alle']];
const SORTS={due:'Termin',customer:'Kunde',missing:'Fehlt',value:'Wert',status:'Status'};
const STATUS_RANK={overdue:0,running:1,open:2,offer:3,done:4};
function pass(f,st){return f==='all'||(f==='current'&&st.key!=='done')||(f==='overdue'?!!st.overdue:st.key===f);}
const valueOf=o=>o.qty*o.price;
function matches(s,o,q){if(!q)return true;return [o.id,o.customer,ITEMS[o.item]?.name,o.item,KIND(o),o.contractId,o.service].join(' ').toLowerCase().includes(q);}

/** Ausgewählte Zeilen inkl. Status/Deckung, sortiert und gefiltert (für Tabelle und Tests). */
export function orderRows(s,{search='',filter=ordersUi.filter,sort=ordersUi.sort,dir=ordersUi.dir}={}){
 const rows=[];
 for(const o of s.orders){if(!matches(s,o,search))continue;const c=orderCoverage(s,o),st=orderStatus(s,o,c);if(!pass(filter,st))continue;rows.push({o,c,st,due:dueInfo(s,o)});}
 const cmp={due:(a,b)=>a.o.due-b.o.due,customer:(a,b)=>String(a.o.customer).localeCompare(String(b.o.customer),'de'),missing:(a,b)=>a.c.missing-b.c.missing,value:(a,b)=>valueOf(a.o)-valueOf(b.o),status:(a,b)=>STATUS_RANK[a.st.overdue?'overdue':a.st.key]-STATUS_RANK[b.st.overdue?'overdue':b.st.key]}[sort]||((a,b)=>a.o.due-b.o.due);
 return rows.sort((a,b)=>cmp(a,b)*dir||a.o.due-b.o.due||(a.o.id<b.o.id?-1:1));
}

function resourceBlock(s,o,c){
 const n=orderToProduce(s,o);if(!chainRecipe(o.item)||o.kind==='logistics')return '';
 if(n<=0)return `<p class="fine">Rezeptbedarf: durch vorhandene Fertigware gedeckt, keine weitere Herstellung nötig.</p>`;
 const owner=o.kind==='vas'?o.id:'company',rows=resourceNeeds(s,o.item,n,{site:o.site,owner});
 return `<div class="ov-res"><b>Ressourcen für ${fmt(n)} noch herzustellende ${esc(ITEMS[o.item]?.name||o.item)}</b> <small class="muted">(Fehlmenge nach Abzug vorhandener Fertigware${o.kind==='vas'?'; Kundenmaterial dieses Auftrags':''})</small><ul>${rows.map(r=>`<li class="${r.missing>0?'warn':''}">${esc(r.name)} · ${esc(needText(r,fmt))}${r.incoming>0?` · ${fmt(r.incoming)} im Zulauf`:''}${r.missing>0?' <span aria-hidden="true">⚠</span>':''}${r.purchasable&&owner==='company'?` <button class="sv-plus" data-action="stockBuy" data-id="${esc(r.item)}|${suggestOrder(r)}" title="Ressource bestellen" aria-label="Ressource bestellen: ${esc(r.name)}">+</button>`:''}</li>`).join('')}</ul></div>`;
}
function coverageBlock(s,o,c){
 if(o.status!=='active'&&o.status!=='offer')return '';
 const lines=[`<p class="ov-cover"><b>${esc(coverageText(c,fmt))}</b></p>`];
 const notes=[];
 if(c.blocked>0)notes.push(`${fmt(c.blocked)} gesperrt/Quarantäne`);
 if(c.pending>0)notes.push(`${fmt(c.pending)} im Wareneingang (noch nicht einlagert)`);
 if(c.lowQuality>0)notes.push(`${fmt(c.lowQuality)} frei, aber unter Mindestqualität ${fmt(o.quality)} %`);
 if(c.incoming>0)notes.push(`${fmt(c.incoming)} im Zulauf`);
 if(c.inProduction>0)notes.push(`${fmt(c.inProduction)} in Fertigung`);
 if(notes.length)lines.push(`<p class="fine">${esc(notes.join(' · '))}</p>`);
 lines.push(`<p class="fine">Verfügbarkeit ist keine Zusage. Verbindlich ist nur, was bei Lieferung oder Tour reserviert wird.${c.competing?` Derselbe freie Bestand wird von ${fmt(c.competing)} weiteren ${c.competing===1?'Auftrag':'Aufträgen'} benötigt (zusammen ${fmt(c.poolDemand)} ${esc(unitOf(o.item))}).`:''}</p>`);
 return lines.join('')+resourceBlock(s,o,c);
}

/** HTML der Auftragstabelle. ctx.detail(o) liefert die vorhandenen Auftragsdetails/Aktionen (app.js). */
export function ordersTable(s,ctx={}){
 const search=ctx.search||'';
 if(ordersUi.focus){const id=ordersUi.focus,o=s.orders.find(x=>x.id===id);ordersUi.focus=null;if(o){ordersUi.expanded.add(id);ordersUi.focused=id;const st=orderStatus(s,o);if(!pass(ordersUi.filter,st))ordersUi.filter=st.key==='done'?'done':'current';const i=orderRows(s,{search}).findIndex(r=>r.o.id===id);if(i>=ordersUi.limit)ordersUi.limit=i+1;}}
 const all=orderRows(s,{search}),rows=all.slice(0,ordersUi.limit),f=ordersUi.filter,k=ordersUi.sort,d=ordersUi.dir;
 const counts=Object.fromEntries(FILTERS.map(([id])=>[id,0]));for(const o of s.orders){if(!matches(s,o,search))continue;const st=orderStatus(s,o);for(const [id] of FILTERS)if(pass(id,st))counts[id]++;}
 const chips=FILTERS.map(([id,t])=>`<button class="sv-chip${f===id?' on':''}${id==='overdue'&&counts[id]?' bad':''}" data-action="ordersFilter" data-id="${id}" aria-pressed="${f===id}">${t} <span class="sv-n">${fmt(counts[id])}</span></button>`).join('');
 const th=(key,cls='')=>`<th class="${cls}" aria-sort="${k===key?(d>0?'ascending':'descending'):'none'}"><button class="sv-sort" data-action="ordersSort" data-id="${key}" title="Nach ${SORTS[key]} sortieren">${SORTS[key]}${k===key?(d>0?' ▲':' ▼'):''}</button></th>`;
 const body=rows.map(({o,c,st,due})=>{
  const open=ordersUi.expanded.has(o.id),live=o.status==='active'||o.status==='offer',unit=unitOf(o.item);
  // 0.17 Nutzervorgabe 18.10.2026: jede Zeile einzeilig. Zusatzangaben in derselben Zeile (gekürzt) und vollständig im Tooltip;
  // weitere Einzelheiten in der Aufklappzeile.
  const act=o.status==='offer'?`<button class="primary" data-action="accept" data-id="${esc(o.id)}">Annehmen</button>`:'';
  const toggle=`<button class="sv-link" data-action="orderToggle" data-id="${esc(o.id)}" aria-expanded="${open}" title="${open?'Details ausblenden':o.status==='active'?'Liefern und Details anzeigen':'Details anzeigen'}">${open?'Weniger ▾':o.status==='active'?'Liefern ▸':o.status==='offer'?'▸':'Details ▸'}</button>`;
  const prod=ITEMS[o.item]?.name||o.item,stShort=st.overdue?'Überfällig':st.text;
  const tCust=`${o.customer} · ${o.id} · ${KIND(o)}`,tProd=prod+(o.quality?` · Mindestqualität ${fmt(o.quality)} %`:'');
  const tDel=`${fmt(o.delivered||0)} von ${fmt(o.qty)} ${unit} geliefert`,tRes=live?`${fmt(c.reservedForThis)} für diesen Auftrag reserviert${c.underway>0?` · ${fmt(c.underway)} unterwegs`:''}`:'';
  const tDue=`Liefertermin ${due.text} · ${due.rest}${due.warn?' · '+due.warn:''}`,tSt=st.text+(o.kind==='vas'?' · Mehrwertdienst':'');
  return `<tr class="ov-row${open?' open':''}${ordersUi.focused===o.id?' selected':''}${due.tone==='bad'?' late':''}" data-order-row="${esc(o.id)}"><td title="${esc(tCust)}"><b>${esc(o.customer)}</b> <small class="muted">${esc(o.id)}</small></td><td title="${esc(tProd)}"><span class="ov-pname">${esc(prod)}</span>${o.quality?` <small class="muted">≥ ${fmt(o.quality)} %</small>`:''}</td><td class="num" title="${esc(tDel)}">${fmt(o.delivered||0)} / ${fmt(o.qty)}</td><td class="num"${tRes?` title="${esc(tRes)}"`:''}>${live?fmt(c.reservedForThis):'—'}${c.underway>0?` <small class="muted">+${fmt(c.underway)}</small>`:''}</td><td class="num" title="Zusätzlich frei verfügbar – keine Zusage">${live?fmt(c.freeOther):'—'}</td><td class="num"${live?` title="${esc(coverageText(c,fmt))}"`:''}>${live?(c.missing>0?`<b class="ov-miss">${fmt(c.missing)} fehlen</b>`:'<span class="sv-good">gedeckt</span>'):'—'}</td><td title="${esc(tDue)}"><span class="${due.tone==='bad'?'money-minus':''}">${esc(due.text)}</span> <small class="${due.tone==='bad'?'money-minus':due.tone==='wait'?'ov-wait':'muted'}">${due.warn?'⚠ ':''}${esc(shortRest(o,s,due))}</small></td><td title="${esc(tSt)}"><span class="chip tone-${st.tone}">${esc(stShort)}</span>${o.kind==='vas'?' <span class="badge vas" title="Mehrwertdienst (Kunde liefert Material)">MWD</span>':''}</td><td class="num" title="${esc(`${euro(valueOf(o))} gesamt · ${euro(o.price)} / Stück`)}">${euro(valueOf(o))}</td><td class="ov-act">${act}${toggle}</td></tr>${open?`<tr class="ov-sub"><td colspan="10">${o.quality?`<p class="fine">Mindestqualität ${fmt(o.quality)} % · ${esc(KIND(o))} · ${euro(o.price)} / Stück</p>`:`<p class="fine">${esc(KIND(o))} · ${euro(o.price)} / Stück</p>`}${coverageBlock(s,o,c)}${ctx.detail?ctx.detail(o):''}</td></tr>`:''}`;
 }).join('');
 const more=all.length>rows.length?`<div class="actions"><button data-action="ordersMore">Weitere ${fmt(Math.min(60,all.length-rows.length))} von ${fmt(all.length-rows.length)} anzeigen</button></div>`:'';
 return `<details class="ov-explain"><summary>Aufträge und Verträge – was ist der Unterschied?</summary><p><b>Aufträge</b> sind einzelne Lieferverpflichtungen mit Menge, Frist und Vergütung. <b>Frachtverträge</b> (Fenster „Verträge“) sind laufende Vereinbarungen mit Versendern über mehrere Tage: Aus jeder Lkw-Ankunft eines Vertrags entsteht je Zustellgebiet ein eigener Auftrag. Fertigungs-, Mehrwertdienst- und Fremdlogistikanfragen entstehen ohne Vertrag als einzelne Anfrage.</p><p>Erst tatsächliche Zustellung erzeugt eine Forderung; Zahlung folgt 60 Spielminuten später. Verspätete Lieferungen erhalten 10 % Preisabschlag. Mehrwertdienste: Kunde liefert Material, wir fertigen oder verpacken gegen Vergütung je Stück.</p></details>
<div class="sv-wrap"><table class="data-table ov-table"><colgroup><col class="c-cust"><col class="c-prod"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-due"><col class="c-st"><col class="c-n"><col class="c-act"></colgroup><thead><tr class="sv-filters"><th colspan="10"><div class="sv-bar">${chips}<span class="sv-count">${fmt(all.length)} ${all.length===1?'Auftrag':'Aufträge'} · sortiert nach ${esc(SORTS[k])}</span></div></th></tr><tr>${th('customer')}<th title="Bestelltes Produkt">Produkt</th><th class="num" title="Gelieferte / benötigte Menge">Geliefert</th><th class="num" title="Für diesen Auftrag reservierte Menge">Reserviert</th><th class="num" title="Zusätzlich frei verfügbarer Bestand – keine Zusage">Frei</th>${th('missing','num')}${th('due')}${th('status')}${th('value','num')}<th title="Aktionen">Aktion</th></tr></thead><tbody>${body||`<tr><td colspan="10"><div class="empty"><strong>Keine Aufträge</strong>${search||f!=='all'?'Suche oder Filter ändern.':'Frachtverträge annehmen oder auf Anfragen warten.'}</div></td></tr>`}</tbody></table></div>${more}`;
}

/** Bedienaktionen der Auftragstabelle. Rückgabe true = neu zeichnen. */
export function ordersAction(action,id){
 if(action==='ordersSort'){if(!SORTS[id])return false;if(ordersUi.sort===id)ordersUi.dir*=-1;else{ordersUi.sort=id;ordersUi.dir=id==='due'||id==='customer'||id==='status'?1:-1;}return true;}
 if(action==='ordersFilter'){if(!FILTERS.some(f=>f[0]===id))return false;ordersUi.filter=id;ordersUi.limit=60;return true;}
 if(action==='orderToggle'){ordersUi.expanded.has(id)?ordersUi.expanded.delete(id):ordersUi.expanded.add(id);return true;}
 if(action==='ordersMore'){ordersUi.limit+=60;return true;}
 return false;
}
export const ORDER_ACTIONS=new Set(['ordersSort','ordersFilter','orderToggle','ordersMore']);
/** Auftrag im Auftragsfenster hervorheben und aufklappen (beim nächsten Zeichnen). */
export function focusOrder(id){ordersUi.focus=id;}

/** Zeilen der unteren Betriebsleiste: aktive Aufträge nach Frist, mit Restfrist, Fortschritt/Fehlmenge und Warnung. */
export function orderBarRows(s,max=80){
 const out=[];let warn=0;
 for(const o of s.orders){if(o.status!=='active')continue;const c=orderCoverage(s,o),due=dueInfo(s,o);if(due.tone==='bad')warn++;out.push({o,c,due});}
 out.sort((a,b)=>a.o.due-b.o.due||(a.o.id<b.o.id?-1:1));
 return {total:out.length,warn,rows:out.slice(0,max).map(({o,c,due})=>({key:o.id,id:o.id,customer:o.customer||o.id,product:ITEMS[o.item]?.name||o.item,
  progress:`${fmt(o.delivered||0)}/${fmt(o.qty)} geliefert`+(c.missing>0?` · ${fmt(c.missing)} fehlen`:c.underway>0?` · ${fmt(c.underway)} unterwegs`:''),
  due:due.rest,tone:due.tone==='bad'?'bad':due.tone==='wait'?'wait':c.missing>0?'wait':'neutral',warn:due.warn||(c.missing>0?'Ware fehlt':''),
  title:`${o.customer} (${o.id}) · ${coverageText(c,fmt)} · Frist ${clock(o.due)}${due.warn?' · '+due.warn:''}`}))};
}
