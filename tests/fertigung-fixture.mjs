// A01 W1c (Befund B5): Neue Spiele sind Logistikunternehmen und starten ohne Leuchten-Fertigungsangebote.
// Die drei Fertigungsanfragen (8/20/35 Leuchten) legt economy.step an, sobald eine Fertigungsanlage steht.
// Testaufbau über reguläre Befehle: Montageplatz bauen, eine Minute laufen lassen, dann Angebote verwenden.
import {Simulation} from '../dist/core.js';

const SPOTS = [[16, 12], [16, 0], [16, 6], [12, 12], [12, 0]];
export function withManufacturing(sim, site = sim.state.selectedSite) {
  if (!sim.state.buildings.some(b => b.type === 'assembly')) {
    const ok = SPOTS.some(([x, y]) => sim.command({type:'build', buildingType:'assembly', x, y, site, rotation:0}).ok);
    if (!ok) throw new Error('Montageplatz für Fertigungsanfragen nicht baubar');
  }
  sim.step(1);
  return sim;
}
/** Fertigungsanfragen in Anlagereihenfolge (früher orders[0..2]). */
export const lampOffers = sim => (sim.state ?? sim).orders.filter(o => o.kind === 'manufacturing');
export const lampGame = opts => withManufacturing(new Simulation(opts));
