import test from 'node:test';
import assert from 'node:assert/strict';
import {init,createAPI,validate} from '../dist/inventory.js';
function fixture(){const s={sites:[{id:'a'},{id:'b'}],buildings:[],t:480,seq:1};init(s);const i=createAPI(s,{id:p=>`${p}-${s.seq++}`});return {s,i};}
test('Reservierungen konkurrieren atomar; Freigabe und Verbrauch erhalten Mengen',()=>{
 const {s,i}=fixture();i.add({item:'steel',qty:10,site:'a',unitCost:12});
 assert.equal(i.reserve('steel',7,'a','one'),true);assert.equal(i.reserve('steel',4,'a','two'),false);
 assert.equal(i.available('steel','a'),3);assert.equal(i.reserve('steel',3,'a','two'),true);
 assert.equal(i.release('one'),7);assert.equal(i.consume('two')[0].qty,3);
 assert.equal(i.used('a'),7);assert.equal(i.consume('two'),false);validate(s);
});
test('Ladungsübergabe besitzt genau eine physische Menge und Herkunft',()=>{
 const {s,i}=fixture();const first=i.add({item:'steel',qty:20,site:'a'});
 i.reserve('steel',12,'a','load');const load=i.transfer('load','vehicle');
 assert.equal(load.length,1);assert.deepEqual(load[0].parents,[first.id]);
 assert.equal(i.used('a'),8);assert.equal(s.batches.reduce((n,b)=>n+b.qty,0),20);
 assert.equal(i.remove(load[0].id,13),false);assert.equal(i.remove(load[0].id,12).qty,12);
 assert.equal(i.remove(load[0].id,12),false);validate(s);
});
test('Kapazität, Fremdeigentum, Sperre und Quarantäne gelten',()=>{
 const {s,i}=fixture();const b=i.add({item:'steel',qty:20,site:'a',location:'inbound'});
 assert.equal(i.available('steel','a'),0);assert.equal(i.move(b.id,'stock'),true);
 i.add({item:'steel',qty:10,site:'a',owner:'customer'});i.add({item:'steel',qty:10,site:'a',location:'quarantine'});
 assert.equal(i.add({item:'steel',qty:1,site:'a'}),false);assert.equal(i.available('steel','a'),20);
 assert.equal(i.available('steel','a','customer'),10);validate(s);
});
test('Fehlgeschlagener Standorttransfer verändert keine Reservierung',()=>{
 const {s,i}=fixture();i.add({item:'steel',qty:10,site:'a'});i.add({item:'steel',qty:40,site:'b'});
 i.reserve('steel',10,'a','move');const before=JSON.stringify(s);
 assert.equal(i.transfer('move','stock','b'),false);assert.equal(JSON.stringify(s),before);validate(s);
});
test('Speichern mit Reservierungen erhält Materialfluss',()=>{
 const {s,i}=fixture();i.add({item:'steel',qty:10,site:'a'});i.reserve('steel',10,'a','job');
 const restored=JSON.parse(JSON.stringify(s));const j=createAPI(restored,{id:p=>`${p}-${restored.seq++}`});
 assert.equal(j.consume('job')[0].qty,10);assert.equal(j.used('a'),0);validate(restored);
});
test('Standortentladung atomar; Eigentum und Menge bleiben erhalten',()=>{
 const {s,i}=fixture();const a=i.add({item:'steel',qty:25,site:'a',location:'vehicle',owner:'order-x'}),b=i.add({item:'steel',qty:20,site:'a',location:'vehicle',owner:'order-x'});
 const before=JSON.stringify(s);assert.equal(i.relocate([a.id,b.id],'stock','b'),false);assert.equal(JSON.stringify(s),before);
 s.buildings.push({type:'rack',site:'b'});assert.equal(i.relocate([a.id,b.id],'stock','b'),true);
 assert.equal(i.available('steel','b'),0);assert.equal(i.available('steel','b','order-x'),45);assert.equal(i.used('a'),0);validate(s);
});
