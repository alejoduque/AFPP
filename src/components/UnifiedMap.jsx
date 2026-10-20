// BETA VERSION: Overlapping audio spots now support Concatenated and Jamm listening modes.
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
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents, Polyline, Tooltip } from 'react-leaflet';
import { Play, Pause, Square, Volume2, VolumeX, ArrowLeft, MapPin, Mic, Trash2 } from 'lucide-react';

// Services
import locationService from '../services/locationService.js';
import walkSessionService from '../services/walkSessionService.js';
import breadcrumbService from '../services/breadcrumbService.js';
import deriveController from '../services/deriveController.js';
import localStorageService from '../services/localStorageService.js';
import userAliasService from '../services/userAliasService.js';

// Components
import BreadcrumbVisualization from './BreadcrumbVisualization.jsx';
import SharedTopBar from './SharedTopBar.jsx';
import DetailView from './DetailView.jsx';
import AudioRecorder from '../services/AudioRecorder.tsx';
import AliasPrompt from './AliasPrompt.jsx';
import SessionHistoryPanel from './SessionHistoryPanel.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import TracklistItem from './TracklistItem.jsx';

// Hooks
import useDraggable from '../hooks/useDraggable.js';

// Utils
import { createDurationCircleIcon, createPlayingNearbyIcon, createUserLocationIcon } from './SharedMarkerUtils.js';
import { t, tOption, formatTime as i18nFormatTime, formatDateTime } from '../i18n';
import UpgradePrompt from './UpgradePrompt.jsx';
import { FEATURES } from '../config/tier.js';
import AfppShareButton from './AfppShareButton.jsx';
import afppShareService from '../services/afppShareService.js';


