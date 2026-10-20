// Recording Exporter Utility
// Exports recordings from localStorage as downloadable files

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
import localStorageService from '../services/localStorageService.js';
import { t } from '../i18n';

// Custom alert function for Android without localhost text
const showAlert = (message) => {
  if (window.Capacitor?.isNativePlatform()) {
    // For native platforms, create a simple modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: rgba(255, 255, 255, 0.85); border-radius: 8px; padding: 20px;
      max-width: 300px; margin: 20px; text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    `;
    
    modal.innerHTML = `
      <p style="margin: 0 0 15px 0; font-size: 14px; color: rgb(1 9 2 / 84%);">${message}</p>
      <button style="
        background: #4e4e86; color: white; border: none; border-radius: 6px;
        padding: 8px 16px; cursor: pointer; font-size: 14px;
      ">OK</button>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on button click or overlay click
    const closeModal = () => document.body.removeChild(overlay);
    modal.querySelector('button').onclick = closeModal;
    overlay.onclick = (e) => e.target === overlay && closeModal();
  } else {
    // For web, use regular alert
    alert(message);
  }
};

class RecordingExporter {
  
  /**
   * Export a single recording as a downloadable file
   * @param {string} recordingId - The ID of the recording to export
   * @param {string} filename - Optional custom filename
   */
  static async exportSingleRecording(recordingId, filename = null) {
    try {
      // Get the recording metadata
      const recording = localStorageService.getRecording(recordingId);
      if (!recording) {
        throw new Error('Recording not found');
      }

      // Get the audio blob
      const audioBlob = await localStorageService.getAudioBlob(recordingId);
      if (!audioBlob) {
        throw new Error('Audio data not found');
      }

      // Create filename if not provided
      let finalFilename = filename;
      if (!finalFilename) {
        const baseName = recording.filename || recording.uniqueId;
        // Check if the filename already has an extension
        if (baseName.includes('.')) {
          finalFilename = baseName;
        } else {
          finalFilename = `${baseName}.webm`;
        }
      }

      // Create download link
      const url = URL.createObjectURL(audioBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = finalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`Exported recording: ${finalFilename}`);
      return finalFilename;
    } catch (error) {
      console.error('Error exporting recording:', error);
      throw error;
    }
  }

