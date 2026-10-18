// Reine Auswertung des gespeicherten Zustands: keine Buchungen, keine Migration.
import {BUILDINGS,VEHICLES} from './catalog.js';
// Alle Beträge in Euro. Auswertung über gesamte gespeicherte Laufzeit;
// Tages-Sammelbuchungen erlauben keine exakte untertägige Periodenrechnung.
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (rows, value) => round(rows.reduce((n, row) => n + value(row), 0));
const groups = {
 operating: new Set(['Umsatz','Einkauf','personal','Energie','Miete','Zinsen','Transport','Wartung','maintenance','Retouren','Erstattungen','Entsorgung','Lagergebühren','research','Vertragsstrafe','Lagergeld']),
 investing: new Set(['construction','Fuhrpark','Standort']),
 financing: new Set(['Kredit','Tilgung'])
};

export function report(s,options={}) {
 const ledger=s.ledger||[], categories=new Map();
 const cashflow={operating:0,investing:0,financing:0,other:0};
 for(const row of ledger){
  const group=Object.keys(groups).find(key=>groups[key].has(row.category))||'other';
  cashflow[group]+=row.amount;
  if(!categories.has(row.category))categories.set(row.category,{category:row.category,inflows:0,outflows:0,net:0});
  const category=categories.get(row.category);
  category[row.amount>=0?'inflows':'outflows']+=Math.abs(row.amount);category.net+=row.amount;
 }
 for(const key of Object.keys(cashflow))cashflow[key]=round(cashflow[key]);
 const categoryRows=[...categories.values()].map(row=>({...row,inflows:round(row.inflows),outflows:round(row.outflows),net:round(row.net)}));
 const inflows=sum(ledger,l=>Math.max(0,l.amount)),outflows=sum(ledger,l=>Math.max(0,-l.amount)),net=round(inflows-outflows);
 const paymentKeys=new Set(ledger.filter(l=>l.category==='Umsatz').map(l=>l.key));
 const orders=new Map((s.orders||[]).map(o=>[o.id,o]));
 const rows=[];
 function invoice(delivery,id,key,source){
  // Erst zugestellte Ware erzeugt Forderung. Angebotenes Auftragsvolumen zählt nie.
  if(delivery.deliveredAt==null||delivery.paymentAt==null||!Number.isFinite(delivery.invoiceAmount)||delivery.paid||paymentKeys.has(key))return;
  rows.push({id,source,orderId:delivery.orderId,customer:orders.get(delivery.orderId)?.customer||'Unbekannter Kunde',amount:round(delivery.invoiceAmount),due:delivery.paymentAt,overdue:delivery.paymentAt<s.t});
 }
 for(const sh of s.shipments||[])invoice(sh,sh.id,`payment:${sh.id}`,'Straße');
 for(const f of s.freights||[])invoice(f,f.id,`freight-payment:${f.id}`,'Externe Fracht');
 for(const tour of s.tours||[])for(const [i,stop] of tour.stops.entries())invoice(stop,`${tour.id}:${i}`,`tour-payment:${tour.id}:${i}`,'Sammeltour');
 rows.sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id));
 const own=(s.batches||[]).filter(b=>b.owner==='company'&&b.qty>0);
 const inventory={
  ownValue:sum(own,b=>b.qty*b.unitCost),
  foreignQty:(s.batches||[]).filter(b=>b.owner!=='company').reduce((n,b)=>n+b.qty,0),
  workInProgress:sum((s.jobs||[]).filter(j=>j.output&&j.status!=='maintenance'),j=>j.unitCost*j.output.qty),
  // Vor Chargenerzeugung bezahlte Einkäufe; danach bereits im eigenen Bestand.
  prepaidPurchases:sum((s.purchases||[]).filter(p=>!p.owner||p.owner==='company').filter(p=>['ordered','waiting'].includes(p.status)),p=>p.cost),
  blockedValue:sum(own.filter(b=>b.blocked||b.locked||b.coldDamaged||b.location==='quarantine'),b=>b.qty*b.unitCost)
 };
 const loan=s.loanBalance||0,overdraft=round(Math.max(0,-s.money));
 const terminalFees=sum((s.freights||[]).filter(f=>f.status==='waiting'),f=>f.storageDue||0);
 return {
  at:s.t,
  cash:{balance:s.money,inflows,outflows,net,openingBalance:round(s.money-net)},
  cashflow,categories:categoryRows,
  receivables:{total:sum(rows,r=>r.amount),overdue:sum(rows.filter(r=>r.overdue),r=>r.amount),rows},
  inventory,
  guv:guv(s,options),
  assets:assetRegister(s,options),
  liabilities:{loan,overdraft,terminalFees,total:round(loan+overdraft+terminalFees)},
  limitations:[
   'Geldfluss seit Spielbeginn, keine Gewinn-und-Verlust-Rechnung. Kredit und Tilgung sind Finanzierung; Bau, Fuhrpark und Standortkäufe sind Investitionen. Forschung zählt zum betrieblichen Geldfluss.',
   'Anfangsbestand aus Kontostand minus gespeicherten Buchungen rückgerechnet. Sammelbuchungen werden genau einmal gezählt; keine untertägige Periodenabgrenzung.',
   'Eigener Warenwert umfasst Lager, Eingang, Quarantäne und Fahrzeuge zu gespeicherten Stückkosten. Reservierungen sind darin enthalten. Fremde Ware bleibt ausgeschlossen. Laufende Fertigung und noch nicht eingetroffene Einkäufe stehen separat.',
   'Warenwerte sind Modellwerte: Fertigung enthält zugerechnete Arbeit und Energie, Retouren können zum Rücknahmepreis bewertet sein. Gesperrte Ware ist nicht abgeschrieben; gesperrter Wert ist Teil des eigenen Warenwerts.',
   'Forderungen enthalten ausschließlich zugestellte, unbezahlte Rechnungen aller drei Transportwege. Erstattungen stehen als eigener Geldabfluss; sie kürzen offene Rechnungen nicht.',
   'Verbindlichkeiten enthalten Kredit, Kontoüberziehung und aufgelaufene Gebühren wartender Terminalfracht. Abgebrochene Frachtgebühren werden im aktuellen Modell nicht fällig. Keine vollständige Bilanz.',
   'GuV und Anlagenspiegel (0.15): lineare Abschreibung ohne Restwert, Gebäude 180, gekaufte Fahrzeuge 90 Spieltage, je vollendetem Spieltag ab Anschaffung. Mietfahrzeuge sind keine Anlagen (Miete ist Aufwand). Standorterwerb (Grund) wird nicht abgeschrieben und steht nicht im Anlagenspiegel. Rückbauerlös steht als eigener Ertrag neben dem Abgang des Restbuchwerts.'
  ]
 };
}

