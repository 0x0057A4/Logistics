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
// Welle 1c (A01-Entscheidung): erneut erzeugt für Preise 7–8,50 €/Paket (Startvertrag 8 €). Gegenprobe: contracts.js
// aus 76498a8 (6 €) reproduziert dessen Hashes exakt (4/4 grün). Node v22.22.0.
const EXPECTED={
 klein:[
  'f39bebc4fe2bc8cfbba941e9c7034ee28785aa82c1476647440c554fb0ff2b62',
  '4c84733e0f63b7ec17e05111988a9ed76e369422f8998dae223a0e1d01f60c39',
  '24980c2606aa147f698e2e0d6d7d17b52a849b8229052e94c64ea1b500fc3530',
  '5e41eab909ed2793c081553e7ff760bb92aabeecf070faadb8ec85e316686565',
 ],
 dienste:[
  'b4354e7fa595c00fc3b219de051cdea8d7fa29e05dd804ecb3c1538107cbf889',
  'cfbdda3f1519540003921ea469cd0eb3e48d70fa6c62014a96ce56efb48edf14',
  '1ff934830ddecec53587e3370c5c0dff770d9a3dd2c5be6310766b1b6cc93a28',
  '79c293bdce8183430d3f8d5e15cdfc29258bdfa45ad61247f28d1521a3924a5c',
 ],
 gross:[
  'b9fb80b9746e489a2fd38fdc49f7c1285aa0cfe99a527a89e5b766e5679086ae',
  '90fce15386634cf62f0f537440fab8cbccbf62799a86d4d6d8dc573ebe31fd39',
  '877ef7dd40fd236a6a418f4dc3cf04d8340d5b8151e621e08ab343256772ca1e',
  'ad091d0fd65b6976fbcdd45ff393d47c83293987a17e8516b7845fb26d5a5578',
 ],
 prognose:[
  '80b4ed120f458105c8c724523be5a20669fe46daa6e2068b3b66c3ab3e08fdf2',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
