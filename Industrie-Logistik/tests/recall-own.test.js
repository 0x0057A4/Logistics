import test from 'node:test';import assert from 'node:assert/strict';import * as inventory from '../dist/inventory.js';
test('Rückruf verfolgt ausschließlich Herkunft, sperrt Reservierungen und meldet Zustellungen',()=>{
 const s={sites:[{id:'a'}],buildings:[],t:480,seq:1,shipments:[],events:[]};inventory.init(s);const api={id:p=>`${p}-${s.seq++}`,log(){}};const i=inventory.createAPI(s,api);
 const source=i.add({item:'board',qty:5,site:'a'}),safe=i.add({item:'board',qty:3,site:'a'}),derived=i.add({item:'lamp',qty:2,site:'a',parents:[source.id]}),delivered=i.add({item:'lamp',qty:1,site:'a',location:'vehicle',parents:[derived.id]});
 i.remove(delivered.id,1);s.shipments.push({id:'sh',orderId:'o',qty:1,deliveredAt:400,cargo:[delivered.id]});i.reserve('lamp',2,'a','reserved');
 assert.equal(inventory.handle(s,{type:'recallBatch',batchId:source.id},api).ok,true);assert.equal(i.available('board','a'),3);assert.equal(safe.blocked,undefined);assert.equal(i.consume('reserved'),false);assert.equal(s.recalls[0].deliveries.length,1);
 const late=i.add({item:'lamp',qty:1,site:'a',parents:[derived.id]});assert.equal(late.blocked,true);assert.equal(i.available('lamp','a'),0);assert.equal(inventory.handle(s,{type:'recallBatch',batchId:source.id},api).ok,false);inventory.validate(s);
});
