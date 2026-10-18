// Wetter und Störungen (0.16 S1, A03/A07). Gerüst A01: rein lesende Exporte mit neutralen Werten.
// Zustand s.disruptions entsteht erst bei erster Wirkung (frühestens Spieltag 2), damit Altstände und
// Determinismus-Hashes unverändert bleiben. Eigener Zufall aus s.seed und Spieltag, nie api.random.
export function init() {}
export function handle() { return null; }
export function step() {}
export function validate() {}
/** Fahrtzeitfaktor ≥ 1 (Wetter × Stau) zum Zeitpunkt s.t. */
export function travelFactor() { return 1; }
/** Zusätzliche Minuten bis zur Ankunft fremder Lkw. */
export function arrivalDelay() { return 0; }
export function gateDown() { return false; }
export function gridDown() { return false; }
/** Aktive Wetterlage und Ereignisse eines Standorts für die Anzeige. */
export function active() { return []; }
