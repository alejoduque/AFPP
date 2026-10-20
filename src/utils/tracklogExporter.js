// Tracklog Exporter Utility
// Exports complete tracklogs with associated audio files and metadata

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

class TracklogExporter {
  
  /**
   * Export a complete tracklog session with all associated data
   * @param {Object} sessionData - The session data from breadcrumbService
   * @param {Array} associatedRecordings - Array of recording IDs associated with this tracklog
   * @param {string} format - Export format: 'zip', 'geojson', 'gpx', 'csv'
   */
  static async exportTracklog(sessionData, associatedRecordings = [], format = 'zip') {
    try {
      if (!sessionData || !sessionData.breadcrumbs) {
        throw new Error('Invalid session data');
      }

      switch (format) {
        case 'zip':
          return await this.exportAsZip(sessionData, associatedRecordings);
        case 'geojson':
          return this.exportAsGeoJSON(sessionData, associatedRecordings);
        case 'gpx':
          return this.exportAsGPX(sessionData, associatedRecordings);
        case 'csv':
          return this.exportAsCSV(sessionData, associatedRecordings);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      console.error('Error exporting tracklog:', error);
      throw error;
    }
  }

  /**
   * Export tracklog as a comprehensive ZIP file
   */
  static async exportAsZip(sessionData, associatedRecordings = []) {
    const zip = new JSZip();
    
    // Add tracklog data
    const tracklogData = {
      sessionId: sessionData.id,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      duration: sessionData.duration,
      summary: sessionData.summary,
      breadcrumbs: sessionData.breadcrumbs,
      associatedRecordings: associatedRecordings,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    // Add tracklog JSON
    zip.file('tracklog/tracklog.json', JSON.stringify(tracklogData, null, 2));
    
    // Add breadcrumbs in different formats
    zip.file('tracklog/breadcrumbs.geojson', JSON.stringify(
      breadcrumbService.exportAsGeoJSON(sessionData), null, 2
    ));
    zip.file('tracklog/breadcrumbs.gpx', breadcrumbService.exportAsGPX(sessionData));
    zip.file('tracklog/breadcrumbs.csv', breadcrumbService.exportAsCSV(sessionData));

    // Add associated audio files and metadata
    if (associatedRecordings.length > 0) {
      for (const recordingId of associatedRecordings) {
        try {
          const recording = localStorageService.getRecording(recordingId);
          const audioBlob = await localStorageService.getAudioBlob(recordingId);
          
          if (recording && audioBlob) {
            // Add audio file
            const filename = recording.filename || `${recordingId}.webm`;
            zip.file(`audio/${filename}`, audioBlob);
            
            // Add metadata
            const metadata = { ...recording };
            delete metadata.audioBlob;
            zip.file(`metadata/${recordingId}_metadata.json`, JSON.stringify(metadata, null, 2));
          }
        } catch (error) {
          console.warn(`Failed to add recording ${recordingId} to tracklog:`, error);
        }
      }
    }

    // Add export summary
    const summary = {
      exportType: 'tracklog',
      exportDate: new Date().toISOString(),
      sessionId: sessionData.id,
      totalBreadcrumbs: sessionData.breadcrumbs.length,
      associatedRecordings: associatedRecordings.length,
      summary: sessionData.summary,
      description: 'BioMap Tracklog Export - Complete session with audio recordings'
    };
    zip.file('export_summary.json', JSON.stringify(summary, null, 2));

    // Generate and download
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `biomap_tracklog_${sessionData.id}_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`Exported tracklog: ${sessionData.id} with ${associatedRecordings.length} recordings`);
    return summary;
  }

  /**
   * Export tracklog as GeoJSON with audio associations
   */
  static exportAsGeoJSON(sessionData, associatedRecordings = []) {
    const baseGeoJSON = breadcrumbService.exportAsGeoJSON(sessionData);
    
    // Add audio recording points
    const audioFeatures = associatedRecordings.map(recordingId => {
      const recording = localStorageService.getRecording(recordingId);
      if (!recording || !recording.location) return null;
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [recording.location.lng, recording.location.lat]
        },
        properties: {
          type: 'audio_recording',
          recordingId: recordingId,
          filename: recording.filename,
          duration: recording.duration,
          timestamp: recording.timestamp,
          speciesTags: recording.speciesTags || [],
          notes: recording.notes,
          sessionId: sessionData.id
        }
      };
    }).filter(feature => feature !== null);

    return {
      ...baseGeoJSON,
      features: [...baseGeoJSON.features, ...audioFeatures],
      properties: {
        sessionId: sessionData.id,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        summary: sessionData.summary,
        associatedRecordings: associatedRecordings.length
      }
    };
  }

  /**
   * Export tracklog as GPX with audio waypoints
   */
  static exportAsGPX(sessionData, associatedRecordings = []) {
    let gpx = breadcrumbService.exportAsGPX(sessionData);
    
    // Add audio recording waypoints
    associatedRecordings.forEach(recordingId => {
      const recording = localStorageService.getRecording(recordingId);
      if (!recording || !recording.location) return;
      
      const waypoint = `
  <wpt lat="${recording.location.lat}" lon="${recording.location.lng}">
    <name>${recording.filename || recordingId}</name>
    <desc>Audio recording: ${recording.notes || 'No description'}</desc>
    <time>${new Date(recording.timestamp).toISOString()}</time>
    <extensions>
      <recordingId>${recordingId}</recordingId>
      <duration>${recording.duration || 0}</duration>
      <speciesTags>${(recording.speciesTags || []).join(',')}</speciesTags>
      <sessionId>${sessionData.id}</sessionId>
    </extensions>
  </wpt>`;
      
      // Insert waypoints before closing gpx tag
      gpx = gpx.replace('</gpx>', `${waypoint}\n</gpx>`);
    });

    return gpx;
  }

  /**
   * Export tracklog as CSV with audio associations
   */
  static exportAsCSV(sessionData, associatedRecordings = []) {
    const breadcrumbCSV = breadcrumbService.exportAsCSV(sessionData);
    
    // Add audio recording data
    const audioRows = associatedRecordings.map(recordingId => {
      const recording = localStorageService.getRecording(recordingId);
      if (!recording || !recording.location) return null;
      
      return [
        new Date(recording.timestamp).toISOString(),
        recording.location.lat,
        recording.location.lng,
        'AUDIO_RECORDING',
        recording.filename || recordingId,
        recording.duration || 0,
        (recording.speciesTags || []).join(';'),
        recording.notes || '',
        recordingId,
        sessionData.id
      ].join(',');
    }).filter(row => row !== null);

    const headers = [
      'timestamp', 'lat', 'lng', 'type', 'filename', 'duration', 
      'species_tags', 'notes', 'recording_id', 'session_id'
    ];

    return [
      headers.join(','),
      ...audioRows
    ].join('\n');
  }

  /**
   * Get recordings associated with a tracklog session
   * @param {Object} sessionData - The session data
   * @param {number} timeWindow - Time window in seconds to consider recordings as associated
   */
  static getAssociatedRecordings(sessionData, timeWindow = 300) { // 5 minutes default
    if (!sessionData || !sessionData.startTime || !sessionData.endTime) {
      return [];
    }

    const recordings = localStorageService.getAllRecordings();
    const sessionStart = sessionData.startTime;
    const sessionEnd = sessionData.endTime;
    const windowMs = timeWindow * 1000;

    return recordings.filter(recording => {
      const recordingTime = new Date(recording.timestamp).getTime();
      
      // Check if recording is within session time window
      const isInTimeWindow = recordingTime >= (sessionStart - windowMs) && 
                           recordingTime <= (sessionEnd + windowMs);
      
      // Check if recording location is near any breadcrumb
      if (recording.location && sessionData.breadcrumbs.length > 0) {
        const isNearBreadcrumb = sessionData.breadcrumbs.some(breadcrumb => {
          const distance = this.calculateDistance(
            recording.location.lat, recording.location.lng,
            breadcrumb.lat, breadcrumb.lng
          );
          return distance <= 50; // 50 meters radius
        });
        
        return isInTimeWindow && isNearBreadcrumb;
      }
      
      return isInTimeWindow;
    }).map(recording => recording.uniqueId);
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
   * Export current active session if available
   */
  static async exportCurrentSession(format = 'zip') {
    const currentSession = breadcrumbService.getCurrentSession();
    if (!currentSession) {
      throw new Error('No active session to export');
    }

    // Stop tracking to get complete session data
    const sessionData = breadcrumbService.stopTracking();
    if (!sessionData) {
      throw new Error('Failed to get session data');
    }

    // Get associated recordings
    const associatedRecordings = this.getAssociatedRecordings(sessionData);
    
    return await this.exportTracklog(sessionData, associatedRecordings, format);
  }
}

export default TracklogExporter;
