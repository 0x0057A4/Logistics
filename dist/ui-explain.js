// 0.17 (A04/A10-E): Anlagenerklärung und Anzeigenamen. Reine Lesesicht – bucht weder Ware noch Geld und ändert keinen Zustand.
// Abschnitte je Anlage: 1. Zweck, 2. Voraussetzungen (live geprüft), 3. Ablauf (aus der Spiellogik abgeleitet), 4. Aktueller Zustand,
// 5. Nächster Schritt. Grundlage sind ausschließlich die Fachmodule (production.js, sorting.js, yard.js, special.js, containers.js,
// management.js, multimodal.js, service.js, world.js, inventory.js). Keine erfundene Förder-, Nachbarschafts- oder Durchsatzmechanik:
// Einzige räumliche Wirkung ist die Wegezeit der Materialbereitstellung an Fertigungsstationen (Abstand zum Tor, production.js).
// Umbenennen: Befehl {type:'rename', target:'building'|'site', id, name} (core.js, 0.17 S2); displayName() für alle Ansichten.
import {BUILDINGS,RECIPES,RESEARCH,ITEMS} from './catalog.js';
import {onShift} from './workforce.js';
import {powerBalance,coolingCapacity,coolingUsed} from './special.js';
import {gridDown} from './disruptions.js';
import {sitePowered,FORKLIFT} from './yard.js';
import {teuCapacity,teuUsed,TEU} from './containers.js';
import {summary as sortSummary,HAND_RATE} from './sorting.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const de=(v,d=0)=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:d}).format(Number(v)||0);
const euro=v=>de(v)+' €';

/* ---------------------------------------------------------------------------------------------------------------------
 * Namen
 * ------------------------------------------------------------------------------------------------------------------- */
/** Typname laut Katalog („Prüfstation“). */
export const typeName=type=>BUILDINGS[type]?.name||type||'Anlage';
/** Laufende Nummer einer Anlage innerhalb ihres Typs am Standort (1-basiert, Gebäudereihenfolge). */
export function typeIndex(s,b){let n=0;for(const x of s?.buildings||[]){if(x.type===b.type&&x.site===b.site)n++;if(x===b||x.id===b.id)return n;}return n||1;}
/** Standardname ohne eigenen Namen: Typname mit Nummer; Laderampen heißen wie im Torbuch „Dock N“. */
export function defaultName(s,b){if(!b)return '—';return (b.type==='dock'?'Dock':typeName(b.type))+' '+typeIndex(s,b);}
/** Anzeigename einer Anlage: eigener Name (b.label) oder Standardname. Ein Gebäude-ID-String wird aufgelöst. */
export function displayName(s,building){const b=typeof building==='string'?s?.buildings?.find(x=>x.id===building):building;if(!b)return typeof building==='string'?building:'—';return b.label||defaultName(s,b);}
/** Anzeigename eines Standorts (site.name; Startname bleibt in site.defaultName erhalten). */
export function siteDisplayName(s,id){const x=s?.sites?.find(a=>a.id===id);return x?.name||id||'—';}
/** Namenszeile mit Typ: „Prüfung – Arbeitsleuchten · Typ: Prüfstation“. */
export const nameWithType=(s,b)=>`${displayName(s,b)} · Typ: ${typeName(b.type)}`;

/* ---------------------------------------------------------------------------------------------------------------------
 * Lesehilfen (gleiche Regeln wie die Fachmodule, nur lesend)
 * ------------------------------------------------------------------------------------------------------------------- */
const ROLE_WORD={warehouse:['Lagerkraft','Lagerkräfte'],production:['Fertigungskraft','Fertigungskräfte'],technician:['Technikkraft','Technikkräfte'],research:['Entwicklungskraft','Entwicklungskräfte'],service:['Kundenservicekraft','Kundenservicekräfte'],forklift:['Staplerfahrer','Staplerfahrer'],gate:['Torposten','Torposten'],driver:['Fahrperson','Fahrpersonen']};
const roleWord=(role,n=1)=>(ROLE_WORD[role]||[role,role])[n===1?0:1];
/** Personallage einer oder mehrerer Rollen am Standort (Regeln wie workforce.acquire). */
export function crew(s,roles,site){
 const list=Array.isArray(roles)?roles:[roles];const c={total:0,onDuty:0,free:0,pause:0,tired:0,training:0,away:0};
 for(const w of s.workers||[]){if(!list.includes(w.role)||w.site!==site)continue;c.total++;
  if(w.training){c.training++;continue;}if(w.relocation){c.away++;continue;}if(!onShift(w,s.t))continue;c.onDuty++;
  if(w.breakRemaining>0){c.pause++;continue;}if(w.fatigue>=80){c.tired++;continue;}if(!w.task)c.free++;}
 c.busy=Math.max(0,c.onDuty-c.free-c.pause-c.tired);return c;
}
/** Konkreter Hinweis, warum keine Person frei ist. */
export function staffHint(c,role){
 const one=roleWord(role),many=roleWord(role,2);
 if(!c.total)return `Keine ${one} am Standort – ${one} einstellen (Fenster „Personal“).`;
 if(!c.onDuty)return `Keine ${one} im Dienst – Schicht prüfen (Tag 08–16, Nacht 16–08 Uhr) oder durchgehende Schicht setzen.`;
 if(!c.free&&c.pause+c.tired>=c.onDuty)return `Alle ${many} im Dienst sind in der Erholungspause – warten oder weitere ${many} einstellen.`;
 if(!c.free)return `Keine ${one} frei (${de(c.busy)} von ${de(c.onDuty)} im Dienst belegt) – ${one} einstellen oder Schicht prüfen.`;
 return `${de(c.free)} ${c.free===1?one:many} frei.`;
}
const crewText=(c,role)=>`${de(c.total)} ${roleWord(role,c.total)} am Standort · ${de(c.onDuty)} im Dienst · ${de(c.free)} frei${c.pause?` · ${de(c.pause)} in Pause`:''}${c.training?` · ${de(c.training)} in Fortbildung`:''}`;
const STORED=new Set(['stock','inbound','quarantine']);
/** Lagerbelegung wie inventory.used/capacity: 40 Grundplätze + Kapazität aller Gebäude des Standorts (Volumen). */
export function storage(s,site){let used=0,cap=40;for(const b of s.batches||[])if(b.site===site&&STORED.has(b.location))used+=b.qty*(ITEMS[b.item]?.volume||1);for(const b of s.buildings||[])if(b.site===site)cap+=BUILDINGS[b.type]?.capacity||0;return {used,cap,free:Math.max(0,cap-used)};}
/** Frei verfügbarer Bestand (Lager, Eigentümer, nicht gesperrt, abzüglich Reservierung) wie inventory.available. */
export function freeStock(s,item,site,owner='company'){let n=0;for(const b of s.batches||[])if(b.item===item&&b.site===site&&b.owner===owner&&b.location==='stock'&&!b.locked&&!b.blocked)n+=b.qty-b.reserved;return Math.max(0,n);}
const incoming=(s,item,site)=>(s.purchases||[]).filter(p=>p.item===item&&p.site===site&&p.status!=='stored').reduce((n,p)=>n+p.qty,0);
const researched=(s,key)=>(s.research||[]).some(r=>r.key===key&&r.status==='completed');
const researchActive=(s,key)=>(s.research||[]).find(r=>r.key===key&&r.status==='active');
const has=(s,type,site,ready=false)=>(s.buildings||[]).some(b=>b.type===type&&b.site===site&&(!ready||(b.enabled&&b.condition>0)));
/** Wegezeit der Materialbereitstellung in Minuten (production.js: ⌈(|x| + |y − 8|) / 5⌉, mindestens 1). */
export const walkMinutes=b=>Math.max(1,Math.ceil((Math.abs(b.x)+Math.abs(b.y-8))/5));
const producerOf=item=>Object.values(RECIPES).find(r=>r.output.item===item&&r.building);

