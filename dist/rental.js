import {VEHICLES} from './catalog.js';

// Fiktive Spielpreise: je angefangene 1.440 Spielminuten, voraus bezahlt.
export const RENTAL_RATES=Object.freeze({van:180,truck:520,refrigerated:680});
const DAY=1440;
export function init(s){s.rentals??=[];}
const fail=message=>({ok:false,message});
function hasCargo(s,v){
 const trips=[...(s.shipments||[]),...(s.transfers||[]),...(s.returns||[]),...(s.tours||[])].filter(t=>t.vehicleId===v.id);
 const ids=new Set(trips.flatMap(t=>[...(t.cargo||[]),...(t.stops||[]).flatMap(stop=>stop.cargo||[])]));
 return (s.batches||[]).some(b=>b.qty>0&&b.location==='vehicle'&&(ids.has(b.id)||b.vehicleId===v.id));
}
export function handle(s,c,api){
 if(c.type==='rentVehicle'){
  const spec=VEHICLES[c.vehicleType],rate=RENTAL_RATES[c.vehicleType],site=c.site||s.selectedSite;
  if(!spec||!rate||!s.sites.some(x=>x.id===site))return fail('Fahrzeug oder Mietstandort ungültig.');
  if(s.money<rate)return fail('Kapital für ersten Miettag fehlt.');
  const id=api.id('rental'),vehicleId=api.id('vehicle');
  if(!api.book(`vehicle-rent:${id}:0`,-rate,'Miete',`${spec.name}: erster Miettag`,[id,vehicleId]))return fail('Mietbuchung fehlgeschlagen.');
  (s.rentals??=[]).push({id,vehicleId,homeSite:site,vehicleType:c.vehicleType,rate,startedAt:s.t,paidDays:1,nextDue:s.t+DAY,status:'active',returnedAt:null});
  s.vehicles.push({id:vehicleId,name:spec.name+' (Miete)',type:c.vehicleType,site,capacity:spec.capacity,condition:100,status:'idle',shipment:null,rentalId:id});
  api.log('rental',`${spec.name} gemietet: ${rate} € je angefangenem Spieltag.`,[id,vehicleId]);return {ok:true,id,vehicleId};
 }
 if(c.type==='returnRental'){
  const r=(s.rentals||[]).find(r=>r.id===c.id),v=s.vehicles.find(v=>v.id===r?.vehicleId);
  if(!r||r.status!=='active'||!v)return fail('Aktiver Mietvertrag fehlt.');
  if(v.status!=='idle'||v.site!==r.homeSite||v.shipment||v.tour||hasCargo(s,v))return fail('Rückgabe nur leer, frei und am Mietstandort möglich.');
  r.status='returned';r.returnedAt=s.t;v.status='rentalReturned';
  api.log('rental',`${v.name} zurückgegeben. Berechnete Miettage: ${r.paidDays}.`,[r.id,v.id]);return {ok:true};
 }
 return null;
}
export function step(s,api){
 for(const r of s.rentals||[]){
  if(r.status!=='active')continue;
  while(s.t>=r.nextDue){
   if(!api.book(`vehicle-rent:${r.id}:${r.paidDays}`,-r.rate,'Miete',`${VEHICLES[r.vehicleType].name}: Miettag ${r.paidDays+1}`,[r.id,r.vehicleId]))break;
   r.paidDays++;r.nextDue+=DAY;
  }
 }
}
export function validate(s){
 const bad=m=>{throw new Error('Spielstand ungültig: '+m);};
 if(s.rentals!==undefined&&(!Array.isArray(s.rentals)||s.rentals.length>100000))bad('Mietverträge beschädigt.');
 const contracts=new Map(),vehicles=new Set();
 for(const r of s.rentals||[]){
  const v=s.vehicles.find(v=>v.id===r.vehicleId);
  if(!/^rental-\d+$/.test(r.id)||contracts.has(r.id)||vehicles.has(r.vehicleId)||!v||v.rentalId!==r.id||v.type!==r.vehicleType||r.rate!==RENTAL_RATES[r.vehicleType]||!s.sites.some(a=>a.id===r.homeSite)||!Number.isSafeInteger(r.startedAt)||r.startedAt<480||r.startedAt>s.t||!Number.isSafeInteger(r.paidDays)||r.paidDays<1||r.nextDue!==r.startedAt+r.paidDays*DAY||!['active','returned'].includes(r.status))bad('Mietvertrag oder Fahrzeugzuordnung beschädigt.');
  if(r.status==='active'&&(r.returnedAt!==null||v.status==='rentalReturned'||r.nextDue<=s.t))bad('Aktive Mietdauer beschädigt.');
  if(r.status==='returned'&&(!Number.isSafeInteger(r.returnedAt)||r.returnedAt<r.startedAt||r.returnedAt>s.t||r.returnedAt>=r.nextDue||v.status!=='rentalReturned'||v.site!==r.homeSite||v.shipment||v.tour||hasCargo(s,v)))bad('Mietrückgabe beschädigt.');
  const entries=s.ledger.filter(l=>l.key.startsWith(`vehicle-rent:${r.id}:`));
  const paymentKeys=new Set(entries.map(l=>l.key));
  if(entries.length!==r.paidDays||entries.some(l=>l.amount!==-r.rate||l.category!=='Miete')||!Array.from({length:r.paidDays},(_,i)=>`vehicle-rent:${r.id}:${i}`).every(key=>paymentKeys.has(key)))bad('Mietzahlungen beschädigt.');
  contracts.set(r.id,r);vehicles.add(r.vehicleId);
 }
 for(const v of s.vehicles)if((v.rentalId&&contracts.get(v.rentalId)?.vehicleId!==v.id)||(v.status==='rentalReturned'&&!v.rentalId))bad('Mietfahrzeug ohne Vertrag.');
}
