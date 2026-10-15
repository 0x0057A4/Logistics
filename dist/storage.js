/** Spielstandspeicher (A12, Welle 1b, QS-W0-03/11).
 *
 * Zwei Backends hinter einer synchron lesbaren Schnittstelle:
 *  - 'idb':   IndexedDB (Datenbank `<prefix>`, Objektspeicher `saves` + `meta`). Werte liegen nach load()
 *             im Speicher-Cache; get() ist synchron, write() aktualisiert den Cache sofort und schreibt in
 *             EINER IndexedDB-Transaktion (Commit asynchron, Ergebnis über Promise/Callbacks).
 *  - 'local': bisheriges Verhalten über localStorage (synchron, wirft bei Quota).
 *  - 'error': IndexedDB war bereits in Gebrauch (Marker), ist jetzt aber nicht erreichbar. Kein stiller
 *             Rückfall auf veraltete localStorage-Daten; App bleibt schreibgeschützt/temporär.
 *
 * Tab-Sperre (save-guard.js) und Einstellungen bleiben in localStorage. Nur der Sperrinhaber schreibt.
 * IndexedDB ordnet readwrite-Transaktionen mit gleichem Bereich in Erzeugungsreihenfolge, auch über
 * Verbindungen hinweg: ein nach Sperrübernahme gestartetes load() sieht alle zuvor erzeugten Schreibvorgänge.
 *
 * Migration: localStorage-Stände (Hauptstand, -backup, -backup-hold) werden in einer strikten Transaktion
 * übernommen, solange der Marker `meta/migrated` fehlt (Prüfung und Schreiben atomar in derselben
 * Transaktion → zwei gleichzeitig startende Tabs migrieren höchstens einmal). Danach Rücklesen und Vergleich.
 * Originale bleiben bis zum nächsten Start erhalten und werden erst entfernt, wenn der Marker in IndexedDB
 * UND der Backend-Marker in localStorage vorliegen.
 *
 * Notfall-Kopie: emergency(key,text) legt beim Verlassen den zuletzt geschriebenen Stand zusätzlich in
 * localStorage ab (`<key>-emergency`, Format `<at>\n<text>`), falls ≤ emergencyLimit Zeichen. Sie wird
 * entfernt, sobald ein Schreibvorgang desselben Schlüssels bestätigt ist. takeEmergency() liefert sie beim
 * nächsten Start nur, wenn sie neuer ist als der IndexedDB-Datensatz.
 */
export const SAVE_SUFFIXES=['','-backup','-backup-prev','-backup-hold'];
export const SAVE_MODES=['guided','economy','sandbox'];
const SAVES='saves', META='meta';

const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IndexedDB-Anfrage fehlgeschlagen.'));});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('IndexedDB-Transaktion fehlgeschlagen.'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB-Transaktion abgebrochen.'));});

