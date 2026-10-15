import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {VEHICLES} from '../dist/catalog.js';
import {maxLoad,maintenanceCost,EXTERNAL_SERVICE} from '../dist/transport.js';
import {lampGame,lampOffers} from './fertigung-fixture.mjs';
import {boot} from './ui-harness.js';
const cmd=(s,c)=>{const r=s.command(c);assert.equal(r.ok,true,r.message);return r;};
const veh=type=>({type,capacity:VEHICLES[type].capacity});

// B7: Höchstmenge folgt derselben Regel wie die Simulation (Volumen, Gewicht, Kühlung).
test('maxLoad: Lieferwagen 160 Pakete (Gewicht), 20 Leuchten (Volumen), 16 Profilleuchten, kein Kühlgut',()=>{
 assert.equal(maxLoad(veh('van'),'parcel'),160);assert.equal(maxLoad(veh('van'),'lamp'),20);assert.equal(maxLoad(veh('van'),'lamp_pro'),16);
 assert.equal(maxLoad(veh('van'),'cold_module'),0);assert.equal(maxLoad(veh('refrigerated'),'cold_module'),50);assert.equal(maxLoad(veh('truck'),'parcel'),640);
 assert.equal(maxLoad(veh('van'),'unbekannt'),0);assert.equal(maxLoad({type:'x',capacity:20},'parcel'),0);
});
function parcelGame(){
 const s=lampGame();cmd(s,{type:'build',buildingType:'dock',x:10,y:6});for(const role of ['warehouse','driver'])cmd(s,{type:'hire',role});
 const v=cmd(s,{type:'buyVehicle',vehicleType:'van'}).id,o=lampOffers(s)[0];cmd(s,{type:'acceptOrder',id:o.id});
 Object.assign(o,{item:'parcel',qty:400,delivered:0,quality:0});s.api.inventory.add({item:'parcel',qty:400,site:'site-1',location:'stock',quality:95,unitCost:0});return {s,v,o};
}
test('Versand: Simulation nimmt genau maxLoad an, eins mehr wird abgelehnt',()=>{
 let {s,v,o}=parcelGame();assert.equal(s.command({type:'dispatch',orderId:o.id,vehicleId:v,qty:161}).ok,false);
 cmd(s,{type:'dispatch',orderId:o.id,vehicleId:v,qty:160});
});
test('Versandformular schlägt echte Fahrzeugkapazität vor und Fahrzeugliste zeigt Paketäquivalent',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 ui.run(`(()=>{const s=sim.state;sim.command({type:'buyVehicle',vehicleType:'van'});const o=s.orders.find(o=>o.status==='offer')||s.orders[0];o.status='active';o.item='parcel';o.qty=400;o.delivered=0;globalThis.po=o;})()`);
 const form=ui.run('dispatchForm(sim.state,po)');
 assert.match(form,/max="160" value="160"/);assert.match(form,/fasst 160 × Paket/);assert.match(form,/max\. 160/);assert.doesNotMatch(form,/Plätze/);
 ui.run("openPanel('fleet');renderPanel()");const fleet=ui.nodes.get('#panelBody').innerHTML;
 assert.match(fleet,/20 Volumeneinheiten · 80 kg · ≈ 160 Pakete/);assert.match(fleet,/Externe Wartung/);
 // Tourformular: Höchstmenge je Stopp aus Fahrzeug und Artikel.
 assert.equal(ui.run("tourStopMax(sim.state,{vehicleId:sim.state.vehicles.find(v=>v.status==='idle').id,order1:po.id},1)"),160);
});

// B6: rechtzeitige Warnung und externe Wartung ohne Werkstatt.
test('Externe Wartung: teurer, 120 Min. außer Betrieb, ohne Werkstatt/Ersatzteil, speicherfest',()=>{
 let s=lampGame();const id=cmd(s,{type:'buyVehicle',vehicleType:'van'}).id,v=()=>s.state.vehicles.find(x=>x.id===id);
 v().condition=30;assert.equal(s.command({type:'maintainVehicle',id}).ok,false,'Werkstatt fehlt: interner Weg bleibt gesperrt');
 const money=s.state.money,cost=maintenanceCost(v(),true);assert.equal(cost,840);assert.equal(cost,Math.ceil(maintenanceCost(v())*EXTERNAL_SERVICE.factor));
 cmd(s,{type:'serviceVehicleExternal',id});assert.equal(s.state.money,Math.round((money-cost)*100)/100);assert.equal(v().status,'maintenance');
 assert.equal(s.command({type:'serviceVehicleExternal',id}).ok,false,'nicht doppelt beauftragbar');
 s.step(60);s=Simulation.fromJSON(s.serialize());assert.equal(v().status,'maintenance');assert.equal(v().maintenance.remaining,60);
 s.step(59);assert.equal(v().status,'maintenance');s.step(1);assert.equal(v().status,'idle');assert.equal(v().condition,100);assert.equal(v().maintenance,null);
 assert.equal(s.state.ledger.filter(l=>l.key.startsWith('vehicle-service-external:')).length,1);
 assert.equal(s.command({type:'serviceVehicleExternal',id}).ok,false,'Zustand 100 braucht keine Wartung');
});
test('Externe Wartung: Geldmangel bucht nichts, beschädigte Wartungsdaten werden beim Laden abgelehnt',()=>{
 const s=lampGame();const id=cmd(s,{type:'buyVehicle',vehicleType:'van'}).id,v=s.state.vehicles.find(x=>x.id===id);v.condition=20;
 const money=s.state.money;s.state.money=10;assert.equal(s.command({type:'serviceVehicleExternal',id}).ok,false);assert.equal(v.status,'idle');assert.equal(s.state.money,10);
 s.state.money=money;cmd(s,{type:'serviceVehicleExternal',id});const bad=JSON.parse(s.serialize());bad.vehicles.find(x=>x.id===id).maintenance.remaining=-5;
 assert.throws(()=>Simulation.fromJSON(JSON.stringify(bad)));
});
test('Glocke warnt ab Zustand unter 35 mit Werkstatt- und externem Weg, unter 15 als Fehler',async()=>{
 const ui=await boot();await ui.click('start');ui.click('starter');
 ui.run("sim.command({type:'buyVehicle',vehicleType:'van'});globalThis.vv=sim.state.vehicles.at(-1);vv.condition=34");
 let a=JSON.parse(ui.run('JSON.stringify(collectHud(sim.state).alerts.filter(a=>a.ref===vv.id))'));
 assert.equal(a.length,1);assert.equal(a[0].tone,'wait');assert.match(a[0].title,/Wartung planen/);assert.match(a[0].sub,/Werkstatt \+ Ersatzteil/);assert.match(a[0].sub,/externe Wartung/);
 ui.run('vv.condition=35');assert.equal(ui.run('collectHud(sim.state).alerts.filter(a=>a.ref===vv.id).length'),0);
 ui.run('vv.condition=10');a=JSON.parse(ui.run('JSON.stringify(collectHud(sim.state).alerts.filter(a=>a.ref===vv.id))'));assert.equal(a.length,1);assert.equal(a[0].tone,'bad');
 const akte=ui.run('vehicleDetail(sim.state,vv)');assert.match(akte,/data-action="vehicleServiceExternal"/);assert.match(akte,/120 Min\./);assert.match(akte,/≈ 160/);
});