/* ---------------------------------------------------------------------------------------------------------------------
 * Statische Texte je Gebäudetyp (aus dem Code abgeleitet)
 * ------------------------------------------------------------------------------------------------------------------- */
const GATE='Das Tor (Feld 1/9 am linken Hallenrand) muss frei bleiben.';
const PATH='Jede Anlage braucht an mindestens einer Seite ein freies Feld mit Weg zum Tor; ein Bau, der eine andere Anlage abschneidet, wird abgelehnt.';
const POWER_RULE='Beim Bauen muss die Summe der Leistung aller eingeschalteten Anlagen durch Netzanschluss und Energieversorgung gedeckt sein.';
const NO_NEIGHBOR='Abstand zu Laderampe, Sortierplatz oder Regal hat keine Wirkung: Ware wird am Standort ohne Förderband und ohne Wegezeit umgebucht.';
const size=t=>{const d=BUILDINGS[t];return `Größe ${d.w}×${d.h} Felder (gedreht ${d.h}×${d.w}), drehen mit R.`;};
const PROD_PLACE='Einzige Lagewirkung: Nähe zum Tor verkürzt die Materialbereitstellung je Auftrag (1 Min. je angefangene 5 Felder Abstand, mindestens 1 Min.). Nähe zu Regal oder anderen Stationen hat keinen Effekt.';
const PROD_PURPOSE={assembly:'Montiert Bauteile zu Rohprodukten, z. B. Leuchtengehäuse + LED-Platine → montierte Arbeitsleuchte.',testing:'Prüft montierte Produkte elektrisch bzw. kalibriert Sensoren. Kann Leuchten mit einem Ersatzteil nacharbeiten (+20 Qualität).',packing:'Verpackt geprüfte Produkte mit einem Versandkarton zur verkaufsfertigen Ware.'};
const prodNeeds=t=>[`Eingeschaltet und Zustand über 5 %`,`${de(BUILDINGS[t].power)} kW freie Leistung (Maschinen erhalten Strom nach den übrigen Anlagen, in Baureihenfolge)`,'Eine freie Fertigungskraft im Dienst','Material des gewählten Arbeitsplans im Lager (eigener Bestand oder vollständig Kundenmaterial eines Lohnfertigungsauftrags)','Freier Lagerplatz für das Ergebnis','Profilleuchte und Sensor nur nach abgeschlossener Forschung'];
const prodFlow=['Startet automatisch in der nächsten Spielminute, sobald alles bereitsteht; Material wird reserviert und verbraucht.','Materialbereitstellung: Die Fertigungskraft holt das Material vom Tor (Wegezeit nach Abstand).','Nach einem Wechsel des Arbeitsplans 3 Min. Rüstzeit.','Bearbeitung: Nennzeit geteilt durch Tempo (Erfahrung bis 1,5×, Forschung „Effiziente Fertigung“ ×1,2). Qualität aus Material, Erfahrung und Anlagenzustand.','Ergebnis geht ins Lager, je Stück −0,2 % Zustand. Ist das Lager voll, wartet die Station („Ausgang blockiert“).'];

