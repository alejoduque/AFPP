#!/usr/bin/env node
/**
 * AFPP admin: list every shared derive and its sounds, pick what to delete.
 * Run it on the server, as root (a single sound's file is removed from disk):
 *
 *   node /opt/afpp/tools/admin.mjs                 interactive
 *   node /opt/afpp/tools/admin.mjs list            the table, then exit
 *   node /opt/afpp/tools/admin.mjs delete <id>... [--yes]
 *
 * It talks to the running API on 127.0.0.1 with ADMIN_TOKEN from /etc/afpp/afpp.env
 * (AFPP_ENV=… for another file), so the server's index, the open pages (SSE
 * `remove`) and the disk stay in step: no restart needed. A whole derive goes
 * with DELETE; a single sound by re-publishing the derive without it, then
 * removing its audio file from DATA_DIR (default /var/lib/afpp).
 * The bitácora's "shared a derive" lines are left as they are.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/; // as lib/store.js

// ------------------------------------------------------------ config
function readEnv(file) {
  const env = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return env;
}
const ENV_FILE = process.env.AFPP_ENV || '/etc/afpp/afpp.env';
const fileEnv = readEnv(ENV_FILE);
const conf = (k, dflt) => process.env[k] || fileEnv[k] || dflt;
const TOKEN = conf('ADMIN_TOKEN', '');
const API = (process.env.AFPP_API || `http://127.0.0.1:${conf('PORT', '8790')}`).replace(/\/+$/, '') + '/api';
const DATA_DIR = conf('DATA_DIR', '/var/lib/afpp');

// ------------------------------------------------------------ API
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, p, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${p}`, {
      method,
      headers: {
        ...(method !== 'GET' ? { Authorization: `Bearer ${TOKEN}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 5) {
      await sleep(2000);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? ` (is ADMIN_TOKEN in ${ENV_FILE} the server's?)` : '';
      throw new Error(`${method} ${p}: ${res.status} ${data.error || res.statusText}${hint}`);
    }
    return data;
  }
}

async function loadAll() {
  const ids = (await api('GET', 'activity')).map((a) => a.id).filter((id) => ID_RE.test(id));
  const out = [];
  for (let i = 0; i < ids.length; i += 8) {
    const got = await Promise.allSettled(ids.slice(i, i + 8).map((id) => api('GET', `derives/${id}`)));
    for (const g of got) if (g.status === 'fulfilled') out.push(g.value);
  }
  const when = (d) => d.endTime || d.updatedAt || 0;
  return out.sort((a, b) => when(b) - when(a));
}

async function deleteDerive(id) {
  await api('DELETE', `derives/${id}`);
}

/** Re-publish the derive without these recordings, then remove their files. */
async function deleteSounds(d, recIds) {
  const drop = new Set(recIds);
  const gone = d.recordings.filter((r) => drop.has(r.id));
  const body = {
    alias: d.alias,
    title: d.title,
    startTime: d.startTime,
    endTime: d.endTime,
    breadcrumbs: d.breadcrumbs,
    recordings: d.recordings.filter((r) => !drop.has(r.id)),
  };
  await api('PUT', `derives/${d.id}`, body);
  const removed = [];
  for (const r of gone) {
    if (!r.ext || !ID_RE.test(r.id) || !ID_RE.test(d.id)) continue;
    const file = path.join(DATA_DIR, 'audio', d.id, `${r.id}.${r.ext}`);
    try {
      fs.rmSync(file);
      removed.push(file);
    } catch (e) {
      if (e.code !== 'ENOENT') console.log(`  could not remove ${file}: ${e.message}`);
    }
  }
  return removed;
}

