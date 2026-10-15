// Probe-Zustand Hub-Kreislauf (A10, Welle 1a) für UI-Prüfungen und Bildschirmfoto.
// Echte Befehle und Fachmodule: Bau, Personal, Startangebot annehmen (contracts.js), Lkw-Ablauf (yard.js).
// ERSATZDATEN, solange sorting.js ein Gerüst ist: versandfähige Pakete (stock) und optional der Sortierzähler
// s.stats.sortedDay/sorted werden direkt gesetzt; Dock 2 trägt eine Platzhalter-Belegung „eigene Ladung“.
export function hubProbe(Simulation,{blockDocks=false,sortedCounter=false,minutes=null}={}){
 const sim=new Simulation({mode:'sandbox',seed:7}),s=sim.state,api=sim.api;
 const cmd=c=>{const r=sim.command(c);if(!r.ok)throw Error(c.type+': '+r.message);return r.id;};
 const docks=[[3,11],[7,11]].map(([x,y])=>cmd({type:'build',buildingType:'dock',x,y,rotation:0}));
 const sorter=cmd({type:'build',buildingType:'sorter',x:5,y:6,rotation:0});
 cmd({type:'build',buildingType:'rack',x:2,y:2,rotation:0});
 for(const role of ['warehouse','warehouse','driver'])cmd({type:'hire',role});
 cmd({type:'buyVehicle',vehicleType:'van'});
 const contract=s.contracts.find(c=>c.status==='offer');cmd({type:'acceptContract',id:contract.id});
 const dock=id=>s.buildings.find(b=>b.id===id);
 dock(docks[1]).task='shipment-probe';
 if(blockDocks)dock(docks[0]).task='shipment-probe-2';
 const first=contract.arrivals[0].minute;let guard=0;
 const target=minutes??(blockDocks?first+30:null);
 if(target!=null){while(s.t<target&&guard++<3000)sim.step(1);}
 else while(!s.yard.some(a=>a.phase==='unloading'&&a.unloaded>0)&&guard++<3000)sim.step(1);
 const a=s.yard[0],orders=s.orders.filter(o=>o.contractId===contract.id);
 if(!blockDocks&&orders[0])api.inventory.add({item:'parcel',qty:6,site:'site-1',location:'stock',owner:orders[0].id,quality:100,unitCost:0});
 if(sortedCounter){s.stats.sorted=6;s.stats.sortedDay={day:Math.floor(s.t/1440),qty:6};}
 return {sim,ids:{docks,sorter,contract:contract.id,arrival:a?.id,orders:orders.map(o=>o.id)}};
}
