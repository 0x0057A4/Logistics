// Benchmark Simulationsschritt: node tests/perf-sim.mjs [--json]
// Misst ausschließlich sim.step(1) je Spielminute (Spielerpolitik und Aufbau nicht enthalten).
// Budget 12× Zeitraffer: 12 Spielminuten je Sekunde, bei 60 FPS ≈ 0,2 Spielminuten je Frame (16,7 ms).
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import os from 'node:os';
import * as P from './perf-scenarios.mjs';

const quantile=(xs,q)=>{const a=[...xs].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(q*(a.length-1)))];};
function measure(name,make,minutes){
 const t0=performance.now(),sc=make();const setupMs=performance.now()-t0;sc.samples=[];
 P.run(sc,minutes,{offset:sc.offset||0,timer:()=>performance.now()});
 const xs=sc.samples,median=quantile(xs,.5),p95=quantile(xs,.95),max=Math.max(...xs),mean=xs.reduce((n,x)=>n+x,0)/xs.length,s=sc.sim.state;
 const json=sc.sim.serialize();
 return {name,minutes,batches:s.batches.length,activeBatches:s.batches.filter(b=>b.qty>0).length,buildings:s.buildings.length,sites:s.sites.length,workers:s.workers.length,
  setupMs:+setupMs.toFixed(0),medianMs:+median.toFixed(3),p95Ms:+p95.toFixed(3),maxMs:+max.toFixed(3),meanMs:+mean.toFixed(3),
  // 0,2 Spielminuten je Frame bei 12× und 60 FPS: Anteil am 16,7-ms-Frame (Mittelwert und p95).
  frameMs12x:+(mean*0.2).toFixed(3),frameShare12x:+(mean*0.2/16.667*100).toFixed(1)+' %',frameMs12xP95:+(p95*0.2).toFixed(3),
  produced:s.stats.produced,delivered:s.stats.delivered,hash:createHash('sha256').update(json).digest('hex').slice(0,16)};
}
const rows=[
 measure('klein (1 Standort, Startbetrieb)',()=>P.small(),480),
 measure('groß ohne Historie (6 Standorte)',()=>P.large(4242,{warmup:1440,history:0}),480),
 measure('groß + 25.000 Nullchargen',()=>P.large(4242,{warmup:1440,history:25000}),480),
];
const env={node:process.version,cpu:os.cpus()[0]?.model,cores:os.cpus().length,platform:`${os.platform()} ${os.release()}`};
if(process.argv.includes('--json'))console.log(JSON.stringify({env,rows},null,1));
else{console.log(env);console.table(rows.map(({name,batches,activeBatches,buildings,medianMs,p95Ms,maxMs,meanMs,frameMs12x,frameShare12x,hash})=>({name,batches,activeBatches,buildings,medianMs,p95Ms,maxMs,meanMs,frameMs12x,frameShare12x,hash})));}