// ------------------------------------------------------------ display
const pad = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n);
};
const day = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '?');
const dur = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.round((s || 0) % 60)).padStart(2, '0')}`;
function centre(d) {
  const pts = [...d.breadcrumbs, ...d.recordings];
  if (!pts.length) return '';
  const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lng = pts.reduce((a, p) => a + p.lng, 0) / pts.length;
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}
const audible = (d) => d.recordings.filter((r) => r.audio).length;

function printDerives(list) {
  if (!list.length) return console.log('  (no derives)');
  console.log(`  ${pad('#', 4)}${pad('date (UTC)', 17)}${pad('alias', 14)}${pad('title', 24)}${pad('sounds', 7)}${pad('pts', 6)}${pad('place', 18)}id`);
  list.forEach((d, i) => {
    console.log(`  ${pad(i + 1, 4)}${pad(day(d.endTime || d.updatedAt), 17)}${pad(d.alias, 14)}${pad(d.title || '-', 24)}${pad(`${audible(d)}/${d.recordings.length}`, 7)}${pad(d.breadcrumbs.length, 6)}${pad(centre(d), 18)}${d.id}`);
  });
}

function printSounds(d) {
  console.log(`\n  ${d.alias} · ${d.title || '(untitled)'} · ${d.id}`);
  if (!d.recordings.length) return console.log('  (no sounds)');
  console.log(`  ${pad('#', 4)}${pad('name', 24)}${pad('tags', 20)}${pad('length', 7)}${pad('time (UTC)', 17)}${pad('file', 6)}rec id`);
  d.recordings.forEach((r, i) => {
    console.log(`  ${pad(i + 1, 4)}${pad(r.name || '-', 24)}${pad((r.tags || []).join(', ') || '-', 20)}${pad(dur(r.duration), 7)}${pad(day(r.timestamp), 17)}${pad(r.ext || 'none', 6)}${r.id}`);
  });
}

/** "1,3,5-7" → [0,2,4,5,6] (indexes into a list of n), or null if malformed. */
export function parsePicks(text, n) {
  const out = new Set();
  for (const part of String(text).split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > n || a > b) return null;
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

// ------------------------------------------------------------ interactive
/**
 * ask(prompt) → the next line typed. Lines are queued, so a paste of several
 * commands (or piped input) is not lost between prompts; the end of input
 * answers 'q'.
 */
function prompter() {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  const lines = [];
  const waiting = [];
  let closed = false;
  rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
  rl.on('close', () => {
    closed = true;
    while (waiting.length) waiting.shift()('q');
  });
  const ask = (q) => {
    stdout.write(q);
    if (lines.length) {
      const l = lines.shift();
      if (!stdin.isTTY) stdout.write(`${l}\n`);
      return Promise.resolve(l.trim());
    }
    if (closed) return Promise.resolve('q');
    return new Promise((resolve) => waiting.push((l) => {
      if (!stdin.isTTY) stdout.write(`${l}\n`);
      resolve(l.trim());
    }));
  };
  ask.close = () => rl.close();
  return ask;
}

const HELP = `
  d 1,3,5-7   delete those whole derives (trace + all sounds)
  s 4         open derive 4's sounds, to delete single sounds
  f text      show only derives whose alias, title or id contains text (f alone: all)
  r           reload        ?  this help        q  quit
`;
const SOUND_HELP = `
  d 2,3       delete those sounds from this derive
  b           back to the derives
