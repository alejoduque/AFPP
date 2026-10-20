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
import React, { useEffect, useRef, useState } from 'react';
import { Polyline, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { t, formatTime } from '../i18n';

// Create custom icons for breadcrumb markers
const createBreadcrumbIcon = (isMoving, audioLevel, size = 8) => {
  // Color based on movement and audio level
  let color = '#4e4e86'; // blue (default)
  
  if (isMoving) {
    if (audioLevel > 0.7) color = '#c24a6e'; // red (high audio, moving)
    else if (audioLevel > 0.4) color = '#F59E0B'; // amber (medium audio, moving)
    else color = '#9dc04cd4'; // green (low audio, moving)
  } else {
    if (audioLevel > 0.7) color = '#6a6aad'; // purple (high audio, stationary)
    else if (audioLevel > 0.4) color = '#EC4899'; // pink (medium audio, stationary)
    else color = '#6B7280'; // gray (low audio, stationary)
  }

  return L.divIcon({
    className: 'breadcrumb-marker',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ${isMoving ? 'animation: pulse 2s infinite;' : ''}
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

// Create direction arrow icon
const createDirectionIcon = (direction, size = 16) => {
  return L.divIcon({
    className: 'direction-arrow',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: #000000c9;
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${direction}deg);
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">
      <div style="
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-bottom: 8px solid white;
        margin-top: -2px;
      "></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const BreadcrumbVisualization = ({ 
  breadcrumbs = [], 
  sessionData = null,
  visualizationMode = 'line', // 'line', 'heatmap', 'markers', 'animated'
  showMarkers = true,
  showDirectionArrows = false,
  lineColor = 'auto', // 'auto', 'time', 'audio', 'speed'
  lineWidth = 3,
  opacity = 0.8,
  onMarkerClick = null
}) => {
  const [animatedBreadcrumbs, setAnimatedBreadcrumbs] = useState([]);
  const animationRef = useRef(null);
  const animationSpeed = 100; // ms per breadcrumb

  // Generate line color based on mode
  const getLineColor = (breadcrumbs, mode) => {
    switch (mode) {
      case 'time':
        return (index) => {
          const elapsed = breadcrumbs[index].timestamp - breadcrumbs[0].timestamp;
          const total = breadcrumbs[breadcrumbs.length - 1].timestamp - breadcrumbs[0].timestamp;
          const ratio = elapsed / total;
          return `hsl(${ratio * 360}, 70%, 50%)`;
        };
      
      case 'audio':
        return (index) => {
          const audioLevel = breadcrumbs[index].audioLevel || 0;
          return `hsl(${audioLevel * 120}, 70%, ${50 + audioLevel * 20}%)`;
        };
      
      case 'speed':
        return (index) => {
          const speed = breadcrumbs[index].movementSpeed || 0;
          const maxSpeed = Math.max(...breadcrumbs.map(b => b.movementSpeed || 0));
          const ratio = maxSpeed > 0 ? speed / maxSpeed : 0;
          return `hsl(${ratio * 120}, 70%, 50%)`;
        };
      
      case 'auto':
      default:
        return (index) => {
          const isMoving = breadcrumbs[index].isMoving;
          const audioLevel = breadcrumbs[index].audioLevel || 0;
          
          if (isMoving) {
            if (audioLevel > 0.7) return '#c24a6e'; // red
            if (audioLevel > 0.4) return '#F59E0B'; // amber
            return '#9dc04cd4'; // green
          } else {
            if (audioLevel > 0.7) return '#6a6aad'; // purple
            if (audioLevel > 0.4) return '#EC4899'; // pink
            return '#6B7280'; // gray
          }
        };
    }
  };

  // Generate line width based on audio level
  const getLineWidth = (breadcrumbs, index) => {
    const audioLevel = breadcrumbs[index].audioLevel || 0;
    return Math.max(1, lineWidth * (0.5 + audioLevel * 0.5));
  };

  // Animated playback
  useEffect(() => {
    if (visualizationMode === 'animated' && breadcrumbs.length > 0) {
      let currentIndex = 0;
      
      const animate = () => {
        if (currentIndex < breadcrumbs.length) {
          setAnimatedBreadcrumbs(breadcrumbs.slice(0, currentIndex + 1));
          currentIndex++;
          animationRef.current = setTimeout(animate, animationSpeed);
        }
      };
      
      animate();
      
      return () => {
        if (animationRef.current) {
          clearTimeout(animationRef.current);
        }
      };
    } else {
      setAnimatedBreadcrumbs(breadcrumbs);
    }
  }, [breadcrumbs, visualizationMode]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  if (!breadcrumbs || breadcrumbs.length === 0) {
    return null;
  }

  const displayBreadcrumbs = visualizationMode === 'animated' ? animatedBreadcrumbs : breadcrumbs;
  const colorFunction = getLineColor(displayBreadcrumbs, lineColor);

  // Generate line segments with different colors/widths
  const generateLineSegments = () => {
    if (displayBreadcrumbs.length < 2) return [];

    const segments = [];
    for (let i = 0; i < displayBreadcrumbs.length - 1; i++) {
      const start = displayBreadcrumbs[i];
      const end = displayBreadcrumbs[i + 1];
      
      segments.push({
        positions: [[start.lat, start.lng], [end.lat, end.lng]],
        color: colorFunction(i),
        weight: getLineWidth(displayBreadcrumbs, i),
        opacity: opacity,
        index: i
      });
    }
    
    return segments;
  };

  // Generate heat map data
  const generateHeatMapData = () => {
    return displayBreadcrumbs.map(crumb => ({
      lat: crumb.lat,
      lng: crumb.lng,
      intensity: crumb.audioLevel || 0
    }));
  };

  // Render breadcrumb markers
  const renderMarkers = () => {
    if (!showMarkers || visualizationMode === 'heatmap') return null;

    return displayBreadcrumbs.map((crumb, index) => {
      const icon = createBreadcrumbIcon(
        crumb.isMoving, 
        crumb.audioLevel || 0,
        crumb.audioLevel > 0.7 ? 12 : 8
      );

      return (
        <Marker
          key={`breadcrumb-${index}`}
          position={[crumb.lat, crumb.lng]}
          icon={icon}
          eventHandlers={{
            click: () => onMarkerClick && onMarkerClick(crumb, index)
          }}
        >
          <Popup>
            <div style={{ minWidth: '200px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>
                {t('crumb.title', { n: index + 1 })}
              </h3>
              <p style={{ margin: '4px 0', fontSize: '12px' }}>
                <strong>{t('crumb.time')}:</strong> {formatTime(crumb.timestamp)}
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px' }}>
                <strong>{t('crumb.audioLevel')}:</strong> {Math.round((crumb.audioLevel || 0) * 100)}%
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px' }}>
                <strong>{t('crumb.moving')}:</strong> {crumb.isMoving ? t('crumb.yes') : t('crumb.no')}
              </p>
              {crumb.movementSpeed > 0 && (
                <p style={{ margin: '4px 0', fontSize: '12px' }}>
                  <strong>{t('crumb.speed')}:</strong> {Math.round(crumb.movementSpeed * 100) / 100} m/s
                </p>
              )}
              {crumb.direction !== null && (
                <p style={{ margin: '4px 0', fontSize: '12px' }}>
                  <strong>{t('crumb.direction')}:</strong> {Math.round(crumb.direction)}°
                </p>
              )}
              {crumb.accuracy && (
                <p style={{ margin: '4px 0', fontSize: '12px' }}>
                  <strong>{t('crumb.accuracy')}:</strong> ±{Math.round(crumb.accuracy)}m
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      );
    });
  };

  // Render direction arrows
  const renderDirectionArrows = () => {
    if (!showDirectionArrows || displayBreadcrumbs.length < 2) return null;

    return displayBreadcrumbs.map((crumb, index) => {
      if (!crumb.direction || !crumb.isMoving) return null;

      const icon = createDirectionIcon(crumb.direction);

      return (
        <Marker
          key={`direction-${index}`}
          position={[crumb.lat, crumb.lng]}
          icon={icon}
        />
      );
    });
  };

  // Render line visualization
  const renderLines = () => {
    if (visualizationMode === 'markers' || visualizationMode === 'heatmap') return null;

    const segments = generateLineSegments();
    
    return segments.map((segment, index) => (
      <Polyline
        key={`line-${index}`}
        positions={segment.positions}
        color={segment.color}
        weight={segment.weight}
        opacity={segment.opacity}
        smoothFactor={1}
      />
    ));
  };

  // Render heat map circles
  const renderHeatMap = () => {
    if (visualizationMode !== 'heatmap') return null;

    const heatMapData = generateHeatMapData();
    
    return heatMapData.map((point, index) => {
      const radius = Math.max(2, 8 * point.intensity);
      const color = `hsl(${point.intensity * 120}, 70%, 50%)`;
      
      return (
        <Circle
          key={`heat-${index}`}
          center={[point.lat, point.lng]}
          radius={radius}
          pathOptions={{
            color: color,
            fillColor: color,
            fillOpacity: 0.3,
            weight: 1
          }}
        />
      );
    });
  };

  return (
    <>
      {renderLines()}
      {renderHeatMap()}
      {renderMarkers()}
      {renderDirectionArrows()}
    </>
  );
};

export default BreadcrumbVisualization; 