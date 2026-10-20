// Basic Local Storage Service for MANAKAI Audio Recordings
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
 * - ShareAlike — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.
 *
 * This license applies to all forms of use, including by automated systems or artificial intelligence models,
 * to prevent unauthorized commercial exploitation and ensure proper attribution.
 */
import config from '../config.json';
import { MAX_RECORDINGS } from '../config/tier.js';

class LocalStorageService {
  constructor() {
    this.storageKey = config.storage.recordingsKey;
    this.maxStorageSize = config.storage.maxStorageSize;
    this.autoCleanupDays = config.storage.autoCleanupDays;
  }

  /**
   * Initialize storage and perform cleanup if needed
   */
  async init() {
    this.cleanupOldRecordings();
    this.cleanupCorruptedAudioBlobs();
    // Orphaned recording cleanup is intentionally NOT run here on startup.
    // It relies on Capacitor Filesystem.stat() which may not be ready at module-load
    // time, and a false-negative would permanently delete valid recordings.
    // It runs explicitly before export in exportAllRecordings() where it is safe.
    this.checkStorageSpace();
  }

  /**
   * Save a recording to local storage
   * @param {Object} recording - The recording object to save
   * @param {Blob} audioBlob - The audio blob to save separately
   * @returns {Promise<string>} - The unique ID of the saved recording
   */
  async saveRecording(recording, audioBlob = null) {
    try {
      // Validate recording metadata
      if (!recording || typeof recording !== 'object') {
        throw new Error('Invalid recording metadata: must be an object');
      }
      
      if (!recording.uniqueId && !recording.filename) {
        throw new Error('Invalid recording: missing uniqueId or filename');
      }
      
      if (!recording.location || !recording.location.lat || !recording.location.lng) {
        throw new Error('Invalid recording: missing or invalid location data');
      }
      
      if (!recording.duration || recording.duration <= 0) {
        throw new Error('Invalid recording: missing or invalid duration');
      }
      
      // Validate audio blob if provided
      if (audioBlob) {
        if (!(audioBlob instanceof Blob)) {
          throw new Error('Invalid audio blob: must be a Blob object');
        }
        
        if (audioBlob.size === 0) {
          throw new Error('Invalid audio blob: size is 0 bytes');
        }
        
        if (audioBlob.size > 50 * 1024 * 1024) { // 50MB sanity limit
          throw new Error('Audio blob too large: maximum 50MB allowed');
        }
        
        console.log('✅ Audio blob validation passed:', audioBlob.size, 'bytes');
      } else {
        console.warn('⚠️ No audio blob provided for recording:', recording.uniqueId || recording.filename);
      }
      
      const recordings = this.getAllRecordings();
      
      const recordingId = recording.uniqueId || `recording-${Date.now()}`;
      
      // Add timestamp if not present
      if (!recording.timestamp) {
        recording.timestamp = new Date().toISOString();
      }
      
      // Create the recording object (without audio blob)
      const recordingData = {
        ...recording,
        uniqueId: recordingId,
        saved: true,
        localTimestamp: Date.now(),
        pendingUpload: true,
      };
      
      // Remove audioBlob from metadata to avoid localStorage size issues
      delete recordingData.audioBlob;
      
      // Save audio blob FIRST — if this fails, don't persist metadata
      const hasNativePath = !!recording.audioPath;
      if (audioBlob) {
        // Use the same robust native detection as recordingExporter.js
        const isNative = !!(window.Capacitor && (
          window.Capacitor.isNative ||
          (window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
          window.Capacitor.platform === 'android' ||
          window.Capacitor.platform === 'ios'
        ));
        if (isNative) {
          // Native platform — always use Capacitor Filesystem (no localStorage quota issues)
          // Do NOT fall back to localStorage: it has a ~5-10MB WebView limit and would
          // silently fail after a few recordings.
          const nativePath = await this.saveAudioBlobToFilesystem(recordingId, audioBlob, recording.mimeType);
          recordingData.audioPath = nativePath;
          console.log('✅ Audio saved to native filesystem:', nativePath);
        } else {
          // Web context — use localStorage (only option)
          await this.saveAudioBlob(recordingId, audioBlob);
        }
      } else if (!hasNativePath) {
        throw new Error('No audio data: neither blob nor native path provided');
      }

      // Audio saved successfully (or native path exists) — now persist metadata.
      // Upsert: replace existing entry with same uniqueId (handles re-import of same ZIP)
      // rather than pushing a duplicate.
      const existingIdx = recordings.findIndex(r => r.uniqueId === recordingId);
      if (existingIdx !== -1) {
        recordings[existingIdx] = recordingData;
      } else {
        recordings.push(recordingData);
      }
      localStorage.setItem(this.storageKey, JSON.stringify(recordings));

      console.log('✅ Recording saved to localStorage:', recordingId);
      return recordingId;
    } catch (error) {
      console.error('❌ Error saving recording:', error);
      throw new Error(`Failed to save recording to local storage: ${error.message}`);
    }
  }

  /**
   * Save audio blob separately using IndexedDB or as data URL
   * @param {string} recordingId - The unique ID of the recording
   * @param {Blob} audioBlob - The audio blob to save
   */
  async saveAudioBlob(recordingId, audioBlob) {
    try {
      // Convert blob to data URL for localStorage (web fallback)
      const blobSize = audioBlob.size;
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const dataUrl = reader.result;
            localStorage.setItem(`audio_${recordingId}`, dataUrl);
            console.log('Audio blob saved to localStorage:', recordingId, 'Size:', blobSize);
            resolve();
          } catch (error) {
            console.error('Error saving data URL to localStorage:', error);
            if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
              reject(new Error('Storage quota exceeded. Try exporting and deleting old recordings.'));
            } else {
              reject(new Error(`Failed to save audio: ${error.message}`));
            }
          }
        };
        reader.onerror = () => {
          console.error('Error reading audio blob');
          reject(new Error('Failed to read audio file. The file may be corrupted.'));
        };
        reader.readAsDataURL(audioBlob);
      });
    } catch (error) {
      console.error('Error saving audio blob:', error);
      throw error; // Re-throw instead of storing error states
    }
  }

  /**
   * Save audio blob to Capacitor Filesystem (for files too large for localStorage)
   * @returns {Promise<string>} native file path
   */
  async saveAudioBlobToFilesystem(recordingId, audioBlob, mimeType) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const ext = mimeType?.includes('webm') ? '.webm' : mimeType?.includes('ogg') ? '.ogg' : '.mp4';
    const filename = `${recordingId}${ext}`;
    // Convert blob to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Strip the data URL prefix to get raw base64
        const result = reader.result;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });
    await Filesystem.writeFile({
      path: `BioMapp/${filename}`,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    return `BioMapp/${filename}`;
  }

  /**
   * Get audio blob for a recording
   * @param {string} recordingId - The unique ID of the recording
   * @returns {Promise<Blob|null>} - Promise that resolves to the audio blob or null if not found
   */
  async getAudioBlob(recordingId) {
    try {
      const storedData = localStorage.getItem(`audio_${recordingId}`);
      if (!storedData) {
        return null;
      }

      // Parse the data URL manually instead of using fetch() which
      // fails on large data: URLs in Safari/iOS WebView
      const match = storedData.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        // Not a valid data URL — try fetch as last resort
        const response = await fetch(storedData);
        return await response.blob();
      }
      const mimeType = match[1];
      const base64 = match[2];
      return this.base64ToBlob(base64, mimeType);
    } catch (error) {
      console.error('Error getting audio blob:', error);
      return null;
    }
  }

  /**
   * Get audio blob from localStorage or fallback to native file path via Capacitor Filesystem
   * @param {string} recordingId
   * @returns {Promise<Blob|null>}
   */
  async getAudioBlobFlexible(recordingId) {
    // Try local stored blob first
    const blob = await this.getAudioBlob(recordingId);
    if (blob) return blob;

    // Fallback to native file path if available
    try {
      const recording = this.getRecording(recordingId);
      if (!recording || !recording.audioPath) return null;
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const readRes = await Filesystem.readFile({
        path: recording.audioPath,
        directory: Directory.Data,
      });
      if (!readRes || !readRes.data) return null;
      const mimeType = recording.mimeType || this.inferMimeTypeFromFilename(recording.filename) || 'audio/m4a';
      const base64 = readRes.data;
      return this.base64ToBlob(base64, mimeType);
    } catch (e) {
      console.warn('getAudioBlobFlexible: native fallback failed', e);
      return null;
    }
  }

  /**
   * Convert base64 (no data URL prefix) to Blob
   */
  base64ToBlob(base64, mimeType = 'application/octet-stream') {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
      const slice = byteCharacters.slice(offset, offset + 1024);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: mimeType });
  }

  /**
   * Infer MIME type from filename extension
   */
  inferMimeTypeFromFilename(filename) {
    if (!filename) return null;
    const lower = filename.toLowerCase();
    if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/m4a';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.webm')) return 'audio/webm';
    return null;
  }

  /**
   * Get a webview-safe playable URL for a recording using its native path
   * @param {string} recordingId
   * @returns {Promise<string|null>} web URL suitable for <audio src>, or null
   */
  async getPlayableUrl(recordingId) {
    try {
      const recording = this.getRecording(recordingId);
      if (!recording || !recording.audioPath) return null;
      let uri = recording.audioPath;
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        if (Filesystem.getUri) {
          const res = await Filesystem.getUri({
            path: recording.audioPath,
            directory: Directory.Data,
          });
          if (res && res.uri) uri = res.uri;
        }
      } catch (_) {}
      // Convert native URI to webview-safe URL
      try {
        if (window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
          return window.Capacitor.convertFileSrc(uri);
        }
      } catch (_) {}
      return uri; // last resort
    } catch (e) {
      console.warn('getPlayableUrl failed:', e);
      return null;
    }
  }

  /**
   * Clean up recordings that have invalid or missing audio data
   * @returns {Promise<number>} - Number of orphaned recordings removed
   */
  async cleanupOrphanedRecordings() {
    try {
      console.log('Starting cleanup of orphaned recordings...');
      const recordings = this.getAllRecordings();
      const validRecordings = [];
      let orphanedCount = 0;

      for (const recording of recordings) {
        let hasValidAudio = false;

        // Check native file path first (cheap stat — no reading into memory)
        if (recording.audioPath) {
          try {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const fileInfo = await Filesystem.stat({ path: recording.audioPath, directory: Directory.Data });
            if (fileInfo.size > 0) {
              hasValidAudio = true;
            }
          } catch (error) {
            console.warn(`Native audio file not accessible for ${recording.uniqueId}:`, error);
          }
        }

        // Fallback: check localStorage blob (only if no native path)
        if (!hasValidAudio) {
          try {
            const storedData = localStorage.getItem(`audio_${recording.uniqueId}`);
            if (storedData && storedData.length > 0) {
              hasValidAudio = true;
            }
          } catch (error) {
            console.warn(`Audio validation failed for recording ${recording.uniqueId}:`, error);
          }
        }
        
        if (hasValidAudio) {
          validRecordings.push(recording);
        } else {
          orphanedCount++;
          // Clean up associated audio blob storage
          localStorage.removeItem(`audio_${recording.uniqueId}`);
          console.log(`Removed orphaned recording: ${recording.uniqueId} - ${recording.filename}`);
        }
      }
      
      if (orphanedCount > 0) {
        localStorage.setItem(this.storageKey, JSON.stringify(validRecordings));
        console.log(`Cleaned up ${orphanedCount} orphaned recordings`);
      } else {
        console.log('No orphaned recordings found');
      }
      
      return orphanedCount;
    } catch (error) {
      console.error('Error during orphaned recordings cleanup:', error);
      return 0;
    }
  }

  /**
   * Get all recordings from local storage
   * @returns {Array} - Array of recording objects
   */
  getAllRecordings() {
    try {
      const recordings = localStorage.getItem(this.storageKey);
      return recordings ? JSON.parse(recordings) : [];
    } catch (error) {
      console.error('Error loading recordings:', error);
      return [];
    }
  }

  /**
   * Get a specific recording by ID
   * @param {string} recordingId - The unique ID of the recording
   * @returns {Object|null} - The recording object or null if not found
   */
  getRecording(recordingId) {
    const recordings = this.getAllRecordings();
    return recordings.find(r => r.uniqueId === recordingId) || null;
  }

  /**
   * Delete a recording by ID
   * @param {string} recordingId - The unique ID of the recording to delete
   * @returns {boolean} - True if deleted, false if not found
   */
  async deleteRecording(recordingId) {
    try {
      const recordings = this.getAllRecordings();
      const recording = recordings.find(r => r.uniqueId === recordingId);

      if (!recording) {
        return false; // Recording not found
      }

      // Delete audio file from native filesystem if it exists
      if (recording.audioPath) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          await Filesystem.deleteFile({
            path: recording.audioPath,
            directory: Directory.Data,
          });
          console.log('Native audio file deleted:', recording.audioPath);
        } catch (fileError) {
          console.warn('Failed to delete native audio file (may not exist):', fileError);
        }
      }

      // Delete audio blob from localStorage if it exists
      try {
        localStorage.removeItem(`audio_${recordingId}`);
      } catch (blobError) {
        console.warn('Failed to delete audio blob from localStorage:', blobError);
      }

      // Remove recording metadata
      const filteredRecordings = recordings.filter(r => r.uniqueId !== recordingId);
      localStorage.setItem(this.storageKey, JSON.stringify(filteredRecordings));
      console.log('Recording deleted:', recordingId);
      return true;
    } catch (error) {
      console.error('Error deleting recording:', error);
      return false;
    }
  }

  /**
   * Update a recording
   * @param {string} recordingId - The unique ID of the recording
   * @param {Object} updates - Object with fields to update
   * @returns {boolean} - True if updated, false if not found
   */
  updateRecording(recordingId, updates) {
    try {
      const recordings = this.getAllRecordings();
      const recordingIndex = recordings.findIndex(r => r.uniqueId === recordingId);
      
      if (recordingIndex === -1) {
        return false; // Recording not found
      }
      
      // Update the recording
      recordings[recordingIndex] = {
        ...recordings[recordingIndex],
        ...updates,
        lastModified: new Date().toISOString()
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(recordings));
      console.log('Recording updated:', recordingId);
      return true;
    } catch (error) {
      console.error('Error updating recording:', error);
      return false;
    }
  }

  /**
   * Get all recordings linked to a specific walk session
   * @param {string} sessionId - The walk session ID
   * @returns {Array} - Array of recording objects for that session
   */
  getRecordingsBySessionId(sessionId) {
    if (!sessionId) return [];
    return this.getAllRecordings().filter(r => r.walkSessionId === sessionId);
  }

  /**
   * Search recordings by various criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} - Array of matching recordings
   */
  searchRecordings(criteria = {}) {
    const recordings = this.getAllRecordings();
    
    return recordings.filter(recording => {
      // Search by filename
      if (criteria.filename && !recording.filename?.toLowerCase().includes(criteria.filename.toLowerCase())) {
        return false;
      }
      
      // Search by species tags
      if (criteria.species && !recording.speciesTags?.some(tag => 
        tag.toLowerCase().includes(criteria.species.toLowerCase()))) {
        return false;
      }
      
      // Search by date range
      if (criteria.startDate && new Date(recording.timestamp) < new Date(criteria.startDate)) {
        return false;
      }
      
      if (criteria.endDate && new Date(recording.timestamp) > new Date(criteria.endDate)) {
        return false;
      }
      
      // Search by location (if coordinates are available)
      if (criteria.location && recording.location) {
        const distance = this.calculateDistance(
          criteria.location.lat, criteria.location.lon,
          recording.location.lat, recording.location.lon
        );
        if (distance > (criteria.radius || 1000)) { // Default 1km radius
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Calculate distance between two coordinates in meters
   * @param {number} lat1 - Latitude of first point
   * @param {number} lon1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lon2 - Longitude of second point
   * @returns {number} - Distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Saves the set of currently visible session IDs to localStorage.
   * @param {Set<string>} visibleIds - A set of session IDs.
   */
  saveVisibleSessions(visibleIds) {
    try {
      // Convert Set to Array for JSON serialization
      const idsArray = Array.from(visibleIds);
      localStorage.setItem('soundwalk_visible_sessions', JSON.stringify(idsArray));
    } catch (e) {
      console.error('Error saving visible sessions:', e);
    }
  }

  /**
   * Loads the set of visible session IDs from localStorage.
   * @returns {Set<string>|null} - A set of session IDs, or null if none are saved.
   */
  loadVisibleSessions() {
    try {
      const raw = localStorage.getItem('soundwalk_visible_sessions');
      if (raw) {
        // Convert array back to Set
        return new Set(JSON.parse(raw));
      }
      return null;
    } catch (e) {
      console.error('Error loading visible sessions:', e);
      return null;
    }
  }

  /**
   * Clean up recordings older than specified days
   */
  cleanupOldRecordings() {
    try {
      const recordings = this.getAllRecordings();
      const cutoffDate = Date.now() - (this.autoCleanupDays * 24 * 60 * 60 * 1000);
      
      const activeRecordings = recordings.filter(recording => {
        const recordingDate = new Date(recording.timestamp).getTime();
        return recordingDate > cutoffDate;
      });
      
      if (activeRecordings.length !== recordings.length) {
        localStorage.setItem(this.storageKey, JSON.stringify(activeRecordings));
        console.log(`Cleaned up ${recordings.length - activeRecordings.length} old recordings`);
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Clean up corrupted audio blob entries (legacy cleanup - should not be needed with new error handling)
   */
  cleanupCorruptedAudioBlobs() {
    try {
      const recordings = this.getAllRecordings();
      let cleanedCount = 0;
      
      // Clean up any remaining legacy error states
      recordings.forEach(recording => {
        const audioKey = `audio_${recording.uniqueId}`;
        const storedData = localStorage.getItem(audioKey);
        
        // Remove legacy error state markers
        if (storedData === 'TOO_LARGE' || storedData === 'STORAGE_ERROR' || storedData === 'ERROR') {
          localStorage.removeItem(audioKey);
          cleanedCount++;
          console.log(`Cleaned up legacy error state for recording: ${recording.uniqueId}`);
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} legacy error state entries`);
      }
    } catch (error) {
      console.error('Error cleaning up corrupted audio blobs:', error);
    }
  }

  /**
   * Check storage space and warn if approaching limits
   */
  checkStorageSpace() {
    try {
      const recordings = this.getAllRecordings();
      const storageUsed = JSON.stringify(recordings).length;
      const usagePercent = (storageUsed / this.maxStorageSize) * 100;
      
      if (usagePercent > 80) {
        console.warn(`Storage usage at ${usagePercent.toFixed(1)}% - consider cleaning up old recordings`);
      }
      
      return {
        used: storageUsed,
        max: this.maxStorageSize,
        percentage: usagePercent
      };
    } catch (error) {
      console.error('Error checking storage space:', error);
      return null;
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} - Storage statistics
   */
  getStorageStats() {
    const recordings = this.getAllRecordings();
    const spaceInfo = this.checkStorageSpace();
    
    // Count corrupted audio blobs
    let corruptedBlobs = 0;
    let totalBlobs = 0;
    recordings.forEach(recording => {
      const audioKey = `audio_${recording.uniqueId}`;
      const storedData = localStorage.getItem(audioKey);
      if (storedData) {
        totalBlobs++;
        if (storedData === 'TOO_LARGE' || storedData === 'STORAGE_ERROR' || storedData === 'ERROR') {
          corruptedBlobs++;
        }
      }
    });
    
    return {
      totalRecordings: recordings.length,
      storageUsed: spaceInfo?.used || 0,
      storageMax: spaceInfo?.max || 0,
      storagePercentage: spaceInfo?.percentage || 0,
      totalAudioBlobs: totalBlobs,
      corruptedAudioBlobs: corruptedBlobs,
      oldestRecording: recordings.length > 0 ? 
        recordings.reduce((oldest, current) => 
          new Date(current.timestamp) < new Date(oldest.timestamp) ? current : oldest
        ).timestamp : null,
      newestRecording: recordings.length > 0 ? 
        recordings.reduce((newest, current) => 
          new Date(current.timestamp) > new Date(newest.timestamp) ? current : newest
        ).timestamp : null
    };
  }

  /**
   * Clear all recordings (use with caution)
   */
  clearAllRecordings() {
    localStorage.removeItem(this.storageKey);
    console.log('All recordings cleared from localStorage');
  }

  /**
   * Nuclear option: Clear everything and start fresh
   */
  nuclearClear() {
    try {
      // Clear all recordings
      localStorage.removeItem(this.storageKey);
      
      // Clear all audio blobs
      const recordings = this.getAllRecordings();
      recordings.forEach(recording => {
        const audioKey = `audio_${recording.uniqueId}`;
        localStorage.removeItem(audioKey);
      });
      
      // Clear any other related data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('audio_') || key.includes('recording') || key.includes('biomap'))) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      console.log('Nuclear clear completed - all data removed');
      return true;
    } catch (error) {
      console.error('Error during nuclear clear:', error);
      return false;
    }
  }

  /**
   * Repair storage by cleaning up orphaned recordings and rebuilding consistency
   * @returns {Promise<Object>} - Repair summary
   */
  async repairStorage() {
    try {
      console.log('Starting storage repair...');
      const repairSummary = {
        orphanedRemoved: 0,
        corruptedCleaned: 0,
        errorsFixed: 0,
        totalRecordings: 0
      };
      
      // Clean up orphaned recordings
      const orphanedCount = await this.cleanupOrphanedRecordings();
      repairSummary.orphanedRemoved = orphanedCount;
      
      // Clean up corrupted audio blobs
      this.cleanupCorruptedAudioBlobs();
      repairSummary.corruptedCleaned = 1; // Assume some were cleaned
      
      // Get final count
      const recordings = this.getAllRecordings();
      repairSummary.totalRecordings = recordings.length;
      
      console.log('Storage repair completed:', repairSummary);
      return repairSummary;
    } catch (error) {
      console.error('Error during storage repair:', error);
      throw new Error(`Storage repair failed: ${error.message}`);
    }
  }

  /**
   * Clear all audio blobs from localStorage (use with caution)
   */
  clearAllAudioBlobs() {
    try {
      const recordings = this.getAllRecordings();
      let clearedCount = 0;
      
      recordings.forEach(recording => {
        const audioKey = `audio_${recording.uniqueId}`;
        if (localStorage.getItem(audioKey)) {
          localStorage.removeItem(audioKey);
          clearedCount++;
        }
      });
      
      console.log(`Cleared ${clearedCount} audio blobs from localStorage`);
      return clearedCount;
    } catch (error) {
      console.error('Error clearing audio blobs:', error);
      return 0;
    }
  }

  /**
   * Clear all corrupted recordings from localStorage
   */
  clearCorruptedRecordings() {
    try {
      const recordings = this.getAllRecordings();
      const validRecordings = recordings.filter(recording => {
        try {
          if (!recording || typeof recording !== 'object') return false;
          if (!recording.uniqueId) return false;
          if (!recording.location || typeof recording.location !== 'object') return false;
          if (typeof recording.location.lat !== 'number' || isNaN(recording.location.lat)) return false;
          if (typeof recording.location.lng !== 'number' || isNaN(recording.location.lng)) return false;
          if (!recording.filename && !recording.displayName) return false;
          return true;
        } catch (error) {
          return false;
        }
      });
      
      const corruptedCount = recordings.length - validRecordings.length;
      if (corruptedCount > 0) {
        localStorage.setItem(this.storageKey, JSON.stringify(validRecordings));
        console.log(`Cleared ${corruptedCount} corrupted recordings from localStorage`);
      }
      return corruptedCount;
    } catch (error) {
      console.error('Error clearing corrupted recordings:', error);
      return 0;
    }
  }

  /**
   * Export recordings data for backup
   * @returns {string} - JSON string of all recordings
   */
  exportRecordings() {
    const recordings = this.getAllRecordings();
    return JSON.stringify(recordings, null, 2);
  }

  /**
   * Import recordings from backup
   * @param {string} jsonData - JSON string of recordings to import
   * @returns {boolean} - True if successful
   */
  importRecordings(jsonData) {
    try {
      const recordings = JSON.parse(jsonData);
      
      if (!Array.isArray(recordings)) {
        throw new Error('Invalid recordings data format');
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(recordings));
      console.log(`Imported ${recordings.length} recordings`);
      return true;
    } catch (error) {
      console.error('Error importing recordings:', error);
      return false;
    }
  }

  /**
   * Create a new recording object template
   * @param {Object} data - Initial recording data
   * @returns {Object} - Recording object template
   */
  createRecordingTemplate(data = {}) {
    return {
      uniqueId: `recording-${Date.now()}`,
      filename: data.filename || `recording-${Date.now()}.mp3`,
      timestamp: new Date().toISOString(),
      duration: data.duration || 0,
      fileSize: data.fileSize || 0,
      location: data.location || null,
      speciesTags: data.speciesTags || [],
      notes: data.notes || '',
      audioData: data.audioData || null,
      quality: data.quality || 'medium',
      weather: data.weather || null,
      temperature: data.temperature || null,
      saved: false,
      ...data
    };
  }

  /**
   * Get all recordings pending upload
   */
  getPendingUploads() {
    return this.getAllRecordings().filter(r => r.pendingUpload);
  }

  /**
   * Mark a recording as uploaded
   */
  markUploaded(recordingId) {
    return this.updateRecording(recordingId, { pendingUpload: false });
  }

  /**
   * Get recording limit information for free version
   * @returns {Object} - Limit information
   */
  getRecordingLimitInfo() {
    const recordings = this.getAllRecordings();
    const used = recordings.length;
    const limit = MAX_RECORDINGS; // Infinity on the paid tier
    const isLimited = Number.isFinite(limit);
    return {
      limit,
      used,
      remaining: isLimited ? Math.max(0, limit - used) : Infinity,
      isAtLimit: isLimited && used >= limit,
      percentage: isLimited && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
    };
  }

  /**
   * Check if user can create new recording
   * @returns {boolean} - True if user can record, false if at limit
   */
  canCreateNewRecording() {
    return !this.getRecordingLimitInfo().isAtLimit;
  }

  /**
   * Force initialization with repair (useful for troubleshooting)
   */
  async forceInit() {
    console.log('Force initializing storage with repair...');
    try {
      // Run repair first
      const repairResult = await this.repairStorage();
      
      // Then normal init
      await this.init();
      
      console.log('Force initialization completed:', repairResult);
      return repairResult;
    } catch (error) {
      console.error('Force initialization failed:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
const localStorageService = new LocalStorageService();

// Initialize service when module loads
localStorageService.init();

export default localStorageService;