// Tracklog Importer Utility
// Imports tracklogs from other users and handles location reassignment

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
import breadcrumbService from '../services/breadcrumbService.js';
import localStorageService from '../services/localStorageService.js';
import DeriveSonoraImporter from './deriveSonoraImporter.js';
import { t } from '../i18n';

class TracklogImporter {

  /**
   * Import a tracklog from a ZIP file
   * @param {File} zipFile - The ZIP file containing the tracklog
   * @param {Object} options - Import options
   */
  static async importTracklogFromZip(zipFile, options = {}) {
    try {
      // Check if this is a Derive Sonora package first
      const deriveManifest = await DeriveSonoraImporter.detectDerivePackage(zipFile);
      if (deriveManifest) {
        console.log('Detected Derive Sonora package, delegating to DeriveSonoraImporter');
        return await DeriveSonoraImporter.importDerive(zipFile);
      }

      // Legacy tracklog/tracklog.json packages stored their breadcrumbs in a
      // localStorage key nothing ever read — the data was silently lost. No
      // current version produces this format, so fail with a clear message
      // instead of pretending to import.
      throw new Error(t('import.legacyUnsupported'));
    } catch (error) {
      console.error('Error importing tracklog:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Import audio files from ZIP
   */
  static async importAudioFiles(zipContent, options = {}) {
    const importedRecordings = [];
    const importErrors = [];

    // Build filename → metadata lookup from all metadata/*.json files
    // The exporter names audio by recording.filename but metadata by recording.uniqueId,
    // so we can't simply strip the extension — we must scan all metadata files.
    const metadataByFilename = {};
    const metadataByUniqueId = {};
    const metadataPaths = Object.keys(zipContent.files).filter(k => k.startsWith('metadata/') && k.endsWith('.json'));
    for (const mPath of metadataPaths) {
      try {
        const meta = JSON.parse(await zipContent.file(mPath).async('string'));
        if (meta.filename) metadataByFilename[meta.filename] = meta;
        if (meta.uniqueId) metadataByUniqueId[meta.uniqueId] = meta;
      } catch (e) { /* skip malformed */ }
    }

    // Get all audio files
    const audioFiles = Object.keys(zipContent.files).filter(key =>
      key.startsWith('audio/') && !key.endsWith('/')
    );

    for (const audioPath of audioFiles) {
      try {
        // Get audio file
        const audioBlob = await zipContent.file(audioPath).async('blob');
        const filename = audioPath.replace('audio/', '');
        const filenameNoExt = filename.replace(/\.[^/.]+$/, '');

        // Look up metadata: by filename, then by uniqueId match, then fallback
        let metadata = metadataByFilename[filename]
          || metadataByUniqueId[filenameNoExt]
          || metadataByFilename[filenameNoExt]
          || null;

        if (!metadata) {
          // Create basic metadata if not available
          metadata = {
            uniqueId: filenameNoExt,
            filename: filename,
            timestamp: new Date().toISOString(),
            duration: 0,
            location: null,
            speciesTags: [],
            notes: 'Imported recording'
          };
        }

        // Apply location transformation if specified
        if (options.locationTransform) {
          metadata.location = this.transformLocation(metadata.location, options.locationTransform);
        }

        // Apply time offset if specified
        if (options.timeOffset) {
          const originalTime = new Date(metadata.timestamp).getTime();
          metadata.timestamp = new Date(originalTime + options.timeOffset).toISOString();
        }

        // Skip recordings with no location — can't place them on the map
        if (!metadata.location || !metadata.location.lat || !metadata.location.lng) {
          console.warn(`Skipping ${filename}: no GPS location in metadata`);
          importErrors.push(`${filename}: ${t('import.noGpsErr')}`);
          continue;
        }

        // Ensure duration is positive (use 1s minimum for import)
        if (!metadata.duration || metadata.duration <= 0) {
          metadata.duration = 1;
        }

        // Strip fields that don't belong in the recording metadata store:
        // - audioPath: points to exporter's device filesystem, not this device
        // - breadcrumbs / markers / breadcrumbSession: GPS trail data; can be
        //   hundreds of entries per recording (45KB+) and causes localStorage
        //   QuotaExceededError after a few recordings, silently dropping the rest
        delete metadata.audioPath;
        delete metadata.breadcrumbs;
        delete metadata.markers;
        delete metadata.breadcrumbSession;

        // Save recording
        const newRecordingId = await localStorageService.saveRecording(metadata, audioBlob);
        importedRecordings.push({
          originalId: metadata.uniqueId || filenameNoExt,
          newId: newRecordingId,
          filename: filename
        });

      } catch (error) {
        const filename = audioPath.replace('audio/', '');
        console.warn(`Failed to import audio file ${audioPath}:`, error);
        importErrors.push(`${filename}: ${error.message}`);
      }
    }

    // Attach errors to the result array so callers can surface them
    importedRecordings._errors = importErrors;
    return importedRecordings;
  }

  /**
   * Transform location based on transformation options
   */
  static transformLocation(location, transform) {
    if (!location) return null;
    
    let newLocation = { ...location };
    
    // Apply translation
    if (transform.translate) {
      newLocation.lat += transform.translate.lat || 0;
      newLocation.lng += transform.translate.lng || 0;
    }
    
    // Apply scaling
    if (transform.scale) {
      const center = transform.center || { lat: 0, lng: 0 };
      newLocation.lat = center.lat + (newLocation.lat - center.lat) * (transform.scale || 1);
      newLocation.lng = center.lng + (newLocation.lng - center.lng) * (transform.scale || 1);
    }
    
    // Apply rotation (around center point)
    if (transform.rotate) {
      const center = transform.center || { lat: 0, lng: 0 };
      const angle = transform.rotate * Math.PI / 180; // Convert to radians
      
      const dx = newLocation.lng - center.lng;
      const dy = newLocation.lat - center.lat;
      
      newLocation.lng = center.lng + dx * Math.cos(angle) - dy * Math.sin(angle);
      newLocation.lat = center.lat + dx * Math.sin(angle) + dy * Math.cos(angle);
    }
    
    return newLocation;
  }

  /**
   * Import audio-only export ZIP (from recordingExporter.js — has audio/ + metadata/ + export_summary.json)
   *
   * For old-format ZIPs (no sessions/*.json) breadcrumbs are embedded in each
   * metadata/*.json file.  We reconstruct soundwalk_sessions entries from those
   * breadcrumbs BEFORE importAudioFiles strips them, so the GPS tracklogs remain
   * visible on the map after import.
   */
  static async importAudioExportZip(zipFile) {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(zipFile);

    // --- Reconstruct soundwalk_sessions from embedded breadcrumbs (old-format ZIPs) ---
    // New-format ZIPs have sessions/*.json; old-format embed breadcrumbs in each metadata file.
    const hasSessions = Object.keys(zipContent.files).some(k => k.startsWith('sessions/') && k.endsWith('.json'));
    let importedBreadcrumbs = 0;

    if (!hasSessions) {
      // Old format: gather breadcrumbs per walkSessionId from metadata files
      const sessionGroups = {};   // walkSessionId → { breadcrumbs[], startTime, endTime }
      const metadataPaths = Object.keys(zipContent.files).filter(k => k.startsWith('metadata/') && k.endsWith('.json'));
      for (const mPath of metadataPaths) {
        try {
          const meta = JSON.parse(await zipContent.file(mPath).async('string'));
          if (!meta.walkSessionId || !Array.isArray(meta.breadcrumbs) || !meta.breadcrumbs.length) continue;
          if (!sessionGroups[meta.walkSessionId]) {
            sessionGroups[meta.walkSessionId] = { breadcrumbs: [], startTime: Infinity, endTime: -Infinity };
          }
          for (const bc of meta.breadcrumbs) {
            sessionGroups[meta.walkSessionId].breadcrumbs.push(bc);
            const t = bc.timestamp || 0;
            if (t < sessionGroups[meta.walkSessionId].startTime) sessionGroups[meta.walkSessionId].startTime = t;
            if (t > sessionGroups[meta.walkSessionId].endTime) sessionGroups[meta.walkSessionId].endTime = t;
          }
        } catch (e) { /* skip malformed */ }
      }

      // Merge reconstructed sessions into soundwalk_sessions (upsert by sessionId)
      const SESSIONS_KEY = 'soundwalk_sessions';
      let existingSessions = [];
      try { existingSessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch (e) {}
      for (const [sessionId, group] of Object.entries(sessionGroups)) {
        // Sort breadcrumbs by timestamp
        group.breadcrumbs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const reconstructed = {
          sessionId,
          userAlias: 'imported',
          title: '',
          description: '',
          startTime: group.startTime === Infinity ? Date.now() : group.startTime,
          endTime: group.endTime === -Infinity ? Date.now() : group.endTime,
          status: 'completed',
          breadcrumbs: group.breadcrumbs,
          recordingIds: [],
          summary: {
            totalDistance: 0,
            breadcrumbCount: group.breadcrumbs.length,
            rawBreadcrumbCount: group.breadcrumbs.length,
            totalRecordings: 0,
            totalAudioDuration: 0,
          },
        };
        const idx = existingSessions.findIndex(s => s.sessionId === sessionId);
        if (idx !== -1) {
          existingSessions[idx] = reconstructed;
        } else {
          existingSessions.push(reconstructed);
        }
        importedBreadcrumbs += group.breadcrumbs.length;
      }
      try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(existingSessions)); } catch (e) {
        console.warn('importAudioExportZip: could not save reconstructed sessions', e);
      }
    }

    // --- Import audio files (strips breadcrumbs from recording metadata) ---
    const importedRecordings = await this.importAudioFiles(zipContent, {});
    const errors = importedRecordings._errors || [];

    // Collect unique walkSessionIds from the newly saved recordings
    const newIds = new Set(importedRecordings.map(r => r.newId).filter(Boolean));
    const allRecordings = localStorageService.getAllRecordings();
    const walkSessionIds = [...new Set(
      allRecordings
        .filter(r => newIds.has(r.uniqueId) && r.walkSessionId)
        .map(r => r.walkSessionId)
    )];

    return {
      importedBreadcrumbs,
      importedRecordings: importedRecordings.length,
      sessionId: null,
      walkSessionIds,
      errors,
    };
  }

  /**
   * Import tracklog from GeoJSON file
   */
  static async importTracklogFromGeoJSON(geojsonFile, options = {}) {
    // Legacy GeoJSON tracklog import routed breadcrumbs into a dead
    // localStorage key ('imported_breadcrumbs') that nothing rendered.
    // Fail clearly instead of losing the data silently.
    throw new Error(t('import.legacyUnsupported'));
  }

  /**
   * Generate summary from breadcrumbs
   */
  static generateSummaryFromBreadcrumbs(breadcrumbs) {
    if (breadcrumbs.length === 0) {
      return {
        totalDistance: 0,
        averageSpeed: 0,
        maxSpeed: 0,
        stationaryTime: 0,
        movingTime: 0,
        pattern: 'stationary'
      };
    }

    let totalDistance = 0;
    let totalSpeed = 0;
    let maxSpeed = 0;
    let stationaryCount = 0;
    let movingCount = 0;

    for (let i = 1; i < breadcrumbs.length; i++) {
      const prev = breadcrumbs[i - 1];
      const curr = breadcrumbs[i];
      
      const distance = this.calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      const timeDiff = curr.timestamp - prev.timestamp;
      const speed = distance / (timeDiff / 1000);
      
      totalDistance += distance;
      totalSpeed += speed;
      maxSpeed = Math.max(maxSpeed, speed);
      
      if (curr.isMoving) {
        movingCount++;
      } else {
        stationaryCount++;
      }
    }

    const averageSpeed = totalSpeed / (breadcrumbs.length - 1);
    const totalTime = breadcrumbs[breadcrumbs.length - 1].timestamp - breadcrumbs[0].timestamp;
    const stationaryTime = (stationaryCount / breadcrumbs.length) * totalTime;
    const movingTime = totalTime - stationaryTime;

    let pattern = 'mixed';
    if (movingCount / breadcrumbs.length > 0.8) pattern = 'moving';
    else if (stationaryCount / breadcrumbs.length > 0.8) pattern = 'stationary';

    return {
      totalDistance: Math.round(totalDistance),
      averageSpeed: Math.round(averageSpeed * 100) / 100,
      maxSpeed: Math.round(maxSpeed * 100) / 100,
      stationaryTime: Math.round(stationaryTime / 1000),
      movingTime: Math.round(movingTime / 1000),
      pattern
    };
  }

  /**
   * Calculate distance between two points in meters
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  /**
   * Validate tracklog file before import
   */
  static async validateTracklogFile(file) {
    try {
      if (file.name.endsWith('.zip')) {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        // Check if this is a Derive Sonora package (v2.x)
        const manifestFile = zipContent.file('manifest.json');
        if (manifestFile) {
          const manifest = JSON.parse(await manifestFile.async('string'));
          if (manifest.packageType === 'derive_sonora') {
            return {
              type: 'derive_sonora',
              valid: true,
              breadcrumbCount: manifest.session?.breadcrumbCount || 0,
              recordingCount: manifest.session?.recordingCount || 0,
              sessionId: manifest.session?.sessionId,
              userAlias: manifest.createdBy?.alias,
              title: manifest.session?.title,
            };
          }
        }

        // Audio-only export ZIP (from recordingExporter.js) — has export_summary.json, no tracklog
        const summaryFile = zipContent.file('export_summary.json');
        if (summaryFile) {
          const summary = JSON.parse(await summaryFile.async('string'));
          const audioFiles = Object.keys(zipContent.files).filter(f => f.startsWith('audio/'));

          // Count breadcrumbs — new format (sessions/*.json) or old format (embedded in metadata)
          let breadcrumbCount = summary.totalBreadcrumbs || 0;
          let sessionCount = summary.sessionCount || 0;
          if (!breadcrumbCount) {
            // New format: sessions/*.json
            const sFiles = Object.keys(zipContent.files).filter(
              k => k.startsWith('sessions/') && k.endsWith('.json')
            );
            for (const sPath of sFiles) {
              try {
                const sessionData = JSON.parse(await zipContent.file(sPath).async('string'));
                breadcrumbCount += sessionData.breadcrumbs?.length || 0;
                sessionCount++;
              } catch (e) { /* skip malformed */ }
            }

            // Old format: breadcrumbs embedded in metadata/*.json
            if (!breadcrumbCount) {
              const uniqueSessions = new Set();
              const mFiles = Object.keys(zipContent.files).filter(
                k => k.startsWith('metadata/') && k.endsWith('.json')
              );
              for (const mPath of mFiles) {
                try {
                  const meta = JSON.parse(await zipContent.file(mPath).async('string'));
                  breadcrumbCount += meta.breadcrumbs?.length || 0;
                  if (meta.walkSessionId) uniqueSessions.add(meta.walkSessionId);
                } catch (e) { /* skip malformed */ }
              }
              if (uniqueSessions.size > 0) sessionCount = uniqueSessions.size;
            }
          }

          return {
            type: 'audio_export',
            valid: true,
            breadcrumbCount,
            sessionCount,
            recordingCount: summary.totalRecordings || audioFiles.length,
            sessionId: null,
          };
        }

        // Legacy tracklog ZIP format
        if (!zipContent.file('tracklog/tracklog.json')) {
          throw new Error('Formato no reconocido: falta manifest.json, export_summary.json o tracklog/tracklog.json');
        }

        // Validate tracklog.json
        const tracklogJson = await zipContent.file('tracklog/tracklog.json').async('string');
        const tracklogData = JSON.parse(tracklogJson);

        if (!tracklogData.breadcrumbs || !Array.isArray(tracklogData.breadcrumbs)) {
          throw new Error('Invalid tracklog data: missing breadcrumbs');
        }

        return {
          type: 'zip',
          valid: true,
          breadcrumbCount: tracklogData.breadcrumbs.length,
          sessionId: tracklogData.sessionId
        };
        
      } else if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        const text = await file.text();
        const geojson = JSON.parse(text);
        
        if (geojson.type !== 'FeatureCollection') {
          throw new Error('Invalid GeoJSON: must be a FeatureCollection');
        }
        
        const breadcrumbCount = geojson.features.filter(f => 
          f.geometry.type === 'Point' && f.properties.type !== 'audio_recording'
        ).length;
        
        return {
          type: 'geojson',
          valid: true,
          breadcrumbCount: breadcrumbCount,
          sessionId: `geojson-${Date.now()}`
        };
        
      } else {
        throw new Error('Unsupported file format. Please use .zip or .geojson files.');
      }
      
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

export default TracklogImporter;