`;

async function interactive() {
  const ask = prompter();
  const yes = async (q) => /^y(es)?$/i.test(await ask(`${q} [y/N] `));

  let all = await loadAll();
  let filter = '';
  const shown = () => (filter ? all.filter((d) => [d.alias, d.title, d.id].some((s) => String(s || '').toLowerCase().includes(filter))) : all);
  console.log(`\n${all.length} shared derives on ${API}${filter ? ` (filter: ${filter})` : ''}`);
  printDerives(shown());
  console.log(HELP);

  for (;;) {
    const line = await ask('admin> ');
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');
    if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') break;
    if (!cmd) continue;
    if (cmd === '?' || cmd === 'h' || cmd === 'help') {
      console.log(HELP);
    } else if (cmd === 'r' || cmd === 'l') {
      all = await loadAll();
      console.log(`\n${all.length} shared derives${filter ? ` (filter: ${filter})` : ''}`);
      printDerives(shown());
    } else if (cmd === 'f') {
      filter = arg.toLowerCase();
      printDerives(shown());
    } else if (cmd === 'd') {
      const list = shown();
      const picks = parsePicks(arg, list.length);
      if (!picks) {
        console.log(`  pick numbers from 1 to ${list.length}, e.g. d 1,3,5-7`);
        continue;
      }
      const sel = picks.map((i) => list[i]);
      sel.forEach((d) => console.log(`  - ${d.alias} · ${d.title || '(untitled)'} · ${audible(d)} sounds · ${d.id}`));
      if (!(await yes(`delete ${sel.length} derive${sel.length > 1 ? 's' : ''} and all their sounds?`))) {
        console.log('  nothing deleted');
        continue;
      }
      for (const d of sel) {
        try {
          await deleteDerive(d.id);
          console.log(`  deleted ${d.id}`);
        } catch (e) {
          console.log(`  FAILED ${d.id}: ${e.message}`);
        }
      }
      all = await loadAll();
      printDerives(shown());
    } else if (cmd === 's') {
      const list = shown();
      const picks = parsePicks(arg, list.length);
      if (!picks || picks.length !== 1) {
        console.log(`  one number from 1 to ${list.length}, e.g. s 4`);
        continue;
      }
      let d = list[picks[0]];
      printSounds(d);
      console.log(SOUND_HELP);
      for (;;) {
        const sline = await ask(`sounds ${d.id}> `);
        const [scmd, ...srest] = sline.split(/\s+/);
        if (!scmd) continue;
        if (scmd === 'b' || scmd === 'q') break;
        if (scmd !== 'd') {
          console.log(SOUND_HELP);
          continue;
        }
        const sp = parsePicks(srest.join(' '), d.recordings.length);
        if (!sp) {
          console.log(`  pick numbers from 1 to ${d.recordings.length}, e.g. d 2,3`);
          continue;
        }
        const recs = sp.map((i) => d.recordings[i]);
        recs.forEach((r) => console.log(`  - ${r.name || '-'} · ${dur(r.duration)} · ${r.id}`));
        if (!d.breadcrumbs.length && recs.length === d.recordings.length) {
          console.log('  that is every sound and the derive has no trace: the server keeps no empty derive.');
          if (await yes(`delete the whole derive ${d.id} instead?`)) {
            try {
              await deleteDerive(d.id);
              console.log(`  deleted ${d.id}`);
            } catch (e) {
              console.log(`  FAILED: ${e.message}`);
            }
            break;
          }
          console.log('  nothing deleted');
          continue;
        }
        if (!(await yes(`delete ${recs.length} sound${recs.length > 1 ? 's' : ''}?`))) {
          console.log('  nothing deleted');
          continue;
        }
        try {
          const removed = await deleteSounds(d, recs.map((r) => r.id));
          console.log(`  deleted ${recs.length} sound${recs.length > 1 ? 's' : ''}${removed.length ? ` (${removed.length} file${removed.length > 1 ? 's' : ''} removed)` : ''}`);
          d = await api('GET', `derives/${d.id}`);
          printSounds(d);
        } catch (e) {
          console.log(`  FAILED: ${e.message}`);
        }
      }
      all = await loadAll();
      printDerives(shown());
    } else {
      console.log(HELP);
    }
  }
  ask.close();
  console.log('(bitácora lines about shared derives stay in', path.join(DATA_DIR, 'bitacora'), ')');
}

// ------------------------------------------------------------ main
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    await api('GET', 'health');
  } catch (e) {
    console.error(`the AFPP API does not answer at ${API} (${e.message}). Is the afpp service running?`);
    process.exit(1);
  }
  if (cmd === 'list') return printDerives(await loadAll());
  if (!TOKEN) {
    console.error(`no ADMIN_TOKEN in ${ENV_FILE} (or the environment). Run this on the server as root.`);
    process.exit(1);
  }
  if (cmd === 'delete') {
    const ids = args.filter((a) => a !== '--yes');
    if (!ids.length || ids.some((id) => !ID_RE.test(id))) {
      console.error('usage: admin.mjs delete <deriveId>... [--yes]');
      process.exit(1);
    }
    if (!args.includes('--yes')) {
      const ask = prompter();
      const ok = /^y(es)?$/i.test(await ask(`delete ${ids.length} derive(s): ${ids.join(' ')}? [y/N] `));
      ask.close();
      if (!ok) return console.log('nothing deleted');
    }
    let failed = 0;
    for (const id of ids) {
      try {
        await deleteDerive(id);
        console.log(`deleted ${id}`);
      } catch (e) {
        failed++;
        console.log(`FAILED ${id}: ${e.message}`);
      }
    }
    process.exit(failed ? 1 : 0);
  }
  if (cmd && cmd !== 'interactive') {
    console.error('usage: admin.mjs [list | delete <id>... [--yes]]');
    process.exit(1);
  }
  await interactive();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
