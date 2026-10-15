// Erzeugt einen großen, gültigen Spielstand (8 Standorte, 3 Spieltage, aufgefüllte Chronik) für Mess-Szenarien.
import {Simulation} from '../../dist/core.js';

const cmd=(s,type,data={})=>{const r=s.command({type,...data});if(!r.ok)throw Error(type+': '+r.message);return r;};
export function bigState(targetMB=5){
 const s=new Simulation({mode:'sandbox',seed:77});
 for(let i=1;i<8;i++)cmd(s,'buySite',{name:'Prüfwerk '+i});
 for(const site of s.state.sites){
  for(const [buildingType,x,y]of[['rack',2,2],['assembly',5,2],['testing',9,2],['packing',13,2],['dock',2,11]])cmd(s,'build',{buildingType,site:site.id,x,y,rotation:0});
  for(const role of ['production','production','production','warehouse','driver'])cmd(s,'hire',{role,site:site.id});
  cmd(s,'buyVehicle',{vehicleType:'van',site:site.id});
  for(const item of ['housing','board','carton'])cmd(s,'buy',{item,qty:40,supplier:'standard',site:site.id});
 }
 for(const o of s.state.orders.filter(o=>o.kind!=='logistics'))cmd(s,'acceptOrder',{id:o.id});
 s.step(1440*3);
 // Auffüllen mit gültigen Chronikeinträgen bis zur Zielgröße (realistische Feldform, eindeutige IDs).
 const st=s.state;let size=s.serialize().length;
 while(size<targetMB*1e6&&st.events.length<99000){
  const e={id:'event-'+(st.seq++),t:st.t,kind:'system',text:'Lieferung an Kunde '+(st.seq%997)+' abgeschlossen. Restmenge geprüft und verbucht.',refs:['order-'+(st.seq%300),'vehicle-'+(st.seq%40)]};
  st.events.push(e);size+=JSON.stringify(e).length+1;
 }
 return s;
}
