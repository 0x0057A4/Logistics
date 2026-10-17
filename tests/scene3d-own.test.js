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

// ---------- W2c Leitstand-Design: Tageszeit, Rundgang, Verfolgen, Label-Stil ----------
import {THEMES,THEME_STOPS,THEME_MODES,themeAt,themeFor,mixHex,mixTheme,dayMinute,nightLights,tourStops,tourPose,angleDelta,followTarget,splitLabel,TOUR_TRAVEL,TOUR_DWELL,CHIP_CSS,CHIP_TONES} from '../dist/scene3d.js';
const lum=h=>{const n=parseInt(h.slice(1),16);return ((n>>16)&255)+((n>>8)&255)+(n&255);};
test('Tageszeit: Stützstellen treffen die Stimmungen exakt (Nacht, Morgen, Tag, Abend)',()=>{
 assert.deepEqual(THEME_MODES,['auto','day','night']);
 for(const [m,k] of THEME_STOPS){const th=themeAt(m);assert.equal(th.key,k,`${m}`);for(const f of ['sky','hemiSky','tint','sun'])assert.equal(th[f],THEMES[k][f],`${m} ${f}`);assert.equal(th.night,THEMES[k].night);}
 assert.equal(themeAt(12*60).night,0);assert.equal(themeAt(2*60).night,1);assert.equal(themeAt(12*60).name,'Tag');assert.equal(themeAt(23*60).name,'Nacht');
});
test('Tageszeit: Übergänge stetig und monoton (Morgen heller werdend, Abend dunkler), über Mitternacht und Folgetage gleich',()=>{
 let prev=themeAt(300);for(let m=301;m<=510;m++){const th=themeAt(m);assert.ok(th.night<=prev.night+1e-9,`Morgen ${m}`);assert.ok(Math.abs(th.hemiI-prev.hemiI)<.05,`Sprung ${m}`);prev=th;}
 prev=themeAt(1020);for(let m=1021;m<=1260;m++){const th=themeAt(m);assert.ok(th.night>=prev.night-1e-9,`Abend ${m}`);assert.ok(Math.abs(th.sunI-prev.sunI)<.05,`Sprung ${m}`);prev=th;}
 const mid=themeAt(450);assert.ok(mid.night>0&&mid.night<THEMES.morning.night);assert.ok(lum(mid.sky)>lum(THEMES.night.sky));
 assert.deepEqual(themeAt(1439.99).sky,themeAt(0).sky);assert.deepEqual(themeAt(1440*3+600),themeAt(600));assert.deepEqual(themeAt(-60),themeAt(1380));assert.equal(dayMinute(1500),60);
 assert.ok(lum(themeAt(12*60).sky)>lum(themeAt(20*60).sky)&&lum(themeAt(20*60).sky)>lum(themeAt(0).sky));
});
test('Tageszeit: feste Themen ignorieren die Uhr, Mischfunktionen exakt',()=>{
 assert.equal(themeFor('night',720).night,1);assert.equal(themeFor('day',0).night,0);assert.equal(themeFor('auto',0).night,1);assert.equal(themeFor('bogus',720).key,'day');
 assert.equal(mixHex('#000000','#ffffff',.5),'#808080');assert.equal(mixHex('#102030','#102030',.7),'#102030');
 assert.equal(mixTheme(THEMES.day,THEMES.night,0).sky,THEMES.day.sky);assert.equal(mixTheme(THEMES.day,THEMES.night,1).hemiI,THEMES.night.hemiI);
});
test('Nachtbeleuchtung: begrenzte Leuchten, Hofmasten mit Kegel, Hallenflächen innerhalb der Halle',()=>{
 const site={id:'a',width:20,height:16},L=yardLayout(site),l=nightLights(site,L,[2.5,6.5]);
 assert.ok(l.masts.length>=6&&l.masts.length<=10);assert.ok(l.pools.length<=60);assert.equal(l.pools.filter(p=>p.cone).length,l.masts.length);
 const hall=l.pools.filter(p=>p.y>.05);assert.equal(hall.length,20);assert.ok(hall.every(p=>p.x>0&&p.x<20&&p.z>0&&p.z<16));
 for(const m of l.masts)assert.ok(!(m.x>=0&&m.x<=20&&m.z>=0&&m.z<=16),'Mast nicht in der Halle');
 assert.ok(l.pools.some(p=>Math.abs(p.x-6.5)<1e-9&&p.z>16),'Wandleuchte je Dock');
});
test('Rundgang: Tor → Docks → Sortierung → Lager → Ausgang, fehlende Stationen entfallen, Ziele an der Station',()=>{
 const s=fixture();s.buildings=[{id:'d1',type:'dock',site:'a',x:2,y:13},{id:'d2',type:'dock',site:'a',x:8,y:13},{id:'so',type:'sorter',site:'a',x:8,y:8},{id:'r1',type:'rack',site:'a',x:2,y:5},{id:'x',type:'rack',site:'b',x:15,y:1}];
 const st=tourStops(s,'a'),L=yardLayout(s.sites[0]);
 assert.deepEqual(st.map(p=>p.key),['gate','docks','sorting','storage','exit']);assert.deepEqual(st.map(p=>p.label),['Tor','Docks','Sortierung','Lager','Ausgang']);
 for(const p of st)for(const k of ['tx','tz','dist','yaw'])assert.ok(Number.isFinite(p[k]),`${p.key}.${k}`);
 assert.ok(Math.abs(st[0].tx-L.exitX)<1e-9&&Math.abs(st[0].tz-(L.yardGateZ-1))<1e-9);
 const b0=buildingBox(s.buildings[0]),b1=buildingBox(s.buildings[1]);assert.ok(Math.abs(st[1].tx-(b0.x0+b0.x1+b1.x0+b1.x1)/4)<1e-9&&st[1].tz>16);
 const so=buildingBox(s.buildings[2]);assert.ok(Math.abs(st[2].tx-(so.x0+so.x1)/2)<1e-9&&Math.abs(st[2].tz-(so.z0+so.z1)/2)<1e-9);
 const rb=buildingBox(s.buildings[3]);assert.ok(Math.abs(st[3].tx-(rb.x0+rb.x1)/2)<1e-9,'nur Regale des Standorts');
 assert.ok(st[4].tz>L.laneZ&&st[4].tx<0);
 assert.deepEqual(tourStops(fixture(),'a').map(p=>p.key),['gate','docks','exit']);
 assert.ok(TOUR_TRAVEL>1&&TOUR_DWELL>1);
});
test('Rundgang: Fahrt sanft (Start/Ende ruhig), Drehung auf kürzestem Weg',()=>{
 const a={tx:0,tz:0,dist:20,yaw:3},b={tx:10,tz:4,dist:12,yaw:-3};
 assert.deepEqual(tourPose(a,b,0),{tx:0,tz:0,dist:20,yaw:3});const e=tourPose(a,b,1);assert.ok(Math.abs(e.tx-10)<1e-9&&Math.abs(e.dist-12)<1e-9);
 assert.ok(Math.abs(Math.sin(e.yaw)-Math.sin(-3))<1e-9&&Math.abs(Math.cos(e.yaw)-Math.cos(-3))<1e-9);
 assert.ok(Math.abs(angleDelta(3,-3)-(2*Math.PI-6))<1e-9,'über ±π statt Umweg');
 assert.ok(tourPose(a,b,.05).tx<10*.05,'langsamer Anlauf');assert.ok(Math.abs(tourPose(a,b,.5).tx-5)<1e-9);
 let last=-1;for(let u=0;u<=1;u+=.05){const x=tourPose(a,b,u).tx;assert.ok(x>=last-1e-12);last=x;}
});
test('Verfolgen: Ziel aus Fremd-Lkw (arrival-ID) oder eigenem Fahrzeug im Bild, sonst null',()=>{
 const fleet=[{v:{id:'vehicle-1'},x:3,z:20,shown:true},{v:{id:'vehicle-2'},x:9,z:20,shown:false}],yard=[{id:'arrival-4',x:-6,z:22}];
 assert.deepEqual(followTarget(fleet,yard,'arrival-4'),{x:-6,z:22,kind:'arrival'});assert.deepEqual(followTarget(fleet,yard,'vehicle-1'),{x:3,z:20,kind:'vehicle'});
 assert.equal(followTarget(fleet,yard,'vehicle-2'),null);assert.equal(followTarget(fleet,yard,'arrival-9'),null);assert.equal(followTarget(fleet,yard,null),null);
 yard[0].x=-2;assert.equal(followTarget(fleet,yard,'arrival-4').x,-2,'Ziel folgt der aktuellen Pose');
});
test('Label-Stil: Kennung/Status getrennt, Text unverändert; Farben über Tokens mit Rückfall, Nachtvariante',()=>{
 for(const t of ['LKW-1 · Beladen','TGD-KA 1237 · Entladen · Keine Lagerkraft am Standort','Stapler · 54 %','Fläche nicht verfügbar','']){const p=splitLabel(t);assert.equal(p.head+p.sep+p.rest,t);}
 assert.deepEqual(splitLabel('TGD-KA 1237 · Entladen · Kein Personal'),{head:'TGD-KA 1237',sep:' · ',rest:'Entladen · Kein Personal'});
 for(const tone of CHIP_TONES)assert.ok(CHIP_CSS.includes(`tone-${tone}`),tone);
 for(const v of ['--wait,','--move,','--good,','--bad,','--chip-bg,','--chip-bg-night,'])assert.ok(CHIP_CSS.includes(`var(${v}`),v);
 assert.ok(/\.scene3d-labels\.night \.scene3d-chip\{/.test(CHIP_CSS));assert.ok(!/var\(--[\w-]+\)/.test(CHIP_CSS.replace(/var\(--dot\)/g,'')),'jede Variable mit Rückfallwert');
});
test('W2c: Tageszeit/Rundgang/Nachtlicht lesen den Zustand nur',()=>{
 const s=frozen(fixture());assert.doesNotThrow(()=>{tourStops(s,'a');themeAt(s.t);nightLights(s.sites[0]);});
});

// ---------- Welle 3a: Linienverkehr (W3-S2) – Linien-Lkw am Standort und in der Netzansicht, nur lesend ----------
import * as S3 from '../dist/scene3d.js';
function lhFixture(status,extra={}){
 const s=fixture();s.buildings.push({id:'da',type:'dock',site:'a',x:9,y:13,rotation:0,enabled:true,condition:100,task:status==='loading'?'linehaul-1':null},{id:'db',type:'dock',site:'b',x:4,y:13,rotation:0,enabled:true,condition:100,task:status==='unloading'?'linehaul-1':null});
 s.vehicles.push({id:'vehicle-1',type:'truck',site:'a',status:'linehaul',linehaul:'linehaul-1'},{id:'vehicle-2',type:'van',site:'b',status:'idle'});
 s.lines=[{id:'line-1',from:'a',to:'b',departures:[600],vehicleId:'vehicle-1',cutoff:30,active:true,missed:0,wait:null,waitAt:null},{id:'line-2',from:'b',to:'a',departures:[900],vehicleId:null,cutoff:30,active:false,missed:0,wait:null,waitAt:null}];
 s.linehauls=[{id:'linehaul-1',lineId:'line-1',vehicleId:'vehicle-1',from:'a',to:'b',status,cargo:[],orders:[{orderId:'order-1',qty:40}],qty:40,pallet:false,remaining:10,duration:40,distance:48,departAt:600,dock:null,driver:null,worker:null,blocked:null,...extra}];
 return s;
}
test('W3a Linien-Lkw: Beladen am Dock des Starts, Entladen am Dock des Ziels (b.task = Fahrt-ID), Labels deutsch',()=>{
 for(const [status,site,dock,text] of [['loading','a','da','LKW-1 · Beladen Hauptlauf'],['unloading','b','db','LKW-1 · Entladen Hauptlauf']]){
  const s=lhFixture(status),before=JSON.stringify(s);frozen(s);const other=site==='a'?'b':'a';
  const at=s.buildings.filter(b=>b.site===site),L=yardLayout(s.sites[0]);
  const plan=S3.vehiclePlan(s,s.vehicles[0],site);assert.equal(plan.mode,'site');assert.equal(plan.kind,'linehaul');assert.equal(plan.tone,'dock');
  assert.equal(S3.vehiclePlan(s,s.vehicles[0],other).mode,'away',`${status}: am anderen Standort unsichtbar`);
  const p=fleetPlans(s,site,at,L).find(x=>x.v.id==='vehicle-1');assert.equal(p.dock,dock);assert.equal(p.pose.x,dockSlots(L,at).get(dock));
  assert.equal(S3.vehicleLabel(s,plan,s.vehicles[0]),text);assert.equal(JSON.stringify(s),before);
 }
 const w=lhFixture('loading',{blocked:'Keine Lagerkraft'}),pw=S3.vehiclePlan(w,w.vehicles[0],'a');assert.equal(pw.tone,'wait');assert.equal(S3.vehicleLabel(w,pw,w.vehicles[0]),'LKW-1 · Beladen Hauptlauf · Keine Lagerkraft');
});
test('W3a Linien-Lkw: Hauptlauf fährt am Start ab und am Ziel an, Rückfahrt umgekehrt; interpoliert mit gebrochener Uhr',()=>{
 const s=lhFixture('transit',{remaining:39,duration:40});frozen(s);const v=s.vehicles[0];
 const out=S3.vehiclePlan(s,v,'a'),inn=S3.vehiclePlan(s,v,'b');assert.equal(out.mode,'out');assert.equal(inn.mode,'in');
 assert.equal(S3.vehicleLabel(s,out,v),'LKW-1 · Hauptlauf → Lindenhain');
 const t0=vehicleT(out,v,600,600),t1=vehicleT(out,v,600.5,600);assert.ok(t0!=null&&t1>t0,`Abfahrt bewegt sich (${t0}→${t1})`);
 assert.equal(vehicleT(inn,v,600,600),null,'am Ziel erst gegen Ende des Hauptlaufs sichtbar');
 const r=lhFixture('returning',{remaining:2,duration:40});frozen(r);
 assert.equal(S3.vehiclePlan(r,r.vehicles[0],'b').mode,'out');const back=S3.vehiclePlan(r,r.vehicles[0],'a');assert.equal(back.mode,'in');
 assert.ok(vehicleT(back,r.vehicles[0],600,600)!=null,'Rückkehr am Start sichtbar');assert.equal(S3.vehicleLabel(r,back,r.vehicles[0]),'LKW-1 · Rückfahrt');
 const gone=lhFixture('transit');gone.linehauls[0].status='complete';assert.equal(S3.vehiclePlan(gone,gone.vehicles[0],'a').mode,'away','ohne laufende Fahrt keine Darstellung');
});
test('W3a Netz: Linien zwischen Pins mit Richtung, Gegenrichtung versetzt, aktiv/inaktiv gefärbt',()=>{
 const s=frozen(lhFixture('transit')),{pins}=networkLayout(s.sites),lines=S3.networkLines(s,pins);
 assert.equal(lines.length,2);const [ab,ba]=lines;assert.equal(ab.active,true);assert.equal(ba.active,false);
 const a=pins[0];assert.ok(Math.hypot(ab.x0-a.x,ab.z0-a.z)<Math.hypot(ab.x1-a.x,ab.z1-a.z),'A→B beginnt bei A');
 assert.ok(Math.hypot(ab.x0-ba.x1,ab.z0-ba.z1)>.9,'Gegenrichtung liegt daneben');
 const {pos,colr}=S3.networkLineMesh(lines);assert.equal(pos.length,colr.length);assert.equal(pos.length%9,0);
 const tone=h=>[1,3,5].map(i=>(parseInt(h.slice(i,i+2),16)/255).toFixed(3));
 assert.deepEqual(colr.slice(0,3).map(x=>x.toFixed(3)),tone(S3.NET_TONE.active));assert.deepEqual(colr.slice(-3).map(x=>x.toFixed(3)),tone(S3.NET_TONE.inactive));
 assert.equal(S3.networkLines({lines:[{id:'x',from:'a',to:'z'}]},pins).length,0,'unbekannter Standort entfällt');
});
test('W3a Netz: Fortschritt aus remaining/duration, Label „Linie A→B · 63 %“, Verfolgen per Fahrzeug-/Fahrt-ID',()=>{
 const s=frozen(lhFixture('transit',{remaining:15,duration:40})),lh=s.linehauls[0],v=s.vehicles[0];
 const p=S3.linehaulNetProgress(lh,v,600,600);assert.ok(Math.abs(p-.625)<1e-9);assert.ok(S3.linehaulNetProgress(lh,v,600.4,600)>p,'gebrochene Uhr');
 assert.equal(S3.linehaulNetLabel(s,lh,Math.round(p*100)),'Linie Morgenfeld→Lindenhain · 63 %');
 assert.equal(S3.linehaulNetProgress({...lh,status:'loading'},v,600,600),0);assert.equal(S3.linehaulNetProgress({...lh,status:'unloading'},v,600,600),1);
 assert.ok(Math.abs(S3.linehaulNetProgress({...lh,status:'returning'},v,600,600)-.375)<1e-9,'Rückfahrt läuft zurück');
 assert.equal(S3.linehaulNetLabel(s,{...lh,status:'returning'},63),'Linie Morgenfeld→Lindenhain · Rückfahrt 63 %');
 assert.equal(S3.linehaulNetLabel(s,{...lh,status:'loading',blocked:'Kein freies Dock'},0),'Linie Morgenfeld→Lindenhain · Beladen Hauptlauf · Kein freies Dock');
 const line={x0:0,z0:0,x1:10,z1:0};const q=S3.linePoint(line,.63);assert.ok(Math.abs(q.x-6.3)<1e-9&&q.z===0);
 const trips=[{id:'linehaul-1',vehicleId:'vehicle-1',x:3,z:4}];assert.deepEqual(S3.netFollowTarget(trips,'vehicle-1'),{x:3,z:4,kind:'linehaul'});assert.deepEqual(S3.netFollowTarget(trips,'linehaul-1'),{x:3,z:4,kind:'linehaul'});
 assert.equal(S3.netFollowTarget(trips,'vehicle-9'),null);assert.equal(S3.netFollowTarget(trips,null),null);
});
test('W3a Echter Ablauf: Linienfahrt durch alle Phasen, Szene zeigt Lkw am richtigen Dock bzw. auf der Zufahrt, Zustand unverändert',()=>{
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,ok=c=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
 const A='site-1',B=ok({type:'buySite',name:'Ziel-Hub Birkenau'}).id;
 for(const site of [A,B]){ok({type:'build',buildingType:'dock',site,x:2,y:10,rotation:0});ok({type:'build',buildingType:'rack',site,x:2,y:2,rotation:0});ok({type:'hire',role:'warehouse',site});ok({type:'hire',role:'driver',site});}
 const truck=ok({type:'buyVehicle',vehicleType:'truck',site:A}).id,k=s.contracts[0];ok({type:'acceptContract',id:k.id});ok({type:'cancelContract',id:k.id});
 k.unit='parcel';k.lanes=[{id:'lane-1',name:'Nahbezirk',distance:20,site:A},{id:'lane-2',name:'Fernbezirk',distance:25,site:B}];k.laneShare=[.5,.5];
 const oid=sim.api.id('order');s.orders.push({id:oid,kind:'logistics',source:'hub',contractId:k.id,lane:'lane-2',customer:'Fernbezirk (Testversand)',item:'parcel',qty:30,price:9,due:s.t+3000,quality:0,site:A,deliverySite:B,status:'active',delivered:0,paid:0});
 assert.ok(sim.api.inventory.add({item:'parcel',qty:30,site:A,owner:oid,location:'stock',quality:100,unitCost:0}));
 ok({type:'createLine',from:A,to:B,departures:[(s.t+60)%1440],vehicleId:truck});
 const seen=new Set(),dockOf=site=>s.buildings.find(b=>b.site===site&&b.type==='dock').id;
 for(let i=0;i<3000&&!(seen.has('returning')&&!S3.linehaulOf(s,s.vehicles.find(x=>x.id===truck)));i++){
  sim.step(1);const v=s.vehicles.find(x=>x.id===truck),lh=S3.linehaulOf(s,v);if(!lh)continue;
  const before=JSON.stringify(s.linehauls)+JSON.stringify(s.vehicles);
  for(const site of [A,B]){
   const L=yardLayout(s.sites.find(x=>x.id===site)),b=s.buildings.filter(x=>x.site===site),p=fleetPlans(s,site,b,L).find(x=>x.v.id===truck);
   const want=lh.status==='loading'?(site===A?'site':null):lh.status==='unloading'?(site===B?'site':null):lh.status==='transit'?(site===A?'out':'in'):(site===B?'out':'in');
   if(want===null){assert.equal(p,undefined,`${lh.status}: nicht an ${site}`);continue;}
   assert.equal(p.plan.mode,want,`${lh.status} an ${site}`);
   if(want==='site'&&lh.dock)assert.equal(p.dock,dockOf(site),`${lh.status}: am Dock von ${site}`);
  }
  assert.equal(JSON.stringify(s.linehauls)+JSON.stringify(s.vehicles),before,'Szene liest nur');seen.add(lh.status);
 }
 assert.deepEqual([...seen].sort(),['loading','returning','transit','unloading']);
});

// ---------- Welle 3b: Containerhof (W3b-S2) – Container im Hof, Chassis, Umfuhr zum Dock, nur lesend ----------
import * as CT from '../dist/containers.js';
function ctFixture(){
 const s=fixture();
 s.buildings.push({id:'cy',type:'containeryard',site:'a',x:12,y:6,rotation:0,enabled:true,condition:100,task:'a:containeryard'},{id:'d1',type:'dock',site:'a',x:2,y:13,rotation:0,enabled:true,condition:100,task:null},{id:'f1',type:'forklift',site:'a',x:9,y:9,rotation:0,enabled:true,condition:100,charge:80,task:null},{id:'r1',type:'rack',site:'a',x:2,y:6,rotation:0,enabled:true,condition:100});
 const C=(id,status,extra={})=>({id,site:'a',contractId:'contract-7',orderIds:[],content:'pallet',qty:20,unloaded:0,status,arrivedAt:status==='arriving'?null:500,freeUntil:status==='arriving'?null:1940,dock:null,split:[{owner:'order-1',target:20,done:0}],teu:2,freeMinutes:1440,demurrageMinutes:0,priority:false,waitReason:null,waitSince:null,statusAt:500,moveEnd:null,arrivalId:'arrival-1',emptyAt:null,pickupAt:null,pickupArrival:null,goneAt:null,...extra});
 s.containers=[C('container-1','yard'),C('container-2','yard',{arrivedAt:510}),C('container-3','empty',{arrivedAt:520,unloaded:20,emptyAt:590,pickupAt:760,demurrageMinutes:75})];
 s.yard=[];s.orders=[];
 return {s,C};
}
const A3b=(id,phase,extra={})=>({id,kind:'container',pickup:false,site:'a',contractId:'contract-7',orderIds:[],carrier:'Nordkai Containerdienst',plate:'KRM-CA 2210',parcels:20,containers:1,containerIds:['container-9'],phase,phaseStart:600,phaseEnd:phase==='queue'?null:602,eta:600,dock:null,waitReason:null,waitSince:null,unloaded:0,atRisk:false,forecast:null,gateAt:590,priority:false,split:[],...extra});
test('W3b Containerhof: Stellplätze erst Boden, dann 2. Ebene (max. 2 hoch), stabil, oberer rutscht nach; Belegung „3/4 Plätze“',()=>{
 const {s,C}=ctFixture();frozen(s);const before=JSON.stringify(s);
 assert.equal(S3.yardPlaces(),4,'8 TEU / 2 TEU je 40-Fuß-Container');
 const r=S3.containerYardSlots(s,'a');assert.equal(r.slots.length,4);
 const lv=id=>r.map.get(id);assert.deepEqual(['container-1','container-2','container-3'].map(id=>[lv(id).lane,lv(id).level]),[[0,0],[1,0],[0,1]]);
 assert.ok(r.slots.every(x=>x.level<S3.YARD_LEVELS));
 const p=S3.yardSlotPose(lv('container-3'));assert.ok(Math.abs(p.y-(S3.YARD_Y+S3.CONTAINER_H))<1e-9,'gestapelt auf Containerhöhe');
 const box=buildingBox(s.buildings[0]);assert.ok(p.x>box.x0&&p.x<box.x1&&p.z>box.z0&&p.z<box.z1,'Platz liegt im Containerhof');
 // container-1 fährt zum Dock: oberer Container (container-3) rutscht auf den Boden, container-2 bleibt.
 const s2=JSON.parse(JSON.stringify(s));s2.containers[0].status='toDock';s2.containers[0].dock='d1';s2.containers[0].moveEnd=603;
 const r2=S3.containerYardSlots(s2,'a',undefined,r.map);assert.equal(r2.map.get('container-2').key,r.map.get('container-2').key,'stabil');
 assert.deepEqual([r2.map.get('container-3').lane,r2.map.get('container-3').level],[0,0],'nie schwebend');assert.equal(r2.map.has('container-1'),false);
 // Fünfter Container ohne Platz (Kapazität), Belegung zählt toDock und angelieferte Container ab toYard.
 const s3=JSON.parse(JSON.stringify(s));s3.containers.push(C('container-4','yard',{arrivedAt:530}),C('container-5','pickup',{arrivedAt:540,unloaded:20,emptyAt:600,pickupAt:700,pickupArrival:'arrival-5'}));
 assert.equal(S3.containerYardSlots(s3,'a').map.size,4);
 assert.deepEqual(S3.containerYardUse(s,'a'),[{id:'cy',used:3,cap:4}]);assert.equal(S3.containerYardLabel(S3.containerYardUse(s,'a')[0]),'Containerhof · 3/4 Plätze');
 const s4=JSON.parse(JSON.stringify(s));s4.containers.push(C('container-9','arriving'));s4.yard.push(A3b('arrival-9','drop'));assert.equal(S3.containerYardUse(s4,'a')[0].used,4,'Chassis in drop belegt den Platz');
 s4.yard[0].phase='queue';assert.equal(S3.containerYardUse(s4,'a')[0].used,3,'in der Warteschlange noch nicht');
 assert.equal(S3.containerYardSlots(s,'b').map.size,0,'anderer Standort ohne Hof');
 assert.equal(JSON.stringify(s),before,'nur lesend');
});
test('W3b Container: Farbe je Vertrag, leer heller mit offener Tür, Lagergeld im Label',()=>{
 const {s}=ctFixture(),[c1,c2,c3]=s.containers;
 assert.equal(S3.containerColor(c1),S3.containerColor(c2),'gleicher Vertrag, gleiche Farbe');assert.ok(S3.CONTAINER_HEX.includes(S3.containerColor(c1)));
 assert.equal(S3.containerEmpty(c1),false);assert.equal(S3.containerEmpty(c3),true);assert.notEqual(S3.containerTint(c3),S3.containerTint(c1));
 const lum=h=>[1,3,5].reduce((n,i)=>n+parseInt(h.slice(i,i+2),16),0);assert.ok(lum(S3.containerTint(c3))>lum(S3.containerTint(c1)),'leer heller');
 assert.equal(S3.containerLabel(c1),'CTR-1 · Im Containerhof · 20 Paletten');
 assert.equal(S3.containerLabel(c3),'CTR-3 · Leer · wartet auf Abholung · Lagergeld 2 Std.');
 assert.equal(S3.containerLabel({...c1,status:'unstuffing',unloaded:5,dock:'d1'}),'CTR-1 · Entladen 5/20 Paletten');
 assert.equal(S3.containerLabel({...c1,content:'parcel',qty:600,waitReason:'Kein freies Dock'}),'CTR-1 · Im Containerhof · 600 Pakete · Kein freies Dock');
});
test('W3b Chassis: Phasen approach/gate/queue/toYard/drop/exit wie Fremd-Lkw, Halt am Containerhof, beladen bis Abstellen, Labels deutsch',()=>{
 const {s}=ctFixture(),L=yardLayout(s.sites[0]),yb=S3.yardBayPose(L,s.buildings[0]),box=buildingBox(s.buildings[0]);
 assert.ok(Math.abs(yb.x-(box.x0+box.x1)/2)<1e-9&&yb.heading===Math.PI/2,'Halt an der Andockreihe in Höhe des Hofs, Heck zur Halle');
 const g=gatePose(L),plan=(a,ctx={})=>arrivalPlan(L,a,{dock:yb,...ctx});
 const ap=plan(A3b('arrival-9','approach',{phaseStart:585,phaseEnd:600}));assert.equal(ap.container,true);assert.equal(ap.loaded,true);
 const e=arrivalPose(ap,600,{});assert.ok(Math.hypot(e.x-g.x,e.z-g.z)<1e-6,'Anfahrt endet am Tor');
 assert.equal(plan(A3b('arrival-9','queue',{waitReason:'Containerhof voll'}),{rank:0}).label,'KRM-CA 2210 · Wartet · Containerhof voll');
 const ty=plan(A3b('arrival-9','toYard'),{from:g});assert.equal(ty.label,'KRM-CA 2210 · Containerhof');assert.equal(ty.tone,'move');
 const a0=arrivalPose(ty,600,{}),a1=arrivalPose(ty,602,{}),mid=arrivalPose(ty,601,{});
 assert.ok(Math.hypot(a0.x-g.x,a0.z-g.z)<1e-6&&Math.hypot(a1.x-yb.x,a1.z-yb.z)<1e-6,'toYard: Tor → Containerhof');
 assert.ok(Math.abs(Math.sin(a1.heading)-1)<1e-6,'rückwärts eingesetzt (Heck zur Halle)');assert.ok(arrivalMoving(ty,601)&&!(mid.x===a0.x&&mid.z===a0.z));
 const fromQueue=plan(A3b('arrival-9','toYard'),{from:queuePlace(L,2)});const q1=arrivalPose(fromQueue,602,{});assert.ok(Math.hypot(q1.x-yb.x,q1.z-yb.z)<1e-6,'auch vom Warteplatz');
 const dr=plan(A3b('arrival-9','drop'));assert.equal(dr.label,'KRM-CA 2210 · Abstellen');assert.equal(dr.loaded,true);assert.ok(Math.hypot(dr.x-yb.x,dr.z-yb.z)<1e-6);assert.equal(arrivalMoving(dr,601),false);
 const ex=plan(A3b('arrival-9','exit',{phaseEnd:603,unloaded:20}));assert.equal(ex.loaded,false,'nach Abstellen leer');const x0=arrivalPose(ex,600,{});assert.ok(Math.hypot(x0.x-yb.x,x0.z-yb.z)<1e-6,'Ausfahrt ab Containerhof');
 assert.ok(arrivalPose(ex,603,{}).x<-40,'Ausfahrt zur Straße');
 const pk=A3b('arrival-5','toYard',{pickup:true,containerIds:['container-3'],parcels:1});assert.equal(plan(pk,{from:g}).loaded,false);assert.equal(plan(pk,{from:g}).label,'KRM-CA 2210 · Abholung · Containerhof');
 assert.equal(plan({...pk,phase:'drop'}).label,'KRM-CA 2210 · Abholung · Aufnehmen');const pe=plan({...pk,phase:'exit'});assert.equal(pe.loaded,true);assert.notEqual(pe.ccolor,plan(A3b('arrival-9','drop')).ccolor,'Leercontainer heller');
 assert.equal(plan(A3b('arrival-9','toYard',{containers:3,containerIds:['c1','c2','c3']}),{from:g}).label,'KRM-CA 2210 · Containerhof · 3 Container');
 assert.equal(arrivalPlan(L,A3b('arrival-9','gone')),null);assert.equal(arrivalPlan(L,{...A3b('x','toYard'),kind:undefined}),null,'Fremd-Lkw kennen toYard nicht');
});
test('W3b Umfuhr: Container fährt in MOVE Minuten vom Hof zum Dock (container.dock), steht beim Entladen am Dock; Stapler pendelt erst beim Entladen',()=>{
 const {s}=ctFixture(),L=yardLayout(s.sites[0]),b=s.buildings,yb=S3.yardBayPose(L,b[0]),dock=dockPoseFor(L,b,'d1');
 const st=JSON.parse(JSON.stringify(s));Object.assign(st.containers[0],{status:'toDock',dock:'d1',statusAt:600,moveEnd:603,demurrageMinutes:3});st.buildings[1].task='container-1';st.buildings[2].task='container-1:forklift';frozen(st);const before=JSON.stringify(st);
 const [p]=S3.dockContainerPlans(st,'a',st.buildings,L,()=>yb);assert.equal(p.id,'container-1');assert.equal(p.demurrage,true);assert.equal(p.label,'CTR-1 · Umfuhr zum Dock · Lagergeld 1 Std.');
 const m0=arrivalPose(p,600,{}),m1=arrivalPose(p,603,{});assert.ok(Math.hypot(m0.x-yb.x,m0.z-yb.z)<1e-6&&Math.hypot(m1.x-dock.x,m1.z-dock.z)<1e-6,'Hof → Dock');
 assert.equal(forkliftTarget(st,st.buildings[2]),null,'während der Umfuhr steht der Stapler');
 const su=JSON.parse(before);Object.assign(su.containers[0],{status:'unstuffing',moveEnd:null,unloaded:4});
 const [q]=S3.dockContainerPlans(su,'a',su.buildings,L,()=>yb);assert.equal(q.path,null);assert.ok(Math.hypot(q.x-dock.x,q.z-dock.z)<1e-6);assert.equal(q.label,'CTR-1 · Entladen 4/20 Paletten · Lagergeld 1 Std.');
 const t=forkliftTarget(su,su.buildings[2]);assert.equal(t.dock.id,'d1');assert.equal(t.inbound,true,'Ware Dock → Regal');
 const fp=forkliftPlans(su,'a').find(f=>f.id==='f1');assert.equal(fp.carry,'out');assert.ok(fp.path);
 assert.equal(S3.dockContainerPlans(s,'a',s.buildings,L).length,0,'Hofcontainer nicht am Dock');
 assert.equal(JSON.stringify(st),before);
});
test('W3b Echter Ablauf: Chassis → Containerhof → Umfuhr → Entladen → Abholung; Szene liest nur, Belegung = TEU/2, nie mehr als 2 hoch',()=>{
 const sim=new Simulation({mode:'sandbox'}),s=sim.state,ok=c=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
 ok({type:'build',buildingType:'dock',x:2,y:10});ok({type:'build',buildingType:'rack',x:2,y:2});ok({type:'build',buildingType:'rack',x:5,y:2});ok({type:'build',buildingType:'forklift',x:12,y:2});ok({type:'build',buildingType:'containeryard',x:12,y:8});ok({type:'hire',role:'warehouse'});
 const k=s.contracts[0];ok({type:'acceptContract',id:k.id});ok({type:'cancelContract',id:k.id});
 const site=s.selectedSite,oid=sim.api.id('order');s.orders.push({id:oid,kind:'logistics',source:'hub',lane:'lane-0',customer:'Gebiet 1 (Testversand)',item:'pallet',qty:20,price:40,due:3000,quality:0,site,status:'active',delivered:0,paid:0});
 const a=yardMod.schedule(s,sim.api,{kind:'container',contractId:k.id,site,eta:s.t+20,orderIds:[oid],containers:1,content:'pallet',parcels:20});assert.ok(a);
 const cid=a.containerIds[0],L=yardLayout(s.sites.find(x=>x.id===site)),seen=new Set();let prev=null;
 for(let i=0;i<900;i++){
  sim.step(1);const c=s.containers.find(x=>x.id===cid);if(!c)break;
  const before=JSON.stringify(s.containers)+JSON.stringify(s.yard)+JSON.stringify(s.buildings),b=s.buildings.filter(x=>x.site===site);
  const yb=S3.yardBayPose(L,b.find(x=>x.type==='containeryard'));
  const slots=S3.containerYardSlots(s,site,b,prev);prev=slots.map;assert.ok([...slots.map.values()].every(x=>x.level<2));
  assert.equal(S3.containerYardUse(s,site,b)[0].used,CT.teuUsed(s,site)/CT.TEU,'Belegung wie TEU-Logik');
  const ch=s.yard.find(y=>y.kind==='container'&&y.containerIds.includes(cid)&&y.phase!=='gone');
  if(ch&&['toYard','drop','exit'].includes(ch.phase)){const p=arrivalPlan(L,ch,{dock:yb,from:gatePose(L)});seen.add(`${ch.pickup?'P':'A'}:${ch.phase}`);
   if(ch.phase==='drop'){assert.ok(Math.hypot(p.x-yb.x,p.z-yb.z)<1e-6,'drop am Containerhof');assert.equal(p.loaded,!ch.pickup);}}
  if(['yard','empty','pickup'].includes(c.status))assert.ok(slots.map.has(cid),`${c.status}: im Hof sichtbar`);
  const d=S3.dockContainerPlans(s,site,b,L,()=>yb);
  if(['toDock','unstuffing'].includes(c.status)){assert.equal(d.length,1);assert.equal(d[0].dock,c.dock);seen.add(c.status);
   if(c.status==='unstuffing'){const dp=dockPoseFor(L,b,c.dock);assert.ok(Math.hypot(d[0].x-dp.x,d[0].z-dp.z)<1e-6,'am Dock');}}
  else assert.equal(d.length,0);
  assert.equal(JSON.stringify(s.containers)+JSON.stringify(s.yard)+JSON.stringify(s.buildings),before,'Szene liest nur');
  seen.add(c.status);if(c.status==='gone')break;
 }
 for(const k of ['A:toYard','A:drop','A:exit','toDock','unstuffing','empty','pickup','P:drop','gone'])assert.ok(seen.has(k),`${k} gesehen: ${[...seen]}`);
});

// ---------- Welle 3c: Luftexport (W3c-S1) – Flughafen-Zubringer am Standort, Frachtterminal im Netz, Startflugzeug, nur lesend ----------
import * as AX from '../dist/airexport.js';
function airFixture(status,extra={}){
 const s=fixture();s.buildings.push({id:'da',type:'dock',site:'a',x:9,y:13,rotation:0,enabled:true,condition:100,task:status==='loading'&&extra.dock!==null?'airshuttle-1':null});
 s.vehicles.push({id:'vehicle-1',type:'truck',site:'a',status:'airshuttle',airShuttle:'airshuttle-1'},{id:'vehicle-2',type:'van',site:'a',status:'idle'});
 s.contracts=[{id:'contract-1',unit:'air',status:'active',site:'a',flights:[1290,420],cutoff:90,shipper:'Testversand'}];
 s.airShuttles=[{id:'airshuttle-1',vehicleId:'vehicle-1',site:'a',flight:1290,status,orders:[{orderId:'order-1',qty:40,flightT:1290}],qty:40,cargo:[],remaining:10,duration:40,distance:48,cost:20,dock:status==='loading'?'da':null,driver:null,worker:null,blocked:null,...extra}];
 return s;
}
test('W3c Zubringer: Beladen am Dock (b.task = Zubringer-ID), Fahrt fährt Zufahrt ab, Rückfahrt an, Übergabe außer Sicht; Labels deutsch',()=>{
 const s=airFixture('loading'),before=JSON.stringify(s);frozen(s);const at=s.buildings.filter(b=>b.site==='a'),L=yardLayout(s.sites[0]),v=s.vehicles[0];
 const plan=S3.vehiclePlan(s,v,'a');assert.equal(plan.mode,'site');assert.equal(plan.kind,'airshuttle');assert.equal(plan.tone,'dock');
 assert.equal(S3.vehiclePlan(s,v,'b').mode,'away');
 const p=fleetPlans(s,'a',at,L).find(x=>x.v.id==='vehicle-1');assert.equal(p.dock,'da');assert.equal(p.pose.x,dockSlots(L,at).get('da'));
 assert.equal(S3.vehicleLabel(s,plan,v),'LKW-1 · Beladen Luftfracht');assert.equal(JSON.stringify(s),before);
 const w=frozen(airFixture('loading',{blocked:AX.WAIT.driver,dock:null})),pw=S3.vehiclePlan(w,w.vehicles[0],'a');
 assert.equal(pw.tone,'wait','Wartegrund gelb');assert.equal(S3.vehicleLabel(w,pw,w.vehicles[0]),'LKW-1 · Beladen Luftfracht · Kein Fahrpersonal');
 assert.equal(fleetPlans(w,'a',w.buildings,L).find(x=>x.v.id==='vehicle-1').dock,null,'wartet ohne Dock auf dem Stellplatz');
 const t=frozen(airFixture('transit',{remaining:39,duration:40})),out=S3.vehiclePlan(t,t.vehicles[0],'a');
 assert.equal(out.mode,'out');assert.equal(S3.vehicleLabel(t,out,t.vehicles[0]),'LKW-1 · Luftzubringer → Terminal');
 const t0=vehicleT(out,t.vehicles[0],600,600),t1=vehicleT(out,t.vehicles[0],600.5,600);assert.ok(t0!=null&&t1>t0,'Abfahrt bewegt sich mit gebrochener Uhr');
 const r=frozen(airFixture('returning',{remaining:2,duration:40})),back=S3.vehiclePlan(r,r.vehicles[0],'a');
 assert.equal(back.mode,'in');assert.ok(vehicleT(back,r.vehicles[0],600,600)!=null);assert.equal(S3.vehicleLabel(r,back,r.vehicles[0]),'LKW-1 · Rückfahrt');
 const h=frozen(airFixture('handover'));assert.equal(S3.vehiclePlan(h,h.vehicles[0],'a').mode,'away','Übergabe am Terminal');
 const done=airFixture('transit');done.airShuttles[0].status='complete';assert.equal(S3.airShuttleOf(done,done.vehicles[0]),null);assert.equal(S3.vehiclePlan(done,done.vehicles[0],'a').mode,'away');
});
test('W3c Netz: Terminal-Knoten aus AIRPORT, gestrichelte Verbindung nur bei laufendem Vertrag/Zubringer, Fortschritt und Label, Verfolgen',()=>{
 const s=frozen(airFixture('transit',{remaining:15,duration:40}));
 assert.equal(S3.airRelevant(s),true);
 const {pins,nodes,ext}=networkLayout(s.sites,undefined,[AX.AIRPORT]);assert.equal(nodes.length,1);assert.equal(nodes[0].id,'airport');
 assert.ok(Math.abs((nodes[0].x-pins[0].x)-AX.AIRPORT.x*.26)<1e-9&&Math.abs((nodes[0].z-pins[0].z)-AX.AIRPORT.y*.26)<1e-9,'gleicher Maßstab wie Standorte');
 assert.ok(ext>=Math.abs(nodes[0].z)+6);
 assert.deepEqual(networkLayout(s.sites).pins,networkLayout(fixture().sites).pins,'ohne Flughafen unverändert');assert.deepEqual(networkLayout(s.sites).nodes,[]);
 const links=S3.airLinks(s,pins,nodes[0]);assert.equal(links.length,1);assert.equal(links[0].site,'a');
 assert.ok(Math.hypot(links[0].x0-pins[0].x,links[0].z0-pins[0].z)<Math.hypot(links[0].x1-pins[0].x,links[0].z1-pins[0].z),'Hub → Terminal');
 const sh=s.airShuttles[0],v=s.vehicles[0],p=S3.airShuttleNetProgress(sh,v,600,600);assert.ok(Math.abs(p-.625)<1e-9);assert.ok(S3.airShuttleNetProgress(sh,v,600.4,600)>p);
 assert.equal(S3.airShuttleNetLabel(s,sh,63),'Luftzubringer Morgenfeld→Heidmoor · 63 %');
 assert.equal(S3.airShuttleNetProgress({...sh,status:'loading'},v,600,600),0);assert.equal(S3.airShuttleNetProgress({...sh,status:'handover'},v,600,600),1);
 assert.ok(Math.abs(S3.airShuttleNetProgress({...sh,status:'returning'},v,600,600)-.375)<1e-9);
 assert.equal(S3.airShuttleNetLabel(s,{...sh,status:'returning'},63),'Luftzubringer Morgenfeld→Heidmoor · Rückfahrt 63 %');
 assert.equal(S3.airShuttleNetLabel(s,{...sh,status:'loading',blocked:'Kein freies Dock'},0),'Luftzubringer Morgenfeld→Heidmoor · Beladen Luftfracht · Kein freies Dock');
 assert.equal(S3.airShuttleNetLabel(s,{...sh,status:'handover'},100),'Luftzubringer Morgenfeld→Heidmoor · Übergabe Terminal');
 const air=[{id:'airshuttle-1',vehicleId:'vehicle-1',x:2,z:5}];
 assert.deepEqual(S3.netFollowTarget([],'vehicle-1',air),{x:2,z:5,kind:'airshuttle'});assert.deepEqual(S3.netFollowTarget([],'airshuttle-1',air),{x:2,z:5,kind:'airshuttle'});
 assert.equal(S3.netFollowTarget([],'vehicle-9',air),null);
 // Ohne laufenden Luftvertrag und ohne Zubringer: kein Flughafen, keine Verbindung.
 const off=airFixture('transit');off.contracts[0].status='ended';off.airShuttles[0].status='complete';assert.equal(S3.airRelevant(off),false);assert.equal(S3.airLinks(off,pins,nodes[0]).length,0);
 const offer=airFixture('transit');offer.contracts[0].status='offer';offer.airShuttles=[];assert.equal(S3.airRelevant(offer),false,'Angebot zählt nicht');
});
test('W3c Startflugzeug: deterministisch aus Flugplan (steht vor Abflug, startet ab Abflug, danach weg)',()=>{
 const s=frozen(airFixture('transit'));assert.deepEqual(S3.airFlightMinutes(s),[420,1290]);
 assert.equal(S3.nextAirFlight(s,600),1290);assert.equal(S3.nextAirFlight(s,1300),1440+420);
 assert.equal(S3.airportLabel(s),'Frachtterminal Flughafen Heidmoor · Flug 21:30');
 const ms=[1290];assert.equal(S3.planePhase(ms,1200),null);
 const stand=S3.planePhase(ms,1260);assert.equal(stand.u,0);assert.equal(stand.moving,false);
 const a=S3.planePhase(ms,1290+4),b=S3.planePhase(ms,1290+12);assert.ok(a.moving&&b.u>a.u);
 const node={x:0,z:0},pa=S3.planePose(node,a,{}),pb=S3.planePose(node,b,{});assert.ok(pb.x>pa.x&&pb.y>=pa.y&&pb.y>0,'rollt an und steigt');
 assert.equal(S3.planePhase(ms,1290+S3.PLANE_CLIMB),null,'nach dem Start weg');
 assert.deepEqual(S3.planePhase(ms,1440*3+1290+4),{...a,flight:1440*3+1290},'jeden Tag gleich');
 assert.equal(S3.planePhase([10],1440*2-5).flight,1440*2+10,'Flug kurz nach Mitternacht steht schon am Vortag');
});
test('W3c Echter Ablauf: Zubringer durch alle Phasen, Szene zeigt Lkw am Dock bzw. auf der Zufahrt, Zustand unverändert',()=>{
 const sim=new Simulation({mode:'sandbox',seed:31}),s=sim.state,ok=c=>{const r=sim.command(c);assert.equal(r.ok,true,`${c.type}: ${r.message}`);return r;};
 ok({type:'build',buildingType:'dock',x:2,y:10,rotation:0});ok({type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 ok({type:'hire',role:'warehouse'});ok({type:'hire',role:'driver'});const truck=ok({type:'buyVehicle',vehicleType:'truck'}).id;
 for(let i=0;i<4000&&!s.contracts.some(k=>k.unit==='air');i++)sim.step(1);
 const k=s.contracts.find(k=>k.unit==='air');assert.ok(k,'Luftangebot');ok({type:'acceptContract',id:k.id});for(const w of s.workers)ok({type:'setShift',id:w.id,shift:'all'});
 const flightT=AX.nextFlight(k.flights,k.cutoff,s.t+120),oid=sim.api.id('order');
 s.orders.push({id:oid,kind:'logistics',source:'hub',contractId:k.id,lane:k.lanes[0].id,customer:'Luftfracht (Testversand)',item:'parcel',qty:20,price:k.pricePerParcel,due:flightT-k.cutoff,quality:0,site:'site-1',status:'active',delivered:0,paid:0,airExport:true,flightT});
 assert.ok(sim.api.inventory.add({item:'parcel',qty:20,site:'site-1',owner:oid,location:'stock',quality:100,unitCost:0}));
 const id=ok({type:'dispatchAirShuttle',vehicleId:truck,departAt:flightT}).id;assert.equal(S3.airRelevant(s),true);
 const seen=new Set(),dock=s.buildings.find(b=>b.type==='dock').id,L=yardLayout(s.sites[0]);
 for(let i=0;i<3000&&s.airShuttles.find(x=>x.id===id).status!=='complete';i++){
  sim.step(1);const v=s.vehicles.find(x=>x.id===truck),sh=S3.airShuttleOf(s,v);if(!sh)continue;
  const before=JSON.stringify(s.airShuttles)+JSON.stringify(s.vehicles)+JSON.stringify(s.buildings);
  const p=fleetPlans(s,'site-1',s.buildings.filter(b=>b.site==='site-1'),L).find(x=>x.v.id===truck);
  const want=sh.status==='loading'?'site':sh.status==='transit'?'out':sh.status==='returning'?'in':null;
  if(want===null)assert.equal(p,undefined,'Übergabe außer Sicht');else{assert.equal(p.plan.mode,want,sh.status);if(sh.dock)assert.equal(p.dock,dock,'am Dock');}
  const {pins,nodes}=networkLayout(s.sites,undefined,[AX.AIRPORT]);assert.equal(S3.airLinks(s,pins,nodes[0]).length,1);
  assert.equal(JSON.stringify(s.airShuttles)+JSON.stringify(s.vehicles)+JSON.stringify(s.buildings),before,'Szene liest nur');seen.add(sh.status);
 }
 assert.deepEqual([...seen].sort(),['handover','loading','returning','transit']);
});
