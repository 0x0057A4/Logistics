// Fenstersystem 0.17 (A10-W): #panel als schwebendes Fenster und gruppierte Hauptnavigation.
// Reine Darstellung: verändert keinen Spielstand. Koordinaten relativ zur Spielfläche #game (ohne Statuszeile).
// Nutzervorgabe 18.10.2026: Referenz ist ein Bildschirm 1920 × 1080; Fenster skalieren mit der Spielfläche.
// Geometrie je Fensterart liegt daher relativ in prefs.windows[panel]={rx,ry,rw,rh,max} (Anteile der Spielfläche, über
// load/save von app.js). Ältere absolute Werte {x,y,w,h} werden beim Lesen einmalig umgerechnet (nur prefs, kein Spielstand).

export const WIN_MIN = { w: 380, h: 260 };
/** Abstand zum Rand der Spielfläche beim Maximieren und für die Startgröße. */
export const WIN_GAP = 8;
/** Referenzbildschirm 1920 × 1080: Spielfläche 1920 × 994 (Kopfzeile 56 px, Statuszeile 30 px). */
export const REF = { w: 1920, h: 994 };
/** Startbreiten als Anteil der Spielflächenbreite (bei 1920 px: 460 / 860 / 1400 px), rechts neben den Kamerawerkzeugen. */
export const START = { normal: 460 / 1920, wide: 860 / 1920, table: 1400 / 1920, right: 60, top: 12, tableTop: 100 };
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const r6 = v => Math.round(v * 1e6) / 1e6;

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

/** Pixelgeometrie → Anteile der Spielfläche {rx,ry,rw,rh}. */
export function toRel(g, area) {
  const aw = Math.max(1, num(area?.w, 1)), ah = Math.max(1, num(area?.h, 1));
  return { rx: r6(num(g?.x, 0) / aw), ry: r6(num(g?.y, 0) / ah), rw: r6(num(g?.w, 0) / aw), rh: r6(num(g?.h, 0) / ah) };
}

/** Anteile → Pixel in der aktuellen Spielfläche. Erzwingt die Mindestgröße ein Wachsen, bleibt die näher am Rand liegende
 * Kante stehen (rechts liegende Fenster wachsen nach links, untere nach oben). Danach Klemmen in den sichtbaren Bereich. */