const SetTheoryRadarHUD = ({ trackProgress, playbackMode, userHeadingRef, nearbyRange, setNearbyRange, onOffsetChange }) => {
  const radarSize = 250;
  const radarRadius = radarSize / 2;
  const compassRef = useRef(null);
  const hudPos = useDraggable(); // HUD itself is draggable

  // Handle center dot dragging for manual spatial mixing
  const isDraggingOffset = useRef(false);
  const startDragPos = useRef({ x: 0, y: 0 });
  const [localOffset, setLocalOffset] = useState({ x: 0, y: 0 });

  const handleOffsetPointerDown = (e) => {
    isDraggingOffset.current = true;
    startDragPos.current = { x: e.clientX - localOffset.x, y: e.clientY - localOffset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleOffsetPointerMove = (e) => {
    if (!isDraggingOffset.current) return;
    const dx = e.clientX - startDragPos.current.x;
    const dy = e.clientY - startDragPos.current.y;
    // Constrain within radar circle
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > radarRadius) {
      const scale = radarRadius / dist;
      const nx = dx * scale;
      const ny = dy * scale;
      setLocalOffset({ x: nx, y: ny });
      onOffsetChange({ x: nx, y: ny });
    } else {
      setLocalOffset({ x: dx, y: dy });
      onOffsetChange({ x: dx, y: dy });
    }
  };

  const handleOffsetPointerUp = (e) => {
    isDraggingOffset.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const resetManualPos = (e) => {
    e.stopPropagation();
    setLocalOffset({ x: 0, y: 0 });
    onOffsetChange({ x: 0, y: 0 });
  };

  // High-performance 60fps AR compass decoupling
  useEffect(() => {
    if (playbackMode !== 'nearby') return;
    let animFrame;
    const updateCompass = () => {
      if (compassRef.current && userHeadingRef && userHeadingRef.current !== null) {
        const heading = userHeadingRef.current;
        compassRef.current.style.transform = `rotate(${-heading}deg)`;
      }
      animFrame = requestAnimationFrame(updateCompass);
    };
    animFrame = requestAnimationFrame(updateCompass);
    return () => cancelAnimationFrame(animFrame);
  }, [playbackMode, userHeadingRef]);

  if (playbackMode !== 'nearby') return null;

  const entries = Object.values(trackProgress || {});
  const range = nearbyRange || 500;

  return (
    <div 
      style={{ 
        position: 'fixed', 
        bottom: '100px', 
        right: '25px', 
        width: `${radarSize}px`, 
        height: `${radarSize + 90}px`, 
        pointerEvents: 'none', 
        zIndex: 2000,
        transform: `translate(${hudPos.position.x}px, ${hudPos.position.y}px)`,
        touchAction: 'none'
      }}
    >
      {/* Persistent Scale Slider — MOVED TO TOP for better accessibility */}
      <div style={{ 
        marginBottom: '15px', 
        padding: '14px', 
        backgroundColor: 'rgba(15,15,25,0.88)', 
        borderRadius: '14px', 
        border: '1px solid rgba(255,255,255,0.2)',
        backdropFilter: 'blur(16px)',
        pointerEvents: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        width: `${radarSize}px`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#9dc04c', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('hud.radius')}</span>
            <div style={{ width: '4px', height: '4px', backgroundColor: '#9dc04c', borderRadius: '50%' }} />
          </div>
          <span style={{ fontSize: '15px', fontWeight: '800', color: 'white', textShadow: '0 0 10px rgba(157,192,76,0.4)' }}>
            {range >= 1000 ? `${(range/1000).toFixed(1)} km` : `${range} m`}
          </span>
        </div>
        <input
          type="range"
          min="50"
          max="10000"
          step={range < 1000 ? 50 : 500}
          value={range}
          onChange={(e) => setNearbyRange(parseInt(e.target.value))}
          style={{
            width: '100%',
            cursor: 'grab',
            accentColor: '#9dc04c',
            height: '10px',
            borderRadius: '5px',
            outline: 'none',
            background: 'rgba(255,255,255,0.1)'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: '#888', fontWeight: '600' }}>
          <span>{t('hud.focus')}</span>
          <span>{t('hud.wide')}</span>
        </div>
      </div>

      {/* Target area for dragging the whole HUD */}
      <div 
        onPointerDown={hudPos.handlePointerDown}
        style={{
          width: `${radarSize}px`,
          height: `${radarSize}px`,
          position: 'relative',
          pointerEvents: 'auto',
          backgroundColor: 'rgba(20,20,30,0.7)',
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
          cursor: 'grab'
        }}
      >
         {/* Rotating Compass Ring */}
         <div 
           ref={compassRef}
           style={{
             position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
             borderRadius: '50%', border: '1px dashed rgba(255, 68, 68, 0.4)',
             pointerEvents: 'none'
           }}
         >
           <div style={{
             position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
             color: '#ff4444', fontSize: '13px', fontWeight: '900', background: 'rgba(0,0,0,0.9)',
             padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(255,68,68,0.5)',
             textShadow: '0 0 10px rgba(255,68,68,0.6)'
           }}>N</div>
         </div>

         {/* Grid Rings */}
         {[0.25, 0.5, 0.75].map(p => (
           <div key={p} style={{
             position: 'absolute', top: `${(1-p)*50}%`, left: `${(1-p)*50}%`, width: `${p*100}%`, height: `${p*100}%`,
             border: '1px solid rgba(255,255,255,0.08)', borderRadius: '50%', pointerEvents: 'none'
           }} />
         ))}

         {/* User Mixing Dot (Draggable) */}
         <div 
           onPointerDown={handleOffsetPointerDown}
           onPointerMove={handleOffsetPointerMove}
           onPointerUp={handleOffsetPointerUp}
           style={{
             position: 'absolute', 
             top: `calc(50% + ${localOffset.y}px)`, 
             left: `calc(50% + ${localOffset.x}px)`, 
             width: '24px', height: '24px',
             backgroundColor: '#ff4444', borderRadius: '50%',
             transform: 'translate(-50%, -50%)',
             boxShadow: '0 0 20px rgba(255,68,68,0.8), inset 0 0 5px rgba(0,0,0,0.5)',
             cursor: 'crosshair', pointerEvents: 'auto',
             zIndex: 10,
             border: '2px solid white',
             display: 'flex', alignItems: 'center', justifyContent: 'center'
           }} 
         >
           <div style={{ width: '4px', height: '4px', backgroundColor: 'white', borderRadius: '50%' }} />
         </div>

         {/* Reset Button */}
         {(localOffset.x !== 0 || localOffset.y !== 0) && (
           <button 
             onClick={resetManualPos}
             style={{
               position: 'absolute', top: '75%', left: '50%', transform: 'translateX(-50%)',
               background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)',
               color: 'white', fontSize: '9px', padding: '4px 8px', borderRadius: '10px',
               pointerEvents: 'auto', cursor: 'pointer', zIndex: 11, textTransform: 'uppercase'
             }}
           >
             {t('hud.centerPos')}
           </button>
         )}

         {/* Audio Blobs */}
         {entries.map(progress => {
           if (!progress.location || !progress.distance) return null;
           
           const relDist = progress.distance / range;
           if (relDist > 1.2) return null; // Only show sounds roughly in range

           const angleRad = (progress.relativeBearing || 0) * (Math.PI / 180);
           const x = Math.sin(angleRad) * relDist * radarRadius;
           const y = -Math.cos(angleRad) * relDist * radarRadius;
           
           const vol = progress.volumeLevel || 0;
           const blobSize = 35 + (vol * 45); // Bigger blobs
           
           let themeColor = '#4e4e86';
           if (vol > 0.6) themeColor = '#c24a6e';
           else if (vol > 0.2) themeColor = '#9dc04c';

           return (
             <div key={progress.spotId} style={{
               position: 'absolute',
               top: '50%', left: '50%',
               width: `${blobSize}px`, height: `${blobSize}px`,
               transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
               opacity: 0.6 + (vol * 0.4),
               mixBlendMode: 'screen',
               zIndex: 5
             }}>
               <div style={{
                 position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                 borderRadius: '50%', backgroundColor: themeColor,
                 boxShadow: `0 0 ${vol * 20}px ${themeColor}`,
                 opacity: 0.7,
                 border: '1px solid rgba(255,255,255,0.3)'
               }} />
               <div style={{
                 position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                 color: 'white', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', 
                 textShadow: '0 2px 4px black', pointerEvents: 'none'
               }}>
                 {Math.round(vol * 100)}%
               </div>
               <div style={{
                 position: 'absolute', bottom: '-18px', left: '50%', transform: 'translateX(-50%)',
                 color: 'white', fontSize: '9px', whiteSpace: 'nowrap', textShadow: '0 1px 4px black', opacity: 0.8
               }}>
                 {progress.filename?.substring(0, 10)}
               </div>
             </div>
           );
         })}
      </div>

    </div>
  );
};
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

// Detects user-initiated zoom and tracks current zoom level
const MapZoomHandler = ({ onUserZoom, onZoomChange }) => {
  const map = useMapEvents({
    zoomstart() {
      if (!map._flyDest) onUserZoom();
    },
    zoomend() {
      onZoomChange(map.getZoom());
    }
  });
  return null;
};

// Simplify breadcrumb array by decimating points while preserving track shape
// Uses Ramer-Douglas-Peucker-like approach: keep points with significant direction change
const simplifyBreadcrumbs = (breadcrumbs, tolerance = 0.0001) => {
  if (breadcrumbs.length <= 2) return breadcrumbs;

  const simplified = [breadcrumbs[0]]; // Always keep first point

  for (let i = 1; i < breadcrumbs.length - 1; i++) {
    const prev = breadcrumbs[i - 1];
    const curr = breadcrumbs[i];
    const next = breadcrumbs[i + 1];

    // Calculate distance from current point to line between prev and next
    const dx = next.lat - prev.lat;
    const dy = next.lng - prev.lng;
    const norm = Math.sqrt(dx * dx + dy * dy);

    if (norm === 0) continue; // Skip if prev and next are same point

    const perpDist = Math.abs((dy * curr.lat - dx * curr.lng + next.lng * prev.lat - next.lat * prev.lng) / norm);

    // Keep point if it deviates significantly OR has high audio level (important feature)
    if (perpDist > tolerance || (curr.audioLevel && curr.audioLevel > 0.7)) {
      simplified.push(curr);
    }
  }

  simplified.push(breadcrumbs[breadcrumbs.length - 1]); // Always keep last point

  return simplified;
};

const SoundWalkAndroid = ({ onBackToLanding, onOpenGlobe, locationPermission: propLocationPermission, userLocation, hasRequestedPermission, setLocationPermission, setUserLocation, setHasRequestedPermission, allSessions, allRecordings, onDataRefresh }) => {
  // Add local state for GPS button state
  const [gpsState, setGpsState] = useState('idle'); // idle, loading, granted, denied
  const locationPermission = gpsState === 'idle' ? 'idle' : propLocationPermission;
  const [audioSpots, setAudioSpots] = useState([]);
  const [nearbySpots, setNearbySpots] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [isMuted, setMuted] = useState(false);
  const [proximityVolumeEnabled, setProximityVolumeEnabled] = useState(false);
  const proximityVolumeEnabledRef = useRef(false);
  useEffect(() => {
    proximityVolumeEnabledRef.current = proximityVolumeEnabled;
  }, [proximityVolumeEnabled]);
  // Always show map
  const showMap = true;
  const [activeGroup, setActiveGroup] = useState(null);
  const [playbackMode, setPlaybackMode] = useState(null);

  // Auto-Zoom effect when Nearby mode is activated
  useEffect(() => {
    if (playbackMode === 'nearby' && userLocation && mapRef.current) {
      console.log('📍 Starting Nearby Mode: Zooming in tightly to anchor HUD');
      // Zoom level 17 is tight enough to show the ultrared pin and breadcrumbs beautifully
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], 17, { duration: 1.2 });
    }
  }, [playbackMode, userLocation]);
  const [relojWindow, setRelojWindow] = useState(30); // ±15, ±30, or ±60 minutes
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const audioRefs = useRef([]);
  const audioContext = useRef(null);
  const isPlayingRef = useRef(false);
  const playbackTimeoutRef = useRef(null);
  const lastCenteredRef = useRef(null);
  const cumulativeDistanceRef = useRef(0); // running total distance for auto-zoom
  const userHasZoomedRef = useRef(false); // true when user manually zooms — disables auto-zoom
  const lastAutoZoomRef = useRef(19); // last zoom level set by auto-zoom
  const activeWalkSessionRef = useRef(null); // always-current ref for use in callbacks
  const onNewPositionRef = useRef(null); // always-current ref so location-watch closures stay fresh
  const activeTracksRef = useRef([]); // array of { audio, spot, id } for progress tracking
  const progressAnimFrameRef = useRef(null); // rAF handle for progress polling
  const spatialAudioIntervalRef = useRef(null); // interval for updating spatial audio parameters
  const userLocationRef = useRef(null); // always-current user location for spatial audio calculations
  const userHeadingRef = useRef(null); // always-current user heading for spatial audio
  const isMutedRef = useRef(false); // always-current mute state for spatial audio
  const playbackModeRef = useRef(null); // always-current mode for async logic
  const volumeRef = useRef(0.4); // always-current volume state
  const audioSpotsRef = useRef([]); // ref for dynamic nearby loop
  const spatialAudioContextRef = useRef(null); // shared master audio context
  const compressorNodeRef = useRef(null); // shared master compressor node
  const loadingSpotsRef = useRef(new Set()); // tracking spot loads
  const zoomThrottleRef = useRef(null); // timeout for debouncing zoom updates
  const [mapInstance, setMapInstance] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(19);
  // Add state for auto-centering
  const [hasAutoCentered, setHasAutoCentered] = useState(false);

  // Breadcrumb state
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(true); // Enable by default
  const [breadcrumbVisualization, setBreadcrumbVisualization] = useState('animated');
  const [currentBreadcrumbs, setCurrentBreadcrumbs] = useState([]);
  const [isBreadcrumbTracking, setIsBreadcrumbTracking] = useState(false);

  // Add layer switching state
  const [currentLayer, setCurrentLayer] = useState('EsriWorldImagery');

  // Debug state
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // Draggable reproductor
  const { position: playerDragPos, handlePointerDown: onPlayerDragStart } = useDraggable();
  const { position: nearbyDragPos, handlePointerDown: onNearbyDragStart } = useDraggable();

  // Walk session & recording state
  const [showAliasPrompt, setShowAliasPrompt] = useState(false);
  const [isAudioRecorderVisible, setIsAudioRecorderVisible] = useState(false);
  const [activeWalkSession, setActiveWalkSession] = useState(() => {
    // If a stale active session exists from a previous app run, auto-save it
    const stale = walkSessionService.autoSaveStaleSession();
    if (stale) return null; // was saved, start fresh
    return walkSessionService.getActiveSession();
  });
  const [nearbyRange, setNearbyRange] = useState(500); // proximity range in meters
  const nearbyRangeRef = useRef(500);
  useEffect(() => { nearbyRangeRef.current = nearbyRange; }, [nearbyRange]);

  // Free-tier upgrade modal (recording limit reached)
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Manual spatial positioning offset for HUD-based mixing
  const [manualSpatialOffset, setManualSpatialOffset] = useState({ x: 0, y: 0 });
  const manualSpatialOffsetRef = useRef({ x: 0, y: 0 });
  useEffect(() => { manualSpatialOffsetRef.current = manualSpatialOffset; }, [manualSpatialOffset]);

  // Keep refs in sync so stale location-watch closures always call latest handlers
  useEffect(() => { activeWalkSessionRef.current = activeWalkSession; }, [activeWalkSession]);
  useEffect(() => { playbackModeRef.current = playbackMode; }, [playbackMode]);

  // Wire deriveController callbacks once on mount
  useEffect(() => {
    deriveController.onSessionStart = (session) => {
      // breadcrumbService.startTracking already called by deriveController before this callback
      setIsBreadcrumbTracking(true);
      cumulativeDistanceRef.current = 0;
      userHasZoomedRef.current = false;
      lastAutoZoomRef.current = 19;
      setActiveWalkSession(session);
    };
    deriveController.onSessionStop = () => {
      setActiveWalkSession(null);
      setIsBreadcrumbTracking(false);
    };
    return () => {
      deriveController.onSessionStart = null;
      deriveController.onSessionStop = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [afppPromptSessionId, setAfppPromptSessionId] = useState(null); // offer to share right after a derive ends
  const [sessionTracklines, setSessionTracklines] = useState([]);
  const [visibleSessionIds, setVisibleSessionIds] = useState(new Set());
  const [sessionPlayback, setSessionPlayback] = useState(null); // { sessionId, mode, title, alias }
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [trackProgress, setTrackProgress] = useState({});
  const [playingNearbySpotIds, setPlayingNearbySpotIds] = useState(new Set()); // Track which spots are playing in nearby mode

  // Auto-zoom: zoom = clamp(19 - log2(distance / 25), 14, 19)
  const computeAutoZoom = (distanceMeters) => {
    if (distanceMeters <= 25) return 19;
    const z = 19 - Math.log2(distanceMeters / 25);
    return Math.max(14, Math.min(19, z));
  };

  // Apply auto-zoom if user hasn't manually overridden
  const applyAutoZoom = (position, distanceMeters) => {
    if (!mapInstance || userHasZoomedRef.current) return;
    const targetZoom = computeAutoZoom(distanceMeters);
    // Only zoom out, never zoom back in automatically (avoid jarring snaps)
    if (targetZoom >= lastAutoZoomRef.current) return;
    // Smooth transition — only adjust if zoom changed by at least 0.3 levels
    if (lastAutoZoomRef.current - targetZoom < 0.3) return;
    lastAutoZoomRef.current = targetZoom;
    mapInstance.flyTo([position.lat, position.lng], Math.round(targetZoom), { duration: 0.8 });
  };

  // Playback-mode label with its icon, translated (e.g. "📍 Nearby" / "📍 Cercanos")
  const modeLabelWithIcon = (id) => {
    const icons = {
      nearby: '📍', chronological: '📅', jamm: '🎛️', reloj: '🕐',
      alba: '🌅', crepusculo: '🌇', estratos: '🌿', migratoria: '🦋', espectro: '🌈'
    };
    if (!id) return '';
    return `${icons[id] || ''} ${t(`mode.${id}`)}`.trim();
  };

  // Compute mode-specific playable recording count
  // Markers are shown for all spots regardless of session visibility, so count all spots.
  // Only migratoria restricts to visible-session spots (walk-order makes no sense cross-session).
  const modePlayableCount = useMemo(() => {
    // Use same session filter as the play button so count matches what actually plays
    const visible = audioSpots.filter(s => !s.walkSessionId || visibleSessionIds.has(s.walkSessionId));
    const visibleInSession = visible;
    const nowHour = new Date().getHours();
    const nowMin = new Date().getMinutes();
    const nowTotalMin = nowHour * 60 + nowMin;

    switch (playbackMode) {
      case 'nearby':
        return nearbySpots.length;
      case 'reloj': {
        const windowMin = relojWindow;
        return visible.filter(s => {
          if (!s.timestamp) return false;
          const d = new Date(s.timestamp);
          const recMin = d.getHours() * 60 + d.getMinutes();
          const diff = Math.abs(recMin - nowTotalMin);
          return Math.min(diff, 1440 - diff) <= windowMin;
        }).length;
      }
      case 'alba': {
        return visible.filter(s => {
          if (!s.timestamp) return false;
          const recHour = new Date(s.timestamp).getHours();
          const recLat = s.lat || s.latitude;
          const sun = recLat ? estimateSunHours(recLat) : { dawnStart: 5, dawnEnd: 8 };
          return recHour >= sun.dawnStart && recHour < sun.dawnEnd;
        }).length;
      }
      case 'crepusculo': {
        return visible.filter(s => {
          if (!s.timestamp) return false;
          const recHour = new Date(s.timestamp).getHours();
          const recLat = s.lat || s.latitude;
          const sun = recLat ? estimateSunHours(recLat) : { duskStart: 17, duskEnd: 20 };
          return recHour >= sun.duskStart && recHour < sun.duskEnd;
        }).length;
      }
      case 'estratos':
      case 'chronological':
      case 'jamm':
      case 'espectro':
        return visible.length;
      case 'migratoria':
        return visibleInSession.filter(s => s.walkSessionId).length;
      default:
        return visible.length;
    }
  }, [playbackMode, audioSpots, visibleSessionIds, nearbySpots, relojWindow]);

  // Keep refs synchronized for spatial audio calculations
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    let isMounted = true;
    locationService.startHeadingWatch((heading) => {
      if (isMounted) userHeadingRef.current = heading;
    });
    return () => {
      isMounted = false;
      locationService.stopHeadingWatch();
    };
  }, []);

  // 1. Move recentering logic to a useEffect that depends on userLocation, and use 10 meters
  useEffect(() => {
    if (userLocation && (propLocationPermission === 'granted' || gpsState === 'granted')) {
      setGpsState('granted');
      if (mapInstance) {
        const prev = lastCenteredRef.current;
        const curr = userLocation;
        if (!prev) {
          setTimeout(() => {
            if (mapInstance) {
              mapInstance.invalidateSize();
              mapInstance.flyTo([curr.lat, curr.lng], 18, { duration: 1.2 });
            }
          }, 500);
          lastCenteredRef.current = { lat: curr.lat, lng: curr.lng };
        } else if (!userHasZoomedRef.current) {
          const R = 6371e3;
          const φ1 = prev.lat * Math.PI / 180;
          const φ2 = curr.lat * Math.PI / 180;
          const Δφ = (curr.lat - prev.lat) * Math.PI / 180;
          const Δλ = (curr.lng - prev.lng) * Math.PI / 180;
          const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;
          if (distance > 10) { // 10 meters threshold — recenter, keep current zoom
            mapInstance.setView([curr.lat, curr.lng], mapInstance.getZoom());
            lastCenteredRef.current = { lat: curr.lat, lng: curr.lng };
          }
        }
      }
    } else {
      setGpsState('idle');
    }
  }, [userLocation, propLocationPermission, gpsState, mapInstance]);

  useEffect(() => {
    const spots = allRecordings.map(recording => ({
      id: recording.uniqueId,
      location: recording.location,
      filename: recording.displayName || recording.filename,
      timestamp: recording.timestamp,
      duration: recording.duration,
      notes: recording.notes,
      speciesTags: recording.speciesTags || [],
      audioBlob: recording.audioBlob,
      walkSessionId: recording.walkSessionId || null, // Track which deriva this belongs to
    })).filter(spot =>
      spot &&
      spot.location &&
      typeof spot.location.lat === 'number' && isFinite(spot.location.lat) &&
      typeof spot.location.lng === 'number' && isFinite(spot.location.lng) &&
      typeof spot.duration === 'number' && isFinite(spot.duration) && spot.duration > 0
    );
    setAudioSpots(spots);
    audioSpotsRef.current = spots;
  }, [allRecordings]);

  useEffect(() => {
    let isMounted = true;
    const handleLocationGranted = (position) => {
      if (!isMounted) return;
      setUserLocation(position);
      setLocationPermission('granted');
      setHasRequestedPermission(true);
      setGpsState('granted');
      locationService.startLocationWatch(
        (newPosition) => {
          if (!isMounted) return;
          setUserLocation(newPosition);
          setLocationPermission('granted');
          setGpsState('granted');
          onNewPositionRef.current?.(newPosition);
        },
        (error) => {
          if (!isMounted) return;
          setLocationPermission('denied');
          setGpsState('denied');
        }
      );
    };
    const handleLocationDenied = (errorMessage) => {
      if (!isMounted) return;
      setLocationPermission('denied');
      setUserLocation(null);
      setHasRequestedPermission(true);
      setGpsState('denied');
    };
    const checkCachedPermissionState = async () => {
      setGpsState('loading');
      try {
        setLocationPermission('unknown');
        const permissionState = await locationService.checkLocationPermission();
        if (permissionState === 'granted') {
          const position = await locationService.requestLocation();
          handleLocationGranted(position);
        } else if (permissionState === 'denied') {
          handleLocationDenied(t('map.locationDenied'));
        } else {
          try {
            const position = await locationService.requestLocation();
            handleLocationGranted(position);
          } catch (error) {
            handleLocationDenied(error.message);
          }
        }
      } catch (error) {
        handleLocationDenied(error.message);
      }
    };
    // Auto-check cached permission on mount — if already granted, center map
    // We remove the !hasRequestedPermission block so the app gracefully auto-locates on every load!
    checkCachedPermissionState();
    return () => {
      isMounted = false;
      locationService.stopLocationWatch();
    };
  }, [hasRequestedPermission, setLocationPermission, setUserLocation, setHasRequestedPermission]);

  const handleLocationRetry = async () => {
    setGpsState('loading');
    setLocationPermission('unknown');
    try {
      locationService.stopLocationWatch();
      const position = await locationService.requestLocation();
      setUserLocation(position);
      setLocationPermission('granted');
      setHasRequestedPermission(true);
      setGpsState('granted');
      locationService.startLocationWatch(
        (newPosition) => {
          setUserLocation(newPosition);
          setLocationPermission('granted');
          setGpsState('granted');
          onNewPositionRef.current?.(newPosition);
        },
        (error) => {
          setLocationPermission('denied');
          setGpsState('denied');
        }
      );
    } catch (error) {
      setLocationPermission('denied');
      setUserLocation(null);
      setHasRequestedPermission(true);
      setGpsState('denied');
    }
  };

  // Called on every GPS position update — handles breadcrumb feeding, auto-zoom, and derive lifecycle
  const onNewPosition = (position) => {
    checkNearbySpots(position);
    // Feed position to breadcrumb service (passive consumer — no GPS watch of its own)
    breadcrumbService.feedPosition(position);

    // Delegate all derive start/stop automation to deriveController.
    // Returns metres moved this tick (0 if drift/poor accuracy) for auto-zoom.
    const stepDist = deriveController.feedPosition(position, activeWalkSessionRef.current);
    if (stepDist > 0) {
      cumulativeDistanceRef.current += stepDist;
      applyAutoZoom(position, cumulativeDistanceRef.current);
    }
  };
  // Keep ref current so location-watch closures (created once) always call the latest version
  onNewPositionRef.current = onNewPosition;

  const checkNearbySpots = (position) => {
    if (!position || !audioSpots.length) return;
    const nearby = audioSpots.filter(spot => {
      // Cercanos mode shows ALL sounds within 10km regardless of derive visibility
      const distance = calculateDistance(
        position.lat, position.lng,
        spot.location.lat, spot.location.lng
      );
      return distance <= 10000; // 10000m range (10km) for nearby mode
    });
    setNearbySpots(nearby);
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  function getProximityVolume(distance) {
    const range = nearbyRangeRef.current || 500;
    if (distance <= 10) return 1.0; 
    if (distance >= range) return 0.0;
    // Quadratic rolloff for a more natural sound mix as you approach
    // (1 - d/range)^2 gives a nice curve where volume drops off more gradually at the edges
    const normalized = 1 - (distance / range);
    return Math.pow(normalized, 1.5);
  }

  // Calculate bearing (direction) from user to audio spot in degrees (0-360)
  function calculateBearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
  }

  // Convert bearing to stereo pan (-1 = full left, +1 = full right)
  function calculateSterePan(bearing) {
    // 0° = North = center (0)
    // 90° = East = full right (+1)
    // 180° = South = center (0)  
    // 270° = West = full left (-1)

    // Convert bearing to radians for smoother calculation
    const bearingRad = bearing * Math.PI / 180;

    // Use sine function to map bearing to pan (-1 to +1)
    // 90° (East) = sin(90°) = 1 (right)
    // 270° (West) = sin(270°) = -1 (left)
    const pan = Math.sin(bearingRad);

    // Clamp to valid range
    return Math.max(-1, Math.min(1, pan));
  }

  const playAudio = async (spot, audioBlob, userPos = null) => {
    if (isPlayingRef.current) {
      await stopAllAudio();
    }
    try {
      setIsLoading(true);
      
      // Initialize spatial engine if needed so single play also gets dynamic panning
      let audioCtx = spatialAudioContextRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        spatialAudioContextRef.current = audioCtx;
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.connect(audioCtx.destination);
        compressorNodeRef.current = compressor;
      } else if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      
      const compressor = compressorNodeRef.current;
      if (audioCtx && compressor) {
          try {
            const srcNode = audioCtx.createMediaElementSource(audio);
            const panner = audioCtx.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'exponential';
            panner.refDistance = 10;
            panner.maxDistance = 1000;
            panner.rolloffFactor = 0.0;
            
            srcNode.connect(panner);
            panner.connect(compressor);
            audio._audioSource = srcNode;
            audio._pannerNode = panner;
          } catch(e) {}
      }

      let dist = 0;
      if (proximityVolumeEnabled && userPos && spot.location) {
        dist = calculateDistance(userPos.lat, userPos.lng, spot.location.lat, spot.location.lng);
        const proximityVolume = getProximityVolume(dist);
        audio.volume = proximityVolume;
      } else {
        audio.volume = isMuted ? 0 : volume;
      }

      audioRefs.current.push(audio);
      registerActiveTrack(audio, spot);
      setCurrentAudio(spot);
      setSelectedSpot(spot);
      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);
      startProgressPolling();
      // Also start spatial updates for panning even in single mode
      startSpatialAudioUpdates();

      audio.onended = () => {
        isPlayingRef.current = false;
        setIsPlaying(false);
      };

      try {
        await audio.play();
      } catch (playError) {
        setTimeout(async () => {
          try {
            await audio.play();
          } catch (retryError) {}
        }, 100);
      }
    } catch (error) {
      isPlayingRef.current = false;
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  const playNearbySpots = async () => {
    try {
      setIsLoading(true);
      await stopAllAudio();

      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlaybackMode('nearby');

      // Initialize Web Audio Context and Master Compressor for 3D mix
      let audioCtx = spatialAudioContextRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AudioContextClass();
          spatialAudioContextRef.current = audioCtx;

          // Master compressor to prevent digital clipping when mixing multiple nearby sounds
          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -12;
          compressor.knee.value = 10;
          compressor.ratio.value = 6;
          compressor.attack.value = 0.05;
          compressor.release.value = 0.25;
          compressor.connect(audioCtx.destination);
          compressorNodeRef.current = compressor;
        } catch (e) {
          console.warn('Web Audio API not supported', e);
        }
      } else if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      setIsLoading(false);
      startSpatialAudioUpdates();
      startProgressPolling();
    } catch (error) {
      console.error('❌ Error initializing spatial audio:', error);
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  const pauseAllAudio = () => {
    console.log('⏸️ Pausing all audio');
    isPlayingRef.current = false;
    setIsPlaying(false);
    audioRefs.current.forEach(audio => {
      try { if (!audio.paused) audio.pause(); } catch (e) {}
    });
    if (spatialAudioContextRef.current && spatialAudioContextRef.current.state === 'running') {
      spatialAudioContextRef.current.suspend().catch(e => {});
    }
  };

  const resumeAllAudio = async () => {
    console.log('▶️ Resuming all audio');
    isPlayingRef.current = true;
    setIsPlaying(true);
    if (spatialAudioContextRef.current && spatialAudioContextRef.current.state === 'suspended') {
      await spatialAudioContextRef.current.resume();
    }
    audioRefs.current.forEach(audio => {
      try { if (audio.paused) audio.play(); } catch (e) {}
    });
  };

  const handlePlayNearby = () => {
    console.log('🎯 handlePlayNearby called');

    // If already playing NEARBY, then pause
    if (isPlaying && playbackMode === 'nearby') {
      console.log('⏹️ Already playing nearby, pausing audio');
      pauseAllAudio();
      return;
    }

    // If playing something else or switched mode, reset and start fresh
    if (isPlaying || (activeTracksRef.current.length > 0 && playbackMode !== 'nearby')) {
      stopAllAudio();
    }

    if (!userLocation) {
      console.log('❌ No user location available');
      showAlert(t('map.gpsRequiredNearby'));
      return;
    }

    playNearbySpots();
  };

  const handleStopAudio = () => {
    stopAllAudio();
  };

  const toggleMute = () => {
    setMuted(!isMuted);
    if (audioRefs.current.length > 0) {
      audioRefs.current.forEach(audio => {
        audio.volume = !isMuted ? 0 : volume;
      });
    }
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    volumeRef.current = newVolume;
    if (!isMuted && audioRefs.current.length > 0) {
      audioRefs.current.forEach(audio => {
        audio.volume = newVolume;
      });
    }
  };

  function registerActiveTrack(audio, spot) {
    const trackId = `${spot.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    activeTracksRef.current.push({ audio, spot, id: trackId });
    return trackId;
  }

  // Unified helper to create audio connected to the spatial engine
  const createSpatialAudio = async (url, spot) => {
    let audioCtx = spatialAudioContextRef.current;
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
      spatialAudioContextRef.current = audioCtx;
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.connect(audioCtx.destination);
      compressorNodeRef.current = compressor;
    } else if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';

    const compressor = compressorNodeRef.current;
    if (audioCtx && compressor) {
      try {
        const srcNode = audioCtx.createMediaElementSource(audio);
        const panner = audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'exponential';
        panner.refDistance = 10;
        panner.maxDistance = 1000;
        panner.rolloffFactor = 0.0;
        
        srcNode.connect(panner);
        panner.connect(compressor);
        audio._audioSource = srcNode;
        audio._pannerNode = panner;
      } catch(e) {}
    }
    return audio;
  };
   

  function startProgressPolling() {
    if (progressAnimFrameRef.current) return;
    let lastUpdate = 0;
    const poll = (timestamp) => {
      if (timestamp - lastUpdate >= 200) { // throttle to ~5Hz
        lastUpdate = timestamp;
        const progress = {};
        activeTracksRef.current = activeTracksRef.current.filter(t => t.audio && t.audio.src);
        activeTracksRef.current.forEach(({ audio, spot, id }) => {
          let virtualDistance = null;
          let virtualRelativeBearing = null;
          let volumeLevel = audio.volume;

          if (userLocationRef.current && spot.location) {
             const baseDistance = calculateDistance(
              userLocationRef.current.lat, userLocationRef.current.lng,
              spot.location.lat, spot.location.lng
            );
            const baseBearing = calculateBearing(
              userLocationRef.current.lat, userLocationRef.current.lng,
              spot.location.lat, spot.location.lng
            );
            
            const offset = manualSpatialOffsetRef.current || { x: 0, y: 0 };
            const range = nearbyRangeRef.current || 500;
            const offsetX_meters = (offset.x / 110) * range;
            const offsetY_meters = (offset.y / 110) * range;

            const bearingRad = baseBearing * Math.PI / 180;
            const userRelX = Math.sin(bearingRad) * baseDistance;
            const userRelY = Math.cos(bearingRad) * baseDistance;
            
            const virtualRelX = userRelX - offsetX_meters;
            const virtualRelY = userRelY - offsetY_meters;
            
            virtualDistance = Math.sqrt(virtualRelX*virtualRelX + virtualRelY*virtualRelY);
            const virtualBearing = (Math.atan2(virtualRelX, virtualRelY) * 180 / Math.PI + 360) % 360;
            const heading = userHeadingRef.current || 0;
            virtualRelativeBearing = (virtualBearing - heading) % 360;
            if (virtualRelativeBearing < 0) virtualRelativeBearing += 360;
          }

          progress[id] = {
            currentTime: audio.currentTime || 0,
            duration: audio.duration || 0,
            filename: spot.filename,
            spotId: spot.id,
            isPlaying: !audio.paused && !audio.ended,
            distance: virtualDistance,
            relativeBearing: virtualRelativeBearing,
            volumeLevel
          };
        });
        setTrackProgress(progress);
      }
      if (activeTracksRef.current.length > 0) {
        progressAnimFrameRef.current = requestAnimationFrame(poll);
      } else {
        progressAnimFrameRef.current = null;
        setTrackProgress({});
      }
    };
    progressAnimFrameRef.current = requestAnimationFrame(poll);
  }

  function stopProgressPolling() {
    if (progressAnimFrameRef.current) {
      cancelAnimationFrame(progressAnimFrameRef.current);
      progressAnimFrameRef.current = null;
    }
    setTrackProgress({});
  }

  // Dynamic spatial audio updates — recalculates volume/panning as user moves using PannerNode
  function startSpatialAudioUpdates() {
    if (spatialAudioIntervalRef.current) return;

    let isPolling = false;

    const tick = async () => {
      if (isPolling) return;
      isPolling = true;

      try {
        const currentLocation = userLocationRef.current;
        if (!currentLocation || !isPlayingRef.current) {
          stopSpatialAudioUpdates();
          isPolling = false;
          return;
        }

        // --- PART 1: Mode-specific logic ---
        const topSpotIds = new Set();
        
        if (playbackModeRef.current === 'nearby') {
          // 1. Find up to 10 closest spots within 10000m
          const maxConcurrent = 10;
          const allSpots = audioSpotsRef.current || [];
          const spatialSpots = [];
          for (const spot of allSpots) {
            if (!spot || !spot.location) continue;
            const distance = calculateDistance(
              currentLocation.lat, currentLocation.lng,
              spot.location.lat, spot.location.lng
            );
            const range = nearbyRangeRef.current || 500;
            if (distance <= range) {
              const bearing = calculateBearing(
                currentLocation.lat, currentLocation.lng,
                spot.location.lat, spot.location.lng
              );
              spatialSpots.push({ ...spot, distance, bearing });
            }
          }

          spatialSpots.sort((a, b) => a.distance - b.distance);
          const topSpots = spatialSpots.slice(0, maxConcurrent);
          topSpots.forEach(s => topSpotIds.add(s.id));

          if (topSpots.length > 0) {
            setCurrentAudio(topSpots[0]);
            setSelectedSpot(topSpots[0]);
          }
          
          setPlayingNearbySpotIds(topSpotIds);

          // 2. Load new nearby spots if needed
          const audioCtx = spatialAudioContextRef.current;
          const compressor = compressorNodeRef.current;

          for (const spot of topSpots) {
            let audio = audioRefs.current.find(a => a._spotId === spot.id);
            if (!audio && !loadingSpotsRef.current.has(spot.id)) {
              loadingSpotsRef.current.add(spot.id);
              try {
                const audioSource = await getPlayableAudioForSpot(spot.id);
                if (audioSource && isPlayingRef.current && playbackModeRef.current === 'nearby') {
                  const audioUrl = audioSource.type === 'blob' ? URL.createObjectURL(audioSource.blob) : audioSource.url;
                  const newAudio = new Audio(audioUrl);
                  newAudio.preload = 'auto';
                  newAudio.loop = true;
                  newAudio._spotId = spot.id;
                  newAudio.volume = 0; 
                  
                  if (audioCtx && compressor) {
                    try {
                      const srcNode = audioCtx.createMediaElementSource(newAudio);
                      const panner = audioCtx.createPanner();
                      panner.panningModel = 'HRTF';
                      panner.distanceModel = 'exponential';
                      panner.refDistance = 10;
                      panner.maxDistance = 1000;
                      panner.rolloffFactor = 0.0;
                      
                      srcNode.connect(panner);
                      panner.connect(compressor);
                      newAudio._audioSource = srcNode;
                      newAudio._pannerNode = panner;
                    } catch(e) {}
                  }
                  audioRefs.current.push(newAudio);
                  registerActiveTrack(newAudio, spot);
                  newAudio.play().catch(e => console.error(e));
                }
              } finally {
                loadingSpotsRef.current.delete(spot.id);
              }
            }
          }
        }

        // --- PART 2: Global Panning/Volume Update (applies to ALL playing tracks) ---
        const audioCtx = spatialAudioContextRef.current;
        const userHeading = userHeadingRef.current || 0;
        const currentVol = isMutedRef.current ? 0 : volumeRef.current;

        audioRefs.current.forEach(audio => {
          // Find the spot data for this audio if it has a spotId
          const track = activeTracksRef.current.find(t => t.audio === audio);
          if (!track || !track.spot || !track.spot.location) return;

          const spot = track.spot;
          
          // Apply manual spatial offset to the "virtual" user position
          // This allows HUD-based manual mixing
          const offset = manualSpatialOffsetRef.current || { x: 0, y: 0 };
          const range = nearbyRangeRef.current || 500;
          
          // Convert pixels offset in radar HUD back to meters in real world
          // Radar is 220px diam (110px radius) for 'range' meters
          const offsetX_meters = (offset.x / 110) * range;
          const offsetY_meters = (offset.y / 110) * range;

          // Estimate the new virtual lat/lng based on the offset
          // (Simpler: just calculate distance/bearing from real user, then add offset in user coordinate space)
          const baseDistance = calculateDistance(
            currentLocation.lat, currentLocation.lng,
            spot.location.lat, spot.location.lng
          );
          const baseBearing = calculateBearing(
            currentLocation.lat, currentLocation.lng,
            spot.location.lat, spot.location.lng
          );
          
          // User coordinate space (Forward = North when heading is 0)
          const heading = userHeadingRef.current || 0;
          const userForwardLat = Math.cos(heading * Math.PI / 180);
          const userForwardLng = Math.sin(heading * Math.PI / 180);
          
          // For mixing simplicity, we will just calculate distance/bearing relative to virtual user
          // Position relative to user in meters:
          const bearingRad = baseBearing * Math.PI / 180;
          const userRelX = Math.sin(bearingRad) * baseDistance;
          const userRelY = Math.cos(bearingRad) * baseDistance;
          
          // Apply HUD offset (inverted because dragging the user dot 'left' moves sounds 'right' relative to user)
          const virtualRelX = userRelX - offsetX_meters;
          const virtualRelY = userRelY - offsetY_meters;
          
          const virtualDistance = Math.sqrt(virtualRelX*virtualRelX + virtualRelY*virtualRelY);
          const virtualBearing = (Math.atan2(virtualRelX, virtualRelY) * 180 / Math.PI + 360) % 360;

          // Manage fade outs for nearby sounds that dropped out of range
          if (playbackModeRef.current === 'nearby' && audio._spotId && !topSpotIds.has(audio._spotId)) {
            if (!audio._isFadingOut) {
              audio._isFadingOut = true;
              let vol = audio.volume;
              const fadeOut = setInterval(() => {
                vol = Math.max(0, vol - 0.1);
                audio.volume = vol;
                if (vol <= 0) {
                  clearInterval(fadeOut);
                  audio.pause();
                  if (audio._audioSource) audio._audioSource.disconnect();
                  if (audio._pannerNode) audio._pannerNode.disconnect();
                  if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
                  audio.src = '';
                }
              }, 100);
            }
            return;
          }

          if (audio._isFadingOut) return;

          // Apply proximity volume based on virtual distance
          const targetProximityVol = proximityVolumeEnabledRef.current ? getProximityVolume(virtualDistance) : 1.0;
          audio.volume = currentVol * targetProximityVol;

          // Update spatial position based on virtual relative bearing
          if (audio._pannerNode && audioCtx && audioCtx.state === 'running') {
            const relativeBearingRad = (virtualBearing - userHeading) * (Math.PI / 180);
            const x = Math.sin(relativeBearingRad) * virtualDistance;
            const z = -Math.cos(relativeBearingRad) * virtualDistance;
            const now = audioCtx.currentTime;
            audio._pannerNode.positionX.linearRampToValueAtTime(x, now + 0.5);
            audio._pannerNode.positionY.linearRampToValueAtTime(0, now + 0.5);
            audio._pannerNode.positionZ.linearRampToValueAtTime(z, now + 0.5);
          }
        });

      } catch (err) {
        console.warn('Spatial Audio Error:', err);
      }
      isPolling = false;
    };

    tick();
    spatialAudioIntervalRef.current = setInterval(tick, 500);
  }

  function stopSpatialAudioUpdates() {
    if (spatialAudioIntervalRef.current) {
      clearInterval(spatialAudioIntervalRef.current);
      spatialAudioIntervalRef.current = null;
    }
  }

  function stopAllAudio() {
    console.log('🛑 Stopping all audio and cleaning up spatial audio');
    isPlayingRef.current = false;
    setIsPlaying(false);
    setCurrentAudio(null);
    setSelectedSpot(null);
    setSessionPlayback(null);
    setPlayingNearbySpotIds(new Set()); // Clear nearby playing markers
    
    stopProgressPolling();
    stopSpatialAudioUpdates();
    loadingSpotsRef.current.clear();

    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }

    audioRefs.current.forEach(audio => {
      try {
        if (audio._isFadingOut) return;
        audio.pause();
        audio.currentTime = 0;
        if (audio._audioSource) audio._audioSource.disconnect();
        if (audio._pannerNode) audio._pannerNode.disconnect();
        if (audio._panNode) audio._panNode.disconnect();

        if (audio.src && audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(audio.src);
        }
        audio.src = '';
      } catch (error) {
        console.warn('⚠️ Error stopping audio:', error);
      }
    });

    audioRefs.current = [];
    activeTracksRef.current = [];

    // Optional: Keep context alive or suspend it instead of killing to avoid re-init overhead
    if (spatialAudioContextRef.current && spatialAudioContextRef.current.state !== 'closed') {
      spatialAudioContextRef.current.suspend().catch(e => {});
    }
  }

  const playSingleAudio = async (audioBlob, spot) => {
    // Forward to playAudio which has been updated with spatial pipeline support
    return playAudio(spot, audioBlob, userLocation);
  };

  const playSingleAudioFromUrl = async (url, spot) => {
    if (isPlayingRef.current) {
      await stopAllAudio();
    }
    try {
      const audio = new Audio(url);
      audio.volume = isMuted ? 0 : volume;
      audioRefs.current.push(audio);
      if (spot) registerActiveTrack(audio, spot);
      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);
      startProgressPolling();
      audio.onended = () => {
        isPlayingRef.current = false;
        setIsPlaying(false);
      };
      audio.onerror = (e) => {
        console.error('Audio playback error (url):', e);
        isPlayingRef.current = false;
        setIsPlaying(false);
      };
      await audio.play();
    } catch (error) {
      console.error('Failed to play audio URL:', error);
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
  };

  async function playConcatenated(group) {
    if (group.length === 0) return;
    try {
      setIsLoading(true);
      await stopAllAudio();
      setPlaybackMode('chronological');
      const sortedGroup = [...group].sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);

      let currentIndex = 0;
      const playNext = async () => {
        if (!isPlayingRef.current || currentIndex >= sortedGroup.length) {
          if (currentIndex >= sortedGroup.length) {
            isPlayingRef.current = false;
            setIsPlaying(false);
          }
          return;
        }

        try {
          const spot = sortedGroup[currentIndex];
          const audioSource = await getPlayableAudioForSpot(spot.id);
          
          if (audioSource) {
            const audioUrl = audioSource.type === 'blob' ? URL.createObjectURL(audioSource.blob) : audioSource.url;
            const audio = await createSpatialAudio(audioUrl, spot);
            audio.volume = isMuted ? 0 : volume;
            audioRefs.current.push(audio);
            registerActiveTrack(audio, spot);
            setCurrentAudio(spot);
            setSelectedSpot(spot);

            audio.onended = () => {
              currentIndex++;
              if (isPlayingRef.current) playNext();
            };

            audio.onerror = (e) => {
              currentIndex++;
              if (isPlayingRef.current) playNext();
            };

            await audio.play();
            startProgressPolling();
          } else {
            currentIndex++;
            playNext();
          }
        } catch (err) {
          currentIndex++;
          playNext();
        }
      };

      await playNext();
    } catch (error) {
      console.error('Chronological error:', error);
      setIsPlaying(false);
      isPlayingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  }

  async function playJamm(group) {
    if (group.length === 0) return;
    try {
      setIsLoading(true);
      await stopAllAudio();
      setPlaybackMode('jamm');

      console.log(`🎼 Starting Jamm mode with ${group.length} files`);
      const audioElements = [];

      for (let i = 0; i < group.length; i++) {
        const spot = group[i];
        const src = await getPlayableAudioForSpot(spot.id);
        if (src) {
          const audioUrl = src.type === 'blob' ? URL.createObjectURL(src.blob) : src.url;
          const audio = await createSpatialAudio(audioUrl, spot);
          audio.volume = isMuted ? 0 : volume;
          audioRefs.current.push(audio);
          registerActiveTrack(audio, spot);
          audioElements.push(audio);
          
          const panNode = audio._panNode || audio._pannerNode;
          if (panNode) {
            const startAnim = () => { startPanningAnimation(panNode, audio.duration, i); };
            if (audio.duration) startAnim();
            else audio.addEventListener('loadedmetadata', startAnim, { once: true });
          }
        }
      }

      if (audioElements.length > 0) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        setPlayerExpanded(true);
        await Promise.all(audioElements.map(a => a.play().catch(e => console.warn(e))));
        startProgressPolling();
      }
    } catch (error) {
      console.error('❌ Jamm error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Panning animation function for Jamm mode
  function startPanningAnimation(panNode, duration, index) {
    if (!panNode || !duration || duration <= 0) return;

    const startTime = Date.now();
    const updateInterval = 50; // Update every 50ms for smooth panning

    // Each audio gets a different panning pattern
    const panDirection = index % 2 === 0 ? 1 : -1; // Alternate L→R and R→L

    const panAnimation = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = elapsed / duration;

      if (progress >= 1 || !isPlayingRef.current) {
        if (panNode.pan) panNode.pan.value = 0;
        else if (panNode.positionX) panNode.positionX.value = 0;
        return;
      }

      const cycleProgress = (progress * 2) % 2;
      let panValue = (cycleProgress <= 1) ? (cycleProgress - 0.5) * 2 * panDirection : (1.5 - cycleProgress) * 2 * panDirection;
      panValue = Math.max(-1, Math.min(1, panValue));

      if (panNode.pan) {
        panNode.pan.value = panValue;
      } else if (panNode.positionX) {
        // Map -1..1 to -50..50 in 3D space for audible spatial L-R effect
        panNode.positionX.value = panValue * 50;
      }

      setTimeout(panAnimation, updateInterval);
    };

    // Start panning animation
    panAnimation();
    console.log(`🎛️ Started panning animation for audio ${index + 1}, direction: ${panDirection > 0 ? 'L→R' : 'R→L'}`);
  }

  // --- RELOJ: plays sounds recorded at the same time-of-day window as right now ---
  // Matches recordings within ±30 minutes of the current clock time, across all visible sessions.
  async function playReloj(group) {
    if (group.length === 0) return;
    try {
      setIsLoading(true);
      await stopAllAudio();
      setPlaybackMode('reloj');

      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const WINDOW = relojWindow; // configurable ±15/30/60 min

      const matchingSpots = group.filter(spot => {
        if (!spot.timestamp) return false;
        const t = new Date(spot.timestamp);
        const tMin = t.getHours() * 60 + t.getMinutes();
        let diff = Math.abs(tMin - nowMinutes);
        if (diff > 720) diff = 1440 - diff; // wrap midnight
        return diff <= WINDOW;
      }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      if (matchingSpots.length === 0) {
        const nowStr = i18nFormatTime(now, { hour: '2-digit', minute: '2-digit' });
        showAlert(t('map.relojEmpty', { w: WINDOW, now: nowStr }));
        setIsLoading(false);
        return;
      }

      console.log(`🕐 Clock: ${matchingSpots.length} recordings in current time window`);

      // Spatial playback — all matching spots simultaneously with proximity volume
      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);

      const audioPromises = matchingSpots.map(async (spot) => {
        try {
          const audioSource = await getPlayableAudioForSpot(spot.id);
          if (!audioSource) return null;
          const audioUrl = audioSource.type === 'blob'
            ? URL.createObjectURL(audioSource.blob)
            : audioSource.url;
          const audio = await createSpatialAudio(audioUrl, spot);
          audio.loop = true;

          const dist = userLocation
            ? calculateDistance(userLocation.lat, userLocation.lng, spot.location.lat, spot.location.lng)
            : 0;
          const vol = getProximityVolume(dist);
          audio.volume = isMuted ? 0 : vol;

          audioRefs.current.push(audio);
          registerActiveTrack(audio, spot);
          await audio.play();
          return audio;
        } catch (e) {
          console.warn('Reloj: error playing spot', e);
          return null;
        }
      });

      const active = (await Promise.all(audioPromises)).filter(Boolean);
      startProgressPolling();
      console.log(`🕐 Clock: ${active.length} active sounds`);

      if (active.length > 0) {
        const closest = matchingSpots.reduce((c, s) => {
          if (!userLocation) return c;
          const d = calculateDistance(userLocation.lat, userLocation.lng, s.location.lat, s.location.lng);
          const dc = calculateDistance(userLocation.lat, userLocation.lng, c.location.lat, c.location.lng);
          return d < dc ? s : c;
        });
        setCurrentAudio(closest);
        setSelectedSpot(closest);
      }
    } catch (error) {
      console.error('❌ Error in Reloj mode:', error);
      isPlayingRef.current = false;
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  // Solar hour estimation based on latitude and day-of-year
  // Returns dawn/dusk windows for any location on Earth
  function estimateSunHours(lat) {
    const now = new Date();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const decl = 23.45 * Math.sin((2 * Math.PI / 365) * (doy - 81));
    const latRad = lat * Math.PI / 180;
    const declRad = decl * Math.PI / 180;
    const cosH = -Math.tan(latRad) * Math.tan(declRad);
    const clampedCos = Math.max(-1, Math.min(1, cosH));
    const haDeg = Math.acos(clampedCos) * 180 / Math.PI;
    const sunrise = 12 - haDeg / 15;
    const sunset = 12 + haDeg / 15;
    return {
      dawnStart: Math.floor(sunrise - 1),
      dawnEnd: Math.ceil(sunrise + 2),
      duskStart: Math.floor(sunset - 2),
      duskEnd: Math.ceil(sunset + 1),
    };
  }

  // --- ALBA: solar-gated dawn mode ---
  // Gate: only plays when the LISTENER is in their local dawn window
  // Filter: plays recordings captured during dawn at their ORIGIN location
  async function playAlba(group) {
    const listenerSun = userLocation
      ? estimateSunHours(userLocation.lat)
      : { dawnStart: 5, dawnEnd: 8 };
    const nowHour = new Date().getHours();
    if (nowHour < listenerSun.dawnStart || nowHour >= listenerSun.dawnEnd) {
      showAlert(t('map.albaOnly', { start: listenerSun.dawnStart, end: listenerSun.dawnEnd, now: nowHour }));
      return;
    }
    await playSolarWindow(group, 'alba', 'dawn');
  }

  // --- CREPÚSCULO: solar-gated dusk mode ---
  // Gate: only plays when the LISTENER is in their local dusk window
  // Filter: plays recordings captured during dusk at their ORIGIN location
  async function playCrepusculo(group) {
    const listenerSun = userLocation
      ? estimateSunHours(userLocation.lat)
      : { duskStart: 17, duskEnd: 20 };
    const nowHour = new Date().getHours();
    if (nowHour < listenerSun.duskStart || nowHour >= listenerSun.duskEnd) {
      showAlert(t('map.crepusculoOnly', { start: listenerSun.duskStart, end: listenerSun.duskEnd, now: nowHour }));
      return;
    }
    await playSolarWindow(group, 'crepusculo', 'dusk');
  }

  // Shared helper: filter recordings by their origin solar window, then play
  async function playSolarWindow(group, mode, window) {
    if (group.length === 0) return;
    try {
      setIsLoading(true);
      await stopAllAudio();
      setPlaybackMode(mode);

      // Filter recordings that were captured during dawn/dusk at their ORIGIN location
      const filtered = group.filter(spot => {
        if (!spot.timestamp) return false;
        const recHour = new Date(spot.timestamp).getHours();
        // Use recording's GPS coordinates to compute its local solar window
        const recLat = spot.lat || spot.latitude;
        const originSun = recLat ? estimateSunHours(recLat) : { dawnStart: 5, dawnEnd: 8, duskStart: 17, duskEnd: 20 };
        if (window === 'dawn') {
          return recHour >= originSun.dawnStart && recHour < originSun.dawnEnd;
        } else {
          return recHour >= originSun.duskStart && recHour < originSun.duskEnd;
        }
      }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      if (filtered.length === 0) {
        const label = window === 'dawn' ? t('map.dawnWord') : t('map.duskWord');
        showAlert(t('map.noSolarRecordings', { label }));
        setIsLoading(false);
        return;
      }

      console.log(`🌅 ${mode}: ${filtered.length} recordings from ${window} (filtered by original solar time)`);

      // Play chronologically
      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);
      startProgressPolling();

      let idx = 0;
      const playNext = async () => {
        if (idx >= filtered.length || !isPlayingRef.current) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          return;
        }
        const spot = filtered[idx];
        const audioSource = await getPlayableAudioForSpot(spot.id);
        if (!audioSource) { idx++; await playNext(); return; }

        const audioUrl = audioSource.type === 'blob'
          ? URL.createObjectURL(audioSource.blob)
          : audioSource.url;
        const audio = new Audio(audioUrl);
        audio.volume = isMuted ? 0 : volume;
        audioRefs.current.push(audio);
        activeTracksRef.current = activeTracksRef.current.filter(t => !t.audio.paused || !t.audio.ended);
        registerActiveTrack(audio, spot);
        setCurrentAudio(spot);
        setSelectedSpot(spot);

        audio.onended = () => { idx++; setTimeout(() => { if (isPlayingRef.current) playNext(); }, 300); };
        audio.onerror = () => { idx++; setTimeout(() => { if (isPlayingRef.current) playNext(); }, 100); };
        await audio.play();
      };
      await playNext();

    } catch (error) {
      console.error(`❌ Error in ${mode} mode:`, error);
      isPlayingRef.current = false;
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  // --- ESTRATOS: build up ecological strata — insects → birds → amphibians → mammals → others ---
  async function playEstratos(group) {
    if (group.length === 0) return;
    try {
      setIsLoading(true);
      await stopAllAudio();
      setPlaybackMode('estratos');

      // Strata order — keywords matched against speciesTags or filename
      const strata = [
        { label: 'Insects',    keywords: ['insect', 'insecto', 'grillo', 'cricket', 'cicada', 'cigarra', 'abeja', 'bee', 'mosca', 'fly', 'wasp', 'avispa', 'hormiga', 'ant', 'escarabajo', 'beetle', 'mariposa', 'butterfly', 'moth', 'polilla', 'libélula', 'dragonfly', 'mantis', 'cucaracha', 'cockroach', 'luciérnaga', 'firefly', 'zancudo', 'mosquito'] },
        { label: 'Birds',      keywords: ['ave', 'bird', 'pajaro', 'pájaro', 'song', 'canto', 'colibrí', 'hummingbird', 'tucán', 'toucan', 'loro', 'parrot', 'guacamaya', 'macaw', 'búho', 'owl', 'lechuza', 'águila', 'eagle', 'halcón', 'hawk', 'garza', 'heron', 'carpintero', 'woodpecker', 'golondrina', 'swallow', 'mirlo', 'thrush', 'quetzal', 'gallina', 'tanager', 'tángara', 'barranquero', 'motmot'] },
        { label: 'Amphibians', keywords: ['frog', 'rana', 'sapo', 'toad', 'anfibio', 'amphibian', 'salamandra', 'salamander', 'tritón', 'newt', 'cecilia', 'caecilian', 'dendrobates', 'tree frog'] },
        { label: 'Mammals',    keywords: ['mammal', 'mamifero', 'mamífero', 'mono', 'monkey', 'bat', 'murciélago', 'aullador', 'howler', 'ardilla', 'squirrel', 'venado', 'deer', 'jaguar', 'puma', 'ocelote', 'perezoso', 'sloth', 'armadillo', 'danta', 'tapir', 'nutria', 'otter', 'delfín', 'dolphin', 'ballena', 'whale'] },
        { label: 'Water',      keywords: ['agua', 'water', 'río', 'river', 'stream', 'quebrada', 'cascada', 'waterfall', 'lluvia', 'rain', 'mar', 'sea', 'ocean', 'ola', 'wave', 'goteo', 'drip'] },
        { label: 'Environment', keywords: [] }, // catches everything else
      ];

      const matchStrata = (spot) => {
        const tags = (spot.speciesTags || []).map(t => t.toLowerCase());
        const name = (spot.filename || '').toLowerCase();
        for (let i = 0; i < strata.length - 1; i++) {
          if (strata[i].keywords.some(k => tags.some(t => t.includes(k)) || name.includes(k))) return i;
        }
        return strata.length - 1; // ambient / other
      };

      // Build strata buckets
      const buckets = strata.map(() => []);
      group.forEach(spot => buckets[matchStrata(spot)].push(spot));
      const activeBuckets = buckets.filter(b => b.length > 0);

      if (activeBuckets.length === 0) {
        showAlert(t('map.noSpeciesTags'));
        setIsLoading(false);
        return;
      }

      console.log(`🌿 Strata: ${activeBuckets.length} active layers`);

      // Layer entry interval — add a new stratum every STAGGER_MS ms
      const STAGGER_MS = 4000;

      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);
      startProgressPolling();

      const loadAndPlay = async (spot) => {
        const audioSource = await getPlayableAudioForSpot(spot.id);
        if (!audioSource) return;
        const audioUrl = audioSource.type === 'blob'
          ? URL.createObjectURL(audioSource.blob)
          : audioSource.url;
        const audio = await createSpatialAudio(audioUrl, spot);
        audio.loop = true;
        audio.volume = isMuted ? 0 : volume * 0.75; // slightly reduced so mix doesn't clip
        audioRefs.current.push(audio);
        registerActiveTrack(audio, spot);
        try { await audio.play(); } catch (_) {}
      };

      // Stagger each stratum bucket entry
      let layerIdx = 0;
      for (const bucket of activeBuckets) {
        if (!isPlayingRef.current) break;
        console.log(`🔊 Strata: entering layer ${strata[layerIdx]?.label || 'ambient'} (${bucket.length} sounds)`);
        await Promise.all(bucket.map(loadAndPlay));
        if (layerIdx === 0) {
          setCurrentAudio(bucket[0]);
          setSelectedSpot(bucket[0]);
        }
        layerIdx++;
        if (layerIdx < activeBuckets.length) {
          await new Promise(resolve => setTimeout(resolve, STAGGER_MS));
        }
      }

    } catch (error) {
      console.error('❌ Error in Estratos mode:', error);
      isPlayingRef.current = false;
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  // --- MIGRATORIA: play imported derives in their original geographic order ---
  // Sorts spots by geographic position (walking path order) and plays sequentially,
  // regardless of current user location. Bioacoustic tourism: walk a Colombian rainforest in Berlin.
  async function playMigratoria(group) {
    if (group.length === 0) return;
    try {
      setIsLoading(true);
      await stopAllAudio();
      setPlaybackMode('migratoria');

      // Sort by timestamp (walking order) — the original derive path
      const sorted = [...group].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

      console.log(`🦋 Migratory: ${sorted.length} recordings in walk order`);

      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);
      startProgressPolling();

      let idx = 0;
      const playNext = async () => {
        if (idx >= sorted.length || !isPlayingRef.current) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          return;
        }
        const spot = sorted[idx];
        const audioSource = await getPlayableAudioForSpot(spot.id);
        if (!audioSource) { idx++; await playNext(); return; }

        const audioUrl = audioSource.type === 'blob'
          ? URL.createObjectURL(audioSource.blob)
          : audioSource.url;
        const audio = new Audio(audioUrl);
        audio.volume = isMuted ? 0 : volume;
        audioRefs.current.push(audio);
        activeTracksRef.current = activeTracksRef.current.filter(t => !t.audio.paused || !t.audio.ended);
        registerActiveTrack(audio, spot);
        setCurrentAudio(spot);
        setSelectedSpot(spot);

        // Crossfade 500ms before end
        const CROSSFADE_MS = 500;
        audio.ontimeupdate = () => {
          if (audio.duration && audio.currentTime > 0) {
            const remaining = (audio.duration - audio.currentTime) * 1000;
            if (remaining <= CROSSFADE_MS && remaining > CROSSFADE_MS - 100 && idx + 1 < sorted.length) {
              audio.ontimeupdate = null;
              const origVol = audio.volume;
              let step = 0;
              const fadeTimer = setInterval(() => {
                step++;
                audio.volume = Math.max(0, origVol * (1 - step / 10));
                if (step >= 10) clearInterval(fadeTimer);
              }, CROSSFADE_MS / 10);
              idx++;
              if (isPlayingRef.current) playNext();
            }
          }
        };
        audio.onended = () => {
          audio.ontimeupdate = null;
          idx++;
          if (isPlayingRef.current) playNext();
        };
        audio.onerror = () => { idx++; setTimeout(() => { if (isPlayingRef.current) playNext(); }, 100); };
        await audio.play();
      };
      await playNext();
    } catch (error) {
      console.error('❌ Error in Migratoria mode:', error);
      isPlayingRef.current = false;
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  // --- ESPECTRO: sort by frequency content (species tags heuristic) and crossfade low→high ---
  // Creates a spectral sweep from low-frequency sounds (mammals, water) to high (insects, birds).
  async function playEspectro(group) {
    if (group.length === 0) return;
    try {
      setIsLoading(true);
      await stopAllAudio();
      setPlaybackMode('espectro');

      // Frequency band heuristic: lower index = lower frequency
      const freqBands = [
        { range: 'Sub-bass',  keywords: ['whale', 'ballena', 'earthquake', 'trueno', 'thunder', 'water', 'agua', 'río', 'river', 'lluvia', 'rain', 'cascada', 'waterfall'] },
        { range: 'Bass',      keywords: ['mammal', 'mamífero', 'mamifero', 'mono', 'monkey', 'howler', 'aullador', 'jaguar', 'puma', 'tapir', 'danta'] },
        { range: 'Low-mid',   keywords: ['frog', 'rana', 'sapo', 'toad', 'anfibio', 'amphibian', 'dendrobates'] },
        { range: 'Mid',       keywords: ['ave', 'bird', 'owl', 'búho', 'lechuza', 'woodpecker', 'carpintero', 'tucán', 'toucan', 'barranquero', 'motmot'] },
        { range: 'High-mid',  keywords: ['pajaro', 'pájaro', 'song', 'canto', 'colibrí', 'hummingbird', 'tanager', 'tángara', 'golondrina', 'swallow', 'quetzal'] },
        { range: 'High',      keywords: ['insect', 'insecto', 'grillo', 'cricket', 'cicada', 'cigarra', 'bat', 'murciélago', 'mosquito', 'zancudo'] },
      ];

      const getFreqScore = (spot) => {
        const tags = (spot.speciesTags || []).map(t => t.toLowerCase());
        const name = (spot.filename || '').toLowerCase();
        for (let i = 0; i < freqBands.length; i++) {
          if (freqBands[i].keywords.some(k => tags.some(t => t.includes(k)) || name.includes(k))) return i;
        }
        return 3; // default to mid
      };

      const sorted = [...group].sort((a, b) => getFreqScore(a) - getFreqScore(b));
      console.log(`🌈 Spectrum: ${sorted.length} recordings sorted by estimated frequency`);

      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayerExpanded(true);
      startProgressPolling();

      let idx = 0;
      const playNext = async () => {
        if (idx >= sorted.length || !isPlayingRef.current) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          return;
        }
        const spot = sorted[idx];
        const audioSource = await getPlayableAudioForSpot(spot.id);
        if (!audioSource) { idx++; await playNext(); return; }

        const audioUrl = audioSource.type === 'blob'
          ? URL.createObjectURL(audioSource.blob)
          : audioSource.url;
        const audio = new Audio(audioUrl);
        audio.volume = isMuted ? 0 : volume;
        audioRefs.current.push(audio);
        activeTracksRef.current = activeTracksRef.current.filter(t => !t.audio.paused || !t.audio.ended);
        registerActiveTrack(audio, spot);
        setCurrentAudio(spot);
        setSelectedSpot(spot);

        // Crossfade 600ms — slightly longer for spectral transitions
        const CROSSFADE_MS = 600;
        audio.ontimeupdate = () => {
          if (audio.duration && audio.currentTime > 0) {
            const remaining = (audio.duration - audio.currentTime) * 1000;
            if (remaining <= CROSSFADE_MS && remaining > CROSSFADE_MS - 100 && idx + 1 < sorted.length) {
              audio.ontimeupdate = null;
              const origVol = audio.volume;
              let step = 0;
              const fadeTimer = setInterval(() => {
                step++;
                audio.volume = Math.max(0, origVol * (1 - step / 10));
                if (step >= 10) clearInterval(fadeTimer);
              }, CROSSFADE_MS / 10);
              idx++;
              if (isPlayingRef.current) playNext();
            }
          }
        };
        audio.onended = () => {
          audio.ontimeupdate = null;
          idx++;
          if (isPlayingRef.current) playNext();
        };
        audio.onerror = () => { idx++; setTimeout(() => { if (isPlayingRef.current) playNext(); }, 100); };
        await audio.play();
      };
      await playNext();
    } catch (error) {
      console.error('❌ Error in Espectro mode:', error);
      isPlayingRef.current = false;
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  function findOverlappingSpots(spot) {
    return audioSpots.filter(otherSpot => {
      if (otherSpot.id === spot.id) return false;
      const distance = calculateDistance(
        spot.location.lat, spot.location.lng,
        otherSpot.location.lat, otherSpot.location.lng
      );
      return distance <= 5;
    });
  }

  // 2. Show all metadata in the Leaflet Popup for each marker
  function renderPopupContent(clickedSpot) {
    return (
      <div style={{ minWidth: 220 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>{clickedSpot.filename}</div>
        <div>{t('map.popup.duration')}: {clickedSpot.duration ? clickedSpot.duration.toFixed(1) : '?'}s</div>
        <div>{t('map.popup.dateTime')}: {clickedSpot.timestamp ? formatDateTime(clickedSpot.timestamp) : '?'}</div>
        {clickedSpot.notes && <div>{t('map.popup.notes')}: {clickedSpot.notes}</div>}
        {clickedSpot.speciesTags && clickedSpot.speciesTags.length > 0 && (
          <div>{t('detail.species')}: {clickedSpot.speciesTags.map((tag) => tOption('meta.species', tag)).join(', ')}</div>
        )}
        {clickedSpot.location && (
          <div>{t('map.popup.location')}: {clickedSpot.location.lat.toFixed(5)}, {clickedSpot.location.lng.toFixed(5)}</div>
        )}
        {/* Add any other metadata fields here if needed */}
        <div style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
          <button
            style={{ flex: 1, background: '#F59E42', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            onClick={async () => {
              // Ensure we start the heading watch on user interaction for mobile browsers
              locationService.startHeadingWatch((heading) => {
                userHeadingRef.current = heading;
              });
              
              await stopAllAudio();
              if (mapInstance) mapInstance.closePopup();
              const audioSource = await getPlayableAudioForSpot(clickedSpot.id);
              if (audioSource) {
                // If selecting a blob directly, play it and keep mode as is or single
                if (audioSource.type === 'blob') {
                  await playAudio(clickedSpot, audioSource.blob, userLocation);
                } else {
                  await playSingleAudioFromUrl(audioSource.url, clickedSpot);
                }
              } else {
                showAlert(t('map.noAudioForRecording'));
              }
            }}
          >
            <Play size={16} /> {t('map.play')}
          </button>
          <button
            style={{ background: '#c24a6e', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => handleDeleteRecording(clickedSpot.id)}
            title={t('map.deleteRecording')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  // Helper to handle back to menu and stop audio
  const handleBackToMenu = () => {
    stopAllAudio();
    // Stop breadcrumb tracking when leaving
    if (isBreadcrumbTracking) {
      breadcrumbService.stopTracking();
      setIsBreadcrumbTracking(false);
    }
    if (onBackToLanding) onBackToLanding();
  };

  // Breadcrumb functions
  const toggleBreadcrumbs = () => {
    setShowBreadcrumbs(prev => !prev);
  };

  const handleSetBreadcrumbVisualization = (mode) => {
    setBreadcrumbVisualization(mode);
  };

  // Clear stale breadcrumbs on mount if no active session
  useEffect(() => {
    const activeSession = walkSessionService.getActiveSession();
    if (!activeSession) {
      breadcrumbService.clearBreadcrumbs();
      setCurrentBreadcrumbs([]);
    }
  }, []);

  // Poll breadcrumbs every 1s — tracking lifecycle is managed by derive start/end, not this effect
  useEffect(() => {
    const interval = setInterval(() => {
      const breadcrumbs = breadcrumbService.getCurrentBreadcrumbs();
      setCurrentBreadcrumbs(breadcrumbs);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle map creation using ref
  const mapRef = useRef(null);

  // Set map instance when ref is available
  useEffect(() => {
    if (mapRef.current) {
      setMapInstance(mapRef.current);
    }
  }, [mapRef.current]);

  // Check alias on mount
  useEffect(() => {
    if (!userAliasService.hasAlias()) {
      setShowAliasPrompt(true);
    }
  }, []);

  // Load saved session tracklines for map visualization
  useEffect(() => {
    const lines = allSessions
      .filter(s => s.breadcrumbs && s.breadcrumbs.length >= 2)
      .map((s, index) => {
        // Space hues evenly by position index so successive derivas differ clearly
        const hue = (index * 137.5) % 360; // golden-angle step avoids clustering
        const color = userAliasService._hslToHex(hue, 85, 52);
        return {
          sessionId: s.sessionId,
          positions: s.breadcrumbs.map(b => [b.lat, b.lng]),
          color,
          alias: s.userAlias,
          title: s.title || t('history.untitled'),
          recordingCount: s.recordingIds?.length || 0
        };
      });
    setSessionTracklines(lines);

    // Load visible sessions from localStorage, or default to all sessions
    const savedVisible = localStorageService.loadVisibleSessions();
    const baseSet = savedVisible ? new Set(savedVisible) : new Set(allSessions.map(s => s.sessionId));
    // Always include the active walk session so current recordings are playable
    if (activeWalkSession?.sessionId) {
      baseSet.add(activeWalkSession.sessionId);
    }
    setVisibleSessionIds(baseSet);
  }, [allSessions, activeWalkSession]); // Refresh when session changes

  // Helper: get a playable audio source for a spot (blob or native URL)
  const getPlayableAudioForSpot = async (spotId) => {
    // Prefer native file URL (no memory overhead) over loading full blob
    const url = await localStorageService.getPlayableUrl(spotId);
    if (url) return { type: 'url', url };
    // Fallback: try blob (localStorage data URL or native file read)
    const blob = await localStorageService.getAudioBlobFlexible(spotId);
    if (blob && blob.size > 0) return { type: 'blob', blob };
    return null;
  };

  // Walk session recording handler
  const handleWalkRecordingSave = async (recordingData) => {
    // Free-tier gate: block the save (never the recording) at the limit.
    // The thrown error is marked silent so the recorder keeps the take
    // open instead of showing a second alert.
    if (!localStorageService.canCreateNewRecording()) {
      setShowUpgradePrompt(true);
      const limitError = new Error('recording limit reached');
      limitError.silent = true;
      throw limitError;
    }
    try {
      const { metadata, audioBlob, audioPath } = recordingData;
      // Store native audioPath in metadata so playback can find the file
      if (audioPath) {
        metadata.audioPath = audioPath;
      }
      const sessionId = activeWalkSession?.sessionId || null;
      if (sessionId) {
        metadata.walkSessionId = sessionId;
      }
      await localStorageService.saveRecording(metadata, audioBlob);
      if (sessionId) {
        walkSessionService.addRecordingToSession(sessionId, metadata.uniqueId);
        setActiveWalkSession({ ...walkSessionService.getActiveSession() });
      }
      // Reload audio spots
      const recordings = localStorageService.getAllRecordings();
      const spots = recordings
        .filter(r => r.location && r.location.lat && r.location.lng)
        .map(r => ({
          id: r.uniqueId,
          location: r.location,
          filename: r.displayName || r.filename,
          timestamp: r.timestamp,
          duration: r.duration,
          notes: r.notes,
          speciesTags: r.speciesTags || [],
          walkSessionId: r.walkSessionId || null,
        }))
        .filter(s => s.id && s.duration > 0);
      setAudioSpots(spots);
      setIsAudioRecorderVisible(false);
      showAlert(t('map.savedOk'));
    } catch (error) {
      console.error('Error saving walk recording:', error);
      showAlert(t('map.saveError', { msg: error.message }));
      // Keep modal open so user can retry
    }
  };

  const handleStartMicForWalk = () => {
    setIsAudioRecorderVisible(true);
  };

  const handleDeleteRecording = async (recordingId) => {
    try {
      // Confirm deletion
      const confirmed = window.confirm(t('map.deleteConfirm'));
      if (!confirmed) return;

      // Delete from storage (removes audio file and metadata, but preserves derive/breadcrumbs)
      const success = await localStorageService.deleteRecording(recordingId);

      if (success) {
        // Reload recordings to update UI
        const recordings = localStorageService.getAllRecordings();
        const spots = recordings
          .filter(r => r.location && r.location.lat && r.location.lng)
          .map(r => ({
            id: r.uniqueId,
            location: r.location,
            filename: r.displayName || r.filename,
            timestamp: r.timestamp,
            duration: r.duration,
            notes: r.notes,
            speciesTags: r.speciesTags || [],
            walkSessionId: r.walkSessionId || null,
          }))
          .filter(s => s.id && s.duration > 0);
        setAudioSpots(spots);

        // Close popup
        if (mapInstance) mapInstance.closePopup();

        // Stop audio if this recording was playing
        if (currentAudio && currentAudio.id === recordingId) {
          stopAllAudio();
        }

        showAlert(t('map.deletedOk'));
      } else {
        showAlert(t('map.deleteError'));
      }
    } catch (error) {
      console.error('Error deleting recording:', error);
      showAlert(t('map.deleteErrorMsg', { msg: error?.message || error }));
    }
  };

  const updateQuery = (q) => setQuery(q);

  const searchMapData = (q) => {
    if (!q || !q.trim()) return;
    const lowerQ = q.toLowerCase();
    const matching = audioSpots.filter(spot =>
      (spot.filename && spot.filename.toLowerCase().includes(lowerQ)) ||
      (spot.notes && spot.notes.toLowerCase().includes(lowerQ)) ||
      (spot.speciesTags && spot.speciesTags.some(tag => tag.toLowerCase().includes(lowerQ)))
    );
    if (matching.length > 0 && mapInstance) {
      const first = matching[0];
      mapInstance.setView([first.location.lat, first.location.lng], 17);
    }
  };

  const handleMarkerClick = (spot) => {
    setActiveGroup(spot);
    // Wrap spot into GeoJSON-like shape for DetailView
    setSelectedPoint({
      properties: spot,
      geometry: { coordinates: [spot.location.lng, spot.location.lat] }
    });
    if (mapInstance) {
      mapInstance.setView([spot.location.lat, spot.location.lng], 19);
    }
  };

  const getNextRecording = (point) => {
    const validSpots = audioSpots.filter(s => s && s.location);
    const idx = validSpots.findIndex(s => s.id === point.properties.id);
    const nextIdx = (idx + 1) % validSpots.length;
    const next = validSpots[nextIdx];
    setSelectedPoint({
      properties: next,
      geometry: { coordinates: [next.location.lng, next.location.lat] }
    });
  };

  const getPreviousRecording = (point) => {
    const validSpots = audioSpots.filter(s => s && s.location);
    const idx = validSpots.findIndex(s => s.id === point.properties.id);
    const prevIdx = idx <= 0 ? validSpots.length - 1 : idx - 1;
    const prev = validSpots[prevIdx];
    setSelectedPoint({
      properties: prev,
      geometry: { coordinates: [prev.location.lng, prev.location.lat] }
    });
  };

  const handleStartDerive = async () => {
    try {
      const session = walkSessionService.startSession();
      if (userLocation) {
        await walkSessionService.startTracking(userLocation);
        setIsBreadcrumbTracking(true);
      }
      // Reset auto-zoom for the new derive
      cumulativeDistanceRef.current = 0;
      userHasZoomedRef.current = false;
      lastAutoZoomRef.current = 19;
      deriveController.notifyManualStart(userLocation);
      setActiveWalkSession(session);
    } catch (error) {
      console.error('Error starting walk session:', error);
    }
  };

  const handleRecordingStart = async () => {
    if (!activeWalkSession) {
      await handleStartDerive();
    }
    // Zoom in when recording starts — temporarily override auto-zoom
    if (mapInstance) {
      mapInstance.flyTo([userLocation?.lat || mapInstance.getCenter().lat, userLocation?.lng || mapInstance.getCenter().lng], 19, { duration: 0.5 });
    }
    // Ensure breadcrumbs are visible
    if (!showBreadcrumbs) {
      setShowBreadcrumbs(true);
    }
  };

  const handleEndDerive = async (title) => {
    try {
      const sessionId = activeWalkSession.sessionId;
      if (title) {
        walkSessionService.updateSession(sessionId, { title });
      }
      walkSessionService.endSession(sessionId);
      deriveController.notifySessionEnded();
      setActiveWalkSession(null);
      if (afppShareService.enabled && walkSessionService.getSessionRecordings(sessionId).length > 0) {
        setAfppPromptSessionId(sessionId);
      }
      // Refresh tracklines (use same golden-angle coloring as the main loader)
      const sessions = walkSessionService.getCompletedSessions();
      const lines = sessions
        .filter(s => s.breadcrumbs && s.breadcrumbs.length >= 2)
        .map((s, index) => {
          const hue = (index * 137.5) % 360;
          const color = userAliasService._hslToHex(hue, 85, 52);
          return {
            sessionId: s.sessionId,
            positions: s.breadcrumbs.map(b => [b.lat, b.lng]),
            color,
            alias: s.userAlias,
            title: s.title || t('history.untitled'),
            recordingCount: s.recordingIds?.length || 0
          };
        });
      setSessionTracklines(lines);
      // Add new session to visible set
      setVisibleSessionIds(prev => {
        const next = new Set(prev);
        next.add(sessionId);
        localStorageService.saveVisibleSessions(next);
        return next;
      });

      // Auto-export ZIP (paid feature — free tier keeps the session locally)
      if (FEATURES.zipExport) {
        try {
          const { default: DeriveSonoraExporter } = await import('../utils/deriveSonoraExporter.js');
          await DeriveSonoraExporter.exportDerive(sessionId);
        } catch (exportError) {
          console.warn('Auto-export failed:', exportError);
        }
      }
    } catch (error) {
      console.error('Error ending walk session:', error);
    }
  };

  // --- Session layer visibility toggle ---
  const handleToggleVisibility = (sessionId) => {
    setVisibleSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
        // Center map on first breadcrumb when toggling ON
        const session = walkSessionService.getSession(sessionId);
        if (session?.breadcrumbs?.length > 0 && mapInstance) {
          const first = session.breadcrumbs[0];
          mapInstance.setView([first.lat, first.lng], 16);
        }
      }
      localStorageService.saveVisibleSessions(next);
      return next;
    });
  };

  // --- Per-session playback ---
  const playSessionAudio = async (sessionId, mode) => {
    const session = walkSessionService.getSession(sessionId);
    if (!session) return;
    const sessionSpots = audioSpots.filter(s => session.recordingIds.includes(s.id));
    if (sessionSpots.length === 0) {
      showAlert(t('map.noLocatedRecordings'));
      return;
    }
    setSessionPlayback({
      sessionId,
      mode,
      title: session.title || t('history.untitled'),
      alias: session.userAlias
    });
    setPlayerExpanded(true);

    switch (mode) {
      case 'nearby': playNearbySpots(sessionSpots); break;
      case 'chronological': playConcatenated(sessionSpots); break;
      case 'jamm': playJamm(sessionSpots); break;
      case 'reloj': playReloj(sessionSpots); break;
      case 'alba': playAlba(sessionSpots); break;
      case 'crepusculo': playCrepusculo(sessionSpots); break;
      case 'estratos': playEstratos(sessionSpots); break;
    }
  };

  // Throttled zoom change handler to reduce marker re-renders during zoom animation
  const handleThrottledZoomChange = (newZoom) => {
    if (zoomThrottleRef.current) clearTimeout(zoomThrottleRef.current);
    zoomThrottleRef.current = setTimeout(() => {
      setCurrentZoom(newZoom);
    }, 200); // Wait 200ms after last zoom event before updating
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Android status bar dark overlay — makes battery/time icons visible */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'max(env(safe-area-inset-top, 0px), 36px)',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0))',
        zIndex: 1000,
        pointerEvents: 'none'
      }} />
      {/* Map */}
      <MapContainer
        center={userLocation ? [userLocation.lat, userLocation.lng] : [6.2529, -75.5646]}
        zoom={19}
        maxZoom={20}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
        ref={mapRef}
      >
        {/* Detect user manual zoom to disable auto-zoom */}
        <MapZoomHandler onUserZoom={() => { userHasZoomedRef.current = true; }} onZoomChange={handleThrottledZoomChange} />
        {/* OpenStreetMap Layer */}
        {currentLayer === 'OpenStreetMap' && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxNativeZoom={19}
            maxZoom={20}
          />
        )}

        {/* OpenTopoMap Layer — native max is 17 */}
        {currentLayer === 'OpenTopoMap' && (
          <TileLayer
            attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxNativeZoom={17}
            maxZoom={20}
          />
        )}

        {/* CartoDB Layer */}
        {currentLayer === 'CartoDB' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            maxNativeZoom={20}
            maxZoom={20}
          />
        )}

        {/* OSM Humanitarian Layer */}
        {currentLayer === 'OSMHumanitarian' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a>'
            url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
            maxNativeZoom={19}
            maxZoom={20}
          />
        )}

        {/* StadiaMaps Satellite Layer */}
        {currentLayer === 'StadiaSatellite' && (
          <TileLayer
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
            url="https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg"
            maxNativeZoom={18}
            maxZoom={20}
          />
        )}

        {/* ESRI World Imagery (Satellite) Layer ONLY */}
        {currentLayer === 'EsriWorldImagery' && (
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={18}
            maxZoom={20}
          />
        )}

        {currentLayer === 'CyclOSM' && (
          <TileLayer
            attribution='<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a> | &copy; OpenStreetMap'
            url="https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
            maxNativeZoom={18}
            maxZoom={20}
          />
        )}
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserLocationIcon()} />
        )}
        {(() => {
          try {
            return audioSpots
              .filter(spot =>
                spot &&
                spot.location &&
                typeof spot.location.lat === 'number' && isFinite(spot.location.lat) &&
                typeof spot.location.lng === 'number' && isFinite(spot.location.lng) &&
                typeof spot.duration === 'number' && isFinite(spot.duration) && spot.duration > 0
              )
              .map((spot, idx) => {
                // strictly use the standard static pin. The SetTheoryMapOverlay creates the aura/vibration
                const markerIcon = createDurationCircleIcon(spot.duration, currentZoom);

                return (
                  <Marker
                    key={spot.id}
                    position={[spot.location.lat, spot.location.lng]}
                    icon={markerIcon}
                    eventHandlers={{
                      click: () => handleMarkerClick(spot)
                    }}
                  >
                    <Popup
                      onOpen={() => setActiveGroup(spot)}
                      onClose={() => setActiveGroup(null)}
                      className="audio-spot-popup"
                    >
                      {renderPopupContent(spot)}
                    </Popup>
                  </Marker>
                );
              });
          } catch (err) {
            // console.error('Error rendering markers:', err);
            return (
              <div style={{ color: 'red', fontWeight: 'bold' }}>
                {t('map.markerRenderError', { msg: String(err) })}
              </div>
            );
          }
        })()}

        {/* Breadcrumb Visualization — always visible when breadcrumbs exist */}
        {currentBreadcrumbs.length > 0 && (
          <BreadcrumbVisualization
            breadcrumbs={currentBreadcrumbs}
            visualizationMode={breadcrumbVisualization}
            mapInstance={mapInstance}
          />
        )}

        {/* Saved session tracklines — rendered as GPS-tracklog colored lines */}
        {allSessions
          .filter(s => visibleSessionIds.has(s.sessionId) && s.breadcrumbs?.length >= 2)
          .map(s => (
            <BreadcrumbVisualization
              key={s.sessionId}
              breadcrumbs={simplifyBreadcrumbs(s.breadcrumbs)}
              visualizationMode="line"
              lineColor="auto"
              lineWidth={4}
              opacity={0.85}
              showMarkers={false}
            />
          ))}

        {playbackMode === 'nearby' && (
          <SetTheoryRadarHUD 
            trackProgress={trackProgress} 
            playbackMode={playbackMode} 
            userHeadingRef={userHeadingRef} 
            nearbyRange={nearbyRange}
            setNearbyRange={setNearbyRange}
            onOffsetChange={setManualSpatialOffset}
            onResetOffset={() => setManualSpatialOffset({ x: 0, y: 0 })}
          />
        )}

      </MapContainer>

      {/* Shared TopBar */}
      <SharedTopBar
        userLocation={userLocation}
        onBackToLanding={handleBackToMenu}
        onOpenGlobe={onOpenGlobe ? () => { stopAllAudio(); onOpenGlobe(); } : undefined}
        onLocationRefresh={() => {
          if (mapInstance && userLocation) {
            userHasZoomedRef.current = false;
            const zoom = Math.round(computeAutoZoom(cumulativeDistanceRef.current));
            mapInstance.flyTo([userLocation.lat, userLocation.lng], zoom, { duration: 0.5 });
            lastCenteredRef.current = { lat: userLocation.lat, lng: userLocation.lng };
          }
        }}
        onRequestGPSAccess={handleLocationRetry}
        mapInstance={mapInstance}
        showBreadcrumbs={showBreadcrumbs}
        onToggleBreadcrumbs={toggleBreadcrumbs}
        breadcrumbVisualization={breadcrumbVisualization}
        onSetBreadcrumbVisualization={handleSetBreadcrumbVisualization}
        showMicButton={false}
        showSearch={true}
        query={query}
        searchMapData={searchMapData}
        updateQuery={updateQuery}
        showZoomControls={true}
        showLayerSelector={true}
        currentLayer={currentLayer}
        onLayerChange={(layerName) => {
          console.log('SoundWalkAndroid: Layer changed to:', layerName);
          setCurrentLayer(layerName);
        }}
        showImportButton={true}
        onImportComplete={(result) => {
          if (onDataRefresh) onDataRefresh();
          const recordings = localStorageService.getAllRecordings();
          const spots = recordings
            .filter(r => r.location && r.location.lat && r.location.lng)
            .map(r => ({
              id: r.uniqueId,
              location: r.location,
              filename: r.displayName || r.filename,
              timestamp: r.timestamp,
              duration: r.duration,
              notes: r.notes,
              speciesTags: r.speciesTags || [],
              walkSessionId: r.walkSessionId || null,
            }))
            .filter(s => s.id && s.duration > 0);
          setAudioSpots(spots);
          // Make the imported session(s) visible on the map
          const idsToAdd = [
            result?.sessionId,
            ...(result?.walkSessionIds || []),
          ].filter(Boolean);
          if (idsToAdd.length > 0) {
            setVisibleSessionIds(prev => {
              const next = new Set(prev);
              idsToAdd.forEach(id => next.add(id));
              localStorageService.saveVisibleSessions(next);
              return next;
            });
          }
        }}
        walkSession={activeWalkSession}
        onStartDerive={handleStartDerive}
        onEndDerive={handleEndDerive}
        onRecordPress={handleStartMicForWalk}
        onShowHistory={() => setShowSessionHistory(true)}
        allSessions={allSessions}
      />

      {/* Record (red) and Play (green) FABs — symmetrical bottom corners */}
      {/* Record FAB — bottom-left (hidden when recorder modal is open) */}
      {!isAudioRecorderVisible && (
        <button
          onClick={async () => { await handleRecordingStart(); setIsAudioRecorderVisible(true); }}
          style={{
            position: 'fixed',
            bottom: '130px',
            left: 'calc(50% - 166px)',
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'rgba(194,74,110,0.65)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: '0 4px 16px rgba(194,74,110,0.35), 0 2px 6px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(12px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            transition: 'transform 0.2s'
          }}
          title={t('map.recordAudio')}
        >
          <Mic size={22} />
        </button>
      )}

      {/* Play FAB — bottom-right */}
      {!playerExpanded && (
        <button
          onClick={() => {
            // Re-trigger heading watch on gesture
            locationService.startHeadingWatch((heading) => {
              userHeadingRef.current = heading;
            });
            setPlayerExpanded(true);
            if (mapInstance) mapInstance.closePopup();
          }}
          style={{
            position: 'fixed',
            bottom: '130px',
            left: 'calc(50% + 114px)',
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'rgba(157,192,76,0.65)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: '0 4px 16px rgba(157,192,76,0.35), 0 2px 6px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(12px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            transition: 'transform 0.2s'
          }}
          title={t('map.openPlayer')}
        >
          <Play size={22} />
        </button>
      )}

      {/* HUD Overlay for Nearby mode */}
      {playbackMode === 'nearby' && !playerExpanded && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${nearbyDragPos.x}px), calc(-50% + ${nearbyDragPos.y}px))`,
          zIndex: 1001,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: 'calc(100% - 40px)',
          maxWidth: '400px'
        }}>
          {/* Set Theory Active HUD UI was completely relocated into the Geographic Map Overlay directly! */}

          {/* Nearby Minimal Controls */}
          <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => handlePlayNearby()}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', backgroundColor: '#624f49', color: '#ededef', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />} {isPlaying ? t('map.pause') : t('map.play')}
              </button>
              <button onClick={() => { handleStopAudio(); setPlaybackMode(null); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', backgroundColor: '#a3a212', color: '#ededef', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                <Square size={18} /> {t('map.stop')}
              </button>
              <button onClick={toggleMute} style={{ backgroundColor: '#cdc6c0', color: '#624f49', border: 'none', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(98, 79, 73, 0.4)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(4px)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              <Volume2 size={18} color="#ededef" />
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => handleVolumeChange(Number(e.target.value))} style={{ flex: 1, accentColor: '#04a5e9' }} />
              <button onClick={() => setProximityVolumeEnabled(!proximityVolumeEnabled)} style={{ backgroundColor: proximityVolumeEnabled ? '#04a5e9' : 'rgba(205, 198, 192, 0.2)', color: proximityVolumeEnabled ? '#ededef' : '#cdc6c0', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}>📍🔊</button>
            </div>
            <div onPointerDown={onNearbyDragStart} style={{ cursor: 'grab', touchAction: 'none' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#ededef', fontStyle: 'normal', fontWeight: '500', textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
                {t('map.nearbyHudDesc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expanded player panel */}
      {playerExpanded && (
        <div style={{
          position: 'fixed',
          bottom: '120px',
          left: '50%',
          transform: `translate(calc(-50% + ${playerDragPos.x}px), ${playerDragPos.y}px)`,
          backgroundColor: 'rgba(205,198,192,0.85)',
          borderRadius: '16px',
          boxShadow: 'rgba(98,79,73,0.25) 0px 10px 30px',
          padding: '20px',
          minWidth: '300px',
          maxWidth: '400px',
          zIndex: 1000
        }}>
          {/* Close button */}
          <button
            onClick={() => setPlayerExpanded(false)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#624f49',
              fontSize: '18px',
              padding: '4px',
              lineHeight: 1,
              zIndex: 1
            }}
            title={t('map.closePlayer')}
          >
            ✕
          </button>
          <div
            onPointerDown={onPlayerDragStart}
            style={{ textAlign: 'center', marginBottom: '16px', cursor: 'grab', touchAction: 'none' }}
          >
            <h3 style={{ margin: '0px 0px 8px', fontSize: '18px', fontWeight: '600' }}>
              {sessionPlayback ? sessionPlayback.title : t('map.player')}
            </h3>
            <p style={{ margin: '0px', fontSize: '14px', color: '#624f49' }}>
              {sessionPlayback
                ? `${sessionPlayback.alias} — ${modeLabelWithIcon(sessionPlayback.mode)}`
                : t('map.playableCount', { n: modePlayableCount })
              }
            </p>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#624f49', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('map.playbackMode')}
            </div>
            {/* Bioacoustics group */}
            <div style={{ fontSize: '10px', color: '#624f49', marginBottom: '4px' }}>{t('map.groupBio')}</div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
              {[
                { id: 'nearby',    label: t('mode.nearby'),  icon: '📍' },
                { id: 'reloj',     label: t('mode.reloj'),     icon: '🕐' },
                { id: 'alba',        label: t('mode.alba'),        icon: '🌅' },
                { id: 'crepusculo', label: t('mode.crepusculo'), icon: '🌇' },
                { id: 'estratos',   label: t('mode.estratos'),   icon: '🌿' },
              ].map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => { 
                    const prevMode = playbackMode;
                    setPlaybackMode(id); 
                    if (id === 'nearby') {
                      setPlayerExpanded(false); 
                      // If we are switching TO nearby mode, auto-start if already playing something else OR nothing
                      if (prevMode !== 'nearby' || !isPlaying) {
                        handlePlayNearby();
                      }
                    }
                  }}
                  style={{
                    padding: '5px 9px',
                    backgroundColor: playbackMode === id ? '#624f49' : 'rgba(98,79,73,0.15)',
                    color: playbackMode === id ? '#ededef' : '#624f49',
                    border: playbackMode === id ? 'none' : '1px solid rgba(98,79,73,0.3)',
                    borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '3px',
                    fontWeight: playbackMode === id ? '600' : '400',
                    boxShadow: playbackMode === id ? '0 2px 8px rgba(98,79,73,0.4)' : 'none',
                    transform: playbackMode === id ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            {/* Range slider removed from here, now in SetTheoryRadarHUD */}

            {/* Sound art group */}
            <div style={{ fontSize: '10px', color: '#624f49', marginBottom: '4px' }}>{t('map.groupArt')}</div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {[
                { id: 'chronological', label: t('mode.chronological'), icon: '📅' },
                { id: 'jamm',          label: t('mode.jamm'),        icon: '🎛️' },
                { id: 'migratoria',    label: t('mode.migratoria'),  icon: '🦋' },
                { id: 'espectro',      label: t('mode.espectro'),    icon: '🌈' },
              ].map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => { 
                    const prevMode = playbackMode;
                    setPlaybackMode(id); 
                    if (id === 'nearby') {
                      setPlayerExpanded(false); 
                      // If we are switching TO nearby mode, auto-start if already playing something else OR nothing
                      if (prevMode !== 'nearby' || !isPlaying) {
                        handlePlayNearby();
                      }
                    }
                  }}
                  style={{
                    padding: '5px 9px',
                    backgroundColor: playbackMode === id ? '#624f49' : 'rgba(98,79,73,0.15)',
                    color: playbackMode === id ? '#ededef' : '#624f49',
                    border: playbackMode === id ? 'none' : '1px solid rgba(98,79,73,0.3)',
                    borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '3px',
                    fontWeight: playbackMode === id ? '600' : '400',
                    boxShadow: playbackMode === id ? '0 2px 8px rgba(98,79,73,0.4)' : 'none',
                    transform: playbackMode === id ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            {/* Mode description */}
            <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#624f49', fontStyle: 'italic', lineHeight: '1.3' }}>
              {playbackMode === 'reloj'
                ? t('map.desc.reloj', { w: relojWindow })
                : (playbackMode ? t(`map.desc.${playbackMode}`) : '')}
            </p>
            {/* Reloj window selector */}
            {playbackMode === 'reloj' && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                {[15, 30, 60].map(w => (
                  <button
                    key={w}
                    onClick={() => setRelojWindow(w)}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      border: relojWindow === w ? 'none' : '1px solid rgba(98,79,73,0.3)',
                      borderRadius: '4px',
                      backgroundColor: relojWindow === w ? '#624f49' : 'transparent',
                      color: relojWindow === w ? '#ededef' : '#624f49',
                      cursor: 'pointer',
                    }}
                  >
                    ±{w} min
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Active tracks tracklist */}
          {Object.keys(trackProgress).length > 0 && playbackMode !== 'nearby' && (
            <div style={{
              marginBottom: '12px',
              maxHeight: '140px',
              overflowY: 'auto',
              borderTop: '1px solid rgba(98,79,73,0.2)',
              borderBottom: '1px solid rgba(98,79,73,0.2)',
              paddingTop: '8px',
              paddingBottom: '4px',
            }}>
              <div style={{
                fontSize: '10px', fontWeight: '600', color: '#624f49',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: '4px', paddingLeft: '8px',
              }}>
                {t('map.activeTracks', { n: Object.keys(trackProgress).length })}
              </div>
              {Object.entries(trackProgress).map(([trackId, progress]) => (
                <TracklistItem
                  key={trackId}
                  track={{ filename: progress.filename }}
                  progress={progress}
                  isPlaying={progress.isPlaying}
                />
              ))}
            </div>
          )}
          {currentAudio && Object.keys(trackProgress).length === 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', color: '#624f49' }}>
                {currentAudio.filename}
              </div>
              <div style={{ fontSize: '12px', color: '#624f49' }}>
                {formatDateTime(currentAudio.timestamp, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — {modeLabelWithIcon(playbackMode)}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button
              onClick={() => {
                // Ensure heading watch
                locationService.startHeadingWatch((h) => { userHeadingRef.current = h; });

                const visibleSpots = audioSpots.filter(s =>
                  !s.walkSessionId || visibleSessionIds.has(s.walkSessionId)
                );
                if (playbackMode === 'nearby') {
                  handlePlayNearby();
                  setPlayerExpanded(false); // Drop seamlessly into AR map mode
                }
                else if (playbackMode === 'chronological') playConcatenated(visibleSpots);
                else if (playbackMode === 'concatenated') playConcatenated(visibleSpots);
                else if (playbackMode === 'jamm') playJamm(visibleSpots);
                else if (playbackMode === 'reloj') playReloj(visibleSpots);
                else if (playbackMode === 'alba') playAlba(visibleSpots);
                else if (playbackMode === 'crepusculo') playCrepusculo(visibleSpots);
                else if (playbackMode === 'estratos') playEstratos(visibleSpots);
                else if (playbackMode === 'migratoria') playMigratoria(visibleSpots);
                else if (playbackMode === 'espectro') playEspectro(visibleSpots);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center',
                backgroundColor: (nearbySpots.length > 0 || selectedSpot) ? '#624f49' : 'rgba(98,79,73,0.5)',
                color: '#ededef', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '16px', fontWeight: 'bold', cursor: (nearbySpots.length > 0 || selectedSpot) ? 'pointer' : 'not-allowed', transition: 'background-color 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}
            >
              <Play size={18} /> {t('map.play')}
            </button>
            <button onClick={handleStopAudio} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', backgroundColor: '#a3a212', color: '#ededef', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              <Square size={18} /> {t('map.stop')}
            </button>
            <button onClick={toggleMute} style={{ backgroundColor: '#cdc6c0', color: '#624f49', border: 'none', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(98, 79, 73, 0.15)', padding: '8px 16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Volume2 size={18} color="#624f49" />
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => handleVolumeChange(Number(e.target.value))} style={{ flex: 1, accentColor: '#04a5e9' }} />
            <button
              onClick={() => setProximityVolumeEnabled(!proximityVolumeEnabled)}
              style={{
                backgroundColor: proximityVolumeEnabled ? '#04a5e9' : 'rgba(98,79,73,0.15)',
                color: proximityVolumeEnabled ? '#ededef' : '#624f49',
                border: 'none', borderRadius: '6px',
                padding: '6px 10px', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s'
              }}
              title={t('map.proximityVolume')}
            >
              📍🔊
            </button>
          </div>
        </div>
      )}

      {/* Export buttons removed — export is now available via Session History panel */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: '#f0f1ec',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid rgba(78,78,134,0.15)', borderTop: '3px solid #9dc04cd4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ margin: 0, fontSize: '14px', color: 'rgb(1 9 2 / 84%)' }}>{t('map.loadingAudio')}</p>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes nearby-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 2px 12px rgba(157, 192, 76, 0.6);
          }
          50% {
            transform: scale(1.15);
            box-shadow: 0 4px 20px rgba(157, 192, 76, 0.9);
          }
        }
      `}</style>

      {/* DetailView for selected marker */}
      <DetailView
        point={selectedPoint}
        getNextRecording={getNextRecording}
        getPreviousRecording={getPreviousRecording}
        searchMapData={searchMapData}
      />

      {/* Free-tier upgrade prompt */}
      {showUpgradePrompt && (
        <UpgradePrompt variant="limit" onClose={() => setShowUpgradePrompt(false)} />
      )}

      {/* Audio Recorder */}
      <AudioRecorder
        userLocation={userLocation}
        locationAccuracy={userLocation?.accuracy}
        onSaveRecording={handleWalkRecordingSave}
        onCancel={() => setIsAudioRecorderVisible(false)}
        isVisible={isAudioRecorderVisible}
        walkSessionId={activeWalkSession?.sessionId || null}
        onRecordingStart={handleRecordingStart}
      />

      {/* Alias prompt on first use */}
      {showAliasPrompt && (
        <AliasPrompt
          onSubmit={(alias) => {
            userAliasService.setAlias(alias);
            setShowAliasPrompt(false);
          }}
          onCancel={() => setShowAliasPrompt(false)}
        />
      )}

      {/* Session history panel */}
      {afppPromptSessionId && (
        <div style={{
          position: 'fixed', left: '50%', bottom: '200px', transform: 'translateX(-50%)',
          width: '90%', maxWidth: '360px', zIndex: 10001, background: 'rgba(255,255,255,0.95)',
          borderRadius: '14px', boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px', padding: '14px 16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ fontSize: '14px', color: '#000000c9' }}>{t('afpp.share.promptTitle')}</strong>
            <button
              onClick={() => setAfppPromptSessionId(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '13px' }}
            >
              {t('afpp.share.later')}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#555', margin: '0 0 10px' }}>{t('afpp.share.promptBody')}</p>
          <AfppShareButton sessionId={afppPromptSessionId} />
        </div>
      )}

      {showSessionHistory && (
        <SessionHistoryPanel
          onClose={() => setShowSessionHistory(false)}
          onViewSession={(session) => {
            setShowSessionHistory(false);
            // Center map on session start if breadcrumbs exist
            if (session.breadcrumbs?.length > 0 && mapInstance) {
              const first = session.breadcrumbs[0];
              mapInstance.setView([first.lat, first.lng], 16);
            }
          }}
          visibleSessionIds={visibleSessionIds}
          onToggleVisibility={handleToggleVisibility}
          onPlaySession={(sessionId, mode) => {
            setShowSessionHistory(false);
            playSessionAudio(sessionId, mode);
          }}
          sessionColors={Object.fromEntries(sessionTracklines.map(t => [t.sessionId, t.color]))}
        />
      )}
    </div>
  );
};

// ... (WrappedSoundWalkAndroid and export remain the same)


// Wrap export in ErrorBoundary
const WrappedSoundWalkAndroid = (props) => (
  <ErrorBoundary>
    <SoundWalkAndroid {...props} />
  </ErrorBoundary>
);

export default WrappedSoundWalkAndroid; 