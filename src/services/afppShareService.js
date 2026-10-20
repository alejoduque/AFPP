/**
 * Publish a derive to the AFPP global map — opt-in, one derive at a time.
 *
 * What leaves the phone: the alias, the derive's title and times, its
 * compressed trace (rounded to ~1 m), and for each recording its position,
 * duration, name, notes, species tags and audio. Never the device id in
 * public: the server keeps it only to know who may update or unshare.
 *
 * The device key is HMAC(server secret, deviceId), fetched once and kept in
 * localStorage, so no secret ships in the APK.
 */
import { AFPP_API, AFPP_ENABLED } from '../config/afpp.js';
import walkSessionService from './walkSessionService.js';
import localStorageService from './localStorageService.js';
import userAliasService from './userAliasService.js';

const KEY_STORAGE = 'afpp_device_key';
const CONSENT_STORAGE = 'afpp_share_consent';
const UPLOAD_TYPES = ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'video/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-wav'];

/** Server ids are [A-Za-z0-9_.-]; local ones mostly are already. */
export const safeId = (id) => String(id).replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^[^A-Za-z0-9]/, 'x').slice(0, 100);

class AfppShareService {
  get enabled() {
    return AFPP_ENABLED;
  }

  hasConsent() {
    try {
      return localStorage.getItem(CONSENT_STORAGE) === '1';
    } catch {
      return false;
    }
  }

  giveConsent() {
    try {
      localStorage.setItem(CONSENT_STORAGE, '1');
    } catch {
      // asked again next time
    }
  }

  async #headers() {
    const deviceId = safeId(userAliasService.getDeviceId());
    let key = null;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY_STORAGE) || 'null');
      if (saved?.deviceId === deviceId && saved.api === AFPP_API) key = saved.key;
    } catch {
      // fetch a new one
    }
    if (!key) {
      const res = await fetch(`${AFPP_API}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) throw new Error(`register: HTTP ${res.status}`);
      ({ key } = await res.json());
      localStorage.setItem(KEY_STORAGE, JSON.stringify({ deviceId, key, api: AFPP_API }));
    }
    return { 'X-Device-Id': deviceId, 'X-Device-Key': key };
  }

  async #request(method, path, headers, body) {
    const res = await fetch(`${AFPP_API}/api/${path}`, { method, headers, body });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = (await res.json()).error || msg;
      } catch {
        // keep the status
      }
      throw new Error(`${path}: ${msg}`);
    }
    return res.json();
  }

  isShared(sessionId) {
    return Boolean(walkSessionService.getSession(sessionId)?.afppShared);
  }

  /**
   * Upload a derive, then each recording's audio. onProgress(done, total).
   * Safe to repeat: the server upserts, and re-sends only audio it lacks.
   * @returns {{deriveId:string, uploaded:number, failed:Array<{id, error}>}}
   */
  async shareDerive(sessionId, onProgress = () => {}) {
    if (!AFPP_ENABLED) throw new Error('AFPP is not configured in this build');
    const session = walkSessionService.getSession(sessionId);
    if (!session) throw new Error('derive not found');
    const recordings = walkSessionService.getSessionRecordings(sessionId)
      .filter((r) => r.location && Number.isFinite(r.location.lat) && Number.isFinite(r.location.lng));
    const deriveId = safeId(sessionId);
    const headers = await this.#headers();

    const body = {
      alias: session.userAlias || userAliasService.getAlias() || '',
      title: session.title || '',
      startTime: session.startTime,
      endTime: session.endTime,
      breadcrumbs: (session.breadcrumbs || []).map((b) => ({ lat: b.lat, lng: b.lng, timestamp: b.timestamp })),
      recordings: recordings.map((r) => ({
        id: safeId(r.uniqueId || r.filename),
        lat: r.location.lat,
        lng: r.location.lng,
        duration: Number(r.duration) || 0,
        timestamp: r.timestamp,
        name: r.displayName || '',
        notes: r.notes || '',
        tags: Array.isArray(r.speciesTags) ? r.speciesTags : [],
      })),
    };
    const published = await this.#request('PUT', `derives/${deriveId}`, { ...headers, 'Content-Type': 'application/json' }, JSON.stringify(body));
    const hasAudio = new Set(published.recordings.filter((r) => r.audio).map((r) => r.id));

    const failed = [];
    let uploaded = 0;
    onProgress(0, recordings.length);
    for (const [i, r] of recordings.entries()) {
      const rid = safeId(r.uniqueId || r.filename);
      if (!hasAudio.has(rid)) {
        try {
          const blob = await localStorageService.getAudioBlobFlexible(r.uniqueId);
          if (!blob) throw new Error('audio not found on this device');
          const type = UPLOAD_TYPES.includes(blob.type) ? blob.type
            : (r.mimeType && UPLOAD_TYPES.includes(r.mimeType) ? r.mimeType : 'audio/mp4');
          await this.#request('PUT', `derives/${deriveId}/recordings/${rid}`, { ...headers, 'Content-Type': type }, blob);
          localStorageService.markUploaded(r.uniqueId);
          uploaded++;
        } catch (e) {
          failed.push({ id: r.uniqueId, error: e.message });
        }
      }
      onProgress(i + 1, recordings.length);
    }

    walkSessionService.updateSession(sessionId, { afppShared: { at: new Date().toISOString(), deriveId } });
    return { deriveId, uploaded, failed };
  }

  async unshareDerive(sessionId) {
    if (!AFPP_ENABLED) return;
    const headers = await this.#headers();
    try {
      await this.#request('DELETE', `derives/${safeId(sessionId)}`, headers);
    } catch (e) {
      if (!/HTTP 404|not found/.test(e.message)) throw e;
    }
    walkSessionService.updateSession(sessionId, { afppShared: null });
  }
}

const afppShareService = new AfppShareService();
export default afppShareService;
