/**
 * DeriveController — single authority for automatic walk session lifecycle.
 *
 * Replaces the scattered auto-derive logic that previously lived inline inside
 * UnifiedMap's GPS callback.  UnifiedMap now calls feedPosition() on every GPS
 * tick; everything else (start, stop, drift guard, inactivity) is decided here.
 *
 * @fileoverview Part of the BioMapp project, Reserva MANAKAI.
 * Copyright (c) 2026 Alejandro Duque Jaramillo. All rights reserved.
 * CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
 */

import walkSessionService from './walkSessionService.js';
import breadcrumbService from './breadcrumbService.js';

// ── Tunable constants ────────────────────────────────────────────────────────

/** GPS positions with accuracy worse than this are silently ignored. */
const ACCURACY_FILTER_M = 30;

/**
 * Minimum movement (metres) required to count as a real step.
 * Also scaled by accuracy: threshold = max(MIN_MOVEMENT_M, accuracy × ACCURACY_SCALE).
 */
const MIN_MOVEMENT_M = 5;
const ACCURACY_SCALE = 1.5;

/**
 * Number of consecutive GPS ticks that must each show genuine movement before
 * the derive auto-starts.  Set to 2 so that a single drifting fix cannot
 * trigger a session on its own.
 */
const CONSECUTIVE_TICKS_TO_START = 2;

/** Auto-stop the active session after this many ms without real movement. */
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ── Controller ──────────────────────────────────────────────────────────────

class DeriveController {
  constructor() {
    /** Last position used as the movement anchor. */
    this._anchor = null;
    /** Timestamp of the last genuine movement tick. */
    this._lastMovedAt = Date.now();
    /**
     * Counter of consecutive ticks that each showed genuine movement.
     * Auto-start only fires when this reaches CONSECUTIVE_TICKS_TO_START.
     */
    this._consecutiveMoveTicks = 0;

    // ── Callbacks set by UnifiedMap ──
    /** Called with the new session object when a derive auto-starts. */
    this.onSessionStart = null;
    /** Called (no args) when a derive auto-stops due to inactivity. */
    this.onSessionStop = null;
  }

  /**
   * Feed a GPS position from UnifiedMap's location watch.
   * This is the single entry point for all derive automation.
   *
   * @param {{ lat: number, lng: number, accuracy?: number }} position
   * @param {object|null} activeSession  Current activeWalkSession React state value
   * @returns {number} Metres moved on this tick (0 if drift/poor accuracy).
   *   Caller can accumulate this for auto-zoom without duplicating haversine math.
   */
  feedPosition(position, activeSession) {
    const accuracy = position.accuracy ?? 999;

    // 1. Discard poor-accuracy fixes entirely
    if (accuracy > ACCURACY_FILTER_M) {
      this._consecutiveMoveTicks = 0; // reset — don't let a later good fix inherit partial count
      return 0;
    }

    const threshold = Math.max(MIN_MOVEMENT_M, accuracy * ACCURACY_SCALE);

    if (!this._anchor) {
      // First good fix — just set the anchor, don't start anything yet
      this._anchor = position;
      return 0;
    }

    const dist = this._haversine(this._anchor, position);
    const isGenuineMove = dist >= threshold;

    if (isGenuineMove) {
      this._consecutiveMoveTicks++;
      this._lastMovedAt = Date.now();
      this._anchor = position; // advance anchor only on real movement

      if (!activeSession && this._consecutiveMoveTicks >= CONSECUTIVE_TICKS_TO_START) {
        // ── Auto-start ──────────────────────────────────────────────────
        this._consecutiveMoveTicks = 0;
        const session = walkSessionService.startSession();
        breadcrumbService.startTracking(session.sessionId, position);
        if (this.onSessionStart) this.onSessionStart(session);
      }

      return dist;
    } else {
      // Position didn't move enough — reset the consecutive counter so drift
      // cannot accumulate across non-moving ticks to trigger a start
      this._consecutiveMoveTicks = 0;

      // ── Auto-stop check (inactivity) ───────────────────────────────
      if (activeSession && Date.now() - this._lastMovedAt > INACTIVITY_TIMEOUT_MS) {
        walkSessionService.endSession(activeSession.sessionId);
        this._lastMovedAt = Date.now(); // reset so we don't fire again immediately
        if (this.onSessionStop) this.onSessionStop();
      }

      return 0;
    }
  }

  /**
   * Call this when a manual session start happens (handleStartDerive) so the
   * controller's internal state is consistent.
   */
  notifyManualStart(position) {
    this._anchor = position || this._anchor;
    this._lastMovedAt = Date.now();
    this._consecutiveMoveTicks = 0;
  }

  /**
   * Call this when any session ends (manual or auto) so the inactivity clock
   * doesn't fire a spurious second stop.
   */
  notifySessionEnded() {
    this._lastMovedAt = Date.now();
    this._consecutiveMoveTicks = 0;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _haversine(a, b) {
    const R = 6371e3;
    const φ1 = a.lat * Math.PI / 180;
    const φ2 = b.lat * Math.PI / 180;
    const Δφ = (b.lat - a.lat) * Math.PI / 180;
    const Δλ = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
}

const deriveController = new DeriveController();
export default deriveController;
