// Fenstersystem 0.17 (A10-W): #panel als schwebendes Fenster und gruppierte Hauptnavigation.
// Reine Darstellung: verändert keinen Spielstand. Geometrie je Fensterart liegt in prefs.windows[panel]={x,y,w,h,max}
// (über load/save von app.js, also im vorhandenen Einstellungssystem). Koordinaten relativ zur Spielfläche #game.

export const WIN_MIN = { w: 380, h: 260 };
/** Abstand zum Rand der Spielfläche beim Maximieren und für die Startgröße. */
export const WIN_GAP = 8;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

/** Fenster vollständig in den sichtbaren Bereich {w,h} klemmen, Mindestgröße einhalten (höchstens Bereichsgröße). */
export function clampGeom(g, area, min = WIN_MIN) {
  const aw = Math.max(1, Math.floor(num(area?.w, 1))), ah = Math.max(1, Math.floor(num(area?.h, 1)));
  const minW = Math.min(min.w, aw), minH = Math.min(min.h, ah);
  const w = Math.round(Math.max(minW, Math.min(aw, num(g?.w, minW))));
  const h = Math.round(Math.max(minH, Math.min(ah, num(g?.h, minH))));
  const x = Math.round(Math.max(0, Math.min(aw - w, num(g?.x, aw - w))));
  const y = Math.round(Math.max(0, Math.min(ah - h, num(g?.y, 0))));
  return { x, y, w, h };
}

/** Startgröße wie bisher: rechts neben der Werkzeugleiste, volle Höhe; breite Fensterarten (Tabellen) breiter. */
export function defaultGeom(area, { wide = false, table = false, right = 60, top = 12 } = {}) {
  const aw = num(area?.w, 1280), ah = num(area?.h, 700);
  // table: große Tabellen (Lager, Aufträge, Board) starten rechts neben dem Standortfluss (bis 1100 px), liegen also über den Kennzahlen.
  const w = table ? Math.max(440, Math.min(1100, aw - right - 360)) : wide ? Math.max(440, Math.min(860, aw - 680)) : Math.max(380, Math.min(460, aw - 420));
  return clampGeom({ x: aw - right - w, y: top, w, h: ah - top - WIN_GAP }, area);
}

/** Maximiert: gesamte Spielfläche ohne Bereichsleiste links (inset.left) mit kleinem Rand. */
export function maxGeom(area, inset = {}) {
  const left = Math.max(WIN_GAP, num(inset.left, WIN_GAP));
  return clampGeom({ x: left, y: WIN_GAP, w: num(area?.w, 1) - left - WIN_GAP, h: num(area?.h, 1) - 2 * WIN_GAP }, area);
}

/** Größenänderung an Rand/Ecke dir (n,s,e,w,ne,nw,se,sw): gegenüberliegende Kante bleibt fest. */
export function resizeGeom(start, dir, dx, dy, area, min = WIN_MIN) {
  const aw = num(area?.w, 1), ah = num(area?.h, 1), minW = Math.min(min.w, aw), minH = Math.min(min.h, ah);
  let { x, y, w, h } = start; const r = x + w, b = y + h;
  if (dir.includes('e')) w = Math.max(minW, Math.min(aw - x, w + dx));
  if (dir.includes('s')) h = Math.max(minH, Math.min(ah - y, h + dy));
  if (dir.includes('w')) { x = Math.max(0, Math.min(r - minW, x + dx)); w = r - x; }
  if (dir.includes('n')) { y = Math.max(0, Math.min(b - minH, y + dy)); h = b - y; }
  return clampGeom({ x, y, w, h }, area, min);
}

/** Geometrie aus den Einstellungen prüfen (beschädigte Werte → null, dann Startgröße). */
export function readGeom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const g = { x: Number(raw.x), y: Number(raw.y), w: Number(raw.w), h: Number(raw.h) };
  if (!Object.values(g).every(Number.isFinite) || g.w <= 0 || g.h <= 0) return null;
  return { ...g, max: raw.max === true };
}

const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const ICON_MAX = '<rect x="5" y="5" width="14" height="14" rx="1.5"/>';
const ICON_RESTORE = '<rect x="4.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M8.5 8.5V5.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3"/>';

/**
 * Macht panel (#panel) zu einem schwebenden Fenster in game (#game).
 * load(key) → gespeicherte Geometrie oder null; save(key,{x,y,w,h,max}) speichert (prefs.windows).
 * Liefert {open(key,{wide}), close(), toggleMax(), state()}.
 */
