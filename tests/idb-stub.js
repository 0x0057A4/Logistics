// Minimaler IndexedDB-Ersatz für Node-Prüfungen von dist/storage.js (fake-indexeddb nicht verfügbar).
// Abgebildet: open/onupgradeneeded, Objektspeicher mit out-of-line keys (get/put/delete/getAllKeys),
// Transaktionen strikt nacheinander in Erzeugungsreihenfolge (auch über Verbindungen), Auto-Commit wenn nach
// einem Makrotask keine Anfrage mehr aussteht, Atomarität (Abbruch verwirft alle Änderungen der Transaktion).
// Fehlerinjektion: failOpen, hangOpen, failPut(key,value)→Error|null, freeze (Commits bleiben aus = Tab beendet).
// Nicht abgebildet: Indizes, Cursor, Versionswechsel > 1, structured-clone-Sonderfälle.
const tick=()=>new Promise(r=>setImmediate(r));
const err=(name,message=name)=>Object.assign(new Error(message),{name});

export function createIDB(options={}){
  const dbs=new Map();
  const factory={
    options,
    open(name){
      const req={result:null,error:null};
      setImmediate(()=>{
        if(factory.options.hangOpen)return;
        if(factory.options.failOpen){req.error=err('UnknownError','IndexedDB gesperrt');req.onerror?.();return;}
        let data=dbs.get(name),fresh=false;
        if(!data){data={stores:new Map(),queue:[],running:null};dbs.set(name,data);fresh=true;}
        const conn=connection(data);
        req.result=conn;
        if(fresh)req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
    /** Direkter Lesezugriff für Prüfungen (bestätigter Stand). */
    peek(name,store,key){return dbs.get(name)?.stores.get(store)?.get(key);},
    keys(name,store){return [...(dbs.get(name)?.stores.get(store)?.keys()||[])];},
    set(name,store,key,value){dbs.get(name).stores.get(store).set(key,value);},
    pendingTx(name){const d=dbs.get(name);return d?d.queue.length+(d.running?1:0):0;}
  };
  function connection(data){
    const conn={closed:false,
      objectStoreNames:{contains:n=>data.stores.has(n)},
      createObjectStore(n){data.stores.set(n,new Map());return {};},
      close(){conn.closed=true;},
      transaction(names,mode='readonly'){
        if(conn.closed)throw err('InvalidStateError','Verbindung geschlossen');
        names=[].concat(names);for(const n of names)if(!data.stores.has(n))throw err('NotFoundError',n);
        const tx={mode,ops:[],staged:new Map(),aborted:false,error:null,
          objectStore(n){
            const op=(kind,key,value)=>{const req={result:undefined,error:null};tx.ops.push({kind,store:n,key,value,req});pump(data);return req;};
            return {get:k=>op('get',k),put:(v,k)=>op('put',k,v),delete:k=>op('delete',k),getAllKeys:()=>op('keys')};
          },
          commit(){}
        };
        data.queue.push(tx);pump(data);
        return tx;
      }
    };
    return conn;
  }
  function view(data,tx,store){const base=data.stores.get(store),st=tx.staged.get(store)||new Map();return {get:k=>st.has(k)?st.get(k):base.get(k),keys:()=>{const all=new Set([...base.keys(),...st.keys()]);for(const [k,v]of st)if(v===undefined)all.delete(k);return [...all];}};}
  async function pump(data){
    if(data.running||!data.queue.length)return;
    const tx=data.queue.shift();data.running=tx;
    await tick();
    for(;;){
      while(tx.ops.length&&!tx.aborted){
        const {kind,store,key,value,req}=tx.ops.shift();
        const v=view(data,tx,store);
        if(kind==='get')req.result=v.get(key)===undefined?undefined:structuredClone(v.get(key));
        else if(kind==='keys')req.result=v.keys();
        else{
          if(tx.mode!=='readwrite'){req.error=err('ReadOnlyError');}
          else{const fail=kind==='put'?factory.options.failPut?.(key,value):null;
            if(fail){req.error=fail;}
            else{if(!tx.staged.has(store))tx.staged.set(store,new Map());tx.staged.get(store).set(key,kind==='put'?structuredClone(value):undefined);}}
        }
        if(req.error){req.onerror?.();tx.aborted=true;tx.error=req.error;}
        else req.onsuccess?.();
        await tick();
      }
      await tick();
      if(!tx.ops.length||tx.aborted)break;
    }
    // Tab beendet: Transaktion wird ohne Rückmeldung verworfen (nie bestätigt), nachfolgende laufen weiter.
    if(factory.options.freeze){tx.frozen=true;data.running=null;pump(data);return;}
    if(tx.aborted){tx.onerror?.();tx.onabort?.();}
    else{for(const [store,m]of tx.staged){const base=data.stores.get(store);for(const [k,v]of m)v===undefined?base.delete(k):base.set(k,v);}tx.oncomplete?.();}
    data.running=null;pump(data);
  }
  return factory;
}

/** localStorage-Ersatz auf einer Map, optional mit Zeichenquote wie Chromium (Schlüssel + Wert). */
export function memoryStorage(memory=new Map(),{quota=Infinity}={}){
  const used=()=>{let n=0;for(const [k,v]of memory)n+=k.length+v.length;return n;};
  return {memory,getItem:k=>memory.has(k)?memory.get(k):null,
    setItem(k,v){v=String(v);const before=memory.has(k)?k.length+memory.get(k).length:0;if(used()-before+k.length+v.length>quota)throw err('QuotaExceededError');memory.set(k,v);},
    removeItem:k=>{memory.delete(k);}};
}
