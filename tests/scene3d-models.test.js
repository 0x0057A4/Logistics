/** 0.15 Modelle (A09): reine Darstellungslogik für Quergurtsorter, Kühlpakete und Sperrgut ohne DOM/WebGL. Sichtprüfung: tests/browser/models-015.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {BELT,BELT_CARRIERS,BELT_LAPS,BELT_MAX_LAPS_S,BELT_REJECT,beltPoint,beltLength,beltAdvance,beltRunning,beltLoaded,beltCarrierFull,resortQty,
 coldLoads,parcelLoads,bulkyLoads,bulkyShape,trailerBulky,arrivalWare,arrivalPlan,yardLayout,rackPallets,buildingBox,tourStops,
 PARCELS_PER_CAGE,PARCELS_PER_STACK,BULKY_PER_PIECE,MAX_BULKY,BULKY_LEVELS,BULKY_PER_TRAILER,MAX_CAGES} from '../dist/scene3d.js';
import {BUILDINGS} from '../dist/catalog.js';
import {Simulation} from '../dist/core.js';
import {Scene} from '../dist/scene.js';
import {modelsProbe} from './scene3d-models-probe.js';

const frozen=v=>{if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(frozen);}return v;};
const site={id:'a',name:'Morgenfeld',x:0,y:0,width:20,height:16,energy:30};
const fixture=()=>({t:600,selectedSite:'a',sites:[site],buildings:[],workers:[],batches:[],vehicles:[],yard:[],containers:[]});
const inside=(p,b)=>{const box=buildingBox(b);return p.x>box.x0&&p.x<box.x1&&p.z>box.z0&&p.z<box.z1;};

test('Quergurt: Schleife geschlossen, stetig, innerhalb des 6×3-Grundrisses, Fahrtrichtung passt zur Bewegung',()=>{
 assert.deepEqual([BUILDINGS.crossbelt.w,BUILDINGS.crossbelt.h],[6,3]);
 const n=400,step=beltLength()/n;let prev=beltPoint(0);
 for(let i=1;i<=n;i++){
  const p=beltPoint(i/n);assert.ok(Math.abs(p.x)<=BELT.hx+BELT.r+1e-9&&Math.abs(p.z)<=BELT.r+1e-9);
  assert.ok(Math.abs(p.x)+.3<3&&Math.abs(p.z)+.3<1.5,'Wagen (halbe Breite 0,25) bleibt im Grundriss');
  const d=Math.hypot(p.x-prev.x,p.z-prev.z);assert.ok(d<step*1.05&&d>step*.9,`gleichmäßig bei ${i}`);
  const dir=Math.atan2(p.z-prev.z,p.x-prev.x),h=prev.heading;assert.ok(Math.abs(Math.atan2(Math.sin(dir-h),Math.cos(dir-h)))<.05,`Richtung bei ${i}`);
  prev=p;
 }
 const a=beltPoint(0),b=beltPoint(1),c=beltPoint(-.25),e=beltPoint(.75);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-9);assert.ok(Math.hypot(c.x-e.x,c.z-e.z)<1e-9);
 assert.ok(BELT_REJECT.x+.17<3,'Fehlwurfbehälter im Grundriss');
});
test('Quergurt: Vorschub nur aus der Anzeigeuhr, Pause/Rücksprung steht, hohe Spieltempos gedeckelt',()=>{
 assert.equal(beltAdvance(.3,0,.016),.3);assert.equal(beltAdvance(.3,-5,.016),.3);assert.equal(beltAdvance(.3,1,0),.3);assert.equal(beltAdvance(.3,NaN,.016),.3);
 assert.ok(Math.abs(beltAdvance(0,.1,1)-.1*BELT_LAPS)<1e-12,'1× Tempo: BELT_LAPS je Spielminute');
 assert.ok(Math.abs(beltAdvance(0,60,.1)-.1*BELT_MAX_LAPS_S)<1e-12,'hohes Tempo: höchstens BELT_MAX_LAPS_S je Sekunde');
 assert.ok(beltAdvance(.99,.2,1)<.1,'Umlauf bleibt in [0,1)');
 assert.ok(BELT_CARRIERS.low<BELT_CARRIERS.medium&&BELT_CARRIERS.medium<BELT_CARRIERS.high);
 assert.ok(beltLength()/BELT_CARRIERS.high>.34,'Wagen (0,32 lang) überlappen auf Hoch nicht');
});
test('Quergurt: Betriebszustand aus b.status (working läuft, idle/staff/power steht; Ladung bei Stillstand im Ablauf)',()=>{
 const st=s=>({type:'crossbelt',status:s,enabled:true});
 assert.equal(beltRunning(st('working')),true);for(const s of ['idle','staff','power','storage','broken','paused'])assert.equal(beltRunning(st(s)),false,s);
 assert.equal(beltRunning({type:'crossbelt',status:'working',enabled:false}),false);
 for(const s of ['working','staff','power','storage','broken'])assert.equal(beltLoaded(st(s)),true,s);for(const s of ['idle','paused',undefined])assert.equal(beltLoaded(st(s)),false,String(s));
 const full=Array.from({length:20},(_,i)=>beltCarrierFull(i)).filter(Boolean).length;assert.equal(full,12,'60 % belegt');
 const s=fixture();s.batches.push({site:'a',item:'parcel',qty:3,location:'inbound',resort:true},{site:'a',item:'parcel',qty:9,location:'inbound'},{site:'b',item:'parcel',qty:5,location:'inbound',resort:true});assert.equal(resortQty(frozen(s),'a'),3);
});
test('Kühlpakete: eigene Rollcontainer hinter den Paketen auf den Docks, Stapel am Kühllager, Dichte wie Pakete',()=>{
 const s=fixture();s.buildings.push({id:'d1',type:'dock',site:'a',x:1,y:12,rotation:0},{id:'d2',type:'dock',site:'a',x:5,y:12,rotation:0},{id:'cb',type:'crossbelt',site:'a',x:5,y:6,rotation:0},{id:'r1',type:'rack',site:'a',x:1,y:2,rotation:0},{id:'k1',type:'coldstore',site:'a',x:13,y:2,rotation:0});
 assert.deepEqual([coldLoads(s,'a').cages.length,coldLoads(s,'a').stacks.length],[0,0]);
 s.batches.push({id:'p',item:'parcel',site:'a',qty:100,location:'inbound'},{id:'ps',item:'parcel',site:'a',qty:30,location:'stock'},{id:'c',item:'parcel_cold',site:'a',qty:90,location:'inbound'},{id:'cs',item:'parcel_cold',site:'a',qty:50,location:'stock'},{id:'x',item:'parcel_cold',site:'b',qty:500,location:'inbound'});
 frozen(s);const before=JSON.stringify(s),base=parcelLoads(s,'a'),c=coldLoads(s,'a');
 assert.equal(base.inbound,100,'Pakete zählen Kühlpakete nicht mit');assert.equal(base.stock,30);
 assert.ok(base.stacks.every(x=>x.anchor==='cb'),'Paket-Ausgang am Quergurt');
 assert.equal(c.inbound,90);assert.equal(c.cages.length,Math.ceil(90/PARCELS_PER_CAGE));assert.equal(c.stacks.length,Math.ceil(50/PARCELS_PER_STACK));
 assert.ok(c.cages.every(x=>x.cold&&inside(x,s.buildings.find(b=>b.id===x.dock))),'auf dem Dock');
 const keys=new Set(base.cages.map(x=>`${x.x.toFixed(3)},${x.z.toFixed(3)}`));assert.ok(c.cages.every(x=>!keys.has(`${x.x.toFixed(3)},${x.z.toFixed(3)}`)),'kein Platz doppelt belegt');
 assert.ok(c.stacks.every(x=>x.anchor==='k1'&&x.cold),'Stapel vor dem Kühllager');assert.ok(c.stacks[2].sy<c.stacks[0].sy,'angebrochener Stapel niedriger');
 assert.equal(JSON.stringify(s),before);
 // Ohne Kühllager: freie Paket-Stapelplätze nach den Paketen; Dockplätze gedeckelt.
 const t=fixture();t.buildings.push({id:'d1',type:'dock',site:'a',x:1,y:12,rotation:0},{id:'so',type:'sorter',site:'a',x:5,y:6,rotation:0});
 t.batches.push({item:'parcel',site:'a',qty:40*7,location:'inbound'},{item:'parcel',site:'a',qty:40,location:'stock'},{item:'parcel_cold',site:'a',qty:4000,location:'inbound'},{item:'parcel_cold',site:'a',qty:20,location:'stock'});
 const b2=parcelLoads(t,'a'),c2=coldLoads(t,'a',undefined,b2);assert.equal(b2.cages.length+c2.cages.length,8,'Dock voll (8 Plätze)');assert.ok(c2.cages.length<=MAX_CAGES);
 assert.equal(c2.stacks.length,1);assert.ok(b2.stacks.length===2&&c2.stacks[0].anchor==='so');
});
test('Sperrgut: Stücke an den Regalstirnseiten, bis 3 übereinander, unregelmäßige Formen; ohne Regal am Staplerplatz',()=>{
 const s=fixture();s.buildings.push({id:'r1',type:'rack',site:'a',x:1,y:2,rotation:0},{id:'r2',type:'rack',site:'a',x:5,y:2,rotation:90});
 assert.equal(bulkyLoads(s,'a').pieces.length,0);
 s.batches.push({item:'bulky',site:'a',qty:15,location:'stock'},{item:'bulky',site:'a',qty:7,location:'inbound'},{item:'bulky',site:'b',qty:50,location:'stock'});frozen(s);
 const l=bulkyLoads(s,'a');assert.equal(l.stock,15);assert.equal(l.pieces.length,Math.ceil(15/BULKY_PER_PIECE));
 assert.ok(l.pieces.every(p=>p.level<BULKY_LEVELS&&Number.isFinite(p.y)&&p.sx>0&&p.sy>0&&p.sz>0&&/^#/.test(p.hex)));
 for(const r of ['r1','r2']){const box=buildingBox(s.buildings.find(b=>b.id===r)),mine=l.pieces.filter(p=>p.anchor===r);assert.ok(mine.length>0);
  for(const p of mine){const ex=Math.max(box.x0-p.x,p.x-box.x1,0),ez=Math.max(box.z0-p.z,p.z-box.z1,0);assert.ok(ex+ez>.2&&ex+ez<.5,'direkt an der Stirnseite, nicht im Regal');}}
 const col=l.pieces.filter(p=>Math.abs(p.x-l.pieces[0].x)<1e-9&&Math.abs(p.z-l.pieces[0].z)<1e-9);for(let i=1;i<col.length;i++)assert.ok(col[i].y>col[i-1].y,'Stapel wächst');
 assert.ok(new Set(l.pieces.map(p=>p.sy)).size>=3,'mehrere Formen');assert.deepEqual(bulkyShape(5),bulkyShape(5));
 const many=fixture();many.buildings=s.buildings;many.batches=[{item:'bulky',site:'a',qty:999,location:'stock'}];assert.equal(bulkyLoads(many,'a').pieces.length,Math.min(MAX_BULKY,4*BULKY_LEVELS));
 const nf=fixture();nf.buildings.push({id:'f',type:'forklift',site:'a',x:9,y:2,rotation:0});nf.batches.push({item:'bulky',site:'a',qty:4,location:'stock'});assert.ok(bulkyLoads(nf,'a').pieces.every(p=>p.anchor==='f'));
 // Regalpaletten zählen Kühlpakete und Sperrgut nicht (eigene Darstellung).
 const rp=fixture();rp.buildings.push({id:'r',type:'rack',site:'a',x:0,y:0});rp.batches.push({item:'bulky',site:'a',qty:100,location:'stock'},{item:'parcel_cold',site:'a',qty:100,location:'stock'});assert.equal(rackPallets(rp,rp.buildings[0]).length,0);
});
test('Fremd-Lkw: Kühlware und Sperrgut erkennbar (Ware, Ladung auf der Pritsche nimmt beim Entladen ab)',()=>{
 assert.deepEqual(['pallet','parcel_cold','bulky',undefined].map(item=>arrivalWare({item})),['pallet','cold','bulky','parcel']);
 assert.equal(trailerBulky({item:'bulky',parcels:16,unloaded:0}),BULKY_PER_TRAILER);assert.equal(trailerBulky({item:'bulky',parcels:16,unloaded:8}),3);assert.equal(trailerBulky({item:'bulky',parcels:16,unloaded:16}),0);
 assert.equal(trailerBulky({item:'pallet',parcels:16}),0);assert.equal(trailerBulky({item:'bulky',parcels:0}),0);
 const L=yardLayout(site),cold=arrivalPlan(L,frozen({id:'arrival-1',site:'a',phase:'gate',item:'parcel_cold',parcels:80,unloaded:0,plate:'X'}));assert.equal(cold.ware,'cold');assert.equal(cold.pallet,false);assert.equal(cold.bulky,0);
 const bulk=arrivalPlan(L,frozen({id:'arrival-2',site:'a',phase:'gate',item:'bulky',parcels:16,unloaded:4,plate:'Y'}));assert.equal(bulk.ware,'bulky');assert.equal(bulk.bulky,5);
});
test('2D-Rückfall (scene.js): Quergurt als Anlage mit Katalogfarbe, anklickbar, rotiert 6×3 → 3×6, Zustand unverändert',()=>{
 const s={...fixture(),jobs:[],research:[],transfers:[],shipments:[],returns:[],tours:[],freights:[]};
 s.buildings.push({id:'cb',type:'crossbelt',site:'a',x:5,y:6,rotation:0,status:'working',enabled:true},{id:'cb2',type:'crossbelt',site:'a',x:14,y:2,rotation:90,status:'staff',enabled:true});
 s.batches.push({item:'parcel_cold',site:'a',qty:40,location:'stock'},{item:'bulky',site:'a',qty:6,location:'stock'});frozen(s);
 const fills=[],noop=()=>{},ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop}),measureText:t=>({width:t.length*5})},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>{if(k==='fillStyle')fills.push(v);o[k]=v;return true;}});
 const scene=Object.assign(Object.create(Scene.prototype),{state:s,width:1280,height:782,pan:{x:0,y:0},scale:1,angle:0,ctx,hits:[],view:'hall',selected:null,build:null});
 const before=JSON.stringify(s);for(const view of ['hall','site','flat']){scene.view=view;scene.render();assert.ok(scene.hits.some(h=>h.id==='cb')&&scene.hits.some(h=>h.id==='cb2'),view);}
 assert.ok(fills.includes(BUILDINGS.crossbelt.color),'Katalogfarbe');
 assert.deepEqual([scene.dimensions(s.buildings[1]).w,scene.dimensions(s.buildings[1]).h],[3,6]);
 assert.equal(scene.statusLabel('working'),'Fertigung');assert.equal(JSON.stringify(s),before);
});
test('Echter Mega-Hub-Ablauf: Quergurt arbeitet, Kühl-/Sperrgut-Lkw im Hof, Darstellungslogik liest nur',()=>{
 const {sim,ids}=modelsProbe(Simulation),s=sim.state,before=sim.serialize(),id=s.selectedSite;
 const cb=s.buildings.find(b=>b.id===ids.crossbelt);assert.equal(cb.status,'working');assert.ok(beltRunning(cb)&&beltLoaded(cb));
 const base=parcelLoads(s,id),cold=coldLoads(s,id,undefined,base),bulky=bulkyLoads(s,id);
 assert.ok(base.stacks.length>0&&base.stacks.some(x=>x.anchor===cb.id),'Pakete am Quergurt-Ausgang');
 assert.ok(cold.cages.length>0&&cold.stacks.length>0,'Kühlpakete inbound und eingelagert');assert.ok(bulky.pieces.length>0,'Sperrgut eingelagert');
 const L=yardLayout(s.sites[0]),wares=s.yard.filter(a=>a.phase!=='gone').map(a=>arrivalPlan(L,a)?.ware);assert.ok(wares.includes('cold')&&wares.includes('bulky'),wares.join());
 assert.ok(tourStops(s,id).some(x=>x.key==='sorting'),'Rundgang hält am Quergurt');
 assert.equal(sim.serialize(),before,'Spielzustand unverändert');
});
