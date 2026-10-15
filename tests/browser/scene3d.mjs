// Browserprüfung der WebGL-Szene (nicht Teil von npm test).
// Voraussetzung: Root-index.html aus `python3 scripts/package.py`, Playwright global, Chromium unter /opt/pw-browsers.
// Aufruf: node tests/browser/scene3d.mjs   Ergebnis: JSON-Bericht, Screenshot docs/assets/scene3d-0.9.png
// Hinweis: Headless-Chromium rendert per SwiftShader (Software). Frame-Zeiten sind nicht repräsentativ für echte GPUs.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() { for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch {} } throw new Error('Playwright nicht gefunden'); }
function chrome() { const base = '/opt/pw-browsers'; for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'chrome-linux/chrome'); if (d.startsWith('chromium-') && existsSync(p)) return p; } return undefined; }
// Messung im Browser: Fremd-Lkw (Pose, Dockspalte, im Bild) und eigene Fahrzeuge der Szene. Nur lesend.
const SCENE_YARD = `window.sceneYard = async s => { const { buildingBox } = await import('./scene3d.js'); const st = s.state, b = st.buildings || [];
  const yard = s.yardFleet.map(p => { const a = (st.yard || []).find(y => y.id === p.id), d = b.find(o => o.id === a?.dock), box = d ? buildingBox(d) : null, q = s.cellToScreen(p.x - .5, p.z - .5);
    return { id: p.id, phase: p.phase, x: +p.x.toFixed(3), z: +p.z.toFixed(3), dockX: p.dock ? p.dock.x : null, dockCol: box ? (box.x0 + box.x1) / 2 : null, dockId: a?.dock || null, onScreen: q.x > 0 && q.y > 60 && q.x < s.width && q.y < s.height - 30 }; });
  return { trailers: s.inst.ftrailer.count, yard, fleet: s.fleet.map(p => ({ id: p.v.id, x: +p.x.toFixed(3), z: +p.z.toFixed(3), shown: p.shown })) }; };`;
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(SCENE_YARD);
  const page = await ctx.newPage();
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
  const before = await page.evaluate(() => document.querySelectorAll('[data-flow]').length ? document.querySelector('#toast').textContent : '');
  const cell = await page.evaluate(() => { const c = document.querySelector('#world'), r = c.getBoundingClientRect(), p = c.__scene.cellToScreen(12, 6); return { x: r.left + p.x, y: r.top + p.y }; });
  await page.mouse.move(cell.x, cell.y); await wait(250);
  const ghost = await page.evaluate(() => document.querySelector('#world').__scene.ghost.visible);
  check('Baugeist sichtbar unter Mauszeiger', ghost);
  await page.mouse.click(cell.x, cell.y); await wait(600);
  const after = await page.evaluate(() => ({ toast: document.querySelector('#toast').textContent }));
  check('Klick auf freie Zelle baut Anlage', /übernommen/i.test(after.toast), JSON.stringify({ before, ...after }));
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
    clock += .6; s.setClock(clock); await new Promise(r => setTimeout(r, 900));
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
  // Welle 1: Hofprobe – Fremd-Lkw aus s.yard (Datenform W1-S2) in allen Phasen, Sortierplatz, Pakete inbound/stock.
  const hof = await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const B = (id, type, x, y, status = 'idle', extra = {}) => ({ id, type, site: 's1', x, y, rotation: 0, status, enabled: true, condition: 100, ...extra });
    const A = (n, phase, extra) => ({ id: `arrival-${n}`, site: 's1', contractId: 'contract-1', orderIds: [`order-${n}`], carrier: ['Talgrund Spedition', 'Ostheiden Logistik', 'Lerchental Transporte'][n % 3], plate: `TGD-K${'ABCDEFGH'[n]} ${1200 + n * 37}`, parcels: 120, phase, phaseStart: 600, phaseEnd: null, eta: 600, dock: null, waitReason: null, waitSince: null, unloaded: 0, atRisk: false, forecast: null, gateAt: 590, priority: false, split: [{ owner: `order-${n}`, target: 120, done: 0 }], ...extra });
    const state = { t: 600, selectedSite: 's1', sites: [{ id: 's1', name: 'Hub Probe', x: 0, y: 0, width: 20, height: 16, energy: 60 }],
      buildings: [B('d1', 'dock', 1, 13, 'idle', { task: 'arrival-5' }), B('d2', 'dock', 5, 13, 'idle', { task: 'arrival-4' }), B('d3', 'dock', 9, 13, 'idle', { task: 'arrival-6' }), B('d4', 'dock', 13, 13), B('so', 'sorter', 8, 8, 'working'), B('r1', 'rack', 2, 6), B('r2', 'rack', 2, 9), B('pw', 'power', 17, 1)],
      batches: [{ id: 'k1', item: 'parcel', site: 's1', qty: 150, location: 'inbound', owner: 'order-5' }, { id: 'k2', item: 'parcel', site: 's1', qty: 90, location: 'stock', owner: 'order-1' }, { id: 'k3', item: 'housing', site: 's1', qty: 60, location: 'stock' }],
      workers: [{ id: 'w1', site: 's1', role: 'warehouse', task: 'so:sort' }, { id: 'w2', site: 's1', role: 'warehouse', task: 'arrival-5:warehouse' }], jobs: [], research: [], vehicles: [], shipments: [], transfers: [], tours: [], freights: [], returns: [],
      yard: [A(0, 'approach', { phaseStart: 590, phaseEnd: 605, gateAt: null }), A(1, 'gate', { phaseStart: 599, phaseEnd: 601, gateAt: 599 }), A(2, 'queue', { phaseStart: 592, gateAt: 590, waitReason: 'Kein freies Dock' }), A(3, 'queue', { phaseStart: 596, gateAt: 594, waitReason: 'Kein freies Dock' }),
        A(4, 'docking', { phaseStart: 600, phaseEnd: 601, dock: 'd2' }), A(5, 'unloading', { dock: 'd1', unloaded: 40, waitReason: 'Keine Lagerkraft am Standort' }), A(6, 'toDock', { phaseStart: 599, phaseEnd: 601, dock: 'd3' }), A(7, 'gone', { phaseStart: 400 })] };
    const before = JSON.stringify(state);
    const s = new Scene3D(canvas, {}); s.setState(state); s.setView('site'); s.setLabels('fleet');
    let clock = 600; s.setClock(clock);
    s.goal.tx = 0; s.goal.tz = 21; s.goal.dist = 30; s.cam = { ...s.goal }; s.applyCamera(); s.needs = true;
    await new Promise(r => setTimeout(r, 1500));
    const pose = () => s.yardFleet.map(p => `${p.id}:${p.x.toFixed(2)},${p.z.toFixed(2)},${p.heading.toFixed(2)}`);
    const p0 = pose();
    clock += .5; s.setClock(clock);
    // Unter SwiftShader-Last kann ein Frame länger als 500 ms dauern: bis zu 4 s auf den nächsten gezeichneten Frame warten.
    let p1 = pose(); for (let i = 0; i < 40 && p1[0] === p0[0]; i++) { await new Promise(r => setTimeout(r, 100)); p1 = pose(); }
    const chips = [...host.querySelectorAll('.scene3d-chip')].filter(c => c.style.display !== 'none').map(c => c.textContent);
    window.__hof = { s, host };
    return { p0, p1, chips, labels: s.yardFleet.map(p => `${p.label}|${p.tone}`), trucks: s.inst.ftrailer.count, cabs: s.inst.fcab.count, cages: s.inst.cage.count, stacks: s.inst.stack.count, info: s.renderInfo(), unchanged: JSON.stringify(state) === before };
  });
  await page.screenshot({ path: path.join(root, 'docs/assets/hof-0.9.png') });
  report.hof = hof;
  check('Hof: 7 Fremd-Lkw instanziert (gone ausgeblendet)', hof.trucks === 7 && hof.cabs === 7, `${hof.trucks}/${hof.cabs}`);
  check('Hof: Labels Kennzeichen · deutsche Phase', ['Anfahrt', 'Torkontrolle', 'Wartet auf Dock', 'Andocken', 'Entladen · Keine Lagerkraft am Standort', 'Zum Dock'].every(t => hof.labels.some(l => l.includes(t))) && hof.chips.some(c => /^TGD-K\w \d+ · /.test(c)), hof.labels.join(' | ') + ' // ' + hof.chips.join(' | '));
  check('Hof: Farben wartet/fährt/Einfahrt/Dock', hof.labels.some(l => /Wartet auf Dock\|wait/.test(l)) && hof.labels.some(l => /Andocken\|move/.test(l)) && hof.labels.some(l => /Anfahrt\|gate/.test(l)) && hof.labels.some(l => /Entladen.*\|wait/.test(l)), hof.labels.join(' | '));
  check('Hof: Anfahrt und Andocken bewegen sich mit gebrochener Uhr, Warteschlange steht', hof.p0[0] !== hof.p1[0] && hof.p0[4] !== hof.p1[4] && hof.p0[2] === hof.p1[2] && hof.p0[3] === hof.p1[3], JSON.stringify([hof.p0, hof.p1]));
  check('Hof: Rollcontainer (inbound) und Kartonstapel (stock) sichtbar', hof.cages === 4 && hof.stacks === 5, `${hof.cages}/${hof.stacks}`);
  check('Hof: unter 150 Draw Calls', hof.info.drawCalls < 150, String(hof.info.drawCalls));
  check('Hof: Spielzustand unverändert', hof.unchanged);
  await page.evaluate(() => { window.__hof.s.destroy(); window.__hof.host.remove(); });
  // Welle 2b: Palettenvertrag + Stapler (Datenform W2-S2): Paletten-Lkw entlädt an d1 (Stapler f1 gebunden), eigener Lkw belädt an d2 (Stapler f3),
  // Stapler f2 lädt (8 %), Palettenstapel im Lager, Paket-Lkw in der Warteschlange weiter mit Kastenauflieger.
  const fork = await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const B = (id, type, x, y, status = 'idle', extra = {}) => ({ id, type, site: 's1', x, y, rotation: 0, status, enabled: true, condition: 100, ...extra });
    const A = (id, phase, extra) => ({ id, site: 's1', contractId: 'contract-1', orderIds: [], carrier: 'Weidenstein Frachtdienst', plate: 'WST-PL 4410', parcels: 12, phase, phaseStart: 600, phaseEnd: null, eta: 600, dock: null, waitReason: null, waitSince: null, unloaded: 0, atRisk: false, forecast: null, gateAt: 590, priority: false, split: [{ owner: 'order-1', target: 12, done: 0 }], ...extra });
    const state = { t: 600, selectedSite: 's1', sites: [{ id: 's1', name: 'Hub Palette', x: 0, y: 0, width: 20, height: 16, energy: 60 }],
      buildings: [B('d1', 'dock', 2, 13, 'idle', { task: 'arrival-1' }), B('d2', 'dock', 9, 13, 'idle', { task: 'sh1' }), B('r1', 'rack', 2, 8), B('r2', 'rack', 5, 8), B('r3', 'rack', 9, 8),
        B('f1', 'forklift', 14, 9, 'idle', { charge: 54, task: 'arrival-1:forklift' }), B('f2', 'forklift', 15, 9, 'idle', { charge: 8, task: null }), B('f3', 'forklift', 16, 9, 'idle', { charge: 91, task: 'sh1:forklift' }), B('pw', 'power', 17, 1)],
      batches: [{ id: 'p1', item: 'pallet', site: 's1', qty: 14, location: 'stock', owner: 'order-1' }, { id: 'k1', item: 'parcel', site: 's1', qty: 40, location: 'stock', owner: 'order-2' }],
      workers: [{ id: 'w1', site: 's1', role: 'warehouse', task: 'arrival-1:warehouse' }, { id: 'w2', site: 's1', role: 'warehouse', task: 'sh1:warehouse' }], jobs: [], research: [],
      vehicles: [{ id: 'vehicle-1', type: 'truck', site: 's1', status: 'loading', shipment: 'sh1' }], shipments: [{ id: 'sh1', vehicleId: 'vehicle-1', status: 'loading', remaining: 3 }], transfers: [], tours: [], freights: [], returns: [],
      yard: [A('arrival-1', 'unloading', { dock: 'd1', item: 'pallet', unloaded: 5, split: [{ owner: 'order-1', target: 12, done: 5 }] }), A('arrival-2', 'queue', { plate: 'TGD-KA 1200', carrier: 'Talgrund Spedition', parcels: 120, split: [{ owner: 'order-2', target: 120, done: 0 }], waitReason: 'Kein freies Dock' })] };
    const before = JSON.stringify(state);
    const s = new Scene3D(canvas, {}); s.setState(state); s.setView('hall'); s.setLabels('all');
    let clock = 600.1; s.setClock(clock);
    s.goal.tx = 9; s.goal.tz = 12; s.goal.dist = 20; s.cam = { ...s.goal }; s.applyCamera(); s.needs = true;
    await new Promise(r => setTimeout(r, 1500));
    const pose = () => s.forks.map(f => `${f.id}:${f.x.toFixed(2)},${f.z.toFixed(2)}`);
    const p0 = pose();
    clock += .25; s.setClock(clock);
    let p1 = pose(); for (let i = 0; i < 40 && p1[0] === p0[0]; i++) { await new Promise(r => setTimeout(r, 100)); p1 = pose(); }
    const chips = [...host.querySelectorAll('.scene3d-chip')].filter(c => c.style.display !== 'none').map(c => c.textContent);
    window.__fork = { s, host };
    return { p0, p1, chips, forks: s.inst.fork.count, bars: s.inst.charge.count, flats: s.inst.fflat.count, boxes: s.inst.ftrailer.count, trailerLoad: s.inst.tload.count, stockPallets: s.inst.pstack.count, carried: s.inst.fload.count, stacks: s.inst.stack.count, rackPallets: s.inst.pallet.count, info: s.renderInfo(), unchanged: JSON.stringify(state) === before };
  });
  await page.screenshot({ path: path.join(root, 'docs/assets/stapler-0.10.png') });
  report.stapler = fork;
  check('Stapler: 3 Stapler mit Akkubalken instanziert', fork.forks === 3 && fork.bars === 3, `${fork.forks}/${fork.bars}`);
  check('Stapler: gebundene Stapler pendeln mit gebrochener Uhr, ladender steht', fork.p0[0] !== fork.p1[0] && fork.p0[2] !== fork.p1[2] && fork.p0[1] === fork.p1[1], JSON.stringify([fork.p0, fork.p1]));
  check('Stapler: Labels „Stapler · 54 %“ (Gruppe infra)', fork.chips.some(c => c === 'Stapler · 54 %') && fork.chips.some(c => c === 'Stapler · 8 %'), fork.chips.join(' | '));
  check('Paletten: Palettenauflieger mit Restladung, Paket-Lkw weiter Kastenauflieger', fork.flats === 1 && fork.boxes === 1 && fork.trailerLoad === 5, JSON.stringify({ f: fork.flats, b: fork.boxes, l: fork.trailerLoad }));
  check('Paletten: Lagerpaletten als Stapel (14), Kartons weiter als Kartonstapel, keine Materialregal-Paletten', fork.stockPallets === 14 && fork.stacks === 2 && fork.rackPallets === 0, JSON.stringify({ p: fork.stockPallets, k: fork.stacks, r: fork.rackPallets }));
  check('Stapler: unter 150 Draw Calls', fork.info.drawCalls < 150, String(fork.info.drawCalls));
  check('Stapler: Spielzustand unverändert', fork.unchanged);
  await page.evaluate(() => { window.__fork.s.destroy(); window.__fork.host.remove(); });
  // W1b: Probe-Zustand aus tests/ui-hub-probe.js über den echten Importweg (Befund A01: Fremd-Lkw an Dock 1 unsichtbar).
  {
    const { Simulation } = await import(pathToFileURL(path.join(root, 'dist/core.js')).href);
    const { hubProbe } = await import(pathToFileURL(path.join(root, 'tests/ui-hub-probe.js')).href);
    const json = hubProbe(Simulation).sim.serialize();
    await page.setInputFiles('#importFile', { name: 'hub-probe.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await page.waitForSelector('#confirm[open]'); await page.click('#confirm [data-action="confirmOk"]'); await wait(1200);
    await page.click('[data-view="hall"]'); await page.click('[data-camera="home"]'); await wait(900);
    if (!(await page.$eval('#flow', e => e.hidden || getComputedStyle(e).display === 'none'))) await page.click('#sceneOnlyBtn');
    await wait(900);
    const imp = await page.evaluate(() => sceneYard(document.querySelector('#world').__scene));
    report.hofImport = imp;
    const tr = imp.yard[0], own = imp.fleet[0];
    check('Import: Fremd-Lkw instanziert und an seinem Dock (Spalte der Laderampe)', imp.trailers === 1 && tr && tr.phase === 'unloading' && Math.abs(tr.x - tr.dockX) < 1e-3 && Math.abs(tr.x - tr.dockCol) < 1e-3 && tr.onScreen, JSON.stringify(imp));
    check('Import: eigener Lieferwagen getrennt vom Fremd-Lkw', own && own.shown && Math.abs(own.x - tr.x) >= 2.9 - 1e-6, JSON.stringify({ own, tr }));
    await page.screenshot({ path: path.join(root, 'docs/assets/hof-probe-0.9.png') });
    await page.click('#sceneOnlyBtn'); await wait(300);
  }
  // W1b: echter Ablauf über die Oberfläche – Freies Bauen, Dock + Regal bauen, Lagerkraft einstellen, Startvertrag annehmen, 12× bis Lkw am Dock.
  {
    const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx3.addInitScript(SCENE_YARD); const p3 = await ctx3.newPage(); const err3 = [];
    p3.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) err3.push(m.text()); }); p3.on('pageerror', e => err3.push(String(e)));
    await p3.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' }); await p3.waitForSelector('#welcome[open]', { timeout: 10000 });
    await p3.check('input[name=mode][value=sandbox]'); await p3.click('[data-action="start"]'); await wait(2000);
    if (await p3.$('#welcome[open]')) { await p3.click('#welcome [data-action="temporary"]'); await wait(300); await p3.click('[data-action="confirmOk"]'); await wait(1200); }
    const clickCell = async (x, y) => { const q = await p3.evaluate(([x, y]) => { const c = document.querySelector('#world'), r = c.getBoundingClientRect(), p = c.__scene.cellToScreen(x, y); return { x: r.left + p.x, y: r.top + p.y }; }, [x, y]); await p3.mouse.move(q.x, q.y); await wait(200); await p3.mouse.click(q.x, q.y); await wait(500); };
    await p3.click('.rail [data-action="build"]'); await wait(300); await p3.click('[data-build="dock"]'); await wait(300); await clickCell(4, 13);
    await p3.click('[data-build="rack"]'); await wait(300); await clickCell(3, 3); await p3.keyboard.press('Escape'); await wait(300);
    await p3.click('.rail [data-panel="staff"]'); await p3.selectOption('#panelBody [data-form="hire"] select[name=role]', 'warehouse'); await p3.click('#panelBody [data-form="hire"] button.primary'); await wait(400);
    await p3.click('.rail [data-panel="contracts"]'); await p3.click('#panelBody [data-action="acceptContract"]'); await wait(400); await p3.click('[data-action="close"]');
    const setup = await p3.evaluate(() => { const st = document.querySelector('#world').__scene.state; return { docks: st.buildings.filter(b => b.type === 'dock').length, racks: st.buildings.filter(b => b.type === 'rack').length, warehouse: st.workers.filter(w => w.role === 'warehouse').length, active: (st.contracts || []).filter(c => c.status === 'active').length, t: st.t }; });
    check('Echt: Dock, Regal, Lagerkraft und aktiver Startvertrag über die Oberfläche', setup.docks >= 1 && setup.racks >= 1 && setup.warehouse >= 1 && setup.active === 1, JSON.stringify(setup));
    // 12× bis der Lkw am Tor ist, dann 1×; Halt bei „Entladen“. Der Wächter läuft in der Seite (50 ms, zwischen den 100-ms-Simulationstakten),
    // weil Entladen nur wenige Spielminuten dauert und eine Abfrage von außen (SwiftShader-Last) es sonst überspringt. Bedienung nur über die Tempotasten.
    await p3.evaluate(() => { window.__dockWatch = setInterval(() => { const yard = document.querySelector('#world').__scene.state.yard || [];
      if (yard.some(a => a.phase === 'unloading')) { document.querySelector('[data-speed="0"]').click(); clearInterval(window.__dockWatch); window.__docked = true; }
      else if (!window.__slow && yard.some(a => ['gate', 'queue', 'toDock', 'docking'].includes(a.phase))) { window.__slow = true; document.querySelector('[data-speed="1"]').click(); } }, 50); });
    await p3.click('[data-speed="12"]');
    let docked = false; try { await p3.waitForFunction(() => window.__docked === true, null, { timeout: 120000, polling: 250 }); docked = true; } catch (e) { report.hofEchtWait = String(e).slice(0, 300); }
    await p3.click('[data-camera="home"]'); await wait(900); await p3.click('#sceneOnlyBtn'); await wait(1200);
    const real = await p3.evaluate(() => sceneYard(document.querySelector('#world').__scene));
    report.hofEcht = { setup, docked, t: await p3.evaluate(() => document.querySelector('#world').__scene.state.t), ...real };
    const tr = real.yard.find(a => a.phase === 'unloading');
    check('Echt: 12× bis Lkw am Dock, Lkw sichtbar an seiner Laderampe', docked && tr && Math.abs(tr.x - tr.dockX) < 1e-3 && Math.abs(tr.x - tr.dockCol) < 1e-3 && tr.onScreen && real.trailers >= 1, JSON.stringify(real));
    await p3.screenshot({ path: path.join(root, 'docs/assets/hof-echt-0.9.png') });
    check('Echt: keine Konsolenfehler', err3.length === 0, err3.join(' | '));
    await ctx3.close();
  }
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
