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
// Welle 2a (A08, W2-S1/unit): erneut erzeugt, weil Vertragsangebote die Felder unit, penaltyLate, penaltyOpen tragen und
// ab Tag 3 Palettenangebote (gleiche Zahl Zufallszüge) entstehen. Gegenprobe: contracts.js ohne die drei Felder und mit
// TERMS.pallet.fromDay=999 reproduziert die vorherigen Hashes exakt (4/4 grün); Seed/ID-Zähler nach 9000 min mit und
// ohne Palettenangebote identisch. Node v22.22.0.
const EXPECTED={
 klein:[
  '425efaeefd2bc3e9b35d813aa9f359767c5c4b3f6fc2c88f2054538fdd134743',
  'f7b7e2b58ff4d23f1e173f9c323482133c52f6598cc26ddf778542c4583b7608',
  'e4f982f01cf2940af59b47aa73148b1f22357009cbb606a2ecce62c07fcebf25',
  'edb4892046e34cffd054dada1e07961fc6c831359d9013dae9cdf5e30b3c1473',
 ],
 dienste:[
  'ef091065942dcb981998cfba63478af9192cad641cbdfcbc7e18a5e92a749cfe',
  'a8ded180e6194cb19bfbd7bc90dec4286b994daf9eadbc7f3010b73f4ff67c27',
  '8d03a8dada5e68c1e4ecedb07be0223502c1bc207bdee7f5d2e40fed4b836e6f',
  '13c79d00e79e92f32b72d9350f589340010b5733800f120dea32f05a4fe022e6',
 ],
 gross:[
  '23194178482a4ac1e1b5e0490f8416f00c26b9883f2c602e5b870e8ab3508aab',
  '4be95899b85fd9890e8f7be1d06e94465a2ad2f572caf13093b37bd72e04764d',
  '2670071dc8b5fcb30a21688bb83e04d293e9692cbe882a475c979bf76a3c6d2d',
  '64bfa125be52e0b351a990d33ae7dc1c7e373a11c8fcff68d67abba42ef2de0b',
 ],
 prognose:[
  '323ca3098ffa2233a86d19e71352f34dba44100f0c1d09042bb77804430c2127',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