export const EXPLAIN={
 dock:{short:'Lkw be- und entladen',purpose:'Andockplatz für genau ein Fahrzeug. Fremd-Lkw der Frachtverträge werden hier entladen; eigene Fahrzeuge (Lieferung, Sammeltour, Standorttransfer, Linie, Luftzubringer, Retoure) werden hier beladen oder entladen.',
  needs:['Eingeschaltet und Zustand über 0 %','Lagerkraft zum Ent- und Beladen (Paletten/Sperrgut: Staplerfahrer oder Lagerkraft plus Stapler)','Torkontrolle durch Torposten oder Lagerkraft, bevor ein Fremd-Lkw zur Rampe darf','Kühlpakete werden nur bei freien Kühlplätzen entladen'],
  flow:['Fremd-Lkw: Anfahrt, Torkontrolle (2 Min.), Warteschlange bis eine Rampe frei ist (FIFO).','Zum Dock und Andocken (3 Min.), dann Entladen: Standard-Lagerkraft 20 Pakete je Minute in den Wareneingang.','Pakete müssen danach sortiert werden (Sortierplatz oder Handsortierung); Paletten und Sperrgut gehen direkt ins Lager.','Die Rampe bleibt bis Entladeende belegt und wird danach automatisch frei. Keine Aktion nötig.'],
  place:[size('dock'),GATE,PATH,'Die Lage der Rampe in der Halle ändert weder Fahr- noch Entladezeiten.']},
 sorter:{short:'Sortiert 300 Pakete/h',purpose:'Bucht Pakete aus dem Wareneingang ins Lager. Erst sortierte Pakete können für Zustellungen, Touren und Linien verladen werden. Ohne Sortierplatz sortiert eine freie Lagerkraft von Hand ('+HAND_RATE+' Pakete je Minute).',
  needs:['Eingeschaltet und Zustand über 5 %','3 kW freie Leistung am Standort','Eine freie Lagerkraft im Dienst – Entladen, Beladen und Torkontrolle haben Vorrang','Pakete im Wareneingang (kommen über eine Laderampe)','Kühlpakete nur mit betriebsbereitem Kühllager; Sperrgut und Paletten werden nie sortiert'],
  flow:['Läuft automatisch in jeder Spielminute, keine Aktion nötig.','Bindet eine Lagerkraft, solange Pakete warten; ohne Pakete wird sie wieder frei.','Leistung 5 Pakete je Minute, unabhängig von der Erfahrung der Kraft.','Reihenfolge: früheste Auftragsfrist zuerst, sonst Eingangsreihenfolge.','Pakete wechseln im Bestand von „Wareneingang“ nach „Lager“ – ohne Förderband und ohne Wegezeit.'],
  place:[size('sorter'),GATE,PATH,NO_NEIGHBOR]},
 crossbelt:{short:'2.400 Pakete/h mit 2 Lagerkräften',purpose:'Hochleistungssortierung für große Paketmengen. Bucht Pakete aus dem Wareneingang ins Lager; 1 % Fehlwürfe werden von Hand nachsortiert.',
  needs:['Forschung „Mega-Hub“ (Voraussetzung zum Bau)','Eingeschaltet und Zustand über 5 %','12 kW freie Leistung am Standort','Zwei freie Lagerkräfte (mit einer Kraft halbe Leistung)','Pakete im Wareneingang'],
  flow:['Läuft automatisch, bindet bis zu zwei Lagerkräfte, solange Pakete warten.','Leistung 40 Pakete je Minute bei voller Besetzung, 20 mit einer Kraft.','Jedes 100. Paket ist ein Fehlwurf und bleibt im Wareneingang; eine Lagerkraft sortiert es von Hand nach.','Sperrgut läuft nie über den Quergurt.'],
  place:[size('crossbelt'),GATE,PATH,NO_NEIGHBOR]},
 rack:{short:'+80 Lagerplätze am Standort',purpose:'Erhöht die Lagerkapazität des Standorts um 80 Volumeneinheiten (Grundkapazität ohne Regal: 40). Ein Paket belegt 0,05 Einheiten, Palette und Fertigware je 1.',
  needs:['Kein Personal, kein Strom – zählt, sobald es gebaut ist'],
  flow:['Ware wird keinem bestimmten Regal zugeordnet; alle Regale (und Kühllager) des Standorts bilden eine gemeinsame Kapazität.','Gezählt werden Wareneingang, Lager und Quarantäne.','Ist die Kapazität erschöpft, warten Entladen, Einlagerung und Fertigungsausgabe („Lager voll“).','Abriss nur möglich, wenn der übrige Platz für den Bestand reicht.'],
  place:[size('rack'),GATE,PATH,'Entfernung zu Rampe oder Sortierplatz spielt keine Rolle.']},
 power:{short:'+40 kW Strom',purpose:'Erzeugt 40 kW zusätzlich zum Netzanschluss des Standorts und speist auch während einer Netzstörung weiter.',
  needs:['Eingeschaltet','Kein Personal nötig'],
  flow:['Angebot = Netzanschluss + alle eingeschalteten Energieversorgungen; Bedarf = Summe der eingeschalteten Anlagen.','Bei Engpass werden Kühllager zuerst versorgt; Maschinen und Sortierer warten dann mit „Energie fehlt“.','Energiekosten: 0,32 € je kW und Stunde für den Bedarf eingeschalteter Anlagen.'],
  place:[size('power'),GATE,PATH,'Keine Leitungen: die Leistung gilt für den ganzen Standort, egal wo gebaut.']},
 workshop:{short:'Wartung von Anlagen, Retourenreparatur',purpose:'Ermöglicht „Warten“: setzt den Zustand einer Anlage desselben Standorts in 15 Minuten auf 100 % (120 €, 1 Wartungsersatzteil). Repariert außerdem Retouren.',
  needs:['Eingeschaltet und nicht schon belegt','Eine freie Technikkraft im Dienst','Ein Wartungsersatzteil im Lager','Kapital für die Wartung (120 €)'],
  flow:['In der Akte der verschlissenen Anlage „Warten“ wählen.','Werkstatt, Technikkraft und Ersatzteil werden gebunden; ein laufender Fertigungsauftrag ruht während der Wartung.','Nach 15 Minuten Zustand 100 %, danach läuft der unterbrochene Auftrag weiter.','Fertigungsanlagen und Sortierer stehen bei Zustand ≤ 5 % still („Defekt“).'],
  place:[size('workshop'),GATE,PATH,'Die Werkstatt wartet alle Anlagen des Standorts, unabhängig vom Abstand.']},
 research:{short:'Forschung für Produkte und Anlagen',purpose:'Führt Forschungsprojekte durch. Abgeschlossene Forschung schaltet Arbeitspläne (Profilleuchte, Industriesensor), den Quergurtsorter (Mega-Hub), Kühlfracht und weitere Vorteile frei.',
  needs:['Eingeschaltet','Eine freie Entwicklungskraft im Dienst','Forschungsbudget (Kosten beim Start)','Ein Projekt je Labor'],
  flow:['Projekt im Fenster „Forschung & Produkte“ starten; die Kosten werden sofort gebucht.','Fortschritt je Minute nach Erfahrung der Entwicklungskraft (bis 1,5×).','Ohne Kraft im Dienst oder bei pausiertem Labor ruht das Projekt.'],
  place:[size('research'),GATE,PATH]},
 coldstore:{short:'100 Kühlplätze',purpose:'Kühlt temperaturempfindliche Ware (Kühlpakete, Module) in Wareneingang, Lager und Quarantäne. Zählt außerdem 100 Einheiten zur allgemeinen Lagerkapazität.',
  needs:['Eingeschaltet und Zustand über 0 %','8 kW Leistung (bei Engpass Vorrang vor anderen Anlagen)'],
  flow:['Kühlplätze werden chargenweise in Eingangsreihenfolge vergeben (ganze Chargen).','Gekühlte Ware kühlt auf 4 °C ab; ungekühlte erwärmt sich um 0,25 °C je Minute.','Über 8 °C sinkt die Qualität; unter 70 % Qualität wird die Charge dauerhaft gesperrt.','Kühlpakete werden nur bei freien Kühlplätzen entladen und nur mit Kühllager sortiert.'],
  place:[size('coldstore'),GATE,PATH,'Die Lage ändert nichts an der Kühlung.']},
 terminal:{short:'Bahn-, See- und Luftfracht',purpose:'Ermöglicht externe Frachtbuchungen (Bahn, Schiff, Luftfracht) für aktive Aufträge und fertigt die Ladung ab.',
  needs:['Eingeschaltet und Zustand über 0 %','Lagerkraft zur Abfertigung','Kundenservicekraft für die Dokumentenprüfung (10 Min.)','Reservierbarer Bestand des Auftrags; Kühlfracht nur mit Forschung „Kühlkettenlogistik“'],
  flow:['Fracht buchen: Ware wird reserviert, die Transportgebühr sofort bezahlt.','Abfertigung im Terminal (5 Min. + 1 Min. je 10 Einheiten) mit einer Lagerkraft; das Terminal ist so lange belegt.','Dokumente freigeben lassen (Kundenservice, 10 Min.).','Abfahrt zum nächsten Takt (Bahn 60, Schiff 180, Luft 30 Min.); wartende Ladung kostet Terminalgebühr.'],
  place:[size('terminal'),GATE,PATH]},
 forklift:{short:'Ein Stapler für Paletten und Sperrgut',purpose:'Stellt einen Stapler bereit. Paletten und Sperrgut werden nur mit Stapler ent- und beladen und nie sortiert.',
  needs:['Eingeschaltet und Zustand über 0 %','Strombilanz des Standorts nicht negativ (sonst lädt der Akku nicht und der Stapler bleibt gesperrt)','Akku ab 10 % (nach Tiefentladung erst ab 30 % wieder einsatzbereit)','Staplerfahrer oder Lagerkraft für den Umschlag'],
  flow:['Wird automatisch an einen Umschlag gebunden (Fremd-Lkw, Lieferung, Sammeltour, Linie, Container).','Im Einsatz −0,5 % Akku je Minute, frei und mit Strom +1 % je Minute.','Ein Stapler bedient einen Vorgang zur Zeit; mehr Staplerplätze erlauben parallele Umschläge.'],
  place:[size('forklift'),GATE,PATH,'Die Lage hat keinen Einfluss auf Umschlagszeiten.']},
 containeryard:{short:'8 TEU für Seecontainer',purpose:'Abstellfläche für angelieferte Seecontainer (40-Fuß-Container = 2 TEU, also 4 Container je Hof). Ohne freien Containerhof warten Chassis am Tor.',
  needs:['Eingeschaltet und Zustand über 0 %','Laderampe zum Entladen der Container','Lagerkraft zum Entladen; für Palettencontainer zusätzlich ein Stapler','Lagerplatz für den Inhalt'],
  flow:['Chassis: Torkontrolle, dann Abstellen im Hof (2 Min.).','Container wird automatisch zur freien Rampe umgefahren (3 Min.) und entladen: Paletten mit Stapler ins Lager, Pakete in den Wareneingang (danach sortieren).','Leere Container werden 2–4 Stunden später abgeholt.','Nach Ablauf der Freizeit fällt Lagergeld je Minute an.'],
  place:[size('containeryard'),GATE,PATH]}
};
for(const t of ['assembly','testing','packing'])EXPLAIN[t]={short:{assembly:'Montage von Bauteilen',testing:'Prüfung und Nacharbeit',packing:'Verpacken zur Versandware'}[t],purpose:PROD_PURPOSE[t],needs:prodNeeds(t),flow:prodFlow,place:[size(t),GATE,PATH,PROD_PLACE]};

