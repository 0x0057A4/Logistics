import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateState} from '../dist/core.js';
import * as rental from '../dist/rental.js';
import {report} from '../dist/accounting.js';
import {lampGame, lampOffers, withManufacturing} from './fertigung-fixture.mjs';
const rent=(sim,vehicleType='van')=>sim.command({type:'rentVehicle',vehicleType});

test('Mietfahrzeuge kosten ersten Tag einmal und sind normale Fahrzeugkapazität',()=>{
 const sim=new Simulation(),s=sim.state,before=s.money,r=rent(sim);assert.equal(r.ok,true);
 assert.equal(s.money,before-rental.RENTAL_RATES.van);assert.equal(s.vehicles[0].capacity,20);assert.equal(s.vehicles[0].status,'idle');
 rental.step(s,sim.api);rental.step(s,sim.api);assert.equal(s.ledger.filter(l=>l.category==='Miete').length,1);
 assert.equal(report(s).cashflow.operating,-180);validateState(s);
});

test('Ungültige Miete und fehlendes Geld erzeugen weder Vertrag noch Fahrzeug',()=>{
 const sim=new Simulation(),s=sim.state;s.money=0;const before=sim.serialize();
 assert.equal(rent(sim).ok,false);assert.equal(rent(sim,'bad').ok,false);assert.equal(sim.command({type:'rentVehicle',vehicleType:'van',site:'missing'}).ok,false);assert.equal(sim.serialize(),before);
});

test('Mietverlängerung erfolgt nach 1.440 Spielminuten; auch ohne Liquidität',()=>{
 const sim=new Simulation(),s=sim.state;rent(sim);s.money=0;sim.step(1439);
 assert.equal(s.rentals[0].paidDays,1);const before=s.money;sim.step();assert.equal(s.rentals[0].paidDays,2);
 assert.equal(s.ledger.filter(l=>l.key.startsWith('vehicle-rent:')).reduce((n,l)=>n+l.amount,0),-360);
 assert.ok(s.money<=before-180);assert.equal(rent(sim).ok,false);assert.ok(report(s).liabilities.overdraft>=180);validateState(s);
});

test('Rückgabe beendet Gebühren, bleibt historisch erhalten und sperrt neue Aufträge',()=>{
 const sim=lampGame(),s=sim.state,r=rent(sim),o=lampOffers(sim)[0];sim.command({type:'acceptOrder',id:o.id});
 assert.equal(sim.command({type:'returnRental',id:r.id}).ok,true);assert.equal(sim.command({type:'returnRental',id:r.id}).ok,false);
 assert.equal(s.vehicles[0].status,'rentalReturned');assert.equal(sim.command({type:'dispatch',vehicleId:r.vehicleId,orderId:o.id,qty:1}).ok,false);
 sim.step(2880);assert.equal(s.rentals[0].paidDays,1);validateState(s);assert.equal(Simulation.fromJSON(sim.serialize()).serialize(),sim.serialize());
});

test('Rückgabe verlangt idle, Heimatstandort und vollständig entladenes Fahrzeug',()=>{
 const sim=new Simulation(),s=sim.state,r=rent(sim),v=s.vehicles[0];v.status='loading';assert.equal(sim.command({type:'returnRental',id:r.id}).ok,false);v.status='idle';v.site='other';assert.equal(sim.command({type:'returnRental',id:r.id}).ok,false);v.site=s.selectedSite;
 v.shipment='trip';assert.equal(sim.command({type:'returnRental',id:r.id}).ok,false);v.shipment=null;
 const b=sim.api.inventory.add({item:'lamp',qty:1,site:s.selectedSite,location:'vehicle'});s.shipments.push({id:'history',vehicleId:v.id,cargo:[b.id]});
 assert.equal(sim.command({type:'returnRental',id:r.id}).ok,false);sim.api.inventory.move(b.id,'stock');assert.equal(sim.command({type:'returnRental',id:r.id}).ok,true);
});

test('Laufende Mietlieferung speichert deterministisch und Rückgabe erhält Lieferhistorie',()=>{
 const sim=new Simulation({mode:'sandbox'}),s=sim.state;
 for(const c of [{type:'build',buildingType:'dock',x:2,y:10},{type:'hire',role:'driver'},{type:'hire',role:'warehouse'}])assert.equal(sim.command(c).ok,true);
 withManufacturing(sim);const r=rent(sim),o=lampOffers(sim)[0];assert.equal(sim.command({type:'acceptOrder',id:o.id}).ok,true);sim.api.inventory.add({item:'lamp',qty:2,quality:95,site:s.selectedSite});
 assert.equal(sim.command({type:'dispatch',vehicleId:r.vehicleId,orderId:o.id,qty:2}).ok,true);sim.step(10);assert.equal(sim.command({type:'returnRental',id:r.id}).ok,false);
 const loaded=Simulation.fromJSON(sim.serialize());sim.step(100);loaded.step(100);assert.equal(loaded.serialize(),sim.serialize());assert.equal(s.shipments[0].status,'complete');
 assert.equal(sim.command({type:'returnRental',id:r.id}).ok,true);validateState(s);assert.equal(Simulation.fromJSON(sim.serialize()).serialize(),sim.serialize());
});

test('Laden alter Stände braucht keine Miete; neue Stände behalten Abrechnungsgrenze',()=>{
 const legacy=new Simulation();delete legacy.state.rentals;const old=legacy.serialize();assert.equal(Simulation.fromJSON(old).serialize(),old);
 const sim=new Simulation();rent(sim,'refrigerated');sim.step(1430);const clone=Simulation.fromJSON(sim.serialize());sim.step(20);clone.step(20);assert.equal(clone.serialize(),sim.serialize());
});

test('Import verweigert beschädigte Mietdauer, Preise, Buchungen und Rückgaben',()=>{
 const sim=new Simulation(),r=rent(sim);const source=sim.serialize();
 for(const mutate of [s=>s.rentals[0].rate=1,s=>s.rentals[0].nextDue++,s=>s.rentals[0].paidDays++,s=>s.rentals[0].vehicleId='missing',s=>s.vehicles[0].status='rentalReturned',s=>s.ledger.splice(0,1),s=>s.rentals.push({...s.rentals[0]}),s=>s.rentals[0].id='vehicle-999999']){
  const s=JSON.parse(source);mutate(s);assert.throws(()=>Simulation.fromJSON(JSON.stringify(s)));
 }
 assert.equal(sim.command({type:'returnRental',id:r.id}).ok,true);const returned=JSON.parse(sim.serialize());returned.vehicles[0].status='idle';assert.throws(()=>Simulation.fromJSON(JSON.stringify(returned)));
});
