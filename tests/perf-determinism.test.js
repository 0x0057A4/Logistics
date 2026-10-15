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
const EXPECTED={
 klein:[
  'f38c478aa2973e664fe08b666eec5c7cc91223b998479dea20af8683bc097f0d',
  'b15cb84fa26d12c946b28d962778a02ac9d7528cc2153da65d41be6fe0848e6a',
  '8d2b9507dd86b9f278605dd6f5fdaeba1434d721c2216edd980d8933b3631609',
  '8a6f961f208e2bd34fe9e5bf9628b6aadb6d1954619d1ede35fb3f85ef4ecf94',
 ],
 dienste:[
  'c438536f8b81320ebd1aa7f09410044c575bffb4dab82ae7620403cb545f1323',
  '1c662861068c3deceb0551bda1ec3b4b5e720c81d140b1faca3502023c568ade',
  '5d38f0c60051545437e123e587fdc49faaf1063c18c1bf2d474e089e040554ec',
  'bcf5e13768c8465d1b3ef005369783356f14eddf57c8cd9046da7f803b38d31f',
 ],
 gross:[
  '2247da5cf156579bbcb8710c94349eaf532b6ef6563c7f3eade717dc7a8573a2',
  '963e2b5facffa3dffd83ea565d53aadb144c207ce1ddf3d0912f9a0949a638ea',
  'd38adf490078b6d64a2ea3a1cd779cd7edef6b6a262c987179d81dedeadb2999',
  '17a36afbcc68862d26d95c3063587b58dedc687f36ee633c17cd02c7e726eb47',
 ],
 prognose:[
  'e66b45ec975ff7501903eecd464203df2c72e77e843f61cd846cc08055ee1040',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