const recipeLine=id=>{const r=RECIPES[id];return `${r.name}: ${Object.entries(r.inputs).map(([i,q])=>`${q} × ${ITEMS[i]?.name||i}`).join(' + ')} → ${r.output.qty} × ${ITEMS[r.output.item]?.name||r.output.item} · ${de(r.duration)} Min.${r.research?` · Forschung „${RESEARCH[r.research]?.name||r.research}“`:''}`;};

/** Baumenü: Kurzbeschreibung, Platzierungshinweise und Tooltip. Nur Regeln aus world.js/core.js. */
export function buildInfo(type){
 const d=BUILDINGS[type],x=EXPLAIN[type];if(!d)return null;
 const facts=[`${euro(d.cost)}`,`${d.w}×${d.h}`,d.power?`${de(d.power)} kW`:null,d.energy?`+${de(d.energy)} kW`:null,d.capacity?`+${de(d.capacity)} Plätze`:null].filter(Boolean).join(' · ');
 const short=x?.short||d.name,purpose=x?.purpose||'',place=x?.place||[size(type),GATE,PATH];
 return {type,name:d.name,short,purpose,place,facts,title:`${d.name} – ${purpose}\nPlatzierung: ${place.join(' ')}`};
}
/** Allgemeine Platzierungsregeln (world.reachable, core build). */
export const BUILD_RULES=['Freie Fläche innerhalb der Halle anklicken; Flächen dürfen sich nicht überlappen.',GATE,PATH,POWER_RULE,'Bau kostet den Katalogpreis sofort; Abriss erstattet 35 %.'];

/* ---------------------------------------------------------------------------------------------------------------------
 * Dynamischer Zustand
 * ------------------------------------------------------------------------------------------------------------------- */
const PHASE={gate:'in der Torkontrolle',queue:'wartet auf ein Dock',toDock:'fährt an die Rampe',docking:'dockt an',unloading:'wird entladen',approach:'auf Anfahrt',toYard:'fährt in den Containerhof',drop:'wird abgestellt'};
function dockUse(s,b){
 const id=b.task;if(!id)return null;
 const a=(s.yard||[]).find(x=>x.id===id);if(a)return `Fremd-Lkw ${a.plate||a.id} ${PHASE[a.phase]||a.phase}${a.parcels?` · ${de(a.unloaded||0)} / ${de(a.parcels)} entladen`:''}${a.waitReason?` · wartet: ${a.waitReason}`:''}`;
 const c=(s.containers||[]).find(x=>x.id===id);if(c)return `Container ${c.id} · ${c.status==='unstuffing'?'wird entladen':'Umfuhr zur Rampe'} · ${de(c.unloaded||0)} / ${de(c.qty)}${c.waitReason?` · wartet: ${c.waitReason}`:''}`;
 for(const [list,word] of [[s.shipments,'Lieferung'],[s.tours,'Sammeltour'],[s.transfers,'Standorttransfer'],[s.returns,'Retoure'],[s.linehauls,'Linienfahrt'],[s.airShuttles,'Luftzubringer']]){const x=(list||[]).find(y=>y.id===id);if(x)return `${word} ${x.id} · ${x.status==='unloading'||x.status==='returnUnloading'?'Entladen':'Beladen'}${x.blocked?` · wartet: ${x.blocked}`:''}`;}
 return `Belegt durch Vorgang ${id}`;
}
const jobOf=(s,b)=>(s.jobs||[]).find(j=>j.id===b.job)||null;
const workerName=(s,id)=>(s.workers||[]).find(w=>w.id===id)?.name||null;
const maintenanceOf=(s,b)=>(s.jobs||[]).find(j=>j.building===b.id&&j.status==='maintenance')||null;
const pct=v=>de(Math.round((Number(v)||0)*100))+' %';
const ok=(text,cond)=>({text,ok:cond===undefined?null:!!cond});

