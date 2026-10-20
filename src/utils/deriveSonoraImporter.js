// Derive Sonora Importer
// Imports a Derive Sonora ZIP package into local storage
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
import JSZip from 'jszip';
import walkSessionService from '../services/walkSessionService.js';
import localStorageService from '../services/localStorageService.js';
import breadcrumbService from '../services/breadcrumbService.js';

class DeriveSonoraImporter {

  /**
   * Small deterministic hash (djb2) used to derive stable IDs for packages
   * that predate uniqueId metadata — re-importing the same ZIP always
   * produces the same IDs, so the upsert in saveRecording dedupes.
   */
  static _hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }

  /**
   * Check if a ZIP file is a Derive Sonora package.
   * Returns the manifest if valid, null otherwise.
   */
  static async detectDerivePackage(zipFile) {
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) return null;

      const manifestText = await manifestFile.async('text');
      const manifest = JSON.parse(manifestText);
      if (manifest.packageType === 'derive_sonora') return manifest;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Import a Derive Sonora package.
   * @param {File|Blob} zipFile
   * @returns {Object} Import summary
   */
  static async importDerive(zipFile) {
    const zip = await JSZip.loadAsync(zipFile);

    // 1. Read manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('Not a valid Derive Sonora package (missing manifest.json)');
    const manifest = JSON.parse(await manifestFile.async('text'));
    if (manifest.packageType !== 'derive_sonora') {
      throw new Error('Invalid package type: ' + manifest.packageType);
    }

    // 2. Read session
    const sessionFile = zip.file('session/session.json');
    if (!sessionFile) throw new Error('Missing session data');
    const sessionData = JSON.parse(await sessionFile.async('text'));

    // 3. Read breadcrumbs from GeoJSON
    let breadcrumbs = [];
    const geojsonFile = zip.file('session/tracklog.geojson');
    if (geojsonFile) {
      try {
        const geojson = JSON.parse(await geojsonFile.async('text'));
        const pointFeatures = geojson.features?.filter(f => f.geometry?.type === 'Point') || [];
        breadcrumbs = pointFeatures.map(f => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          timestamp: f.properties?.timestamp || 0,
          audioLevel: f.properties?.audioLevel || 0,
          isMoving: f.properties?.isMoving || false,
          movementSpeed: f.properties?.movementSpeed || 0,
          direction: f.properties?.direction || null,
          accuracy: f.properties?.accuracy || null,
          altitude: f.properties?.altitude || null
        }));
      } catch (e) {
        console.warn('Failed to parse GeoJSON breadcrumbs:', e);
      }
    }

    // Compress imported breadcrumbs the same way live capture does on
    // endSession — uncompressed imported tracklogs were the remaining
    // QuotaExceededError vector in the shared soundwalk_sessions key.
    if (breadcrumbs.length > 2) {
      try {
        breadcrumbs = breadcrumbService.compressBreadcrumbs(breadcrumbs, 5);
      } catch (e) {
        console.warn('Breadcrumb compression failed, storing raw:', e);
      }
    }

    // 4. Deterministic identity — re-importing the same package must never
    // duplicate anything (saveRecording upserts by uniqueId; sessions are
    // replaced in place by sessionId).
    const originalSessionId =
      sessionData.sessionId ||
      manifest.session?.sessionId ||
      `pkg-${this._hash(`${manifest.createdBy?.deviceId}|${manifest.session?.startTime}|${manifest.session?.title}`)}`;

    const sessionsKey = 'soundwalk_sessions';
    let sessions = [];
    try {
      const raw = localStorage.getItem(sessionsKey);
      sessions = raw ? JSON.parse(raw) : [];
    } catch { /* empty */ }

    // Self-import (this device recorded the drift): the session and its
    // recordings already live here. Only restore recordings that were
    // deleted locally — never duplicate the session or overwrite data.
    const selfImport = sessions.some(s => s.sessionId === originalSessionId);
    const importedSessionId = selfImport ? originalSessionId : `imported_${originalSessionId}`;

    const importedRecordingIds = [];
    const errors = [];
    let restoredCount = 0;
    const metadataFolder = zip.folder('metadata');
    const audioFolder = zip.folder('audio');

    if (metadataFolder) {
      const metaFiles = [];
      metadataFolder.forEach((relativePath, file) => {
        if (relativePath.endsWith('_metadata.json')) {
          metaFiles.push(file);
        }
      });

      const existingIds = new Set(localStorageService.getAllRecordings().map(r => r.uniqueId));

      for (const metaFile of metaFiles) {
        let label = metaFile.name;
        try {
          const metaText = await metaFile.async('text');
          const recording = this._normalizeRecording(JSON.parse(metaText));
          label = recording.filename || label;

          const originalId =
            recording.uniqueId ||
            `rec-${this._hash(`${originalSessionId}|${recording.filename}|${recording.timestamp}`)}`;

          if (selfImport) {
            // Restore-only semantics on the recording device
            recording.uniqueId = originalId;
            if (existingIds.has(originalId)) {
              importedRecordingIds.push(originalId);
              continue; // already present — leave untouched
            }
          } else {
            // Namespace by package so recordings from different devices can
            // never collide, and the same package always maps to the same id
            recording.uniqueId = `imp_${this._hash(originalSessionId)}_${originalId}`;
            recording.importedFrom = manifest.createdBy?.alias || 'unknown';
            recording.importedSessionId = originalSessionId;
            recording.walkSessionId = importedSessionId;
          }

          // Normalize duration so saveRecording's validation can't silently
          // drop an otherwise fine recording (mirror of tracklogImporter)
          recording.duration = Math.max(1, Math.round(Number(recording.duration) || 0) || 1);

          // Find the audio entry — basename only, foreign paths never match
          let audioBlob = null;
          if (audioFolder) {
            const rawName = recording.filename || `${originalId}.webm`;
            const audioFilename = String(rawName).split('/').pop();
            const audioFile = zip.file(`audio/${audioFilename}`);
            if (audioFile) {
              audioBlob = await audioFile.async('blob');
            }
          }

          await localStorageService.saveRecording(recording, audioBlob);
          importedRecordingIds.push(recording.uniqueId);
          if (selfImport) restoredCount++;
        } catch (e) {
          console.warn('Failed to import recording:', e);
          errors.push(`${label}: ${e.message || e}`);
        }
      }
    }

    let importedSession = null;
    if (!selfImport) {
      // 5. Create or update the imported session entry (idempotent)
      importedSession = {
        sessionId: importedSessionId,
        userAlias: manifest.createdBy?.alias || 'imported',
        deviceId: manifest.createdBy?.deviceId || 'imported',
        title: sessionData.title || manifest.session?.title || 'Imported Derive',
        description: sessionData.description || '',
        startTime: sessionData.startTime || new Date(manifest.session?.startTime).getTime(),
        endTime: sessionData.endTime || new Date(manifest.session?.endTime).getTime(),
        status: 'completed',
        breadcrumbs: breadcrumbs,
        recordingIds: importedRecordingIds,
        summary: sessionData.summary || {
          totalDistance: manifest.session?.totalDistance || 0,
          totalRecordings: importedRecordingIds.length,
          breadcrumbCount: breadcrumbs.length
        },
        importedAt: new Date().toISOString(),
        importedFromPackage: originalSessionId
      };

      const existingIdx = sessions.findIndex(s => s.sessionId === importedSessionId);
      if (existingIdx >= 0) {
        sessions[existingIdx] = importedSession;
      } else {
        sessions.push(importedSession);
      }
      localStorage.setItem(sessionsKey, JSON.stringify(sessions));
    }

    return {
      sessionId: importedSessionId,
      recordingsImported: importedRecordingIds.length,
      recordingsFailed: errors.length,
      errors,
      breadcrumbsImported: selfImport ? 0 : breadcrumbs.length,
      restoredCount: selfImport ? restoredCount : undefined,
      selfImport,
      userAlias: importedSession?.userAlias || manifest.createdBy?.alias || 'imported',
      title: importedSession?.title || sessionData.title || ''
    };
  }
  /**
   * Normalize recording metadata from v2.0 (flat) or v2.1 (structured) into
   * the flat format the app uses internally. If v2.1 structured blocks exist,
   * lift their fields to top-level. If only flat fields exist (v2.0), use them
   * as-is. This makes the importer forward AND backward compatible.
   */
  static _normalizeRecording(raw) {
    const rec = { ...raw };

    // v2.1 structured → lift to flat (structured blocks take precedence)
    if (raw.capture) {
      if (!rec.location && (raw.capture.lat != null || raw.capture.lng != null)) {
        rec.location = { lat: raw.capture.lat, lng: raw.capture.lng };
      }
      if (raw.capture.timestamp && !rec.timestamp) rec.timestamp = raw.capture.timestamp;
      if (raw.capture.altitude != null) rec.altitude = raw.capture.altitude;
      if (raw.capture.gpsAccuracy != null) rec.gpsAccuracy = raw.capture.gpsAccuracy;
      if (raw.capture.deviceModel) rec.deviceModel = raw.capture.deviceModel;
    }

    if (raw.bioacoustic) {
      const b = raw.bioacoustic;
      if (b.speciesTags) rec.speciesTags = b.speciesTags;
      if (b.habitat) rec.habitat = b.habitat;
      // v2.1 uses verticalStratum, app uses heightPosition
      if (b.verticalStratum) rec.heightPosition = b.verticalStratum;
      if (b.distanceEstimate) rec.distanceEstimate = b.distanceEstimate;
      if (b.activityType) rec.activityType = b.activityType;
      if (b.anthropophony) rec.anthropophony = b.anthropophony;
      if (b.weather) rec.weather = b.weather;
      if (b.temperature) rec.temperature = b.temperature;
      if (b.quality) rec.quality = b.quality;
      if (b.movementPattern) rec.movementPattern = b.movementPattern;
    }

    if (raw.provenance) {
      if (raw.provenance.recordedBy) rec.importedFrom = raw.provenance.recordedBy;
      if (raw.provenance.importedAt) rec.importedAt = raw.provenance.importedAt;
    }

    if (raw.session) {
      if (raw.session.walkSessionId) rec.walkSessionId = raw.session.walkSessionId;
      if (raw.session.originalSessionId) rec.importedSessionId = raw.session.originalSessionId;
    }

    // Use id field from v2.1 if uniqueId not present
    if (!rec.uniqueId && raw.id) rec.uniqueId = raw.id;

    // Ensure speciesTags is always an array
    if (!Array.isArray(rec.speciesTags)) rec.speciesTags = [];

    // Strip device-specific and heavyweight fields:
    // - audioPath points at the exporting device's filesystem; keeping it
    //   creates unplayable orphans that survive cleanup passes
    // - inline breadcrumbs/sessions bloat the recordings array and were a
    //   QuotaExceededError source (the session tracklog travels separately)
    delete rec.audioPath;
    delete rec.audioBlob;
    delete rec.breadcrumbs;
    delete rec.breadcrumbSession;

    return rec;
  }
}

export default DeriveSonoraImporter;
