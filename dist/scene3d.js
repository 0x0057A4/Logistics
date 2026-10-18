import * as THREE from './vendor/three.module.min.js';
import { BUILDINGS, VEHICLES } from './catalog.js';
import { footprint, reachable } from './world.js';
import { Scene, vehicleActivity, vehicleAtSite, coldWarnings } from './scene.js';
import { AIRPORT } from './airexport.js';

// WebGL-Leitstand (S1). Liest nur den Spielzustand; Interpolation ändert ausschließlich Darstellung.
// Weltmaß: 1 Rasterzelle = 1 Einheit. Zelle (x,y) liegt bei X=x..x+1, Z=y..y+1, Ursprung Hallenecke oben links.

// ---------- Reine Logik ohne DOM (exportiert für tests/scene3d-own.test.js) ----------

export const VIEWS = ['hall', 'site', 'network', 'flat'];
export const LABEL_MODES = ['fleet', 'infra', 'all', 'none'];
export const MAX_LABELS = 40;
const HEIGHT = { assembly: 1.5, testing: 1.45, packing: 1.2, rack: 1.75, dock: 2.3, power: 1.4, workshop: 1.25, research: 1.6, coldstore: 1.6, terminal: 1.45, sorter: 1.35, crossbelt: 1.45, forklift: 1.3, containeryard: .35 };
const ACTIVE = ['working', 'running', 'producing', 'active'];
const BLOCKED = /wait|blocked|paused|material|staff|off|broken|power|storage/;
const OUT = ['transit', 'collecting', 'linehaul', 'outbound'], IN = ['returning', 'inbound'];

export function cellToWorld(x, y) { return { x: x + .5, z: y + .5 }; }
export function worldToCell(x, z) { return { x: Math.floor(x), y: Math.floor(z) }; }
export function defaultSite(state) { return state?.sites?.find(s => s.id === state.selectedSite) || state?.sites?.[0] || { id: 'site-1', name: 'Depot Morgenfeld', width: 20, height: 16 }; }
/** Achsparalleler Quader einer Anlage in Weltkoordinaten (Rotation über footprint()). */
export function buildingBox(b) { const f = footprint(b) || { w: 2, h: 2 }; return { x0: b.x, z0: b.y, x1: b.x + f.w, z1: b.y + f.h, y0: 0, y1: HEIGHT[b.type] || 1.2, w: f.w, h: f.h }; }
/** Statusfarbe wie scene.js: aktiv grün, blockiert gelb, sonst grau. */
export function buildingTone(b) { if (ACTIVE.includes(b.status)) return 'active'; if (BLOCKED.test(b.status || '') || b.enabled === false) return 'blocked'; return 'idle'; }
/** Signatur der statischen Geometrie: nur Standortmaße und Anlagenlage, kein Status. */
export function sceneSignature(state, siteId) {
  const s = state?.sites?.find(x => x.id === siteId) || defaultSite(state);
  let sig = `${s.id}|${s.width}x${s.height}|`;
  for (const b of state?.buildings || []) if (b.site === s.id) sig += `${b.id}:${b.type}:${b.x}:${b.y}:${b.rotation || 0};`;
  sig += '|' + (state?.sites || []).map(x => `${x.id}@${x.x || 0},${x.y || 0}`).join(',');
  return sig;
}
/** Hofgeometrie um die Halle: Tor, Andockreihe an der Südwand, Wartefläche, Straße. */
export function yardLayout(site) {
  const W = site.width || 20, H = site.height || 16, gate = Math.min(8, H - 1);
  const count = Math.max(1, Math.floor((W - 1) / 3.2)), bays = [];
  for (let i = 0; i < count; i++) bays.push(1.9 + i * 3.2);
  // yardGateZ: Schranke der Hofeinfahrt (Einfahrspur exitX, zwischen Hofgasse laneZ und Straße); queue: gelbe Wartefläche.
  return { W, H, gate, gateZ: gate + .5, laneZ: H + 6.6, roadOutZ: H + 11.1, roadInZ: H + 12.4, entryX: -5, exitX: -2.6, far: -62, bays, bayZ: H + .3, yardGateZ: H + 8, queue: { x0: -16.6, x1: -3.2, z0: H + .6, z1: H + 6.1 } };
}
/** Stellplatz eines Fahrzeugs im Hof. Kopf zeigt vom Tor weg (Heck an der Rampe). */
export function slotPose(layout, k, len = 4.2, dockX = null) {
  if (k < layout.bays.length || dockX != null) {
    const x = dockX != null ? Math.max(1, Math.min(layout.W - 1, dockX)) : layout.bays[k];
    return { x, z: layout.bayZ + len / 2, heading: Math.PI / 2 };
  }
  return fleetParkPose(layout, k - layout.bays.length, len);
}
// Eigene Flotte und Fremd-Lkw teilen keine Fläche: Fremd-Lkw nur an Dockplätzen, Tor, gelber Wartefläche;
// eigene Fahrzeuge am belegten Dock, sonst an freien Stellplätzen der Andockreihe (nicht vor Docks), sonst Fuhrpark östlich.
export const DOCK_GAP = 1.7;               // Mindestabstand der Fahrzeugmitten an der Andockreihe
export const PARK_GAP = 2.9;               // Stellplatz der eigenen Flotte: Seitenabstand zum nächsten Dockplatz (sichtbare Lücke auch in Schrägsicht)
export const FLEET_PARK = 8;               // Stellplätze im Fuhrpark östlich der Andockreihe
/** Fuhrpark-Stellplatz i (östlich der Halle, südlich des Mitarbeiterparkplatzes); Heck zur Hallenwand. */
export function fleetParkPose(L, i, len = 4.2) { return { x: L.W + 2.2 + (Math.max(0, i) % FLEET_PARK) * 1.9, z: L.H + .6 + len / 2, heading: Math.PI / 2 }; }
/** Andockplatz je Dock an der Südwand: Mitte der Dockspalte (Rotation über footprint). Docks in derselben Spalte rücken um DOCK_GAP nach Osten. */
export function dockSlots(L, buildings) {
  const docks = (buildings || []).filter(b => b.type === 'dock').map(b => { const box = buildingBox(b); return { id: b.id, x: (box.x0 + box.x1) / 2 }; });
  docks.sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));
  const out = new Map(); let last = -Infinity;
  for (const d of docks) { const x = Math.min(L.W - 1, Math.max(1, d.x, last + DOCK_GAP)); out.set(d.id, x); last = x; }
  return out;
}
/** Stellplätze der Andockreihe, die vor keinem Dock liegen (Abstand ≥ PARK_GAP zu jedem Andockplatz). */
export function freeBays(L, slots) { const xs = [...(slots?.values?.() || [])]; return L.bays.filter(x => xs.every(d => Math.abs(d - x) >= PARK_GAP)); }
/** Stellplatz des eigenen Fahrzeugs k ohne Dock: freie Andockreihe, dann Fuhrpark. Nie Wartefläche, nie vor einem Dock. */
export function parkPose(L, free, k, len = 4.2) {
  if (k < free.length) return { x: free[k], z: L.bayZ + len / 2, heading: Math.PI / 2 };
  return fleetParkPose(L, k - free.length, len);
}
/**
 * Eigene (und durchfahrende) Fahrzeuge am Standort: am tatsächlich belegten Dock (b.task = Sendungs-/Tour-ID), sonst Stellplatz k
 * (stabil nach Reihenfolge der Heimatflotte). Reine Ableitung aus dem Zustand, ohne Seiteneffekte.
 */
export function fleetPlans(state, siteId, buildings, L) {
  const vehicles = state?.vehicles || [], home = vehicles.filter(v => v.site === siteId), slots = dockSlots(L, buildings), free = freeBays(L, slots), out = [];
  let foreign = home.length;
  for (const v of vehicles) {
    if (v.status === 'rentalReturned') continue;
    const plan = vehiclePlan(state, v, siteId); if (plan.mode === 'away') continue;
    const k = v.site === siteId ? home.indexOf(v) : foreign++;
    const id = plan.task?.id, dock = plan.mode === 'site' && id ? buildings.find(b => b.type === 'dock' && b.task === id) : null;
    const len = VEH_LEN[v.type] || 4.2, pose = dock ? dockSlotPose(L, slots.get(dock.id), len) : parkPose(L, free, k, len);
    out.push({ v, plan, pose, len, dock: dock?.id || null });
  }
  return out;
}
/** Pose am Andockplatz (Heck an der Rampe). */
export function dockSlotPose(L, x, len = 4.2) { return { x, z: L.bayZ + len / 2, heading: Math.PI / 2 }; }
/** Fahrweg Stellplatz → Straße (out) bzw. Straße → Stellplatz (in). */
export function vehiclePath(layout, pose, dir) {
  const L = layout;
  if (dir === 'out') return [{ x: pose.x, z: pose.z }, { x: pose.x, z: L.laneZ }, { x: L.entryX, z: L.laneZ }, { x: L.entryX, z: L.roadOutZ }, { x: L.far, z: L.roadOutZ }];
  return [{ x: L.far, z: L.roadInZ }, { x: L.exitX, z: L.roadInZ }, { x: L.exitX, z: L.laneZ + 1.2 }, { x: pose.x, z: L.laneZ + 1.2 }, { x: pose.x, z: pose.z }];
}
/** Punkt und Fahrtrichtung bei Anteil t (0…1) entlang eines Polygonzugs. Schreibt in out. */
export function pointOnPath(path, t, out = {}) {
  let total = 0; for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= len || i === path.length - 1) { const r = len ? Math.min(1, d / len) : 0; out.x = a.x + (b.x - a.x) * r; out.z = a.z + (b.z - a.z) * r; out.heading = Math.atan2(b.z - a.z, b.x - a.x); return out; }
    d -= len;
  }
  out.x = path[0].x; out.z = path[0].z; out.heading = 0; return out;
}
/** Phasendauer nach S2: duration, sonst Fahrstrecke/Geschwindigkeit; fehlt beides → null. */
export function phaseDuration(task, v) {
  if (!task || !Number.isFinite(task.remaining)) return null;
  if (task.duration > 0) return task.duration;
  if (task.distance > 0 && ['transit', 'returning'].includes(task.status)) return Math.ceil(task.distance / (VEHICLES[v?.type]?.speed || 1));
  return null;
}
/** Fortschritt 1 - remaining/duration mit gebrochener Spielzeit (clock - state.t ∈ [0,1]). */
export function phaseProgress(task, v, clock, stateT) {
  const duration = phaseDuration(task, v); if (!duration) return null;
  const frac = Number.isFinite(clock) && Number.isFinite(stateT) ? Math.max(0, Math.min(1, clock - stateT)) : 0;
  return Math.max(0, Math.min(1, 1 - Math.max(0, task.remaining - frac) / duration));
}
/** Fahrzeugkürzel aus Typ und laufender Nummer der ID. */
export function vehicleTag(v) { const n = String(v?.id || '').match(/(\d+)$/)?.[1] || '?'; return `${({ van: 'LW', truck: 'LKW', refrigerated: 'KF' })[v?.type] || 'FZ'}-${n}`; }
/** Darstellungsplan je Fahrzeug, aus Zustand abgeleitet (nur lesend). */
export function vehiclePlan(state, v, siteId) {
  if (v?.status === 'linehaul') return linehaulPlan(state, v, siteId);
  if (v?.status === 'airshuttle') return airShuttlePlan(state, v, siteId);
  const a = vehicleActivity(state, v);
  if (vehicleAtSite(state, v, siteId)) {
    const tone = a.task?.blocked ? 'wait' : v.status === 'idle' ? 'idle' : 'dock';
    return { mode: 'site', tone, status: a.status, task: a.task, kind: a.kind };
  }
  let dir = null; const t = a.task;
  if (a.kind === 'transfer' && t) {
    const from = t.fromSite || t.site;
    if (t.status === 'transit') dir = t.toSite === siteId ? 'in' : from === siteId ? 'out' : null;
    else if (t.status === 'returning') dir = from === siteId ? 'in' : t.toSite === siteId ? 'out' : null;
  } else if (v.site === siteId) dir = OUT.includes(a.status) ? 'out' : IN.includes(a.status) ? 'in' : null;
  if (!dir || !phaseDuration(t, v)) return { mode: 'away', tone: 'move', status: a.status, task: t, kind: a.kind };
  return { mode: dir, tone: 'move', status: a.status, task: t, kind: a.kind };
}
// ---------- Linienverkehr (W3-S2), nur lesend ----------
const LH_ACTIVE = ['loading', 'transit', 'unloading', 'returning'];
/** Laufende Linienfahrt eines Fahrzeugs (v.status 'linehaul', v.linehaul = Fahrt-ID), sonst null. */
export function linehaulOf(state, v) {
  if (v?.status !== 'linehaul') return null;
  const list = state?.linehauls || [];
  return list.find(x => x.id === v.linehaul && LH_ACTIVE.includes(x.status)) || list.find(x => x.vehicleId === v.id && LH_ACTIVE.includes(x.status)) || null;
}
const siteName = (state, id) => state?.sites?.find(x => x.id === id)?.name || 'Standort';
/** Deutscher Fahrzeugstatus einer Linienfahrt (· Wartegrund, falls blockiert). */
export function linehaulStatus(state, lh) {
  const base = lh?.status === 'loading' ? 'Beladen Hauptlauf' : lh?.status === 'unloading' ? 'Entladen Hauptlauf' : lh?.status === 'transit' ? `Hauptlauf → ${siteName(state, lh.to)}` : lh?.status === 'returning' ? 'Rückfahrt' : 'Ferntransport';
  return lh?.blocked ? `${base} · ${lh.blocked}` : base;
}
/**
 * Darstellungsplan eines Linien-Lkw: Beladen am Dock des Startstandorts, Entladen am Dock des Zielstandorts (Dock über b.task = Fahrt-ID),
 * Hauptlauf fährt am Start ab (out) und am Ziel an (in), Rückfahrt umgekehrt – wie Standorttransfer.
 */
export function linehaulPlan(state, v, siteId) {
  const lh = linehaulOf(state, v), away = { mode: 'away', tone: 'move', status: lh?.status || 'linehaul', task: lh, kind: 'linehaul' };
  if (!lh) return away;
  const at = lh.status === 'loading' ? lh.from : lh.status === 'unloading' ? lh.to : null;
  if (at) return at === siteId ? { ...away, mode: 'site', tone: lh.blocked ? 'wait' : 'dock' } : away;
  const dir = lh.status === 'transit' ? (lh.from === siteId ? 'out' : lh.to === siteId ? 'in' : null) : (lh.to === siteId ? 'out' : lh.from === siteId ? 'in' : null);
  return dir && phaseDuration(lh, v) ? { ...away, mode: dir } : away;
}
/** Fahrzeug-Label „Kennung · Status“; Linien-Lkw mit Hauptlauf-Status. statusLabel: Übersetzung der übrigen Status. */
export function vehicleLabel(state, plan, v, statusLabel = x => x) {
  return `${vehicleTag(v)} · ${plan.kind === 'linehaul' && plan.task ? linehaulStatus(state, plan.task) : plan.kind === 'airshuttle' ? airShuttleStatus(plan.task) : statusLabel(plan.status)}`;
}
/** Sichtbarer Wegabschnitt: t (0 = Stellplatz, 1 = Straßenende) oder null, wenn außer Sicht. */
export function vehicleT(plan, v, clock, stateT, visibleMinutes = 8) {
  if (plan.mode === 'site') return 0;
  if (plan.mode !== 'out' && plan.mode !== 'in') return null;
  const p = phaseProgress(plan.task, v, clock, stateT), d = phaseDuration(plan.task, v);
  if (p == null || !d) return null;
  const w = Math.min(.45, visibleMinutes / d);
  if (plan.mode === 'out') return p < w ? p / w : null;
  return p > 1 - w ? (1 - p) / w : null;
}
/** Paletten je Regal wie in scene.js: Füllung aus Standortbestand, 3 Ebenen × Fachbreite. */
export function rackPallets(state, rack) {
  const racks = (state?.buildings || []).filter(a => a.site === rack.site && /rack|shelf|regal/.test(a.type));
  // Pakete (Fremdware, W1) erscheinen als Kartonstapel (parcelLoads), Ladeeinheit Palette (W2) als Palettenstapel (palletLoads).
  let qty = 0; for (const a of state?.batches || []) if (a.site === rack.site && a.location === 'stock' && a.item !== 'parcel' && a.item !== 'pallet' && a.item !== COLD_ITEM && a.item !== BULKY_ITEM) qty += a.qty;
  qty -= Math.max(0, racks.findIndex(a => a.id === rack.id)) * 80;
  const width = Math.max(1, Math.floor(BUILDINGS[rack.type]?.w || 2)), slots = [];
  for (let k = 0; k < 3; k++) for (let j = 0; j < width; j++) if (qty > k * 25 + j * 12) slots.push({ level: k, cell: j });
  return slots;
}
/** Figurenposition wie scene.js (Anlage der aktuellen Tätigkeit, sonst Aufenthaltsfläche). */
export function workerSpots(state, site, buildings) {
  const out = []; let i = 0;
  for (const w of state?.workers || []) {
    if (w.site !== site.id) continue;
    const job = state.jobs?.find(j => j.id === w.task || j.worker === w.id) || state.research?.find(j => j.id === w.task || j.worker === w.id);
    const plain = w.task?.replace?.(/:(warehouse|driver|technician|service)$/, '');
    const b = buildings.find(b => b.id === job?.building || b.id === w.task || (w.task && b.task === plain) || (w.task && b.maintenanceTask === w.task) || (w.task && b.serviceJob === plain));
    let x = b ? b.x - .3 : 1.5 + i % 6 * .65, z = b ? b.y + .6 : site.height - 1.1 - Math.floor(i / 6) * .65;
    if (b && job?.walkRemaining > 0) { const total = Math.max(1, Math.ceil((Math.abs(b.x) + Math.abs(b.y - 8)) / 5)), r = Math.max(0, Math.min(1, 1 - job.walkRemaining / total)); x = .5 + (x - .5) * r; z = 8 + (z - 8) * r; }
    if (b) x = Math.max(x, b.x + .25);
    out.push({ id: w.id, role: w.role, x, z }); i++;
  }
  return out;
}
/** Label-Auswahl: sichtbar, im Bild, nach Priorität und Nähe; überlappende Chips (Breite c.w, sonst 120 px) entfallen. */
export function selectLabels(cands, width, height, max = MAX_LABELS, out = []) {
  out.length = 0;
  cands.sort((a, b) => a.prio - b.prio || a.depth - b.depth);
  for (const c of cands) {
    if (out.length >= max) break;
    if (!c.visible || c.depth < -1 || c.depth > 1 || c.sx < -40 || c.sy < -20 || c.sx > width + 40 || c.sy > height + 20) continue;
    let clash = false;
    for (const o of out) if (Math.abs(o.sx - c.sx) < ((o.w || 120) + (c.w || 120)) / 2 + 4 && Math.abs(o.sy - c.sy) < 20) { clash = true; break; }
    if (!clash || c.prio === 0) out.push(c);
  }
  return out;
}
/** Adaptive Auflösung: > 18 ms über 2 s senken (bis min), < 12 ms über 2 s oder ruhig ≤ 17,5 ms über 5 s heben. */
export function adaptResolution(st, frameMs, now) {
  if (!(frameMs > 0) || frameMs > 250) return false;
  st.avg = st.avg ? st.avg * .94 + frameMs * .06 : frameMs;
  const cond = st.avg > 18 ? 'slow' : st.avg < 12 ? 'fast' : st.avg <= 17.5 ? 'steady' : 'ok';
  if (cond !== st.cond) { st.cond = cond; st.since = now; }
  const held = now - (st.since ?? now);
  if (cond === 'slow' && held >= 2000 && st.ratio > st.min) { st.ratio = Math.max(st.min, Math.round((st.ratio - .25) * 100) / 100); st.since = now; st.lastDrop = now; return true; }
  if (st.ratio < st.max && ((cond === 'fast' && held >= 2000) || (cond === 'steady' && held >= 5000 && now - (st.lastDrop ?? -1e9) >= 20000))) { st.ratio = Math.min(st.max, Math.round((st.ratio + .25) * 100) / 100); st.since = now; return true; }
  return false;
}
// ---------- Grafikqualität (0.15-S4, A12+A09): Stufen, LOD, Budgets, Automatik. Nur Darstellung, kein Spielzustand. ----------

export const QUALITY_LEVELS = ['low', 'medium', 'high'];
export const QUALITY_MODES = ['auto', ...QUALITY_LEVELS];
export const QUALITY_NAMES = { auto: 'Automatisch', low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };
/**
 * Stufen: maxRatio/minRatio (Pixelratio-Ober-/Untergrenze der adaptiven Auflösung), labels (Chip-Anzahl),
 * cap (Instanz-Obergrenzen je Kategorie), lod (Kameraabstand in Welteinheiten: Fahrzeuge → Box, Personen aus, Pakete halbiert),
 * night (Nachtlicht: Kreissegmente, Lichtkegel, Hallenlichtflächen), net (Zierflächen der Netzkarte), shadow (Bodenschatten-Andeutung unter Anlagen).
 */
export const QUALITY = {
  low: { maxRatio: 1.0, minRatio: .6, labels: 16, cap: { parcels: 16, pallets: 16, containers: 12, people: 12, trees: 8, cars: 4 }, lod: { vehicle: 50, person: 42, parcel: 42 }, night: { seg: 8, cones: false, hall: false }, net: { patches: 6 }, shadow: false },
  medium: { maxRatio: 1.25, minRatio: .7, labels: 28, cap: { parcels: 32, pallets: 24, containers: 24, people: 24, trees: 16, cars: 10 }, lod: { vehicle: 75, person: 60, parcel: 60 }, night: { seg: 12, cones: true, hall: true }, net: { patches: 14 }, shadow: true },
  high: { maxRatio: 1.5, minRatio: .75, labels: MAX_LABELS, cap: { parcels: 48, pallets: 32, containers: 64, people: 64, trees: 40, cars: 16 }, lod: { vehicle: 110, person: 95, parcel: 95 }, night: { seg: 18, cones: true, hall: true }, net: { patches: 26 }, shadow: true }
};
/** Render-Budget je Stufe (Probe-Szenen, tests/browser/quality.mjs). */
export const QUALITY_BUDGET = { low: { drawCalls: 150, triangles: 60000 }, medium: { drawCalls: 150, triangles: 120000 }, high: { drawCalls: 150, triangles: 250000 } };
/** Konfiguration einer Stufe; unbekannt → 'high' (bisheriges Verhalten). */
export function qualityConfig(level) { return QUALITY[level] || QUALITY.high; }
/** Pixelratio-Grenzen der Stufe bei gegebenem devicePixelRatio: {max, min} mit min ≤ max. */
export function qualityRatio(level, dpr = 1) { const q = qualityConfig(level), max = Math.min(Math.max(.5, dpr || 1), q.maxRatio); return { max, min: Math.min(q.minRatio, max) }; }
/** LOD-Entscheidung je Kameraabstand d. */
export function lodFor(level, d) { const l = qualityConfig(level).lod; return { vehicleBox: d > l.vehicle, personHidden: d > l.person, parcelReduced: d > l.parcel }; }
/** Budgetprüfung von renderInfo ({drawCalls, triangles}) gegen die Stufe. */
export function checkBudget(level, info) {
  const b = QUALITY_BUDGET[level] || QUALITY_BUDGET.high, issues = [];
  if (!(info?.drawCalls <= b.drawCalls)) issues.push(`Draw Calls ${info?.drawCalls} > ${b.drawCalls}`);
  if (!(info?.triangles <= b.triangles)) issues.push(`Dreiecke ${info?.triangles} > ${b.triangles}`);
  return { ok: !issues.length, level, budget: b, issues };
}
export const AUTO_WINDOW_MS = 10000, AUTO_DOWN_P95 = 18, AUTO_UP_P95 = 13, AUTO_UP_HOLD_MS = 30000, AUTO_EVAL_MS = 500, AUTO_MIN_FRAMES = 120;
/** Zustand der Automatik; Start in 'medium' (sicher für Referenzgerät, steigt bei Reserve). */
export function autoQualityState(level = 'medium') { return { level: QUALITY_LEVELS.includes(level) ? level : 'medium', times: [], deltas: [], since: null, fastSince: null, lastEval: -Infinity, p95: null, changes: 0 }; }
/**
 * Automatik: Frame-Abstände (ms) der letzten 10 s, p95 alle 500 ms. Runter bei p95 > 18 ms, hoch erst nach 30 s
 * durchgehend p95 < 13 ms. Nach jedem Wechsel wird das Fenster geleert: neue Entscheidung erst mit vollem 10-s-Fenster
 * (Hysterese 13/18 ms + Neubeginn → kein Flattern). Liefert die neue Stufe bei Wechsel, sonst null.
 */
export function autoQuality(st, frameMs, now) {
  if (st.since == null) st.since = now;
  if (frameMs > 0 && frameMs <= 250) { st.times.push(now); st.deltas.push(frameMs); }
  let cut = 0; while (cut < st.times.length && st.times[cut] <= now - AUTO_WINDOW_MS) cut++;
  if (cut) { st.times.splice(0, cut); st.deltas.splice(0, cut); }
  if (now - st.lastEval < AUTO_EVAL_MS) return null; st.lastEval = now;
  if (now - st.since < AUTO_WINDOW_MS || st.deltas.length < AUTO_MIN_FRAMES) { st.fastSince = null; return null; }
  const v = st.deltas.slice().sort((a, b) => a - b), p95 = st.p95 = v[Math.min(v.length - 1, Math.ceil(.95 * v.length) - 1)];
  const i = QUALITY_LEVELS.indexOf(st.level); let next = null;
  if (p95 > AUTO_DOWN_P95) { st.fastSince = null; if (i > 0) next = QUALITY_LEVELS[i - 1]; }
  else if (p95 < AUTO_UP_P95) { if (st.fastSince == null) st.fastSince = now; if (now - st.fastSince >= AUTO_UP_HOLD_MS && i < QUALITY_LEVELS.length - 1) next = QUALITY_LEVELS[i + 1]; }
  else st.fastSince = null;
  if (!next) return null;
  st.level = next; st.times.length = 0; st.deltas.length = 0; st.since = now; st.fastSince = null; st.changes++; return next;
}

