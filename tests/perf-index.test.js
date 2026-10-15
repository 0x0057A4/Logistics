// Laufzeitindexe der Lagerverwaltung (Welle 0, S4): gleiche Ergebnisse wie die linearen Formeln,
// nie im Spielstand, robust gegen direkte Feldänderungen fremder Module zwischen und in Minuten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as inventory from '../dist/inventory.js';
import {Simulation} from '../dist/core.js';

// Referenz: die bisherigen linearen Formeln aus inventory.js (Stand f986e5d).
const STORED=new Set(['stock','inbound','quarantine']);
const refUsed=(s,site)=>s.batches.filter(b=>b.site===site&&STORED.has(b.location)).reduce((sum,b)=>sum+b.qty,0);
const refEligible=(b,item,site,owner)=>b.item===item&&b.site===site&&b.owner===owner&&b.location==='stock'&&!b.locked&&!b.blocked;
const refAvailable=(s,item,site,owner='company')=>s.batches.filter(b=>refEligible(b,item,site,owner)).reduce((n,b)=>n+b.qty-b.reserved,0);
function refFifo(s,item,qty,site,owner='company'){const out=[];let remaining=qty;for(const b of s.batches){if(!refEligible(b,item,site,owner))continue;const n=Math.min(remaining,b.qty-b.reserved);if(n<=0)continue;out.push([b.id,n]);remaining=Math.abs(remaining-n)<1e-9?0:remaining-n;if(!remaining)break;}return out;}

function fixture(){const s={t:480,seq:1,sites:[{id:'a'},{id:'b'}],buildings:[{id:'r',site:'a',type:'rack'}],shipments:[],events:[]};inventory.init(s);const api={id:p=>`${p}-${s.seq++}`,log(){}};return {s,api,i:inventory.createAPI(s,api)};}
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test('Zufallsfolge: Bestand, Belegung, FIFO und ID-Suche gleichen den linearen Formeln',()=>{
 const {s,i}=fixture(),r=rng(99),pick=a=>a[Math.floor(r()*a.length)],items=['board','housing','lamp'],sites=['a','b'],owners=['company','company','o-1'],locs=['stock','stock','inbound','quarantine','vehicle','machine'];let jobs=0;
 for(let k=0;k<3000;k++){
  const op=r();
  if(op<.25)i.add({item:pick(items),qty:1+Math.floor(r()*6)+(r()<.2?.5:0),site:pick(sites),owner:pick(owners),location:pick(locs),parents:s.batches.length&&r()<.5?[pick(s.batches).id]:[]});
  else if(op<.40){const item=pick(items),site=pick(sites),owner=pick(owners),qty=1+Math.floor(r()*5),expect=refAvailable(s,item,site,owner)+1e-9>=qty?refFifo(s,item,qty,site,owner):null,job='job-'+(++jobs),before=s.reservations.length;
   assert.equal(i.reserve(item,qty,site,job,owner),!!expect);if(expect)assert.deepEqual(s.reservations.slice(before).map(x=>[x.batchId,x.qty]),expect);}
  else if(op<.50&&jobs)i.consume('job-'+(1+Math.floor(r()*jobs)));
  else if(op<.55&&jobs)i.release('job-'+(1+Math.floor(r()*jobs)));
  else if(op<.63&&s.batches.length)i.move(pick(s.batches).id,pick(locs),pick(sites));
  else if(op<.68&&s.batches.length){const b=pick(s.batches);i.remove(b.id,Math.max(1,Math.floor(b.qty-b.reserved)));}
  else if(op<.71&&s.batches.length>2)i.relocate([...new Set([pick(s.batches).id,pick(s.batches).id])],pick(locs),pick(sites));
  else if(op<.74&&jobs)i.transfer('job-'+(1+Math.floor(r()*jobs)),pick(locs),pick(sites));
  // Fremde Module ändern Sperr- und Ortsfelder direkt (z. B. Kühlkette, Rückruf); Index liest diese live.
  else if(op<.80&&s.batches.length){const b=pick(s.batches);if(r()<.5)b.blocked=!b.blocked;else b.locked=!b.locked;}
  else if(op<.83&&s.batches.length){const b=pick(s.batches);b.location=pick(locs);}
  // Direkter Standortwechsel außerhalb der API (kommt in dist/ nicht vor) wirkt ab der nächsten Spielminute.
  else if(op<.85&&s.batches.length){const b=pick(s.batches);if(!b.reserved){b.site=pick(sites);s.t++;}}
  else if(op<.88)s.buildings.push({id:'x'+k,site:pick(sites),type:pick(['rack','assembly'])});
  else s.t++;
  for(const site of sites){assert.ok(Object.is(i.used(site),refUsed(s,site)),`used ${site} bei ${k}`);for(const item of items)for(const owner of ['company','o-1'])assert.ok(Object.is(i.available(item,site,owner),refAvailable(s,item,site,owner)),`available ${item}/${site}/${owner} bei ${k}`);
   assert.equal(i.capacity(site),40+s.buildings.filter(b=>b.site===site).reduce((n,b)=>n+(({rack:80})[b.type]||0),0));}
  if(s.batches.length){const b=pick(s.batches);assert.equal(inventory.findBatch(s,b.id),b);}
  assert.equal(inventory.findBatch(s,'batch-fehlt'),undefined);
 }
 inventory.validate(s);assert.ok(s.batches.some(b=>b.qty===0),'Nullchargen bleiben erhalten');
});

