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
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Save, X, MapPin, Plus } from 'lucide-react';
import audioService from './audioService.js';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import breadcrumbService from './breadcrumbService.js';
import useDraggable from '../hooks/useDraggable.js';
import { t } from '../i18n';
import { IS_FREE } from '../config/tier.js';
import localStorageService from './localStorageService.js';

// Custom alert function for Android without localhost text
const showAlert = (message) => {
  if (window.Capacitor?.isNativePlatform()) {
    // For native platforms, create a simple modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgb(20 50 20 / 65%); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: rgba(220,225,235,0.92); border-radius: 8px; padding: 20px;
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

// Logging utility for debugging microphone issues
class AudioLogger {
  static logs: string[] = [];

  static log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry, data);
    this.logs.push(logEntry + (data ? ` | Data: ${JSON.stringify(data)}` : ''));
  }

  static error(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    const errorDetails = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
      constraint: (error as any).constraint
    } : null;

    const logEntry = `[${timestamp}] ERROR: ${message}`;
    console.error(logEntry, error);
    this.logs.push(logEntry + (errorDetails ? ` | Error: ${JSON.stringify(errorDetails)}` : ''));
  }

  static getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      timestamp: new Date().toISOString()
    };
  }

  static async saveLogs() {
    try {
      const deviceInfo = this.getDeviceInfo();
      const fullLog = {
        deviceInfo,
        logs: this.logs,
        summary: {
          totalLogs: this.logs.length,
          errorCount: this.logs.filter(log => log.includes('ERROR:')).length,
          timestamp: new Date().toISOString()
        }
      };
      // Use a visible, user-friendly filename (no leading dot), and .txt extension
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
      const filename = `biomap-audio-logs-${timestamp}.txt`;
      // Save as plain text for Android compatibility
      const logText = JSON.stringify(fullLog, null, 2);
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.log('Logs saved successfully');
      return true;
    } catch (error) {
      console.error('Failed to save logs:', error);
      return false;
    }
  }

  static clearLogs() {
    this.logs = [];
  }
}

