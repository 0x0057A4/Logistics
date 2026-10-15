import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,migrate,MIGRATIONS,SCHEMA} from '../dist/core.js';

const OPTIONAL=['research','rules','transfers','tours','freights','tickets'];
function running(){const sim=new Simulation({mode:'guided',seed:7});sim.command({type:'hire',role:'production'});sim.step(90);return sim;}

test('Migration: Welle 0 bleibt bei Schema 1 ohne Schemaschritte',()=>{
 assert.equal(SCHEMA,1);assert.deepEqual(MIGRATIONS,[]);
 assert.equal(new Simulation({mode:'guided'}).state.schema,SCHEMA);
});

test('Migration: aktueller Schema-1-Stand bleibt bitgleich und dasselbe Objekt',()=>{
 const raw=running().serialize(),state=JSON.parse(raw);
 assert.equal(migrate(state),state);assert.equal(JSON.stringify(state),raw);
 assert.equal(Simulation.fromJSON(raw).serialize(),raw);
});

test('Migration: ältere Schema-1-Stände erhalten fehlende Listen, vorhandene Daten bleiben',()=>{
 const sim=running(),state=JSON.parse(sim.serialize());
 for(const key of OPTIONAL)delete state[key];
 state.research=[{key:'kept',progress:3}];
 const migrated=migrate(state);
 assert.deepEqual(migrated.research,[{key:'kept',progress:3}]);
 for(const key of OPTIONAL.slice(1))assert.deepEqual(migrated[key],[]);
 const old=JSON.parse(sim.serialize());for(const key of OPTIONAL)delete old[key];
 const loaded=Simulation.fromJSON(JSON.stringify(old));
 for(const key of OPTIONAL)assert.deepEqual(loaded.state[key],[]);
 loaded.step(30);assert.equal(loaded.state.t,sim.state.t+30);
});

test('Migration: unbekannte, neuere oder fehlende Schemata werden nicht verändert und beim Laden abgelehnt',()=>{
 for(const schema of [0,2,'1',undefined,1.5]){
  const state=JSON.parse(running().serialize());state.schema=schema;delete state.tickets;
  const before=JSON.stringify(state);assert.equal(JSON.stringify(migrate(state)),before);
  assert.throws(()=>Simulation.fromJSON(before),/Speicherformat nicht unterstützt/);
 }
 for(const value of [null,[],'x',5])assert.equal(migrate(value),value);
});

test('Migrationsrahmen: Schritte laufen geordnet from→to, mit Auffüllung je Stufe (Vorbereitung Schema 2)',()=>{
 const calls=[];
 const steps=[
  {from:2,to:3,migrate(s){calls.push('2→3');s.docks=s.yard.map(y=>({id:'dock-'+y.id}));}},
  {from:1,to:2,migrate(s){calls.push('1→2');s.yard=[{id:1}];}}
 ];
 const fills={1(s){calls.push('fill1');s.tickets??=[];},3(s){calls.push('fill3');s.sorting??=[];}};
 const state={schema:1,money:5};
 assert.equal(migrate(state,{steps,target:3,fills}),state);
 assert.deepEqual(calls,['fill1','1→2','2→3','fill3']);
 assert.deepEqual(state,{schema:3,money:5,tickets:[],yard:[{id:1}],docks:[{id:'dock-1'}],sorting:[]});
 // Bereits migrierte Stände bleiben unverändert (idempotent bis auf Auffüllung).
 calls.length=0;migrate(state,{steps,target:3,fills});assert.deepEqual(calls,['fill3']);
 // Fehlender Zwischenschritt: Stand bleibt auf erreichter Stufe, Validierung lehnt ab.
 const partial={schema:1};migrate(partial,{steps:[steps[1]],target:3,fills:{}});assert.equal(partial.schema,2);
 // Sprünge sind verboten, damit jede Stufe einzeln geprüft bleibt.
 assert.throws(()=>migrate({schema:1},{steps:[{from:1,to:3,migrate(){}}],target:3,fills:{}}),/Migrationsschritt 1→3/);
 // Neuere Stände werden nie zurückmigriert.
 const newer={schema:4};assert.deepEqual(migrate(newer,{steps,target:3,fills}),{schema:4});
});

test('Migration ändert keinen Zufallsgenerator und kein Ergebnis: gleicher Verlauf nach Laden',()=>{
 const a=running(),raw=a.serialize(),old=JSON.parse(raw);delete old.tours;delete old.freights;
 const b=Simulation.fromJSON(JSON.stringify(old));a.step(240);b.step(240);
 // Ergänzte Listen stehen am Ende des Objekts; fachlich zählt der Inhalt, nicht die Schlüsselreihenfolge.
 assert.deepEqual(JSON.parse(b.serialize()),JSON.parse(a.serialize()));
});
