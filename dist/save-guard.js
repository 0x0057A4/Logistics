/** Schreibrecht für genau einen lokalen Spielmodus.
 * Web Locks liefern die atomare Sperre. Der Storage-Lease allein wäre wegen
 * fehlendem compare-and-swap NICHT ausreichend; ohne Web Locks nur Lesezugriff.
 * Nach erfolgreichem acquire den gespeicherten Stand erneut laden. Vor jedem
 * synchronen Schreibblock owns(mode) prüfen; kein await zwischen Prüfung/Write.
 * Alte App-Versionen ohne diesen Schutz können nicht koordiniert werden.
 */
export class SaveGuard {
  constructor(options = {}) {
    this.prefix = options.prefix ?? 'industrie-logistik-v1';
    this.locks = options.locks === undefined ? globalThis.navigator?.locks : options.locks;
    this.defaultStorage = options.storage === undefined;
    try { this.storage = options.storage === undefined ? globalThis.localStorage : options.storage; } catch { this.storage = null; }
    this.now = options.now ?? Date.now;
    this.setInterval = options.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
    this.clearInterval = options.clearInterval ?? (id => globalThis.clearInterval(id));
    this.leaseMs = options.leaseMs ?? 15000;
    this.onLost = options.onLost ?? (() => {});
    this.owner = options.owner ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.mode = null;
    this.reason = 'unclaimed';
    this.generation = 0;
    this.disposed = false;
  }
  key(mode) { return `${this.prefix}-${mode}-writer`; }
  read(mode) {
    const raw = this.storage.getItem(this.key(mode));
    return raw === null ? null : JSON.parse(raw);
  }
  writeLease() {
    this.storage.setItem(this.key(this.mode), JSON.stringify({owner:this.owner, until:this.now()+this.leaseMs}));
  }
  async acquire(mode) {
    if (this.disposed) return false;
    if (typeof mode !== 'string' || !/^[a-z0-9_-]+$/i.test(mode)) { this.reason='invalid-mode'; return false; }
    if (this.mode === mode && this.owns(mode)) return true;
    this.release();
    const generation = this.generation;
    if (!this.locks?.request) { this.reason='unsupported'; return false; }
    if (!this.storage && this.defaultStorage) {
      try { this.storage = globalThis.localStorage; } catch { /* Permission can be granted before a later retry. */ }
    }
    if (!this.storage) { this.reason='storage-error'; return false; }
    this.reason='pending';
    return new Promise(resolve => {
      let settled = false;
      const done = value => { if (!settled) { settled=true; resolve(value); } };
      try {
        Promise.resolve(this.locks.request(this.key(mode), {mode:'exclusive',ifAvailable:true}, async lock => {
          if (generation !== this.generation || this.disposed) { done(false); return; }
          if (!lock) { this.reason='occupied'; done(false); return; }
          const held = new Promise(unlock => { this.unlock=unlock; });
          this.mode=mode;
          try {
            // Web Lock proves previous lease stale, regardless of its timestamp.
            this.writeLease();
            this.timer=this.setInterval(() => this.renew(), Math.max(1,Math.floor(this.leaseMs/3)));
            this.reason='owned';
            done(true);
          } catch { this.lose('storage-error'); done(false); }
          await held;
        })).catch(() => {
          if (generation === this.generation) {
            if (this.mode === mode) this.lose('lock-error');
            else this.reason='lock-error';
          }
          done(false);
        });
      } catch { this.reason='lock-error'; done(false); }
    });
  }
  owns(mode) {
    if (!this.mode || this.mode !== mode || !this.unlock) return false;
    try {
      const lease=this.read(mode);
      // Expiry alone never authorizes another writer: held Web Lock remains
      // authoritative, including browser suspension and clock adjustments.
      if (lease?.owner !== this.owner) { this.lose('ownership-lost'); return false; }
      return true;
    } catch { this.lose('storage-error'); return false; }
  }
  renew() {
    if (!this.owns(this.mode)) return false;
    try { this.writeLease(); return true; } catch { this.lose('storage-error'); return false; }
  }
  lose(reason) {
    const mode=this.mode;
    this.release();
    this.reason=reason;
    try { this.onLost(mode,reason); } catch { /* UI callback cannot retain a lock. */ }
  }
  release() {
    ++this.generation;
    if (this.timer !== undefined) this.clearInterval(this.timer);
    this.timer=undefined;
    if (this.mode) {
      try { if (this.read(this.mode)?.owner === this.owner) this.storage.removeItem(this.key(this.mode)); } catch { /* stale lease is harmless without Web Lock */ }
    }
    this.mode=null;
    const unlock=this.unlock;
    this.unlock=null;
    unlock?.();
    this.reason='released';
  }
  dispose() { this.release(); this.disposed=true; }
}

export const createSaveGuard = options => new SaveGuard(options);