// ---------------- 0.15 S1: GuV, Abschreibung, Anlagenspiegel (A08) ----------------
// Reine Auswertung: keine Geldbuchung. Abschreibung und Abgang wirken nur auf das Ergebnis.
export const DAY=1440;
/** Nutzungsdauer in Spieltagen (linear, Restwert 0). */
export const DEPRECIATION_DAYS=Object.freeze({building:180,vehicle:90});
/** Startzeitpunkt eines neuen Spiels; Ersatz-Anschaffungszeit für Altbestand ohne Felder und ohne Ledgerbeleg. */
export const LEGACY_ACQUIRED_AT=480;
function ledgerByKey(s){return new Map((s.ledger||[]).filter(l=>typeof l.key==='string').map(l=>[l.key,l]));}
/**
 * Anschaffungsdaten einer Anlage (Gebäude bzw. gekauftes Fahrzeug). Reihenfolge:
 * 1. Felder `acquiredAt`/`cost` (gesetzt seit 0.15 bei Bau und Fahrzeugkauf) → source 'field'.
 * 2. Altbestand: Ledger. Fahrzeug: Buchung `vehicle:<id>`. Gebäude: Buchung `build:*` mit refs auf die ID, sonst
 *    `build:<n-1>` zu `building-<n>` (der Bau bucht `build:<seq>`, die Buchung verbraucht seq, danach erhält das Gebäude
 *    `building-<seq+1>`; Betrag muss dem Katalogpreis entsprechen) → source 'ledger', t und Betrag der Buchung.
 * 3. Sonst t=480 (Spielbeginn) und Katalogpreis → source 'fallback'.
 * Mietfahrzeuge (rentalId) sind keine Anlagen → null. Ergebnis wird nie in den Zustand geschrieben.
 */
