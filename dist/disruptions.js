// Wetter und Störungen (0.16 S1, A03/A07). Schnittstelle: docs/SCHNITTSTELLEN-0.16.md (S1).
// Zustand s.disruptions={day, weather:{[siteId]:{kind,since,until,next?}}, events:[…], log:[]} entsteht erst bei der ersten
// Tagesplanung ab START_T (Spieltag 2, 14:00). Davor und in Altständen ohne Feld wirkt nichts: alle Exporte liefern neutrale
// Werte, perf-determinism-Hashes und Abläufe bis dahin bleiben wie in 0.15.
// Zufall: eigener Generator je Standort und Tag aus s.seed (Wert zum Planungszeitpunkt), Spieltag und Standort-ID
// (Muster contracts.slotRandom). api.random wird nie gezogen; der Tagesplan wird gespeichert, damit Lesezugriffe
// rein und über Speichern/Laden bitgleich sind.
// Tagesplanung im ersten Minutentakt eines neuen Spieltags (Minute 0; Tag 2 erst ab START_T). Module, die vor disruptions
// laufen (transport, tours …), sehen in genau dieser Minute noch kein neues Wetter (neutral) – Dauer gilt ab Start.
// Werte vorläufig (A02 balanciert): Wetteranteile, Fahrtzeitfaktoren, Verspätungen und Ereignishäufigkeiten unten.
// s.settings.incidents===false schaltet neue Störungen und Wetter ab (Planung entfällt, laufende Ereignisse enden regulär).

export const START_T=1800+480; // erste mögliche Wirkung: Spieltag 2, 14:00 (Schnittstelle 0.16)
export const WEATHER=['clear','rain','fog','snow','storm'];
export const EVENT_KINDS=['jam','gate','grid'];
export const WEATHER_NAME={clear:'klar',rain:'Regen',fog:'Nebel',snow:'Schnee',storm:'Sturm'};
// Vorläufig: Anteil je Tag (Summe 1) · Fahrtzeitfaktor · Verspätung fremder Lkw in Minuten (Basis, +0…50 % je Vertrag).
export const WEATHER_SHARE={clear:0.55,rain:0.2,fog:0.1,snow:0.08,storm:0.07};
export const WEATHER_FACTOR={clear:1,rain:1.1,fog:1.15,snow:1.35,storm:1.25};
export const WEATHER_DELAY={clear:0,rain:5,fog:15,snow:30,storm:20};
/** Wahrscheinlichkeit eines Wetterwechsels im Tagesverlauf (Wechselminute 06:00–18:00). */
export const WEATHER_CHANGE=0.25;
// Vorläufig: Ereignis je Standort, Tag und Art mit Wahrscheinlichkeit p (0,2 ≈ 1,4 je Woche), Dauer [min,max] Minuten.
// jam: Zusatzfahrtzeit 20–60 % (pct) auf einem Zustellgebiet, einer Linie oder – ohne beides – allen Abfahrten des Standorts.
export const EVENTS={
 jam:{p:0.2,duration:[60,240],pct:[20,60]},
 gate:{p:0.2,duration:[20,90]},
 grid:{p:0.2,duration:[15,60]},
};
const LOG_KEEP=30;

