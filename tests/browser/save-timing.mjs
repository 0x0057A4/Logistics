// Node-Messung: Dauer eines Speichervorgangs an einem großen Spielstand, alter gegen neuen Ablauf.
// Aufruf: node tests/browser/save-timing.mjs [ZielMB=5]. localStorage wird durch eine Map ersetzt;
// Browser-Schreibkosten von localStorage sind darin NICHT enthalten.
import {performance} from 'node:perf_hooks';
import {Simulation} from '../../dist/core.js';
import {bigState} from './big-state.mjs';

const targetMB=Number(process.argv[2]||5);
const sim=bigState(targetMB),raw=sim.serialize();
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
