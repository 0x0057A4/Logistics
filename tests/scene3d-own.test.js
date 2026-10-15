/** Reine Logik der WebGL-Szene ohne DOM/WebGL. Kein Ersatz für die Browserprüfung tests/browser/scene3d.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cellToWorld,worldToCell,buildingBox,buildingTone,sceneSignature,yardLayout,slotPose,vehiclePath,pointOnPath,phaseDuration,phaseProgress,vehiclePlan,vehicleT,vehicleTag,rackPallets,workerSpots,selectLabels,adaptResolution,rayBox,rayGround,networkLayout,MAX_LABELS,FOREIGN_LEN,QUEUE_PLACES,QUEUE_DRIVE,PHASE_LABEL,queueOrder,queuePlace,gatePose,dockPoseFor,makePath,pathPose,approachPath,toDockPath,dockingPath,arrivalTone,arrivalLabel,carrierColor,arrivalPlan,arrivalPose,arrivalMoving,parcelLoads,PARCELS_PER_CAGE,PARCELS_PER_STACK,MAX_CAGES,MAX_STACKS} from '../dist/scene3d.js';
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
 const wait=slotPose(L,7);assert.ok(wait.x<0,'Überzählige Fahrzeuge auf Wartefläche');
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
