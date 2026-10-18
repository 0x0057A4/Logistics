// Browserprüfung 0.16 Wetter und Störungsmarker (A09). Nicht Teil von `npm test`.
// Voraussetzung: Root-index.html, Playwright global, Chromium unter /opt/pw-browsers (kein `playwright install`).
// Aufruf: node tests/browser/weather-016.mjs   Ergebnis: JSON-Bericht (Wetter je Stufe, Übergang, Pause, reduzierte Bewegung, Tor-/Netz-/Staumarker,
// Westenfarben, 2D-Rückfall, Budget je Wetter × Stufe × Ansicht × Tageszeit × Zoom, Spielzustand unverändert). Bildschirmfotos nach $SHOT_DIR
// (Standard: Temp-Verzeichnis), nicht einchecken.
// FIXTURE: Wetter/Ereignisse werden in einer Kopie des Probe-Zustands gesetzt (structuredClone, s.disruptions wie disruptions.js); das Original bleibt
// unberührt. Zusätzlich echte Simulation (Saat 3) über mehrere Spieltage: Szene übernimmt das simulierte Wetter.
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
const port = 8700 + Math.floor(Math.random() * 90);
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

  // Eigene Leinwand, Probe-Zustand (Mega-Hub) und Hilfen für Wetterkopien.
  await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js'), { Simulation } = await import('./core.js'), { modelsProbe } = await import('../tests/scene3d-models-probe.js');
    const { sim, ids } = modelsProbe(Simulation), site = sim.state.selectedSite;
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const s = new Scene3D(canvas, {}); s.setState(sim.state); s.setClock(sim.state.t); s.setQuality('high'); s.setTheme('day');
    // FIXTURE: Kopie mit Wetter/Ereignissen; zweiter Standort und Linie nur für die Staumarkierung der Netzansicht.
    const withWeather = (kind, events = [], extra = {}) => {
      const c = structuredClone(sim.state), t = c.t;
      c.disruptions = { day: Math.floor(t / 1440) + 1, weather: { [site]: { kind, since: t - 60, until: t + 600 } }, events: events.map((e, i) => ({ id: `disruption-probe-${i}`, site, startT: t - 10, endT: t + 50, text: '', ...e })), log: [] };
      if (extra.network) { c.sites.push({ id: 'site-probe-nord', name: 'Probe-Nord', x: 46, y: 22, width: 20, height: 16, energy: 30 }); c.lines = [...(c.lines || []), { id: 'line-probe', from: site, to: 'site-probe-nord' }, { id: 'line-probe-back', from: 'site-probe-nord', to: site }]; }
      if (extra.power) c.buildings.push({ id: 'building-power-probe', type: 'power', site, x: 16, y: 2, rotation: 0, enabled: true, condition: 100, status: 'idle' });
      if (extra.roles) { const base = c.workers.find(w => w.site === site); c.workers.push({ ...base, id: 'worker-fork-probe', role: 'forklift', task: null }, { ...base, id: 'worker-gate-probe', role: 'gate', task: 'arrival-probe:gate' }); }
      return c;
    };
    const ALL = [{ kind: 'gate' }, { kind: 'grid' }, { kind: 'jam', pct: 45, target: { line: 'line-probe', name: 'Probe' } }, { kind: 'jam', pct: 25 }];
    window.__w = { s, sim, ids, site, withWeather, ALL, snap: sim.serialize(), raf: () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), sleep: ms => new Promise(r => setTimeout(r, ms)) };
  });
  const frame = () => page.evaluate(() => window.__w.raf());

  // ----- Wetter je Stufe (Halle, Tag, sofort gesetzt) -----
  const looks = await page.evaluate(async () => {
    const { s, withWeather, raf } = window.__w, out = {};
    for (const level of ['low', 'medium', 'high']) for (const kind of ['clear', 'rain', 'storm', 'snow', 'fog']) {
      s.setQuality(level); s.setView('hall'); s.home(); s.setState(withWeather(kind)); s.wxSnap = true; s.needs = true; await raf(); await raf();
      const dr = o => o.visible ? o.geometry.drawRange.count : 0;
      out[`${level}:${kind}`] = { wx: { ...s.wx }, rain: dr(s.rain), snow: dr(s.snow), ground: s.wground.visible, groundA: +s.mat.wground.opacity.toFixed(3), near: +s.scene.fog.near.toFixed(1), far: +s.scene.fog.far.toFixed(1), sky: '#' + s.scene.background.getHexString(), sun: +s.sun.intensity.toFixed(2) };
    }
    return out;
  });
  report.looks = looks;
  const lum = h => { const n = parseInt(h.slice(1), 16); return .2126 * (n >> 16 & 255) + .7152 * (n >> 8 & 255) + .0722 * (n & 255); };
  check('Regen Hoch: 1600 Striche (2 Kopien × 2 Punkte), Mittel 700, Niedrig nur Tönung', looks['high:rain'].rain === 6400 && looks['medium:rain'].rain === 2800 && looks['low:rain'].rain === 0 && looks['low:rain'].sun < looks['low:clear'].sun, JSON.stringify([looks['high:rain'], looks['low:rain']]));
  check('Sturm: Regen, dunklerer Himmel und weniger Licht als Regen', looks['high:storm'].rain > 0 && lum(looks['high:storm'].sky) < lum(looks['high:rain'].sky) && looks['high:storm'].sun < looks['high:rain'].sun, JSON.stringify([looks['high:storm'].sky, looks['high:rain'].sky]));
  check('Schnee: Flocken (Punkte) und leichte weiße Bodentönung, auf Niedrig nur Tönung', looks['high:snow'].snow === 1120 * 2 && looks['high:snow'].ground && looks['high:snow'].groundA > .2 && looks['low:snow'].snow === 0 && looks['low:snow'].ground, JSON.stringify(looks['high:snow']));
  check('Nebel: scene.fog dichter (Grenzen vor dem Blickziel), keine Partikel', looks['high:fog'].near < 30 && looks['high:fog'].far < 90 && looks['high:fog'].rain + looks['high:fog'].snow === 0 && looks['high:clear'].near === 70, JSON.stringify([looks['high:fog'], looks['high:clear']]));
  check('Klar: keine Partikel, keine Bodentönung, Grundnebel', looks['high:clear'].rain + looks['high:clear'].snow === 0 && !looks['high:clear'].ground && looks['high:clear'].far === 150);

  // ----- Animation: läuft nur mit der Anzeigeuhr, Pause friert, Übergang weich, reduzierte Bewegung → nur Tönung -----
  const anim = await page.evaluate(async () => {
    const { s, withWeather, raf, sleep } = window.__w, out = {};
    s.setQuality('high'); s.setView('site'); s.home(); const rain = withWeather('rain'); let t = rain.t;
    s.setState(rain); s.setClock(t + 100); s.setClock(t); await raf(); // Sprung → sofort
    for (let k = 0; k < 6; k++) { t += .2; s.setClock(t); await sleep(100); await raf(); }
    const p0 = s.wxPhase; for (let k = 0; k < 4; k++) { t += .2; s.setClock(t); await sleep(100); await raf(); } out.running = [p0, s.wxPhase];
    for (let k = 0; k < 6; k++) { s.setClock(t); await sleep(100); await raf(); } // Pause: Uhr steht, Anzeigeuhr läuft aus
    const q0 = s.wxPhase, y0 = s.rain.position.y; for (let k = 0; k < 5; k++) { s.setClock(t); await sleep(100); await raf(); } out.paused = [q0, s.wxPhase, y0, s.rain.position.y];
    // Weicher Übergang Regen → Schnee bei laufender Uhr: zuerst Regen schwächer, dann Schnee stärker.
    s.setState(withWeather('snow', [], {})); const seq = [];
    for (let k = 0; k < 40; k++) { t += 1; s.setClock(t); await sleep(60); await raf(); seq.push(`${s.wx.kind}:${s.wx.amount.toFixed(2)}`); if (s.wx.kind === 'snow' && s.wx.amount >= 1) break; }
    out.seq = seq;
    // Reduzierte Bewegung (Einstellung der App: body.reduced): keine Partikel, Tönung bleibt.
    document.body.classList.add('reduced'); s.wxRmAt = -1e9; for (let k = 0; k < 3; k++) { t += .2; s.setClock(t); await sleep(80); await raf(); }
    out.reduced = { rain: s.rain.visible, snow: s.snow.visible, ground: s.wground.visible, kind: s.wx.kind };
    document.body.classList.remove('reduced'); s.wxRmAt = -1e9; for (let k = 0; k < 3; k++) { t += .2; s.setClock(t); await sleep(80); await raf(); }
    out.restored = { snow: s.snow.visible };
    return out;
  });
  report.anim = anim;
  check('Regen fällt bei laufender Uhr', anim.running[0] !== anim.running[1], JSON.stringify(anim.running));
  check('Pause (Uhr steht): Regen friert ein', anim.paused[0] === anim.paused[1] && anim.paused[2] === anim.paused[3], JSON.stringify(anim.paused));
  const mids = anim.seq.filter(x => { const a = +x.split(':')[1]; return a > 0 && a < 1; });
  check('Übergang weich (Zwischenstufen Regen ↓, Schnee ↑)', anim.seq.some(x => x.startsWith('rain:') && mids.includes(x)) && anim.seq.some(x => x.startsWith('snow:') && mids.includes(x)) && anim.seq.at(-1) === 'snow:1.00', anim.seq.join(' '));
  check('Reduzierte Bewegung: keine Partikel, Bodentönung bleibt; danach wieder Flocken', !anim.reduced.rain && !anim.reduced.snow && anim.reduced.ground && anim.restored.snow, JSON.stringify(anim));

  // ----- Störungsmarker -----
  const marks = await page.evaluate(async () => {
    const { s, withWeather, ALL, raf, sleep } = window.__w, out = {}, chips = () => [...s.labelRoot.querySelectorAll('.scene3d-chip')].filter(e => e.style.display !== 'none').map(e => e.textContent);
    s.setQuality('high'); s.setLabels('all'); s.setView('site'); s.home();
    const st = withWeather('clear', ALL, { network: true }); let t = st.t; s.setState(st); s.setClock(t + 100); s.setClock(t); await raf();
    const vis = []; for (let k = 0; k < 16; k++) { t += .2; s.setClock(t); await sleep(90); await raf(); vis.push(s.dbeacon.visible ? 1 : 0); }
    out.site = { gate: s.dgate.visible, beaconBlink: vis.includes(1) && vis.includes(0), grid: s.dgrid.visible, dim: s.dim.visible, hallDark: s.hallDark, chips: chips() };
    s.setState(withWeather('clear', ALL, { network: true, power: true })); await raf(); await raf();
    out.covered = { grid: s.dgrid.visible, dim: s.dim.visible, gate: s.dgate.visible, chips: chips() };
    s.setState(st); s.setView('network'); s.home(); await sleep(150); s.needs = true; await raf(); await raf();
    const col = Array.from(s.netLineMesh.geometry.getAttribute('color')?.array || []), has = hex => { const c = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]; for (let i = 0; i < col.length; i += 3) if (Math.abs(col[i] - c[0]) < 1e-3 && Math.abs(col[i + 1] - c[1]) < 1e-3 && Math.abs(col[i + 2] - c[2]) < 1e-3) return true; return false; };
    out.network = { heavy: has('#cf4a3c'), normal: has('#3f8f78'), chips: chips(), rain: s.rain.visible, snow: s.snow.visible };
    // Ohne Ereignisse: alle Marker aus.
    s.setView('site'); s.setState(withWeather('clear')); await raf(); await raf();
    out.none = { gate: s.dgate.visible, beacon: s.dbeacon.visible, grid: s.dgrid.visible, dim: s.dim.visible, chips: chips().filter(c => /Störung|Stau/.test(c)) };
    return out;
  });
  report.marks = marks;
  check('Torstörung: rote Schranke/Warnschild, Warnleuchte blinkt bei laufender Uhr, Chip', marks.site.gate && marks.site.beaconBlink && marks.site.chips.some(c => /Torstörung · bis/.test(c)), JSON.stringify(marks.site));
  check('Netzstörung: Halle abgedunkelt, Hallenlicht aus, Warnschild, Chip', marks.site.grid && marks.site.dim && marks.site.hallDark && marks.site.chips.some(c => /Netzstörung/.test(c)), JSON.stringify(marks.site));
  check('Netzstörung mit Energiegebäude: kein Warnsymbol, Halle hell', !marks.covered.grid && !marks.covered.dim && marks.covered.gate && !marks.covered.chips.some(c => /Netzstörung/.test(c)), JSON.stringify(marks.covered));
  check('Stau: Netzansicht Linie rot (+45 %), Gegenrichtung normal, Chip „Stau · +45 %“, kein Wetter in der Netzansicht', marks.network.heavy && marks.network.normal && marks.network.chips.some(c => /Stau · \+45 %/.test(c)) && !marks.network.rain, JSON.stringify(marks.network));
  check('Ohne Ereignis: keine Marker', !marks.none.gate && !marks.none.beacon && !marks.none.grid && !marks.none.dim && !marks.none.chips.length, JSON.stringify(marks.none));

  // ----- Westenfarben Staplerfahrer/Torposten -----
  const roles = await page.evaluate(async () => {
    const { s, withWeather, raf } = window.__w, { WORKER_VEST } = await import('./scene3d.js');
    s.setQuality('high'); s.setView('site'); s.home(); s.setState(withWeather('clear', [], { roles: true })); await raf(); await raf();
    // Instanzfarben liegen linear vor (three.js Farbverwaltung): Vergleich über THREE.Color.
    const THREE = await import('./vendor/three.module.min.js'), m = s.inst.body, arr = m.instanceColor?.array || [], cols = []; for (let i = 0; i < m.count; i++) cols.push('#' + new THREE.Color(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).getHexString());
    return { cols, fork: WORKER_VEST.forklift, gate: WORKER_VEST.gate };
  });
  check('Staplerfahrer und Torposten mit eigener Westenfarbe sichtbar', roles.cols.includes(roles.fork) && roles.cols.includes(roles.gate), JSON.stringify(roles));

  // ----- Echte Simulation: Szene übernimmt das simulierte Wetter -----
  const real = await page.evaluate(async () => {
    const { s, raf } = window.__w, { Simulation } = await import('./core.js'), { weatherAt } = await import('./disruptions.js');
    const sim = new Simulation({ mode: 'sandbox', seed: 3 }), st = sim.state, seen = [];
    for (let h = 0; h < 5 * 24; h += 3) { sim.step(180); const before = sim.serialize(); s.setState(st); s.setClock(st.t); await raf(); const w = weatherAt(st, st.selectedSite); seen.push([w, s.wxTarget, s.wx.kind, sim.serialize() === before]); }
    return seen;
  });
  check('Echte Simulation: Zielwetter = disruptions.weatherAt, Zustand unverändert', real.every(([w, target, , same]) => w === target && same) && real.some(([w]) => w !== 'clear'), JSON.stringify(real.filter(r => r[0] !== 'clear').slice(0, 6)));

  // ----- 2D-Rückfall (Canvas): Tönung und Warn-Pills ohne Fehler -----
  const flat = await page.evaluate(async () => {
    const { Scene } = await import('./scene.js'), { withWeather, ALL } = window.__w;
    const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;z-index:1000'; document.body.appendChild(c);
    const s2 = new Scene(c, {}), mean = () => { const d = s2.ctx.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) n += d[i] + d[i + 1] + d[i + 2]; return n / (d.length / 16) / 3; };
    s2.setState(withWeather('clear')); s2.render(); const clear = mean();
    s2.setState(withWeather('storm', ALL)); s2.render(); const storm = mean();
    s2.setState(withWeather('snow')); s2.render(); const snow = mean();
    s2.setView('network'); s2.setState(withWeather('rain', ALL, { network: true })); s2.render();
    s2.destroy(); c.remove(); return { clear, storm, snow };
  });
  check('2D-Rückfall: Sturm dunkler, Schnee heller als klar', flat.storm < flat.clear && flat.snow > flat.clear, JSON.stringify(flat));

  // ----- Bildschirmfotos (nicht einchecken) -----
  const shot = async (name, kind, events, setup) => {
    await page.evaluate(async ([kind, events, setup]) => { const { s, withWeather, ALL, raf } = window.__w; s.setQuality('high'); s.setTheme('day'); s.setState(withWeather(kind, events ? ALL : [], { network: !!events })); s.wxSnap = true; s.selected = null; eval(setup); s.needs = true; await raf(); }, [kind, events, setup]);
    await wait(300); await frame(); const p = path.join(shots, `weather-016-${name}.png`); await page.screenshot({ path: p }); report.shots.push(p);
  };
  await shot('regen-hof', 'rain', false, "s.setView('site'); s.home();");
  await shot('sturm-hof', 'storm', true, "s.setView('site'); s.home();");
  await shot('schnee-hof', 'snow', false, "s.setView('site'); s.home();");
  await shot('nebel-halle', 'fog', false, "s.setView('hall'); s.home();");
  await shot('stoerung-tor', 'clear', true, "s.setView('site'); s.home(); s.zoom(5, true); s.cam.tx = s.goal.tx = -2; s.cam.tz = s.goal.tz = 22; s.applyCamera();");
  await shot('netz-stau', 'rain', true, "s.setView('network'); s.home();");
  await page.evaluate(() => window.__w.s.setTheme('night'));
  await shot('nacht-netzstoerung', 'rain', true, "s.setTheme('night'); s.setView('hall'); s.home();");

  // ----- Budget: Wetter × Stufe × Tageszeit × Ansicht × Zoom, alle Marker aktiv (ungünstigster Fall), zwei Probe-Szenen -----
  const budget = await page.evaluate(async () => {
    const { checkBudget, QUALITY_LEVELS } = await import('./scene3d.js'), { Simulation } = await import('./core.js'), { hubProbe } = await import('../tests/ui-hub-probe.js');
    const { s, sim, withWeather, ALL, raf, sleep } = window.__w, out = [];
    // Dichte Szene wie tests/browser/quality.mjs (echte Befehle).
    const { sim: dense } = hubProbe(Simulation, { minutes: 200 }), cmd = c => dense.command(c);
    for (const [buildingType, x, y] of [['rack', 11, 2], ['rack', 14, 2], ['assembly', 11, 6], ['testing', 14, 6], ['packing', 17, 6], ['rack', 17, 2], ['dock', 11, 11], ['dock', 15, 11], ['coldstore', 2, 6]]) cmd({ type: 'build', buildingType, x, y, rotation: 0 });
    for (let i = 0; i < 30; i++) cmd({ type: 'hire', role: ['warehouse', 'production', 'driver', 'technician', 'forklift', 'gate'][i % 6] });
    for (let i = 0; i < 6; i++) cmd({ type: 'buyVehicle', vehicleType: i % 2 ? 'truck' : 'van' });
    dense.step(60); const denseSnap = dense.serialize();
    const scenes = [['Mega-Hub', sim], ['Dicht', dense]];
    for (const [name, base] of scenes) {
      window.__w.sim = base; // withWeather kopiert den Zustand der aktuellen Probe
      for (const kind of ['clear', 'rain', 'storm', 'snow', 'fog']) {
        const st = withWeather(kind, ALL, { network: true }); s.setState(st); s.setClock(st.t);
        for (const level of QUALITY_LEVELS) for (const theme of ['day', 'night']) for (const view of ['hall', 'site', 'flat', 'network']) for (const zoom of [0, 4, -6]) {
          if (view === 'network' && zoom) continue;
          s.setQuality(level); s.setTheme(theme); s.setView(view); s.home(); if (zoom) s.zoom(zoom, true); s.wxSnap = true;
          await sleep(40); s.needs = true; await raf(); s.needs = true; await raf();
          const info = s.renderInfo(), b = checkBudget(level, info);
          out.push({ scene: name, kind, level, theme, view, zoom, drawCalls: info.drawCalls, triangles: info.triangles, lines: s.renderer.info.render.lines, points: s.renderer.info.render.points, ok: b.ok, issues: b.issues });
        }
      }
    }
    window.__w.sim = sim; s.setState(sim.state);
    return { out, denseSame: dense.serialize() === denseSnap };
  });
  const bad = budget.out.filter(r => !r.ok);
  check(`Budget eingehalten: Wetter × Stufe × Tageszeit × Ansicht × Zoom, alle Marker (${budget.out.length} Messungen)`, !bad.length && budget.out.length >= 400, JSON.stringify(bad.slice(0, 5)));
  report.budgetMax = {};
  for (const kind of ['clear', 'rain', 'storm', 'snow', 'fog']) for (const level of ['low', 'medium', 'high']) { const r = budget.out.filter(x => x.kind === kind && x.level === level); report.budgetMax[`${kind}:${level}`] = { drawCalls: Math.max(...r.map(x => x.drawCalls)), triangles: Math.max(...r.map(x => x.triangles)) }; }
  const clearMax = Object.fromEntries(['low', 'medium', 'high'].map(l => [l, report.budgetMax[`clear:${l}`].drawCalls]));
  const extraDc = Math.max(...['rain', 'storm', 'snow', 'fog'].flatMap(k => ['low', 'medium', 'high'].map(l => report.budgetMax[`${k}:${l}`].drawCalls - clearMax[l])));
  check('Wetter kostet höchstens 2 zusätzliche Draw Calls (Partikel + Bodentönung)', extraDc <= 2, String(extraDc));
  check('Rein darstellend: dichte Probe unverändert', budget.denseSame);

  const unchanged = await page.evaluate(() => { const { s, sim, snap } = window.__w; const same = sim.serialize() === snap; s.destroy(); return same; });
  check('Rein darstellend: Spielzustand unverändert', unchanged);
  check('Keine Konsolen-/Seitenfehler', !report.errors.length, report.errors.slice(0, 5).join(' | '));
} catch (e) { report.errors.push(String(e?.stack || e)); process.exitCode = 1; }
finally { await browser?.close(); server.kill(); }
console.log(JSON.stringify(report, null, 1));
