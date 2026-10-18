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
const hub=text=>{const o=JSON.parse(text);for(const k of ['contracts','yard','lines','linehauls','containers','airShuttles'])if(Array.isArray(o[k])&&!o[k].length)delete o[k];if(o.assistant&&!Object.keys(o.assistant.sites||{}).length&&!(o.assistant.log||[]).length)delete o.assistant;return JSON.stringify(o);};
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
// Welle 2b (A02): erneut erzeugt, weil TERMS.pallet.price (110–140 €) und Strafsätze (Paket 2,50/8 €, Palette 25/60 €) in
// Angeboten stehen. Gleiche Zahl Zufallszüge. Gegenprobe: contracts.js aus 91c08cf (mit neuem yard.js, Akku-Hysterese)
// reproduziert die vorherigen Hashes exakt (4/4 grün). Node v22.22.0.
// Welle 3a (A08, W3-S1): gross[3] neu erzeugt, weil das Szenario 6 Standorte besitzt und Folgeangebote nun Gebiete an anderen
// Standorten (lane.site, Zuschläge, zusätzliche Zufallszüge NACH den bisherigen) tragen. Ein-Standort-Szenarien (klein, dienste,
// prognose) unverändert. Gegenprobe: assignLaneSites abgeschaltet reproduziert alle vorherigen Hashes exakt (4/4 grün). Node v22.22.0.
// Welle 3c (A08/A07, W3c-S1): klein[2..3] neu erzeugt, weil das Szenario Dock + Lieferwagen besitzt und damit ab 23:00 ein
// Luftexportangebot auf eigenem Angebotsplatz entsteht (eigener Zufall airRandom, api.random unberührt; nur api.id verschiebt
// den ID-Zähler). Übrige Szenarien unverändert. Gegenprobe: airUnlocked=()=>false reproduziert alle vorherigen Hashes exakt
// (4/4 grün). Node v22.22.0.
// 0.15 (A08, S1): alle Hashes neu erzeugt, weil Gebäude (Bau) und gekaufte Fahrzeuge die Anlagenfelder acquiredAt/cost
// tragen. Keine Änderung an Zufallszügen oder ID-Zähler. Gegenprobe: hub() zusätzlich ohne acquiredAt/cost/assetDisposals
// reproduziert alle vorherigen Hashes exakt (4/4 grün). Node v22.22.0.
const EXPECTED={
 klein:[
  'a38da86a90a60303f37ba7e7c8242553bab04f5059ce1efa1ef989f03a083f4f',
  'eaf0334143e6729d2da7ae094ffc6252cc0d62d06043eea5ec276c48a1e22428',
  '303dba81651c0a2f2bc9acd9aaa10b626f5d1f39d48daaf7f828d07a4fed3479',
  '38e587d24b73a7ccbfdba7bfae1ce5ea074895b279bba07c1d0368d2caf844ec',
 ],
 dienste:[
  '075bd431d56ce4bf680d7fa5d229f529b21217bf22ee88b228b68527956d767f',
  'cfa28df087e601758c1bb6249babd0692d851f760fa9ce0df2782524e061a60b',
  '82c548a364bf55a00b4b078e5c4b317658c04b9c5238b7038ec485a119994b24',
  '37df5b3fba4008373bfbe6bdafc3d2aded5036c9c9b978b01139f32fcaa85242',
 ],
 gross:[
  '1909ecd745c70e58c39586bbe715d917380b14c67935a740e5424b8b3111ff79',
  '45576a5d91834fd0c8ef61b36cb2190fdbd9cf68c068b4b65f73e2afcede6abd',
  'ad4b3557a806d6a066aa7394250749fea59994de58b37ca82616e4e546d4c698',
  'fe192079c1dcd80b31078c0ae072c1e613a1dd202600271eb6046722f9fea9f1',
 ],
 prognose:[
  '618143a11fc33e5b8dc894269ca65186ff4488c6473d05637f1a2d12036db319',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
