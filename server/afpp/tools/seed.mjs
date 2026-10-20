#!/usr/bin/env node
/**
 * Seed a local AFPP server with a few demo derives on three continents, each
 * with short synthetic sounds (generated WAV — no files needed), so the globe,
 * the local map and the rings can be tried without a phone.
 *
 *   node tools/seed.mjs [http://127.0.0.1:8790]
 *
 * Never point this at the public server: the derives are fake.
 */

const API = (process.argv[2] || 'http://127.0.0.1:8790').replace(/\/+$/, '');

function wav(seconds, voice) {
  const rate = 22050;
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const fade = Math.min(1, t * 4, (seconds - t) * 4);
    buf.writeInt16LE(Math.round(voice(t) * fade * 0.5 * 32767), 44 + i * 2);
  }
  return buf;
}

const voices = {
  bird: (t) => Math.sin(2 * Math.PI * (2800 + 900 * Math.sin(2 * Math.PI * 7 * t)) * t) * (Math.sin(2 * Math.PI * 1.5 * t) > 0.3 ? 1 : 0),
  frog: (t) => Math.sin(2 * Math.PI * 180 * t) * (Math.sin(2 * Math.PI * 3 * t) > 0 ? 1 : 0.1),
  rain: () => Math.random() * 2 - 1,
  bell: (t) => Math.sin(2 * Math.PI * 660 * t) * Math.exp(-((t % 2) * 2)),
  hum: (t) => 0.6 * Math.sin(2 * Math.PI * 110 * t) + 0.3 * Math.sin(2 * Math.PI * 220.5 * t),
};

/** A wobbly walk of `steps` from (lat, lng). */
function walk(lat, lng, steps, seed) {
  const pts = [];
  let a = seed;
  for (let i = 0; i < steps; i++) {
    a += Math.sin(i * 0.7 + seed) * 0.5;
    lat += Math.cos(a) * 0.0006;
    lng += Math.sin(a) * 0.0006;
    pts.push({ lat, lng, timestamp: Date.now() - (steps - i) * 20_000 });
  }
  return pts;
}

const derives = [
  { id: 'demo_manakai', alias: 'manakai', title: 'reserva, amanecer', at: [8.4388, -75.5865], sounds: ['bird', 'frog', 'rain'], ageH: 0.2 },
  { id: 'demo_berlin', alias: 'spree', title: 'canal at night', at: [52.4996, 13.4183], sounds: ['hum', 'bell'], ageH: 30 },
  { id: 'demo_kyoto', alias: 'kamo', title: 'river and temple', at: [35.0116, 135.7681], sounds: ['bell', 'rain', 'bird'], ageH: 400 },
];

const deviceId = 'seed-device';
const res = await fetch(`${API}/api/devices`, { method: 'POST', body: JSON.stringify({ deviceId }) });
const { key } = await res.json();
const auth = { 'X-Device-Id': deviceId, 'X-Device-Key': key };

for (const [k, d] of derives.entries()) {
  const breadcrumbs = walk(d.at[0], d.at[1], 40, k + 1);
  const recordings = d.sounds.map((v, i) => {
    const p = breadcrumbs[Math.floor(((i + 1) * breadcrumbs.length) / (d.sounds.length + 1))];
    return { id: `${d.id}_rec${i}`, lat: p.lat, lng: p.lng, duration: 6, name: v, tags: [v], timestamp: p.timestamp };
  });
  const end = Date.now() - d.ageH * 3_600_000;
  let r = await fetch(`${API}/api/derives/${d.id}`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias: d.alias, title: d.title, startTime: end - 900_000, endTime: end, breadcrumbs, recordings }),
  });
  if (!r.ok) throw new Error(`${d.id}: ${r.status} ${await r.text()}`);
  for (const rec of recordings) {
    r = await fetch(`${API}/api/derives/${d.id}/recordings/${rec.id}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'audio/wav' },
      body: wav(6, voices[rec.name]),
    });
    if (!r.ok) throw new Error(`${rec.id}: ${r.status} ${await r.text()}`);
  }
  console.log(`seeded ${d.id} (${recordings.length} sounds)`);
}
