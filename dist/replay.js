/* Replay 60 Min. (A12, W3c-S3). Ringpuffer serialisierter Zustände nur im Speicher, nie im Spielstand.
 * Reine Datenhaltung: liest übergebene Texte, ändert keinen Fachzustand. Darstellung und Sperren liegen in app.js.
 * Momentaufnahme = JSON-Text aus Simulation.serialize() (unkomprimiert; Größe über Budget begrenzt). */
export const REPLAY=Object.freeze({interval:5,window:60,slots:13,budget:30000000,speed:4});
/** Geschätzter Speicherbedarf eines Texts in Byte (UTF-16, obere Grenze). */
export function textBytes(text){return typeof text==='string'?text.length*2:0;}
/** Ringpuffer. due(t) meldet eine fällige Aufnahme (jede `interval`-te Spielminute), add(t,text) legt sie ab.
 * Grenzen: höchstens `slots` Einträge, nichts älter als `window` Minuten vor der jüngsten Aufnahme, Summe ≤ `budget`.
 * Über dem Budget werden innere Aufnahmen ausgedünnt (größere Abstände, Rückblick bleibt möglichst 60 Min.).
 * Passt eine einzelne Aufnahme nicht ins Budget, wird sie verworfen (skipped). */
export function createReplayBuffer({interval=REPLAY.interval,window:span=REPLAY.window,slots=REPLAY.slots,budget=REPLAY.budget}={}){
 let list=[],total=0,lastSlot=null;const stats={captures:0,skipped:0,dropped:0,maxMs:0,lastMs:0};
 const drop=i=>{total-=list[i].bytes;list.splice(i,1);stats.dropped++;};
 /** Innerer Eintrag, dessen Wegfall die kleinste Lücke erzeugt (ältester und jüngster bleiben). */
 const thinIndex=()=>{let best=1,gap=Infinity;for(let i=1;i<list.length-1;i++){const g=list[i+1].t-list[i-1].t;if(g<gap){gap=g;best=i;}}return best;};
 return {
  stats,
  get size(){return list.length;},
  get bytes(){return total;},
  /** Höchstzahl der Einträge bei aktueller Größe (≤ slots). */
  get capacity(){if(!list.length)return slots;const avg=total/list.length;return Math.max(1,Math.min(slots,Math.floor(budget/avg)));},
  due(t){if(!Number.isFinite(t))return false;const slot=Math.floor(t/interval);if(lastSlot!==null&&slot<lastSlot){this.clear();}return lastSlot===null||slot>lastSlot;},
  add(t,text,ms=0){
   if(!Number.isFinite(t)||typeof text!=='string')return false;
   const slot=Math.floor(t/interval);if(lastSlot!==null&&slot<lastSlot)this.clear();
   lastSlot=slot;stats.lastMs=ms;stats.maxMs=Math.max(stats.maxMs,ms);
   const bytes=textBytes(text);if(bytes>budget){stats.skipped++;return false;}
   if(list.length&&list[list.length-1].t>=t)drop(list.length-1);
   list.push({t,text,bytes});total+=bytes;stats.captures++;
   while(list.length>1&&list[0].t<t-span)drop(0);
   while(list.length>slots)drop(0);
   // Budget: Abstände ausdünnen statt nur die ältesten zu verwerfen, damit der Rückblick möglichst weit reicht.
   while(list.length>1&&total>budget)drop(list.length>2?thinIndex():0);
   return true;
  },
  /** Metadaten (ohne Text), älteste zuerst. */
  list(){return list.map(({t,bytes})=>({t,bytes}));},
  /** Eintrag {t,text} am nächsten an `target` (bei Gleichstand der ältere), oder null. */
  nearest(target){let best=null;for(const e of list)if(!best||Math.abs(e.t-target)<Math.abs(best.t-target))best=e;return best?{t:best.t,text:best.text}:null;},
  /** Jüngster Eintrag mit t ≤ target, sonst ältester. */
  atOrBefore(target){let best=null;for(const e of list)if(e.t<=target+1e-9)best=e;best??=list[0]||null;return best?{t:best.t,text:best.text}:null;},
  oldest(){return list[0]?.t??null;},
  clear(){list=[];total=0;lastSlot=null;}
 };
}
/** Größter wählbarer Rückblick (Vielfaches von interval, ≤ window) bei Live-Zeit `now`. */
export function maxOffset(buffer,now,{interval=REPLAY.interval,window:span=REPLAY.window}={}){const o=buffer.oldest();if(o===null||!(now>o))return 0;return Math.min(span,Math.ceil((now-o)/interval-1e-9)*interval);}
/** Anzeigezustand aus einer Momentaufnahme. Nur Darstellung: keine Validierung, nie in die Simulation übernehmen. */
export function parseSnapshot(text){return JSON.parse(text);}
