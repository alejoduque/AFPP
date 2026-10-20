/**
 * The AFPP bitácora: a public text log of #AFPP chat lines and of derives
 * being shared, one file per UTC day.
 *
 *   DATA_DIR/bitacora/AAAA-MM-DD.jsonl   one event per line
 *
 * Events: {t, tipo: 'chat', nick, texto, tbt?} or {t, tipo: 'deriva', deriva,
 * alias, titulo, n}. tbt: the line's typing, when it was written on the web
 * (lib/tbt.js), so the bitácora can play it back as it was typed. Ids are "AAAAMMDD-n" (n = line in that day's file), the same
 * shape as Radiolibre's bitácora, so the same chat client reads either.
 * Recent events stay in memory; day files are read only for .txt downloads.
 */
import fs from 'node:fs';
import path from 'node:path';

const KEEP = 1000; // events held in memory
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayOf = (iso) => iso.slice(0, 10);

export class Bitacora {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.events = [];
    this.counts = new Map(); // day → lines written
    const days = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
    for (const f of days) {
      const day = f.slice(0, 10);
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean);
      this.counts.set(day, lines.length);
      if (days.indexOf(f) >= days.length - 7) {
        lines.forEach((l, i) => {
          try {
            this.events.push({ id: `${day.replace(/-/g, '')}-${i + 1}`, ...JSON.parse(l) });
          } catch {
            // a torn line from a crash: skip it
          }
        });
      }
    }
    this.events = this.events.slice(-KEEP);
  }

  add(ev) {
    const t = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const day = dayOf(t);
    const n = (this.counts.get(day) || 0) + 1;
    this.counts.set(day, n);
    const clean = { t, ...ev };
    fs.appendFileSync(path.join(this.dir, `${day}.jsonl`), JSON.stringify(clean) + '\n', { mode: 0o644 });
    const full = { id: `${day.replace(/-/g, '')}-${n}`, ...clean };
    this.events.push(full);
    if (this.events.length > KEEP) this.events.shift();
    return full;
  }

  /** Newest `limit` events, oldest first. `visible(ev)` hides what should not show (unshared derives). */
  recent({ solo = null, limit = 200, visible = () => true } = {}) {
    const out = this.events.filter((e) => (!solo || e.tipo === solo) && visible(e));
    return out.slice(-Math.max(1, Math.min(limit, KEEP)));
  }

  /** A day as plain text, for the download links. */
  dayText(day, visible = () => true) {
    if (!DAY_RE.test(day)) return null;
    const file = path.join(this.dir, `${day}.jsonl`);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
      try {
        const e = JSON.parse(l);
        if (!visible(e)) return null;
        const hhmm = e.t.slice(11, 16);
        const who = e.fuente === 'telegram' ? `${e.nick} ✈` : e.nick;
        if (e.tipo === 'chat') return /^\* /.test(e.texto) ? `${hhmm} * ${who} ${e.texto.slice(2)}` : `${hhmm} <${who}> ${e.texto}`;
        if (e.tipo === 'deriva') return `${hhmm} ◍ ${e.alias} shared "${e.titulo || 'a derive'}" (${e.n} sounds)`;
        return null;
      } catch {
        return null;
      }
    }).filter(Boolean).join('\n') + '\n';
  }

  days() {
    return [...this.counts.keys()].sort().reverse();
  }
}
