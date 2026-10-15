// Determinismusreferenz für die Leistungsoptimierung (Welle 0, S4): serialisierter Zustand bleibt bitgleich.
// Die Hashes in EXPECTED wurden mit dem UNVERÄNDERTEN Code vor der Optimierung erzeugt
// (Stand Commit f986e5d, Node v22.22.0) über: PERF_HASH_PRINT=1 node --test tests/perf-determinism.test.js
// Sie ändern sich nur, wenn sich fachliches Verhalten ändert. Dann ist die Ursache zu klären, nicht der Hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation} from '../dist/core.js';
import * as P from './perf-scenarios.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
// Kontrollpunkte je Szenario: Hash des serialisierten Zustands nach jeweils `every` Minuten.
function trace(sc,minutes,every){const out=[];for(let m=0;m<minutes;m+=every){P.run(sc,every,{offset:(sc.offset||0)+m});out.push(hash(sc.sim.serialize()));}return out;}
// Szenarien bewusst über run() mit innerem Minutenzähler; services() nutzt plan(i) relativ zum Abschnitt.
const SCENARIOS={
 klein:()=>trace(P.small(),1200,300),
 dienste:()=>{const sc=P.services(),out=[];const plan=sc.plan;let i=0;sc.plan=k=>plan(i+k);for(const n of [150,150,150,150]){P.run(sc,n);i+=n;out.push(hash(sc.sim.serialize()));}return out;},
 gross:()=>{const sc=P.large(4242,{warmup:300,history:3000});return [hash(sc.sim.serialize()),...trace(sc,300,100)];},
 prognose:()=>{const sc=P.services();P.run(sc,120);const before=sc.sim.serialize();const f=sc.sim.forecast(240);assert.equal(sc.sim.serialize(),before);return [hash(JSON.stringify(f))];},
};
const EXPECTED={
 klein:[
  'a88e598afb2a11a5328ed4f9f57f05f11137de3d7abb5871a0564b851b10aa37',
  '35e3e904db9a44841c6eb187383e9bc866bba6f29e6829c068f9de96a4f97137',
  'b88c6e358ae3123dc083408ebbb48e7f3a82ede189f7e87a29441918d03d2411',
  'a9aa2302779118c7168b0496b3d8b258519dcb2a309e2be35e5802fb10ef2147',
 ],
 dienste:[
  'f89da88922e33ca1731723c2e93cca4d6fd4bfb96b5cef3cbf5d41fdf9e6bb6a',
  'e1ecd3c71a0e4787b70d6cddc317564502b342fa71f85097debc784ef902eda5',
  'ec197c183fbb6e618b501c011b905b92d2d664830a930a8537aafe6e9c582a97',
  'da48ad68fb978466a49830f2b3e6fd178ae63e97acce73dd09eade8f8d884d7a',
 ],
 gross:[
  'd4e3319439348c779ee64404eff0b4c5f3055b10c64b8d7af7a783e97089cfa3',
  'b73a00da53b8d21859f0e9c46f13d832b813463e91c8fc5443afa7a281118a23',
  'ae5ae23a0b972472f8e9cdf87c9071badede5552378008c11638308905fbb45d',
  'e140f5b704c1c95a3e427111479a4712e26a0c0da4d05b94c0ff795b77ca5dac',
 ],
 prognose:[
  'a412fc720b7d0a4a33103d707ae954455d0793ea5bcebb8d0a29ac8b4989f183',
 ],
};

if(process.env.PERF_HASH_PRINT){const out={};for(const [k,f]of Object.entries(SCENARIOS))out[k]=f();console.log(JSON.stringify(out,null,1));}
else for(const [name,run]of Object.entries(SCENARIOS))test(`Determinismus nach Optimierung: ${name}`,()=>{assert.deepEqual(run(),EXPECTED[name]);});