/** Strahl gegen achsparallelen Quader (Slab-Test). Liefert Abstand oder null. */
export function rayBox(o, d, b) {
  let tmin = -Infinity, tmax = Infinity;
  for (const [oo, dd, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
    let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
  }
  return tmax < 0 ? null : Math.max(0, tmin);
}
/** Strahl gegen Bodenebene y = h. */
export function rayGround(o, d, h = 0, out = {}) { if (Math.abs(d.y) < 1e-9) return null; const t = (h - o.y) / d.y; if (t < 0) return null; out.x = o.x + d.x * t; out.z = o.z + d.z * t; return out; }
/** Kartenkoordinaten der Standorte für die Netzansicht. */
export function networkLayout(sites, k = .26, extra = []) {
  const all = [...sites, ...extra], xs = all.map(s => s.x || 0), ys = all.map(s => s.y || 0);
  const cx = (Math.min(0, ...xs) + Math.max(0, ...xs)) / 2, cy = (Math.min(0, ...ys) + Math.max(0, ...ys)) / 2;
  const at = s => ({ id: s.id, x: ((s.x || 0) - cx) * k, z: ((s.y || 0) - cy) * k });
  const pins = sites.map(at), nodes = extra.map(at);
  let ext = 12; for (const p of [...pins, ...nodes]) ext = Math.max(ext, Math.abs(p.x) + 6, Math.abs(p.z) + 6);
  return { pins, nodes, ext };
}

export const NET_PIN_R = 2.2, NET_OFFSET = .55, NET_WIDTH = .32;
export const NET_TONE = { active: '#3f8f78', inactive: '#a9b3ae' };
/** Linien der Netzansicht: Verbindung Start → Ziel zwischen den Pins, um den Pinradius gekürzt und quer versetzt (Gegenrichtung liegt daneben). */
export function networkLines(state, pins) {
  const out = [];
  for (const l of state?.lines || []) {
    const a = pins.find(p => p.id === l.from), b = pins.find(p => p.id === l.to); if (!a || !b) continue;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz); if (len < 1e-6) continue;
    const ux = dx / len, uz = dz / len, nx = -uz * NET_OFFSET, nz = ux * NET_OFFSET, cut = Math.min(NET_PIN_R, len * .3);
    out.push({ id: l.id, from: l.from, to: l.to, active: l.active !== false, x0: a.x + ux * cut + nx, z0: a.z + uz * cut + nz, x1: b.x - ux * cut + nx, z1: b.z - uz * cut + nz, heading: Math.atan2(dz, dx) });
  }
  return out;
}
/** Punkt auf einer Netzlinie bei Anteil p (0 = Start, 1 = Ziel). Schreibt in out. */
export function linePoint(line, p, out = {}) { const u = Math.max(0, Math.min(1, p)); out.x = line.x0 + (line.x1 - line.x0) * u; out.z = line.z0 + (line.z1 - line.z0) * u; return out; }
/** Dreiecke (Position, Farbe) für Linienband und Richtungspfeile; ein Draw Call. */
export function networkLineMesh(lines) {
  const pos = [], colr = [], y = .05, ya = .055;
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  for (const l of lines) {
    const c = rgb(l.active ? NET_TONE.active : NET_TONE.inactive), dx = l.x1 - l.x0, dz = l.z1 - l.z0, len = Math.hypot(dx, dz); if (len < 1e-6) continue;
    const ux = dx / len, uz = dz / len, w = NET_WIDTH / 2, nx = -uz * w, nz = ux * w;
    const quad = [[l.x0 + nx, l.z0 + nz], [l.x1 + nx, l.z1 + nz], [l.x1 - nx, l.z1 - nz], [l.x0 - nx, l.z0 - nz]];
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(quad[i][0], y, quad[i][1]); colr.push(...c); }
    const arrows = Math.max(1, Math.min(4, Math.floor(len / 9)));
    for (let k = 1; k <= arrows; k++) {
      const m = k / (arrows + 1), cx = l.x0 + dx * m, cz = l.z0 + dz * m, ax = -uz * .62, az = ux * .62;
      pos.push(cx + ux * .8, ya, cz + uz * .8, cx - ux * .5 + ax, ya, cz - uz * .5 + az, cx - ux * .5 - ax, ya, cz - uz * .5 - az); colr.push(...c, ...c, ...c);
    }
  }
  return { pos, colr };
}
/** Fortschritt eines Linien-Lkw auf seiner Verbindung: Beladen 0, Hauptlauf p, Entladen 1, Rückfahrt 1 − p. */
export function linehaulNetProgress(lh, v, clock, stateT) {
  if (lh.status === 'loading') return 0; if (lh.status === 'unloading') return 1;
  const p = phaseProgress(lh, v, clock, stateT) ?? 0; return lh.status === 'returning' ? 1 - p : p;
}
/** Netz-Label „Linie A→B · 63 %“ (Hauptlauf), sonst Phase (Rückfahrt mit Anteil), · Wartegrund. */
export function linehaulNetLabel(state, lh, pct) {
  const name = `Linie ${siteName(state, lh.from)}→${siteName(state, lh.to)}`;
  const phase = lh.status === 'transit' ? `${pct} %` : lh.status === 'returning' ? `Rückfahrt ${pct} %` : linehaulStatus(state, { ...lh, blocked: null });
  return `${name} · ${phase}${lh.blocked ? ` · ${lh.blocked}` : ''}`;
}
/** Verfolgungsziel in der Netzansicht: Linien-Lkw (Fahrzeug- oder Fahrt-ID). */
export function netFollowTarget(trips, id, air = null) {
  if (id == null) return null;
  for (const t of trips || []) if (t.vehicleId === id || t.id === id) return { x: t.x, z: t.z, kind: 'linehaul' };
  for (const t of air || []) if (t.vehicleId === id || t.id === id) return { x: t.x, z: t.z, kind: 'airshuttle' };
  return null;
}

// ---------- Luftexport (W3c-S1): Flughafen-Zubringer am Standort und im Netz, Frachtterminal AIRPORT, nur lesend ----------
const AIR_ACTIVE = ['loading', 'transit', 'handover', 'returning'];
/** Laufender Zubringer eines Fahrzeugs (v.status 'airshuttle', v.airShuttle = Zubringer-ID), sonst null. */
export function airShuttleOf(state, v) {
  if (v?.status !== 'airshuttle') return null;
  const list = state?.airShuttles || [];
  return list.find(x => x.id === v.airShuttle && AIR_ACTIVE.includes(x.status)) || list.find(x => x.vehicleId === v.id && AIR_ACTIVE.includes(x.status)) || null;
}
/** Deutscher Fahrzeugstatus eines Zubringers (· Wartegrund, falls blockiert). */
export function airShuttleStatus(sh) {
  const base = sh?.status === 'loading' ? 'Beladen Luftfracht' : sh?.status === 'transit' ? 'Luftzubringer → Terminal' : sh?.status === 'handover' ? 'Übergabe Terminal' : sh?.status === 'returning' ? 'Rückfahrt' : 'Luftzubringer';
  return sh?.blocked ? `${base} · ${sh.blocked}` : base;
}
/** Darstellungsplan eines Zubringers: Beladen am Dock (b.task = Zubringer-ID), Fahrt zum Terminal fährt die Zufahrt ab, Rückfahrt an, Übergabe außer Sicht. */
export function airShuttlePlan(state, v, siteId) {
  const sh = airShuttleOf(state, v), away = { mode: 'away', tone: 'move', status: sh?.status || 'airshuttle', task: sh, kind: 'airshuttle' };
  if (!sh || sh.site !== siteId) return away;
  if (sh.status === 'loading') return { ...away, mode: 'site', tone: sh.blocked ? 'wait' : 'dock' };
  const dir = sh.status === 'transit' ? 'out' : sh.status === 'returning' ? 'in' : null;
  return dir && phaseDuration(sh, v) ? { ...away, mode: dir } : away;
}
/** Luftverträge, die das Netz zeigen soll: angenommen und nicht beendet. */
export function activeAirContracts(state) { return (state?.contracts || []).filter(k => k.unit === 'air' && k.status !== 'offer' && k.status !== 'ended'); }
/** Netz zeigt den Flughafen, sobald ein Luftvertrag läuft oder ein Zubringer unterwegs ist. */
export function airRelevant(state) { return activeAirContracts(state).length > 0 || (state?.airShuttles || []).some(x => AIR_ACTIVE.includes(x.status)); }
/** Gestrichelte Verbindungen Hub → Terminal (je Standort mit laufendem Luftvertrag oder Zubringer), um die Pinradien gekürzt. */
export function airLinks(state, pins, air) {
  if (!air) return [];
  const ids = new Set(activeAirContracts(state).map(k => k.site));
  for (const x of state?.airShuttles || []) if (AIR_ACTIVE.includes(x.status)) ids.add(x.site);
  const out = [];
  for (const p of pins) {
    if (!ids.has(p.id)) continue;
    const dx = air.x - p.x, dz = air.z - p.z, len = Math.hypot(dx, dz); if (len < 1e-6) continue;
    const ux = dx / len, uz = dz / len, cut = Math.min(NET_PIN_R, len * .3);
    out.push({ id: `air:${p.id}`, site: p.id, x0: p.x + ux * cut, z0: p.z + uz * cut, x1: air.x - ux * cut, z1: air.z - uz * cut, heading: Math.atan2(dz, dx) });
  }
  return out;
}
/** Fortschritt eines Zubringers Hub → Terminal: Beladen 0, Fahrt p, Übergabe 1, Rückfahrt 1 − p. */
export function airShuttleNetProgress(sh, v, clock, stateT) {
  if (sh.status === 'loading') return 0; if (sh.status === 'handover') return 1;
  const p = phaseProgress(sh, v, clock, stateT) ?? 0; return sh.status === 'returning' ? 1 - p : p;
}
/** Netz-Label „Luftzubringer Hub→Heidmoor · 63 %“, Rückfahrt mit Anteil, sonst Phase · Wartegrund. */
export function airShuttleNetLabel(state, sh, pct) {
  const name = `Luftzubringer ${siteName(state, sh.site)}→${AIRPORT.short}`;
  const phase = sh.status === 'transit' ? `${pct} %` : sh.status === 'returning' ? `Rückfahrt ${pct} %` : airShuttleStatus({ ...sh, blocked: null });
  return `${name} · ${phase}${sh.blocked ? ` · ${sh.blocked}` : ''}`;
}
/** Abflugminuten (Minute des Tages, sortiert, eindeutig) aller laufenden Luftverträge. */
export function airFlightMinutes(state) { return [...new Set(activeAirContracts(state).flatMap(k => (k.flights || []).filter(Number.isFinite).map(m => ((m % 1440) + 1440) % 1440)))].sort((a, b) => a - b); }
export const PLANE_STAND = 45, PLANE_CLIMB = 18;
/**
 * Rein optisches Frachtflugzeug am Terminal, deterministisch aus dem Flugplan: PLANE_STAND Minuten vor dem Abflug steht es an der Position,
 * ab Abflug rollt es PLANE_CLIMB Minuten an und steigt. u: 0 = stehend, 0…1 = Start. Sonst null (kein Flugzeug).
 */
