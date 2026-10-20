/**
 * The #AFPP bot: it sits in the channel on the local Ergo (plain IRC on the
 * loopback port, never exposed) and hands every channel line to
 * onLine({nick, texto, tbt}). It speaks only to relay the Telegram group, through
 * say(). Reconnects with backoff.
 *
 * It asks for IRCv3 message-tags, so a line typed on the web arrives with its
 * typing (lib/tbt.js): tbt is that recording, checked, or null.
 */
import net from 'node:net';
import { TBT_TAG, parseTags, decodeTbt } from './tbt.js';

export function startIrcLogger({ host, port, channel, nick = 'afpp-bitacora', onLine, log = console }) {
  let sock = null;
  let buf = '';
  let wanted = nick;
  let retry = 0;
  let stopped = false;
  let timer = null;
  let joined = false;
  const pending = []; // relayed lines that arrived while (re)connecting

  const send = (line) => sock && !sock.destroyed && sock.write(line.replace(/[\r\n]/g, ' ') + '\r\n');

  function connect() {
    sock = net.connect({ host, port });
    sock.setEncoding('utf8');
    sock.setKeepAlive(true, 60_000);
    sock.on('connect', () => {
      retry = 0;
      send('CAP REQ :message-tags');
      send(`NICK ${wanted}`);
      send(`USER ${nick} 0 * :AFPP bitácora + Telegram bridge for ${channel}`);
      send('CAP END');
    });
    sock.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        handle(line);
      }
    });
    sock.on('error', (e) => log.error('irc:', e.message));
    sock.on('close', () => {
      joined = false;
      sock = null;
      buf = '';
      if (stopped) return;
      const wait = Math.min(60_000, 1000 * 2 ** retry++);
      timer = setTimeout(connect, wait);
    });
  }

  function handle(line) {
    const m = /^(?:@(\S+) )?(?::(\S+) )?(\S+)(?: (.*))?$/.exec(line);
    if (!m) return;
    const [, rawTags = '', prefix = '', cmd, rest = ''] = m;
    const trail = rest.includes(' :') ? rest.slice(rest.indexOf(' :') + 2) : rest.startsWith(':') ? rest.slice(1) : '';
    const params = (rest.includes(' :') ? rest.slice(0, rest.indexOf(' :')) : rest.startsWith(':') ? '' : rest).split(' ').filter(Boolean);
    const from = prefix.split('!')[0];
    if (cmd === 'PING') return send(`PONG :${trail || params[0] || ''}`);
    if (cmd === '001') return send(`JOIN ${channel}`);
    if (cmd === 'JOIN' && from === wanted) {
      joined = true;
      while (pending.length) send(`PRIVMSG ${channel} :${pending.shift()}`);
      return;
    }
    if (cmd === '433') {
      wanted = `${nick}${Math.floor(Math.random() * 90 + 10)}`;
      return send(`NICK ${wanted}`);
    }
    if (cmd === 'PRIVMSG' && params[0] && params[0].toLowerCase() === channel.toLowerCase() && from) {
      const action = /^\x01ACTION (.*)\x01?$/.exec(trail);
      if (/^\x01/.test(trail) && !action) return; // other CTCP
      const texto = (action ? `* ${action[1].replace(/\x01$/, '')}` : trail)
        .replace(/\x03(\d{1,2}(,\d{1,2})?)?|[\x02\x0f\x11\x16\x1d\x1e\x1f]/g, '')
        .slice(0, 500);
      // the typing is kept only for a plain line that is exactly what was typed
      const tbt = !action && texto === trail && rawTags ? decodeTbt(parseTags(rawTags)[TBT_TAG], texto) : null;
      if (texto.trim()) onLine({ nick: from.slice(0, 32), texto, tbt });
    }
  }

  connect();
  return {
    /** Say a line in the channel (the Telegram relay). */
    say(text) {
      const line = String(text).replace(/[\r\n]+/g, ' ').slice(0, 450);
      if (joined) send(`PRIVMSG ${channel} :${line}`);
      else if (pending.length < 50) pending.push(line);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      if (sock) {
        send('QUIT :bye');
        sock.destroy();
      }
    },
  };
}
