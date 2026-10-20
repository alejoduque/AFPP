// Bioacoustic Standard Format Exporters
// Exports recordings to Raven selection tables and Audacity labels
/**
 * @fileoverview This file is part of the BioMapp project, developed for Reserva MANAKAI.
 *
 * Copyright (c) 2026 Alejandro Duque Jaramillo. All rights reserved.
 *
 * This code is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) License.
 * For the full license text, please visit: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
 */

/**
 * Export recordings as Raven Pro selection table (.txt)
 * Format: Tab-separated values with header
 * Columns: Selection, View, Channel, Begin Time (s), End Time (s), Low Freq (Hz), High Freq (Hz),
 *          Begin File, File Offset (s), Species, Habitat, Stratum, Distance, GPS Lat, GPS Lng
 */
export const exportToRavenSelectionTable = (recordings) => {
  if (!recordings || recordings.length === 0) {
    throw new Error('No recordings to export');
  }

  // Header row
  const headers = [
    'Selection',
    'View',
    'Channel',
    'Begin Time (s)',
    'End Time (s)',
    'Low Freq (Hz)',
    'High Freq (Hz)',
    'Begin File',
    'File Offset (s)',
    'Species',
    'Habitat',
    'Stratum',
    'Distance',
    'GPS_Lat',
    'GPS_Lng',
    'Timestamp',
    'Quality'
  ].join('\t');

  // Data rows
  const rows = [];
  let selectionNum = 1;

  recordings.forEach((rec) => {
    const filename = rec.filename || `${rec.uniqueId}.mp4`;
    const species = Array.isArray(rec.speciesTags) ? rec.speciesTags.join(';') : (rec.speciesTags || '');
    const stratum = rec.heightPosition || '';
    const habitat = rec.habitat || '';
    const distance = rec.distanceEstimate || '';
    const lat = rec.location?.lat?.toFixed(6) || '';
    const lng = rec.location?.lng?.toFixed(6) || '';
    const timestamp = rec.timestamp ? new Date(rec.timestamp).toISOString() : '';
    const quality = rec.quality || '';
    const duration = rec.duration || 0;

    rows.push([
      selectionNum++,               // Selection number
      'Spectrogram 1',              // View
      1,                            // Channel (mono)
      0,                            // Begin Time (s) - start of file
      duration.toFixed(3),          // End Time (s) - duration
      0,                            // Low Freq (Hz) - full spectrum
      22050,                        // High Freq (Hz) - Nyquist for 44.1kHz sampling
      filename,                     // Begin File
      0,                            // File Offset (s)
      species,                      // Species tags
      habitat,                      // Habitat
      stratum,                      // Vertical stratum
      distance,                     // Distance estimate
      lat,                          // GPS Latitude
      lng,                          // GPS Longitude
      timestamp,                    // ISO timestamp
      quality                       // Recording quality
    ].join('\t'));

    // Include timeline markers as additional selection rows
    if (rec.markers && Array.isArray(rec.markers)) {
      rec.markers.forEach((m) => {
        const markerTimeSec = m.offsetMs / 1000;
        const mLat = m.lat?.toFixed(6) || lat;
        const mLng = m.lng?.toFixed(6) || lng;
        rows.push([
          selectionNum++,
          'Spectrogram 1',
          1,
          markerTimeSec.toFixed(3),
          markerTimeSec.toFixed(3),
          0,
          22050,
          filename,
          markerTimeSec.toFixed(3),
          `MARKER:${m.label}`,
          habitat,
          stratum,
          distance,
          mLat,
          mLng,
          timestamp,
          ''
        ].join('\t'));
      });
    }
  });

  const content = [headers, ...rows].join('\n');
  return content;
};

/**
 * Export recordings as Audacity labels (.txt)
 * Format: Start_time\tEnd_time\tLabel
 * Each recording becomes a labeled region in Audacity
 */
export const exportToAudacityLabels = (recordings) => {
  if (!recordings || recordings.length === 0) {
    throw new Error('No recordings to export');
  }

  // Sort by timestamp for chronological order
  const sorted = [...recordings].sort((a, b) => {
    const timeA = a.timestamp || 0;
    const timeB = b.timestamp || 0;
    return timeA - timeB;
  });

  let cumulativeTime = 0;
  const labels = [];

  sorted.forEach((rec) => {
    const duration = rec.duration || 0;
    const startTime = cumulativeTime;
    const endTime = cumulativeTime + duration;

    // Build label with metadata
    const species = Array.isArray(rec.speciesTags) ? rec.speciesTags.join(', ') : (rec.speciesTags || 'Unknown');
    const stratum = rec.heightPosition ? ` [${rec.heightPosition}]` : '';
    const habitat = rec.habitat ? ` (${rec.habitat})` : '';
    const timestamp = rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString() : '';

    const label = `${species}${stratum}${habitat} - ${timestamp}`;
    labels.push(`${startTime.toFixed(6)}\t${endTime.toFixed(6)}\t${label}`);

    // Include timeline markers as point labels within the recording
    if (rec.markers && Array.isArray(rec.markers)) {
      rec.markers.forEach((m) => {
        const markerTime = startTime + (m.offsetMs / 1000);
        const gps = (m.lat && m.lng) ? ` [${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}]` : '';
        labels.push(`${markerTime.toFixed(6)}\t${markerTime.toFixed(6)}\t★ ${m.label}${gps}`);
      });
    }

    cumulativeTime = endTime;
  });

  return labels.join('\n');
};

/**
 * Export recordings as GPX waypoints (for QGIS/GIS software)
 * Each recording becomes a waypoint with acoustic metadata
 */
export const exportToGPXWaypoints = (recordings) => {
  if (!recordings || recordings.length === 0) {
    throw new Error('No recordings to export');
  }

  const waypoints = recordings
    .filter(rec => rec.location && rec.location.lat && rec.location.lng)
    .map((rec, index) => {
      const lat = rec.location.lat;
      const lng = rec.location.lng;
      const ele = rec.altitude || 0;
      const name = rec.filename || `REC-${index + 1}`;
      const species = Array.isArray(rec.speciesTags) ? rec.speciesTags.join(', ') : (rec.speciesTags || 'Unknown');
      const time = rec.timestamp ? new Date(rec.timestamp).toISOString() : new Date().toISOString();
      const duration = rec.duration || 0;
      const stratum = rec.heightPosition || 'unknown';
      const habitat = rec.habitat || '';

      const desc = `Species: ${species} | Duration: ${duration.toFixed(1)}s | Stratum: ${stratum}${habitat ? ' | Habitat: ' + habitat : ''}`;

      return `  <wpt lat="${lat}" lon="${lng}">
    <ele>${ele}</ele>
    <time>${time}</time>
    <name>${name}</name>
    <desc>${desc}</desc>
    <sym>Audio</sym>
    <type>bioacoustic</type>
    <extensions>
      <duration>${duration}</duration>
      <stratum>${stratum}</stratum>
      <species>${species}</species>
    </extensions>
  </wpt>`;
    }).join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BioMapp" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>BioMapp Acoustic Waypoints</name>
    <desc>Georeferenced bioacoustic recordings</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypoints}
</gpx>`;

  return gpx;
};

/**
 * Download helper function
 */
export const downloadTextFile = (content, filename, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Export all functions
export default {
  exportToRavenSelectionTable,
  exportToAudacityLabels,
  exportToGPXWaypoints,
  downloadTextFile
};
