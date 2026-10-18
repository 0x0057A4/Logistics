import {ROLES} from './catalog.js';
export function init(s){s.workers??=[];}
export function onShift(w,t){const hour=(t%1440)/60;return w.shift==='all'||(w.shift==='night'?(hour>=16||hour<8):hour>=8&&hour<16);}
// Arbeitsleistung (A06 W1b): gleiche Erfahrungskappe wie Fertigung (min(1.5, skill)); Müdigkeit ab 50 senkt linear
// bis Faktor 0,8 bei 80 (ab 80 Pflichtpause). Ganzzahlig gerundet, mindestens 1 → Mengen bleiben exakt.
// Standardkraft (skill 1, Müdigkeit ≤ 50) liefert genau base.
export const FATIGUE_SLOW=50;
export const UNLOAD_BASE=20;   // Pakete je Minute einer Standard-Lagerkraft beim Entladen (yard.js)
export const GATE_ROLE='warehouse'; // Rückfallrolle der Torkontrolle (Altbezeichner; seit 0.16 GATE_ROLES)
// Personalrollen 0.16 (S2, A06): Spezialisten zuerst, Lagerkraft bleibt universeller Ersatz. Gleiche Aufgabenschlüssel
// wie bisher (`${id}:warehouse`, `${id}:gate`), daher bleiben Vorrangregeln (sorting.js) und Anzeige gültig.
export const FORK_ROLES=['forklift','warehouse']; // Staplerumschlag (Paletten, Sperrgut, Palettencontainer)
export const GATE_ROLES=['gate','warehouse'];     // Torkontrolle Wareneingang
export const SPECIALIST_FACTOR=1.25;
export function workFactor(w){const skill=Math.min(1.5,Math.max(0,w?.skill??1)),f=Math.min(80,Math.max(0,w?.fatigue??0));return skill*(1-Math.max(0,f-FATIGUE_SLOW)/150);}
/** Leistung je Minute. Ohne passende Spezialrolle (role fehlt oder w.role≠role) unverändert round(base·Faktor).
 * Spezialist (w.role===role): Faktor zusätzlich ×1,25. Mit Minute t ganzzahlig und zustandslos verteilt
 * (floor(r·(t+1))−floor(r·t), mindestens 1) → Mengen exakt, Mittel r, Speichern/Laden bitgleich; ohne t der Mittelwert
 * (nur Prognose/Anzeige). */
export function workRate(w,base,role,t){
 if(!role||w?.role!==role)return Math.max(1,Math.round(base*workFactor(w)));
 const r=base*workFactor(w)*SPECIALIST_FACTOR;
 if(t==null)return Math.max(1,r);
 return Math.max(1,Math.floor(r*(t+1))-Math.floor(r*t));
}
/** Gleiche Gültigkeit wie acquire: Standort, Schicht, keine Fortbildung/Versetzung/Pause, Müdigkeit < 80 (ohne Bindung). */
export function available(s,w,site){return w.site===site&&!w.training&&!w.relocation&&!(w.breakRemaining>0)&&onShift(w,s.t)&&w.fatigue<80;}
/** Anzahl freier, einsatzbereiter Personen einer Rolle am Standort (lesend). */
export function freeCount(s,role,site){let n=0;for(const w of s.workers)if(w.role===role&&!w.task&&available(s,w,site))n++;return n;}
export function createAPI(s,api){return {acquire(role,site,task){let w=s.workers.find(w=>w.task===task);if(w&&(!onShift(w,s.t)||w.training||w.relocation||w.breakRemaining>0||w.fatigue>=80||w.role!==role||w.site!==site)){w.task=null;w=null;}if(w)return w;w=s.workers.find(w=>w.role===role&&w.site===site&&!w.task&&!w.training&&!w.relocation&&!(w.breakRemaining>0)&&onShift(w,s.t)&&w.fatigue<80);if(w){w.task=task;w.activity='Unterwegs';}return w||null;},acquireAny(roles,site,task){let w=s.workers.find(w=>w.task===task);if(w&&(!available(s,w,site)||!roles.includes(w.role))){w.task=null;w=null;}if(w)return w;for(const role of roles){w=s.workers.find(w=>w.role===role&&!w.task&&available(s,w,site));if(w){w.task=task;w.activity='Unterwegs';return w;}}return null;},release(task){for(const w of s.workers)if(w.task===task){w.task=null;w.activity='Bereit';}}};}
export function handle(s,c,api){
 if(c.type==='hire'){if(!ROLES[c.role]||!s.sites.some(x=>x.id===(c.site||s.selectedSite)))return {ok:false,message:'Beruf oder Standort unbekannt.'};const id=api.id('worker'),r=ROLES[c.role];if(!api.book(`hire:${id}`,-r.hireCost,'personal','Einstellung '+r.name))return {ok:false,message:'Kapital reicht nicht.'};const names=['Mira','Jona','Lina','Emil','Nora','Timo','Ada','Levi'];s.workers.push({id,name:names[s.workers.length%names.length]+' '+id.split('-').at(-1),role:c.role,site:c.site||s.selectedSite,task:null,shift:'day',skill:1,fatigue:0,wage:r.wage,activity:'Bereit'});return {ok:true,id};}
 if(!['fire','train','setShift','moveWorker'].includes(c.type))return null;const w=s.workers.find(x=>x.id===c.id);if(!w)return {ok:false,message:'Person nicht gefunden.'};
 if(c.type==='moveWorker'){if(w.task||w.training||w.relocation)return {ok:false,message:'Person benötigt freie Zeit für Standortwechsel.'};if(c.toSite===w.site||!s.sites.some(x=>x.id===c.toSite))return {ok:false,message:'Anderen gültigen Zielstandort wählen.'};w.relocation={toSite:c.toSite,remaining:30,duration:30};w.activity='Standortwechsel';return {ok:true};}
 if(c.type==='fire'){if(w.task||w.training||w.relocation)return {ok:false,message:'Person arbeitet oder lernt. Zuerst Tätigkeit beenden.'};s.workers.splice(s.workers.indexOf(w),1);return {ok:true};}
 if(c.type==='setShift'){if(!['day','night','all'].includes(c.shift))return {ok:false,message:'Ungültige Schicht.'};w.shift=c.shift;if(!onShift(w,s.t)){w.task=null;w.activity='Feierabend';}return {ok:true};}
 if(w.skill>=3)return {ok:false,message:'Höchste Qualifikation erreicht.'};if(w.task||w.training||w.relocation)return {ok:false,message:'Fortbildung benötigt freie Person.'};const id=api.id('training');if(!api.book(id,-900,'personal','Fortbildung',[w.id]))return {ok:false,message:'Kapital reicht nicht.'};w.training={id,remaining:90,duration:90};w.activity='Fortbildung';return {ok:true};
}
export function step(s,api){for(const w of s.workers){if(w.relocation){w.task=null;w.activity='Standortwechsel';if(onShift(w,s.t))api.book(`wage:${w.id}:${s.t}`,-w.wage/60,'personal','Arbeitslohn',[w.id]);w.relocation.remaining--;if(w.relocation.remaining<=0){w.site=w.relocation.toSite;w.relocation=null;w.activity='Bereit';api.log('personnel',`${w.name}: Zielstandort erreicht.`,[w.id]);}continue;}if(!onShift(w,s.t)){w.task=null;w.activity='Feierabend';w.fatigue=Math.max(0,w.fatigue-0.5);continue;}api.book(`wage:${w.id}:${s.t}`,-w.wage/60,'personal','Arbeitslohn',[w.id]);if(w.fatigue>=80&&!w.breakRemaining){w.breakRemaining=30;w.task=null;}if(w.breakRemaining>0){w.breakRemaining--;w.fatigue=Math.max(0,w.fatigue-1.2);w.activity='Erholungspause';continue;}if(w.training){w.training.remaining--;w.activity='Fortbildung';if(w.training.remaining<=0){w.skill=Math.min(3,w.skill+0.25);w.training=null;api.log('personnel',`${w.name}: Fortbildung abgeschlossen.`,[w.id]);}continue;}w.fatigue=Math.max(0,Math.min(100,w.fatigue+(w.task?0.18:-0.4)));if(!w.task)w.activity='Bereit';}}

