// Messanzeige für 60-FPS-Prüfung auf dem eigenen Gerät (A12, W1c). Aktiv nur mit URL-Parameter ?perf=1.
// Ohne Parameter liefert startPerfOverlay() null: kein Observer, kein requestAnimationFrame, kein DOM, kein Frame-Code.
// Keine Netzwerkzugriffe, kein Spielzustand: misst nur, bucht weder Ware noch Geld.

export const FRAME_BUDGET_MS = 16.7;
// rAF-Abstände bei 60 Hz streuen um 16,6–16,8 ms (VSync-Rauschen). Bewertung toleriert 0,5 ms; Rohwert > 16,7 ms bleibt sichtbar.
export const JITTER_MS = 0.5;
export const WINDOW_MS = 10000;
export const MEASURE_MS = 60000;

/** true, wenn der URL-Suchteil perf=1 (oder perf=true/ja) enthält. */
export function perfEnabled(search = '') {
  try { const v = new URLSearchParams(search || '').get('perf'); return v === '1' || v === 'true' || v === 'ja'; } catch { return false; }
}
/** Quantil (nächstliegender Rang) einer aufsteigend sortierten Liste; leer → null. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}
/** Kennzahlen aus Frame-Abständen (ms). fps aus Fensterlänge, sonst aus Summe der Abstände. */
export function frameStats(deltas, windowMs = 0, budget = FRAME_BUDGET_MS, jitter = JITTER_MS) {
  const v = [...deltas].sort((a, b) => a - b), n = v.length, sum = v.reduce((a, b) => a + b, 0);
  const share = limit => n ? v.filter(d => d > limit).length / n : 0;
  return {
    frames: n, fps: n ? n / ((windowMs || sum) / 1000) : 0,
    medianMs: quantile(v, .5), p95Ms: quantile(v, .95), p99Ms: quantile(v, .99), maxMs: n ? v[n - 1] : null,
    overBudget: share(budget), overBudgetTol: share(budget + jitter), over20: share(20), over33: share(33.4)
  };
}
/** FPS gleitend über windowMs: Anzahl Frame-Zeitstempel im Fenster (now-windowMs, now]. */
export function rollingFps(stamps, now, windowMs = 1000) {
  let n = 0; for (let i = stamps.length - 1; i >= 0 && stamps[i] > now - windowMs; i--) n++;
  return n * 1000 / windowMs;
}
/** Entfernt Einträge älter als cutoff aus einem nach Zeit sortierten Feld paralleler Listen (in place). */
export function trimBefore(times, cutoff, ...lists) {
  let i = 0; while (i < times.length && times[i] <= cutoff) i++;
  if (i) { times.splice(0, i); for (const l of lists) l.splice(0, i); }
  return i;
}
/** Long Tasks [{ms}] → {count,totalMs,maxMs}. */
export function longTaskSummary(tasks) {
  let total = 0, max = 0; for (const t of tasks) { total += t.ms; if (t.ms > max) max = t.ms; }
  return { count: tasks.length, totalMs: total, maxMs: max };
}
/** Bewertung nach Ziel: p95 ≤ 16,7 ms und < 5 % Frames darüber (je mit VSync-Toleranz). */
export function assess(stats, budget = FRAME_BUDGET_MS, jitter = JITTER_MS) {
  if (!stats.frames) return { ok: false, text: 'Keine Frames gemessen' };
  const p95ok = stats.p95Ms <= budget + jitter, shareOk = stats.overBudgetTol < .05;
  return { ok: p95ok && shareOk, p95ok, shareOk, text: p95ok && shareOk ? 'Ziel erreicht (60 FPS stabil)' : 'Ziel verfehlt' + (!p95ok ? ' · p95 zu hoch' : '') + (!shareOk ? ' · zu viele langsame Frames' : '') };
}
const n1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = v => v == null ? '—' : (Math.round(v * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = v => n1(v * 100) + ' %';
export const speedLabel = s => s ? s + '×' : 'Pause';
const VIEW = { hall: 'Halle', site: 'Gelände', network: 'Netzwerk', flat: 'Grundriss' };
const QUALITY_NAME = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };
/** Grafikqualität aus renderInfo (0.15-S4): „Mittel (automatisch)“ bzw. „Hoch“; ohne Angabe null. */
export function qualityLabel(ri) { if (!ri?.quality) return null; const n = QUALITY_NAME[ri.quality] || ri.quality; return ri.qualityMode === 'auto' ? `${n} (automatisch)` : n; }

/** Ergebnistext der 60-s-Messung (zum Kopieren). r: {stats,longTasks,sim,meta,render,hidden,seconds}. */
export function formatReport(r) {
  const s = r.stats, a = assess(s), lt = r.longTasks, m = r.meta || {}, ri = r.render;
  const lines = [
    'Industrie & Logistik – 60-s-Messung',
    `Ergebnis: ${a.text}${r.hidden ? ' · UNGÜLTIG (Tab war im Hintergrund)' : ''}`,
    `Dauer: ${n1(r.seconds)} s · Frames: ${s.frames} · FPS Ø: ${n1(s.fps)}`,
    `Frame-Zeit Median/p95/p99/max: ${n2(s.medianMs)} / ${n2(s.p95Ms)} / ${n2(s.p99Ms)} / ${n1(s.maxMs)} ms`,
    `Frames > 16,7 ms: ${pct(s.overBudget)} (mit 0,5 ms Toleranz: ${pct(s.overBudgetTol)}) · > 20 ms: ${pct(s.over20)} · > 33,4 ms: ${pct(s.over33)}`,
    `Long Tasks: ${lt ? `${lt.count} · Summe ${Math.round(lt.totalMs)} ms · längste ${Math.round(lt.maxMs)} ms` : 'nicht verfügbar (Browser)'}`,
    `Sim-Zeit: Ø ${n2(r.sim.perFrame)} ms je Frame · ${r.sim.steps} Schritte · max ${n2(r.sim.maxMs)} ms je Schritt`,
    `Darstellung: ${ri ? `${ri.drawCalls} Draw Calls · ${ri.triangles.toLocaleString('de-DE')} Dreiecke · Pixelratio ${n2(ri.pixelRatio)}${qualityLabel(ri) ? ` · Grafikqualität ${qualityLabel(ri)}` : ''}` : 'Canvas 2D'}`,
    `Renderer: ${m.renderer || '—'}`,
    `Einstellung: Geschwindigkeit ${m.speed || '—'} · Ansicht ${m.view || '—'} · Fenster ${m.viewport || '—'} · devicePixelRatio ${m.dpr ?? '—'}`,
    `Version: ${m.version || '—'} · Zeit: ${m.date || '—'}`,
    `Browser: ${m.ua || '—'}`
  ];
  return lines.join('\n');
}

/** WebGL-Version und GPU-Bezeichnung des Szenen-Renderers (ohne eigenen Kontext, wenn möglich). */
export function rendererInfo(scene, doc = globalThis.document) {
  try {
    let gl = scene?.renderer?.getContext?.();
    if (!gl) return 'Canvas 2D';
    const v2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${v2 ? 'WebGL 2' : 'WebGL 1'} · ${gpu || 'unbekannt'}`;
  } catch { return 'unbekannt'; }
}

const CSS = `#perfOverlay{position:fixed;top:calc(var(--hdr,56px) + 8px);right:calc(var(--tools,60px) + 8px);z-index:60;width:290px;max-width:calc(100vw - 24px);padding:8px 10px;border-radius:8px;background:rgba(18,30,28,.88);color:#e8f2ee;font:11px/1.45 ui-monospace,Consolas,monospace;box-shadow:0 4px 16px rgba(0,0,0,.25)}
#perfOverlay b{color:#9fe3c8;font-weight:600}#perfOverlay .row{display:flex;justify-content:space-between;gap:8px}#perfOverlay .row span:last-child{text-align:right}
#perfOverlay .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-weight:700;letter-spacing:.04em}
#perfOverlay button{font:inherit;color:#10201c;background:#9fe3c8;border:0;border-radius:4px;padding:3px 8px;cursor:pointer;margin-top:6px}#perfOverlay button:disabled{opacity:.6;cursor:default}
#perfOverlay .x{background:transparent;color:#e8f2ee;margin:0;padding:0 4px}#perfOverlay .gpu{opacity:.8;word-break:break-word;margin-top:2px}
#perfOverlay pre{white-space:pre-wrap;margin:6px 0 0;max-height:30vh;overflow:auto;background:rgba(255,255,255,.06);padding:6px;border-radius:4px}
#perfOverlay textarea{width:100%;height:120px;margin-top:6px;font:inherit}#perfOverlay .ok{color:#9fe3c8}#perfOverlay .bad{color:#ffb4a3}`;

/**
 * Startet die Messanzeige, falls ?perf=1. opts: {scene, speed:()=>number, search, doc, win}.
 * Rückgabe null (inaktiv) oder {sim(ms,steps), stop(), snapshot(), measure(ms)}.
 */
export function startPerfOverlay(opts = {}) {
  const win = opts.win || globalThis.window, doc = opts.doc || globalThis.document;
  const search = opts.search ?? globalThis.location?.search;
  if (!perfEnabled(search) || !win?.requestAnimationFrame || !doc?.createElement) return null;
  const scene = opts.scene, getSpeed = opts.speed || (() => null), now = () => performance.now();

  // Ringpuffer letzte 10 s: Zeitstempel + Abstände; Sim-Zeit je Schritt mit Zeitstempel; Long Tasks.
  const times = [], deltas = [], simTimes = [], simMs = [], ltTimes = [], ltMs = [];
  let last = 0, rafId = 0, timer = 0, run = null, lastReport = null, observer = null, longTaskOk = false, stopped = false;
  try {
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver(list => { for (const e of list.getEntries()) { ltTimes.push(e.startTime + e.duration); ltMs.push(e.duration); if (run) run.longtasks.push({ ms: e.duration }); } });
      observer.observe({ type: 'longtask' }); longTaskOk = true;
    }
  } catch { observer = null; longTaskOk = false; }

  const frame = t => {
    if (stopped) return; rafId = win.requestAnimationFrame(frame);
    if (last && !doc.hidden) { const d = t - last; times.push(t); deltas.push(d); if (run) run.deltas.push(d); }
    last = t;
  };
  rafId = win.requestAnimationFrame(frame);
  const onVis = () => { last = 0; if (doc.hidden && run) run.hidden = true; };
  doc.addEventListener('visibilitychange', onVis);

  // ----- DOM -----
  const style = doc.createElement('style'); style.id = 'perfOverlayStyle'; style.textContent = CSS; doc.head.appendChild(style);
  const box = doc.createElement('div'); box.id = 'perfOverlay'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Leistungsmessung');
  box.innerHTML = `<div class="head"><span>LEISTUNG · ?perf=1</span><button class="x" data-perf="hide" title="Messanzeige ausblenden" aria-label="Messanzeige ausblenden">×</button></div><div data-perf="live"></div><div class="gpu" data-perf="gpu"></div><button data-perf="measure">60-s-Messung</button><div data-perf="result" role="status"></div>`;
  doc.body.appendChild(box);
  const live = box.querySelector('[data-perf="live"]'), gpuEl = box.querySelector('[data-perf="gpu"]'), btn = box.querySelector('[data-perf="measure"]'), out = box.querySelector('[data-perf="result"]');
  const renderer = rendererInfo(scene, doc); gpuEl.textContent = 'Renderer: ' + renderer;
  const renderInfo = () => { try { return scene?.renderInfo?.() || null; } catch { return null; } };
  const row = (k, v, cls = '') => `<div class="row"><span>${k}</span><span${cls ? ` class="${cls}"` : ''}>${v}</span></div>`;

  function snapshot() {
    const t = now(); trimBefore(times, t - WINDOW_MS, deltas); trimBefore(simTimes, t - WINDOW_MS, simMs); trimBefore(ltTimes, t - WINDOW_MS, ltMs);
    const stats = frameStats(deltas), simSum = simMs.reduce((a, b) => a + b, 0);
    return { fps: rollingFps(times, t, 1000), stats, longTasks: longTaskOk ? { count: ltMs.length, totalMs: ltMs.reduce((a, b) => a + b, 0) } : null,
      simPerFrame: stats.frames ? simSum / stats.frames : 0, render: renderInfo(), speed: getSpeed() };
  }
  function update() {
    const s = snapshot(), st = s.stats, r = s.render;
    live.innerHTML = row('FPS (1 s)', `<b>${n1(s.fps)}</b>`)
      + row('Med/p95/p99', `${n1(st.medianMs)} / ${n1(st.p95Ms)} / ${n1(st.p99Ms)} ms`, st.p95Ms > FRAME_BUDGET_MS + JITTER_MS ? 'bad' : 'ok')
      + row('Frames > 16,7 ms', pct(st.overBudget), st.overBudgetTol >= .05 ? 'bad' : '')
      + row('Long Tasks (10 s)', s.longTasks ? `${s.longTasks.count} · ${Math.round(s.longTasks.totalMs)} ms` : 'n. v.')
      + row('Sim je Frame', n2(s.simPerFrame) + ' ms')
      + (r ? row('Draw Calls / Dreiecke', `${r.drawCalls} / ${r.triangles.toLocaleString('de-DE')}`) + row('Pixelratio', n2(r.pixelRatio)) + (qualityLabel(r) ? row('Grafikqualität', `<b>${qualityLabel(r)}</b>`) : '') : row('Darstellung', 'Canvas 2D'))
      + row('Geschwindigkeit', speedLabel(s.speed));
    if (run) { const left = Math.max(0, Math.ceil((run.end - now()) / 1000)); btn.textContent = `Messung läuft … ${left} s`; if (now() >= run.end) finish(); }
  }
  function measure(ms = MEASURE_MS) {
    if (run) return; out.textContent = '';
    run = { start: now(), end: now() + ms, deltas: [], longtasks: [], simMs: 0, simSteps: 0, simMax: 0, hidden: !!doc.hidden };
    btn.disabled = true; update();
  }
  function finish() {
    const r = run; run = null; btn.disabled = false; btn.textContent = '60-s-Messung';
    const seconds = (now() - r.start) / 1000, stats = frameStats(r.deltas, seconds * 1000);
    const view = scene?.view, version = doc.getElementById?.('appVersion')?.textContent;
    const report = { seconds, stats, hidden: r.hidden, longTasks: longTaskOk ? longTaskSummary(r.longtasks) : null, render: renderInfo(),
      sim: { perFrame: stats.frames ? r.simMs / stats.frames : 0, steps: r.simSteps, maxMs: r.simMax },
      meta: { renderer, speed: speedLabel(getSpeed()), view: VIEW[view] || view || '2D', viewport: `${win.innerWidth}×${win.innerHeight}`, dpr: win.devicePixelRatio, version, date: new Date().toLocaleString('de-DE'), ua: win.navigator?.userAgent } };
    const text = formatReport(report), a = assess(stats);
    lastReport = { ...report, text, ok: a.ok && !r.hidden };
    out.innerHTML = '';
    const pre = doc.createElement('pre'); pre.textContent = text; pre.className = a.ok && !r.hidden ? 'ok' : 'bad';
    const copy = doc.createElement('button'); copy.textContent = 'Kopieren'; copy.dataset.perf = 'copy';
    copy.addEventListener('click', async () => {
      try { await win.navigator.clipboard.writeText(text); copy.textContent = 'Kopiert ✓'; }
      catch { // Rückfall: markiertes Textfeld zum manuellen Kopieren (Strg+C).
        let ta = out.querySelector('textarea'); if (!ta) { ta = doc.createElement('textarea'); ta.readOnly = true; ta.value = text; ta.setAttribute('aria-label', 'Messergebnis zum Kopieren'); out.appendChild(ta); }
        ta.focus(); ta.select(); copy.textContent = 'Text markiert · Strg+C';
      }
    });
    out.append(pre, copy);
  }
  btn.addEventListener('click', () => measure());
  box.querySelector('[data-perf="hide"]').addEventListener('click', () => stop());
  timer = win.setInterval(update, 500); update();

  function stop() {
    stopped = true; win.cancelAnimationFrame(rafId); win.clearInterval(timer); observer?.disconnect();
    doc.removeEventListener('visibilitychange', onVis); box.remove(); style.remove(); run = null;
  }
  const api = {
    /** Sim-Zeit eines sim.step-Aufrufs melden (ms, Anzahl Spielminuten). */
    sim(ms, steps = 1) { simTimes.push(now()); simMs.push(ms); if (run) { run.simMs += ms; run.simSteps += steps; if (ms > run.simMax) run.simMax = ms; } },
    stop, snapshot, measure, finish: () => run && finish(), get report() { return lastReport; }, get running() { return !!run; }
  };
  // Messgriff für Browserprüfung (tests/browser/perf.mjs); nicht aufzählbar, kein Spielzustand.
  Object.defineProperty(win, '__perfOverlay', { value: api, configurable: true });
  return api;
}
