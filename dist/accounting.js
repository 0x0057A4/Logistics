// Reine Auswertung des gespeicherten Zustands: keine Buchungen, keine Migration.
// Alle Beträge in Euro. Auswertung über gesamte gespeicherte Laufzeit;
// Tages-Sammelbuchungen erlauben keine exakte untertägige Periodenrechnung.
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (rows, value) => round(rows.reduce((n, row) => n + value(row), 0));
const groups = {
 operating: new Set(['Umsatz','Einkauf','personal','Energie','Miete','Zinsen','Transport','Wartung','maintenance','Retouren','Erstattungen','Entsorgung','Lagergebühren','research']),
 investing: new Set(['construction','Fuhrpark','Standort']),
 financing: new Set(['Kredit','Tilgung'])
};

export function report(s) {
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
  liabilities:{loan,overdraft,terminalFees,total:round(loan+overdraft+terminalFees)},
  limitations:[
   'Geldfluss seit Spielbeginn, keine Gewinn-und-Verlust-Rechnung. Kredit und Tilgung sind Finanzierung; Bau, Fuhrpark und Standortkäufe sind Investitionen. Forschung zählt zum betrieblichen Geldfluss.',
   'Anfangsbestand aus Kontostand minus gespeicherten Buchungen rückgerechnet. Sammelbuchungen werden genau einmal gezählt; keine untertägige Periodenabgrenzung.',
   'Eigener Warenwert umfasst Lager, Eingang, Quarantäne und Fahrzeuge zu gespeicherten Stückkosten. Reservierungen sind darin enthalten. Fremde Ware bleibt ausgeschlossen. Laufende Fertigung und noch nicht eingetroffene Einkäufe stehen separat.',
   'Warenwerte sind Modellwerte: Fertigung enthält zugerechnete Arbeit und Energie, Retouren können zum Rücknahmepreis bewertet sein. Gesperrte Ware ist nicht abgeschrieben; gesperrter Wert ist Teil des eigenen Warenwerts.',
   'Forderungen enthalten ausschließlich zugestellte, unbezahlte Rechnungen aller drei Transportwege. Erstattungen stehen als eigener Geldabfluss; sie kürzen offene Rechnungen nicht.',
   'Verbindlichkeiten enthalten Kredit, Kontoüberziehung und aufgelaufene Gebühren wartender Terminalfracht. Abgebrochene Frachtgebühren werden im aktuellen Modell nicht fällig. Keine vollständige Bilanz, Abschreibung oder Bewertung des Anlagevermögens.'
  ]
 };
}