  /**
   * Export all recordings as a ZIP file with verbose progress and enhanced error handling
   */
  static async exportAllRecordings() {
    try {
      let recordings = localStorageService.getAllRecordings();
      if (recordings.length === 0) {
        throw new Error('No recordings found');
      }

      // Clean orphaned recordings (no audio data) before exporting
      const cleaned = await localStorageService.cleanupOrphanedRecordings();
      if (cleaned > 0) {
        recordings = localStorageService.getAllRecordings();
        console.log(`🧹 Cleaned ${cleaned} orphaned recordings before export`);
      }

      if (recordings.length === 0) {
        throw new Error('No recordings with audio data found');
      }

      console.log(`🚀 Starting ZIP export for ${recordings.length} recordings...`);
      showAlert(t('export.startingAll', { n: recordings.length }));

      const zip = new JSZip();
      let successCount = 0;
      let failCount = 0;
      const exportLog = [];
      const exportedSessionIds = new Set();
      
      exportLog.push(`Export started at ${new Date().toISOString()}`);
      exportLog.push(`Total recordings: ${recordings.length}`);
      exportLog.push('');

      // Add each recording to the zip with progress tracking
      for (let i = 0; i < recordings.length; i++) {
        const recording = recordings[i];
        try {
          console.log(`🔄 Processing recording ${i + 1}/${recordings.length}: ${recording.uniqueId}`);
          
          const audioBlob = await localStorageService.getAudioBlobFlexible(recording.uniqueId);
          if (audioBlob && audioBlob.size > 0) {
            const baseName = recording.filename || recording.uniqueId;
            // Pick extension from mime type or filename, default to .mp4 for cross-platform compatibility
            const extFromMime = recording.mimeType?.includes('webm') ? '.webm'
              : recording.mimeType?.includes('ogg') ? '.ogg' : '.mp4';
            const filename = baseName.includes('.') ? baseName : `${baseName}${extFromMime}`;
            
            // Add audio file to ZIP
            zip.file(`audio/${filename}`, audioBlob);

            // Also add metadata as JSON
            const metadata = { ...recording };
            delete metadata.audioBlob; // Remove audio blob from metadata
            zip.file(`metadata/${recording.uniqueId}_metadata.json`, JSON.stringify(metadata, null, 2));

            if (recording.walkSessionId) exportedSessionIds.add(recording.walkSessionId);
            successCount++;
            const logEntry = `✅ ${i + 1}/${recordings.length}: ${filename} (${audioBlob.size} bytes)`;
            exportLog.push(logEntry);
            console.log(logEntry);
            
            // Show progress every 5 recordings or on last recording
            if ((i + 1) % 5 === 0 || i === recordings.length - 1) {
              console.log(`📊 Progress: ${i + 1}/${recordings.length} processed (${successCount} success, ${failCount} failed)`);
            }
          } else {
            failCount++;
            const logEntry = `❌ ${i + 1}/${recordings.length}: ${recording.uniqueId} - NO AUDIO DATA`;
            exportLog.push(logEntry);
            console.warn(logEntry);
          }
        } catch (error) {
          failCount++;
          const logEntry = `❌ ${i + 1}/${recordings.length}: ${recording.uniqueId} - ERROR: ${error.message}`;
          exportLog.push(logEntry);
          console.error(`Failed to add recording ${recording.uniqueId} to zip:`, error);
        }
      }

      // Export session breadcrumb trails for soundwalk interoperability
      let sessionCount = 0;
      let totalBreadcrumbs = 0;
      if (exportedSessionIds.size > 0) {
        const allSessions = JSON.parse(localStorage.getItem('soundwalk_sessions') || '[]');
        for (const sessionId of exportedSessionIds) {
          const session = allSessions.find(s => s.sessionId === sessionId);
          if (!session || !session.breadcrumbs?.length) continue;
          const sessionExport = {
            sessionId: session.sessionId,
            title: session.title || '',
            userAlias: session.userAlias || '',
            startTime: session.startTime,
            endTime: session.endTime,
            breadcrumbs: session.breadcrumbs,
            summary: session.summary || {}
          };
          zip.file(`sessions/${sessionId}.json`, JSON.stringify(sessionExport, null, 2));
          totalBreadcrumbs += session.breadcrumbs.length;
          sessionCount++;
          console.log(`🗺️ Exported trail for session ${sessionId}: ${session.breadcrumbs.length} breadcrumbs`);
        }
      }

      // Add export summary to ZIP
      exportLog.push('');
      exportLog.push(`Export completed at ${new Date().toISOString()}`);
      exportLog.push(`Success: ${successCount}, Failed: ${failCount}, Sessions: ${sessionCount}`);

      const summary = {
        exportDate: new Date().toISOString(),
        totalRecordings: recordings.length,
        successfulExports: successCount,
        failedExports: failCount,
        sessionCount,
        totalBreadcrumbs,
        description: 'SoundWalk Audio Recordings Export'
      };
      zip.file('export_summary.json', JSON.stringify(summary, null, 2));
      zip.file('export_log.txt', exportLog.join('\n'));

      console.log('📦 Generating ZIP file...');
      showAlert(t('export.creatingZip'));

      // Generate and download zip file
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const timestamp = new Date().toISOString().split('T')[0];
      const zipFilename = `biomap_recordings_${timestamp}.zip`;
      
      // Try to save to Android Documents first (if Capacitor available)
      const isNative = !!(window.Capacitor && (
        window.Capacitor.isNative ||
        (window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
        window.Capacitor.platform === 'android'
      ));
      
      if (isNative) {
        try {
          const { Filesystem } = await import('@capacitor/filesystem');
          
          // Convert ZIP blob to base64
          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(zipBlob);
          });
          
          // Save to Downloads folder
          const downloadsPath = `Download/${zipFilename}`;
          await Filesystem.writeFile({
            path: downloadsPath,
            data: base64Data,
            directory: 'EXTERNAL_STORAGE',
            recursive: true
          });
          
          // Verify the file was saved
          const fileInfo = await Filesystem.stat({ 
            path: downloadsPath, 
            directory: 'EXTERNAL_STORAGE' 
          });
          
          console.log(`✅ ZIP saved to Downloads: ${zipFilename} (${fileInfo.size} bytes)`);
          
          showAlert(t('export.allDone', { ok: successCount, fail: failCount, file: zipFilename }));
          return;
        } catch (nativeError) {
          console.warn('Failed to save ZIP to Downloads, falling back to browser download:', nativeError);
        }
      }

      // Fallback: Browser download
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showAlert(t('export.allDone', { ok: successCount, fail: failCount, file: zipFilename }));
      console.log(`✅ Exported ${successCount} recordings as ZIP file: ${zipFilename}`);
    } catch (error) {
      console.error('Error exporting all recordings:', error);
      showAlert(t('export.failed', { msg: error.message }));
      throw error;
    }
  }

  /**
   * Export recordings metadata as JSON file to the Downloads folder (using File System Access API if available)
   */
  static async exportMetadata() {
    try {
      const recordings = localStorageService.getAllRecordings();
      if (recordings.length === 0) {
        throw new Error('No recordings found');
      }
      const cleanRecordings = recordings.map(recording => {
        const clean = { ...recording };
        delete clean.audioBlob;
        return clean;
      });
      const metadata = {
        exportDate: new Date().toISOString(),
        totalRecordings: cleanRecordings.length,
        recordings: cleanRecordings
      };
      const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
      const filename = `biomap_metadata_${new Date().toISOString().split('T')[0]}.json`;

      // Try File System Access API (Chromium browsers)
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker({ id: 'biomap-metadata-export', mode: 'readwrite' });
        const metaDir = await dirHandle.getDirectoryHandle('metadata', { create: true });
        const fileHandle = await metaDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        showAlert(`Exported metadata to metadata/${filename}`);
        return;
      }

      // Fallback: Download file
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showAlert(`Exported metadata as download`);
    } catch (error) {
      console.error('Error exporting metadata:', error);
      showAlert(t('export.failed', { msg: error.message }));
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  static getStorageStats() {
    return localStorageService.getStorageStats();
  }
}

export default RecordingExporter; 
