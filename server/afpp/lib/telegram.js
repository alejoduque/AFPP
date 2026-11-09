/**
 * The Telegram side of the #AFPP bridge (after Radiolibre's puente).
 *
 *   Telegram group → #AFPP   the bot posts "<name> text" in the channel, and the
 *                            line goes into the bitácora marked ✈
 *   #AFPP → Telegram group   every channel line is sent as "<nick> text"
 *   a derive is shared       a short note with a link to its place
 *
 * Who appears: a Telegram member by @username, never by first or last name;
 * without a username, a stable pseudonym "anon-xxxxxx" (an HMAC of their id
 * keyed with the bot token: same person, same name, id not recoverable).
 * Only text and captions cross; other media become a short placeholder.
 *
 * Long polling (getUpdates), so the server needs no public webhook. The bot
 * must be an admin of the group (or have privacy mode off) to read it.
 */
import crypto from 'node:crypto';

const IRC_TEXT_BYTES = 400; // an IRC line is 512 bytes with the prefix
const MAX_IRC_LINES = 5;
const NAME_MAX = 32;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

export function splitBytes(text, max) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of text) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > max) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  if (cur) out.push(cur);
  return out;
}

export function displayName(from, secret = '') {
  if (!from) return 'telegram';
  const user = String(from.username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, NAME_MAX);
  if (user) return user;
  if (from.id == null) return 'telegram';
  return `anon-${crypto.createHmac('sha256', String(secret)).update(String(from.id)).digest('hex').slice(0, 6)}`;
}

const MEDIA = [
  ['photo', '(photo)'], ['video', '(video)'], ['voice', '(voice message)'], ['audio', '(audio)'],
  ['video_note', '(video message)'], ['sticker', '(sticker)'], ['animation', '(gif)'], ['document', '(file)'],
  ['location', '(location)'], ['poll', '(poll)'],
];

/**
 * A Telegram message → {name, text, lines} for IRC, or null to ignore it.
 * Only messages from people in the one bridged chat cross.
 */
export function fromTelegram(message, chatId, secret = '') {
  if (!message || String(message.chat?.id) !== String(chatId)) return null;
  if (message.from?.is_bot) return null;
  let text = message.text ?? message.caption ?? '';
  const media = MEDIA.find(([k]) => message[k]);
  if (media) text = text ? `${media[1]} ${text}` : media[1];
  text = text.replace(CONTROL, ' ').replace(/\s*\n\s*/g, ' / ').trim();
  if (!text) return null;
  const name = displayName(message.from, secret);
  const prefix = `<${name}> `;
  let lines = splitBytes(text, IRC_TEXT_BYTES - Buffer.byteLength(prefix)).map((t) => prefix + t);
  if (lines.length > MAX_IRC_LINES) {
    lines = lines.slice(0, MAX_IRC_LINES);
    const more = ' […]';
    lines[MAX_IRC_LINES - 1] = splitBytes(lines[MAX_IRC_LINES - 1], IRC_TEXT_BYTES - Buffer.byteLength(more))[0] + more;
  }
  return { name, text, lines };
}

/** An #AFPP line → the text for Telegram. */
export function toTelegram({ nick, texto }) {
  return /^\* /.test(texto) ? `* ${nick} ${texto.slice(2)}` : `<${nick}> ${texto}`;
}

/**
 * Start polling. onMessage({name, text, lines}) for each message that crosses.
 * Returns {send(text), stop()}; send is paced (Telegram allows ~20 messages a
 * minute in a group) and never throws.
 */
export function startTelegram({ token, chatId, onMessage, onUpdate, api = 'https://api.telegram.org', log = console }) {
  const base = `${api}/bot${token}`;
  let offset = 0;
  let stopped = false;
  let controller = null;
  const queue = [];
  let sending = false;

  async function call(method, body, signal) {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    if (!data.ok) throw Object.assign(new Error(`${method}: ${data.description}`), { retryAfter: data.parameters?.retry_after });
    return data.result;
  }

  async function poll() {
    let wait = 1000;
    while (!stopped) {
      controller = new AbortController();
      try {
        // edited_message: live locations arrive as edits of the first location message
        const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'edited_message'] }, controller.signal);
        wait = 1000;
        for (const u of updates) {
          offset = u.update_id + 1;
          const m = u.message && fromTelegram(u.message, chatId, token);
          if (m) onMessage?.(m);
          try {
            onUpdate?.(u);
          } catch (e) {
            log.error('telegram update:', e.message);
          }
        }
      } catch (e) {
        if (stopped) return;
        log.error('telegram:', e.message);
        await new Promise((r) => setTimeout(r, e.retryAfter ? e.retryAfter * 1000 : wait));
        wait = Math.min(60_000, wait * 2);
      }
    }
  }

  async function drain() {
    if (sending) return;
    sending = true;
    while (queue.length && !stopped) {
      // Lines that piled up go together, so a busy channel costs few messages.
      const text = queue.splice(0, 10).join('\n').slice(0, 4000);
      try {
        await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
      } catch (e) {
        log.error('telegram send:', e.message);
        if (e.retryAfter) queue.unshift(text);
        await new Promise((r) => setTimeout(r, (e.retryAfter || 3) * 1000));
      }
      await new Promise((r) => setTimeout(r, 3100));
    }
    sending = false;
  }

  poll();
  return {
    /** The Bot API, for getFile and the like. */
    call: (method, body) => call(method, body),
    /** Where getFile's file_path is downloaded from. */
    fileBase: `${api}/file/bot${token}`,
    /** A short answer to one message in the group (not paced: rare, and it answers someone). */
    reply(text, messageId) {
      if (stopped) return;
      call('sendMessage', { chat_id: chatId, text, reply_to_message_id: messageId, allow_sending_without_reply: true, disable_web_page_preview: true })
        .catch((e) => log.error('telegram reply:', e.message));
    },
    send(text) {
      if (!text || stopped) return;
      queue.push(text);
      drain();
    },
    stop() {
      stopped = true;
      controller?.abort();
    },
  };
}