/** Lesesicht für das Personalfenster (A10): aktuelle Tätigkeit inkl. Hub-Bindungen. Ändert nichts.
 * Rückgabe {kind,text,ref}; kind ∈ unload|gate|sort|handsort|task|break|training|relocation|off|idle. */
export function describeAssignment(s,w){
 if(!w)return null;
 if(w.relocation)return {kind:'relocation',text:'Standortwechsel',ref:w.relocation.toSite};
 if(w.training)return {kind:'training',text:'Fortbildung',ref:w.training.id};
 if(w.breakRemaining>0)return {kind:'break',text:`Erholungspause (${Math.ceil(w.breakRemaining)} min)`,ref:null};
 if(!onShift(w,s.t))return {kind:'off',text:'Feierabend',ref:null};
 const key=w.task;if(!key)return {kind:'idle',text:'Bereit',ref:null};
 const i=key.lastIndexOf(':'),id=i>0?key.slice(0,i):key,suffix=i>0?key.slice(i+1):'';
 const a=(suffix==='warehouse'||suffix==='gate')?(s.yard||[]).find(x=>x.id===id):null;
 if(a&&suffix==='warehouse')return {kind:'unload',text:`Entlädt ${a.plate} (${a.unloaded}/${a.parcels} Pakete, ${workRate(w,UNLOAD_BASE)}/min)`,ref:a.id};
 if(a&&suffix==='gate')return {kind:'gate',text:`Torkontrolle ${a.plate}`,ref:a.id};
 if(suffix==='sort'){const b=s.buildings.find(x=>x.id===id);if(b)return {kind:'sort',text:'Sortierplatz',ref:b.id};}
 if(suffix==='handsort'){const site=s.sites.find(x=>x.id===id);if(site)return {kind:'handsort',text:`Handsortierung ${site.name||site.id}`,ref:site.id};}
 return {kind:'task',text:w.activity||'Im Einsatz',ref:key};
}

export function validate(s){
 const fail=text=>{throw new Error('Personaldaten beschädigt: '+text);};
 const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
 for(const w of s.workers){
  if(w.breakRemaining!=null&&!finite(w.breakRemaining,0,30))fail('Pausendauer');
  if(w.training&&(!finite(w.training.remaining,0,90)||w.training.duration!==90||typeof w.training.id!=='string'||w.task||w.relocation))fail('Fortbildung');
  if(w.relocation&&(!finite(w.relocation.remaining,0,30)||w.relocation.duration!==30||!s.sites.some(x=>x.id===w.relocation.toSite)||w.relocation.toSite===w.site||w.task))fail('Standortwechsel');
 }
}
