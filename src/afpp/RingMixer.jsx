/**
 * Anillos — the rings mixer, after Mestizaje's sonar switchboard.
 *
 * Sounds wait as satellites, slowly orbiting the outer ring: the latest ones
 * shared anywhere on the planet, plus any sent here from a map. Drag one inside:
 * the closer to the centre, the louder; left or right of it, panned left or
 * right; drop it outside, and it goes back to wait. Sounds from anywhere on
 * the planet can sit in the rings together.
 *
 * Positions and the audio graph live outside React state (refs), as in
 * Mestizaje, so dragging is a style write and two AudioParam ramps.
 */
import React, { useEffect, useRef, useState } from 'react';
import { CENTER, mixAt, parkAt, clampToStage } from './mix.mjs';
import { Sonar } from './sonar.js';
import { t } from '../i18n';

const PARK_SLOTS = 12;
const KEY_STEP = 0.03;

function parkSpot(slot, turn = 0) {
  const ring = Math.floor(slot / PARK_SLOTS);
  const p = parkAt((slot % PARK_SLOTS) + ring * 0.5, PARK_SLOTS);
  if (!turn) return p;
  // Satellites: the parking ring, turned by `turn` radians.
  const dx = p.x - CENTER;
  const dy = p.y - CENTER;
  return { x: CENTER + dx * Math.cos(turn) - dy * Math.sin(turn), y: CENTER + dx * Math.sin(turn) + dy * Math.cos(turn) };
}

const ORBIT_SPEED = (2 * Math.PI) / 240; // one turn in four minutes

function describePan(pan) {
  const pct = Math.round(Math.abs(pan) * 100);
  if (pct < 5) return t('afpp.rings.center');
  return t(pan < 0 ? 'afpp.rings.left' : 'afpp.rings.right', { n: pct });
}

const SEND_EVERY_MS = 125; // a drag in the shared rings: at most 8 moves a second