/** Live-Prüfung der Voraussetzungen (✓/✗). Liefert {text, ok:true|false|null}. */
export function checks(s,b){
 const d=BUILDINGS[b.type]||{},site=b.site,out=[];
 if(b.type!=='rack')out.push(ok('Eingeschaltet',b.enabled));
 const recipeOrSort=d.recipes?.length||b.type==='sorter'||b.type==='crossbelt';
 if(b.type!=='rack'&&b.type!=='power')out.push(ok(recipeOrSort?'Zustand über 5 %':'Zustand über 0 %',recipeOrSort?b.condition>5:b.condition>0));
 if(d.power){const pb=powerBalance(s,site);out.push(ok(`Strom am Standort: Angebot ${de(pb.supply)} kW, Bedarf ${de(pb.demand)} kW${gridDown(s,site)?' (Netzstörung)':''}`,!pb.shortage||(b.type==='coldstore'&&pb.cooling.includes(b))));}
 const staff=(role,label,n=1)=>{const c=crew(s,role,site);out.push(ok(`${label}: ${crewText(c,Array.isArray(role)?role[0]:role)}`,c.onDuty>=n));return c;};
 if(d.recipes?.length){
  staff('production','Fertigungskraft im Dienst');
  const r=RECIPES[b.recipe||d.recipes[0]];
  if(r){if(r.research)out.push(ok(`Forschung „${RESEARCH[r.research]?.name}“ für ${r.name}`,researched(s,r.research)));
   for(const [item,q] of Object.entries(r.inputs))out.push(ok(`${q} × ${ITEMS[item]?.name||item} für ${r.name}: ${de(freeStock(s,item,site),1)} frei im Lager`,freeStock(s,item,site)>=q||!!jobOf(s,b)));}
  const st=storage(s,site);out.push(ok(`Lagerplatz für das Ergebnis: ${de(st.free,1)} von ${de(st.cap)} frei`,st.free>=1));
 }else if(b.type==='sorter'||b.type==='crossbelt'){
  staff('warehouse',b.type==='crossbelt'?'Zwei Lagerkräfte im Dienst':'Lagerkraft im Dienst',b.type==='crossbelt'?2:1);
  out.push(ok('Laderampe am Standort (sonst kommen keine Pakete an)',has(s,'dock',site)));
 }else if(b.type==='dock'){
  staff('warehouse','Lagerkraft im Dienst');
  out.push(ok(`Torkontrolle: ${de(crew(s,'gate',site).onDuty)} Torposten im Dienst (sonst übernimmt eine Lagerkraft)`,null));
 }else if(b.type==='forklift'){
  staff(['forklift','warehouse'],'Staplerfahrer oder Lagerkraft im Dienst');
  out.push(ok(`Akku ${de(b.charge??FORKLIFT.full)} %${b.charging?' – lädt bis 30 %':''}`,!b.charging&&(b.charge??FORKLIFT.full)>=FORKLIFT.min));
  out.push(ok('Strombilanz des Standorts nicht negativ',sitePowered(s,site)));
 }else if(b.type==='containeryard'){
  out.push(ok('Laderampe am Standort',has(s,'dock',site,true)));staff('warehouse','Lagerkraft im Dienst');
 }else if(b.type==='workshop'){
  staff('technician','Technikkraft im Dienst');out.push(ok(`Wartungsersatzteil im Lager: ${de(freeStock(s,'spare',site))} frei`,freeStock(s,'spare',site)>=1));
 }else if(b.type==='research'){
  staff('research','Entwicklungskraft im Dienst');
 }else if(b.type==='terminal'){
  staff('warehouse','Lagerkraft im Dienst (Abfertigung)');staff('service','Kundenservicekraft im Dienst (Dokumente)');
 }else if(b.type==='rack'){
  out.push(ok('Kein Personal und kein Strom nötig',true));
 }else if(b.type==='power'){
  out.push(ok('Kein Personal nötig',true));
 }
 return out;
}

const T={good:'good',wait:'wait',bad:'bad',idle:'idle'};
/** Aktueller Zustand und nächster Schritt aus echtem Simulationszustand. Rückgabe {tone, title, lines:[], next:[{text,panel?}]}. */
export function currentState(s,b){
 const d=BUILDINGS[b.type]||{},site=b.site,lines=[],next=[];let tone=T.idle,title='Bereit';
 const say=(t,x,n)=>{tone=t;title=x;if(n)next.push(...[].concat(n));};
 const maint=maintenanceOf(s,b);
 if(maint){say(T.wait,'Wird gewartet',{text:`Wartung läuft, noch ${de(Math.ceil(maint.remaining))} Min. (Technikkraft ${workerName(s,maint.worker)||'gesucht'}). Danach Zustand 100 %.`});if(!maint.worker)next.push({text:staffHint(crew(s,'technician',site),'technician'),panel:'staff'});return {tone,title,lines,next};}
 if(!b.enabled){say(T.idle,'Pausiert – ausgeschaltet',{text:'Mit „Fortsetzen“ wieder einschalten. Ausgeschaltete Anlagen arbeiten nicht und verbrauchen keinen Strom.'});return {tone,title,lines,next};}
 const brokenLimit=d.recipes?.length||b.type==='sorter'||b.type==='crossbelt'?5:0;
 if(b.type!=='rack'&&b.type!=='power'&&b.condition<=brokenLimit){say(T.bad,`Defekt – Zustand ${de(b.condition)} %`,maintainNext(s,b));return {tone,title,lines,next};}
 if(d.recipes?.length)production(s,b,lines,next,say);
 else if(b.type==='sorter'||b.type==='crossbelt')sorter(s,b,lines,next,say);
 else (STATIC_STATE[b.type]||(()=>say(T.idle,'Betriebsbereit',{text:'Kein Handlungsbedarf.'})))(s,b,lines,next,say);
 if(b.condition<70&&b.condition>brokenLimit&&b.type!=='rack'&&b.type!=='power')next.push(...maintainNext(s,b,true));
 return {tone,title,lines,next};
}
function maintainNext(s,b,soft=false){
 const site=b.site,out=[];const pre=soft?`Zustand ${de(b.condition)} % – bald warten lassen. `:'';
 if(!has(s,'workshop',site))out.push({text:pre+'Zum Warten fehlt eine Wartungswerkstatt am Standort – Werkstatt bauen.'});
 else{const c=crew(s,'technician',site);if(!c.free)out.push({text:pre+staffHint(c,'technician'),panel:'staff'});
  else if(freeStock(s,'spare',site)<1)out.push({text:pre+'Kein Wartungsersatzteil im Lager – Ersatzteil einkaufen (Beschaffung).',panel:'purchasing'});
  else out.push({text:pre+'„Warten“ wählen: 15 Min., 120 €, 1 Ersatzteil.'});}
 return out;
}
function powerNext(s,b){const pb=powerBalance(s,b.site);return {text:`Strom reicht nicht (Angebot ${de(pb.supply)} kW, Bedarf ${de(pb.demand)} kW${gridDown(s,b.site)?', Netzstörung':''}) – Energieversorgung bauen (+40 kW) oder andere Anlagen pausieren.`};}
function storageNext(s,site){const st=storage(s,site);return {text:`Lager voll (${de(st.used,1)} von ${de(st.cap)} belegt) – Lagerregal bauen (+80) oder Ware ausliefern.`,panel:'inventory'};}

