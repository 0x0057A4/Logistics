import {injectPortableSave,portableTemplate} from './portable-save.js';
import {RENTAL_RATES} from './rental.js';
import {planTour,committedQty} from './tours.js';
import {maxLoad,maintenanceCost,EXTERNAL_SERVICE,WEAR_WARN,deliverableAt} from './transport.js';
import {createSaveGuard} from './save-guard.js';
import {createSaveStore} from './storage.js';
import {report,periods,assetInfo,accumulated} from './accounting.js';
import {buildResearchMissing} from './management.js';
import {summary as sortSummary,CROSSBELT,MISSORT_EVERY} from './sorting.js';
import {Simulation} from './core.js';
import {ITEMS,BUILDINGS,RECIPES,ROLES,VEHICLES,RESEARCH} from './catalog.js';
import {createScene} from './scene-select.js';
import {onShift,describeAssignment,workRate,UNLOAD_BASE,SPECIALIST_FACTOR} from './workforce.js';
import {gateKey,unloadKey,forkliftKey,sitePowered,FORKLIFT,PALLET_BASE,WAIT as YARD_WAIT,forkItem,BULKY_BASE} from './yard.js';
import {unitOf,itemOf,containersUnlocked,TERMS,deliverySiteOf,laneSite,siteDistance,wareOf,shipperScore,shipperOf,SATISFACTION} from './contracts.js';
import {active as disruptionsActive,weatherAt,WEATHER_NAME,WEATHER_FACTOR} from './disruptions.js';
import {KIND_TEXT as TICKET_KIND_TEXT,RESPONSE_MINUTES as TICKET_RESPONSE_MINUTES} from './customer-service.js';
import {coolingCapacity,coolingFree} from './special.js';
import {teuCapacity,teuUsed,TEU} from './containers.js';
import {nextDeparture,MAX_DEPARTURES,WAIT as LINE_WAIT,CUTOFF as LINE_CUTOFF} from './linehaul.js';
import {startPerfOverlay} from './perf-overlay.js';
import {createReplayBuffer,REPLAY,maxOffset,parseSnapshot} from './replay.js';
import {AIRPORT,AIR,handlingMinutes,tripCost,airportDistance,room as airRoom,nextFlight as airNextFlight} from './airexport.js';
import {TICK as ASSIST_TICK,LOG_MAX as ASSIST_LOG_MAX} from './assistant.js';
import {createPanelWindow,initRail} from './ui-window.js';
import {stockTable,stockAction,STOCK_ACTIONS,buyQuote,SUPPLIERS} from './ui-stock.js';
import {ordersTable,ordersAction,ORDER_ACTIONS,focusOrder,orderBarRows,ordersUi} from './ui-orders.js';
import {displayName,defaultName,typeName,explainHtml,buildInfo,BUILD_RULES,renameButton,renameInput} from './ui-explain.js';
import {renderSchedule,scheduleView,scheduleChange,scheduleInput,scheduleClick,workplace as scheduleWorkplace} from './ui-schedule.js';
import {renderBoard,boardView,boardChange,boardInput,boardClick,renderDayCash} from './ui-board.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Zahlformat je Nachkommastellen einmal erzeugen: toLocaleString baut sonst je Aufruf ein Intl.NumberFormat (HUD/Panels, QS-W0-02).
const NUMBER_FORMATS=new Map();
const fmt=(v=0,d=0)=>{let f=NUMBER_FORMATS.get(d);if(!f){f=new Intl.NumberFormat('de-DE',{maximumFractionDigits:d});NUMBER_FORMATS.set(d,f);}return f.format(Number(v));};
const euro=v=>fmt(v,2)+' €';
/* Eigenes Linien-Icon-Set (A10, 0.11): 24er Raster, Strich über CSS (.ic). Inline statt <use>, weil die Root-index.html
 * ein base-Element (href ./dist/) trägt und Fragmentverweise sonst ins Leere zeigen. */
const ICONS={
 hub:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
 build:'<path d="M3.5 20h17M6 20V9.5L12 5l6 4.5V20"/><path d="M12 11v6M9 14h6"/>',
 factory:'<path d="M3 20h18M4 20v-9l5 3v-3l5 3V5h4v15"/><path d="M7.5 17h1.5M12 17h1.5"/>',
 rack:'<path d="M4 4v16M20 4v16M4 9.5h16M4 15h16"/><path d="M7 9.5V6.5h4v3M12.5 15v-3h4.5v3M7 20v-3h4v3"/>',
 cart:'<path d="M3 4h2.5l2 11h10.5l2-8H7"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
 users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5"/><path d="M15.5 4.8a3.2 3.2 0 0 1 0 6.4M17.5 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
 list:'<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
 contract:'<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 11.5h6M9 15h4"/>',
 dock:'<path d="M3 10l9-6 9 6M5 9v11h14V9"/><path d="M8 20v-7h8v7M8 16.5h8"/>',
 truck:'<path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.2v3.3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
 euro:'<path d="M17.5 6.6a6.5 6.5 0 1 0 0 10.8"/><path d="M4.5 10.5h9M4.5 13.5h8"/>',
 flask:'<path d="M9.5 3.5h5M10.5 3.5V9L5 19a1.4 1.4 0 0 0 1.2 2h11.6a1.4 1.4 0 0 0 1.2-2L13.5 9V3.5M7.5 15h9"/>',
 sliders:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
 network:'<circle cx="5.5" cy="6" r="2.2"/><circle cx="18.5" cy="8" r="2.2"/><circle cx="10" cy="18" r="2.2"/><path d="M7.7 6.3l8.6 1.4M17 9.7l-5.6 6.6M6.3 8.1l2.9 7.8"/>',
 snow:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2"/>',
 return:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 help:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6M12 16.8v.01"/>',
 search:'<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
 bell:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 1.8H4.2zM10 20.5a2 2 0 0 0 4 0"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/><circle cx="12" cy="12" r="6.3"/>',
 keyboard:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>',
 chev:'<path d="M6 9.5l6 6 6-6"/>',
 x:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 minus:'<path d="M5 12h14"/>',
 rotate:'<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19.5 3.5V8H15"/>',
 refresh:'<path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5"/><path d="M19.5 4v5h-5M4.5 20v-5h5"/>',
 home:'<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M12 12h.01"/>',
 pin:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
 play:'<path d="M8 5.5v13l10.5-6.5z"/>',
 pause:'<path d="M9 5.5v13M15 5.5v13"/>',
 tag:'<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.4"/>',
 tagoff:'<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7zM3 3l18 18"/>',
 building:'<path d="M3 20h18M4.5 20V8l6-3v15M10.5 20V10h9v10M13.5 13h3M13.5 16.5h3"/>',
 frame:'<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
 gate:'<path d="M5 20V7M3 20h4M5 9.5h15.5v3H5M9 9.5l3 3M14 9.5l3 3"/>',
 unload:'<path d="M4 10v10h16V10"/><path d="M12 3v10M8.5 9.5 12 13l3.5-3.5"/>',
 sort:'<path d="M3.5 12H9l4.5-5h6M13.5 17h6M9 12l4.5 5"/><path d="M17 4.5 19.5 7 17 9.5M17 14.5l2.5 2.5-2.5 2.5"/>',
 out:'<path d="M4 11v9h16v-9"/><path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/>',
 pallet:'<rect x="4" y="5" width="16" height="9" rx="1"/><path d="M3 17h18M5 17v3M12 17v3M19 17v3"/>',
 container:'<rect x="2.5" y="6.5" width="19" height="11" rx="1"/><path d="M6.5 9.5v5M10 9.5v5M14 9.5v5M17.5 9.5v5"/>',
 linehaul:'<circle cx="4.5" cy="12" r="2"/><circle cx="19.5" cy="12" r="2"/><path d="M6.5 12h11M14 8.5l3.5 3.5-3.5 3.5"/><path d="M4.5 7V5M19.5 19v-2"/>',
 route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16"/>',
 inbox:'<path d="M3.5 13.5 6 5h12l2.5 8.5V19h-17z"/><path d="M3.5 13.5H9l1 2h4l1-2h5.5"/>',
 check:'<path d="M12 3l7 3v5.5c0 4.3-3 7.7-7 9.5-4-1.8-7-5.2-7-9.5V6z"/><path d="M8.8 12.2l2.3 2.3 4.3-4.6"/>',
 rain:'<path d="M7 15.5a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 18.5 9a3.3 3.3 0 0 1-.5 6.5H7z"/><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>',
 fog:'<path d="M7 12.5a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 18.5 6a3.3 3.3 0 0 1-.5 6.5H7z"/><path d="M4 16h16M6 19.5h12"/>',
 storm:'<path d="M7 14.5a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 18.5 8a3.3 3.3 0 0 1-.5 6.5H7z"/><path d="M12.5 14.5l-2 3.5h3l-2 3.5"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
 moon:'<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
 save:'<path d="M5 3.5h11l3.5 3.5v13.5H5z"/><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6"/>',
 plane:'<path d="M10.5 13.5 4 11l1.2-1.2 7.3 1 4.2-4.2a1.8 1.8 0 0 1 2.6 2.6l-4.2 4.2 1 7.3L15 20l-2.5-6.5-3 3v2.5L8 20.5l-1.2-2.8L4 16.5 5.5 15H8z"/>',
 assistant:'<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4.5M10 4.5h4M9.5 13h.01M14.5 13h.01M9.5 16.2h5M3 12.5v2.5M21 12.5v2.5"/>'};
const icon=(n,cls='ic')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||''}</svg>`;
/** Füllt statische Platzhalter <svg data-i="…"> einmalig mit dem Pfad des Icon-Sets. */
function fillIcons(root=document){for(const s of root.querySelectorAll?.('svg[data-i]')||[]){s.setAttribute('viewBox','0 0 24 24');s.innerHTML=ICONS[s.dataset.i]||'';}}
const time=t=>`Tag ${Math.floor(t/1440)+1} · ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const L={idle:'Bereit',working:'In Bearbeitung',walking:'Materialbereitstellung',materials:'Material fehlt',staff:'Personal fehlt',storage:'Ausgang blockiert',power:'Energie fehlt',broken:'Defekt',maintenance:'Wartung',paused:'Pausiert',offer:'Angebot',active:'Aktiv',fulfilled:'Erfüllt',cancelled:'Storniert',ordered:'Unterwegs',waiting:'Wartet',receiving:'Annahme',checking:'Prüfung',storing:'Einlagerung',stored:'Eingelagert',loading:'Beladung',transit:'Unterwegs',unloading:'Entladung',returning:'Rückfahrt',complete:'Abgeschlossen',tour:'Sammeltour',transfer:'Standorttransfer',stock:'Lager',inbound:'Wareneingang',machine:'Anlage',vehicle:'Fahrzeug',quarantine:'Quarantäne',company:'Eigenbestand',day:'Tagschicht · 08–16 Uhr',night:'Nachtschicht · 16–08 Uhr',all:'Durchgehend',standard:'Regulär',express:'Express',quality:'Premium'};
const label=x=>L[x]||x||'—';
const name=(cat,id)=>cat[id]?.name||id||'—';
Object.assign(L,{rentalReturned:'Mietfahrzeug zurückgegeben',returned:'Zurückgegeben',scheduled:'Abholung eingeplant',onTour:'Rückladung an Bord',returnUnloading:'Quarantäne entladen',completed:'Abgeschlossen',setup:'Umrüsten',research:'Forschung fehlt',service:'Rücktransport',documents:'Dokumente fehlen',documentation:'Dokumentprüfung',processing:'Bearbeitung',handling:'Abfertigung',waiting_departure:'Wartet auf Anschluss',delivered:'Zugestellt',rail:'Bahn',sea:'Seefracht',air:'Luftfracht',collecting:'Abholung',inspection:'Retourenprüfung',decision:'Entscheidung offen',repair:'Reparatur',recycling:'Verwertung',repaired:'Repariert',recycled:'Verwertet',personal:'Personal',construction:'Anlagenbau',maintenance:'Wartung'});
// Hofphasen W1-S2 (deutsch). „unloading“ heißt bei Sendungen „Entladung“, am Hof „Entladen“: phaseLabel().
Object.assign(L,{airshuttle:'Luftzubringer → Terminal',handover:'Übergabe am Terminal',linehaul:'Hauptlauf',approach:'Anfahrt',gate:'Torkontrolle',queue:'Wartet auf Dock',toDock:'Zum Dock',docking:'Andocken',exit:'Ausfahrt',gone:'Abgefertigt',ended:'Beendet'});
const PHASE={...Object.fromEntries(['approach','gate','queue','toDock','docking','exit','gone'].map(k=>[k,L[k]])),unloading:'Entladen',toYard:'Zum Containerhof',drop:'Abstellen'};
const phaseLabel=p=>PHASE[p]||label(p);
/** Phase einer Hofankunft; Containerchassis (W3b, yard.CONTAINER_PHASES): Warteschlange = Containerhof, Abholung statt Abstellen. */
const arrivalPhase=a=>a?.kind==='container'?(a.phase==='queue'?'Wartet auf Containerhof':a.pickup&&a.phase==='drop'?'Abholung':phaseLabel(a.phase)):phaseLabel(a?.phase);
let lastSpeed=1, themeSceneReady=false;
let sim=new Simulation(), speed=0, panel='', selected=null, build=null, rotation=0, moving=null, search='', forecast=null, toastTimer, confirmAction=null;
let tourDraft={};
// Replay (W3c-S3): rp = laufende Ansicht {view,t,offset,…} oder null. V() liefert die angezeigte Simulation (Snapshot oder live).
let rp=null;
const V=()=>rp?.view||sim;
let started=false, dirty=false, uiStamp=0, lastTick=performance.now(), accumulator=0;
const STORE='industrie-logistik-v1', prefsKey=STORE+'-prefs';
const VERSION='0.16 · ENTWICKLUNG';{const v=document.getElementById('appVersion');if(v)v.textContent=VERSION;}
const guard=createSaveGuard({prefix:STORE,onLost(){writable=false;speed=0;$('#statusText').textContent=lockMessage();}});
// QS-W0-03 (W1b): Spielstände in IndexedDB (storage.js), Rückfall localStorage ohne IndexedDB. Sperre/Einstellungen bleiben in localStorage.
const store=createSaveStore({prefix:STORE,onWriteError:writeFailed,onCommit:writeCommitted});
const saveKeys=mode=>store.keysFor(mode);
let writable=false, switching=false, temporary=false, storageFailure=false;
const temporaryMessage='Dateimodus · Änderungen NICHT GESPEICHERT · Vor Schließen als HTML oder JSON speichern.';
const embeddedSave=document.getElementById('embedded-save');
const portableMode=!!embeddedSave && embeddedSave.textContent.trim()!=='null';
let embeddedError=null;
// QS-W0-01: Vorlage für erneuten HTML-Export vor jeder DOM-Veränderung festhalten. Neue Dateien tragen ihre
// unveränderte Schale inert in #portable-template; nur ältere Dateien ohne Slot nutzen den Start-Schnappschuss.
const portableSource=(()=>{if(!portableMode)return null;
 const slot=document.getElementById('portable-template'),style=document.getElementById('portable-style'),runtime=document.getElementById('portable-runtime');
 if(slot&&style&&runtime)try{const shell=JSON.parse(slot.textContent);if(typeof shell==='string')return {shell,style,runtime};}catch{}
 return {legacy:'<!doctype html>\n'+document.documentElement.outerHTML};})();
const loadingMessage='Spielstand wird geladen …';
const lockMessage=()=>store.kind==='error'?'Schreibschutz: Spielstandspeicher (IndexedDB) nicht erreichbar. Browserdaten zulassen, Seite neu laden oder JSON exportieren.':!portableMode&&!temporary&&(store.kind==='pending'||guard.reason==='unclaimed'||guard.reason==='pending')?loadingMessage:guard.reason==='storage-error'?'Schreibschutz: Lokaler Speicher nicht verfügbar. Vorhandenen Stand als JSON exportieren.':guard.reason==='unsupported'?'Schreibschutz: Browser unterstützt keine sichere Tab-Sperre. JSON-Export bleibt möglich.':'Schreibschutz: Spielstand in anderem Tab geöffnet oder Sperre verloren. Anderen Tab schließen und hier neu laden.';
function canWrite(){if(temporary)return true;if(writable&&store.kind!=='error'&&guard.owns(sim.state.mode))return true;writable=false;speed=0;$('#statusText').textContent=lockMessage();return false;}
function resetView(){tourDraft={};endBuild();closePanel();selected=null;forecast=null;search='';accumulator=0;scene.home();}
async function activate(mode,{candidate=null,reset=false}={}){
 if(switching)return false;if(rp)replayLive(true);switching=true;
 try{
  if(temporary){
   if(!candidate&&!reset){toast('Temporärer Modus: Gespeicherte Unternehmen erst nach JSON-Export und Neuladen öffnen.',true);return false;}
   sim=candidate||new Simulation({mode});prefs.mode=sim.state.mode;started=true;dirty=true;resetView();$('#welcome').close();setSpeed(0);render(true);return true;
  }
  if(started&&writable&&!save())return false;
  if(store.kind==='error'){writable=false;speed=0;toast(lockMessage(),true);render();return false;}
  // Eigene ausstehende IndexedDB-Schreibvorgänge vor Sperrwechsel bestätigen.
  if(store.lazy)await store.flush();
  if(!await guard.acquire(mode)){writable=false;speed=0;toast(lockMessage(),true);render();return false;}
  writable=true;
  const key=STORE+'-'+mode;
  if(store.lazy)await store.load(saveKeys(mode));
  adoptLegacyHold(key);
  const raw=store.get(key);
  if(reset&&!candidate&&!await keepPrevious(key))return false;
  const rescued=!candidate&&!reset?takeEmergency(key):null;
  const next=candidate||rescued||(reset?new Simulation({mode}):raw?Simulation.fromJSON(raw):new Simulation({mode}));
  sim=next;prefs.mode=sim.state.mode;started=true;dirty=!!candidate||!!rescued||reset||!raw;resetView();
  $('#welcome').close();setSpeed(0);render(true);
  if(dirty){if(!save())return false;}else localStorage.setItem(prefsKey,JSON.stringify(prefs));
  toast(reset?'Neues Unternehmen gegründet. Betrieb pausiert.':'Spielstand geladen. Betrieb pausiert.');return true;
 }catch(e){writable=false;speed=0;toast('Spielstandwechsel fehlgeschlagen: '+e.message,true);return false;}
 finally{switching=false;}
}
async function bootstrap(){
 if(portableMode){
  temporary=true;writable=false;speed=0;
  resetView();render(true);
  if(embeddedError){$('#welcome').showModal();toast('HTML-Spielstand beschädigt: '+embeddedError.message,true);}
  else {$('#welcome').close();toast('HTML-Spielstand geladen. Betrieb pausiert.');}
  return;
 }
 $('#statusText').textContent=loadingMessage;
 try{
  const kind=await store.open();
  if(kind==='error'){writable=false;storageFailure=true;}
  else{
   // Lesen ohne Sperre (Lesezugriff in zweitem Tab), danach als Sperrinhaber frisch nachladen.
   if(store.lazy)await store.load(saveKeys(prefs.mode));
   loadStored(STORE+'-'+prefs.mode);
   writable=await guard.acquire(sim.state.mode);
   if(writable){
    const key=STORE+'-'+sim.state.mode;
    if(store.lazy)await store.load(saveKeys(sim.state.mode));
    adoptLegacyHold(key);
    if(started){const raw=store.get(key);if(raw)sim=Simulation.fromJSON(raw);}
    const rescued=takeEmergency(key);
    if(rescued){sim=rescued;started=true;dirty=true;save();}
   }
  }
 }
 catch(e){writable=false;toast('Speicher nicht verfügbar: '+e.message,true);}
 if(!writable){speed=0;$('#statusText').textContent=lockMessage();}else if($('#statusText').textContent===loadingMessage)$('#statusText').textContent=started?'Spielstand geladen':'Speicher bereit · Unternehmen gründen';
 render(true);if(!started)showWelcome();
}

let prefs={mode:'guided',large:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,mission:true,flowCollapsed:false,vbarCollapsed:false,vbarTab:'vehicles',theme:'auto',quality:'auto'};
if(portableMode){
 try{sim=Simulation.fromJSON(embeddedSave.textContent);started=true;temporary=true;speed=0;
 const savedPrefs=JSON.parse(document.getElementById('embedded-prefs')?.textContent||'null')||{};
 for(const key of ['large','reduced','mission'])if(typeof savedPrefs[key]==='boolean')prefs[key]=savedPrefs[key];prefs.mode=sim.state.mode;
 }catch(e){embeddedError=e;started=false;temporary=true;speed=0;}
}else try{prefs={...prefs,...JSON.parse(localStorage.getItem(prefsKey)||'{}')};}catch{/* Einstellungen optional; Spielstand lädt bootstrap() über store. */}
/** Gespeicherten Hauptstand übernehmen (bootstrap). Fehler wie bisher als verzögerte Meldung, Willkommensdialog folgt. */
function loadStored(key){try{const saved=store.get(key);if(saved){sim=Simulation.fromJSON(saved);started=true;}}catch(e){setTimeout(()=>toast('Gespeicherter Stand nicht geladen: '+e.message,true),500);}}
/** Notfall-Kopie (nur IndexedDB, beim Verlassen abgelegt) übernehmen, falls neuer als der gespeicherte Stand. */
function takeEmergency(key){const em=store.takeEmergency(key);if(!em)return null;try{const rescued=Simulation.fromJSON(em.value);setTimeout(()=>toast('Letzter Stand aus Notfall-Kopie übernommen (Speichern beim Schließen war nicht bestätigt).'),600);return rescued;}catch{store.dropEmergency(key);return null;}}
/* Farbschema (A10, 0.11): Einstellung auto|day|night; „auto“ folgt prefers-color-scheme. Das HTML-Wurzelelement trägt das
 * aufgelöste Schema als data-theme (CSS-Tokens), die Szene erhält es über scene.setTheme?.(), sofern A09 sie anbietet. */
const THEMES={auto:'Automatisch',day:'Tag',night:'Nacht'};
const darkQuery=matchMedia('(prefers-color-scheme: dark)');
function resolvedTheme(){const t=prefs.theme;return t==='day'||t==='night'?t:darkQuery.matches?'night':'day';}
function applyTheme(){const t=resolvedTheme(),root=document.documentElement;root.setAttribute?.('data-theme',t);root.setAttribute?.('data-theme-pref',THEMES[prefs.theme]?prefs.theme:'auto');
 const meta=document.getElementsByName?.('theme-color')?.[0];if(meta)meta.setAttribute('content',t==='night'?'#0d121c':'#eef1f6');
 if(themeSceneReady)scene.setTheme?.(sceneTheme());return t;}
const sceneTheme=()=>THEMES[prefs.theme]?prefs.theme:'auto';
function setTheme(t){prefs.theme=THEMES[t]?t:'auto';applyTheme();savePrefs();if(panel==='settings')renderPanel(true);toast('Farbschema: '+THEMES[prefs.theme]+(prefs.theme==='auto'?' (folgt dem System: '+THEMES[resolvedTheme()]+')':'')+'.');}
darkQuery.addEventListener?.('change',()=>{if(!THEMES[prefs.theme]||prefs.theme==='auto')applyTheme();});
applyPrefs();fillIcons();
// Szenenwahl S1; der Node-UI-Harness stellt nur einen Scene-Stub bereit.
const scene=(typeof createScene==='function'?createScene:(canvas,callbacks)=>new Scene(canvas,callbacks))($('#world'),{onSelect(id){if(!id)return;if((V().state.containers||[]).some(c=>c.id===id)){openPanel('containers');return;}if(V().state.sites.some(x=>x.id===id)){send({type:'selectSite',id});scene.home();return;}selected=id;openPanel('detail');scene.focus?.(id);},onPlace(x,y){if(moving){const r=send({type:'move',id:moving,x,y,rotation});if(r.ok){moving=null;endBuild();}}else if(build)send({type:'build',buildingType:build,x,y,rotation,site:sim.state.selectedSite});},onHover(x,y){if(build)$('#buildHint').textContent=`${name(BUILDINGS,build)} · Raster ${x+1}/${y+1} · ${rotation}° · ${euro(BUILDINGS[build].cost)}`;},onCameraMode(mode,info){showCamMode(mode,info);},onView(v){$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));}});
scene.setState(sim.state);
themeSceneReady=true;scene.setTheme?.(sceneTheme());
/* Grafikqualität (0.15-S4, A12): prefs.quality auto|low|medium|high, Standard auto; rein darstellend (scene.setQuality, nur WebGL-Szene). */
const QUALITY_PREFS={auto:'Automatisch',low:'Niedrig',medium:'Mittel',high:'Hoch'};
const qualityPref=()=>QUALITY_PREFS[prefs.quality]?prefs.quality:'auto';
scene.setQuality?.(qualityPref());
function setQuality(q){prefs.quality=QUALITY_PREFS[q]?q:'auto';scene.setQuality?.(prefs.quality);savePrefs();if(panel==='settings')renderPanel(true);toast('Grafikqualität: '+QUALITY_PREFS[prefs.quality]+(prefs.quality==='auto'?' (passt sich der gemessenen Bildrate an)':'')+'.');}
function toast(text,error=false){$('#toast').textContent=text;$('#toast').className='visible'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').className='',4500);}
function send(c,quiet=false){if(replayBlocked('Befehl'))return {ok:false,message:REPLAY_LOCK};if(!canWrite()){toast(lockMessage(),true);return {ok:false,message:lockMessage()};}try{const r=sim.command(c);if(!r.ok)toast(r.message||'Aktion nicht möglich.',true);else{dirty=true;if(!quiet)toast(r.message||'Änderung übernommen.');}render(true);return r;}catch(e){toast(e.message,true);return {ok:false,message:e.message};}}
// Sicherung (S3): Backup ist der zuletzt erfolgreich geschriebene Stand. Der Altstand wird nur dann
// vollständig geprüft, wenn er weder von diesem Tab geschrieben noch zuletzt fehlerfrei geladen wurde.
// So landet ein beschädigter Hauptstand nie über einer intakten Sicherung, ohne alle 20 s zu blockieren.
const lastWritten=new Map();
function backupCandidate(key){const old=store.get(key);if(!old)return null;if(old===lastWritten.get(key)||Simulation.wasValidated?.(old))return old;try{Simulation.fromJSON(old);return old;}catch{return null;}}
// QS-W0-05/11 (W1b): Gründen über einem vorhandenen Unternehmen legt dessen letzten gültigen Stand in einen eigenen
// Platz `<key>-backup-prev`. Die laufende Sicherung `<key>-backup` rotiert danach normal für das neue Unternehmen.
// Freigabe des Platzes nur durch „Alte Sicherung verwerfen“; „Vorheriges Unternehmen laden“ tauscht beide Unternehmen.
// Altbestand: Marker `<key>-backup-hold` (W0) wird beim ersten Schreibzugriff in den eigenen Platz überführt; gelingt das
// nicht (z. B. localStorage voll), gilt das alte Festhalten weiter.
const backupInfo=new Map(),prevInfo=new Map();
function holdMeta(key){try{const raw=store.get(key+'-backup-hold');return raw===null?null:(JSON.parse(raw)||{});}catch{return null;}}
function validBackup(key){const text=store.get(key+'-backup');if(!text)return null;if(Simulation.wasValidated?.(text))return text;try{Simulation.fromJSON(text);return text;}catch{return null;}}
function validPrevious(key){const text=store.get(key+'-backup-prev');if(!text)return null;if(Simulation.wasValidated?.(text))return text;try{Simulation.fromJSON(text);return text;}catch{return null;}}
const stateTime=text=>{try{return JSON.parse(text).t??null;}catch{return null;}};
function previousTime(key){if(!prevInfo.has(key)){let t=null;try{t=stateTime(store.get(key+'-backup-prev'));}catch{}prevInfo.set(key,{t});}return prevInfo.get(key).t;}
/** Schreibt mehrere Schlüssel; IndexedDB: wartet auf Commit. false + Meldung bei Fehler. */
async function writeNow(entries,what){
 try{const result=store.write(entries);if(store.lazy){const r=await result;if(!r.ok)throw r.error||Error('Schreiben nicht bestätigt.');}return true;}
 catch(e){toast(what+' nicht möglich: '+(e?.message||e)+' Zuerst JSON exportieren.',true);return false;}
}
async function keepPrevious(key){
 const kept=backupCandidate(key)||validBackup(key);if(!kept)return true;
 const entries={[key+'-backup-prev']:kept};if(holdMeta(key))entries[key+'-backup-hold']=null;
 if(!await writeNow(entries,'Sicherung des bisherigen Unternehmens'))return false;
 prevInfo.set(key,{t:stateTime(kept)});backupInfo.delete(key);return true;
}
function adoptLegacyHold(key){
 try{if(!holdMeta(key)||store.has(key+'-backup-prev'))return;const kept=validBackup(key);
  store.write(kept?{[key+'-backup-prev']:kept,[key+'-backup-hold']:null}:{[key+'-backup-hold']:null});prevInfo.delete(key);}
 catch{/* Platz voll: Marker bleibt, save() hält die Sicherung wie in W0 fest. */}
}
function releaseHold(key){try{if(holdMeta(key))store.write({[key+'-backup-hold']:null});}catch{}}
/** Gültige Sicherung (laufend oder vorheriges Unternehmen) für Willkommensdialog und Einstellungen; je Schlüssel einmal geprüft. */
function backupAvailable(mode){
 if(temporary||portableMode)return false;const key=STORE+'-'+mode;
 if(!backupInfo.has(key)){let ok=false;try{ok=!!validBackup(key)||!!validPrevious(key);}catch{}backupInfo.set(key,{ok,t:null});}
 return backupInfo.get(key).ok;
}
const recoveryMode=()=>started?sim.state.mode:prefs.mode;
function showWelcome(){const b=$('#welcomeBackup');if(b)b.hidden=!backupAvailable(recoveryMode());$('#welcome').showModal();}
function loadBackup(){
 const mode=recoveryMode(),key=STORE+'-'+mode;
 return confirm('Letzte Sicherung laden?','Aktueller Fortschritt wird durch letzte Sicherung ersetzt.',async()=>{
  try{let text=store.get(key+'-backup');let restored=null;
   try{if(text)restored=Simulation.fromJSON(text);}catch(e){if(!store.get(key+'-backup-prev'))throw e;}
   if(!restored){text=store.get(key+'-backup-prev');if(!text)throw Error('Keine Sicherung vorhanden.');restored=Simulation.fromJSON(text);}
   const ok=await activate(restored.state.mode,{candidate:restored});if(ok&&restored.state.mode===mode)releaseHold(key);return ok;}
  catch(e){toast('Sicherung nicht geladen: '+e.message,true);return false;}
 });
}
/** Tausch: vorheriges Unternehmen wird Hauptstand, aktuelles Unternehmen belegt den Platz „vorheriges Unternehmen“. */
function loadPrevious(){
 const mode=recoveryMode(),key=STORE+'-'+mode;
 return confirm('Vorheriges Unternehmen laden?','Aktuelles Unternehmen wird dafür als Sicherung des vorherigen Unternehmens abgelegt (Tausch).',async()=>{
  try{if(!started||!canWrite()){toast(lockMessage(),true);return false;}
   const text=store.get(key+'-backup-prev');if(!text)throw Error('Keine Sicherung vorhanden.');const restored=Simulation.fromJSON(text);
   if(!await writeNow({[key+'-backup-prev']:sim.serialize()},'Ablage des aktuellen Unternehmens'))return false;
   prevInfo.set(key,{t:sim.state.t});return await activate(restored.state.mode,{candidate:restored});}
  catch(e){toast('Sicherung nicht geladen: '+e.message,true);return false;}
 });
}
function discardBackup(){
 confirm('Alte Sicherung verwerfen?','Sicherung des vorherigen Unternehmens wird gelöscht. Vorher bei Bedarf laden und als JSON exportieren.',async()=>{
  if(!started)return false;if(!canWrite()){toast(lockMessage(),true);return false;}const key=STORE+'-'+sim.state.mode;
  if(!await writeNow({[key+'-backup-prev']:null,[key+'-backup-hold']:null},'Verwerfen'))return false;
  prevInfo.delete(key);backupInfo.delete(key);dirty=true;return save(true);
 });
}
let savedAt=null,saveSeq=0;
const sizeNote=text=>{const h=Simulation.headroom?.(sim.state,text.length);if(!h||h.ratio<0.6)return '';return h.limit==='chars'?` · Spielstand groß: ${fmt(text.length/1e6,1)} MB (${fmt(h.ratio*100)} % der Ladegrenze)`:` · Liste ${h.limit} bei ${fmt(h.ratio*100)} % der Ladegrenze`;};
function save(show=false){if(temporary){$('#statusText').textContent=temporaryMessage;if(show)toast('Nicht gespeichert. Bitte JSON exportieren.',true);return false;}if(!canWrite()){if(show)toast(lockMessage(),true);return false;}
 try{const key=STORE+'-'+sim.state.mode,text=sim.serialize();
  // Ladegrenze (core SAVE_LIMITS): nie einen Stand schreiben, der sich nicht mehr laden ließe.
  const h=Simulation.headroom?.(sim.state,text.length);
  if(h&&h.ratio>1){storageFailure=true;$('#statusText').textContent=`NICHT GESPEICHERT · Spielstand überschreitet Ladegrenze (${h.limit}). Letzter gespeicherter Stand bleibt. JSON exportieren.`;toast('Spielstand zu groß zum Speichern. Bitte exportieren.',true);return false;}
  const held=!!holdMeta(key)&&!store.has(key+'-backup-prev')&&store.get(key+'-backup')!==null,old=held?null:backupCandidate(key);
  const entries={};if(old)entries[key+'-backup']=old;entries[key]=text;
  store.write(entries);saveSeq=store.seq||0;savedAt=sim.state.t;
  if(old)backupInfo.set(key,{ok:true,t:null});lastWritten.set(key,text);
  try{localStorage.setItem(prefsKey,JSON.stringify({...prefs,mode:sim.state.mode}));}catch{/* Einstellungen optional */}
  dirty=false;storageFailure=false;
  $('#statusText').textContent=(store.lazy?'Wird gesichert · ':'Gesichert · ')+time(sim.state.t)+' · Keine Offlinefortschritte'+sizeNote(text);
  if(show)toast('Spielstand gesichert.');return true;}
 catch(e){storageFailure=true;$('#statusText').textContent='NICHT GESPEICHERT · Speicher blockiert oder voll. JSON exportieren; Speichern erneut versuchen.';toast('Speichern fehlgeschlagen. Bitte Spielstand exportieren.',true);return false;}}
function writeCommitted({seq}){if(seq!==saveSeq||storageFailure||temporary)return;const st=$('#statusText');if(st.textContent.startsWith('Wird gesichert · '))st.textContent='Gesichert · '+st.textContent.slice(17);}
function writeFailed({keys,error}){
 const key=STORE+'-'+sim.state.mode;if(!keys.includes(key))return;
 lastWritten.delete(key);dirty=true;storageFailure=true;
 $('#statusText').textContent='NICHT GESPEICHERT · Speicher blockiert oder voll ('+(error?.name||'IndexedDB')+'). JSON exportieren; Speichern erneut versuchen.';
 toast('Speichern fehlgeschlagen. Bitte Spielstand exportieren.',true);
}
/** Verlassen (hidden/beforeunload): 'saved' = bestätigt oder Notfall-Kopie liegt vor; 'pending' = IndexedDB-Commit offen ohne Kopie; 'failed'. */
function leaveSave(){
 if(!started||temporary)return 'saved';const key=STORE+'-'+sim.state.mode;
 if(dirty&&!save())return 'failed';
 if(!store.lazy||!store.pendingFor(key))return 'saved';
 return store.emergency(key,lastWritten.get(key))?'saved':'pending';
}
let htmlExporting=false;
async function exportHtml(){
 if(htmlExporting)return false;
 if(!started){toast('Zuerst Unternehmen gründen oder Spielstand laden.',true);return false;}
 htmlExporting=true;setSpeed(0);
 try{
  const snapshot=sim.serialize();Simulation.fromJSON(snapshot);
  const snapshotPrefs={mode:sim.state.mode,large:prefs.large,reduced:prefs.reduced,mission:prefs.mission};
  let template;
  if(portableMode)template=portableSource.legacy||portableTemplate(portableSource.shell,portableSource.style.textContent,portableSource.runtime.textContent);
  else {const response=await fetch('./portable.html',{cache:'no-store'});if(!response.ok)throw Error('HTML-Vorlage nicht verfügbar.');template=await response.text();}
  const html=injectPortableSave(template,snapshot,snapshotPrefs);
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`Industrie-Logistik-Tag-${Math.floor(sim.state.t/1440)+1}.html`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  toast('HTML-Download gestartet. Datei aufbewahren; bei weiterem Fortschritt erneut herunterladen.');return true;
 }catch(e){toast('HTML-Download fehlgeschlagen: '+e.message,true);return false;}
 finally{htmlExporting=false;}
}
function chooseTemporary(){
 confirm('Ohne lokale Speicherung spielen?','Fortschritt geht beim Schließen verloren. Vor Schließen JSON exportieren. Vorhandene gespeicherte Unternehmen bleiben unverändert.',()=>{
  guard.release();temporary=true;writable=false;speed=0;dirty=true;
  if(!started){sim=new Simulation({mode:$('input[name=mode]:checked').value});started=true;}
  resetView();$('#welcome').close();render(true);
 });
}
async function retryStorage(){
 if(temporary){toast('Temporären Stand zuerst als JSON exportieren. Danach Seite neu laden und JSON importieren.',true);return false;}
 if(switching)return false;switching=true;speed=0;
 try{
  if(store.kind==='error'&&await store.retry()==='error')throw Error(store.reason);
  writable=await guard.acquire(sim.state.mode);
  if(!writable){toast(lockMessage(),true);return false;}
  if(started&&dirty){
   // Until explicit approval, neither autosave nor commands may overwrite a
   // newer state from another tab. Cancel/Escape retain read-only access.
   writable=false;guard.release();
   confirm('Ungesicherten Stand speichern?','Aktueller Stand ersetzt den gespeicherten Stand dieses Modus. Bei Änderungen in anderem Tab zuerst JSON exportieren und neu laden.',async()=>{
    if(switching)return false;switching=true;
    try{writable=await guard.acquire(sim.state.mode);return save(true);}
    finally{switching=false;render(true);}
   });return false;
  }
  if(store.lazy)await store.load(saveKeys(sim.state.mode));
  const raw=store.get(STORE+'-'+sim.state.mode);
  if(raw){sim=Simulation.fromJSON(raw);started=true;resetView();$('#welcome').close();}
  storageFailure=false;$('#statusText').textContent=started?'Spielstand geladen · Betrieb pausiert':'Speicher verfügbar · Unternehmen gründen';
  return true;
 }catch(e){writable=false;guard.release();storageFailure=true;toast('Speicher weiterhin nicht verfügbar. JSON-Export bleibt möglich.',true);return false;}
 finally{switching=false;render(true);}
}
function applyPrefs(){document.body.classList.toggle('large',prefs.large);document.body.classList.toggle('reduced',prefs.reduced);document.body.classList.toggle('mission-hidden',!prefs.mission);document.body.classList.toggle('flow-collapsed',!!prefs.flowCollapsed);document.body.classList.toggle('vbar-collapsed',!!prefs.vbarCollapsed);document.getElementById('flowToggle')?.setAttribute?.('aria-expanded',String(!prefs.flowCollapsed));document.getElementById('vbarToggle')?.setAttribute?.('aria-expanded',String(!prefs.vbarCollapsed));applyTheme();}
function setSpeed(n){if(rp){replayBlocked('Tempo');return;}speed=n&&canWrite()?n:0;if(speed)lastSpeed=speed;accumulator=0;lastTick=performance.now();render();}
/** Geschwindigkeitsleiste zeigt den tatsächlichen Takt (auch wenn speed direkt auf 0 gesetzt wurde: Dateimodus, Schreibschutz). */
function syncSpeed(){if(hudCache.get('speed')===speed)return;hudCache.set('speed',speed);$$('[data-speed]').forEach(b=>{const on=+b.dataset.speed===speed;b.classList.toggle('active',on);b.setAttribute?.('aria-pressed',String(on));});}
/* Fenster 0.17 (A10-W): #panel schwebt (ui-window.js); Geometrie je Fensterart relativ zur Spielfläche in prefs.windows[panel]={rx,ry,rw,rh,max}
 * (Referenz 1920 × 1080, Fenster skalieren mit; alte absolute {x,y,w,h} rechnet ui-window.js einmalig um).
 * Breite Fensterarten erhalten nur eine breitere Startgröße. Ohne Fenstermodul (Prüfumgebung) bleibt das bisherige Layout. */
const WIDE_PANELS=['inventory','orders','finance','history','staff','network','planning','yard','containers','air','assistant','service'];
const TABLE_PANELS=['inventory','orders','service'];
let panelWin=null;
function windowCtl(){if(panelWin===null)try{panelWin=(typeof createPanelWindow==='function'&&createPanelWindow({panel:$('#panel'),game:$('#game'),load:k=>prefs.windows?.[k]||null,save:(k,g)=>{prefs.windows={...(prefs.windows&&typeof prefs.windows==='object'?prefs.windows:{}),[k]:g};savePrefs();}}))||false;}catch(e){console.warn('Fenstersystem nicht verfügbar:',e?.message||e);panelWin=false;}return panelWin||null;}
function openPanel(p,focus=null){panel=p;hubFocus=focus;search='';panelHtml=null;$('#search').value='';$('#panel').hidden=false;document.body.classList.add('panel-open');windowCtl()?.open(p,{wide:WIDE_PANELS.includes(p),table:TABLE_PANELS.includes(p)});$$('.rail [data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===p));renderPanel();}
function closePanel(){panel='';panelHtml=null;$('#panel').hidden=true;document.body.classList.remove('panel-open');document.body.classList.remove('panel-wide');windowCtl()?.close();$$('.rail .active').forEach(b=>b.classList.remove('active'));}
function startBuild(type){if(replayBlocked('Bauen'))return;const lock=type&&buildLock(V().state,type);if(lock){toast(`${name(BUILDINGS,type)}: ${lock}. Forschung unter „Forschung & Produkte“ starten.`,true);type=null;}closePanel();build=type||null;$('#buildTray').hidden=false;document.body.classList.add('build-open');scene.setBuild(build,rotation,moving);renderBuild();}
function endBuild(){build=null;moving=null;scene.setBuild(null);$('#buildTray').hidden=true;document.body.classList.remove('build-open');}
function renderBuild(){const icons={assembly:'⚒',testing:'⌁',packing:'▣',rack:'▤',dock:'⇥',power:'ϟ',workshop:'⚙',research:'⌘',coldstore:'❄',terminal:'⌂',sorter:'⇶',crossbelt:'⇉',forklift:'⇈',containeryard:'▦'};const s=V().state;
 // 0.15 (A10): Forschungssperre (management.buildResearchMissing) sichtbar statt erst beim Platzieren abgelehnt.
 // 0.17 (A10-E): Kurzbeschreibung und Platzierungshinweise (ui-explain.buildInfo) als Untertext und Tooltip.
 const item=([id,b])=>{const lock=buildLock(s,id),info=buildInfo(id);return `<button data-build="${id}" class="${id===build?'active':''}${lock?' locked':''}"${lock?` aria-disabled="true" title="${esc(lock)}"`:''}><i>${icons[id]||'⊞'}</i><b>${esc(b.name)}</b><small>${lock?esc(lock):`${euro(b.cost)} · ${b.w}×${b.h}`}</small><small class="build-desc" title="${esc(info?.title||b.name)}">${esc(info?.short||'')}</small></button>`;};
 // QS-W1-05 (A01): Hub zuerst, danach Mehrwertdienste/Fertigung mit Überschrift (unbekannte Typen hinten).
 const hub=BUILD_HUB.filter(id=>BUILDINGS[id]),rest=Object.keys(BUILDINGS).filter(id=>!hub.includes(id)).sort((a,b)=>(BUILD_VAS.indexOf(a)+1||99)-(BUILD_VAS.indexOf(b)+1||99));
 const group=(t,ids)=>ids.length?`<div class="build-group" role="heading" aria-level="3">${t}</div>`+ids.map(id=>item([id,BUILDINGS[id]])).join(''):'';
 $('#buildItems').innerHTML=buildCard(build)+group('Hub',hub)+group('Mehrwertdienste / Fertigung',rest);}
/** 0.17 (A10-E): Infokarte vorn im Baumenü – gewählte Anlage (Zweck, Platzierung) oder allgemeine Platzierungsregeln (world.js). */
function buildCard(type){const i=type&&buildInfo(type),li=a=>a.map(t=>`<li>${esc(t)}</li>`).join('');
 return `<div class="build-info" role="note" aria-live="polite">${i?`<b>${esc(i.name)} · ${esc(i.facts)}</b><p>${esc(i.purpose)}</p><ul>${li(i.place.slice(1))}</ul>`:`<b>Platzierungsregeln</b><ul>${li(BUILD_RULES)}</ul>`}</div>`;}
/** Sperrtext im Baumenü, z. B. „Forschung Mega-Hub nötig“; null = baubar. Prüfung selbst bleibt in core/management. */
const buildLock=(s,type)=>buildResearchMissing(s,type)?`Forschung ${RESEARCH[BUILDINGS[type]?.research]?.name||BUILDINGS[type]?.research} nötig`:null;
const BUILD_HUB=['dock','sorter','crossbelt','forklift','containeryard','rack','power'],BUILD_VAS=['assembly','testing','packing','research','workshop','coldstore','terminal'];
/** QS-W1-05: Fertigung, Einkauf, Entwicklung erst mit Fertigungsanlage/Labor oder nach Forschung/Einkauf in der Leiste. */
const advancedUsed=s=>s.buildings.some(b=>BUILDINGS[b.type]?.recipes?.length||b.type==='research')||(s.research||[]).length>0||(s.purchases||[]).length>0;
function filtered(a){return a.filter(x=>!search||JSON.stringify(x).toLowerCase().includes(search)||Object.values(x).some(v=>String(name(ITEMS,v)).toLowerCase().includes(search)));}
const badge=(text,tone='')=>`<span class="badge ${tone}">${esc(text)}</span>`;
const empty=(title,text='')=>`<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`;
const kv=(k,v)=>`<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`;
/** Kennzahlen-Raster der Objektakte (A10, 0.11): zwei Spalten, Wert groß, Einheit klein. Werte sind bereits formatiert. */
const metrics=list=>`<div class="metrics">${list.map(([k,v,u='',tone=''])=>`<div class="metric${tone?' tone-'+tone:''}"><small>${esc(k)}</small><b>${v}${u?`<span class="unit">${esc(u)}</span>`:''}</b></div>`).join('')}</div>`;
const condTone=c=>c<15?'bad':c<WEAR_WARN?'wait':'';
const button=(text,action,id='',cls='')=>`<button class="${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
const num=(v,t,neg=false)=>`<div class="number ${neg?'negative':''}"><b>${v}</b><small>${esc(t)}</small></div>`;
const opts=(cat,sel)=>Object.entries(cat).map(([id,v])=>`<option value="${id}" ${id===sel?'selected':''}>${esc(v.name||v)}</option>`).join('');
const field=(title,html,full=false)=>`<label class="field ${full?'full':''}">${esc(title)}${html}</label>`;
/** Fahrzeugkapazität verständlich: Volumeneinheiten, Nutzlast und Paketäquivalent nach derselben Regel wie die Simulation (transport.maxLoad). */
const weightCap=v=>VEHICLES[v.type]?.weightCapacity||v.capacity*4;
const capacityText=v=>`${fmt(v.capacity)} Volumeneinheiten · ${fmt(weightCap(v))} kg · ≈ ${fmt(maxLoad(v,'parcel'))} Pakete`;
/** Offene, noch nicht verplante Menge und je Fahrzeug passende Höchstmenge für einen Auftrag. */
const openQty=(s,o)=>Math.max(0,o.qty-o.delivered-committedQty(s,o.id));
const dispatchMax=(s,o,v)=>Math.min(openQty(s,o),maxLoad(v,o.item));
function dispatchForm(s,o){if(o.airExport)return airDispatchNote(s,o);if(!deliverableAt(o,s.selectedSite))return dispatchBlocked(s,o);const vs=s.vehicles.filter(v=>v.status==='idle'&&v.site===s.selectedSite),item=name(ITEMS,o.item),open=openQty(s,o),first=vs.find(v=>dispatchMax(s,o,v)>0)||vs[0],max=first?dispatchMax(s,o,first):open;
 return `<form data-form="dispatch" data-id="${o.id}" class="form-grid">${field('Fahrzeug',`<select name="vehicleId" required>${vs.map(v=>{const m=maxLoad(v,o.item);return `<option value="${v.id}" data-max="${dispatchMax(s,o,v)}" ${v===first?'selected':''}>${esc(v.name)} · ${m?`fasst ${fmt(m)} × ${esc(item)}`:'ungeeignet (Kühlung)'}${v.condition<15?' · Wartung nötig':''}</option>`;}).join('')||'<option value="">Kein freies Fahrzeug</option>'}</select>`,true)}<label class="field">Teilmenge · <span data-dispatch-max>max. ${fmt(max)}</span> von ${fmt(open)} offen<input name="qty" type="number" min="1" max="${Math.max(1,max)}" value="${Math.max(1,max)}" required></label><button class="primary" style="grid-column:auto;align-self:end">Lieferung starten →</button></form>`;}
/** Fahrzeugwechsel im Versandformular: Höchstmenge und Vorschlag aus data-max der gewählten Option. */
function syncDispatchQty(form){const sel=form.querySelector?.('select[name="vehicleId"]'),qty=form.querySelector?.('input[name="qty"]');if(!sel||!qty)return;const max=Number(sel.options?.[sel.selectedIndex]?.dataset?.max)||0;qty.max=String(Math.max(1,max));qty.value=String(Math.max(1,max));const hint=form.querySelector('[data-dispatch-max]');if(hint)hint.textContent='max. '+fmt(max);}
const progress=v=>`<div class="progress"><span style="width:${Math.max(0,Math.min(100,v*100))}%"></span></div>`;
// Geführter Einstieg Logistik (A02 W1b): Depot-Stufe in Reihenfolge des ersten Kreislaufs; Sortierplatz zuletzt und optional.
function requirements(){const s=V().state,b=s.buildings.filter(x=>x.site===s.selectedSite),site=s.selectedSite,hub=s.orders.filter(o=>o.source==='hub'),hubIds=new Set(hub.map(o=>o.id));
 const staff=role=>s.workers.some(w=>w.role===role&&w.site===site),driverOk=staff('driver'),vanOk=s.vehicles.some(v=>v.site===site&&v.status!=='rentalReturned');
 const unloaded=(s.yard||[]).some(a=>a.unloaded>0)||hub.some(o=>o.delivered>0);
 const started=s.shipments.some(x=>hubIds.has(x.orderId))||(s.tours||[]).some(t=>t.stops.some(x=>hubIds.has(x.orderId)))||hub.some(o=>o.delivered>0);
 return [
 {ok:b.some(x=>x.type==='dock'),title:'Laderampe bauen',text:'Am Dock docken die Lkw der Versender an. Ein Lagerregal daneben schafft Platz für Pakete.',action:'build',build:'dock',cta:'Dock bauen'},
 {ok:staff('warehouse'),title:'Lagerkraft einstellen',text:'Lagerpersonal entlädt Lkw, sortiert Pakete von Hand und belädt Fahrzeuge. Tagschicht 08–16 Uhr.',panel:'staff',cta:'Personal einstellen'},
 {ok:(s.contracts||[]).some(c=>c.status!=='offer'),title:'Ersten Frachtvertrag annehmen',text:'Ein Versender schickt Lkw mit Paketen. Angebot im Vertragsfenster prüfen und annehmen.',panel:'contracts',cta:'Verträge öffnen'},
 {ok:unloaded,title:'Ersten Lkw entladen',text:'Der Lkw meldet sich am Tor, fährt ans freie Dock und wird entladen. Wartegründe stehen im Torbuch.',panel:'yard',cta:'Hof & Docks öffnen'},
 {ok:driverOk&&vanOk,title:'Fahrer und Lieferwagen',text:'Eine Fahrperson und ein Lieferwagen bringen die sortierten Pakete in die Zustellgebiete.',panel:driverOk?'fleet':'staff',cta:driverOk?'Fahrzeug kaufen':'Fahrer einstellen'},
 {ok:started,title:'Zustellung starten',text:'Im Auftragsfenster sortierte Pakete einem Fahrzeug zuordnen. Fristgerecht zustellen, sonst 10 % Abschlag.',panel:'orders',cta:'Zustellung planen'},
 {ok:hub.some(o=>o.paid>0),title:'Zahlung erhalten',text:'Nach der Zustellung entsteht eine Forderung. Der Versender zahlt eine Stunde später.',panel:'finance',cta:'Finanzen öffnen'},
 {ok:b.some(x=>x.type==='sorter'),title:'Sortierplatz bauen (optional)',text:'Sortiert doppelt so schnell wie Handarbeit, bindet aber weiter eine Lagerkraft. Lohnt sich ab dem zweiten Vertrag zusammen mit mehr Fahrzeugen.',action:'build',build:'sorter',cta:'Sortierplatz bauen'}];}
function render(force=false){$('#storageWarning').hidden=!temporary;put('storageWarning','Nicht gespeichert');putAttr('storageWarning','title',temporaryMessage+' Klicken für Spielstand-Optionen.');if(temporary)$('#statusText').textContent=temporaryMessage;else if(!writable)$('#statusText').textContent=lockMessage();scene.setState(V().state);syncSpeed();hudPending=true;flushHud(force);
 if(panel&&(force||performance.now()-uiStamp>900)&&!document.activeElement?.matches('input,select,textarea'))renderPanel();}
/* ---- Leitstand-HUD (A10) ----
 * Liest ausschließlich V().state (und die Lesefunktionen der Inventar-API). Keine Buchung, kein Befehl.
 * Kennzahlen werden in einem Durchlauf je Sammlung erhoben, höchstens 4× je Sekunde ins DOM geschrieben
 * und nur, wenn sich der Text geändert hat. Listen (Fahrzeuge, Meldungen) werden nach Schlüssel abgeglichen. */
const HUD_MS=250, hudCache=new Map();
let hudStamp=-Infinity, hudPending=true, hudData=null, labelMode='all', sceneOnly=false, cmdHits=[], cmdIndex=0;
function put(id,text){text=String(text);if(hudCache.get(id)===text)return;hudCache.set(id,text);const el=document.getElementById(id);if(el)el.textContent=text;}
function putClass(id,cls){const k='c:'+id;if(hudCache.get(k)===cls)return;hudCache.set(k,cls);const el=document.getElementById(id);if(el)el.className=cls;}
function putHidden(id,hidden){const k='h:'+id;if(hudCache.get(k)===hidden)return;hudCache.set(k,hidden);const el=document.getElementById(id);if(el)el.hidden=hidden;}
function putAttr(id,attr,value){const k='a:'+id+':'+attr;if(hudCache.get(k)===value)return;hudCache.set(k,value);document.getElementById(id)?.setAttribute?.(attr,value);}
function setT(el,text){text=String(text);if(el._t!==text){el._t=text;el.textContent=text;}}
function setC(el,cls){if(el._c!==cls){el._c=cls;el.className=cls;}}
/** Abgleich einer Liste nach Schlüssel: vorhandene Zeilen werden aktualisiert und nur bei Bedarf umsortiert. */
function syncList(box,items,make,update){const map=box._keyed||(box._keyed=new Map()),keep=new Set();items.forEach((it,i)=>{let el=map.get(it.key);if(!el){el=make(it);map.set(it.key,el);}update(el,it);keep.add(it.key);const at=box.children?.[i];if(at!==el)box.insertBefore?.(el,at||null);});for(const [k,el] of map)if(!keep.has(k)){el.remove();map.delete(k);}}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
const BLOCKED_STATUS=new Set(['materials','staff','power','storage','broken']), WORKING_STATUS=new Set(['working','walking','setup']);
const FINAL_STATUS=new Set(['complete','completed','cancelled','repaired','recycled','returned']);
const AWAY_STATUS=new Set(['transit','returning','collecting','linehaul','outbound','inbound']);
const sameDay=(t,day)=>t!=null&&Math.floor(t/1440)===day;
const shiftName=t=>{const h=(t%1440)/60;return h>=8&&h<16?'Tagschicht':'Nachtschicht';};
const signed=n=>(n>0?'+':n<0?'−':'±')+fmt(Math.abs(n));
function siteCode(s,id){const i=s.sites.findIndex(x=>x.id===id),site=s.sites[i];if(!site)return '—';const w=String(site.name||'').split(/[\s-]+/).filter(Boolean);return ((w[0]?.[0]||'S')+(w[1]?.[0]||w[0]?.[1]||'')).toUpperCase()+'-'+String(i+1).padStart(2,'0');}
function siteLoad(s,id){let docks=0,busy=0;for(const b of s.buildings)if(b.site===id&&b.type==='dock'){docks++;if(b.task)busy++;}const inv=V().api?.inventory;return {docks,busy,used:inv?.used?.(id)??0,cap:inv?.capacity?.(id)??0};}
/** Sammelt alle HUD-Kennzahlen in einem Durchlauf. Liefert nur aus dem Zustand ableitbare Werte. */
function collectHud(s){
 const site=s.selectedSite,day=Math.floor(s.t/1440),sites=new Map(s.sites.map(x=>[x.id,x])),orders=new Map(s.orders.map(o=>[o.id,o])),siteName=id=>sites.get(id)?.name||id||'—';
 const h={site,day,code:siteCode(s,site),siteName:siteName(site),today:0,yesterday:0,onTime:0,late:0,loadsToday:0,atSite:0,away:0,loading:0,returning:0,fleetSite:0,staffOn:0,staffAll:0,
  inbound:{ordered:0,waiting:0,receiving:0,checking:0,storing:0,blocked:0},prod:{work:0,all:0,block:null,broken:false,focus:null},qa:{work:0,all:0,block:null,broken:false,focus:null},
  dockFocus:null,rackFocus:null,returnsOpen:0,returnsDecision:0,ticketsOpen:0,ticketsWork:0,alerts:[],vehicles:[],fleet:{move:0,wait:0,bad:0,foreign:0},
  hub:{approach:0,onSite:0,queue:0,blocked:0,unloading:0,unloadWait:0,atDock:0,inbound:0,sorters:0,sortWork:0,sortBlock:null,sortFocus:null,out:new Map(),outTotal:0,outPallet:0,outPalletOrders:new Set(),orders:0,openParcels:0,late:0},mfg:false,sorted:null,sortedTotal:null};
 const alert=(key,tone,title,sub,ref=null,target=null)=>h.alerts.push({key,tone,title,sub,ref,target});
 const tasks=new Map();
 const deliver=(d,o)=>{if(d.deliveredAt==null||!(d.qty>0))return;if(sameDay(d.deliveredAt,day))h.today+=d.qty;else if(sameDay(d.deliveredAt,day-1))h.yesterday+=d.qty;
  // Verspätet = mit Verspätungsabschlag berechnet (Fachregel: Zustellung nach Frist → 90 % des Preises).
  const full=Math.round(d.qty*(o?.price||0)*100)/100,late=Number.isFinite(d.invoiceAmount)?d.invoiceAmount<full-0.005:!!o&&d.deliveredAt>o.due;late?h.late++:h.onTime++;};
 for(const sh of s.shipments){deliver(sh,orders.get(sh.orderId));if(sh.site===site&&sameDay(sh.departedAt,day))h.loadsToday++;if(!FINAL_STATUS.has(sh.status)){tasks.set(sh.id,{task:sh,kind:'shipment'});if(sh.blocked)alert('sh:'+sh.id,'wait','Lieferung '+sh.id,sh.blocked,sh.id);}}
 for(const t of s.tours||[]){for(const st of t.stops||[])deliver(st,orders.get(st.orderId));if(t.site===site&&sameDay(t.departedAt,day))h.loadsToday++;if(!FINAL_STATUS.has(t.status)){tasks.set(t.id,{task:t,kind:'tour'});if(t.blocked)alert('tour:'+t.id,'wait','Sammeltour '+t.id,t.blocked,null,'fleet');}}
 for(const f of s.freights||[]){deliver(f,orders.get(f.orderId));if(!FINAL_STATUS.has(f.status)){tasks.set(f.id,{task:f,kind:'freight'});if(f.blocked)alert('fr:'+f.id,'wait',label(f.mode)+' '+f.id,f.blocked,f.id);}}
 for(const lh of s.linehauls||[])if(LH_ACTIVE.has(lh.status))tasks.set(lh.id,{task:lh,kind:'linehaul'});
 for(const sh of s.airShuttles||[])if(AIR_ACTIVE.has(sh.status))tasks.set(sh.id,{task:sh,kind:'air'});
 for(const tr of s.transfers||[])if(!FINAL_STATUS.has(tr.status)){tasks.set(tr.id,{task:tr,kind:'transfer'});if(tr.blocked)alert('tr:'+tr.id,'wait','Standorttransfer '+tr.id,tr.blocked,tr.id);}
 for(const r of s.returns||[])if(!FINAL_STATUS.has(r.status)){tasks.set(r.id,{task:r,kind:'service'});if(r.site===site){h.returnsOpen++;if(r.status==='decision')h.returnsDecision++;}if(r.blocked)alert('ret:'+r.id,'wait','Retoure '+r.id,r.blocked,r.id);else if(r.status==='decision')alert('ret:'+r.id,'wait','Retoure '+r.id+' · Entscheidung offen',fmt(r.qty)+' Stück · Reparieren oder verwerten',null,'service');}
 for(const t of s.tickets||[])if(t.status!=='closed'){if(t.site===site){t.status==='open'?h.ticketsOpen++:h.ticketsWork++;}if(t.status==='open')alert('tk:'+t.id,t.expired||t.respondBy!=null&&s.t>t.respondBy?'bad':'wait',`Kundendienst · ${ticketKinds[t.kind]||'Ticket'} offen`,`${orders.get(t.orderId)?.customer||t.orderId} · ${siteName(t.site)}${t.respondBy!=null?(s.t>t.respondBy?' · Antwortfrist abgelaufen':' · Antwort bis '+clockOf(t.respondBy%1440)):''}`,null,'service');else if(t.blocked)alert('tk:'+t.id,'wait','Kundendienst · '+t.id,t.blocked,null,'service');}
 for(const p of s.purchases){if(p.status==='stored')continue;if(p.site===site&&p.status in h.inbound)h.inbound[p.status]++;if(p.blocked){if(p.site===site)h.inbound.blocked++;alert('p:'+p.id,'wait',`Wareneingang · ${fmt(p.qty)} × ${name(ITEMS,p.item)}`,`${p.blocked} · ${siteName(p.site)}`,null,'purchasing');}}
 for(const b of s.buildings){
  if(b.site===site){if(b.type==='dock'){h.dockFocus??=b.id;}else if(b.type==='coldstore')h.coldFocus??=b.id;else if(b.type==='rack')h.rackFocus??=b.id;
   const g=b.type==='assembly'?h.prod:b.type==='testing'||b.type==='packing'?h.qa:null;
   if(b.type==='sorter'||b.type===CROSSBELT){const u=h.hub;u.sorters++;u.sortFocus??=b.id;if(WORKING_STATUS.has(b.status))u.sortWork++;else if(BLOCKED_STATUS.has(b.status)&&!u.sortBlock){u.sortBlock=b.status;u.sortFocus=b.id;}}
   if(g){h.mfg=true;g.all++;g.focus??=b.id;if(WORKING_STATUS.has(b.status))g.work++;if(BLOCKED_STATUS.has(b.status)&&!g.block){g.block=b.status;g.focus=b.id;}if(b.status==='broken')g.broken=true;}}
  if(BLOCKED_STATUS.has(b.status))alert('b:'+b.id,b.status==='broken'?'bad':'wait',`${displayName(s,b)} · ${label(b.status)}`,`${b.id} · ${siteName(b.site)}`,b.id);
  if(b.type==='forklift'){const c=forkCharge(b);if(c<FORKLIFT_WARN)alert('fk:'+b.id,c<FORKLIFT.min?'bad':'wait',`Stapler-Akku ${fmt(c)} %`,`${c<FORKLIFT.min?'Nicht einsatzbereit · lädt im Leerlauf':'Unter '+fmt(FORKLIFT.min)+' % nicht einsatzbereit'} · ${siteName(b.site)}`,b.id);}
 }
 const load=siteLoad(s,site);Object.assign(h,load);
 if(load.cap&&load.used>=load.cap)alert('cap:'+site,'wait','Lager voll',`${fmt(load.used)} / ${fmt(load.cap)} Einheiten · ${h.siteName}`,null,'inventory');
 for(const w of s.workers)if(w.site===site){h.staffAll++;if(onShift(w,s.t))h.staffOn++;}
 // Hub-Aufträge (W1-S1) werden je Vertrag gebündelt gemeldet, übrige Aufträge einzeln.
 const lateByContract=new Map();
 for(const o of s.orders){if(o.status!=='active')continue;const late=o.late||s.t>o.due;
  if(isHubOrder(o)){if(deliverySiteOf(o)===site){h.hub.orders++;if(o.item==='pallet')h.hub.openPallets=(h.hub.openPallets||0)+Math.max(0,o.qty-o.delivered);else h.hub.openParcels+=Math.max(0,o.qty-o.delivered);if(late)h.hub.late++;}if(late)lateByContract.set(o.contractId,(lateByContract.get(o.contractId)||0)+1);}
  else if(late)alert('o:'+o.id,'bad',`Frist überschritten · ${o.customer}`,`${o.delivered} / ${o.qty} Stück geliefert · Frist ${time(o.due)}`,o.id);}
 collectHub(s,h,{alert,orders,siteName,lateByContract});collectContainers(s,h,{alert,siteName});collectLines(s,h,{alert,orders,siteName});collectAir(s,h,{alert,orders,siteName});collectDisruptions(s,h,{alert,siteName});
 for(const v of s.vehicles){
  if(v.status==='rentalReturned')continue;
  const a=tasks.get(v.tour)||tasks.get(v.freight)||tasks.get(v.shipment)||tasks.get(v.linehaul)||tasks.get(v.airShuttle)||null,task=a?.task,status=task?.status||v.status;
  const away=AWAY_STATUS.has(status)||(['shipment','tour','freight','linehaul'].includes(a?.kind)&&status==='unloading')||(a?.kind==='air'&&status==='handover');
  if(v.site===site){h.fleetSite++;if(away)h.away++;else h.atSite++;if(status==='loading')h.loading++;if(status==='returning')h.returning++;}
  let dest='—';
  if(a?.kind==='shipment'||a?.kind==='freight')dest=orders.get(task.orderId)?.customer||task.orderId;
  else if(a?.kind==='tour')dest=status==='returning'||status==='returnUnloading'?siteName(v.site):orders.get(task.stops?.[task.stopIndex]?.orderId)?.customer||'Sammeltour';
  else if(a?.kind==='transfer')dest=siteName(task.toSite);
  else if(a?.kind==='service')dest='Retoure · '+(orders.get(task.orderId)?.customer||task.orderId);
  else if(a?.kind==='air')dest='Frachtterminal '+AIRPORT.short;
  else if(v.status==='maintenance')dest=v.maintenance?.external?'Externe Wartung':'Werkstatt';
  if(status==='returning'&&a?.kind!=='tour'&&a?.kind!=='linehaul'&&a?.kind!=='air')dest='Rückfahrt · '+dest;
  const rest=Number.isFinite(task?.remaining)&&task.remaining>0?task.remaining:Number.isFinite(v.maintenance?.remaining)&&v.maintenance.remaining>0?v.maintenance.remaining:null;
  const tone=v.condition<15?'bad':task?.blocked?'wait':away?'move':'neutral';
  h.fleet[tone]=(h.fleet[tone]||0)+1;
  if(v.condition<15)alert('vc:'+v.id,'bad',`${v.name} · Wartung nötig`,`Zustand ${fmt(v.condition)} % · unter 15 % keine Lieferung · Werkstatt mit Ersatzteil oder externe Wartung`,v.id);
  else if(v.condition<WEAR_WARN&&v.status!=='maintenance')alert('vw:'+v.id,'wait',`${v.name} · Wartung planen`,`Zustand ${fmt(v.condition)} % · unter 15 % keine Fahrt · Werkstatt + Ersatzteil (${euro(maintenanceCost(v))}) oder externe Wartung (${euro(maintenanceCost(v,true))})`,v.id);
  const lhv=a?.kind==='linehaul',airv=a?.kind==='air';
  h.vehicles.push({key:v.id,id:v.id,name:v.name||v.id,type:VEHICLES[v.type]?.name||v.type,route:lhv?(status==='returning'?`${siteName(task.to)} → ${siteName(task.from)}`:`${siteName(task.from)} → ${siteName(task.to)}`):airv&&status==='returning'?`${AIRPORT.short} → ${siteName(v.site)}`:`${siteName(v.site)} → ${dest}`,status:lhv?`Hauptlauf → ${siteName(task.to)} · ${tripPhase(s,task)}`:airv?`${label('airshuttle')} · ${AIR_PHASE[status]||label(status)}`:label(v.status)+(task&&task.status!==v.status?' · '+label(task.status):''),hint:task?.blocked||'',tone,rest:rest==null?'—':fmt(rest)+' Min.'});
 }
 if(s.money<0)alert('money','bad','Kontostand negativ',euro(s.money)+' · Kontokorrent prüfen',null,'finance');
 h.vehicles.push(...h.foreignRows);
 return h;
}
const station=(id,n,sub,tone)=>{put(`st-${id}-n`,n);put(`st-${id}-sub`,sub);putClass(`st-${id}`,'station tone-'+tone);};
const parts=list=>list.filter(([n])=>n>0).map(([n,t])=>fmt(n)+' '+t).join(' · ');
function renderHud(h){
 const s=V().state;hudData=h;
 put('siteCode',h.code);put('siteName',h.siteName);put('flowSite',h.code+' · '+h.siteName);put('siteStatus',`Rampen ${h.busy}/${h.docks} · Lager ${fmt(h.used)}/${fmt(h.cap)}`);
 put('clock',time(s.t));put('shiftName',shiftName(s.t));put('cash',euro(s.money));
 put('simState',rp?'Replay · nur Ansicht':!writable&&!temporary?'Schreibgeschützt':document.hidden?'Hintergrundpause':speed?'Betrieb läuft':'Pausiert');
 put('kpiDelivered',fmt(h.today));put('kpiDeliveredSub',h.day?`Stück · Δ ${signed(h.today-h.yesterday)} ggü. gestern (${fmt(h.yesterday)})`:'Stück · erster Spieltag');
 put('kpiVehicles',`${fmt(h.atSite)} / ${fmt(h.away)}`);put('kpiVehiclesSub',h.fleetSite?[`Fahrzeuge ${h.code}`,parts([[h.loading,'Beladung'],[h.returning,'Rückfahrt']])].filter(Boolean).join(' · '):`Keine Fahrzeuge an ${h.code}`);
 const total=h.onTime+h.late;put('kpiPunctual',total?fmt(Math.round(h.onTime/total*100))+' %':'—');put('kpiPunctualSub',total?`${fmt(h.onTime)} pünktlich · ${fmt(h.late)} verspätet`:'Noch keine Zustellung');
 const i=h.inbound,inboundOpen=i.waiting+i.receiving+i.checking+i.storing;
 renderHubStations(h);renderContainerStation(h);renderDisruptions(h);renderLineStation(h);putHidden('rail-containers',!h.cyRelevant);putHidden('rail-air',!h.airRelevant);renderAssistHead(s);
 {const adv=advancedUsed(s);for(const id of ['production','purchasing','research'])putHidden('rail-'+id,!adv);}
 putHidden('stl-inbound',!(h.mfg||inboundOpen+i.ordered>0));putHidden('stl-production',!h.mfg);putHidden('stl-quality',!h.mfg);
 station('inbound',fmt(inboundOpen),parts([[i.ordered,'unterwegs'],[i.waiting,'wartet'],[i.receiving,'Annahme'],[i.checking,'Prüfung'],[i.storing,'Einlagerung']])||'Keine offenen Einkäufe',i.blocked?'wait':inboundOpen?'move':'neutral');
 const pct=h.cap?Math.round(h.used/h.cap*100):0;
 station('stock',`${fmt(h.used)}/${fmt(h.cap)}`,`${fmt(Math.max(0,h.cap-h.used))} frei · ${pct} % belegt`,h.used>=h.cap?'bad':pct>=90?'wait':'neutral');
 for(const [id,g,none] of [['production',h.prod,'Kein Montageplatz'],['quality',h.qa,'Keine Prüf- oder Packstation']])station(id,`${g.work}/${g.all}`,!g.all?none:g.block?'Engpass: '+label(g.block):g.work?'Läuft':'Bereit',g.broken?'bad':g.block?'wait':g.work?'move':'neutral');
 putHidden('stl-service',!(h.mfg||h.returnsOpen+h.ticketsOpen+h.ticketsWork>0));
 station('service',fmt(h.returnsOpen+h.ticketsOpen+h.ticketsWork),parts([[h.returnsOpen,'Rückläufe'],[h.ticketsOpen,'Tickets offen'],[h.ticketsWork,'in Bearbeitung']])||'Keine offenen Vorgänge',h.returnsDecision||h.ticketsOpen?'wait':'neutral');
 put('sbDocks',`Rampen ${h.busy}/${h.docks}`);put('sbVehicles',`Fahrzeuge ${fmt(h.fleetSite)}`);put('sbStaff',`Personal ${fmt(h.staffOn)}/${fmt(h.staffAll)} im Dienst`);put('sbStock',`Lager ${fmt(h.used)}/${fmt(h.cap)}`);
 put('vbarCount',fmt(h.vehicles.length));putHidden('vbarEmpty',h.vehicles.length>0);if(prefs.vbarTab!=='orders')put('vbarSummary',h.vehicles.length?parts([[h.fleet.move,'unterwegs'],[h.fleet.wait,'wartet'],[h.fleet.bad,'Wartung nötig'],[h.fleet.neutral,'vor Ort / bereit'],[h.fleet.foreign,'Fremd-Lkw']]):'Keine Fahrzeuge');
 putHidden('kpiSortedBox',h.sorted==null);if(h.sorted!=null){put('kpiSorted',fmt(h.sorted));put('kpiSortedSub',h.sortedTotal!=null?`Pakete · gesamt ${fmt(h.sortedTotal)}`:'Pakete sortiert');}
 renderVbarOrders(s,h);
 if(!document.body.classList.contains?.('vbar-collapsed')&&prefs.vbarTab!=='orders')syncList($('#vbarList'),h.vehicles,vehicleRow,updateVehicleRow);
 const n=h.alerts.length;put('bellCount',n>99?'99+':fmt(n));putHidden('bellCount',!n);putClass('bellCount','bell-count'+(h.alerts.some(a=>a.tone==='bad')?'':' wait'));putAttr('bellBtn','aria-label',n?`Meldungen: ${n} offen`:'Meldungen: keine');
 put('bellSummary',n?`${fmt(n)} Hinweise aus dem aktuellen Betrieb`:'Keine Meldungen. Betrieb ohne Wartegründe.');
 if(!$('#bellMenu').hidden)syncList($('#bellList'),h.alerts.slice(0,80),alertRow,updateAlertRow);
 putHidden('labelGroup',typeof scene.setLabels!=='function');putHidden('followBtn',typeof scene.follow!=='function');putHidden('tourBtn',typeof scene.tour!=='function');
 const req=requirements(),idx=req.findIndex(x=>!x.ok),m=req[idx]||{title:'Erster Kreislauf geschlossen.',text:'Neue Aufträge, größere Kapazität, dein nächster Schritt.',panel:'overview',cta:'Betrieb weiterentwickeln'};
 put('missionNumber',idx<0?'✓':String(idx+1).padStart(2,'0'));put('missionTitle',m.title);put('missionText',m.text);
 const mk=m.cta+'|'+(m.panel||m.action)+'|'+(m.build||'');if(hudCache.get('mission')!==mk){hudCache.set('mission',mk);const a=$('#missionAction');a.textContent=m.cta+' →';delete a.dataset.panel;delete a.dataset.action;delete a.dataset.id;if(m.panel)a.dataset.panel=m.panel;else a.dataset.action=m.action;if(m.build)a.dataset.id=m.build;}
}
// 0.17 Abschnitt 6 (A05/A10-S): Auftrags-Tab der unteren Betriebsleiste. Zeilen aus ui-orders.js (gecachte Bestandsrechnung je Datenstand).
function renderVbarOrders(s,h){
 const tab=prefs.vbarTab==='orders'?'orders':'vehicles',collapsed=!!document.body.classList.contains?.('vbar-collapsed'),bar=orderBarRows(s);
 put('vbarOrdersCount',fmt(bar.total));putHidden('vbarOrdersWarn',!bar.warn);put('vbarOrdersWarn','⚠ '+fmt(bar.warn));putAttr('vbarTabOrders','title',bar.warn?`Aktive Aufträge · ${bar.warn} mit knapper oder überschrittener Frist`:'Aktive Aufträge mit Restfrist und Fehlmengen');
 putHidden('vbarVehicles',tab!=='vehicles');putHidden('vbarOrders',tab!=='orders');putAttr('vbarTabVehicles','aria-selected',String(tab==='vehicles'));putAttr('vbarTabOrders','aria-selected',String(tab==='orders'));
 putClass('vbarTabVehicles','vbar-tab'+(tab==='vehicles'?' on':''));putClass('vbarTabOrders','vbar-tab'+(tab==='orders'?' on':''));
 if(tab==='orders'){putHidden('vbarOrdersEmpty',bar.total>0);put('vbarSummary',bar.total?`${fmt(bar.total)} aktiv${bar.warn?` · ${fmt(bar.warn)} Frist knapp/überschritten`:''}${bar.total>bar.rows.length?` · erste ${fmt(bar.rows.length)} nach Frist`:''}`:'Keine aktiven Aufträge');if(!collapsed)syncList($('#vbarOrderList'),bar.rows,orderBarRow,updateOrderBarRow);}
}
function vbarTab(tab){prefs.vbarTab=tab==='orders'?'orders':'vehicles';if(prefs.vbarCollapsed)prefs.vbarCollapsed=false;applyPrefs();savePrefs();hudCache.delete('vbarSummary');hudPending=true;flushHud(true);}
function openOrder(id){closeMenus();focusOrder(id);openPanel('orders',id);const row=$('#panelBody')?.querySelector?.(`[data-order-row="${id}"]`);row?.scrollIntoView?.({block:'center'});}
function orderBarRow(r){const b=el('button','vrow orow');b.type='button';b.dataset.order=r.id;b.setAttribute('role','listitem');b._name=el('b');b._id=el('small');const c1=el('span');c1.appendChild(b._name);c1.appendChild(b._id);b._prod=el('span');b._prog=el('span');b._due=el('span');const c5=el('span');b._chip=el('span','chip');c5.appendChild(b._chip);for(const x of [c1,b._prod,b._prog,b._due,c5])b.appendChild(x);return b;}
function updateOrderBarRow(b,r){setT(b._name,r.customer);setT(b._id,r.id);setT(b._prod,r.product);setT(b._prog,r.progress);setT(b._due,r.due);setC(b._due,r.tone==='bad'?'money-minus':'');setT(b._chip,r.warn?(r.tone==='bad'?'⚠ ':'')+r.warn:'im Plan');setC(b._chip,'chip tone-'+(r.warn?r.tone:'neutral'));const ot=`${r.title} · ${r.product} · ${r.progress} · ${r.due}`;if(b._title!==ot){b._title=ot;b.title=ot+' · Klick öffnet den Auftrag';}}
function vehicleRow(v){const b=el('button',v.arrival?'vrow foreign':'vrow');b.type='button';if(v.arrival)b.dataset.arrival=v.arrival;else b.dataset.vehicle=v.id;b.setAttribute('role','listitem');b._name=el('b');b._id=el('small');const c1=el('span');c1.appendChild(b._name);c1.appendChild(b._id);b._type=el('span');b._route=el('span');const c4=el('span');b._chip=el('span','chip');c4.appendChild(b._chip);b._rest=el('span','num');for(const x of [c1,b._type,b._route,c4,b._rest])b.appendChild(x);return b;}
function updateVehicleRow(b,v){setT(b._name,v.name);setT(b._id,v.id);setT(b._type,v.type);setT(b._route,v.route);setT(b._chip,v.status);setC(b._chip,'chip tone-'+v.tone);setT(b._rest,v.rest);const t=`${v.name} (${v.id}) · ${v.type} · ${v.route} · ${v.status}${v.rest&&v.rest!=='—'?' · Rest '+v.rest:''}${v.hint?' · '+v.hint:''}`;if(b._title!==t){b._title=t;b.title=t;}}
function alertRow(a){const b=el('button','drop-row');b.type='button';b.dataset.alert=a.key;b.setAttribute('role','listitem');b._dot=el('span','dot');const txt=el('span');b._title=el('b');b._sub=el('small');txt.appendChild(b._title);txt.appendChild(b._sub);b._kind=el('span','kind');for(const x of [b._dot,txt,b._kind])b.appendChild(x);return b;}
function updateAlertRow(b,a){setC(b._dot,'dot tone-'+a.tone);setT(b._title,a.title);setT(b._sub,a.sub);setT(b._kind,a.ref?'Akte →':'Öffnen →');}
function flushHud(force=false){const now=performance.now();if(!hudPending||(!force&&now-hudStamp<HUD_MS))return;hudStamp=now;hudPending=false;renderHud(collectHud(V().state));}
setInterval(()=>flushHud(),HUD_MS);
for(const id of ['siteMenu','bellMenu','cmdResults'])$('#'+id).hidden=true;
function openRef(id,target){closeMenus();const hub=id&&hubPanelFor(id);if(hub){openPanel(hub,id);return;}if(id){selected=id;openPanel('detail');scene.focus?.(id);}else if(target)openPanel(target);}
const STATIONS={gate:['yard',h=>h.dockFocus],unload:['yard',h=>h.dockFocus],sort:['inventory',h=>h.hub.sortFocus],cold:['inventory',h=>h.coldFocus],out:['inventory',h=>h.rackFocus],outPallet:['inventory',h=>h.rackFocus],delivery:['orders',()=>null],inbound:['purchasing',h=>h.rackFocus],stock:['inventory',h=>h.rackFocus],production:['production',h=>h.prod.focus],quality:['production',h=>h.qa.focus],service:['service',()=>null],disrupt:['disruptions',()=>null],linehaul:['lines',()=>null],containeryard:['containers',h=>h.cy.focus]};
function openStation(key){const st=STATIONS[key];if(!st)return;const h=hudData||collectHud(V().state);openPanel(st[0]);const id=st[1](h);if(id)scene.focus?.(id);}
function menuOpen(id){return !$('#'+id).hidden;}
function closeMenus(except=''){for(const [menu,btn] of [['siteMenu','siteBtn'],['bellMenu','bellBtn'],['cmdResults','cmd']])if(menu!==except&&!$('#'+menu).hidden){$('#'+menu).hidden=true;$('#'+btn).setAttribute?.('aria-expanded','false');}}
function toggleMenu(menu,btn){const open=$('#'+menu).hidden;closeMenus(menu);$('#'+menu).hidden=!open;$('#'+btn).setAttribute?.('aria-expanded',String(open));return open;}
function renderSiteMenu(){const s=V().state;$('#siteList').innerHTML=s.sites.map(x=>{const l=siteLoad(s,x.id),key='site:'+x.id;
 // 0.17 (A10-E): Standort umbenennen per Stift, Inline-Eingabe statt Zeile (Enter/Escape, leer = Startname).
 if(renaming===key)return `<div class="site-row editing">${renameInput(key,x.name,x.defaultName||x.name)}</div>`;
 return `<div class="site-row"><button class="drop-row" data-site="${esc(x.id)}" ${x.id===s.selectedSite?'aria-current="true"':''}><span class="dot ${x.id===s.selectedSite?'tone-good':''}"></span><span><b>${esc(siteCode(s,x.id))} · ${esc(x.name)}</b><small>${s.disruptions?esc(weatherText(weatherInfo(s,x.id)))+(siteDisruptions(s,x.id).some(e=>e.kind!=='weather')?' · Störung':'')+' · ':''}Rampen ${l.busy}/${l.docks} · Lager ${fmt(l.used)}/${fmt(l.cap)}</small></span><span class="kind">${x.id===s.selectedSite?'Aktiv':'Wechseln'}</span></button>${renameButton(key,'Standort')}</div>`;}).join('');}
/** Globale Suche über reale Objekte des aktuellen Zustands. */
function searchAll(query){const s=V().state,q=String(query||'').trim().toLowerCase();if(!q)return [];const hits=[],has=(...p)=>p.some(x=>String(x??'').toLowerCase().includes(q));objectHits(s,q,has,hits);return rankHits(hits,q).slice(0,12).map(x=>x[2]);}
function objectHits(s,q,has,hits){const site=id=>s.sites.find(x=>x.id===id)?.name||'';
 for(const b of s.buildings)if(has(displayName(s,b),name(BUILDINGS,b.type),b.id,label(b.status)))hits.push({id:b.id,kind:'Anlage',title:displayName(s,b),sub:`${name(BUILDINGS,b.type)} · ${b.id} · ${label(b.status)} · ${site(b.site)}`,tone:b.status==='broken'?'bad':BLOCKED_STATUS.has(b.status)?'wait':WORKING_STATUS.has(b.status)?'move':'neutral'});
 for(const v of s.vehicles)if(v.status!=='rentalReturned'&&has(v.name,v.id,VEHICLES[v.type]?.name,label(v.status)))hits.push({id:v.id,kind:'Fahrzeug',title:v.name||v.id,sub:`${v.id} · ${VEHICLES[v.type]?.name||v.type} · ${label(v.status)} · ${site(v.site)}`,tone:AWAY_STATUS.has(v.status)||['tour','transfer','service'].includes(v.status)?'move':'neutral'});
 for(const o of s.orders)if(has(o.customer,o.id,name(ITEMS,o.item)))hits.push({id:o.id,kind:'Auftrag',title:o.customer,sub:`${o.id} · ${label(o.status)} · ${o.delivered}/${o.qty} × ${name(ITEMS,o.item)}`,tone:o.late?'bad':o.status==='active'?'move':'neutral'});
 searchHub(s,q,has,site,hits);
 for(const w of s.workers)if(has(w.name,w.id,name(ROLES,w.role)))hits.push({id:w.id,kind:'Person',title:w.name,sub:`${name(ROLES,w.role)} · ${onShift(w,s.t)?w.task?'Beschäftigt':'Im Dienst':'Feierabend'} · ${site(w.site)}`,tone:'neutral'});
 }
const rankHits=(hits,q)=>hits.map((h,i)=>[h.id.toLowerCase()===q?0:h.title.toLowerCase().startsWith(q)?1:2,i,h]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
/* Befehlspalette (A10, 0.11): dieselbe Eingabe „/“ führt neben der Objektsuche echte Spielbefehle aus. Jeder Befehl nutzt
 * ausschließlich bestehende Pfade (setSpeed, openPanel, startBuild, hubSend, send, Szene-API). „>“ zeigt nur Befehle. */
function setView(v){scene.setView(v);$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));}
const LABEL_NAMES={all:'alle',fleet:'Flotte',infra:'Infrastruktur',none:'aus'};
function setLabelMode(m){if(typeof scene.setLabels!=='function'||!LABEL_NAMES[m])return false;labelMode=m;scene.setLabels(m);$$('[data-labels]').forEach(x=>x.classList.toggle('active',x.dataset.labels===m));return true;}
function selectedVehicle(){return selected&&V().state.vehicles.some(v=>v.id===selected&&v.status!=='rentalReturned')?selected:null;}
function followSelected(){if(typeof scene.follow!=='function')return false;if(scene.cameraMode?.()?.mode==='follow'){scene.follow(null);return true;}const id=selectedVehicle();if(!id){toast('Zuerst ein Fahrzeug auswählen (Fahrzeugleiste oder Szene).',true);return false;}if(scene.follow(id)===false){toast('Fahrzeug ist in dieser Ansicht nicht sichtbar (unterwegs oder Netzwerkansicht).',true);return false;}return true;}
function startTour(){if(typeof scene.tour!=='function')return false;scene.tour();return true;}
/** Hinweis bei laufendem Kamerarundgang bzw. Verfolgen (Callback onCameraMode der 3D-Szene). Reine Anzeige. */
function showCamMode(mode,info={}){const box=$('#camHint');if(!mode){box.hidden=true;$$('[data-camera="follow"],[data-camera="tour"]').forEach(b=>b.setAttribute('aria-pressed','false'));return;}
 const v=mode==='follow'?V().state.vehicles.find(x=>x.id===info.id):null;$('#camHintText').textContent=mode==='tour'?`Rundgang aktiv${info.label?' · '+info.label:''}`:`Verfolgen aktiv · ${v?.name||info.id||'Fahrzeug'}`;
 box.hidden=false;$$('[data-camera]').forEach(b=>{if(b.dataset.camera==='follow'||b.dataset.camera==='tour')b.setAttribute('aria-pressed',String(b.dataset.camera===mode));});}
const PANEL_ICONS={overview:'hub',production:'factory',inventory:'rack',purchasing:'cart',staff:'users',orders:'list',contracts:'contract',yard:'dock',fleet:'truck',finance:'euro',research:'flask',rules:'sliders',network:'network',special:'snow',service:'return',lines:'linehaul',containers:'container',air:'plane',assistant:'assistant',disruptions:'storm',history:'clock',help:'help',settings:'gear'};
const PANEL_ALIASES={yard:'hof|docks|tor',contracts:'verträge|vertrag',fleet:'transport|fuhrpark|fahrzeuge',inventory:'lager',staff:'personal|team',finance:'finanzen|geld|buchhaltung|unternehmensrechnung',settings:'einstellungen|optionen',help:'hilfe|handbuch',history:'chronik',overview:'zentrale|übersicht',network:'standorte',lines:'linien|linie|hauptlauf|linienverkehr',containers:'container|containerhof|seeimport|teu|lagergeld|chassis',air:'luftexport|luftfracht|flug|flughafen|zubringer|terminal|annahmeschluss',assistant:'assistent|disposition|dispositionsassistent|automatik',disruptions:'wetter|störung|störungen|stau|torstörung|netzstörung|regen|schnee|nebel|sturm'};
function commandList(){
 const s=V().state,list=[],adv=advancedUsed(s);
 const add=(title,sub,ic,run,aliases='')=>{const al=aliases.toLowerCase().split('|').filter(Boolean);list.push({cmd:true,id:'cmd:'+list.length,title,sub,icon:ic,run,aliases:al,words:(title+' '+sub+' '+al.join(' ')).toLowerCase()});};
 add(speed?'Pause':'Fortsetzen',speed?'Betrieb anhalten · Leertaste':`Betrieb mit ${lastSpeed}× fortsetzen · Leertaste`,speed?'pause':'play',()=>setSpeed(speed?0:lastSpeed),'pause|anhalten|stopp|fortsetzen|weiter');
 for(const [n,k] of [[1,'1'],[4,'2'],[12,'3']])add(`Tempo ${n}×`,`Spielgeschwindigkeit · Taste ${k}`,'play',()=>setSpeed(n),`tempo ${n}|${n}x|geschwindigkeit`);
 for(const c of (s.contracts||[]).filter(c=>c.status==='offer'))add(`Vertrag annehmen · ${c.shipper||c.id}`,`Frachtvertrag ${c.id} · Angebot`,'contract',()=>hubSend({type:'acceptContract',id:c.id},'Vertragsannahme'),'vertrag annehmen|annehmen');
 for(const [p,t] of Object.entries(titles)){if(p==='detail'||p==='planning'||(!adv&&['production','purchasing','research'].includes(p)))continue;add(t,'Fenster öffnen'+(p==='yard'?' · H':p==='contracts'?' · V':p==='lines'?' · N':p==='containers'?' · C':p==='air'?' · X':p==='assistant'?' · J':''),PANEL_ICONS[p]||'list',()=>openPanel(p),PANEL_ALIASES[p]||'');}
 {const on=!!s.assistant?.sites?.[s.selectedSite]?.enabled,nm=s.sites.find(x=>x.id===s.selectedSite)?.name||'';add(on?'Assistent ausschalten':'Assistent einschalten',`Dispositionsassistent · ${nm} · nur reguläre Befehle`,'assistant',assistToggle,'assistent an|assistent aus|assistent ein|disposition');}
 if(s.sites.length>1)add('Linie anlegen','Neue Linie zwischen eigenen Standorten · Hauptlauf','linehaul',()=>newLine(''),'linie neu|hauptlauf|linienverkehr');
 add('GuV & Anlagen','Ergebnisrechnung und Anlagenspiegel · Unternehmensrechnung','euro',()=>openFinance('guv'),'guv|gewinn|verlust|ergebnis|abschreibung|anlagen|anlagenspiegel|buchwert');
 add('Bauen','Baumodus öffnen · B','build',()=>startBuild(),'baumodus');
 for(const [id,b] of Object.entries(BUILDINGS))add(`Bauen: ${b.name}`,`${euro(b.cost)} · ${b.w}×${b.h}`,'build',()=>startBuild(id));
 s.buildings.filter(b=>b.site===s.selectedSite&&b.type==='dock').forEach((b,i)=>add(`Zum Dock ${i+1}`,`${displayName(s,b)} · ${name(BUILDINGS,b.type)} · ${b.id} · ${label(b.status)}`,'dock',()=>openRef(b.id),`dock ${i+1}|rampe ${i+1}`));
 for(const x of s.sites)if(x.id!==s.selectedSite)add(`Standort: ${x.name}`,`${siteCode(s,x.id)} · wechseln`,'network',()=>{send({type:'selectSite',id:x.id},true);scene.home();},'standort wechseln');
 for(const [v,t] of [['hall','Halle'],['site','Gelände'],['network','Netzwerk'],['flat','Grundriss']])add(`Ansicht: ${t}`,'Kameraansicht','home',()=>setView(v),'ansicht');
 add(sceneOnly?'Panels einblenden':'Nur Szene','Panels aus- oder einblenden · P','frame',()=>hudToggle('scene'),'nur szene|szene|panels');
 if(typeof scene.setLabels==='function')for(const m of ['all','fleet','infra','none'])add(`Beschriftung: ${LABEL_NAMES[m]}`,'Labels in der Szene · L','tag',()=>setLabelMode(m),'labels|beschriftung');
 add('Ansicht zurücksetzen','Kamera · Pos1','home',()=>scene.home(),'kamera|zentrieren');
 if(typeof scene.tour==='function')add('Kamerarundgang','Rundgang über das Gelände · T','play',startTour,'rundgang|tour');
 if(typeof scene.follow==='function'&&selectedVehicle())add('Fahrzeug verfolgen',`${selectedVehicle()} · F`,'pin',followSelected,'verfolgen|folgen');
 for(const [t,n] of Object.entries(THEMES))add(`Farbschema: ${n}`,t==='auto'?'Folgt dem Betriebssystem':t==='night'?'Dunkle Oberfläche':'Helle Oberfläche',t==='night'?'moon':'sun',()=>setTheme(t),'design|theme|farbschema'+(t==='night'?'|dunkel':t==='day'?'|hell':''));
 add(rp?'Replay beenden · Live':'Replay',rp?'Zurück zum Live-Betrieb · Esc':'Letzte 60 Spielminuten ansehen · Z','clock',rp?()=>replayLive():replayToggle,'replay|zurückspulen|rückblick|live');
 add('Tastenkürzel','Übersicht aller Kürzel · ?','keyboard',showKeys,'kürzel|tasten|shortcuts');
 if(!portableMode&&!temporary)add('Spiel speichern','Im Browser speichern','save',()=>save(true),'speichern');
 return list;}
function paletteHits(raw){const text=String(raw||'').trim().toLowerCase();if(!text)return [];
 const only=text.startsWith('>'),q=only?text.slice(1).trim():text,terms=q.split(/\s+/).filter(Boolean);
 const cmds=commandList().filter(c=>terms.every(t=>c.words.includes(t))).map(c=>[!q?2:c.title.toLowerCase().startsWith(q)||c.aliases.some(a=>a.startsWith(q))?0.5:3,0,c]);
 if(only)return cmds.slice(0,14).map(x=>x[2]);
 const s=V().state,objects=[],has=(...p)=>p.some(x=>String(x??'').toLowerCase().includes(q));
 objectHits(s,q,has,objects);
 return [...rankHits(objects,q).slice(0,12),...cmds.slice(0,6)].map((x,i)=>[x[0],i,x[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).slice(0,14).map(x=>x[2]);}
function renderCmd(){const q=$('#cmd').value;cmdHits=paletteHits(q);cmdIndex=Math.min(cmdIndex,Math.max(0,cmdHits.length-1));const box=$('#cmdResults');if(!q.trim()){box.hidden=true;$('#cmd').setAttribute?.('aria-expanded','false');return;}
 box.innerHTML=cmdHits.length?cmdHits.map((h,i)=>h.cmd?`<button class="drop-row cmd-row${i===cmdIndex?' active':''}" id="hit-${i}" role="option" aria-selected="${i===cmdIndex}" data-command="${i}">${icon(h.icon,'ic row-ic')}<span><b>${esc(h.title)}</b><small>${esc(h.sub)}</small></span><span class="kind">Befehl</span></button>`:`<button class="drop-row${i===cmdIndex?' active':''}" id="hit-${i}" role="option" aria-selected="${i===cmdIndex}" data-hit="${esc(h.id)}"><span class="dot tone-${h.tone}"></span><span><b>${esc(h.title)}</b><small>${esc(h.sub)}</small></span><span class="kind">${esc(h.kind)}</span></button>`).join(''):`<p class="drop-empty">Kein Treffer für „${esc(q.trim())}“. Gesucht wird in Anlagen, Fahrzeugen, Kennzeichen, Verträgen, Aufträgen, Beschäftigten und Befehlen. Tipp: „&gt;“ listet alle Befehle.</p>`;
 closeMenus('cmdResults');box.hidden=false;$('#cmd').setAttribute?.('aria-expanded','true');if(cmdHits.length)$('#cmd').setAttribute?.('aria-activedescendant','hit-'+cmdIndex);else $('#cmd').removeAttribute?.('aria-activedescendant');}
function openHit(id){$('#cmd').value='';renderCmd();$('#cmd').blur?.();openRef(id);}
function runHit(h){if(!h)return;if(!h.cmd){openHit(h.id);return;}$('#cmd').value='';renderCmd();$('#cmd').blur?.();h.run();}
$('#cmd').addEventListener('input',()=>{cmdIndex=0;renderCmd();});
$('#cmd').addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(cmdHits.length){cmdIndex=(cmdIndex+(e.key==='ArrowDown'?1:cmdHits.length-1))%cmdHits.length;renderCmd();}}else if(e.key==='Enter'){e.preventDefault();runHit(cmdHits[cmdIndex]);}else if(e.key==='Escape'){$('#cmd').value='';renderCmd();$('#cmd').blur?.();}});
function savePrefs(){try{if(!temporary&&!portableMode)localStorage.setItem(prefsKey,JSON.stringify({...prefs,mode:V().state.mode}));}catch{}}
function hudToggle(kind){
 if(kind==='sites'){if(toggleMenu('siteMenu','siteBtn'))renderSiteMenu();return;}
 if(kind==='bell'){if(toggleMenu('bellMenu','bellBtn')){const h=hudData||collectHud(V().state);syncList($('#bellList'),h.alerts.slice(0,80),alertRow,updateAlertRow);}return;}
 if(kind==='flow'||kind==='vbar'){const key=kind+'Collapsed';prefs[key]=!prefs[key];applyPrefs();savePrefs();hudPending=true;flushHud(true);return;}
 if(kind==='scene'){sceneOnly=!sceneOnly;document.body.classList.toggle('scene-only',sceneOnly);$('#sceneOnlyBtn').setAttribute?.('aria-pressed',String(sceneOnly));toast(sceneOnly?'Nur Szene. Taste P oder Rahmen-Schalter blendet Panels wieder ein.':'Panels eingeblendet.');}
}
const titles={overview:'Betriebszentrale',production:'Fertigung',inventory:'Lager & Materialfluss',purchasing:'Beschaffung',staff:'Dein Team',orders:'Markt & Aufträge',fleet:'Fuhrpark & Touren',finance:'Unternehmensrechnung',research:'Forschung & Produkte',rules:'Betriebsregeln',network:'Unternehmensnetz',service:'Kundendienst & Rückläufe',history:'Betriebschronik',help:'Betriebshandbuch',settings:'Spiel & Einstellungen',detail:'Objektakte',planning:'Planungsvorschau',special:'Speziallogistik',contracts:'Frachtverträge',yard:'Hof & Docks',lines:'Linienverkehr',containers:'Containerhof',air:'Luftexport',assistant:'Dispositionsassistent',disruptions:'Wetter & Störungen'};
let panelHtml=null;
/** Panel wird nur neu geschrieben, wenn sich sein HTML geändert hat; so bleiben Fokus, Eingaben und Scrollposition erhalten. */
function renderPanel(force=false){if(!panel)return;uiStamp=performance.now();const scroll=$('#panelBody').scrollTop;$('#panelTitle').textContent=titles[panel]||panel;$('#panelEyebrow').textContent=rp?replayText().toUpperCase():panel==='detail'?'ALLE DATEN. EIN ZUSAMMENHANG.':'INDUSTRIE & LOGISTIK';const renderers={overview:overview,production:production,inventory:inventory,purchasing:purchasing,staff:staff,orders:orders,fleet:fleet,finance:finance,research:research,rules:rules,network:network,service:service,history:history,help:help,settings:settings,detail:detail,planning:planning,special:special,contracts:contractsPanel,yard:yardPanel,lines:linesPanel,containers:containersPanel,air:airPanel,assistant:assistantPanel,disruptions:disruptionsPanel};const html=(renderers[panel]||overview)();if(force!==true&&html===panelHtml)return;panelHtml=html;$('#panelBody').innerHTML=html;$('#panelBody').scrollTop=scroll;}
function overview(){const s=V().state,req=requirements(),blocked=s.buildings.filter(b=>['materials','staff','power','storage','broken'].includes(b.status));return `<div class="numbers">${num(fmt(s.buildings.length),'Anlagen')}${num(fmt(s.orders.filter(o=>o.status==='active').length),'Aktive Aufträge')}${num(fmt(s.reputation)+' %','Reputation')}</div><section class="section"><div class="section-title"><h3>Vom leeren Hof zur ersten Zustellung</h3>${badge(req.filter(r=>r.ok).length+' / '+req.length)}</div><ol class="checklist">${req.map((r,i)=>`<li class="${r.ok?'done':''}"><span>${r.ok?'✓':i+1}</span><div><b>${r.title}</b><small>${r.text}</small></div></li>`).join('')}</ol></section>${s.buildings.length===0?`<div class="notice">Du bestimmst den Grundriss. Alternativ richtet der Aufbauassistent die Depot-Grundausstattung über reguläre, kostenpflichtige Bau-, Einstell- und Kaufbefehle ein: Laderampe, Lagerregal, eine Lagerkraft, eine Fahrperson und ein Lieferwagen. Fertigung folgt später als Geschäftsfeld „Mehrwertdienste“.</div>${button('Startbetrieb einrichten · ca. 14.500 €','starter','','primary')}`:''}<section class="section"><div class="section-title"><h3>Engpässe</h3>${badge(blocked.length+' Hinweise',blocked.length?'warn':'good')}</div>${blocked.map(b=>`<div class="list-row"><div><strong>${esc(displayName(s,b))}</strong><small>${esc(name(BUILDINGS,b.type))} · ${label(b.status)} · ${esc(b.id)}</small></div>${button('Prüfen →','select',b.id)}</div>`).join('')||empty('Keine Anlagen blockiert','Warteursachen erscheinen hier.')}<div class="actions">${button('Planungsvorschau','panel-planning')}${button('Chronik','panel-history')}</div></section>`;}
function production(){const s=V().state,rows=filtered(s.buildings.filter(b=>b.site===s.selectedSite));return `<div class="notice">Jede Station verarbeitet nur passende Rezepte. Material, Arbeitskraft, Energie und freie Ausgabe müssen verfügbar sein.</div>${rows.map(b=>{const j=s.jobs.find(j=>j.id===b.job);return `<div class="card"><div class="card-top"><div><h3>${esc(displayName(s,b))}</h3><small>Typ: ${esc(name(BUILDINGS,b.type))} · ${esc(b.id)} · Position ${b.x+1}/${b.y+1}</small></div>${badge(label(b.status),['materials','staff','storage','power','broken'].includes(b.status)?'warn':'')}</div>${j?progress(b.progress)+kv('Auftrag',esc(name(RECIPES,j.recipe)))+kv('Restzeit',fmt(j.remaining,1)+' Min.'):kv('Prozess',esc(name(RECIPES,b.recipe)))}${kv('Zustand',fmt(b.condition)+' %')}<div class="actions">${button('Details','select',b.id)}${button(b.enabled?'Pausieren':'Fortsetzen','toggle',b.id)}${button('Versetzen','move',b.id)}</div></div>`;}).join('')||empty('Noch keine Anlagen','Baue deine erste Linie über den Baumodus.')}<div class="actions">${button('Anlage bauen','build','','primary')}</div>`;}
function inventory(){const s=V().state,{used,cap}=siteLoad(s,s.selectedSite);return `<div class="numbers">${num(fmt(used),'Einheiten am Standort')}${num(fmt(cap),'Lagerkapazität')}${num(fmt(s.reservations.reduce((n,r)=>n+r.qty,0)),'Reservierte Einheiten')}</div>${progress(cap?used/cap:0)}${stockTable(s,search)}<div class="actions">${button('Material einkaufen','panel-purchasing','','primary')}${button('Kapazität bauen','build')}</div>`;}
// 0.17 (A05/A10-S): Vorbelegung aus [+] „Ressource bestellen“ (buyDraft). Kein Kauf ohne „Verbindlich bestellen“ (Befehl buy).
let buyDraft=null;
function buyQuoteText(d){const q=buyQuote(d.item,d.qty,d.supplier);if(!q)return '';return q.qty?`${fmt(q.qty)} × ${q.name} · Stückpreis ${euro(q.unit)} · Gesamtkosten ${euro(q.total)} · Lieferzeit ${fmt(q.lead)} Spielminuten (${SUPPLIERS[q.supplier].name}), danach Annahme, Prüfung und Einlagerung durch Lagerpersonal.`:'Menge 1–1000 eingeben.';}
function syncBuyForm(f){const d=Object.fromEntries(new FormData(f));buyDraft={...(buyDraft||{}),item:d.item,qty:Number(d.qty),supplier:d.supplier||'standard'};const q=f.querySelector?.('[data-buy-quote]');if(q)q.textContent=buyQuoteText(buyDraft);}
function purchasing(){const s=V().state,materials=Object.fromEntries(Object.entries(ITEMS).filter(([id,v])=>['housing','board','carton','spare','metal','sensor_component'].includes(id)||v.purchasable)),d=buyDraft&&materials[buyDraft.item]?buyDraft:{item:Object.keys(materials)[0],qty:12,supplier:'standard'},sup=d.supplier||'standard';return `<section class="section"><h3>Material bestellen</h3><p class="fine" style="margin:9px 0 15px">Regulär: 30 Min. · Express: 10 Min. / +30 % · Premium: 45 Min. / +18 %, höhere Qualität.</p>${d.hint?`<div class="notice">${esc(d.hint)}</div>`:''}<form data-form="buy" class="form-grid">${field('Material',`<select name="item">${opts(materials,d.item)}</select>`,true)}${field('Menge',`<input name="qty" type="number" min="1" max="1000" value="${esc(d.qty)}" required>`)}${field('Lieferant',`<select name="supplier">${Object.entries(SUPPLIERS).map(([id,x])=>`<option value="${id}" ${id===sup?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`)}<p class="fine full sv-quote" data-buy-quote aria-live="polite">${esc(buyQuoteText({...d,supplier:sup}))}</p><button class="primary">Verbindlich bestellen →</button></form><div class="actions">${button('Startmaterial · 12 Leuchten','buy-kit')}</div></section><section class="section"><div class="section-title"><h3>Bestellungen</h3>${badge(s.purchases.length+' Vorgänge')}</div>${filtered(s.purchases).slice().reverse().map(p=>`<div class="card"><div class="card-top"><h3>${p.qty} × ${esc(name(ITEMS,p.item))}</h3>${badge(label(p.status),p.blocked?'warn':p.status==='stored'?'good':'')}</div>${kv('Bestellwert',euro(p.cost))}${kv('Ankunft',time(p.eta))}${p.blocked?`<p>${esc(p.blocked)}</p>`:''}<small>${esc(p.id)} · ${label(p.supplier)}</small></div>`).join('')||empty('Keine offenen Bestellungen')}</section>`;}
function staff(){const s=V().state;return `${renderSchedule(s,scheduleView,{assign:assignmentFor,nameOf:displayName})}<h3 class="team-head">Team verwalten</h3><form data-form="hire" class="form-grid"><label class="field">Rolle<select name="role">${opts(ROLES)}</select></label><button class="primary" style="grid-column:auto;align-self:end">Person einstellen</button></form>${roleHints()}<p class="fine" style="margin:10px 0 20px">Tagschicht 08–16 Uhr. Beschäftigte können nur eine Aufgabe gleichzeitig übernehmen. Lohn je aktiver Schichtminute.</p>${filtered(s.workers).map(w=>`<div class="card"><div class="card-top"><div><h3>${esc(w.name)}</h3><small>${esc(name(ROLES,w.role))}${roleNote(w)} · ${euro(w.wage)}/h</small></div>${assignmentBadge(assignmentFor(s,w))}</div><div class="grid2"><div>${kv('Qualifikation',fmt(w.skill,2)+'×')}${w.training?kv('Fortbildung',fmt(w.training.remaining)+' Min.'):''}${kv('Müdigkeit',fmt(w.fatigue)+' %')}</div><div>${kv('Tätigkeit',assignmentHtml(assignmentFor(s,w)))}${kv('Standort',esc(s.sites.find(x=>x.id===w.site)?.name))}</div></div><select aria-label="Schicht für ${esc(w.name)}" data-shift="${w.id}">${['day','night','all'].map(k=>`<option value="${k}" ${k===w.shift?'selected':''}>${label(k)}</option>`).join('')}</select><div class="actions">${button('Schulen · 90 Min. / 900 €','train',w.id)}${button('Akte','select',w.id)}${s.sites.length>1?`<select aria-label="Person versetzen" data-relocate="${w.id}"><option value="">Standort wechseln …</option>${s.sites.filter(a=>a.id!==w.site).map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>`:''}${button('Entlassen','fire',w.id,'danger')}</div></div>`).join('')||empty('Dein Team wartet auf dich','Für den Depotstart: 1 Lagerkraft und 1 Fahrdienst.')}`;}
/* ---- 0.15 (A10): Mehrwertdienste (economy.js kind 'vas': order.service, order.materials). Kundenmaterial kommt als kostenloser
 * Einkauf mit orderId/owner=Auftrag (purchases); Status nur gelesen. Vergütung o.price je fertigem Stück bei Zustellung. */
const PURCHASE_STATE={ordered:'unterwegs',waiting:'wartet auf Annahme',receiving:'in Annahme',checking:'in Prüfung',storing:'wird eingelagert',stored:'geliefert'};
function vasMaterials(s,o){return Object.entries(o.materials||{}).map(([item,need])=>{const ps=s.purchases.filter(p=>p.orderId===o.id&&p.item===item),got=ps.filter(p=>p.status==='stored').reduce((n,p)=>n+p.qty,0),open=ps.filter(p=>p.status!=='stored');
 const stock=s.batches.filter(b=>b.owner===o.id&&b.item===item&&b.qty>0).reduce((n,b)=>n+b.qty,0);
 return {item,need,got,stock,ok:got>=need,state:got>=need?'geliefert':open.length?PURCHASE_STATE[open[0].status]||label(open[0].status):o.status==='offer'?'nach Annahme':'fehlt',eta:open.find(p=>p.status==='ordered')?.eta,blocked:open.find(p=>p.blocked)?.blocked};});}
function vasHtml(s,o){if(o.kind!=='vas')return '';const ms=vasMaterials(s,o),missing=ms.filter(m=>!m.ok).length;
 return `<div class="vas-materials"><div class="section-title"><h4>Kundenmaterial</h4>${badge(o.status==='offer'?'liefert Kunde nach Annahme':missing?fmt(missing)+' fehlt':'vollständig geliefert',o.status==='offer'?'':missing?'warn':'good')}</div>${ms.map(m=>kv(`${fmt(m.need)} × ${name(ITEMS,m.item)}`,`<span class="chip tone-${m.ok?'good':o.status==='offer'?'neutral':'wait'}">${esc(m.state)}</span>${m.got&&!m.ok?` <small class="muted">${fmt(m.got)} geliefert</small>`:''}${m.eta!=null&&!m.ok?` <small class="muted">Ankunft ${time(m.eta)}</small>`:''}${o.status!=='offer'?` <small class="muted">im Lager ${fmt(m.stock)}</small>`:''}${m.blocked?`<br><small class="money-minus">${esc(m.blocked)}</small>`:''}`)).join('')}<p class="fine">Material stellt der Kunde (Fremdeigentum, kein Einkauf). Gefertigt wird mit den bestehenden Arbeitsplänen nur aus diesem Material; Fertigware bleibt Kundeneigentum und wird zugestellt. Vergütung je Stück bei Zustellung.</p></div>`;}
const orderKind=o=>o.kind==='vas'?'Mehrwertdienst · '+(o.service||'Lohnfertigung'):o.kind==='logistics'?'Fremdlogistik':o.kind==='manufacturing'?'Auftragsfertigung':'Eigenprodukte';
function orderDetail(s,o){const vas=o.kind==='vas';return `<div class="ov-detail${vas?' vas-card':''}"><div class="numbers">${num(`${o.delivered} / ${o.qty}`,'Geliefert')}${num(euro(o.price),vas?'Vergütung / Stück':'Preis / Stück')}${num(fmt(o.quality)+' %','Mindestqualität')}</div>${kv('Auftragsart',esc(orderKind(o)))}${kv('Lieferfrist',time(o.due))}${kv(vas?'Vergütung gesamt':'Vertragswert',euro(o.qty*o.price))}${vasHtml(s,o)}${kv('Bezahlt',euro(o.paid))}${o.status==='offer'?`<div class="actions">${button('Auftrag annehmen','accept',o.id,'primary')}${button('Akte','select',o.id)}</div>`:o.status==='active'?`${dispatchForm(s,o)}<div class="actions">${button('Akte','select',o.id)}${button('Stornieren','cancelOrder',o.id)}</div>`:button('Auftragsakte','select',o.id)}</div>`;}
// 0.17 (A05/A10-S): Auftragstabelle (ui-orders.js) mit gemeinsamer Bestandsrechnung; Details/Aktionen bleiben die bisherigen.
function orders(){const s=V().state;return ordersTable(s,{search,detail:o=>orderDetail(s,o)});}
function rentalOffer(s){return `<section class="section"><h3>Zusätzliche Fahrzeuge mieten</h3><p class="fine" style="margin:8px 0 12px">Je angefangene 1.440 Spielminuten vorausbezahlt. Erste Rate sofort. Weitere Raten bis Rückgabe, auch bei Stillstand. Keine anteilige Erstattung. Fahrtkosten, Wartung und Personal zusätzlich. Rückgabe nur leer und frei am Mietstandort.</p><form data-form="rental" class="form-grid">${field('Fahrzeug und Mietpreis',`<select name="vehicleType">${Object.entries(RENTAL_RATES).map(([id,rate])=>`<option value="${id}">${esc(VEHICLES[id].name)} · ${euro(rate)} sofort und je Spieltag · ${capacityText({type:id,capacity:VEHICLES[id].capacity})}</option>`).join('')}</select>`,true)}<p class="fine" style="grid-column:1/-1">Mietstandort: ${esc(s.sites.find(x=>x.id===s.selectedSite)?.name)}</p><button class="primary">Kostenpflichtig mieten</button></form></section>`;}
function rentalDetails(s,v){const r=(s.rentals||[]).find(r=>r.id===v.rentalId);if(!r)return '';return `${kv('Mietrate',euro(r.rate)+' / Spieltag')}${kv('Nächste Rate',time(r.nextDue))}${kv('Bisher berechnet',euro(r.rate*r.paidDays)+' · '+fmt(r.paidDays)+' Miettage')}${kv('Rückgabeort',esc(s.sites.find(x=>x.id===r.homeSite)?.name||r.homeSite))}<div class="actions">${button('Mietfahrzeug zurückgeben','returnRental',r.id)}</div>`;}
function rentalHistory(s){const returned=(s.rentals||[]).filter(r=>r.status==='returned');return returned.length?`<section class="section"><h3>Abgeschlossene Fahrzeugmieten</h3>${returned.slice().reverse().map(r=>`<div class="card"><div class="card-top"><h3>${esc(VEHICLES[r.vehicleType]?.name||r.vehicleType)}</h3>${badge('Zurückgegeben')}</div>${kv('Rückgabe',time(r.returnedAt))}${kv('Gesamte Mietkosten',euro(r.rate*r.paidDays))}<small>${esc(r.id)} · ${fmt(r.paidDays)} Miettage</small></div>`).join('')}</section>`:'';}
function fleet(){const s=V().state;return `${rentalOffer(s)}<form class="form-grid" data-form="vehicle">${field('Fahrzeug',`<select name="vehicleType">${Object.entries(VEHICLES).map(([id,v])=>`<option value="${id}">${esc(v.name)} · ${euro(v.cost)}</option>`).join('')}</select>`,true)}<button class="primary">Fahrzeug anschaffen</button></form><section class="section" style="margin-top:22px"><h3>Deine Flotte</h3>${filtered(s.vehicles.filter(v=>v.status!=='rentalReturned')).map(v=>`<div class="card" style="margin-top:12px"><div class="card-top"><h3>${esc(v.name)}</h3>${badge(label(v.status))}</div>${kv('Kapazität',capacityText(v))}${kv('Zustand',conditionHtml(v))}${rentalDetails(s,v)}<div class="actions">${button('Akte','select',v.id)}${button('Werkstatt-Wartung','vehicleMaintain',v.id)}${button('Externe Wartung','vehicleServiceExternal',v.id)}</div></div>`).join('')||empty('Noch keine Fahrzeuge',`Lieferwagen: ${capacityText({type:'van',capacity:VEHICLES.van.capacity})}, ${euro(VEHICLES.van.cost)}.`)}</section><section class="section"><h3>Sendungen</h3>${filtered(s.shipments).slice().reverse().map(sh=>`<div class="card" style="margin-top:12px"><div class="card-top"><h3>${esc(sh.id)}</h3>${badge(label(sh.status),sh.blocked?'warn':'')}</div>${kv('Menge',fmt(sh.qty)+' Stück')}${kv('Nächster Schritt',fmt(sh.remaining)+' Min.')}${sh.blocked?`<p>${esc(sh.blocked)}</p>`:''}<div class="actions">${button('Verlauf','select',sh.id)}${sh.status==='loading'?button('Stornieren','cancelShipment',sh.id):''}</div></div>`).join('')||empty('Keine Sendungen','Plane eine Lieferung im Auftragsfenster.')}</section>${tourPanel(s)}${rentalHistory(s)}`;}
/* ---- 0.15 (A10): GuV & Anlagen als Tab der Unternehmensrechnung ----
 * Lesesicht auf accounting.report(s,{from,to}).guv/.assets und periods(s). Abschreibung und Abgang sind reine Ergebnisgrößen,
 * die Oberfläche bucht nichts. Zeitraum- und Tabwahl sind Ansichtszustand (nicht im Spielstand). */
let financeTab='cash',guvPeriod='week';
const GUV_PERIODS={today:'Heute',week:'7 Tage',total:'Gesamt'};
const FIN_TABS={cash:'Zahlungen & Journal',guv:'GuV & Anlagen'};
function openFinance(tab='guv'){financeTab=FIN_TABS[tab]?tab:'cash';openPanel('finance');}
const segButtons=(map,current,action,labelText)=>`<div class="segmented panel-seg" role="tablist" aria-label="${esc(labelText)}">${Object.entries(map).map(([k,t])=>`<button type="button" role="tab" aria-selected="${current===k}" class="${current===k?'active':''}" data-action="${action}" data-id="${k}">${esc(t)}</button>`).join('')}</div>`;
function finance(){return renderDayCash(V().state,{label})+segButtons(FIN_TABS,financeTab,'financeTab','Ansicht Unternehmensrechnung')+(financeTab==='guv'?guvPanel():financeCash());}
const money=(v,strong=false)=>{const x=Math.round((Number(v)||0)*100)/100,t=euro(x===0?0:x);return `<span class="${x<0?'money-minus':x>0?'money-plus':''}">${strong?`<b>${t}</b>`:t}</span>`;};
const guvRow=(title,v,cls='',hint='')=>`<tr class="${cls}"><td>${esc(title)}${hint?`<br><small class="muted">${esc(hint)}</small>`:''}</td><td class="num">${money(v,cls.includes('sum'))}</td></tr>`;
const ASSET_SOURCE={field:'',ledger:'Anschaffung aus Journal (Altstand)',fallback:'Anschaffung geschätzt: Spielbeginn, Katalogpreis (Altstand)'};
const kindWord=k=>k==='vehicle'?'Fahrzeug':'Gebäude';
 /** 0.17: Anlagenspiegel nennt Gebäude mit Anzeigenamen (eigener Name), Typ bleibt in x.name; Fahrzeuge unverändert. */
 const assetName=(s,x)=>{const b=x.kind==='building'&&s.buildings.find(y=>y.id===x.assetId);return b?`${displayName(s,b)} (${x.name})`:x.name;};
function guvPanel(){const s=V().state,ps=periods(s),key=ps[guvPeriod]?guvPeriod:'week',range=ps[key],r=report(s,range),g=r.guv,a=r.assets,e=g.expenses,rec=g.reconciliation;
 const from=Math.max(0,range.from),span=key==='total'?'Seit Unternehmensgründung bis '+time(range.to):time(from)+' bis '+time(range.to);
 const ok=Math.abs(rec.result-g.result)<0.01;
 const guvTable=`<div class="table-wrap"><table class="guv-table"><thead><tr><th>Position</th><th class="num">${esc(GUV_PERIODS[key])}</th></tr></thead><tbody>
${guvRow('Umsatz · Zustellung',g.revenue.delivery)}${guvRow('Umsatz · Containerhandling',g.revenue.handling)}${guvRow('Umsatz · Luftexport',g.revenue.air)}${guvRow('Umsatzerlöse gesamt',g.revenue.total,'sum')}
${guvRow('Material und Einkauf',e.material)}${guvRow('Personal',e.personnel)}${guvRow('Energie',e.energy)}${guvRow('Miete',e.rent)}${guvRow('Transport und Retouren',e.transport)}${guvRow('Wartung',e.maintenance)}${guvRow('Vertragsstrafen',e.penalties)}${guvRow('Lagergeld und Lagergebühren',e.storageFees)}${guvRow('Sonstiger Aufwand',e.other,'','Forschung, Entsorgung, Erstattungen u. a.')}
${guvRow('Ergebnis vor Abschreibung (EBITDA)',g.ebitda,'sum')}
${guvRow('Abschreibung',g.depreciation,'','Linear, kein Geldabfluss')}${guvRow('Anlagenabgang · Restbuchwert',g.disposals,'','Abriss, kein Geldabfluss')}${guvRow('Rückbauerlös',g.disposalProceeds,'','Geldeingang beim Abriss')}
${guvRow('Betriebsergebnis (EBIT)',g.ebit,'sum')}${guvRow('Zinsen',g.interest)}${guvRow('Ergebnis',g.result,'sum total')}</tbody></table></div>`;
 const recon=`<p class="fine guv-recon">Abstimmung: Betrieblicher Geldfluss ${euro(rec.cashOperating)} ${rec.depreciation<0?'−':'+'} Abschreibung ${euro(Math.abs(rec.depreciation))} ${rec.disposals<0?'−':'+'} Abgang ${euro(Math.abs(rec.disposals))} + Rückbauerlös ${euro(rec.disposalProceeds)} = <b>${euro(rec.result)}</b> ${ok?'· stimmt mit dem Ergebnis überein':'· <span class="money-minus">weicht vom Ergebnis ab</span>'}. Investitionen (Bau, Fuhrpark, Standort) und Finanzierung (Kredit, Tilgung) sind nicht ergebniswirksam.</p>`;
 const rows=a.rows.slice().sort((x,y)=>x.acquiredAt-y.acquiredAt||String(x.assetId).localeCompare(String(y.assetId)));
 const reg=rows.length?`<div class="table-wrap"><table class="asset-table"><thead><tr><th>Anlage</th><th>Angeschafft</th><th class="num">Anschaffung</th><th class="num">Kum. Abschreibung</th><th class="num">Buchwert</th></tr></thead><tbody>${rows.map(x=>`<tr><td><button class="ref-link" data-action="select" data-id="${esc(x.assetId)}">${esc(assetName(s,x))}</button><br><small class="muted">${esc(kindWord(x.kind))} · ${esc(x.assetId)} · ${fmt(x.lifeDays)} Tage${ASSET_SOURCE[x.source]?' · '+esc(ASSET_SOURCE[x.source]):''}</small></td><td>${time(x.acquiredAt)}</td><td class="num">${euro(x.cost)}</td><td class="num">${money(-x.accumulated)}</td><td class="num"><b>${euro(x.bookValue)}</b>${progress(x.cost?x.bookValue/x.cost:0)}</td></tr>`).join('')}<tr class="sum"><td><b>Summe</b> · ${fmt(rows.length)} ${rows.length===1?'Anlage':'Anlagen'}</td><td></td><td class="num"><b>${euro(a.total.cost)}</b></td><td class="num">${money(-a.total.accumulated,true)}</td><td class="num"><b>${euro(a.total.bookValue)}</b></td></tr></tbody></table></div>`:empty('Keine Anlagen','Gebäude und gekaufte Fahrzeuge erscheinen hier. Mietfahrzeuge sind Aufwand, keine Anlage.');
 const disp=a.disposals.length?`<div class="table-wrap"><table class="asset-table"><thead><tr><th>Abgang</th><th>Angeschafft / abgegangen</th><th class="num">Anschaffung</th><th class="num">Kum. Abschreibung</th><th class="num">Restbuchwert</th></tr></thead><tbody>${a.disposals.map(x=>`<tr><td>${esc(x.name)}<br><small class="muted">${esc(kindWord(x.kind))} · ${esc(x.assetId)}</small></td><td>${time(x.acquiredAt)}<br><small class="muted">${time(x.disposedAt)}</small></td><td class="num">${euro(x.cost)}</td><td class="num">${money(-x.accumulated)}</td><td class="num">${money(-x.bookValue)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="fine">Keine Abgänge im Zeitraum.</p>';
 return `<div class="guv-head">${segButtons(GUV_PERIODS,key,'guvPeriod','Zeitraum der Ergebnisrechnung')}<small class="muted">${esc(span)}</small></div>
<div class="numbers">${num(money(g.revenue.total),'Umsatzerlöse')}${num(money(g.ebit),'Betriebsergebnis')}${num(money(g.result),'Ergebnis',g.result<0)}</div>
<div class="notice">Ergebnisrechnung aus den tatsächlichen Buchungen des Zeitraums plus Abschreibung. Abschreibung und Anlagenabgang mindern nur das Ergebnis und bewegen kein Geld. Tagessammelbuchungen (Lohn, Energie, Miete, Zinsen) zählen zur ersten Minute ihres Tages.</div>
<section class="section"><div class="section-title"><h3>Gewinn- und Verlustrechnung</h3>${badge(GUV_PERIODS[key])}</div>${guvTable}${recon}</section>
<section class="section"><div class="section-title"><h3>Anlagenspiegel</h3>${badge('Stand '+time(a.at))}</div><p class="fine" style="margin-bottom:8px">Lineare Abschreibung ohne Restwert je vollendetem Spieltag: Gebäude 180 Tage, gekaufte Fahrzeuge 90 Tage. Grundstücke (Standorterwerb) werden nicht abgeschrieben.</p>${reg}</section>
<section class="section"><div class="section-title"><h3>Abgänge im Zeitraum</h3>${badge(fmt(a.disposals.length))}</div>${disp}</section>`;}
function financeCash(){const s=V().state,r=report(s),deliveries=deliveryRows(s),outstanding=deliveries.filter(sh=>sh.paymentAt&&!sh.paid).reduce((n,sh)=>n+(sh.invoiceAmount||0),0),goods=s.batches.filter(b=>b.owner==='company').reduce((n,b)=>n+b.qty*b.unitCost,0),payments=s.ledger.filter(l=>l.category==='Umsatz').reduce((n,l)=>n+l.amount,0);const categories={};for(const l of s.ledger)categories[l.category]=(categories[l.category]||0)+l.amount;
 // W2b: Vertragsstrafe als eigene Kategorie, mit Frachtverträgen auch bei 0 € sichtbar.
 const penalty=s.ledger.filter(isPenaltyRow),penaltySum=Math.round(penalty.reduce((n,l)=>n+l.amount,0)*100)/100;if((s.contracts||[]).some(c=>c.status!=='offer')&&!('Vertragsstrafe' in categories))categories['Vertragsstrafe']=0;
 // W3b-2: Lagergeld als eigene Kategorie (mit Containervertrag auch bei 0 €), Handling ist Umsatz (container-handling:<id>).
 const cl=containerLedger(s),seaImport=(s.contracts||[]).some(c=>c.status!=='offer'&&isContainerC(c))||cl.demN>0||cl.handN>0;if(seaImport&&!('Lagergeld' in categories))categories['Lagergeld']=0;return `<div class="numbers">${num(euro(s.money),'Kontostand')}${num(euro(r.receivables.total),'Offene Forderungen')}${num(euro(r.inventory.ownValue),'Warenmodellwert')}</div><div class="notice">Zahlungsübersicht: Investitionen und Einkauf sind Geldabflüsse. Daraus allein folgt kein operativer Gewinn. Material trägt Beschaffungskosten; fertige Produkte zusätzlich direkte Fertigungslöhne und Maschinenenergie.</div><section class="section"><h3>Geldfluss seit Unternehmensgründung</h3><div class="grid2">${[['Betrieb',r.cashflow.operating],['Investitionen',r.cashflow.investing],['Finanzierung',r.cashflow.financing],['Sonstige Buchungen',r.cashflow.other]].map(([k,v])=>`<div class="card">${kv(k,euro(v))}</div>`).join('')}</div>${kv('Geldbestand zu Beginn (aus Journal)',euro(r.cash.openingBalance))}${kv('Netto-Geldfluss',euro(r.cash.net))}</section><section class="section"><h3>Gebundenes Kapital und Verpflichtungen</h3>${kv('Eigene Waren · Modellwert',euro(r.inventory.ownValue))}${kv('Davon gesperrt',euro(r.inventory.blockedValue))}${kv('Laufende Fertigung · Materialanteil',euro(r.inventory.workInProgress))}${kv('Vorausbezahlte Beschaffung',euro(r.inventory.prepaidPurchases))}${kv('Fremde Waren · kein eigenes Vermögen',fmt(r.inventory.foreignQty)+' Stück')}${kv('Offene Forderungen',euro(r.receivables.total))}${kv('Davon überfällig',euro(r.receivables.overdue))}${kv('Kredit, Überziehung und Terminalgebühren',euro(r.liabilities.total))}<details><summary>Bewertungsregeln und Grenzen</summary>${r.limitations.map(x=>`<p>${esc(x)}</p>`).join('')}</details></section><section class="section"><h3>Offene Kundenrechnungen</h3>${r.receivables.rows.map(row=>`<div class="list-row"><div><strong>${esc(row.customer)}</strong><small>${esc(row.source)} · ${esc(row.id)} · fällig ${time(row.due)}</small></div><b>${euro(row.amount)}${row.overdue?' · überfällig':''}</b></div>`).join('')||empty('Keine offenen Forderungen')}</section><div class="grid2"><div class="card"><h3>Zahlungsströme nach Bereich</h3>${Object.entries(categories).map(([k,v])=>kv(label(k),`<span class="${v<0?'money-minus':'money-plus'}">${euro(v)}</span>`)).join('')}</div><div class="card"><h3>Vertrieb</h3>${kv('Bezahlter Kundenumsatz',euro(payments))}${kv('Ausgelieferte Einheiten',fmt(s.stats.delivered))}${kv('Vertragsstrafen',`<span class="${penaltySum<0?'money-minus':''}">${euro(penaltySum)}</span> · ${fmt(penalty.length)} ${penalty.length===1?'Buchung':'Buchungen'}`)}${seaImport?kv('Containerhandling · im Umsatz',`${euro(cl.handSum)} · ${fmt(cl.handN)} Container`)+kv('Lagergeld',`<span class="${cl.demSum<0?'money-minus':''}">${euro(cl.demSum)}</span> · ${fmt(cl.demN)} ${cl.demN===1?'Stunde':'Stunden'}`):''}${kv('Reputation',fmt(s.reputation)+' %')}${kv('Aktive Verträge',fmt(s.orders.filter(o=>o.status==='active').length))}</div></div><section class="section"><h3>Lieferungsbeiträge</h3><p class="fine">Rechnungswert minus bewertete Herstellung und direkte Fracht. Standortmiete, Verwaltung und Finanzierung sind noch nicht verteilt.</p><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Kunde / Route</th><th class="num">Rechnung</th><th class="num">Direkte Kosten</th><th class="num">Beitrag</th></tr></thead><tbody>${deliveries.filter(sh=>sh.deliveredAt).map(sh=>`<tr><td>${esc(s.orders.find(o=>o.id===sh.orderId)?.customer)}<br><small>${esc(sh.id)}</small></td><td class="num">${euro(sh.invoiceAmount||0)}</td><td class="num">${euro((sh.materialCost||0)+(sh.transportCost||0))}</td><td class="num">${euro((sh.invoiceAmount||0)-(sh.materialCost||0)-(sh.transportCost||0))}</td></tr>`).join('')}</tbody></table></div></section><section class="section"><h3>Finanzierung</h3>${kv('Darlehenssaldo · 8 % p.a.',euro(s.loanBalance||0))}${kv('Kontokorrent · 15 % p.a.',euro(s.overdraft||0))}<form data-form="loan" class="form-grid">${field('Betrag','<input name="amount" type="number" min="100" max="50000" value="10000" required>')}${field('Aktion','<select name="operation"><option value="takeLoan">Kredit aufnehmen</option><option value="repayLoan">Kredit tilgen</option></select>')}<button class="primary">Finanzierung ausführen</button></form><p class="fine">Pflichtkosten laufen bei Geldmangel ins Kontokorrent. Neue freiwillige Ausgaben benötigen ausreichende Liquidität.</p></section><section class="section"><div class="section-title"><h3>Buchungsjournal</h3>${badge(s.ledger.length+' Buchungen')}</div><div class="table-wrap"><table><thead><tr><th>Zeit</th><th>Bereich / Anlass</th><th class="num">Betrag</th></tr></thead><tbody>${filtered(s.ledger).slice(-120).reverse().map(l=>`<tr><td>${time(l.t)}</td><td>${esc(label(l.category))}<br><small class="muted">${esc(l.note)}</small></td><td class="num ${l.amount<0?'money-minus':'money-plus'}">${euro(l.amount)}</td></tr>`).join('')}</tbody></table></div><p class="fine">Letzte 120 Treffer. Gesamter Zustand bleibt im Export enthalten.</p></section>`;}
/** 0.15 (A10): Gebäude mit Forschungssperre (Katalogfeld research), z. B. Mega-Hub → Quergurtsorter. */
const unlocks=key=>{const list=Object.values(BUILDINGS).filter(b=>b.research===key).map(b=>b.name);return list.length?kv('Schaltet frei',esc(list.join(', '))):'';};
function research(){const s=V().state;return `<div class="notice">Entwicklung verbindet Forschung, Personal und Anlagen. Laufende Projekte benötigen eine Entwicklungskraft und ein Labor.</div>${Object.entries(RESEARCH).map(([id,r])=>{const project=s.research.find(p=>p.key===id||p.type===id||p.id===id);return `<div class="card"><div class="card-top"><h3>${esc(r.name)}</h3>${badge(project?label(project.status):'Verfügbar')}</div>${kv('Investition',euro(r.cost))}${kv('Dauer',r.duration+' Min.')}${unlocks(id)}${project?.blocked?`<p>${esc(project.blocked)}</p>`:''}${project?progress(1-(project.remaining||0)/r.duration):button('Forschung starten','research',id,'primary')}</div>`;}).join('')}<section class="section"><h3>Arbeitspläne</h3>${Object.entries(RECIPES).map(([id,r])=>`<div class="card" style="margin-top:10px"><h3>${esc(r.name)}</h3><p>${Object.entries(r.inputs).map(([i,q])=>q+' × '+esc(name(ITEMS,i))).join(' + ')} → ${r.output.qty} × ${esc(name(ITEMS,r.output.item))}</p>${kv('Nennzeit',r.duration+' Min.')}${kv('Anlage',esc(name(BUILDINGS,r.building)))}</div>`).join('')}</section>`;}
function rules(){const s=V().state;return `<div class="notice">Betriebsregeln nutzen dieselben Material-, Personal- und Budgetgrenzen wie manuelle Eingaben. Kein zusätzlicher Ertrag durch Automatisierung.</div><form class="form-grid" data-form="rule">${field('Regelart','<select name="kind"><option value="reorder">Material nachbestellen</option><option value="dispatch">Kundenlieferungen disponieren</option><option value="maintenance">Anlagen warten</option></select>',true)}${field('Material (Nachbestellung)',`<select name="item">${opts(Object.fromEntries(Object.entries(ITEMS).filter(([id,v])=>v.purchasable)))}</select>`,true)}${field('Bestand- / Zustandsgrenze','<input name="threshold" type="number" min="1" value="5">')}${field('Menge je Bestellung / Fahrt','<input name="qty" type="number" min="1" value="20">')}${field('Gesamtbudget der Regel','<input name="budget" type="number" min="1" value="1000">')}${field('Wartezeit in Minuten','<input name="cooldown" type="number" min="10" value="120">')}${field('Priorität · höher zuerst','<input name="priority" type="number" min="0" max="100" value="50">')}<button class="primary">Betriebsregel anlegen</button></form><section class="section" style="margin-top:20px">${s.rules.map(r=>`<div class="card"><h3>${esc(r.name||(r.kind==='dispatch'?'Versandleitung':r.kind==='maintenance'?'Wartungsleitung':name(ITEMS,r.item)))}</h3>${kv('Zustand',r.enabled?'Aktiv':'Pausiert')}${kv('Budgetverbrauch',euro(r.spent||0)+' / '+euro(r.budget))}${kv('Letzte Ausführung',r.lastRun?time(r.lastRun):'Noch nicht')}${r.lastReason?`<p>${esc(r.lastReason)}</p>`:''}<div class="actions">${button(r.enabled?'Pausieren':'Aktivieren','toggleRule',r.id)}${button('Entfernen','deleteRule',r.id)}</div></div>`).join('')||empty('Keine Regeln','Starte mit einem Sicherheitsbestand für Kartons.')}</section>`;}
function network(){const s=V().state;return `<div class="section-title"><h3>Standorte</h3>${button('Netzkarte','networkView')}</div><div class="grid2">${s.sites.map(a=>`<div class="card"><div class="card-top"><h3>${esc(a.name)}</h3>${badge(a.id===s.selectedSite?'Ausgewählt':'Standort')}</div>${kv('Fläche',a.width+' × '+a.height)}${kv('Anlagen',s.buildings.filter(b=>b.site===a.id).length)}${kv('Team',s.workers.filter(w=>w.site===a.id).length)}<div class="actions">${button('Standort öffnen','site',a.id,'primary')}</div></div>`).join('')}</div><form data-form="site" class="form-grid">${field('Neuer Standortname','<input name="name" value="Verteilzentrum Lindenhain" maxlength="60" required>',true)}<button class="primary">Standort erwerben · 25.000 €</button><small class="fine" style="grid-column:1/-1">Benötigt Forschung „Standortnetz“. Freies Bauen ohne Forschungssperre. Maximal acht Standorte.</small></form>${s.sites.length>1?`<section class="section" style="margin-top:20px"><h3>Ware zwischen Standorten transportieren</h3><form data-form="transfer" class="form-grid">${field('Artikel',`<select name="item">${opts(ITEMS)}</select>`)}${field('Menge','<input name="qty" type="number" min="1" value="10">')}${field('Ziel',`<select name="toSite">${s.sites.filter(a=>a.id!==s.selectedSite).map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>`)}${field('Fahrzeug',`<select name="vehicleId">${s.vehicles.filter(v=>v.site===s.selectedSite&&v.status==='idle').map(v=>`<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select>`)}<button class="primary">Transfer beauftragen</button></form></section>`:''}<section class="section" style="margin-top:20px"><h3>Standorttransfers</h3>${(s.transfers||[]).slice().reverse().map(t=>`<div class="card" style="margin-top:10px"><div class="card-top"><h3>${t.qty} × ${esc(name(ITEMS,t.item))}</h3>${badge(label(t.status),t.blocked?'warn':'')}</div>${kv('Von',esc(s.sites.find(a=>a.id===(t.fromSite||t.site))?.name))}${kv('Nach',esc(s.sites.find(a=>a.id===t.toSite)?.name))}${kv('Restzeit',fmt(t.remaining)+' Min.')}${t.blocked?`<p>${esc(t.blocked)}</p>`:''}</div>`).join('')||empty('Keine Transfers','Eigene Standorttransfers erzeugen keinen Umsatz.')}</section><div class="actions">${button('Planungsvorschau','panel-planning')}</div>`;}
/* ---- 0.16 (A10): Wetter & Störungen, Personalrollen, Kundendienst-Ausbau, Linienankunft nach Schichtende, Warenangebote ----
 * Reine Lesesicht auf disruptions.js (active/weatherAt), customer-service.js (KIND_TEXT, respondBy/expired/trigger), contracts.js
 * (shipperScore, k.priceAdjust), special.js (coolingCapacity/coolingFree), transport.maxLoad und workforce (onShift, workRate).
 * Änderungen nur über vorhandene Befehle (settings, hire, respondTicket …). Keine Buchung, keine Bestandsänderung. */
const WEATHER_ICON={clear:'sun',rain:'rain',fog:'fog',snow:'snow',storm:'storm'};
const DISRUPTION_NAME={jam:'Stau',gate:'Torstörung',grid:'Netzstörung'};
const DISRUPTION_TONE={jam:'wait',gate:'wait',grid:'bad'};
const DISRUPTION_EFFECT={jam:'Fahrten auf der betroffenen Strecke dauern länger; die Dauer gilt ab Fahrtbeginn.',gate:'Torkontrolle steht: Fremd-Lkw warten im Tor („Torstörung“), keine Kraft gebunden, danach läuft die Kontrolle weiter.',grid:'Netzstrom fällt aus: nur Energiegebäude liefern Strom, Kühlung hat Vorrang vor Sortierung und Fertigung.'};
const TICKET_TRIGGER={late:'Lieferfrist überschritten',risk:'Drohende Verspätung (nichts zugestellt, Rest nicht unterwegs)',disruption:'Störungsverzug (Wetter oder Störung am Zustellstandort)',partial:'Teillieferung (Rest nicht unterwegs)'};
const EVENT_KIND={disruption:'Störung'};
const restMin=m=>{m=Math.max(0,Math.ceil(m));return m>=60?`${Math.floor(m/60)} Std. ${pad2(m%60)} Min.`:`${fmt(m)} Min.`;};
/** Aktive Wetterlage (nicht klar) und Ereignisse eines Standorts; ohne Störungsdaten leer. */
function siteDisruptions(s,site){const list=s.disruptions?disruptionsActive(s,site):[];return Array.isArray(list)?list:[];}
function weatherInfo(s,site){const kind=s.disruptions?weatherAt(s,site):'clear',f=WEATHER_FACTOR[kind]||1;return {kind,name:WEATHER_NAME[kind]||kind,icon:WEATHER_ICON[kind]||'sun',pct:Math.round((f-1)*100)};}
const weatherText=w=>w.kind==='clear'?'klar':`${w.name} · +${fmt(w.pct)} %`;
function putIcon(id,n){const k='i:'+id;if(hudCache.get(k)===n)return;hudCache.set(k,n);const e=document.getElementById(id);if(e)e.innerHTML=ICONS[n]||'';}
/** HUD: Glocke je Ereignis (alle Standorte), Station „Wetter & Störungen“ und Kopfzeile für den aktiven Standort. */
function collectDisruptions(s,h,{alert,siteName}){h.disrupt=null;if(!s.disruptions)return;
 for(const x of s.sites)for(const e of siteDisruptions(s,x.id))if(e.kind!=='weather')alert('ds:'+e.id,DISRUPTION_TONE[e.kind]||'wait',`${DISRUPTION_NAME[e.kind]||'Störung'} · ${siteName(x.id)}`,`${e.text} · noch ${restMin(e.endT-s.t)}`,null,'disruptions');
 h.disrupt={weather:weatherInfo(s,h.site),events:siteDisruptions(s,h.site).filter(e=>e.kind!=='weather'),off:s.settings?.incidents===false};}
function renderDisruptions(h){const s=V().state,d=h.disrupt;putHidden('stl-disrupt',!d);putHidden('siteWeather',!d);if(!d)return;
 const w=d.weather;putIcon('siteWeatherIc',w.icon);put('siteWeatherText',w.kind==='clear'?'Klar':w.name);putAttr('siteWeather','title',`Wetter ${h.siteName}: ${w.kind==='clear'?'klar, keine Verzögerung':`${w.name}, Fahrten ≈ ${fmt(w.pct)} % länger`}`);putClass('siteWeather','site-weather'+(w.kind==='clear'?'':' bad-weather'));
 const ev=d.events.map(e=>`${DISRUPTION_NAME[e.kind]||e.kind} noch ${restMin(e.endT-s.t)}`);
 station('disrupt',fmt(d.events.length),[d.off?'Störungen aus':`Wetter ${weatherText(w)}`,...ev].join(' · '),d.events.some(e=>e.kind==='grid')?'bad':d.events.length||w.kind!=='clear'?'wait':'neutral');}
function disruptionsPanel(){const s=V().state,d=s.disruptions,off=s.settings?.incidents===false;
 const toggle=`<div class="list-row"><span><strong>Wetter &amp; Störungen</strong><small>${off?'Aus: keine neuen Störungen und kein Wetter; laufende Ereignisse enden regulär.':'An: Wetter je Standort und Tag, Stau, Torstörung und Netzstörung ab Spieltag 2.'}</small></span><input type="checkbox" data-setting="incidents" ${off?'':'checked'} aria-label="Wetter und Störungen an oder aus"></div>`;
 if(!d)return `<div class="notice">Wetter und Störungen beginnen ab Spieltag 2, 14:00. Jede Störung hat Ursache, Dauer, Wirkung und Ende und erscheint als Meldung und Wartegrund.</div>${toggle}${empty('Noch keine Wetterlage','Der erste Tagesplan entsteht ab Spieltag 2.')}`;
 const events=[];for(const x of s.sites)for(const e of siteDisruptions(s,x.id))if(e.kind!=='weather')events.push(e);events.sort((a,b)=>a.endT-b.endT);
 const upcoming=(d.events||[]).filter(e=>e.startT>s.t).sort((a,b)=>a.startT-b.startT);
 const rows=s.sites.map(x=>{const w=weatherInfo(s,x.id),a=siteDisruptions(s,x.id).find(e=>e.kind==='weather');return `<tr><td><b>${esc(siteCode(s,x.id))}</b> · ${esc(x.name)}</td><td><span class="wx-cell">${icon(w.icon)} ${esc(w.kind==='clear'?'klar':w.name)}</span></td><td>${w.kind==='clear'?'Keine Verzögerung':`Fahrten ≈ +${fmt(w.pct)} %`}</td><td class="num">${a?`${hhmm(a.until)}<br><small class="muted">noch ${restMin(a.until-s.t)}</small>`:'—'}</td></tr>`;}).join('');
 const evRow=e=>`<div class="list-row disruption-row"><div><strong><span class="chip tone-${DISRUPTION_TONE[e.kind]||'wait'}">${esc(DISRUPTION_NAME[e.kind]||e.kind)}</span> ${esc(siteNameOf(s,e.site))}</strong><small>${esc(e.text)}</small><small class="muted">${esc(DISRUPTION_EFFECT[e.kind]||'')}</small></div><span class="num">${e.startT>s.t?`ab ${hhmm(e.startT)}`:`bis ${hhmm(e.endT)}<br><small class="${e.kind==='grid'?'money-minus':'muted'}">noch ${restMin(e.endT-s.t)}</small>`}</span></div>`;
 const log=(d.log||[]).slice(-10).reverse();
 return `<div class="notice">Wetter und Störungen verzögern Abläufe, erzeugen aber weder Ware noch Geld. Die Dauer einer Fahrt wird beim Start festgelegt. Torstörung: Fremd-Lkw warten im Tor. Netzstörung: nur Energiegebäude liefern Strom.</div>${toggle}
<section class="section"><div class="section-title"><h3>Wetter je Standort</h3>${badge(time(s.t))}</div><div class="table-wrap"><table><thead><tr><th>Standort</th><th>Wetter</th><th>Wirkung</th><th class="num">Bis</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section class="section"><div class="section-title"><h3>Aktive Störungen</h3>${badge(fmt(events.length)+' aktiv',events.length?'warn':'good')}</div>${events.map(evRow).join('')||'<p class="fine">Keine aktive Störung.</p>'}</section>
${upcoming.length?`<section class="section"><div class="section-title"><h3>Heute angekündigt</h3>${badge(fmt(upcoming.length))}</div>${upcoming.map(evRow).join('')}</section>`:''}
${log.length?`<details><summary>Behobene Störungen · ${fmt(log.length)}</summary>${log.map(e=>`<div class="list-row"><div><strong>${esc(DISRUPTION_NAME[e.kind]||e.kind)} · ${esc(siteNameOf(s,e.site))}</strong><small>${esc(e.text)}</small></div><span class="num">${hhmm(e.startT)}–${hhmm(e.endT)}</span></div>`).join('')}</details>`:''}`;}
/** Torbuch: Hinweis zur Torstörung (yard WAIT.gateDown) mit Restdauer. */
function gateDownHint(s,a){const e=siteDisruptions(s,a.site).find(x=>x.kind==='gate');return `<br><small class="muted">${e?`Torkontrolle steht bis ${hhmm(e.endT)} (noch ${restMin(e.endT-s.t)})`:'Torkontrolle steht'} · keine Kraft gebunden, Kontrolle läuft danach weiter</small> ${button('Störungen','panel-disruptions')}`;}
/** Torbuch: Verspätung fremder Lkw durch Wetter (a.delay, eta enthält die Verspätung). */
function arrivalDelayHtml(a){return a.delay>0?`<br><small class="money-minus">+${fmt(a.delay)} Min. Wetter · geplant ${clockOf(((a.eta??0)-a.delay)%1440)}</small>`:'';}
/** Personalrollen 0.16 (workforce SPECIALIST_FACTOR): kurze Erklärung beim Einstellen. */
const specialistPct=()=>Math.round(((SPECIALIST_FACTOR||1.25)-1)*100);
const ROLE_HINT={forklift:()=>`${specialistPct()} % schneller beim Staplerumschlag (Paletten, Sperrgut, Container, Beladung). Ohne Staplerfahrer springt eine Lagerkraft ein.`,gate:()=>`${specialistPct()} % schneller bei der Torkontrolle. Ohne Torposten übernimmt eine Lagerkraft.`};
function roleHints(){return `<div class="role-hints">${Object.entries(ROLE_HINT).filter(([r])=>ROLES[r]).map(([r,f])=>`<p class="fine"><b>${esc(ROLES[r].name)}</b> · ${euro(ROLES[r].wage)}/h · Einstellung ${euro(ROLES[r].hireCost)}: ${esc(f())}</p>`).join('')}</div>`;}
const roleNote=w=>ROLE_HINT[w.role]?` · Spezialist +${specialistPct()} %`:'';
/** Kundendienst: Antwortfrist (respondBy) mit Restzeit bzw. „abgelaufen“. */
function ticketDeadline(s,t){if(t.respondBy==null)return '';
 if(t.status==='open')return kv('Antwortfrist',s.t>t.respondBy||t.expired?`<span class="money-minus">abgelaufen seit ${time(t.respondBy)}</span> <small class="muted">Zufriedenheit gesunken, Antwort weiter möglich</small>`:`${time(t.respondBy)} · <span class="${t.respondBy-s.t<=60?'money-minus':''}">noch ${restMin(t.respondBy-s.t)}</span>`);
 // QS-016-03: „eingehalten“ erst nach Abschluss (completedAt ≤ respondBy); in Bearbeitung zählt die Restzeit.
 if(t.expired)return kv('Antwortfrist',time(t.respondBy)+' · <span class="money-minus">nicht fristgerecht</span>');
 if(t.completedAt==null)return kv('Antwortfrist',`${time(t.respondBy)} · in Bearbeitung · <span class="${t.respondBy-s.t<=60?'money-minus':''}">noch ${restMin(Math.max(0,t.respondBy-s.t))}</span>`);
 return kv('Antwortfrist',time(t.respondBy)+(t.completedAt<=t.respondBy?' · eingehalten':' · <span class="money-minus">nicht fristgerecht</span>'));}
function ticketTrigger(t){return kv('Auslöser',t.source==='automatic'?esc(TICKET_TRIGGER[t.trigger]||(t.kind==='complaint'?TICKET_TRIGGER.late:'Automatisch')):'Manuell angelegt');}
/** Versenderzufriedenheit 0–100 als Balken (contracts.shipperScore). */
function satisfactionBar(s,name){const v=Math.max(0,Math.min(100,Number(shipperScore(s,name))||0)),S=SATISFACTION||{neutral:50},mood=v>=S.neutral+10?'zufrieden':v<=S.neutral-10?'unzufrieden':'neutral';
 return `<span class="sat-line"><b>${fmt(v)}</b> / 100 · ${mood}</span><div class="progress sat${v<=S.neutral-10?' low':v>=S.neutral+10?' high':''}" role="meter" aria-label="Zufriedenheit ${esc(name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}"><span style="width:${v}%"></span></div>`;}
const pctSigned=x=>(x>0?'+':x<0?'−':'±')+fmt(Math.abs(x*100),1)+' %';
function shipperRows(s,c){if(!c.shipper)return '';const S=SATISFACTION||{priceSpan:0.08};
 return kv('Zufriedenheit Versender',satisfactionBar(s,c.shipper))+(c.status==='offer'&&Number.isFinite(c.priceAdjust)&&c.priceAdjust?kv('Preisanpassung',`<span class="${c.priceAdjust<0?'money-minus':'money-plus'}">${pctSigned(c.priceAdjust)}</span> je ${esc(unitSingular(c))} wegen Zufriedenheit ${esc(c.shipper)} · im Preis enthalten (bis ±${fmt(S.priceSpan*100)} %)`):'');}
function shippersSection(s){const list=Object.entries(s.shippers||{});if(!list.length)return '';list.sort((a,b)=>b[1].score-a[1].score||a[0].localeCompare(b[0]));
 return `<section class="section"><div class="section-title"><h3>Zufriedenheit der Versender</h3>${badge(fmt(list.length)+' Versender')}</div><p class="fine">Pünktliche Zustellung und beantwortete Anliegen heben die Zufriedenheit, Verspätung, Strafen und abgelaufene Antwortfristen senken sie. Wirkt ab Spieltag 2 auf neue Angebote: Preis bis ±${fmt((SATISFACTION?.priceSpan||0.08)*100)} %, unzufriedene Versender bieten seltener an.</p><div class="table-wrap"><table class="sat-table"><thead><tr><th>Versender</th><th>Zufriedenheit</th><th class="num">Pünktlich</th><th class="num">Verspätet</th><th class="num">Strafen</th><th class="num">Frist verpasst</th></tr></thead><tbody>${list.map(([n,r])=>`<tr><td><b>${esc(n)}</b></td><td class="sat-cell">${satisfactionBar(s,n)}</td><td class="num">${fmt(r.onTime||0)}</td><td class="num">${fmt(r.late||0)}</td><td class="num">${fmt(r.penalties||0)}</td><td class="num">${fmt(r.ignored||0)}</td></tr>`).join('')}</tbody></table></div></section>`;}
/** Auftragsakte: Rückgabe an den Kunden (Storno Lohnfertigung o.returnedItems/returnedQty, Vertragsende o.returnedQty). */
function returnedHtml(o){if(!(o.returnedQty>0))return '';const items=Object.entries(o.returnedItems||{}).filter(([,n])=>n>0);
 return kv('Rückgabe an Kunden',`${fmt(o.returnedQty,2)} Einheiten${items.length?' · '+items.map(([k,n])=>`${fmt(n,2)} × ${esc(name(ITEMS,k))}`).join(', '):''}`)+`<p class="fine">${o.kind==='vas'?'Storno Lohnfertigung: Kundenmaterial, Halbfabrikate und Fertigware gehen ohne Geldbuchung an den Kunden zurück; offene Kundenanlieferungen entfallen.':'Bei Vertragsende liegengebliebene Ware ging an den Versender zurück.'}</p>`;}
/** QS-W3-02: Ankunft je Abfahrt (Abfahrt + Fahrtzeit) gegen die Schichten der Lagerkräfte am Zielstandort. */
const UNLOAD_ROLES=['warehouse','forklift'];
function lineShiftIssues(s,from,to,departures,vehicle){if(!to||!from||!Array.isArray(departures)||!departures.length)return null;
 const km=siteDistance(s,from,to),speed=VEHICLES[vehicle?.type||'truck']?.speed||1,travel=Math.ceil((km||0)/speed);
 const crew=s.workers.filter(w=>UNLOAD_ROLES.includes(w.role)&&(w.relocation?w.relocation.toSite===to:w.site===to));
 const late=[];for(const dep of departures){const arr=dep+travel;if(!crew.some(w=>onShift(w,arr)))late.push({dep,arr});}
 return {travel,crew,late};}
function shiftEndText(crew){if(!crew.length)return 'keine Lagerkraft am Zielstandort';return [...new Set(crew.map(w=>w.shift))].map(x=>x==='day'?'Tagschicht bis 16:00':x==='night'?'Nachtschicht bis 08:00':'durchgehend').join(', ');}
function lineShiftWarning(s,from,to,departures,vehicle){const x=lineShiftIssues(s,from,to,departures,vehicle);if(!x||!x.late.length)return '';
 const list=x.late.map(l=>`${hhmm(l.dep)} → Ankunft ${hhmm(l.arr)}`).join(' · ');
 return `<div class="notice warn line-shift" role="note"><b>Ankunft nach Schichtende:</b> ${esc(list)} (Fahrtzeit ≈ ${fmt(x.travel)} Min.). In ${esc(siteNameOf(s,to))} ist dann keine Lagerkraft im Dienst (${esc(shiftEndText(x.crew))}); die Entladung wartet bis Schichtbeginn. Schicht am Ziel anpassen, Personal einstellen oder Abfahrt verlegen.</div>`;}
/** B-0.15-2: Kühlplätze je Ankunft vs. frei/gesamt bzw. Sperrgut-Kapazität der Fahrzeuge am Standort (transport.maxLoad). */
function wareCapacity(s,c){const w=wareOf(c);if(!w||c.status==='ended')return '';const perDay=parcelsPerDay(c),peak=Math.max(0,...(c.arrivals||[]).map(a=>Number(a.parcels)||0));
 if(w==='parcel_cold'){const cap=Math.floor(coolingCapacity(s,c.site)+1e-9),free=Math.floor(coolingFree(s,c.site)+1e-9),short=free<peak;
  return kv('Kühlplätze',`<span class="${short?'money-minus':''}">${fmt(peak)} je Ankunft benötigt</span> · ${fmt(perDay)} / Tag · am Standort ${fmt(free)} frei von ${fmt(cap)}`);}
 if(w==='bulky'){const vs=s.vehicles.filter(v=>v.site===c.site&&v.status!=='rentalReturned'),per=vs.map(v=>maxLoad(v,'bulky')),sum=per.reduce((n,x)=>n+x,0),by=new Map();
  vs.forEach((v,i)=>{if(per[i]>0){const k=VEHICLES[v.type]?.name||v.type,x=by.get(k)||{n:0,load:per[i]};x.n++;by.set(k,x);}});
  const detail=[...by].map(([k,x])=>`${fmt(x.n)} × ${esc(k)} à ${fmt(x.load)}`).join(', '),trips=sum?Math.ceil(perDay/sum):0;
  return kv('Sperrgut-Kapazität',sum?`${fmt(sum)} Stück je Umlauf (${detail}) · Bedarf ${fmt(perDay)} / Tag ≈ ${fmt(trips)} ${trips===1?'Umlauf':'Umläufe'}`:`<span class="money-minus">Kein Fahrzeug am Standort fasst Sperrgut</span> · Bedarf ${fmt(perDay)} / Tag`);}
 return '';}
const ticketKinds={status:'Statusanfrage',deadline:'Fristverlängerung',complaint:'Beschwerde',partial:'Teillieferung',...(TICKET_KIND_TEXT||{})};
const ticketResponses={inform:'Status mitteilen',approve:'Frist genehmigen',reject:'Frist ablehnen',goodwill:'Kulanz gewähren',apologize:'Entschuldigen'};
const ticketOutcomes={inform:'Status mitgeteilt',approve:'Frist verlängert',reject:'Fristverlängerung abgelehnt',goodwill:'Kulanz ausgezahlt',apologize:'Entschuldigung übermittelt',obsolete:'Anliegen nicht mehr anwendbar'};
function ticketEstimate(s,t,response){const o=s.orders.find(o=>o.id===t.orderId);if(!o)return 0;if(response==='approve')return Math.round(Math.max(0,o.qty-o.delivered)*o.price*0.02*100)/100;if(response==='goodwill'&&o.paid>0)return Math.round(Math.min(50,o.paid*0.05)*100)/100;return 0;}
function ticketRespond(id,response){const t=(V().state.tickets||[]).find(t=>t.id===id);if(!t)return;const cost=ticketEstimate(V().state,t,response);const act=()=>send({type:'respondTicket',id,response});if(response==='approve'||response==='goodwill')return confirm(ticketResponses[response]+'?',`Voraussichtliche Kosten: ${euro(cost)}. Betrag wird vom Simulationskern bei Ausführung geprüft. Servicepersonal bearbeitet Entscheidung; Wirkung erst nach Abschluss.`,act);return act();}
function ticketCard(s,t){const o=s.orders.find(o=>o.id===t.orderId),status={open:'Offen',processing:'In Bearbeitung',closed:'Geschlossen'}[t.status]||t.status;const responses=t.kind==='status'?['inform']:t.kind==='deadline'?['approve','reject']:['goodwill','apologize'];return `<div class="card"><div class="card-top"><div><h3>${esc(o?.customer||t.orderId)}</h3><small>${esc(t.id)} · Auftrag ${esc(t.orderId)}</small></div>${badge(esc(status),t.blocked?'warn':'')}</div>${kv('Anliegen',esc(ticketKinds[t.kind]||t.kind))}${ticketTrigger(t)}${ticketDeadline(s,t)}${kv('Standort',esc(s.sites.find(site=>site.id===t.site)?.name||t.site))}${kv('Eingang',time(t.createdAt))}${kv('Ursprüngliche Frist',time(t.originalDue))}${t.requestedDue!=null?kv('Beantragte Frist',time(t.requestedDue)):''}${o?kv('Aktuelle Auftragsfrist',time(o.due)):''}${kv(t.status==='closed'?'Gebuchte Kosten':'Vorgemerkte Kosten',euro(t.status==='closed'&&t.outcome==='obsolete'?0:t.cost||0))}${t.status==='open'?kv('Geplante Arbeitszeit',fmt({status:15,deadline:30,complaint:20,partial:15}[t.kind])+' Spielminuten'):t.status==='processing'?kv('Verbleibende Arbeitszeit',fmt(t.remaining)+' Spielminuten'):kv('Abgeschlossen',time(t.completedAt))}${t.response?kv('Gewählte Antwort',esc(ticketResponses[t.response]||t.response)):''}${t.outcome?`<p>${esc(ticketOutcomes[t.outcome]||t.outcome)}</p>`:''}${t.status==='closed'&&t.reply?`<p class="notice">${esc(t.reply)}</p>`:''}${t.blocked?`<div class="notice" role="status">${esc(t.blocked)}</div>`:''}${t.status==='open'?`<div class="actions">${responses.filter(r=>r!=='goodwill'||o?.paid>0).map(r=>button(ticketResponses[r]+(['approve','goodwill'].includes(r)?' · ca. '+euro(ticketEstimate(s,t,r)):''),'ticket-'+r,t.id)).join('')}</div>${(t.kind==='complaint'||t.kind==='partial')&&!(o?.paid>0)?'<p class="fine">Kulanz erst nach Kundenzahlung verfügbar.</p>':''}`:''}</div>`;}
function ticketPanel(s){const tickets=s.tickets||[],orders=s.orders.filter(o=>['active','fulfilled'].includes(o.status));return `<section class="section"><h3>Kundendienst-Anliegen anlegen</h3><p class="fine">Servicepersonal am Ticketstandort benötigt Arbeitszeit: Status 15, Frist 30, Beschwerde 20 Spielminuten. Schicht und Pause gelten. Überfällige Aufträge erzeugen automatisch eine Beschwerde, Vertragsaufträge zusätzlich Statusanfragen (drohende Verspätung, Störungsverzug) und Teillieferungen. Jedes Anliegen hat eine Antwortfrist; abgelaufen sinkt die Zufriedenheit des Versenders.</p><form data-form="ticket" class="form-grid">${field('Auftrag / Kunde',`<select name="orderId" required>${orders.map(o=>`<option value="${esc(o.id)}">${esc(o.customer)} · ${esc(o.id)} · ${esc(label(o.status))}</option>`).join('')||'<option value="">Kein aktiver oder erfüllter Auftrag</option>'}</select>`,true)}${field('Anliegen','<select name="kind"><option value="status">Statusanfrage · 15 Min.</option><option value="deadline">Fristverlängerung · 30 Min.</option><option value="complaint">Beschwerde · 20 Min.</option></select>')}${field('Fristverlängerung in Spielminuten','<input name="extensionMinutes" type="number" min="60" max="1440" step="1" value="240" required>')}<p class="fine" style="grid-column:1/-1">Verlängerung nur für aktive, unvollständige Aufträge; 60–1.440 Minuten ab bisheriger Frist. Je Auftrag und Anliegen höchstens ein Ticket. Genehmigung kostet 2 % des offenen Auftragswerts. Kulanz kostet 5 % des bezahlten Betrags, höchstens 50 €; nur nach Zahlung. Status, Ablehnung und Entschuldigung ohne Zusatzgebühr; Personallöhne laufen weiter.</p><button class="primary" ${orders.length?'':'disabled'}>Ticket anlegen</button></form></section>`;}

function service(){const s=V().state;return `${renderBoard(s,boardView,{detail:c=>boardDetail(s,c)})}${ticketPanel(s)}<h3 style="margin:20px 0">Retouren beauftragen</h3><div class="notice">Rückläufe brauchen echte Ware, Abholung und Prüfung. Erstattung erfolgt einmalig. Gesperrte Ware bleibt unverkäuflich.</div><form data-form="return" class="form-grid">${field('Gelieferter Auftrag',`<select name="orderId">${s.orders.filter(o=>o.delivered>0).map(o=>`<option value="${o.id}">${esc(o.customer)} · ${o.delivered} geliefert</option>`).join('')||'<option value="">Noch keine Zustellung</option>'}</select>`,true)}${field('Rückgabemenge','<input name="qty" type="number" min="1" value="1">')}<button class="primary" style="grid-column:auto;align-self:end">Rücknahme beauftragen</button></form>`;}
/* ---- 0.17 (A06/A08/A10-P): Board-Details mit den vorhandenen Aktionen, Ereignisse für Belegungsplan und Board ----
 * Reine Ansicht: Statuswechsel nur über respondTicket/resolveReturn (vorhandene Knöpfe), kein Drag-and-drop. */
const RETURN_REFUND=r=>r.refunded?`${euro(r.refund)} erstattet`:`${euro(r.refund)} nach Prüfung`;
function boardDetail(s,c){if(c.type==='ticket'){const t=(s.tickets||[]).find(x=>x.id===c.id);return t?ticketCard(s,t):'';}
 const r=(s.returns||[]).find(x=>x.id===c.id);if(!r)return '';const o=s.orders.find(x=>x.id===r.orderId),w=r.workshop&&s.buildings.find(b=>b.id===r.workshop);
 return `<div class="card">${kv('Kunde',esc(o?.customer||r.orderId))}${kv('Auftrag',button(esc(r.orderId),'select',r.orderId,'ref-link'))}${kv('Ware',`${fmt(r.qty)} × ${esc(name(ITEMS,r.item))}`)}${kv('Status',esc(label(r.status)))}${kv('Standort',esc(s.sites.find(x=>x.id===r.site)?.name||r.site))}${r.createdAt!=null?kv('Beauftragt',time(r.createdAt)):''}${kv('Erstattung',RETURN_REFUND(r))}${r.remaining>0&&!['decision','repaired','recycled'].includes(r.status)?kv('Restzeit Schritt',fmt(r.remaining)+' Min.'):''}${w?kv('Werkstatt',button(esc(displayName(s,w)),'select',w.id,'ref-link')):''}${r.completedAt!=null?kv('Abgeschlossen',time(r.completedAt)):''}${r.blocked?`<div class="notice" role="status">⚠ ${esc(r.blocked)}</div>`:''}<div class="actions">${r.status==='decision'?button('Reparieren','repairReturn',r.id,'primary')+button('Verwerten','recycleReturn',r.id):''}${button('Akte','select',r.id)}</div>${r.status==='decision'?'<p class="fine">Reparatur braucht eine freie, eingeschaltete Werkstatt und ein Ersatzteil je Stück; Kalibriermodule nur Verwertung.</p>':''}</div>`;}
function refocus(id){const el=document.getElementById?.(id);if(!el||typeof el.focus!=='function')return;el.focus();const n=String(el.value||'').length;try{el.setSelectionRange?.(n,n);}catch{}}
document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(!b||!b.dataset)return;
 if(b.dataset.boardCard!==undefined){if(boardClick(b,boardView))renderPanel(true);return;}
 const r=scheduleClick(b,scheduleView);if(!r)return;
 if(r.render){renderPanel(true);return;}
 if(r.worker){const s=V().state,w=s.workers.find(x=>x.id===r.worker);if(!w)return;const place=scheduleWorkplace(s,w);openRef(w.id);const b2=place?.buildingId&&s.buildings.find(x=>x.id===place.buildingId);if(b2&&b2.site===s.selectedSite)scene.focus?.(b2.id);return;}
 if(r.focus)scene.focus?.(r.focus);});
document.addEventListener('change',e=>{if(scheduleChange(e.target,scheduleView)||boardChange(e.target,boardView))renderPanel(true);});
document.addEventListener('input',e=>{const t=e.target;if(scheduleInput(t,scheduleView)){renderPanel(true);refocus('schedSearch');}else if(boardInput(t,boardView)){renderPanel(true);refocus('boardSearch');}});
function history(ref=null){const rows=filtered(V().state.events.filter(e=>!ref||e.refs?.includes(ref))).slice(-150).reverse();return `<div class="timeline">${rows.map(e=>`<div class="timeline-item"><small>${time(e.t)} · ${esc(EVENT_KIND[e.kind]||e.kind)}</small><p>${esc(e.text)}</p>${e.refs?.length?`<div class="actions">${e.refs.slice(0,3).map(id=>button(esc(id),'select',id)).join('')}</div>`:''}</div>`).join('')||empty('Noch keine Ereignisse')}</div>`;}
function detail(){const s=V().state;let kind='',o;for(const k of ['buildings','workers','batches','orders','purchases','vehicles','shipments','returns','transfers','tours','freights']){o=(s[k]||[]).find(x=>x.id===selected);if(o){kind=k;break;}}if(!o)return empty('Objekt nicht gefunden','Einige abgeschlossene Arbeitsaufträge gehen in die Chronik über.');let html=kind==='buildings'?buildingHead(s,o):`<div class="card"><div class="card-top"><h3>${esc(o.name||o.customer||name(kind==='buildings'?BUILDINGS:ITEMS,o.type||o.item)||o.id)}</h3>${badge(o.id)}</div>`;if(kind==='buildings'){const d=BUILDINGS[o.type];html+=explainHtml(s,o)+'<h4 class="xp-metrics-title">Kennzahlen</h4>'+metrics([['Status',esc(label(o.status)),'',BLOCKED_STATUS.has(o.status)?(o.status==='broken'?'bad':'wait'):WORKING_STATUS.has(o.status)?'move':''],['Zustand',fmt(o.condition),'%',condTone(o.condition)],['Energiebedarf',fmt(d.power),'kW'],['Anschaffung',fmt(d.cost,2),'€']]);html+=bookValueHtml(s,o,'building');if(o.type===CROSSBELT)html+=crossbeltHtml(s,o);if(o.type==='forklift')html+=forkliftHtml(s,o);if(o.type==='containeryard')html+=containeryardHtml(s,o);if(d.recipes.length)html+=`<label class="field">Arbeitsplan<select data-recipe="${o.id}">${d.recipes.map(id=>`<option value="${id}" ${id===o.recipe?'selected':''}>${esc(name(RECIPES,id))}</option>`).join('')}</select></label>`;html+=`<div class="actions">${button(o.enabled?'Pausieren':'Fortsetzen','toggle',o.id)}${button('Warten','maintain',o.id)}${button('Versetzen','move',o.id)}${button('Abreißen · 35 % Erlös','demolish',o.id,'danger')}</div>`;}else if(kind==='vehicles'){html+=vehicleDetail(s,o);}else if(kind==='batches'){html+=kv('Artikel',esc(name(ITEMS,o.item)))+kv('Menge',fmt(o.qty))+kv('Reserviert',fmt(o.reserved))+kv('Ort',label(o.location))+kv('Eigentum',esc(label(o.owner)))+kv('Qualität',fmt(o.quality)+' %')+kv('Einstandspreis',euro(o.unitCost));html+=`<div class="actions">${button('Charge und Nachfolger sperren','recallBatch',o.id,'danger')}</div><p>Herkunft: ${(o.parents||[]).map(id=>button(esc(id),'select',id)).join(' ')||'Direkte Anlieferung'}</p>`;}else{for(const [k,title]of Object.entries({status:'Status',role:'Rolle',item:'Artikel',qty:'Menge',delivered:'Geliefert',remaining:'Restzeit',quality:'Qualität',condition:'Zustand',blocked:'Warteursache',task:'Tätigkeit',capacity:'Ladeplätze',paid:'Bezahlt'}))if(k==='task'&&kind==='workers')html+=kv(title,assignmentHtml(assignmentFor(s,o)));else if(o[k]!==undefined)html+=kv(title,esc(k==='item'?name(ITEMS,o[k]):k==='role'?name(ROLES,o[k]):label(o[k])));}if(kind==='orders'&&o.kind==='vas')html+=kv('Auftragsart',esc(orderKind(o)))+kv('Vergütung',euro(o.price)+' je Stück · gesamt '+euro(o.qty*o.price))+vasHtml(s,o);if(kind==='orders')html+=returnedHtml(o);if(kind==='orders'&&isHubOrder(o))html+=journeyHtml(s,o);return html+'</div><h3 style="margin:20px 0">Verlauf</h3>'+history(o.id);}
/* ---- 0.17 (A04/A10-E): Gebäudeakte mit Anzeigenamen und Umbenennen (Befehl rename, core.js S2) ----
 * Stift öffnet eine Inline-Eingabe; Enter bestätigt, Escape verwirft (schließt das Fenster nicht), Fokusverlust verwirft,
 * leerer Name setzt den Standardnamen. Eingabezustand nur zur Laufzeit (renaming = 'building:<id>' | 'site:<id>'). */
let renaming=null;
function buildingHead(s,o){const key='building:'+o.id,editing=renaming===key;
 return `<div class="card building-file"><div class="card-top"><div class="name-line">${editing?renameInput(key,o.label||'',defaultName(s,o)):`<h3>${esc(displayName(s,o))}</h3>${replayLocked()?'':renameButton(key,'Anlage')}`}<small class="type-line">Typ: ${esc(typeName(o.type))} · ${esc(siteNameOf(s,o.site))}</small></div>${badge(o.id)}</div>`;}
const replayLocked=()=>!!rp;
function renameFocus(){try{const i=document.querySelector?.('.rename-input');if(i){i.focus();i.select?.();}}catch{}}
function renameRefresh(key){if(String(key).startsWith('site:')){renderSiteMenu();if(panel)renderPanel(true);}else renderPanel(true);}
function renameStart(key){if(replayBlocked('Umbenennen'))return;renaming=key;renameRefresh(key);renameFocus();}
function renameCancel(){const key=renaming;renaming=null;if(key)renameRefresh(key);}
function renameCommit(input){const key=input?.dataset?.rename||renaming;if(!key)return null;const i=key.indexOf(':'),target=key.slice(0,i),id=key.slice(i+1),value=String(input?.value??'');
 renaming=null;try{input?.blur?.();}catch{}const r=send({type:'rename',target,id,name:value},true);
 if(r.ok){const s=V().state,o=target==='site'?s.sites.find(x=>x.id===id):s.buildings.find(x=>x.id===id);toast(value.trim()?`Name übernommen: ${target==='site'?o?.name:displayName(s,o)}`:`Standardname: ${target==='site'?o?.name:displayName(s,o)}`);}
 renameRefresh(key);return r;}
function renameKeys(e){const t=e.target;if(!t?.dataset?.rename)return;if(e.key==='Enter'){e.preventDefault?.();e.stopPropagation?.();renameCommit(t);}else if(e.key==='Escape'){e.preventDefault?.();e.stopPropagation?.();renameCancel();}}
function renameClick(e){const b=e.target?.closest?.('[data-rename-start]');if(!b)return;e.stopPropagation?.();renameStart(b.dataset.renameStart);}
function renameBlur(e){const t=e.target,key=t?.dataset?.rename;if(!key)return;setTimeout(()=>{if(renaming===key&&document.activeElement!==t)renameCancel();},0);}
for(const sel of ['#panelBody','#siteList']){const n=$(sel);n?.addEventListener?.('keydown',renameKeys);n?.addEventListener?.('click',renameClick);n?.addEventListener?.('focusout',renameBlur);}
/* ---- 0.15 (A10): Buchwert in der Akte, Quergurtsorter-Karte ---- Lesesicht (accounting.assetInfo/accumulated, sorting.summary). */
function bookValueHtml(s,o,kind){const i=assetInfo(s,o,kind);if(!i)return '';const acc=accumulated(i,s.t),bv=Math.round((i.cost-acc)*100)/100;
 return kv('Buchwert',`${euro(bv)} <small class="muted">von ${euro(i.cost)} · ${fmt(i.life)} Tage linear</small> <button class="ref-link" data-action="openGuv" data-id="">Anlagenspiegel</button>`);}
const SORT_HAND={working:'läuft',staff:'wartet auf Lagerkraft',storage:'Ausgang blockiert',idle:'bereit',off:'aus'};
function crossbeltHtml(s,b){const spec=BUILDINGS[CROSSBELT],sm=sortSummary(s,b.site),crew=Number(b.crew)||0,staff=spec.staff||2,working=b.status==='working';
 const rate=spec.throughput*crew/staff,crewTone=crew>=staff?'good':crew?'wait':'bad';
 return metrics([['Besetzung',`${fmt(crew)} / ${fmt(staff)}`,'Kräfte',working||b.status==='staff'?crewTone:''],['Leistung',fmt(working?rate:0),'Pakete/h',working&&crew<staff?'wait':''],['Fehlwürfe heute',fmt(sm.rejectsToday),'Pakete',sm.rejectsToday?'wait':''],['Fehlwürfe gesamt',fmt(sm.rejects),'Pakete']])+
 kv('Status',`<span class="chip tone-${BLOCKED_STATUS.has(b.status)?'wait':working?'move':'neutral'}">${esc(label(b.status))}</span>${working&&crew<staff?' · halbe Leistung (1 Kraft)':''}`)+
 kv('Nachsortierung offen',`${fmt(sm.resort)} Pakete${sm.resort?' · Handsortierung '+esc(SORT_HAND[sm.hand]||sm.hand||'—'):''}${sm.resort?' <button class="ref-link" data-station="sort">Sortierung</button>':''}`)+
 kv('Sortiert heute am Standort',fmt(sm.today)+' Pakete')+
 `<p class="fine">Quergurt: ${fmt(spec.throughput)} Pakete/h mit ${fmt(staff)} Lagerkräften, eine Kraft = halbe Leistung, Strom ${fmt(spec.power)} kW. Jedes ${fmt(MISSORT_EVERY)}. Paket ist ein Fehlwurf (1 %) und wird von Hand nachsortiert. Fehlwürfe zählen je Standort. Sperrgut läuft nie über den Quergurt, Kühlpakete nur mit Kühllager.</p>`;}
function conditionHtml(v){return `${fmt(v.condition)} %${v.condition<15?' · keine Fahrt':v.condition<WEAR_WARN?' · Wartung planen':''}`;}
/** Fahrzeugakte: Kapazität je Artikelart, Zustand, beide Wartungswege mit Kosten und Dauer. */
function vehicleDetail(s,v){const m=v.maintenance,need=v.condition<100,shop=s.buildings.some(b=>b.site===v.site&&b.type==='workshop'&&b.enabled&&b.condition>0);
 let h=metrics([['Zustand',fmt(v.condition),'%',condTone(v.condition)],['Nutzlast',fmt(weightCap(v)),'kg'],['Ladevolumen',fmt(v.capacity),'VE'],['Pakete',`≈ ${fmt(maxLoad(v,'parcel'))}`,'Stk.']])+kv('Status',label(v.status))+kv('Typ',esc(VEHICLES[v.type]?.name||v.type))+kv('Pakete',`≈ ${fmt(maxLoad(v,'parcel'))} (Gewichtsgrenze)`)+kv('Fertigware',`${fmt(maxLoad(v,'lamp'))} Arbeitsleuchten`)+kv('Zustand',conditionHtml(v))+bookValueHtml(s,v,'vehicle');
 if(v.status==='maintenance'&&m)h+=kv(m.external?'Externe Wartung':'Werkstatt-Wartung',fmt(m.remaining)+' Min. verbleibend'+(m.blocked?' · '+esc(m.blocked):''));
 h+=`<p class="fine">Jede Fahrt kostet Zustand. Unter 15 % fährt das Fahrzeug nicht. Werkstatt-Wartung: Wartungswerkstatt am Standort, 1 Ersatzteil, Technikpersonal, 20 Min., ${need?euro(maintenanceCost(v)):'—'}${shop?'':' · keine Werkstatt am Standort'}. Externe Wartung: mobiler Servicepartner am Standort, ${fmt(EXTERNAL_SERVICE.minutes)} Min. außer Betrieb, ${need?euro(maintenanceCost(v,true)):'—'} (×1,5).</p>`;
 h+=vehicleLineHtml(s,v)+vehicleAirHtml(s,v);
 const free=v.status==='idle'&&need;return h+`<div class="actions">${free?button('Werkstatt-Wartung · '+euro(maintenanceCost(v)),'vehicleMaintain',v.id):''}${free?button(`Externe Wartung · ${euro(maintenanceCost(v,true))} · ${fmt(EXTERNAL_SERVICE.minutes)} Min.`,'vehicleServiceExternal',v.id,'primary'):''}</div>`;}
function planning(){const s=V().state;return `<div class="notice good">Planung läuft auf vollständiger Kopie. Originalbestand, Geld und Zufallszustand bleiben unverändert. Prognose setzt heutige Befehle fort; neue Marktentscheidungen werden nicht erfunden.</div><form data-form="forecast" class="form-grid">${field('Zeitraum','<select name="minutes"><option value="60">1 Spielstunde</option><option value="480">8 Spielstunden</option><option value="1440">1 Spieltag</option></select>')}${field('Alternative','<select name="alternative"><option value="none">Aktuellen Betrieb fortführen</option><option value="worker">Zusätzliche Fertigungskraft</option></select>')}<button class="primary">Vorschau berechnen</button></form>${forecast?`<div class="forecast-comparison" style="margin-top:20px"><div class="card"><h3>Jetzt</h3>${kv('Geld',euro(s.money))}${kv('Fertigware erzeugt',s.stats.produced)}${kv('Ausgeliefert',s.stats.delivered)}</div><div class="card"><h3>${time(forecast.t)}</h3>${kv('Geld',euro(forecast.money))}${kv('Fertigware erzeugt',forecast.stats.produced)}${kv('Ausgeliefert',forecast.stats.delivered)}</div></div>`:''}`;}
function help(){return `<p class="fine">Betriebshandbuch · Version ${VERSION}</p><div class="notice good">Alle Firmen, Personen, Preise und Verkehrsregeln sind fiktive Spielwerte. Simulation bleibt lokal. Keine Offlinefortschritte.</div>${[
 ['Erste Zustellung','Baue eine Laderampe (Dock) und ein Lagerregal. Stelle eine Lagerkraft ein. Nimm im Vertragsfenster den ersten Frachtvertrag an. Am Vormittag kommt der erste Lkw: Er dockt an und wird entladen, die Lagerkraft sortiert die Pakete von Hand. Stelle eine Fahrperson ein und kaufe einen Lieferwagen. Ordne im Auftragsfenster die sortierten Pakete dem Fahrzeug zu, einzeln oder als Sammeltour. Eine Stunde nach der Zustellung zahlt der Versender. „Startbetrieb einrichten“ in der Zentrale übernimmt den Aufbau über reguläre Befehle (ca. 14.500 €).'],
 ['Wirtschaftlichkeit im Depot','Erlös je Paket steht im Vertrag, meist 7 bis 8,50 €. Gewinn entsteht über die Menge. Laufende Kosten: Löhne je Schichtminute (Lagerkraft und Fahrer zusammen rund 310 € am Tag), Strom, Hallenmiete und Fahrtkosten je Tour (rund 5 bis 25 €). Schon der Startvertrag mit 200 bis 250 Paketen am Tag trägt Lagerkraft und Fahrer. Ein Lieferwagen fasst 160 Pakete und schafft in der Tagschicht etwa drei Touren. Mit einer Lagerkraft sind so rund 350 bis 400 Pakete am Tag pünktlich zu schaffen. Mit einem passenden zweiten Vertrag bringt ein guter Tag rund 2.200 € Überschuss; die Grundausstattung ist dann nach sechs bis sieben Spieltagen bezahlt. Zustellung nach Fristende kostet 10 % des Erlöses und Ansehen. Liegengebliebene Pakete binden am nächsten Morgen den Lieferwagen. Mehr Verträge, als Lagerkraft und Lieferwagen schaffen, bringen kaum mehr Geld, nur Verspätungen. Für mehr Menge braucht es ein weiteres Fahrzeug mit Fahrer.'],
 ['Mehrwertdienste (später)',`Montage, Prüfung und Verpackung bilden das Geschäftsfeld „Mehrwertdienste“. Mit einer Fertigungsanlage kommen ab Tag 2 täglich um 14:00 Anfragen zur Lohnfertigung (Markt & Aufträge, Kennzeichen „Mehrwertdienst“): Der Kunde liefert das Material kostenlos an (Fremdeigentum, Status „unterwegs“, „geliefert“ oder „fehlt“ je Material), du fertigst mit den bestehenden Arbeitsplänen und stellst die Fertigware zu. Vergütet wird je zugestelltem Stück. Für den Einstieg werden Mehrwertdienste nicht benötigt. Die vorhandenen Fertigungsanlagen lassen sich weiterhin bauen (Baumenü, Gruppe „Mehrwertdienste / Fertigung“). Fertigung, Einkauf und Entwicklung erscheinen in der linken Leiste, sobald eine Fertigungsanlage oder ein Labor steht oder Einkauf bzw. Forschung genutzt wurde; bis dahin hier erreichbar:</p><div class="actions">${button('Fertigung','panel-production')}${button('Einkauf','panel-purchasing')}${button('Entwicklung','panel-research')}</div><p>`],
 ['Frachtverträge, Hof und Docks','Verträge: Angebot prüfen (Versender, Zustellgebiete, Ankünfte je Tag, Pakete, Preis je Paket, Frist ab Tor) und annehmen. Zu jeder Ankunft kommt ein fremder Lkw: Anfahrt, Torkontrolle, Wartet auf Dock, Zum Dock, Andocken, Entladen, Ausfahrt. Ohne freies Dock oder Lagerpersonal wartet er; der Grund steht im Torbuch unter Hof & Docks. „Vorziehen“ bittet die Hofsteuerung, einen noch nicht angedockten Lkw zuerst zu bedienen. Entladene Pakete liegen im Wareneingang, ein Sortierplatz macht sie versandfähig, eigene Fahrzeuge stellen sie zu.'],
 ['Paletten und Stapler',`Ab Spieltag ${fmt(TERMS.pallet?.fromDay??3)} (oder sobald ein Staplerplatz steht) bieten Versender auch Palettenverträge an: Lkw mit mehreren Paletten je Ankunft, Preis je Palette. Paletten werden nicht sortiert. Entladen braucht eine Lagerkraft und einen freien, geladenen Stapler am Standort; die Paletten gehen direkt ins Lager. Zustellen kann nur ein Lkw, Lieferwagen tragen keine Paletten. Jeder Staplerplatz (Baumodus, Symbol ⇈) hat einen Stapler mit Akku: Arbeit kostet ${fmt(FORKLIFT.work,1)} % je Minute, im Leerlauf lädt er ${fmt(FORKLIFT.charge)} % je Minute, nur mit Strom am Standort. Unter ${fmt(FORKLIFT.min)} % ist er nicht einsatzbereit und lädt bis ${fmt(FORKLIFT.resume)} %, bevor er wieder arbeitet. Wartegründe im Torbuch: „Kein Stapler“, „Stapler lädt“, „Kein Strom für Stapler“. Akku und Tätigkeit stehen in der Akte des Staplerplatzes und unter Hof & Docks. Die Glocke warnt bei Akku unter ${fmt(FORKLIFT_WARN)} % und bei Palettenvertrag ohne Staplerplatz oder Lkw.`],
 ['Vertragsstrafen',`Jeder Frachtvertrag nennt zwei Strafsätze je Einheit. Verspätet: Für jedes Paket bzw. jede Palette, die nach der Frist zugestellt wird, fällt zusätzlich zum Abschlag von 10 % die Verspätungsstrafe an (Paket ${rateEuro(TERMS.penalty?.parcel?.late??1.5)}, Palette ${rateEuro(TERMS.penalty?.pallet?.late??8)}). Liegengeblieben: ${fmt((TERMS.penalty?.openGrace??1440)/60)} Stunden nach Vertragsende kostet jede noch nicht zugestellte Einheit Strafe (Paket ${rateEuro(TERMS.penalty?.parcel?.open??4)}, Palette ${rateEuro(TERMS.penalty?.pallet?.open??20)}); der Auftrag wird storniert, freie Ware geht an den Versender zurück. Liegt Ware dann noch auf einem Fahrzeug, ist reserviert oder steht ein Lkw im Hof, zeigt die Vertragskarte „Abrechnung wartet“ bis zum Abschluss. Jede Strafe wird genau einmal gebucht, Kategorie „Vertragsstrafe“ in der Unternehmensrechnung. Die Vertragskarte zeigt angefallene Strafen. Die Glocke meldet „Strafe droht“, sobald ein Vertragsauftrag in weniger als ${fmt(PENALTY_WARN)} Minuten fällig ist und noch Menge offen hat.`],
 ['Linienverkehr',`Mit zwei oder mehr Standorten bieten Versender auch Zustellgebiete an anderen eigenen Standorten an. Die Vertragskarte nennt je Gebiet den Standort, den Preiszuschlag je Einheit und die längere Frist. Solche Pakete werden am Annahme-Hub entladen und sortiert, aber nicht dort zugestellt: Eine Linie (Hauptlauf) bringt sie zum Ziel-Hub. Dort werden sie erneut sortiert und mit Fahrzeugen des Ziel-Hubs zugestellt. Linie anlegen im Fenster „Linien“ (Taste N): Start und Ziel, Abfahrtszeiten als Liste (z. B. 06:30, 14:00), ein freier Lkw am Startstandort und Ladeschluss (Standard ${fmt(LINE_CUTOFF)} Minuten vor Abfahrt). Zum Ladeschluss werden alle bereitliegenden Sendungen für das Ziel reserviert, früheste Frist zuerst, bis der Lkw voll ist. Fehlt der Lkw, steht er woanders, braucht Wartung oder liegt nichts bereit, gilt die Abfahrt als verpasst; die Ware fährt mit der nächsten Abfahrt. Beladen und Entladen brauchen Dock, Lagerkraft und Fahrpersonal, Paletten zusätzlich einen Stapler. Fahrtkosten wie beim Standorttransfer, kein Umsatz. Vor der Abfahrt lässt sich eine Fahrt stornieren; die Ware bleibt am Standort. Im Auftragsfenster sind Aufträge für andere Standorte ausgegraut. Die Auftragsakte zeigt die Paketreise: Annahme-Hub, Sortierung, Hauptlauf, Ziel-Hub, Sortierung, Zustellung. Die Glocke meldet fehlende Linien, verpasste Abfahrten und Linienfahrten mit mehr als ${fmt(LINE_WAIT_ALERT)} Minuten Verzug.`],
 ['Containerhof und Seeimport',`Ab Spieltag ${fmt(TERMS.container?.fromDay??5)} oder sobald am Standort ein Containerhof steht, bieten Versender Seeimport-Verträge an: Je Ankunft bringt ein Containerchassis vom Seehafen 1 bis 3 Container, jeder mit 18 bis 22 Paletten oder 500 bis 700 Paketen. Der Vertrag nennt den Inhalt (z. B. „3 Container à 20 Paletten“), den Inhaltspreis je Palette bzw. Paket, das Handling je Container, die Freizeit im Hof (meist 24 Stunden) und das Lagergeld je Stunde und Container danach. Baue einen Containerhof (Baumodus, Symbol ▦, ${fmt(BUILDINGS.containeryard?.teu||0)} TEU, ein 40-Fuß-Container belegt ${fmt(TEU)} TEU). Das Chassis fährt nach der Torkontrolle zum Containerhof, stellt ab und fährt wieder. Ohne Containerhof oder ohne freie TEU wartet es am Tor („Kein Containerhof“ bzw. „Containerhof voll“); abstellen am Dock ist nicht erlaubt. Entladen geschieht automatisch, älteste Container zuerst: Sobald ein Dock, eine Lagerkraft und bei Paletten ein Stapler frei sind, wird der Container zum Dock umgefahren (3 Minuten) und entladen. Paletten gehen ins Lager (Zustellung nur mit Lkw), Pakete in die Sortierung. „Vorziehen“ im Fenster „Containerhof“ (Taste C) stellt einen Container an die Spitze. Fehlt Dock, Personal, Stapler oder Lagerplatz, kehrt er mit seinem Fortschritt in den Hof zurück. Nach vollständigem Entladen wird das Handling als Umsatz gutgeschrieben. Der Leercontainer wird zwei bis vier Stunden später abgeholt; die geplante Abholung steht im Fenster. Lagergeld läuft ab Ende der Freizeit, bis das Abholchassis den Leercontainer aufnimmt, und wird je volle Stunde genau einmal gebucht (Kategorie „Lagergeld“ in der Unternehmensrechnung). Die Glocke meldet wartende Chassis, Container mit laufendem Lagergeld und Freizeit, die in weniger als zwei Stunden endet. Im Torbuch heißen die Chassis-Phasen „Zum Containerhof“, „Abstellen“ und bei Leercontainern „Abholung“.`],
 ['Luftexport',`Ab Spieltag ${fmt(TERMS.air?.fromDay??4)} oder sobald am Standort ein Dock und ein Lkw bzw. Lieferwagen stehen, bieten Versender Luftexport-Verträge an. Die Vertragskarte nennt die Flugzeiten (fester Abflug am ${esc(AIRPORT.name)}), den Annahmeschluss (meist ${fmt(TERMS.air?.cutoff??90)} Minuten vor Abflug), den hohen Preis je Paket und die Strafe je Paket und verpasstem Flug. Die Pakete kommen wie gewohnt per Lkw am Tor an, werden entladen und sortiert. Danach bringt ein eigener Zubringer sie zum Frachtterminal: Fenster „Luftexport“ (Taste X), Fahrzeug und Flug wählen, „Zubringer starten“. Der Zubringer lädt alle sortierten Luftpakete mit Flug bis zum gewählten Abflug, früheste zuerst. Beladen braucht Dock und Lagerkraft, die Fahrt Fahrpersonal; Fahrtkosten werden bei Abfahrt gebucht. Am Terminal werden die Pakete übergeben und sofort bezahlt. Kommt der Zubringer nach dem Annahmeschluss an, fliegen die Pakete mit dem nächsten Flug; sie kosten Lagergeld am Terminal (${rateEuro(AIR.storagePerParcel)} je Paket). Ist der Annahmeschluss vorbei und sind noch Pakete offen (im Hub, auf dem Zubringer oder noch nicht angekommen), fällt die Strafe einmal je Auftrag und Flug an, der Auftrag wird auf den nächsten Flug umgebucht. Vor der Abfahrt lässt sich ein Zubringer stornieren; die Pakete bleiben sortiert im Lager. Das Fenster zeigt die nächsten Flüge je Vertrag mit Countdown bis zum Annahmeschluss, bereitliegende Pakete (sortiert und unsortiert), laufende Zubringer mit Ankunft vor oder nach dem Annahmeschluss sowie Strafen und Lagergeld. Die Glocke warnt, wenn der Annahmeschluss in weniger als ${fmt(AIR_WARN)} Minuten erreicht ist und noch Luftpakete ohne Zubringer am Hub liegen, und meldet jeden verpassten Flug.`],
 ['Dispositionsassistent',`Der Assistent übernimmt auf Wunsch Routineentscheidungen eines Standorts. Ein- und Ausschalten über den Schalter „Assistent an/aus“ oben in der Kopfzeile (gilt für den aktiven Standort) oder im Fenster „Assistent“ (Taste J). Er nutzt nur reguläre Befehle, also dieselben Kosten, dasselbe Personal und dieselben Grenzen wie du, und prüft alle ${fmt(ASSIST_TICK)} Spielminuten: Zustellung starten, wenn ein Fahrzeug frei ist und die Frist in weniger als 3 Stunden endet oder eine volle Ladung möglich ist (mehrere dringende Kleinaufträge als Sammeltour), Luftzubringer rechtzeitig vor dem Annahmeschluss, einer Linie ohne Lkw einen freien Lkw zuordnen und fremde Lkw mit gefährdeter Frist am Tor vorziehen. Die Bereiche Zustellung, Linien und Tor lassen sich einzeln abschalten. Ein Tagesbudget begrenzt die Fahrtkosten seiner Fahrten; leer heißt: nur die Kasse begrenzt. Jede Entscheidung steht mit Uhrzeit, Art, Grund und Bezug im Protokoll; ein Klick auf den Bezug öffnet Fahrzeug, Auftrag, Linie oder Zubringer. Lehnt ein Befehl ab oder reichen Budget bzw. Kasse nicht, stellt er das Ziel eine Stunde zurück und die Glocke meldet es gebündelt je Standort. Kein KI-Dienst: feste, nachvollziehbare Regeln. Aus heißt: nur Standardregeln und deine Befehle.`],
 ['Kühlpakete und Sperrgut',`Warenarten kommen als eigenes Vertragsangebot (höchstens eines offen). Kühlpakete: nur mit Kühllager am Standort oder Forschung Kühlkettenlogistik; der Preis enthält einen Kühlzuschlag je Paket. Entladen nur in freie Kühlplätze (sonst Wartegrund „${esc(YARD_WAIT.coldMissing)}“ bzw. „${esc(YARD_WAIT.coldFull)}“), Sortierung nur mit Kühllager, Zustellung nur mit Kühlfahrzeug. Die Station „Kühlpakete“ im Standortfluss zeigt Eingang und Kühllager. Sperrgut (ab Tag ${fmt(TERMS.ware?.bulky?.fromDay??3)} oder mit Staplerplatz): nie über Sortierer, Entladen mit Stapler und Lagerkraft direkt ins Lager; Lieferwagen fassen nur wenige Stück, Lkw bevorzugt.`],
 ['Quergurtsorter (Mega-Hub)',`Nach der Forschung „Mega-Hub“ lässt sich der Quergurtsorter bauen (vorher im Baumenü gesperrt). Er sortiert ${fmt(BUILDINGS.crossbelt?.throughput??2400)} Pakete je Stunde mit zwei Lagerkräften; mit einer Kraft halbe Leistung. Jedes 100. Paket ist ein Fehlwurf und wird von Hand nachsortiert. Die Akte zeigt Besetzung, Fehlwürfe heute und gesamt sowie die offene Nachsortierung.`],
 ['GuV und Anlagen',`Unternehmensrechnung, Tab „GuV & Anlagen“: Ergebnisrechnung für heute, 7 Tage oder gesamt aus den echten Buchungen plus Abschreibung. Gebäude werden über 180, gekaufte Fahrzeuge über 90 Spieltage linear abgeschrieben. Abschreibung und Anlagenabgang beim Abriss mindern nur das Ergebnis, sie bewegen kein Geld. Der Anlagenspiegel zeigt Anschaffung, kumulierte Abschreibung und Buchwert je Anlage sowie die Abgänge.`],
 ['Wetter und Störungen',`Ab Spieltag 2 hat jeder Standort ein Tageswetter: Regen, Nebel, Schnee und Sturm verlängern eigene Fahrten und verspäten fremde Lkw (Fristen bleiben). Dazu kommen seltene Störungen: Stau auf einem Gebiet oder einer Linie, Torstörung (Torkontrolle steht) und Netzstörung (ohne eigene Energieversorgung stehen Fertigung und Sortierung, Kühlung hat Vorrang). Kopfzeile, Station und Fenster „Wetter & Störungen“ zeigen Wirkung und Restdauer. Abschalten: Einstellungen → Störungen.`],
 ['Staplerfahrer und Torposten',`Spezialisten arbeiten in ihrer Tätigkeit 25 % schneller: Staplerfahrer beim Paletten- und Sperrgutumschlag, Torposten an der Torkontrolle. Sie sortieren keine Pakete. Fehlt ein Spezialist, springt eine Lagerkraft ein.`],
 ['Kundendienst und Zufriedenheit',`Verspätung, drohende Verspätung, Teillieferung und Störungsverzug erzeugen automatisch Anliegen mit Antwortfrist. Kundenservice-Personal bearbeitet sie. Pünktliche Zustellung und Kulanz heben die Zufriedenheit des Versenders, Verspätung, Strafen und ignorierte Anliegen senken sie. Zufriedene Versender bieten öfter und besser bezahlte Verträge an.`],
 ['Material und Maschinen','Gehäuse + Platine → montierte Leuchte. Prüfstation → geprüfte Leuchte. Packstation + Karton → verkaufbare Leuchte. Anlagen wählen automatisch ihren ersten Arbeitsplan. Jedes Stück benötigt Arbeitszeit, Personal und Strom.'],
 ['Warum wartet mein Betrieb?','Material fehlt: Einkauf und Wareneingang prüfen. Personal fehlt: Rolle, Schicht und andere Tätigkeiten prüfen. Ausgang blockiert: Lager erweitern oder Ware ausliefern. Energie fehlt: Versorgung ausbauen. Gebäude anklicken für Details.'],
 ['Schichten und Zeit','Tagschicht: 08 bis 16 Uhr. Nachtschicht: 16 bis 08 Uhr. Durchgehend ist eine vereinfachte Spieloption mit Müdigkeit. Zeitraffer steuert nur Spielgeschwindigkeit. Hintergrund und geschlossene Seite erzeugen keinen Fortschritt.'],
 ['Bauen und Wege','Baumodus mit B öffnen. Anlage wählen und Rasterfläche anklicken. R dreht gewählte Anlage. Wege vom Wareneingang müssen zu allen Anlagen offen bleiben. Laufende Arbeitsvorgänge verhindern Abriss. Leere Anlage kann über ihre Akte versetzt werden.'],
 ['Lager, Ladung und Zahlung','Reservierte Ware ist für andere Aufträge gesperrt. Eine Lieferung darf vorhandene Ware und Ladeplätze nicht überschreiten. Nach Zustellung entsteht Forderung; Zahlung kommt später. Jeder Geldeingang besitzt genau einen Buchungsschlüssel.'],
 ['HTML-Datei speichern','In Einstellungen: Spiel als HTML speichern. Download enthält vollständiges Spiel und aktuellen Spielstand. Datei öffnen, Betrieb mit 1× fortsetzen. Weiteren Fortschritt erneut als HTML herunterladen; Originaldatei wird nicht automatisch überschrieben.'],
 ['Speichern und Sicherung','Auf der Website: Automatische Sicherung alle 20 Sekunden sowie beim Verlassen. Derselbe Modus besitzt nur einen schreibenden Tab; weitere Tabs bleiben pausiert. Modus laden in Einstellungen erhält vorhandene Unternehmen. Nach Laden oder Neugründung startet Betrieb pausiert: 1× drücken. Jeder Spielmodus besitzt eigenen Speicherplatz und letzte Sicherung. Exportiere JSON regelmäßig für geräteunabhängige Aufbewahrung. Import wird vor Übernahme geprüft.'],
 ['Steuerung und Zugänglichkeit','Esc oder Rechtsklick: Abbrechen (Baumodus, Fenster, Auswahl; im Eingabefeld bleibt das Browsermenü). /: Suche nach Anlagen, Fahrzeugen, Kennzeichen, Verträgen, Aufträgen und Beschäftigten; Pfeiltasten und Eingabe öffnen die Akte. Glocke: aktuelle Wartegründe und Warnungen. Standortfluss und Fahrzeugleiste lassen sich einklappen; ▢ blendet alle Panels aus. Leertaste: Pause. X: Luftexport. J: Dispositionsassistent. Z oder Uhr-Knopf: Replay der letzten 60 Spielminuten (nur Ansicht, Simulation pausiert; Esc, Rechtsklick oder „Live“ kehrt zurück). B: Bauen. R: Bauobjekt drehen. Escape: Fenster schließen. Ziehen: Kamera bewegen. Mausrad: Zoom. Grundriss liefert ebene Ersatzansicht. Alle Anlagen auch über Fertigungstabelle auswählen. Schrift und Bewegung in Einstellungen.'],
 ['Darstellung und Umfang','Die aktuelle räumliche Ansicht verwendet lokal gezeichnete Canvas-Isometrie. Sie benötigt kein WebGL. Phasenstatus und konkrete Grenzen sind in der ausgelieferten Dokumentation nachgehalten.']
 ].map(([h,t])=>`<details><summary>${h}</summary><p>${t}</p></details>`).join('')}`;}
function backupNotice(){if(portableMode||temporary)return '';const key=STORE+'-'+recoveryMode();let prev=false;try{prev=store.has(key+'-backup-prev');}catch{}
 if(prev){const t=previousTime(key);return `<div class="notice">Sicherung des vorherigen Unternehmens${typeof t==='number'?' ('+esc(time(t))+')':''} bleibt erhalten (eigener Platz). Der aktuelle Stand hat seine eigene laufende Sicherung.</div>${started?`<div class="actions">${button('Vorheriges Unternehmen laden','loadPrevious')}${button('Alte Sicherung verwerfen','discardBackup','','danger')}</div>`:''}`;}
 const meta=holdMeta(key);if(!meta)return '';return `<div class="notice">Sicherung des vorherigen Unternehmens${typeof meta.t==='number'?' ('+esc(time(meta.t))+')':''} bleibt erhalten. Bis zum Verwerfen erhält der aktuelle Stand keine eigene Sicherung.</div>${started?`<div class="actions">${button('Alte Sicherung verwerfen','discardBackup','','danger')}</div>`:''}`;}
function settings(){return `<section class="section"><h3>Spielstand</h3><p class="fine">HTML-Download enthält Spiel und aktuellen Stand. Datei im Browser öffnen, dann 1× drücken. Für späteren Fortschritt erneut als HTML speichern. Keine Installation nötig.</p>${temporary?`<div class="notice">${temporaryMessage}</div>`:''}${!portableMode?`<div class="actions">${button('Speicher erneut prüfen','retryStorage')}${!temporary?button('Ohne lokale Speicherung spielen','temporary'):''}</div>`:''}${!writable&&!temporary?`<div class="notice">${esc(lockMessage())}</div>`:''}${!portableMode?`<form data-form="loadMode" class="form-grid">${field('Gespeichertes Unternehmen','<select name="mode"><option value="guided">Geführter Einstieg</option><option value="economy">Wirtschaftsbetrieb</option><option value="sandbox">Freies Bauen</option></select>')}<button>Modus laden</button></form>`:''}<p class="fine">Version ${VERSION}. Vollständiger Funktionsstatus und Quellcode im Download.</p>${!portableMode?'<p style="margin:10px 0"><a href="./Industrie-Logistik.zip" download>Spielpaket & Quellcode herunterladen ↗</a></p>':''}<p class="fine" style="margin-top:8px">Aktiver Modus: ${V().state.mode==='guided'?'Geführter Einstieg':V().state.mode==='sandbox'?'Freies Bauen':'Wirtschaftsbetrieb'}</p><div class="actions">${button('Spiel als HTML speichern','exportHtml','','primary')}${!portableMode?button('Im Browser speichern','save'):''}${button('JSON exportieren','export')}${button('JSON importieren','import')}${!portableMode&&backupAvailable(recoveryMode())?button('Letzte Sicherung laden','backup'):''}</div>${backupNotice()}</section><section class="section"><h3>Darstellung</h3><div class="list-row"><span><strong>Farbschema</strong><small>Automatisch folgt dem Betriebssystem${THEMES[prefs.theme]&&prefs.theme!=='auto'?'':' (aktuell '+THEMES[resolvedTheme()]+')'}</small></span><select data-setting="theme" aria-label="Farbschema">${Object.entries(THEMES).map(([k,v])=>`<option value="${k}" ${(THEMES[prefs.theme]?prefs.theme:'auto')===k?'selected':''}>${v}</option>`).join('')}</select></div>${typeof scene.setQuality==='function'?`<div class="list-row"><span><strong>Grafikqualität</strong><small>Automatisch passt Auflösung und Details an die gemessene Bildrate an${prefs.quality==='auto'&&scene.quality?' (aktuell '+esc(scene.quality().name||'')+')':''}</small></span><select data-setting="quality" aria-label="Grafikqualität">${Object.entries(QUALITY_PREFS).map(([k,v])=>`<option value="${k}" ${qualityPref()===k?'selected':''}>${v}</option>`).join('')}</select></div>`:''}<div class="list-row"><span>Größere Schrift</span><input type="checkbox" data-pref="large" ${prefs.large?'checked':''} aria-label="Größere Schrift"></div><div class="list-row"><span>Bewegung reduzieren</span><input type="checkbox" data-pref="reduced" ${prefs.reduced?'checked':''} aria-label="Bewegung reduzieren"></div><div class="list-row"><span><strong>Wetter &amp; Störungen</strong><small>Stau, Torstörung, Netzstörung und Wetter ab Spieltag 2 · gilt für diesen Spielstand</small></span><input type="checkbox" data-setting="incidents" ${V().state.settings?.incidents===false?'':'checked'} aria-label="Wetter und Störungen"></div><div class="list-row"><span>Einstiegshinweise</span><input type="checkbox" data-pref="mission" ${prefs.mission?'checked':''} aria-label="Einstiegshinweise"></div></section><section class="section"><h3>Unternehmen</h3><div class="actions">${button('Neues Unternehmen','new','','danger')}${button('Handbuch','panel-help')}</div><p class="fine" style="margin-top:10px">Neustart erfolgt erst nach Bestätigung. Vorheriger Stand kann exportiert werden.</p></section><div class="notice">Browserprüfung dieser Veröffentlichung noch offen. Fachliche Simulation wird automatisiert geprüft.</div>`;}
function confirm(title,text,action){$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;confirmAction=action;$('#confirm').showModal();}
// Depot-Grundausstattung (A02 W1b): nur reguläre Befehle; bereits Vorhandenes wird nicht doppelt gekauft. Bricht bei fehlendem Kapital ab.
function starter(){const s=V().state,site=s.selectedSite;for(const [buildingType,x,y]of [['dock',3,11],['rack',2,2]])if(!s.buildings.some(b=>b.type===buildingType&&b.site===site)){if(!send({type:'build',buildingType,x,y,rotation:0},true).ok)return;}for(const role of ['warehouse','driver'])if(!s.workers.some(w=>w.role===role&&w.site===site)&&!send({type:'hire',role},true).ok)return;if(!s.vehicles.some(v=>v.site===site&&v.status!=='rentalReturned')&&!send({type:'buyVehicle',vehicleType:'van'},true).ok)return;toast('Depot eingerichtet. Nächster Schritt: ersten Frachtvertrag annehmen.');openPanel('contracts');}
document.addEventListener('click',e=>{if(!e.target.closest?.('.cmd,.site-pick,.bell-wrap'))closeMenus();const b=e.target.closest('button,a.brand');if(!b)return;if(b.matches('a.brand')){e.preventDefault();openPanel('overview');return;}if(b.dataset.panel){closeMenus();openPanel(b.dataset.panel);return;}if(b.dataset.toggle){hudToggle(b.dataset.toggle);return;}if(b.dataset.vbarTab){vbarTab(b.dataset.vbarTab);return;}if(b.dataset.order){openOrder(b.dataset.order);return;}if(b.dataset.site){closeMenus();if(b.dataset.site!==V().state.selectedSite){send({type:'selectSite',id:b.dataset.site},true);scene.home();}return;}if(b.dataset.hit){openHit(b.dataset.hit);return;}if(b.dataset.command!==undefined){runHit(cmdHits[+b.dataset.command]);return;}if(b.dataset.alert){const a=hudData?.alerts.find(x=>x.key===b.dataset.alert);if(a)openRef(a.ref,a.target);return;}if(b.dataset.station){openStation(b.dataset.station);return;}if(b.dataset.vehicle){openRef(b.dataset.vehicle);return;}if(b.dataset.arrival){openArrival(b.dataset.arrival);return;}if(b.dataset.labels){setLabelMode(b.dataset.labels);return;}if(b.dataset.speed!==undefined){setSpeed(+b.dataset.speed);return;}if(b.dataset.view){setView(b.dataset.view);return;}if(b.dataset.camera){({plus:()=>scene.zoom(1),minus:()=>scene.zoom(-1),rotate:()=>scene.rotate(1),home:()=>scene.home(),follow:followSelected,tour:startTour})[b.dataset.camera]?.();return;}if(b.dataset.build){const lock=buildLock(V().state,b.dataset.build);if(lock){toast(`${name(BUILDINGS,b.dataset.build)}: ${lock}. Forschung unter „Forschung & Produkte“ starten.`,true);return;}build=b.dataset.build;scene.setBuild(build,rotation,moving);renderBuild();return;}const a=b.dataset.action,id=b.dataset.id;if(!a)return;if(a.startsWith('panel-')){openPanel(a.slice(6));return;}if(STOCK_ACTIONS.has(a)){const r=stockAction(a,id);if(r?.buy){buyDraft={...r.buy,supplier:'standard',hint:`Vorschlag aus dem Lager: ${fmt(r.buy.qty)} × ${name(ITEMS,r.buy.item)} (Fehlmenge abzüglich bereits bestellter Menge). Menge und Lieferant anpassbar; gekauft wird erst mit „Verbindlich bestellen“.`};openPanel('purchasing');}else if(r)renderPanel(true);return;}if(ORDER_ACTIONS.has(a)){if(ordersAction(a,id))renderPanel(true);return;}
 const actions={openGuv:()=>openFinance('guv'),financeTab:()=>{financeTab=FIN_TABS[id]?id:'cash';renderPanel(true);},guvPeriod:()=>{guvPeriod=GUV_PERIODS[id]?id:'week';renderPanel(true);},replay:()=>replayToggle(),replayPlay:()=>replayPlay(),replayLive:()=>replayLive(),'ticket-inform':()=>ticketRespond(id,'inform'),'ticket-approve':()=>ticketRespond(id,'approve'),'ticket-reject':()=>ticketRespond(id,'reject'),'ticket-goodwill':()=>ticketRespond(id,'goodwill'),'ticket-apologize':()=>ticketRespond(id,'apologize'),exportHtml,retryStorage,temporary:chooseTemporary,returnRental:()=>confirm('Mietfahrzeug zurückgeben?','Rückgabe beendet weitere Mietkosten. Angebrochene Miettage werden nicht erstattet. Fahrzeug muss leer und frei am Mietstandort stehen.',()=>send({type:'returnRental',id})),cancelTour:()=>send({type:'cancelTour',id}),disposeBatch:()=>confirm('Geschädigte Ware entsorgen?','Entsorgung kostet 2 € je Stück. Ware wird endgültig entfernt.',()=>send({type:'disposeBatch',batchId:id})),approveDocuments:()=>send({type:'approveDocuments',id}),cancelFreight:()=>confirm('Fracht stornieren?','Bereits gezahlte Fracht verfällt. Ware kehrt nur bei freier Lagerkapazität zurück.',()=>send({type:'cancelFreight',id})),recallBatch:()=>confirm('Charge zurückrufen?','Betroffene Charge und ihre nachverfolgbaren Nachfolger werden gesperrt. Bereits gelieferte Ware wird im Rückruf erfasst.',()=>send({type:'recallBatch',batchId:id})),acceptContract:()=>hubSend({type:'acceptContract',id},'Vertragsannahme'),newLine:()=>newLine(id),editLine:()=>{lineEdit=id;lineDraft={};hubFocus=id;renderPanel(true);},cancelLineEdit:()=>{lineEdit=null;lineDraft={};renderPanel(true);},toggleLine:()=>{const l=(V().state.lines||[]).find(x=>x.id===id);if(l)send({type:'updateLine',id,active:!l.active});},deleteLine:()=>{const l=(V().state.lines||[]).find(x=>x.id===id);if(l)confirm('Linie löschen?',`${lineTitle(V().state,l)}: Fahrplan und Lkw-Zuordnung entfallen. Sendungen bleiben am Standort liegen, bis eine neue Linie fährt.`,()=>{const r=send({type:'deleteLine',id});if(r.ok&&lineEdit===id)lineEdit=null;return r;});},cancelLinehaul:()=>confirm('Linienfahrt stornieren?','Reservierung, Dock und Personal werden frei. Sendungen bleiben am Startstandort und fahren mit der nächsten Abfahrt.',()=>send({type:'cancelLinehaul',id})),cancelContract:()=>cancelContract(id),prioritizeArrival:()=>hubSend({type:'prioritizeArrival',id},'Vorziehen'),unstuffContainer:()=>hubSend({type:'unstuffContainer',id},'Container vorziehen'),assistToggle,assistSwitch:()=>assistSwitch(id),cancelAirShuttle:()=>confirm('Luftzubringer stornieren?','Reservierung, Dock und Personal werden frei. Die Pakete bleiben sortiert im Lager und können mit einem neuen Zubringer fahren.',()=>send({type:'cancelAirShuttle',id})),openRef:()=>openRef(id),close:closePanel,refresh:()=>renderPanel(true),build:()=>startBuild(BUILDINGS[id]?id:undefined),endBuild,rotateBuild:()=>{rotation=(rotation+90)%360;scene.setBuild(build,rotation,moving);toast('Anlage gedreht: '+rotation+'°');},select:()=>{if((V().state.airShuttles||[]).some(x=>x.id===id)){openPanel('air',id);return;}selected=id;openPanel('detail');scene.focus?.(id);},toggle:()=>send({type:'toggleBuilding',id}),maintain:()=>send({type:'maintain',id}),move:()=>{const o=V().state.buildings.find(b=>b.id===id);if(o&&!replayBlocked('Versetzen')){moving=id;rotation=o.rotation;startBuild(o.type);toast('Neue Position auf Karte wählen.');}},demolish:()=>confirm('Anlage zurückbauen?','Rückbau gibt 35 % Anschaffungskosten zurück. Belegte Anlagen bleiben geschützt.',()=>send({type:'demolish',id})),accept:()=>send({type:'acceptOrder',id}),cancelOrder:()=>confirm('Auftrag stornieren?','Unvollständige Aufträge senken Reputation.',()=>send({type:'cancelOrder',id})),cancelShipment:()=>send({type:'cancelShipment',id}),train:()=>send({type:'train',id}),fire:()=>confirm('Person entlassen?','Aktive Tätigkeit muss vorher abgeschlossen werden.',()=>send({type:'fire',id})),vehicleMaintain:()=>send({type:'maintainVehicle',id}),vehicleServiceExternal:()=>{const v=V().state.vehicles.find(v=>v.id===id);if(v)confirm('Externe Wartung beauftragen?',`${v.name}: ${euro(maintenanceCost(v,true))}, ${fmt(EXTERNAL_SERVICE.minutes)} Spielminuten außer Betrieb. Ohne eigene Werkstatt, Ersatzteil und Technikpersonal.`,()=>send({type:'serviceVehicleExternal',id}));},research:()=>send({type:'startResearch',key:id}),toggleRule:()=>send({type:'toggleRule',id}),deleteRule:()=>send({type:'deleteRule',id}),site:()=>{send({type:'selectSite',id});scene.home();closePanel();},networkView:()=>{scene.setView('network');closePanel();},repairReturn:()=>send({type:'resolveReturn',id,resolution:'repair'}),recycleReturn:()=>send({type:'resolveReturn',id,resolution:'recycle'}),starter, 'buy-kit':()=>{for(const item of ['housing','board','carton'])if(!send({type:'buy',item,qty:12,supplier:'standard'},true).ok)return;toast('Drei getrennte Materiallieferungen bestellt.');},save:()=>save(true),export:()=>{const blob=new Blob([sim.serialize()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Industrie-Logistik-Tag-${Math.floor(sim.state.t/1440)+1}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},import:()=>$('#importFile').click(),backup:loadBackup,welcomeBackup:loadBackup,discardBackup,loadPrevious,new:()=>confirm('Neues Unternehmen?','Vorherigen Spielstand bei Bedarf zuerst exportieren. Moduswahl öffnet sich danach.',()=>{showWelcome();setSpeed(0);}),hideMission:()=>{prefs.mission=false;applyPrefs();},start:()=>{const mode=$('input[name=mode]:checked').value;if(temporary)return confirm('Temporäres Unternehmen ersetzen?','Aktuellen Stand vorher als JSON exportieren.',()=>activate(mode,{reset:true}));let existing,prevExists=false;try{existing=store.has(STORE+'-'+mode);prevExists=store.has(STORE+'-'+mode+'-backup-prev');}catch{toast(lockMessage(),true);return false;}if(existing){confirm('Vorhandenen Spielstand ersetzen?','Dieser Modus besitzt bereits ein Unternehmen. Vorher bei Bedarf laden und exportieren. Letzte gültige Sicherung bleibt erhalten (eigener Platz „vorheriges Unternehmen“), bis du sie in den Einstellungen verwirfst.'+(prevExists?' Eine dort liegende ältere Sicherung wird dabei ersetzt.':''),()=>activate(mode,{reset:true}));return;}return activate(mode,{reset:true});},confirmCancel:()=>$('#confirm').close(),keys:showKeys,keysClose:()=>$('#keys').close(),confirmOk:()=>{$('#confirm').close();const fn=confirmAction;confirmAction=null;return fn?.();}};return actions[a]?.();});
document.addEventListener('change',e=>{const t=e.target;{const bf=t.closest?.('[data-form="buy"]');if(bf)syncBuyForm(bf);}if(t.closest?.('[data-form="tour"]'))updateTourDraft(t.closest('[data-form="tour"]'));if(t.name==='from'&&t.closest?.('[data-form="line"]')){lineDraft=Object.fromEntries(new FormData(t.closest('[data-form="line"]')));lineDraft.vehicleId='';renderPanel(true);return;}if(t.closest?.('[data-form="air"]')){airDraft=Object.fromEntries(new FormData(t.closest('[data-form="air"]')));renderPanel(true);return;}if(t.name==='vehicleId'&&t.closest?.('[data-form="dispatch"]'))syncDispatchQty(t.closest('[data-form="dispatch"]'));if(t.dataset.relocate&&t.value)send({type:'moveWorker',id:t.dataset.relocate,toSite:t.value});if(t.dataset.shift)send({type:'setShift',id:t.dataset.shift,shift:t.value});if(t.dataset.recipe)send({type:'setRecipe',id:t.dataset.recipe,recipe:t.value});if(t.dataset.setting==='theme'){setTheme(t.value);return;}if(t.dataset.setting==='quality'){setQuality(t.value);return;}if(t.dataset.setting==='incidents'){send({type:'settings',incidents:!!t.checked});renderPanel(true);return;}if(t.closest?.('[data-form="line"]')&&['to','vehicleId','departures'].includes(t.name)){lineDraft=Object.fromEntries(new FormData(t.closest('[data-form="line"]')));renderPanel(true);return;}if(t.dataset.pref){prefs[t.dataset.pref]=t.checked;applyPrefs();dirty=true;try{if(!temporary)localStorage.setItem(prefsKey,JSON.stringify({...prefs,mode:V().state.mode}));}catch{}}});
document.addEventListener('input',e=>{const f=e.target.closest?.('[data-form="tour"]');if(f)updateTourDraft(f);const bf=e.target.closest?.('[data-form="buy"]');if(bf)syncBuyForm(bf);});
$('#search').addEventListener('input',e=>{search=e.target.value.toLowerCase();renderPanel();});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-form]');if(!f)return;e.preventDefault();const d=Object.fromEntries(new FormData(f));const t=f.dataset.form;for(const k of ['qty','threshold','budget','cooldown','minutes','amount','qty1','qty2','qty3','priority','extensionMinutes'])if(k in d)d[k]=Number(d[k]);const commands={ticket:{type:'createTicket',...d},rental:{type:'rentVehicle',vehicleType:d.vehicleType,site:V().state.selectedSite},freight:{type:'bookFreight',...d},tour:tourCommand(d),loan:{type:d.operation,amount:d.amount},buy:{type:'buy',...d},hire:{type:'hire',...d},vehicle:{type:'buyVehicle',...d},dispatch:{type:'dispatch',orderId:f.dataset.id,...d},rule:{type:'addRule',kind:'reorder',...d},site:{type:'buySite',...d},transfer:{type:'transfer',...d},return:{type:'createReturn',...d}};if(t==='loadMode'){return activate(d.mode);}if(t==='line'){lineSubmit(d,f.dataset.id);return;}if(t==='air'){airSubmit(d);return;}if(t==='assistBudget'){assistBudget(d);return;}if(t==='forecast'){if(replayBlocked('Planungsvorschau'))return;try{forecast=sim.forecast(d.minutes,d.alternative==='worker'?[{type:'hire',role:'production'}]:[]);renderPanel();toast('Vorschau berechnet. Echter Betrieb unverändert.');}catch(err){toast(err.message,true);}}else{const result=send(commands[t]);if(t==='tour'&&result.ok)tourDraft={};if(t==='buy'&&result.ok)buyDraft=null;renderPanel();}});
$('#importFile').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>30000000)throw Error('Datei zu groß.');const candidate=Simulation.fromJSON(await file.text());confirm('Spielstand importieren?',`${time(candidate.state.t)} · ${euro(candidate.state.money)} · ${candidate.state.buildings.length} Anlagen. Aktuellen Stand ersetzen?`,()=>activate(candidate.state.mode,{candidate}));}catch(err){toast(err.message,true);}});
/* Tastenkürzel (A10, 0.11, abgenommen). Nie in Eingabefeldern oder offenen Dialogen; Strg/Alt/Meta bleiben dem Browser.
 * Jedes Kürzel ruft denselben Pfad wie der zugehörige Schalter auf. F/T nur, wenn die Szene follow()/tour() anbietet. */
const KEYS=[['/','Suche und Befehle'],['Leertaste','Pause / Fortsetzen'],['1 · 2 · 3 · 4','Tempo 1×, 4×, 12×, Pause'],['B','Baumodus'],['R','Anlage drehen (im Baumodus)'],['Esc · Rechtsklick','Abbrechen'],['H','Hof & Docks'],['V','Frachtverträge'],['N','Linienverkehr'],['C','Containerhof'],['X','Luftexport'],['J','Dispositionsassistent'],['L','Beschriftungen durchschalten',()=>typeof scene.setLabels==='function'],['P','Nur Szene (Panels aus/ein)'],['F','Ausgewähltes Fahrzeug verfolgen',()=>typeof scene.follow==='function'],['T','Kamerarundgang',()=>typeof scene.tour==='function'],['W · A · S · D · ← ↑ ↓ →','Kamera verschieben (auch im Baumodus)'],['Q · E','Kamera drehen'],['+ · −','Zoom'],['Pos1','Ansicht zurücksetzen'],['Z','Replay: letzte 60 Spielminuten'],['?','Diese Übersicht']];
function showKeys(){closeMenus();$('#keysList').innerHTML=KEYS.filter(k=>!k[2]||k[2]()).map(([k,t])=>`<div class="keys-row"><dt>${k.split(' · ').map(x=>`<kbd>${esc(x)}</kbd>`).join('<span class="keys-or">/</span>')}</dt><dd>${esc(t)}</dd></div>`).join('');$('#keys').showModal();}
const SPEED_KEYS={'1':1,'2':4,'3':12,'4':0};
function togglePanel(p){if(panel===p)closePanel();else openPanel(p);}
function onKey(e){if(e.target.matches('input,select,textarea,[contenteditable="true"]')||$('dialog[open]'))return;if(e.ctrlKey||e.metaKey||e.altKey)return;
 const k=e.key,lk=typeof k==='string'&&k.length===1?k.toLowerCase():k;
 if(k==='/'){e.preventDefault();closeMenus();$('#cmd').focus?.();return;}
 if(rp&&replayKey(e,k,lk))return;
 if(panKeyDown(e,lk))return;
 if(e.code==='Space'||k===' '){e.preventDefault();setSpeed(speed?0:lastSpeed);return;}
 if(k==='Escape'&&camAtKey)return;
 if(lk==='t'&&(camAtKey==='tour'||camAtKey?.mode==='tour'))return;
 if(k==='Escape'){if(menuOpen('siteMenu')||menuOpen('bellMenu')||menuOpen('cmdResults')){closeMenus();return;}endBuild();closePanel();return;}
 if(k in SPEED_KEYS){setSpeed(SPEED_KEYS[k]);return;}
 const acts={b:()=>startBuild(),r:()=>{if($('#buildTray').hidden)return false;rotation=(rotation+90)%360;scene.setBuild(build,rotation,moving);},h:()=>togglePanel('yard'),v:()=>togglePanel('contracts'),n:()=>togglePanel('lines'),c:()=>togglePanel('containers'),x:()=>togglePanel('air'),j:()=>togglePanel('assistant'),z:()=>replayToggle(),
  l:()=>{const order=['all','fleet','infra','none'],m=order[(order.indexOf(labelMode)+1)%order.length];if(!setLabelMode(m))return false;toast('Beschriftung: '+LABEL_NAMES[m]+'.');},p:()=>hudToggle('scene'),
  f:()=>typeof scene.follow==='function'?followSelected():false,t:()=>startTour(),q:()=>scene.rotate(-1),e:()=>scene.rotate(1),'+':()=>scene.zoom(1),'=':()=>scene.zoom(1),'-':()=>scene.zoom(-1),'−':()=>scene.zoom(-1),Home:()=>scene.home(),'?':()=>showKeys()};
 const fn=acts[lk];if(!fn)return;if(fn()!==false)e.preventDefault?.();}
// Kameramodus vor dem Szenen-Listener merken: Esc/T beenden dann nur Rundgang bzw. Verfolgen.
let camAtKey=null;document.addEventListener('keydown',()=>{camAtKey=scene?.cameraMode?.()||null;},true);
document.addEventListener('keydown',onKey);
/* Kamera verschieben mit WASD/Pfeiltasten (0.17, A10-W): auch im Baumodus (Bauobjekt und Vorschau bleiben, Tasten platzieren nie),
 * nicht bei Texteingabe (onKey kehrt dort vorher zurück). Gehaltene Tasten bewegen je Bildschirmbild gleichmäßig (Zeit, nicht Bildrate);
 * Loslassen, Fokusverlust, verdeckter Tab oder Fokus in einem Eingabefeld beenden die Bewegung sofort. Rein darstellend. */
const PAN_DIRS={w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1],a:[-1,0],arrowleft:[-1,0],d:[1,0],arrowright:[1,0]};
const PAN_CODES={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d'};
const panHeld=new Set();let panFrame=0,panLast=0;
const panName=(e,lk)=>{const c=PAN_CODES[e.code];if(c)return c;const n=typeof lk==='string'?lk.toLowerCase():'';return n in PAN_DIRS?n:'';};
function panKeyDown(e,lk){const n=panName(e,lk);if(!n)return false;if(n.startsWith('arrow')&&e.target?.closest?.('#panel,.dropdown,.rail-flyout,[role=listbox],[role=menu]'))return false;e.preventDefault?.();if(!panHeld.has(n)){panHeld.add(n);if(scene?.cameraMode?.()?.mode==='follow')scene.follow?.(null);panStart();}return true;}
function panStart(){if(panFrame||typeof requestAnimationFrame!=='function')return;panLast=performance.now();panFrame=requestAnimationFrame(panStep);}
function panStop(){panHeld.clear();if(panFrame&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(panFrame);panFrame=0;}
function panStep(now){panFrame=0;if(!panHeld.size)return;const dt=Math.min(.1,Math.max(0,(now-panLast)/1000));panLast=now;let x=0,y=0;for(const n of panHeld){x+=PAN_DIRS[n][0];y+=PAN_DIRS[n][1];}
 const len=Math.hypot(x,y);if(len&&dt){x/=len;y/=len;if(typeof scene.panBy==='function')scene.panBy(x,y,dt);else if(scene.pan){const v=520*dt;scene.pan.x-=x*v;scene.pan.y+=y*v;scene.dirty=true;}}
 panFrame=requestAnimationFrame(panStep);}
document.addEventListener('keyup',e=>{const n=panName(e,typeof e.key==='string'&&e.key.length===1?e.key.toLowerCase():e.key);if(n){panHeld.delete(n);if(!panHeld.size)panStop();}});
window.addEventListener('blur',panStop);
document.addEventListener('focusin',e=>{if(e.target?.matches?.('input,select,textarea,[contenteditable="true"]'))panStop();});
if(typeof initRail==='function')try{initRail();}catch{/* DOM-Ersatz in Prüfumgebungen */}
// Rechtsklick ohne Ziehen bricht schrittweise ab wie Esc: Menü → Bau/Versetzen → Fenster → Auswahl. Browsermenü nur in Eingabefeldern und Dialogen.
let rightDown=null;
const nativeMenu=t=>!!t.closest?.('input,select,textarea,[contenteditable="true"],dialog[open]');
function cancelByContext(){if(menuOpen('siteMenu')||menuOpen('bellMenu')){closeMenus();return true;}if(rp){replayLive();return true;}if(build||moving||!$('#buildTray').hidden){endBuild();return true;}if(!$('#panel').hidden){closePanel();return true;}if(selected){selected=null;if(scene&&'selected' in scene)scene.selected=null;scene?.setState?.(V().state);render(true);return true;}return false;}
// Abbruch erst beim Loslassen: Linux meldet contextmenu schon beim Drücken, Windows beim Loslassen.
document.addEventListener('pointerdown',e=>{rightDown=e.button===2&&!nativeMenu(e.target)?{x:e.clientX,y:e.clientY}:null;},true);
document.addEventListener('pointerup',e=>{if(e.button!==2||!rightDown)return;const d=rightDown;rightDown=null;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5)return;cancelByContext();},true);
// Browsermenü im gesamten Spielbereich unterdrücken (Erfassungsphase, damit es auch ohne Fenster und bei gestoppter Weitergabe gilt).
// Rechte/mittlere Taste lösen dort keine Browseraktion aus (Auswahl, Autoscroll); Textfelder behalten ihr Menü.
document.addEventListener('contextmenu',e=>{if(!nativeMenu(e.target))e.preventDefault();},true);
document.addEventListener('mousedown',e=>{if((e.button===1||e.button===2)&&!nativeMenu(e.target))e.preventDefault();},true);
document.addEventListener('auxclick',e=>{if(e.button!==0&&!nativeMenu(e.target))e.preventDefault();},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)panStop();accumulator=0;lastTick=performance.now();if(document.hidden&&started)leaveSave();render();});
window.addEventListener('beforeunload',e=>{if(!started)return;if(temporary?dirty:leaveSave()!=='saved'){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>guard.release());
window.addEventListener('pageshow',e=>{if(e.persisted){writable=false;speed=0;toast('Ansicht wiederhergestellt. Für sicheres Fortsetzen Seite neu laden.',true);render();}});
// Messanzeige nur mit ?perf=1 (perf-overlay.js); sonst null und kein Messpfad im Takt.
const perf=typeof startPerfOverlay==='function'?startPerfOverlay({scene,speed:()=>speed}):null;
setInterval(()=>{const now=performance.now(),dt=Math.min(1000,now-lastTick);lastTick=now;if(rp){replayTick(dt);return;}if(!started||switching||document.hidden||$('dialog[open]')||!speed||!canWrite()){accumulator=0;scene.setClock?.(sim.state.t);return;}accumulator+=dt*speed;const n=Math.floor(accumulator/1000);if(n){accumulator-=n*1000;try{const p0=perf&&performance.now();sim.step(n);if(perf)perf.sim(performance.now()-p0,n);dirty=true;render();replayCapture();}catch(e){setSpeed(0);toast('Simulation angehalten: '+e.message,true);}}scene.setClock?.(sim.state.t+accumulator/1000);},100);
// Autosave im Leerlauf; Verlassen (visibilitychange/beforeunload) speichert sofort (localStorage synchron; IndexedDB: Transaktion sofort + Notfall-Kopie).
let idleSave=0;
function requestIdleSave(){if(idleSave)return;const run=()=>{idleSave=0;if(started&&dirty)save();};idleSave=typeof requestIdleCallback==='function'?requestIdleCallback(run,{timeout:5000}):setTimeout(run,0);}
setInterval(()=>{if(started&&dirty)requestIdleSave();},20000);
/* ---- Replay 60 Min. (A12/A10, W3c-S3) ----
 * Ringpuffer (replay.js) nimmt jede 5. Spielminute sim.serialize() auf – im Leerlauf (requestIdleCallback), nie im Frame.
 * Im Replay: Simulation pausiert (Tempo gemerkt), Szene/HUD/Panels zeigen den geparsten Snapshot über V(), jeder Befehl
 * (send, Tempo, Bauen, Planung) ist gesperrt. Live stellt Zustand und Tempo wieder her. Speichern nutzt immer `sim` (live). */
const REPLAY_LOCK='Replay · nur Ansicht. „Live“ oder Esc kehrt zum Betrieb zurück.';
const replayBuf=typeof createReplayBuffer==='function'?createReplayBuffer():null;
let replayOwner=null,replayIdle=0;
function replayBlocked(what='Aktion'){if(!rp)return false;toast(`${what} im Replay gesperrt · nur Ansicht. „Live“ oder Esc kehrt zurück.`,true);return true;}
/** Fällige Aufnahme sofort ablegen (Leerlaufrückruf; Tests rufen sie direkt). Liest nur `sim`, ändert nichts. */
function replayTake(){replayIdle=0;if(!replayBuf||rp||!started)return false;if(replayOwner!==sim){replayBuf.clear();replayOwner=sim;}if(!replayBuf.due(sim.state.t))return false;
 const t0=performance.now(),text=sim.serialize(),ms=performance.now()-t0,ok=replayBuf.add(sim.state.t,text,ms);
 // 60-FPS-Schutz: teure Aufnahme (> 8 ms) → seltener aufnehmen (bis alle 30 Spielminuten).
 replayLastT=sim.state.t;replayGap=ms>8?Math.min(30,5*Math.ceil(ms/8)):5;syncReplayBtn();return ok;}
let replayLastT=-Infinity,replayGap=5;
function replayCapture(){if(!replayBuf||rp||!started||replayIdle)return;if(replayGap>5&&sim.state.t-replayLastT<replayGap&&replayOwner===sim)return;if(replayOwner!==sim){replayBuf.clear();replayOwner=sim;}if(!replayBuf.due(sim.state.t))return;
 replayIdle=typeof requestIdleCallback==='function'?requestIdleCallback(replayTake,{timeout:2000}):(setTimeout(replayTake,0)||1);}
function syncReplayBtn(){const b=document.getElementById('replayBtn');if(!b)return;const n=replayOwner===sim?replayBuf?.size||0:0;b.dataset.snapshots=String(n);b.dataset.captureMs=String(Math.round((replayBuf?.stats.maxMs||0)*10)/10);
 putAttr('replayBtn','title',`Replay · Z · ${n} Momentaufnahme${n===1?'':'n'} (alle ${REPLAY.interval} Spielminuten, bis ${REPLAY.window} Min.)`);putAttr('replayBtn','aria-pressed',String(!!rp));}
const replayMaxOffset=()=>rp&&replayBuf?maxOffset(replayBuf,rp.t):0;
const replayAgo=()=>rp?Math.max(0,Math.round(rp.t-(rp.playing?rp.playT:rp.shownT))):0;
function replayText(){return rp?`Replay −${fmt(replayAgo())} Min. · nur Ansicht`:'';}
/** Anzeigeobjekt eines Snapshots (gecacht). Eigenes Objekt, nie mit `sim` verbunden; makeAPI nur für Lesefunktionen (Lagerkapazität). */
function replayView(snap){let v=rp.cache.get(snap.t);if(!v){v=Object.create(Simulation.prototype);v.state=parseSnapshot(snap.text);v.makeAPI?.();rp.cache.set(snap.t,v);if(rp.cache.size>3)rp.cache.delete(rp.cache.keys().next().value);}return v;}
function replayShow(snap){const view=snap?replayView(snap):null;const t=snap?snap.t:rp.t;if(rp.view===view&&rp.shownT===t)return false;rp.view=view;rp.shownT=t;render(true);return true;}
function replayUi(){if(!rp)return;const max=replayMaxOffset(),off=rp.playing?Math.min(max,Math.round((rp.t-rp.playT)/REPLAY.interval)*REPLAY.interval):rp.offset,r=$('#replayRange');
 if(r){r.value=String(-off);r.setAttribute?.('aria-valuetext',replayText());}
 put('replayLabel',replayText());put('replayTime',`${time(rp.playing?rp.playT:rp.shownT)} · Verlauf bis −${fmt(max)} Min.`);put('replayPlay',rp.playing?'Anhalten':'Abspielen ×'+REPLAY.speed);putAttr('replayPlay','aria-pressed',String(!!rp.playing));syncReplayBtn();}
function replaySeek(offset){if(!rp)return;const max=replayMaxOffset(),o=Math.max(0,Math.min(max,Math.round((Number(offset)||0)/REPLAY.interval)*REPLAY.interval));
 rp.offset=o;rp.playing=false;replayShow(o?replayBuf.nearest(rp.t-o):null);scene.setClock?.(rp.shownT);replayUi();}
function replayOpen(){if(rp)return true;if(!started){toast('Zuerst Unternehmen gründen oder Spielstand laden.',true);return false;}
 if(!replayBuf||replayOwner!==sim||!replayBuf.size){toast(`Noch keine Momentaufnahme. Replay sammelt alle ${REPLAY.interval} Spielminuten (bis ${REPLAY.window} Min.).`,true);return false;}
 endBuild();moving=null;if(scene.cameraMode?.())scene.stopCamera?.('user');closeMenus();
 rp={prevSpeed:speed,t:sim.state.t,view:null,shownT:sim.state.t,offset:0,playing:false,playT:0,cache:new Map()};speed=0;accumulator=0;
 $('#replayBar').hidden=false;document.body.classList.add('replay');syncSpeed();
 replaySeek(Math.min(REPLAY.interval,replayMaxOffset()));toast('Replay · Simulation pausiert. Regler wählt den Zeitpunkt, Esc oder „Live“ kehrt zurück.');return true;}
/** Zurück zu Live: Live-Zustand anzeigen, gemerktes Tempo wiederherstellen (quiet: ohne Tempo, z. B. vor Spielstandwechsel). */
function replayLive(quiet=false){if(!rp)return false;const prev=rp.prevSpeed;rp=null;$('#replayBar').hidden=true;document.body.classList.remove('replay');
 if(!quiet&&panel)panelHtml=null;render(true);scene.setClock?.(sim.state.t);syncReplayBtn();if(!quiet){setSpeed(prev);toast(prev?`Live · Betrieb läuft mit ${prev}×.`:'Live · Betrieb pausiert.');}return true;}
function replayToggle(){return rp?replayLive():replayOpen();}
function replayPlay(){if(!rp)return;if(rp.playing){const o=Math.round((rp.t-rp.playT)/REPLAY.interval)*REPLAY.interval;rp.playing=false;rp.offset=Math.min(replayMaxOffset(),o);replayUi();return;}
 if(!rp.offset)replaySeek(replayMaxOffset());if(!rp.offset)return;rp.playing=true;rp.playT=rp.shownT;replayUi();}
/** Takt im Replay (100 ms): nur Abspielen; die Simulation steht. Zwischen Snapshots läuft die Szenenuhr weiter (setClock). */
function replayTick(dt){if(!rp.playing){scene.setClock?.(rp.shownT);return;}
 rp.playT+=dt/1000*REPLAY.speed;if(rp.playT>=rp.t){replaySeek(0);return;}
 const snap=replayBuf.atOrBefore(rp.playT);if(snap)replayShow(snap);scene.setClock?.(rp.playT);replayUi();}
/** Tasten im Replay: Esc/Z beenden, wirksame Kürzel gesperrt; Kamera, Fenster und Suche bleiben. true = verbraucht. */
function replayKey(e,k,lk){
 if(k==='Escape'){if(menuOpen('siteMenu')||menuOpen('bellMenu')||menuOpen('cmdResults')){closeMenus();return true;}replayLive();return true;}
 if(lk==='z'){e.preventDefault?.();replayLive();return true;}
 if(e.code==='Space'||k===' '||k in SPEED_KEYS||lk==='b'||lk==='r'){e.preventDefault?.();replayBlocked(lk==='b'||lk==='r'?'Bauen':'Tempo');return true;}
 return false;}
$('#replayRange')?.addEventListener?.('input',e=>replaySeek(-Number(e.target.value)));
$('#replayRange')?.addEventListener?.('keydown',e=>{if(e.key==='Escape'||e.key==='z'||e.key==='Z'){e.preventDefault?.();replayLive();}});
/* ---- Hub-Kreislauf Welle 1 (A10): Verträge, Hof & Docks, Standortfluss ----
 * Liest s.contracts (W1-S1), s.yard (W1-S2), Hub-Aufträge und Paketchargen (W1-S3). Keine Buchung, keine Zustandsänderung;
 * Annahme, Kündigung und Vorziehen laufen ausschließlich als Befehle über send(). */
let hubFocus=null;
const PHASE_TONE={approach:'move',toDock:'move',toYard:'move',drop:'good',gate:'neutral',exit:'neutral',gone:'neutral',queue:'wait',docking:'good',unloading:'good'};
const PRIORITIZABLE=new Set(['approach','gate','queue']);
const HUB_WAIT_ALERT=15;
function isHubOrder(o){return !!o&&(o.source==='hub'||!!o.contractId);}
const pad2=n=>String(n).padStart(2,'0');
const clockOf=m=>`${pad2(Math.floor(m/60)%24)}:${pad2(Math.floor(m%60))}`;
const slaText=m=>!Number.isFinite(m)?'—':m>=60?fmt(m/60,1)+' Std.':fmt(m)+' Min.';
function arrivalTone(a){return a.waitReason?'wait':PHASE_TONE[a.phase]||'neutral';}
/** Wartezeit aus yard.js (waitSince); ohne Wartegrund zählt nur die Warteschlange ab Phasenbeginn. */
function arrivalWait(a,t){if(a.phase==='gone'||a.phase==='approach')return 0;if(a.waitReason&&Number.isFinite(a.waitSince))return Math.max(0,t-a.waitSince);return a.phase==='queue'?Math.max(0,t-(a.phaseStart??t)):0;}
/** Rest der Phase; wartet der Lkw (z. B. „Keine Torkontrolle“), ist phaseEnd nur das frühestmögliche Ende → „wartet“. */
function arrivalRest(a,t){return a.waitReason&&a.phase!=='gone'?'wartet':a.phaseEnd!=null&&a.phaseEnd>t?fmt(a.phaseEnd-t)+' Min.':'—';}
/** Gebundene Kraft am Lkw (yard.js-Schlüssel gateKey/unloadKey). Entladetempo nur Anzeige: workRate wie in yard.js. */
function arrivalCrew(s,a){const key=a.phase==='gate'?gateKey(a):a.phase==='unloading'?unloadKey(a):null,w=key&&s.workers.find(w=>w.task===key),fork=forkItem(a.item),fk=a.phase==='unloading'&&fork?forkliftOf(s,a):'';if(!w)return fk;
 return a.phase==='gate'?`Torkontrolle: ${esc(w.name)}${w.role==='gate'?' (Torposten, +'+specialistPct()+' %)':''}`:fork?`${esc(w.name)}${w.role==='forklift'?' (Staplerfahrer)':''} · ${fmt(workRate(w,a.item==='pallet'?PALLET_BASE:BULKY_BASE,'forklift'),1)} ${arrivalUnit(a)}/min${fk?' · '+fk:''}`:`${esc(w.name)} · ${fmt(workRate(w,UNLOAD_BASE))} ${arrivalUnit(a)}/min`;}
/** Stapler-Bindung der Ankunft (yard.js: b.task = `${arrival.id}:forklift`). */
function forkliftOf(s,a){const key=forkliftKey(a.id),b=s.buildings.find(x=>x.type==='forklift'&&x.task===key);if(!b)return '';const i=siteForklifts(s,b.site).indexOf(b);return `Stapler ${i+1} · Akku ${fmt(forkCharge(b))} %`;}
/** Handlungshinweis zu den Stapler-Wartegründen (yard.js WAIT.forklift/forkliftCharge/forkliftPower). */
function waitHint(s,a){const r=a.waitReason;
 if(r===YARD_WAIT.gateDown)return gateDownHint(s,a);
 if(r===YARD_WAIT.noYard)return `<br><small class="muted">Abstellen am Dock nicht erlaubt</small> ${button('Containerhof bauen','build','containeryard')}`;
 if(r===YARD_WAIT.yardFull){const y=yardSummary(s,a.site);return `<br><small class="muted">${esc(teuText(y))} · entladen lassen oder weiteren Containerhof bauen</small> ${button('Containerhof','panel-containers')}`;}
 if(r===YARD_WAIT.coldOff)return '<br><small class="muted">Kühllager einschalten bzw. Strom und Zustand prüfen</small>';
 if(r===YARD_WAIT.coldMissing)return `<br><small class="muted">Kühlpakete nur ins Kühllager</small> ${button('Kühllager bauen','build','coldstore')}`;
 if(r===YARD_WAIT.coldFull)return `<br><small class="muted">Kühlplätze belegt · Kühlpakete ausliefern oder weiteres Kühllager bauen</small> ${button('Kühllager bauen','build','coldstore')}`;
 if(!r||!/Stapler/.test(r))return '';
 if(r==='Kein Stapler'&&!siteForklifts(s,a.site).length)return `<br><small class="muted">Staplerplatz fehlt</small> ${button('Staplerplatz bauen','build','forklift')}`;
 if(r==='Kein Stapler')return '<br><small class="muted">Stapler anderweitig gebunden oder pausiert</small>';
 if(r==='Stapler lädt'){const best=Math.max(0,...siteForklifts(s,a.site).map(forkCharge));return `<br><small class="muted">Akku ${fmt(best)} % · lädt bis ${fmt(FORKLIFT.resume)} %</small>`;}
 return '<br><small class="muted">Energieversorgung am Standort ausbauen</small>';}
/** Tätigkeit aus workforce.describeAssignment (Lesesicht A06) mit Klick auf den Bezug: Lkw → Hof & Docks, Sortierplatz → Anlage, Handsortierung → Sortierung. */
function assignmentBadge(d){const [t,tone]={unload:['Entladen','good'],gate:['Torkontrolle','good'],sort:['Sortierung','good'],handsort:['Handsortierung','good'],container:['Containerentladung','good'],task:['Beschäftigt','good'],break:['Pause','warn'],training:['Fortbildung',''],relocation:['Standortwechsel',''],off:['Feierabend','']}[d?.kind]||['Bereit',''];return badge(t,tone);}
function assignmentHtml(d){if(!d)return '—';
 const link=d.kind==='unload'||d.kind==='gate'?`<button class="ref-link" data-arrival="${esc(d.ref)}" title="Hof &amp; Docks öffnen">Hof &amp; Docks</button>`:d.kind==='sort'||d.kind==='machine'?`<button class="ref-link" data-action="select" data-id="${esc(d.ref)}" title="Anlage öffnen">Anlage</button>`:d.kind==='handsort'?`<button class="ref-link" data-station="sort" title="Sortierung öffnen">Sortierung</button>`:d.kind==='container'?`<button class="ref-link" data-action="openRef" data-id="${esc(d.ref)}" title="Containerhof öffnen">Containerhof</button>`:'';
 return esc(d.text)+(link?' '+link:'');}
function dockLabel(s,id){const b=s.buildings.find(x=>x.id===id);if(!b)return id||'—';return displayName(s,b);} // 0.17: eigener Name oder „Dock N“ (ui-explain.defaultName)
function laneName(c,o){const lane=c?.lanes?.find(l=>l.id===o?.lane||l.name===o?.lane);return lane?.name||String(o?.customer||'').replace(/\s*\(.*\)$/,'')||o?.lane||'Ohne Gebiet';}
const parcelsPerDay=c=>(c.arrivals||[]).reduce((n,a)=>n+(Number(a.parcels)||0),0);
/* ---- Welle 2b (A10): Einheit, Vertragsstrafe, Paletten und Stapler ----
 * Nur Lesesicht. Strafen bucht contracts.js (penalty:/penalty-open:), Stapler bindet und lädt yard.js. */
// W3b-2: Ware der Vertragsaufträge über itemOf (Containerverträge: Inhalt Paletten/Pakete), Einheit des Vertrags über unitOf.
const isPalletC=c=>itemOf(c)==='pallet';
const isContainerC=c=>unitOf(c)==='container';
/* 0.15 (A10): Warenarten Kühlpaket/Sperrgut (contracts.wareOf, order.item/a.item 'parcel_cold'|'bulky'). */
const WARE_UNITS={pallet:['Palette','Paletten'],parcel_cold:['Kühlpaket','Kühlpakete'],bulky:['Sperrgut-Stück','Sperrgut-Stück'],parcel:['Paket','Pakete']};
const WARE_NAME={parcel_cold:'Kühlpaket',bulky:'Sperrgut'};
const itemUnit=(item,n=2)=>(WARE_UNITS[item]||WARE_UNITS.parcel)[n===1?0:1];
const unitPlural=c=>itemUnit(itemOf(c));
const unitSingular=c=>itemUnit(itemOf(c),1);
const unitCount=(c,n)=>fmt(n)+' '+(n===1?unitSingular(c):unitPlural(c));
const arrivalUnit=a=>itemUnit(a?.item);
const RATE_FORMAT=new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const rateEuro=v=>(Number.isInteger(v)?fmt(v):RATE_FORMAT.format(v))+' €';
/** Strafsätze im Vertragstext, z. B. „1,50 € je verspätetem Paket · 4 € je liegengebliebenem Paket bei Vertragsende“. */
function penaltyText(c){const p=isPalletC(c),u=unitSingular(c);
 return [Number.isFinite(c.penaltyLate)?`${rateEuro(c.penaltyLate)} je ${p?'verspäteter Palette':'verspätetem '+u}`:'',Number.isFinite(c.penaltyOpen)?`${rateEuro(c.penaltyOpen)} je ${p?'liegengebliebener Palette':'liegengebliebenem '+u} bei Vertragsende`:''].filter(Boolean).join(' · ');}
const isPenaltyRow=l=>/^penalty(-open)?:/.test(l?.key||'');
/** Angefallene Strafen eines Vertrags: Summe der Journalzeilen penalty:/penalty-open: mit Bezug auf den Vertrag (negativ). */
function contractPenalties(s,id){let sum=0,n=0;for(const l of s.ledger)if(isPenaltyRow(l)&&l.refs?.includes(id)){sum+=l.amount;n++;}return {sum:Math.round(sum*100)/100,n};}
const forkCharge=b=>Number.isFinite(b?.charge)?b.charge:FORKLIFT.full;
const siteForklifts=(s,site)=>s.buildings.filter(b=>b.type==='forklift'&&b.site===site);
const siteTrucks=(s,site)=>s.vehicles.filter(v=>v.type==='truck'&&v.site===site&&v.status!=='rentalReturned');
/** Fehlende Ausstattung für Palettenverträge am Standort: Staplerplatz (Entladen) und Lkw (Zustellung). */
function palletNeeds(s,site){const miss=[];if(!siteForklifts(s,site).length)miss.push('Staplerplatz');if(!siteTrucks(s,site).length)miss.push('Lkw');return miss;}
/** Vorgang am Stapler aus b.task = `${id}:forklift` (yard.js): Fremd-Lkw, Lieferung oder Sammeltour. */
function forkliftHolder(s,b){if(!b?.task)return null;const id=String(b.task).replace(/:forklift$/,'');
 const a=(s.yard||[]).find(x=>x.id===id);if(a)return {kind:'arrival',ref:a.id,text:`Entlädt ${a.plate} (${fmt(a.unloaded)}/${fmt(a.parcels)} ${arrivalUnit(a)})`};
 const ct=(s.containers||[]).find(x=>x.id===id);if(ct)return {kind:'container',ref:ct.id,text:`${ct.status==='toDock'?'Holt':'Entlädt'} Container ${ct.id} (${fmt(ct.unloaded)}/${fmt(ct.qty)} ${contentWord(ct.content,ct.qty)})`};
 if(s.shipments.some(x=>x.id===id))return {kind:'shipment',ref:id,text:`Belädt Lieferung ${id}`};
 if((s.tours||[]).some(x=>x.id===id))return {kind:'tour',ref:id,text:`Belädt Sammeltour ${id}`};
 return {kind:'task',ref:null,text:'Im Einsatz'};}
function forkliftState(s,b){const c=forkCharge(b),holder=forkliftHolder(s,b);
 if(!b.enabled)return {tone:'bad',state:'Pausiert',holder};if(!(b.condition>0))return {tone:'bad',state:'Defekt',holder};
 if(!sitePowered(s,b.site))return {tone:'bad',state:'Kein Strom',holder};if(holder)return {tone:'move',state:'Im Einsatz',holder};
 if(b.charging||c<FORKLIFT.min)return {tone:'wait',state:`Lädt bis ${fmt(FORKLIFT.resume)} % · nicht einsatzbereit`,holder};return {tone:'good',state:c<FORKLIFT.full?'Bereit · lädt':'Bereit',holder};}
const chargeBar=c=>`<div class="progress charge${c<20?' low':''}" role="meter" aria-label="Stapler-Akku" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(c)}"><span style="width:${Math.max(0,Math.min(100,c))}%"></span></div>`;
function forkliftActivity(st){const h=st.holder;if(!h)return 'Frei';
 return esc(h.text)+(h.kind==='container'?` <button class="ref-link" data-action="openRef" data-id="${esc(h.ref)}" title="Containerhof öffnen">Containerhof</button>`:h.kind==='arrival'?` <button class="ref-link" data-arrival="${esc(h.ref)}" title="Hof &amp; Docks öffnen">Hof &amp; Docks</button>`:h.ref?` <button class="ref-link" data-action="select" data-id="${esc(h.ref)}">Akte</button>`:'');}
/** Objektakte Staplerplatz: Akku-Balken, Zustand und Tätigkeit. */
function forkliftHtml(s,b){const c=forkCharge(b),st=forkliftState(s,b);
 return kv('Akku',fmt(c)+' %')+chargeBar(c)+kv('Stapler',`<span class="chip tone-${st.tone}">${esc(st.state)}</span>`)+kv('Tätigkeit',forkliftActivity(st))+
 `<p class="fine">Ein Stapler je Staplerplatz. Arbeit −${fmt(FORKLIFT.work,1)} % Akku je Minute, Laden im Leerlauf +${fmt(FORKLIFT.charge)} % je Minute (nur mit Strom). Unter ${fmt(FORKLIFT.min)} % nicht einsatzbereit, lädt dann bis ${fmt(FORKLIFT.resume)} %.</p>`;}
/** describeAssignment (A06) spricht immer von Paketen; bei Palettenankünften Text aus der Einheit der Ankunft ableiten. */
/** 0.17 (A10-E): Zuweisung an eine Anlage mit Anzeigenamen (Sortierplatz, zweite Quergurtkraft, Fertigungs-/Wartungsauftrag). */
function anlageAssignment(s,d){if(!d||typeof d.ref!=='string')return null;
 if(d.kind==='sort'){const b=s.buildings.find(x=>x.id===d.ref);return b?{...d,text:`Sortierung · ${displayName(s,b)}`}:null;}
 if(d.kind!=='task')return null;
 if(d.ref.endsWith(':sort2')){const b=s.buildings.find(x=>x.id===d.ref.slice(0,-6));return b?{kind:'sort',text:`Sortierung · ${displayName(s,b)}`,ref:b.id}:null;}
 const j=s.jobs.find(x=>x.id===d.ref),b=j&&s.buildings.find(x=>x.id===j.building);return b?{kind:'machine',text:`${d.text} · ${displayName(s,b)}`,ref:b.id}:null;}
function assignmentFor(s,w){const d=describeAssignment(s,w);const named=anlageAssignment(s,d);if(named)return named;
 if(d?.kind==='task'&&typeof d.ref==='string'&&d.ref.endsWith(':warehouse')){const ct=(s.containers||[]).find(x=>x.id===d.ref.slice(0,-10));if(ct)return {kind:'container',text:d.text,ref:ct.id};}
 if(d?.kind!=='unload')return d;const a=(s.yard||[]).find(x=>x.id===d.ref);
 return forkItem(a?.item)?{...d,text:`Entlädt ${a.plate} mit Stapler (${a.unloaded}/${a.parcels} ${arrivalUnit(a)}, ${fmt(workRate(w,a.item==='pallet'?PALLET_BASE:BULKY_BASE,'forklift'),1)}/min)`}:a?.item==='parcel_cold'?{...d,text:`Entlädt ${a.plate} ins Kühllager (${a.unloaded}/${a.parcels} Kühlpakete)`}:d;}
function collectHub(s,h,{alert,orders,siteName,lateByContract}){
 const site=h.site,u=h.hub,contracts=new Map((s.contracts||[]).map(c=>[c.id,c]));h.foreignRows=[];
 for(const a of s.yard||[]){if(a.phase==='gone')continue;const c=contracts.get(a.contractId),w=arrivalWait(a,s.t),tone=arrivalTone(a);
  if(a.site===site){if(a.phase==='approach')u.approach++;else{u.onSite++;if(a.phase==='queue')u.queue++;if(a.phase==='unloading'){u.unloading++;if(a.waitReason)u.unloadWait++;}}if(a.waitReason)u.blocked++;if(a.dock)u.atDock++;}
  if(w>HUB_WAIT_ALERT&&!chassisYardWait(a))alert('yw:'+a.id,'wait',`${a.kind==='container'?'Chassis':'Lkw'} ${a.plate} wartet seit ${fmt(w)} Min.`,`${a.waitReason||arrivalPhase(a)} · ${a.carrier} · ${siteName(a.site)}`,a.id);
  if(a.atRisk)alert('yr:'+a.id,'bad',`Frist gefährdet · ${a.plate}`,`${c?.shipper||a.contractId} · Frist ${c&&Number.isFinite(c.slaMinutes)?time(a.eta+c.slaMinutes):'—'}`,a.id);
  h.fleet.foreign++;
  h.foreignRows.push({key:'y:'+a.id,arrival:a.id,id:'Fremd',name:a.plate||a.id,type:(a.kind==='container'?'Containerchassis · ':'Fremd-Lkw · ')+(a.carrier||'—'),route:`${c?.shipper||a.carrier||'—'} → ${a.kind==='container'?(a.pickup?'Abholung Leercontainer':'Containerhof')+' '+siteName(a.site):a.dock?dockLabel(s,a.dock):siteName(a.site)}`,status:arrivalPhase(a)+(a.priority&&PRIORITIZABLE.has(a.phase)?' · vorgezogen':''),hint:a.waitReason||'',tone,rest:arrivalRest(a,s.t)});}
 warnContracts(s,alert,siteName);
 for(const [id,n] of lateByContract){const c=contracts.get(id);alert('ct:'+id,'bad',`Vertrag ${c?.shipper||id} · ${fmt(n)} ${n===1?'Auftrag':'Aufträge'} verspätet`,`Zustellung nach Frist mit Abschlag · ${siteName(c?.site)}`,id);}
 for(const b of s.batches){if(orders.has(b.owner)&&deliverySiteOf(orders.get(b.owner))!==site&&orders.get(b.owner).deliverySite!==undefined&&b.location==='stock')continue;if(b.item==='pallet'&&b.qty>0&&b.site===site&&b.location==='stock'&&orders.has(b.owner)){u.outPallet+=b.qty;u.outPalletOrders.add(b.owner);continue;}
  if(b.item!=='parcel'||!(b.qty>0)||b.site!==site)continue;
  if(b.location==='inbound')u.inbound+=b.qty;
  else if(b.location==='stock'){const o=orders.get(b.owner),lane=laneName(contracts.get(o?.contractId),o);u.out.set(lane,(u.out.get(lane)||0)+b.qty);u.outTotal+=b.qty;}}
 // KPI „Verarbeitet heute“ aus dem Zähler der Sortierung (sorting.js: s.sorting={day,sites:{[site]:{hand,today,total}}}),
 // alle Standorte wie „Ausgeliefert heute“. Ohne Zähler (noch kein Sortierbedarf) bleibt die Kennzahl ausgeblendet.
 const so=s.sorting;if(so&&typeof so==='object'&&so.sites){let today=0,total=0;for(const x of Object.values(so.sites)){if(so.day===h.day)today+=Number(x.today)||0;total+=Number(x.total)||0;}h.sorted=today;h.sortedTotal=total;u.hand=so.sites[site]?.hand||null;}
 // 0.15 (A10): Nachsortierung (Quergurt-Fehlwürfe) und Kühlpakete aus sorting.summary (Lesesicht).
 const sm=sortSummary(s,site);u.resort=sm.resort||0;
 h.cold={...sm.cold,relevant:sm.cold.inbound+sm.cold.stock>0||(s.contracts||[]).some(c=>c.status==='active'&&c.site===site&&wareOf(c)==='parcel_cold')};
}
const FORKLIFT_WARN=20,PENALTY_WARN=60;
/** Glocke W2b: Palettenvertrag ohne Staplerplatz/Lkw; drohende Strafe (Vertragsauftrag in < 60 min fällig, offene Menge) je Vertrag gebündelt. */
function warnContracts(s,alert,siteName){const soon=new Map();
 for(const o of s.orders){if(o.status!=='active'||!o.contractId)continue;const left=o.due-s.t,open=o.qty-o.delivered;if(!(left>0&&left<PENALTY_WARN&&open>0))continue;
  const x=soon.get(o.contractId)||{n:0,units:0,due:o.due};x.n++;x.units+=open;x.due=Math.min(x.due,o.due);soon.set(o.contractId,x);}
 for(const c of s.contracts||[]){
  if(c.status==='active'&&isPalletC(c)){const miss=palletNeeds(s,c.site);if(miss.length)alert('pk:'+c.id,'bad',`${isContainerC(c)?'Seeimport (Paletten)':'Palettenvertrag'} ${c.shipper} · ${miss.join(' und ')} ${miss.length>1?'fehlen':'fehlt'}`,`Entladen nur mit Stapler, Zustellung nur mit Lkw · ${siteName(c.site)}`,c.id);}
  if(c.status==='active'&&wareOf(c)){const miss=wareNeeds(s,c);if(miss.length)alert('wk:'+c.id,'bad',`${WARE_NAME[wareOf(c)]}-Vertrag ${c.shipper} · ${miss.join(' und ')} ${miss.length>1?'fehlen':'fehlt'}`,`${wareOf(c)==='bulky'?'Entladen nur mit Stapler, Lieferwagen fassen wenig':'Einlagerung nur im Kühllager, Zustellung nur mit Kühlfahrzeug'} · ${siteName(c.site)}`,c.id);}
  if(c.status==='active'&&isContainerC(c)&&!siteYards(s,c.site).length)alert('cy:'+c.id,'bad',`Seeimport ${c.shipper} · Containerhof fehlt`,`Chassis warten am Tor („${YARD_WAIT.noYard}“) · ${siteName(c.site)}`,c.id);
  const x=soon.get(c.id);if(x&&c.penaltyLate>0)alert('pd:'+c.id,'wait',`Strafe droht · ${c.shipper}`,`${unitCount(c,x.units)} offen, fällig ${clockOf(x.due%1440)} (${fmt(x.due-s.t)} Min.) · ${rateEuro(c.penaltyLate)} je verspäteter Einheit, bis ${euro(x.units*c.penaltyLate)}`,c.id);}
}
function renderHubStations(h){const u=h.hub;
 station('gate',fmt(u.onSite),parts([[u.approach,'in Anfahrt'],[u.queue,'warten auf Dock'],[u.atDock,'am Dock'],[u.blocked,'mit Wartegrund']])||(u.onSite?'Torkontrolle / Ausfahrt':'Kein Lkw am Hof'),u.queue||u.blocked?'wait':u.onSite||u.approach?'move':'neutral');
 station('unload',`${h.busy}/${h.docks}`,!h.docks?'Kein Dock gebaut':parts([[u.unloading,'Lkw entladen'],[u.atDock-u.unloading,'Lkw am Dock'],[Math.max(0,h.busy-u.atDock),'eigene Ladung'],[u.unloadWait,'wartet']])||(h.busy?'Docks belegt':'Alle Docks frei'),u.unloadWait?'wait':h.busy?'move':'neutral');
 station('sort',fmt(u.inbound),u.sorters?`${fmt(u.sortWork)}/${fmt(u.sorters)} Sortierplätze arbeitend${u.sortBlock?' · '+label(u.sortBlock):''}${u.resort?' · '+fmt(u.resort)+' Nachsortierung':''}`:u.hand==='working'?'Handsortierung läuft':u.inbound?'Kein Sortierplatz · Handsortierung '+(u.hand==='staff'?'wartet auf Lagerkraft':u.hand==='storage'?'blockiert':'wartet'):'Kein Sortierplatz',u.sortBlock?'wait':u.sortWork||u.hand==='working'?'move':u.inbound?'wait':'neutral');
 {const c=h.cold||{inbound:0,stock:0,sortable:false,relevant:false};putHidden('stl-cold',!c.relevant);
  station('cold',fmt(c.inbound+c.stock),[parts([[c.inbound,'im Eingang'],[c.stock,'sortiert im Kühllager']]),c.inbound&&!c.sortable?'Kühllager fehlt · Sortierung gesperrt':''].filter(Boolean).join(' · ')||(c.sortable?'Keine Kühlpakete':'Kein Kühllager am Standort'),c.inbound&&!c.sortable?'bad':c.inbound?'move':'neutral');}
 station('out',fmt(u.outTotal),u.outTotal?[...u.out].sort((a,b)=>b[1]-a[1]).map(([lane,n])=>`${lane} ${fmt(n)}`).join(' · '):'Keine versandfähigen Pakete',u.outTotal?'move':'neutral');
 putHidden('stl-outPallet',!u.outPallet);station('outPallet',fmt(u.outPallet),u.outPallet?`${fmt(u.outPallet)} ${u.outPallet===1?'Palette':'Paletten'} · ${fmt(u.outPalletOrders.size)} ${u.outPalletOrders.size===1?'Auftrag':'Aufträge'} · nur Lkw`:'Keine versandfähigen Paletten',u.outPallet?'move':'neutral');
 station('delivery',fmt(u.orders),u.orders?parts([[u.openParcels,'Pakete offen'],[u.openPallets||0,'Paletten offen'],[u.late,'verspätet'],[h.loadsToday,'Abfahrten heute']])||'Alle Pakete unterwegs':'Keine aktiven Hub-Aufträge',u.late?'bad':u.orders?'move':'neutral');}
function hubPanelFor(id){const s=V().state;if((s.lines||[]).some(l=>l.id===id)||(s.linehauls||[]).some(x=>x.id===id))return 'lines';if((s.yard||[]).some(a=>a.id===id))return 'yard';if((s.contracts||[]).some(c=>c.id===id))return 'contracts';if((s.containers||[]).some(c=>c.id===id))return 'containers';if((s.airShuttles||[]).some(x=>x.id===id))return 'air';return null;}
function openArrival(id){const a=(V().state.yard||[]).find(x=>x.id===id);closeMenus();openPanel('yard',id);if(a?.dock)scene.focus?.(a.dock);}
/** Befehle der Fachmodule; fehlt ein Befehl im Stand, erscheint eine verständliche Meldung statt „Befehl unbekannt“. */
function hubSend(c,what){const r=send(c);if(!r.ok&&/Befehl unbekannt/.test(r.message||''))toast(`${what} noch nicht verfügbar: Das zuständige Fachmodul kennt den Befehl „${c.type}“ in diesem Stand noch nicht.`,true);return r;}
function cancelContract(id){const s=V().state,c=(s.contracts||[]).find(x=>x.id===id);if(!c)return;
 if(c.status==='offer')return confirm('Angebot ablehnen?',`${c.shipper}: Angebot wird abgelehnt und entfernt.`,()=>hubSend({type:'cancelContract',id},'Ablehnen'));
 const open=s.orders.filter(o=>o.contractId===id&&o.status==='active').length;
 return confirm('Vertrag kündigen?',`${c.shipper}: Vertrag endet, weitere Ankünfte entfallen. ${fmt(open)} offene Aufträge bleiben bestehen und sind weiter zuzustellen.`,()=>hubSend({type:'cancelContract',id},'Vertragskündigung'));}
function searchHub(s,q,has,site,hits){const day=Math.floor(s.t/1440);
 for(const a of s.yard||[])if((a.phase!=='gone'||sameDay(a.eta,day))&&has(a.plate,a.id,a.carrier))hits.push({id:a.id,kind:a.kind==='container'?'Containerchassis':'Fremd-Lkw',title:a.plate||a.id,sub:`${a.carrier||'—'} · ${arrivalPhase(a)} · ${site(a.site)}`,tone:arrivalTone(a)});
 for(const l of s.lines||[])if(has(l.id,site(l.from),site(l.to),'linie'))hits.push({id:l.id,kind:'Linie',title:`Linie ${site(l.from)} → ${site(l.to)}`,sub:`${l.departures.map(hhmm).join(' · ')} · ${l.active?'Aktiv':'Pausiert'}`,tone:l.wait&&l.wait!==LINE_WAIT.empty?'wait':l.active?'move':'neutral'});
 for(const c of s.contracts||[])if(has(c.shipper,c.id,...(c.lanes||[]).map(l=>l.name)))hits.push({id:c.id,kind:'Vertrag',title:c.shipper||c.id,sub:`${c.id} · ${label(c.status)} · ${fmt(parcelsPerDay(c))} ${unitPlural(c)}/Tag · ${site(c.site)}`,tone:c.status==='active'?'move':'neutral'});
 for(const sh of s.airShuttles||[])if((AIR_ACTIVE.has(sh.status)||sameDay(sh.completedAt,day))&&has(sh.id,'luftzubringer','zubringer'))hits.push({id:sh.id,kind:'Luftzubringer',title:sh.id,sub:`Flug ${hhmm(sh.flight)} · ${AIR_PHASE[sh.status]||label(sh.status)} · ${fmt(sh.qty)} Pakete · ${site(sh.site)}`,tone:sh.blocked?'wait':AIR_ACTIVE.has(sh.status)?'move':'neutral'});
 const ks=new Map((s.contracts||[]).map(c=>[c.id,c]));for(const c of s.containers||[])if((c.status!=='gone'||sameDay(c.goneAt,day))&&has(c.id,ks.get(c.contractId)?.shipper,'container'))hits.push({id:c.id,kind:'Container',title:c.id,sub:`${containerContent(c)} · ${CT_STATUS[c.status]||c.status} · ${site(c.site)}`,tone:containerTone(s,c)});}
const WARE_HINT={parcel_cold:'nur Kühllager, Kühlfahrzeug',bulky:'Stapler, kein Sortierer'};
const siteHas=(s,site,type)=>s.buildings.some(b=>b.type===type&&b.site===site);
const siteVehicle=(s,site,type)=>s.vehicles.some(v=>v.type===type&&v.site===site&&v.status!=='rentalReturned');
/** Fehlende Ausstattung je Warenart am Standort (Lesesicht): Kühlpaket → Kühllager + Kühlfahrzeug; Sperrgut → Staplerplatz + Lkw. */
function wareNeeds(s,c){const w=wareOf(c),miss=[];if(w==='parcel_cold'){if(!siteHas(s,c.site,'coldstore'))miss.push('Kühllager');if(!siteVehicle(s,c.site,'refrigerated'))miss.push('Kühlfahrzeug');}
 else if(w==='bulky'){if(!siteForklifts(s,c.site).length)miss.push('Staplerplatz');if(!siteTrucks(s,c.site).length)miss.push('Lkw');}return miss;}
function wareRows(c){const w=wareOf(c);if(!w)return '';
 return kv('Warenart',`<span class="chip tone-neutral ware-chip">${esc(WARE_NAME[w])}</span> <small class="muted">Einheit: ${esc(unitPlural(c))}</small>`)+(Number.isFinite(c.surcharge)?kv('Kühlzuschlag',`${rateEuro(c.surcharge)} je Kühlpaket · im Preis enthalten`):'');}
function wareNote(s,c){const w=wareOf(c);if(!w)return '';const miss=c.status!=='ended'?wareNeeds(s,c):[];
 const vanBulky=maxLoad({type:'van',capacity:VEHICLES.van.capacity},'bulky'),truckBulky=maxLoad({type:'truck',capacity:VEHICLES.truck.capacity},'bulky');
 const text=w==='parcel_cold'?'<b>Kühlpakete:</b> Entladen nur in freie Kühlplätze (Kühllager), Sortierung nur mit Kühllager am Standort, Zustellung nur mit Kühlfahrzeug. Ohne freien Kühlplatz wartet der Lkw am Dock.'
  :`<b>Sperrgut:</b> nie über Sortierplatz oder Quergurt. Entladen von Hand mit Stapler und Lagerkraft direkt ins Lager. Lieferwagen fasst ${fmt(vanBulky)} Stück, Lkw ${fmt(truckBulky)} Stück.`;
 const build=miss.includes('Kühllager')?button('Kühllager bauen','build','coldstore'):miss.includes('Staplerplatz')?button('Staplerplatz bauen','build','forklift'):'';
 return `<div class="notice${miss.length?' warn':''}" role="note">${text}${miss.length?` <b>Fehlt am Standort: ${esc(miss.join(' und '))}.</b>`:''}${build?`<div class="actions">${build}</div>`:''}</div>`;}
function contractCard(s,c){const arrivals=(c.arrivals||[]).slice().sort((a,b)=>a.minute-b.minute),perDay=parcelsPerDay(c),site=s.sites.find(x=>x.id===c.site)?.name||c.site;
 const lanes=(c.lanes||[]).map((l,i)=>`${esc(l.name)} · ${fmt(l.distance)} km${Number.isFinite(c.laneShare?.[i])?' · '+fmt(c.laneShare[i]*100)+' %':''}${laneRemoteText(s,c,l)}`).join('<br>');
 const open=s.orders.filter(o=>o.contractId===c.id&&o.status==='active'),late=open.filter(o=>o.late||s.t>o.due).length;
 const cont=isContainerC(c),air=isAirC(c),boxes=containersPerDay(c),per=c.unitsPerContainer;
 const U=unitPlural(c),U1=unitSingular(c),pens=penaltyText(c),charged=c.status!=='offer'?contractPenalties(s,c.id):null,miss=isPalletC(c)&&!cont?palletNeeds(s,c.site):[];
 const waits=[...new Set(open.map(o=>o.settleWait).filter(Boolean))],grace=TERMS.penalty?.openGrace??1440;
 const settleRow=c.status!=='ended'||c.settled||c.endT==null||!Number.isFinite(c.penaltyOpen)?'':waits.length?kv('Abrechnung wartet',`<span class="money-minus">${esc(waits.join(' · '))}</span>`):open.length?kv('Abrechnung offener Mengen',s.t>=c.endT+grace?'läuft':'ab '+time(c.endT+grace)):'';
 const palletNote=isPalletC(c)&&!cont?`<div class="notice${miss.length&&c.status!=='ended'?' warn':''}" role="note"><b>Palettenvertrag:</b> Entladen nur mit Staplerplatz (Stapler) und Lagerkraft, Zustellung nur mit Lkw. Lieferwagen fassen keine Paletten.${miss.length&&c.status!=='ended'?` <b>Fehlt am Standort: ${esc(miss.join(' und '))}.</b>`:''}${miss.includes('Staplerplatz')&&c.status!=='ended'?`<div class="actions">${button('Staplerplatz bauen','build','forklift')}</div>`:''}</div>`:'';
 const term=c.status==='offer'?(Number.isFinite(c.durationDays)?fmt(c.durationDays)+' Tage ab Annahme':''):c.startT!=null?time(c.startT)+(c.endT!=null?' – '+time(c.endT):''):'';
 const content=perDay*(c.pricePerParcel||0),handling=cont?boxes*(c.pricePerContainer||0):0;
 const arrivalText=a=>cont&&Number.isFinite(a.containers)?`${clockOf(a.minute)} (${fmt(a.containers)} Container à ${unitCount(c,per)})`:`${clockOf(a.minute)} (${unitCount(c,a.parcels)})`;
 const numbers=cont?`${num(fmt(boxes),'Container / Tag')}${num(euro(c.pricePerContainer||0),'Handling / Container')}${num(euro(c.pricePerParcel),'Inhalt / '+U1)}${num(slaText(c.slaMinutes),'Frist ab Tor')}`:air?`${num(fmt(perDay),U+' / Tag')}${num(euro(c.pricePerParcel),'Preis / '+U1)}${num(fmt(c.cutoff)+' Min.','Annahmeschluss vor Abflug')}`:`${num(fmt(perDay),U+' / Tag')}${num(euro(c.pricePerParcel),'Preis / '+U1)}${num(slaText(c.slaMinutes),'Frist ab Tor')}`;
 const contRows=cont?`${kv('Inhalt',`${fmt(boxes)} Container à ${unitCount(c,per)} = ${unitCount(c,perDay)} / Tag`)}${kv('Freizeit im Containerhof',slaText(c.freeMinutes)+' ab Abstellen')}${kv('Lagergeld nach Freizeit',`${rateEuro(c.demurragePerHour||0)} / Std. je Container`)}${c.status!=='offer'?kv('Angefallenes Lagergeld',contractDemurrageHtml(s,c.id)):''}`:air?airContractRows(s,c):'';
 return `<div class="card${hubFocus===c.id?' selected':''}" data-contract="${esc(c.id)}"><div class="card-top"><div><h3>${esc(c.shipper)}</h3><small>${esc(c.id)} · ${esc(site)}${cont?' · Seeimport':air?' · Luftexport':''}${wareOf(c)?' · '+esc(WARE_NAME[wareOf(c)]):''}</small></div>${badge(late?'Aufträge verspätet':label(c.status),late?'bad':c.status==='active'?'good':'')}</div>
<div class="numbers">${numbers}</div>
${kv('Zustellgebiete',lanes||'—')}${kv('Ankünfte / Tag',fmt(arrivals.length)+(arrivals.length?' · '+arrivals.map(arrivalText).join(', '):''))}${contRows}${wareRows(c)}${wareCapacity(s,c)}${shipperRows(s,c)}${kv('Erlös / Tag bei fristgerechter Zustellung',euro(content+handling)+(cont?` <small class="muted">(Inhalt ${euro(content)} + Handling ${euro(handling)})</small>`:''))}${term?kv('Laufzeit',term):''}${c.status==='offer'&&Number.isFinite(c.expiresAt)?kv('Angebot gültig bis',time(c.expiresAt)):''}${c.acceptedAt!=null?kv('Angenommen',time(c.acceptedAt)):''}${c.status==='active'?kv('Offene Aufträge',fmt(open.length)+(late?` · <span class="money-minus">${fmt(late)} verspätet</span>`:'')):''}${c.status==='ended'&&c.endReason?kv('Ende',esc(({cancelled:'Gekündigt'})[c.endReason]||label(c.endReason))):''}${pens?kv('Vertragsstrafe',esc(pens)):''}${charged?kv('Angefallene Strafen',charged.n?`<span class="money-minus">${euro(charged.sum)}</span> · ${fmt(charged.n)} ${charged.n===1?'Buchung':'Buchungen'}`:euro(0)):''}${settleRow}${palletNote}${wareNote(s,c)}${cont?containerNote(s,c):''}${air?airContractNote(s,c):''}${haulNote(s,c)}
${c.status==='offer'?`<div class="actions">${button('Vertrag annehmen','acceptContract',c.id,'primary')}${button('Ablehnen','cancelContract',c.id)}</div>`:c.status==='active'?`<div class="actions">${button('Vertrag kündigen','cancelContract',c.id,'danger')}</div>`:''}</div>`;}
/** Geplante Ankünfte heute und morgen aus aktiven Verträgen; Zuordnung zum Hofeintrag über contractId und eta. */
function arrivalPlan(s){const day=Math.floor(s.t/1440),yard=new Map((s.yard||[]).filter(a=>!a.pickup).map(a=>[a.contractId+'@'+a.eta,a])),rows=[];
 for(const c of s.contracts||[]){if(c.status!=='active')continue;for(const d of [day,day+1])for(const a of c.arrivals||[]){const abs=d*1440+a.minute;if(c.startT!=null&&abs<c.startT)continue;if(c.endT!=null&&abs>=c.endT)continue;const y=yard.get(c.id+'@'+abs);if(!y&&abs<s.t)continue;rows.push({key:c.id+'@'+abs,abs,today:d===day,c,parcels:a.parcels,containers:isContainerC(c)?a.containers:null,y});}}
 return rows.sort((a,b)=>a.abs-b.abs||String(a.c.id).localeCompare(String(b.c.id)));}
/** Summe geplanter Einheiten je Einheit (Pakete und Paletten nicht addieren). */
function planTotal(plan){const m=new Map([['parcel',0]]);for(const r of plan){const k=itemOf(r.c);m.set(k,(m.get(k)||0)+(r.parcels||0));}const out=[...m].filter(([k,n])=>n>0).map(([k,n])=>fmt(n)+' '+itemUnit(k));return out.join(' · ')||'0 Pakete';}
function contractsPanel(){const s=V().state,all=s.contracts||[],list=filtered(all),offers=list.filter(c=>c.status==='offer'),active=list.filter(c=>c.status==='active'),ended=list.filter(c=>c.status==='ended'),plan=arrivalPlan(s);
 return `<p class="fine"><b>Verträge</b> sind laufende Vereinbarungen mit Versendern über mehrere Tage. Aus jeder Lkw-Ankunft entsteht je Zustellgebiet ein einzelner <b>Auftrag</b> (Fenster „Aufträge“) mit Menge, Frist und Vergütung.</p><div class="notice">Versender schicken fremde Lkw zu festen Ankunftszeiten. Pakete werden entladen, sortiert und mit eigenen Fahrzeugen zugestellt. Frist zählt ab Ankunft am Tor; Zustellung danach mit Abschlag und Vertragsstrafe je Einheit. Was bei Vertragsende liegen bleibt, kostet ebenfalls Strafe und geht an den Versender zurück.${containersUnlocked(s)?' Seeimport: Containerchassis stellen Container im Containerhof ab; Handling je Container, nach der Freizeit Lagergeld.':` Seeimport-Angebote (Container) ab Tag ${fmt(TERMS.container?.fromDay??5)} oder mit Containerhof am Standort.`} Warenarten: Kühlpakete (mit Kühllager oder Forschung Kühlkettenlogistik, Kühlzuschlag im Preis) und Sperrgut (ab Tag ${fmt(TERMS.ware?.bulky?.fromDay??3)} oder mit Staplerplatz) kommen als eigenes Angebot.</div>${!all.length?empty('Keine Frachtverträge','Noch kein Vertragsangebot vorhanden.'):''}
<section class="section"><div class="section-title"><h3>Angebote</h3>${badge(fmt(offers.length)+' offen')}</div>${offers.map(c=>contractCard(s,c)).join('')||'<p class="fine">Keine offenen Angebote.</p>'}</section>
<section class="section"><div class="section-title"><h3>Aktive Verträge</h3>${badge(fmt(active.length)+' aktiv',active.length?'good':'')}</div>${active.map(c=>contractCard(s,c)).join('')||'<p class="fine">Kein aktiver Vertrag.</p>'}</section>
<section class="section"><div class="section-title"><h3>Ankunftsplan heute und morgen</h3>${badge(planTotal(plan))}</div>${plan.length?`<div class="table-wrap"><table><thead><tr><th>Tag</th><th>Ankunft</th><th>Versender</th><th class="num">Menge</th><th>Stand</th></tr></thead><tbody>${plan.map(r=>`<tr><td>${r.today?'Heute':'Morgen'}</td><td>${clockOf(r.abs%1440)}</td><td>${esc(r.c.shipper)}</td><td class="num">${unitCount(r.c,r.parcels)}${r.containers?`<br><small class="muted">${fmt(r.containers)} Container</small>`:''}</td><td>${r.y?`${esc(r.y.plate)} · ${esc(arrivalPhase(r.y))}`:'Geplant'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="fine">Keine Ankünfte geplant. Ankünfte entstehen aus aktiven Verträgen.</p>'}</section>
${shippersSection(s)}
${ended.length?`<details><summary>Beendete Verträge · ${fmt(ended.length)}</summary>${ended.map(c=>contractCard(s,c)).join('')}</details>`:''}`;}
function dockState(s,b,yard){
 if(!b.enabled||!(b.condition>0))return {tone:'bad',state:'Außer Betrieb',text:b.enabled?'Zustand 0 %':'Pausiert'};
 if(!b.task)return {tone:'good',state:'Frei',text:'Bereit für Fremd-Lkw oder eigene Ladung'};
 const ct=(s.containers||[]).find(x=>x.id===b.task);if(ct)return {tone:ct.waitReason?'wait':'move',state:'Container',text:`${ct.id} · ${CT_STATUS[ct.status]||ct.status} · ${fmt(ct.unloaded)}/${fmt(ct.qty)} ${contentWord(ct.content,ct.qty)}`};
 const sh=(s.airShuttles||[]).find(x=>x.id===b.task);if(sh)return {tone:sh.blocked?'wait':'move',state:'Luftzubringer',text:`${sh.id} · Beladung · Flug ${hhmm(sh.flight)} · ${fmt(sh.qty)} Pakete${sh.blocked?' · '+sh.blocked:''}`};
 const a=yard.get(b.task);if(a)return {tone:a.waitReason?'wait':'move',state:'Fremd-Lkw',text:`${a.plate} · ${a.carrier} · ${phaseLabel(a.phase)} · ${fmt(a.unloaded)}/${fmt(a.parcels)} ${arrivalUnit(a)}${a.waitReason?' · '+a.waitReason:''}`};
 const own=[...s.shipments,...(s.tours||[]),...(s.transfers||[]),...(s.freights||[])].find(x=>x.id===b.task);
 return {tone:'move',state:'Eigene Ladung',text:`${b.task}${own?' · '+label(own.status):''}`};}
function yardPanel(){const s=V().state,site=s.selectedSite,day=Math.floor(s.t/1440),contracts=new Map((s.contracts||[]).map(c=>[c.id,c])),all=(s.yard||[]).filter(a=>a.site===site),yard=new Map(all.map(a=>[a.id,a]));
 const rows=filtered(all.filter(a=>a.phase!=='gone'||sameDay(a.eta,day))).sort((a,b)=>(a.eta??0)-(b.eta??0)||String(a.id).localeCompare(String(b.id)));
 const docks=s.buildings.filter(b=>b.site===site&&b.type==='dock'),onSite=all.filter(a=>!['approach','gone'].includes(a.phase)).length,queue=all.filter(a=>a.phase==='queue').length,busy=docks.filter(b=>b.task).length;
 return `<div class="numbers">${num(fmt(onSite),'Lkw am Hof')}${num(fmt(queue),'Warten auf Dock')}${num(`${fmt(busy)} / ${fmt(docks.length)}`,'Docks belegt')}</div>
<section class="section"><div class="section-title"><h3>Torbuch heute</h3>${badge(fmt(rows.length)+' Ankünfte')}</div>${rows.length?`<div class="table-wrap"><table class="yard-table"><thead><tr><th>Kennzeichen</th><th>Spedition</th><th>Vertrag</th><th>Phase</th><th>Wartegrund</th><th>Dock</th><th class="num">Menge</th><th class="num">Rest</th><th></th></tr></thead><tbody>${rows.map(a=>{const c=contracts.get(a.contractId),w=arrivalWait(a,s.t),crew=arrivalCrew(s,a);return `<tr class="${hubFocus===a.id?'selected':''}" data-arrival-row="${esc(a.id)}"><td><b>${esc(a.plate)}</b><br><small class="muted">Ankunft ${clockOf((a.eta??0)%1440)}</small>${arrivalDelayHtml(a)}</td><td>${esc(a.carrier)}${a.kind==='container'?`<br><small class="muted">Containerchassis · ${a.pickup?'Leercontainer-Abholung':'Seeimport'}</small>`:''}${WARE_NAME[a.item]?`<br><span class="chip tone-neutral ware-chip">${esc(WARE_NAME[a.item])}</span> <small class="muted">${esc(WARE_HINT[a.item])}</small>`:''}</td><td>${esc(c?.shipper||a.contractId)}<br><small class="muted">${esc(a.contractId)}</small></td><td><span class="chip tone-${arrivalTone(a)}">${esc(arrivalPhase(a))}</span>${a.priority&&PRIORITIZABLE.has(a.phase)?`<br><small class="muted">vorgezogen</small>`:''}${a.atRisk?`<br>${badge('Frist gefährdet','bad')}`:''}${crew&&a.phase==='gate'?`<br><small class="muted crew">${crew}</small>`:''}</td><td>${esc(a.waitReason||'—')}${waitHint(s,a)}${w?`<br><small class="${w>HUB_WAIT_ALERT?'money-minus':'muted'}">seit ${fmt(w)} Min.</small>`:''}</td><td>${a.dock?esc(dockLabel(s,a.dock)):'—'}</td><td class="num">${arrivalQty(s,a)}${crew&&a.phase==='unloading'?`<br><small class="muted crew">${crew}</small>`:''}</td><td class="num">${arrivalRest(a,s.t)}</td><td>${PRIORITIZABLE.has(a.phase)&&!a.priority?button('Vorziehen','prioritizeArrival',a.id):''}</td></tr>`;}).join('')}</tbody></table></div>`:empty('Heute noch kein Lkw','Ankünfte entstehen aus aktiven Frachtverträgen.')}</section>
<section class="section"><div class="section-title"><h3>Dock-Belegung</h3>${badge(fmt(docks.length-busy)+' frei',docks.length&&busy<docks.length?'good':'warn')}</div>${docks.map(b=>{const d=dockState(s,b,yard);return `<div class="list-row dock-row"><div><strong>${esc(dockLabel(s,b.id))} <span class="chip tone-${d.tone}">${esc(d.state)}</span></strong><small>${esc(d.text)} · ${esc(b.id)}</small></div>${button('Akte','select',b.id)}</div>`;}).join('')||`${empty('Kein Dock gebaut','Fremde Lkw warten am Tor, bis eine Laderampe frei ist.')}<div class="actions">${button('Laderampe bauen','build','dock','primary')}</div>`}</section>${yardContainerLine(s,site)}${forkliftSection(s,site,all)}`;}
/** Stapler am Standort (W2b): Akku, Zustand, gebundener Vorgang. Nur sichtbar mit Staplerplatz oder Palettenankunft. */
function forkliftSection(s,site,arrivals){const forks=siteForklifts(s,site);if(!forks.length&&!arrivals.some(a=>forkItem(a.item)))return '';
 const ready=forks.filter(b=>forkliftState(s,b).tone==='good').length;
 return `<section class="section"><div class="section-title"><h3>Stapler</h3>${badge(fmt(ready)+' bereit',ready?'good':'warn')}</div>${forks.map((b,i)=>{const st=forkliftState(s,b),c=forkCharge(b);return `<div class="list-row fork-row"><div><strong>Stapler ${i+1} <span class="chip tone-${st.tone}">${esc(st.state)}</span></strong>${chargeBar(c)}<small>Akku ${fmt(c)} % · ${st.holder?esc(st.holder.text):'Frei'} · ${esc(b.id)}</small></div>${button('Akte','select',b.id)}</div>`;}).join('')||`${empty('Kein Staplerplatz','Paletten werden nur mit Stapler entladen und auf Lkw verladen.')}<div class="actions">${button('Staplerplatz bauen','build','forklift','primary')}</div>`}</section>`;}
/* ---- Containerhof und Seeimport Welle 3b-2 (A10): Fenster „Containerhof“, Torbuch-Chassis, Station, Glocke, Lagergeld ----
 * Lesesicht auf s.containers (containers.js, W3b-S2), Containerverträge (contracts.js, W3b-S1: unit 'container', itemOf, Handling,
 * Freizeit, Lagergeld) und das Journal (demurrage:<containerId>:<n>, container-handling:<containerId>). Änderung nur über
 * send({type:'unstuffContainer'}). Keine Buchung, keine Bestandsänderung, Zeiten nur aus dem Zustand (freeUntil, pickupAt). */
const CT_STATUS={arriving:'Angekündigt',yard:'Im Containerhof',toDock:'Umfuhr zum Dock',unstuffing:'Wird entladen',empty:'Leer · wartet auf Abholung',pickup:'Wird abgeholt',gone:'Abgeholt'};
const CT_TONE={arriving:'neutral',yard:'neutral',toDock:'move',unstuffing:'good',empty:'neutral',pickup:'move',gone:'neutral'};
/** Lagergeld zählt in diesen Status ab freeUntil (gleiche Regel wie containers.js). */
const CT_DEMURRAGE=new Set(['yard','toDock','unstuffing','empty']);
const CT_ACTIVE=new Set(['yard','toDock','unstuffing','empty','pickup']);
/** Glocke: Freizeit endet in weniger als CT_SOON Minuten. */
const CT_SOON=120;
const round2=n=>Math.round(n*100)/100;
const contentWord=(item,n)=>item==='pallet'?(n===1?'Palette':'Paletten'):(n===1?'Paket':'Pakete');
const containerContent=c=>`${fmt(c.qty)} ${contentWord(c.content,c.qty)}`;
const containersPerDay=c=>(c.arrivals||[]).reduce((n,a)=>n+(Number(a.containers)||0),0);
const siteYards=(s,site)=>s.buildings.filter(b=>b.type==='containeryard'&&b.site===site);
const demurrageRunning=(s,c)=>CT_DEMURRAGE.has(c.status)&&c.freeUntil!=null&&s.t>=c.freeUntil;
const containerTone=(s,c)=>demurrageRunning(s,c)?'bad':c.waitReason&&c.status==='yard'?'wait':CT_TONE[c.status]||'neutral';
/** Chassis wartet auf TEU-Platz („Containerhof voll“ / „Kein Containerhof“). */
const chassisYardWait=a=>a?.kind==='container'&&(a.waitReason===YARD_WAIT.yardFull||a.waitReason===YARD_WAIT.noYard);
/** Journal in einem Durchlauf: Lagergeld je Container (demurrage:<id>:<n>, negativ) und Handling je Container (Umsatz). */
function containerLedger(s){const dem=new Map(),hand=new Map();let demSum=0,handSum=0,demN=0,handN=0;
 for(const l of s.ledger){const k=l.key;if(typeof k!=='string')continue;
  if(k.startsWith('demurrage:')){const id=k.slice(10,k.lastIndexOf(':'));dem.set(id,(dem.get(id)||0)+l.amount);demSum+=l.amount;demN++;}
  else if(k.startsWith('container-handling:')){const id=k.slice(19);hand.set(id,(hand.get(id)||0)+l.amount);handSum+=l.amount;handN++;}}
 return {dem,hand,demSum:round2(demSum),handSum:round2(handSum),demN,handN};}
/** Angefallenes Lagergeld eines Vertrags (Journalzeilen demurrage:* mit Vertragsbezug). */
function contractDemurrageHtml(s,id){let sum=0,n=0;for(const l of s.ledger)if(typeof l.key==='string'&&l.key.startsWith('demurrage:')&&l.refs?.includes(id)){sum+=l.amount;n++;}
 return n?`<span class="money-minus">${euro(round2(sum))}</span> · ${fmt(n)} ${n===1?'Stunde':'Stunden'}`:euro(0);}
/** Belegung eines Standorts: TEU (containers.teuUsed/teuCapacity), Container je Status, wartende Chassis. */
function yardSummary(s,site){const list=(s.containers||[]).filter(c=>c.site===site),y={site,list,cap:teuCapacity(s,site),capAll:teuCapacity(s,site,false),used:teuUsed(s,site),yards:siteYards(s,site),
  arriving:0,inYard:0,atDock:0,empty:0,running:0,soon:0,active:0,waiting:[]};
 for(const c of list){if(c.status==='arriving')y.arriving++;else if(c.status==='yard')y.inYard++;else if(c.status==='toDock'||c.status==='unstuffing')y.atDock++;else if(c.status==='empty'||c.status==='pickup')y.empty++;
  if(CT_ACTIVE.has(c.status))y.active++;if(demurrageRunning(s,c))y.running++;else if(CT_DEMURRAGE.has(c.status)&&c.freeUntil!=null&&c.freeUntil-s.t<CT_SOON)y.soon++;}
 for(const a of s.yard||[])if(a.site===site&&chassisYardWait(a)&&a.phase!=='gone')y.waiting.push(a);
 return y;}
const teuText=y=>`${fmt(y.used)} / ${fmt(y.cap)} TEU`+(y.capAll>y.cap?` · ${fmt(y.capAll-y.cap)} TEU außer Betrieb`:'');
function containerNote(s,c){const pallet=isPalletC(c),miss=[];if(!siteYards(s,c.site).length)miss.push('Containerhof');if(pallet)miss.push(...palletNeeds(s,c.site));const show=miss.length&&c.status!=='ended';
 return `<div class="notice${show?' warn':''}" role="note"><b>Seeimport:</b> Containerchassis vom Seehafen stellen die Container im Containerhof ab (${fmt(BUILDINGS.containeryard?.teu||0)} TEU je Hof, ein 40-Fuß-Container belegt ${fmt(TEU)} TEU). Entladen am Dock mit Lagerkraft${pallet?' und Stapler; Paletten gehen ins Lager, Zustellung nur mit Lkw':'; Pakete gehen in die Sortierung'}. Handling wird je Container nach vollständigem Entladen gutgeschrieben. Nach der Freizeit läuft Lagergeld bis zur Abholung des Leercontainers.${show?` <b>Fehlt am Standort: ${esc(miss.join(' und '))}.</b>`:''}${show&&(miss.includes('Containerhof')||miss.includes('Staplerplatz'))?`<div class="actions">${miss.includes('Containerhof')?button('Containerhof bauen','build','containeryard'):''}${miss.includes('Staplerplatz')?button('Staplerplatz bauen','build','forklift'):''}</div>`:''}</div>`;}
/** Freizeit-/Lagergeldspalte. */
function containerFreeHtml(s,c,k){const rate=k?.demurragePerHour;
 if(c.status==='arriving')return `<small class="muted">Freizeit ${slaText(c.freeMinutes)} ab Abstellen</small>`;
 if(c.status==='pickup'||c.status==='gone')return '—';
 if(demurrageRunning(s,c))return `<span class="money-minus">Lagergeld läuft seit ${esc(time(c.freeUntil))}</span>${Number.isFinite(rate)?`<br><small class="muted">${rateEuro(rate)} / Std.</small>`:''}`;
 const left=c.freeUntil-s.t;return `Freizeit bis ${esc(time(c.freeUntil))}<br><small class="${left<CT_SOON?'money-minus':'muted'}">noch ${slaText(left)}</small>`;}
function containersPanel(){const s=V().state,site=s.selectedSite,day=Math.floor(s.t/1440),y=yardSummary(s,site),led=containerLedger(s),contracts=new Map((s.contracts||[]).map(c=>[c.id,c]));
 const rank={unstuffing:0,toDock:1,yard:2,arriving:3,empty:4,pickup:5,gone:6};
 const rows=filtered(y.list.filter(c=>c.status!=='gone'||sameDay(c.goneAt,day))).sort((a,b)=>(rank[a.status]-rank[b.status])||((a.arrivedAt??Infinity)-(b.arrivedAt??Infinity))||String(a.id).localeCompare(String(b.id),'de',{numeric:true}));
 let siteDem=0;for(const c of y.list)siteDem+=led.dem.get(c.id)||0;siteDem=round2(siteDem);
 const intro=`<div class="notice">Containerchassis bringen Seecontainer vom Seehafen und stellen sie hier ab (je Hof ${fmt(BUILDINGS.containeryard?.teu||0)} TEU, 40-Fuß-Container = ${fmt(TEU)} TEU). Entladen automatisch, älteste zuerst, sobald Dock, Lagerkraft und bei Paletten ein Stapler frei sind; „Vorziehen“ stellt einen Container an die Spitze. Nach der Freizeit läuft Lagergeld je Container bis zur Abholung des Leercontainers.</div>`;
 const head=`<div class="numbers">${num(`${fmt(y.used)} / ${fmt(y.cap)}`,'TEU belegt')}${num(fmt(y.active),'Container im Hof')}${num(fmt(y.running),'Lagergeld läuft',y.running>0)}${num(euro(siteDem),'Lagergeld angefallen',siteDem<0)}</div>`;
 const noYard=!y.yards.length?`${empty('Kein Containerhof','Ohne Containerhof warten Containerchassis am Tor („'+YARD_WAIT.noYard+'“). Abstellen am Dock ist nicht erlaubt.')}<div class="actions">${button('Containerhof bauen','build','containeryard','primary')}</div>`:'';
 const waits=y.waiting.length?`<div class="notice warn" role="note"><b>${fmt(y.waiting.length)} ${y.waiting.length===1?'Chassis wartet':'Chassis warten'} am Tor:</b> ${y.waiting.map(a=>`${esc(a.plate)} · ${esc(a.waitReason)} · ${fmt(a.containers)} Container`).join('; ')}. ${y.yards.length?'Container entladen lassen oder weiteren Containerhof bauen.':''}<div class="actions">${button('Torbuch','panel-yard')}${button('Containerhof bauen','build','containeryard')}</div></div>`:'';
 const table=rows.length?`<div class="table-wrap"><table class="container-table"><thead><tr><th>Container</th><th>Inhalt</th><th>Entladen</th><th>Status</th><th>Freizeit / Lagergeld</th><th class="num">Lagergeld</th><th>Abholung</th><th></th></tr></thead><tbody>${rows.map(c=>{const k=contracts.get(c.contractId),dem=round2(led.dem.get(c.id)||0),tone=containerTone(s,c),dock=c.dock?dockLabel(s,c.dock):'';
  return `<tr class="${hubFocus===c.id?'selected':''}" data-container-row="${esc(c.id)}"><td><b>${esc(c.id)}</b><br><small class="muted">${esc(k?.shipper||c.contractId||'—')}${c.contractId?' · '+esc(c.contractId):''}</small></td><td>${esc(containerContent(c))}${c.orderIds.length?`<br><small class="muted">${fmt(c.orderIds.length)} ${c.orderIds.length===1?'Auftrag':'Aufträge'}</small>`:''}</td><td>${fmt(c.unloaded)} / ${fmt(c.qty)}${progress(c.qty?c.unloaded/c.qty:0)}</td><td><span class="chip tone-${tone}">${esc(CT_STATUS[c.status]||c.status)}</span>${dock?`<br><small class="muted">${esc(dock)}</small>`:''}${c.priority&&['arriving','yard'].includes(c.status)?'<br><small class="muted">vorgezogen</small>':''}${c.waitReason&&c.status==='yard'?`<br><small class="muted">${esc(c.waitReason)}${Number.isFinite(c.waitSince)?' · seit '+fmt(s.t-c.waitSince)+' Min.':''}</small>`:''}</td><td>${containerFreeHtml(s,c,k)}</td><td class="num">${dem?`<span class="money-minus">${euro(dem)}</span>`:euro(0)}</td><td>${c.pickupAt!=null?(c.status==='gone'?'Abgeholt '+esc(clockOf(c.goneAt%1440)):`geplant ${esc(time(c.pickupAt))}`):'—'}</td><td>${['arriving','yard'].includes(c.status)&&c.unloaded<c.qty&&!c.priority?button('Vorziehen','unstuffContainer',c.id):''}</td></tr>`;}).join('')}</tbody></table></div>`:empty('Keine Container am Standort','Container entstehen aus Seeimport-Verträgen (Frachtverträge).');
 const yards=y.yards.length?`<section class="section"><div class="section-title"><h3>Containerhöfe</h3>${badge(teuText(y),y.used>=y.cap&&y.cap?'warn':'good')}</div>${y.yards.map((b,i)=>`<div class="list-row"><div><strong>Containerhof ${i+1} <span class="chip tone-${b.enabled&&b.condition>0?'good':'bad'}">${b.enabled&&b.condition>0?'In Betrieb':b.enabled?'Defekt':'Pausiert'}</span></strong><small>${fmt(BUILDINGS.containeryard?.teu||0)} TEU · Zustand ${fmt(b.condition)} % · ${esc(b.id)}</small></div>${button('Akte','select',b.id)}</div>`).join('')}</section>`:'';
 return `${intro}${head}${noYard}${waits}<section class="section"><div class="section-title"><h3>Container</h3>${badge(teuText(y),y.cap&&y.used>=y.cap?'warn':'')}</div>${table}</section>${yards}`;}
/** Station „Containerhof“ im Standortfluss: TEU belegt/gesamt, laufendes Lagergeld, wartende Chassis. */
function collectContainers(s,h,{alert,siteName}){
 const y=yardSummary(s,h.site);h.cy={show:y.yards.length>0||y.list.some(c=>c.status!=='gone'),used:y.used,cap:y.cap,inYard:y.inYard,atDock:y.atDock,empty:y.empty,arriving:y.arriving,running:y.running,waiting:y.waiting.length,focus:y.yards[0]?.id||null};
 h.cyRelevant=h.cy.show||(s.containers||[]).length>0||(s.contracts||[]).some(isContainerC)||s.buildings.some(b=>b.type==='containeryard')||containersUnlocked(s);
 for(const a of s.yard||[])if(chassisYardWait(a)&&a.phase!=='gone'){const w=arrivalWait(a,s.t);alert('cw:'+a.id,a.waitReason===YARD_WAIT.noYard?'bad':'wait',`${a.waitReason} · Chassis ${a.plate} wartet`,`${fmt(a.containers)} Container · seit ${fmt(w)} Min. · ${siteName(a.site)}`,a.id);}
 if(!(s.containers||[]).length)return;
 const contracts=new Map((s.contracts||[]).map(c=>[c.id,c]));let led=null;
 for(const c of s.containers){const k=contracts.get(c.contractId),rate=k?.demurragePerHour;
  if(demurrageRunning(s,c)){led??=containerLedger(s);const dem=round2(led.dem.get(c.id)||0);alert('dm:'+c.id,'bad',`Lagergeld läuft · Container ${c.id}`,`seit ${time(c.freeUntil)}${Number.isFinite(rate)?` · ${rateEuro(rate)}/Std.`:''} · bisher ${euro(dem)} · ${CT_STATUS[c.status]} · ${siteName(c.site)}`,c.id);}
  else if(CT_DEMURRAGE.has(c.status)&&c.freeUntil!=null&&c.freeUntil-s.t<CT_SOON)alert('ft:'+c.id,'wait',`Freizeit endet in ${fmt(c.freeUntil-s.t)} Min. · Container ${c.id}`,`danach Lagergeld${Number.isFinite(rate)?` ${rateEuro(rate)}/Std.`:''} · ${containerContent(c)} · ${CT_STATUS[c.status]} · ${siteName(c.site)}`,c.id);}
}
function renderContainerStation(h){const y=h.cy;putHidden('stl-containeryard',!y.show);if(!y.show)return;
 station('containeryard',`${fmt(y.used)}/${fmt(y.cap)}`,!y.cap&&!y.used?'Kein Containerhof in Betrieb':parts([[y.inYard,'im Hof'],[y.atDock,'am Dock'],[y.empty,'leer'],[y.arriving,'angekündigt'],[y.running,'Lagergeld läuft'],[y.waiting,'Chassis wartet']])||'TEU frei · keine Container',y.running?'bad':y.waiting?'wait':y.atDock?'move':'neutral');}
/** Menge im Torbuch: Lkw Einheiten entladen/gesamt; Chassis Container und Inhalt (Inhalt aus s.containers, sonst itemOf des Vertrags). */
function arrivalQty(s,a){if(a.kind!=='container')return `${fmt(a.unloaded)} / ${fmt(a.parcels)} ${arrivalUnit(a)}`;
 if(a.pickup)return `${fmt(a.containers)} Leercontainer`;
 const first=(s.containers||[]).find(c=>a.containerIds?.includes(c.id)),k=(s.contracts||[]).find(c=>c.id===a.contractId),item=first?.content||(k?itemOf(k):'parcel');
 return `${fmt(a.containers)} Container<br><small class="muted">${fmt(a.parcels)} ${contentWord(item,a.parcels)}${['exit','gone'].includes(a.phase)?' · abgestellt':''}</small>`;}
/** Torbuch: Kurzzeile zum Containerhof des Standorts (nur mit Hof oder Containern). */
function yardContainerLine(s,site){const y=yardSummary(s,site);if(!y.yards.length&&!y.list.some(c=>c.status!=='gone'))return '';
 return `<section class="section"><div class="section-title"><h3>Containerhof</h3>${badge(teuText(y),y.running?'bad':y.waiting.length?'warn':'')}</div><div class="list-row"><div><strong>${parts([[y.inYard,'im Hof'],[y.atDock,'am Dock'],[y.empty,'leer'],[y.arriving,'angekündigt']])||'Keine Container'}</strong><small>${y.running?`Lagergeld läuft für ${fmt(y.running)} Container`:'Kein Lagergeld'}${y.waiting.length?` · ${fmt(y.waiting.length)} Chassis wartet`:''}</small></div>${button('Containerhof','panel-containers')}</div></section>`;}
/** Akte Containerhof (Gebäude): Kapazität, Belegung des Standorts, Lagergeld, Verweis auf das Fenster. */
function containeryardHtml(s,b){const y=yardSummary(s,b.site),led=containerLedger(s);let dem=0;for(const c of y.list)dem+=led.dem.get(c.id)||0;
 return kv('Kapazität',`${fmt(BUILDINGS.containeryard?.teu||0)} TEU · 40-Fuß-Container = ${fmt(TEU)} TEU`)+kv('Belegt am Standort',teuText(y))+progress(y.cap?y.used/y.cap:0)+kv('Container',parts([[y.inYard,'im Hof'],[y.atDock,'am Dock'],[y.empty,'leer, Abholung geplant'],[y.arriving,'angekündigt']])||'Keine')+kv('Lagergeld läuft',y.running?`<span class="money-minus">${fmt(y.running)} Container</span>`:'Nein')+kv('Lagergeld angefallen',dem?`<span class="money-minus">${euro(round2(dem))}</span>`:euro(0))+(y.waiting.length?kv('Wartende Chassis',`<span class="money-minus">${fmt(y.waiting.length)} · ${esc(y.waiting[0].waitReason)}</span>`):'')+
 `<p class="fine">Belegter Containerhof lässt sich nicht abreißen oder versetzen. Ausgeschaltet oder defekt nimmt er keine neuen Container an; abgestellte bleiben.</p><div class="actions">${button('Containerhof öffnen','panel-containers','','primary')}</div>`;}
/* ---- Linienverkehr Welle 3a-2 (A10): Fenster „Linien“, Hauptlauf im Standortfluss, Glocke, Paketreise ----
 * Lesesicht auf s.lines/s.linehauls (linehaul.js, W3-S2) und lane.site/order.deliverySite (contracts.js, W3-S1).
 * Änderungen nur über send(): createLine, updateLine, deleteLine, cancelLinehaul. Keine Buchung, keine Bestandsänderung.
 * Zeiten nur aus dem Zustand: Fahrplan (nextDeparture), departAt, remaining, phaseEnd. Keine geschätzten Ankunftszeiten. */
let lineEdit=null,lineDraft={};
const LH_ACTIVE=new Set(['loading','transit','unloading','returning']);
const LH_PHASE={loading:'Beladung',transit:'Hauptlauf unterwegs',unloading:'Entladung am Ziel-Hub',returning:'Rückfahrt leer',complete:'Abgeschlossen',cancelled:'Storniert'};
const LINE_WAIT_ALERT=15;
function siteNameOf(s,id){return s.sites.find(x=>x.id===id)?.name||id||'—';}
function lineTitle(s,l){return `${siteNameOf(s,l.from)} → ${siteNameOf(s,l.to)}`;}
function hhmm(m){return clockOf(((m%1440)+1440)%1440);}
const remoteOrder=o=>!!o&&o.kind==='logistics'&&o.deliverySite!==undefined&&deliverySiteOf(o)!==o.site;
const lineFor=(s,from,to)=>(s.lines||[]).find(l=>l.from===from&&l.to===to)||null;
const lineTrip=(s,l)=>(s.linehauls||[]).find(x=>x.lineId===l.id&&LH_ACTIVE.has(x.status))||null;
const lineMissed=l=>!!l.wait&&l.wait!==LINE_WAIT.empty;
/** Abfahrtsliste „06:30, 14:00“ → Minuten 0–1439, sortiert. Fehler als Text. */
function parseDepartures(text){const parts=String(text??'').split(/[\s,;]+/).filter(Boolean),out=[];
 for(const p of parts){const m=/^(\d{1,2})[:.](\d{2})$/.exec(p);if(!m||+m[1]>23||+m[2]>59)return {error:`Abfahrtszeit „${p}“ ungültig. Format HH:MM, z. B. 06:30.`};out.push(+m[1]*60+ +m[2]);}
 if(!out.length)return {error:'Mindestens eine Abfahrtszeit angeben (HH:MM).'};if(new Set(out).size!==out.length)return {error:'Abfahrtszeit doppelt.'};
 if(out.length>MAX_DEPARTURES)return {error:`Höchstens ${MAX_DEPARTURES} Abfahrten je Linie.`};return {departures:out.sort((a,b)=>a-b)};}
/** Fremdware am Standort from für Zustellstandort to: frei im Lager, für Linienfahrt reserviert, noch in Sortierung. */
function lineCargo(s,from,to){const orders=new Map(s.orders.map(o=>[o.id,o])),r={free:0,held:0,inbound:0,orders:new Set()};
 for(const b of s.batches){if(!(b.qty>0)||b.site!==from||from===to)continue;const o=orders.get(b.owner);if(!o||o.status!=='active'||deliverySiteOf(o)!==to)continue;
  if(b.location==='stock'){const res=Math.min(b.qty,b.reserved||0);r.free+=b.qty-res;r.held+=res;r.orders.add(o.id);}else if(b.location==='inbound'){r.inbound+=b.qty;r.orders.add(o.id);}}
 return r;}
/** Aktive Fremdgebiet-Aufträge ohne Linie Annahme-Hub → Zustellstandort; offene Menge ohne bereits am Ziel liegende Ware. */
function missingLines(s){const at=new Map();for(const b of s.batches)if(b.qty>0)at.set(b.owner+'@'+b.site,(at.get(b.owner+'@'+b.site)||0)+b.qty);
 const m=new Map();for(const o of s.orders){if(o.status!=='active'||!remoteOrder(o)||lineFor(s,o.site,o.deliverySite))continue;
  const units=Math.max(0,o.qty-o.delivered-(at.get(o.id+'@'+o.deliverySite)||0));if(!units)continue;
  const k=o.site+'>'+o.deliverySite,x=m.get(k)||{key:k,from:o.site,to:o.deliverySite,orders:0,units:0};x.orders++;x.units+=units;m.set(k,x);}
 return [...m.values()];}
function tripPhase(s,lh){if(lh.status==='loading'&&lh.loadDone)return s.t<lh.departAt?'Abfahrbereit':'Abfahrt verzögert';return LH_PHASE[lh.status]||label(lh.status);}
function tripRest(s,lh){if(lh.blocked)return 'wartet';if(lh.status==='loading')return lh.loadDone?(s.t<lh.departAt?`Abfahrt in ${fmt(lh.departAt-s.t)} Min.`:'—'):fmt(lh.remaining)+' Min. Beladung';return LH_ACTIVE.has(lh.status)?fmt(lh.remaining)+' Min.':'—';}
/** Ankunft am Ziel-Hub nur im Hauptlauf ohne Wartegrund: jetzt + Restminuten. */
function tripEta(s,lh){return lh.status==='transit'&&!lh.blocked&&lh.remaining>0?s.t+lh.remaining:null;}
/** Verzug einer Fahrt in Minuten aus Zustandsfeldern: Phasenbeginn, Dauer, Rest. Beladung: nach Fahrplanabfahrt bzw. Wartezeit seit Ladeschluss. */
function tripDelay(s,lh){const done=(lh.duration||0)-(lh.remaining||0);
 if(lh.status==='loading')return Math.max(0,s.t-lh.departAt,lh.blocked&&!lh.loadDone?(s.t-lh.cutoffAt)-done:0);
 if(!lh.blocked)return 0;
 if(lh.status==='transit')return Math.max(0,s.t-lh.departedAt-done);
 if(lh.status==='unloading'){const v=s.vehicles.find(x=>x.id===lh.vehicleId),sp=VEHICLES[v?.type]?.speed||1;return Math.max(0,s.t-lh.departedAt-Math.ceil(lh.distance/sp)-done);}
 if(lh.status==='returning')return Math.max(0,s.t-lh.arrivedAt-done);return 0;}
/** HUD: Station „Hauptlauf“, Glocke (fehlende Linie, verpasste Abfahrt, Linienfahrt mit Verzug). */
function collectLines(s,h,{alert,orders,siteName}){const site=h.site,lines=s.lines||[],out=new Map();let n=0;h.haul=null;
 for(const x of missingLines(s))alert('nl:'+x.key,'bad',`Hauptlauf fehlt · ${siteName(x.from)} → ${siteName(x.to)}`,`${fmt(x.units)} Einheiten aus ${fmt(x.orders)} ${x.orders===1?'Auftrag':'Aufträgen'} · Linie anlegen`,null,'lines');
 for(const l of lines){if(lineMissed(l)&&l.active){const nd=nextDeparture(s,l);alert('lm:'+l.id,'wait',`Linie ${siteName(l.from)} → ${siteName(l.to)} · Abfahrt verpasst`,`${l.wait} · ${time(l.waitAt)}${nd?' · nächste Abfahrt '+hhmm(nd.departAt):''}`,l.id);}
  else if(!l.active&&lineCargo(s,l.from,l.to).free>0)alert('lp:'+l.id,'wait',`Linie ${siteName(l.from)} → ${siteName(l.to)} pausiert`,'Sendungen liegen bereit · Linie aktivieren',l.id);}
 for(const lh of s.linehauls||[]){if(!LH_ACTIVE.has(lh.status))continue;const d=tripDelay(s,lh);
  if(d>LINE_WAIT_ALERT)alert('lw:'+lh.id,'wait',`Linienfahrt wartet · ${fmt(d)} Min. Verzug`,`${siteName(lh.from)} → ${siteName(lh.to)} · ${tripPhase(s,lh)}${lh.blocked?' · '+lh.blocked:''}`,lh.id);}
 if(s.sites.length<2&&!lines.length)return;
 for(const b of s.batches){if(!(b.qty>0)||b.site!==site||(b.location!=='stock'&&b.location!=='inbound'))continue;const o=orders.get(b.owner);if(!remoteOrder(o)||deliverySiteOf(o)===site)continue;const to=deliverySiteOf(o);out.set(to,(out.get(to)||0)+b.qty);n+=b.qty;}
 const trips=(s.linehauls||[]).filter(x=>LH_ACTIVE.has(x.status)&&(x.from===site||x.to===site));
 h.haul={n,out,trips,lines:lines.filter(l=>l.from===site)};}
function renderLineStation(h){const x=h.haul,s=V().state;putHidden('stl-linehaul',!x||!(x.n||x.trips.length||x.lines.length));if(!x)return;
 let noLine=false;const sub=[...x.out].sort((a,b)=>b[1]-a[1]).map(([to,n])=>{const l=lineFor(s,h.site,to),nd=l&&l.active?nextDeparture(s,l):null;if(!l)noLine=true;return `→ ${siteNameOf(s,to)} ${fmt(n)} · ${nd?'Abfahrt '+hhmm(nd.departAt):l?'Linie pausiert':'keine Linie'}`;});
 const first=x.lines.filter(l=>l.active).map(l=>nextDeparture(s,l)).filter(Boolean).sort((a,b)=>a.departAt-b.departAt)[0];
 if(!sub.length)sub.push(x.trips.length?`${fmt(x.trips.length)} ${x.trips.length===1?'Fahrt':'Fahrten'} laufend`:first?'Keine Sendungen · nächste Abfahrt '+hhmm(first.departAt):'Keine Sendungen für andere Standorte');
 else if(x.trips.length)sub.push(`${fmt(x.trips.length)} ${x.trips.length===1?'Fahrt':'Fahrten'} laufend`);
 station('linehaul',fmt(x.n),sub.join(' · '),noLine?'bad':x.trips.some(t=>t.blocked)?'wait':x.trips.length?'move':x.n?'wait':'neutral');}
function newLine(key){const [from,to]=String(key||'').split('>');lineEdit=null;lineDraft=from?{from,to}:{};openPanel('lines');}
function lineVehicles(s,from,edit){return s.vehicles.filter(v=>v.site===from&&v.status!=='rentalReturned'&&(v.id===edit?.vehicleId||(v.status==='idle'&&!(s.lines||[]).some(l=>l.vehicleId===v.id&&l.id!==edit?.id)))).sort((a,b)=>(a.type==='truck'?0:1)-(b.type==='truck'?0:1));}
function lineSubmit(d,id){const p=parseDepartures(d.departures);if(p.error){toast(p.error,true);return {ok:false,message:p.error};}
 const cutoff=d.cutoff===''||d.cutoff==null?LINE_CUTOFF:Number(d.cutoff),vehicleId=d.vehicleId||null;
 if(!Number.isInteger(cutoff)||cutoff<0||cutoff>720){toast('Ladeschluss: 0 bis 720 Minuten vor Abfahrt.',true);return {ok:false};}
 const r=send(id?{type:'updateLine',id,departures:p.departures,cutoff,vehicleId}:{type:'createLine',from:d.from,to:d.to,departures:p.departures,cutoff,vehicleId},true);
 if(r.ok){toast(id?'Linie geändert. Gilt ab dem nächsten Ladeschluss.':'Linie eingerichtet.');hubFocus=id||r.id||null;lineEdit=null;lineDraft={};}
 renderPanel(true);return r;}
function lineForm(s){const edit=lineEdit?(s.lines||[]).find(l=>l.id===lineEdit):null;
 const d=edit?{from:edit.from,to:edit.to,departures:edit.departures.map(hhmm).join(', '),vehicleId:edit.vehicleId||'',cutoff:edit.cutoff,...lineDraft}:{departures:'06:30, 14:00',cutoff:LINE_CUTOFF,...lineDraft};
 const from=s.sites.some(x=>x.id===d.from)?d.from:s.selectedSite,targets=s.sites.filter(x=>x.id!==from),to=targets.some(x=>x.id===d.to)?d.to:targets[0]?.id,vs=lineVehicles(s,from,edit);
 const exists=!edit&&to&&lineFor(s,from,to);
 return `<section class="section" id="lineForm"><div class="section-title"><h3>${edit?'Linie bearbeiten':'Neue Linie'}</h3>${edit?badge(lineTitle(s,edit)):''}</div><form data-form="line" ${edit?`data-id="${esc(edit.id)}"`:''} class="form-grid">
${edit?`<p class="fine" style="grid-column:1/-1">Start und Ziel bleiben. Änderungen gelten ab dem nächsten Ladeschluss; eine laufende Fahrt behält Lkw und Ladung.</p>`:`${field('Start (Annahme-Hub)',`<select name="from">${s.sites.map(x=>`<option value="${esc(x.id)}" ${x.id===from?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`)}${field('Ziel (Zustell-Hub)',`<select name="to">${targets.map(x=>`<option value="${esc(x.id)}" ${x.id===to?'selected':''}>${esc(x.name)}${lineFor(s,from,x.id)?' · Linie besteht':''}</option>`).join('')}</select>`)}`}
${field('Abfahrtszeiten (HH:MM, mit Komma getrennt)',`<input name="departures" value="${esc(d.departures)}" placeholder="06:30, 14:00" autocomplete="off" required>`,true)}
${field('Lkw · frei am Startstandort',`<select name="vehicleId"><option value="">Ohne Lkw (später zuordnen)</option>${vs.map(v=>`<option value="${esc(v.id)}" ${v.id===(d.vehicleId||'')?'selected':''}>${esc(v.name)} · ${esc(VEHICLES[v.type]?.name||v.type)} · ≈ ${fmt(maxLoad(v,'parcel'))} Pakete${v.condition<15?' · Wartung nötig':''}</option>`).join('')}</select>`)}
${field('Ladeschluss (Min. vor Abfahrt)',`<input name="cutoff" type="number" min="0" max="720" step="1" value="${esc(d.cutoff)}" required>`)}
${(()=>{const p=parseDepartures(d.departures);return p.error?'':`<div style="grid-column:1/-1">${lineShiftWarning(s,from,to,p.departures,vs.find(v=>v.id===d.vehicleId)||(edit?.vehicleId?s.vehicles.find(v=>v.id===edit.vehicleId):null))}</div>`;})()}${!vs.length?`<p class="fine" style="grid-column:1/-1">Kein freier Lkw an ${esc(siteNameOf(s,from))}. Linie ohne Lkw verpasst jede Abfahrt.</p>`:''}${exists?`<p class="fine money-minus" style="grid-column:1/-1">Linie ${esc(siteNameOf(s,from))} → ${esc(siteNameOf(s,to))} besteht bereits; bestehende Linie bearbeiten.</p>`:''}
<button class="primary">${edit?'Änderung speichern':'Linie einrichten'}</button>${edit?`<button type="button" data-action="cancelLineEdit">Abbrechen</button>`:''}</form></section>`;}
function lineCard(s,l){const nd=l.active?nextDeparture(s,l):null,v=l.vehicleId?s.vehicles.find(x=>x.id===l.vehicleId):null,trip=lineTrip(s,l),c=lineCargo(s,l.from,l.to),miss=lineMissed(l);
 const [st,tone]=!l.active?['Pausiert','']:trip?[tripPhase(s,trip),trip.blocked?'warn':'good']:miss?['Abfahrt verpasst','warn']:!v?['Kein Lkw','warn']:['Bereit','good'];
 const km=siteDistance(s,l.from,l.to);
 return `<div class="card${hubFocus===l.id?' selected':''}" data-line="${esc(l.id)}"><div class="card-top"><div><h3>${esc(lineTitle(s,l))}</h3><small>${esc(l.id)}${km?' · '+fmt(km)+' km':''}</small></div>${badge(st,tone)}</div>
<div class="numbers">${num(nd?hhmm(nd.departAt):'—','Nächste Abfahrt')}${num(nd?hhmm(nd.cutoffAt):'—','Ladeschluss')}${num(fmt(c.free),'Bereit für Ziel')}</div>
${kv('Abfahrten',`${l.departures.map(hhmm).join(' · ')} · ${fmt(l.departures.length)}× täglich`)}${kv('Ladeschluss',fmt(l.cutoff)+' Min. vor Abfahrt')}
${kv('Lkw',v?`${esc(v.name)}${v.name!==VEHICLES[v.type]?.name?' · '+esc(VEHICLES[v.type]?.name||v.type):''} · ${esc(label(v.status))}${v.site!==l.from?' · <span class="money-minus">nicht am Startstandort</span>':''}`:'<span class="money-minus">Kein Lkw zugeordnet</span>')}
${kv('Nächste Abfahrt',nd?`${time(nd.departAt)} · in ${fmt(nd.departAt-s.t)} Min. · Ladeschluss ${hhmm(nd.cutoffAt)}`:l.active?'—':'Linie pausiert')}
${kv('Sendungen für '+siteNameOf(s,l.to),`${fmt(c.free)} frei im Lager${c.held?` · ${fmt(c.held)} für Fahrt reserviert`:''}${c.inbound?` · ${fmt(c.inbound)} in Sortierung`:''} · ${fmt(c.orders.size)} ${c.orders.size===1?'Auftrag':'Aufträge'}`)}
${miss?kv('Wartegrund',`<span class="money-minus">${esc(l.wait)}</span> · ${time(l.waitAt)}`):l.wait?kv('Letzter Ladeschluss',`${esc(l.wait)} · ${time(l.waitAt)}`):''}${l.missed?kv('Verpasste Abfahrten',fmt(l.missed)):''}
${lineShiftWarning(s,l.from,l.to,l.departures,v)}${trip?kv('Laufende Fahrt',`${esc(tripPhase(s,trip))} · ${fmt(trip.qty)} Einheiten · ${esc(tripRest(s,trip))}${trip.blocked?' · <span class="money-minus">'+esc(trip.blocked)+'</span>':''}`):''}
<div class="actions">${button('Bearbeiten','editLine',l.id)}${button(l.active?'Pausieren':'Aktivieren','toggleLine',l.id)}${trip?`<button disabled title="Linie hat eine laufende Fahrt">Löschen</button>`:button('Löschen','deleteLine',l.id,'danger')}</div></div>`;}
function tripCard(s,lh){const v=s.vehicles.find(x=>x.id===lh.vehicleId),eta=tripEta(s,lh),active=LH_ACTIVE.has(lh.status),delay=active?tripDelay(s,lh):0;
 return `<div class="card${hubFocus===lh.id?' selected':''}" data-linehaul="${esc(lh.id)}"><div class="card-top"><div><h3>${esc(siteNameOf(s,lh.from))} → ${esc(siteNameOf(s,lh.to))}</h3><small>${esc(lh.id)} · ${esc(v?.name||lh.vehicleId)}</small></div>${badge(active?tripPhase(s,lh):label(lh.status),lh.blocked?'warn':lh.status==='complete'?'good':'')}</div>
${active?kv('Phase',`<span class="chip tone-${lh.blocked?'wait':'move'}">${esc(tripPhase(s,lh))}</span>`):''}${active?kv('Restzeit',esc(tripRest(s,lh))):''}
${kv('Menge',`${fmt(lh.qty)} Einheiten · ${fmt(lh.orders.length)} ${lh.orders.length===1?'Auftrag':'Aufträge'}`)}${kv('Abfahrt',lh.departedAt!=null?time(lh.departedAt)+(lh.departedAt>lh.departAt?` · ${fmt(lh.departedAt-lh.departAt)} Min. verspätet`:''):'laut Fahrplan '+time(lh.departAt))}
${eta!=null?kv('Ankunft Ziel-Hub',time(eta)+' (Restfahrzeit, ohne Wartezeiten)'):''}${lh.arrivedAt!=null?kv('Entladen am Ziel',time(lh.arrivedAt)):''}${kv('Fahrtkosten',(lh.departedAt!=null?'':'bei Abfahrt ')+euro(lh.cost))}
${lh.blocked?`<div class="notice" role="status">${esc(lh.blocked)}${delay?` · ${fmt(delay)} Min. Verzug`:''}</div>`:''}${lh.cancelReason?kv('Storno',esc(lh.cancelReason)):''}
${lh.status==='loading'?`<div class="actions">${button('Vor Abfahrt stornieren','cancelLinehaul',lh.id)}</div>`:''}</div>`;}
function linesPanel(){const s=V().state,lines=s.lines||[],trips=s.linehauls||[];
 const intro=`<div class="notice">Linien fahren Sendungen für Zustellgebiete anderer Standorte nach festem Fahrplan zum Ziel-Hub (Hauptlauf). Zum Ladeschluss reserviert die Linie alle bereitliegenden Sendungen für das Ziel, früheste Frist zuerst, bis der Lkw voll ist. Verpasste Abfahrt: Ware fährt mit der nächsten.</div>`;
 if(s.sites.length<2&&!lines.length)return intro+empty('Nur ein Standort','Linien verbinden zwei eigene Standorte. Zweiten Standort unter „Standorte“ erwerben.')+`<div class="actions">${button('Standorte öffnen','panel-network','','primary')}</div>`;
 const need=missingLines(s),list=filtered(lines),running=trips.filter(x=>LH_ACTIVE.has(x.status)),done=trips.filter(x=>!LH_ACTIVE.has(x.status)).slice(-8).reverse();
 return intro+(need.length?`<section class="section"><div class="section-title"><h3>Hauptlauf fehlt</h3>${badge(fmt(need.length)+(need.length===1?' Verbindung':' Verbindungen'),'bad')}</div>${need.map(x=>`<div class="list-row"><div><strong>${esc(siteNameOf(s,x.from))} → ${esc(siteNameOf(s,x.to))}</strong><small>${fmt(x.units)} Einheiten aus ${fmt(x.orders)} ${x.orders===1?'Auftrag':'Aufträgen'} ohne Linie</small></div>${button('Linie anlegen','newLine',x.key,'primary')}</div>`).join('')}</section>`:'')+
 `<section class="section"><div class="section-title"><h3>Linien</h3>${badge(fmt(lines.length)+' eingerichtet',lines.length?'good':'')}</div>${list.map(l=>lineCard(s,l)).join('')||'<p class="fine">Noch keine Linie.</p>'}</section>`+lineForm(s)+
 `<section class="section"><div class="section-title"><h3>Laufende Fahrten</h3>${badge(fmt(running.length)+' unterwegs',running.length?'good':'')}</div>${running.map(x=>tripCard(s,x)).join('')||'<p class="fine">Keine laufende Linienfahrt.</p>'}</section>`+
 (done.length?`<details><summary>Letzte Fahrten · ${fmt(done.length)}</summary>${done.map(x=>tripCard(s,x)).join('')}</details>`:'');}
/** Versandformular für Auftrag eines anderen Zustellstandorts: ausgegraut mit Hinweis. */
function dispatchBlocked(s,o){const to=deliverySiteOf(o),l=lineFor(s,o.site,to),nd=l&&l.active?nextDeparture(s,l):null;
 return `<div class="dispatch-off" aria-disabled="true"><div class="form-grid"><label class="field full">Fahrzeug<select disabled><option>Zustellung nur ab ${esc(siteNameOf(s,to))}</option></select></label><button class="primary" disabled style="grid-column:auto;align-self:end">Lieferung starten →</button></div></div><p class="fine">Zustellgebiet gehört zu ${esc(siteNameOf(s,to))}. ${s.selectedSite===o.site?`Ware fährt per Linie dorthin${nd?`, nächste Abfahrt ${hhmm(nd.departAt)}`:l?' (Linie pausiert)':' – <b>Linie fehlt</b>'}.`:'Am Standort '+esc(siteNameOf(s,to))+' zustellen.'}</p><div class="actions">${l?button('Linien','panel-lines'):button('Linie anlegen','newLine',o.site+'>'+to,'primary')}${button('Zu '+esc(siteNameOf(s,to)),'site',to)}</div>`;}
function laneRemoteText(s,c,l){const at=laneSite(c,l);if(at===undefined||at===c.site)return '';const U1=unitSingular(c);
 return ` · <b>Zustellung ab ${esc(siteNameOf(s,at))}</b>${l.surcharge?` · Zuschlag +${rateEuro(l.surcharge)} je ${U1}`:''}${l.extraSla?` · Frist +${slaText(l.extraSla)}`:''}`;}
function haulNote(s,c){if(c.status==='ended')return '';const to=[...new Set((c.lanes||[]).map(l=>laneSite(c,l)).filter(x=>x!==undefined&&x!==c.site))];
 return to.map(id=>{const l=lineFor(s,c.site,id),nd=l&&l.active?nextDeparture(s,l):null,names=c.lanes.filter(x=>laneSite(c,x)===id).map(x=>x.name).join(', ');
  return l?`<div class="notice good" role="note">Hauptlauf ${esc(siteNameOf(s,c.site))} → ${esc(siteNameOf(s,id))} über Linie${nd?` · nächste Abfahrt ${hhmm(nd.departAt)}`:' · Linie pausiert'} (${esc(names)}).</div>`
   :`<div class="notice warn" role="note"><b>Hauptlauf nötig:</b> Keine Linie ${esc(siteNameOf(s,c.site))} → ${esc(siteNameOf(s,id))}. ${esc(names)} ${c.status==='offer'?'würde':'wird'} nur ab ${esc(siteNameOf(s,id))} zugestellt.<div class="actions">${button('Linie anlegen','newLine',c.site+'>'+id,'primary')}</div></div>`;}).join('');}
/** Fahrzeugakte: Hauptlauf und zugeordnete Linien. */
function vehicleLineHtml(s,v){const lh=v.linehaul?(s.linehauls||[]).find(x=>x.id===v.linehaul):null,ls=(s.lines||[]).filter(l=>l.vehicleId===v.id);
 return (lh?kv('Hauptlauf',`${esc(siteNameOf(s,lh.from))} → ${esc(siteNameOf(s,lh.to))} · ${esc(tripPhase(s,lh))} · ${fmt(lh.qty)} Einheiten · ${esc(tripRest(s,lh))}${lh.blocked?' · '+esc(lh.blocked):''}`):'')+
  (ls.length?kv('Linien',ls.map(l=>esc(lineTitle(s,l))).join('<br>')+` <button class="ref-link" data-panel="lines">Linien</button>`):'');}
/** Paketreise (Konzept 2.2) eines Hub-Auftrags aus Chargen, Hofeintrag und Linienfahrten. Zeiten nur aus phaseEnd/eta/Fahrplan/remaining. */
function journeyHtml(s,o){if(o.airExport)return airJourneyHtml(s,o);const remote=remoteOrder(o),A=o.site,B=deliverySiteOf(o),pallet=o.item==='pallet';
 const q={sortA:0,readyA:0,resA:0,haul:0,unloadB:0,sortB:0,readyB:0,out:0};let held=0;
 const trips=(s.linehauls||[]).filter(x=>LH_ACTIVE.has(x.status)&&x.orders.some(y=>y.orderId===o.id)),cargo=new Map();for(const lh of trips)for(const id of lh.cargo)cargo.set(id,lh);
 for(const b of s.batches){if(b.owner!==o.id||!(b.qty>0))continue;held+=b.qty;
  if(b.location==='vehicle'){const lh=cargo.get(b.id);if(lh){if(lh.status==='unloading')q.unloadB+=b.qty;else q.haul+=b.qty;}else q.out+=b.qty;continue;}
  if(remote&&b.site===B){if(b.location==='inbound')q.sortB+=b.qty;else q.readyB+=b.qty;}
  else if(b.location==='inbound')q.sortA+=b.qty;else{q.readyA+=b.qty;q.resA+=Math.min(b.qty,b.reserved||0);}}
 const arrive=o.status==='active'?Math.max(0,o.qty-o.delivered-held-(o.returnedQty||0)):0,a=(s.yard||[]).find(x=>x.orderIds?.includes(o.id)&&x.phase!=='gone');
 const trip=trips.find(x=>x.status!=='returning'),l=remote?lineFor(s,A,B):null,nd=l&&l.active?nextDeparture(s,l):null,loadTrip=trips.find(x=>x.status==='loading');
 const steps=[];
 steps.push({t:'Annahme-Hub · '+siteNameOf(s,A),n:arrive,sub:a?`${a.plate} · ${arrivalPhase(a)}${a.waitReason?' · '+a.waitReason:''}${a.phase==='approach'&&Number.isFinite(a.eta)?' · Ankunft '+hhmm(a.eta):!a.waitReason&&a.phaseEnd>s.t?' · Phase bis '+hhmm(a.phaseEnd):''}`:arrive?'Lkw des Versenders noch nicht angekündigt':'',tone:a?.waitReason?'wait':''});
 if(!pallet)steps.push({t:'Sortierung'+(remote?' · '+siteNameOf(s,A):''),n:q.sortA,sub:q.sortA?fmt(q.sortA)+' im Wareneingang':''});
 if(remote){
  const hs=q.haul?`${trip?tripPhase(s,trip):'An Bord'} · ${fmt(q.haul)} an Bord${trip&&tripEta(s,trip)!=null?' · Ankunft '+hhmm(tripEta(s,trip)):''}${trip?.blocked?' · '+trip.blocked:''}`:'';
  const rs=q.readyA?(q.resA&&loadTrip?`${fmt(q.resA)} in Beladung · Abfahrt laut Fahrplan ${hhmm(loadTrip.departAt)}`:nd?`${fmt(q.readyA)} bereit · nächste Abfahrt ${hhmm(nd.departAt)} (Ladeschluss ${hhmm(nd.cutoffAt)})`:l?`${fmt(q.readyA)} bereit · Linie pausiert`:`${fmt(q.readyA)} bereit · keine Linie`):'';
  steps.push({t:'Hauptlauf → '+siteNameOf(s,B),n:q.readyA+q.haul,sub:[hs,rs].filter(Boolean).join(' · '),tone:q.readyA&&!l?'bad':(q.readyA&&(!nd||lineMissed(l)))||trip?.blocked?'wait':''});
  steps.push({t:'Ziel-Hub · '+siteNameOf(s,B),n:q.unloadB,sub:q.unloadB&&trip?`Entladung · ${tripRest(s,trip)}${trip.blocked?' · '+trip.blocked:''}`:'',tone:trip?.blocked&&q.unloadB?'wait':''});
  if(!pallet)steps.push({t:'Sortierung · '+siteNameOf(s,B),n:q.sortB,sub:q.sortB?fmt(q.sortB)+' im Wareneingang':''});}
 const ready=remote?q.readyB:q.readyA;
 steps.push({t:'Zustellung'+(remote?' ab '+siteNameOf(s,B):''),n:ready+q.out,sub:`${fmt(o.delivered)}/${fmt(o.qty)} zugestellt${q.out?' · '+fmt(q.out)+' unterwegs':''}${ready?' · '+fmt(ready)+' bereit':''} · Frist ${time(o.due)}`,last:true,tone:o.status==='active'&&s.t>o.due?'bad':''});
 // Zustand je Station: Menge vorhanden = aktiv; keine Menge hier oder davor = erledigt; sonst ausstehend.
 let before=0,cur=false;
 const html=steps.map(x=>{const state=x.n>0?'active':x.last?(o.delivered>=o.qty?'done':'pending'):before>0?'pending':'done';before+=x.n;
  const tone=state==='active'?(x.tone||'move'):state==='done'?'good':'';const step=state==='active'&&!cur;if(step)cur=true;
  return `<li class="is-${state}${tone?' tone-'+tone:''}"${step?' aria-current="step"':''}><span class="j-dot" aria-hidden="true"></span><b>${esc(x.t)}</b><strong>${x.n?fmt(x.n):state==='done'?'✓':'—'}</strong>${x.sub?`<small>${esc(x.sub)}</small>`:''}</li>`;}).join('');
 return `<h3 style="margin:18px 0 4px">Paketreise</h3><ol class="journey" aria-label="Paketreise">${html}</ol><p class="fine">Mengen aus Chargen, Hof und Linienfahrten. Zeiten nur aus Fahrplan, Phasenende und Restminuten.</p>`;}
/* ---- Luftexport und Dispositionsassistent Welle 3c-2 (A10) ----
 * Lesesicht auf Luftverträge (contracts.js unit 'air': flights, cutoff, penaltyMissed), Luftaufträge (airExport, flightT),
 * s.airShuttles (airexport.js, W3c-S1), das Journal (air:, air-trip:, air-missed:, air-storage:) und s.assistant
 * (assistant.js, W3c-S2). Änderungen ausschließlich über send(): dispatchAirShuttle, cancelAirShuttle, setAssistant.
 * Im Replay zeigt V() den Snapshot, send() ist gesperrt. Keine Buchung, keine Bestandsänderung, keine eigene Zeitlogik:
 * Ankunftsschätzungen nur aus remaining, Distanz und Fahrzeuggeschwindigkeit (ohne Wartezeiten). */
const AIR_ACTIVE=new Set(['loading','transit','handover','returning']);
const AIR_PHASE={loading:'Beladung',transit:'Fahrt zum Terminal',handover:'Übergabe am Terminal',returning:'Rückfahrt',complete:'Abgeschlossen',cancelled:'Storniert'};
const AIR_WARN=60;      // Glocke: Annahmeschluss in weniger als 60 Min. und Luftpakete ohne Zubringer
const AIR_RECENT=180;   // Glocke: verpasster Flug bleibt 3 Spielstunden sichtbar
const ASSIST_RECENT=60; // Glocke: abgelehnte Assistent-Befehle der letzten Spielstunde, je Standort gebündelt
const ASSIST_KIND={dispatch:'Zustellung',tour:'Sammeltour',line:'Linie',gate:'Tor',air:'Luftzubringer',blocked:'Abgelehnt'};
const ASSIST_TONE={dispatch:'move',tour:'move',line:'good',gate:'good',air:'move',blocked:'wait'};
const ASSIST_SWITCHES=[['dispatch','Zustellung und Luftzubringer','Startet Zustellungen, wenn ein Fahrzeug frei ist und die Frist in weniger als 3 Std. endet oder eine volle Ladung möglich ist (dringende Kleinaufträge als Sammeltour). Startet Luftzubringer rechtzeitig vor dem Annahmeschluss.'],['lines','Linien','Ordnet einer Linie ohne (erreichbaren) Lkw einen freien Lkw am Startstandort zu.'],['gate','Tor','Zieht fremde Lkw mit gefährdeter Frist am Tor vor.']];
let airDraft={};
const isAirC=c=>unitOf(c)==='air';
const dur=m=>{m=Math.max(0,Math.round(m));return m>=60?`${Math.floor(m/60)} Std.${m%60?' '+(m%60)+' Min.':''}`:m+' Min.';};
const airSite=o=>o.deliverySite??o.site;
const airContract=(s,o)=>(s.contracts||[]).find(k=>k.id===o?.contractId);
const airPhase=sh=>sh.status==='loading'&&sh.loadDone?'Abfahrbereit':AIR_PHASE[sh.status]||label(sh.status);
function airRest(sh){if(!AIR_ACTIVE.has(sh.status))return '—';if(sh.blocked)return 'wartet · '+sh.blocked;if(sh.status==='loading'&&sh.loadDone)return 'abfahrbereit';return fmt(sh.remaining)+' Min.';}
/** Mengen eines Luftauftrags aus seinen Chargen: sortiert frei, in Beladung (reserviert), unsortiert, an Bord, noch nicht angekommen. */
function airQty(s,o){const q={free:0,held:0,sort:0,board:0,arrive:0,open:Math.max(0,o.qty-o.delivered)};
 for(const b of s.batches){if(b.owner!==o.id||b.item!=='parcel'||!(b.qty>0))continue;
  if(b.location==='inbound')q.sort+=b.qty;else if(b.location==='stock'){const r=Math.min(b.qty,b.reserved||0);q.held+=r;q.free+=b.qty-r;}else if(b.location==='vehicle')q.board+=b.qty;}
 q.arrive=o.status==='active'?Math.max(0,q.open-q.free-q.held-q.sort-q.board-(o.returnedQty||0)):0;return q;}
const airOrdersAt=(s,site)=>s.orders.filter(o=>o.status==='active'&&o.airExport&&airSite(o)===site);
/** Luftverträge eines Standorts, die noch Flüge bedienen (aktiv oder beendet mit offenen Aufträgen). */
const airContractsAt=(s,site)=>(s.contracts||[]).filter(k=>isAirC(k)&&k.status!=='offer'&&k.site===site&&(k.status==='active'||s.orders.some(o=>o.contractId===k.id&&o.status==='active')));
/** Ankunft am Terminal (absolute Minute) ohne Wartezeiten; nach Ankunft die tatsächliche Zeit. */
function airEta(s,sh){if(sh.arrivedAt!=null)return sh.arrivedAt;const v=s.vehicles.find(x=>x.id===sh.vehicleId),drive=Math.ceil(sh.distance/(VEHICLES[v?.type]?.speed||1));
 if(sh.status==='transit')return s.t+sh.remaining;if(sh.status==='loading')return s.t+(sh.loadDone?0:sh.remaining)+drive;return null;}
/** Strengster Annahmeschluss der geladenen Aufträge (Flug des Auftrags beim Laden − cutoff). */
function airCutoffOf(s,sh){let c=null;for(const x of sh.orders){const k=airContract(s,s.orders.find(o=>o.id===x.orderId));if(!k)continue;const t=x.flightT-k.cutoff;if(c===null||t<c)c=t;}return c;}
function airTiming(eta,cut){if(eta==null||cut==null)return '';return eta<=cut?`<span class="money-plus">vor Annahmeschluss</span> · ${fmt(cut-eta)} Min. Puffer`:`<span class="money-minus">nach Annahmeschluss</span> · ${fmt(eta-cut)} Min. zu spät · Weiterflug mit nächstem Flug`;}
/** Nächste Flüge je Vertrag (die nächsten zwei sowie jeder gebuchte), Annahmeschluss noch nicht vorbei. */
function airFlightRows(s,site){const rows=[],shs=(s.airShuttles||[]).filter(x=>x.site===site&&AIR_ACTIVE.has(x.status));
 for(const k of airContractsAt(s,site)){const own=s.orders.filter(o=>o.contractId===k.id&&o.status==='active'&&o.airExport),ts=new Set(own.map(o=>o.flightT)),booked=new Set(ts);
  for(const m of k.flights||[]){const t=airNextFlight([m],k.cutoff,s.t);ts.add(t);ts.add(t+1440);}
  [...ts].filter(t=>t-k.cutoff>=s.t).sort((a,b)=>a-b).filter((t,i)=>i<2||booked.has(t)).forEach(t=>{
   const os=own.filter(o=>o.flightT===t),q={free:0,sort:0,ship:0,arrive:0,open:0};
   for(const o of os){const x=airQty(s,o);q.free+=x.free;q.sort+=x.sort;q.ship+=x.held+x.board;q.arrive+=x.arrive;q.open+=x.open;}
   const ids=new Set(os.map(o=>o.id));rows.push({k,flight:t,cut:t-k.cutoff,orders:os,q,sh:shs.filter(x=>x.orders.some(y=>ids.has(y.orderId)))});});}
 return rows.sort((a,b)=>a.cut-b.cut||a.flight-b.flight||String(a.k.id).localeCompare(String(b.k.id)));}
/** Wählbare Abflüge (absolut) mit Annahmeschluss und bereitliegender Menge (Aufträge mit Flug ≤ Abflug, wie dispatchAirShuttle). */
function airUpcoming(s,site){const m=new Map();for(const r of airFlightRows(s,site)){const x=m.get(r.flight);if(!x||r.cut<x.cut)m.set(r.flight,{flight:r.flight,cut:r.cut});}
 const list=[...m.values()].sort((a,b)=>a.flight-b.flight),os=airOrdersAt(s,site).map(o=>({o,q:airQty(s,o)}));
 for(const f of list)f.ready=os.filter(x=>x.o.flightT<=f.flight).reduce((n,x)=>n+Math.max(0,Math.min(x.q.free,x.q.open-x.q.held-x.q.board)),0);return list;}
/** Journal Luftexport (alle Standorte): Umsatz bei Übergabe, Fahrtkosten, Strafe verpasster Flug, Lagergeld am Terminal. */
function airLedger(s){const r={rev:0,revN:0,trip:0,tripN:0,miss:0,missN:0,store:0,storeN:0,rows:[]};
 for(const l of s.ledger){const k=typeof l.key==='string'?l.key:'';
  if(k.startsWith('air-missed:')){r.miss+=l.amount;r.missN++;r.rows.push(l);}else if(k.startsWith('air-storage:')){r.store+=l.amount;r.storeN++;r.rows.push(l);}
  else if(k.startsWith('air-trip:')){r.trip+=l.amount;r.tripN++;}else if(k.startsWith('air:')){r.rev+=l.amount;r.revN++;}}
 for(const x of ['rev','trip','miss','store'])r[x]=Math.round(r[x]*100)/100;return r;}
function airMissed(s,id){let sum=0,n=0;for(const l of s.ledger)if(typeof l.key==='string'&&l.key.startsWith('air-missed:')&&l.refs?.includes(id)){sum+=l.amount;n++;}return {sum:Math.round(sum*100)/100,n};}
/** Vertragskarte Luftexport: Flugzeiten, Annahmeschluss, Vorlauf, Strafe verpasster Flug, Terminal. */
function airContractRows(s,c){const km=airportDistance(s,c.site),fl=(c.flights||[]).slice().sort((a,b)=>a-b),miss=c.status!=='offer'?airMissed(s,c.id):null;
 return kv('Flugzeiten',`${fl.map(clockOf).join(' · ')} täglich · ${esc(AIRPORT.name)}`)+kv('Annahmeschluss',`${fmt(c.cutoff)} Min. vor Abflug · ${fl.map(m=>hhmm(m-c.cutoff)).join(' · ')} Uhr`)+
  kv('Mindestvorlauf',`${slaText(c.slaMinutes)} von Ankunft am Tor bis Annahmeschluss`)+kv('Strafe verpasster Flug',`${rateEuro(c.penaltyMissed||0)} je Paket und verpasstem Flug · Weiterflug mit dem nächsten Flug, dazu Lagergeld am Terminal ${rateEuro(AIR.storagePerParcel)} je Paket`)+
  (km!=null?kv('Frachtterminal',`${esc(AIRPORT.name)} · ${fmt(km)} km ab ${esc(siteNameOf(s,c.site))}`):'')+
  (miss?kv('Verpasste Flüge',miss.n?`<span class="money-minus">${euro(miss.sum)}</span> · ${fmt(miss.n)} ${miss.n===1?'Buchung':'Buchungen'}`:euro(0)):'');}
function airContractNote(s,c){const vs=s.vehicles.filter(v=>v.site===c.site&&AIR.vehicles.includes(v.type)&&v.status!=='rentalReturned'),miss=!vs.length&&c.status!=='ended';
 const km=airportDistance(s,c.site),speed=Math.max(...(vs.length?vs:[{type:'truck'}]).map(v=>VEHICLES[v.type]?.speed||1)),drive=km?Math.ceil(km/speed):null;
 const acts=[c.status!=='offer'?button('Luftexport öffnen','panel-air'):'',miss?button('Fuhrpark','panel-fleet'):''].join('');
 return `<div class="notice${miss?' warn':''}" role="note"><b>Luftexport:</b> Pakete werden am Hub angenommen und sortiert. Ein eigener Zubringer (Lkw oder Lieferwagen mit Fahrpersonal) bringt sie zum Frachtterminal ${esc(AIRPORT.short)}${drive?` (Fahrt ca. ${fmt(drive)} Min.)`:''} und muss vor dem Annahmeschluss dort sein. Bezahlt wird bei Übergabe am Terminal. Zubringer startest du im Fenster „Luftexport“ (Taste X), oder der Dispositionsassistent übernimmt das.${miss?' <b>Fehlt am Standort: Lkw oder Lieferwagen.</b>':''}${acts?`<div class="actions">${acts}</div>`:''}</div>`;}
/** Versandformular eines Luftauftrags: Zustellung nur per Zubringer. */
function airDispatchNote(s,o){const k=airContract(s,o),cut=k?o.flightT-k.cutoff:o.due;
 return `<div class="notice" role="note"><b>Luftexport:</b> Zustellung per Flughafen-Zubringer zum ${esc(AIRPORT.name)} · Flug ${time(o.flightT)} · Annahmeschluss ${hhmm(cut)}${o.missedFlights?` · <span class="money-minus">${fmt(o.missedFlights)}× Flug verpasst</span>`:''}.</div><div class="actions">${button('Luftexport öffnen','panel-air','','primary')}</div>`;}
function vehicleAirHtml(s,v){const sh=v.airShuttle?(s.airShuttles||[]).find(x=>x.id===v.airShuttle):null;if(!sh)return '';
 return kv('Luftzubringer',`${esc(sh.id)} · ${esc(airPhase(sh))} · Flug ${hhmm(sh.flight)} · ${fmt(sh.qty)} Pakete · ${esc(airRest(sh))} <button class="ref-link" data-action="openRef" data-id="${esc(sh.id)}">Luftexport</button>`);}
function airShuttleCard(s,sh){const v=s.vehicles.find(x=>x.id===sh.vehicleId),active=AIR_ACTIVE.has(sh.status),eta=airEta(s,sh),cut=airCutoffOf(s,sh);
 const tone=sh.blocked?'wait':sh.status==='complete'?'good':active?'move':'neutral';
 return `<div class="card${hubFocus===sh.id?' selected':''}" data-airshuttle="${esc(sh.id)}"><div class="card-top"><div><h3>${esc(siteNameOf(s,sh.site))} → ${esc(AIRPORT.short)}</h3><small>${esc(sh.id)} · ${esc(v?.name||sh.vehicleId)}</small></div>${badge(airPhase(sh),sh.blocked?'warn':sh.status==='complete'?'good':'')}</div>
${active?kv('Phase',`<span class="chip tone-${tone}">${esc(airPhase(sh))}</span>`)+kv('Restzeit',esc(airRest(sh))):''}${kv('Flug',`${time(sh.flight)}${cut!=null?' · Annahmeschluss '+hhmm(cut):''}`)}
${eta!=null&&sh.status!=='cancelled'&&sh.deliveredAt==null?kv(sh.arrivedAt!=null?'Ankunft Terminal':'Ankunft Terminal (ohne Wartezeiten)',`${time(eta)} · ${airTiming(eta,cut)}`):''}
${kv('Ladung',`${fmt(sh.qty)} Pakete · ${fmt(sh.orders.length)} ${sh.orders.length===1?'Auftrag':'Aufträge'}`)}${kv('Fahrtkosten',(sh.departedAt!=null?'':'bei Abfahrt ')+euro(sh.cost)+` · ${fmt(sh.distance)} km je Richtung`)}
${sh.deliveredAt!=null?kv('Übergabe und Zahlung',`${time(sh.deliveredAt)} · ${euro(sh.invoiceAmount||0)}${sh.lateQty?` · <span class="money-minus">${fmt(sh.lateQty)} Pakete nach Annahmeschluss · Lagergeld ${euro(sh.storageFee||0)}</span>`:''}`):''}
${sh.blocked?`<div class="notice" role="status">${esc(sh.blocked)}</div>`:''}${sh.cancelReason?kv('Storno',esc(sh.cancelReason)):''}
${sh.status==='loading'?`<div class="actions">${button('Vor Abfahrt stornieren','cancelAirShuttle',sh.id)}</div>`:''}</div>`;}
function airForm(s,site){const vs=s.vehicles.filter(v=>v.site===site&&v.status==='idle'&&AIR.vehicles.includes(v.type)),fl=airUpcoming(s,site);
 const d={...airDraft},v=vs.find(x=>x.id===d.vehicleId)||vs.find(x=>x.condition>=AIR.minCondition)||vs[0],f=fl.find(x=>String(x.flight)===String(d.departAt))||fl.find(x=>x.ready>0)||fl[0];
 let preview='';
 if(v&&f){const qty=Math.min(f.ready,airRoom(v)),km=airportDistance(s,site),load=handlingMinutes(Math.max(1,qty)),drive=Math.ceil(km/(VEHICLES[v.type]?.speed||1)),eta=s.t+load+drive;
  preview=`${kv('Ladung',qty?`${fmt(qty)} Pakete${f.ready>qty?` · ${fmt(f.ready-qty)} passen nicht mehr`:''}`:'<span class="money-minus">Keine sortierten Luftpakete für diesen Flug</span>')}${kv('Fahrtkosten',`${euro(tripCost(v,km))} bei Abfahrt · ${fmt(km)} km je Richtung`)}${kv('Beladen + Fahrt',`${fmt(load)} + ${fmt(drive)} Min.`)}`+
   `<div class="notice${eta<=f.cut?' good':' warn'}" role="status">Ankunft Terminal ca. ${time(eta)} · ${airTiming(eta,f.cut)}. Schätzung ohne Wartezeiten (Dock, Lagerkraft, Fahrpersonal, Kasse).</div>`;}
 const drivers=s.workers.some(w=>w.site===site&&w.role==='driver'),docks=s.buildings.some(b=>b.site===site&&b.type==='dock');
 return `<section class="section" id="airForm"><div class="section-title"><h3>Zubringer starten</h3>${badge(fmt(vs.length)+' Fahrzeuge frei',vs.length?'good':'warn')}</div><form data-form="air" class="form-grid">
${field('Fahrzeug · Lkw oder Lieferwagen, frei am Standort',`<select name="vehicleId">${vs.map(x=>`<option value="${esc(x.id)}" ${x===v?'selected':''}>${esc(x.name)} · ${esc(VEHICLES[x.type]?.name||x.type)} · ≈ ${fmt(airRoom(x))} Pakete${x.condition<AIR.minCondition?' · Wartung nötig':''}</option>`).join('')||'<option value="">Kein freies Fahrzeug</option>'}</select>`,true)}
${field('Flug',`<select name="departAt">${fl.map(x=>`<option value="${x.flight}" ${x===f?'selected':''}>${esc(time(x.flight))} · Annahmeschluss ${hhmm(x.cut)} · ${fmt(x.ready)} Pakete bereit</option>`).join('')||'<option value="">Kein Flug</option>'}</select>`,true)}
<div class="tour-preview" style="grid-column:1/-1" aria-live="polite">${preview}</div>
${!drivers||!docks?`<p class="fine money-minus" style="grid-column:1/-1">${[!docks?'Kein Dock am Standort (Beladen braucht Dock und Lagerkraft)':'',!drivers?'Kein Fahrpersonal am Standort':''].filter(Boolean).join(' · ')}.</p>`:''}
<button class="primary" ${vs.length&&fl.length?'':'disabled'}>Zubringer starten →</button></form><p class="fine">Lädt alle sortierten Luftpakete mit Flug bis zum gewählten Abflug, früheste zuerst, bis das Fahrzeug voll ist. Beladen am Dock mit Lagerkraft, dann Abfahrt mit Fahrpersonal; Fahrtkosten bei Abfahrt. Storno nur vor Abfahrt.</p></section>`;}
function airSubmit(d){const dep=Number(d.departAt);if(!d.vehicleId||!Number.isSafeInteger(dep)){toast('Fahrzeug und Flug wählen.',true);return {ok:false};}
 const r=send({type:'dispatchAirShuttle',vehicleId:d.vehicleId,flight:((dep%1440)+1440)%1440,departAt:dep,site:V().state.selectedSite},true);
 if(r.ok){toast(`Luftzubringer gestartet: ${fmt(r.qty)} Pakete für Flug ${hhmm(r.flight)}${r.cutoffAt!=null?', Annahmeschluss '+hhmm(r.cutoffAt):''}. Fahrtkosten ${euro(r.cost)} bei Abfahrt.`);hubFocus=r.id||null;airDraft={};}
 renderPanel(true);return r;}
function airPanel(){const s=V().state,site=s.selectedSite,shuttles=(s.airShuttles||[]).filter(x=>x.site===site),running=shuttles.filter(x=>AIR_ACTIVE.has(x.status)),done=shuttles.filter(x=>!AIR_ACTIVE.has(x.status)).slice(-6).reverse(),led=airLedger(s);
 const intro=`<div class="notice">Luftexport: Pakete kommen wie gewohnt am Tor an, werden entladen und sortiert. Ein eigener Zubringer bringt sie zum ${esc(AIRPORT.name)}. Er muss vor dem Annahmeschluss (Abflug minus Vorlauf) dort sein; bezahlt wird bei der Übergabe. Verpasst: Strafe je Paket, Weiterflug mit dem nächsten Flug, kleines Lagergeld am Terminal.</div>`;
 const ledger=`<section class="section"><div class="section-title"><h3>Strafen und Lagergeld Terminal</h3>${badge('alle Standorte')}</div>${kv('Umsatz bei Übergabe',`${euro(led.rev)} · ${fmt(led.revN)} ${led.revN===1?'Übergabe':'Übergaben'}`)}${kv('Fahrtkosten Zubringer',`<span class="${led.trip<0?'money-minus':''}">${euro(led.trip)}</span> · ${fmt(led.tripN)} ${led.tripN===1?'Fahrt':'Fahrten'}`)}${kv('Strafe verpasster Flug',`<span class="${led.miss<0?'money-minus':''}">${euro(led.miss)}</span> · ${fmt(led.missN)} ${led.missN===1?'Buchung':'Buchungen'}`)}${kv('Lagergeld Terminal',`<span class="${led.store<0?'money-minus':''}">${euro(led.store)}</span> · ${fmt(led.storeN)} ${led.storeN===1?'Buchung':'Buchungen'}`)}${led.rows.length?`<div class="table-wrap"><table><thead><tr><th>Zeit</th><th>Anlass</th><th class="num">Betrag</th></tr></thead><tbody>${led.rows.slice(-10).reverse().map(l=>`<tr><td>${time(l.t)}</td><td>${esc(label(l.category))}<br><small class="muted">${esc(l.note)}</small></td><td class="num money-minus">${euro(l.amount)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="fine">Noch kein Flug verpasst.</p>'}</section>`;
 if(!airContractsAt(s,site).length&&!shuttles.length)return intro+empty('Kein Luftexport an diesem Standort','Luftexport-Angebote erscheinen im Vertragsfenster (mit Dock und Lkw/Lieferwagen am Standort oder ab Spieltag '+fmt(TERMS.air?.fromDay??4)+').')+`<div class="actions">${button('Verträge öffnen','panel-contracts','','primary')}</div>`+(led.revN||led.rows.length?ledger:'');
 const rows=airFlightRows(s,site),next=rows.find(r=>r.orders.length)||rows[0],os=airOrdersAt(s,site).map(o=>({o,q:airQty(s,o)})).sort((a,b)=>a.o.flightT-b.o.flightT||a.o.due-b.o.due);
 const tot={free:0,sort:0,held:0,board:0,arrive:0};for(const {q} of os)for(const k in tot)tot[k]+=q[k];
 const left=next?next.cut-s.t:null,ctone=next&&left<AIR_WARN&&next.q.free+next.q.sort>0?'bad':next&&left<AIR_WARN?'wait':'';
 const numbers=`<div class="numbers">${num(next?`<span class="countdown${ctone?' tone-'+ctone:''}">${dur(left)}</span>`:'—',next?`Bis Annahmeschluss ${hhmm(next.cut)} (Flug ${hhmm(next.flight)})`:'Kein Flug')}${num(fmt(tot.free),'Luftpakete sortiert bereit')}${num(fmt(tot.sort),'In Sortierung')}${num(fmt(running.length),'Zubringer aktiv')}</div>`;
 const status=r=>{if(!r.orders.length)return '<small class="muted">Keine Pakete gebucht</small>';const list=r.sh.map(x=>{const e=airEta(s,x);return `${esc(x.id)} · ${esc(airPhase(x))}${e!=null&&x.deliveredAt==null?' · Ankunft '+hhmm(e)+' '+(e<=r.cut?'vor':'<span class="money-minus">nach</span>')+' Annahmeschluss':''}`;}),wait=r.q.free+r.q.sort;
  if(wait)list.push(`${r.cut-s.t<AIR_WARN?badge('Zubringer fehlt','bad')+' ':''}${fmt(wait)} ohne Zubringer`);if(!list.length)list.push(r.q.arrive?'Pakete noch nicht am Hub':'Alles übergeben');return list.join('<br>');};
 const flights=`<section class="section"><div class="section-title"><h3>Nächste Flüge</h3>${badge(fmt(rows.length)+' Flüge')}</div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Vertrag</th><th>Flug</th><th>Annahmeschluss</th><th class="num">Pakete</th><th>Zubringer</th></tr></thead><tbody>${rows.map(r=>{const l=r.cut-s.t,t=r.q.free+r.q.sort>0&&l<AIR_WARN?'bad':l<AIR_WARN?'wait':'';return `<tr data-flight="${r.flight}"><td>${esc(r.k.shipper)}<br><small class="muted">${esc(r.k.id)}</small></td><td><b>${hhmm(r.flight)}</b><br><small class="muted">${esc(time(r.flight))}</small></td><td>${hhmm(r.cut)}<br><span class="countdown${t?' tone-'+t:''}">in ${dur(l)}</span></td><td class="num">${fmt(r.q.open)}${r.q.open?`<br><small class="muted">${parts([[r.q.free,'sortiert'],[r.q.sort,'unsortiert'],[r.q.ship,'im Zubringer'],[r.q.arrive,'erwartet']])}</small>`:''}</td><td>${status(r)}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="fine">Kein Flug mit offenem Annahmeschluss.</p>'}</section>`;
 const qOf=new Map(os.map(x=>[x.o,x.q]));
 const ready=`<section class="section"><div class="section-title"><h3>Bereitliegende Luftpakete</h3>${badge(`${fmt(tot.free)} sortiert · ${fmt(tot.sort)} unsortiert`,tot.free?'good':'')}</div>${os.length?`<div class="table-wrap"><table><thead><tr><th>Auftrag</th><th>Flug</th><th class="num">Sortiert</th><th class="num">In Beladung</th><th class="num">Unsortiert</th><th class="num">An Bord</th><th class="num">Erwartet</th><th></th></tr></thead><tbody>${filtered(os.map(x=>x.o)).map(o=>{const q=qOf.get(o);return `<tr data-air-order="${esc(o.id)}"><td>${esc(o.customer)}<br><small class="muted">${esc(o.id)}${o.missedFlights?` · <span class="money-minus">${fmt(o.missedFlights)}× verpasst</span>`:''}</small></td><td>${hhmm(o.flightT)}<br><small class="muted">${esc(time(o.flightT))}</small></td><td class="num">${fmt(q.free)}</td><td class="num">${fmt(q.held)}</td><td class="num">${fmt(q.sort)}</td><td class="num">${fmt(q.board)}</td><td class="num">${fmt(q.arrive)}</td><td>${button('Akte','select',o.id)}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="fine">Keine offenen Luftfrachtaufträge.</p>'}</section>`;
 return intro+numbers+flights+ready+airForm(s,site)+
  `<section class="section"><div class="section-title"><h3>Laufende Zubringer</h3>${badge(fmt(running.length)+' aktiv',running.length?'good':'')}</div>${running.map(x=>airShuttleCard(s,x)).join('')||'<p class="fine">Kein Zubringer unterwegs.</p>'}</section>`+
  (done.length?`<details><summary>Letzte Zubringer · ${fmt(done.length)}</summary>${done.map(x=>airShuttleCard(s,x)).join('')}</details>`:'')+ledger;}
/** Paketreise eines Luftauftrags: Annahme → Sortierung → Zubringer → Terminal/Flug. Mengen aus Chargen, Zeiten aus remaining. */
function airJourneyHtml(s,o){const A=airSite(o),k=airContract(s,o),cut=k?o.flightT-k.cutoff:o.due,q=airQty(s,o),a=(s.yard||[]).find(x=>x.orderIds?.includes(o.id)&&x.phase!=='gone');
 const shs=(s.airShuttles||[]).filter(x=>AIR_ACTIVE.has(x.status)&&x.orders.some(y=>y.orderId===o.id)),load=shs.find(x=>x.status==='loading'),move=shs.find(x=>x.status==='transit'||(x.status==='handover'&&x.deliveredAt==null));
 const eta=move?airEta(s,move):null,left=cut-s.t,steps=[];
 steps.push({t:'Annahme-Hub · '+siteNameOf(s,A),n:q.arrive,sub:a?`${a.plate} · ${arrivalPhase(a)}${a.waitReason?' · '+a.waitReason:''}${a.phase==='approach'&&Number.isFinite(a.eta)?' · Ankunft '+hhmm(a.eta):''}`:q.arrive?'Lkw des Versenders noch nicht angekündigt':'',tone:a?.waitReason?'wait':''});
 steps.push({t:'Sortierung',n:q.sort,sub:q.sort?fmt(q.sort)+' im Wareneingang':'',tone:q.sort&&left<AIR_WARN?'bad':''});
 steps.push({t:'Zubringer · Beladung',n:q.free+q.held,sub:[q.free?`${fmt(q.free)} sortiert bereit`:'',q.held&&load?`${fmt(q.held)} in Beladung · ${load.id} · ${airPhase(load)}${load.blocked?' · '+load.blocked:''}`:'',q.free+q.held?`Annahmeschluss ${hhmm(cut)}${left>=0?' (in '+dur(left)+')':''}`:''].filter(Boolean).join(' · '),tone:q.free&&!load&&left<AIR_WARN?'bad':load?.blocked?'wait':''});
 steps.push({t:'Zubringer → Terminal '+AIRPORT.short,n:q.board,sub:move?`${airPhase(move)} · ${move.id}${eta!=null?' · Ankunft '+hhmm(eta)+(eta<=cut?' vor':' nach')+' Annahmeschluss':''}${move.blocked?' · '+move.blocked:''}`:'',tone:move&&(move.blocked||(eta!=null&&eta>cut))?'wait':''});
 steps.push({t:'Terminal · Flug '+hhmm(o.flightT),n:0,sub:`${fmt(o.delivered)}/${fmt(o.qty)} übergeben · Flug ${time(o.flightT)} · Annahmeschluss ${hhmm(cut)}${o.missedFlights?` · ${fmt(o.missedFlights)}× Flug verpasst`:''}`,last:true,tone:o.missedFlights?'bad':''});
 let before=0,cur=false;
 const html=steps.map(x=>{const state=x.n>0?'active':x.last?(o.delivered>=o.qty?'done':'pending'):before>0?'pending':'done';before+=x.n;
  const tone=state==='active'?(x.tone||'move'):state==='done'?'good':x.last&&x.tone?x.tone:'';const step=state==='active'&&!cur;if(step)cur=true;
  return `<li class="is-${state}${tone?' tone-'+tone:''}"${step?' aria-current="step"':''}><span class="j-dot" aria-hidden="true"></span><b>${esc(x.t)}</b><strong>${x.n?fmt(x.n):state==='done'?'✓':'—'}</strong>${x.sub?`<small>${esc(x.sub)}</small>`:''}</li>`;}).join('');
 return `<h3 style="margin:18px 0 4px">Paketreise · Luftexport</h3><ol class="journey" aria-label="Paketreise Luftexport">${html}</ol><p class="fine">Mengen aus Chargen, Hof und Zubringern. Ankunft am Terminal ohne Wartezeiten geschätzt.</p>`;}
/** Glocke W3c-2: Annahmeschluss < 60 Min. mit Luftpaketen ohne Zubringer (je Standort und Flug), verpasster Flug (Journal),
 *  wartender Zubringer, abgelehnte Assistent-Befehle (je Standort gebündelt). Rail „Luftexport“ nur bei Bedarf. */
function collectAir(s,h,{alert,siteName}){
 h.airRelevant=(s.airShuttles||[]).length>0||(s.contracts||[]).some(isAirC);
 const ks=new Map((s.contracts||[]).map(k=>[k.id,k])),soon=new Map();
 for(const o of s.orders){if(o.status!=='active'||!o.airExport)continue;const k=ks.get(o.contractId);if(!k)continue;const cut=o.flightT-k.cutoff,left=cut-s.t;if(!(left>=0&&left<AIR_WARN))continue;
  const q=airQty(s,o),n=q.free+q.sort;if(n<1)continue;const key=airSite(o)+'@'+o.flightT,x=soon.get(key)||{site:airSite(o),flight:o.flightT,cut,n:0};x.n+=n;x.cut=Math.min(x.cut,cut);soon.set(key,x);}
 for(const [key,x] of soon)alert('acut:'+key,'bad',`Annahmeschluss in ${fmt(x.cut-s.t)} Min. · ${fmt(x.n)} Luftpakete ohne Zubringer`,`Flug ${hhmm(x.flight)} · Annahmeschluss ${hhmm(x.cut)} · ${siteName(x.site)} · Zubringer starten`,null,'air');
 for(let i=s.ledger.length-1;i>=0;i--){const l=s.ledger[i];if(!(l.t>=s.t-AIR_RECENT))break;if(typeof l.key==='string'&&l.key.startsWith('air-missed:'))alert('amiss:'+l.key.slice(11),'bad',`Flug verpasst · ${ks.get(l.refs?.[0])?.shipper||'Luftfracht'}`,`${l.note} · ${euro(l.amount)} · ${time(l.t)}`,null,'air');}
 for(const sh of s.airShuttles||[])if(AIR_ACTIVE.has(sh.status)&&sh.blocked)alert('ash:'+sh.id,'wait',`Luftzubringer ${sh.id} wartet`,`${sh.blocked} · Flug ${hhmm(sh.flight)} · ${siteName(sh.site)}`,sh.id);
 const blocked=new Map();for(const e of s.assistant?.log||[])if(e.kind==='blocked'&&e.t>=s.t-ASSIST_RECENT){const x=blocked.get(e.site)||{n:0,last:e};x.n++;x.last=e;blocked.set(e.site,x);}
 for(const [site,x] of blocked)alert('asb:'+site,'wait',`Assistent: ${fmt(x.n)} ${x.n===1?'Befehl':'Befehle'} abgelehnt oder zurückgestellt`,`${x.last.text} ${x.last.reason} · ${siteName(site)}`,null,'assistant');}
/* Dispositionsassistent: Kopfzeilen-Schalter (aktiver Standort), Fenster mit Schaltern, Tagesbudget und Protokoll. */
const assistCfg=(s,site)=>s.assistant?.sites?.[site]||null;
function renderAssistHead(s){const site=s.selectedSite,on=!!assistCfg(s,site)?.enabled;put('assistLabel',on?'Assistent an':'Assistent aus');putAttr('assistBtn','aria-pressed',String(on));putAttr('assistBtn','title',`Dispositionsassistent ${on?'an':'aus'} · ${siteNameOf(s,site)} · Klick schaltet um · Fenster: J`);}
function assistToggle(){const s=V().state,site=s.selectedSite,on=!!assistCfg(s,site)?.enabled,r=send({type:'setAssistant',site,enabled:!on},true);
 if(r.ok)toast(`Dispositionsassistent ${on?'aus':'an'} · ${siteNameOf(s,site)}. ${on?'Es gelten nur die Standardregeln.':`Takt alle ${ASSIST_TICK} Spielminuten, nur reguläre Befehle.`}`);return r;}
function assistSwitch(k){if(!ASSIST_SWITCHES.some(x=>x[0]===k))return;const s=V().state,site=s.selectedSite,cfg=assistCfg(s,site),cur=cfg?cfg[k]!==false:true;return send({type:'setAssistant',site,[k]:!cur},true);}
function assistBudget(d){const raw=String(d.dayBudget??'').trim().replace(',','.'),budget=raw===''?null:Number(raw);
 if(budget!==null&&!(Number.isFinite(budget)&&budget>=0)){toast('Tagesbudget: Betrag ab 0 € oder leer lassen (nur Kasse).',true);return {ok:false};}
 const r=send({type:'setAssistant',site:V().state.selectedSite,budget},true);if(r.ok)toast(budget===null?'Tagesbudget aufgehoben · Grenze ist die Kasse.':`Tagesbudget ${euro(budget)} je Spieltag.`);renderPanel(true);return r;}
/** Bezüge eines Protokolleintrags als Verweise (Fahrzeug, Auftrag, Zubringer, Linie, Lkw am Tor, Sendung/Tour). Standort-IDs entfallen. */
function assistRefs(s,refs){return (refs||[]).filter(id=>typeof id==='string'&&!s.sites.some(x=>x.id===id)).slice(0,4).map(id=>{
 const v=s.vehicles.find(x=>x.id===id),o=s.orders.find(x=>x.id===id),l=(s.lines||[]).find(x=>x.id===id),a=(s.yard||[]).find(x=>x.id===id);
 const t=v?v.name:o?o.customer:l?'Linie '+lineTitle(s,l):a?a.plate:id;return `<button class="ref-link" data-action="openRef" data-id="${esc(id)}" title="${esc(id)} öffnen">${esc(t)}</button>`;}).join(' ');}
const HOLD_TEXT={order:'Auftrag',line:'Linie',gate:'Tor',air:'Flug'};
function assistantPanel(){const s=V().state,site=s.selectedSite,cfg=assistCfg(s,site),on=!!cfg?.enabled,c=cfg||{dispatch:true,lines:true,gate:true,budget:null,spent:0,day:0,hold:{}},day=Math.floor(s.t/1440);
 const log=(s.assistant?.log||[]).filter(e=>e.site===site),rows=filtered(log).slice(-60).reverse(),today=log.filter(e=>Math.floor(e.t/1440)===day),blocked=log.filter(e=>e.kind==='blocked'&&e.t>=s.t-ASSIST_RECENT).length;
 const spent=cfg&&cfg.day===day?cfg.spent:0,holds=Object.entries(c.hold||{}).filter(([,t])=>t>s.t).sort((a,b)=>a[1]-b[1]),others=s.sites.filter(x=>x.id!==site);
 const holdText=key=>{const [kind,...rest]=key.split(':'),id=rest.join(':');return `${HOLD_TEXT[kind]||esc(kind)} ${kind==='air'&&Number.isFinite(+id)?hhmm(+id):esc(id)}`;};
 return `<div class="notice"><b>Nutzt nur reguläre Befehle.</b> Der Assistent übernimmt Routineentscheidungen am aktiven Standort mit denselben Befehlen wie du (Zustellung, Sammeltour, Luftzubringer, Linienzuordnung, Vorziehen): gleiche Kosten, gleiches Personal, gleiche Grenzen, keine Sonderrechte. Takt alle ${fmt(ASSIST_TICK)} Spielminuten, feste Regeln, kein KI-Dienst. Jede Entscheidung steht mit Grund im Protokoll. Aus heißt: nur Standardregeln und deine Befehle.</div>
<div class="numbers">${num(on?'An':'Aus','Assistent · '+siteNameOf(s,site))}${num(fmt(today.filter(e=>e.kind!=='blocked').length),'Entscheidungen heute')}${num(fmt(blocked),'Abgelehnt (60 Min.)')}</div>
<section class="section"><div class="section-title"><h3>${esc(siteNameOf(s,site))}</h3>${badge(on?'Assistent an':'Assistent aus',on?'good':'')}</div>
<div class="switch-row"><div><strong>Assistent für diesen Standort</strong><small>Gilt nur für ${esc(siteNameOf(s,site))}. Schalter auch oben in der Kopfzeile.</small></div><button class="${on?'':'primary'}" data-action="assistToggle" aria-pressed="${on}">${on?'Ausschalten':'Einschalten'}</button></div>
${ASSIST_SWITCHES.map(([k,t,d])=>`<div class="switch-row"><div><strong>${esc(t)}</strong><small>${esc(d)}</small></div><button data-action="assistSwitch" data-id="${k}" aria-pressed="${c[k]!==false}" aria-label="${esc(t)} ${c[k]!==false?'an':'aus'}">${c[k]!==false?'An':'Aus'}</button></div>`).join('')}
${(s.rules||[]).some(r=>r.kind==='dispatch'&&r.enabled&&r.site===site)?'<p class="fine">Eine aktive Betriebsregel „Kundenlieferungen disponieren“ übernimmt hier die Zustellung; der Assistent stellt dann nicht zu.</p>':''}</section>
<section class="section"><div class="section-title"><h3>Tagesbudget</h3>${badge(c.budget==null?'nur Kasse':euro(spent)+' / '+euro(c.budget),c.budget!=null&&spent>=c.budget?'warn':'')}</div><form data-form="assistBudget" class="form-grid">${field('Tagesbudget in € (leer = nur Kasse)',`<input name="dayBudget" type="number" min="0" step="1" value="${c.budget==null?'':esc(c.budget)}" placeholder="nur Kasse">`)}<button class="primary" style="grid-column:auto;align-self:end">Budget übernehmen</button></form>${kv('Heute verbraucht',`${euro(spent)}${c.budget!=null?' von '+euro(c.budget):' · Grenze: Kasse'}`)}<p class="fine">Angerechnet werden die Fahrtkosten der vom Assistenten gestarteten Fahrten. Linienzuordnung und Vorziehen kosten nichts. Reicht Budget oder Kasse nicht, stellt er zurück und protokolliert den Grund.</p></section>
${holds.length?`<section class="section"><div class="section-title"><h3>Zurückgestellt</h3>${badge(fmt(holds.length),'warn')}</div>${holds.map(([k,t])=>`<div class="list-row"><div><strong>${holdText(k)}</strong><small>Neuer Versuch ab ${hhmm(t)} (${fmt(t-s.t)} Min.)</small></div></div>`).join('')}</section>`:''}
<section class="section"><div class="section-title"><h3>Protokoll</h3>${badge(fmt(log.length)+' Einträge')}</div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Zeit</th><th>Art</th><th>Entscheidung</th><th>Grund</th><th>Bezug</th></tr></thead><tbody>${rows.map(e=>`<tr data-assist-row><td>${hhmm(e.t)}<br><small class="muted">Tag ${Math.floor(e.t/1440)+1}</small></td><td><span class="chip tone-${ASSIST_TONE[e.kind]||'neutral'}">${esc(ASSIST_KIND[e.kind]||e.kind)}</span></td><td>${esc(e.text)}</td><td><small>${esc(e.reason)}</small></td><td>${assistRefs(s,e.refs)}</td></tr>`).join('')}</tbody></table></div><p class="fine">Letzte 60 Einträge dieses Standorts (gespeichert werden höchstens ${fmt(ASSIST_LOG_MAX)} insgesamt).</p>`:empty('Noch keine Entscheidung',on?`Der Assistent prüft alle ${ASSIST_TICK} Spielminuten.`:'Assistent einschalten, um Routineentscheidungen abzugeben.')}</section>
${others.length?`<section class="section"><h3>Andere Standorte</h3>${others.map(x=>`<div class="list-row"><div><strong>${esc(x.name)}</strong><small>${assistCfg(s,x.id)?.enabled?'Assistent an':'Assistent aus'}</small></div>${button('Wechseln','site',x.id)}</div>`).join('')}</section>`:''}`;}
const ready=bootstrap();

/** Sammeltouren nutzen dieselben Auftrags-IDs und Fahrzeuge wie Einzellieferungen. */
function tourCommand(d){return {type:'dispatchTour',vehicleId:d.vehicleId,stops:[1,2,3,4].filter(i=>d['order'+i]).map(i=>({orderId:d['order'+i],qty:Number(d['qty'+i]),returnQty:Number(d['returnQty'+i]||0)}))};}
/** Höchstmenge je Stopp: offene Auftragsmenge und Fahrzeugkapazität für den Artikel (gleiche Regel wie Simulation). Gesamtladung prüft die Vorschau. */
function tourStopLimit(s,d,i){const o=s.orders.find(o=>o.id===d['order'+i]),v=s.vehicles.find(v=>v.id===d.vehicleId);return o&&v?dispatchMax(s,o,v):null;}
function tourStopMax(s,d,i){const m=tourStopLimit(s,d,i);return m==null?1000:Math.max(1,m);}
function tourStopHint(s,d,i){const m=tourStopLimit(s,d,i);return m==null?'':` · max. ${fmt(m)}`;}
function updateTourDraft(form){tourDraft=Object.fromEntries(new FormData(form));for(const i of [1,2,3,4]){const q=form.querySelector?.(`input[name="qty${i}"]`),h=form.querySelector?.(`[data-tour-max="${i}"]`);if(q)q.max=String(tourStopMax(V().state,tourDraft,i));if(h)h.textContent=tourStopHint(V().state,tourDraft,i);}const preview=form.querySelector('[data-tour-preview]');if(preview)preview.innerHTML=tourPreview(V().state,tourDraft);}
function driverForecastCard(f){if(!f)return '';return `<div class="notice">${f.elapsedMinutes==null?'<b>Fahrerprognose nicht verfügbar</b>':`${kv('Geschätzte Gesamtzeit mit Fahrpersonal',fmt(f.elapsedMinutes)+' Min.')}${kv('Davon Wartezeit',fmt(f.waitMinutes)+' Min.')}${kv('Pausen / Schichtwartezeit',fmt(f.breakMinutes)+' / '+fmt(f.shiftMinutes)+' Min.')}`}<p class="fine">${esc(f.assumption||'Freie Rampe und verfügbares Lagerpersonal vorausgesetzt. Keine verbindliche Ankunftszeit.')}</p></div>`;}
function tourPreview(s,d){const command=tourCommand(d);if(command.stops.length<2)return '<p class="fine">Zwei bis vier unterschiedliche Aufträge wählen. Reihenfolge entspricht Fahrtfolge.</p>';const plan=planTour(s,command.vehicleId,command.stops);if(!plan.ok)return `<div class="notice">${esc(plan.message)}</div>`;const v=s.vehicles.find(v=>v.id===command.vehicleId),weightCapacity=VEHICLES[v.type].weightCapacity||v.capacity*4;const initial=command.stops.reduce((a,st)=>{const item=ITEMS[s.orders.find(o=>o.id===st.orderId).item];a.volume+=st.qty*(item.volume||1);a.weight+=st.qty*(item.weight||1);return a;},{volume:0,weight:0});return `${kv('Fahrtkosten',euro(plan.cost))}${kv('Arbeits- und Fahrtzeit',fmt(plan.minutes)+' Min.')}${driverForecastCard(plan.driverForecast)}${kv('Strecke',fmt(plan.distance)+' km')}${kv('Startladung',fmt(initial.volume)+' / '+fmt(v.capacity)+' Volumen · '+fmt(initial.weight)+' / '+fmt(weightCapacity)+' kg')}<ol class="tour-stops">${plan.stops.map(st=>`<li><b>${esc(s.orders.find(o=>o.id===st.orderId)?.customer||st.orderId)}</b><small>${fmt(st.qty)} zustellen · ${fmt(st.returnQty||0)} zurücknehmen</small><small>Danach: ${fmt(st.volume)} / ${fmt(v.capacity)} Volumen · ${fmt(st.weight)} / ${fmt(weightCapacity)} kg</small></li>`).join('')}</ol><p class="fine">Zeit ohne zusätzliche Schicht-, Pausen- und Engpasswartezeiten. Fahrtkosten ohne Löhne und Erstattungen. Bestand und Verfügbarkeit werden bei Beauftragung erneut geprüft.</p>`;}
function tourCard(s,t){const v=s.vehicles.find(v=>v.id===t.vehicleId),capacity=v?.capacity||0,weightCapacity=VEHICLES[v?.type]?.weightCapacity||capacity*4;const ids=new Set(t.stops.flatMap(st=>[...(st.cargo||[]),...((s.returns||[]).find(r=>r.id===st.returnId)?.cargo||[])]));const cargo=s.batches.filter(b=>ids.has(b.id)&&b.location==='vehicle'&&b.qty>0);const load=cargo.reduce((a,b)=>{a.volume+=b.qty*(ITEMS[b.item]?.volume||1);a.weight+=b.qty*(ITEMS[b.item]?.weight||1);return a;},{volume:0,weight:0});return `<div class="card tour-card"><div class="card-top"><h3>${esc(t.id)}</h3>${badge(label(t.status),t.blocked?'warn':'')}</div>${kv('Fahrzeug',esc(v?.name||t.vehicleId))}${kv('Aktuelle Phase verbleibend',fmt(t.remaining)+' Min.')}${kv(t.transportCost==null?'Fahrtkosten':'Gebuchte Fahrtkosten',t.transportCost==null?'Bei Abfahrt':euro(t.transportCost))}${kv('Ladung an Bord',fmt(load.volume)+' / '+fmt(capacity)+' Volumen · '+fmt(load.weight)+' / '+fmt(weightCapacity)+' kg')}${t.blocked?`<div class="notice" role="status">${esc(t.blocked)}</div>`:''}<ol class="tour-stops">${(t.stops||[]).map((st,i)=>{const r=(s.returns||[]).find(r=>r.id===st.returnId);return `<li ${i===t.stopIndex&&!['complete','cancelled','loading','returning','returnUnloading'].includes(t.status)?'aria-current="step"':''}><b>${esc(s.orders.find(o=>o.id===st.orderId)?.customer||st.orderId)}</b><small>${fmt(st.qty)} Stück · ${st.status==='delivered'?'zugestellt':label(st.status==='pending'?'scheduled':st.status)}</small>${r?.qty?`<small>Rückladung: ${fmt(r.qty)} Stück · ${esc(r?label(r.status):'Eingeplant')}</small>`:''}</li>`;}).join('')}</ol>${t.status==='loading'?button('Tour vor Abfahrt stornieren','cancelTour',t.id):''}</div>`;}
function tourPanel(s){const active=s.orders.filter(o=>o.status==='active'),vehicles=s.vehicles.filter(v=>v.site===s.selectedSite&&v.status==='idle');if(!tourDraft.vehicleId&&vehicles[0])tourDraft.vehicleId=vehicles[0].id;return `<section class="section"><h3>Sammeltour mit Rückladung</h3><p class="fine" style="margin:8px 0 14px">Zustellen, danach Rückladung aufnehmen. Rückgabe nur für bereits gelieferte, noch nicht retournierte Ware desselben Auftrags. Rückfahrt endet mit Entladung in Quarantäne.</p><form data-form="tour" class="form-grid">${field('Fahrzeug',`<select name="vehicleId">${vehicles.map(v=>`<option value="${v.id}" ${tourDraft.vehicleId===v.id?'selected':''}>${esc(v.name)} · ${fmt(v.capacity)} Vol. · ${fmt(weightCap(v))} kg${VEHICLES[v.type]?.cold?' · Kühlung':''}</option>`).join('')||'<option value="">Kein freies Fahrzeug</option>'}</select>`,true)}${[1,2,3,4].map(i=>`<fieldset class="tour-stop-input"><legend>Stopp ${i}</legend>${field('Auftrag',`<select name="order${i}"><option value="">${i<3?'Kunde auswählen':'Optionaler Stopp'}</option>${active.map(o=>{const off=!deliverableAt(o,s.selectedSite)||!!o.airExport;return `<option value="${o.id}" ${tourDraft['order'+i]===o.id&&!off?'selected':''}${off?' disabled':''}>${esc(o.customer)} · ${o.qty-o.delivered} offen · ${o.delivered} geliefert${off?(o.airExport?' · Luftexport (Zubringer)':' · Zustellung ab '+esc(siteNameOf(s,deliverySiteOf(o)))):''}</option>`;}).join('')}</select>`,true)}<div class="grid2"><label class="field">Zustellmenge<span class="fine" data-tour-max="${i}">${tourStopHint(s,tourDraft,i)}</span><input name="qty${i}" type="number" value="${esc(tourDraft['qty'+i]??2)}" min="1" max="${tourStopMax(s,tourDraft,i)}" step="1" required></label>${field('Rückgabemenge',`<input name="returnQty${i}" type="number" value="${esc(tourDraft['returnQty'+i]??0)}" min="0" max="1000" step="1" required>`)}</div></fieldset>`).join('')}<div class="tour-preview" data-tour-preview aria-live="polite">${tourPreview(s,tourDraft)}</div><button class="primary">Sammeltour verbindlich planen</button></form><div class="section-title" style="margin-top:20px"><h3>Beauftragte Touren</h3></div>${(s.tours||[]).slice().reverse().map(t=>tourCard(s,t)).join('')||empty('Keine Sammeltouren')}</section>`;}


function special(){const s=V().state,cold=s.batches.filter(b=>b.qty>0&&ITEMS[b.item]?.cold);return `<div class="notice">Kalibriermodule benötigen passende Kühlung. Temperatur wirkt über Zeit auf Qualität. Frachtklassen und Dokumente folgen fiktiven Spielregeln.</div><section class="section"><h3>Kühlkette</h3>${cold.map(b=>`<div class="card" style="margin-top:10px"><div class="card-top"><h3>${b.qty} × ${esc(name(ITEMS,b.item))}</h3>${badge(b.blocked?'Gesperrt':label(b.location),b.blocked?'bad':'')}</div>${kv('Temperatur',fmt(b.temperature??20,1)+' °C')}${kv('Qualität',fmt(b.quality,1)+' %')}${kv('Wärmeexposition',fmt(b.exposure||0)+' Min.')}${button('Chargenakte','select',b.id)}${b.coldDamaged&&(b.owner==='company'||s.orders.some(o=>o.id===b.owner&&o.status==='active'))?button('Entsorgen · 2 €/Stk.','disposeBatch',b.id,'danger'):''}</div>`).join('')||empty('Keine temperaturgeführte Ware','Forschung Kühlkettenlogistik, Kühllager und Kühlfahrzeug vorbereiten.')}</section><section class="section"><h3>Bahn, See und Luft</h3><p class="fine" style="margin:8px 0 15px">Buchbare Fremdleistungen ab eigenem Terminal. Dokumentprüfung, Umschlag und Fahrplan bestimmen tatsächliche Abfahrt.</p><form data-form="freight" class="form-grid">${field('Aktiver Auftrag',`<select name="orderId">${s.orders.filter(o=>o.status==='active').map(o=>`<option value="${o.id}">${esc(o.customer)} · ${esc(name(ITEMS,o.item))}</option>`).join('')||'<option value="">Kein aktiver Auftrag</option>'}</select>`,true)}${field('Verkehrsträger','<select name="mode"><option value="rail">Bahn</option><option value="sea">Seefracht</option><option value="air">Luftfracht</option></select>')}${field('Menge','<input name="qty" type="number" min="1" max="1000" value="8">')}<button class="primary">Fracht verbindlich buchen</button></form></section><section class="section"><h3>Frachtaufträge</h3>${(s.freights||[]).slice().reverse().map(f=>`<div class="card" style="margin-top:10px"><div class="card-top"><h3>${esc(label(f.mode))} · ${f.qty} Stück</h3>${badge(label(f.status),f.blocked?'warn':'')}</div>${kv('Auftrag',esc(s.orders.find(o=>o.id===f.orderId)?.customer||f.orderId))}${kv(f.departedAt?'Abgefahren':'Nächster Fahrplan',time(f.departedAt||f.nextDeparture))}${kv('Dokumente',f.documents==='approved'?'Freigegeben':f.documents==='processing'?'Prüfung · '+f.documentRemaining+' Min.':'Prüfung erforderlich')}${kv('Verpasste Anschlüsse',fmt(f.missedConnections||0))}${kv('Restzeit',fmt(f.remaining)+' Min.')}${f.blocked?`<p>${esc(f.blocked)}</p>`:''}<div class="actions">${f.documents==='pending'&&f.status!=='cancelled'?button('Dokumentprüfung starten','approveDocuments',f.id):''}${button('Akte','select',f.id)}${['loading','waiting'].includes(f.status)?button('Stornieren · Fracht verfällt','cancelFreight',f.id):''}</div></div>`).join('')||empty('Keine gebuchten Frachten')}</section>`;}

/** Einheitliche Auswertung aller tatsächlichen Zustellungen, ohne neue Geldbuchung. */
function deliveryRows(s){return [...s.shipments,...(s.freights||[]).map(f=>({...f,transportCost:f.tripCost??f.transportCost})),...(s.tours||[]).flatMap(t=>t.stops.map((st,i)=>({...st,id:t.id+' / '+(i+1),transportCost:(t.transportCost||0)*st.qty/t.stops.reduce((n,x)=>n+x.qty,0)})))];}