export function assetInfo(s,asset,kind,index=ledgerByKey(s)){
 if(!asset||(kind==='vehicle'&&asset.rentalId))return null;
 const spec=kind==='building'?BUILDINGS[asset.type]:VEHICLES[asset.type];
 const base={assetId:asset.id,kind,type:asset.type,name:spec?.name||asset.type,life:DEPRECIATION_DAYS[kind]};
 if(Number.isSafeInteger(asset.acquiredAt)&&Number.isFinite(asset.cost))return {...base,acquiredAt:asset.acquiredAt,cost:asset.cost,source:'field'};
 let row=null;
 if(kind==='vehicle')row=index.get(`vehicle:${asset.id}`);
 else {
  for(const l of index.values())if(l.key.startsWith('build:')&&Array.isArray(l.refs)&&l.refs.includes(asset.id)){row=l;break;}
  const n=/^building-(\d+)$/.exec(asset.id||'');const cand=!row&&n?index.get(`build:${Number(n[1])-1}`):null;
  if(cand&&spec&&Math.abs(cand.amount+spec.cost)<0.005)row=cand;
 }
 if(row&&Number.isFinite(row.t)&&Number.isFinite(row.amount)&&row.amount<0)return {...base,acquiredAt:row.t,cost:round(-row.amount),source:'ledger'};
 return {...base,acquiredAt:LEGACY_ACQUIRED_AT,cost:spec?.cost||0,source:'fallback'};
}
/** Kumulierte Abschreibung zur Spielminute `clock` (inklusive): je vollendetem Spieltag cost/life, endet mit Abgang. */
export function accumulated(info,clock){
 const end=Math.min(clock,info.disposedAt??Infinity);if(!(end>=info.acquiredAt))return 0;
 const days=Math.min(info.life,Math.floor((end-info.acquiredAt)/DAY));return round(info.cost*days/info.life);
}
/** Zeiträume für die Oberfläche: heute, letzte 7 Spieltage (inkl. heute), gesamt. Grenzen inklusive. */
export function periods(s){const start=Math.floor(s.t/DAY)*DAY;return {today:{from:start,to:s.t},week:{from:start-6*DAY,to:s.t},total:{from:0,to:s.t}};}
function range(s,{from,to}={}){return {from:Number.isFinite(from)?from:-Infinity,to:Math.min(Number.isFinite(to)?to:Infinity,Number.isFinite(s.t)?s.t:Infinity)};}
function liveAssets(s,index){
 const out=[];
 for(const b of s.buildings||[]){const i=assetInfo(s,b,'building',index);if(i)out.push(i);}
 for(const v of s.vehicles||[]){const i=assetInfo(s,v,'vehicle',index);if(i)out.push(i);}
 return out;
}
const disposed=s=>(s.assetDisposals||[]).map(d=>({...d,life:DEPRECIATION_DAYS[d.kind]}));
/** Anlagenspiegel zum Ende des Zeitraums: Anschaffung, kumulierte Abschreibung, Buchwert je vorhandener Anlage; Abgänge separat. */
export function assetRegister(s,options={}){
 const {from,to}=range(s,options),index=ledgerByKey(s);
 const rows=liveAssets(s,index).filter(a=>a.acquiredAt<=to).map(a=>{const acc=accumulated(a,to);return {assetId:a.assetId,kind:a.kind,type:a.type,name:a.name,acquiredAt:a.acquiredAt,cost:a.cost,lifeDays:a.life,accumulated:acc,bookValue:round(a.cost-acc),source:a.source};});
 const disposals=disposed(s).filter(d=>d.disposedAt>=from&&d.disposedAt<=to).map(d=>({assetId:d.assetId,kind:d.kind,type:d.type,name:d.name,acquiredAt:d.acquiredAt,cost:d.cost,disposedAt:d.disposedAt,accumulated:d.depreciation,bookValue:d.bookValue}));
 return {at:to,rows,total:{cost:sum(rows,r=>r.cost),accumulated:sum(rows,r=>r.accumulated),bookValue:sum(rows,r=>r.bookValue)},disposals};
}
/** Zuordnung einer Geldbuchung zur GuV-Zeile; null = nicht ergebniswirksam (Investition, Finanzierung). */
function guvLine(row){
 const c=row.category,key=typeof row.key==='string'?row.key:'';
 if(c==='Umsatz')return key.startsWith('container-handling:')?'handling':key.startsWith('air:')?'air':'delivery';
 if(['construction','Fuhrpark','Standort','Kredit','Tilgung'].includes(c))return null;
 return {Einkauf:'material',personal:'personnel',Energie:'energy',Miete:'rent',Transport:'transport',Retouren:'transport',Wartung:'maintenance',maintenance:'maintenance',Vertragsstrafe:'penalties',Lagergeld:'storageFees','Lagergebühren':'storageFees',Zinsen:'interest'}[c]||'other';
}
/**
 * Ergebnisrechnung für Spielminuten [from,to] (beide inklusive; Standard: gesamte Laufzeit bis s.t).
 * Geldbuchungen zählen mit ihrem Buchungszeitpunkt t (Tagessammelbuchungen Lohn/Energie/Miete/Zinsen mit erster Minute des Tages).
 * Abschreibung = kumuliert(to) − kumuliert(from−1); Abgang = Restbuchwert abgerissener Anlagen; Rückbauerlös = Geldeingang `demolish:*`.
 * Abstimmung: Ergebnis = operativer + sonstiger Geldfluss (ohne Investition/Finanzierung) − Abschreibung − Abgänge + Rückbauerlös.
 */
