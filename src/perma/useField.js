/**
 * Everything that happens in the field, as one hook, on top of SoundWalk's
 * engines (unchanged): locationService (GPS), walkSessionService +
 * breadcrumbService (the derive and its trace), localStorageService (sounds).
 *
 *   gps          {lat, lng, accuracy} | null, error string
 *   derive       the active session | null; trace = its live breadcrumbs
 *   recording    {since} while the mic is open
 *   take         {blob, durationSec, mimeType, location} waiting to be saved
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import locationService from '../services/locationService.js';
import permissionManager from '../services/permissionManager.js';
import walkSessionService from '../services/walkSessionService.js';
import breadcrumbService from '../services/breadcrumbService.js';
import localStorageService from '../services/localStorageService.js';
import { startRecording, stopRecording, cancelRecording } from './recorder.js';

const MAX_TAKE_SEC = 300; // five minutes, as in SoundWalk
const isNative = () => !!window.Capacitor?.isNativePlatform?.();

export default function useField() {
  const [gps, setGps] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [derive, setDerive] = useState(() => walkSessionService.getActiveSession());
  const [trace, setTrace] = useState([]);
  const [recording, setRecording] = useState(null);
  const [take, setTake] = useState(null);
  const [version, setVersion] = useState(0); // bumps when saved data changes
  const gpsRef = useRef(null);
  const autoStop = useRef(null);

  const bump = () => setVersion((v) => v + 1);

  // ── GPS: one watch for the life of the screen; it feeds the trace. ────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (isNative()) {
        const p = await permissionManager.requestLocationPermission();
        if (!p.granted && alive) setGpsError('denied');
      }
      await locationService.startLocationWatch(
        (pos) => {
          if (!alive) return;
          gpsRef.current = pos;
          setGps(pos);
          setGpsError(null);
          const active = walkSessionService.getActiveSession();
          if (active) {
            // A derive left running (app closed mid-walk) resumes its trace.
            if (!breadcrumbService.isTrackingActive()) walkSessionService.resumeTracking(pos);
            breadcrumbService.feedPosition(pos);
            setTrace(breadcrumbService.getCurrentBreadcrumbs().map((b) => [b.lat, b.lng]));
          }
        },
        (err) => alive && setGpsError(err.message || 'gps'),
      );
    })();
    return () => {
      alive = false;
      locationService.stopLocationWatch();
    };
  }, []);

  // ── Derive ───────────────────────────────────────────────────────────────
  const startDerive = useCallback(async () => {
    if (walkSessionService.getActiveSession()) return walkSessionService.getActiveSession();
    const s = walkSessionService.startSession('');
    if (gpsRef.current) await walkSessionService.startTracking(gpsRef.current);
    setDerive(s);
    setTrace(gpsRef.current ? [[gpsRef.current.lat, gpsRef.current.lng]] : []);
    return s;
  }, []);

  /** Ends the derive; returns the finished session (for the share prompt). */
  const endDerive = useCallback((title = '') => {
    const active = walkSessionService.getActiveSession();
    if (!active) return null;
    if (title) walkSessionService.updateSession(active.sessionId, { title });
    const done = walkSessionService.endSession(active.sessionId);
    setDerive(null);
    setTrace([]);
    bump();
    return done;
  }, []);

  // ── Recording ────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    clearTimeout(autoStop.current);
    try {
      const result = await stopRecording();
      setTake({ ...result, location: gpsRef.current });
    } finally {
      setRecording(null);
    }
  }, []);

  const record = useCallback(async () => {
    if (!gpsRef.current) throw new Error('nogps');
    await startDerive(); // a sound always belongs to a derive
    await startRecording();
    setRecording({ since: Date.now() });
    autoStop.current = setTimeout(() => stop().catch(() => {}), MAX_TAKE_SEC * 1000);
  }, [startDerive, stop]);

  useEffect(() => () => {
    clearTimeout(autoStop.current);
    cancelRecording();
  }, []);

  /** Keep the take: into storage and into the active derive. */
  const saveTake = useCallback(async ({ name = '', notes = '' } = {}) => {
    if (!take) return null;
    const location = take.location || gpsRef.current;
    if (!location) throw new Error('nogps');
    const session = walkSessionService.getActiveSession();
    const id = `recording-${Date.now()}`;
    const ext = take.mimeType.includes('aac') ? 'aac' : take.mimeType.includes('webm') ? 'webm' : take.mimeType.includes('ogg') ? 'ogg' : 'm4a';
    const meta = {
      uniqueId: id,
      filename: `${id}.${ext}`,
      displayName: name.trim(),
      notes: notes.trim(),
      speciesTags: [],
      timestamp: new Date().toISOString(),
      duration: Math.max(1, Math.round(take.durationSec)),
      fileSize: take.blob.size,
      mimeType: take.mimeType,
      location: { lat: location.lat, lng: location.lng, accuracy: location.accuracy ?? null },
      altitude: location.altitude ?? null,
      walkSessionId: session?.sessionId || null,
    };
    await localStorageService.saveRecording(meta, take.blob);
    if (session) walkSessionService.addRecordingToSession(session.sessionId, id);
    setTake(null);
    setDerive(walkSessionService.getActiveSession());
    bump();
    return meta;
  }, [take]);

  const discardTake = useCallback(() => setTake(null), []);

  return { gps, gpsError, derive, trace, recording, take, version, startDerive, endDerive, record, stop, saveTake, discardTake, refresh: bump };
}
