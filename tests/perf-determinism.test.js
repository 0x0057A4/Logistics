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
const EXPECTED={
 klein:[
  'ca72b0342d8a71c481f935a2ec626afb5ff62a9058be48fdc9c9e716de9956c1',
  'ee9bac774c372fc22abf0fbf1af5d5c5fab5b89aaa8e4a9bed094480d4623f36',
  'ffb02e12f4a86f2716bc2f76f81e023cc9ee68d069ec093f9728b4310895591e',
  '4fc8f96cd8dbe80597806a7df395fc99d6e7e60a9c2281e290e28bfba6351c38',
 ],
 dienste:[
  'f2ba8f97e62b42329b7347cb9915b066392609e45b06be69abd5faaf2e1f98bc',
  '5f1e3829fdaf7558245756f572af1efec9ea0ccad93f13400986f5475107eb52',
  '6152afd1d382dcf1782b4882dce4a4468c5bbfd4684f1e2911e2e60c8113ef2a',
  'c984ca060a77359c38385d4101f90cae1aeffdab503ae942417e1595d06ee298',
 ],
 gross:[
  '7ac8fb93db940e15019a43ae9791953aac5f01c468aa0e538e9206903bcb5973',
  'e7b3bea4f65ed2452eb32724b4dbeda9f585b3d1d88afff02daedd2cdf964f80',
  '527c00a77c2e7db14b284736051eb3b0a72dd82ddfb5e4ec4a25cef6c8eb9119',
  'cd082af9d90ecf9a2b6b199e456562124bda28ff2173db51f0b7b82c235d7560',
 ],
 prognose:[
  'a96e5f28d7de2b7dc432fe73cb3ad7a552c293fa0de0b4112d02b46a57494cb6',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