function production(s,b,lines,next,say){
 const site=b.site,d=BUILDINGS[b.type],j=jobOf(s,b),rid=j?.recipe||b.recipe||d.recipes[0],r=RECIPES[rid];
 lines.push(`Arbeitsplan: ${r?.name||'—'}`);
 lines.push(`Wegezeit der Materialbereitstellung ab Tor: ${de(walkMinutes(b))} Min. je Auftrag`);
 if(j&&j.worker)lines.push(`Fertigungskraft: ${workerName(s,j.worker)||j.worker}`);
 const st=b.status;
 if(st==='working'){say(T.good,`Fertigt ${r?.name||''} · ${pct(b.progress)}`,{text:`Läuft. Noch etwa ${de(j?.remaining??0,1)} Nennminuten; danach startet der nächste Auftrag automatisch, sofern Material vorhanden ist.`});return;}
 if(st==='walking'){say(T.good,'Materialbereitstellung',{text:`Fertigungskraft holt Material (noch ${de(j?.walkRemaining??0)} Min.). Keine Aktion nötig.`});return;}
 if(st==='setup'){say(T.good,'Umrüsten',{text:`Umrüsten auf ${r?.name}, noch ${de(j?.setupRemaining??0)} Min.`});return;}
 if(st==='staff'){say(T.wait,'Wartet auf Fertigungskraft',{text:staffHint(crew(s,'production',site),'production'),panel:'staff'});return;}
 if(st==='power'){say(T.bad,'Energie fehlt',powerNext(s,b));return;}
 if(st==='storage'){say(T.wait,'Ausgang blockiert',storageNext(s,site));return;}
 if(st==='research'&&r?.research){say(T.wait,`Forschung „${RESEARCH[r.research]?.name}“ fehlt`,{text:researchActive(s,r.research)?`Forschung läuft – danach startet ${r.name} automatisch. Sonst anderen Arbeitsplan wählen.`:`Forschung „${RESEARCH[r.research]?.name}“ starten oder anderen Arbeitsplan wählen.`,panel:'research'});return;}
 // materials oder bereit: fehlende Eingänge aus echtem Bestand.
 const miss=r?Object.entries(r.inputs).filter(([item,q])=>freeStock(s,item,site)<q):[];
 if(st==='materials'||miss.length){
  say(T.wait,'Wartet auf Material');
  for(const [item,q] of miss){const have=freeStock(s,item,site),inc=incoming(s,item,site),src=producerOf(item),nm=ITEMS[item]?.name||item;
   if(ITEMS[item]?.purchasable)next.push({text:`Fehlt: ${de(q-have,1)} × ${nm} (frei ${de(have,1)})${inc?` – ${de(inc)} bereits im Zulauf`:` – im Einkauf bestellen`}.`,panel:inc?null:'purchasing'});
   else if(src)next.push({text:`Fehlt: ${nm} – entsteht an ${typeName(src.building)} (${src.name}); dort Material, Personal und Strom prüfen.`});
   else next.push({text:`Fehlt: ${nm}.`});}
  if(!miss.length)next.push({text:'Material liegt bereit; Start in der nächsten Spielminute (ggf. reserviert für andere Station).'});
  return;}
 say(T.idle,'Bereit',{text:'Startet den nächsten Auftrag automatisch in der nächsten Spielminute (Spiel nicht pausieren).'});
 const c=crew(s,'production',site);if(!c.onDuty)next.push({text:staffHint(c,'production'),panel:'staff'});
}

function sorter(s,b,lines,next,say){
 const site=b.site,sm=sortSummary(s,site),cross=b.type==='crossbelt';
 lines.push(`Wareneingang am Standort: ${de(sm.inbound)} Pakete${sm.cold.inbound?` · ${de(sm.cold.inbound)} Kühlpakete`:''}${sm.resort?` · ${de(sm.resort)} zum Nachsortieren`:''}`);
 lines.push(`Sortiert im Lager: ${de(sm.stock+sm.cold.stock)} · heute sortiert: ${de(sm.today)}`);
 const holder=s.workers?.filter(w=>w.task===`${b.id}:sort`||w.task===`${b.id}:sort2`)||[];
 if(holder.length)lines.push(`Gebunden: ${holder.map(w=>w.name).join(', ')}`);
 const st=b.status;
 if(st==='working'){say(cross&&(b.crew||0)<2?T.wait:T.good,cross?`Sortiert · ${de((b.crew||0)*20)} Pakete/min`:'Sortiert · 5 Pakete/min',cross&&(b.crew||0)<2?{text:'Nur eine Lagerkraft – halbe Leistung. '+staffHint(crew(s,'warehouse',site),'warehouse'),panel:'staff'}:{text:'Läuft automatisch, bis der Wareneingang leer ist.'});return;}
 if(st==='staff'){say(T.wait,'Wartet auf Lagerkraft',{text:staffHint(crew(s,'warehouse',site),'warehouse')+' Entladen, Beladen und Torkontrolle haben Vorrang vor dem Sortieren.',panel:'staff'});return;}
 if(st==='power'){say(T.bad,'Energie fehlt',powerNext(s,b));return;}
 if(st==='storage'){say(T.wait,'Ausgang blockiert',storageNext(s,site));return;}
 // idle (oder noch nie gelaufen): kein Betrieb vortäuschen.
 if(!has(s,'dock',site)){say(T.wait,'Nicht angeschlossen: keine Laderampe',{text:'Ohne Laderampe kommen keine Pakete an – Laderampe bauen.'});return;}
 const c=crew(s,'warehouse',site);
 if(sm.inbound<=0){say(T.idle,'Wartet auf Pakete im Wareneingang',{text:(s.contracts||[]).some(k=>k.status==='active'&&k.site===site)?'Pakete kommen mit dem nächsten Fremd-Lkw (Torbuch „Hof & Docks“).':'Frachtvertrag annehmen, damit Lkw Pakete anliefern (Fenster „Verträge“).',panel:(s.contracts||[]).some(k=>k.status==='active'&&k.site===site)?'yard':'contracts'});
  if(!c.total)next.push({text:staffHint(c,'warehouse'),panel:'staff'});return;}
 if(sm.cold.inbound&&!sm.cold.sortable&&sm.inbound<=sm.cold.inbound){say(T.wait,'Kühlpakete warten',{text:'Kühlpakete werden nur mit betriebsbereitem Kühllager sortiert – Kühllager bauen oder einschalten.'});return;}
 say(T.wait,'Pakete warten, Sortierung startet in der nächsten Spielminute',c.onDuty?null:{text:staffHint(c,'warehouse'),panel:'staff'});
}

