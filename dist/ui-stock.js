import {suppliers as economySuppliers} from './economy.js';
// 0.17 Abschnitt 4 (A05/A10-S): Lagerfenster als Tabelle. Eine Zeile je Produkt und Eigentümerklasse, aufklappbare Chargen,
// Suche (Fenstersuche), Filter, sortierbare Spalten, Ressourcen aus echten Rezepten mit [+] Bestellen (öffnet nur das
// vorhandene Einkaufsformular, kauft nie selbst). Rechnet nicht selbst, sondern nutzt stock-view.js (gemeinsame Bestandsrechnung).
import {ITEMS} from './catalog.js';
import {siteDisplayName} from './ui-explain.js';
import {productRows,resourceNeeds,needText,suggestOrder,orderToProduce,orderOwner} from './stock-view.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NF=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2});
const fmt=n=>NF.format(Number(n)||0);
export const LOCATION={stock:'Lagerplatz',inbound:'Wareneingang',quarantine:'Quarantäne',machine:'Maschine',vehicle:'Fahrzeug'};
/** Lieferbedingungen der Lieferanten wie economy.js (Preisfaktor, Lieferzeit in Minuten). Gleichheit prüft tests/ui-017-stock.test.js. */
// Konditionen aus economy.js (einzige Quelle), hier nur mit Anzeigenamen ergänzt.
const SUPPLIER_NAMES={standard:'Regulär',express:'Express',quality:'Premium'};
export const SUPPLIERS=Object.fromEntries(Object.entries(economySuppliers).map(([k,v])=>[k,{name:SUPPLIER_NAMES[k]||k,...v}]));
/** Angebot vor dem Kauf: Stückpreis, Gesamtkosten (wie Einkaufsbefehl, auf Cent gerundet), Lieferzeit. */
export function buyQuote(item,qty,supplier='standard'){
 const it=ITEMS[item],sp=SUPPLIERS[supplier]||SUPPLIERS.standard,n=Number.isInteger(qty)&&qty>0?qty:0;
 if(!it)return null;const unit=Math.round(it.price*sp.factor*100)/100;
 return {item,qty:n,supplier,unit,total:Math.round(it.price*n*sp.factor*100)/100,lead:sp.lead,name:it.name};
}

// Ansichtszustand (nur Darstellung, nicht gespeichert).
export const stockUi={sort:'name',dir:1,filter:'all',scope:'site',basis:'one',expanded:new Set(),resOpen:new Set()};
const FILTERS=[['all','Alle'],['free','Frei verfügbar'],['reserved','Reserviert'],['blocked','Gesperrt / Eingang'],['incoming','Im Zulauf'],['missing','Material fehlt'],['company','Eigene Ware'],['customer','Kundenware']];
const SORTS={name:'Produkt',total:'Gesamt',reserved:'Reserviert',free:'Frei'};

