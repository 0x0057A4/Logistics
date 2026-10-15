import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../dist/core.js';
import {report} from '../dist/accounting.js';
import {lampGame, lampOffers, withManufacturing} from './fertigung-fixture.mjs';
const command=(s,c)=>assert.equal(s.command(c).ok,true);
test('Geldfluss trennt Kredit, Tilgung, Anlagekauf und Betrieb ohne Stats-Schätzung',()=>{
 const sim=new Simulation(),initial=sim.state.money;
 command(sim,{type:'takeLoan',amount:1000});command(sim,{type:'repayLoan',amount:200});
 command(sim,{type:'build',buildingType:'rack',x:10,y:6});command(sim,{type:'buy',item:'housing',qty:2});
 sim.state.stats.costs=999999;const r=report(sim.state);
 assert.equal(r.cash.openingBalance,initial);assert.equal(r.cashflow.financing,800);assert.equal(r.cashflow.investing,-1200);assert.equal(r.cashflow.operating,-36);assert.equal(r.inventory.prepaidPurchases,36);assert.equal(r.liabilities.loan,800);
 assert.equal(r.cash.net,Object.values(r.cashflow).reduce((n,v)=>n+v,0));
});
test('Forderungen trennen bezahlte, offene und fällige Lieferungen aller Transportwege',()=>{
 const s=new Simulation().state;s.t=100;
 s.shipments=[{id:'a',orderId:'o',deliveredAt:10,paymentAt:70,invoiceAmount:100,paid:false},{id:'pending',invoiceAmount:999,paymentAt:20},{id:'paid',deliveredAt:10,paymentAt:70,invoiceAmount:40,paid:true}];
 s.freights=[{id:'f',orderId:'o',deliveredAt:80,paymentAt:140,invoiceAmount:200},{id:'booked',deliveredAt:5,paymentAt:65,invoiceAmount:70}];
 s.tours=[{id:'t',stops:[{orderId:'o',deliveredAt:90,paymentAt:150,invoiceAmount:300}]}];
 s.ledger=[{key:'freight-payment:booked',category:'Umsatz',amount:70}];
 const r=report(s);assert.equal(r.receivables.total,600);assert.equal(r.receivables.overdue,100);assert.equal(r.receivables.rows.length,3);
});
test('Warenbewertung zählt Eigentum, Fertigung und Einkauf separat ohne Reservierungsduplikat',()=>{
 const s=new Simulation().state;
 s.batches=[{owner:'company',qty:4,unitCost:10,reserved:3,location:'vehicle'},{owner:'foreign',qty:9,unitCost:200},{owner:'company',qty:0,unitCost:900},{owner:'company',qty:2,unitCost:5,location:'quarantine',locked:true}];
 s.jobs=[{status:'storage',output:{qty:2},unitCost:12},{status:'maintenance',output:null}];
 s.purchases=[{status:'ordered',cost:30},{status:'receiving',cost:40},{status:'ordered',owner:'foreign',cost:99}];
 const r=report(s);assert.deepEqual(r.inventory,{ownValue:50,foreignQty:9,workInProgress:24,prepaidPurchases:30,blockedValue:10});
});
test('Sammelbuchungen nicht multiplizieren, Kontoüberziehung nicht doppelt als Ausgabe erfassen',()=>{
 const s=new Simulation().state;s.money=-20;s.loanBalance=100;
 s.ledger=[{category:'personal',amount:-20,entries:60},{category:'Unbekannt',amount:5}];
 s.freights=[{status:'waiting',storageDue:4},{status:'cancelled',storageDue:99}];
 const r=report(s);assert.equal(r.cash.outflows,20);assert.equal(r.cashflow.other,5);assert.deepEqual(r.liabilities,{loan:100,overdraft:20,terminalFees:4,total:124});
});
test('Auswertung bleibt rein und erhalten nach Speichern/Laden; reale Zahlung löst Forderung',()=>{
 let sim=lampGame();command(sim,{type:'build',buildingType:'dock',x:10,y:6});
 for(const role of ['warehouse','driver'])command(sim,{type:'hire',role});
 command(sim,{type:'buyVehicle',vehicleType:'van'});const o=lampOffers(sim)[0];command(sim,{type:'acceptOrder',id:o.id});
 sim.api.inventory.add({item:'lamp',qty:3,site:'site-1',location:'stock',quality:95,unitCost:50});
 command(sim,{type:'dispatch',orderId:o.id,vehicleId:sim.state.vehicles[0].id,qty:3});sim.step(40);
 const before=sim.serialize(),r=report(sim.state);assert.equal(r.receivables.total,330);assert.equal(sim.serialize(),before);
 sim=Simulation.fromJSON(before);assert.deepEqual(report(sim.state),r);sim.step(80);assert.equal(report(sim.state).receivables.total,0);
});