test('Index erscheint nie im Spielstand und wird nach Laden neu aufgebaut',()=>{
 const sim=new Simulation({mode:'sandbox',seed:5}),s=sim.state,keys=Object.keys(s).join();
 const b=sim.api.inventory.add({item:'board',qty:5,site:'site-1'});assert.equal(sim.api.inventory.available('board','site-1'),5);
 assert.equal(Object.keys(s).join(),keys);assert.ok(!Object.keys(s.batches).some(k=>!/^\d+$/.test(k)));assert.ok(!JSON.stringify(s).includes('bySite'));
 const copy=Simulation.fromJSON(sim.serialize());assert.equal(copy.api.inventory.available('board','site-1'),5);
 assert.equal(copy.api.inventory.reserve('board',5,'site-1','j'),true);assert.equal(sim.api.inventory.available('board','site-1'),5,'Kopie teilt keinen Index');assert.equal(b.reserved,0);
});

test('Ersetztes, gekürztes oder umsortiertes Chargenarray baut den Index neu auf',()=>{
 const {s,i}=fixture();const x=i.add({item:'board',qty:2,site:'a'}),y=i.add({item:'board',qty:3,site:'a'});assert.equal(i.available('board','a'),5);
 s.batches.reverse();assert.equal(inventory.findBatch(s,x.id),x);assert.equal(i.reserve('board',3,'a','j'),true);assert.deepEqual(s.reservations.map(r=>r.batchId),[y.id]);
 s.batches=s.batches.filter(b=>b!==x);assert.equal(i.available('board','a'),0);assert.equal(inventory.findBatch(s,x.id),undefined);
 s.batches.push({...x,id:'neu',reserved:0});assert.equal(i.available('board','a'),2);
});

test('In-place-Tausch (Referenz, Länge, letztes Element gleich) wird bei der nächsten Auffrischung erkannt',()=>{
 const {s,i}=fixture();const x=i.add({item:'board',qty:2,site:'a'}),y=i.add({item:'board',qty:3,site:'a'}),z=i.add({item:'housing',qty:1,site:'a'});
 i.add({item:'board',qty:0.5,site:'b'});assert.equal(i.available('board','a'),5);s.t++;assert.equal(i.available('board','a'),5);
 s.batches[0]=y;s.batches[1]=x;s.t++;
 // Zuerst Aktivliste/FIFO (findBatch würde über seine eigene Gegenprüfung ebenfalls neu aufbauen).
 assert.deepEqual(inventory.activeBatches(s).filter(b=>b.site==='a').map(b=>b.id),[y.id,x.id,z.id]);
 assert.equal(i.reserve('board',3,'a','j'),true);assert.deepEqual(s.reservations.map(r=>r.batchId),[y.id]);
 assert.equal(inventory.findBatch(s,x.id),x);assert.equal(inventory.findBatch(s,y.id),y);
});

test('Nur inventory.js schreibt Menge, Reservierung, Standort und Artikel von Chargen (Voraussetzung der Aktivliste)',()=>{
 // Bekannte Schreibstellen anderer Objekte: Personal-Standortwechsel in workforce.js.
 const dir=new URL('../dist/',import.meta.url),bad=[],allowed=['workforce.js:w.site='];
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.js')&&f!=='inventory.js')){const src=readFileSync(new URL(f,dir),'utf8');for(const m of src.matchAll(/(\w+)\.(qty|reserved|site|item)\s*(\+\+|--|[-+*/]?=(?!=))/g)){const hit=`${f}:${m[1]}.${m[2]}=`;if(!allowed.includes(hit))bad.push(`${hit} … ${src.slice(Math.max(0,m.index-30),m.index+20)}`);}}
 assert.deepEqual(bad,[],'Neue direkte Mengenänderung: Index in dist/inventory.js (batchIndex) berücksichtigen oder über inventory-API buchen.');
});