export class SaveStore {
  constructor(options={}){
    this.prefix=options.prefix??'industrie-logistik-v1';
    this.modes=options.modes??SAVE_MODES;
    this.idb=options.indexedDB===undefined?(()=>{try{return globalThis.indexedDB;}catch{return undefined;}})():options.indexedDB;
    const storage=options.storage;
    this.ls=()=>{try{return storage===undefined?globalThis.localStorage:typeof storage==='function'?storage():storage;}catch{return null;}};
    this.now=options.now??Date.now;
    this.openTimeoutMs=options.openTimeoutMs??5000;
    this.emergencyLimit=options.emergencyLimit??2400000;
    this.onWriteError=options.onWriteError??(()=>{});
    this.onCommit=options.onCommit??(()=>{});
    this.dbName=options.dbName??this.prefix;
    this.kind='pending';this.reason='';this.error=null;this.db=null;
    this.cache=new Map();this.stamps=new Map();this.keys=new Set();this.loaded=new Set();
    this.seq=0;this.lastAt=0;this.inflight=new Set();this.pendingKeys=new Map();this.emSeq=new Map();
    this.migration=null;
  }
  get lazy(){return this.kind==='idb';}
  get markerKey(){return this.prefix+'-backend';}
  keysFor(mode){return SAVE_SUFFIXES.map(s=>`${this.prefix}-${mode}${s}`);}
  readMarker(){try{return this.ls()?.getItem(this.markerKey)??null;}catch{return null;}}
  stamp(){const t=Math.max(this.now(),this.lastAt+1);this.lastAt=t;return t;}
  /** Öffnet das Backend einmalig. Ergebnis: 'idb' | 'local' | 'error'. */
  open(){return this.opening??=this.doOpen();}
  /** Erneuter Versuch nach 'error' („Speicher erneut prüfen“). */
  retry(){if(this.kind!=='error')return Promise.resolve(this.kind);this.kind='pending';this.opening=null;this.closed=false;return this.open();}
  async doOpen(){
    const marker=this.readMarker();
    const fallback=(reason,error=null)=>{this.reason=reason;this.error=error;this.kind=marker==='idb'?'error':'local';try{this.db?.close();}catch{}this.db=null;return this.kind;};
    if(!this.idb?.open)return fallback('idb-unavailable');
    try{this.db=await this.openDb();}catch(e){return fallback('idb-open',e);}
    this.db.onversionchange=()=>{try{this.db.close();}catch{}this.closed=true;};
    this.db.onclose=()=>{this.closed=true;};
    try{await this.migrate();this.keys=new Set((await request(this.db.transaction(SAVES,'readonly').objectStore(SAVES).getAllKeys())).map(String));}
    catch(e){return fallback('idb-migrate',e);}
    this.kind='idb';
    try{this.ls()?.setItem(this.markerKey,'idb');}catch{/* Marker fehlt → Originale bleiben bis zum nächsten Start. */}
    if(this.migration?.removable)this.removeOriginals();
    return this.kind;
  }
  openDb(){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('IndexedDB antwortet nicht.'));}},this.openTimeoutMs);
      let r;
      try{r=this.idb.open(this.dbName,1);}catch(e){clearTimeout(timer);settled=true;reject(e);return;}
      r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(SAVES))db.createObjectStore(SAVES);if(!db.objectStoreNames.contains(META))db.createObjectStore(META);};
      r.onsuccess=()=>{clearTimeout(timer);if(settled){try{r.result.close();}catch{}return;}settled=true;resolve(r.result);};
      r.onerror=()=>{clearTimeout(timer);if(!settled){settled=true;reject(r.error||new Error('IndexedDB nicht verfügbar.'));}};
      r.onblocked=()=>{/* Nur bei Versionswechsel; Zeitlimit greift. */};
    });
  }
  legacy(){
    const ls=this.ls(),found=new Map();if(!ls)return found;
    for(const mode of this.modes)for(const key of this.keysFor(mode)){let v=null;try{v=ls.getItem(key);}catch{}if(v!==null&&v!==undefined)found.set(key,v);}
    return found;
  }
  async migrate(){
    const legacy=this.legacy(),db=this.db;
    const tx=db.transaction([SAVES,META],'readwrite',{durability:'strict'}),saves=tx.objectStore(SAVES),meta=tx.objectStore(META);
    let migratedNow=false,previous=null;
    const finished=done(tx);
    const marker=await request(meta.get('migrated'));
    if(!marker){
      const at=this.stamp();
      for(const [key,value]of legacy)saves.put({value,at},key);
      meta.put({at,keys:[...legacy.keys()]},'migrated');migratedNow=true;
    }else previous=marker;
    await finished;
    if(migratedNow){
      // Rücklesen in neuer Transaktion. Abweichung → Marker zurücknehmen, Originale bleiben, Rückfall localStorage.
      const check=db.transaction(SAVES,'readonly').objectStore(SAVES),entries=[...legacy];
      const rows=await Promise.all(entries.map(([key])=>request(check.get(key))));
      const bad=entries.find(([,value],i)=>rows[i]?.value!==value);
      if(bad){await this.dropMarker();throw new Error('Migration nicht bestätigt: '+bad[0]);}
      this.migration={count:legacy.size,keys:[...legacy.keys()],removable:false,at:this.lastAt};
    }else this.migration={count:0,keys:previous.keys||[],removable:legacy.size>0&&this.readMarker()==='idb',pending:legacy.size};
  }
  async dropMarker(){try{const tx=this.db.transaction(META,'readwrite');tx.objectStore(META).delete('migrated');await done(tx);}catch{/* best effort */}}
  /** Originale erst ab dem zweiten Start mit bestätigtem IndexedDB-Marker entfernen. */
  removeOriginals(){
    const ls=this.ls();if(!ls)return 0;let n=0;
    for(const key of this.legacy().keys()){try{ls.removeItem(key);n++;}catch{}}
    this.migration.removed=n;return n;
  }
  /** Lädt Schlüssel in den Cache (nur IndexedDB). */
  async load(keys){
    if(this.kind!=='idb')return;
    const os=this.db.transaction(SAVES,'readonly').objectStore(SAVES);
    const rows=await Promise.all(keys.map(k=>request(os.get(k))));
    keys.forEach((k,i)=>{if(this.pendingKeys.get(k))return;const rec=rows[i];this.cache.set(k,rec?.value??null);this.stamps.set(k,rec?.at??0);this.loaded.add(k);if(rec)this.keys.add(k);else this.keys.delete(k);});
  }
  get(key){
    if(this.kind==='idb'){if(!this.loaded.has(key))throw new Error('Spielstand nicht geladen: '+key);return this.cache.get(key)??null;}
    if(this.kind==='error')throw new Error('Spielstandspeicher nicht erreichbar.');
    return this.ls().getItem(key);
  }
  has(key){
    if(this.kind==='idb')return this.keys.has(key);
    if(this.kind==='error')throw new Error('Spielstandspeicher nicht erreichbar.');
    return this.ls().getItem(key)!==null;
  }
  /** Schreibt {key: text|null} gemeinsam. local: synchron, wirft bei Fehler. idb: Cache sofort, eine
   * Transaktion; Promise<{ok,error}> verwirft nie. Fehler zusätzlich über onWriteError, Cache wird nachgeladen. */
  write(entries){
    const list=Object.entries(entries);
    if(this.kind==='local'){const ls=this.ls();for(const [k,v]of list)v===null?ls.removeItem(k):ls.setItem(k,v);return Promise.resolve({ok:true});}
    if(this.kind!=='idb')throw new Error('Spielstandspeicher nicht erreichbar.');
    const seq=++this.seq,at=this.stamp(),keys=list.map(([k])=>k);
    for(const [k,v]of list){if(v===null){this.cache.set(k,null);this.keys.delete(k);}else{this.cache.set(k,v);this.keys.add(k);}this.stamps.set(k,at);this.loaded.add(k);this.pendingKeys.set(k,(this.pendingKeys.get(k)||0)+1);}
    const settle=()=>{for(const k of keys){const n=(this.pendingKeys.get(k)||1)-1;n?this.pendingKeys.set(k,n):this.pendingKeys.delete(k);}};
    let p;
    try{
      if(this.closed)throw new Error('IndexedDB-Verbindung geschlossen.');
      const tx=this.db.transaction(SAVES,'readwrite'),os=tx.objectStore(SAVES);
      for(const [k,v]of list)v===null?os.delete(k):os.put({value:v,at},k);
      const finished=done(tx);
      try{tx.commit?.();}catch{/* bereits aktiv beendet */}
      p=finished.then(()=>{settle();this.clearEmergencies(keys,seq);try{this.onCommit({seq,keys});}catch{}return {ok:true,seq};});
    }catch(e){p=Promise.reject(e);}
    p=p.catch(error=>{settle();this.load(keys).catch(()=>{});try{this.onWriteError({seq,keys,error});}catch{}return {ok:false,error,seq};});
    this.inflight.add(p);p.finally(()=>this.inflight.delete(p));
    return p;
  }
  get pending(){return this.inflight.size;}
  pendingFor(key){return this.pendingKeys.get(key)||0;}
  flush(){return Promise.all([...this.inflight]);}
  emergencyKey(key){return key+'-emergency';}
  /** Notfall-Kopie des zuletzt geschriebenen Stands (nur IndexedDB). true = abgelegt. */
  emergency(key,text){
    if(this.kind!=='idb'||typeof text!=='string')return false;
    const ls=this.ls();if(!ls)return false;const ek=this.emergencyKey(key);
    try{ls.removeItem(ek);}catch{return false;}
    if(text.length>this.emergencyLimit)return false;
    try{ls.setItem(ek,`${this.stamps.get(key)||this.stamp()}\n${text}`);this.emSeq.set(key,this.seq);return true;}
    catch{try{ls.removeItem(ek);}catch{}return false;}
  }
  clearEmergencies(keys,seq){
    for(const k of keys){const s=this.emSeq.get(k);if(s!==undefined&&s<=seq){this.emSeq.delete(k);try{this.ls()?.removeItem(this.emergencyKey(k));}catch{}}}
  }
  /** Beim Start (nur als Sperrinhaber, nach load): Notfall-Kopie, falls neuer als der IndexedDB-Datensatz. */
  takeEmergency(key){
    if(this.kind!=='idb')return null;
    const ls=this.ls();if(!ls)return null;let raw=null;try{raw=ls.getItem(this.emergencyKey(key));}catch{return null;}
    if(raw===null||raw===undefined)return null;
    const nl=raw.indexOf('\n'),at=Number(raw.slice(0,nl)),value=raw.slice(nl+1);
    if(nl<1||!Number.isFinite(at)||at<(this.stamps.get(key)||0)||value===this.cache.get(key)){this.dropEmergency(key);return null;}
    // Wird beim nächsten bestätigten Schreiben dieses Schlüssels entfernt.
    this.emSeq.set(key,this.seq+1);
    return {value,at};
  }
  dropEmergency(key){this.emSeq.delete(key);try{this.ls()?.removeItem(this.emergencyKey(key));}catch{}}
}

export const createSaveStore=options=>new SaveStore(options);