const AudioRecorder = ({
  userLocation,
  locationAccuracy,
  onSaveRecording,
  onCancel,
  isVisible = false,
  walkSessionId = null,
  onRecordingStart = null
}) => {
  // Remove all refs and state related to MediaRecorder, audioBlob, and web audio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showDetailedFields, setShowDetailedFields] = useState(false);
  const [nativeRecordingPath, setNativeRecordingPath] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  // Timeline markers — bookmarks placed during recording
  const [markers, setMarkers] = useState<Array<{ offsetMs: number; lat: number; lng: number; label: string }>>([]);
  const recordingStartTimeRef = useRef<number>(0);

  const { position: dragPos, handlePointerDown: onDragStart } = useDraggable();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeRef = useRef(0);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playUrlRef = useRef<string | null>(null);

  // Dropdown options for standardized metadata.
  // Values are stable English tokens stored in metadata; labels are
  // translated at render time (see src/i18n).
  const optionsFor = (prefix: string, values: string[], emptyLabelKey = 'meta.select') => [
    { value: '', label: t(emptyLabelKey) },
    ...values.map(v => ({ value: v, label: t(`${prefix}.${v}`) }))
  ];

  const weatherOptions = optionsFor('meta.weather', ['sunny', 'cloudy', 'rainy', 'stormy', 'foggy', 'windy', 'snowy']);
  const temperatureOptions = optionsFor('meta.temperature', ['very_cold', 'cold', 'cool', 'warm', 'hot']);
  const speciesOptions = ['bird', 'mammal', 'amphibian', 'reptile', 'insect', 'water', 'wind', 'human', 'other']
    .map(v => ({ value: v, label: t(`meta.species.${v}`) }));
  const habitatOptions = optionsFor('meta.habitat', ['forest', 'wetland', 'grassland', 'riverside', 'urban', 'farmland', 'paramo', 'mangrove', 'cave']);
  const heightPositionOptions = optionsFor('meta.stratum', ['ground', 'understory', 'canopy', 'aerial', 'subaquatic'], 'meta.notIdentified');

  // Distance labels are language-neutral measurements
  const distanceOptions = [
    { value: '', label: t('meta.select') },
    { value: 'very_close', label: '📏 <5m' },
    { value: 'close', label: '📏 5-20m' },
    { value: 'medium', label: '📏 20-50m' },
    { value: 'far', label: '📏 >50m' }
  ];

  const activityOptions = optionsFor('meta.activity', ['song', 'alarm', 'foraging', 'movement', 'chorus', 'unknown']);
  const anthropophonyOptions = optionsFor('meta.anthropophony', ['none', 'low', 'medium', 'high']);

  // Touch-friendly form controls: >=44px targets, 16px font (prevents
  // Android/iOS zoom-on-focus in the field)
  const selectStyle = {
    width: '100%',
    minHeight: '44px',
    padding: '10px 8px',
    border: '1px solid rgba(78,78,134,0.22)',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box',
    backgroundColor: 'white'
  } as React.CSSProperties;

  // Metadata form state - aligned with AudioService structure
  const [metadata, setMetadata] = useState({
    filename: '',
    notes: '',
    speciesTags: [] as string[],
    weather: '',
    temperature: '',
    quality: 'medium',
    habitat: '',
    heightPosition: '',
    distanceEstimate: '',
    activityType: '',
    anthropophony: ''
  });

  // Validation state
  const [validationErrors, setValidationErrors] = useState({});

  // Stop any active capture and release hardware/timers. Safe to call
  // whether or not a recording is in progress (cancel, re-record, unmount).
  const stopActiveCapture = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      // Timer only runs while capturing — stop the native recorder too
      if ((window as any).Capacitor?.isNativePlatform()) {
        VoiceRecorder.stopRecording().catch(() => { /* already stopped */ });
      }
    }
    recordingTimeRef.current = 0;
    const recorder = webMediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try { recorder.stop(); } catch (e) { /* already stopped */ }
    }
    webStreamRef.current?.getTracks().forEach(track => track.stop());
    webStreamRef.current = null;
    webMediaRecorderRef.current = null;
    webChunksRef.current = [];
    if (playUrlRef.current) {
      URL.revokeObjectURL(playUrlRef.current);
      playUrlRef.current = null;
    }
  };

  // Release everything on unmount (timer, mic stream, blob URLs)
  useEffect(() => {
    return () => stopActiveCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Timeline marker handler ---
  const addMarker = () => {
    if (!isRecording || !userLocation) return;
    const offsetMs = Date.now() - recordingStartTimeRef.current;
    const newMarker = {
      offsetMs,
      lat: userLocation.lat,
      lng: userLocation.lng,
      label: `Marker ${markers.length + 1}`
    };
    setMarkers(prev => [...prev, newMarker]);
  };

  // Validation — all fields optional now
  const validateMetadata = () => {
    setValidationErrors({});
    return true;
  };



  // Sortable, locale-safe auto name: [uploadedName_]rec_YYYYMMDD_HHMMSS.ext
  // GPS coordinates live in metadata, not the filename.
  const generateFilename = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // Optional prefix — only set by the file-upload flow, never typed by hand
    let base = metadata.filename.trim();
    if (base) {
      base = base.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '_').substring(0, 20);
    }

    const getFileExtension = (mimeType) => {
      if (mimeType?.includes('mp4')) return '.mp4';
      if (mimeType?.includes('webm')) return '.webm';
      if (mimeType?.includes('ogg')) return '.ogg';
      if (mimeType?.includes('wav')) return '.wav';
      return '.mp4'; // default fallback — cross-platform compatible
    };

    const webMime = webMediaRecorderRef.current?.mimeType || audioBlob?.type || null;
    const extension = getFileExtension(webMime);
    return `${base ? base + '_' : ''}rec_${dateStr}_${timeStr}${extension}`;
  };

  // Remove getSupportedMimeType and all MediaRecorder logic

  // --- File Upload Handler ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input to allow uploading the same file again
    event.target.value = '';

    try {
      // Check file type — accept mp4, m4a, webm, ogg, wav audio
      const validTypes = ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/wav', 'video/mp4'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|m4a|webm|ogg|wav)$/i)) {
        showAlert(t('recorder.alert.invalidType'));
        return;
      }

      // Check file size limit — 6MB
      const maxSize = 6 * 1024 * 1024; // 6MB in bytes
      if (file.size > maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        showAlert(t('recorder.alert.tooLarge6', { size: sizeMB }));
        return;
      }

      // Check GPS location
      if (!userLocation) {
        showAlert(t('recorder.alert.waitGpsRetry'));
        return;
      }

      AudioLogger.log('File upload started', { name: file.name, size: file.size, type: file.type });

      // Read file as blob
      const blob = new Blob([file], { type: file.type });
      setAudioBlob(blob);
      setNativeRecordingPath(null);

      // Get duration
      const duration = await getAudioDuration(blob);
      setRecordingTime(Math.round(duration));

      // Pre-fill filename from uploaded file (without extension)
      const baseFilename = file.name.replace(/\.(mp4|m4a|webm|ogg|wav)$/i, '');
      setMetadata({ ...metadata, filename: baseFilename });

      setShowMetadata(true);
      AudioLogger.log('File upload successful', { duration, size: file.size });
    } catch (error) {
      AudioLogger.error('File upload failed', error);
      showAlert(t('recorder.alert.loadError', { msg: error?.message || error }));
    }
  };

  // --- Native Capacitor Plugin Recording ---
  const startRecording = async () => {
    AudioLogger.log('startRecording called', { userLocation });
    if (!userLocation) {
      AudioLogger.error('No GPS location available');
      showAlert(t('recorder.alert.waitGpsBefore'));
      return;
    }
    try {
      // Use native plugin for Android/iOS
      if ((window as any).Capacitor?.isNativePlatform()) {
        AudioLogger.log('Using capacitor-voice-recorder plugin for recording');
        await VoiceRecorder.requestAudioRecordingPermission();
        await VoiceRecorder.startRecording();
        setIsRecording(true);
        setRecordingTime(0);
        setMarkers([]);
        recordingStartTimeRef.current = Date.now();

        // Auto-start derive session if not already active (derive owns breadcrumb tracking)
        onRecordingStart?.();

        // Start timer with 5-min auto-stop
        recordingTimeRef.current = 0;
        timerRef.current = setInterval(() => {
          recordingTimeRef.current += 1;
          const t = recordingTimeRef.current;
          setRecordingTime(t);
          if (t >= 300) {
            // Auto-stop at 5 minutes — called outside state updater
            stopRecordingRef.current?.();
          }
        }, 1000);
        return;
      }
      // Web fallback: use MediaRecorder API (Safari, Chrome, Firefox)
      AudioLogger.log('Using web MediaRecorder for recording');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      webStreamRef.current = stream;
      webChunksRef.current = [];

      // Pick best supported MIME type — prefer mp4 for Safari/iOS compatibility
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) webChunksRef.current.push(e.data);
      };
      webMediaRecorderRef.current = recorder;
      recorder.start(1000); // collect chunks every second
      setIsRecording(true);
      setRecordingTime(0);
      setMarkers([]);
      recordingStartTimeRef.current = Date.now();

      // Auto-start derive session if not already active (derive owns breadcrumb tracking)
      onRecordingStart?.();

      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        const t = recordingTimeRef.current;
        setRecordingTime(t);
        if (t >= 300) {
          stopRecordingRef.current?.();
        }
      }, 1000);
    } catch (err) {
      AudioLogger.error('Failed to start recording', err);
      showAlert(t('recorder.alert.startError', { msg: err?.message || err }));
    }
  };

  const stopRecording = async () => {
    AudioLogger.log('stopRecording called');
    if ((window as any).Capacitor?.isNativePlatform()) {
      try {
        const result = await VoiceRecorder.stopRecording();
        AudioLogger.log('Native recording stopped', result);
        setIsRecording(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        recordingTimeRef.current = 0;
        setRecordingTime(0);

        if (result?.value?.path) {
          setNativeRecordingPath(result.value.path);
          setAudioBlob(null);
          setShowMetadata(true); // Show metadata form after recording
        } else if (result?.value?.recordDataBase64) {
          // Convert base64 to Blob
          const base64 = result.value.recordDataBase64;
          const mimeType = result.value.mimeType || 'audio/aac';
          const byteString = atob(base64);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mimeType });
          setAudioBlob(blob);
          setNativeRecordingPath(null);
          setShowMetadata(true); // Show metadata form after recording
        } else {
          showAlert(t('recorder.alert.notSaved'));
        }
      } catch (err) {
        AudioLogger.error('Failed to stop native recording', err);
        showAlert(t('recorder.alert.stopError', { msg: err?.message || err }));
      }
      return;
    }
    // Web fallback: stop MediaRecorder
    const recorder = webMediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      AudioLogger.log('Stopping web MediaRecorder');
      return new Promise<void>((resolve) => {
        recorder.onstop = () => {
          setIsRecording(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          recordingTimeRef.current = 0;
          setRecordingTime(0);

          const chunks = webChunksRef.current;
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
            setAudioBlob(blob);
            setNativeRecordingPath(null);
            setShowMetadata(true);
          } else {
            showAlert(t('recorder.alert.noCapture'));
          }

          // Stop all mic tracks
          webStreamRef.current?.getTracks().forEach(t => t.stop());
          webStreamRef.current = null;
          webMediaRecorderRef.current = null;
          webChunksRef.current = [];
          resolve();
        };
        recorder.stop();
      });
    }
  };
  stopRecordingRef.current = stopRecording;

  const playRecording = () => {
    const audio = audioRef.current;
    if (!audio) return;
    // Release the previous blob URL before starting a new playback
    if (playUrlRef.current) {
      URL.revokeObjectURL(playUrlRef.current);
      playUrlRef.current = null;
    }
    if (nativeRecordingPath) {
      audio.src = nativeRecordingPath;
    } else if (audioBlob) {
      playUrlRef.current = URL.createObjectURL(audioBlob);
      audio.src = playUrlRef.current;
    } else {
      return;
    }
    audio.onended = () => {
      setIsPlaying(false);
      if (playUrlRef.current) {
        URL.revokeObjectURL(playUrlRef.current);
        playUrlRef.current = null;
      }
    };
    audio.play()
      .then(() => setIsPlaying(true))
      .catch((err) => {
        AudioLogger.error('Playback failed', err);
        setIsPlaying(false);
      });
  };

  const getAudioDuration = (audioBlobOrUrl) => {
    return new Promise((resolve) => {
      let objectUrl: string | null = null;
      const audio = document.createElement('audio');
      const finish = (value) => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        audio.removeAttribute('src');
        resolve(value);
      };
      try {
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => finish(Number(audio.duration));
        audio.onerror = () => finish(0);
        if (audioBlobOrUrl instanceof Blob) {
          objectUrl = URL.createObjectURL(audioBlobOrUrl);
          audio.src = objectUrl;
        } else {
          audio.src = audioBlobOrUrl;
        }
      } catch (e) {
        finish(0);
      }
    });
  };

  const validateAudioData = async (audioBlob, nativeRecordingPath) => {
    let hasValidAudio = false;
    let duration = recordingTime;
    let fileSize = 0;

    if (audioBlob && audioBlob.size > 0) {
      fileSize = audioBlob.size;
      // Check size limits early
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (fileSize > maxSize) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
        throw new Error(t('recorder.err.tooLarge', { size: sizeMB }));
      }

      hasValidAudio = true;
      duration = await getAudioDuration(audioBlob);
      AudioLogger.log('✅ Valid audio blob found:', fileSize, 'bytes, duration:', duration);
    } else if (nativeRecordingPath) {
      try {
        const { Filesystem } = await import('@capacitor/filesystem');
        const fileInfo = await Filesystem.stat({ path: nativeRecordingPath });
        fileSize = fileInfo.size;

        // Check size limits for native files too
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (fileSize > maxSize) {
          const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
          throw new Error(t('recorder.err.tooLarge', { size: sizeMB }));
        }

        if (fileSize > 0) {
          hasValidAudio = true;
          duration = await getAudioDuration(nativeRecordingPath);
          AudioLogger.log('✅ Valid native audio file found:', fileSize, 'bytes, duration:', duration);
        } else {
          AudioLogger.error('Native audio file is empty:', fileSize, 'bytes');
        }
      } catch (fileError) {
        if (fileError.message.includes('50MB')) {
          throw fileError; // Re-throw size errors
        }
        AudioLogger.error('Failed to validate native audio file:', fileError);
        throw new Error(t('recorder.err.cannotAccess', { msg: fileError.message }));
      }
    }

    if (!hasValidAudio) {
      throw new Error(t('recorder.err.noValidAudio'));
    }

    // Validate duration
    if (!duration || duration <= 0) {
      AudioLogger.log('Warning: Could not determine audio duration, using recording time:', recordingTime);
      duration = recordingTime || 1;
    }

    // Minimum recording duration check
    if (duration < 1) {
      throw new Error(t('recorder.err.tooShort'));
    }

    return { hasValidAudio, duration, fileSize };
  };

  const handleSave = async () => {
    try {
      // Validate metadata first
      if (!validateMetadata()) {
        showAlert(t('recorder.alert.validation'));
        return;
      }

      // Validate that we have actual recording data
      if (!nativeRecordingPath && !audioBlob) {
        showAlert(t('recorder.err.noData'));
        return;
      }

      // Validate audio data with proper error handling
      const { duration, fileSize } = await validateAudioData(audioBlob, nativeRecordingPath);

      AudioLogger.log('Audio validation passed:', { duration, fileSize });
      if ((window as any).Capacitor?.isNativePlatform()) {
        // Save metadata and file path or blob
        const generatedFilename = generateFilename();

        // Get breadcrumb session data if available
        const currentSession = breadcrumbService.getCurrentSession();
        const breadcrumbs = breadcrumbService.getCurrentBreadcrumbs();

        const recordingMetadata = {
          uniqueId: `recording-${Date.now()}`,
          filename: generatedFilename,
          displayName: metadata.filename.trim(),
          timestamp: new Date().toISOString(),
          duration: Math.round(duration),
          fileSize: fileSize,
          mimeType: audioBlob?.type || 'audio/mp4',
          location: userLocation,
          speciesTags: metadata.speciesTags || [], // Already an array from multi-select
          notes: metadata.notes.trim(),
          quality: metadata.quality || 'medium',
          weather: metadata.weather || null,
          temperature: metadata.temperature || null,
          // Bioacoustic metadata
          habitat: metadata.habitat || null,
          heightPosition: metadata.heightPosition || null,
          distanceEstimate: metadata.distanceEstimate || null,
          activityType: metadata.activityType || null,
          anthropophony: metadata.anthropophony || null,
          // Auto-captured context
          altitude: userLocation?.altitude ?? null,
          gpsAccuracy: locationAccuracy ?? null,
          deviceModel: navigator.userAgent || null,
          // Add breadcrumb data
          breadcrumbSession: currentSession,
          breadcrumbs: breadcrumbs,
          movementPattern: breadcrumbs.length > 0 ? breadcrumbService.generateSessionSummary().pattern : 'unknown',
          // Walk session linking
          walkSessionId: walkSessionId || null,
          // Timeline markers (bookmarks placed during recording)
          markers: markers.length > 0 ? markers : null
        };

        // --- Robust validation for required fields ---
        if (!recordingMetadata.location || typeof recordingMetadata.location.lat !== 'number' || !isFinite(recordingMetadata.location.lat) || typeof recordingMetadata.location.lng !== 'number' || !isFinite(recordingMetadata.location.lng)) {
          throw new Error(t('recorder.err.noLocation'));
        }
        if (!recordingMetadata.filename || !recordingMetadata.filename.trim()) {
          throw new Error('Filename is required.');
        }
        if (!recordingMetadata.timestamp) {
          throw new Error('Timestamp is missing.');
        }
        if (!recordingMetadata.duration || !isFinite(recordingMetadata.duration) || recordingMetadata.duration <= 0) {
          throw new Error('Duration is missing or invalid.');
        }
        // --- End robust validation ---

        const recordingData = {
          audioPath: nativeRecordingPath,
          audioBlob: audioBlob,
          metadata: recordingMetadata
        };

        // Call the save function; only clear the take once it succeeded
        await onSaveRecording(recordingData);
        reset();
        return;
      }
      // Web fallback: save from audioBlob (MediaRecorder result)
      if (audioBlob) {
        const generatedFilename = generateFilename();
        const currentSession = breadcrumbService.getCurrentSession();
        const breadcrumbs = breadcrumbService.getCurrentBreadcrumbs();

        const recordingMetadata = {
          uniqueId: `recording-${Date.now()}`,
          filename: generatedFilename,
          displayName: metadata.filename.trim(),
          timestamp: new Date().toISOString(),
          duration: Math.round(duration),
          fileSize: fileSize,
          mimeType: audioBlob.type || 'audio/mp4',
          location: userLocation,
          speciesTags: metadata.speciesTags || [],
          notes: metadata.notes.trim(),
          quality: metadata.quality || 'medium',
          weather: metadata.weather || null,
          temperature: metadata.temperature || null,
          habitat: metadata.habitat || null,
          heightPosition: metadata.heightPosition || null,
          distanceEstimate: metadata.distanceEstimate || null,
          activityType: metadata.activityType || null,
          anthropophony: metadata.anthropophony || null,
          altitude: userLocation?.altitude ?? null,
          gpsAccuracy: locationAccuracy ?? null,
          deviceModel: navigator.userAgent || null,
          breadcrumbSession: currentSession,
          breadcrumbs: breadcrumbs,
          movementPattern: breadcrumbs.length > 0 ? breadcrumbService.generateSessionSummary().pattern : 'unknown',
          walkSessionId: walkSessionId || null,
          markers: markers.length > 0 ? markers : null
        };

        if (!recordingMetadata.location || typeof recordingMetadata.location.lat !== 'number' || !isFinite(recordingMetadata.location.lat) || typeof recordingMetadata.location.lng !== 'number' || !isFinite(recordingMetadata.location.lng)) {
          throw new Error(t('recorder.err.noLocation'));
        }

        await onSaveRecording({ audioPath: null, audioBlob: audioBlob, metadata: recordingMetadata });
        reset();
        return;
      }
      throw new Error(t('recorder.err.nothingToSave'));
    } catch (error) {
      // Silent errors (free-tier limit) already surfaced their own UI;
      // keep the take open without a second alert.
      if (error?.silent) return;
      AudioLogger.error('Failed to save recording:', error);
      showAlert(error.message || t('recorder.alert.saveError'));
    }
  };

  const reset = () => {
    // Stops an in-progress capture too (Re-record / Cancel while recording)
    stopActiveCapture();
    setIsRecording(false);
    setNativeRecordingPath(null);
    setAudioBlob(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setShowMetadata(false);
    setShowDetailedFields(false);
    setMarkers([]);
    setMetadata({
      filename: '',
      notes: '',
      speciesTags: [],
      weather: '',
      temperature: '',
      quality: 'medium',
      habitat: '',
      heightPosition: '',
      distanceEstimate: '',
      activityType: '',
      anthropophony: ''
    });
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '190px',
      left: '50%',
      transform: `translate(calc(-50% + ${dragPos.x}px), ${dragPos.y}px)`,
      zIndex: 999999,
      pointerEvents: 'auto'
    }}>
      <div style={{
        backgroundColor: 'rgba(220,225,235,0.78)',
        borderRadius: '16px',
        boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px',
        padding: '14px',
        minWidth: '280px',
        maxWidth: '360px',
        width: '88vw',
        maxHeight: '65vh',
        overflow: 'auto',
        position: 'relative'
      }}>
        <div
          onPointerDown={onDragStart}
          style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          cursor: 'grab',
          touchAction: 'none'
        }}>
          <h3 style={{
            fontSize: '15px',
            fontWeight: '600',
            color: 'rgb(1 9 2 / 84%)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {isRecording ? t('recorder.recording') : (nativeRecordingPath || audioBlob) ? t('recorder.review') : t('recorder.title')}
            {IS_FREE && (() => {
              const info = localStorageService.getRecordingLimitInfo();
              return (
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: info.isAtLimit ? '#c24a6e' : 'rgba(78,78,134,0.15)',
                  color: info.isAtLimit ? 'white' : '#4e4e86'
                }}>
                  {t('tier.limitCounter', { used: info.used, max: info.limit })}
                </span>
              );
            })()}
          </h3>
          <button
            onClick={handleCancel}
            style={{
              color: '#6B7280',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Recording Status */}
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <div style={{
            fontSize: '20px',
            fontFamily: 'monospace',
            color: 'rgb(1 9 2 / 84%)',
            marginBottom: '4px'
          }}>
            {formatTime(recordingTime)}
          </div>

          {/* Time Warning */}
          {recordingTime > 0 && (
            <div style={{
              fontSize: '12px',
              color: recordingTime >= 270 ? '#c24a6e' : recordingTime >= 240 ? '#F59E0B' : '#6B7280',
              marginBottom: '4px'
            }}>
              {recordingTime >= 300 ? t('recorder.maxReached') :
                recordingTime >= 270 ? t('recorder.remaining', { time: `${Math.floor((300 - recordingTime) / 60)}:${String((300 - recordingTime) % 60).padStart(2, '0')}` }) :
                  t('recorder.maxInfo')}
            </div>
          )}

          {isRecording && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: recordingTime >= 270 ? '#c24a6e' : '#9dc04cd4',
                borderRadius: '50%',
                animation: 'pulse 1s infinite'
              }}></div>
              <span style={{
                fontSize: '14px',
                color: recordingTime >= 270 ? '#c24a6e' : '#6B7280'
              }}>
                {recordingTime >= 270 ? t('recorder.willStopSoon') : t('recorder.recording')}
              </span>
            </div>
          )}
        </div>

        {/* Marker count display */}
        {isRecording && markers.length > 0 && (
          <div style={{ fontSize: '11px', color: '#6B7280', textAlign: 'center', marginBottom: '8px' }}>
            {t('recorder.markerCount', { n: markers.length })}
          </div>
        )}

        {/* Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '12px',
          marginBottom: '12px'
        }}>
          {!isRecording && !nativeRecordingPath && !audioBlob && (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startRecording();
                }}
                disabled={!userLocation}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '52px',
                  height: '52px',
                  backgroundColor: userLocation ? '#c24a6e' : '#9CA3AF',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: userLocation ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.2s'
                }}
              >
                <Mic size={20} />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={!userLocation}
                title={t('recorder.uploadTitle')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '52px',
                  height: '52px',
                  backgroundColor: userLocation ? '#4e4e86' : '#9CA3AF',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: userLocation ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.2s'
                }}
              >
                <Plus size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mp4,audio/m4a,audio/x-m4a,audio/webm,audio/ogg,audio/wav,video/mp4,.mp4,.m4a,.webm,.ogg,.wav"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </>
          )}

          {isRecording && (
            <>
              <button
                onClick={addMarker}
                title={t('recorder.addMarker')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  backgroundColor: markers.length > 0 ? '#D97706' : '#6B7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                <MapPin size={18} />
              </button>
              <button
                onClick={stopRecording}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '52px',
                  height: '52px',
                  backgroundColor: '#4B5563',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                <Square size={20} />
              </button>
            </>
          )}

          {(nativeRecordingPath || audioBlob) && !isRecording && (
            <button
              onClick={playRecording}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                backgroundColor: '#4e4e86',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
          )}
        </div>

        {/* Audio element for native playback */}
        {nativeRecordingPath && <audio ref={audioRef} style={{ display: 'none' }} />}
        {audioBlob && <audio ref={audioRef} style={{ display: 'none' }} />}

        {/* Location info */}
        {userLocation && (
          <div style={{
            fontSize: '11px',
            color: '#6B7280',
            textAlign: 'center',
            marginBottom: '8px'
          }}>
            📍 {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
            {userLocation.altitude != null && ` · ${Math.round(userLocation.altitude)}m alt`}
            {locationAccuracy && ` · ±${Math.round(locationAccuracy)}m`}
          </div>
        )}

        {/* Metadata form */}
        {showMetadata && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Default: just optional note */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '500',
                color: 'rgb(1 9 2 / 84%)',
                marginBottom: '3px'
              }}>
                {t('recorder.note')}
              </label>
              <textarea
                value={metadata.notes}
                onChange={(e) => setMetadata({ ...metadata, notes: e.target.value })}
                placeholder={t('recorder.notePlaceholder')}
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  border: '1px solid rgba(78,78,134,0.22)',
                  borderRadius: '8px',
                  fontSize: '16px',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Species tap-chips — the fastest annotation, always visible */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '4px' }}>
                {t('recorder.species')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {speciesOptions.map(option => {
                  const selected = metadata.speciesTags.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const newTags = selected
                          ? metadata.speciesTags.filter(tag => tag !== option.value)
                          : [...metadata.speciesTags, option.value];
                        setMetadata({ ...metadata, speciesTags: newTags });
                      }}
                      aria-pressed={selected}
                      style={{
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: '22px',
                        border: selected ? 'none' : '1px solid rgba(78,78,134,0.25)',
                        backgroundColor: selected ? '#9dc04cd4' : 'white',
                        color: selected ? 'white' : 'rgb(1 9 2 / 84%)',
                        fontSize: '14px',
                        fontWeight: selected ? '600' : '400',
                        cursor: 'pointer'
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bioacoustic quick fields — always visible */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.habitat')}
                </label>
                <select
                  value={metadata.habitat}
                  onChange={(e) => setMetadata({ ...metadata, habitat: e.target.value })}
                  style={selectStyle}
                >
                  {habitatOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.stratum')}
                </label>
                <select
                  value={metadata.heightPosition}
                  onChange={(e) => setMetadata({ ...metadata, heightPosition: e.target.value })}
                  style={selectStyle}
                >
                  {heightPositionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.distance')}
                </label>
                <select
                  value={metadata.distanceEstimate}
                  onChange={(e) => setMetadata({ ...metadata, distanceEstimate: e.target.value })}
                  style={selectStyle}
                >
                  {distanceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.activity')}
                </label>
                <select
                  value={metadata.activityType}
                  onChange={(e) => setMetadata({ ...metadata, activityType: e.target.value })}
                  style={selectStyle}
                >
                  {activityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Toggle for detailed fields */}
            <button
              onClick={() => setShowDetailedFields(!showDetailedFields)}
              style={{
                background: 'none',
                border: '1px solid rgba(78,78,134,0.22)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                color: '#6B7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              {showDetailedFields ? t('recorder.less') : t('recorder.more')}
            </button>

            {/* Expanded detailed fields — filename is auto-generated, no typing */}
            {showDetailedFields && (
            <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.weather')}
                </label>
                <select
                  value={metadata.weather}
                  onChange={(e) => setMetadata({ ...metadata, weather: e.target.value })}
                  style={selectStyle}
                >
                  {weatherOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.temperature')}
                </label>
                <select
                  value={metadata.temperature}
                  onChange={(e) => setMetadata({ ...metadata, temperature: e.target.value })}
                  style={selectStyle}
                >
                  {temperatureOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.humanNoise')}
                </label>
                <select
                  value={metadata.anthropophony}
                  onChange={(e) => setMetadata({ ...metadata, anthropophony: e.target.value })}
                  style={selectStyle}
                >
                  {anthropophonyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'rgb(1 9 2 / 84%)', marginBottom: '3px' }}>
                  {t('recorder.quality')}
                </label>
                <select
                  value={metadata.quality}
                  onChange={(e) => setMetadata({ ...metadata, quality: e.target.value })}
                  style={selectStyle}
                >
                  <option value="low">{t('meta.quality.low')}</option>
                  <option value="medium">{t('meta.quality.medium')}</option>
                  <option value="high">{t('meta.quality.high')}</option>
                </select>
              </div>
            </div>
            </>
            )}

            <div style={{ display: 'flex', gap: '8px', paddingTop: '10px' }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  backgroundColor: '#9dc04cd4',
                  color: 'white',
                  padding: '12px',
                  minHeight: '48px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  transition: 'background-color 0.2s'
                }}
              >
                <Save size={18} />
                <span>{t('recorder.save')}</span>
              </button>
              <button
                onClick={reset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 14px',
                  minHeight: '44px',
                  border: '1px solid rgba(78,78,134,0.22)',
                  borderRadius: '8px',
                  color: 'rgb(1 9 2 / 84%)',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'background-color 0.2s'
                }}
              >
                {t('recorder.rerecord')}
              </button>
            </div>
          </div>
        )}

        {!userLocation && (
          <div style={{
            textAlign: 'center',
            fontSize: '12px',
            color: '#D97706',
            backgroundColor: '#FEF3C7',
            borderRadius: '6px',
            padding: '6px'
          }}>
            {t('recorder.waitingGps')}
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  );
};

export default AudioRecorder;