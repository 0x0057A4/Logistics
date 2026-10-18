// Probe-Zustand 0.15 Modelle (A09): Mega-Hub mit Quergurtsorter, Kühllager, Regalen, Staplerplatz und Fremd-Lkw mit
// Paketen, Kühlpaketen und Sperrgut. Echte Befehle und Fachmodule (Forschung, Bau, Personal, yard.schedule, Sortierung,
// Entladung). FIXTURE: Startvertrag storniert, Standortenergie auf 80 gesetzt (wie tests/megahub-own.test.js), Aufträge
// ohne Vertrag mit Warenart direkt angelegt (wie tests/ware-own.test.js). Für Node-Tests und Browserprüfung.
import * as yard from '../dist/yard.js';

export function modelsProbe(Simulation, { minutes = 140, seed = 11 } = {}) {
  const sim = new Simulation({ mode: 'sandbox', seed }), s = sim.state;
  s.sites[0].energy = 80;
  const cmd = c => { const r = sim.command(c); if (!r.ok) throw Error(`${c.type}: ${r.message}`); return r.id; };
  const docks = [[1, 12], [5, 12], [9, 12]].map(([x, y]) => cmd({ type: 'build', buildingType: 'dock', x, y, rotation: 0 }));
  cmd({ type: 'build', buildingType: 'research', x: 16, y: 12, rotation: 0 });
  for (const [x, y] of [[1, 2], [5, 2]]) cmd({ type: 'build', buildingType: 'rack', x, y, rotation: 0 });
  const coldstore = cmd({ type: 'build', buildingType: 'coldstore', x: 13, y: 2, rotation: 0 }); cmd({ type: 'build', buildingType: 'coldstore', x: 16, y: 6, rotation: 0 });
  cmd({ type: 'build', buildingType: 'forklift', x: 9, y: 2, rotation: 0 });
  cmd({ type: 'hire', role: 'research' });
  cmd({ type: 'cancelContract', id: s.contracts[0].id });
  cmd({ type: 'startResearch', key: 'megahub' });
  for (let i = 0; i < 400 && !s.research.some(r => r.key === 'megahub' && r.status === 'completed'); i++) sim.step(1);
  const crossbelt = cmd({ type: 'build', buildingType: 'crossbelt', x: 5, y: 6, rotation: 0 });
  for (let i = 0; i < 6; i++) { const id = cmd({ type: 'hire', role: 'warehouse' }); cmd({ type: 'setShift', id, shift: 'all' }); }
  const arrive = (qtys, item, eta) => {
    const ids = qtys.map((q, i) => { const id = sim.api.id('order'); s.orders.push({ id, kind: 'logistics', source: 'hub', lane: `lane-${i}`, customer: `Gebiet ${i + 1} (Probeversand)`, item, qty: q, price: 20, due: eta + 900, quality: 0, site: s.selectedSite, status: 'active', delivered: 0, paid: 0 }); return id; });
    return yard.schedule(s, sim.api, { contractId: 'vertrag-probe', site: s.selectedSite, parcels: qtys.reduce((n, q) => n + q, 0), eta, orderIds: ids });
  };
  // Früh: Pakete, Kühlpakete, Sperrgut (eingelagert). Spät: großer Paketzulauf (Quergurt in Betrieb), Kühlpakete warten inbound, Kühl- und Sperrgut-Lkw im Hof.
  const t = s.t, end = t + minutes, arrivals = [arrive([300, 300], 'parcel', t + 15), arrive([30, 30], 'parcel_cold', t + 20), arrive([10, 10], 'bulky', t + 25),
    arrive([500, 500], 'parcel', end - 30), arrive([30, 30], 'parcel_cold', end - 28), arrive([40, 40], 'parcel_cold', end - 6), arrive([8, 8], 'bulky', end - 4)];
  sim.step(minutes);
  // FIXTURE: Kühlpakete warten inbound (der Quergurt sortiert sie sonst sofort); echte Buchung über inventory.add, danach kein weiterer Schritt.
  const coldOrder = s.orders.find(o => o.item === 'parcel_cold' && o.status === 'active');
  if (coldOrder) sim.api.inventory.add({ item: 'parcel_cold', qty: 50, site: s.selectedSite, location: 'inbound', owner: coldOrder.id, quality: 100, unitCost: 0 });
  return { sim, ids: { docks, coldstore, crossbelt, arrivals: arrivals.map(a => a?.id) } };
}