export function createPanelWindow({ panel, game, load = () => null, save = () => {}, doc = globalThis.document, win = globalThis.window }) {
  // Nur mit echtem DOM (Prüfumgebungen mit DOM-Ersatz behalten das feste Layout).
  if (!panel?.querySelector || !panel.appendChild || !game?.getBoundingClientRect || !doc?.createElement) return null;
  const head = panel.querySelector('.panel-head'), maxBtn = panel.querySelector('#panelMax');
  for (const d of DIRS) { const h = doc.createElement('div'); h.className = 'win-rs win-rs-' + d; h.dataset.dir = d; h.setAttribute('aria-hidden', 'true'); panel.appendChild(h); }
  let key = '', wide = false, table = false, geom = null, max = false;
  const area = () => {
    const sb = doc.querySelector('.statusbar')?.offsetHeight || 28;
    return { w: game.clientWidth, h: Math.max(1, game.clientHeight - sb) };
  };
  const inset = () => {
    const rail = doc.querySelector('.rail'), gr = game.getBoundingClientRect();
    if (!rail || rail.offsetParent === null) return { left: WIN_GAP };
    return { left: Math.round(rail.getBoundingClientRect().right - gr.left + WIN_GAP) };
  };
  const shown = () => (max ? maxGeom(area(), inset()) : clampGeom(geom, area()));
  function reserve(r) {
    // Fahrzeugleiste/Hinweise rechts nur dann einrücken, wenn das Fenster rechts unten über ihnen liegt.
    const body = doc.body, a = area(); if (!body?.style?.setProperty) return;
    if (panel.hidden || max) { body.style.removeProperty('--pw-open'); if (!panel.hidden) body.style.setProperty('--pw-open', '0px'); return; }
    const vbar = parseFloat(getComputedStyle(body).getPropertyValue('--vbar-h')) || 176;
    const overBottom = r.y + r.h > a.h - vbar - 16, rightSide = r.x + r.w / 2 > a.w / 2;
    body.style.setProperty('--pw-open', overBottom && rightSide ? Math.max(0, a.w - r.x - 60 + 10) + 'px' : '0px');
  }
  function apply() {
    if (!geom) return;
    const r = shown(), s = panel.style;
    s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px'; s.right = 'auto'; s.bottom = 'auto';
    panel.classList.toggle('maximized', max);
    // Breites Fenster: schmale Bildschirme blenden den Einstiegshinweis aus (bisher Klasse panel-wide je Fensterart).
    doc.body?.classList?.toggle('panel-wide', !panel.hidden && r.w > 560);
    if (maxBtn) {
      maxBtn.setAttribute('aria-pressed', String(max));
      const t = max ? 'Wiederherstellen · Doppelklick auf Titelleiste' : 'Maximieren · Doppelklick auf Titelleiste';
      maxBtn.title = t; maxBtn.setAttribute('aria-label', max ? 'Fenstergröße wiederherstellen' : 'Fenster maximieren');
      const svg = maxBtn.querySelector('svg'); if (svg) svg.innerHTML = max ? ICON_RESTORE : ICON_MAX;
    }
    reserve(r);
  }
  const persist = () => { if (key && geom) save(key, { ...clampGeom(geom, area()), max }); };
  function open(k, opts = {}) {
    key = String(k || ''); wide = !!opts.wide; table = !!opts.table;
    const stored = readGeom(load(key));
    geom = stored ? clampGeom(stored, area()) : defaultGeom(area(), { wide, table });
    max = !!stored?.max; apply();
  }
  function close() { panel.classList.remove('maximized'); doc.body?.style?.removeProperty?.('--pw-open'); }
  function toggleMax() { if (!geom) return; max = !max; apply(); persist(); }

  // Ziehen (Titelleiste) und Größe ändern (Ränder/Ecken) mit Zeigererfassung; die Szene erhält diese Ereignisse nicht.
  let op = null;
  const local = e => { const gr = game.getBoundingClientRect(); return { x: e.clientX - gr.left, y: e.clientY - gr.top }; };
  function begin(e, kind, dir = '') {
    if (e.button !== 0 || !geom) return;
    e.preventDefault(); e.stopPropagation();
    if (max && kind !== 'move') return;
    op = { kind, dir, p: local(e), start: { ...shown() }, id: e.pointerId, target: e.currentTarget, moved: false, fromMax: max };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* synthetische Zeiger */ }
  }
  function move(e) {
    if (!op || e.pointerId !== op.id) return;
    e.stopPropagation();
    const p = local(e);
    if (!op.moved) {
      // Erst ab 4 px Bewegung ziehen: Klick und Doppelklick auf die Titelleiste verändern nichts.
      if (Math.hypot(p.x - op.p.x, p.y - op.p.y) < 4) return;
      op.moved = true; panel.classList.add(op.kind === 'move' ? 'win-moving' : 'win-resizing');
      if (op.fromMax) {
        // Ziehen aus dem maximierten Zustand: wiederherstellen, Fenster bleibt unter dem Zeiger.
        const fx = (op.p.x - op.start.x) / op.start.w;
        max = false; geom = clampGeom({ ...geom, x: op.p.x - geom.w * fx, y: op.p.y - 16 }, area()); op.start = { ...geom }; apply();
      }
    }
    const dx = p.x - op.p.x, dy = p.y - op.p.y;
    geom = op.kind === 'move' ? clampGeom({ ...op.start, x: op.start.x + dx, y: op.start.y + dy }, area()) : resizeGeom(op.start, op.dir, dx, dy, area());
    apply();
  }
  function end(e) {
    if (!op || (e && e.pointerId !== op.id)) return;
    const moved = op.moved;
    try { op.target.releasePointerCapture?.(op.id); } catch { /* bereits freigegeben */ }
    op = null; panel.classList.remove('win-moving', 'win-resizing'); if (moved) persist();
  }
  head?.addEventListener('pointerdown', e => { if (e.target.closest?.('button,input,select,textarea,a')) return; begin(e, 'move'); });
  head?.addEventListener('dblclick', e => { if (e.target.closest?.('button,input,select,textarea,a')) return; toggleMax(); });
  for (const h of panel.querySelectorAll('.win-rs')) h.addEventListener('pointerdown', e => begin(e, 'resize', h.dataset.dir));
  for (const t of [head, ...panel.querySelectorAll('.win-rs')]) if (t) {
    t.addEventListener('pointermove', move); t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end); t.addEventListener('lostpointercapture', end);
  }
  maxBtn?.addEventListener('click', e => { e.preventDefault(); toggleMax(); });
  // Bedienung im Fenster nicht an Szene/Kamera weiterreichen (Mausrad, Ziehen, Doppelklick); Klicks erreichen app.js weiterhin.
  for (const type of ['wheel', 'pointerdown', 'pointermove', 'dblclick']) panel.addEventListener(type, e => e.stopPropagation(), type === 'wheel' ? { passive: true } : undefined);
  // Nach Größenänderung der Ansicht sichtbar halten (nur Anzeige; gespeicherte Geometrie bleibt für größere Ansichten erhalten).
  const refit = () => { if (!panel.hidden && geom) apply(); };
  win?.addEventListener?.('resize', refit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(refit).observe(game);
  return { open, close, toggleMax, refit, state: () => ({ key, max, geom: geom && { ...geom }, shown: geom && shown() }) };
}

