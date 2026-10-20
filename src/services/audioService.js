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
import { App } from '@capacitor/app';

class AudioService {
  constructor() {
    this.isAndroid = /Android/.test(navigator.userAgent);
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  // Check if we're in a Capacitor environment
  isCapacitor() {
    return window.Capacitor && window.Capacitor.isNative;
  }

  // Request microphone permission with better error handling
  async requestMicrophonePermission() {
    try {
      console.log('AudioService: Requesting microphone permission...');
      
      // For Android WebView, we need to request permission through getUserMedia
      // The permission should already be declared in AndroidManifest.xml
      console.log('AudioService: Using getUserMedia approach');
      
      // Try to get user media - this should trigger the permission dialog
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // If we get here, permission was granted
      console.log('AudioService: Microphone permission granted');
      return { granted: true, stream };
      
    } catch (error) {
      console.error('AudioService: Microphone permission error:', error);
      
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied by user. Please grant microphone permission in your device settings.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found on this device');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Microphone not supported on this device');
      } else if (error.name === 'SecurityError') {
        throw new Error('Microphone access blocked by security policy. Please check your device settings.');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Microphone is in use by another application. Please close other apps using the microphone.');
      } else if (error.name === 'AbortError') {
        throw new Error('Microphone access was aborted. Please try again.');
      } else {
        throw new Error(`Microphone error: ${error.message}`);
      }
    }
  }

  // Check microphone permission status
  async checkMicrophonePermission() {
    try {
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'microphone' });
        return permission.state;
      }
      return 'unknown';
    } catch (error) {
      console.error('AudioService: Error checking microphone permission:', error);
      return 'unknown';
    }
  }

  // Get supported MIME types for recording
  getSupportedMimeType() {
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        console.log('AudioService: Using MIME type:', mimeType);
        return mimeType;
      }
    }
    
    console.warn('AudioService: No supported MIME type found, using default');
    return null; // Let MediaRecorder choose default
  }

  // Create MediaRecorder with proper configuration
  createMediaRecorder(stream) {
    const mimeType = this.getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};
    
    try {
      const recorder = new MediaRecorder(stream, options);
      console.log('AudioService: MediaRecorder created with MIME type:', recorder.mimeType);
      return recorder;
    } catch (error) {
      console.error('AudioService: Error creating MediaRecorder:', error);
      // Fallback: try without MIME type
      return new MediaRecorder(stream);
    }
  }

  // Get file extension based on MIME type
  getFileExtension(mimeType) {
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('wav')) return 'wav';
    return 'webm'; // Default fallback
  }
}

export default new AudioService(); 