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
import React from 'react';
import { withStyles } from '@mui/material/styles';
import Input from '@mui/material/Input';
import { Mic, MapPin, Layers, Map, Activity, Play, Pause, Info, Download, Clock, List, Globe } from 'lucide-react';
import breadcrumbService from '../services/breadcrumbService.js';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import TracklogImportModal from './TracklogImportModal.jsx';
import { t, getLanguage, setLanguage } from '../i18n';
import { FEATURES } from '../config/tier.js';
import UpgradePrompt from './UpgradePrompt.jsx';


class SharedTopBar extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      layerMenuOpen: false,
      showLayerInfo: false,
      showImportModal: false,
      deriveElapsed: 0,
      deriveDistance: 0,
      derivePaused: false,
      showEndConfirm: false,
      sessionTitle: '',
      showZipUpgrade: false
    };
    this.infoModalRef = React.createRef();
    this._deriveTimer = null;
    this._pausedTotal = 0;      // accumulated ms spent paused
    this._pausedAt = null;       // timestamp when pause started
  }

  handleChange = event => {
    if (this.props.updateQuery) {
      this.props.updateQuery(event.target.value)
    }
  }

  handleLayerChange = (layerName) => {
    if (this.props.onLayerChange) {
      this.props.onLayerChange(layerName);
    }
    this.setState({ layerMenuOpen: false });
  }

  toggleLayerMenu = () => {
    this.setState(prevState => ({ layerMenuOpen: !prevState.layerMenuOpen }));
  }

  toggleLayerInfo = () => {
    this.setState(prevState => ({ showLayerInfo: !prevState.showLayerInfo }));
  }

  toggleImportModal = () => {
    this.setState(prevState => ({ showImportModal: !prevState.showImportModal }));
  }

  componentDidMount() {
    document.addEventListener('click', this.handleClickOutside);
    this._startDeriveTimerIfNeeded();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.walkSession !== this.props.walkSession) {
      this._startDeriveTimerIfNeeded();
    }
  }

  componentWillUnmount() {
    document.removeEventListener('click', this.handleClickOutside);
    if (this._deriveTimer) clearInterval(this._deriveTimer);
    breadcrumbService.setAutoResumeCallback(null);
  }

  _handleAutoResume = () => {
    // Called by breadcrumbService when user moves >5m while paused
    if (!this.state.derivePaused) return;
    this._pausedTotal += Date.now() - this._pausedAt;
    this._pausedAt = null;
    this.setState({ derivePaused: false });
    console.log('Derive auto-resumed: user moved >5m');
  }

  _startDeriveTimerIfNeeded() {
    if (this._deriveTimer) {
      clearInterval(this._deriveTimer);
      this._deriveTimer = null;
    }
    if (this.props.walkSession) {
      // Start paused — timer only begins when user walks >5m (auto-resume)
      this._pausedTotal = 0;
      this._pausedAt = Date.now();
      this._deriveStartedMoving = false;
      // Register auto-resume callback
      breadcrumbService.setAutoResumeCallback(this._handleAutoResume);
      // Start paused — breadcrumbService will auto-resume on >5m movement
      breadcrumbService.pauseTracking();
      this.setState({ derivePaused: true, deriveElapsed: 0, deriveDistance: 0 });
      const update = () => {
        if (this.state.derivePaused) return;
        const ms = Date.now() - this.props.walkSession.startTime - this._pausedTotal;
        const data = breadcrumbService.getSessionData();
        this.setState({
          deriveElapsed: Math.floor(ms / 1000),
          deriveDistance: data?.summary?.totalDistance || 0
        });
      };
      this._deriveTimer = setInterval(update, 1000);
    } else {
      breadcrumbService.setAutoResumeCallback(null);
      this.setState({ deriveElapsed: 0, deriveDistance: 0, derivePaused: false });
    }
  }

  _toggleDerivePause = () => {
    if (this.state.derivePaused) {
      // Resume
      this._pausedTotal += Date.now() - this._pausedAt;
      this._pausedAt = null;
      breadcrumbService.resumeTracking();
      this.setState({ derivePaused: false });
    } else {
      // Pause
      this._pausedAt = Date.now();
      breadcrumbService.pauseTracking();
      this.setState({ derivePaused: true });
    }
  }

  _formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  _formatDistance(meters) {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  }

  handleClickOutside = (event) => {
    // Check if the click is on the info button itself - if so, don't close
    // (matched by data attribute — the title is translated and can't be relied on)
    const isInfoButton = event.target.closest('button[data-guide-button]');
    
    if (this.layerMenuRef && !this.layerMenuRef.contains(event.target)) {
      this.setState({ layerMenuOpen: false });
    }
    if (this.state.showLayerInfo && this.infoModalRef && !this.infoModalRef.current.contains(event.target) && !isInfoButton) {
      this.setState({ showLayerInfo: false });
    }
  }

  render () {
    const locationStatus = this.props.userLocation ? 'active' : 'inactive';

    // Determine mic button color
    let micColor = '#c24a6e'; // red (ready)
    if (this.props.isRecording) micColor = '#F59E42'; // amber (recording)
    if (this.props.isMicDisabled) micColor = '#9CA3AF'; // gray (disabled)

    // Unified shadow system
    const unifiedShadow = '0 4px 12px rgba(78,78,134,0.18), 0 2px 6px rgba(0,0,0,0.1)';
    const unifiedShadowHover = '0 6px 20px rgba(0,0,0,0.2), 0 3px 10px rgba(78,78,134,0.18)';
    
    // Common button style for bottom controls
    const bottomButtonStyle = {
      padding: '8px 12px',
      background: 'rgba(240,242,245,0.68)',
      borderRadius: '12px',
      boxShadow: unifiedShadow,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      backdropFilter: 'blur(10px)',
      fontSize: '12px',
      fontWeight: '600',
      color: '#000000c9',
      minWidth: 'auto'
    };

    return (
      <>
        {/* Bottom control bar - unified interface */}
        <div style={{
          position: 'fixed',
          bottom: 'max(env(safe-area-inset-bottom, 0px), 80px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'nowrap',
          justifyContent: 'center',
          maxWidth: 'calc(100vw - 16px)',
          overflow: 'visible',
        }}>
          {/* Breadcrumb Visualization — single cycling toggle */}
          {this.props.showBreadcrumbs !== undefined && (() => {
            const modes = ['line', 'heatmap', 'animated'];
            const modeColors = { line: '#5a5a6a', heatmap: '#6a6a7a', animated: '#7a7a8a' };
            const modeLabels = {
              line: t('topbar.viewMode.line'),
              heatmap: t('topbar.viewMode.heatmap'),
              animated: t('topbar.viewMode.animated')
            };
            const modeIcons = {
              line: <Activity size={16} />,
              heatmap: <Map size={16} />,
              animated: <span style={{ fontSize: '14px', lineHeight: 1 }}>〰️</span>
            };
            const current = this.props.breadcrumbVisualization || 'heatmap';
            const color = modeColors[current] || modeColors.heatmap;
            return (
              <button
                onClick={() => {
                  const idx = modes.indexOf(current);
                  const next = modes[(idx + 1) % modes.length];
                  if (!this.props.showBreadcrumbs) this.props.onToggleBreadcrumbs();
                  this.props.onSetBreadcrumbVisualization(next);
                }}
                style={{
                  ...bottomButtonStyle,
                  padding: '5px 8px',
                  borderRadius: '20px',
                  height: '32px',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backgroundColor: this.props.showBreadcrumbs ? color : 'rgba(240,242,245,0.50)',
                  color: this.props.showBreadcrumbs ? 'white' : '#5a5a6a',
                  gap: '5px',
                  fontSize: '11px',
                }}
                title={t('topbar.viewTitle', { mode: modeLabels[current] })}
              >
                {modeIcons[current]}
                <span>{modeLabels[current]}</span>
              </button>
            );
          })()}

          {/* Custom Controls Slot */}
          {this.props.customControls && (
            <div style={{
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
              height: '40px',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}>
              {this.props.customControls}
            </div>
          )}

          {/* Derive history button — always visible */}
          <button
            onClick={this.props.onShowHistory}
            style={{
              ...bottomButtonStyle,
              padding: '7px',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              justifyContent: 'center',
              minWidth: '32px',
              flexShrink: 0,
            }}
            title={t('topbar.history')}
          >
            <List size={16} />
          </button>
        </div>

        {/* Floating derive stats pill — between Mic and Play FABs */}
        {this.props.walkSession && (
          <div
            onClick={() => this.setState({ showEndConfirm: true })}
            title={t('topbar.pausePill')}
            style={{
              position: 'fixed',
              bottom: '138px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              cursor: 'pointer',
              transition: 'opacity 0.3s ease',
              opacity: this.state.derivePaused ? 0.65 : 1,
            }}
          >
            <span style={{
              ...bottomButtonStyle,
              padding: '5px 10px',
              fontSize: '11px',
              height: '32px',
              gap: '6px',
              whiteSpace: 'nowrap',
              background: 'rgba(160,166,138,0.82)',
            }}>
              <Clock size={13} />
              {this._formatTime(this.state.deriveElapsed)}
              <span style={{ opacity: 0.4 }}>&middot;</span>
              <MapPin size={13} />
              {this._formatDistance(this.state.deriveDistance)}
              <span style={{ opacity: 0.4 }}>&middot;</span>
              <Mic size={13} style={{ color: '#9dc04cd4' }} />
              <span style={{ color: '#9dc04cd4', fontWeight: '700' }}>{this.props.walkSession.recordingIds?.length || 0}</span>
            </span>
            <span style={{
              fontSize: '9px',
              color: 'rgba(80,90,70,0.7)',
              letterSpacing: '0.03em',
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              {t('topbar.tapToEnd')}
            </span>
          </div>
        )}

        {/* Main top bar controls (location, search, mic) */}
        <div
          className=""
          style={{
            position: 'fixed',
            top: 'max(calc(env(safe-area-inset-top, 0px) + 40px), 64px)',
            left: '6px',
            right: '6px',
            zIndex: 1001,
            height: '36px',
            minHeight: '36px',
            maxHeight: '40px',
            fontSize: '12px',
            padding: '0 6px',
            background: 'rgba(220,225,235,0.78)',
            borderRadius: '12px',
            boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: 'auto',
            maxWidth: 'calc(100vw - 16px)',
            overflow: 'visible',
            border: 'none',
            fontWeight: '600',
            color: '#000000c9',
            boxSizing: 'border-box'
          }}
        >
          {/* Mic Button (only if showMicButton is true) */}
          {this.props.showMicButton && (
            <button
              onClick={this.props.toggleAudioRecorder}
              style={{
                background: micColor,
                color: 'white',
                border: '2px solid white',
                borderRadius: '50%',
                padding: '5px',
                boxShadow: `0 4px 12px ${micColor}60, 0 2px 6px rgba(0,0,0,0.1)`,
                cursor: this.props.isMicDisabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '26px',
                minHeight: '26px',
                marginRight: '2px',
                fontSize: '14px',
                animation: 'microphone-pulse 2s infinite',
                opacity: this.props.isMicDisabled ? 0.5 : 1
              }}
              title={this.props.isRecording ? t('topbar.recording') : t('topbar.recordAudio')}
              disabled={this.props.isMicDisabled}
            >
              <img src="/ultrared.png" alt="Record" style={{ width: 18, height: 18, objectFit: 'contain', background: 'none' }} />
            </button>
          )}


          {/* Info Button */}
          <button
            onClick={this.toggleLayerInfo}
            style={{
              background: 'rgba(220,225,235,0.78)',
              border: '2px solid rgba(0,0,0,0.08)',
              borderRadius: '50%',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.1)';
              e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }}
            title={t('topbar.userGuide')}
            data-guide-button="true"
          >
            <Info size={20} style={{ color: '#4e4e86' }} />
          </button>

          {/* GPS/Recenter Button */}
          <button
            onClick={() => {
              // First try to request GPS access if not already granted
              if (this.props.onRequestGPSAccess && (!this.props.userLocation || locationStatus !== 'active')) {
                this.props.onRequestGPSAccess();
              }
              // Then recenter if we have location
              if (this.props.onLocationRefresh && this.props.userLocation) {
                this.props.onLocationRefresh();
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
            }}
            title={this.props.userLocation ? t('topbar.centerMap') : t('topbar.requestGPS')}
          >
            <img 
              src={markerIconUrl} 
              alt="Recenter" 
              style={{ 
                width: 24, 
                height: 36, 
                display: 'block',
                filter: this.props.userLocation ? 'saturate(1.8) brightness(1.1)' : 'grayscale(0.5) opacity(0.6)',
                transition: 'filter 0.3s ease'
              }} 
            />
          </button>

          {/* Layer Selector - icon-only, dropdown opens downward */}
          {this.props.showLayerSelector && (
            <div
              ref={(el) => this.layerMenuRef = el}
              style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            >
              <button
                onClick={this.toggleLayerMenu}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                title={t('topbar.selectLayer')}
              >
                <Layers size={20} style={{ color: '#000000c9' }} />
              </button>
              {this.state.layerMenuOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: '6px',
                  background: 'rgba(220,225,235,0.78)',
                  borderRadius: '12px',
                  boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  zIndex: 1005,
                  width: '120px',
                  overflow: 'hidden',
                }}>
                  {[
                    { key: 'OpenStreetMap', label: 'OSM', title: 'OpenStreetMap' },
                    { key: 'OpenTopoMap', label: 'Topo', title: 'OpenTopoMap' },
                    { key: 'CartoDB', label: 'Carto', title: 'CartoDB Positron' },
                    { key: 'OSMHumanitarian', label: 'Humanitarian', title: 'OSM Humanitarian' },
                    { key: 'StadiaSatellite', label: 'Satellite', title: 'Stadia Satellite' },
                    { key: 'EsriWorldImagery', label: 'Esri Img', title: 'Esri World Imagery (Satellite)' },
                    { key: 'CyclOSM', label: 'CyclOSM', title: 'CyclOSM (Bike lanes / Topography)' },
                  ].map(layer => (
                    <button
                      key={layer.key}
                      onClick={() => this.handleLayerChange(layer.key)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: this.props.currentLayer === layer.key ? '#9dc04cd4' : '#000000c9',
                        backgroundColor: this.props.currentLayer === layer.key ? 'rgba(157,192,76,0.12)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = this.props.currentLayer === layer.key ? 'rgba(157,192,76,0.18)' : 'rgba(0,0,0,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = this.props.currentLayer === layer.key ? 'rgba(157,192,76,0.12)' : 'transparent';
                      }}
                      title={layer.title}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AFPP global map — only in builds with VITE_AFPP_API */}
          {this.props.onOpenGlobe && (
            <button
              onClick={this.props.onOpenGlobe}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title={t('afpp.openGlobe')}
            >
              <Globe size={20} style={{ color: '#9b4dff' }} />
            </button>
          )}

          {/* Import Button - icon-only; locked (not hidden) on the free tier */}
          {this.props.showImportButton && (
            <button
              onClick={FEATURES.zipImport ? this.toggleImportModal : () => this.setState({ showZipUpgrade: true })}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                position: 'relative',
                opacity: FEATURES.zipImport ? 1 : 0.55
              }}
              title={FEATURES.zipImport ? t('topbar.import') : t('tier.zipLockedTitle')}
            >
              <Download size={20} style={{ color: '#000000c9' }} />
              {!FEATURES.zipImport && (
                <span style={{ position: 'absolute', top: '-2px', right: '-4px', fontSize: '10px' }}>🔒</span>
              )}
            </button>
          )}

          {/* Search Input (only if showSearch is true) */}
          {this.props.showSearch && (
            <div style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box', maxWidth: '100vw', overflow: 'hidden' }}>
              <Input
                onKeyPress={(ev) => {
                  if (ev.key === 'Enter') {
                    if (this.props.searchMapData) {
                      this.props.searchMapData(this.props.query)
                    }
                    ev.preventDefault();
                  }
                }}
                placeholder={t('topbar.searchPlaceholder')}
                type="search"
                fullWidth
                value={this.props.query || ''}
                className=""
                onChange={this.handleChange}
                inputProps={{
                  'aria-label': 'Description',
                  style: { fontSize: '16px', padding: '8px 6px', maxWidth: '100%', width: '100%', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis' }
                }}
                style={{ width: '100%', maxWidth: '100vw', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis' }}
              />
            </div>
          )}

          {/* Custom Top Bar Content Slot */}
          {this.props.customTopBarContent && (
            <div style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box', maxWidth: '100vw', overflow: 'hidden' }}>
              {this.props.customTopBarContent}
            </div>
          )}
        </div>

          {/* Layer Information Table */}
        {this.state.showLayerInfo && (
          <div 
            ref={this.infoModalRef}
            style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(220,225,235,0.78)',
            borderRadius: '16px',
            boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.3)',
            zIndex: 1006,
            width: 'min(92vw, 400px)',
            maxWidth: '92vw',
            maxHeight: '85vh',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '16px 16px 12px'
          }}>
            <button
              onClick={this.toggleLayerInfo}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6B7280',
                fontSize: '18px',
                padding: '4px',
                lineHeight: 1
              }}
              title={t('common.close')}
            >
              ✕
            </button>
            <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgb(1 9 2 / 84%)' }}>
              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: '700', fontSize: '14px' }}>{t('guide.language')}</div>
                <div style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(78,78,134,0.25)' }}>
                  {['es', 'en'].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      aria-pressed={getLanguage() === lang}
                      style={{
                        border: 'none',
                        padding: '5px 14px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        backgroundColor: getLanguage() === lang ? '#9dc04cd4' : 'transparent',
                        color: getLanguage() === lang ? '#fff' : '#6B7280'
                      }}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>{t('landing.about.topBar')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '12px' }}>
                  <span>ℹ️</span><span>{t('guide.topBar.guide')}</span>
                  <span>📍</span><span>{t('landing.about.topBar.center')}</span>
                  <span>🗺️</span><span>{t('landing.about.topBar.layers')}</span>
                  <span>⬇️</span><span>{t('guide.topBar.import')}</span>
                  <span>🔍</span><span>{t('landing.about.topBar.search')}</span>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>{t('landing.about.bottomBar')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '12px' }}>
                  <span>🗺️</span><span>{t('guide.bottomBar.breadcrumbs')}</span>
                  <span>🟢</span><span><strong>{t('landing.about.bottomBar.driftWord')}</strong> {t('guide.bottomBar.drift')}</span>
                  <span>⏸️</span><span>{t('guide.bottomBar.pause')}</span>
                  <span>⏹️</span><span><strong>{t('landing.about.bottomBar.endWord')}</strong> {t('guide.bottomBar.end')}</span>
                  <span>📋</span><span>{t('guide.bottomBar.history')}</span>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>{t('landing.about.recording')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '12px' }}>
                  <span>🎤</span><span>{t('landing.about.recording.fab')}</span>
                  <span>📍</span><span>{t('guide.recording.pin')}</span>
                  <span>▶️</span><span>{t('guide.recording.modes')}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', fontSize: '11px', marginTop: '4px', paddingLeft: '20px' }}>
                  <span>📍</span><span><strong>{t('mode.nearby')}</strong> {t('guide.mode.nearby')}</span>
                  <span>🕐</span><span><strong>{t('mode.reloj')}</strong> {t('guide.mode.reloj')}</span>
                  <span>🌅</span><span><strong>{t('mode.alba')}</strong> {t('guide.mode.alba')}</span>
                  <span>🌇</span><span><strong>{t('mode.crepusculo')}</strong> {t('guide.mode.crepusculo')}</span>
                  <span>🌿</span><span><strong>{t('mode.estratos')}</strong> {t('guide.mode.estratos')}</span>
                  <span>📅</span><span><strong>{t('mode.chronological')}</strong> {t('guide.mode.chronological')}</span>
                  <span>🎛️</span><span><strong>{t('mode.jamm')}</strong> {t('guide.mode.jamm')}</span>
                  <span>🦋</span><span><strong>{t('mode.migratoria')}</strong> {t('guide.mode.migratoria')}</span>
                  <span>🌈</span><span><strong>{t('mode.espectro')}</strong> {t('guide.mode.espectro')}</span>
                </div>
              </div>
              <div style={{
                background: '#F3F4F6',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '11px',
                color: '#6B7280',
                lineHeight: '1.5'
              }}>
                {t('guide.tips')}
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>{t('guide.credits')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '11px', color: '#6B7280' }}>
                  <span>Leaflet</span><span>leafletjs.com</span>
                  <span>OpenStreetMap</span><span>openstreetmap.org</span>
                  <span>OpenTopoMap</span><span>opentopomap.org</span>
                  <span>CARTO</span><span>carto.com</span>
                  <span>HOT</span><span>hotosm.org</span>
                  <span>Stadia Maps</span><span>stadiamaps.com</span>
                  <span>Esri</span><span>arcgis.com</span>
                  <span>CyclOSM</span><span>cyclosm.org</span>
                </div>
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>{t('landing.about.license')}</div>
                <p style={{ margin: '0 0 8px 0', fontSize: '11px' }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>{t('landing.about.licenseProject')}</strong>
                  {t('landing.about.licenseCopyright')}
                </p>
                <p style={{ margin: '0 0 8px 0', fontSize: '11px' }}>
                  {t('landing.about.licenseUnder')}
                  <strong style={{ marginLeft: '4px' }}>Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)</strong>.
                </p>
                <p style={{ margin: '0 0 8px 0', fontSize: '11px' }}>
                  {t('landing.about.licenseFull')} <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode" target="_blank" rel="noopener noreferrer" style={{ color: '#6B7280' }}>
                    https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
                  </a>
                </p>
                <p style={{ margin: 0, fontSize: '11px' }}>
                  {t('landing.about.licenseScope')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Free-tier upgrade prompt for ZIP features */}
        {this.state.showZipUpgrade && (
          <UpgradePrompt variant="zip" onClose={() => this.setState({ showZipUpgrade: false })} />
        )}

        {/* Import Modal */}
        {this.state.showImportModal && (
          <TracklogImportModal
            isVisible={this.state.showImportModal}
            onClose={this.toggleImportModal}
            onImportComplete={(result) => {
              console.log('Import completed:', result);
              this.toggleImportModal();
              if (this.props.onImportComplete) {
                this.props.onImportComplete(result);
              }
            }}
            allSessions={this.props.allSessions}
          />
        )}

        {/* End Derive Confirmation Modal — Reproductor-style floating panel */}
        {this.state.showEndConfirm && this.props.walkSession && (
          <div style={{
            position: 'fixed',
            bottom: '120px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(220,225,235,0.78)',
            borderRadius: '16px',
            boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px',
            padding: '20px',
            minWidth: '300px',
            maxWidth: '400px',
            width: '90%',
            zIndex: 10001,
            boxSizing: 'border-box'
          }}>
            <button
              onClick={() => this.setState({ showEndConfirm: false })}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6B7280',
                fontSize: '18px',
                padding: '4px',
                lineHeight: 1
              }}
              title={t('common.close')}
            >
              ✕
            </button>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600' }}>
                {t('endModal.title')}
              </h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#6B7280' }}>
                {t('endModal.stats', {
                  time: this._formatTime(this.state.deriveElapsed),
                  dist: this._formatDistance(this.state.deriveDistance),
                  n: this.props.walkSession.recordingIds?.length || 0
                })}
              </p>
              <button
                onClick={this._toggleDerivePause}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 20px',
                  backgroundColor: this.state.derivePaused ? '#F59E42' : '#4e4e86',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                {this.state.derivePaused ? <Play size={16} /> : <Pause size={16} />}
                {this.state.derivePaused ? t('endModal.resume') : t('endModal.pause')}
              </button>
            </div>
            <input
              type="text"
              value={this.state.sessionTitle}
              onChange={(e) => this.setState({ sessionTitle: e.target.value })}
              placeholder={t('endModal.placeholder')}
              autoFocus
              maxLength={60}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid rgba(78,78,134,0.22)',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '14px'
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  if (this.props.onEndDerive) {
                    this.props.onEndDerive(this.state.sessionTitle.trim());
                  }
                  this.setState({ showEndConfirm: false, sessionTitle: '' });
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#9dc04cd4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                {t('endModal.save')}
              </button>
              <button
                onClick={() => this.setState({ showEndConfirm: false })}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'white',
                  color: 'rgb(1 9 2 / 84%)',
                  border: '1px solid rgba(78,78,134,0.22)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </>
    )
  }
}

export default SharedTopBar 