const STATIC_STATE={
 dock(s,b,lines,next,say){const site=b.site,use=dockUse(s,b);
  const waiting=(s.yard||[]).filter(a=>a.site===site&&['gate','queue'].includes(a.phase));
  if(waiting.length)lines.push(`Am Tor: ${de(waiting.length)} ${waiting.length===1?'Lkw wartet':'Lkw warten'}${waiting.some(a=>a.waitReason)?` (${[...new Set(waiting.map(a=>a.waitReason).filter(Boolean))].join(', ')})`:''}`);
  if(use){const stuck=/wartet: /.test(use);say(stuck?T.wait:T.good,'Belegt');lines.unshift(use);
   if(/Keine Lagerkraft/.test(use))next.push({text:staffHint(crew(s,'warehouse',site),'warehouse'),panel:'staff'});
   else if(/Lager voll/.test(use))next.push(storageNext(s,site));
   else if(/Stapler/.test(use))next.push({text:'Stapler fehlt oder lädt – Staplerplatz bauen bzw. Akku/Strom prüfen.'});
   else next.push({text:'Läuft. Die Rampe wird nach dem Vorgang automatisch frei.'});return;}
  say(T.idle,'Frei');
  if(waiting.some(a=>a.waitReason==='Keine Torkontrolle'))next.push({text:'Lkw stehen am Tor ohne Kontrolle – Torposten oder Lagerkraft einstellen bzw. Schicht prüfen.',panel:'staff'});
  else if(!(s.contracts||[]).some(k=>k.status==='active'&&k.site===site))next.push({text:'Frachtvertrag annehmen, damit Fremd-Lkw anliefern (Fenster „Verträge“).',panel:'contracts'});
  else next.push({text:'Wartet auf den nächsten Lkw. Ankünfte im Torbuch „Hof & Docks“.',panel:'yard'});
  const c=crew(s,'warehouse',site);if(!c.onDuty)next.push({text:staffHint(c,'warehouse'),panel:'staff'});},
 rack(s,b,lines,next,say){const st=storage(s,b.site),share=st.cap?st.used/st.cap:0;
  lines.push(`Lager des Standorts: ${de(st.used,1)} von ${de(st.cap)} Plätzen belegt (${pct(share)}); dieses Regal trägt 80 bei.`);
  if(share>=1)say(T.bad,'Lager voll',storageNext(s,b.site));else if(share>=.9)say(T.wait,'Lager fast voll',{text:'Weiteres Lagerregal bauen oder Ware ausliefern.',panel:'inventory'});
  else say(T.good,'Kapazität verfügbar',{text:'Kein Handlungsbedarf. Das Regal arbeitet ohne Personal und Strom.'});},
 power(s,b,lines,next,say){const pb=powerBalance(s,b.site);lines.push(`Liefert ${de(BUILDINGS.power.energy)} kW. Standort: Angebot ${de(pb.supply)} kW, Bedarf ${de(pb.demand)} kW${gridDown(s,b.site)?' · Netzstörung: nur Energiegebäude speisen':''}.`);
  if(pb.shortage)say(T.bad,'Engpass am Standort',{text:'Bedarf übersteigt das Angebot – weitere Energieversorgung bauen oder Anlagen pausieren.'});else say(T.good,'Speist ein',{text:`Reserve ${de(pb.supply-pb.demand)} kW. Kein Handlungsbedarf.`});},
 workshop(s,b,lines,next,say){const site=b.site;
  if(b.maintenanceTask){const j=(s.jobs||[]).find(x=>x.id===b.maintenanceTask),t=j&&s.buildings.find(x=>x.id===j.building);say(T.good,'Wartung läuft',{text:`Wartet ${t?displayName(s,t):'eine Anlage'}, noch ${de(Math.ceil(j?.remaining??0))} Min.`});return;}
  if(b.serviceJob){const r=(s.returns||[]).find(x=>x.id===b.serviceJob);say(T.good,'Retourenreparatur',{text:`Repariert Retoure ${b.serviceJob}${r?.blocked?` – wartet: ${r.blocked}`:''}.`});return;}
  const worn=(s.buildings||[]).filter(x=>x.site===site&&x.condition<70&&x.type!=='rack'&&x.type!=='power').sort((a,c)=>a.condition-c.condition);
  say(T.idle,'Frei');
  if(worn.length){lines.push(`Verschlissen: ${worn.slice(0,4).map(x=>`${displayName(s,x)} ${de(x.condition)} %`).join(', ')}`);next.push({text:`In der Akte von ${displayName(s,worn[0])} „Warten“ wählen.`});}
  else next.push({text:'Alle Anlagen über 70 % Zustand. Kein Handlungsbedarf.'});
  const c=crew(s,'technician',site);if(!c.free)next.push({text:staffHint(c,'technician'),panel:'staff'});
  if(freeStock(s,'spare',site)<1)next.push({text:'Kein Wartungsersatzteil im Lager – im Einkauf bestellen.',panel:'purchasing'});},
 research(s,b,lines,next,say){const p=(s.research||[]).find(r=>r.building===b.id&&r.status==='active');
  if(p){lines.push(`Projekt: ${RESEARCH[p.key]?.name||p.key} · ${pct(1-p.remaining/p.duration)}`);
   if(p.blocked){say(T.wait,'Forschung ruht',{text:p.blocked.includes('Personal')?staffHint(crew(s,'research',b.site),'research'):p.blocked,panel:'staff'});return;}
   say(T.good,`Forscht · noch ${de(Math.ceil(p.remaining))} Min.`,{text:'Läuft automatisch bis zum Abschluss.'});return;}
  const open=Object.keys(RESEARCH).filter(k=>!(s.research||[]).some(r=>r.key===k));
  say(T.idle,'Frei',{text:open.length?`Forschung starten (Fenster „Forschung & Produkte“), z. B. ${open.slice(0,3).map(k=>RESEARCH[k].name).join(', ')}.`:'Alle Forschungen abgeschlossen oder laufend.',panel:'research'});
  const c=crew(s,'research',b.site);if(!c.free)next.push({text:staffHint(c,'research'),panel:'staff'});},
 coldstore(s,b,lines,next,say){const site=b.site,pb=powerBalance(s,site),cooling=pb.cooling.includes(b),cap=coolingCapacity(s,site),used=coolingUsed(s,site);
  lines.push(`Kühlplätze am Standort: ${de(used)} von ${de(cap)} belegt`);
  const warm=(s.batches||[]).filter(x=>x.site===site&&ITEMS[x.item]?.cold&&x.qty>0&&STORED.has(x.location)&&x.cooled===false).reduce((n,x)=>n+x.qty,0);
  if(warm)lines.push(`Ungekühlt: ${de(warm)} Einheiten erwärmen sich`);
  if(!cooling){say(T.bad,'Kühlt nicht – Strom fehlt',powerNext(s,b));return;}
  if(used>=cap&&cap>0)say(T.wait,'Kühlplätze voll',{text:'Kühlware ausliefern oder weiteres Kühllager bauen; neue Kühlpakete werden sonst nicht entladen.'});
  else say(T.good,'Kühlt',{text:warm?'Weiteres Kühllager bauen – ein Teil der Kühlware ist ungekühlt.':'Kein Handlungsbedarf.'});},
 terminal(s,b,lines,next,say){const site=b.site;
  if(b.freightTask){const f=(s.freights||[]).find(x=>x.id===b.freightTask);say(f?.blocked?T.wait:T.good,'Fertigt Fracht ab');if(f)lines.push(`Fracht ${f.id} · ${de(f.qty)} Einheiten · Dokumente ${f.documents==='approved'?'freigegeben':f.documents==='processing'?'in Prüfung':'offen'}`);
   if(f?.blocked)next.push({text:/Lagerpersonal/.test(f.blocked)?staffHint(crew(s,'warehouse',site),'warehouse'):f.blocked,panel:'staff'});
   else if(f?.documents==='pending')next.push({text:'Dokumentenprüfung beauftragen (Fracht in der Auftragsakte).'});else next.push({text:'Läuft automatisch bis zur Abfahrt.'});return;}
  const waiting=(s.freights||[]).filter(f=>f.site===site&&f.status==='waiting').length;if(waiting)lines.push(`${de(waiting)} Frachten warten auf Abfahrt`);
  say(T.idle,'Frei',{text:'Fracht für einen aktiven Auftrag buchen (Auftragsakte, Bahn/Schiff/Luft).',panel:'orders'});
  const c=crew(s,'service',site);if(!c.total)next.push({text:staffHint(c,'service'),panel:'staff'});},
 forklift(s,b,lines,next,say){const site=b.site,charge=b.charge??FORKLIFT.full,powered=sitePowered(s,site);lines.push(`Akku ${de(charge)} %${b.charging?' · Ladezwang bis 30 %':''}`);
  if(b.task){say(T.good,'Im Einsatz',{text:'Gebunden an einen Umschlag; wird danach automatisch frei.'});return;}
  if(!powered){say(T.bad,'Gesperrt – Strombilanz negativ',powerNext(s,b));return;}
  if(b.charging||charge<FORKLIFT.min){say(T.wait,'Lädt',{text:`Lädt mit 1 % je Minute; einsatzbereit ab ${de(FORKLIFT.resume)} %.`});return;}
  say(T.idle,'Einsatzbereit, frei',{text:'Wird automatisch für Paletten und Sperrgut eingesetzt.'});
  const c=crew(s,['forklift','warehouse'],site);if(!c.onDuty)next.push({text:staffHint(c,'forklift'),panel:'staff'});},
 containeryard(s,b,lines,next,say){const site=b.site,cap=teuCapacity(s,site),used=teuUsed(s,site);lines.push(`Containerhof am Standort: ${de(used)} von ${de(cap)} TEU belegt (Container = ${TEU} TEU)`);
  const waiting=(s.yard||[]).filter(a=>a.site===site&&a.kind==='container'&&a.waitReason);
  if(waiting.length)lines.push(`${de(waiting.length)} Chassis warten am Tor (${[...new Set(waiting.map(a=>a.waitReason))].join(', ')})`);
  const blocked=(s.containers||[]).filter(c=>c.site===site&&c.waitReason);
  if(blocked.length){say(T.wait,'Container warten',{text:`Wartegrund: ${[...new Set(blocked.map(c=>c.waitReason))].join(', ')}.`,panel:'containers'});return;}
  if(!has(s,'dock',site,true)){say(T.wait,'Nicht angeschlossen: keine Laderampe',{text:'Laderampe bauen – Container werden an einer Rampe entladen.'});return;}
  if(used>=cap)say(T.wait,'Containerhof voll',{text:'Container entladen lassen oder weiteren Containerhof bauen.',panel:'containers'});
  else if(used)say(T.good,'Belegt, Entladung läuft automatisch',{text:'Container werden der Reihe nach an freien Rampen entladen.',panel:'containers'});
  else say(T.idle,'Leer',{text:'Seeimport-Vertrag annehmen, damit Container angeliefert werden.',panel:'contracts'});}
};

