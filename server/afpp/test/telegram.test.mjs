import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fromTelegram, toTelegram, displayName, splitBytes } from '../lib/telegram.js';
import { createAfppServer } from '../server.js';

const CHAT = -1004345678231;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('who appears: @username, else a stable pseudonym, never names', () => {
  assert.equal(displayName({ id: 1, username: 'heidi_ch', first_name: 'Heidi' }), 'heidi_ch');
  const a = displayName({ id: 42, first_name: 'Real Name' }, 'secret');
  assert.match(a, /^anon-[0-9a-f]{6}$/);
  assert.equal(displayName({ id: 42 }, 'secret'), a);
  assert.notEqual(displayName({ id: 42 }, 'other'), a);
});

test('what crosses from Telegram', () => {
  const msg = (extra) => ({ chat: { id: CHAT }, from: { id: 1, username: 'ana' }, ...extra });
  assert.equal(fromTelegram(msg({ text: 'hola' }), CHAT).lines[0], '<ana> hola');
  assert.equal(fromTelegram(msg({ photo: [{}], caption: 'die Alp' }), CHAT).text, '(photo) die Alp');
  assert.equal(fromTelegram(msg({ voice: {} }), CHAT).text, '(voice message)');
  assert.equal(fromTelegram(msg({ text: 'a\nb' }), CHAT).text, 'a / b');
  assert.equal(fromTelegram({ ...msg({ text: 'x' }), chat: { id: 5 } }, CHAT), null, 'other chats never cross');
  assert.equal(fromTelegram({ ...msg({ text: 'x' }), from: { is_bot: true } }, CHAT), null, 'bots never cross');
  const long = fromTelegram(msg({ text: 'ü'.repeat(3000) }), CHAT);
  assert.equal(long.lines.length, 5);
  assert.ok(long.lines.every((l) => Buffer.byteLength(l) <= 400));
  assert.ok(long.lines[4].endsWith(' […]'));
  assert.equal(toTelegram({ nick: 'bo', texto: '* baila' }), '* bo baila');
  assert.deepEqual(splitBytes('aé', 2), ['a', 'é']);
});

test('round trip: Telegram ↔ #AFPP, both logged, derive shares announced', async () => {
  // Fake Ergo: welcomes, echoes JOIN, records PRIVMSGs from the bot, can speak.
  const ircSeen = [];
  let ircClient;
  const ergo = net.createServer((c) => {
    ircClient = c;
    c.setEncoding('utf8');
    c.on('data', (d) => d.split('\r\n').filter(Boolean).forEach((l) => {
      ircSeen.push(l);
      if (l.startsWith('USER')) c.write(':irc 001 afpp-bitacora :hi\r\n');
      if (l.startsWith('JOIN')) c.write(':afpp-bitacora!u@h JOIN #AFPP\r\n');
    }));
  });
  await new Promise((r) => ergo.listen(0, '127.0.0.1', r));

  // Fake Telegram Bot API: one update from the group, records sendMessage.
  const sent = [];
  let served = false;
  const tg = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/getUpdates')) {
        if (!served) {
          served = true;
          return res.end(JSON.stringify({ ok: true, result: [{ update_id: 7, message: { chat: { id: CHAT }, from: { id: 9, username: 'louise' }, text: 'Salut depuis Telegram' } }] }));
        }
        return setTimeout(() => res.end(JSON.stringify({ ok: true, result: [] })), 200);
      }
      if (req.url.endsWith('/sendMessage')) {
        sent.push(b);
        return res.end(JSON.stringify({ ok: true, result: {} }));
      }
      res.end(JSON.stringify({ ok: false, description: 'unknown' }));
    });
  });
  await new Promise((r) => tg.listen(0, '127.0.0.1', r));

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afpp-tg-'));
  const server = createAfppServer({
    SERVER_SECRET: 'z'.repeat(32), DATA_DIR: dataDir,
    IRC_HOST: '127.0.0.1', IRC_PORT: String(ergo.address().port), IRC_CHANNEL: '#AFPP',
    TELEGRAM_TOKEN: 'TEST', TELEGRAM_CHAT: String(CHAT), TELEGRAM_API: `http://127.0.0.1:${tg.address().port}`,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await wait(400);
    assert.ok(ircSeen.includes('PRIVMSG #AFPP :<louise> Salut depuis Telegram'), 'Telegram → #AFPP');

    ircClient.write(':heidi!h@x PRIVMSG #AFPP :Grüezi aus dem Web\r\n');
    await wait(300);
    assert.ok(sent.some((m) => m.chat_id === String(CHAT) && m.text.includes('<heidi> Grüezi aus dem Web')), '#AFPP → Telegram');

    const { key } = await (await fetch(`${base}/devices`, { method: 'POST', body: JSON.stringify({ deviceId: 'p' }) })).json();
    await fetch(`${base}/derives/d9`, { method: 'PUT', headers: { 'X-Device-Id': 'p', 'X-Device-Key': key }, body: JSON.stringify({ alias: 'ana', title: 'Pass', breadcrumbs: [{ lat: 46.85, lng: 9.53 }] }) });
    await wait(3500); // sends are paced
    assert.ok(sent.some((m) => /◍ ana shared «Pass» .*#46\.8500,9\.5300/.test(m.text)), 'derive announced');

    const { eventos } = await (await fetch(`${base}/bitacora.json?solo=chat`)).json();
    assert.deepEqual(eventos.map((e) => [e.nick, e.fuente || 'irc']), [['louise', 'telegram'], ['heidi', 'irc']]);
  } finally {
    server.closeAllConnections();
    server.close();
    ergo.close();
    tg.closeAllConnections();
    tg.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