export function fromRel(rel, area, min = WIN_MIN) {
  const aw = Math.max(1, num(area?.w, 1)), ah = Math.max(1, num(area?.h, 1));
  let x = num(rel?.rx, 0) * aw, y = num(rel?.ry, 0) * ah, w = num(rel?.rw, 0) * aw, h = num(rel?.rh, 0) * ah;
  const minW = Math.min(min.w, aw), minH = Math.min(min.h, ah);
  if (w < minW) { if (x + w / 2 > aw / 2) x -= minW - w; w = minW; }
  if (h < minH) { if (y + h / 2 > ah / 2) y -= minH - h; h = minH; }
  return clampGeom({ x, y, w, h }, area, min);
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Startlage weicht HUD-Flächen (Kennzahlen, Ansichtsumschalter, Standortfluss, Leiste) aus: je Fläche nach unten oder nach
 * rechts schieben, je nachdem, was mehr Fensterfläche erhält; Mindestgröße bleibt. */
export function avoidRects(g, avoid = [], min = WIN_MIN) {
  let r = { ...g };
  for (let pass = 0; pass < 2; pass++) for (const a of avoid) {
    if (!a || !(a.w > 0 && a.h > 0) || !overlaps(r, a)) continue;
    const bottom = r.y + r.h, right = r.x + r.w;
    const down = { x: r.x, y: Math.ceil(a.y + a.h + WIN_GAP), w: r.w, h: 0 }; down.h = bottom - down.y;
    const side = { x: Math.ceil(a.x + a.w + WIN_GAP), y: r.y, w: 0, h: r.h }; side.w = right - side.x;
    const okD = down.h >= min.h, okS = side.w >= min.w;
    if (a.y > r.y + r.h / 2) { const up = { ...r, h: Math.floor(a.y - WIN_GAP - r.y) }; if (up.h >= min.h) { r = up; continue; } }
    if (okD && (!okS || down.w * down.h >= side.w * side.h)) r = down; else if (okS) r = side;
  }
  return r;
}

/** Startlage auf 1920 × 1080 ausgelegt (Anteile der Breite): rechts neben den Kamerawerkzeugen, volle Höhe;
 * breite Fensterarten breiter; Tabellen (Lager, Aufträge, Board) noch breiter, beginnen aber unterhalb der Kennzahlen.
 * avoid: HUD-Flächen in Spielflächenkoordinaten, die die Startlage nicht verdecken darf. */
export function defaultGeom(area, { wide = false, table = false, minW = 0 } = {}, avoid = []) {
  const aw = num(area?.w, REF.w), ah = num(area?.h, REF.h);
  const frac = table ? START.table : wide ? START.wide : START.normal;
  // QS-017-07: Inhaltsbreite der Fensterart (Pixel) als Untergrenze, damit Tabellen auf kleineren Bildschirmen nicht waagerecht
  // überlaufen; höchstens bis zur Spielfläche ohne Bereichsleiste (START.right links wie rechts).
  const w = Math.max(WIN_MIN.w, Math.round(aw * frac), Math.min(Math.round(num(minW, 0)), aw - 2 * START.right - 30)), top = table ? START.tableTop : START.top;
  const g = clampGeom({ x: aw - START.right - w, y: top, w, h: ah - top - WIN_GAP }, area);
  // Ausweichen nach rechts nur, solange die Inhaltsbreite (minW) erhalten bleibt; sonst unterhalb der HUD-Fläche beginnen.
  const need = Math.min(g.w, Math.max(WIN_MIN.w, Math.round(num(minW, 0))));
  return clampGeom(avoidRects(g, avoid, { w: need, h: WIN_MIN.h }), area);
}

/** QS-017-06: Fenster endet oberhalb der Fläche a (Baumenü am unteren Rand), sofern es sie überdeckt. Reicht der Platz über a
 * nicht für die Mindesthöhe, rückt das Fenster nach oben (höchstens bis zum oberen Rand). Nur Anzeige, wird nicht gespeichert. */
export function aboveRect(g, a, min = WIN_MIN) {
  if (!a || !(a.w > 0 && a.h > 0) || !overlaps(g, a)) return g;
  const limit = Math.max(0, Math.floor(a.y - WIN_GAP));
  if (limit - g.y >= Math.min(min.h, limit)) return { ...g, h: Math.min(g.h, limit - g.y) };
  const h = Math.max(Math.min(min.h, limit), Math.min(g.h, limit));
  return { ...g, y: Math.max(0, limit - h), h };
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

/** Geometrie aus den Einstellungen lesen → {rx,ry,rw,rh,max,migrated} oder null (beschädigt → Startlage).
 * Relative Werte werden geprüft (Anteile 0…1, Breite/Höhe > 0). Alte absolute Werte {x,y,w,h} rechnet area einmalig
 * in Anteile um (migrated:true, app.js speichert das Ergebnis); ohne area bleiben sie unlesbar. */
export function readGeom(raw, area = null) {
  if (!raw || typeof raw !== 'object') return null;
  const max = raw.max === true;
  if ('rx' in raw || 'rw' in raw) {
    const r = { rx: Number(raw.rx), ry: Number(raw.ry), rw: Number(raw.rw), rh: Number(raw.rh) };
    if (!Object.values(r).every(Number.isFinite) || r.rw <= 0 || r.rh <= 0 || r.rw > 1.01 || r.rh > 1.01 || r.rx < -0.01 || r.ry < -0.01 || r.rx > 1 || r.ry > 1) return null;
    return { ...r, max, migrated: false };
  }
  const g = { x: Number(raw.x), y: Number(raw.y), w: Number(raw.w), h: Number(raw.h) };
  if (!Object.values(g).every(Number.isFinite) || g.w <= 0 || g.h <= 0 || !area) return null;
  return { ...toRel(clampGeom(g, area), area), max, migrated: true };
}

const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const ICON_MAX = '<rect x="5" y="5" width="14" height="14" rx="1.5"/>';
const ICON_RESTORE = '<rect x="4.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M8.5 8.5V5.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3"/>';

/**
 * Macht panel (#panel) zu einem schwebenden Fenster in game (#game).
 * load(key) → gespeicherte Geometrie oder null; save(key,{rx,ry,rw,rh,max}) speichert relativ (prefs.windows).
 * Ohne gespeicherte Geometrie gilt die Startlage (defaultGeom), die bei jeder Größenänderung neu berechnet wird und den
 * HUD-Flächen ausweicht. Vom Spieler verschobene/vergrößerte Fenster behalten ihre Anteile und skalieren proportional.
 * Liefert {open(key,{wide,table}), close(), toggleMax(), refit(), state()}.
 */
export const AVOID = ['.kpis', '.view-switch', '#flow', '.rail'];
export function createPanelWindow({ panel, game, load = () => null, save = () => {}, doc = globalThis.document, win = globalThis.window }) {
  // Nur mit echtem DOM (Prüfumgebungen mit DOM-Ersatz behalten das feste Layout).
  if (!panel?.querySelector || !panel.appendChild || !game?.getBoundingClientRect || !doc?.createElement) return null;
  const head = panel.querySelector('.panel-head'), maxBtn = panel.querySelector('#panelMax');
  for (const d of DIRS) { const h = doc.createElement('div'); h.className = 'win-rs win-rs-' + d; h.dataset.dir = d; h.setAttribute('aria-hidden', 'true'); panel.appendChild(h); }
  // rel: gespeicherte Anteile (null = Startlage); geom: Pixel der Wiederherstellungsgröße für die Fläche geomArea.
  let key = '', opts = {}, rel = null, geom = null, geomArea = '', max = false;
  const area = () => {
    const sb = doc.querySelector('.statusbar')?.offsetHeight || 28;
    return { w: game.clientWidth, h: Math.max(1, game.clientHeight - sb) };
  };
  const inset = () => {
    const rail = doc.querySelector('.rail'), gr = game.getBoundingClientRect();
    if (!rail || rail.offsetParent === null) return { left: WIN_GAP };
    return { left: Math.round(rail.getBoundingClientRect().right - gr.left + WIN_GAP) };
  };
  const avoid = () => {
    const gr = game.getBoundingClientRect(), out = [];
    for (const sel of AVOID) {
      const e = doc.querySelector(sel); if (!e || e.offsetParent === null || e.hidden) continue;
      const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) out.push({ x: r.left - gr.left, y: r.top - gr.top, w: r.width, h: r.height });
    }
    return out;
  };
  /** Baumenü (#buildTray) in Spielflächenkoordinaten, solange es sichtbar ist (sonst null). */
  const tray = () => {
    const t = doc.querySelector('#buildTray'); if (!t || t.hidden || t.offsetParent === null) return null;
    const r = t.getBoundingClientRect(), gr = game.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left - gr.left, y: r.top - gr.top, w: r.width, h: r.height } : null;
  };
  /** Wiederherstellungsgröße für die aktuelle Fläche: Startlage stets neu, eigene Lage aus Anteilen (nur bei Flächenwechsel). */
  function sync() {
    const a = area(), ak = a.w + 'x' + a.h;
    if (!rel) { geom = defaultGeom(a, opts, avoid()); geomArea = ak; }
    else if (ak !== geomArea || !geom) { geom = fromRel(rel, a); geomArea = ak; }
    return a;
  }
  // Baumenü und Fenster verdecken sich nicht: bei offenem Baumenü endet das Fenster darüber (auch maximiert/eigene Lage).
  const shown = () => { const a = sync(), g = max ? maxGeom(a, inset()) : clampGeom(geom, a), t = tray(); return t ? aboveRect(g, t) : g; };
  function reserve(r) {
    // Fahrzeugleiste/Hinweise rechts nur dann einrücken, wenn das Fenster rechts unten über ihnen liegt.
    const body = doc.body, a = area(); if (!body?.style?.setProperty) return;
    if (panel.hidden || max) { body.style.removeProperty('--pw-open'); body.classList?.remove('pw-over-mission'); if (!panel.hidden) body.style.setProperty('--pw-open', '0px'); return; }
    const cs = getComputedStyle(body), px = n => parseFloat(cs.getPropertyValue(n));
    const vbar = px('--vbar-h') || 176, left = px('--left') || 90, flowW = px('--flow-w') || 252, tools = px('--tools') || 60;
    const overBottom = r.y + r.h > a.h - vbar - 16, rightSide = r.x + r.w / 2 > a.w / 2;
    const open = overBottom && rightSide ? Math.max(0, a.w - r.x - tools + 10) : 0;
    body.style.setProperty('--pw-open', open + 'px');
    // Einstiegskarte (#mission) nur zeigen, wenn neben dem Fenster noch sinnvoll Platz bleibt (statt sie zu quetschen).
    body.classList?.toggle('pw-over-mission', open > 0 && a.w - left - flowW - tools - open - 24 < 340);
  }
  function apply() {
    if (!key) return;
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
  /** Aktuelle Wiederherstellungsgröße als Anteile übernehmen und speichern. */
  const persist = () => { if (!key || !geom) return; const a = area(); rel = toRel(clampGeom(geom, a), a); geomArea = a.w + 'x' + a.h; save(key, { ...rel, max }); };
  function open(k, o = {}) {
    key = String(k || ''); opts = { wide: !!o.wide, table: !!o.table, minW: Number(o.minW) || 0 };
    const a = area(), stored = readGeom(load(key), a);
    rel = stored ? { rx: stored.rx, ry: stored.ry, rw: stored.rw, rh: stored.rh } : null; geom = null; geomArea = '';
    max = !!stored?.max;
    // Einmalige Umrechnung alter absoluter Werte: sofort relativ speichern.
    if (stored?.migrated) save(key, { ...rel, max });
    apply();
  }
  function close() { panel.classList.remove('maximized'); doc.body?.style?.removeProperty?.('--pw-open'); doc.body?.classList?.remove('pw-over-mission'); }
  function toggleMax() { if (!key) return; sync(); max = !max; persist(); apply(); }

  // Ziehen (Titelleiste) und Größe ändern (Ränder/Ecken) mit Zeigererfassung; die Szene erhält diese Ereignisse nicht.
  let op = null;
  const local = e => { const gr = game.getBoundingClientRect(); return { x: e.clientX - gr.left, y: e.clientY - gr.top }; };
  function begin(e, kind, dir = '') {
    if (e.button !== 0 || !key) return;
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
      // Ab jetzt eigene Lage: Startlage nicht mehr neu berechnen (Anteile werden beim Loslassen gespeichert).
      if (!rel) { const a = sync(); rel = toRel(geom, a); }
      if (op.fromMax) {
        // Ziehen aus dem maximierten Zustand: wiederherstellen, Fenster bleibt unter dem Zeiger.
        const fx = (op.p.x - op.start.x) / op.start.w;
        max = false; sync(); geom = clampGeom({ ...geom, x: op.p.x - geom.w * fx, y: op.p.y - 16 }, area()); op.start = { ...geom }; apply();
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
  // Nach Größenänderung der Ansicht: Startlage neu, eigene Lage proportional aus den Anteilen; stets im sichtbaren Bereich.
  const refit = () => { if (!panel.hidden && key) apply(); };
  win?.addEventListener?.('resize', refit);
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(refit); ro.observe(game); const t = doc.querySelector('#buildTray'); if (t) ro.observe(t); }
  return { open, close, toggleMax, refit, state: () => ({ key, max, rel: rel && { ...rel }, custom: !!rel, geom: geom && { ...geom }, shown: key ? shown() : null }) };
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
