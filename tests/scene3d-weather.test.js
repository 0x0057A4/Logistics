/** 0.16 Wetter und Störungsmarker (A09): reine Darstellungslogik ohne DOM/WebGL. Sichtprüfung und Budget: tests/browser/weather-016.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {WEATHER_LOOK,WEATHER_PARTICLES,WEATHER_VOLUME,WEATHER_FADE_MIN,WEATHER_FADE_S,FOG_BASE,weatherParticles,weatherAdvance,weatherStep,weatherFog,
 disruptionView,disruptionLabels,WORKER_VEST,workerVest,networkLines,networkLineMesh,networkLayout,jamTone,JAM_TONE,NET_TONE,workerSpots,yardLayout} from '../dist/scene3d.js';
import {WEATHER,weatherAt,active} from '../dist/disruptions.js';
import {ROLES} from '../dist/catalog.js';
import {Simulation} from '../dist/core.js';

const site={id:'a',name:'Morgenfeld',x:0,y:0,width:20,height:16,energy:30};
const fixture=()=>({t:3000,seed:5,selectedSite:'a',sites:[{...site},{id:'b',name:'Lindenhain',x:44,y:18,width:20,height:16,energy:30}],buildings:[],workers:[],jobs:[],research:[],batches:[],vehicles:[],lines:[],contracts:[],
 disruptions:{day:3,weather:{a:{kind:'rain',since:2880,until:4320}},events:[],log:[]}});
const frozen=v=>{if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(frozen);}return v;};

test('Erscheinung für jede Wetterlage des Simulationsmoduls, klar ohne Wirkung',()=>{
 for(const k of WEATHER)assert.ok(WEATHER_LOOK[k],k);
 const c=WEATHER_LOOK.clear;assert.equal(c.precip,null);assert.equal(c.fog,0);assert.equal(c.light,1);assert.equal(c.groundA,0);
 assert.equal(WEATHER_LOOK.rain.precip,'rain');assert.equal(WEATHER_LOOK.storm.precip,'rain');assert.equal(WEATHER_LOOK.snow.precip,'snow');assert.equal(WEATHER_LOOK.fog.precip,null);
 assert.ok(WEATHER_LOOK.storm.slant>WEATHER_LOOK.rain.slant*3,'Sturm: Regen deutlich schräg');assert.ok(WEATHER_LOOK.storm.light<WEATHER_LOOK.rain.light,'Sturm dunkler als Regen');
 assert.ok(WEATHER_LOOK.snow.speed<WEATHER_LOOK.rain.speed/5,'Schnee fällt langsam');assert.equal(WEATHER_LOOK.snow.ground,'#ffffff');assert.ok(WEATHER_LOOK.snow.groundA>0&&WEATHER_LOOK.snow.groundA<.5,'leichte weiße Bodentönung');
 assert.equal(WEATHER_LOOK.fog.fog,1);
});
test('Partikel je Stufe: Niedrig nur Tönung, reduzierte Bewegung nur Tönung, Schnee 70 %',()=>{
 for(const k of WEATHER)assert.equal(weatherParticles('low',k),0,k);
 for(const l of ['low','medium','high'])for(const k of WEATHER)assert.equal(weatherParticles(l,k,true),0,`${l}/${k} reduziert`);
 assert.equal(weatherParticles('high','rain'),WEATHER_PARTICLES.high);assert.equal(weatherParticles('medium','storm'),WEATHER_PARTICLES.medium);
 assert.equal(weatherParticles('high','snow'),Math.round(WEATHER_PARTICLES.high*.7));
 for(const k of ['clear','fog'])assert.equal(weatherParticles('high',k),0);
 assert.ok(WEATHER_PARTICLES.medium<WEATHER_PARTICLES.high&&WEATHER_PARTICLES.high<=2000,'Linien/Punkte zählen nicht als Dreiecke, bleiben aber begrenzt');
});
test('Fallphase nur bei laufender Uhr, Pause/Rücksprung friert ein, Frame-Zeit gedeckelt, Bereich [0,h)',()=>{
 assert.equal(weatherAdvance(3,0,.016,15),3);assert.equal(weatherAdvance(3,-2,.016,15),3);assert.equal(weatherAdvance(3,NaN,.016,15),3);assert.equal(weatherAdvance(3,1,0,15),3);
 assert.ok(Math.abs(weatherAdvance(0,.02,.016,15)-.24)<1e-9);
 assert.equal(weatherAdvance(0,.02,5,10),1,'lange Frame-Pause springt höchstens 0,1 s');
 assert.equal(weatherAdvance(0,500,.016,15),weatherAdvance(0,.01,.016,15),'Spieltempo beschleunigt den Regen nicht');
 const p=weatherAdvance(WEATHER_VOLUME.h-.1,1,.1,15);assert.ok(p>=0&&p<WEATHER_VOLUME.h);
});
test('Weicher Übergang: altes Wetter blendet aus, neues ein; Pause friert, hohes Tempo durch Echtzeit gedeckelt; Sprung setzt sofort',()=>{
 const wx={kind:'clear',amount:0};
 assert.equal(weatherStep(wx,'rain',0,.016),false,'Pause: keine Änderung');assert.deepEqual(wx,{kind:'clear',amount:0});
 weatherStep(wx,'rain',1,1);assert.equal(wx.kind,'rain');assert.equal(wx.amount,0);
 for(let i=0;i<WEATHER_FADE_MIN-1;i++)weatherStep(wx,'rain',1,1);assert.ok(wx.amount>.9&&wx.amount<1);
 weatherStep(wx,'rain',5,1);assert.equal(wx.amount,1);
 // Hohes Spieltempo: 60 Spielminuten in einem Frame von 16 ms ändern höchstens dt/WEATHER_FADE_S.
 weatherStep(wx,'snow',60,.016);assert.equal(wx.kind,'rain');assert.ok(Math.abs(wx.amount-(1-.016/WEATHER_FADE_S))<1e-9);
 for(let i=0;i<200&&wx.kind!=='snow';i++)weatherStep(wx,'snow',2,.1);assert.equal(wx.kind,'snow');
 for(let i=0;i<200&&wx.amount<1;i++)weatherStep(wx,'snow',2,.1);assert.equal(wx.amount,1);
 for(let i=0;i<200&&wx.kind!=='clear';i++)weatherStep(wx,'clear',2,.1);assert.deepEqual(wx,{kind:'clear',amount:0});
 assert.equal(weatherStep(wx,'clear',2,.1),false);
 weatherStep(wx,'storm',0,0,true);assert.deepEqual(wx,{kind:'storm',amount:1},'Laden/Standortwechsel: sofort');
 weatherStep(wx,'unbekannt',0,0,true);assert.deepEqual(wx,{kind:'clear',amount:0});
});
test('Nebel: klar = Grundnebel, Nebel zieht Grenzen vor das Blickziel, stetig in der Stärke',()=>{
 assert.deepEqual(weatherFog('clear',1,38),FOG_BASE);assert.deepEqual(weatherFog('fog',0,38),FOG_BASE);
 const full=weatherFog('fog',1,38),half=weatherFog('fog',.5,38),rain=weatherFog('rain',1,38);
 assert.ok(full.near<38&&full.far>38,'Blickziel liegt im Nebel, bleibt erkennbar');assert.ok(full.near<half.near&&half.near<FOG_BASE.near);
 assert.ok(rain.near>full.near&&rain.far>full.far,'Regen nur leichter Dunst');
 for(const D of [10,38,59,80,200]){const f=weatherFog('fog',1,D);assert.ok(f.near>0&&f.far>f.near&&f.far<=FOG_BASE.far,`D=${D}`);}
});
test('disruptionView liest Wetter und Ereignisse wie disruptions.weatherAt/active (echte Simulation), ohne Zustand zu ändern',()=>{
 const sim=new Simulation({mode:'sandbox',seed:3}),s=sim.state,seen=new Set();
 for(let h=0;h<5*24;h++){
  sim.step(60);const id=s.selectedSite,before=JSON.stringify(s),dv=disruptionView(s,id);
  assert.equal(JSON.stringify(s),before,'rein lesend');
  assert.equal(dv.weather,weatherAt(s,id));const ev=active(s,id).filter(e=>e.kind!=='weather');
  assert.equal(!!dv.gate,ev.some(e=>e.kind==='gate'));assert.equal(!!dv.grid,ev.some(e=>e.kind==='grid'));assert.equal(dv.jams.length,ev.filter(e=>e.kind==='jam').length);
  seen.add(dv.weather);if(dv.gate)seen.add('gate');if(dv.grid)seen.add('grid');if(dv.jams.length)seen.add('jam');
 }
 for(const k of ['rain','snow','fog','storm','gate','jam'])assert.ok(seen.has(k),`Probe zeigt ${k} (gesehen: ${[...seen]})`);
 assert.equal(disruptionView({sites:[site]},'a').weather,'clear','Altstand ohne s.disruptions: klar, keine Marker');
 assert.equal(disruptionView(null,'a').key,'clear');
});
test('Marker: Torstörung, Netzstörung (Warnung nur ohne ausreichende Energiegebäude), Stau auf Linie und im Umland',()=>{
 const s=fixture();s.disruptions.events.push({id:'d1',kind:'gate',site:'a',startT:2990,endT:3050,text:''},{id:'d2',kind:'grid',site:'a',startT:2990,endT:3030,text:''},
  {id:'d3',kind:'jam',site:'a',startT:2900,endT:3100,pct:45,target:{line:'l1',name:'Morgenfeld → Lindenhain'},text:''},{id:'d4',kind:'jam',site:'a',startT:2900,endT:3100,pct:25,text:''},
  {id:'d5',kind:'gate',site:'a',startT:3100,endT:3200,text:''});
 frozen(s);let dv=disruptionView(s,'a');
 assert.equal(dv.weather,'rain');assert.equal(dv.gate.id,'d1');assert.equal(dv.grid.id,'d2');assert.equal(dv.gridCovered,false,'ohne Energiegebäude: Netzstörung wirkt');
 assert.deepEqual(dv.lineJams,{l1:45});assert.equal(dv.siteJam.id,'d4');
 const texts=disruptionLabels(dv).map(l=>l.text);assert.deepEqual(texts,['Torstörung · bis 02:50','Netzstörung · Hallenlicht aus bis 02:30','Stau · Fahrten +25 %']);
 assert.equal(disruptionView(s,'b').gate,null,'Ereignis gilt nur am eigenen Standort');
 // Energiegebäude decken den Bedarf: Netzstörung ohne Wirkung → kein Warnsymbol, Hallenlicht bleibt.
 const c=fixture();c.sites[0].energy=0;c.buildings.push({id:'p',type:'power',site:'a',x:2,y:2,rotation:0,enabled:true,condition:100,status:'idle'});
 c.disruptions.events.push({id:'g',kind:'grid',site:'a',startT:2990,endT:3030,text:''});dv=disruptionView(c,'a');
 assert.equal(dv.gridCovered,true);assert.equal(disruptionLabels(dv).some(l=>l.kind==='grid'),false);
 assert.notEqual(disruptionView(c,'a').key,disruptionView(s,'a').key);
});
test('Netzansicht: gestaute Linie orange/rot, Gegenrichtung und andere Linien unverändert',()=>{
 const s=fixture();s.lines=[{id:'l1',from:'a',to:'b'},{id:'l2',from:'b',to:'a'}];s.disruptions.events.push({id:'j',kind:'jam',site:'a',startT:2900,endT:3100,pct:30,target:{line:'l1',name:''},text:''});
 const {pins}=networkLayout(s.sites),lines=networkLines(s,pins);
 assert.equal(lines.find(l=>l.id==='l1').jam,30);assert.equal(lines.find(l=>l.id==='l2').jam,0);
 assert.equal(jamTone(30),JAM_TONE.light);assert.equal(jamTone(40),JAM_TONE.heavy);
 const rgb=h=>{const n=parseInt(h.slice(1),16);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];};
 const m1=networkLineMesh([lines[0]]),m2=networkLineMesh([lines[1]]);
 assert.deepEqual(m1.colr.slice(0,3),rgb(JAM_TONE.light));assert.deepEqual(m2.colr.slice(0,3),rgb(NET_TONE.active));
 s.t=3200;assert.equal(networkLines(s,pins)[0].jam,0,'nach Ende normal');
 delete s.disruptions;assert.equal(networkLines(s,pins)[0].jam,0,'Altstand');
});
test('Personalrollen: Staplerfahrer und Torposten mit eigener Westenfarbe, Torposten an der Hofeinfahrt',()=>{
 for(const r of Object.keys(ROLES))assert.match(workerVest(r),/^#[0-9a-f]{6}$/,r);
 const others=Object.entries(WORKER_VEST).filter(([k])=>k!=='forklift'&&k!=='gate').map(([,v])=>v);
 assert.ok(!others.includes(WORKER_VEST.forklift)&&!others.includes(WORKER_VEST.gate)&&WORKER_VEST.forklift!==WORKER_VEST.gate);
 assert.equal(workerVest('unbekannt'),WORKER_VEST.production);
 const s=fixture();s.workers=[{id:'w1',role:'gate',site:'a',task:'arr-1:gate'},{id:'w2',role:'warehouse',site:'a',task:'arr-2:gate'},{id:'w3',role:'forklift',site:'a',task:null},{id:'w4',role:'gate',site:'a',task:null}];
 const L=yardLayout(site),spots=workerSpots(s,site,[]);assert.equal(spots.length,4);
 for(const id of ['w1','w2']){const p=spots.find(x=>x.id===id);assert.ok(Math.abs(p.z-L.yardGateZ)<2&&p.x<-3&&p.x>-4.4,`${id} am Pförtnerhaus`);}
 for(const id of ['w3','w4']){const p=spots.find(x=>x.id===id);assert.ok(p.x>0&&p.z<site.height,`${id} ohne Torbindung im Aufenthaltsbereich`);}
 assert.equal(spots.find(x=>x.id==='w1').role,'gate');
});
