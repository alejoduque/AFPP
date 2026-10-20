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
import React, { useState, useEffect } from 'react';
import { X, Download, Trash2, MapPin, Clock, Mic, Eye, EyeOff, Play } from 'lucide-react';
import walkSessionService from '../services/walkSessionService.js';
import userAliasService from '../services/userAliasService.js';
import useDraggable from '../hooks/useDraggable.js';
import { t, formatDate as i18nFormatDate } from '../i18n';
import { FEATURES } from '../config/tier.js';
import UpgradePrompt from './UpgradePrompt.jsx';
import AfppShareButton from './AfppShareButton.jsx';

const SessionHistoryPanel = ({ onClose, onViewSession, onExportSession, visibleSessionIds, onToggleVisibility, onPlaySession, sessionColors = {} }) => {
  const [sessions, setSessions] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [playModePickerFor, setPlayModePickerFor] = useState(null); // sessionId showing mode picker
  const [showZipUpgrade, setShowZipUpgrade] = useState(false);
  const { position: dragPos, handlePointerDown: onDragStart } = useDraggable();

  useEffect(() => {
    setSessions(walkSessionService.getCompletedSessions().reverse());
  }, []);

  const formatDate = (ts) =>
    i18nFormatDate(ts, { day: 'numeric', month: 'short', year: 'numeric' });

  const formatDuration = (ms) => {
    if (!ms) return '--';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m ${s % 60}s`;
  };

  const formatDistance = (meters) => {
    if (!meters) return '--';
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  };

  const handleDelete = (sessionId) => {
    walkSessionService.deleteSession(sessionId);
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    setConfirmDeleteId(null);
  };

  const handleExport = async (session) => {
    if (!FEATURES.zipExport) {
      setShowZipUpgrade(true);
      return;
    }
    try {
      // Dynamic import to avoid circular deps
      const { default: DeriveSonoraExporter } = await import('../utils/deriveSonoraExporter.js');
      await DeriveSonoraExporter.exportDerive(session.sessionId);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const isVisible = (sessionId) => {
    if (!visibleSessionIds) return true;
    return visibleSessionIds.has(sessionId);
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '190px',
      left: '50%',
      transform: `translate(calc(-50% + ${dragPos.x}px), ${dragPos.y}px)`,
      backgroundColor: 'rgba(220,225,235,0.78)',
      borderRadius: '16px',
      boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px',
      width: '90%',
      maxWidth: '400px',
      maxHeight: '50vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10000,
      backdropFilter: 'blur(12px)'
    }}>
        {/* Header */}
        <div
          onPointerDown={onDragStart}
          style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          position: 'relative',
          cursor: 'grab',
          touchAction: 'none'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#000000c9' }}>
            {t('history.title')}
          </h3>
          <button
            onClick={onClose}
            style={{
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
        </div>

        {/* Session list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px' }}>
          {sessions.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9CA3AF', padding: '40px 0', fontSize: '14px' }}>
              {t('history.empty1')}
              <br />
              {t('history.empty2')}
            </p>
          ) : (
            sessions.map(session => {
              // Use passed per-session color from map, fall back to alias-based
              const color = sessionColors[session.sessionId] || userAliasService.aliasToHexColor(session.userAlias);
              const isDeleting = confirmDeleteId === session.sessionId;
              const visible = isVisible(session.sessionId);
              const showingModePicker = playModePickerFor === session.sessionId;

              return (
                <div
                  key={session.sessionId}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    borderRadius: '10px',
                    border: '1px solid rgba(78,78,134,0.15)',
                    borderLeft: `5px solid ${color}`,
                    backgroundColor: visible ? '#FAFAFA' : '#F3F4F6',
                    opacity: visible ? 1 : 0.6,
                    transition: 'opacity 0.2s, background-color 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#000000c9', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{
                          display: 'inline-block',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: color,
                          flexShrink: 0,
                          boxShadow: `0 0 0 2px ${color}44`,
                        }} />
                        {session.title || t('history.untitled')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>
                        {formatDate(session.startTime)} — {session.userAlias}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6B7280' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={12} />
                          {formatDuration(session.endTime - session.startTime)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <MapPin size={12} />
                          {formatDistance(session.summary?.totalDistance)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Mic size={12} />
                          {session.recordingIds?.length || 0}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                      {/* Eye toggle — visibility */}
                      <button
                        onClick={() => onToggleVisibility && onToggleVisibility(session.sessionId)}
                        title={visible ? t('history.hide') : t('history.show')}
                        style={{
                          background: visible ? color : 'none',
                          border: visible ? 'none' : `1px solid ${color}66`,
                          borderRadius: '6px',
                          padding: '6px',
                          cursor: 'pointer',
                          color: visible ? 'white' : color,
                        }}
                      >
                        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      {/* Play button */}
                      <button
                        onClick={() => setPlayModePickerFor(showingModePicker ? null : session.sessionId)}
                        title={t('history.play')}
                        style={{
                          background: showingModePicker ? '#4e4e86' : 'none',
                          border: showingModePicker ? 'none' : '1px solid rgba(78,78,134,0.22)',
                          borderRadius: '6px',
                          padding: '6px',
                          cursor: 'pointer',
                          color: showingModePicker ? 'white' : 'rgb(1 9 2 / 84%)'
                        }}
                      >
                        <Play size={14} />
                      </button>
                      <button
                        onClick={() => handleExport(session)}
                        title={FEATURES.zipExport ? t('history.exportZip') : t('tier.zipLockedTitle')}
                        style={{
                          background: 'none',
                          border: '1px solid rgba(78,78,134,0.22)',
                          borderRadius: '6px',
                          padding: '6px',
                          cursor: 'pointer',
                          color: 'rgb(1 9 2 / 84%)',
                          position: 'relative',
                          opacity: FEATURES.zipExport ? 1 : 0.55
                        }}
                      >
                        <Download size={14} />
                        {!FEATURES.zipExport && (
                          <span style={{ position: 'absolute', top: '-4px', right: '-4px', fontSize: '9px' }}>🔒</span>
                        )}
                      </button>
                      {isDeleting ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleDelete(session.sessionId)}
                            style={{
                              background: '#c24a6e',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              color: 'white',
                              fontSize: '11px'
                            }}
                          >
                            {t('common.yes')}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              background: 'none',
                              border: '1px solid rgba(78,78,134,0.22)',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              color: 'rgb(1 9 2 / 84%)',
                              fontSize: '11px'
                            }}
                          >
                            {t('common.no')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(session.sessionId)}
                          title={t('common.delete')}
                          style={{
                            background: 'none',
                            border: '1px solid rgba(78,78,134,0.22)',
                            borderRadius: '6px',
                            padding: '6px',
                            cursor: 'pointer',
                            color: '#c24a6e'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* AFPP: opt-in share to the global map */}
                  <div style={{ marginTop: '8px' }}>
                    <AfppShareButton sessionId={session.sessionId} />
                  </div>

                  {/* Inline playback mode picker */}
                  {showingModePicker && (
                    <div style={{
                      marginTop: '10px',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(78,78,134,0.15)',
                      display: 'flex',
                      gap: '6px',
                      flexWrap: 'wrap'
                    }}>
                      {[
                        { mode: 'nearby',        label: t('mode.nearby'),        title: t('history.modeTitle.nearby') },
                        { mode: 'chronological', label: t('mode.chronological'), title: t('history.modeTitle.chronological') },
                        { mode: 'jamm',          label: t('mode.jamm'),          title: t('history.modeTitle.jamm') },
                        { mode: 'reloj',         label: t('mode.reloj'),         title: t('history.modeTitle.reloj') },
                        { mode: 'alba',          label: t('mode.albaCombined'),  title: t('history.modeTitle.alba') },
                        { mode: 'estratos',      label: t('mode.estratos'),      title: t('history.modeTitle.estratos') },
                      ].map(({ mode, label, title }) => (
                        <button
                          key={mode}
                          onClick={() => {
                            setPlayModePickerFor(null);
                            onPlaySession && onPlaySession(session.sessionId, mode);
                          }}
                          title={title}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#4e4e86',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Play size={9} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Free-tier upgrade prompt for ZIP export */}
        {showZipUpgrade && (
          <UpgradePrompt variant="zip" onClose={() => setShowZipUpgrade(false)} />
        )}
    </div>
  );
};

export default SessionHistoryPanel;
