import { Scene } from './scene.js';
import { Scene3D } from './scene3d.js';

// Szenenwahl (S1): WebGL2/WebGL → Scene3D, sonst Canvas-2D-Rückfall. ?renderer=2d|3d erzwingt.

/** Reine Entscheidung ohne DOM. search: URL-Suchteil, webgl: bool. */
export function chooseRenderer(search = '', webgl = false) {
  const forced = new URLSearchParams(search || '').get('renderer');
  if (forced === '2d') return '2d';
  if (forced === '3d') return '3d';
  return webgl ? '3d' : '2d';
}
/** Prüft WebGL mit einer Wegwerf-Leinwand; gibt den Kontext sofort wieder frei. */
export function hasWebGL(doc = globalThis.document) {
  try {
    const c = doc?.createElement?.('canvas'); if (!c?.getContext) return false;
    const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return false;
    gl.getExtension?.('WEBGL_lose_context')?.loseContext(); return true;
  } catch { return false; }
}
/** Erzeugt die passende Szene. Scheitert WebGL beim Aufbau, folgt Canvas 2D auf frischer Leinwand. */
export function createScene(canvas, callbacks = {}) {
  const mode = chooseRenderer(globalThis.location?.search, hasWebGL());
  if (mode === '3d') {
    try { return new Scene3D(canvas, callbacks); }
    catch (e) {
      console.warn('3D-Szene nicht verfügbar, Canvas 2D wird verwendet:', e?.message || e);
      // Eine Leinwand mit WebGL-Kontext liefert keinen 2D-Kontext mehr.
      if (canvas.getContext?.('2d') == null && canvas.cloneNode && canvas.replaceWith) { const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); canvas = fresh; }
    }
  }
  const scene = new Scene(canvas, callbacks); canvas.dataset && (canvas.dataset.renderer = '2d'); return scene;
}
