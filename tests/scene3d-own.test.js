/** Reine Logik der WebGL-Szene ohne DOM/WebGL. Kein Ersatz für die Browserprüfung tests/browser/scene3d.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cellToWorld,worldToCell,buildingBox,buildingTone,sceneSignature,yardLayout,slotPose,vehiclePath,pointOnPath,phaseDuration,phaseProgress,vehiclePlan,vehicleT,vehicleTag,rackPallets,workerSpots,selectLabels,adaptResolution,rayBox,rayGround,networkLayout,MAX_LABELS,FOREIGN_LEN,QUEUE_PLACES,QUEUE_DRIVE,PHASE_LABEL,queueOrder,queuePlace,gatePose,dockPoseFor,makePath,pathPose,approachPath,toDockPath,dockingPath,arrivalTone,arrivalLabel,carrierColor,arrivalPlan,arrivalPose,arrivalMoving,parcelLoads,PARCELS_PER_CAGE,PARCELS_PER_STACK,MAX_CAGES,MAX_STACKS,dockSlots,freeBays,parkPose,fleetPlans,FLEET_PARK,DOCK_GAP,PARK_GAP,VEH_LEN} from '../dist/scene3d.js';
import {Simulation} from '../dist/core.js';
import {hubProbe} from './ui-hub-probe.js';
import {chooseRenderer,hasWebGL} from '../dist/scene-select.js';
const frozen=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(frozen);}return value;};
function fixture(){return {t:600,selectedSite:'a',sites:[{id:'a',name:'Morgenfeld',x:0,y:0,width:20,height:16,energy:30},{id:'b',name:'Lindenhain',x:44,y:18,width:20,height:16,energy:30}],buildings:[],workers:[],jobs:[],research:[],batches:[],vehicles:[],transfers:[],shipments:[],returns:[],tours:[],freights:[]};}

test('Zelle und Welt bilden sich umkehrbar ab (1 Zelle = 1 Einheit, Ursprung oben links)',()=>{
 for(let x=0;x<20;x++)for(let y=0;y<16;y++){const w=cellToWorld(x,y);assert.deepEqual(worldToCell(w.x,w.z),{x,y});assert.deepEqual(worldToCell(x+.999,y+.001),{x,y});}
 assert.deepEqual(worldToCell(-.2,3.5),{x:-1,y:3});
});
test('Anlagenquader beachtet Rotation über footprint()',()=>{
 assert.deepEqual([buildingBox({type:'dock',x:2,y:3,rotation:0}).w,buildingBox({type:'dock',x:2,y:3,rotation:0}).h],[3,2]);
 const r=buildingBox({type:'dock',x:2,y:3,rotation:90});assert.deepEqual([r.x0,r.z0,r.x1,r.z1],[2,3,4,6]);
 assert.equal(buildingBox({type:'rack',x:0,y:0,rotation:270}).h,2);
});
test('Statusfarbe folgt der Zuordnung der 2D-Szene',()=>{
 assert.equal(buildingTone({status:'working'}),'active');
 for(const status of ['materials','staff','broken','power','storage','paused'])assert.equal(buildingTone({status}),'blocked');
 assert.equal(buildingTone({status:'idle',enabled:false}),'blocked');assert.equal(buildingTone({status:'idle'}),'idle');
});
test('Signatur ändert sich nur bei Lage-/Standortänderung, nicht bei Status oder Bestand',()=>{
 const s=fixture();s.buildings.push({id:'m',type:'assembly',site:'a',x:4,y:4,rotation:0,status:'idle'});const a=sceneSignature(s,'a');
 s.buildings[0].status='working';s.batches.push({site:'a',qty:5,location:'stock'});s.t+=10;assert.equal(sceneSignature(s,'a'),a);
 s.buildings[0].rotation=90;assert.notEqual(sceneSignature(s,'a'),a);
 const b=sceneSignature(s,'a');s.buildings.push({id:'x',type:'rack',site:'b',x:0,y:0,rotation:0});assert.equal(sceneSignature(s,'a'),b,'Anlage am anderen Standort ändert Hallengeometrie nicht');
 s.sites.push({id:'c',x:-36,y:52,width:20,height:16});assert.notEqual(sceneSignature(s,'a'),b,'Neuer Standort ändert Netzansicht');
});
test('Hoflayout: Tor an der Hallenkante bei Zeile 8, Andockplätze vor der Südwand, Wege enden am Stellplatz',()=>{
 const L=yardLayout({width:20,height:16});assert.equal(L.gate,8);assert.equal(L.bays.length,5);assert.ok(L.bays.every(x=>x>0&&x<20));
 assert.equal(yardLayout({width:20,height:6}).gate,5);
 const dock=slotPose(L,1);assert.ok(dock.z>16);assert.equal(dock.heading,Math.PI/2);
 const park=slotPose(L,7);assert.ok(park.x>20&&park.z>16,'Überzählige Fahrzeuge im Fuhrpark östlich, nicht auf der Fremd-Wartefläche');
 assert.equal(slotPose(L,0,4.2,30).x,19,'Rampenposition wird auf Hallenbreite begrenzt');
 const out=vehiclePath(L,dock,'out'),inn=vehiclePath(L,dock,'in');assert.deepEqual(out[0],{x:dock.x,z:dock.z});assert.deepEqual(inn.at(-1),{x:dock.x,z:dock.z});assert.ok(out.at(-1).x<-40&&inn[0].x<-40);
});
test('Punkt auf Polygonzug: Anfang, Ende, Mitte und Fahrtrichtung',()=>{
 const path=[{x:0,z:0},{x:10,z:0},{x:10,z:10}],o={};
 assert.deepEqual(pointOnPath(path,0,o),{x:0,z:0,heading:0});pointOnPath(path,.5,o);assert.equal(o.x,10);assert.equal(o.z,0);
 pointOnPath(path,.75,o);assert.equal(o.z,5);assert.ok(Math.abs(o.heading-Math.PI/2)<1e-9);pointOnPath(path,2,o);assert.equal(o.z,10);
});
test('S2: Fortschritt 1-remaining/duration mit gebrochener Uhr, fehlende Felder → null statt Fehler',()=>{
 const v={type:'truck'};
 assert.equal(phaseProgress({remaining:10,duration:20},v,600,600),.5);
 assert.equal(phaseProgress({remaining:10,duration:20},v,600.5,600),.525);
 assert.equal(phaseProgress({remaining:10,duration:20},v,605,600),.55,'Bruchteil wird auf eine Minute begrenzt');
 assert.equal(phaseProgress({remaining:10,duration:20},v,undefined,600),.5);
 assert.equal(phaseDuration({status:'transit',remaining:5,distance:30},{type:'truck'}),36,'Dauer aus Strecke und Geschwindigkeit');
 assert.equal(phaseProgress({status:'collecting',remaining:5},v,600,600),null);assert.equal(phaseProgress(null,v,600,600),null);assert.equal(phaseProgress({duration:5},v,600,600),null);
});
test('Fahrzeugplan: am Standort an Rampe, unterwegs sichtbar nur auf Zu-/Abfahrt, sonst ausgeblendet',()=>{
 const s=fixture();s.vehicles.push({id:'vehicle-3',type:'truck',site:'a',status:'transit',shipment:'sh'});s.shipments.push({id:'sh',vehicleId:'vehicle-3',status:'transit',remaining:36,distance:30});frozen(s);
 const v=s.vehicles[0],plan=vehiclePlan(s,v,'a');assert.equal(plan.mode,'out');
 assert.equal(vehicleT(plan,v,600,600),0,'Abfahrt beginnt am Stellplatz');
 const s2=fixture();s2.vehicles.push({id:'v',type:'truck',site:'a',status:'transit',shipment:'sh'});s2.shipments.push({id:'sh',vehicleId:'v',status:'transit',remaining:10,distance:30});
 assert.equal(vehicleT(vehiclePlan(s2,s2.vehicles[0],'a'),s2.vehicles[0],600,600),null,'Mitten auf der Strecke außer Sicht');
 s2.shipments[0].status='returning';s2.vehicles[0].status='returning';s2.shipments[0].remaining=1;
 const back=vehiclePlan(s2,s2.vehicles[0],'a');assert.equal(back.mode,'in');const t=vehicleT(back,s2.vehicles[0],600,600);assert.ok(t>0&&t<.3,'Rückkehr kurz vor Ankunft nahe Stellplatz');
 assert.ok(vehicleT(back,s2.vehicles[0],600.9,600)<t,'Gebrochene Uhr bewegt Fahrzeug weiter Richtung Rampe');
 const idle=fixture();idle.vehicles.push({id:'v',type:'van',site:'a',status:'idle'});const p=vehiclePlan(idle,idle.vehicles[0],'a');assert.equal(p.mode,'site');assert.equal(p.tone,'idle');assert.equal(vehicleT(p,idle.vehicles[0],1,0),0);
 const blocked=fixture();blocked.vehicles.push({id:'v',type:'truck',site:'a',status:'loading',shipment:'sh'});blocked.shipments.push({id:'sh',vehicleId:'v',status:'loading',remaining:3,blocked:'Lagerpersonal fehlt'});assert.equal(vehiclePlan(blocked,blocked.vehicles[0],'a').tone,'wait');
 const away=fixture();away.vehicles.push({id:'v',type:'truck',site:'a',status:'service',shipment:'r'});away.returns.push({id:'r',vehicleId:'v',status:'collecting',remaining:4});assert.equal(vehiclePlan(away,away.vehicles[0],'a').mode,'away','Ohne Dauer kein erfundener Weg');
});
test('Standorttransfer fährt am Ziel ein und am Quellstandort aus',()=>{
 const s=fixture();s.vehicles.push({id:'v',type:'truck',site:'a',status:'transfer',shipment:'tr'});s.transfers.push({id:'tr',vehicleId:'v',site:'a',fromSite:'a',toSite:'b',status:'transit',remaining:2,duration:40});frozen(s);
 assert.equal(vehiclePlan(s,s.vehicles[0],'a').mode,'out');assert.equal(vehiclePlan(s,s.vehicles[0],'b').mode,'in');
 assert.ok(vehicleT(vehiclePlan(s,s.vehicles[0],'b'),s.vehicles[0],600,600)!=null);
 assert.equal(vehicleT(vehiclePlan(s,s.vehicles[0],'a'),s.vehicles[0],600,600),null);
});
test('Fahrzeugkennung aus Typ und Nummer',()=>{assert.equal(vehicleTag({id:'vehicle-12',type:'truck'}),'LKW-12');assert.equal(vehicleTag({id:'rental-vehicle-4',type:'van'}),'LW-4');assert.equal(vehicleTag({}),'FZ-?');});
test('Regalpaletten folgen dem Standortbestand wie in der 2D-Szene',()=>{
 const s=fixture();s.buildings.push({id:'r1',type:'rack',site:'a',x:0,y:0,rotation:0},{id:'r2',type:'rack',site:'a',x:3,y:0,rotation:0});
 assert.equal(rackPallets(s,s.buildings[0]).length,0);
 s.batches.push({site:'a',qty:30,location:'stock'},{site:'a',qty:500,location:'vehicle'},{site:'b',qty:500,location:'stock'});
 assert.deepEqual(rackPallets(s,s.buildings[0]),[{level:0,cell:0},{level:0,cell:1},{level:1,cell:0}]);assert.equal(rackPallets(s,s.buildings[1]).length,0);
 s.batches.push({site:'a',qty:200,location:'stock'});assert.equal(rackPallets(s,s.buildings[0]).length,6);assert.equal(rackPallets(s,s.buildings[1]).length,6);
});
test('Figuren stehen an der Anlage ihrer Tätigkeit, freie Personen auf Aufenthaltsfläche',()=>{
 const s=fixture();s.buildings.push({id:'m',type:'assembly',site:'a',x:6,y:4,rotation:0});s.workers.push({id:'w1',site:'a',role:'production',task:'job-1'},{id:'w2',site:'a',role:'warehouse',task:null},{id:'w3',site:'b',role:'warehouse'});s.jobs.push({id:'job-1',building:'m',worker:'w1'});
 const spots=workerSpots(frozen(s),s.sites[0],s.buildings);assert.equal(spots.length,2);assert.ok(spots[0].x>=6&&spots[0].x<8&&spots[0].z>=4&&spots[0].z<6);assert.ok(spots[1].z>13);
});
test('Labels: nur sichtbare im Bild, Priorität vor Nähe, Überlappung entfällt, höchstens 40',()=>{
 const c=(key,sx,sy,prio,depth=.5,visible=true)=>({key,sx,sy,prio,depth,visible});
 const out=selectLabels([c('far',100,100,2,.9),c('sel',100,105,0),c('off',-200,50,1),c('behind',300,300,1,1.5),c('near',400,100,2,.2),c('hid',500,100,1,.5,false)],800,600);
 assert.deepEqual(out.map(x=>x.key),['sel','near']);
 assert.equal(selectLabels([{...c('a',100,100,1),w:200},{...c('b',250,100,1),w:200}],800,600).length,1,'Breite Chips überlappen trotz 150 px Abstand');assert.equal(selectLabels([{...c('a',100,100,1),w:100},{...c('b',250,100,1),w:100}],800,600).length,2);
 const many=[];for(let i=0;i<100;i++)many.push(c('v'+i,(i%10)*80+40,Math.floor(i/10)*40+30,2));assert.equal(selectLabels(many,900,500).length,MAX_LABELS);
 const reuse=[];assert.equal(selectLabels([c('a',10,10,1)],100,100,40,reuse),reuse,'Ausgabefeld wird wiederverwendet');
});
test('Adaptive Auflösung senkt nach 2 s über 18 ms bis 0,75 und hebt bei schnellen Frames wieder',()=>{
 const st={ratio:1.5,max:1.5,min:.75};let t=0;
 for(;t<2500;t+=25)adaptResolution(st,25,t);assert.equal(st.ratio,1.25);
 for(;t<20000;t+=25)adaptResolution(st,25,t);assert.equal(st.ratio,.75);
 for(let i=0;i<300;i++,t+=8)adaptResolution(st,8,t);assert.ok(st.ratio>.75,'Schnelle Frames heben an');
 const vs={ratio:1,max:1.5,min:.75,lastDrop:0};let u=30000;for(let i=0;i<400;i++,u+=16.7)adaptResolution(vs,16.7,u);assert.equal(vs.ratio,1.25,'Bei 60-Hz-Vsync nach ruhiger Phase anheben');
 assert.equal(adaptResolution(st,900,t),false,'Tabwechsel-Ausreißer werden ignoriert');
});
test('Strahltests für Gebäudeauswahl und Bodenraster',()=>{
 const box={x0:2,x1:4,y0:0,y1:1.5,z0:2,z1:4};
 assert.equal(rayBox({x:3,y:10,z:3},{x:0,y:-1,z:0},box),8.5);assert.equal(rayBox({x:6,y:10,z:3},{x:0,y:-1,z:0},box),null);assert.equal(rayBox({x:3,y:10,z:3},{x:0,y:1,z:0},box),null);
 const d=Math.SQRT1_2;const g=rayGround({x:0,y:10,z:0},{x:0,y:-d,z:d});assert.ok(Math.abs(g.z-10)<1e-9);assert.equal(rayGround({x:0,y:10,z:0},{x:1,y:0,z:0}),null);
});
test('Netzkarte zentriert Standorte und vergrößert die Ausdehnung',()=>{
 const n=networkLayout([{id:'a',x:0,y:0},{id:'b',x:44,y:18}]);assert.equal(n.pins.length,2);assert.ok(Math.abs(n.pins[0].x+n.pins[1].x)<1e-9);assert.ok(n.ext>=12);
});
test('Szenenwahl: URL erzwingt 2d/3d, sonst WebGL-Verfügbarkeit; ohne DOM sicherer Rückfall',()=>{
 assert.equal(chooseRenderer('?renderer=2d',true),'2d');assert.equal(chooseRenderer('?renderer=3d',false),'3d');assert.equal(chooseRenderer('',true),'3d');assert.equal(chooseRenderer('',false),'2d');assert.equal(chooseRenderer(undefined,false),'2d');
 assert.equal(hasWebGL(undefined),false);assert.equal(hasWebGL({createElement:()=>({getContext:()=>null})}),false);assert.equal(hasWebGL({createElement:()=>{throw new Error('kein DOM');}}),false);
 assert.equal(hasWebGL({createElement:()=>({getContext:k=>k==='webgl'?{getExtension:()=>null}:null})}),true);
});
test('app.js nutzt createScene und meldet gebrochene Spielzeit, 2D-Rückfall bleibt im Harness',()=>{
 const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.match(app,/import \{createScene\} from '\.\/scene-select\.js';/);assert.doesNotMatch(app,/import \{Scene\}/);
 assert.match(app,/scene\.setClock\?\.\(sim\.state\.t\+accumulator\/1000\)/);
 assert.match(app,/typeof createScene==='function'\?createScene:\(canvas,callbacks\)=>new Scene\(canvas,callbacks\)/);
});
test('Darstellungslogik verändert eingefrorenen Zustand nicht',()=>{
 const s=fixture();s.buildings.push({id:'r',type:'rack',site:'a',x:0,y:0,rotation:90});s.batches.push({site:'a',qty:90,location:'stock'});s.vehicles.push({id:'v',type:'refrigerated',site:'a',status:'idle'});s.workers.push({id:'w',site:'a',role:'warehouse'});
 const before=JSON.stringify(s);frozen(s);sceneSignature(s,'a');rackPallets(s,s.buildings[0]);workerSpots(s,s.sites[0],s.buildings);vehicleT(vehiclePlan(s,s.vehicles[0],'a'),s.vehicles[0],600.5,600);assert.equal(JSON.stringify(s),before);
});

// ---------- Welle 1: Fremd-Lkw aus s.yard (W1-S2/W1-S4), Sortierplatz, Pakete ----------
const L1=yardLayout({width:20,height:16});
// Probe-Hofeintrag nach Datenform W1-S2 (inkl. Zusatzfelder aus yard.js).
const arr=(id,phase,extra={})=>({id,site:'a',contractId:'contract-1',orderIds:['order-1'],carrier:'Talgrund Spedition',plate:`TGD-AB ${id.slice(-1)}00`,parcels:120,phase,phaseStart:600,phaseEnd:null,eta:600,dock:null,waitReason:null,waitSince:null,unloaded:0,atRisk:false,forecast:null,gateAt:598,priority:false,split:[{owner:'order-1',target:120,done:0}],...extra});
const angle=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
function sweep(path,n=200){const o={},poses=[];for(let i=0;i<=n;i++){pathPose(path,i/n,o);poses.push({...o});}return poses;}

test('W1 Warteschlange: FIFO nach Torzeit, vorgezogene zuerst, Plätze nebeneinander auf der gelben Wartefläche',()=>{
 const yard=frozen([arr('arrival-1','queue',{gateAt:610}),arr('arrival-2','queue',{gateAt:590}),arr('arrival-3','unloading'),arr('arrival-4','queue',{gateAt:600,priority:true}),{...arr('arrival-5','queue',{gateAt:580}),site:'b'}]);
 assert.deepEqual(queueOrder(yard,'a'),['arrival-4','arrival-2','arrival-1']);
 assert.deepEqual(queueOrder([arr('arrival-7','queue',{gateAt:600}),arr('arrival-6','queue',{gateAt:600})],'a'),['arrival-7','arrival-6'],'Gleichstand: Listenfolge');
 const q=L1.queue,places=[];for(let k=0;k<QUEUE_PLACES;k++)places.push(queuePlace(L1,k));
 for(const p of places){assert.ok(p.x-.63>=q.x0&&p.x+.63<=q.x1,'innerhalb der Fläche (Breite)');assert.ok(p.z-FOREIGN_LEN/2>=q.z0-1e-9&&p.z+FOREIGN_LEN/2<=q.z1+1e-9,'innerhalb der Fläche (Länge)');assert.equal(p.heading,-Math.PI/2);assert.equal(p.z,places[0].z);}
 for(let k=1;k<places.length;k++)assert.ok(places[k-1].x-places[k].x>=1.26+.5,'Abstand > Fahrzeugbreite + Gasse');
 assert.ok(places[0].x>places[5].x,'Platz 0 liegt der Ausfahrt am nächsten');
 const over=queuePlace(L1,QUEUE_PLACES);assert.ok(over.x<q.x0&&over.z===L1.laneZ,'Rückstau auf der Hofgasse');
 assert.ok(gatePose(L1).z-FOREIGN_LEN/2>=L1.yardGateZ-1e-9&&gatePose(L1).x===L1.exitX,'Torhalt vor der Schranke auf der Einfahrspur');
});
test('W1 Interpolation je Phase über phaseStart→phaseEnd; offene Phasen stationär',()=>{
 const g=gatePose(L1),o={};
 const ap=arrivalPlan(L1,arr('arrival-1','approach',{phaseStart:585,phaseEnd:600}));
 arrivalPose(ap,585,o);assert.ok(o.x<-40&&Math.abs(o.z-L1.roadInZ)<1e-9,'Start auf der Straße');
 const mid={...arrivalPose(ap,592.5,{})};assert.ok(mid.x>-62&&mid.x<L1.exitX,'Mitte unterwegs');
 arrivalPose(ap,600,o);assert.ok(Math.abs(o.x-g.x)<1e-9&&Math.abs(o.z-g.z)<1e-9,'Ende am Tor');assert.ok(angle(o.heading,g.heading)<1e-6);
 assert.ok(arrivalMoving(ap,592)&&!arrivalMoving(ap,600));
 const gate=arrivalPlan(L1,arr('arrival-1','gate',{phaseStart:600,phaseEnd:602}));assert.equal(gate.path,null);arrivalPose(gate,601.3,o);assert.deepEqual([o.x,o.z],[g.x,g.z]);
 const place=queuePlace(L1,2),q=arrivalPlan(L1,arr('arrival-1','queue',{phaseStart:602}),{rank:2});
 arrivalPose(q,602,o);assert.ok(Math.hypot(o.x-g.x,o.z-g.z)<1e-6,'Wartefahrt beginnt am Tor');
 arrivalPose(q,602+QUEUE_DRIVE,o);assert.ok(Math.hypot(o.x-place.x,o.z-place.z)<1e-6&&angle(o.heading,place.heading)<1e-6,'nach QUEUE_DRIVE auf Platz 2');
 arrivalPose(q,700,o);assert.ok(Math.hypot(o.x-place.x,o.z-place.z)<1e-6,'offene Phase: bleibt stehen');
 const slide=arrivalPlan(L1,arr('arrival-1','queue',{phaseStart:602}),{rank:1,slide:{from:place,at:650}});arrivalPose(slide,650.5,o);assert.ok(o.x>place.x&&o.x<queuePlace(L1,1).x,'Nachrücken gleitet');assert.equal(o.heading,place.heading,'Nachrücken ohne Drehen');
 const dockB={id:'d1',type:'dock',site:'a',x:6,y:13,rotation:0},dock=dockPoseFor(L1,[dockB],'d1');assert.equal(dock.x,7.5);assert.equal(dock.heading,Math.PI/2);assert.equal(dockPoseFor(L1,[dockB],'x'),null);
 const un=arrivalPlan(L1,arr('arrival-1','unloading',{dock:'d1'}),{dock});arrivalPose(un,900,o);assert.deepEqual([o.x,o.z,o.heading],[dock.x,dock.z,dock.heading]);
 const ex=arrivalPlan(L1,arr('arrival-1','exit',{phaseStart:700,phaseEnd:703}),{dock});arrivalPose(ex,700,o);assert.ok(Math.hypot(o.x-dock.x,o.z-dock.z)<1e-6,'Ausfahrt startet am Dock');assert.ok(angle(o.heading,dock.heading)<1e-6);
 arrivalPose(ex,703,o);assert.ok(o.x<-40&&Math.abs(o.z-L1.roadOutZ)<1e-9,'Ausfahrt endet auf der Gegenspur');
 assert.equal(arrivalPlan(L1,arr('arrival-1','gone')),null,'gone wird nicht gezeigt');
 const noEnd=arrivalPlan(L1,arr('arrival-1','approach',{phaseEnd:null}));arrivalPose(noEnd,590,o);assert.ok(Math.hypot(o.x-g.x,o.z-g.z)<1e-6,'ohne phaseEnd keine Interpolation');
});
test('W1 Andocken: vorwärts hinter das Dock, dann rückwärts mit dem Heck ans Dock – ohne 180°-Sprung',()=>{
 const dock=dockPoseFor(L1,[{id:'d1',type:'dock',site:'a',x:6,y:13,rotation:0}],'d1');
 const toDock=toDockPath(L1,queuePlace(L1,0),dock),dk=dockingPath(L1,dock);
 const a=sweep(toDock),b=sweep(dk);
 assert.ok(angle(a[0].heading,-Math.PI/2)<1e-6,'Ausparken: Bug bleibt Richtung Halle');assert.ok(a[5].z>a[0].z,'rückwärts aus dem Platz (Richtung Hofgasse)');
 assert.ok(angle(a.at(-1).heading,0)<1e-6,'Ende Zum Dock: Bug nach Osten');assert.ok(angle(b[0].heading,a.at(-1).heading)<.05,'Übergang Zum Dock → Andocken stetig');
 for(const s of [a,b])for(let i=1;i<s.length;i++)assert.ok(angle(s[i].heading,s[i-1].heading)<.6,`kein Richtungssprung (${i})`);
 for(let i=1;i<b.length;i++)assert.ok(b[i].z<=b[i-1].z+1e-9,'Andocken bewegt sich nur Richtung Rampe');
 const end=b.at(-1);assert.ok(Math.hypot(end.x-dock.x,end.z-dock.z)<1e-6&&angle(end.heading,Math.PI/2)<1e-6,'Endpose = Dockpose (Heck an der Rampe)');
 for(let i=0;i<b.length-1;i++){const p=b[i],q=b[i+1];if(Math.hypot(q.x-p.x,q.z-p.z)<1e-6)continue;const travel=Math.atan2(q.z-p.z,q.x-p.x);assert.ok(angle(travel,p.heading)>Math.PI/2,'Heck voran (Fahrtrichtung entgegen Bug)');}
 const fromGate=sweep(toDockPath(L1,gatePose(L1),dock));assert.ok(angle(fromGate[0].heading,-Math.PI/2)<1e-6&&angle(fromGate.at(-1).heading,0)<1e-6,'vom Tor direkt: vorwärts');
 const p=makePath([{x:0,z:0},{x:4,z:0},{x:4,z:4}]);assert.ok(p.total>7&&p.total<8,'Ecke abgerundet');
 const ap=sweep(approachPath(L1));for(let i=1;i<ap.length;i++)assert.ok(angle(ap[i].heading,ap[i-1].heading)<.6);
});
test('W1 Labels: Kennzeichen und deutsche Phase, Farben gelb/blau/grau/grün',()=>{
 assert.deepEqual(PHASE_LABEL,{approach:'Anfahrt',gate:'Torkontrolle',queue:'Wartet auf Dock',toDock:'Zum Dock',docking:'Andocken',unloading:'Entladen',exit:'Ausfahrt'});
 const tones={approach:'gate',gate:'gate',queue:'wait',toDock:'move',docking:'move',unloading:'dock',exit:'gate'};
 for(const [phase,tone] of Object.entries(tones)){const a=arr('arrival-3',phase);assert.equal(arrivalTone(a),tone,phase);assert.equal(arrivalLabel(a),`TGD-AB 300 · ${PHASE_LABEL[phase]}`);}
 assert.equal(arrivalTone(arr('arrival-3','unloading',{waitReason:'Keine Lagerkraft am Standort'})),'wait');
 assert.equal(arrivalLabel(arr('arrival-3','unloading',{waitReason:'Keine Lagerkraft am Standort'})),'TGD-AB 300 · Entladen · Keine Lagerkraft am Standort');
 assert.equal(arrivalLabel(arr('arrival-3','queue',{waitReason:'Kein freies Dock'})),'TGD-AB 300 · Wartet auf Dock','Wartegrund in der Schlange nicht doppelt');
 assert.equal(carrierColor('Talgrund Spedition'),carrierColor('Talgrund Spedition'));assert.ok(!['#ebac53','#5ea7a3','#6b9fd6'].includes(carrierColor('x')),'abweichend von eigener Flotte');
 const plan=arrivalPlan(L1,arr('arrival-3','docking',{phaseStart:600,phaseEnd:601,dock:'d1'}),{dock:dockPoseFor(L1,[{id:'d1',type:'dock',x:2,y:13}],'d1')});assert.equal(plan.tone,'move');assert.equal(plan.label,'TGD-AB 300 · Andocken');
});
test('W1 Pakete: Rollcontainer (inbound) an Docks, Kartonstapel (stock) am Sortierplatz, Dichte nach Menge gedeckelt',()=>{
 const s=fixture();s.yard=[];s.buildings.push({id:'d1',type:'dock',site:'a',x:2,y:13,rotation:0},{id:'d2',type:'dock',site:'a',x:6,y:13,rotation:0},{id:'so',type:'sorter',site:'a',x:8,y:8,rotation:0},{id:'r1',type:'rack',site:'a',x:0,y:0,rotation:0});
 assert.deepEqual([parcelLoads(s,'a').cages.length,parcelLoads(s,'a').stacks.length],[0,0]);
 s.batches.push({id:'k1',item:'parcel',site:'a',qty:100,location:'inbound',owner:'order-1'},{id:'k2',item:'parcel',site:'a',qty:30,location:'stock',owner:'order-1'},{id:'k3',item:'housing',site:'a',qty:500,location:'inbound'},{id:'k4',item:'parcel',site:'b',qty:500,location:'inbound'});
 let l=parcelLoads(s,'a');assert.equal(l.inbound,100);assert.equal(l.cages.length,Math.ceil(100/PARCELS_PER_CAGE));assert.equal(l.stacks.length,Math.ceil(30/PARCELS_PER_STACK));
 assert.ok(l.stacks.every(c=>c.anchor==='so'),'Ausgang: Sortierplatz zuerst');assert.ok(l.stacks[1].sy<l.stacks[0].sy,'angebrochener Stapel niedriger');
 const dock=buildingBox(s.buildings[0]);assert.ok(l.cages.every(c=>c.x>dock.x0&&c.x<dock.x1&&c.z>dock.z0&&c.z<dock.z1),'Rollcontainer stehen auf dem Dock');
 s.yard.push({id:'arrival-1',site:'a',dock:'d2',phase:'unloading'});assert.ok(parcelLoads(s,'a').cages.every(c=>c.dock==='d2'),'Dock mit entladendem Lkw zuerst');
 s.batches[0].qty=40000;s.batches[1].qty=40000;l=parcelLoads(s,'a');assert.equal(l.cages.length,16,'8 je Dock');assert.ok(l.cages.length<=MAX_CAGES);assert.ok(l.stacks.length<=MAX_STACKS&&l.stacks.length===12,'Ausgang 8 + Regal 4');assert.ok(l.stacks.every(c=>c.sy===1));
 assert.equal(rackPallets(s,s.buildings[3]).length,0,'Pakete füllen keine Regalpaletten');
});
test('W1 Darstellungslogik verändert eingefrorenen Hofzustand nicht',()=>{
 const s=fixture();s.buildings.push({id:'d1',type:'dock',site:'a',x:6,y:13,rotation:90,task:'arrival-2'});s.batches.push({id:'k',item:'parcel',site:'a',qty:77,location:'inbound',owner:'o'});
 s.yard=[arr('arrival-1','queue'),arr('arrival-2','toDock',{phaseEnd:602,dock:'d1'}),arr('arrival-3','gone')];const before=JSON.stringify(s);frozen(s);
 const order=queueOrder(s.yard,'a'),dock=dockPoseFor(L1,s.buildings,'d1');for(const a of s.yard){const p=arrivalPlan(L1,a,{rank:order.indexOf(a.id),dock});if(p)arrivalPose(p,601.5,p);}parcelLoads(s,'a');
 assert.equal(JSON.stringify(s),before);
});

// W1b: eigene Flotte am tatsächlich belegten Dock, Fremd-Lkw und eigene Fahrzeuge ohne optische Überlappung.
const rect=(p,len,w=1.3)=>{const along=Math.abs(Math.sin(p.heading))>.5;return along?{x0:p.x-w/2,x1:p.x+w/2,z0:p.z-len/2,z1:p.z+len/2}:{x0:p.x-len/2,x1:p.x+len/2,z0:p.z-w/2,z1:p.z+w/2};};
const hits=(a,b)=>a.x0<b.x1&&b.x0<a.x1&&a.z0<b.z1&&b.z0<a.z1;
const inQueue=(L,r)=>r.x1>L.queue.x0&&r.x0<L.queue.x1&&r.z1>L.queue.z0&&r.z0<L.queue.z1;
test('W1b Probe-Zustand (Hub, Import): Fremd-Lkw am Dock 1 sichtbar positioniert, eigener Lieferwagen überlappt nicht',()=>{
 const {sim,ids}=hubProbe(Simulation),s=sim.state,site=s.sites.find(x=>x.id===s.selectedSite),L=yardLayout(site),buildings=s.buildings.filter(b=>b.site===site.id);
 const a=s.yard.find(x=>x.id===ids.arrival);assert.equal(a.phase,'unloading');assert.equal(a.dock,ids.docks[0]);
 const dock=dockPoseFor(L,buildings,a.dock),plan=arrivalPlan(L,a,{dock});assert.ok(plan,'Plan vorhanden');
 const box=buildingBox(buildings.find(b=>b.id===a.dock));assert.equal(plan.x,(box.x0+box.x1)/2,'Lkw in der Spalte seines Docks');assert.ok(plan.z>L.H&&plan.z<L.laneZ,'vor der Südwand, nicht in der Halle');
 const own=fleetPlans(s,site.id,buildings,L);assert.equal(own.length,1);assert.equal(own[0].dock,null,'Lieferwagen bereit, ohne Dock');
 assert.ok(!hits(rect(own[0].pose,own[0].len),rect(dock,FOREIGN_LEN)),'keine Überlappung eigener/Fremd-Lkw');
 assert.ok(!inQueue(L,rect(own[0].pose,own[0].len)),'eigenes Fahrzeug nicht auf der Fremd-Wartefläche');
 const st=Simulation.fromJSON(sim.serialize()).state,b2=st.buildings.filter(b=>b.site===site.id);assert.deepEqual(dockPoseFor(L,b2,st.yard[0].dock),dock,'nach Import (fromJSON) gleiche Dockpose');assert.deepEqual(fleetPlans(st,site.id,b2,L).map(p=>p.pose),own.map(p=>p.pose),'nach Import gleiche Stellplätze');
});
test('W1b Eigenes Fahrzeug steht am tatsächlich belegten Dock (b.task = Sendung/Tour), nicht an bays[k]',()=>{
 const s=fixture(),L=yardLayout(s.sites[0]);
 s.buildings.push({id:'d1',type:'dock',site:'a',x:1,y:13,rotation:0,task:'arrival-1'},{id:'d2',type:'dock',site:'a',x:9,y:11,rotation:0,task:'sh1'},{id:'d3',type:'dock',site:'a',x:13,y:13,rotation:0,task:'tour-1'});
 s.vehicles.push({id:'vehicle-1',type:'truck',site:'a',status:'loading',shipment:'sh1'},{id:'vehicle-2',type:'van',site:'a',status:'tour',tour:'tour-1'},{id:'vehicle-3',type:'van',site:'a',status:'idle'},{id:'vehicle-4',type:'truck',site:'a',status:'idle'});
 s.shipments.push({id:'sh1',vehicleId:'vehicle-1',status:'loading',remaining:3,dock:'d2'});s.tours.push({id:'tour-1',vehicleId:'vehicle-2',status:'loading',remaining:2,dock:'d3'});
 const before=JSON.stringify(s);frozen(s);
 const slots=dockSlots(L,s.buildings),plans=fleetPlans(s,'a',s.buildings,L),by=id=>plans.find(p=>p.v.id===id);
 assert.equal(by('vehicle-1').dock,'d2');assert.equal(by('vehicle-1').pose.x,slots.get('d2'));assert.equal(by('vehicle-1').pose.x,10.5,'Dock innerhalb der Halle (y=11): Spalte des Docks');
 assert.equal(by('vehicle-2').dock,'d3');assert.equal(by('vehicle-2').pose.x,14.5);
 const foreign=dockPoseFor(L,s.buildings,'d1');assert.equal(foreign.x,2.5);
 for(const p of plans){const r=rect(p.pose,p.len);assert.ok(!hits(r,rect(foreign,FOREIGN_LEN)),`${p.v.id} überlappt Fremd-Lkw nicht`);assert.ok(!inQueue(L,r),`${p.v.id} nicht auf Wartefläche`);}
 for(let i=0;i<plans.length;i++)for(let j=i+1;j<plans.length;j++)assert.ok(!hits(rect(plans[i].pose,plans[i].len),rect(plans[j].pose,plans[j].len)),`${plans[i].v.id}/${plans[j].v.id} getrennt`);
 assert.equal(JSON.stringify(s),before,'Zustand unverändert');
});
test('W1b Stellplätze: nie vor einem Dock, Docks in gleicher Spalte getrennt, Überlauf im Fuhrpark statt Wartefläche',()=>{
 const L=yardLayout({width:20,height:16}),docks=[{id:'d1',type:'dock',x:1,y:13},{id:'d2',type:'dock',x:1,y:9},{id:'d3',type:'dock',x:9,y:13,rotation:90}];
 const slots=dockSlots(L,docks),xs=[...slots.values()];for(let i=1;i<xs.length;i++)assert.ok(Math.abs(xs[i]-xs[i-1])>=DOCK_GAP-1e-9,'Andockplätze getrennt');
 const free=freeBays(L,slots);assert.ok(free.every(x=>xs.every(d=>Math.abs(d-x)>=PARK_GAP)));
 const foreign=xs.map(x=>({x,z:L.bayZ+FOREIGN_LEN/2,heading:Math.PI/2}));
 const poses=[];for(let k=0;k<FLEET_PARK+free.length;k++){const p=parkPose(L,free,k,VEH_LEN.truck);poses.push(p);const r=rect(p,VEH_LEN.truck);assert.ok(!inQueue(L,r),'nicht auf Wartefläche');for(const f of foreign)assert.ok(!hits(r,rect(f,FOREIGN_LEN)),'nicht vor einem Dock');}
 for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)assert.ok(!hits(rect(poses[i],4.2),rect(poses[j],4.2)),'Stellplätze überlappen nicht');
 for(let k=0;k<6;k++){const q=rect(queuePlace(L,k),FOREIGN_LEN);for(const p of poses)assert.ok(!hits(q,rect(p,4.2)),'Warteplatz frei von eigener Flotte');}
});

// ---------- Welle 2b (A09): Staplerplatz, Stapler, Paletten (W2-S2), nur lesend ----------
import {forkliftCharge,chargeColor,forkliftLabel,forkliftTarget,forkliftPlans,forkliftPose,trailerPallets,palletLoads,FORK_MIN,FORK_CYCLE,PALLETS_PER_TRAILER,PALLET_LEVELS,MAX_PALLET_STACKS} from '../dist/scene3d.js';
import * as yardMod from '../dist/yard.js';
function forkFixture(){
 const s=fixture();s.yard=[];
 s.buildings.push({id:'d1',type:'dock',site:'a',x:2,y:13,rotation:0,enabled:true,condition:100,task:'arrival-1'},{id:'d2',type:'dock',site:'a',x:10,y:13,rotation:0,enabled:true,condition:100,task:'sh1'},
  {id:'r1',type:'rack',site:'a',x:2,y:5,rotation:0},{id:'r2',type:'rack',site:'a',x:10,y:5,rotation:0},
  {id:'f1',type:'forklift',site:'a',x:15,y:3,rotation:0,enabled:true,condition:100,charge:54,task:'arrival-1:forklift'},{id:'f2',type:'forklift',site:'a',x:17,y:3,rotation:0,enabled:true,condition:100,charge:8,task:null},{id:'f3',type:'forklift',site:'a',x:15,y:6,rotation:90,enabled:true,condition:100,task:'sh1:forklift'});
 s.yard.push({id:'arrival-1',site:'a',phase:'unloading',dock:'d1',item:'pallet',parcels:12,unloaded:4,carrier:'Talgrund Spedition',plate:'TGD-AB 100',phaseStart:600,phaseEnd:null,waitReason:null});
 s.shipments.push({id:'sh1',status:'loading'});
 return s;
}
test('W2b Akku: Anzeige 0–100 (fehlend 100), Farbe grün/gelb/rot ab 50/10 %, Label „Stapler · 54 %“',()=>{
 assert.equal(forkliftCharge({}),100);assert.equal(forkliftCharge({charge:54}),54);assert.equal(forkliftCharge({charge:140}),100);assert.equal(forkliftCharge({charge:-3}),0);
 assert.equal(forkliftLabel({charge:54}),'Stapler · 54 %');assert.equal(forkliftLabel({}),'Stapler · 100 %');assert.equal(forkliftLabel({charge:9.5}),'Stapler · 10 %');
 assert.equal(chargeColor(100),'#3cbb8e');assert.equal(chargeColor(50),'#3cbb8e');assert.equal(chargeColor(49.5),'#e4ab4b');assert.equal(chargeColor(FORK_MIN),'#e4ab4b');assert.equal(chargeColor(FORK_MIN-.5),'#cb675d');
});
test('W2b Staplerbindung: Fremd-Lkw-Dock (a.dock), eigenes Fahrzeug-Dock (b.task), sonst frei',()=>{
 const s=frozen(forkFixture()),by=id=>s.buildings.find(b=>b.id===id);
 const t1=forkliftTarget(s,by('f1'));assert.equal(t1.dock.id,'d1');assert.equal(t1.inbound,true);
 const t3=forkliftTarget(s,by('f3'));assert.equal(t3.dock.id,'d2');assert.equal(t3.inbound,false);
 assert.equal(forkliftTarget(s,by('f2')),null);assert.equal(forkliftTarget(s,{...by('f1'),task:'arrival-9:forklift'}),null,'unbekannter Vorgang → parkt');
 assert.equal(forkliftTarget(s,{...by('f1'),task:'arrival-1'}),null,'nur Staplerschlüssel');
});
test('W2b Stapler pendelt deterministisch zwischen Dock und nächstem Regal, ungebunden parkt er an der Ladesäule',()=>{
 const s=forkFixture(),before=JSON.stringify(s);frozen(s);
 const plans=forkliftPlans(s,'a'),by=id=>plans.find(p=>p.id===id);assert.equal(plans.length,3);
 const f1=by('f1'),f2=by('f2'),f3=by('f3');
 assert.equal(f1.dock,'d1');assert.equal(f1.rack,'r1','nächstes Regal zum Dock');assert.equal(f1.carry,'out');assert.equal(f3.dock,'d2');assert.equal(f3.rack,'r2');assert.equal(f3.carry,'in');
 assert.equal(f2.path,null);assert.equal(f2.dock,null);assert.equal(f2.ready,false,'unter 10 % nicht einsatzbereit');assert.equal(f2.color,'#cb675d');assert.equal(f1.color,'#3cbb8e');assert.equal(f1.label,'Stapler · 54 %');
 // Parkpose liegt im Staplerplatz (1×1), Ladesäule an der Rückseite.
 assert.ok(f2.park.x>17&&f2.park.x<18&&f2.park.z>3&&f2.park.z<4);assert.ok(f2.charger.z<f2.park.z);
 for(const c of [600,600.2,612.7])assert.deepEqual(forkliftPose(f2,c,{}),{x:f2.park.x,z:f2.park.z,heading:f2.park.heading,loaded:false},'ungebunden stationär');
 // Deterministisch aus der Uhr, periodisch, bewegt sich, bleibt in der Halle.
 const p=c=>forkliftPose(f1,c,{});assert.deepEqual(p(600.3),p(600.3));const a=p(600.3+FORK_CYCLE),b=p(600.3);assert.ok(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.z-b.z)<1e-9,'Periode FORK_CYCLE');
 const xs=new Set();for(let k=0;k<20;k++){const q=p(600+k*.05);xs.add(`${q.x.toFixed(2)},${q.z.toFixed(2)}`);assert.ok(q.x>0&&q.x<20&&q.z>0&&q.z<16,'in der Halle');}
 assert.ok(xs.size>5,'Pendelbewegung sichtbar');
 // Enden: Dockseite (Nordkante Dock d1) und Regalseite; Hinweg Dock→Regal beladen (entladen Fremd-Lkw), Rückweg leer.
 const at=(f,u)=>forkliftPose(f,((u-f.phase)%1+1)%1,{});
 const atDock=at(f1,.02),atRack=at(f1,.47);assert.ok(Math.abs(atDock.x-3.5)<1e-6&&Math.abs(atDock.z-(13-.45))<1e-6,JSON.stringify(atDock));assert.ok(Math.abs(atRack.x-3)<1e-6&&Math.abs(atRack.z-(6+.5))<1e-6,JSON.stringify(atRack));
 assert.equal(at(f1,.25).loaded,true);assert.equal(at(f1,.75).loaded,false);
 assert.equal(at(f3,.25).loaded,false);assert.equal(at(f3,.75).loaded,true,'Beladen eigenes Fahrzeug: Regal→Dock beladen');
 assert.equal(JSON.stringify(s),before,'Zustand unverändert');
});
test('W2b Paletten: Auflieger zeigt Restpaletten (nur item pallet), Lagerpaletten als Stapel an Regalen, gedeckelt; Kartons/Regale unberührt',()=>{
 assert.equal(trailerPallets({parcels:120,unloaded:0}),0,'Paketankunft ohne Paletten');assert.equal(trailerPallets({item:'pallet',parcels:12,unloaded:0}),PALLETS_PER_TRAILER);
 assert.equal(trailerPallets({item:'pallet',parcels:12,unloaded:6}),4);assert.equal(trailerPallets({item:'pallet',parcels:12,unloaded:11}),1);assert.equal(trailerPallets({item:'pallet',parcels:12,unloaded:12}),0);
 const L=yardLayout({width:20,height:16}),plan=arrivalPlan(L,arr('arrival-1','unloading',{item:'pallet',parcels:10,unloaded:5}),{});assert.equal(plan.pallet,true);assert.equal(plan.pallets,4);
 assert.equal(arrivalPlan(L,arr('arrival-2','queue'),{rank:0}).pallet,false);
 const s=forkFixture();s.batches.push({id:'p1',item:'pallet',site:'a',qty:7,location:'stock',owner:'order-1'},{id:'p2',item:'pallet',site:'b',qty:30,location:'stock'},{id:'k1',item:'parcel',site:'a',qty:40,location:'stock'});
 frozen(s);const l=palletLoads(s,'a');assert.equal(l.stock,7);assert.equal(l.places,Math.ceil(7/PALLET_LEVELS));assert.equal(l.pallets.length,7);
 assert.ok(l.pallets.every(p=>p.level<PALLET_LEVELS));assert.ok(l.pallets.every(p=>['r1','r2'].includes(p.anchor)));assert.ok(l.pallets.every(p=>p.z<5),'Nordseite des Regals (Kartons liegen südlich)');
 assert.equal(rackPallets(s,s.buildings.find(b=>b.id==='r1')).length,0,'Paletten füllen keine Materialregale');assert.equal(parcelLoads(s,'a').stock,40,'Kartons unverändert');
 const big=forkFixture();big.batches.push({id:'p1',item:'pallet',site:'a',qty:5000,location:'stock'});const lb=palletLoads(big,'a');assert.ok(lb.places<=MAX_PALLET_STACKS);assert.equal(lb.places,8,'2 Regale × 2 Plätze × 2 Reihen');assert.equal(lb.pallets.length,8*PALLET_LEVELS);
 const none=fixture();none.batches.push({id:'p1',item:'pallet',site:'a',qty:5,location:'stock'});assert.equal(palletLoads(none,'a').pallets.length,0,'ohne Anker keine Stapel');
});
test('W2b Echter Ablauf: Palettenankunft entlädt mit Stapler, Szene zeigt Pendelfahrt, Restladung, Lagerstapel; nach Laden gleich',()=>{
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;
 for(const [type,x,y] of [['dock',2,10],['rack',2,2],['rack',5,2],['forklift',12,2]])assert.equal(sim.command({type:'build',buildingType:type,x,y}).ok,true,type);
 assert.equal(sim.command({type:'hire',role:'warehouse'}).ok,true);
 const c=s.contracts[0];sim.command({type:'acceptContract',id:c.id});sim.command({type:'cancelContract',id:c.id});
 const oid=sim.api.id('order');s.orders.push({id:oid,kind:'logistics',source:'hub',lane:'lane-0',customer:'Gebiet 1 (Testversand)',item:'pallet',qty:8,price:40,due:s.t+600,quality:0,site:s.selectedSite,status:'active',delivered:0,paid:0});
 const a=yardMod.schedule(s,sim.api,{contractId:c.id,site:s.selectedSite,parcels:8,eta:s.t+20,orderIds:[oid]});assert.equal(a.item,'pallet');
 let i=0;while(!(a.phase==='unloading'&&a.unloaded>=2)&&i++<400)sim.step(1);
 const fork=s.buildings.find(b=>b.type==='forklift');assert.equal(fork.task,`${a.id}:forklift`,'Stapler gebunden');
 const site=s.selectedSite,L=yardLayout(s.sites.find(x=>x.id===site)),bs=s.buildings.filter(b=>b.site===site);
 const fp=forkliftPlans(s,site);assert.equal(fp.length,1);assert.equal(fp[0].dock,a.dock);assert.ok(fp[0].path,'Pendelweg');assert.match(fp[0].label,/^Stapler · \d+ %$/);
 const plan=arrivalPlan(L,a,{dock:dockPoseFor(L,bs,a.dock)});assert.equal(plan.pallet,true);assert.equal(plan.pallets,trailerPallets(a));assert.ok(plan.pallets>0&&plan.pallets<PALLETS_PER_TRAILER);
 const pl=palletLoads(s,site);assert.equal(pl.stock,a.unloaded,'entladene Paletten im Lager');assert.equal(pl.pallets.length,a.unloaded);
 const st=Simulation.fromJSON(sim.serialize()).state,fp2=forkliftPlans(st,site);
 assert.deepEqual(fp2.map(p=>[p.dock,p.label,p.carry]),fp.map(p=>[p.dock,p.label,p.carry]));assert.deepEqual(forkliftPose(fp2[0],st.t+.3,{}),forkliftPose(fp[0],s.t+.3,{}),'nach Laden gleiche Pose');
 assert.deepEqual(palletLoads(st,site).pallets,pl.pallets);
});
