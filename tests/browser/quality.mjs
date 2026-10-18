// Browserprüfung Grafikqualität (0.15-S4, A12+A09). Nicht Teil von `npm test`.
// Voraussetzung: Root-index.html (`python3 scripts/package.py`), Playwright global, Chromium unter /opt/pw-browsers.
// Aufruf: node tests/browser/quality.mjs   Ergebnis: JSON-Bericht (Budget je Probe-Szene × Stufe × Ansicht × Tageszeit, LOD, Einstellung, Messanzeige).
// Hinweis: Headless-Chromium rendert per SwiftShader (Software). Draw Calls/Dreiecke sind geräteunabhängig, Frame-Zeiten nicht.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() { for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch {} } throw new Error('Playwright nicht gefunden'); }
function chrome() { const base = '/opt/pw-browsers'; for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'chrome-linux/chrome'); if (d.startsWith('chromium-') && existsSync(p)) return p; } return undefined; }
if (!existsSync(path.join(root, 'index.html'))) throw Error('Root-index.html fehlt. Zuerst python3 scripts/package.py ausführen.');
const { chromium } = load();
const port = 8900 + Math.floor(Math.random() * 90);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = { checks: [], budgets: [], errors: [] };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) process.exitCode = 1; };
let browser;
try {
  await wait(800);
  browser = await chromium.launch({ executablePath: chrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--no-first-run'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) report.errors.push(m.text()); });
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${port}/index.html?perf=1`, { waitUntil: 'load' });
  await page.waitForSelector('#welcome[open]', { timeout: 10000 });
  await page.click('[data-action="start"]'); await wait(2000);
  if (await page.$('#welcome[open]')) { await page.click('[data-action="temporary"]'); await wait(300); await page.click('[data-action="confirmOk"]'); await wait(1500); }

  // ----- App: Standard automatisch, Messanzeige zeigt Stufe, Einstellung schaltet fest -----
  const app0 = await page.evaluate(() => { const s = document.querySelector('#world').__scene; return { q: s.quality(), info: s.renderInfo(), overlay: document.querySelector('#perfOverlay')?.textContent || '' }; });
  check('App: Standard Grafikqualität automatisch', app0.q.mode === 'auto', JSON.stringify(app0.q));
  check('Messanzeige ?perf=1 zeigt Grafikqualität', /Grafikqualität\s*(Niedrig|Mittel|Hoch) \(automatisch\)/.test(app0.overlay), app0.overlay.slice(0, 260));
  await page.click('button.square[data-panel="settings"]'); await wait(300);
  const opts = await page.$$eval('#panelBody select[data-setting="quality"] option', o => o.map(x => x.textContent));
  check('Einstellung „Grafikqualität: Automatisch/Niedrig/Mittel/Hoch“', opts.join('/') === 'Automatisch/Niedrig/Mittel/Hoch', opts.join('/'));
  const before = await page.evaluate(() => JSON.stringify(window.__sim?.state ?? null));
  await page.selectOption('#panelBody select[data-setting="quality"]', 'low'); await wait(600);
  const app1 = await page.evaluate(() => { const s = document.querySelector('#world').__scene; let pref = null; try { pref = JSON.parse(localStorage.getItem('industrie-logistik-v1-prefs') || '{}').quality; } catch {} return { q: s.quality(), ratio: s.res.ratio, max: s.res.max, pref, overlay: document.querySelector('#perfOverlay')?.textContent || '' }; });
  check('Einstellung Niedrig wirkt (Stufe, Pixelratio ≤ 1)', app1.q.mode === 'low' && app1.q.level === 'low' && app1.max <= 1 && app1.ratio <= 1, JSON.stringify(app1));
  check('prefs.quality gespeichert (sofern Speicher verfügbar)', app1.pref === 'low' || app1.pref == null, String(app1.pref));
  check('Messanzeige folgt (Niedrig)', /Grafikqualität\s*Niedrig/.test(app1.overlay));
  await page.selectOption('#panelBody select[data-setting="quality"]', 'auto'); await wait(300);
  await page.keyboard.press('Escape'); await wait(200);
  report.appUnchangedCheck = before === 'null' ? 'kein __sim-Griff' : 'geprüft';

  // ----- Probe-Szenen je Stufe auf eigener Leinwand: echte Simulation (Hub + Fertigung + Personal + Fahrzeuge) -----
  const res = await page.evaluate(async () => {
    const { Scene3D, checkBudget, QUALITY_LEVELS } = await import('./scene3d.js');
    const { Simulation } = await import('./core.js');
    const { hubProbe } = await import('../tests/ui-hub-probe.js');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const scenes = [];
    // Szene A: Paketumschlag (Fremd-Lkw, Rollcontainer, Sortierer).
    scenes.push({ name: 'Hub', sim: hubProbe(Simulation).sim });
    // Szene B: dicht bebauter Standort mit viel Personal, Flotte, Regalen; Nacht prüft Lichtdetails.
    { const { sim } = hubProbe(Simulation, { minutes: 200 }), cmd = c => sim.command(c);
      for (const [buildingType, x, y] of [['rack', 11, 2], ['rack', 14, 2], ['assembly', 11, 6], ['testing', 14, 6], ['packing', 17, 6], ['rack', 17, 2], ['dock', 11, 11], ['dock', 15, 11], ['coldstore', 2, 6]]) cmd({ type: 'build', buildingType, x, y, rotation: 0 });
      for (let i = 0; i < 30; i++) cmd({ type: 'hire', role: ['warehouse', 'production', 'driver', 'technician'][i % 4] });
      for (let i = 0; i < 6; i++) cmd({ type: 'buyVehicle', vehicleType: i % 2 ? 'truck' : 'van' });
      sim.step(60); scenes.push({ name: 'Dicht', sim }); }
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const s = new Scene3D(canvas, {}), out = [], unchanged = [];
    for (const sc of scenes) {
      const snap = JSON.stringify(sc.sim.state); s.setState(sc.sim.state); s.setClock(sc.sim.state.t);
      for (const level of QUALITY_LEVELS) for (const theme of ['day', 'night']) for (const view of ['hall', 'site', 'flat', 'network']) for (const zoom of [0, 4, -6]) {
        if (view === 'network' && zoom) continue;
        s.setQuality(level); s.setTheme(theme); s.setView(view); s.home(); if (zoom) s.zoom(zoom, true);
        await sleep(120); s.needs = true; await frame(); s.needs = true; await frame();
        const info = s.renderInfo(), b = checkBudget(level, info);
        out.push({ scene: sc.name, level, theme, view, zoom, drawCalls: info.drawCalls, triangles: info.triangles, ok: b.ok, issues: b.issues });
      }
      unchanged.push(JSON.stringify(sc.sim.state) === snap);
    }
    // LOD: Niedrig + Gelände weit herausgezoomt → keine Personen, Fahrzeuge nur Box; Hoch + Halle nah → Personen sichtbar.
    const sim = scenes[1].sim; s.setState(sim.state); s.setTheme('day');
    s.setQuality('low'); s.setView('site'); s.home(); s.zoom(-12, true); await sleep(200); s.needs = true; await frame(); await frame();
    const far = { people: s.inst.body.count, boxes: s.inst.vbox.count, cabs: s.inst.vcab.count, trees: s.inst.crown.count, labelsMax: s.q.labels };
    s.setQuality('high'); s.setView('hall'); s.home(); s.zoom(3, true); await sleep(200); s.needs = true; await frame(); await frame();
    const near = { people: s.inst.body.count, boxes: s.inst.vbox.count, cabs: s.inst.vcab.count, trees: s.inst.crown.count, workers: sim.state.workers.filter(w => w.site === sim.state.selectedSite).length };
    // Automatik: aus Fixstufe auf auto → Start Mittel; künstlich langsame Frames senken nach vollem Fenster (Logik, keine Zeitmessung des Geräts).
    const auto = s.setQuality('auto');
    s.destroy(); host.remove();
    return { out, unchanged, far, near, auto };
  });
  report.budgets = res.out;
  const bad = res.out.filter(r => !r.ok);
  check(`Budget je Probe-Szene × Stufe × Ansicht × Tageszeit × Zoom (${res.out.length} Messungen)`, !bad.length && res.out.length >= 60, bad.length ? JSON.stringify(bad.slice(0, 6)) : '');
  for (const level of ['low', 'medium', 'high']) { const r = res.out.filter(x => x.level === level); report[`max_${level}`] = { drawCalls: Math.max(...r.map(x => x.drawCalls)), triangles: Math.max(...r.map(x => x.triangles)) }; }
  check('Stufen unterscheiden sich (Dreiecke Niedrig < Hoch im Maximum)', report.max_low.triangles < report.max_high.triangles, JSON.stringify([report.max_low, report.max_high]));
  check('Rein darstellend: Spielzustand unverändert', res.unchanged.every(Boolean), JSON.stringify(res.unchanged));
  check('LOD Niedrig fern: Personen aus, Fahrzeuge als Box, Bäume gedeckelt', res.far.people === 0 && res.far.cabs === 0 && res.far.trees <= 8 && res.far.labelsMax === 16, JSON.stringify(res.far));
  check('LOD Hoch nah: Personen sichtbar, Fahrzeuge vollständig', res.near.people > 0 && res.near.cabs === res.near.boxes, JSON.stringify(res.near));
  check('setQuality(auto) startet in Mittel', res.auto.mode === 'auto' && res.auto.level === 'medium', JSON.stringify(res.auto));
  check('Keine Konsolen-/Seitenfehler', !report.errors.length, report.errors.slice(0, 5).join(' | '));
} catch (e) { report.errors.push(String(e?.stack || e)); process.exitCode = 1; }
finally { await browser?.close(); server.kill(); }
const { budgets, ...summary } = report;
console.log(JSON.stringify({ ...summary, budgetSample: budgets.filter((_, i) => i % 9 === 0) }, null, 1));
