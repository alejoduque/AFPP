// Walk Session Service - manages Derive Sonora walk sessions
// Ties together GPS tracklogs + recordings into a coherent session
/**
 * @fileoverview This file is part of the BioMapp project, developed for Reserva MANAKAI.
 *
 * Copyright (c) 2026 Alejandro Duque Jaramillo. All rights reserved.
 *
 * This code is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) License.
 * For the full license text, please visit: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
 *
 * You are free to:
 * - Share — copy and redistribute the material in any medium or format.
 * - Adapt — remix, transform, and build upon the material.
 *
 * Under the following terms:
 * - Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
 * - NonCommercial — You may not use the material for commercial purposes. This includes, but is not limited to, any use of the code (including for training artificial intelligence models) that is primarily intended for or directed towards commercial advantage or monetary compensation.
 * - ShareAlike — If you remix, transform, and build upon the material, you must distribute your contributions under the same license as the original.
 *
 * This license applies to all forms of use, including by automated systems or artificial intelligence models,
 * to prevent unauthorized commercial exploitation and ensure proper attribution.
 */
import config from '../config.json';
import breadcrumbService from './breadcrumbService.js';
import localStorageService from './localStorageService.js';
import userAliasService from './userAliasService.js';

const SESSIONS_KEY = config.storage?.sessionsKey || 'soundwalk_sessions';
const PERSIST_INTERVAL = 30000; // Save breadcrumbs every 30 seconds

class WalkSessionService {
  constructor() {
    this._persistTimer = null;
  }

  /**
   * If an active session exists from a previous app run, auto-end it
   * with a placeholder title so the timer doesn't keep counting.
   * Returns the saved session or null.
   */
  autoSaveStaleSession() {
    const active = this.getActiveSession();
    if (!active) return null;

    console.log('Found stale active session, auto-saving:', active.sessionId);
    const title = active.title || 'Sound Drift (unfinished)';
    this.updateSession(active.sessionId, { title });
    return this.endSession(active.sessionId);
  }

  // --- Session lifecycle ---

  startSession(title = '') {
    if (this.getActiveSession()) {
      throw new Error('A walk session is already active. End it first.');
    }

    const alias = userAliasService.getAlias() || 'anon';
    const deviceId = userAliasService.getDeviceId();
    const now = Date.now();

    const session = {
      sessionId: `derive_${now}`,
      userAlias: alias,
      deviceId,
      title: title || '',
      description: '',
      startTime: now,
      endTime: null,
      status: 'active',
      breadcrumbs: [],
      recordingIds: [],
      summary: null
    };

    const sessions = this._getAllSessions();
    sessions.push(session);
    this._saveSessions(sessions);

    // Start breadcrumb tracking via breadcrumbService
    // (caller should provide userLocation and call breadcrumbService.startTracking separately
    //  since GPS location may not be available synchronously)

    // Start periodic persistence
    this._startPersistence(session.sessionId);

    console.log('Walk session started:', session.sessionId);
    return session;
  }

  /**
   * Start GPS tracking for the active session.
   * Call this after startSession once userLocation is available.
   */
  async startTracking(userLocation) {
    const session = this.getActiveSession();
    if (!session) return;

    if (!breadcrumbService.isTrackingActive()) {
      await breadcrumbService.startTracking(session.sessionId, userLocation);
    }
  }

  /**
   * Pick up an active session after the app was closed mid-derive: reload the
   * trace persisted so far (startTracking alone would start it empty) and
   * restart periodic persistence.
   */
  resumeTracking(userLocation) {
    const session = this.getActiveSession();
    if (!session) return;
    if (!breadcrumbService.isTrackingActive()) {
      breadcrumbService.startTracking(session.sessionId, null);
      breadcrumbService.loadBreadcrumbs(session.breadcrumbs || []);
      const current = breadcrumbService.getCurrentSession();
      if (current) current.startTime = session.startTime;
      if (userLocation) breadcrumbService.feedPosition(userLocation);
    }
    this._startPersistence(session.sessionId);
  }