/** Bedarfsbasis einer Zeile: 1 Stück oder noch herzustellende Menge der aktiven eigenen Aufträge. */
function basisQty(s,row){
 if(stockUi.basis!=='orders')return {qty:1,text:'Bedarf für 1 Stück'};
 let n=0,k=0;for(const o of s.orders)if(o.status==='active'&&o.item===row.item&&orderOwner(o)==='company'){const p=orderToProduce(s,o);if(p>0){n+=p;k++;}}
 return {qty:n,text:n?`Bedarf für ${fmt(n)} Stück aus ${k} ${k===1?'Auftrag':'Aufträgen'} (nach Abzug vorhandener Fertigware)`:'Aktive Aufträge durch Fertigware gedeckt · kein Materialbedarf'};
}
function needsFor(s,row,site){
 if(!row.recipe||row.ownerClass!=='company')return null;
 const b=basisQty(s,row);return {basis:b,rows:resourceNeeds(s,row.item,b.qty,{site})};
}
function resChip(r,compact=false){
 const warn=r.missing>0,buy=r.purchasable?`<button class="sv-plus" data-action="stockBuy" data-id="${esc(r.item)}|${suggestOrder(r)}" title="Ressource bestellen" aria-label="Ressource bestellen: ${esc(r.name)}">+</button>`:'';
 const full=`${needText(r,fmt)}${r.incoming>0?` · ${fmt(r.incoming)} im Zulauf`:''}${r.intermediate&&r.missing>0?' (Zwischenprodukt)':''}`;
 // Kompakt (Tabellenzeile, einzeilig): „verfügbar / benötigt“ steht im Spaltenkopf, voller Text im Tooltip.
 const q=compact?`${fmt(r.free)} / ${fmt(r.need)}${r.missing>0?` · ${fmt(r.missing)} ${r.intermediate?'herzustellen':'fehlen'}`:''}`:full;
 // Kompakt steht [+] vor dem Namen, damit es bei gekürzter Zeile sichtbar bleibt.
 return `<span class="sv-res${warn?' warn':''}" title="${esc(r.name+' · '+full)}">${compact?buy:''}<span class="sv-res-name">${esc(r.name)}</span> <span class="sv-res-q">${esc(q)}</span>${warn?' <span class="sv-warn-sym" aria-hidden="true">⚠</span>':''}${compact?'':buy}</span>`;
}
function resCell(s,row,site){
 if(!row.recipe)return `<span class="muted">${row.ownerClass==='customer'?'Kundenware · kein eigener Bedarf':row.purchasable?'Einkaufsteil · kein Rezept (wird bestellt)':'Kein Rezept hinterlegt'}</span>`;
 if(row.ownerClass!=='company')return '<span class="muted">Kundenware · Material stellt der Kunde</span>';
 const n=needsFor(s,row,site),open=stockUi.resOpen.has(row.key),list=n.rows;
 if(!list.length)return `<small class="muted">${esc(n.basis.text)}</small>`;
 // 0.17 Nutzervorgabe 18.10.2026: einzeilig. Bedarfsbasis im Spaltenkopf und für Screenreader, Ressourcen der ersten Stufe
 // kompakt nebeneinander (bestellbare Fehlmengen zuerst, damit ihr [+] sichtbar bleibt); „Alle n“ klappt die vollständige Liste (alle Stufen, mit [+]) als eigene Zeile darunter auf.
 const rank=r=>(r.missing>0&&r.purchasable?0:r.missing>0?1:2),top=list.filter(r=>r.level===0).sort((a,b)=>rank(a)-rank(b)),miss=list.filter(r=>r.missing>0&&r.purchasable).length;
 const btn=`<button class="sv-link sv-resmore" data-action="stockRes" data-id="${esc(row.key)}" aria-expanded="${open}" title="${open?'Ressourcenliste zuklappen':`Alle ${list.length} Ressourcen mit Bestellknopf anzeigen`}">${open?'Weniger':`Alle ${list.length}${miss?` · ${miss} ⚠`:''}`}</button>`;
 return `<div class="sv-resline"><span class="sv-sr">${esc(n.basis.text)} · Rezept ${esc(row.recipe.name)}: </span><span class="sv-reslist">${top.map(r=>resChip(r,true)).join(' ')}</span>${btn}</div>`;
}
function resFull(s,row,site){
 const n=needsFor(s,row,site);if(!n||!n.rows.length)return '';
 return `<small class="sv-basis">${esc(n.basis.text)} · Rezept ${esc(row.recipe.name)}</small><div class="sv-resfull">${n.rows.map(r=>resChip(r)).join('')}</div>`;
}
function stateText(b){
 if(b.coldDamaged)return 'Kühlschaden · gesperrt';
 if(b.recall)return 'Rückruf · gesperrt';
 if(b.location==='quarantine')return 'Quarantäne';
 if(b.blocked||b.locked)return 'Gesperrt';
 if(b.state==='pending')return 'Im Wareneingang · noch nicht eingelagert';
 return 'Verwendbar';
}
function batchTable(row,s){
 const list=row.batches.slice(0,200),siteName=id=>siteDisplayName(s,id);
 const inc=row.incomingOrders.map(p=>`<tr class="sv-incoming"><td>${esc(p.id)}</td><td class="num">${fmt(p.qty)}</td><td>Im Zulauf · ${esc(siteName(p.site))}</td><td>${esc({ordered:'bestellt',waiting:'wartet auf Annahme',receiving:'Annahme',checking:'Prüfung',storing:'Einlagerung'}[p.status]||p.status)}${p.blocked?' · '+esc(p.blocked):''}</td><td>${p.status==='ordered'?'Ankunft '+esc(clock(p.eta)):'—'}</td></tr>`).join('');
 return `<table class="data-table sv-batches"><thead><tr><th>Charge</th><th class="num">Menge</th><th>Lagerort</th><th>Zustand · Qualität</th><th>Reservierung / Auftrag</th></tr></thead><tbody>${list.map(b=>{const loc=`${LOCATION[b.location]||b.location} · ${siteName(b.site)}`,st=`${stateText(b)} · Qualität ${fmt(b.quality)} %`,job=b.jobs.length?b.jobs.map(j=>`${fmt(j.qty)} · ${j.label}`).join('; '):'';return `<tr><td title="${esc(b.id+(b.owner!=='company'?' · Eigentum '+b.owner:''))}"><button class="sv-link" data-action="select" data-id="${esc(b.id)}" title="Chargenakte öffnen">${esc(b.id)}</button>${b.owner!=='company'?` <small class="muted">Eigentum ${esc(b.owner)}</small>`:''}</td><td class="num" title="${esc(fmt(b.qty)+(b.reserved?` · ${fmt(b.reserved)} reserviert`:''))}">${fmt(b.qty)}${b.reserved?` <small>(${fmt(b.reserved)} reserviert)</small>`:''}</td><td title="${esc(loc)}">${esc(LOCATION[b.location]||b.location)} <small class="muted">${esc(siteName(b.site))}</small></td><td title="${esc(st)}">${esc(stateText(b))} <small class="muted">Qualität ${fmt(b.quality)} %</small></td><td${job?` title="${esc(job)}"`:''}>${job?esc(job):'<span class="muted">frei</span>'}</tr>`;}).join('')}${inc}</tbody></table>${row.batches.length>200?`<p class="fine">${fmt(row.batches.length-200)} weitere Chargen über die Suche eingrenzen.</p>`:''}`;
}
const clock=t=>`Tag ${Math.floor(t/1440)+1} · ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function matches(row,q){
 if(!q)return true;
 const hay=[row.name,row.item,row.variant,...row.locations.map(l=>l.siteName+' '+(LOCATION[l.location]||l.location)),...row.batches.map(b=>b.id+' '+b.jobs.map(j=>j.label).join(' ')),...row.owners].join(' ').toLowerCase();
 return hay.includes(q);
}
function rowMissing(s,row,site){const n=needsFor(s,row,site);return !!n&&n.rows.some(r=>r.missing>0);}

/** HTML des Lagerfensters (Tabelle). search: Text der Fenstersuche (klein geschrieben). */
export function stockTable(s,search=''){
 const site=stockUi.scope==='all'?null:s.selectedSite,needSite=site||s.selectedSite;
 let rows=productRows(s,{site}).filter(r=>matches(r,search));
 const f=stockUi.filter;
 rows=rows.filter(r=>f==='all'||(f==='free'&&r.free>0)||(f==='reserved'&&r.reserved>0)||(f==='blocked'&&(r.blocked>0||r.pending>0))||(f==='incoming'&&r.incoming>0)||(f==='missing'&&rowMissing(s,r,needSite))||(f==='company'&&r.ownerClass==='company')||(f==='customer'&&r.ownerClass==='customer'));
 const k=stockUi.sort,d=stockUi.dir;
 rows=rows.slice().sort((a,b)=>(k==='name'?a.name.localeCompare(b.name,'de'):(a[k]-b[k]))*d||a.name.localeCompare(b.name,'de'));
 const th=(key,cls='')=>`<th class="${cls}" aria-sort="${k===key?(d>0?'ascending':'descending'):'none'}"><button class="sv-sort" data-action="stockSort" data-id="${key}" title="Nach ${SORTS[key]} sortieren">${SORTS[key]}${k===key?(d>0?' ▲':' ▼'):''}</button></th>`;
 const chips=FILTERS.map(([id,t])=>`<button class="sv-chip${f===id?' on':''}" data-action="stockFilter" data-id="${id}" aria-pressed="${f===id}">${t}</button>`).join('');
 const body=rows.map(r=>{
  const open=stockUi.expanded.has(r.key),extra=[r.blocked>0?`${fmt(r.blocked)} gesperrt`:'',r.pending>0?`${fmt(r.pending)} im Eingang`:'',r.inProduction>0?`${fmt(r.inProduction)} in Fertigung`:'',r.incoming>0?`${fmt(r.incoming)} im Zulauf`:'',r.inTransit>0?`${fmt(r.inTransit)} unterwegs`:''].filter(Boolean);
  const q=r.qualityMin==null?'':r.qualityMin===r.qualityMax?`Qualität ${fmt(r.qualityMin)} %`:`Qualität ${fmt(r.qualityMin)}–${fmt(r.qualityMax)} %`;
  const vtext=r.variant==='eigen'?'Eigene Ware':'Kundenware (Fremdeigentum)',btext=`${fmt(r.batches.length)} ${r.batches.length===1?'Charge':'Chargen'}`;
  const tName=[r.name,vtext,btext,q,...extra].filter(Boolean).join(' · ');
  const locs=r.locations.map(l=>`${LOCATION[l.location]||l.location} ${fmt(l.qty)}${site?'':` (${l.siteName})`}`);
  const resRow=stockUi.resOpen.has(r.key)&&r.recipe&&r.ownerClass==='company'?`<tr class="sv-sub sv-ressub"><td colspan="6">${resFull(s,r,needSite)}</td></tr>`:'';
  // Einzeilig: Zusatzangaben gekürzt in derselben Zeile, vollständig im Tooltip und in der Aufklappzeile.
  return `<tr class="sv-row${open?' open':''}" data-stock-row="${esc(r.key)}"><td title="${esc(tName)}"><button class="sv-toggle" data-action="stockToggle" data-id="${esc(r.key)}" aria-expanded="${open}" title="Chargen ${open?'zuklappen':'aufklappen'}"><span aria-hidden="true">${open?'▾':'▸'}</span> <b>${esc(r.name)}</b></button>${r.ownerClass==='customer'?' <small class="muted">Kundenware</small>':''}${extra.length?` <small class="sv-extra">${esc(extra.join(' · '))}</small>`:''}</td><td class="num" title="${esc(`${fmt(r.total)} ${r.unit} gesamt`)}"><b>${fmt(r.total)}</b> <small class="muted">${esc(r.unit)}</small></td><td class="num">${fmt(r.reserved)}</td><td class="num"${r.ownerClass==='customer'&&r.free>0?' title="Nur für den eigenen Auftrag verwendbar"':''}><b class="${r.free>0?'sv-good':''}">${fmt(r.free)}</b></td><td${locs.length?` title="${esc(locs.join(' · '))}"`:''}>${locs.length?esc(locs.join(' · ')):'<span class="muted">—</span>'}</td><td class="sv-rescell">${resCell(s,r,needSite)}</td></tr>${resRow}${open?`<tr class="sv-sub"><td colspan="6"><p class="fine">${esc([vtext,btext,q,...extra].filter(Boolean).join(' · '))}${r.ownerClass==='customer'&&r.free>0?' · frei nur für den eigenen Auftrag':''}</p>${r.bands.length>1?`<p class="fine">Qualitätsbänder: ${r.bands.map(b=>`${esc(b.band)} · ${fmt(b.qty)} gesamt, ${fmt(b.free)} frei`).join(' | ')}</p>`:''}${batchTable(r,s)}</td></tr>`:''}`;
 }).join('');
 const basis=`<span class="sv-basis-pick" role="group" aria-label="Bedarfsbasis der Ressourcen"><button class="sv-chip${stockUi.basis==='one'?' on':''}" data-action="stockBasis" data-id="one" aria-pressed="${stockUi.basis==='one'}">Bedarf je 1 Stück</button><button class="sv-chip${stockUi.basis==='orders'?' on':''}" data-action="stockBasis" data-id="orders" aria-pressed="${stockUi.basis==='orders'}">Bedarf offener Aufträge</button></span>`;
 const scope=`<button class="sv-chip" data-action="stockScope" data-id="${stockUi.scope==='all'?'site':'all'}">${stockUi.scope==='all'?'Alle Standorte ✓':'Nur aktueller Standort'}</button>`;
 return `<p class="fine sv-legend"><b>Gesamt</b> = physisch am Standort · <b>Reserviert</b> = an Lieferung, Tour, Fertigung oder Wartung gebunden · <b>Frei</b> = sofort verwendbar. Gesperrte, beschädigte und noch nicht eingelagerte Ware ist nicht frei. Bestellte Ware steht als „im Zulauf“ und zählt erst nach der Einlagerung.</p>
