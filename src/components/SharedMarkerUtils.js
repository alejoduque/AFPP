// SharedMarkerUtils.js
// Utility for creating duration-based marker icons (used in both collector and SoundWalk interfaces)
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
import L from 'leaflet';

export function createDurationCircleIcon(duration, zoom = 19) {
  const minDuration = 5, maxDuration = 120;
  const minRadius = 25, maxRadius = 100;
  const normalizedDuration = Math.max(minDuration, Math.min(maxDuration, duration || 10));
  const baseRadius = minRadius + ((normalizedDuration - minDuration) / (maxDuration - minDuration)) * (maxRadius - minRadius);

  // Scale radius based on zoom: soft scaling to ensure they are visible when zoomed out
  const zoomScale = Math.max(0.5, 1 - (19 - zoom) * 0.1);
  const radius = Math.max(25, Math.round(baseRadius * zoomScale));

  let color = '#4e4e86'; // blue
  if (normalizedDuration < 30) color = '#4e4e86';
  else if (normalizedDuration < 60) color = '#9dc04cd4';
  else color = '#c24a6e';

  const labelSize = Math.max(10, Math.round(12 * zoomScale));

  return L.divIcon({
    className: 'duration-circle-marker',
    html: `<div style="
      width: ${radius * 2}px;
      height: ${radius * 2}px;
      background-color: ${color}33;
      border: ${Math.max(2, Math.round(4 * zoomScale))}px solid ${color};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: width 0.3s ease, height 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      position: relative;
    ">
      <img src='/ultrared.png' style="
        width: 60%;
        height: 60%;
        object-fit: contain;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: none;
        pointer-events: none;
        opacity: 0.85;
      " alt='mic' />
      <div style="
        position: absolute;
        bottom: -18px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 1px 4px;
        border-radius: 4px;
        font-size: ${labelSize}px;
        white-space: nowrap;
      ">${Math.round(duration || 0)}s</div>
    </div>`,
    iconSize: [radius * 2, radius * 2 + 18],
    iconAnchor: [radius, radius],
  });
}

export function createPlayingNearbyIcon(duration, zoom = 19) {
  const minDuration = 5, maxDuration = 120;
  const minRadius = 25, maxRadius = 100;
  const normalizedDuration = Math.max(minDuration, Math.min(maxDuration, duration || 10));
  const baseRadius = minRadius + ((normalizedDuration - minDuration) / (maxDuration - minDuration)) * (maxRadius - minRadius);

  // Scale radius based on zoom
  const zoomScale = Math.max(0.5, 1 - (19 - zoom) * 0.1);
  const radius = Math.max(25, Math.round(baseRadius * zoomScale));

  // Playing color: green/lime for active nearby playback
  const color = '#9dc04cd4';

  const labelSize = Math.max(10, Math.round(12 * zoomScale));

  return L.divIcon({
    className: 'duration-circle-marker playing-nearby',
    html: `<div style="
      width: ${radius * 2}px;
      height: ${radius * 2}px;
      background-color: ${color}55;
      border: ${Math.max(2, Math.round(4 * zoomScale))}px solid ${color};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(157, 192, 76, 0.8);
      position: relative;
      animation: nearby-pulse 1.5s ease-in-out infinite;
    ">
      <img src='/ultrared.png' style="
        width: 60%;
        height: 60%;
        object-fit: contain;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: none;
        pointer-events: none;
        opacity: 0.95;
        filter: brightness(1.2);
      " alt='mic' />
      <div style="
        position: absolute;
        bottom: -18px;
        left: 50%;
        transform: translateX(-50%);
        background: ${color};
        color: white;
        padding: 1px 4px;
        border-radius: 4px;
        font-size: ${labelSize}px;
        white-space: nowrap;
        font-weight: 600;
      ">${Math.round(duration || 0)}s</div>
    </div>`,
    iconSize: [radius * 2, radius * 2 + 18],
    iconAnchor: [radius, radius],
  });
}

export function createUserLocationIcon() {
  return L.divIcon({
    className: 'user-location-marker',
    html: `<div style="
      width: 48px;
      height: 48px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: user-loc-blink 1.5s ease-in-out infinite;
    ">
      <div style="
        position: absolute;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(78, 78, 134, 0.4);
        box-shadow: 0 0 15px rgba(78, 78, 134, 0.5);
        animation: user-loc-pulse 2s ease-in-out infinite;
      "></div>
      <img src='/ultrared.png' style="
        width: 32px;
        height: 32px;
        object-fit: contain;
        position: relative;
        z-index: 1;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
      " alt='location' />
    </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}