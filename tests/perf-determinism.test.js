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
// Welle 1c (A02): erneut erzeugt, weil Vertragswerte (TERMS: 5–6,50 €/Paket, Startvertrag 200–250 Pakete, Folgeangebote
// 60–110 je Ankunft) im Zustand stehen. Gleiche Anzahl Zufallszüge. Gegenprobe: contracts.js aus bb15c66 reproduziert
// die vorherigen Hashes exakt (4/4 grün). Node v22.22.0.
const EXPECTED={
 klein:[
  '089707cb22d04cddd00dfd37690a44df646647e734805d20deab00090af42d1f',
  '2de1b4ba06baae9e5b60abfffb662e72d37fe8659c2dea862e78d49794fa9cee',
  '3bcdcf7e184bf5fa178fd864b6ec9b00dddb3507492e0d3c7b1a1f4f841d3922',
  'a1d1458c8eac09b0638e3a8fb07af97a30e95ca3c7720dc15acdc4aea62861d7',
 ],
 dienste:[
  'f9d32ce7a4b77578eee750550ce3113d3a1e5c19c6bb135418f8524b317ad921',
  '43c2e6f85d6c1b2bac7162f2110ce3e38b5458393149924581e81bba96195c74',
  '20f76ca77d6d09586dd8a261a1b6e93042063da735f4acb49b9cc4ec8664470e',
  '5a59c626ee23a8064f5dad9f6938908b76dce30245c6aa3243b559f2302b594d',
 ],
 gross:[
  '9e86bc1f0c78a7191dc44c4def987862a5be684effd0d52766fc0a890cbe6925',
  'ffc66a5627860a3c5a6a2c22cc014b773d7096a6e0ffb4854b13e77e1434c779',
  '0d15b52d80dba8e043840ad71641cfb4384127ec10d81c45d370647ad5d1ff77',
  '820b4541d68ef6e027d0269bbc8925538376b3747aab13cf71a1060f2d7b9d05',
 ],
 prognose:[
  'cc84f5ea685c874d9e83ad4af165bf6bbd593fd0490c2831d65ba2a6ef47c297',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
