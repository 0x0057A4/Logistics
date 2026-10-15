// Node-Messung: Dauer eines Speichervorgangs an einem großen Spielstand, alter gegen neuen Ablauf.
// Aufruf: node tests/browser/save-timing.mjs [ZielMB=5]. localStorage wird durch eine Map ersetzt;
// Browser-Schreibkosten von localStorage sind darin NICHT enthalten.
import {performance} from 'node:perf_hooks';
import {Simulation} from '../../dist/core.js';

const targetMB=Number(process.argv[2]||5);
const cmd=(s,type,data={})=>{const r=s.command({type,...data});if(!r.ok)throw Error(type+': '+r.message);return r;};
function bigState(){
 const s=new Simulation({mode:'sandbox',seed:77});
 for(let i=1;i<8;i++)cmd(s,'buySite',{name:'Prüfwerk '+i});
 for(const site of s.state.sites){
  for(const [buildingType,x,y]of[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11]])cmd(s,'build',{buildingType,site:site.id,x,y,rotation:0});
  for(const role of ['production','production','production','warehouse','driver'])cmd(s,'hire',{role,site:site.id});
  cmd(s,'buyVehicle',{vehicleType:'van',site:site.id});
  for(const item of ['housing','board','carton'])cmd(s,'buy',{item,qty:40,supplier:'standard',site:site.id});
 }
 for(const o of s.state.orders.filter(o=>o.kind!=='logistics'))cmd(s,'acceptOrder',{id:o.id});
 s.step(1440*3);
 // Auffüllen mit gültigen Chronikeinträgen bis zur Zielgröße (realistische Feldform, eindeutige IDs).
 const st=s.state;let size=s.serialize().length;
 while(size<targetMB*1e6&&st.events.length<99000){
  const e={id:'event-'+(st.seq++),t:st.t,kind:'system',text:'Lieferung an Kunde '+(st.seq%997)+' abgeschlossen. Restmenge geprüft und verbucht.',refs:['order-'+(st.seq%300),'vehicle-'+(st.seq%40)]};
  st.events.push(e);size+=JSON.stringify(e).length+1;
 }
 return s;
}
const sim=bigState(),raw=sim.serialize();
const storage=new Map([['k',raw]]);
function stats(list){const v=[...list].sort((a,b)=>a-b);return {median:+v[v.length>>1].toFixed(1),max:+v[v.length-1].toFixed(1)};}
function measure(fn,n=7){const times=[];for(let i=0;i<n;i++){const t0=performance.now();fn();times.push(performance.now()-t0);}return stats(times);}
// Vorher (0.8): Altstand lesen, vollständig über fromJSON prüfen, Backup schreiben, serialisieren, schreiben.
const before=measure(()=>{const old=storage.get('k');let valid=false;try{Simulation.fromJSON(old);valid=true;}catch{}if(valid)storage.set('k-backup',old);storage.set('k',sim.serialize());});
// Nachher (0.9): Altstand lesen, mit zuletzt geschriebenem String vergleichen, Backup schreiben, serialisieren, schreiben.
let lastWritten=storage.get('k');
const after=measure(()=>{const old=storage.get('k');const ok=old===lastWritten||Simulation.wasValidated(old);if(ok)storage.set('k-backup',old);const text=sim.serialize();storage.set('k',text);lastWritten=text;});
const parts={serialize:measure(()=>sim.serialize()),fromJSON:measure(()=>Simulation.fromJSON(raw))};
console.log(JSON.stringify({node:process.version,sizeMB:+(raw.length/1e6).toFixed(2),events:sim.state.events.length,batches:sim.state.batches.length,ledger:sim.state.ledger.length,beforeMs:before,afterMs:after,partsMs:parts,note:'Map statt localStorage; Browser-Schreibkosten nicht enthalten.'},null,1));
