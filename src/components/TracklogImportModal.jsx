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
import React, { useState, useRef } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle, FolderOpen } from 'lucide-react';
import TracklogImporter from '../utils/tracklogImporter.js';
import useDraggable from '../hooks/useDraggable.js';
import localStorageService from '../services/localStorageService.js';
import {
  exportToRavenSelectionTable,
  exportToAudacityLabels,
  exportToGPXWaypoints,
  downloadTextFile
} from '../utils/bioacousticExporters.js';
import { t, formatDate } from '../i18n';

const TracklogImportModal = ({ isVisible, onClose, onImportComplete, allSessions, allRecordings }) => {
  const { position: dragPos, handlePointerDown: onDragStart } = useDraggable();
  const [activeTab, setActiveTab] = useState('import'); // 'import' | 'export'

  // Import state
  const [selectedFile, setSelectedFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);

  const fileInputRef = useRef(null);

  // --- Import logic ---

  const handleFileSelect = async (file) => {
    setSelectedFile(file);
    setValidationResult(null);
    setImportResult(null);

    try {
      const validation = await TracklogImporter.validateTracklogFile(file);
      setValidationResult(validation);
    } catch (error) {
      setValidationResult({ valid: false, error: error.message });
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !validationResult?.valid) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      let result;
      if (validationResult.type === 'derive_sonora') {
        const { default: DeriveSonoraImporter } = await import('../utils/deriveSonoraImporter.js');
        result = await DeriveSonoraImporter.importDerive(selectedFile);
        // Normalize result shape for the UI
        result = {
          ...result,
          importedBreadcrumbs: result.breadcrumbsImported,
          importedRecordings: result.recordingsImported,
        };
      } else if (validationResult.type === 'audio_export') {
        result = await TracklogImporter.importAudioExportZip(selectedFile);
      } else if (validationResult.type === 'zip') {
        result = await TracklogImporter.importTracklogFromZip(selectedFile, {});
      } else if (validationResult.type === 'geojson') {
        result = await TracklogImporter.importTracklogFromGeoJSON(selectedFile, {});
      }

      setImportResult({ success: true, data: result });
      if (onImportComplete) onImportComplete(result);
    } catch (error) {
      setImportResult({ success: false, error: error.message });
    } finally {
      setIsImporting(false);
    }
  };

  // --- Export logic ---

  const handleExportAll = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const { default: RecordingExporter } = await import('../utils/recordingExporter.js');
      await RecordingExporter.exportAllRecordings();
      setExportResult({ success: true, type: 'recordings' });
    } catch (error) {
      setExportResult({ success: false, error: error.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDerive = async (sessionId) => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const { default: DeriveSonoraExporter } = await import('../utils/deriveSonoraExporter.js');
      await DeriveSonoraExporter.exportDerive(sessionId);
      setExportResult({ success: true, type: 'derive' });
    } catch (error) {
      setExportResult({ success: false, error: error.message });
    } finally {
      setIsExporting(false);
    }
  };

  // --- Bioacoustic Standard Format Exports ---

  const handleExportRaven = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const recordings = await localStorageService.getAllRecordings();
      if (!recordings || recordings.length === 0) {
        throw new Error(t('import.noRecordings'));
      }

      const content = exportToRavenSelectionTable(recordings);
      const timestamp = new Date().toISOString().split('T')[0];
      downloadTextFile(content, `biomap_raven_${timestamp}.txt`, 'text/plain');

      setExportResult({ success: true, type: 'raven', count: recordings.length });
    } catch (error) {
      setExportResult({ success: false, error: error.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAudacity = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const recordings = await localStorageService.getAllRecordings();
      if (!recordings || recordings.length === 0) {
        throw new Error(t('import.noRecordings'));
      }

      const content = exportToAudacityLabels(recordings);
      const timestamp = new Date().toISOString().split('T')[0];
      downloadTextFile(content, `biomap_audacity_${timestamp}.txt`, 'text/plain');

      setExportResult({ success: true, type: 'audacity', count: recordings.length });
    } catch (error) {
      setExportResult({ success: false, error: error.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportGPX = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const recordings = await localStorageService.getAllRecordings();
      if (!recordings || recordings.length === 0) {
        throw new Error(t('import.noRecordings'));
      }

      const content = exportToGPXWaypoints(recordings);
      const timestamp = new Date().toISOString().split('T')[0];
      downloadTextFile(content, `biomap_waypoints_${timestamp}.gpx`, 'application/gpx+xml');

      setExportResult({ success: true, type: 'gpx', count: recordings.length });
    } catch (error) {
      setExportResult({ success: false, error: error.message });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isVisible) return null;

  const tabStyle = (tab) => ({
    flex: 1,
    padding: '8px 0',
    border: 'none',
    background: activeTab === tab ? 'rgba(78,78,134,0.15)' : 'transparent',
    color: activeTab === tab ? '#4e4e86' : '#6B7280',
    fontWeight: activeTab === tab ? '600' : '400',
    fontSize: '13px',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{
      position: 'fixed',
      bottom: '190px',
      left: '50%',
      transform: `translate(calc(-50% + ${dragPos.x}px), ${dragPos.y}px)`,
      backgroundColor: 'rgba(220,225,235,0.78)',
      borderRadius: '16px',
      boxShadow: 'rgba(78,78,134,0.25) 0px 10px 30px',
      width: '88vw',
      maxWidth: '360px',
      maxHeight: '55vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10000,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      boxSizing: 'border-box',
    }}>
      {/* Drag Handle Header */}
      <div
        onPointerDown={onDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#000000c9' }}>
          {t('import.title')}
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
            lineHeight: 1,
          }}
          title={t('common.close')}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '6px 14px 4px',
      }}>
        <button style={tabStyle('import')} onClick={() => setActiveTab('import')}>
          <Upload size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
          {t('import.tabImport')}
        </button>
        <button style={tabStyle('export')} onClick={() => setActiveTab('export')}>
          <Download size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
          {t('import.tabExport')}
        </button>
      </div>

      {/* Scrollable Content */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '10px 14px' }}>

        {/* ===== IMPORT TAB ===== */}
        {activeTab === 'import' && (
          <>
            {/* File picker — label wraps hidden input for reliable Android WebView support */}
            <label
              htmlFor="import-file-input"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px dashed rgba(78,78,134,0.22)',
                borderRadius: '10px',
                backgroundColor: 'rgba(249,250,251,0.5)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                boxSizing: 'border-box',
              }}
            >
              <FolderOpen size={22} color="#6B7280" />
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#000000c9' }}>
                {selectedFile ? (selectedFile.name || t('import.fileSelected')) : t('import.selectFile')}
              </span>
              <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                {t('import.exportedDrift')}
              </span>
              <input
                id="import-file-input"
                ref={fileInputRef}
                type="file"
                accept="*/*"
                onChange={handleFileInput}
                style={{
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  overflow: 'hidden',
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              />
            </label>

            {/* Validation */}
            {validationResult && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: validationResult.valid ? 'rgba(240,253,244,0.8)' : 'rgba(254,242,242,0.8)',
                border: `1px solid ${validationResult.valid ? '#BBF7D0' : '#FECACA'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {validationResult.valid
                    ? <CheckCircle size={16} color="#9dc04cd4" />
                    : <AlertCircle size={16} color="#c24a6e" />
                  }
                  <span style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: validationResult.valid ? '#059669' : '#c24a6e',
                  }}>
                    {validationResult.valid ? t('import.validFile') : t('import.validationError')}
                  </span>
                </div>
                {validationResult.valid ? (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#059669' }}>
                    <div>{t('import.type')}: {validationResult.type === 'derive_sonora' ? t('import.typeDrift') : validationResult.type === 'audio_export' ? t('import.typeRecordings') : validationResult.type?.toUpperCase()}</div>
                    {validationResult.title && <div>{t('import.name')}: {validationResult.title}</div>}
                    {validationResult.userAlias && <div>{t('import.author')}: {validationResult.userAlias}</div>}
                    <div>{t('import.breadcrumbs')}: {validationResult.breadcrumbCount}{validationResult.sessionCount > 0 ? ` (${validationResult.sessionCount} ${validationResult.sessionCount > 1 ? t('import.drifts') : t('import.drift')})` : ''}</div>
                    {validationResult.recordingCount > 0 && <div>{t('import.recordings')}: {validationResult.recordingCount}</div>}
                  </div>
                ) : (
                  <p style={{ marginTop: '6px', fontSize: '11px', color: '#DC2626', margin: '6px 0 0' }}>
                    {validationResult.error}
                  </p>
                )}
              </div>
            )}

            {/* Import progress */}
            {isImporting && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '14px', height: '14px',
                  border: '2px solid rgba(78,78,134,0.15)',
                  borderTop: '2px solid #4e4e86',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{ fontSize: '12px', color: 'rgb(1 9 2 / 84%)' }}>{t('import.importing')}</span>
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: importResult.success ? 'rgba(240,253,244,0.8)' : 'rgba(254,242,242,0.8)',
                border: `1px solid ${importResult.success ? '#BBF7D0' : '#FECACA'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {importResult.success
                    ? <CheckCircle size={16} color="#059669" />
                    : <AlertCircle size={16} color="#c24a6e" />
                  }
                  <span style={{
                    fontSize: '13px', fontWeight: '600',
                    color: importResult.success ? '#059669' : '#c24a6e',
                  }}>
                    {importResult.success
                      ? ((importResult.data?.errors?.length || importResult.data?._errors?.length)
                          ? t('import.partial')
                          : t('import.success'))
                      : t('import.errorTitle')}
                  </span>
                </div>
                {importResult.success && importResult.data && (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#059669' }}>
                    {importResult.data.selfImport ? (
                      <>
                        <div>{t('import.restored', { n: importResult.data.restoredCount || 0 })}</div>
                        <div style={{ color: '#6B7280' }}>{t('import.selfNote')}</div>
                      </>
                    ) : (
                      <>
                        <div>{t('import.breadcrumbs')}: {importResult.data.importedBreadcrumbs}</div>
                        <div>{t('import.recordings')}: {importResult.data.importedRecordings}</div>
                      </>
                    )}
                    {(() => {
                      const errs = importResult.data.errors || importResult.data._errors || [];
                      if (errs.length === 0) return null;
                      return (
                        <div style={{ marginTop: '6px', color: '#B45309' }}>
                          <div>{t('import.failedCount', { n: errs.length })}</div>
                          {errs.slice(0, 5).map((err, i) => (
                            <div key={i} style={{ opacity: 0.85 }}>• {err}</div>
                          ))}
                          {errs.length > 5 && <div>…</div>}
                        </div>
                      );
                    })()}
                  </div>
                )}
                {!importResult.success && (
                  <p style={{ marginTop: '6px', fontSize: '11px', color: '#DC2626', margin: '6px 0 0' }}>
                    {importResult.error}
                  </p>
                )}
              </div>
            )}

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={!validationResult?.valid || isImporting}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: !validationResult?.valid || isImporting ? '#9CA3AF' : '#4e4e86',
                color: 'white',
                fontSize: '13px',
                fontWeight: '500',
                cursor: !validationResult?.valid || isImporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Upload size={14} />
              {isImporting ? t('import.importing') : t('import.importDrift')}
            </button>
          </>
        )}

        {/* ===== EXPORT TAB ===== */}
        {activeTab === 'export' && (
          <>
            {/* Export all recordings */}
            <button
              onClick={handleExportAll}
              disabled={isExporting}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid rgba(78,78,134,0.18)',
                borderRadius: '8px',
                backgroundColor: 'rgba(249,250,251,0.6)',
                cursor: isExporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                opacity: isExporting ? 0.6 : 1,
              }}
            >
              <Download size={16} color="#4e4e86" />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#000000c9' }}>
                  {t('export.all')}
                </div>
                <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                  {t('export.allDesc')}
                </div>
              </div>
            </button>

            {/* Bioacoustic Standard Formats */}
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '8px' }}>
                {t('export.bioFormats')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button
                  onClick={handleExportRaven}
                  disabled={isExporting}
                  style={{
                    padding: '8px',
                    border: '1px solid rgba(78,78,134,0.12)',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(249,250,251,0.4)',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: isExporting ? 0.6 : 1,
                  }}
                  title={t('export.ravenTitle')}
                >
                  <FileText size={14} color="#4e4e86" />
                  <div style={{ fontSize: '10px', fontWeight: '600', color: '#000000c9' }}>Raven</div>
                  <div style={{ fontSize: '9px', color: '#9CA3AF' }}>.txt</div>
                </button>
                <button
                  onClick={handleExportAudacity}
                  disabled={isExporting}
                  style={{
                    padding: '8px',
                    border: '1px solid rgba(78,78,134,0.12)',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(249,250,251,0.4)',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: isExporting ? 0.6 : 1,
                  }}
                  title={t('export.audacityTitle')}
                >
                  <FileText size={14} color="#4e4e86" />
                  <div style={{ fontSize: '10px', fontWeight: '600', color: '#000000c9' }}>Audacity</div>
                  <div style={{ fontSize: '9px', color: '#9CA3AF' }}>labels</div>
                </button>
                <button
                  onClick={handleExportGPX}
                  disabled={isExporting}
                  style={{
                    padding: '8px',
                    border: '1px solid rgba(78,78,134,0.12)',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(249,250,251,0.4)',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: isExporting ? 0.6 : 1,
                  }}
                  title={t('export.gpxTitle')}
                >
                  <FileText size={14} color="#4e4e86" />
                  <div style={{ fontSize: '10px', fontWeight: '600', color: '#000000c9' }}>GPX</div>
                  <div style={{ fontSize: '9px', color: '#9CA3AF' }}>QGIS</div>
                </button>
              </div>
            </div>

            {/* Export individual sessions */}
            {allSessions && allSessions.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '8px' }}>
                  {t('export.individual')}
                </div>
                {allSessions.map((session, idx) => (
                  <button
                    key={session.sessionId || idx}
                    onClick={() => handleExportDerive(session.sessionId)}
                    disabled={isExporting}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: idx % 2 === 0 ? 'rgba(78,78,134,0.06)' : 'transparent',
                      cursor: isExporting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '2px',
                      opacity: isExporting ? 0.6 : 1,
                    }}
                  >
                    <FileText size={14} color="#4e4e86" />
                    <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '12px', fontWeight: '500', color: '#000000c9',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {session.title || session.userAlias || t('export.driftFallback')}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9CA3AF' }}>
                        {session.startTime ? formatDate(session.startTime) : ''}
                        {session.summary?.totalRecordings ? ' ' + t('export.nRecordings', { n: session.summary.totalRecordings }) : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Export progress / result */}
            {isExporting && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '14px', height: '14px',
                  border: '2px solid rgba(78,78,134,0.15)',
                  borderTop: '2px solid #4e4e86',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{ fontSize: '12px', color: 'rgb(1 9 2 / 84%)' }}>{t('export.exporting')}</span>
              </div>
            )}

            {exportResult && (
              <div style={{
                marginTop: '12px',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: exportResult.success ? 'rgba(240,253,244,0.8)' : 'rgba(254,242,242,0.8)',
                border: `1px solid ${exportResult.success ? '#BBF7D0' : '#FECACA'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {exportResult.success
                    ? <CheckCircle size={16} color="#059669" />
                    : <AlertCircle size={16} color="#c24a6e" />
                  }
                  <span style={{
                    fontSize: '12px', fontWeight: '600',
                    color: exportResult.success ? '#059669' : '#c24a6e',
                  }}>
                    {exportResult.success ? t('export.done') : exportResult.error}
                  </span>
                </div>
                {exportResult.success && exportResult.count && (
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#059669' }}>
                    {t('export.countExported', { n: exportResult.count })}
                    {exportResult.type === 'raven' && t('export.asRaven')}
                    {exportResult.type === 'audacity' && t('export.asAudacity')}
                    {exportResult.type === 'gpx' && t('export.asGpx')}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TracklogImportModal;