  endSession(sessionId) {
    const sessions = this._getAllSessions();
    const idx = sessions.findIndex(s => s.sessionId === sessionId && s.status === 'active');
    if (idx === -1) return null;

    this._stopPersistence();

    // Get final breadcrumbs from breadcrumbService
    let sessionData = null;
    if (breadcrumbService.isTrackingActive()) {
      sessionData = breadcrumbService.stopTracking();
    }

    const now = Date.now();
    sessions[idx].endTime = now;
    sessions[idx].status = 'completed';

    if (sessionData) {
      // Compress breadcrumbs for storage efficiency
      const compressed = breadcrumbService.compressBreadcrumbs(sessionData.breadcrumbs, 3);
      sessions[idx].breadcrumbs = compressed;
      sessions[idx].summary = {
        ...sessionData.summary,
        totalRecordings: sessions[idx].recordingIds.length,
        totalAudioDuration: this._computeTotalAudioDuration(sessions[idx].recordingIds),
        breadcrumbCount: compressed.length,
        rawBreadcrumbCount: sessionData.breadcrumbs.length
      };
    } else {
      // If tracking wasn't active, finalize with whatever breadcrumbs were persisted
      sessions[idx].summary = {
        totalDistance: 0,
        averageSpeed: 0,
        maxSpeed: 0,
        stationaryTime: 0,
        movingTime: 0,
        pattern: 'unknown',
        totalRecordings: sessions[idx].recordingIds.length,
        totalAudioDuration: this._computeTotalAudioDuration(sessions[idx].recordingIds),
        breadcrumbCount: sessions[idx].breadcrumbs.length,
        rawBreadcrumbCount: sessions[idx].breadcrumbs.length
      };
    }

    this._saveSessions(sessions);
    console.log('Walk session ended:', sessionId);
    return sessions[idx];
  }

  // --- Recording linking ---

  addRecordingToSession(sessionId, recordingId) {
    const sessions = this._getAllSessions();
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) return false;

    if (!session.recordingIds.includes(recordingId)) {
      session.recordingIds.push(recordingId);
      this._saveSessions(sessions);
    }
    return true;
  }

  // --- Queries ---

  getActiveSession() {
    return this._getAllSessions().find(s => s.status === 'active') || null;
  }

  getSession(sessionId) {
    return this._getAllSessions().find(s => s.sessionId === sessionId) || null;
  }

  getAllSessions() {
    return this._getAllSessions().filter(s => s.status !== 'deleted');
  }

  getCompletedSessions() {
    return this._getAllSessions().filter(s => s.status === 'completed' || s.status === 'exported');
  }

  getSessionRecordings(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return [];
    return session.recordingIds
      .map(id => localStorageService.getRecording(id))
      .filter(Boolean);
  }

  // --- Mutations ---

  updateSession(sessionId, updates) {
    const sessions = this._getAllSessions();
    const idx = sessions.findIndex(s => s.sessionId === sessionId);
    if (idx === -1) return false;

    const { sessionId: _id, status: _status, ...safeUpdates } = updates;
    Object.assign(sessions[idx], safeUpdates);
    this._saveSessions(sessions);
    return true;
  }

  markExported(sessionId) {
    const sessions = this._getAllSessions();
    const idx = sessions.findIndex(s => s.sessionId === sessionId);
    if (idx === -1) return false;
    sessions[idx].status = 'exported';
    sessions[idx].exportedAt = new Date().toISOString();
    this._saveSessions(sessions);
    return true;
  }

  deleteSession(sessionId) {
    const sessions = this._getAllSessions();
    const filtered = sessions.filter(s => s.sessionId !== sessionId);
    if (filtered.length === sessions.length) return false;
    this._saveSessions(filtered);
    return true;
  }

  // --- Breadcrumb persistence ---

  persistBreadcrumbs(sessionId) {
    if (!breadcrumbService.isTrackingActive()) return;

    const sessionData = breadcrumbService.getSessionData();
    if (!sessionData || !sessionData.breadcrumbs) return;

    const sessions = this._getAllSessions();
    const idx = sessions.findIndex(s => s.sessionId === sessionId);
    if (idx === -1) return;

    // Store compressed version to save space
    const compressed = breadcrumbService.compressBreadcrumbs(sessionData.breadcrumbs, 5);
    sessions[idx].breadcrumbs = compressed;
    this._saveSessions(sessions);
  }

  _startPersistence(sessionId) {
    this._stopPersistence();
    this._persistTimer = setInterval(() => {
      this.persistBreadcrumbs(sessionId);
    }, PERSIST_INTERVAL);
  }

  _stopPersistence() {
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }
  }

  // --- Internal helpers ---

  _getAllSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Error reading sessions:', e);
      return [];
    }
  }

  _saveSessions(sessions) {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('Error saving sessions:', e);
    }
  }

  _computeTotalAudioDuration(recordingIds) {
    return recordingIds.reduce((total, id) => {
      const rec = localStorageService.getRecording(id);
      return total + (rec?.duration || 0);
    }, 0);
  }
}

const walkSessionService = new WalkSessionService();
export default walkSessionService;
