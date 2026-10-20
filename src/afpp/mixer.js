/**
 * The rings' audio graph — Mestizaje's Mixer, adapted from live Icecast
 * mounts to recorded derive sounds that loop.
 *
 *   <audio loop> → MediaElementSource → Gain → StereoPanner ─┐
 *   <audio loop> → MediaElementSource → Gain → StereoPanner ─┼→ master → speakers
 *   …                                                         ┘
 *
 * A sound only downloads and plays while its dot is inside the rings; taking
 * it out fades it and pauses the element.
 */

/** Time constant for gain/pan moves: fast enough to follow a finger, slow enough not to click. */
const GLIDE = 0.04;

export class Mixer {
  constructor() {
    this.ctx = null;
    this.master = null;
    /** @type {Map<string, object>} id → channel */
    this.channels = new Map();
    this.onState = () => {};
  }

  /** Create or resume the AudioContext. Must run inside a user gesture (iOS). */
  async start() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'playback' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  #channel(source) {
    let ch = this.channels.get(source.id);
    if (ch) return ch;
    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous'; // the API sends CORS headers; Web Audio needs them to hear it
    audio.preload = 'none';
    audio.loop = true;
    audio.src = source.url;
    const node = this.ctx.createMediaElementSource(audio);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const pan = this.ctx.createStereoPanner();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    node.connect(gain).connect(pan).connect(this.master);
    gain.connect(analyser);
    const set = (state) => {
      ch.state = state;
      this.onState(source.id, state);
    };
    audio.addEventListener('waiting', () => set('connecting'));
    audio.addEventListener('playing', () => set('playing'));
    audio.addEventListener('error', () => set('error'));
    ch = { source, audio, node, gain, pan, analyser, buf: new Float32Array(analyser.fftSize), live: false, state: 'idle' };
    this.channels.set(source.id, ch);
    return ch;
  }

  /** Put a sound in the mix (or move it): gain 0..1, pan -1..1. */
  set(source, gain, pan) {
    if (!this.ctx) return;
    const ch = this.#channel(source);
    const t = this.ctx.currentTime;
    ch.gain.gain.setTargetAtTime(gain, t, GLIDE);
    ch.pan.pan.setTargetAtTime(pan, t, GLIDE);
    if (!ch.live) {
      ch.live = true;
      ch.audio.play().catch(() => {
        ch.state = 'error';
        this.onState(source.id, 'error');
      });
    }
  }

  /** Take a sound out of the mix: fade, then pause. */
  leave(id) {
    const ch = this.channels.get(id);
    if (!ch || !ch.live) return;
    ch.live = false;
    ch.gain.gain.setTargetAtTime(0, this.ctx.currentTime, GLIDE);
    setTimeout(() => {
      if (!ch.live) {
        ch.audio.pause();
        ch.state = 'idle';
        this.onState(id, 'idle');
      }
    }, 250);
  }

  remove(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.audio.pause();
    ch.audio.removeAttribute('src');
    ch.node.disconnect();
    ch.gain.disconnect();
    ch.pan.disconnect();
    this.channels.delete(id);
  }

  /** 0..1 loudness of a sound as it sounds in the mix (after its gain). */
  level(id) {
    const ch = this.channels.get(id);
    if (!ch || !ch.live) return 0;
    ch.analyser.getFloatTimeDomainData(ch.buf);
    let sum = 0;
    for (let i = 0; i < ch.buf.length; i++) sum += ch.buf[i] * ch.buf[i];
    const rms = Math.sqrt(sum / ch.buf.length);
    return Math.min(1, Math.max(0, (20 * Math.log10(rms || 1e-6) + 48) / 48));
  }

  state(id) {
    return this.channels.get(id)?.state || 'idle';
  }

  setMaster(v) {
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, GLIDE);
  }
}