/**
 * Gruppenmenü der Bereichsleiste („Mehr“): öffnet/schließt per Klick, Esc oder Klick außerhalb.
 * Die Einträge sind gewöhnliche data-panel-Schalter; app.js öffnet die Fenster wie bisher.
 */
export function initRail({ doc = globalThis.document } = {}) {
  const groups = [...(doc?.querySelectorAll?.('.rail-group') || [])];
  const closeAll = except => { let n = 0; for (const g of groups) if (g !== except) { const b = g.querySelector('.rail-more'), m = g.querySelector('.rail-flyout'); if (m && !m.hidden) { m.hidden = true; b?.setAttribute('aria-expanded', 'false'); n++; } } return n; };
  for (const g of groups) {
    const b = g.querySelector('.rail-more'), m = g.querySelector('.rail-flyout'); if (!b || !m) continue;
    b.addEventListener('click', e => { e.stopPropagation(); const open = m.hidden; closeAll(g); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (open) m.querySelector('button:not([hidden])')?.focus?.({ preventScroll: true }); });
    m.addEventListener('click', e => { if (e.target.closest?.('button')) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } });
    m.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); m.hidden = true; b.setAttribute('aria-expanded', 'false'); b.focus?.(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...m.querySelectorAll('button:not([hidden])')], i = items.indexOf(doc.activeElement);
      e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus?.();
    });
  }
  doc?.addEventListener?.('pointerdown', e => { if (!e.target.closest?.('.rail-group')) closeAll(); }, true);
  // Esc schließt zuerst nur das offene Gruppenmenü (nicht zusätzlich Fenster oder Baumodus).
  doc?.addEventListener?.('keydown', e => { if (e.key !== 'Escape' || e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return; if (closeAll()) e.stopPropagation(); }, true);
  return { closeAll };
}
