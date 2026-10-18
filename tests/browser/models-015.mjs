// Browserprüfung 0.15 Modelle (A09): Quergurtsorter, Kühlpakete, Sperrgut, Kühl-/Sperrgut-Lkw. Nicht Teil von `npm test`.
// Voraussetzung: Root-index.html, Playwright global, Chromium unter /opt/pw-browsers (kein `playwright install`).
// Aufruf: node tests/browser/models-015.mjs   Ergebnis: JSON-Bericht (Instanzen, Animation je Status, Budget je Stufe × Ansicht × Tageszeit × Zoom,
// Draw Calls unabhängig von der Anzahl der Quergurte, Spielzustand unverändert). Bildschirmfotos nach $SHOT_DIR (Standard: Temp-Verzeichnis), nicht einchecken.
// Hinweis: Headless-Chromium rendert per SwiftShader (Software). Draw Calls/Dreiecke sind geräteunabhängig, Frame-Zeiten nicht.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = process.env.SHOT_DIR || os.tmpdir();
function load() { for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch {} } throw new Error('Playwright nicht gefunden'); }
function chrome() { const base = '/opt/pw-browsers'; for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'chrome-linux/chrome'); if (d.startsWith('chromium-') && existsSync(p)) return p; } return undefined; }
if (!existsSync(path.join(root, 'index.html'))) throw Error('Root-index.html fehlt. Zuerst python3 scripts/package.py ausführen.');
const { chromium } = load();
const port = 8600 + Math.floor(Math.random() * 90);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = { checks: [], errors: [], shots: [] };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) process.exitCode = 1; };
let browser;
try {
  await wait(800);
  browser = await chromium.launch({ executablePath: chrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--no-first-run'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) report.errors.push(m.text()); });
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#welcome[open]', { timeout: 10000 });
  await page.click('[data-action="start"]'); await wait(2000);
  if (await page.$('#welcome[open]')) { await page.click('[data-action="temporary"]'); await wait(300); await page.click('[data-action="confirmOk"]'); await wait(1500); }

  // Eigene Leinwand mit echtem Probe-Zustand (tests/scene3d-models-probe.js).
  await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js'), { Simulation } = await import('./core.js'), { modelsProbe } = await import('../tests/scene3d-models-probe.js');
    const { sim, ids } = modelsProbe(Simulation);
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const s = new Scene3D(canvas, {}); s.setState(sim.state); s.setClock(sim.state.t); s.setQuality('high'); s.setTheme('day');
    window.__m = { s, sim, ids, snap: sim.serialize() };
  });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  // ----- Instanzen der neuen Modelle (Hoch, Halle) -----
  const counts = await page.evaluate(async () => {
    const { s } = window.__m; s.setView('hall'); s.home(); s.needs = true;
    await new Promise(r => setTimeout(r, 200)); s.needs = true; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const i = s.inst, st = s.state, yard = st.yard.filter(a => a.phase !== 'gone').map(a => `${a.item || 'parcel'}:${a.phase}`);
    return { xcar: i.xcar.count, xpar: i.xpar.count, ccage: i.ccage.count, cstack: i.cstack.count, bulky: i.bulky.count, freefer: i.freefer.count, fflat: i.fflat.count, cage: i.cage.count, stack: i.stack.count, yard, status: st.buildings.find(b => b.type === 'crossbelt').status };
  });
  report.counts = counts;
  check('Quergurt arbeitet im Probe-Zustand (echter Ablauf)', counts.status === 'working', counts.status);
  check('Quergurt: 28 Wagen (Hoch), Pakete auf belegten Wagen', counts.xcar === 28 && counts.xpar >= 10 && counts.xpar <= 28, JSON.stringify(counts));
  check('Kühlpakete eigene Instanzen (Rollcontainer + Stapel)', counts.ccage > 0 && counts.cstack > 0);
  check('Sperrgut sichtbar (Lager + Pritsche)', counts.bulky > 0 && counts.fflat >= 1);
  check('Kühl-Lkw mit Kühlaggregat', counts.freefer >= 1, counts.yard.join(', '));

  // ----- Fehlwürfe (resort) als kleiner Stapel im Fehlwurfbehälter; Kopie des Zustands, Original unberührt -----
  const resort = await page.evaluate(async () => {
    const { s, sim } = window.__m, raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    s.setState(sim.state); await raf(); const without = s.inst.stack.count;
    const clone = structuredClone(sim.state), src = clone.batches.find(b => b.item === 'parcel' && b.location === 'stock');
    clone.batches.push({ ...src, id: 'batch-resort-probe', qty: 2, location: 'inbound', resort: true, reserved: 0 });
    s.setState(clone); await raf(); const withResort = s.inst.stack.count; s.setState(sim.state); await raf();
    return { without, withResort };
  });
  check('Fehlwurf: Nachsortierung erscheint im Fehlwurfbehälter (+1 Stapel)', resort.withResort === resort.without + 1, JSON.stringify(resort));

  // ----- Animation nur aus der Anzeigeuhr, Status working läuft, idle/staff steht -----
  const anim = await page.evaluate(async () => {
    const { s, sim, ids } = window.__m, raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), m0 = () => Array.from(s.inst.xcar.instanceMatrix.array.slice(12, 15)).map(v => +v.toFixed(4));
    const run = async (state, steps) => { s.setState(state); let t = state.t; s.setClock(t); await raf(); const a = m0(); for (let k = 0; k < steps; k++) { t += .25; s.setClock(t); await new Promise(r => setTimeout(r, 120)); await raf(); } return { a, b: m0(), par: s.inst.xpar.count }; };
    const out = {};
    out.working = await run(sim.state, 6);
    // Pause wie app.js: setClock mit stehender Spielzeit (die Anzeigeuhr läuft nach einem Sprung kurz aus, dann steht sie).
    const paused = await (async () => { s.setState(sim.state); for (let k = 0; k < 8; k++) { s.setClock(sim.state.t + 5); await new Promise(r => setTimeout(r, 100)); await raf(); } const a = m0(); for (let k = 0; k < 4; k++) { s.setClock(sim.state.t + 5); await new Promise(r => setTimeout(r, 120)); await raf(); } return { a, b: m0() }; })();
    out.paused = paused;
    for (const status of ['idle', 'staff', 'power']) { const clone = structuredClone(sim.state); clone.buildings.find(b => b.id === ids.crossbelt).status = status; out[status] = await run(clone, 6); }
    s.setState(sim.state); s.setClock(sim.state.t);
    return out;
  });
  const moved = r => r.a.some((v, k) => Math.abs(v - r.b[k]) > 1e-3);
  report.anim = anim;
  check('working: Schleife läuft mit der Anzeigeuhr', moved(anim.working), JSON.stringify(anim.working));
  check('Pause (Uhr steht): Schleife steht', !moved(anim.paused), JSON.stringify(anim.paused));
  check('idle: Schleife steht, Wagen leer', !moved(anim.idle) && anim.idle.par === 0, JSON.stringify(anim.idle));
  check('staff/power: Schleife steht, Ladung bleibt', !moved(anim.staff) && !moved(anim.power) && anim.staff.par > 0 && anim.power.par > 0, JSON.stringify([anim.staff, anim.power]));

  // ----- Bildschirmfotos (nicht einchecken) -----
  const shot = async (name, setup) => { await page.evaluate(setup); await wait(400); await frame(); const p = path.join(shots, `models-015-${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); };
  await shot('quergurt', () => { const { s, ids } = window.__m; s.setQuality('high'); s.setView('hall'); s.home(); s.focus(ids.crossbelt); s.selected = null; s.zoom(5, true); s.needs = true; });
  await shot('halle', () => { const { s } = window.__m; s.setView('hall'); s.home(); s.zoom(2, true); s.needs = true; });
  await shot('hof', () => { const { s } = window.__m; s.setView('site'); s.home(); s.zoom(3, true); s.goal.tx = 4; s.goal.tz = 19; s.cam.tx = 4; s.cam.tz = 19; s.applyCamera(); s.needs = true; });

  // ----- Budget je Stufe × Ansicht × Tageszeit × Zoom; Draw Calls unabhängig von der Anzahl der Quergurte -----
  const budget = await page.evaluate(async () => {
    const { checkBudget, QUALITY_LEVELS } = await import('./scene3d.js'), { s, sim } = window.__m, out = [];
    const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), sleep = ms => new Promise(r => setTimeout(r, ms));
    const two = structuredClone(sim.state); two.buildings.push({ ...structuredClone(two.buildings.find(b => b.type === 'crossbelt')), id: 'building-cb2', x: 10, y: 9 });
    for (const [name, state] of [['Mega-Hub', sim.state], ['Zwei Quergurte', two]]) {
      s.setState(state); s.setClock(state.t);
      for (const level of QUALITY_LEVELS) for (const theme of ['day', 'night']) for (const view of ['hall', 'site', 'flat', 'network']) for (const zoom of [0, 4, -6]) {
        if (view === 'network' && zoom) continue;
        s.setQuality(level); s.setTheme(theme); s.setView(view); s.home(); if (zoom) s.zoom(zoom, true);
        await sleep(100); s.needs = true; await raf(); s.needs = true; await raf();
        const info = s.renderInfo(), b = checkBudget(level, info), cats = Object.values(s.inst).filter(m => m.count > 0 && m.parent?.visible !== false).length;
        out.push({ scene: name, level, theme, view, zoom, drawCalls: info.drawCalls, triangles: info.triangles, cats, ok: b.ok, issues: b.issues });
      }
    }
    s.setState(sim.state);
    return out;
  });
  const bad = budget.filter(r => !r.ok);
  check(`Budget eingehalten (${budget.length} Messungen)`, !bad.length && budget.length >= 120, JSON.stringify(bad.slice(0, 5)));
  for (const level of ['low', 'medium', 'high']) { const r = budget.filter(x => x.level === level); report[`max_${level}`] = { drawCalls: Math.max(...r.map(x => x.drawCalls)), triangles: Math.max(...r.map(x => x.triangles)) }; }
  const pairs = budget.filter(r => r.scene === 'Mega-Hub').map(r => [r, budget.find(x => x.scene !== 'Mega-Hub' && x.level === r.level && x.theme === r.theme && x.view === r.view && x.zoom === r.zoom)]);
  // Mehr Draw Calls nur, wenn dadurch eine weitere Instanzkategorie sichtbar wird (z. B. Pakete innerhalb des LOD-Abstands), nie je Objekt.
  const extra = pairs.filter(([a, b]) => b.drawCalls - a.drawCalls > Math.max(0, b.cats - a.cats));
  report.drawCallDelta = pairs.filter(([a, b]) => b.drawCalls !== a.drawCalls).map(([a, b]) => [a.level, a.theme, a.view, a.zoom, a.drawCalls, b.drawCalls, a.cats, b.cats]);
  check('Zweiter Quergurt erzeugt keine Draw Calls je Objekt (nur Instanzen)', !extra.length, JSON.stringify(extra.slice(0, 3).map(([a, b]) => [a.level, a.view, a.zoom, a.drawCalls, b.drawCalls, a.cats, b.cats])));

  const unchanged = await page.evaluate(() => { const { s, sim, snap } = window.__m; const same = sim.serialize() === snap; s.destroy(); return same; });
  check('Rein darstellend: Spielzustand unverändert', unchanged);
  check('Keine Konsolen-/Seitenfehler', !report.errors.length, report.errors.slice(0, 5).join(' | '));
} catch (e) { report.errors.push(String(e?.stack || e)); process.exitCode = 1; }
finally { await browser?.close(); server.kill(); }
console.log(JSON.stringify(report, null, 1));
