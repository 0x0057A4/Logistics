// Browserprüfung der WebGL-Szene (nicht Teil von npm test).
// Voraussetzung: Root-index.html aus `python3 scripts/package.py`, Playwright global, Chromium unter /opt/pw-browsers.
// Aufruf: node tests/browser/scene3d.mjs   Ergebnis: JSON-Bericht, Screenshot docs/assets/scene3d-0.9.png
// Hinweis: Headless-Chromium rendert per SwiftShader (Software). Frame-Zeiten sind nicht repräsentativ für echte GPUs.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() { for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch {} } throw new Error('Playwright nicht gefunden'); }
function chrome() { const base = '/opt/pw-browsers'; for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'chrome-linux/chrome'); if (d.startsWith('chromium-') && existsSync(p)) return p; } return undefined; }
const { chromium } = load();
const port = 8700 + Math.floor(Math.random() * 200);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = { checks: [], errors: [] };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) process.exitCode = 1; };
let browser;
try {
  await wait(800);
  browser = await chromium.launch({ executablePath: chrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--no-first-run'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Fehlendes /favicon.ico (Browser-Standardanfrage) ist kein Spielfehler; alle anderen 4xx/5xx zählen.
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) report.errors.push(m.text()); });
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#welcome[open]', { timeout: 10000 });
  await page.click('[data-action="start"]');
  await wait(2500);
  // Headless-Chromium verweigert hier teils die Web-Lock-Speichersperre (Schreibschutz). Dann temporärer Modus.
  if (await page.$('#welcome[open]')) { report.note = 'Start im temporären Modus: ' + await page.$eval('#toast', t => t.textContent); await page.click('[data-action="temporary"]'); await wait(300); await page.click('[data-action="confirmOk"]'); await wait(1500); }
  check('Willkommensdialog geschlossen', !(await page.$('#welcome[open]')));
  const renderer = await page.$eval('#world', c => c.dataset.renderer);
  check('WebGL-Szene aktiv (Scene3D)', renderer === '3d', renderer);
  const gl = await page.evaluate(() => { const s = document.querySelector('#world').__scene; return s ? { ...s.renderInfo(), gl: s.renderer.getContext().getParameter(s.renderer.getContext().VERSION) } : null; });
  check('renderInfo verfügbar', gl && gl.drawCalls > 0, JSON.stringify(gl));
  // Baumodus: Montageplatz auf freie Zelle
  await page.click('.rail [data-action="build"]'); await wait(300);
  await page.click('[data-build="assembly"]'); await wait(300);
  const before = await page.evaluate(() => document.querySelector('#worldTitle').textContent);
  const cell = await page.evaluate(() => { const c = document.querySelector('#world'), r = c.getBoundingClientRect(), p = c.__scene.cellToScreen(12, 6); return { x: r.left + p.x, y: r.top + p.y }; });
  await page.mouse.move(cell.x, cell.y); await wait(250);
  const ghost = await page.evaluate(() => document.querySelector('#world').__scene.ghost.visible);
  check('Baugeist sichtbar unter Mauszeiger', ghost);
  await page.mouse.click(cell.x, cell.y); await wait(600);
  const after = await page.evaluate(() => ({ title: document.querySelector('#worldTitle').textContent, toast: document.querySelector('#toast').textContent }));
  check('Klick auf freie Zelle baut Anlage', before !== after.title && /Fahrt/.test(after.title), JSON.stringify({ before, ...after }));
  await page.keyboard.press('Escape'); await wait(500);
  const shot = path.join(root, 'docs/assets/scene3d-0.9.png');
  await page.screenshot({ path: shot });
  // Gebäudeklick öffnet Detailpanel
  const bpos = await page.evaluate(() => { const c = document.querySelector('#world'), r = c.getBoundingClientRect(), p = c.__scene.cellToScreen(12.5, 6.5); return { x: r.left + p.x, y: r.top + p.y - 12 }; });
  await page.mouse.click(bpos.x, bpos.y); await wait(500);
  const panel = await page.evaluate(() => ({ hidden: document.querySelector('#panel').hidden, title: document.querySelector('#panelTitle').textContent, body: document.querySelector('#panelBody').textContent.slice(0, 80) }));
  check('Gebäudeklick öffnet Detailpanel', !panel.hidden && /Montage/.test(panel.title + panel.body), JSON.stringify(panel));
  await page.keyboard.press('Escape'); await wait(300);
  // Bedienung: Ziehen, Rad, Drehen, Home ohne Fehler
  await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(820, 520, { steps: 6 }); await page.mouse.up();
  await page.mouse.wheel(0, -300); await wait(200);
  await page.click('[data-camera="rotate"]'); await wait(900); await page.click('[data-camera="home"]'); await wait(900);
  // Frame-Zeit bei laufender Kamerafahrt (erzwingt Rendern)
  const perf = await page.evaluate(async () => {
    const s = document.querySelector('#world').__scene, times = []; let last = performance.now(), end = last + 3000;
    await new Promise(res => { const f = now => { times.push(now - last); last = now; s.needs = true; s.goal.yaw += .01; if (now < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    times.sort((a, b) => a - b); const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return { frames: times.length, avgMs: +avg.toFixed(2), p95Ms: +times[Math.floor(times.length * .95)].toFixed(2), info: s.renderInfo() };
  });
  report.perf = perf;
  check('Unter 150 Draw Calls', perf.info.drawCalls < 150, String(perf.info.drawCalls));
  for (const v of ['site', 'flat', 'network', 'hall']) { await page.click(`[data-view="${v}"]`); await wait(700); if (v === 'site') await page.screenshot({ path: path.join(root, 'docs/assets/scene3d-0.9-gelaende.png') }); }
  // Netzansicht: Klick auf Standort-Pin wählt Standort
  await page.click('[data-view="network"]'); await wait(900);
  const pin = await page.evaluate(() => { const c = document.querySelector('#world'), s = c.__scene, r = c.getBoundingClientRect(), p = s.pins[0]; s.cellToScreen(p.x - .5, p.z - .5); const q = s.cellToScreen(p.x - .5, p.z - .5); return { x: r.left + q.x, y: r.top + q.y, n: s.pins.length }; });
  await page.mouse.click(pin.x, pin.y); await wait(500);
  check('Netzansicht zeigt Standort-Pins', pin.n >= 1, String(pin.n));
  await page.click('[data-view="hall"]'); await wait(300);
  // Darstellungsprobe mit synthetischem Zustand auf eigener Leinwand: alle Anlagentypen, Regalbestand, Personal, Fahrzeuge in Phasen.
  const probe = await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const B = (id, type, x, y, rotation = 0, status = 'idle', extra = {}) => ({ id, type, site: 's1', x, y, rotation, status, enabled: true, ...extra });
    const state = { t: 600, selectedSite: 's1', sites: [{ id: 's1', name: 'Werk Probe', x: 0, y: 0, width: 20, height: 16, energy: 60 }, { id: 's2', name: 'Lager Ost', x: 44, y: 18, width: 20, height: 16, energy: 30 }],
      buildings: [B('b1', 'assembly', 2, 1, 0, 'working'), B('b2', 'testing', 5, 1, 0, 'materials'), B('b3', 'packing', 8, 1, 0, 'working'), B('b4', 'rack', 2, 5), B('b5', 'rack', 2, 7), B('b6', 'rack', 5, 5, 90), B('b7', 'dock', 6, 13, 0, 'idle', { task: 'sh1' }), B('b8', 'power', 17, 1), B('b9', 'workshop', 14, 1, 0, 'broken'), B('b10', 'research', 11, 5), B('b11', 'coldstore', 14, 9, 90), B('b12', 'terminal', 10, 13)],
      batches: [{ id: 'k1', item: 'housing', site: 's1', qty: 140, location: 'stock' }], workers: [{ id: 'w1', site: 's1', role: 'production', task: 'j1' }, { id: 'w2', site: 's1', role: 'production', task: 'j2' }, { id: 'w3', site: 's1', role: 'warehouse', task: null }],
      jobs: [{ id: 'j1', building: 'b1', worker: 'w1' }, { id: 'j2', building: 'b3', worker: 'w2' }], research: [],
      vehicles: [{ id: 'vehicle-1', type: 'truck', site: 's1', status: 'loading', shipment: 'sh1' }, { id: 'vehicle-2', type: 'van', site: 's1', status: 'idle' }, { id: 'vehicle-3', type: 'refrigerated', site: 's1', status: 'transit', shipment: 'sh2' }, { id: 'vehicle-4', type: 'truck', site: 's1', status: 'returning', shipment: 'sh3' }],
      shipments: [{ id: 'sh1', vehicleId: 'vehicle-1', status: 'loading', remaining: 3, blocked: 'Lagerpersonal fehlt' }, { id: 'sh2', vehicleId: 'vehicle-3', status: 'transit', remaining: 33, distance: 30 }, { id: 'sh3', vehicleId: 'vehicle-4', status: 'returning', remaining: 2, distance: 30 }],
      transfers: [], tours: [], freights: [], returns: [] };
    const s = new Scene3D(canvas, {}); s.setState(state); s.setView('site');
    let clock = 600; s.setClock(clock);
    await new Promise(r => setTimeout(r, 1500));
    const t0 = s.fleet.map(p => p.shown ? `${p.x.toFixed(2)},${p.z.toFixed(2)}` : '-');
    clock += .6; s.setClock(clock); await new Promise(r => setTimeout(r, 400));
    const t1 = s.fleet.map(p => p.shown ? `${p.x.toFixed(2)},${p.z.toFixed(2)}` : '-');
    const chips = [...host.querySelectorAll('.scene3d-chip')].filter(c => c.style.display !== 'none').map(c => c.textContent);
    window.__probe = { s, host }; return { t0, t1, chips, info: s.renderInfo(), pallets: s.inst.pallet.count, workers: s.inst.body.count, vehicles: s.inst.vbox.count };
  });
  await page.screenshot({ path: path.join(root, 'docs/assets/scene3d-0.9-anlagen.png') });
  report.probe = probe;
  check('Probe: Regalpaletten aus Bestand, Figuren und Fahrzeuge instanziert', probe.pallets > 0 && probe.workers === 3 && probe.vehicles >= 3, JSON.stringify({ p: probe.pallets, w: probe.workers, v: probe.vehicles }));
  check('Probe: Fahrzeuge auf Zu-/Abfahrt bewegen sich mit gebrochener Uhr', probe.t0[2] !== probe.t1[2] || probe.t0[3] !== probe.t1[3], JSON.stringify([probe.t0, probe.t1]));
  check('Probe: Fahrzeug-Labels mit Kennung und Status', probe.chips.some(c => /LKW-1 · Beladen/.test(c)), probe.chips.join(' | '));
  await page.evaluate(() => { window.__probe.s.destroy(); window.__probe.host.remove(); });
  check('Keine Konsolenfehler (3D)', report.errors.length === 0, report.errors.join(' | '));
  // 2D-Rückfall per URL-Parameter
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 800 } }); const err2 = [];
  p2.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) err2.push(`HTTP ${r.status()} ${r.url()}`); });
  p2.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) err2.push(m.text()); }); p2.on('pageerror', e => err2.push(String(e)));
  await p2.goto(`http://127.0.0.1:${port}/index.html?renderer=2d`, { waitUntil: 'load' }); await wait(800);
  check('?renderer=2d erzwingt Canvas-2D-Szene', await p2.$eval('#world', c => c.dataset.renderer) === '2d');
  check('Keine Konsolenfehler (2D)', err2.length === 0, err2.join(' | '));
} catch (e) { check('Ablauf ohne Ausnahme', false, String(e?.stack || e)); }
finally { await browser?.close(); server.kill(); }
console.log(JSON.stringify(report, null, 1));
