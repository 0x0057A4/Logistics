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
const hub=text=>{const o=JSON.parse(text);for(const k of ['contracts','yard','lines','linehauls','containers'])if(Array.isArray(o[k])&&!o[k].length)delete o[k];return JSON.stringify(o);};
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
const EXPECTED={
 klein:[
  'f1dafd6deff70c2a198e658ed56ea5fe9c5b7da48aa8eea9943408da8382bd53',
  '8e9d32faad7316d26e0ffcf43ee49d7a648feb6a429f75818904bd8aab173865',
  '06d39f4700dc82359141a366dcf7430bb0b852ba73c93114eb15d79474973959',
  'b5b2f89c7094b5cfe0e6019cbe50fb32f70eb8b752dadf8bf5a17accc889af9b',
 ],
 dienste:[
  '07c12c6cb82dcc2feeb696abeeb7fce0f302cbfa592523f7d07dc990cdc85cba',
  'acd75a05af49707854e2d42f6868768c9e09450cd43c1d449899c848a0b975c5',
  '3bdb3004741946b05071468caeb54abfa5577e141fd5bc4315c9e89ab1ef1ae1',
  '33431b1626e2cbf3fe6f7f680d4d4937a6e91441fd086f1b991ac58ca6e54778',
 ],
 gross:[
  'da11301f9367270bfbdbb1cc72ae46a086737b54d807714790a7c7be694165de',
  '21f7a357a18ecb4f59cc74cb279774b29596d5ac1fec8a213b7f79b1e8ec4cfd',
  '1a066501859b9be445607a6adb4901aa9e6cb259956391b111d061e6c0940d41',
  '860aabb8a7743a980a90309a6c7f813b808598e385f85d4590a38cc65f0d1804',
 ],
 prognose:[
  '22e58acdd84e107e8f501a215715b10e4af00ed773fc7537d269a2540f6cb4ab',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
