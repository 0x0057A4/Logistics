// Determinismusreferenz für die Leistungsoptimierung (Welle 0, S4): serialisierter Zustand bleibt bitgleich.
// Die Hashes in EXPECTED wurden mit dem UNVERÄNDERTEN Code vor der Optimierung erzeugt
// (Stand Commit f986e5d, Node v22.22.0) über: PERF_HASH_PRINT=1 node --test tests/perf-determinism.test.js
// Sie ändern sich nur, wenn sich fachliches Verhalten ändert. Dann ist die Ursache zu klären, nicht der Hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation} from '../dist/core.js';
import * as P from './perf-scenarios.mjs';

// Welle-1-Listen (contracts, yard) bleiben leer, solange kein Hub-Befehl läuft; für Referenzhashes aus 0.9-W0 ausgeblendet.
const hub=text=>{const o=JSON.parse(text);for(const k of ['contracts','yard'])if(Array.isArray(o[k])&&!o[k].length)delete o[k];return JSON.stringify(o);};
const hash=text=>createHash('sha256').update(hub(text)).digest('hex');
// Kontrollpunkte je Szenario: Hash des serialisierten Zustands nach jeweils `every` Minuten.
function trace(sc,minutes,every){const out=[];for(let m=0;m<minutes;m+=every){P.run(sc,every,{offset:(sc.offset||0)+m});out.push(hash(sc.sim.serialize()));}return out;}
// Szenarien bewusst über run() mit innerem Minutenzähler; services() nutzt plan(i) relativ zum Abschnitt.
const SCENARIOS={
 klein:()=>trace(P.small(),1200,300),
 dienste:()=>{const sc=P.services(),out=[];const plan=sc.plan;let i=0;sc.plan=k=>plan(i+k);for(const n of [150,150,150,150]){P.run(sc,n);i+=n;out.push(hash(sc.sim.serialize()));}return out;},
 gross:()=>{const sc=P.large(4242,{warmup:300,history:3000});return [hash(sc.sim.serialize()),...trace(sc,300,100)];},
 prognose:()=>{const sc=P.services();P.run(sc,120);const before=sc.sim.serialize();const f=sc.sim.forecast(240);assert.equal(sc.sim.serialize(),before);return [hash(JSON.stringify(f))];},
};
// Welle 1a (A08): Hashes neu erzeugt, weil contracts.js ab Spielbeginn ein Vertragsangebot anlegt und periodisch
// neue Angebote über api.random/api.id erzeugt (Seed und ID-Zähler verschieben sich). Ursache geklärt; Node v22.22.0.
// Welle 1b (A02): erneut erzeugt, weil Vertragswerte (Preis, Frist, Pakete, Ankunftsminuten, Laufzeit; contracts.js TERMS)
// im Zustand stehen. Gleiche Anzahl Zufallszüge; mit alten Werten reproduzieren sich die alten Hashes exakt.
// Welle 1c (A05/A08): erneut erzeugt, weil neue Spiele als Depot starten (Standortname „Depot Morgenfeld“) und die
// Leuchten-Fertigungsanfragen erst mit der ersten Fertigungsanlage (economy.step) statt in economy.init entstehen.
// Die Szenarien lassen dafür nach dem Aufbau eine Minute laufen (perf-scenarios.mjs). Gegenprobe: Stand vor der
// Änderung (d3f4f37) reproduziert die alten Hashes exakt, auch mit neuem sorting.js (Hub-Sortierung hier ungenutzt).
const EXPECTED={
 klein:[
  'f8caee5a6c039d441fc20a67d091b23d331f9e3c6487f10092a87bd77d55836f',
  'fde3b82bf784c28129ca3243ebad40ddfbf048399ebdce225596c4d79a7bb85f',
  '4bea28fcf8de7f063911b2ca14f2c5c608273702f6764b07690080110861bc68',
  'a370c6e7a3540a842ce750e4c733b7f87e7e934e9e633e8b11307bba12398cec',
 ],
 dienste:[
  'b23f0056bb25c3e1b79eb28aa45ea98c2f5f42b7cc0d11838b8a8bca1d34d541',
  '21d3a4e080d3645b5aff6630a158e00c33850a7f0688f179bfd882e3b2d0f8ce',
  '4852ec8dea7d51aa1621f0cff186e83d13d69cc198d0f0d094c4c0db39fa446b',
  'a807e9109583e08f096dd04bc375eb883738baf1562f1b4fa2590916e9981439',
 ],
 gross:[
  '620dbb41bf18bb2e0f398592fdc0fe66973282804ea1ecac52c5c0580b1d27ce',
  '1b4266d7886cb2153a4a9e73f164cfac97507bdf86cf607c36a70b5d72d3b71e',
  '2a84ff637c25b853b74e4b38e6cd6a48e51cdc956c94bddf036c9996ee096dca',
  'b1e5a9eb0c8af27285d54bd6c56f84ccde0fa7c5aaf90bb1970f277404dd93e8',
 ],
 prognose:[
  '2c09cb46c823e4b4a33cfa5e5495866df92a8f0c07e6d6a7d038d185a2a8b0a2',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