/** Gesamte Erklärung einer Anlage. */
export function explainBuilding(s,b){
 const x=EXPLAIN[b.type]||{purpose:typeName(b.type),needs:[],flow:[],place:[]};
 const d=BUILDINGS[b.type]||{};
 const flow=[...x.flow];
 if(d.recipes?.length)flow.push(`Wegezeit dieser Station ab Tor: ${de(walkMinutes(b))} Min. je Auftrag.`);
 return {id:b.id,type:b.type,typeName:typeName(b.type),name:displayName(s,b),custom:!!b.label,purpose:x.purpose,needs:x.needs,checks:checks(s,b),flow,place:x.place,
  recipes:(d.recipes||[]).map(recipeLine),state:currentState(s,b)};
}

const mark=v=>v===true?'<span class="xp-mark ok" aria-label="erfüllt">✓</span>':v===false?'<span class="xp-mark miss" aria-label="fehlt">✗</span>':'<span class="xp-mark info" aria-hidden="true">•</span>';
const TONE_WORD={good:'Läuft',wait:'Wartet',bad:'Blockiert',idle:'Bereit'};
/** HTML der fünf Abschnitte für die Gebäudeakte. */
export function explainHtml(s,b){
 const e=explainBuilding(s,b),st=e.state;
 const li=a=>a.map(t=>`<li>${esc(t)}</li>`).join('');
 return `<section class="explain" data-explain="${esc(b.type)}">
<div class="xp-sec"><h4><span class="xp-n">1</span> Zweck</h4><p>${esc(e.purpose)}</p>${e.recipes.length?`<ul class="xp-recipes">${li(e.recipes)}</ul>`:''}</div>
<div class="xp-sec"><h4><span class="xp-n">2</span> Voraussetzungen</h4><ul class="xp-checks">${e.checks.map(c=>`<li class="${c.ok===false?'miss':c.ok?'ok':''}">${mark(c.ok)}<span>${esc(c.text)}</span></li>`).join('')}</ul><details class="xp-more"><summary>Alle Bedingungen</summary><ul>${li(e.needs)}</ul></details></div>
<div class="xp-sec"><h4><span class="xp-n">3</span> Ablauf</h4><ol>${li(e.flow)}</ol><details class="xp-more"><summary>Platzierung</summary><ul>${li(e.place)}</ul></details></div>
<div class="xp-sec xp-state tone-${st.tone}" role="status"><h4><span class="xp-n">4</span> Aktueller Zustand</h4><p><span class="xp-chip tone-${st.tone}">${esc(TONE_WORD[st.tone]||'')}</span> <b>${esc(st.title)}</b></p>${st.lines.length?`<ul>${li(st.lines)}</ul>`:''}</div>
<div class="xp-sec xp-next"><h4><span class="xp-n">5</span> Nächster Schritt</h4><ul>${st.next.map(n=>`<li><span>${esc(n.text)}</span>${n.panel?` <button type="button" class="ref-link" data-panel="${esc(n.panel)}">${esc(PANEL_WORD[n.panel]||n.panel)} öffnen</button>`:''}</li>`).join('')||'<li>Kein Handlungsbedarf.</li>'}</ul></div>
</section>`;
}
const PANEL_WORD={staff:'Personal',purchasing:'Beschaffung',research:'Forschung',contracts:'Verträge',yard:'Hof & Docks',inventory:'Lager',orders:'Aufträge',containers:'Containerhof'};

/* ---------------------------------------------------------------------------------------------------------------------
 * Umbenennen (Inline-Eingabe). Zustand der Eingabe lebt in app.js; hier nur Markup.
 * ------------------------------------------------------------------------------------------------------------------- */
/** Stiftknopf. key = 'building:<id>' oder 'site:<id>'. */
export const renameButton=(key,what)=>`<button type="button" class="rename-btn" data-rename-start="${esc(key)}" title="${esc(what)} umbenennen" aria-label="${esc(what)} umbenennen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button>`;
/** Eingabefeld: Enter bestätigt, Escape verwirft, leer = Standardname. */
export const renameInput=(key,value,placeholder)=>`<input class="rename-input" data-rename="${esc(key)}" value="${esc(value)}" maxlength="40" placeholder="${esc(placeholder)}" aria-label="Neuer Name – Enter bestätigt, Escape verwirft, leer setzt den Standardnamen" title="Enter bestätigt · Escape verwirft · leer = ${esc(placeholder)}">`;
