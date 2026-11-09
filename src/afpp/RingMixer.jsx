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

export default function RingMixer({ mixer, sources, onRemove, open, onToggle, tools = null }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const dots = useRef(new Map()); // id → {x, y, slot, el, parked, dragging}
  const turnRef = useRef(0); // how far the satellites have orbited
  const [states, setStates] = useState({});
  const [, setTick] = useState(0);
  const [master, setMaster] = useState(1);

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

  // The sonar canvas runs only while the drawer is open.
  useEffect(() => {
    if (!open || !canvasRef.current) return undefined;
    const sonar = new Sonar(canvasRef.current, () =>
      [...dots.current.entries()].map(([id, d]) => {
        const m = mixAt(d.x, d.y);
        return { x: d.x, y: d.y, inside: m.inside, level: m.inside ? mixer.level(id) : 0 };
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
    if (m.inside && mixer.running) mixer.set(source, m.gain, m.pan);
    else mixer.leave(source.id);
    setTick((n) => n + 1);
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
        if (!mixer.running) mixer.start().then(() => apply(source));
      },
      onPointerMove: (e) => {
        if (!dot().dragging) return;
        Object.assign(dot(), toStage(e));
        apply(source);
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
          onRemove(source.id);
          return;
        } else {
          return;
        }
        e.preventDefault();
        if (!mixer.running) await mixer.start();
        apply(source);
      },
    };
  }

  const inMix = sources.filter((s) => {
    const d = dots.current.get(s.id);
    return d && mixAt(d.x, d.y).inside;
  }).length;

  return (
    <section className={`afpp-rings ${open ? 'is-open' : ''}`} aria-label={t('afpp.rings.title')}>
      <button type="button" className="afpp-rings__handle" onClick={onToggle} aria-expanded={open}>
        <span className={inMix ? 'is-lit' : ''}>◎</span> {t('afpp.rings.title')} · {sources.length}
        {inMix ? ` · ${t('afpp.rings.playing', { n: inMix })}` : ''}
        <span className="afpp-dim">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="afpp-rings__body">
          {tools && <div className="afpp-rings__tools">{tools}</div>}
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
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}