export function guv(s,options={}){
 const {from,to}=range(s,options),index=ledgerByKey(s);
 const lines={delivery:0,handling:0,air:0,material:0,personnel:0,energy:0,rent:0,transport:0,maintenance:0,penalties:0,storageFees:0,other:0,interest:0};
 let disposalProceeds=0,cashOperating=0;
 for(const row of s.ledger||[]){
  const t=Number.isFinite(row.t)?row.t:0;if(t<from||t>to||!Number.isFinite(row.amount))continue;
  if(row.category==='construction'&&typeof row.key==='string'&&row.key.startsWith('demolish:')){disposalProceeds+=row.amount;continue;}
  const line=guvLine(row);if(!line)continue;lines[line]+=row.amount;cashOperating+=row.amount;
 }
 for(const k of Object.keys(lines))lines[k]=round(lines[k]);
 const assets=[...liveAssets(s,index),...disposed(s)];
 const depreciation=round(-sum(assets,a=>accumulated(a,to)-accumulated(a,from-1)));
 const disposals=round(-sum(disposed(s).filter(d=>d.disposedAt>=from&&d.disposedAt<=to),d=>d.bookValue));
 disposalProceeds=round(disposalProceeds);
 const revenue={delivery:lines.delivery,handling:lines.handling,air:lines.air,total:round(lines.delivery+lines.handling+lines.air)};
 const expenses={material:lines.material,personnel:lines.personnel,energy:lines.energy,rent:lines.rent,transport:lines.transport,maintenance:lines.maintenance,penalties:lines.penalties,storageFees:lines.storageFees,other:lines.other};
 const ebitda=round(revenue.total+Object.values(expenses).reduce((n,v)=>n+v,0));
 const ebit=round(ebitda+depreciation+disposals+disposalProceeds),result=round(ebit+lines.interest);
 return {from:Number.isFinite(from)?from:null,to,revenue,expenses,ebitda,depreciation,disposals,disposalProceeds,ebit,interest:lines.interest,result,
  reconciliation:{cashOperating:round(cashOperating),depreciation,disposals,disposalProceeds,result:round(cashOperating+depreciation+disposals+disposalProceeds)}};
}