export default function RingMixer({
  mixer, sources, onRemove, open, onToggle, tools = null,
  together = false, onTogether, shared = null, onShared, streamUrl,
}) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const dots = useRef(new Map()); // id → {x, y, slot, el, parked, dragging}
  const turnRef = useRef(0); // how far the satellites have orbited
  const [states, setStates] = useState({});
  const [, setTick] = useState(0);
  const [master, setMaster] = useState(1);
  const streamRef = useRef(null); // <audio> of the shared mix (Icecast)
  const [listening, setListening] = useState('off'); // off | connecting | on | silent
  const sharedIds = new Set((shared?.sources || []).map((x) => x.id));
  const sharedRef = useRef(sharedIds);
  sharedRef.current = sharedIds;

  // Give every new source a parking slot; drop the ones that left.
  const used = new Set();
  for (const s of sources) {
    const d = dots.current.get(s.id);
    if (d) used.add(d.slot);
  }
  for (const s of sources) {
    if (dots.current.has(s.id)) continue;
    let slot = 0;
    while (used.has(slot)) slot++;
    used.add(slot);
    dots.current.set(s.id, { ...parkSpot(slot, turnRef.current), slot, el: null, parked: true });
  }
  for (const id of [...dots.current.keys()]) {
    if (!sources.some((s) => s.id === id)) {
      dots.current.delete(id);
      mixer.remove(id);
    }
  }

  useEffect(() => {
    mixer.onState = (id, state) => setStates((m) => ({ ...m, [id]: state }));
  }, [mixer]);

  // Together: the dots of the shared rings sit where the server says (unless
  // this hand is moving one); sounds that left the shared rings go back to wait.
  useEffect(() => {
    if (!together) return;
    const pos = new Map((shared?.sources || []).map((x) => [x.id, x]));
    for (const [id, d] of dots.current) {
      if (d.dragging) continue;
      const p = pos.get(id);
      if (p) Object.assign(d, { x: p.x, y: p.y, parked: false });
      else if (!d.parked) Object.assign(d, parkSpot(d.slot, turnRef.current), { parked: true });
      if (d.el) {
        d.el.style.left = `${d.x * 100}%`;
        d.el.style.top = `${d.y * 100}%`;
        d.el.classList.toggle('dot--left', d.x < CENTER - 0.02);
        d.el.classList.toggle('dot--in', mixAt(d.x, d.y).inside);
      }
    }
    setTick((n) => n + 1);
  }, [together, shared]);

  // Together: this mix goes quiet, the shared one plays from Icecast.
  useEffect(() => {
    if (!together) {
      streamRef.current?.pause();
      setListening('off');
      return undefined;
    }
    for (const id of dots.current.keys()) mixer.leave(id);
    const a = streamRef.current;
    if (!a || !streamUrl || shared?.stream === false) return undefined;
    let retry = null;
    const start = () => {
      clearTimeout(retry);
      if (!a.paused && a.src) return setListening('on'); // already started by the tap
      setListening('connecting');
      a.src = `${streamUrl}?t=${Date.now()}`; // never a stale cached piece of a live stream
      a.play().catch(() => setListening('off'));
    };
    const onPlaying = () => setListening('on');
    const onFail = () => {
      setListening('silent');
      retry = setTimeout(start, 5000); // nobody in the rings yet, or Icecast restarting
    };
    a.addEventListener('playing', onPlaying);
    a.addEventListener('error', onFail);
    a.addEventListener('ended', onFail);
    start();
    return () => {
      clearTimeout(retry);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('error', onFail);
      a.removeEventListener('ended', onFail);
      a.pause();
      a.removeAttribute('src');
      a.load();
    };
    // a ring that starts streaming: try again at once
  }, [together, streamUrl, shared?.stream, shared?.streaming, mixer]);

  // The sonar canvas runs only while the drawer is open.
  useEffect(() => {
    if (!open || !canvasRef.current) return undefined;
    const sonar = new Sonar(canvasRef.current, () =>
      [...dots.current.entries()].map(([id, d]) => {
        const m = mixAt(d.x, d.y);
        const level = !m.inside ? 0 : sharedRef.current.has(id) ? m.gain * 0.5 : mixer.level(id);
        return { x: d.x, y: d.y, inside: m.inside, level };
      }),
    );
    sonar.start();
    return () => sonar.stop();
  }, [open, mixer]);

  // The satellites orbit while they wait; the ones in the mix stay where they were put.
  useEffect(() => {
    if (!open || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      turnRef.current = (turnRef.current + ((now - last) / 1000) * ORBIT_SPEED) % (2 * Math.PI);
      last = now;
      for (const d of dots.current.values()) {
        if (!d.parked || d.dragging || !d.el) continue;
        Object.assign(d, parkSpot(d.slot, turnRef.current));
        d.el.style.left = `${d.x * 100}%`;
        d.el.style.top = `${d.y * 100}%`;
        d.el.classList.toggle('dot--left', d.x < CENTER - 0.02);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function apply(source) {
    const d = dots.current.get(source.id);
    if (!d) return;
    if (d.el) {
      d.el.style.left = `${d.x * 100}%`;
      d.el.style.top = `${d.y * 100}%`;
      d.el.classList.toggle('dot--left', d.x < CENTER - 0.02);
    }
    const m = mixAt(d.x, d.y);
    d.parked = !m.inside && !d.dragging;
    d.el?.classList.toggle('dot--in', m.inside);
    if (together) mixer.leave(source.id);
    else if (m.inside && mixer.running) mixer.set(source, m.gain, m.pan);
    else mixer.leave(source.id);
    setTick((n) => n + 1);
  }

  /** Together: tell the shared rings (a move while dragging at most every SEND_EVERY_MS; always on release). */
  function share(source, final) {
    if (!together || !onShared) return;
    const d = dots.current.get(source.id);
    const now = performance.now();
    if (!final && now - (d.sentAt || 0) < SEND_EVERY_MS) return;
    d.sentAt = now;
    const inside = mixAt(d.x, d.y).inside;
    const isShared = sharedRef.current.has(source.id);
    if (inside) onShared({ op: isShared ? 'move' : 'add', id: source.id, x: d.x, y: d.y });
    else if (final && isShared) onShared({ op: 'remove', id: source.id });
  }

  const toStage = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return clampToStage((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  // Drag state lives on the dot, not in this closure: starting the
  // AudioContext re-renders mid-drag, and a fresh closure would forget it.
  function bind(source) {
    const dot = () => dots.current.get(source.id);
    return {
      onPointerDown: (e) => {
        dot().dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add('dot--drag');
        e.preventDefault();
        // The first touch is the user gesture the AudioContext needs.
        if (!together && !mixer.running) mixer.start().then(() => apply(source));
      },
      onPointerMove: (e) => {
        if (!dot().dragging) return;
        Object.assign(dot(), toStage(e));
        apply(source);
        share(source, false);
      },
      onPointerCancel: (e) => {
        dot().dragging = false;
        e.currentTarget.classList.remove('dot--drag');
      },
      onPointerUp: (e) => {
        const d = dot();
        if (!d.dragging) return;
        d.dragging = false;
        e.currentTarget.classList.remove('dot--drag');
        share(source, true);
        if (!mixAt(d.x, d.y).inside) Object.assign(d, parkSpot(d.slot, turnRef.current));
        apply(source);
      },
      onKeyDown: async (e) => {
        const d = dots.current.get(source.id);
        const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (moves[e.key]) {
          const [mx, my] = moves[e.key];
          Object.assign(d, clampToStage(d.x + mx * KEY_STEP, d.y + my * KEY_STEP));
        } else if (e.key === 'Enter' || e.key === ' ') {
          Object.assign(d, mixAt(d.x, d.y).inside ? parkSpot(d.slot, turnRef.current) : { x: CENTER, y: CENTER });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (together && sharedRef.current.has(source.id)) onShared?.({ op: 'remove', id: source.id });
          onRemove(source.id);
          return;
        } else {
          return;
        }
        e.preventDefault();
        if (!together && !mixer.running) await mixer.start();
        apply(source);
        share(source, true);
      },
    };
  }

  const inMix = sources.filter((s) => {
    const d = dots.current.get(s.id);
    return d && mixAt(d.x, d.y).inside;
  }).length;

  return (
    <section className={`afpp-rings ${open ? 'is-open' : ''}`} aria-label={t('afpp.rings.title')}>
      <audio ref={streamRef} preload="none" />
      <button type="button" className="afpp-rings__handle" onClick={onToggle} aria-expanded={open}>
        <span className={inMix ? 'is-lit' : ''}>◎</span> {t('afpp.rings.title')}{together ? ` · ${t('rings.together')}` : ''} · {sources.length}
        {inMix ? ` · ${t('afpp.rings.playing', { n: inMix })}` : ''}
        <span className="afpp-dim">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="afpp-rings__body">
          <div className="afpp-rings__tools">
            {onTogether && (
              <div className="afpp-seg" role="radiogroup" aria-label={t('rings.mode')}>
                <button type="button" role="radio" aria-checked={!together} className={!together ? 'is-on' : ''} onClick={() => onTogether(false)}>
                  {t('rings.solo')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={together}
                  className={together ? 'is-on' : ''}
                  onClick={() => {
                    // inside the tap: Safari plays audio only from a user gesture
                    const a = streamRef.current;
                    if (a && streamUrl && !together) {
                      a.src = `${streamUrl}?t=${Date.now()}`;
                      a.play().catch(() => {});
                    }
                    onTogether(true);
                  }}
                >
                  {t('rings.together')}
                </button>
              </div>
            )}
            {tools}
          </div>
          {together && (
            <p className="afpp-rings__note afpp-dim" aria-live="polite">
              {shared?.stream === false
                ? t('rings.noStream')
                : `${t(`rings.listen.${listening}`)} · ${t('rings.delay')}`}
            </p>
          )}
          <div className="afpp-stage" ref={stageRef}>
            <canvas ref={canvasRef} className="afpp-stage__sonar" />
            <div className="afpp-stage__dots">
              {sources.map((s) => {
                const d = dots.current.get(s.id);
                const m = mixAt(d.x, d.y);
                return (
                  <button
                    key={s.id}
                    type="button"
                    ref={(el) => {
                      d.el = el;
                    }}
                    className={`dot ${m.inside ? 'dot--in' : 'dot--sat'} ${d.x < CENTER - 0.02 ? 'dot--left' : ''}`}
                    data-state={m.inside ? states[s.id] || 'connecting' : 'idle'}
                    style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
                    aria-label={`${s.alias} · ${s.name}: ${
                      m.inside
                        ? t('afpp.rings.inMix', { pan: describePan(m.pan), vol: Math.round(m.gain * 100) })
                        : t('afpp.rings.parked')
                    }. ${t('afpp.rings.keys')}`}
                    {...bind(s)}
                  >
                    <span className="dot__label">
                      {s.alias} · {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {!sources.length && <p className="afpp-stage__empty">{t('afpp.rings.empty')}</p>}
          </div>
          <label className="afpp-master">
            {t('afpp.rings.master')}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={master}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMaster(v);
                mixer.setMaster(v);
                if (streamRef.current) streamRef.current.volume = v;
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}