<div class="sv-wrap"><table class="data-table sv-table"><colgroup><col class="c-prod"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-loc"><col class="c-res"></colgroup><thead><tr class="sv-filters"><th colspan="6"><div class="sv-bar">${chips}</div><div class="sv-bar">${basis}${scope}<span class="sv-count">${fmt(rows.length)} ${rows.length===1?'Produkt':'Produkte'}</span></div></th></tr><tr>${th('name')}${th('total','num')}${th('reserved','num')}${th('free','num')}<th title="Lagerorte mit Menge">Lagerorte</th><th title="Ressourcen aus dem Rezept: frei verfügbar / benötigt (${stockUi.basis==='orders'?'Bedarf offener Aufträge':'Bedarf für 1 Stück'})">Ressourcen · verfügbar / benötigt ${stockUi.basis==='orders'?'(offene Aufträge)':'(je 1 Stück)'}</th></tr></thead><tbody>${body||`<tr><td colspan="6"><div class="empty"><strong>${search||f!=='all'?'Keine Treffer':'Lager leer'}</strong>${search||f!=='all'?'Suche oder Filter ändern.':'Bestelle Material. Eine Lagerkraft prüft und lagert jede Lieferung ein.'}</div></td></tr>`}</tbody></table></div>`;
}

/** Bedienaktionen der Lagertabelle. Rückgabe: true = neu zeichnen; {buy:{item,qty}} = Einkauf vorbelegen (kein Kauf). */
export function stockAction(action,id){
 if(action==='stockSort'){if(!SORTS[id])return false;if(stockUi.sort===id)stockUi.dir*=-1;else{stockUi.sort=id;stockUi.dir=id==='name'?1:-1;}return true;}
 if(action==='stockFilter'){if(!FILTERS.some(f=>f[0]===id))return false;stockUi.filter=id;return true;}
 if(action==='stockToggle'){stockUi.expanded.has(id)?stockUi.expanded.delete(id):stockUi.expanded.add(id);return true;}
 if(action==='stockRes'){stockUi.resOpen.has(id)?stockUi.resOpen.delete(id):stockUi.resOpen.add(id);return true;}
 if(action==='stockBasis'){if(!['one','orders'].includes(id))return false;stockUi.basis=id;return true;}
 if(action==='stockScope'){stockUi.scope=id==='all'?'all':'site';return true;}
 if(action==='stockBuy'){const [item,q]=String(id).split('|'),qty=Math.max(1,Math.min(1000,parseInt(q,10)||1));if(!ITEMS[item]?.purchasable)return false;return {buy:{item,qty}};}
 return false;
}
export const STOCK_ACTIONS=new Set(['stockSort','stockFilter','stockToggle','stockRes','stockBasis','stockScope','stockBuy']);
