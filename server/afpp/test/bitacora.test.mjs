import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createAfppServer } from '../server.js';

/** A stand-in for Ergo: welcomes, records what the bot sends, can speak in the channel. */
function fakeIrc() {
  const seen = [];
  let client = null;
  const srv = net.createServer((c) => {
    client = c;
    c.setEncoding('utf8');
    c.on('data', (d) => {
      for (const l of d.split('\r\n').filter(Boolean)) {
        seen.push(l);
        if (l.startsWith('USER')) c.write(':irc 001 afpp-bitacora :welcome\r\n');
      }
    });
  });
  return {
    seen,
    srv,
    say: (line) => client.write(line + '\r\n'),
    listen: () => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port))),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('the bot logs #AFPP lines and shared derives into the bitácora; unshared derives vanish', async () => {
  const irc = fakeIrc();
  const ircPort = await irc.listen();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afpp-bit-'));
  const server = createAfppServer({
    SERVER_SECRET: 'y'.repeat(32), DATA_DIR: dataDir, IRC_HOST: '127.0.0.1', IRC_PORT: String(ircPort), IRC_CHANNEL: '#AFPP',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await wait(150);
    assert.ok(irc.seen.includes('JOIN #AFPP'), 'joins the channel');

    irc.say(':ana!a@h PRIVMSG #AFPP :hola desde los Alpes');
    // a line typed on the web carries its typing; a forged one does not survive the check
    const tbt = [[0, 0, 0, 'h'], [140, 1, 0, 'o'], [90, 2, 0, 'l'], [2600, 2, 1, ''], [80, 2, 0, 'la']];
    const tag = Buffer.from(JSON.stringify(tbt)).toString('base64url');
    irc.say(`@time=2026-01-01T00:00:00Z;+altred.xyz/tbt=${tag} :bea!b@h PRIVMSG #AFPP :hola`);
    irc.say(`@+altred.xyz/tbt=${tag} :bea!b@h PRIVMSG #AFPP :no es eso`);
    irc.say(':ana!a@h PRIVMSG #AFPP :\x01ACTION baila\x01');
    irc.say(':bo!b@h PRIVMSG #elsewhere :not ours');
    irc.say('PING :abc');
    await wait(150);
    assert.ok(irc.seen.includes('PONG :abc'));

    const { key } = await (await fetch(`${base}/devices`, { method: 'POST', body: JSON.stringify({ deviceId: 'p1' }) })).json();
    const h = { 'X-Device-Id': 'p1', 'X-Device-Key': key };
    await fetch(`${base}/derives/d1`, { method: 'PUT', headers: h, body: JSON.stringify({ alias: 'ana', title: 'Pass', breadcrumbs: [{ lat: 46.5, lng: 8.5 }] }) });

    let { eventos } = await (await fetch(`${base}/bitacora.json`)).json();
    assert.deepEqual(eventos.map((e) => e.tipo), ['chat', 'chat', 'chat', 'chat', 'deriva']);
    assert.equal(eventos[0].texto, 'hola desde los Alpes');
    assert.equal(eventos[0].tbt, undefined);
    assert.deepEqual(eventos[1].tbt, tbt);
    assert.equal(eventos[2].texto, 'no es eso');
    assert.equal(eventos[2].tbt, undefined);
    assert.equal(eventos[3].texto, '* baila');
    assert.ok(irc.seen.includes('CAP REQ :message-tags'));
    ({ eventos } = await (await fetch(`${base}/bitacora.json?solo=chat&ultimos=1`)).json());
    assert.equal(eventos.length, 1);

    const day = new Date().toISOString().slice(0, 10);
    const txt = await (await fetch(`${base}/bitacora/${day}.txt`)).text();
    assert.match(txt, /<ana> hola desde los Alpes/);
    assert.match(txt, /shared "Pass"/);

    await fetch(`${base}/derives/d1`, { method: 'DELETE', headers: h });
    ({ eventos } = await (await fetch(`${base}/bitacora.json`)).json());
    assert.ok(!eventos.some((e) => e.tipo === 'deriva'), 'unshared derive no longer listed');
    assert.equal((await fetch(`${base}/bitacora/../../etc.txt`)).status, 404);
  } finally {
    server.closeAllConnections();
    server.close();
    irc.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