const dayOf=t=>Math.floor(t/1440)+1;
function hashText(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h;}
/** mulberry32 aus Seed, Spieltag und Salz (liest s.seed nur). */
export function dayRandom(s,day,salt){
 let a=(s.seed^Math.imul(day,2654435761)^Math.imul(salt>>>0,0x9E3779B1)^0x2545F491)>>>0;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
const between=(r,[lo,hi])=>lo+Math.floor(r()*(hi-lo+1));
function drawWeather(r){let x=r(),acc=0;for(const k of WEATHER){acc+=WEATHER_SHARE[k];if(x<acc)return k;}return 'clear';}
const siteName=(s,id)=>s.sites.find(x=>x.id===id)?.name||id;

/** Wetterlage eines Standorts zum Zeitpunkt t (Standard s.t) oder 'clear'. Rein lesend. */
export function weatherAt(s,site,t=s.t){
 const w=s.disruptions?.weather?.[site];if(!w)return 'clear';
 if(t>=w.since&&t<w.until)return w.kind;
 if(w.next&&t>=w.until&&t<w.next.until)return w.next.kind;
 return 'clear';
}
const live=(e,t)=>t>=e.startT&&t<e.endT;
function liveEvents(s,site,kind,t=s.t){const list=s.disruptions?.events;if(!list)return [];return list.filter(e=>e.site===site&&e.kind===kind&&live(e,t));}
const matches=(e,ctx)=>!e.target||(e.target.line?e.target.line===ctx.line:(e.target.lane===ctx.lane&&e.target.contract===ctx.contract));

/** Fahrtzeitfaktor ≥ 1 (Wetter × Stau) zum Zeitpunkt s.t. ctx: {lane, contract} (Zustellgebiet eines Vertrags) oder {line}. */
export function travelFactor(s,site,ctx={}){
 if(!s.disruptions)return 1;
 let jam=1;for(const e of liveEvents(s,site,'jam'))if(matches(e,ctx||{}))jam=Math.max(jam,1+e.pct/100);
 return WEATHER_FACTOR[weatherAt(s,site)]*jam;
}
/** Fahrtdauer in ganzen Minuten beim Start: minutes × travelFactor, aufgerundet; ohne Störung exakt minutes. */
export function travelMinutes(s,site,minutes,ctx){
 const f=travelFactor(s,site,ctx);return f===1?minutes:Math.ceil(minutes*f-1e-9);
}
/** Zusätzliche Minuten bis zur Ankunft fremder Lkw (Wetter am Zielstandort, je Vertrag +0…50 %). */
export function arrivalDelay(s,site,contractId){
 if(!s.disruptions)return 0;
 const base=WEATHER_DELAY[weatherAt(s,site)];if(!base)return 0;
 return base+hashText(String(contractId??'')+':'+dayOf(s.t))%(Math.floor(base/2)+1);
}
export function gateDown(s,site){return !!s.disruptions&&liveEvents(s,site,'gate').length>0;}
export function gridDown(s,site){return !!s.disruptions&&liveEvents(s,site,'grid').length>0;}
/** Netzanteil der Standortenergie: site.energy, während einer Netzstörung 0 (Energiegebäude zählen weiter). */
export function gridEnergy(s,site){const st=s.sites.find(x=>x.id===site);return !st||gridDown(s,site)?0:st.energy;}
/** Aktive Wetterlage (nicht klar) und Ereignisse eines Standorts für die Anzeige. */
export function active(s,site){
 const d=s.disruptions;if(!d)return [];const out=[],t=s.t,kind=weatherAt(s,site);
 if(kind!=='clear'){const w=d.weather[site],until=t<w.until?w.until:w.next.until;out.push({kind:'weather',weather:kind,site,until,factor:WEATHER_FACTOR[kind],text:`${WEATHER_NAME[kind]}: Fahrten ≈ ${Math.round((WEATHER_FACTOR[kind]-1)*100)} % länger, Fremd-Lkw bis ${WEATHER_DELAY[kind]+Math.floor(WEATHER_DELAY[kind]/2)} Min. später.`});}
 for(const e of d.events)if(e.site===site&&live(e,t))out.push({...e});
 return out;
}

export function init(){}
export function handle(){return null;}

function jamTargets(s,site){
 const out=[];
 for(const k of s.contracts||[])if(k.status==='active'&&k.unit!=='air')for(const lane of k.lanes||[])if((lane.site||k.site)===site)out.push({contract:k.id,lane:lane.id,name:lane.name});
 for(const l of s.lines||[])if(l.from===site&&l.active!==false)out.push({line:l.id,name:siteName(s,l.from)+' → '+siteName(s,l.to)});
 return out;
}
function eventText(s,e){
 const where=siteName(s,e.site),min=e.endT-e.startT;
 if(e.kind==='jam')return `Stau ${e.target?e.target.name:'im Umland von '+where}: Fahrten +${e.pct} % für ${min} Min.`;
 if(e.kind==='gate')return `Torstörung ${where}: Torkontrolle steht ${min} Min.`;
 return `Netzstörung ${where}: Netzstrom fällt ${min} Min. aus, nur Energiegebäude liefern Strom.`;
}
// Tagesplan: je Standort Wetter (ggf. ein Wechsel) und je Art höchstens ein Ereignis. Feste Zahl Zufallszüge je Standort.
function planDay(s,api,day){
 const d=s.disruptions??={day:0,weather:{},events:[],log:[]};
 const t=s.t,dayEnd=day*1440,from=Math.max(t,(day-1)*1440);
 d.day=day;d.events=d.events.filter(e=>e.endT>t);
 if(s.settings?.incidents===false){d.weather={};return;}
 const weather={};
 for(const site of s.sites){
  const r=dayRandom(s,day,hashText(site.id));
  const kind=drawWeather(r),change=r()<WEATHER_CHANGE,second=drawWeather(r),at=(day-1)*1440+between(r,[360,1080]);
  const prev=weatherAt(s,site.id,t-1);
  weather[site.id]=change&&at>from&&second!==kind?{kind,since:from,until:at,next:{kind:second,until:dayEnd}}:{kind,since:from,until:dayEnd};
  if(kind!==prev)api.log('disruption',`Wetter ${site.name}: ${WEATHER_NAME[kind]}${kind==='clear'?'.':`, Fahrten ≈ ${Math.round((WEATHER_FACTOR[kind]-1)*100)} % länger.`}`,[site.id]);
  const targets=jamTargets(s,site.id);let n=0;
  for(const kindE of EVENT_KINDS){
   const spec=EVENTS[kindE],hit=r()<spec.p,startT=from+Math.floor(r()*(dayEnd-from)),duration=between(r,spec.duration),pct=between(r,spec.pct||[0,0]),pickT=r();
   if(!hit||d.events.some(e=>e.site===site.id&&e.kind===kindE&&e.endT>startT))continue;
   const e={id:`disruption-${day}-${site.id}-${++n}`,kind:kindE,site:site.id,startT,endT:startT+duration};
   if(kindE==='jam'){e.pct=pct;if(targets.length)e.target=targets[Math.floor(pickT*targets.length)];}
   e.text=eventText(s,e);d.events.push(e);
  }
 }
 d.weather=weather;
}

export function step(s,api){
 const t=s.t;if(t<START_T)return;
 const day=dayOf(t);
 if(!s.disruptions||s.disruptions.day<day){if(!s.disruptions&&s.settings?.incidents===false)return;planDay(s,api,day);}
 const d=s.disruptions;
 for(const [id,w] of Object.entries(d.weather))if(w.next&&t===w.until&&w.next.kind!==w.kind)api.log('disruption',`Wetterwechsel ${siteName(s,id)}: ${WEATHER_NAME[w.next.kind]}${w.next.kind==='clear'?'.':`, Fahrten ≈ ${Math.round((WEATHER_FACTOR[w.next.kind]-1)*100)} % länger.`}`,[id]);
 for(const e of d.events){
  if(e.startT===t)api.log('disruption',e.text,[e.id,e.site]);
  if(e.endT===t){api.log('disruption',`Behoben: ${e.text.split(':')[0]}.`,[e.id,e.site]);d.log.push({id:e.id,kind:e.kind,site:e.site,startT:e.startT,endT:e.endT,text:e.text});if(d.log.length>LOG_KEEP)d.log.splice(0,d.log.length-LOG_KEEP);}
 }
 if(d.events.some(e=>e.endT<=t))d.events=d.events.filter(e=>e.endT>t);
}

export function validate(s){
 const d=s.disruptions;if(d===undefined)return true;
 const fail=m=>{throw new Error('Störungsdaten beschädigt: '+m);};
 const int=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
 if(!d||typeof d!=='object'||Array.isArray(d)||!int(d.day)||!d.weather||typeof d.weather!=='object'||Array.isArray(d.weather)||!Array.isArray(d.events)||!Array.isArray(d.log))fail('Aufbau');
 const sites=new Set(s.sites.map(x=>x.id));
 for(const [id,w] of Object.entries(d.weather)){
  if(!sites.has(id)||!w||!WEATHER.includes(w.kind)||!int(w.since)||!int(w.until)||w.until<w.since)fail('Wetter');
  if(w.next!==undefined&&(!w.next||!WEATHER.includes(w.next.kind)||!int(w.next.until)||w.next.until<w.until))fail('Wetterwechsel');
 }
 const ids=new Set();
 for(const e of [...d.events,...d.log]){
  if(!e||typeof e.id!=='string'||!EVENT_KINDS.includes(e.kind)||typeof e.site!=='string'||!int(e.startT)||!int(e.endT)||e.endT<=e.startT||typeof e.text!=='string')fail('Ereignis');
  if(e.pct!==undefined&&!(Number.isFinite(e.pct)&&e.pct>0&&e.pct<=100))fail('Stau');
 }
 for(const e of d.events){if(ids.has(e.id))fail('Doppelte Ereignis-ID');ids.add(e.id);if(!sites.has(e.site))fail('Standort');}
 if(d.log.length>LOG_KEEP)fail('Protokoll');
 return true;
}
