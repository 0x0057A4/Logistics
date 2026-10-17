// Eigene Prüfungen A08: Zustellgebiete an anderen eigenen Standorten (W3-S1, docs/SCHNITTSTELLEN-0.12-W3.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import {TERMS,SCHEDULE_LEAD,laneSite,deliverySiteOf,siteDistance,remoteTerms} from '../dist/contracts.js';
const cmd=(s,c)=>{const r=s.command(c);assert.equal(r.ok,true,r.message);return r;};
const clone=x=>JSON.parse(JSON.stringify(x));
const remoteLanes=k=>k.lanes.filter(l=>laneSite(k,l)!==k.site);

/** Sandbox mit zwei Standorten; läuft, bis ein Folgeangebot mit Fremd- UND (falls mischbar) eigenem Gebiet vorliegt.
 *  Angebote ohne Fremdgebiet werden abgelehnt, damit neue entstehen. */
function twoSites({mixed=false,seed=7}={}){
 const s=new Simulation({mode:'sandbox',seed}),b=cmd(s,{type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(let day=0;day<60;day++){
  for(const k of s.state.contracts.filter(k=>k.status==='offer')){
   const r=remoteLanes(k).length;
   if(r>0&&(!mixed||r<k.lanes.length))return {s,b,k};
   cmd(s,{type:'cancelContract',id:k.id});
  }
  s.step(720);
 }
 throw new Error('Kein Angebot mit Fremdgebiet gefunden.');
}

test('Ein-Standort-Spiel: Angebote und Aufträge ohne neue Felder (Zustand wie 0.11)',()=>{
 const s=new Simulation({seed:11});s.step(4*1440);
 assert.ok(s.state.contracts.length>1);
 for(const k of s.state.contracts)for(const l of k.lanes){assert.equal('site' in l,false);assert.equal('surcharge' in l,false);assert.equal('extraSla' in l,false);}
 const k=s.state.contracts.find(k=>k.status==='offer');cmd(s,{type:'acceptContract',id:k.id});s.step(2*1440);
 const orders=s.state.orders.filter(o=>o.contractId);assert.ok(orders.length>0);
 for(const o of orders){assert.equal('deliverySite' in o,false);assert.equal(deliverySiteOf(o),o.site);}
});

test('Zwei Standorte: Fremdgebiet mit Standort, Distanz und Zuschlägen aus TERMS; eigene Gebiete am Annahme-Hub',()=>{
 const {s,b,k}=twoSites();
 assert.equal(k.site,'site-1');
 const km=siteDistance(s.state,'site-1',b),[p0,pk]=TERMS.remote.price[k.unit];
 assert.equal(km,Math.max(15,Math.round(Math.hypot(44,18))));
 for(const l of k.lanes){
  assert.ok([k.site,b].includes(l.site));
  if(l.site===b){
   assert.equal(l.surcharge,Math.round((p0+pk*km)*100)/100);assert.ok(l.surcharge>0);
   assert.ok(Number.isInteger(l.extraSla)&&l.extraSla>=TERMS.remote.sla[0]&&l.extraSla%TERMS.remote.slaStep===0);
   assert.deepEqual({surcharge:l.surcharge,extraSla:l.extraSla},(({surcharge,extraSla})=>({surcharge,extraSla}))(remoteTerms(s.state,k.unit,k.site,b)));
  }else{assert.equal(l.surcharge,undefined);assert.equal(l.extraSla,undefined);}
 }
 assert.doesNotThrow(()=>validateState(s.state));
});

test('Mischvertrag: Aufträge tragen deliverySite, Preis und Frist mit Zuschlag; order.site bleibt Annahme-Hub; Speichern/Laden',()=>{
 let {s,b,k}=twoSites({mixed:true});
 cmd(s,{type:'acceptContract',id:k.id});
 assert.ok(s.state.events.some(e=>e.refs?.includes(k.id)&&/Hauptlauf nötig/.test(e.text||e.message||'')));
 const before=s.state.orders.length;
 // bis zur nächsten Ankündigung laufen
 let guard=0;while(s.state.orders.filter(o=>o.contractId===k.id).length===0&&guard++<3000)s.step(1);
 const orders=s.state.orders.filter(o=>o.contractId===k.id);assert.ok(orders.length>0&&s.state.orders.length>before);
 const eta=s.state.t+SCHEDULE_LEAD;assert.ok(k.arrivals.some(a=>a.minute===eta%1440));
 let remote=0,local=0;
 for(const o of orders){
  const lane=k.lanes.find(l=>l.id===o.lane);
  assert.equal(o.site,k.site);assert.equal(o.deliverySite,lane.site);assert.equal(deliverySiteOf(o),lane.site);
  if(lane.site===b){remote++;assert.equal(o.price,Math.round((k.pricePerParcel+lane.surcharge)*100)/100);assert.equal(o.due,eta+k.slaMinutes+lane.extraSla);}
  else{local++;assert.equal(o.price,k.pricePerParcel);assert.equal(o.due,eta+k.slaMinutes);}
 }
 assert.ok(remote>0,'Fremdauftrag fehlt');assert.ok(local+remote===orders.length);
 assert.doesNotThrow(()=>validateState(s.state));
 const re=Simulation.fromJSON(s.serialize());
 assert.deepEqual(re.state.orders.filter(o=>o.contractId===k.id),clone(orders));
 assert.deepEqual(re.state.contracts.find(x=>x.id===k.id).lanes,clone(k.lanes));
});

test('validate: unbekannter Zustellstandort, Gebietsstandort, falsche Zuordnung und negativer Zuschlag werden abgelehnt',()=>{
 const {s,b,k}=twoSites();cmd(s,{type:'acceptContract',id:k.id});
 let guard=0;while(!s.state.orders.some(o=>o.contractId===k.id)&&guard++<3000)s.step(1);
 const base=clone(s.state),ki=base.contracts.findIndex(x=>x.id===k.id),oi=base.orders.findIndex(o=>o.contractId===k.id);
 const bad=f=>{const x=clone(base);f(x);assert.throws(()=>validateState(x),/ungültig/);};
 bad(x=>{x.orders[oi].deliverySite='site-999';});
 bad(x=>{x.contracts[ki].lanes[0].site='site-999';});
 bad(x=>{const o=x.orders[oi],lane=x.contracts[ki].lanes.find(l=>l.id===o.lane);o.deliverySite=lane.site===b?'site-1':b;});
 bad(x=>{remoteLanes(x.contracts[ki])[0].surcharge=-1;});
 bad(x=>{remoteLanes(x.contracts[ki])[0].extraSla=12.5;});
 bad(x=>{x.orders.push({...clone(x.orders[oi]),id:'order-9999',contractId:undefined,deliverySite:'site-77'});x.seq=Math.max(x.seq,10000);});
 assert.doesNotThrow(()=>validateState(clone(base)));
});

test('Altstände ohne lane.site/deliverySite bleiben gültig: Zustellung am Annahme-Hub',()=>{
 const {s,k}=twoSites();cmd(s,{type:'acceptContract',id:k.id});
 let guard=0;while(!s.state.orders.some(o=>o.contractId===k.id)&&guard++<3000)s.step(1);
 const old=JSON.parse(s.serialize());
 for(const c of old.contracts)for(const l of c.lanes){delete l.site;delete l.surcharge;delete l.extraSla;}
 for(const o of old.orders)delete o.deliverySite;
 const re=Simulation.fromJSON(JSON.stringify(old));assert.doesNotThrow(()=>validateState(re.state));
 const kk=re.state.contracts.find(x=>x.id===k.id);
 for(const l of kk.lanes)assert.equal(laneSite(kk,l),kk.site);
 for(const o of re.state.orders.filter(o=>o.contractId===k.id))assert.equal(deliverySiteOf(o),o.site);
 re.step(1440);assert.doesNotThrow(()=>validateState(re.state));
 // Neue Ankünfte des Altvertrags erzeugen weiter Aufträge ohne deliverySite.
 const fresh=re.state.orders.filter(o=>o.contractId===k.id);assert.ok(fresh.every(o=>o.deliverySite===undefined));
});

test('Annahme verweigert Vertrag, dessen Gebietsstandort fehlt',()=>{
 const {s,k}=twoSites();remoteLanes(k)[0].site='site-404';
 const r=s.command({type:'acceptContract',id:k.id});assert.equal(r.ok,false);assert.equal(k.status,'offer');
});

test('Startangebot bleibt auch bei zwei Standorten ohne Fremdgebiet; Zufallsstrom mit einem Standort unverändert',()=>{
 // Zwei gleiche Ein-Standort-Spiele: identische Angebote (Determinismus). Hashprüfung: perf-determinism.test.js.
 const a=new Simulation({seed:5}),c=new Simulation({seed:5});a.step(3*1440);c.step(3*1440);
 assert.equal(a.serialize(),c.serialize());
 const s=new Simulation({mode:'sandbox',seed:5});cmd(s,{type:'buySite',name:'Zweitstandort'});
 const start=s.state.contracts[0];assert.ok(start.lanes.every(l=>l.site===undefined));
});