export function planePhase(minutes, clock) {
  if (!minutes?.length || !Number.isFinite(clock)) return null;
  const day = clock - dayMinute(clock); let best = null;
  for (const m of minutes) for (const d of [-1440, 0, 1440]) {
    const f = day + d + m, e = clock - f;
    if (e >= -PLANE_STAND && e < PLANE_CLIMB) { const ph = { flight: f, u: e < 0 ? 0 : e / PLANE_CLIMB, moving: e >= 0 }; if (!best || f < best.flight) best = ph; }
  }
  return best;
}
/** Pose des Flugzeugs relativ zum Terminalpin (Startbahn nach Osten): x/z/y und Neigung. */
export function planePose(node, ph, out = {}) {
  const u = ph.u, run = u * u * 26; out.x = node.x - 3.2 + run; out.z = node.z + 3.1; out.y = u > .45 ? (u - .45) * (u - .45) * 30 : 0; out.pitch = u > .45 ? Math.min(.3, (u - .45) * .8) : 0; return out;
}
/** Nächster Abflug (absolute Minute) ab t über alle laufenden Luftverträge, sonst null. */
export function nextAirFlight(state, t = state?.t ?? 0) {
  const ms = airFlightMinutes(state); if (!ms.length) return null; const day = t - dayMinute(t);
  for (const d of [0, 1440]) for (const m of ms) if (day + d + m >= t) return day + d + m;
  return null;
}
/** Label des Terminals: fiktiver Name · nächster Flug. */
export function airportLabel(state) { const f = nextAirFlight(state); if (f == null) return `${AIRPORT.name} · Luftfracht`; const m = dayMinute(f); return `${AIRPORT.name} · Flug ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

// ---------- Tageszeit (W2c): Licht, Himmel, Bodentönung aus der Spielzeit (nur Darstellung) ----------

/** Stimmungen je Tageszeit. sun*: Richtung der Hauptlichtquelle (nachts Mond), tint: Faktor auf Material-/Bodenfarben, night: 0…1 Lampenstärke. */
export const THEMES = {
  morning: { name: 'Morgen', sky: '#eedccb', hemiSky: '#ffe8d2', hemiGround: '#9ea78f', hemiI: 1.65, sun: '#ffcb9e', sunI: 1.55, sunX: -34, sunY: 14, sunZ: 16, tint: '#f6ebe2', night: .3 },
  day: { name: 'Tag', sky: '#dfe9e6', hemiSky: '#f6f9ff', hemiGround: '#b5c2a2', hemiI: 2.1, sun: '#fff4e2', sunI: 2.0, sunX: -18, sunY: 34, sunZ: 22, tint: '#ffffff', night: 0 },
  evening: { name: 'Abend', sky: '#e3b897', hemiSky: '#ffd8bd', hemiGround: '#8e8ea8', hemiI: 1.35, sun: '#ffad72', sunI: 1.6, sunX: 32, sunY: 12, sunZ: 18, tint: '#f1ddd0', night: .5 },
  night: { name: 'Nacht', sky: '#17232c', hemiSky: '#6a7f9c', hemiGround: '#28313a', hemiI: 1.0, sun: '#a9bde3', sunI: .5, sunX: 12, sunY: 30, sunZ: -14, tint: '#a3b0c8', night: 1 }
};
/** Stützstellen in Minuten des Tages (0–1440); dazwischen weicher Übergang (smoothstep). */
export const THEME_STOPS = [[0, 'night'], [300, 'night'], [390, 'morning'], [510, 'day'], [1020, 'day'], [1140, 'evening'], [1260, 'night'], [1440, 'night']];
export const THEME_MODES = ['auto', 'day', 'night'];
const hexRgb = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Mischung zweier Hexfarben (u 0…1). */
export function mixHex(a, b, u) { const p = hexRgb(a), q = hexRgb(b); return rgbHex(p.map((v, i) => v + (q[i] - v) * u)); }
/** Mischung zweier Stimmungen: Farben (#…) und Zahlen linear, name der näheren Stimmung. */
export function mixTheme(a, b, u) {
  const out = {}; for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * u : typeof a[k] === 'string' && a[k][0] === '#' ? mixHex(a[k], b[k], u) : (u < .5 ? a[k] : b[k]);
  return out;
}
/** Minute des Tages aus der Spielzeit (state.t in Minuten, Tag = 1440). */
export function dayMinute(t) { return (((Number.isFinite(t) ? t : 480) % 1440) + 1440) % 1440; }
/** Stimmung zur Spielzeit t (Minuten); stetig auch über Mitternacht. */
export function themeAt(t) {
  const m = dayMinute(t);
  for (let i = 1; i < THEME_STOPS.length; i++) {
    const [m1, k1] = THEME_STOPS[i]; if (m > m1) continue;
    const [m0, k0] = THEME_STOPS[i - 1], u = m1 > m0 ? (m - m0) / (m1 - m0) : 1, s = u * u * (3 - 2 * u);
    if (s <= 0 || s >= 1 || k0 === k1) { const k = s < .5 ? k0 : k1; return { ...THEMES[k], key: k }; }
    return { ...mixTheme(THEMES[k0], THEMES[k1], s), key: s < .5 ? k0 : k1 };
  }
  return { ...THEMES.night, key: 'night' };
}
/** Stimmung je Modus: 'day'/'night' fest, sonst ('auto') aus der Spielzeit. */
export function themeFor(mode, t) { return mode === 'day' || mode === 'night' ? { ...THEMES[mode], key: mode } : themeAt(t); }
/**
 * Nachtbeleuchtung je Standort (nur Darstellung): Hofmasten mit Lichtkegel, Wandleuchten über den Docks, Hallenleuchten als Lichtflächen.
 * Liefert {masts:[{x,z,h}], heads:[{x,y,z}], pools:[{x,z,y,r,k,cone,h}]}; Anzahl begrenzt (keine Echtzeitlichter).
 */
export function nightLights(site, L = yardLayout(site), docks = [], yards = [], opt = {}) {
  const W = L.W, H = L.H, masts = [], heads = [], pools = [];
  const mast = (x, z, r = 3.4) => { masts.push({ x, z, h: 4.4 }); heads.push({ x, y: 4.35, z }); pools.push({ x, z, y: .012, r, k: 1, cone: true, h: 4.3 }); };
  mast(-1, L.yardGateZ + .6, 3); mast(-14, H + .3); mast(-7.5, H + .3); mast(-10, L.roadInZ + 1.7, 3);
  mast(W + 1, H + .35); mast(W + 1.4 + FLEET_PARK * 1.9, H + .35); mast(W + 10.8, H * .3, 3); mast(W + 10.8, H * .7, 3);
  for (const x of (docks.length ? docks : L.bays).slice(0, 8)) { heads.push({ x, y: 2.35, z: H + .2 }); pools.push({ x, z: H + 2.2, y: .014, r: 2.2, k: .75, cone: false, h: 0 }); }
  // Hallenlichtflächen entfallen in Qualitätsstufe Niedrig (opt.hall === false).
  if (opt.hall !== false) for (let x = 2; x < W; x += 4) for (let z = 2; z < H; z += 4) pools.push({ x, z, y: .085, r: 2.0, k: .42, cone: false, h: 0 });
  for (let x = 0; x <= W; x += 4) heads.push({ x, y: 2.32, z: -.1 }, { x, y: 2.32, z: H + .1 });
  // W3b: Containerhof mit eigener Lichtfläche (Leuchtmast im Modell).
  for (const y of yards.slice(0, 6)) pools.push({ x: y.x, z: y.z, y: .1, r: 2.6, k: .6, cone: false, h: 0 });
  return { masts, heads, pools };
}

// ---------- Kamerarundgang und Verfolgen (W2c), nur Darstellung ----------

export const TOUR_TRAVEL = 2.6, TOUR_DWELL = 2.4; // Sekunden je Fahrt bzw. Halt
/** Stationen des Rundgangs: Tor → Docks → Sortierung → Lager → Ausgang. Fehlende Sortierung/Lager entfallen. */
export function tourStops(state, siteId) {
  const s = state?.sites?.find(x => x.id === siteId) || defaultSite(state), L = yardLayout(s), b = (state?.buildings || []).filter(o => o.site === s.id);
  const mid = list => { let x = 0, z = 0; for (const o of list) { const box = buildingBox(o); x += (box.x0 + box.x1) / 2; z += (box.z0 + box.z1) / 2; } return { x: x / list.length, z: z / list.length }; };
  const docks = b.filter(o => o.type === 'dock'), sorters = b.filter(o => o.type === 'sorter' || o.type === 'crossbelt'), racks = b.filter(o => RACK.test(o.type)), out = [];
  out.push({ key: 'gate', label: 'Tor', tx: L.exitX, tz: L.yardGateZ - 1, dist: 17, yaw: Math.PI / 5 });
  const d = docks.length ? mid(docks) : { x: (L.bays[0] + L.bays[L.bays.length - 1]) / 2, z: L.H };
  out.push({ key: 'docks', label: 'Docks', tx: d.x, tz: L.H + 1.5, dist: 19, yaw: 0 });
  if (sorters.length) { const p = mid(sorters); out.push({ key: 'sorting', label: 'Sortierung', tx: p.x, tz: p.z, dist: 13, yaw: Math.PI / 4 }); }
  if (racks.length) { const p = mid(racks); out.push({ key: 'storage', label: 'Lager', tx: p.x, tz: p.z, dist: 14, yaw: -Math.PI / 4 }); }
  out.push({ key: 'exit', label: 'Ausgang', tx: L.entryX, tz: L.roadOutZ - 1.5, dist: 18, yaw: Math.PI / 3 });
  return out;
}
/** Kürzeste Winkeldifferenz b − a im Bereich (−π, π]. */
export function angleDelta(a, b) { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d <= -Math.PI) d += 2 * Math.PI; return d; }
/** Kamerapose zwischen zwei Stationen (u 0…1, sanft beschleunigt/abgebremst, Drehung auf kürzestem Weg). Schreibt in out. */
export function tourPose(from, to, u, out = {}) {
  const v = Math.max(0, Math.min(1, u)), s = v * v * (3 - 2 * v);
  out.tx = from.tx + (to.tx - from.tx) * s; out.tz = from.tz + (to.tz - from.tz) * s; out.dist = from.dist + (to.dist - from.dist) * s; out.yaw = from.yaw + angleDelta(from.yaw, to.yaw) * s; return out;
}
/** Verfolgungsziel: Fremd-Lkw (arrival-ID, yardFleet) oder eigenes Fahrzeug (fleet, nur wenn im Bild). Liefert {x,z,kind} oder null. */
export function followTarget(fleet, yardFleet, id) {
  if (id == null) return null;
  for (const p of yardFleet || []) if (p.id === id) return { x: p.x, z: p.z, kind: 'arrival' };
  for (const p of fleet || []) if (p.v?.id === id) return p.shown ? { x: p.x, z: p.z, kind: 'vehicle' } : null;
  return null;
}
/** Label „Kennung · Status …“ in Kennung (fett) und Status (klein) teilen; Trenner bleibt im Text erhalten. */
export function splitLabel(text) { const s = String(text ?? ''), i = s.indexOf(' · '); return i < 0 ? { head: s, sep: '', rest: '' } : { head: s.slice(0, i), sep: ' · ', rest: s.slice(i + 3) }; }

// ---------- Hof: Fremd-Lkw aus s.yard (W1-S2/W1-S4), nur lesend ----------

export const FOREIGN_LEN = 5.0;            // Sattelzug (Zugmaschine + Auflieger), Weltmaß
export const YARD_TURN = 2.5;              // Kurvenradius im Hof
export const QUEUE_PLACES = 6;             // Plätze auf der gelben Wartefläche, danach Rückstau auf der Hofgasse
export const QUEUE_DRIVE = 1;              // Spielminuten Fahrt Tor → Warteplatz (Phase queue hat kein phaseEnd)
export const PHASE_LABEL = { approach: 'Anfahrt', gate: 'Torkontrolle', queue: 'Wartet auf Dock', toDock: 'Zum Dock', docking: 'Andocken', unloading: 'Entladen', exit: 'Ausfahrt' };
const QUEUE_DX = 1.95;

/** Warteschlange am Standort wie yard.js: vorgezogene (priority) zuerst, dann Ankunft am Tor (gateAt, sonst phaseStart), dann Listenfolge. */
export function queueOrder(yard, siteId) {
  const list = []; (yard || []).forEach((a, i) => { if (a && a.site === siteId && a.phase === 'queue') list.push({ a, i }); });
  const prio = a => (a.priority ? 0 : 1), start = a => (Number.isFinite(a.gateAt) ? a.gateAt : Number.isFinite(a.phaseStart) ? a.phaseStart : Infinity);
  list.sort((p, q) => prio(p.a) - prio(q.a) || start(p.a) - start(q.a) || p.i - q.i);
  return list.map(p => p.a.id);
}
/** Warteplatz k: 0 liegt der Ausfahrt der Wartefläche am nächsten (Osten), nebeneinander mit Bug zur Halle. Ab QUEUE_PLACES Rückstau auf der Hofgasse. */
export function queuePlace(L, k, len = FOREIGN_LEN) {
  if (k < QUEUE_PLACES) return { x: L.queue.x1 - 2.55 - k * QUEUE_DX, z: (L.queue.z0 + L.queue.z1) / 2, heading: -Math.PI / 2 };
  return { x: L.queue.x0 - 2.4 - (k - QUEUE_PLACES) * (len + .6), z: L.laneZ, heading: Math.PI };
}
/** Halt an der Torschranke (Bug an der Schranke, Blick zur Halle). */
export function gatePose(L, len = FOREIGN_LEN) { return { x: L.exitX, z: L.yardGateZ + len / 2, heading: -Math.PI / 2 }; }
/** Dockposition des zugeteilten Docks (Heck an der Rampe), sonst null. */
export function dockPoseFor(L, buildings, dockId, len = FOREIGN_LEN) {
  const b = dockId != null && (buildings || []).find(o => o.id === dockId); if (!b) return null;
  return dockSlotPose(L, dockSlots(L, buildings).get(b.id), len);
}
/** Polygonzug mit abgerundeten Ecken (quadratische Bézier) und Rückwärtskennung r je Segmentende. Spitzkehren (Wechsel vor/zurück) bleiben Ecke. */
export function makePath(pts, radius = YARD_TURN, steps = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1], l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(c.x - b.x, c.z - b.z);
    const cross = l1 && l2 ? ((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) / (l1 * l2) : 0;
    if (!!b.r !== !!c.r || Math.abs(cross) < 1e-3) { out.push(b); continue; }
    const cut = Math.min(radius, i > 1 ? l1 / 2 : l1 * .8, i < pts.length - 2 ? l2 / 2 : l2 * .8); // an Endpunkten bleibt ein gerades Stück (stetige Richtung)
    const p1 = { x: b.x - (b.x - a.x) / l1 * cut, z: b.z - (b.z - a.z) / l1 * cut }, p2 = { x: b.x + (c.x - b.x) / l2 * cut, z: b.z + (c.z - b.z) / l2 * cut };
    out.push({ x: p1.x, z: p1.z, r: b.r });
    for (let k = 1; k <= steps; k++) { const t = k / steps, u = 1 - t; out.push({ x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x, z: u * u * p1.z + 2 * u * t * b.z + t * t * p2.z, r: b.r }); }
  }
  out.push(pts[pts.length - 1]);
  let total = 0; for (let i = 1; i < out.length; i++) total += Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
  return { pts: out, total };
}
/** Pose bei Anteil t (0…1); rückwärts befahrene Segmente (r) drehen den Bug gegen die Fahrtrichtung. Schreibt in out, keine Allokation. */
export function pathPose(path, t, out = {}) {
  const p = path.pts; let d = Math.max(0, Math.min(1, t)) * path.total;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9 && i < p.length - 1) continue;
    if (d <= len || i === p.length - 1) { const r = len ? Math.min(1, d / len) : 1; out.x = a.x + (b.x - a.x) * r; out.z = a.z + (b.z - a.z) * r; out.heading = Math.atan2(b.z - a.z, b.x - a.x) + (b.r ? Math.PI : 0); return out; }
    d -= len;
  }
  out.x = p[0].x; out.z = p[0].z; out.heading = 0; return out;
}
const pt = (x, z, r) => (r ? { x, z, r: true } : { x, z });
/** Wege je Phase. Docken: vorwärts bis hinter das Dock, dann rückwärts in einer Kurve ans Dock (Heck voran, kein 180°-Sprung). */
export function approachPath(L, len = FOREIGN_LEN) { const g = gatePose(L, len); return makePath([pt(L.far, L.roadInZ), pt(L.exitX, L.roadInZ), pt(g.x, g.z)]); }
export function queueEntryPath(L, place, len = FOREIGN_LEN) {
  const g = gatePose(L, len);
  if (place.heading === Math.PI) return makePath([pt(g.x, g.z), pt(g.x, L.laneZ), pt(place.x, place.z)]);
  return makePath([pt(g.x, g.z), pt(g.x, L.laneZ), pt(place.x, L.laneZ), pt(place.x, place.z)]);
}
/** Start vom Warteplatz: rückwärts ausparken (Bug bleibt Richtung Halle), dann vorwärts die Hofgasse entlang. Sonst vorwärts. */
export function toDockPath(L, from, dock) {
  const end = pt(dock.x + YARD_TURN, L.laneZ), parked = Math.abs(Math.sin(from.heading) + 1) < .05 && from.z < L.laneZ - 1 && from.x < L.queue.x1;
  if (parked) return makePath([pt(from.x, from.z), pt(from.x, L.laneZ, true), pt(from.x - YARD_TURN, L.laneZ, true), end]);
  if (Math.abs(from.z - L.laneZ) < .05) return makePath([pt(from.x, from.z), end]);
  return makePath([pt(from.x, from.z), pt(from.x, L.laneZ), end]);
}
export function dockingPath(L, dock) { return makePath([pt(dock.x + YARD_TURN, L.laneZ), pt(dock.x, L.laneZ, true), pt(dock.x, dock.z, true)]); }
export function exitPath(L, from) { return makePath(vehiclePath(L, from, 'out')); }
/** Farbe nach W1-S4: gelb wartet, blau fährt, grau Ein-/Ausfahrt, grün am Dock. */
export function arrivalTone(a) {
  switch (a?.phase) {
    case 'queue': return 'wait';
    case 'toDock': case 'docking': return 'move';
    case 'unloading': return a.waitReason ? 'wait' : 'dock';
    case 'gate': return a.waitReason ? 'wait' : 'gate';
    default: return 'gate';
  }
}
/** Label: Kennzeichen · deutsche Phase (· Wartegrund, außer in der Warteschlange – dort ist er „Kein freies Dock“). */
export function arrivalLabel(a) { const text = `${a?.plate || a?.id || 'Lkw'} · ${PHASE_LABEL[a?.phase] || a?.phase || ''}`; return a?.waitReason && a.phase !== 'queue' ? `${text} · ${a.waitReason}` : text; }
const CARRIER_CAB = ['#b5473f', '#7d5fa8', '#3f7556', '#5c6670'];
/** Fahrerhausfarbe des Fremdfrachtführers (deterministisch, abweichend von der eigenen Flotte). */
export function carrierColor(carrier) { let h = 0; for (const ch of String(carrier || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CARRIER_CAB[h % CARRIER_CAB.length]; }
/**
 * Darstellungsplan eines Hofeintrags. ctx: {rank, dock (Pose|null), from (letzte Pose bei Phasenwechsel), slide ({from, at} bei Nachrücken)}.
 * Liefert null für gone/unbekannt. path + t0/t1 (absolute Spielminuten) werden nur interpoliert, wenn beide gesetzt sind.
 */
export function arrivalPlan(L, a, ctx = {}) {
  if (a?.kind === 'container') return containerChassisPlan(L, a, ctx);
  if (!a || !PHASE_LABEL[a.phase]) return null;
  const g = gatePose(L), dock = ctx.dock || null, timed = Number.isFinite(a.phaseStart) && Number.isFinite(a.phaseEnd);
  const plan = { id: a.id, phase: a.phase, path: null, t0: timed ? a.phaseStart : null, t1: timed ? a.phaseEnd : null, pose: g, fixedHeading: null, tone: arrivalTone(a), label: arrivalLabel(a), color: carrierColor(a.carrier), x: g.x, z: g.z, heading: g.heading, pallet: a.item === 'pallet', pallets: trailerPallets(a), ware: arrivalWare(a), bulky: trailerBulky(a) };
  switch (a.phase) {
    case 'approach': plan.path = approachPath(L); break;
    case 'gate': break;
    case 'queue': {
      const place = plan.pose = queuePlace(L, Math.max(0, ctx.rank ?? 0));
      if (ctx.slide) { plan.path = makePath([pt(ctx.slide.from.x, ctx.slide.from.z), pt(place.x, place.z)]); plan.t0 = ctx.slide.at; plan.t1 = ctx.slide.at + QUEUE_DRIVE; plan.fixedHeading = place.heading; }
      else if (Number.isFinite(a.phaseStart)) { plan.path = queueEntryPath(L, place); plan.t0 = a.phaseStart; plan.t1 = a.phaseStart + QUEUE_DRIVE; }
      break;
    }
    case 'toDock': { const from = ctx.from || g; plan.pose = from; if (dock) plan.path = toDockPath(L, from, dock); break; }
    case 'docking': if (dock) plan.path = dockingPath(L, dock); break;
    case 'unloading': plan.pose = dock || g; break;
    case 'exit': plan.path = exitPath(L, dock || g); break;
  }
  if (plan.path && plan.t1 == null) plan.pose = pathPose(plan.path, 1, {});
  arrivalPose(plan, plan.t0 ?? 0, plan);
  return plan;
}
/** Pose zur (gebrochenen) Spielzeit clock; schreibt in out, keine Allokation. Ohne phaseEnd stationär. */
export function arrivalPose(plan, clock, out) {
  if (plan.path && plan.t1 != null) {
    const t = plan.t1 > plan.t0 ? Math.max(0, Math.min(1, (clock - plan.t0) / (plan.t1 - plan.t0))) : 1;
    pathPose(plan.path, t, out); if (plan.fixedHeading != null) out.heading = plan.fixedHeading;
  } else { out.x = plan.pose.x; out.z = plan.pose.z; out.heading = plan.pose.heading; }
  return out;
}
/** Läuft gerade eine Fahrt (für Rendern pro Frame)? */
export function arrivalMoving(plan, clock) { return !!plan.path && plan.t1 != null && clock >= plan.t0 && clock < plan.t1; }

// ---------- Pakete: Rollcontainer (inbound, an Docks) und Kartonstapel (stock, am Sortierplatz-Ausgang bzw. Regal) ----------

export const PARCELS_PER_CAGE = 40, PARCELS_PER_STACK = 20, MAX_CAGES = 48, MAX_STACKS = 48;
const CAGES_PER_DOCK = 8;
function toWorld(b, lx, lz, out) {
  const box = buildingBox(b), cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2, rot = -((b.rotation || 0) % 360) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
  out.x = cx + lx * c + lz * s; out.z = cz - lx * s + lz * c; out.rot = rot; return out;
}
/** Docks am Standort; Docks mit entladendem Fremd-Lkw bzw. Container zuerst. */
function dockOrder(state, siteId, buildings) {
  const busy = new Set(); for (const a of state?.yard || []) if (a.site === siteId && a.dock && a.phase === 'unloading') busy.add(a.dock);
  for (const c of state?.containers || []) if (c.site === siteId && c.dock && c.status === 'unstuffing') busy.add(c.dock);
  return buildings.filter(b => b.type === 'dock').sort((p, q) => (busy.has(q.id) ? 1 : 0) - (busy.has(p.id) ? 1 : 0));
}
/** Rollcontainerplatz i (0 … CAGES_PER_DOCK·Docks − 1) auf den Docks. */
function cageSlot(docks, i, extra) { const j = i % CAGES_PER_DOCK, d = docks[Math.floor(i / CAGES_PER_DOCK)]; return toWorld(d, -.6 + (j % 4) * .5, -.6 + Math.floor(j / 4) * .55, { dock: d.id, ...extra }); }
/** Stapelplätze an der Ausgangsseite (+z) der Anker, zwei Reihen. */
function stackSlots(anchors) {
  const slots = [];
  for (const b of anchors) { const d = BUILDINGS[b.type] || { w: 2, h: 2 }, cols = Math.max(1, Math.floor(d.w / .7)); for (let row = 0; row < 2; row++) for (let col = 0; col < cols; col++) slots.push([b, -d.w / 2 + .4 + col * .7, d.h / 2 + .35 + row * .6]); }
  return slots;
}
/** Stapel nach Menge; der letzte angebrochene Stapel ist niedriger. */
function fillStacks(slots, qty, extra = {}) {
  const ns = Math.min(MAX_STACKS, slots.length, Math.ceil(qty / PARCELS_PER_STACK)), out = [];
  for (let i = 0; i < ns; i++) { const [b, lx, lz] = slots[i], rest = qty - i * PARCELS_PER_STACK, fill = i === ns - 1 && ns === Math.ceil(qty / PARCELS_PER_STACK) ? Math.min(1, rest / PARCELS_PER_STACK) : 1; out.push(toWorld(b, lx, lz, { anchor: b.id, sy: .35 + .65 * fill, ...extra })); }
  return out;
}
const SORT_ANCHOR = new Set(['sorter', 'crossbelt']);
const stackAnchors = (buildings, docks) => { const a = buildings.filter(b => SORT_ANCHOR.has(b.type)).concat(buildings.filter(b => /rack|shelf|regal/.test(b.type))); return a.length ? a : docks; };
/** Paketplätze am Standort, Dichte nach Menge (gedeckelt). Nur item 'parcel'; Docks mit entladendem Fremd-Lkw zuerst. Ausgang: Sortierplatz/Quergurt, dann Regale. */
export function parcelLoads(state, siteId, buildings = (state?.buildings || []).filter(b => b.site === siteId)) {
  let inbound = 0, stock = 0;
  for (const a of state?.batches || []) if (a.site === siteId && a.item === 'parcel' && a.qty > 0) { if (a.location === 'inbound') inbound += a.qty; else if (a.location === 'stock') stock += a.qty; }
  const docks = dockOrder(state, siteId, buildings), cages = [];
  const nc = Math.min(MAX_CAGES, docks.length * CAGES_PER_DOCK, Math.ceil(inbound / PARCELS_PER_CAGE));
  for (let i = 0; i < nc; i++) cages.push(cageSlot(docks, i));
  return { inbound, stock, cages, stacks: fillStacks(stackSlots(stackAnchors(buildings, docks)), stock) };
}

// ---------- 0.15 Modelle (A09): Kühlpakete, Sperrgut, Quergurtsorter. Nur lesend; Animation nur aus der Anzeigeuhr. ----------
export const COLD_ITEM = 'parcel_cold', BULKY_ITEM = 'bulky';
/**
 * Kühlpakete (item 'parcel_cold'), gleiche Dichte wie Pakete: Rollcontainer (inbound) auf den Docks hinter den Paket-Rollcontainern,
 * Stapel (stock) vor dem Kühllager (Ausgangsseite), danach auf den freien Paket-Stapelplätzen. base: Ergebnis von parcelLoads.
 */
export function coldLoads(state, siteId, buildings = (state?.buildings || []).filter(b => b.site === siteId), base = parcelLoads(state, siteId, buildings)) {
  let inbound = 0, stock = 0;
  for (const a of state?.batches || []) if (a.site === siteId && a.item === COLD_ITEM && a.qty > 0) { if (a.location === 'inbound') inbound += a.qty; else if (a.location === 'stock') stock += a.qty; }
  const docks = dockOrder(state, siteId, buildings), used = base.cages.length, cages = [];
  const nc = Math.max(0, Math.min(MAX_CAGES - used, docks.length * CAGES_PER_DOCK - used, Math.ceil(inbound / PARCELS_PER_CAGE)));
  for (let i = 0; i < nc; i++) cages.push(cageSlot(docks, used + i, { cold: true }));
  const slots = stackSlots(buildings.filter(b => b.type === 'coldstore')).concat(stackSlots(stackAnchors(buildings, docks)).slice(base.stacks.length));
  return { inbound, stock, cages, stacks: fillStacks(slots, stock, { cold: true }) };
}
export const BULKY_PER_PIECE = 2, MAX_BULKY = 24, BULKY_PER_TRAILER = 6, BULKY_LEVELS = 3;
/** Formen der Sperrgutstücke (Skalierung des Grundkörpers 1,0 × 0,38 × 0,42): lange Kiste, hohe Kiste, flaches Paket, Ballen. */
export const BULKY_SHAPES = [[1, 1, 1], [.72, 1.55, 1.08], [1.12, .62, 1.22], [.86, 1.12, .86]];
export const BULKY_HEX = ['#c79a5b', '#8f9ea3', '#b5824a', '#d8c9a3', '#9fb0a2'];
/** Form, Farbe und Schräglage des Sperrgutstücks i (deterministisch). */
export function bulkyShape(i) { return { s: BULKY_SHAPES[((i * 7) % 11) % BULKY_SHAPES.length], hex: BULKY_HEX[(i * 3 + 1) % BULKY_HEX.length], tilt: ((i * 37) % 7 - 3) * .045 }; }
/**
 * Sperrgut im Lager (item 'bulky', location stock): je Stück BULKY_PER_PIECE Einheiten, gedeckelt auf MAX_BULKY. Plätze an beiden
 * Stirnseiten der Regale (längs zur Regaltiefe), bis BULKY_LEVELS übereinander; ohne Regal an der Hallenseite von Staplerplatz/Dock.
 */
export function bulkyLoads(state, siteId, buildings = (state?.buildings || []).filter(b => b.site === siteId)) {
  let stock = 0; for (const a of state?.batches || []) if (a.site === siteId && a.item === BULKY_ITEM && a.location === 'stock' && a.qty > 0) stock += a.qty;
  let anchors = buildings.filter(b => /rack|shelf|regal/.test(b.type)), ends = true; if (!anchors.length) { anchors = buildings.filter(b => b.type === 'forklift' || b.type === 'dock'); ends = false; }
  const cols = [];
  for (const b of anchors) {
    const d = BUILDINGS[b.type] || { w: 2, h: 2 };
    if (ends) cols.push([b, -d.w / 2 - .32, 0, Math.PI / 2], [b, d.w / 2 + .32, 0, Math.PI / 2]);
    else { const k = Math.max(1, Math.floor(d.w / 1.15)); for (let j = 0; j < k; j++) cols.push([b, -(k - 1) * .575 + j * 1.15, -d.h / 2 - .4, 0]); }
  }
  const n = Math.min(MAX_BULKY, cols.length * BULKY_LEVELS, Math.ceil(stock / BULKY_PER_PIECE)), pieces = [], height = cols.map(() => 0);
  for (let i = 0; i < n; i++) {
    const c = i % cols.length, [b, lx, lz, turn] = cols[c], sh = bulkyShape(i), p = toWorld(b, lx, lz, { anchor: b.id, level: Math.floor(i / cols.length) });
    p.y = height[c]; height[c] += .38 * sh.s[1] + .015; p.rot += turn + sh.tilt; p.sx = sh.s[0]; p.sy = sh.s[1]; p.sz = sh.s[2]; p.hex = sh.hex; pieces.push(p);
  }
  return { stock, pieces };
}
/** Sperrgutstücke auf der Pritsche eines Fremd-Lkw (a.item 'bulky'): Anteil der noch nicht entladenen, höchstens BULKY_PER_TRAILER. */
export function trailerBulky(a) {
  if (a?.item !== BULKY_ITEM || !(a.parcels > 0)) return 0;
  return Math.max(0, Math.min(BULKY_PER_TRAILER, Math.ceil(BULKY_PER_TRAILER * (a.parcels - (a.unloaded || 0)) / a.parcels)));
}
/** Ware eines Fremd-Lkw für die Darstellung: 'pallet' | 'cold' | 'bulky' | 'parcel'. */
export function arrivalWare(a) { return a?.item === 'pallet' ? 'pallet' : a?.item === COLD_ITEM ? 'cold' : a?.item === BULKY_ITEM ? 'bulky' : 'parcel'; }

// Quergurtsorter 6×3 (BUILDINGS.crossbelt): umlaufende Schleife (Geraden bei z = ±BELT.r, Halbkreise um x = ±BELT.hx) mit Wagen und Querbändern,
// Einschleusung und Scannerportal an der Nordseite (−z), Endstellen (Rutschen mit Behältern) Süd und Nordost, Fehlwurfbehälter Ost (+x).
export const BELT = { hx: 1.75, r: .62, y: .82 };
export const BELT_CARRIERS = { low: 12, medium: 20, high: 28 };
export const BELT_LAPS = .12;          // Runden je Spielminute (1× ≈ 8 s je Runde)
export const BELT_MAX_LAPS_S = .3;     // höchstens 0,3 Runden je Sekunde, auch bei hohem Spieltempo
const BELT_FULL = new Set(['working', 'staff', 'power', 'storage', 'broken']);
/** Schleife läuft nur im Betrieb (b.status 'working'); sonst steht sie. */
export function beltRunning(b) { return b?.status === 'working' && b.enabled !== false; }
/** Wagen tragen Pakete im Betrieb und beim Stillstand mitten im Ablauf (Personal, Strom, Lager voll, Defekt); leer bei Bereit/Pausiert. */
export function beltLoaded(b) { return BELT_FULL.has(b?.status) && b.enabled !== false; }
/** Belegung des Wagens i (deterministisch, 60 %). */
export function beltCarrierFull(i) { return (i * 7) % 5 < 3; }
export function beltLength(L = BELT) { return 4 * L.hx + 2 * Math.PI * L.r; }
/** Punkt (lokal, unrotierter Grundriss) und Fahrtrichtung bei Anteil u (0…1) der Schleife; Umlauf gegen den Uhrzeigersinn (Draufsicht, Norden = −z oben). Schreibt in out. */
export function beltPoint(u, out = {}, L = BELT) {
  const { hx, r } = L, straight = 2 * hx, arc = Math.PI * r, total = 2 * straight + 2 * arc;
  let d = (((u % 1) + 1) % 1) * total;
  if (d < straight) { out.x = -hx + d; out.z = r; out.heading = 0; return out; }
  d -= straight;
  if (d < arc) { const a = d / r; out.x = hx + Math.sin(a) * r; out.z = Math.cos(a) * r; out.heading = -a; return out; }
  d -= arc;
  if (d < straight) { out.x = hx - d; out.z = -r; out.heading = Math.PI; return out; }
  d -= straight; const a = d / r; out.x = -hx - Math.sin(a) * r; out.z = -Math.cos(a) * r; out.heading = Math.PI - a; return out;
}
/** Vorschub der Schleife (Anteil 0…1) aus dem Fortschritt der Anzeigeuhr dClock (Spielminuten) in dtSec Sekunden; Pause/Rücksprung → steht. */
export function beltAdvance(phase, dClock, dtSec) {
  if (!(dClock > 0) || !(dtSec > 0)) return phase;
  return (phase + Math.min(dClock * BELT_LAPS, dtSec * BELT_MAX_LAPS_S)) % 1;
}
/** Fehlwürfe zur Nachsortierung am Standort (Chargen mit resort, inbound). */
export function resortQty(state, siteId) { let n = 0; for (const a of state?.batches || []) if (a.site === siteId && a.resort && a.location === 'inbound' && a.qty > 0) n += a.qty; return n; }
/** Lage des Fehlwurfbehälters (Osten) im unrotierten Grundriss. */
export const BELT_REJECT = { x: 2.72, z: 0 };

// ---------- Stapler und Paletten (W2-S2), nur lesend ----------
// Staplerplatz b (type 'forklift', 1×1): b.charge 0–100 (fehlend = 100), Bindung b.task = '<Vorgang>:forklift' (yard.js).
// Vorgang = Fremd-Lkw in s.yard (Phase unloading, Dock a.dock) oder eigene Sendung/Tour (Dock mit b.task = Vorgangs-ID).
// Fahrt Dock ↔ Regal rein optisch aus der Anzeigeuhr (deterministisch, keine Buchung).
export const FORK_MIN = 10;                 // wie yard.js FORKLIFT.min: darunter nicht einsatzbereit
export const FORK_CYCLE = 1;                // Spielminuten je Pendelrunde (≈ 1 Palette/min einer Standardkraft)
export const PALLETS_PER_TRAILER = 8, PALLET_LEVELS = 3, MAX_PALLET_STACKS = 32;
const RACK = /rack|shelf|regal/;
/** Akkustand 0–100 (fehlend = 100). */
export function forkliftCharge(b) { return Number.isFinite(b?.charge) ? Math.max(0, Math.min(100, b.charge)) : 100; }
/** Farbe der Akkuanzeige: grün ≥ 50 %, gelb ≥ 10 %, rot darunter (nicht einsatzbereit). */
export function chargeColor(c) { return c >= 50 ? '#3cbb8e' : c >= FORK_MIN ? '#e4ab4b' : '#cb675d'; }
export function forkliftLabel(b) { return `Stapler · ${Math.round(forkliftCharge(b))} %`; }
/** Ziel der Staplerbindung: {dock, inbound, key} oder null (frei, unbekannt, ohne Dock). */
export function forkliftTarget(state, b, buildings = state?.buildings || []) {
  const key = typeof b?.task === 'string' && b.task.endsWith(':forklift') ? b.task.slice(0, -':forklift'.length) : null; if (!key) return null;
  const a = (state?.yard || []).find(y => y.id === key && y.site === b.site && y.phase === 'unloading');
  // W3b: Container wird entladen (Ware Dock → Regal); während der Hofumfuhr (toDock) steht der Stapler.
  const ct = !a && (state?.containers || []).find(c => c.id === key && c.site === b.site);
  if (ct) { const dock = ct.status === 'unstuffing' && buildings.find(o => o.id === ct.dock && o.type === 'dock'); return dock ? { dock, inbound: true, key } : null; }
  const dock = a ? buildings.find(o => o.id === a.dock && o.type === 'dock') : buildings.find(o => o.type === 'dock' && o.site === b.site && o.task === key);
  return dock ? { dock, inbound: !!a, key } : null;
}
/** Anfahrpunkt einer Anlage auf der Seite zur Hallenmitte (Weltkoordinaten). */
function sidePoint(b, siteH, gap = .45) { const box = buildingBox(b), cx = (box.x0 + box.x1) / 2; return (box.z0 + box.z1) / 2 > siteH / 2 ? { x: cx, z: box.z0 - gap } : { x: cx, z: box.z1 + gap }; }
/**
 * Stapler je Staplerplatz am Standort: Parkpose vor der Ladesäule, Akku, Label, bei Bindung Pendelweg Dock ↔ nächstes Regal.
 * carry: 'out' Ware fährt Dock → Regal (Fremd-Lkw entladen), 'in' Regal → Dock (eigenes Fahrzeug beladen).
 */
export function forkliftPlans(state, siteId, buildings = (state?.buildings || []).filter(b => b.site === siteId)) {
  const site = state?.sites?.find(x => x.id === siteId) || defaultSite(state), H = site.height || 16, racks = buildings.filter(b => RACK.test(b.type)), out = [];
  buildings.filter(b => b.type === 'forklift').forEach((b, i) => {
    const park = toWorld(b, 0, .12, {}), charger = toWorld(b, 0, -.36, {}); park.heading = Math.atan2(Math.cos(park.rot), Math.sin(park.rot));
    const charge = forkliftCharge(b), target = forkliftTarget(state, b, buildings);
    const plan = { id: b.id, park, charger, charge, color: chargeColor(charge), label: forkliftLabel(b), ready: b.enabled !== false && charge >= FORK_MIN, dock: target?.dock.id || null, rack: null, carry: null, path: null, phase: (i * .37) % 1, x: park.x, z: park.z, heading: park.heading, loaded: false };
    if (target) {
      const d = sidePoint(target.dock, H), dc = buildingBox(target.dock);
      let rack = null, best = Infinity; for (const r of racks) { const rb = buildingBox(r), dist = Math.hypot((rb.x0 + rb.x1 - dc.x0 - dc.x1) / 2, (rb.z0 + rb.z1 - dc.z0 - dc.z1) / 2); if (dist < best) { best = dist; rack = r; } }
      const r = rack ? sidePoint(rack, H, .5) : { x: park.x, z: park.z }, mz = (d.z + r.z) / 2;
      plan.path = makePath([pt(d.x, d.z), pt(d.x, mz), pt(r.x, mz), pt(r.x, r.z)], .6, 4);
      plan.carry = target.inbound ? 'out' : 'in'; plan.rack = rack?.id || null;
    }
    forkliftPose(plan, state?.t ?? 0, plan); out.push(plan);
  });
  return out;
}
/** Pose zur Anzeigezeit clock: ungebunden an der Ladesäule; gebunden Hinweg (u < ½) Dock → Regal, Rückweg Regal → Dock, Gabeln voran. */
export function forkliftPose(plan, clock, out = {}) {
  if (!plan.path) { out.x = plan.park.x; out.z = plan.park.z; out.heading = plan.park.heading; out.loaded = false; return out; }
  const c = Number.isFinite(clock) ? clock : 0, u = (((c / FORK_CYCLE + plan.phase) % 1) + 1) % 1, back = u >= .5, t = Math.max(0, Math.min(1, ((back ? u - .5 : u) - .05) / .4));
  pathPose(plan.path, back ? 1 - t : t, out); if (back) out.heading += Math.PI;
  out.loaded = plan.carry === 'out' ? !back : back; return out;
}
/** Paletten auf dem Auflieger eines Fremd-Lkw (nur a.item 'pallet'): Anteil der noch nicht entladenen, höchstens 8 Plätze. */
export function trailerPallets(a) {
  if (a?.item !== 'pallet' || !(a.parcels > 0)) return 0;
  return Math.max(0, Math.min(PALLETS_PER_TRAILER, Math.ceil(PALLETS_PER_TRAILER * (a.parcels - (a.unloaded || 0)) / a.parcels)));
}
/** Palettenstapel (item 'pallet', location stock) an der Regalnordseite: je Platz bis 3 Ebenen, gedeckelt auf MAX_PALLET_STACKS Plätze. */
export function palletLoads(state, siteId, buildings = (state?.buildings || []).filter(b => b.site === siteId)) {
  let stock = 0; for (const a of state?.batches || []) if (a.site === siteId && a.item === 'pallet' && a.location === 'stock' && a.qty > 0) stock += a.qty;
  let anchors = buildings.filter(b => RACK.test(b.type)); if (!anchors.length) anchors = buildings.filter(b => b.type === 'forklift' || b.type === 'dock');
  const slots = [];
  for (const b of anchors) { const d = BUILDINGS[b.type] || { w: 2, h: 2 }, cols = Math.max(1, Math.floor(d.w / .9)); for (let row = 0; row < 2; row++) for (let col = 0; col < cols; col++) slots.push([b, -(cols - 1) * .45 + col * .9, -d.h / 2 - .5 - row * .9]); }
  const places = Math.min(MAX_PALLET_STACKS, slots.length, Math.ceil(stock / PALLET_LEVELS)), pallets = [];
  for (let i = 0; i < places; i++) { const [b, lx, lz] = slots[i], n = Math.min(PALLET_LEVELS, stock - i * PALLET_LEVELS); for (let k = 0; k < n; k++) pallets.push(toWorld(b, lx, lz, { anchor: b.id, level: k })); }
  return { stock, places, pallets };
}

// ---------- Containerhof (W3b-S2), nur lesend ----------
// s.containers (containers.js): status arriving|yard|toDock|unstuffing|empty|pickup|gone, dock (Dock-ID bei toDock/unstuffing), teu (40 Fuß = 2),
// demurrageMinutes (Lagergeld läuft). Containerchassis = s.yard-Eintrag kind 'container' (CONTAINER_PHASES), pickup = Leerabholung.
// Containerhof 4×3 (BUILDINGS.containeryard.teu 8): 2 Spuren × 2 Ebenen = 4 Plätze für 40-Fuß-Container. Chassis halten an der Andockreihe
// in Höhe des Containerhofs (Reach-Stacker setzt um, nur angedeutet). Alle Positionen rein optisch; keine Buchung, kein Schreiben in den Zustand.
export const CONTAINER_TEU = 2, YARD_LEVELS = 2;
export const CONTAINER_LEN = 3.6, CONTAINER_W = .74, CONTAINER_H = .78;
export const YARD_LX = -.1, YARD_Y = .08;            // Mitte der Stellplätze (lokal x) und Auflagerhöhe im Containerhof
export const CHASSIS_LX = -.72, CHASSIS_Y = .58;     // Container auf dem Chassis (lokal x, Ladehöhe)
export const CONTAINER_PHASE_LABEL = { approach: 'Anfahrt', gate: 'Torkontrolle', queue: 'Wartet', toYard: 'Containerhof', drop: 'Abstellen', exit: 'Ausfahrt' };
export const CONTAINER_HEX = ['#b4553f', '#3f6f9e', '#4f8a5b', '#c98a3a', '#7a8590', '#3f8f8a', '#8a5a7a'];
export const DEMURRAGE_HEX = '#d0574a';
const C_IN_YARD = new Set(['yard', 'empty', 'pickup']), C_AT_DOCK = new Set(['toDock', 'unstuffing']), C_OCCUPY = new Set(['yard', 'toDock', 'unstuffing', 'empty', 'pickup']);
/** Plätze je Containerhof (40-Fuß-Container). */
export function yardPlaces() { return Math.max(1, Math.floor((BUILDINGS.containeryard?.teu || 8) / CONTAINER_TEU)); }
const yardLanes = () => Math.ceil(yardPlaces() / YARD_LEVELS);
/** Lokale Spurmitte (z) im unrotierten 4×3-Grundriss; Südrand bleibt für den Reach-Stacker frei. */
export function yardLaneZ(lane) { return -.95 + lane * .85; }
/** Farbe je Vertrag (reedereineutral, deterministisch); ohne Vertrag nach Container-ID. */
export function containerColor(c) { let h = 0; for (const ch of String(c?.contractId || c?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CONTAINER_HEX[h % CONTAINER_HEX.length]; }
/** Leer (empty/pickup bzw. vollständig entladen): optisch heller, Tür offen. */
export function containerEmpty(c) { return c?.status === 'empty' || c?.status === 'pickup' || c?.status === 'gone' || (c?.qty > 0 && c.unloaded >= c.qty); }
export function containerTint(c) { const base = containerColor(c); return containerEmpty(c) ? mixHex(base, '#ffffff', .45) : base; }
export function containerTag(c) { return `CTR-${String(c?.id || '').match(/(\d+)$/)?.[1] || '?'}`; }
/** Label (nur bei Auswahl): „CTR-3 · Entladen 5/20 Paletten · Lagergeld 2 Std.“ */
export function containerLabel(c) {
  const unit = c?.content === 'pallet' ? 'Paletten' : 'Pakete', rest = `${c?.unloaded || 0}/${c?.qty || 0} ${unit}`;
  const st = { arriving: 'Anlieferung', yard: c?.unloaded > 0 ? `Im Containerhof · ${rest}` : `Im Containerhof · ${c?.qty || 0} ${unit}`, toDock: 'Umfuhr zum Dock', unstuffing: `Entladen ${rest}`, empty: 'Leer · wartet auf Abholung', pickup: 'Leer · Abholung', gone: 'Abgeholt' }[c?.status] || c?.status || '';
  let s = `${containerTag(c)} · ${st}`;
  if (c?.waitReason && c.status === 'yard') s += ` · ${c.waitReason}`;
  if (c?.demurrageMinutes > 0) s += ` · Lagergeld ${Math.ceil(c.demurrageMinutes / 60)} Std.`;
  return s;
}
/**
 * Stellplätze im Containerhof: Container mit status yard/empty/pickup erhalten je Standort einen Platz {key, b, k, lane, level}.
 * prev (Map id → Platz bzw. Schlüssel der letzten Zuordnung) hält Plätze stabil; neue Container füllen erst den Boden, dann die zweite Ebene.
 * Wird ein unterer Platz frei, rutscht der obere Container nach (nie schwebend, höchstens 2 hoch). Überzählige bleiben ohne Platz.
 */
export function containerYardSlots(state, siteId, buildings = (state?.buildings || []).filter(b => b.site === siteId), prev = null) {
  const per = yardPlaces(), lanes = yardLanes(), slots = [], map = new Map(), taken = new Map();
  for (const b of buildings) if (b.type === 'containeryard') for (let k = 0; k < per; k++) slots.push({ key: `${b.id}:${k}`, b, k, lane: k % lanes, level: Math.floor(k / lanes) });
  const byKey = new Map(slots.map(x => [x.key, x])), list = [];
  (state?.containers || []).forEach((c, i) => { if (c && c.site === siteId && C_IN_YARD.has(c.status)) list.push([c, i]); });
  list.sort((p, q) => (p[0].arrivedAt ?? 0) - (q[0].arrivedAt ?? 0) || p[1] - q[1]);
  const rest = [];
  for (const [c] of list) { const o = prev?.get(c.id), key = typeof o === 'string' ? o : o?.key, x = key && byKey.get(key); if (x && !taken.has(key)) { taken.set(key, c); map.set(c.id, x); } else rest.push(c); }
  for (const c of rest) { const x = slots.find(o => !taken.has(o.key)); if (!x) break; taken.set(x.key, c); map.set(c.id, x); }
  for (const x of slots) {
    if (!x.level || !taken.has(x.key)) continue; let to = x;
    for (let l = x.level - 1; l >= 0; l--) { const d = byKey.get(`${x.b.id}:${x.lane + l * lanes}`); if (!d || taken.has(d.key)) break; to = d; }
    if (to !== x) { const c = taken.get(x.key); taken.delete(x.key); taken.set(to.key, c); map.set(c.id, to); }
  }
  return { map, slots, containers: list.map(p => p[0]) };
}
/** Weltpose eines Stellplatzes (Mitte unten, Drehung wie die Anlage). */
export function yardSlotPose(slot, out = {}) { toWorld(slot.b, YARD_LX, yardLaneZ(slot.lane), out); out.y = YARD_Y + slot.level * CONTAINER_H; return out; }
/** Belegung je Containerhof in Plätzen wie containers.teuUsed (inkl. angelieferter Container ab toYard), der Reihe nach auf die Höfe verteilt. */
export function containerYardUse(state, siteId, buildings = (state?.buildings || []).filter(b => b.site === siteId)) {
  const per = yardPlaces(), admitted = new Set();
  for (const a of state?.yard || []) if (a?.kind === 'container' && !a.pickup && a.site === siteId && (a.phase === 'toYard' || a.phase === 'drop')) for (const id of a.containerIds || []) admitted.add(id);
  let teu = 0; for (const c of state?.containers || []) if (c?.site === siteId && (C_OCCUPY.has(c.status) || (c.status === 'arriving' && admitted.has(c.id)))) teu += c.teu || CONTAINER_TEU;
  let left = Math.ceil(teu / CONTAINER_TEU);
  return buildings.filter(b => b.type === 'containeryard').map(b => { const used = Math.min(per, left); left -= used; return { id: b.id, used, cap: per }; });
}
export function containerYardLabel(u) { return `Containerhof · ${u?.used ?? 0}/${u?.cap ?? yardPlaces()} Plätze`; }
/** Halteplatz eines Chassis am Containerhof: Andockreihe in Höhe der Hofmitte (Heck zur Halle). */
export function yardBayPose(L, b, len = FOREIGN_LEN) { const box = buildingBox(b); return dockSlotPose(L, Math.max(1, Math.min(L.W - 1, (box.x0 + box.x1) / 2)), len); }
/**
 * Weg zu einem Platz an der Andockreihe (Dock oder Containerhof): vom Warteplatz rückwärts ausparken, von der Andockreihe vorwärts zur Hofgasse,
 * an der Zielspalte vorbei und rückwärts einsetzen (Heck voran). Funktioniert von Westen und Osten.
 */
export function bayPath(L, from, to) {
  const T = YARD_TURN, pts = [pt(from.x, from.z)], parked = Math.abs(Math.sin(from.heading) + 1) < .05 && from.z < L.laneZ - 1 && from.x < L.queue.x1;
  let x = from.x;
  if (parked) { pts.push(pt(from.x, L.laneZ, true), pt(from.x - T, L.laneZ, true)); x = from.x - T; }
  else if (Math.abs(from.z - L.laneZ) > .05) pts.push(pt(from.x, L.laneZ));
  pts.push(pt(to.x + (x > to.x ? -T : T), L.laneZ), pt(to.x, L.laneZ, true), pt(to.x, to.z, true));
  return makePath(pts);
}
export function containerArrivalTone(a) {
  switch (a?.phase) {
    case 'queue': return 'wait';
    case 'toYard': return 'move';
    case 'drop': return a.waitReason ? 'wait' : 'dock';
    case 'gate': return a.waitReason ? 'wait' : 'gate';
    default: return 'gate';
  }
}
/** Chassis-Label: „Kennzeichen · Containerhof|Abstellen|…“, Leerabholung „Kennzeichen · Abholung · …“, mehrere Container, Wartegrund. */
export function containerArrivalLabel(a) {
  const phase = a?.pickup && a.phase === 'drop' ? 'Aufnehmen' : CONTAINER_PHASE_LABEL[a?.phase] || a?.phase || '', n = a?.containers || a?.containerIds?.length || 1;
  let s = `${a?.plate || a?.id || 'Chassis'} · ${a?.pickup ? 'Abholung · ' : ''}${phase}`;
  if (!a?.pickup && n > 1) s += ` · ${n} Container`;
  return a?.waitReason ? `${s} · ${a.waitReason}` : s;
}
/**
 * Darstellungsplan eines Containerchassis (Zugmaschine + Chassis, Container wenn beladen). ctx wie arrivalPlan; ctx.dock = Halteplatz am Containerhof.
 * Anlieferung beladen bis Ende drop, Abholung beladen ab exit. Interpolation wie Fremd-Lkw (phaseStart/phaseEnd).
 */
export function containerChassisPlan(L, a, ctx = {}) {
  if (!a || !CONTAINER_PHASE_LABEL[a.phase]) return null;
  const g = gatePose(L), yard = ctx.dock || null, timed = Number.isFinite(a.phaseStart) && Number.isFinite(a.phaseEnd), loaded = a.pickup ? a.phase === 'exit' : a.phase !== 'exit';
  const base = containerColor({ contractId: a.contractId, id: a.containerIds?.[0] });
  const plan = { id: a.id, phase: a.phase, path: null, t0: timed ? a.phaseStart : null, t1: timed ? a.phaseEnd : null, pose: g, fixedHeading: null, tone: containerArrivalTone(a), label: containerArrivalLabel(a), color: carrierColor(a.carrier), x: g.x, z: g.z, heading: g.heading, pallet: false, pallets: 0, container: true, pickup: !!a.pickup, loaded, ccolor: loaded ? (a.pickup ? mixHex(base, '#ffffff', .45) : base) : null };
  switch (a.phase) {
    case 'approach': plan.path = approachPath(L); break;
    case 'gate': break;
    case 'queue': {
      const place = plan.pose = queuePlace(L, Math.max(0, ctx.rank ?? 0));
      if (ctx.slide) { plan.path = makePath([pt(ctx.slide.from.x, ctx.slide.from.z), pt(place.x, place.z)]); plan.t0 = ctx.slide.at; plan.t1 = ctx.slide.at + QUEUE_DRIVE; plan.fixedHeading = place.heading; }
      else if (Number.isFinite(a.phaseStart)) { plan.path = queueEntryPath(L, place); plan.t0 = a.phaseStart; plan.t1 = a.phaseStart + QUEUE_DRIVE; }
      break;
    }
    case 'toYard': { const from = ctx.from || g; plan.pose = from; if (yard) plan.path = bayPath(L, from, yard); break; }
    case 'drop': plan.pose = yard || g; plan.t0 = plan.t1 = null; break;
    case 'exit': plan.path = exitPath(L, yard || g); break;
  }
  if (plan.path && plan.t1 == null) plan.pose = pathPose(plan.path, 1, {});
  arrivalPose(plan, plan.t0 ?? 0, plan);
  return plan;
}
/**
 * Container am Dock (status toDock/unstuffing, Dock über container.dock): steht auf Hofchassis mit Zugmaschine am Andockplatz.
 * toDock fährt von fromPose(c) (Containerhof) zwischen statusAt und moveEnd zum Dock (Hofumfuhr), unstuffing steht.
 */
export function dockContainerPlans(state, siteId, buildings, L, fromPose = () => null) {
  const out = [];
  for (const c of state?.containers || []) {
    if (c?.site !== siteId || !C_AT_DOCK.has(c.status)) continue;
    const dock = dockPoseFor(L, buildings, c.dock); if (!dock) continue;
    const plan = { id: c.id, status: c.status, dock: c.dock, pose: dock, path: null, t0: null, t1: null, fixedHeading: null, x: dock.x, z: dock.z, heading: dock.heading, color: containerTint(c), demurrage: c.demurrageMinutes > 0, label: containerLabel(c) };
    if (c.status === 'toDock' && Number.isFinite(c.statusAt) && Number.isFinite(c.moveEnd) && c.moveEnd > c.statusAt) { const from = fromPose(c); if (from) { plan.path = bayPath(L, from, dock); plan.t0 = c.statusAt; plan.t1 = c.moveEnd; } }
    arrivalPose(plan, plan.t0 ?? 0, plan); out.push(plan);
  }
  return out;
}

// ---------- Geometrie-Werkzeuge ----------

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const colorCache = new Map();
function col(hex) { let c = colorCache.get(hex); if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); } return c; }
let PRIMS = null;
function prims() { return PRIMS ||= { box: new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), cyl6: new THREE.CylinderGeometry(.5, .5, 1, 6).translate(0, .5, 0), cyl10: new THREE.CylinderGeometry(.5, .5, 1, 10).translate(0, .5, 0), cone: new THREE.ConeGeometry(.5, 1, 7).translate(0, .5, 0), ball: new THREE.IcosahedronGeometry(.5, 0), plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) }; }

/** Sammelt Grundkörper als nicht indizierte Dreiecke mit Vertexfarbe; ergibt eine Geometrie = 1 Draw Call. */
class Parts {
  constructor() { this.p = []; this.n = []; this.c = []; this.base = new THREE.Matrix4(); }
  add(geo, matrix, hex) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index, cnt = idx ? idx.count : pos.count, c = col(hex);
    _m2.multiplyMatrices(this.base, matrix); _nm.getNormalMatrix(_m2);
    for (let i = 0; i < cnt; i++) {
      const j = idx ? idx.getX(i) : i;
      _v.fromBufferAttribute(pos, j).applyMatrix4(_m2); this.p.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(nor, j).applyMatrix3(_nm).normalize(); this.n.push(_n.x, _n.y, _n.z);
      this.c.push(c.r, c.g, c.b);
    }
  }
  /** Quader: Ecke (x,y,z), Maße (sx,sy,sz). */
  box(x, y, z, sx, sy, sz, hex) { _m.makeScale(Math.max(.001, sx), Math.max(.001, sy), Math.max(.001, sz)).setPosition(x + sx / 2, y, z + sz / 2); this.add(prims().box, _m, hex); }
  /** Zylinder: Mittelpunkt (cx,cz), Boden y, Radius r, Höhe h. */
  cyl(cx, y, cz, r, h, hex, smooth = false) { _m.makeScale(r * 2, h, r * 2).setPosition(cx, y, cz); this.add(smooth ? prims().cyl10 : prims().cyl6, _m, hex); }
  cone(cx, y, cz, r, h, hex) { _m.makeScale(r * 2, h, r * 2).setPosition(cx, y, cz); this.add(prims().cone, _m, hex); }
  ball(cx, y, cz, r, hex) { _m.makeScale(r * 2, r * 2, r * 2).setPosition(cx, y, cz); this.add(prims().ball, _m, hex); }
  /** Flache Bodenfläche (Ecke x,z; Höhe y). */
  quad(x, z, sx, sz, y, hex) { _m.makeScale(sx, 1, sz).setPosition(x + sx / 2, y, z + sz / 2); this.add(prims().plane, _m, hex); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
}

/** Low-Poly-Modell einer Anlage im unrotierten Grundriss d.w × d.h, Ursprung Mitte. */
function buildingModel(P, type, d) {
  const hw = d.w / 2, hh = d.h / 2, tint = d.color || '#42a594';
  const plinth = (c = '#6f8584') => P.box(-hw + .06, 0, -hh + .06, d.w - .12, .12, d.h - .12, c);
  switch (type) {
    case 'assembly':
      plinth(); P.box(-hw + .2, .12, -hh + .2, d.w - .4, .55, d.h - .4, tint); P.box(-hw + .14, .67, -hh + .14, d.w - .28, .06, d.h - .28, '#e2e9dd');
      P.cyl(.35, .73, -.3, .17, .12, '#e9a63c'); P.box(.28, .85, -.37, .14, .56, .14, '#efb74f'); P.box(-.3, 1.33, -.37, .72, .13, .14, '#efb74f'); P.box(-.34, 1.08, -.4, .1, .26, .2, '#5d6d70');
      P.box(-.6, .73, .05, .45, .18, .32, '#f0c27a'); P.box(-hw + .26, .73, hh - .5, .06, .36, .32, '#173f46'); break;
    case 'testing':
      plinth(); P.box(-hw + .2, .12, -hh + .2, d.w - .4, .5, d.h - .4, tint); P.box(-.62, .62, -.6, 1.24, .74, .95, '#dfe5ea'); P.box(-.46, .78, .35, .92, .4, .03, '#3d5b6b');
      P.box(-.72, .62, -.7, .08, .9, .08, '#8f7bd0'); P.box(.64, .62, -.7, .08, .9, .08, '#8f7bd0'); P.box(-.72, 1.45, -.7, 1.44, .08, .08, '#8f7bd0'); P.cyl(.6, 1.36, .45, .07, .12, '#f2c363'); break;
    case 'packing':
      plinth(); P.box(-hw + .2, .12, -hh + .2, d.w - .4, .38, d.h - .4, tint); P.box(-hw + .12, .5, -.28, d.w - .24, .1, .56, '#4f6667');
      for (let i = 0; i < 5; i++) P.box(-hw + .25 + i * .35, .6, -.26, .05, .02, .52, '#9fb0ae');
      P.box(-.55, .62, -.18, .38, .3, .36, '#d9b37a'); P.box(.25, .5, .38, .5, .4, .45, '#d9b37a'); P.box(.3, .9, .42, .4, .3, .38, '#e3c08a'); P.box(-.75, .62, .35, .3, .5, .3, '#7d8f8c'); break;
    case 'rack': {
      for (const x of [-hw + .05, 0 - .04, hw - .13]) for (const z of [-hh + .08, hh - .16]) P.box(x, 0, z, .08, 1.75, .08, '#5f8aa0');
      for (const y of [.15, .8, 1.45]) { P.box(-hw + .05, y, -hh + .08, d.w - .1, .07, .07, '#e08a3c'); P.box(-hw + .05, y, hh - .15, d.w - .1, .07, .07, '#e08a3c'); P.box(-hw + .05, y + .07, -hh + .1, d.w - .1, .025, d.h - .2, '#c9d3d0'); }
      break;
    }
    case 'dock':
      P.box(-hw + .05, 0, -hh + .05, d.w - .1, .5, d.h - .1, '#c9cdc4'); P.box(-.72, .5, hh - .95, 1.44, .03, .88, '#7c8580'); P.box(-hw + .05, .5, hh - .13, d.w - .1, .025, .08, '#f2c363');
      for (const x of [-.95, .8]) { P.box(x, .12, hh - .08, .15, .3, .1, '#2e3a3c'); P.box(x - .05, .5, hh - .2, .12, 2.1 - .5, .12, tint); }
      P.box(-1, 2.0, hh - .2, 2.07, .2, .12, tint); P.box(-.83, 1.25, hh - .14, 1.66, .75, .05, '#9fb3b8'); P.box(-hw + .05, .5, -hh + .05, .5, .55, .5, '#d0b48b'); break;
    case 'power':
      P.box(-hw + .1, 0, -hh + .1, d.w - .2, .4, d.h - .2, '#788f96'); P.box(-.6, .4, -.55, 1.2, .85, 1.0, '#9aaeb2');
      for (let i = 0; i < 4; i++) P.box(-.55 + i * .3, .45, .45, .08, .7, .22, '#7f949a');
      for (let i = 0; i < 3; i++) P.cyl(-.35 + i * .35, 1.25, -.1, .07, .22, '#e6e9ea', true);
      P.box(-hw + .1, .4, -hh + .1, d.w - .2, .06, .06, tint); P.box(-hw + .1, .4, hh - .16, d.w - .2, .06, .06, tint); break;
    case 'workshop':
      P.box(-hw + .15, 0, -hh + .15, d.w - .3, .9, d.h - .3, '#ebdfd2'); P.box(-hw + .07, .9, -hh + .07, d.w - .14, .12, d.h - .14, tint); P.box(-hw + .1, 1.02, -.28, d.w - .2, .18, .56, '#b98790');
      P.box(-.45, .05, hh - .17, .9, .7, .04, '#7d8c8f'); P.box(.45, .1, -hh + .1, .4, .55, .1, '#c27b56'); break;
    case 'research':
      P.box(-hw + .14, 0, -hh + .14, d.w - .28, 1.15, d.h - .28, '#eef1ea'); P.box(-hw + .1, .55, -hh + .1, d.w - .2, .32, d.h - .2, '#5b8fa3'); P.box(-hw + .08, 1.15, -hh + .08, d.w - .16, .08, d.h - .16, tint);
      P.box(.3, 1.23, -.4, .8, .22, .6, '#c4ccd0'); P.cyl(-.9, 1.23, .2, .03, .38, '#7c8a8f'); P.cyl(-.9, 1.6, .2, .18, .04, '#dfe5e8', true); break;
    case 'coldstore':
      P.box(-hw + .1, 0, -hh + .1, d.w - .2, 1.3, d.h - .2, '#f3f7f8'); P.box(-hw + .07, .12, -hh + .07, d.w - .14, .2, d.h - .14, tint);
      for (const x of [-.85, .25]) { P.box(x, 1.3, -.45, .7, .22, .7, '#c4ccd0'); P.cyl(x + .35, 1.52, -.1, .22, .04, '#4b5a60', true); }
      P.box(-.4, .05, hh - .13, .8, 1.0, .05, '#a8c6cc'); break;
    case 'terminal':
      P.box(-hw + .1, 0, -hh + .1, 1.25, 1.2, d.h - .2, '#ece8f7'); P.box(-hw + .07, .8, -hh + .07, 1.31, .16, d.h - .14, tint); P.box(-hw + .07, 1.2, -hh + .07, 1.31, .06, d.h - .14, '#8f84b8');
      P.box(-.1, 0, -.75, 1.35, .55, .6, '#c96f4a'); P.box(-.1, 0, .05, 1.35, .55, .6, '#4f86a6'); P.box(-.1, .55, -.75, 1.35, .55, .6, '#7ea36a');
      for (const x of [-.25, 1.35]) P.box(x, 0, -hh + .1, .08, 1.35, d.h - .2, '#f2c363'); break;
    case 'crossbelt': {
      // Quergurtsorter 6×3 (0.15): Schleife auf Stützen mit Antriebsmittelteil (Wagen sind Instanzen, s. placeBelts), zwei Einschleusbänder und
      // Scannerportal an der Nordseite (−z), Endstellen (Rutsche + Behälter) Süd und Nordost, Fehlwurfbehälter Ost, Schaltschrank mit Signalsäule.
      const { hx, r } = BELT, deck = .7, half = .27, rail = '#5b6b6e', frame = '#5f7478';
      plinth('#6f8584');
      for (const x of [-hx, -hx / 2, 0, hx / 2, hx]) for (const z of [-r, r]) P.box(x - .04, .12, z - .04, .08, deck - .12, .08, frame);
      P.box(-hx, .12, -r + half, 2 * hx, deck - .08, 2 * (r - half), tint); P.box(-hx - .05, deck - .02, -r + half - .02, 2 * hx + .1, .05, 2 * (r - half) + .04, '#d3dadb');
      for (const z of [-r, r]) { P.box(-hx, deck, z - half, 2 * hx, .06, 2 * half, rail); P.box(-hx, deck + .06, z + (z > 0 ? half : -half - .04), 2 * hx, .07, .04, tint); }
      for (const cx of [-hx, hx]) {
        P.cyl(cx, .12, 0, r - half - .02, deck - .1, tint, true);
        for (let k = 0; k < 8; k++) {
          const a = (k + .5) / 8 * Math.PI, sx = cx > 0 ? 1 : -1, x = cx + sx * Math.sin(a) * r, z = Math.cos(a) * r;
          P.add(prims().box, _m.compose(_p.set(x, deck, z), _q.setFromAxisAngle(_up, sx > 0 ? a : -a), _s.set(Math.PI * r / 8 * 1.12, .06, 2 * half)), rail);
          P.add(prims().box, _m.compose(_p.set(cx + sx * Math.sin(a) * (r + half + .02), deck + .06, Math.cos(a) * (r + half + .02)), _q.setFromAxisAngle(_up, sx > 0 ? a : -a), _s.set(Math.PI * (r + half) / 8 * 1.12, .07, .04)), tint);
          P.box(x - .03, .12, z - .03, .06, deck - .12, .06, frame);
        }
      }
      // Endstellen: Rutsche (schräg nach außen) und Behälter mit Paketen.
      const chute = (x, side) => {
        const z0 = side * (r + half + .04);
        P.add(prims().box, _m.compose(_p.set(x, .52, z0 + side * .2), _q.setFromAxisAngle(_v.set(1, 0, 0), side * .55), _s.set(.46, .03, .44)), '#a9b8bb');
        P.box(x - .24, .12, side > 0 ? hh - .4 : -hh + .12, .48, .28, .28, '#4f6667'); P.box(x - .16, .4, side > 0 ? hh - .34 : -hh + .18, .2, .08, .16, '#d9b37a'); P.box(x + .02, .4, side > 0 ? hh - .32 : -hh + .2, .14, .1, .12, '#e3c08a');
      };
      for (let i = 0; i < 6; i++) chute(-hx + i * .7, 1);
      for (const x of [.35, 1.05, 1.75]) chute(x, -1);
      // Einschleusung: zwei Zuführbänder mit Aufgabetisch von Norden.
      for (const x of [-1.95, -1.15]) { P.box(x - .2, .12, -hh + .1, .4, .48, .5, '#c7cfcb'); P.box(x - .18, .6, -hh + .1, .36, .04, .55, '#2f3a3c'); P.box(x - .2, .6, -hh + .08, .04, .08, .57, tint); P.box(x + .16, .6, -hh + .08, .04, .08, .57, tint); P.box(x - .1, .64, -hh + .2, .2, .14, .2, '#d9b37a'); }
      // Scannerportal über der Nordgeraden.
      P.box(-.45, .12, -r - half - .12, .07, 1.2, .07, tint); P.box(-.45, .12, -.12, .07, 1.2, .07, tint); P.box(-.48, 1.3, -r - half - .14, .13, .13, r + half + .1, tint); P.box(-.47, 1.12, -r - .1, .11, .16, .2, '#2e3a3c');
      // Fehlwurfbehälter Ost (rot), Rutsche vom Schleifenkopf.
      P.add(prims().box, _m.compose(_p.set(hx + r + half + .02, .52, 0), _q.setFromAxisAngle(_v.set(0, 0, 1), -.5), _s.set(.3, .03, .4)), '#a9b8bb');
      P.box(BELT_REJECT.x - .17, .12, -.27, .34, .3, .54, '#cb675d'); P.box(BELT_REJECT.x - .17, .42, -.27, .34, .03, .04, '#f2c363'); P.box(BELT_REJECT.x - .17, .42, .23, .34, .03, .04, '#f2c363');
      // Schaltschrank mit Signalsäule (Südwest), Antriebskasten.
      P.box(-hw + .1, .12, hh - .42, .32, .9, .3, '#d3dadb'); P.box(-hw + .14, .5, hh - .115, .24, .3, .01, '#2e3a3c');
      P.cyl(-hw + .26, 1.02, hh - .27, .04, .2, '#5d6d70'); P.cyl(-hw + .26, 1.22, hh - .27, .07, .1, '#3cbb8e'); P.cyl(-hw + .26, 1.32, hh - .27, .07, .1, '#e4ab4b'); P.cyl(-hw + .26, 1.42, hh - .27, .07, .1, '#cb675d');
      break;
    }
    case 'sorter': {
      // Sortierplatz 3×2: Aufgabetisch (−x), Förderband mit Rollen, Scanner-Portal, drei Rutschen zur Ausgangsseite (+z), Schaltschrank mit Signalsäule.
      plinth();
      for (const x of [-1.3, -.45, .4, 1.25]) for (const z of [-.32, .22]) P.box(x, .12, z, .07, .42, .07, '#5f7478');
      P.box(-1.4, .54, -.36, 2.8, .08, .66, '#5b6b6e'); P.box(-1.38, .62, -.3, 2.76, .025, .54, '#2f3a3c');
      for (let i = 0; i < 12; i++) P.box(-1.34 + i * .232, .645, -.3, .03, .008, .54, '#7b8b8e');
      P.box(-1.4, .62, -.37, 2.8, .08, .05, tint); P.box(-1.4, .62, .25, 2.8, .08, .05, tint);
      P.box(-hw + .08, .12, -.45, .5, .55, .85, '#c7cfcb'); P.box(-hw + .14, .67, -.4, .38, .18, .3, '#d9b37a');
      P.box(-.55, .62, -.48, .08, .72, .08, tint); P.box(-.55, .62, .34, .08, .72, .08, tint); P.box(-.58, 1.3, -.5, .14, .14, .94, tint); P.box(-.56, 1.12, -.2, .1, .18, .32, '#2e3a3c');
      for (const x of [-.1, .55, 1.15]) { P.box(x, .3, .3, .42, .06, .55, '#a9b8bb'); P.box(x - .02, .1, .8, .46, .3, .16, '#4f6667'); P.box(x + .06, .4, .82, .3, .2, .1, '#d9b37a'); }
      for (const x of [-1.15, .05, .95]) P.box(x, .64, -.18, .26, .16, .28, x > 0 ? '#e3c08a' : '#d9b37a');
      P.box(hw - .5, .12, -hh + .12, .38, .9, .3, '#d3dadb'); P.cyl(hw - .31, 1.02, -hh + .27, .04, .2, '#5d6d70'); P.cyl(hw - .31, 1.22, -hh + .27, .07, .1, '#3cbb8e'); P.cyl(hw - .31, 1.32, -hh + .27, .07, .1, '#e4ab4b'); P.cyl(hw - .31, 1.42, -hh + .27, .07, .1, '#cb675d');
      break;
    }
    case 'forklift':
      // Staplerplatz 1×1: Bodenmarkierung, Ladesäule an der Rückseite (−z) mit Anzeigefeld (Akkubalken dynamisch), Ladekabel.
      P.box(-hw + .04, 0, -hh + .04, d.w - .08, .02, d.h - .08, '#c3cbc6');
      for (let i = 0; i < 4; i++) P.box(-hw + .06 + i * .24, .02, hh - .12, .12, .006, .06, i % 2 ? '#3f4f50' : '#f2c363');
      P.box(-hw + .04, .02, -hh + .04, .04, .006, d.h - .08, '#f2c363'); P.box(hw - .08, .02, -hh + .04, .04, .006, d.h - .08, '#f2c363');
      P.box(-.2, 0, -hh + .04, .4, .1, .26, '#788f96'); P.box(-.16, .1, -hh + .08, .32, 1.05, .18, '#d3dadb'); P.box(-.18, 1.15, -hh + .06, .36, .06, .22, tint);
      P.box(-.13, .3, -hh + .26, .26, .7, .012, '#2e3a3c'); P.box(.12, .55, -hh + .26, .05, .05, .2, '#5d6d70'); P.box(.15, .2, -hh + .44, .03, .37, .03, '#2e3a3c');
      break;
    case 'containeryard': {
      // Containerhof 4×3 (W3b): Betonfläche, je Spur Stellplatzmarkierung mit Auflagern (40 Fuß, bis 2 hoch), Fahrspur und Reach-Stacker
      // (angedeutet) am Südrand, Leuchtmast. Container selbst sind Instanzen (Belegung aus s.containers).
      P.box(-hw + .04, 0, -hh + .04, d.w - .08, .02, d.h - .08, '#98a2a1');
      const sl = CONTAINER_LEN + .16, sw = CONTAINER_W + .1, line = '#f4f5ec';
      for (let lane = 0; lane < Math.ceil(yardPlaces() / YARD_LEVELS); lane++) {
        const x0 = YARD_LX - sl / 2, z0 = yardLaneZ(lane) - sw / 2;
        P.box(x0, .02, z0, sl, .006, .035, line); P.box(x0, .02, z0 + sw - .035, sl, .006, .035, line); P.box(x0, .02, z0, .035, .006, sw, line); P.box(x0 + sl - .035, .02, z0, .035, .006, sw, line);
        for (const x of [x0 + .1, x0 + sl - .18]) for (const z of [z0 + .07, z0 + sw - .15]) P.box(x, .02, z, .08, .03, .08, '#5d6d70');
      }
      P.box(-hw + .12, .02, .44, d.w - .24, .006, .035, '#f2c363');
      // Reach-Stacker: Fahrgestell, Gegengewicht, Kabine, schräger Ausleger mit Spreader über der Spur.
      P.box(.35, .02, .62, 1.25, .26, .62, '#e9a63c'); P.box(1.42, .02, .6, .2, .46, .66, '#3c4a4d'); P.box(.42, .28, .7, .36, .44, .46, '#355862'); P.box(.4, .72, .68, .4, .04, .5, '#e9a63c');
      for (const x of [.55, 1.35]) for (const z of [.6, 1.16]) { const r = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(.34, .1, .34)).setPosition(x, .19, z + .04); P.add(prims().cyl10, r, '#2f3a3d'); }
      { const len = 1.7, ang = .42, cx = .62, cy = 1.0; P.add(prims().box, new THREE.Matrix4().compose(_p.set(cx, cy - .07, .93), _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang + Math.PI), _s.set(len, .14, .16)), '#e9a63c');
        const tx = cx - Math.cos(ang) * len / 2; P.box(tx - .06, cy - .1 + Math.sin(ang) * len / 2 - .15, .55, .12, .12, .78, '#3c4a4d'); }
      P.cyl(hw - .16, .02, hh - .16, .04, 2.5, '#7d8c8f'); P.box(hw - .5, 2.48, hh - .2, .4, .06, .08, '#7d8c8f'); P.box(hw - .5, 2.42, hh - .22, .3, .06, .12, '#fff1c8');
      break;
    }
    default:
      plinth(); P.box(-hw + .2, .12, -hh + .2, d.w - .4, .8, d.h - .4, tint);
  }
}
/** Instanzgeometrien mit Vertexfarben (Instanzfarbe multipliziert). */
function mergedGeo(build) { const P = new Parts(); build(P); return P.geometry(); }

// ---------- Szene ----------

const TONE_HEX = { active: '#3cbb8e', blocked: '#e4ab4b', idle: '#95aaa5' };
export const CHIP_TONES = ['wait', 'move', 'gate', 'dock', 'idle', 'infra', 'bad'];
/**
 * Label-Stil (W2c). Tokens von A10 über :root, hier nur mit Rückfallwerten gelesen: --wait/--move/--neutral/--good/--bad/--teal (Punktfarbe),
 * --wait-bg/--bad-bg (Hintergrund wartend/Fehler), --chip-bg/--chip-ink/--chip-muted/--chip-line, nachts --chip-bg-night/--chip-ink-night/--chip-muted-night.
 */
export const CHIP_CSS = `.scene3d-chip{display:flex;align-items:center;gap:4px;padding:2px 7px 2px 5px;border-radius:999px;font:500 10px/1.3 var(--chip-font,system-ui,-apple-system,"Segoe UI",sans-serif);font-variant-numeric:tabular-nums;color:var(--chip-ink,var(--ink,#182d2a));background:var(--chip-bg,rgba(255,255,255,.93));border:1px solid var(--chip-line,var(--glass-line,rgba(24,45,42,.12)));box-shadow:0 1px 4px rgba(20,40,35,.16)}
.scene3d-chip b{font-weight:700;letter-spacing:.1px}.scene3d-chip small{font-size:9px;color:var(--chip-muted,var(--muted,#5d6b66))}.scene3d-chip small:empty{display:none}
.scene3d-sep{display:none}.scene3d-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dot);box-shadow:0 0 0 1.5px rgba(255,255,255,.7)}
.scene3d-chip.tone-wait{--dot:var(--wait,#d39a12);background:var(--wait-bg,#fff3d1)}.scene3d-chip.tone-bad{--dot:var(--bad,#c4452f);background:var(--bad-bg,#fbe3dd)}
.scene3d-chip.tone-move{--dot:var(--move,#2f6bd0)}.scene3d-chip.tone-gate,.scene3d-chip.tone-idle{--dot:var(--neutral,#8f9a96)}.scene3d-chip.tone-dock{--dot:var(--good,#3f8a57)}.scene3d-chip.tone-infra{--dot:var(--teal,#267a68)}
.scene3d-labels.night .scene3d-chip{color:var(--chip-ink-night,#eef4f0);background:var(--chip-bg-night,rgba(17,29,30,.86));border-color:rgba(255,255,255,.14);box-shadow:0 1px 6px rgba(0,0,0,.35)}
.scene3d-labels.night .scene3d-chip small{color:var(--chip-muted-night,#b3c2bc)}.scene3d-labels.night .scene3d-dot{box-shadow:0 0 5px var(--dot)}
.scene3d-labels.night .scene3d-chip.tone-wait{background:var(--chip-wait-night,rgba(74,54,8,.9))}.scene3d-labels.night .scene3d-chip.tone-bad{background:var(--chip-bad-night,rgba(84,30,22,.9))}
.scene3d-labels.night .scene3d-chip.tone-infra{--dot:var(--accent,#c7ed76)}`;
/** Stilblock einmal je Dokument einfügen. */
function injectChipStyle(doc) { if (!doc?.head || doc.getElementById('scene3d-chip-style')) return; const st = doc.createElement('style'); st.id = 'scene3d-chip-style'; st.textContent = CHIP_CSS; doc.head.appendChild(st); }
const CAM_KEYS = ['tx', 'tz', 'dist', 'yaw'];
export const VEH_LEN = { van: 3.0, truck: 4.2, refrigerated: 4.0 };
const CAB_HEX = { van: '#5ea7a3', truck: '#ebac53', refrigerated: '#6b9fd6' };
const BOX_HEX = { van: '#f1f3ec', truck: '#eef0e8', refrigerated: '#d9eef3' };

export class Scene3D {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas; this.callbacks = callbacks; this.state = null; this.view = 'hall'; this.labelMode = 'all';
    this.build = null; this.buildRotation = 0; this.movingId = null; this.hover = null; this.selected = null; this.ghostCache = null;
    this.dead = false; this.listeners = []; this.width = 1; this.height = 1; this.signature = ''; this.sigDirty = true; this.dynDirty = true; this.needs = true;
    this.quarter = 0; this.scale = 1; this.cam = { tx: 10, tz: 8, dist: 30, yaw: Math.PI / 4 }; this.goal = { tx: 10, tz: 8, dist: 30, yaw: Math.PI / 4 }; this.animating = false;
    this.clock = { base: null, at: 0, rate: 0, shown: null }; this.fleet = []; this.yardFleet = []; this.yardMap = null; this.boxes = []; this.infra = []; this.pins = []; this.transfers = []; this.trips = []; this.airTrips = []; this.airNode = null; this.plane = null; this.netLineKey = null;
    this.res = { ratio: Math.min(window.devicePixelRatio || 1, 1.5), max: Math.min(window.devicePixelRatio || 1, 1.5), min: .75, avg: 0, cond: null, since: null, lastDrop: null };
    // Grafikqualität (0.15-S4): ohne setQuality wie bisher 'high'; app.js setzt prefs.quality (Standard 'auto').
    this.qualityMode = 'high'; this.qualityLevel = 'high'; this.q = QUALITY.high; this.auto = autoQualityState(); this.lodKey = '';
    this.lastFrame = 0; this.renderedLast = false; this.layout = yardLayout(defaultSite(null));
    // Wiederverwendete Objekte für die Hot-Loop.
    this.tmp = { pose: { x: 0, z: 0, heading: 0 }, ndc: new THREE.Vector2(), hit: { x: 0, z: 0 }, ray: new THREE.Raycaster(), labelOut: [], cands: [], candPool: [] };

    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(this.res.ratio); renderer.setClearColor(0xdfe9e6, 1); renderer.shadowMap.enabled = false;
    canvas.style.touchAction = 'none'; canvas.dataset.renderer = '3d';
    // Messgriff für Browserprüfung/A12 (renderInfo, cellToScreen); nicht aufzählbar, kein Spielzustand.
    Object.defineProperty(canvas, '__scene', { value: this, configurable: true });
    canvas.setAttribute('aria-label', 'Betriebsgelände – 3D-Ansicht. Ziehen zum Verschieben, Mausrad zum Zoomen. Gebäude alternativ in Fertigungsübersicht auswählen.');
    const scene = this.scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe9e6); scene.fog = new THREE.Fog(0xdfe9e6, 70, 150);
    const hemi = this.hemi = new THREE.HemisphereLight(0xf6f9ff, 0xb5c2a2, 2.1); scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e2, 2.0); sun.position.set(-18, 34, 22); scene.add(sun);
    this.themeMode = 'auto'; this.themeKey = null; this.themeNow = null; this.camMode = null;
    this.persp = new THREE.PerspectiveCamera(40, 1, .5, 400); this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, .5, 400);
    this.mat = { solid: new THREE.MeshLambertMaterial({ vertexColors: true }), inst: new THREE.MeshLambertMaterial({ vertexColors: true }), lamp: new THREE.MeshBasicMaterial({ color: 0xffffff }), plate: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, depthWrite: false }), ghost: new THREE.MeshLambertMaterial({ color: 0x55caad, transparent: true, opacity: .55, depthWrite: false }), grid: new THREE.LineBasicMaterial({ color: 0x6f858b, transparent: true, opacity: .22 }), select: new THREE.LineBasicMaterial({ color: 0x199b83 }), route: new THREE.LineDashedMaterial({ color: 0x4f9a85, dashSize: .8, gapSize: .6 }), air: new THREE.LineDashedMaterial({ color: 0x3f6fa8, dashSize: 1.1, gapSize: .7 }), net: new THREE.LineBasicMaterial({ color: 0xa9b8ae }), netline: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      // Nachtbeleuchtung ohne Echtzeitlichter: Leuchtkörper (unbeleuchtet) und additive Lichtkegel/-flächen mit Verlauf in der Vertexfarbe.
      head: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x9aa39f }), glow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }) };
    this.siteGroup = new THREE.Group(); this.netGroup = new THREE.Group(); scene.add(this.siteGroup, this.netGroup);
    this.createDynamic();

    // HTML-Labels über der Szene; Position per CSS-Transform.
    const host = canvas.parentElement;
    if (host) { injectChipStyle(document); const el = this.labelRoot = document.createElement('div'); el.className = 'scene3d-labels'; el.setAttribute('aria-hidden', 'true'); el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;'; canvas.after(el); }
    this.chips = [];

    const on = (target, type, fn, options) => { target.addEventListener(type, fn, options); this.listeners.push([target, type, fn, options]); };
    on(canvas, 'pointerdown', e => { if (this.camMode?.mode === 'tour') this.stopCamera('input'); if (e.button !== 0) return; try { canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetische Zeiger */ } const p = this.local(e), g = this.groundAt(p.x, p.y); this.pointer = { x: e.clientX, y: e.clientY, moved: false, gx: g?.x, gz: g?.z }; });
    on(canvas, 'pointermove', e => {
      const p = this.local(e); this.needs = true;
      if (this.pointer) {
        if (Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y) > 5) this.pointer.moved = true;
        if (this.pointer.moved && this.camMode) this.stopCamera('input');
        if (this.pointer.moved && this.pointer.gx != null) { const g = this.groundAt(p.x, p.y); if (g) { this.cam.tx += this.pointer.gx - g.x; this.cam.tz += this.pointer.gz - g.z; this.goal.tx = this.cam.tx; this.goal.tz = this.cam.tz; this.applyCamera(); } }
      }
      const g = this.groundAt(p.x, p.y); if (!g || this.view === 'network') return;
      const c = worldToCell(g.x, g.z); if (!this.hover || this.hover.x !== c.x || this.hover.y !== c.y) { this.hover = c; this.dynDirty = true; }
      this.callbacks.onHover?.(c.x, c.y);
    });
    on(canvas, 'pointerup', e => { const down = this.pointer; this.pointer = null; if (!down || down.moved) return; this.click(this.local(e)); });
    on(canvas, 'pointercancel', () => { this.pointer = null; });
    on(canvas, 'pointerleave', () => { if (!this.pointer && this.hover) { this.hover = null; this.dynDirty = true; } });
    on(canvas, 'wheel', e => { e.preventDefault(); if (this.camMode?.mode === 'tour') this.stopCamera('input'); if (this.camMode?.mode === 'follow') { this.zoom(e.deltaY < 0 ? 1 : -1, true); return; } const p = this.local(e), before = this.groundAt(p.x, p.y), bx = before?.x, bz = before?.z; this.zoom(e.deltaY < 0 ? 1 : -1, true); if (bx != null) { const after = this.groundAt(p.x, p.y); if (after) { this.cam.tx += bx - after.x; this.cam.tz += bz - after.z; this.goal.tx = this.cam.tx; this.goal.tz = this.cam.tz; this.applyCamera(); } } }, { passive: false });
    on(canvas, 'webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    on(canvas, 'webglcontextrestored', () => { this.lost = false; this.signature = ''; this.sigDirty = true; this.needs = true; });
    on(document, 'visibilitychange', () => { this.needs = true; this.lastFrame = 0; });
    // Rundgang: jede Taste bricht ab; Verfolgen: Esc.
    on(document, 'keydown', e => { if (this.camMode && (this.camMode.mode === 'tour' || e.key === 'Escape')) this.stopCamera('input'); });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
    this.home(); this.applyTheme(themeFor('auto', 480));
    const loop = now => { if (this.dead) return; this.frame = requestAnimationFrame(loop); if (!document.hidden && !this.lost) { const t0 = performance.now(); this.tick(now); const ms = performance.now() - t0; this.res.cpu = this.res.cpu ? this.res.cpu * .94 + ms * .06 : ms; } };
    this.frame = requestAnimationFrame(loop);
  }

  // ----- Öffentliche API (S1) -----
  setState(s) { this.state = s; this.sigDirty = true; this.dynDirty = true; this.ghostCache = null; this.needs = true; if (this.clock.base == null && Number.isFinite(s?.t)) this.updateTheme(s.t); }
  setBuild(type, rotation = 0, movingId = null) { this.build = type; this.buildRotation = rotation; this.movingId = movingId; this.ghostCache = null; this.dynDirty = true; this.canvas.style.cursor = type ? 'crosshair' : 'grab'; }
  setView(view) { if (VIEWS.includes(view)) { this.view = view; this.dynDirty = true; this.home(); } }
  /** Tageszeit: 'day' oder 'night' fest, 'auto' (bzw. null) folgt der Spielzeit aus setClock. */
  setTheme(mode) { this.themeMode = THEME_MODES.includes(mode) ? mode : 'auto'; this.themeKey = null; this.updateTheme(this.clock.shown ?? this.clock.base ?? this.state?.t ?? 480); }
  /** Aktuelle Stimmung (Prüfhilfe/Anzeige): {mode, key, name, night}. */
  theme() { const t = this.themeNow; return { mode: this.themeMode, key: t?.key || null, name: t?.name || '', night: t?.night ?? 0 }; }
  /** Kamerarundgang Tor → Docks → Sortierung → Lager → Ausgang; Abbruch durch Eingabe. Liefert die Stationen. */
  tour() {
    if (this.view === 'network' || this.view === 'flat') { this.view = 'site'; this.dynDirty = true; this.callbacks.onView?.('site'); }
    const stops = tourStops(this.state, this.site().id); this.stopCamera('replace');
    this.camMode = { mode: 'tour', stops, i: 0, from: { ...this.cam }, at: null, cut: this.reducedMotion() };
    this.callbacks.onCameraMode?.('tour', { stop: stops[0].key, label: stops[0].label }); this.needs = true; return stops;
  }
  /** Kamera folgt Fremd-Lkw (arrival-ID) oder eigenem Fahrzeug; in der Netzansicht Linien-Lkw (Fahrzeug-/Fahrt-ID). follow(null) beendet. false, wenn Ziel nicht im Bild. */
  follow(id) {
    if (id == null) { if (this.camMode?.mode === 'follow') this.stopCamera('user'); return false; }
    const net = this.view === 'network'; if (net) this.sync();
    if (!(net ? netFollowTarget(this.trips, id, this.airTrips) : followTarget(this.fleet, this.yardFleet, id))) return false;
    this.stopCamera('replace'); this.camMode = { mode: 'follow', id };
    if (this.scale < 1.5) { this.scale = 1.5; this.goal.dist = this.homeDist / this.scale; }
    this.callbacks.onCameraMode?.('follow', { id }); this.needs = true; return true;
  }
  /** Laufender Kameramodus (Prüfhilfe): {mode:'tour', stop, index} | {mode:'follow', id} | null. */
  cameraMode() { const m = this.camMode; return !m ? null : m.mode === 'tour' ? { mode: 'tour', stop: m.stops[m.i]?.key, index: m.i } : { mode: 'follow', id: m.id }; }
  stopCamera(reason = 'user') { const m = this.camMode; if (!m) return; this.camMode = null; for (const k of CAM_KEYS) this.goal[k] = this.cam[k]; if (reason !== 'replace') this.callbacks.onCameraMode?.(null, { reason, was: m.mode }); this.needs = true; }
  reducedMotion() { try { return !!document.body?.classList.contains('reduced') || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
  setLabels(mode) { if (LABEL_MODES.includes(mode)) { this.labelMode = mode; this.needs = true; } }
  setClock(t) {
    if (!Number.isFinite(t)) return; const c = this.clock, now = performance.now(); this.updateTheme(t);
    if (c.base == null || t < c.base - 1.5 || t > c.base + 60) { c.base = t; c.at = now; c.rate = 0; c.shown = t; return; }
    const dt = (now - c.at) / 1000; if (dt > .02) { const r = Math.max(0, (t - c.base) / dt); c.rate = c.rate * .5 + r * .5; }
    c.base = t; c.at = now;
  }
  zoom(delta, immediate = false) { this.scale = Math.max(.45, Math.min(2.7, this.scale * Math.pow(1.13, delta))); this.goal.dist = this.homeDist / this.scale; if (immediate) { this.cam.dist = this.goal.dist; this.applyCamera(); } this.needs = true; }
  rotate(dir = 1) { if (this.camMode?.mode === 'tour') this.stopCamera('user'); const d = dir < 0 ? -1 : 1; this.quarter = (this.quarter + d + 4) % 4; this.goal.yaw += d * Math.PI / 2; this.needs = true; this.dynDirty = true; }
  home() {
    this.stopCamera('user'); const s = defaultSite(this.state), W = s.width || 20, H = s.height || 16; this.scale = 1;
    if (this.view === 'network') { const { ext } = networkLayout(this.state?.sites || [s], undefined, airRelevant(this.state) ? [AIRPORT] : []); this.homeDist = ext * 2.3; this.goal.tx = 0; this.goal.tz = 2; }
    else if (this.view === 'site') { this.homeDist = Math.hypot(W + 28, H + 16) * 1.12; this.goal.tx = W / 2 - 4; this.goal.tz = H / 2 + 4; }
    else if (this.view === 'flat') { this.homeDist = Math.hypot(W, H) * 1.35; this.goal.tx = W / 2; this.goal.tz = H / 2 + 1; }
    else { this.homeDist = Math.hypot(W, H) * 1.5; this.goal.tx = W / 2; this.goal.tz = H / 2 + .8; }
    this.goal.dist = this.homeDist; this.needs = true;
  }
  focus(id) {
    const b = this.state?.buildings?.find(o => o.id === id); if (!b || b.site !== defaultSite(this.state).id || this.view === 'network') return false;
    this.stopCamera('user'); this.selected = id; this.dynDirty = true; const box = buildingBox(b);
    let tx = (box.x0 + box.x1) / 2, tz = (box.z0 + box.z1) / 2;
    // Seitenfenster und Bauleiste verdecken einen Teil der Szene: Ziel in die freie Fläche verschieben.
    const panel = document.getElementById?.('panel'), cr = this.canvas.getBoundingClientRect();
    if (panel && !panel.hidden && cr.width) { const free = (panel.getBoundingClientRect().left - cr.left) / cr.width; const shift = (.5 - Math.max(.35, Math.min(1, free)) / 2 - .02) * this.viewWidthWorld(); const yaw = this.goal.yaw; tx += Math.cos(yaw) * shift; tz -= Math.sin(yaw) * shift; }
    this.goal.tx = tx; this.goal.tz = tz; if (this.scale < 1.3) { this.scale = 1.3; this.goal.dist = this.homeDist / this.scale; }
    this.needs = true; return true;
  }
  /** Bildschirmpunkt der Zellmitte (Prüfhilfe). */
  cellToScreen(x, y) { _v.set(x + .5, .06, y + .5).project(this.camera()); return { x: (_v.x + 1) / 2 * this.width, y: (1 - _v.y) / 2 * this.height }; }
  renderInfo() { const r = this.renderer.info.render; return { drawCalls: r.calls, triangles: r.triangles, pixelRatio: this.res.ratio, avgFrameMs: Math.round((this.res.avg || 0) * 100) / 100, cpuMs: Math.round((this.res.cpu || 0) * 100) / 100, renderer: 'webgl', quality: this.qualityLevel, qualityMode: this.qualityMode }; }
  /** Grafikqualität 'low'|'medium'|'high' fest oder 'auto' (nach gemessener Frame-Zeit). Rein darstellend. Liefert quality(). */
  setQuality(mode) {
    const m = QUALITY_MODES.includes(mode) ? mode : 'auto', was = this.qualityMode; this.qualityMode = m;
    if (m === 'auto') { if (was !== 'auto') this.auto = autoQualityState('medium'); this.applyQuality(this.auto.level); }
    else this.applyQuality(m);
    return this.quality();
  }
  /** Aktuelle Qualität (Anzeige/Prüfhilfe): {mode, level, name, p95}. */
  quality() { return { mode: this.qualityMode, level: this.qualityLevel, name: QUALITY_NAMES[this.qualityLevel], modeName: QUALITY_NAMES[this.qualityMode], p95: this.auto.p95 }; }
  applyQuality(level) {
    if (!QUALITY_LEVELS.includes(level)) return; const changed = level !== this.qualityLevel; this.qualityLevel = level; this.q = qualityConfig(level);
    const r = qualityRatio(level, window.devicePixelRatio || 1), res = this.res; res.max = r.max; res.min = r.min; res.ratio = Math.max(r.min, Math.min(r.max, res.ratio));
    this.renderer.setPixelRatio(res.ratio); this.renderer.setSize(this.width, this.height, false);
    if (changed) { this.signature = ''; this.sigDirty = true; this.dynDirty = true; this.callbacks.onQuality?.(this.quality()); }
    this.needs = true;
  }
  /** Kameraabstand eines Weltpunkts für LOD (Grundriss: Bodenabstand zum Blickziel plus Zoomabstand). */
  lodDist(x, z, y = 0) { if (this.view === 'flat') return Math.hypot(x - this.cam.tx, z - this.cam.tz) + this.cam.dist * .8; const p = this.persp.position; return Math.hypot(p.x - x, p.y - y, p.z - z); }
  destroy() {
    this.dead = true; cancelAnimationFrame(this.frame); this.observer?.disconnect();
    for (const [t, type, fn, o] of this.listeners) t.removeEventListener(type, fn, o);
    this.labelRoot?.remove(); this.chips = []; delete this.canvas.__scene;
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(this.mat)) m.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss?.();
  }

  // ----- Tageszeit -----
  /** Stimmung nur bei Wechsel (≈ 2 Spielminuten oder Modus) neu setzen: keine Arbeit pro Frame. */
  updateTheme(t) {
    const key = this.themeMode === 'auto' ? `a${Math.round(dayMinute(t) / 2)}` : this.themeMode; if (key === this.themeKey) return;
    this.themeKey = key; this.applyTheme(themeFor(this.themeMode, t));
  }
  applyTheme(th) {
    this.themeNow = th; const sc = this.scene;
    sc.background.set(th.sky); sc.fog.color.set(th.sky); this.renderer.setClearColor(sc.background, 1);
    this.hemi.color.set(th.hemiSky); this.hemi.groundColor.set(th.hemiGround); this.hemi.intensity = th.hemiI;
    this.sun.color.set(th.sun); this.sun.intensity = th.sunI; this.sun.position.set(th.sunX, th.sunY, th.sunZ);
    this.mat.solid.color.set(th.tint); this.mat.inst.color.set(th.tint);
    const n = th.night; this.mat.glow.opacity = Math.min(1, n * 1.1); if (this.glow) this.glow.visible = n > .02;
    this.mat.head.color.set(mixHex('#9aa39f', '#ffffff', Math.min(1, n * 1.4)));
    this.labelRoot?.classList.toggle('night', n >= .5); this.needs = true;
  }
  /** Leuchtkörper und Lichtflächen der Nachtbeleuchtung (je 1 Draw Call). */
  rebuildLights(site, L, docks, yards = []) {
    const nq = this.q.night, lights = nightLights(site, L, docks, yards, { hall: nq.hall }), H = new Parts();
    for (const h of lights.heads) { if (h.y > 3) { H.box(h.x - .32, h.y - .1, h.z - .14, .64, .1, .28, '#fff1c8'); } else H.box(h.x - .22, h.y - .08, h.z - .08, .44, .08, .16, '#fff4d6'); }
    const pos = [], colr = [], seg = nq.seg, warm = [1, .86, .58];
    const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); colr.push(...ca, ...cb, ...cc); };
    for (const p of lights.pools) {
      // Lichtfläche mit weichem Abfall: Mitte → Innenring (45 % Stärke) → Rand (0).
      const center = warm.map(v => v * .5 * p.k), ring = center.map(v => v * .45), zero = [0, 0, 0], ri = p.r * .5;
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const i0 = [p.x + c0 * ri, p.y, p.z + s0 * ri], i1 = [p.x + c1 * ri, p.y, p.z + s1 * ri], o0 = [p.x + c0 * p.r, p.y, p.z + s0 * p.r], o1 = [p.x + c1 * p.r, p.y, p.z + s1 * p.r];
        tri([p.x, p.y, p.z], i1, i0, center, ring, ring); tri(i0, i1, o1, ring, ring, zero); tri(i0, o1, o0, ring, zero, zero);
      }
      if (p.cone && nq.cones) { const apex = warm.map(v => v * .26 * p.k), r = p.r * .8, top = [p.x, p.h - .1, p.z]; for (let i = 0; i < 12; i++) { const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2; tri(top, [p.x + Math.cos(a0) * r, .02, p.z + Math.sin(a0) * r], [p.x + Math.cos(a1) * r, .02, p.z + Math.sin(a1) * r], apex, zero, zero); } }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.computeBoundingSphere();
    const oh = this.heads.geometry, og = this.glow.geometry; this.heads.geometry = H.geometry(); this.glow.geometry = g; oh.dispose(); og.dispose();
    return lights;
  }

  // ----- Hilfen wie in scene.js -----
  site() { return defaultSite(this.state); }
  statusLabel(status) { return Scene.prototype.statusLabel.call(this, status); }
  buildingStatus(b) { return Scene.prototype.buildingStatus.call(this, b); }
  local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  camera() { return this.view === 'flat' ? this.ortho : this.persp; }
  viewWidthWorld() { return this.view === 'flat' ? (this.ortho.right - this.ortho.left) : 2 * this.cam.dist * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2)) * this.persp.aspect; }
  resize() {
    const r = this.canvas.getBoundingClientRect(); this.width = Math.max(1, r.width); this.height = Math.max(1, r.height);
    this.renderer.setPixelRatio(this.res.ratio); this.renderer.setSize(this.width, this.height, false);
    this.persp.aspect = this.width / this.height; this.persp.updateProjectionMatrix(); this.applyCamera(); this.needs = true;
  }
  applyCamera() {
    const c = this.cam;
    if (this.view === 'flat') {
      const half = c.dist / 2.2, a = this.width / this.height, o = this.ortho, yaw = c.yaw - Math.PI / 4;
      o.left = -half * a; o.right = half * a; o.top = half; o.bottom = -half; o.updateProjectionMatrix();
      o.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)); o.position.set(c.tx, 80, c.tz); o.lookAt(c.tx, 0, c.tz); o.updateMatrixWorld();
    } else {
      const pitch = this.view === 'network' ? 1.05 : this.view === 'site' ? .82 : .9, p = this.persp;
      p.position.set(c.tx + c.dist * Math.cos(pitch) * Math.sin(c.yaw), c.dist * Math.sin(pitch), c.tz + c.dist * Math.cos(pitch) * Math.cos(c.yaw));
      p.up.copy(_up); p.lookAt(c.tx, 0, c.tz); p.updateMatrixWorld();
    }
  }
  /** Bodenpunkt unter Bildschirmkoordinate (für Ziehen, Zoom und Raster). */
  groundAt(px, py) { const ray = this.rayAt(px, py); return rayGround(ray.origin, ray.direction, 0, { x: 0, z: 0 }); }
  rayAt(px, py) { const t = this.tmp; t.ndc.set(px / this.width * 2 - 1, -(py / this.height) * 2 + 1); t.ray.setFromCamera(t.ndc, this.camera()); return t.ray.ray; }

  click(p) {
    const ray = this.rayAt(p.x, p.y);
    if (this.view === 'network') {
      const g = rayGround(ray.origin, ray.direction, 0, {}); if (!g) return;
      let best = null, bd = 2.6; for (const pin of this.pins) { const d = Math.hypot(pin.x - g.x, pin.z - g.z); if (d < bd) { bd = d; best = pin.id; } }
      for (const t of this.transfers) { const d = Math.hypot(t.x - g.x, t.z - g.z); if (d < Math.min(bd, 1.4)) { bd = d; best = t.id; } }
      for (const t of this.trips) { const d = Math.hypot(t.x - g.x, t.z - g.z); if (d < Math.min(bd, 1.4)) { bd = d; best = t.vehicleId; } }
      if (best) this.callbacks.onSelect?.(best); return;
    }
    if (this.build) { const g = rayGround(ray.origin, ray.direction, 0, {}); if (g) { const c = worldToCell(g.x, g.z); this.callbacks.onPlace?.(c.x, c.y); } return; }
    let best = null, bt = Infinity;
    for (const h of this.boxes) { if (h.fleet && !h.fleet.shown) continue; const t = rayBox(ray.origin, ray.direction, h.box); if (t != null && t < bt) { bt = t; best = h.id; } }
    this.selected = best; this.dynDirty = true; this.callbacks.onSelect?.(best);
  }

  // ----- Aufbau -----
  createDynamic() {
    const g = this.siteGroup, inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; return m; };
    this.static = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.solid); this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat.grid);
    this.heads = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.head); this.glow = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.glow); this.glow.renderOrder = 2; this.glow.visible = false;
    g.add(this.static, this.grid, this.heads, this.glow);
    const pallet = mergedGeo(P => { P.box(-.4, 0, -.4, .8, .1, .8, '#c9a26a'); P.box(-.36, .1, -.36, .72, .36, .72, '#e8cf9f'); P.box(-.36, .3, -.37, .72, .03, .74, '#b9965f'); });
    const truckBox = mergedGeo(P => { P.box(-2.1, .45, -.63, 3.0, 1.35, 1.26, '#ffffff'); P.box(-2.12, .5, -.64, .04, 1.25, 1.28, '#d8dcd4'); });
    const truckCab = mergedGeo(P => { P.box(.98, .4, -.62, 1.1, 1.1, 1.24, '#ffffff'); P.box(1.9, .95, -.55, .2, .42, 1.1, '#355862'); P.box(.98, 1.5, -.5, .7, .12, 1.0, '#ffffff'); });
    const truckBase = mergedGeo(P => { P.box(-2.1, .3, -.55, 4.2, .16, 1.1, '#3c4a4d'); for (const x of [-1.5, -.9, 1.5]) for (const z of [-.66, .52]) { const r = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(.56, .14, .56)).setPosition(x, .28, z); P.add(prims().cyl10, r, '#2f3a3d'); } });
    this.inst = {
      pallet: inst(pallet, this.mat.inst, 64), lamp: inst(new THREE.SphereGeometry(.13, 8, 6), this.mat.lamp, 32), plate: inst(prims().plane, this.mat.plate, 32),
      vbox: inst(truckBox, this.mat.inst, 16), vcab: inst(truckCab, this.mat.inst, 16), vbase: inst(truckBase, this.mat.inst, 16),
      body: inst(mergedGeo(P => { P.cyl(-.07, 0, 0, .05, .26, '#40565d'); P.cyl(.07, 0, 0, .05, .26, '#40565d'); P.cyl(0, .26, 0, .13, .3, '#ffffff'); }), this.mat.inst, 16),
      head: inst(mergedGeo(P => { P.ball(0, .66, 0, .1, '#e7c599'); P.cyl(0, .7, 0, .115, .06, '#f3d582'); }), this.mat.inst, 16),
      trunk: inst(mergedGeo(P => P.cyl(0, 0, 0, .1, .9, '#8b7a63')), this.mat.inst, 40), crown: inst(mergedGeo(P => { P.cone(0, .7, 0, .75, 1.5, '#ffffff'); P.cone(0, 1.5, 0, .55, 1.1, '#ffffff'); }), this.mat.inst, 40),
      // Fremd-Sattelzug (Bug +x, Länge FOREIGN_LEN): Auflieger (Instanzfarbe hell) und Zugmaschine (Frachtführerfarbe), je 1 Draw Call.
      ftrailer: inst(mergedGeo(P => { P.box(-2.5, .5, -.63, 3.55, 1.45, 1.26, '#ffffff'); P.box(-2.52, .55, -.64, .04, 1.35, 1.28, '#c8ccc4'); P.box(-2.45, .78, -.645, 3.4, .1, 1.29, '#9fb0b6'); P.box(-2.4, .3, -.5, 3.3, .2, 1.0, '#3c4a4d'); for (const x of [-2.05, -1.6, -1.15]) for (const z of [-.66, .52]) { const r = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(.56, .14, .56)).setPosition(x, .28, z); P.add(prims().cyl10, r, '#2f3a3d'); } }), this.mat.inst, 8),
      fcab: inst(mergedGeo(P => { P.box(.7, .3, -.5, 1.8, .18, 1.0, '#3c4a4d'); P.box(1.45, .42, -.62, 1.05, 1.15, 1.24, '#ffffff'); P.box(2.42, .95, -.55, .1, .45, 1.1, '#355862'); P.box(1.45, 1.57, -.55, .7, .25, 1.1, '#ffffff'); P.box(2.45, .38, -.6, .08, .16, 1.2, '#c8ccc4'); for (const x of [1.0, 2.05]) for (const z of [-.66, .52]) { const r = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(.56, .14, .56)).setPosition(x, .28, z); P.add(prims().cyl10, r, '#2f3a3d'); } }), this.mat.inst, 8),
      // Rollcontainer (inbound) und Kartonstapel (stock), instanziert.
      cage: inst(mergedGeo(P => { P.box(-.22, .03, -.24, .44, .04, .48, '#7d8a8e'); for (const x of [-.22, .2]) for (const z of [-.24, .22]) P.box(x, .07, z, .02, .8, .02, '#a9b6ba'); P.box(-.22, .45, -.24, .44, .015, .48, '#a9b6ba'); P.box(-.18, .07, -.2, .36, .3, .4, '#d9b37a'); P.box(-.16, .47, -.18, .32, .28, .36, '#e3c08a'); P.box(-.21, .07, -.235, .42, .78, .005, '#c7d0d3'); }), this.mat.inst, 16),
      stack: inst(mergedGeo(P => { P.box(-.26, 0, -.26, .52, .08, .52, '#c9a26a'); P.box(-.24, .08, -.24, .23, .2, .23, '#d9b37a'); P.box(.01, .08, -.24, .23, .2, .23, '#e3c08a'); P.box(-.24, .08, .01, .23, .2, .23, '#e3c08a'); P.box(.01, .08, .01, .23, .2, .23, '#d9b37a'); P.box(-.22, .28, -.22, .44, .22, .44, '#e8cf9f'); P.box(-.18, .5, -.18, .36, .2, .36, '#d9b37a'); }), this.mat.inst, 16),
      // W2-S2: Palettenauflieger (Pritsche, Bug +x), Ladung darauf, Palettenstapel im Lager, Stapler (Gabeln +x), mitgeführte Palette, Akkubalken.
      fflat: inst(mergedGeo(P => { P.box(-2.5, .5, -.63, 3.55, .12, 1.26, '#b9c0bd'); P.box(-2.52, .5, -.645, 3.59, .14, .03, '#5f7478'); P.box(-2.52, .5, .615, 3.59, .14, .03, '#5f7478'); P.box(.9, .62, -.63, .1, .95, 1.26, '#c8ccc4'); P.box(-2.4, .3, -.5, 3.3, .2, 1.0, '#3c4a4d'); for (const x of [-2.05, -1.6, -1.15]) for (const z of [-.66, .52]) { const r = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(.56, .14, .56)).setPosition(x, .28, z); P.add(prims().cyl10, r, '#2f3a3d'); } }), this.mat.inst, 4),
      tload: inst(pallet, this.mat.inst, 16), pstack: inst(pallet, this.mat.inst, 32), fload: inst(pallet, this.mat.inst, 4),
      fork: inst(mergedGeo(P => {
        P.box(-.42, .08, -.24, .62, .22, .48, '#f0b84a'); P.box(-.5, .08, -.25, .14, .36, .5, '#3c4a4d'); P.box(-.22, .3, -.13, .18, .14, .26, '#2e3a3c'); P.box(-.32, .44, -.13, .06, .2, .26, '#2e3a3c');
        for (const x of [-.4, .1]) for (const z of [-.21, .17]) P.box(x, .3, z, .04, .58, .04, '#3c4a4d');
        P.box(-.42, .88, -.23, .58, .04, .46, '#3c4a4d');
        for (const z of [-.19, .14]) P.box(.2, .06, z, .05, 1.02, .05, '#5d6d70'); P.box(.2, .95, -.19, .05, .06, .38, '#5d6d70'); P.box(.25, .08, -.17, .04, .32, .34, '#5d6d70');
        for (const z of [-.15, .08]) P.box(.27, .06, z, .5, .03, .07, '#7b8b8e');
        for (const [x, z] of [[-.3, -.27], [-.3, .21], [.1, -.27], [.1, .21]]) { const r = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(.2, .06, .2)).setPosition(x, .1, z); P.add(prims().cyl10, r, '#2f3a3d'); }
        P.box(-.05, .93, -.03, .06, .05, .06, '#f2c363');
      }), this.mat.inst, 4),
      charge: inst(prims().box, this.mat.lamp, 4),
      car: inst(mergedGeo(P => { P.box(-.9, .15, -.42, 1.8, .42, .84, '#ffffff'); P.box(-.5, .57, -.38, .95, .32, .76, '#ffffff'); P.box(-.48, .6, -.39, .9, .24, .78, '#3c5560'); }), this.mat.inst, 16),
      // W3b Containerhof: 40-Fuß-Container (Länge +x, Türseite −x, Instanzfarbe je Vertrag), offene Türflügel (leer), Lagergeld-Markierung (Dachband),
      // Containerchassis (Skelettauflieger, Bug +x; Zugmaschine = fcab). Je 1 Draw Call.
      cont: inst(mergedGeo(P => {
        const hl = CONTAINER_LEN / 2, hw = CONTAINER_W / 2, h = CONTAINER_H;
        P.box(-hl, 0, -hw, CONTAINER_LEN, h, CONTAINER_W, '#ffffff');
        for (let i = 0; i < 14; i++) { const x = -hl + .16 + i * .235; P.box(x, .07, -hw - .012, .08, h - .14, .012, '#d4d4d4'); P.box(x, .07, hw, .08, h - .14, .012, '#d4d4d4'); }
        P.box(-hl - .006, 0, -hw - .006, CONTAINER_LEN + .012, .06, CONTAINER_W + .012, '#9c9c9c'); P.box(-hl - .006, h - .05, -hw - .006, CONTAINER_LEN + .012, .05, CONTAINER_W + .012, '#c2c2c2');
        for (const x of [-hl - .006, hl - .06]) for (const z of [-hw - .006, hw - .06]) P.box(x, 0, z, .066, h, .066, '#a8a8a8');
        for (const z of [-.25, -.08, .08, .25]) P.box(-hl - .02, .07, z - .012, .02, h - .14, .024, '#6e6e6e');
        for (let i = 0; i < 3; i++) P.box(hl, .1 + i * .22, -hw + .06, .01, .1, CONTAINER_W - .12, '#d4d4d4');
      }), this.mat.inst, 8),
      cdoor: inst(mergedGeo(P => { const hl = CONTAINER_LEN / 2, hw = CONTAINER_W / 2, h = CONTAINER_H; P.box(-hl - .03, .05, -hw + .03, .006, h - .1, CONTAINER_W - .06, '#262f30'); P.box(-hl - hw, .04, -hw - .03, hw, h - .08, .025, '#ffffff'); P.box(-hl - hw, .04, hw + .005, hw, h - .08, .025, '#ffffff'); }), this.mat.inst, 8),
      cmark: inst(mergedGeo(P => { P.box(-1.55, 0, -.05, 3.1, .016, .1, '#ffffff'); P.box(-CONTAINER_LEN / 2 - .035, -.26, -.2, .01, .2, .4, '#ffffff'); }), this.mat.inst, 8),
      cchassis: inst(mergedGeo(P => {
        for (const z of [-.42, .3]) P.box(-2.52, .42, z, 3.6, .12, .12, '#3c4a4d');
        for (let i = 0; i < 6; i++) P.box(-2.45 + i * .68, .44, -.5, .08, .08, 1.0, '#4a585b');
        P.box(-2.56, .3, -.6, .06, .16, 1.2, '#5d6d70'); P.box(-2.57, .34, -.58, .02, .07, .14, '#cb675d'); P.box(-2.57, .34, .44, .02, .07, .14, '#cb675d');
        for (const x of [-2.5, .98]) for (const z of [-.5, .38]) P.box(x, .54, z, .1, .04, .12, '#e9b94d');
        P.box(-.4, .1, -.4, .06, .34, .06, '#5d6d70'); P.box(-.4, .1, .34, .06, .34, .06, '#5d6d70');
        for (const x of [-2.05, -1.6, -1.15]) for (const z of [-.66, .52]) { const r = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(.56, .14, .56)).setPosition(x, .28, z); P.add(prims().cyl10, r, '#2f3a3d'); }
      }), this.mat.inst, 4),
      // 0.15: Kühlpakete (weiße Isolierboxen mit blauem Deckelband) als Rollcontainer/Stapel, Sperrgutstück (Grundkörper 1,0 × 0,38 × 0,42,
      // Instanzfarbe/-skalierung je Stück), Kühlaggregat + blaue Seitenbänder für Kühlauflieger, Quergurtwagen und Paket auf dem Wagen.
      ccage: inst(mergedGeo(P => { P.box(-.22, .03, -.24, .44, .04, .48, '#7d8a8e'); for (const x of [-.22, .2]) for (const z of [-.24, .22]) P.box(x, .07, z, .02, .8, .02, '#a9b6ba'); P.box(-.22, .45, -.24, .44, .015, .48, '#a9b6ba'); P.box(-.18, .07, -.2, .36, .3, .4, '#f1f5f7'); P.box(-.18, .33, -.2, .36, .04, .4, '#4f8fcf'); P.box(-.16, .47, -.18, .32, .26, .36, '#e9f0f4'); P.box(-.16, .69, -.18, .32, .04, .36, '#4f8fcf'); P.box(-.21, .07, -.235, .42, .78, .005, '#c7d0d3'); }), this.mat.inst, 8),
      cstack: inst(mergedGeo(P => { P.box(-.26, 0, -.26, .52, .08, .52, '#9fb2bd'); for (const [x, z] of [[-.24, -.24], [.01, -.24], [-.24, .01], [.01, .01]]) { P.box(x, .08, z, .23, .17, .23, '#f1f5f7'); P.box(x, .25, z, .23, .03, .23, '#4f8fcf'); } P.box(-.22, .28, -.22, .44, .19, .44, '#e9f0f4'); P.box(-.22, .47, -.22, .44, .03, .44, '#4f8fcf'); P.box(-.18, .5, -.18, .36, .17, .36, '#f1f5f7'); P.box(-.18, .67, -.18, .36, .03, .36, '#4f8fcf'); }), this.mat.inst, 8),
      bulky: inst(mergedGeo(P => { P.box(-.5, 0, -.21, 1.0, .38, .42, '#ffffff'); for (const x of [-.46, -.03, .4]) P.box(x, -.005, -.215, .06, .39, .43, '#d2d2d2'); P.box(-.505, .3, -.215, 1.01, .04, .43, '#c4c4c4'); P.box(-.2, .38, -.1, .4, .008, .2, '#e8e8e8'); }), this.mat.inst, 8),
      freefer: inst(mergedGeo(P => { P.box(1.05, 1.2, -.42, .2, .62, .84, '#e8eef2'); P.box(1.25, 1.28, -.34, .015, .46, .68, '#3c4a4d'); P.box(1.05, 1.82, -.42, .2, .04, .84, '#4f8fcf'); for (const z of [-.648, .633]) P.box(-2.45, 1.55, z, 3.45, .12, .015, '#4f8fcf'); P.box(-2.535, 1.55, -.6, .015, .12, 1.2, '#4f8fcf'); }), this.mat.inst, 4),
      xcar: inst(mergedGeo(P => { P.box(-.16, -.06, -.25, .32, .06, .5, '#3c4a4d'); P.box(-.13, 0, -.23, .26, .03, .46, '#2f3a3c'); for (const z of [-.25, .22]) P.box(-.16, 0, z, .32, .06, .03, '#f0b84a'); for (const x of [-.12, .1]) P.box(x, .03, -.22, .02, .005, .44, '#5d6d70'); }), this.mat.inst, 28),
      xpar: inst(mergedGeo(P => { P.box(-.1, .03, -.12, .2, .13, .24, '#ffffff'); P.box(-.02, .03, -.125, .04, .132, .25, '#d6d6d6'); }), this.mat.inst, 20)
    };
    for (const m of Object.values(this.inst)) g.add(m);
    this.selectBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(.5, .5, .5)), this.mat.select); this.selectBox.visible = false;
    this.ghost = new THREE.Mesh(prims().box, this.mat.ghost); this.ghost.visible = false; g.add(this.selectBox, this.ghost);
    // Netzansicht
    const n = this.netGroup; n.visible = false;
    this.netStatic = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.solid); this.netLines = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat.net); this.netRoutes = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat.route); this.netLineMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.netline);
    this.inst.pin = inst(mergedGeo(P => { P.cyl(0, 0, 0, 1.6, .08, '#ffffff', true); P.box(-.9, .08, -.7, 1.8, 1.0, 1.4, '#ffffff'); P.box(-1.05, 1.08, -.85, 2.1, .14, 1.7, '#e9efe9'); P.cyl(0, 1.22, 0, .05, 1.1, '#5d6d70'); P.box(.05, 1.95, -.02, .6, .36, .04, '#f2c363'); }), this.mat.inst, 8);
    this.inst.marker = inst(mergedGeo(P => { P.box(-.7, .15, -.32, 1.4, .6, .64, '#ffffff'); P.box(.4, .15, -.32, .4, .5, .64, '#ebac53'); }), this.mat.inst, 8);
    // W3c: Frachtterminal (Halle, Tower, abgestelltes Flugzeug aus Grundkörpern), Startflugzeug, Zubringer-Marker (blaue Front), Hub→Terminal gestrichelt.
    const plane = (P, x, z, s = 1) => { const c = '#f4f6f8'; P.box(x - 1.3 * s, .55 * s, z - .2 * s, 2.6 * s, .4 * s, .4 * s, c); P.box(x - .25 * s, .62 * s, z - 1.4 * s, .55 * s, .08 * s, 2.8 * s, '#dfe5ea'); P.box(x - 1.3 * s, .7 * s, z - .55 * s, .35 * s, .06 * s, 1.1 * s, '#dfe5ea'); P.box(x - 1.3 * s, .9 * s, z - .04 * s, .35 * s, .55 * s, .08 * s, '#3f6fa8'); P.box(x + 1.15 * s, .6 * s, z - .17 * s, .3 * s, .3 * s, .34 * s, '#cfd8de'); };
    this.inst.airpin = inst(mergedGeo(P => { P.cyl(0, 0, 0, 1.6, .08, '#ffffff', true); P.box(-1.3, .08, -1.1, 2.0, .8, 1.3, '#e6ecf2'); P.box(-1.4, .88, -1.2, 2.2, .12, 1.5, '#3f6fa8'); P.cyl(1.05, .08, -.6, .18, 1.9, '#d5dde3'); P.box(.8, 1.98, -.85, .5, .32, .5, '#7fb0d8'); P.box(-3.4, -.005, 2.75, 7.6, .02, .7, '#8f989c'); plane(P, -.2, .9, .62); }), this.mat.inst, 1);
    this.inst.plane = inst(mergedGeo(P => plane(P, 0, 0, .9)), this.mat.inst, 1);
    this.inst.amarker = inst(mergedGeo(P => { P.box(-.7, .15, -.32, 1.4, .6, .64, '#ffffff'); P.box(.4, .15, -.32, .4, .5, .64, '#3f6fa8'); }), this.mat.inst, 4);
    this.netAirLines = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat.air);
    n.add(this.netStatic, this.netLines, this.netRoutes, this.netLineMesh, this.netAirLines, this.inst.pin, this.inst.marker, this.inst.airpin, this.inst.plane, this.inst.amarker);
  }
  /** Instanzpuffer bei Bedarf vergrößern (selten, nie pro Frame). */
  ensure(key, n) {
    const m = this.inst[key]; if (n <= m.instanceMatrix.count) return m;
    const bigger = new THREE.InstancedMesh(m.geometry, m.material, Math.max(n, m.instanceMatrix.count * 2)); bigger.count = 0; bigger.frustumCulled = false;
    m.parent.add(bigger); m.parent.remove(m); m.dispose(); this.inst[key] = bigger; return bigger;
  }
  setInst(m, i, x, y, z, rot, sx, sy, sz, hex) { _q.setFromAxisAngle(_up, rot); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); m.setMatrixAt(i, _m); if (hex) m.setColorAt(i, col(hex)); }
  finish(m, n) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

  rebuildStatic() {
    const s = this.site(), W = s.width || 20, H = s.height || 16, L = this.layout = yardLayout(s), P = new Parts(), g = L.gate;
    // Gelände, Hof, Straße, Parkplatz
    P.quad(-70, -40, W + 140, H + 90, -.03, '#b7cfae'); P.quad(-22, -8, W + 40, H + 18, -.02, '#c9d8bf');
    P.quad(-75, L.roadOutZ - 1.1, W + 150, 3.6, -.005, '#7b8c8e'); for (let x = -74; x < W + 74; x += 3) P.quad(x, L.roadOutZ + .62, 1.4, .1, .002, '#e5e8dc');
    P.quad(-75, L.roadOutZ - 1.25, W + 150, .15, -.004, '#d3d9cc'); P.quad(-75, L.roadInZ + 1.15, W + 150, .15, -.004, '#d3d9cc');
    P.quad(-17, H, W + 18, L.roadOutZ - 1.1 - H, -.01, '#a3b0b0'); P.quad(-6, 9.6, 5.8, H - 9.6, -.012, '#b3bdb9');
    // Andockreihe: Dockplätze (Mitte je Dock) und freie Stellplätze; Fuhrpark der eigenen Flotte östlich davon.
    const slots = dockSlots(L, (this.state?.buildings || []).filter(b => b.site === s.id));
    for (const x of [...slots.values(), ...freeBays(L, slots)]) { P.quad(x - .95, H + .05, .07, 5, .003, '#f4f5ec'); P.quad(x + .88, H + .05, .07, 5, .003, '#f4f5ec'); }
    for (const x of slots.values()) P.quad(x - .7, H + .25, 1.4, .12, .004, '#f2c363');
    P.quad(W + 1, H, FLEET_PARK * 1.9 + 1.2, L.roadOutZ - 1.1 - H, -.01, '#a3b0b0');
    for (let i = 0; i <= FLEET_PARK; i++) P.quad(W + 1.2 + i * 1.9, H + .6, .07, 4.6, .003, '#f4f5ec');
    P.quad(-16.6, H + .6, 13.4, .1, .003, '#f2c363'); P.quad(-16.6, H + 6, 13.4, .1, .003, '#f2c363'); P.quad(-16.6, H + .6, .1, 5.5, .003, '#f2c363'); P.quad(-3.3, H + .6, .1, 5.5, .003, '#f2c363');
    for (let i = 0; i < 3; i++) P.quad(-16.2 + i * 4.4, H + 3.2, 3.6, .06, .003, '#e7d9a4');
    P.quad(L.entryX - 1.2, L.laneZ + 2.2, .1, 2.3, .003, '#f4f5ec');
    P.quad(W + 1.5, .5, 9, H - 1, -.008, '#9aa8a8'); for (let i = 0; i < 8; i++) P.quad(W + 1.6, 1.2 + i * 1.8, 3.6, .07, .002, '#f4f5ec'), P.quad(W + 6.8, 1.2 + i * 1.8, 3.6, .07, .002, '#f4f5ec');
    P.quad(W, g - .6, 1.5, 2.2, -.006, '#b3bdb9');
    // Tor/Einfahrt bei Zelle (0, gate): Vorfläche, Warnstreifen, Rahmen
    P.quad(-4.2, g - 1, 4.2, 3, -.006, '#c3cbc6'); for (let i = 0; i < 6; i++) P.quad(-.6, g - .4 + i * .3, .55, .14, .004, i % 2 ? '#3f4f50' : '#f2c363');
    P.box(-.22, 0, g - .62, .2, 2.4, .2, '#8aa29b'); P.box(-.22, 0, g + 1.42, .2, 2.4, .2, '#8aa29b'); P.box(-.22, 2.4, g - .62, .2, .25, 2.24, '#e9b94d');
    // Hofeinfahrt (W1): Pförtnerhaus zwischen Aus- und Einfahrspur, Schranke über der Einfahrspur, Haltelinie
    { const gz = L.yardGateZ; P.box(-4.35, 0, gz - .5, .8, 1.5, 1.2, '#eef0e8'); P.box(-4.42, 1.5, gz - .58, .94, .1, 1.36, '#4f9a85'); P.box(-4.37, .75, gz - .3, .02, .45, .8, '#3d5b6b');
      P.box(-3.5, 0, gz - .08, .16, 1.05, .16, '#5d6d70'); for (let i = 0; i < 5; i++) P.box(-3.38 + i * .4, .9, gz - .04, .4, .08, .08, i % 2 ? '#f4f5ec' : '#cb675d');
      P.quad(L.exitX - .7, gz + .1, 1.4, .12, .004, '#f4f5ec'); }
    // Halle: Bodenplatte, Wandsockel mit Toröffnung, Stützen
    P.box(-.05, -.02, -.05, W + .1, .08, H + .1, '#e3e8e0');
    const wall = (x, z, sx, sz) => P.box(x, 0, z, sx, .5, sz, '#f1f2ea');
    wall(-.18, -.18, W + .36, .18); wall(-.18, H, W + .36, .18); wall(W, 0, .18, H); wall(-.18, 0, .18, g - .6); wall(-.18, g + 1.6, .18, H - g - 1.6);
    for (let x = 0; x <= W; x += 4) { P.box(x - .1, 0, -.2, .2, 2.2, .2, '#bccfc8'); P.box(x - .1, 0, H, .2, 2.2, .2, '#bccfc8'); }
    for (let z = 4; z < H; z += 4) if (Math.abs(z - g) > 1.5) P.box(-.2, 0, z - .1, .2, 2.2, .2, '#bccfc8'); for (let z = 4; z < H; z += 4) P.box(W, 0, z - .1, .2, 2.2, .2, '#bccfc8');
    P.box(-.2, 2.2, -.2, W + .4, .1, .12, '#c9d8d2'); P.box(W + .02, 2.2, -.2, .14, .1, H + .4, '#c9d8d2');
    // Anlagen
    const buildings = (this.state?.buildings || []).filter(b => b.site === s.id);
    for (const b of buildings) {
      const d = BUILDINGS[b.type] || { w: 2, h: 2, color: '#42a594' }, box = buildingBox(b), rot = (b.rotation || 0) % 360;
      if (this.q.shadow) P.quad(box.x0 + .18, box.z0 + .2, box.w, box.h, .062, '#c6ccc2'); // Bodenschatten-Andeutung (ab Mittel)
      P.base.makeRotationY(-THREE.MathUtils.degToRad(rot)).setPosition((box.x0 + box.x1) / 2, .06, (box.z0 + box.z1) / 2);
      buildingModel(P, b.type, d); P.base.identity();
    }
    // Hofmasten (Leuchtkörper und Lichtkegel separat, s. rebuildLights)
    const yards = buildings.filter(b => b.type === 'containeryard').map(b => { const box = buildingBox(b); return { x: (box.x0 + box.x1) / 2, z: (box.z0 + box.z1) / 2 }; });
    const lights = this.rebuildLights(s, L, [...slots.values()], yards);
    for (const m of lights.masts) { P.cyl(m.x, 0, m.z, .07, m.h, '#7d8c8f'); P.box(m.x - .35, m.h - .12, m.z - .04, .7, .06, .08, '#7d8c8f'); }
    const old = this.static.geometry; this.static.geometry = P.geometry(); old.dispose();
    const pts = []; for (let x = 0; x <= W; x++) pts.push(x, .065, 0, x, .065, H); for (let y = 0; y <= H; y++) pts.push(0, .065, y, W, .065, y);
    const og = this.grid.geometry; this.grid.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); og.dispose();
    // Bäume (deterministisch)
    const trees = []; for (let i = 0; i < 9; i++) trees.push([-8 + i * (W + 14) / 8, -5.5 - (i % 2) * 1.6]); for (let i = 0; i < 5; i++) trees.push([W + 13 + (i % 2) * 1.5, -1 + i * 4]); for (let i = 0; i < 4; i++) trees.push([-20 - (i % 2) * 2, 1 + i * 3.6]);
    for (let i = 0; i < 6; i++) trees.push([-14 + i * 6.5 + (i % 2) * 1.5, L.roadInZ + 3.2]);
    trees.length = Math.min(trees.length, this.q.cap.trees);
    const tr = this.ensure('trunk', trees.length), cr = this.ensure('crown', trees.length);
    trees.forEach(([x, z], i) => { const k = .85 + ((i * 37) % 10) / 25; this.setInst(tr, i, x, 0, z, 0, k, k, k); this.setInst(cr, i, x, .4 * k, z, i, k, k, k, ['#7fa877', '#8db582', '#71996c'][i % 3]); });
    this.finish(tr, trees.length); this.finish(cr, trees.length);
    this.buildNetwork();
  }
  buildNetwork() {
    const sites = this.state?.sites || [this.site()], air = this.netAir = airRelevant(this.state), { pins, nodes } = networkLayout(sites, undefined, air ? [AIRPORT] : []), P = new Parts(); this.pins = pins; this.netLineKey = null;
    this.airNode = air ? nodes[0] : null; if (this.airNode) P.cyl(this.airNode.x, -.01, this.airNode.z, 4.2, .02, '#c4d3df', true);
    P.quad(-90, -70, 180, 140, -.02, '#cfe0c8');
    for (let i = 0; i < this.q.net.patches; i++) { const x = ((i * 53) % 150) - 75, z = ((i * 31) % 110) - 55; P.quad(x, z, 6 + (i % 4) * 2, 4 + (i % 3) * 2, -.015, i % 2 ? '#c3d8bb' : '#d7e5cf'); }
    for (const p of pins) P.cyl(p.x, -.01, p.z, 3.4, .02, '#bdd3b6', true);
    const og = this.netStatic.geometry; this.netStatic.geometry = P.geometry(); og.dispose();
    const pts = []; for (let i = 1; i < pins.length; i++) { let best = pins[0], bd = Infinity; for (let j = 0; j < i; j++) { const d = Math.hypot(pins[i].x - pins[j].x, pins[i].z - pins[j].z); if (d < bd) { bd = d; best = pins[j]; } } pts.push(best.x, .03, best.z, pins[i].x, .03, pins[i].z); }
    const ol = this.netLines.geometry; this.netLines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts.length ? pts : [0, 0, 0, 0, 0, 0], 3)); ol.dispose();
  }

  /** Statusabhängige Instanzen: Lampen, Statusflächen, Paletten, Figuren, Autos, Fahrzeugpläne, Geist. */
  updateDynamic() {
    const st = this.state, s = this.site(), buildings = (st?.buildings || []).filter(b => b.site === s.id);
    let n = 0, np = 0; this.boxes = []; this.infra = []; const lamp = this.ensure('lamp', buildings.length), plate = this.ensure('plate', buildings.length);
    let pallets = 0; for (const b of buildings) if (/rack|shelf|regal/.test(b.type)) pallets += 3 * Math.max(1, Math.floor(BUILDINGS[b.type]?.w || 2));
    const pal = this.ensure('pallet', pallets), cuse = new Map(containerYardUse(st, s.id, buildings).map(u => [u.id, u]));
    for (const b of buildings) {
      const box = buildingBox(b), tone = buildingTone(b), cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2, warn = b.type === 'coldstore' && coldWarnings(st, b.site).length;
      this.boxes.push({ id: b.id, box });
      if (b.type === 'containeryard') { const u = cuse.get(b.id), full = u && u.used >= u.cap; this.infra.push({ id: b.id, x: cx, y: 2.45, z: cz, text: containerYardLabel(u), tone: full || tone === 'blocked' ? 'wait' : 'infra', prio: full || tone === 'blocked' ? 1 : 3 }); }
      else if (b.type === 'forklift') { const low = forkliftCharge(b) < FORK_MIN; this.infra.push({ id: b.id, x: cx, y: box.y1 + .75, z: cz, text: forkliftLabel(b), tone: low || tone === 'blocked' ? 'wait' : 'infra', prio: low || tone === 'blocked' ? 1 : 3 }); }
      else this.infra.push({ id: b.id, x: cx, y: box.y1 + .75, z: cz, text: `${BUILDINGS[b.type]?.name || b.type} · ${this.buildingStatus(b)}`, tone: tone === 'blocked' || warn ? 'wait' : 'infra', prio: warn || tone === 'blocked' || (b.type === 'terminal' && b.freightTask) ? 1 : 3 });
      this.setInst(lamp, n, cx, box.y1 + .32, cz, 0, 1, 1, 1, warn ? TONE_HEX.blocked : TONE_HEX[tone]);
      this.setInst(plate, n, cx, .07, cz, 0, box.w + .12, 1, box.h + .12, tone === 'active' ? '#7fd9b4' : tone === 'blocked' || warn ? '#f3c674' : '#d7dfdb'); n++;
      if (/rack|shelf|regal/.test(b.type)) {
        const d = BUILDINGS[b.type], rot = -THREE.MathUtils.degToRad((b.rotation || 0) % 360), c = Math.cos(rot), sn = Math.sin(rot);
        for (const p of rackPallets(st, b)) { const lx = -d.w / 2 + .5 + p.cell, ly = .06 + .25 + p.level * .65; this.setInst(pal, np++, cx + lx * c, ly, cz - lx * sn, rot, 1, 1, Math.min(1, d.h - .15)); }
      }
    }
    this.finish(lamp, n); this.finish(plate, n); this.finish(pal, np);
    // Beschäftigte
    // Qualität: Obergrenze Personen, jenseits LOD-Abstand ausgeblendet (nur Darstellung; ausgeblendete Figuren nicht anklickbar).
    const q = this.q, lodP = q.lod.person, allSpots = workerSpots(st, s, buildings), spots = [];
    for (const w of allSpots) { if (spots.length >= q.cap.people) break; if (this.lodDist(w.x, w.z) <= lodP) spots.push(w); }
    const body = this.ensure('body', spots.length), head = this.ensure('head', spots.length);
    spots.forEach((w, i) => { this.setInst(body, i, w.x, .06, w.z, 0, 1, 1, 1, w.role === 'warehouse' ? '#eeb354' : w.role === 'technician' ? '#d07c6a' : w.role === 'driver' ? '#6f8fc9' : '#579ba1'); this.setInst(head, i, w.x, .06, w.z, 0, 1, 1, 1); });
    this.finish(body, spots.length); this.finish(head, spots.length);
    for (const w of spots) this.boxes.push({ id: w.id, box: { x0: w.x - .2, x1: w.x + .2, y0: 0, y1: .85, z0: w.z - .2, z1: w.z + .2 } });
    // Parkplatz: Autos nach Belegschaft (nur Ausstattung)
    const cars = Math.min(16, q.cap.cars, allSpots.length), car = this.ensure('car', cars), L = this.layout;
    for (let i = 0; i < cars; i++) this.setInst(car, i, L.W + 3.4 + (i % 2) * 5.2, 0, 2.1 + Math.floor(i / 2) * 1.8, 0, 1, 1, 1, ['#d9dfe2', '#7c96a8', '#c9b28a', '#a7b9a1', '#e6e2d7'][i % 5]);
    this.finish(car, cars);
    // Fahrzeugpläne; Positionen folgen pro Frame
    const plans = fleetPlans(st, s.id, buildings, L);
    for (const p of plans) Object.assign(p, { path: p.plan.mode === 'site' ? null : vehiclePath(L, p.pose, p.plan.mode), x: p.pose.x, z: p.pose.z, heading: p.pose.heading, shown: false, label: vehicleLabel(st, p.plan, p.v, x => this.statusLabel(x)) });
    this.fleet = plans; this.ensure('vbox', plans.length); this.ensure('vcab', plans.length); this.ensure('vbase', plans.length);
    for (const p of plans) { p.hit = { id: p.v.id, box: { x0: 0, x1: 0, y0: 0, y1: 1.9, z0: 0, z1: 0 }, fleet: p }; this.boxes.push(p.hit); }
    // Fremd-Lkw aus s.yard (W1-S4); Positionen folgen pro Frame. Phasenwechsel übernehmen die zuletzt gezeigte Pose (nur Darstellung).
    const prevYard = this.yardMap, yardMap = new Map(), yplans = [], order = queueOrder(st?.yard, s.id), now = this.clock.shown ?? st?.t ?? 0;
    // W3b: Stellplätze im Containerhof (stabil über this.contSlots), Halteplatz der Chassis je Containerhof.
    const cy = containerYardSlots(st, s.id, buildings, this.contSlots), yardsHere = buildings.filter(b => b.type === 'containeryard');
    this.contSlots = cy.map;
    const yardFor = a => { if (!yardsHere.length) return null; const held = a.containerIds?.map(id => cy.map.get(id)?.b).find(Boolean); if (held) return held;
      return yardsHere.find(b => (cuse.get(b.id)?.used ?? 0) < (cuse.get(b.id)?.cap ?? 0)) || yardsHere[0]; };
    for (const a of st?.yard || []) {
      if (a.site !== s.id || !(a.kind === 'container' ? CONTAINER_PHASE_LABEL : PHASE_LABEL)[a.phase]) continue;
      const p0 = prevYard?.get(a.id), rank = a.phase === 'queue' ? order.indexOf(a.id) : -1, last = p0 ? { x: p0.x, z: p0.z, heading: p0.heading } : null;
      let from = null, slide = null;
      if (a.phase === 'queue' && p0) slide = p0.phase === 'queue' ? (p0.rank === rank ? p0.slide : { from: last, at: now }) : ['toDock', 'docking'].includes(p0.phase) ? { from: last, at: now } : null;
      if (a.phase === 'toDock' || a.phase === 'toYard') from = p0?.phase === a.phase ? p0.from : last;
      let dock;
      if (a.kind === 'container') { const y = (a.phase === 'exit' && p0?.dock) || (yardFor(a) && yardBayPose(L, yardFor(a))); dock = y || null; }
      else dock = dockPoseFor(L, buildings, a.dock) || (a.phase === 'exit' ? p0?.dock || null : null);
      const plan = arrivalPlan(L, a, { rank, dock, from, slide }); if (!plan) continue;
      Object.assign(plan, { rank, from, slide, dock, shown: true }); arrivalPose(plan, now, plan);
      plan.hit = { id: a.id, box: { x0: 0, x1: 0, y0: 0, y1: 2, z0: 0, z1: 0 }, fleet: plan }; this.boxes.push(plan.hit);
      yardMap.set(a.id, plan); yplans.push(plan);
    }
    this.yardMap = yardMap; this.yardFleet = yplans; this.ensure('ftrailer', yplans.length);
    // W3b: Container im Hof (statisch je Zustand), am Dock (Hofumfuhr/Entladen, Pose pro Frame), Chassis-Ladung pro Frame in placeYard.
    const home = new Map(), prevHome = this.contHome;
    for (const [id, slot] of cy.map) home.set(id, slot.b.id);
    const dconts = this.dockConts = dockContainerPlans(st, s.id, buildings, L, c => { const b = buildings.find(o => o.id === prevHome?.get(c.id)) || yardsHere[0]; return b ? yardBayPose(L, b) : null; });
    for (const p of dconts) { if (prevHome?.has(p.id)) home.set(p.id, prevHome.get(p.id)); arrivalPose(p, now, p); p.shown = true; p.hit = { id: p.id, box: { x0: 0, x1: 0, y0: 0, y1: 1.4, z0: 0, z1: 0 }, fleet: p }; this.boxes.push(p.hit); }
    this.contHome = home;
    this.ensure('fcab', yplans.length + dconts.length); this.ensure('cchassis', yplans.length + dconts.length);
    const cont = this.ensure('cont', cy.map.size + yplans.length + dconts.length), door = this.ensure('cdoor', cy.map.size), mark = this.ensure('cmark', cy.map.size + dconts.length);
    let nc = 0, nd = 0, nm = 0; const cpose = {}; this.contLabels = [];
    let shownC = 0;
    for (const c of cy.containers) {
      const slot = cy.map.get(c.id); if (!slot || shownC >= q.cap.containers) continue; shownC++; yardSlotPose(slot, cpose); const rot = cpose.rot;
      this.setInst(cont, nc++, cpose.x, cpose.y, cpose.z, rot, 1, 1, 1, containerTint(c));
      const ox = Math.cos(rot), oz = -Math.sin(rot); // lokale +x-Achse in Welt (Drehung wie toWorld)
      if (containerEmpty(c)) this.setInst(door, nd++, cpose.x, cpose.y, cpose.z, rot, 1, 1, 1, containerTint(c));
      if (c.demurrageMinutes > 0) this.setInst(mark, nm++, cpose.x, cpose.y + CONTAINER_H, cpose.z, rot, 1, 1, 1, DEMURRAGE_HEX);
      const hx = Math.abs(ox) * CONTAINER_LEN / 2 + Math.abs(oz) * CONTAINER_W / 2, hz = Math.abs(oz) * CONTAINER_LEN / 2 + Math.abs(ox) * CONTAINER_W / 2;
      this.boxes.push({ id: c.id, box: { x0: cpose.x - hx, x1: cpose.x + hx, y0: cpose.y, y1: cpose.y + CONTAINER_H, z0: cpose.z - hz, z1: cpose.z + hz } });
      this.contLabels.push({ id: c.id, x: cpose.x, y: cpose.y + CONTAINER_H + .5, z: cpose.z, text: containerLabel(c), tone: c.demurrageMinutes > 0 ? 'bad' : c.waitReason ? 'wait' : 'infra' });
    }
    for (const p of dconts) { p.chip = { id: p.id, x: p.x, y: 2.1, z: p.z, text: p.label, tone: p.demurrage ? 'bad' : p.status === 'toDock' ? 'move' : 'dock' }; this.contLabels.push(p.chip); }
    this.contBase = nc; this.markBase = nm; this.finish(door, nd);
    // Pakete (W1): Rollcontainer (inbound) auf den Docks, Kartonstapel (stock) am Sortierplatz-Ausgang bzw. an Regalen.
    // Qualität: Obergrenze je Art, jenseits LOD-Abstand nur jeder zweite Rollcontainer/Stapel (Andeutung der Menge bleibt).
    const loads = parcelLoads(st, s.id, buildings), lodK = q.lod.parcel, thin = (list, cap) => { const out = []; list.forEach((c, i) => { if (out.length < cap && (i % 2 === 0 || this.lodDist(c.x, c.z) <= lodK)) out.push(c); }); return out; };
    const cages = thin(loads.cages, q.cap.parcels), stacks = thin(loads.stacks, q.cap.parcels), cage = this.ensure('cage', cages.length), stack = this.ensure('stack', stacks.length + buildings.filter(b => b.type === 'crossbelt').length); // + Fehlwurfstapel je Quergurt
    cages.forEach((c, i) => this.setInst(cage, i, c.x, .56, c.z, c.rot, 1, 1, 1)); this.finish(cage, cages.length);
    stacks.forEach((c, i) => this.setInst(stack, i, c.x, .065, c.z, c.rot, 1, c.sy, 1)); this.finish(stack, stacks.length);
    // 0.15: Kühlpakete (eigene Instanzen, gleiche Dichte und Obergrenze wie Pakete), Sperrgut im Lager (Form/Farbe je Stück).
    const cold = coldLoads(st, s.id, buildings, loads), ccages = thin(cold.cages, q.cap.parcels), cstacks = thin(cold.stacks, q.cap.parcels), ccage = this.ensure('ccage', ccages.length), cstack = this.ensure('cstack', cstacks.length);
    ccages.forEach((c, i) => this.setInst(ccage, i, c.x, .56, c.z, c.rot, 1, 1, 1)); this.finish(ccage, ccages.length);
    cstacks.forEach((c, i) => this.setInst(cstack, i, c.x, .065, c.z, c.rot, 1, c.sy, 1)); this.finish(cstack, cstacks.length);
    const bl = bulkyLoads(st, s.id, buildings), pieces = bl.pieces.slice(0, q.cap.pallets), trailerBulk = yplans.reduce((n, p) => n + (p.ware === 'bulky' ? p.bulky : 0), 0), bk = this.ensure('bulky', pieces.length + trailerBulk);
    pieces.forEach((c, i) => this.setInst(bk, i, c.x, .065 + c.y, c.z, c.rot, c.sx, c.sy, c.sz, c.hex)); this.bulkyBase = pieces.length; this.finish(bk, pieces.length);
    this.ensure('freefer', yplans.filter(p => p.ware === 'cold').length);
    // Quergurtsorter: Wagenzahl je Stufe; Lage pro Frame (placeBelts), Fehlwurfbehälter zeigt Nachsortierung als kleinen Paketstapel.
    const nCar = BELT_CARRIERS[this.qualityLevel] || BELT_CARRIERS.high, resort = resortQty(st, s.id) > 0, coldIn = cold.inbound > 0;
    const belts = this.belts = buildings.filter(b => b.type === 'crossbelt').map(b => ({ b, running: beltRunning(b), loaded: beltLoaded(b), coldIn }));
    this.ensure('xcar', belts.length * nCar); this.ensure('xpar', belts.length * nCar); this.beltCars = nCar; this.beltsDirty = true;
    if (resort && belts.length) { const rp = {}; belts.forEach((x, i) => { toWorld(x.b, BELT_REJECT.x, BELT_REJECT.z, rp); this.setInst(stack, stacks.length + i, rp.x, .38, rp.z, rp.rot, .55, .45, .9); }); this.finish(stack, stacks.length + belts.length); }
    // Paletten (W2-S2): Palettenstapel im Lager (gedeckelt), Ladung der Palettenauflieger, Stapler mit Akkubalken.
    const pl = palletLoads(st, s.id, buildings), plist = pl.pallets.slice(0, q.cap.pallets * PALLET_LEVELS), ps = this.ensure('pstack', plist.length);
    plist.forEach((c, i) => this.setInst(ps, i, c.x, .065 + c.level * .47, c.z, c.rot, 1, 1, 1)); this.finish(ps, plist.length);
    this.ensure('fflat', yplans.length); this.ensure('tload', yplans.reduce((n, p) => n + p.pallets, 0));
    const forks = this.forks = forkliftPlans(st, s.id, buildings), bar = this.ensure('charge', forks.length); this.ensure('fork', forks.length); this.ensure('fload', forks.length);
    forks.forEach((f, i) => { const c = f.charger; this.setInst(bar, i, c.x + Math.sin(c.rot) * .14, .4, c.z + Math.cos(c.rot) * .14, c.rot, .18, .02 + .56 * f.charge / 100, .02, f.color); });
    this.finish(bar, forks.length);
    for (const f of forks) { f.infra = this.infra.find(e => e.id === f.id); f.shown = true; f.hit = { id: f.id, box: { x0: 0, x1: 0, y0: 0, y1: 1, z0: 0, z1: 0 }, fleet: f }; this.boxes.push(f.hit); }
    // Auswahlrahmen und Baugeist
    const sel = buildings.find(b => b.id === this.selected);
    if (sel && this.view !== 'network') { const b = buildingBox(sel); this.selectBox.scale.set(b.w + .16, b.y1 + .1, b.h + .16); this.selectBox.position.set(b.x0 - .08, .02, b.z0 - .08); this.selectBox.visible = true; } else this.selectBox.visible = false;
    this.ghostInfo = null;
    if (this.build && this.hover && this.view !== 'network' && BUILDINGS[this.build]) {
      const b = { type: this.build, x: this.hover.x, y: this.hover.y, rotation: this.buildRotation }, f = footprint(b);
      const overlap = buildings.some(o => { if (o.id === this.movingId) return false; const d = buildingBox(o); return b.x < d.x1 && b.x + f.w > d.x0 && b.y < d.z1 && b.y + f.h > d.z0; });
      let valid = b.x >= 0 && b.y >= 0 && b.x + f.w <= s.width && b.y + f.h <= s.height && !overlap, reason = valid ? '' : 'Fläche nicht verfügbar';
      if (valid && st) {
        const key = [s.id, b.x, b.y, this.build, this.buildRotation, this.movingId].join(':');
        if (this.ghostCache?.key !== key) { const candidate = { ...b, id: 'build-preview', site: s.id, enabled: true }; this.ghostCache = { key, result: reachable(st, s.id, [...st.buildings.filter(o => o.id !== this.movingId), candidate]) }; }
        valid = this.ghostCache.result.ok; reason = this.ghostCache.result.message || '';
      }
      this.mat.ghost.color.set(valid ? 0x55caad : 0xdf7d73); this.ghost.scale.set(f.w, (HEIGHT[this.build] || 1) * .8, f.h); this.ghost.position.set(b.x + f.w / 2, .07, b.y + f.h / 2); this.ghost.visible = true;
      this.ghostInfo = { x: b.x + f.w / 2, z: b.y + f.h / 2, y: (HEIGHT[this.build] || 1) + .3, text: valid ? `${BUILDINGS[this.build].name} · ${b.x + 1}, ${b.y + 1}` : reason, tone: valid ? 'dock' : 'bad' };
    } else this.ghost.visible = false;
    // Netz: Pins und Transfers
    if (this.view === 'network') this.updateNetwork();
  }
  updateNetwork() {
    if (airRelevant(this.state) !== !!this.netAir) this.buildNetwork();
    const st = this.state, pin = this.ensure('pin', this.pins.length);
    this.pins.forEach((p, i) => this.setInst(pin, i, p.x, 0, p.z, 0, 1, 1, 1, p.id === st?.selectedSite ? '#4f9a85' : '#9cc3b4'));
    this.finish(pin, this.pins.length);
    const active = (st?.transfers || []).filter(t => !['complete', 'cancelled'].includes(t.status)); this.transfers = [];
    const pts = [];
    for (const t of active) { const a = this.pins.find(p => p.id === (t.fromSite || t.site)), b = this.pins.find(p => p.id === t.toSite); if (!a || !b) continue; pts.push(a.x, .05, a.z, b.x, .05, b.z); this.transfers.push({ id: t.id, t, a, b, x: a.x, z: a.z, heading: Math.atan2(b.z - a.z, b.x - a.x), label: `${t.qty} Stk. · ${this.statusLabel(t.status)}`, blocked: !!t.blocked }); }
    const og = this.netRoutes.geometry; this.netRoutes.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts.length ? pts : [0, 0, 0, 0, 0, 0], 3)); this.netRoutes.computeLineDistances(); og.dispose();
    // Linien (W3-S2): Band mit Richtungspfeilen, Geometrie nur bei Änderung von Linien/Pins neu.
    const lines = networkLines(st, this.pins), key = lines.map(l => `${l.id}:${l.from}>${l.to}:${l.active ? 1 : 0}`).join(',') + '|' + this.pins.map(p => `${p.id}@${p.x},${p.z}`).join(',');
    if (key !== this.netLineKey) {
      this.netLineKey = key; const { pos, colr } = networkLineMesh(lines), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); if (pos.length) g.computeBoundingSphere();
      const ol = this.netLineMesh.geometry; this.netLineMesh.geometry = g; ol.dispose();
    }
    this.netLineList = lines; const prev = new Map(this.trips.map(t => [t.id, t])); this.trips = [];
    for (const lh of st?.linehauls || []) {
      if (!['loading', 'transit', 'unloading', 'returning'].includes(lh.status)) continue;
      const line = lines.find(l => l.id === lh.lineId && l.from === lh.from) || networkLines({ lines: [{ id: lh.lineId, from: lh.from, to: lh.to }] }, this.pins)[0]; if (!line) continue;
      const old = prev.get(lh.id), v = st.vehicles?.find(x => x.id === lh.vehicleId);
      this.trips.push({ id: lh.id, vehicleId: lh.vehicleId, lh, v, line, x: old?.x ?? line.x0, z: old?.z ?? line.z0, pct: -1, label: '', heading: line.heading, blocked: !!lh.blocked });
    }
    this.ensure('marker', this.transfers.length + this.trips.length);
    // W3c: Terminal, gestrichelte Verbindungen Hub → Terminal, Zubringer (Fortschritt pro Frame), Flugplan für das Startflugzeug.
    const air = this.airNode, ap = this.inst.airpin; this.airTrips = []; this.airLabel = '';
    if (air) { this.setInst(ap, 0, air.x, 0, air.z, 0, 1, 1, 1, '#ffffff'); this.airLabel = airportLabel(st); }
    this.finish(ap, air ? 1 : 0);
    const links = airLinks(st, this.pins, air), ak = links.map(l => `${l.id}@${l.x0.toFixed(2)},${l.z0.toFixed(2)}`).join(',') + (air ? `|${air.x},${air.z}` : '');
    if (ak !== this.airLinkKey) {
      this.airLinkKey = ak; const pts = []; for (const l of links) pts.push(l.x0, .07, l.z0, l.x1, .07, l.z1);
      const og = this.netAirLines.geometry; this.netAirLines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts.length ? pts : [0, 0, 0, 0, 0, 0], 3)); this.netAirLines.computeLineDistances(); og.dispose();
    }
    this.netAirLines.visible = links.length > 0; this.airLinkList = links;
    const prevAir = new Map((this._airPrev || []).map(t => [t.id, t]));
    if (air) for (const sh of st?.airShuttles || []) {
      if (!['loading', 'transit', 'handover', 'returning'].includes(sh.status)) continue;
      const line = links.find(l => l.site === sh.site); if (!line) continue;
      const old = prevAir.get(sh.id), v = st.vehicles?.find(x => x.id === sh.vehicleId);
      this.airTrips.push({ id: sh.id, vehicleId: sh.vehicleId, sh, v, line, x: old?.x ?? line.x0, z: old?.z ?? line.z0, pct: -1, label: '', heading: line.heading, blocked: !!sh.blocked });
    }
    this._airPrev = this.airTrips; this.ensure('amarker', this.airTrips.length);
    this.airMinutes = air ? airFlightMinutes(st) : [];
  }

  // ----- Frame -----
  displayClock(now) {
    const c = this.clock, t = this.state?.t ?? 0; if (c.base == null) return t;
    let v = c.base + Math.min(c.rate * (now - c.at) / 1000, c.rate * .3);
    if (c.shown != null && v < c.shown && c.shown - v < 1.5) v = c.shown; c.shown = v; return v;
  }
  tick(now) {
    const dt = this.lastFrame ? Math.min(.1, (now - this.lastFrame) / 1000) : 0;
    if (this.renderedLast && this.lastFrame && adaptResolution(this.res, now - this.lastFrame, now)) { this.renderer.setPixelRatio(this.res.ratio); this.renderer.setSize(this.width, this.height, false); }
    if (this.qualityMode === 'auto' && this.renderedLast && this.lastFrame) { const next = autoQuality(this.auto, now - this.lastFrame, now); if (next) this.applyQuality(next); }
    this.lastFrame = now;
    this.sync();
    // Kamera sanft zum Ziel (Drehen, Home, Fokus); Rundgang setzt die Pose direkt, Verfolgen setzt das Ziel.
    const tourMoving = this.camMode?.mode === 'tour' && this.stepTour(now);
    const c = this.cam, g = this.goal, k = 1 - Math.exp(-dt * 9); let moving = tourMoving;
    for (const key of CAM_KEYS) { const d = g[key] - c[key]; if (Math.abs(d) > (key === 'yaw' ? 1e-4 : 1e-3)) { c[key] += dt ? d * k : 0; moving = true; } else c[key] = g[key]; }
    if (moving || this.needs) {
      this.applyCamera();
      // LOD von Personen/Paketen hängt am Kameraabstand: bei Wechsel des 4-Einheiten-Rasters Instanzen neu setzen (nicht pro Frame).
      const lk = `${this.view}:${Math.round(c.tx / 4)},${Math.round(c.tz / 4)},${Math.round(c.dist / 4)},${Math.round(c.yaw * 2)}`; if (lk !== this.lodKey) { this.lodKey = lk; this.dynDirty = true; }
    }
    const net = this.view === 'network'; this.siteGroup.visible = !net; this.netGroup.visible = net;
    const clock = this.displayClock(now), animated = net ? this.placeTransfers(clock) : !!(this.placeVehicles(clock) | this.placeYard(clock) | this.placeForklifts(clock) | this.placeBelts(clock, dt));
    if (this.camMode?.mode === 'follow') {
      const f = net ? netFollowTarget(this.trips, this.camMode.id, this.airTrips) : followTarget(this.fleet, this.yardFleet, this.camMode.id);
      if (!f) this.stopCamera('lost'); else if (Math.abs(f.x - g.tx) > 1e-3 || Math.abs(f.z - g.tz) > 1e-3) { g.tx = f.x; g.tz = f.z; this.needs = true; }
    }
    const render = moving || this.needs || animated || this.pointer?.moved;
    if (render) { this.renderer.render(this.scene, this.camera()); this.updateLabels(); this.needs = false; }
    this.renderedLast = render;
  }
  /** Statische Geometrie und Instanzen nach setState/Ansichtswechsel nachziehen (keine String-Erzeugung pro Frame). */
  sync() {
    if (this.sigDirty) { this.sigDirty = false; const sig = sceneSignature(this.state, this.site().id); if (sig !== this.signature) { this.signature = sig; this.rebuildStatic(); this.dynDirty = true; } }
    if (this.dynDirty) { this.dynDirty = false; this.updateDynamic(); this.needs = true; }
  }
  /** Rundgang: Fahrt (TOUR_TRAVEL s, sanft) zur Station, Halt (TOUR_DWELL s), dann nächste; nach „Ausgang“ Ende. */
  stepTour(now) {
    const m = this.camMode; if (m.at == null) m.at = now;
    const to = m.stops[m.i], travel = m.cut ? 0 : TOUR_TRAVEL * 1000, e = now - m.at;
    if (e < travel) tourPose(m.from, to, e / travel, this.cam); else Object.assign(this.cam, { tx: to.tx, tz: to.tz, dist: to.dist, yaw: to.yaw });
    for (const k of CAM_KEYS) this.goal[k] = this.cam[k];
    if (e >= travel + TOUR_DWELL * 1000) {
      if (m.i + 1 >= m.stops.length) { this.stopCamera('done'); return true; }
      m.i++; m.from = { ...this.cam }; m.at = now; this.callbacks.onCameraMode?.('tour', { stop: m.stops[m.i].key, label: m.stops[m.i].label });
    }
    return true;
  }
  placeVehicles(clock) {
    const st = this.state, f = this.fleet, box = this.inst.vbox, cab = this.inst.vcab, base = this.inst.vbase, pose = this.tmp.pose, lodV = this.q.lod.vehicle; let n = 0, nc = 0, nb = 0, animated = false;
    for (const p of f) {
      const t = vehicleT(p.plan, p.v, clock, st?.t, 8);
      if (t == null) { p.shown = false; continue; }
      if (p.path) { pointOnPath(p.path, p.plan.mode === 'out' ? t : 1 - t, pose); p.x = pose.x; p.z = pose.z; p.heading = pose.heading; animated = true; p.tone = t < .3 ? 'gate' : 'move'; }
      else { p.tone = p.plan.tone; }
      p.shown = true; const sx = p.len / 4.2, rot = -p.heading, type = p.v.type;
      // LOD: jenseits des Stufenabstands nur der Aufbau als Box (in Kabinenfarbe), ohne Kabine und Fahrgestell.
      if (this.lodDist(p.x, p.z) > lodV) { this.setInst(box, n++, p.x, 0, p.z, rot, sx * 1.4, type === 'van' ? .82 : 1, 1, CAB_HEX[type] || '#ebac53'); }
      else { this.setInst(box, n++, p.x, 0, p.z, rot, sx, type === 'van' ? .82 : 1, 1, BOX_HEX[type] || '#eef0e8'); this.setInst(cab, nc++, p.x, 0, p.z, rot, sx, type === 'van' ? .9 : 1, 1, CAB_HEX[type] || '#ebac53'); this.setInst(base, nb++, p.x, 0, p.z, rot, sx, 1, 1, '#ffffff'); }
      const r = p.len / 2, hb = p.hit.box; hb.x0 = p.x - r; hb.x1 = p.x + r; hb.z0 = p.z - r; hb.z1 = p.z + r;
    }
    this.finish(box, n); this.finish(cab, nc); this.finish(base, nb); return animated;
  }
  placeYard(clock) {
    const tr = this.inst.ftrailer, cab = this.inst.fcab, flat = this.inst.fflat, load = this.inst.tload, chs = this.inst.cchassis, cont = this.inst.cont, mark = this.inst.cmark;
    const bk = this.inst.bulky, reefer = this.inst.freefer; let nb = this.bulkyBase || 0, nr = 0;
    let n = 0, nt = 0, nf = 0, nl = 0, nch = 0, nc = this.contBase || 0, nm = this.markBase || 0, animated = false; const lodV = this.q.lod.vehicle;
    const onChassis = (p, rot, hex, demurrage) => {
      this.setInst(chs, nch++, p.x, 0, p.z, rot, 1, 1, 1, '#ffffff'); if (!hex) return;
      const x = p.x + CHASSIS_LX * Math.cos(p.heading), z = p.z + CHASSIS_LX * Math.sin(p.heading);
      this.setInst(cont, nc++, x, CHASSIS_Y, z, rot, 1, 1, 1, hex); if (demurrage) this.setInst(mark, nm++, x, CHASSIS_Y + CONTAINER_H, z, rot, 1, 1, 1, DEMURRAGE_HEX);
    };
    for (const p of this.yardFleet) {
      arrivalPose(p, clock, p); if (arrivalMoving(p, clock)) animated = true;
      const rot = -p.heading, far = this.lodDist(p.x, p.z) > lodV; this.setInst(cab, n, p.x, 0, p.z, rot, 1, 1, 1, p.color); n++;
      if (p.container) onChassis(p, rot, p.loaded ? p.ccolor : null, false);
      else if (p.pallet) {
        // Palettenauflieger: Ladung von vorn (Stirnwand) nach hinten, hintere Plätze leeren sich beim Entladen zuerst.
        this.setInst(flat, nf++, p.x, 0, p.z, rot, 1, 1, 1, '#e3e6ea'); const c = Math.cos(p.heading), sn = Math.sin(p.heading);
        if (!far) for (let i = 0; i < p.pallets; i++) { const lx = .4 - Math.floor(i / 2) * .85, lz = i % 2 ? .3 : -.3; this.setInst(load, nl++, p.x + lx * c - lz * sn, .62, p.z + lx * sn + lz * c, rot, .75, .9, .75); }
      } else if (p.ware === 'bulky') {
        // 0.15 Sperrgut: Pritsche mit langen Kisten (Form/Farbe je Platz), hintere Plätze leeren sich zuerst.
        this.setInst(flat, nf++, p.x, 0, p.z, rot, 1, 1, 1, '#d9cdb8'); const c = Math.cos(p.heading), sn = Math.sin(p.heading);
        if (!far) for (let i = 0; i < p.bulky; i++) { const sh = bulkyShape(i), lx = .35 - Math.floor(i / 2) * 1.12, lz = i % 2 ? .3 : -.3; this.setInst(bk, nb++, p.x + lx * c - lz * sn, .62, p.z + lx * sn + lz * c, rot + sh.tilt * .5, sh.s[0], Math.min(1.2, sh.s[1]), Math.min(1.05, sh.s[2]), sh.hex); }
      } else if (p.ware === 'cold') {
        // 0.15 Kühlpaket: Kühlauflieger (hellblau-weiß) mit Kühlaggregat an der Stirnwand und blauen Seitenbändern.
        this.setInst(tr, nt++, p.x, 0, p.z, rot, 1, 1, 1, '#e4f0f8'); this.setInst(reefer, nr++, p.x, 0, p.z, rot, 1, 1, 1);
      } else this.setInst(tr, nt++, p.x, 0, p.z, rot, 1, 1, 1, '#e3e6ea');
      const r = FOREIGN_LEN / 2, hb = p.hit.box; hb.x0 = p.x - r; hb.x1 = p.x + r; hb.z0 = p.z - r; hb.z1 = p.z + r;
    }
    // W3b: Container am Dock auf Hofchassis mit Hofzugmaschine (neutral grau); Umfuhr interpoliert wie Fremd-Lkw.
    for (const p of this.dockConts || []) {
      arrivalPose(p, clock, p); if (arrivalMoving(p, clock)) animated = true;
      const rot = -p.heading; this.setInst(cab, n++, p.x, 0, p.z, rot, 1, 1, 1, '#8d979b'); onChassis(p, rot, p.color, p.demurrage);
      if (p.chip) { p.chip.x = p.x + CHASSIS_LX * Math.cos(p.heading); p.chip.z = p.z + CHASSIS_LX * Math.sin(p.heading); }
      const r = FOREIGN_LEN / 2, hb = p.hit.box; hb.x0 = p.x - r; hb.x1 = p.x + r; hb.z0 = p.z - r; hb.z1 = p.z + r;
    }
    this.finish(tr, nt); this.finish(cab, n); this.finish(flat, nf); this.finish(load, nl); this.finish(chs, nch); this.finish(cont, nc); this.finish(mark, nm); this.finish(bk, nb); this.finish(reefer, nr); return animated;
  }
  /** Stapler: Pose aus der Anzeigeuhr (rein optisch), mitgeführte Palette, Label folgt dem Fahrzeug. */
  placeForklifts(clock) {
    const m = this.inst.fork, load = this.inst.fload; let n = 0, nl = 0, animated = false;
    for (const f of this.forks || []) {
      forkliftPose(f, clock, f); if (f.path) animated = true;
      const rot = -f.heading; this.setInst(m, n++, f.x, .06, f.z, rot, 1, 1, 1, '#ffffff');
      if (f.loaded) this.setInst(load, nl++, f.x + Math.cos(f.heading) * .52, .1, f.z + Math.sin(f.heading) * .52, rot, .62, .8, .62);
      if (f.infra) { f.infra.x = f.x; f.infra.z = f.z; f.infra.y = 1.7; }
      const hb = f.hit.box; hb.x0 = f.x - .45; hb.x1 = f.x + .45; hb.z0 = f.z - .45; hb.z1 = f.z + .45;
    }
    this.finish(m, n); this.finish(load, nl); return animated;
  }
  /**
   * Quergurtsorter: Wagen gleichmäßig auf der Schleife; im Betrieb rückt die Schleife mit der Anzeigeuhr vor (beltAdvance, gedeckelt),
   * sonst steht sie. Pakete auf belegten Wagen (beltLoaded), jenseits des Paket-LOD-Abstands ausgeblendet. Rein optisch.
   */
  placeBelts(clock, dt) {
    const belts = this.belts || [], dClock = this.beltClock == null ? 0 : clock - this.beltClock; this.beltClock = clock;
    let moved = false; const phase = this.beltPhase ||= new Map();
    for (const x of belts) if (x.running) { const p0 = phase.get(x.b.id) || 0, p1 = beltAdvance(p0, dClock, dt); if (p1 !== p0) { phase.set(x.b.id, p1); moved = true; } }
    if (!moved && !this.beltsDirty) return false;
    this.beltsDirty = false;
    const car = this.inst.xcar, par = this.inst.xpar, n = this.beltCars || BELT_CARRIERS.high, pt = this.tmp.belt ||= {}, w = this.tmp.beltW ||= {}, lodK = this.q.lod.parcel; let nc = 0, np = 0;
    for (const x of belts) {
      const b = x.b, ph = phase.get(b.id) || 0; toWorld(b, 0, 0, w); const show = x.loaded && this.lodDist(w.x, w.z) <= lodK;
      for (let i = 0; i < n; i++) {
        beltPoint(i / n + ph, pt); toWorld(b, pt.x, pt.z, w); const rot = w.rot - pt.heading;
        this.setInst(car, nc++, w.x, .06 + BELT.y, w.z, rot, 1, 1, 1);
        if (show && beltCarrierFull(i)) this.setInst(par, np++, w.x, .06 + BELT.y, w.z, rot, 1, 1, 1, x.coldIn && i % 4 === 1 ? '#e6f1f8' : ['#d9b37a', '#e3c08a', '#c9a26a'][i % 3]);
      }
    }
    this.finish(car, nc); this.finish(par, np); return moved;
  }
  placeTransfers(clock) {
    const m = this.inst.marker, st = this.state; let n = 0, animated = false;
    for (const tr of this.transfers) {
      const t = tr.t, v = st?.vehicles?.find(x => x.id === t.vehicleId); let p = t.status === 'loading' ? 0 : t.status === 'unloading' ? 1 : phaseProgress(t, v, clock, st?.t) ?? 0;
      if (t.status === 'returning') p = 1 - p; if (t.status === 'transit' || t.status === 'returning') animated = true;
      tr.x = tr.a.x + (tr.b.x - tr.a.x) * p; tr.z = tr.a.z + (tr.b.z - tr.a.z) * p;
      this.setInst(m, n++, tr.x, 0, tr.z, -tr.heading, 1, 1, 1, tr.blocked ? '#e4ab4b' : '#ffffff');
    }
    // Linien-Lkw: Fortschritt aus remaining/duration, mit Anzeigeuhr interpoliert; Label nur bei neuem Prozentwert.
    const pt = this.tmp.pose;
    for (const tr of this.trips) {
      const lh = tr.lh, p = linehaulNetProgress(lh, tr.v, clock, st?.t), moving = lh.status === 'transit' || lh.status === 'returning';
      if (moving) animated = true; linePoint(tr.line, p, pt); tr.x = pt.x; tr.z = pt.z;
      const pct = Math.round((lh.status === 'returning' ? 1 - p : p) * 100); if (pct !== tr.pct) { tr.pct = pct; tr.label = linehaulNetLabel(st, lh, pct); }
      this.setInst(m, n++, tr.x, 0, tr.z, -(tr.heading + (lh.status === 'returning' ? Math.PI : 0)), 1, 1, 1, tr.blocked ? '#e4ab4b' : '#d6eee4');
    }
    this.finish(m, n);
    // W3c: Zubringer auf der gestrichelten Verbindung; Label nur bei neuem Prozentwert.
    const am = this.inst.amarker; let na = 0;
    for (const tr of this.airTrips) {
      const sh = tr.sh, p = airShuttleNetProgress(sh, tr.v, clock, st?.t); if (sh.status === 'transit' || sh.status === 'returning') animated = true;
      linePoint(tr.line, p, pt); tr.x = pt.x; tr.z = pt.z;
      const pct = Math.round((sh.status === 'returning' ? 1 - p : p) * 100); if (pct !== tr.pct) { tr.pct = pct; tr.label = airShuttleNetLabel(st, sh, pct); }
      this.setInst(am, na++, tr.x, 0, tr.z, -(tr.heading + (sh.status === 'returning' ? Math.PI : 0)), 1, 1, 1, tr.blocked ? '#e4ab4b' : '#ffffff');
    }
    this.finish(am, na);
    // Startflugzeug: rein optisch aus Flugplan und Anzeigeuhr.
    const ph = this.airNode ? planePhase(this.airMinutes, clock) : null, pl = this.inst.plane;
    if (ph) { const q = planePose(this.airNode, ph, pt); _q.setFromEuler(_e.set(0, 0, q.pitch)); _p.set(q.x, q.y, q.z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); pl.setMatrixAt(0, _m); if (ph.moving) animated = true; }
    this.plane = ph ? { x: pt.x, y: pt.y, z: pt.z, u: ph.u, flight: ph.flight } : null;
    this.finish(pl, ph ? 1 : 0); return animated;
  }

  // ----- Labels -----
  chip(i) {
    let el = this.chips[i]; if (el) return el;
    // Kompakter Chip: Farbpunkt, Kennung fett, Status klein. Farben über CSS-Variablen (injectChipStyle), Trenner bleibt im Text.
    el = document.createElement('div'); el.className = 'scene3d-chip';
    el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform';
    const dot = document.createElement('i'), head = document.createElement('b'), sep = document.createElement('span'), rest = document.createElement('small');
    dot.className = 'scene3d-dot'; sep.className = 'scene3d-sep'; el.append(dot, head, sep, rest); el._parts = [head, sep, rest];
    this.labelRoot.appendChild(el); this.chips[i] = el; return el;
  }
  candidate(key, x, y, z, text, tone, prio) {
    const t = this.tmp, c = t.candPool[t.cands.length] ||= { key: '', sx: 0, sy: 0, depth: 0, prio: 0, visible: true, text: '', tone: '' };
    _v.set(x, y, z).project(this.camera()); c.key = key; c.sx = (_v.x + 1) / 2 * this.width; c.sy = (1 - _v.y) / 2 * this.height; c.depth = _v.z; c.prio = prio; c.visible = true; c.text = text; c.tone = tone; c.w = text.length * 5.6 + 22; t.cands.push(c);
  }
  updateLabels() {
    if (!this.labelRoot) return; const t = this.tmp, mode = this.labelMode, fleet = mode === 'fleet' || mode === 'all', infra = mode === 'infra' || mode === 'all'; t.cands.length = 0;
    if (this.view === 'network') {
      if (mode !== 'none') { const st = this.state; for (const p of this.pins) { const s = st?.sites?.find(x => x.id === p.id); this.candidate(p.id, p.x, 3, p.z, `${s?.name || 'Standort'} · ${(st?.buildings || []).filter(b => b.site === p.id).length} Anlagen`, p.id === st?.selectedSite ? 'dock' : 'infra', 1); } }
      if (fleet) for (const tr of this.transfers) this.candidate(tr.id, tr.x, 1.4, tr.z, tr.label, tr.blocked ? 'wait' : 'move', 2);
      if (fleet) for (const tr of this.trips) this.candidate(tr.vehicleId, tr.x, 1.4, tr.z, tr.label, tr.blocked ? 'wait' : tr.lh.status === 'transit' || tr.lh.status === 'returning' ? 'move' : 'dock', 2);
      if (mode !== 'none' && this.airNode) this.candidate(AIRPORT.id, this.airNode.x, 3, this.airNode.z, this.airLabel, 'infra', 1);
      if (fleet) for (const tr of this.airTrips) this.candidate(tr.vehicleId, tr.x, 1.4, tr.z, tr.label, tr.blocked ? 'wait' : tr.sh.status === 'transit' || tr.sh.status === 'returning' ? 'move' : 'dock', 2);
    } else {
      if (this.ghostInfo) this.candidate('ghost', this.ghostInfo.x, this.ghostInfo.y, this.ghostInfo.z, this.ghostInfo.text, this.ghostInfo.tone, 0);
      if (fleet) for (const p of this.fleet) if (p.shown) this.candidate(p.v.id, p.x, 2.3, p.z, p.label, p.tone, 2);
      if (fleet) for (const p of this.yardFleet) this.candidate(p.id, p.x, 2.6, p.z, p.label, p.tone, 2);
      if (mode !== 'none') for (const b of this.infra) { const sel = b.id === this.selected; if (infra || sel) this.candidate(b.id, b.x, b.y, b.z, b.text, b.tone, sel ? 0 : b.prio); }
      // W3b: Container-Label nur bei Auswahl.
      if (mode !== 'none' && this.selected != null) for (const c of this.contLabels || []) if (c.id === this.selected) this.candidate(c.id, c.x, c.y, c.z, c.text, c.tone, 0);
    }
    const out = selectLabels(t.cands, this.width, this.height, this.q.labels, t.labelOut);
    for (let i = 0; i < out.length; i++) {
      const c = out[i], el = this.chip(i);
      if (el._text !== c.text) { const t = splitLabel(c.text), [h, sp, r] = el._parts; h.textContent = t.head; sp.textContent = t.sep; r.textContent = t.rest; el._text = c.text; }
      if (el._tone !== c.tone) { el.className = `scene3d-chip tone-${CHIP_TONES.includes(c.tone) ? c.tone : 'idle'}`; el._tone = c.tone; }
      const x = Math.round(c.sx), y = Math.round(c.sy); if (el._x !== x || el._y !== y) { el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`; el._x = x; el._y = y; }
      if (el._hidden !== false) { el.style.display = ''; el._hidden = false; }
    }
    for (let i = out.length; i < this.chips.length; i++) { const el = this.chips[i]; if (el._hidden !== true) { el.style.display = 'none'; el._hidden = true; } }
  }
}
