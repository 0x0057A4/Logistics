// Browserprüfung der WebGL-Szene (nicht Teil von npm test).
// Voraussetzung: Root-index.html aus `python3 scripts/package.py`, Playwright global, Chromium unter /opt/pw-browsers.
// Aufruf: node tests/browser/scene3d.mjs   Ergebnis: JSON-Bericht, Screenshots docs/assets/scene3d-0.9.png, szene-0.11-nacht.png, netz-0.12.png u. a.
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
  // Welle 2c: Leitstand-Design – Tageszeit (auto/fest), Nachtbeleuchtung, Rundgang mit Abbruch, Verfolgen (Fremd-Lkw, eigenes Fahrzeug), Label-Chips.
  const w2c = await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const sleep = ms => new Promise(r => setTimeout(r, ms)), frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const B = (id, type, x, y, status = 'idle', extra = {}) => ({ id, type, site: 's1', x, y, rotation: 0, status, enabled: true, condition: 100, ...extra });
    const A = (id, phase, extra) => ({ id, site: 's1', contractId: 'contract-1', orderIds: [], carrier: 'Talgrund Spedition', plate: 'TGD-KN 1300', parcels: 120, phase, phaseStart: 1320, phaseEnd: null, eta: 1320, dock: null, waitReason: null, waitSince: null, unloaded: 0, atRisk: false, forecast: null, gateAt: 1310, priority: false, split: [{ owner: 'order-1', target: 120, done: 0 }], ...extra });
    const state = { t: 1320, selectedSite: 's1', sites: [{ id: 's1', name: 'Hub Nacht', x: 0, y: 0, width: 20, height: 16, energy: 60 }],
      buildings: [B('d1', 'dock', 1, 13, 'idle', { task: 'arrival-2' }), B('d2', 'dock', 5, 13, 'idle', { task: 'sh1' }), B('d3', 'dock', 9, 13), B('so', 'sorter', 8, 8, 'working'), B('r1', 'rack', 2, 6), B('r2', 'rack', 2, 9), B('f1', 'forklift', 14, 9, 'idle', { charge: 70, task: 'arrival-2:forklift' }), B('pw', 'power', 17, 1)],
      batches: [{ id: 'k1', item: 'parcel', site: 's1', qty: 80, location: 'inbound', owner: 'order-1' }, { id: 'k2', item: 'parcel', site: 's1', qty: 60, location: 'stock', owner: 'order-1' }],
      workers: [{ id: 'w1', site: 's1', role: 'warehouse', task: 'so:sort' }], jobs: [], research: [],
      vehicles: [{ id: 'vehicle-1', type: 'truck', site: 's1', status: 'loading', shipment: 'sh1' }], shipments: [{ id: 'sh1', vehicleId: 'vehicle-1', status: 'loading', remaining: 3 }], transfers: [], tours: [], freights: [], returns: [],
      yard: [A('arrival-1', 'approach', { phaseStart: 1315, phaseEnd: 1330, gateAt: null }), A('arrival-2', 'unloading', { dock: 'd1', plate: 'OHL-PA 2210', unloaded: 30, waitReason: 'Keine Lagerkraft am Standort' }), A('arrival-3', 'queue', { plate: 'LTT-KC 3302', waitReason: 'Kein freies Dock' })] };
    const before = JSON.stringify(state), modes = [];
    const s = new Scene3D(canvas, { onCameraMode: (m, info) => modes.push(m ? `${m}:${info.stop || info.id}` : `ende:${info.reason}`) });
    s.setState(state); s.setView('site'); s.setLabels('all');
    let clock = 1320; s.setClock(clock); await sleep(1200);
    const r = {};
    // Tageszeit automatisch aus der Uhr: 22:00 Nacht, 12:00 Tag, 07:00 Morgenübergang.
    r.auto22 = s.theme(); s.setClock(720); await frame(); r.auto12 = s.theme(); s.setClock(420); await frame(); r.auto07 = s.theme();
    s.setTheme('day'); s.setClock(1320); await frame(); r.fixedDay = s.theme();
    s.setTheme('night'); await sleep(600); r.night = { ...s.theme(), glow: s.glow.visible, glowOpacity: s.mat.glow.opacity, nightClass: s.labelRoot.classList.contains('night'), bg: '#' + s.scene.background.getHexString() };
    s.goal.tx = 2; s.goal.tz = 17; s.goal.dist = 34; s.goal.yaw = Math.PI / 5; s.cam = { ...s.goal }; s.applyCamera(); s.needs = true; await sleep(900);
    r.nightInfo = s.renderInfo();
    const chipEls = [...host.querySelectorAll('.scene3d-chip')].filter(c => c.style.display !== 'none');
    r.chips = chipEls.map(c => ({ text: c.textContent, head: c.querySelector('b')?.textContent, rest: c.querySelector('small')?.textContent, cls: c.className, dot: !!c.querySelector('.scene3d-dot'), bg: getComputedStyle(c).backgroundColor }));
    window.__w2c = { s, host };
    // Rundgang: Stationen, Fortschritt, Abbruch durch Zeigereingabe.
    const stops = s.tour(); r.stops = stops.map(p => p.key); r.tour0 = s.cameraMode();
    const c0 = { ...s.cam }; await sleep(1200); r.tourMid = { ...s.cam }; r.tourMoved = Math.hypot(s.cam.tx - c0.tx, s.cam.tz - c0.tz) > .5;
    let t0 = performance.now(); while (s.cameraMode()?.index < 1 && performance.now() - t0 < 9000) await sleep(100); r.tour1 = s.cameraMode();
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 300, clientY: 300, pointerId: 1, bubbles: true })); canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 300, clientY: 300, pointerId: 1, bubbles: true }));
    r.tourAfterInput = s.cameraMode();
    // Rundgang vollständig (mit reduzierter Bewegung: Schnitte statt Fahrt) bis „Ausgang“ und Ende.
    document.body.classList.add('reduced'); s.tour(); t0 = performance.now(); const seen = new Set();
    while (s.cameraMode() && performance.now() - t0 < 20000) { seen.add(s.cameraMode().stop); await sleep(100); }
    document.body.classList.remove('reduced'); r.tourSeen = [...seen]; r.tourDone = s.cameraMode();
    // Verfolgen: Fremd-Lkw auf Anfahrt; Ziel wandert mit der Uhr.
    r.followOk = s.follow('arrival-1'); r.follow0 = s.cameraMode();
    clock = 1322; s.setClock(clock); await sleep(400); clock = 1324; s.setClock(clock); await sleep(900);
    const a1 = s.yardFleet.find(p => p.id === 'arrival-1'); r.followGap = Math.hypot(s.goal.tx - a1.x, s.goal.tz - a1.z); r.followCamGap = Math.hypot(s.cam.tx - a1.x, s.cam.tz - a1.z);
    r.unchanged = JSON.stringify(state) === before;
    return r;
  });
  await page.keyboard.press('Escape'); await wait(200);
  const w2cEsc = await page.evaluate(async () => {
    const s = window.__w2c.s, out = { afterEsc: s.cameraMode() };
    out.followVehicle = s.follow('vehicle-1'); await new Promise(r => setTimeout(r, 600)); const v = s.fleet[0]; out.vehGap = Math.hypot(s.goal.tx - v.x, s.goal.tz - v.z);
    out.followNull = s.follow(null); out.afterNull = s.cameraMode(); out.unknown = s.follow('arrival-99');
    // Ziehen bricht Verfolgen ab.
    s.follow('arrival-2'); const c = s.canvas; c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 400, pointerId: 2, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { button: 0, clientX: 460, clientY: 430, pointerId: 2, bubbles: true })); c.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 460, clientY: 430, pointerId: 2, bubbles: true }));
    out.afterDrag = s.cameraMode();
    s.setTheme('night'); s.goal.tx = 2; s.goal.tz = 17; s.goal.dist = 34; s.goal.yaw = Math.PI / 5; s.cam = { ...s.goal }; s.applyCamera(); s.needs = true; await new Promise(r => setTimeout(r, 900));
    out.info = s.renderInfo(); return out;
  });
  await page.screenshot({ path: path.join(root, 'docs/assets/szene-0.11-nacht.png') });
  report.w2c = { ...w2c, ...w2cEsc };
  check('W2c: Tageszeit automatisch aus der Uhr (22 Uhr Nacht, 12 Uhr Tag, 7 Uhr Übergang)', w2c.auto22.night === 1 && w2c.auto22.key === 'night' && w2c.auto12.night === 0 && w2c.auto07.night > 0 && w2c.auto07.night < 1, JSON.stringify([w2c.auto22, w2c.auto12, w2c.auto07]));
  check('W2c: setTheme fest (Tag ignoriert Uhr), Nacht mit Lichtflächen und Nacht-Chips', w2c.fixedDay.night === 0 && w2c.fixedDay.mode === 'day' && w2c.night.night === 1 && w2c.night.glow && w2c.night.glowOpacity > .9 && w2c.night.nightClass && w2c.night.bg === '#17232c', JSON.stringify([w2c.fixedDay, w2c.night]));
  check('W2c: Chips mit Farbpunkt, Kennung fett, Status klein, Text unverändert', w2c.chips.length > 0 && w2c.chips.every(c => c.dot && c.head + (c.rest ? ' · ' + c.rest : '') === c.text) && w2c.chips.some(c => c.text === 'OHL-PA 2210 · Entladen · Keine Lagerkraft am Standort' && /tone-wait/.test(c.cls)), JSON.stringify(w2c.chips.slice(0, 6)));
  check('W2c: Rundgang Tor → Docks → Sortierung → Lager → Ausgang, sanfte Fahrt, Abbruch durch Eingabe', w2c.stops.join() === 'gate,docks,sorting,storage,exit' && w2c.tour0?.stop === 'gate' && w2c.tourMoved && w2c.tour1?.index === 1 && w2c.tourAfterInput === null, JSON.stringify({ s: w2c.stops, t0: w2c.tour0, t1: w2c.tour1, a: w2c.tourAfterInput, m: w2c.tourMoved }));
  check('W2c: Rundgang läuft bis Ausgang und endet', w2c.tourSeen.join() === 'gate,docks,sorting,storage,exit' && w2c.tourDone === null, JSON.stringify(w2c.tourSeen));
  check('W2c: follow(Fremd-Lkw) folgt der Anfahrt, Esc beendet', w2c.followOk && w2c.follow0?.id === 'arrival-1' && w2c.followGap < .6 && w2c.followCamGap < 2 && w2cEsc.afterEsc === null, JSON.stringify({ ok: w2c.followOk, gap: w2c.followGap, cam: w2c.followCamGap, esc: w2cEsc.afterEsc }));
  check('W2c: follow(eigenes Fahrzeug), follow(null) beendet, unbekanntes Ziel abgelehnt, Ziehen bricht ab', w2cEsc.followVehicle && w2cEsc.vehGap < 1e-3 && w2cEsc.afterNull === null && w2cEsc.unknown === false && w2cEsc.afterDrag === null, JSON.stringify(w2cEsc));
  check('W2c: Nacht unter 150 Draw Calls', w2c.nightInfo.drawCalls < 150 && w2cEsc.info.drawCalls < 150, `${w2c.nightInfo.drawCalls}/${w2cEsc.info.drawCalls}`);
  check('W2c: Spielzustand unverändert', w2c.unchanged);
  await page.evaluate(() => { window.__w2c.s.destroy(); window.__w2c.host.remove(); });
  // Welle 3a: Linienverkehr (W3-S2) – Netzansicht mit 2 Standorten, Linie A→B (aktiv), B→A (inaktiv), Fahrt im Hauptlauf; Verfolgen; Standortansicht.
  const netz = await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = (id, type, site, x, y, extra = {}) => ({ id, type, site, x, y, rotation: 0, status: 'idle', enabled: true, condition: 100, ...extra });
    const state = { t: 600, selectedSite: 's1', sites: [{ id: 's1', name: 'Hub Nord', x: 0, y: 0, width: 20, height: 16, energy: 60 }, { id: 's2', name: 'Hub Süd', x: 60, y: 30, width: 20, height: 16, energy: 60 }],
      buildings: [B('d1', 'dock', 's1', 5, 13), B('r1', 'rack', 's1', 2, 6), B('d2', 'dock', 's2', 5, 13)], batches: [], workers: [], jobs: [], research: [],
      vehicles: [{ id: 'vehicle-1', type: 'truck', site: 's1', status: 'linehaul', linehaul: 'linehaul-1', condition: 90 }, { id: 'vehicle-2', type: 'van', site: 's1', status: 'idle', condition: 90 }],
      lines: [{ id: 'line-1', from: 's1', to: 's2', departures: [600], vehicleId: 'vehicle-1', cutoff: 30, active: true, missed: 0, wait: null, waitAt: null }, { id: 'line-2', from: 's2', to: 's1', departures: [1200], vehicleId: null, cutoff: 30, active: false, missed: 0, wait: null, waitAt: null }],
      linehauls: [{ id: 'linehaul-1', lineId: 'line-1', vehicleId: 'vehicle-1', from: 's1', to: 's2', status: 'transit', cargo: [], orders: [{ orderId: 'order-1', qty: 40 }], qty: 40, pallet: false, remaining: 15, duration: 40, distance: 67, departAt: 575, dock: null, driver: 'w9', worker: null, blocked: null }],
      shipments: [], transfers: [], tours: [], freights: [], returns: [], yard: [] };
    const before = JSON.stringify(state), r = {};
    const s = new Scene3D(canvas, {}); s.setState(state); s.setView('network'); s.setLabels('all');
    let clock = 600; s.setClock(clock); await sleep(1500);
    r.trips = s.trips.length; r.markers = s.inst.marker.count; r.lineTris = s.netLineMesh.geometry.attributes.position.count / 3;
    r.lineColors = s.netLineList.map(l => `${l.id}:${l.active}`);
    const m0 = { x: s.trips[0].x, z: s.trips[0].z };
    clock += .6; s.setClock(clock);
    let m1 = { x: s.trips[0].x, z: s.trips[0].z }; for (let i = 0; i < 40 && m1.x === m0.x; i++) { await sleep(100); m1 = { x: s.trips[0].x, z: s.trips[0].z }; }
    r.moved = Math.hypot(m1.x - m0.x, m1.z - m0.z);
    r.chips = [...host.querySelectorAll('.scene3d-chip')].filter(c => c.style.display !== 'none').map(c => c.textContent);
    r.info = s.renderInfo();
    r.followOk = s.follow('vehicle-1'); r.mode = s.cameraMode();
    clock += 1; s.setClock(clock); await sleep(1200);
    r.followGap = Math.hypot(s.goal.tx - s.trips[0].x, s.goal.tz - s.trips[0].z);
    r.followUnknown = s.follow('vehicle-9');
    s.follow(null);
    s.home(); await sleep(900); r.infoHome = s.renderInfo();
    window.__netz = { s, host, state };
    r.unchanged = JSON.stringify(state) === before;
    return r;
  });
  await page.screenshot({ path: path.join(root, 'docs/assets/netz-0.12.png') });
  // Standortansicht: Lkw fährt am Start ab (früh im Hauptlauf), am Ziel steht er beim Entladen am Dock d2.
  const netzSite = await page.evaluate(async () => {
    const { s, state } = window.__netz, sleep = ms => new Promise(r => setTimeout(r, ms)), r = {};
    const st = JSON.parse(JSON.stringify(state)); st.linehauls[0].remaining = 39; s.setState(st); s.setView('site'); s.setClock(600.2); await sleep(1200);
    const p = s.fleet.find(f => f.v.id === 'vehicle-1'); r.out = p && { mode: p.plan.mode, shown: p.shown, label: p.label, z: +p.z.toFixed(2) };
    const st2 = JSON.parse(JSON.stringify(st)); st2.selectedSite = 's2'; st2.linehauls[0].status = 'unloading'; st2.linehauls[0].remaining = 3; st2.linehauls[0].duration = 5; st2.linehauls[0].dock = 'd2'; st2.buildings[2].task = 'linehaul-1';
    s.setState(st2); await sleep(1200);
    const q = s.fleet.find(f => f.v.id === 'vehicle-1'); r.dock = q && { mode: q.plan.mode, dock: q.dock, shown: q.shown, label: q.label };
    r.info = s.renderInfo(); s.destroy(); window.__netz.host.remove(); return r;
  });
  report.netz = { ...netz, site: netzSite };
  check('W3a Netz: Linien als Band mit Pfeilen (aktiv/inaktiv), Linien-Lkw als Marker', netz.trips === 1 && netz.markers === 1 && netz.lineTris >= 4 && netz.lineColors.join() === 'line-1:true,line-2:false', JSON.stringify({ t: netz.trips, m: netz.markers, tri: netz.lineTris, c: netz.lineColors }));
  check('W3a Netz: Marker bewegt sich mit gebrochener Uhr', netz.moved > 1e-3, String(netz.moved));
  check('W3a Netz: Label „Linie Hub Nord→Hub Süd · NN %“', netz.chips.some(c => /^Linie Hub Nord→Hub Süd · \d+ %$/.test(c)), netz.chips.join(' | '));
  check('W3a Netz: follow(Linien-Lkw) in der Netzansicht, unbekanntes Ziel abgelehnt', netz.followOk && netz.mode?.id === 'vehicle-1' && netz.followGap < .6 && netz.followUnknown === false, JSON.stringify({ ok: netz.followOk, gap: netz.followGap, u: netz.followUnknown }));
  check('W3a Standort: Hauptlauf fährt Zufahrt ab, Entladen am Dock des Ziels, Labels deutsch', netzSite.out?.mode === 'out' && netzSite.out.shown && netzSite.out.label === 'LKW-1 · Hauptlauf → Hub Süd' && netzSite.dock?.mode === 'site' && netzSite.dock.dock === 'd2' && netzSite.dock.label === 'LKW-1 · Entladen Hauptlauf', JSON.stringify(netzSite));
  check('W3a: unter 150 Draw Calls', netz.info.drawCalls < 150 && netz.infoHome.drawCalls < 150 && netzSite.info.drawCalls < 150, `${netz.info.drawCalls}/${netz.infoHome.drawCalls}/${netzSite.info.drawCalls}`);
  check('W3a: Spielzustand unverändert', netz.unchanged);
  // Welle 3b: Containerhof (W3b-S2) – zwei Containerhöfe, 3 Container im Hof (einer gestapelt, einer leer mit Lagergeld), Chassis in drop (beladen),
  // Container am Dock d1 beim Entladen (Stapler f1 pendelt), Tag und Nacht, Auswahl zeigt Container-Label.
  const cyard = await page.evaluate(async () => {
    const { Scene3D } = await import('./scene3d.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#fff'; document.body.appendChild(host);
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block'; host.appendChild(canvas);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = (id, type, x, y, extra = {}) => ({ id, type, site: 's1', x, y, rotation: 0, status: 'idle', enabled: true, condition: 100, ...extra });
    const C = (id, status, extra = {}) => ({ id, site: 's1', contractId: 'contract-7', orderIds: ['order-1'], content: 'pallet', qty: 20, unloaded: 0, status, arrivedAt: 500, freeUntil: 1940, dock: null, split: [{ owner: 'order-1', target: 20, done: 0 }], teu: 2, freeMinutes: 1440, demurrageMinutes: 0, priority: false, waitReason: null, waitSince: null, statusAt: 500, moveEnd: null, arrivalId: 'arrival-1', emptyAt: null, pickupAt: null, pickupArrival: null, goneAt: null, ...extra });
    const state = { t: 720, selectedSite: 's1', sites: [{ id: 's1', name: 'Hub Seeimport', x: 0, y: 0, width: 20, height: 16, energy: 60 }],
      buildings: [B('d1', 'dock', 2, 13, { task: 'container-4' }), B('d2', 'dock', 6, 13), B('r1', 'rack', 2, 8), B('r2', 'rack', 5, 8), B('f1', 'forklift', 9, 9, { charge: 70, task: 'container-4:forklift' }), B('pw', 'power', 17, 1),
        B('cy1', 'containeryard', 11, 12, { task: 's1:containeryard' }), B('cy2', 'containeryard', 15, 12, { task: 's1:containeryard' })],
      containers: [C('container-1', 'yard'), C('container-2', 'yard', { contractId: 'contract-8', arrivedAt: 510, waitReason: 'Kein freies Dock' }), C('container-3', 'empty', { arrivedAt: 520, freeUntil: 600, unloaded: 20, split: [{ owner: 'order-1', target: 20, done: 20 }], emptyAt: 650, pickupAt: 850, pickupArrival: 'arrival-5', demurrageMinutes: 120 }),
        C('container-4', 'unstuffing', { contractId: 'contract-8', dock: 'd1', unloaded: 6, split: [{ owner: 'order-1', target: 20, done: 6 }], statusAt: 700 }), C('container-9', 'arriving', { arrivedAt: null, freeUntil: null, arrivalId: 'arrival-9' })],
      yard: [{ id: 'arrival-9', kind: 'container', pickup: false, site: 's1', contractId: 'contract-7', orderIds: ['order-1'], carrier: 'Nordkai Containerdienst', plate: 'KRM-CA 2210', parcels: 20, containers: 1, containerIds: ['container-9'], phase: 'drop', phaseStart: 719, phaseEnd: 721, eta: 705, dock: null, waitReason: null, waitSince: null, unloaded: 0, atRisk: false, forecast: null, gateAt: 706, priority: false, split: [] }],
      orders: [{ id: 'order-1', item: 'pallet', qty: 100 }], batches: [{ id: 'p1', item: 'pallet', site: 's1', qty: 6, location: 'stock', owner: 'order-1' }],
      workers: [{ id: 'w1', site: 's1', role: 'warehouse', task: 'container-4:warehouse' }], jobs: [], research: [], vehicles: [], shipments: [], transfers: [], tours: [], freights: [], returns: [] };
    const before = JSON.stringify(state), r = {};
    const s = new Scene3D(canvas, {}); s.setState(state); s.setView('site'); s.setTheme('day'); s.setLabels('all');
    let clock = 720.1; s.setClock(clock);
    s.goal.tx = 10; s.goal.tz = 15.5; s.goal.dist = 21; s.goal.yaw = Math.PI / 5; s.cam = { ...s.goal }; s.applyCamera(); s.needs = true;
    await sleep(1500);
    const chips = () => [...host.querySelectorAll('.scene3d-chip')].filter(c => c.style.display !== 'none').map(c => c.textContent);
    r.counts = { cont: s.inst.cont.count, door: s.inst.cdoor.count, mark: s.inst.cmark.count, chassis: s.inst.cchassis.count, cab: s.inst.fcab.count, trailer: s.inst.ftrailer.count };
    r.chips = chips(); r.info = s.renderInfo();
    const chassis = s.yardFleet.find(p => p.id === 'arrival-9'), dockC = s.dockConts.find(p => p.id === 'container-4');
    r.chassis = chassis && { loaded: chassis.loaded, x: +chassis.x.toFixed(2), z: +chassis.z.toFixed(2), label: chassis.label };
    r.dockC = dockC && { x: +dockC.x.toFixed(2), dock: dockC.dock, label: dockC.label };
    r.slots = [...s.contSlots.entries()].map(([id, x]) => `${id}:${x.b.id}:${x.lane}/${x.level}`);
    const f0 = `${s.forks[0].x.toFixed(2)},${s.forks[0].z.toFixed(2)}`; clock += .3; s.setClock(clock);
    let f1 = f0; for (let i = 0; i < 40 && f1 === f0; i++) { await sleep(100); f1 = `${s.forks[0].x.toFixed(2)},${s.forks[0].z.toFixed(2)}`; }
    r.forkMoved = f0 !== f1; r.forkCarry = s.forks[0].carry;
    window.__cyard = { s, host, state, chips, before };
    return r;
  });
  await page.screenshot({ path: path.join(root, 'docs/assets/containerhof-0.13.png') });
  const cyard2 = await page.evaluate(async () => {
    const { s, host, state, chips, before } = window.__cyard, sleep = ms => new Promise(r => setTimeout(r, ms)), r = {};
    // Auswahl per Klick auf den gestapelten Container (Label nur bei Auswahl).
    const sel = []; s.callbacks.onSelect = id => sel.push(id);
    const c3 = s.contLabels.find(c => c.id === 'container-3'), rc = s.canvas.getBoundingClientRect();
    const { Vector3 } = await import('./vendor/three.module.min.js'); const v = new Vector3(c3.x, c3.y - .55, c3.z).project(s.camera());
    const px = (v.x + 1) / 2 * s.width, py = (1 - v.y) / 2 * s.height; s.click({ x: px, y: py }); await sleep(900);
    r.selected = sel.at(-1); r.chipsSel = chips();
    // Umfuhr: Container fährt vom Hof zum Dock (toDock, 3 Min.), Pose wandert mit der Uhr.
    const st = JSON.parse(before); Object.assign(st.containers[3], { status: 'toDock', unloaded: 0, split: [{ owner: 'order-1', target: 20, done: 0 }], statusAt: 720, moveEnd: 723 }); st.batches = [];
    s.setState(st); s.setClock(720.2); await sleep(900); const p0 = s.dockConts[0] && { x: s.dockConts[0].x, z: s.dockConts[0].z };
    s.setClock(721.6); await sleep(900); const p1 = s.dockConts[0] && { x: s.dockConts[0].x, z: s.dockConts[0].z };
    r.moved = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.z - p0.z) : 0;
    // Nacht: gleiche Szene ohne Fehler, Lichtfläche über dem Containerhof.
    s.setState(JSON.parse(before)); s.setTheme('night'); s.setClock(720.3); await sleep(900); r.night = s.theme().key; r.infoNight = s.renderInfo();
    r.unchanged = JSON.stringify(state) === before;
    s.destroy(); host.remove(); return r;
  });
  report.containerhof = { ...cyard, ...cyard2 };
  check('W3b Containerhof: 3 Container im Hof + Chassis-Ladung + Container am Dock (5), offene Tür (1), Lagergeld-Markierung (1), 2 Chassis', cyard.counts.cont === 5 && cyard.counts.door === 1 && cyard.counts.mark === 1 && cyard.counts.chassis === 2 && cyard.counts.cab === 2 && cyard.counts.trailer === 0, JSON.stringify(cyard.counts));
  check('W3b Containerhof: Stapelung max. 2 hoch, Boden zuerst', cyard.slots.length === 3 && cyard.slots.filter(x => x.endsWith('/1')).length === 1 && cyard.slots.every(x => /\/[01]$/.test(x)), cyard.slots.join(' '));
  check('W3b Labels: „Containerhof · 4/4 Plätze“ und „1/4“, Chassis „KRM-CA 2210 · Abstellen“', cyard.chips.includes('Containerhof · 4/4 Plätze') && cyard.chips.includes('Containerhof · 1/4 Plätze') && cyard.chips.includes('KRM-CA 2210 · Abstellen'), cyard.chips.join(' | '));
  check('W3b Chassis in drop beladen am Containerhof, Container am Dock d1, Stapler pendelt (Ware Dock → Regal)', cyard.chassis?.loaded && cyard.chassis.z > 16 && cyard.dockC?.dock === 'd1' && cyard.forkMoved && cyard.forkCarry === 'out', JSON.stringify({ c: cyard.chassis, d: cyard.dockC, f: cyard.forkMoved, carry: cyard.forkCarry }));
  check('W3b Auswahl: Klick auf Container zeigt Container-Label (nur bei Auswahl)', cyard2.selected === 'container-3' && cyard2.chipsSel.some(c => c.startsWith('CTR-3 · Leer · wartet auf Abholung · Lagergeld 2 Std.')) && !cyard.chips.some(c => c.startsWith('CTR-')), JSON.stringify({ sel: cyard2.selected, chips: cyard2.chipsSel }));
  check('W3b Umfuhr: Container fährt mit der Uhr vom Hof zum Dock', cyard2.moved > .5, String(cyard2.moved));
  check('W3b: unter 150 Draw Calls (Tag und Nacht)', cyard.info.drawCalls < 150 && cyard2.infoNight.drawCalls < 150 && cyard2.night === 'night', `${cyard.info.drawCalls}/${cyard2.infoNight.drawCalls}`);
  check('W3b: Spielzustand unverändert', cyard2.unchanged);
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
