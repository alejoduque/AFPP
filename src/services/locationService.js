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
import { Geolocation } from '@capacitor/geolocation';
import permissionManager from './permissionManager.js';

class LocationService {
  constructor() {
    this.currentPosition = null;
    this.currentHeading = null;
    this.watchId = null;
    this.onLocationUpdate = null;
    this.onHeadingUpdate = null;
    this.onLocationError = null;
    this.headingHandler = null;
  }

  // Detect if running inside a native Capacitor app
  isNative() {
    return !!(window.Capacitor?.isNativePlatform?.());
  }

  // Request location permission and get current position
  async requestLocation() {
    if (!this.isNative()) {
      return this._webGetCurrentPosition();
    }
    try {
      const currentPermission = await this.checkLocationPermission();
      console.log('Location service: Current permission state:', currentPermission);

      if (currentPermission !== 'granted') {
        const permissionResult = await permissionManager.requestLocationPermission();
        console.log('Location service: Permission result:', permissionResult);
        if (!permissionResult.granted) {
          throw new Error(permissionResult.reason || 'Location permission not granted');
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      });

      this.currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        timestamp: position.timestamp
      };
      return this.currentPosition;
    } catch (error) {
      console.error('Location service error:', error);
      throw new Error(`Location error: ${error.message}`);
    }
  }

  // Web fallback: use navigator.geolocation directly (works in Safari/Chrome)
  _webGetCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            timestamp: position.timestamp
          };
          resolve(this.currentPosition);
        },
        (error) => {
          const messages = {
            1: 'Location permission denied. Please allow location access in your browser settings.',
            2: 'Location unavailable. Check your GPS or network connection.',
            3: 'Location request timed out. Try again.'
          };
          reject(new Error(messages[error.code] || error.message));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  // Check location permission state
  async checkLocationPermission() {
    if (!this.isNative()) {
      // Web: use Permissions API if available
      if (navigator.permissions) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          return result.state; // 'granted', 'denied', or 'prompt'
        } catch (e) {
          return 'prompt'; // fallback: just try
        }
      }
      return 'prompt';
    }
    return await permissionManager.checkLocationPermission();
  }

  // Start watching location updates
  async startLocationWatch(onUpdate, onError) {
    this.onLocationUpdate = onUpdate;
    this.onLocationError = onError;

    if (!this.isNative()) {
      // Web fallback: navigator.geolocation.watchPosition (Safari, Chrome, Firefox)
      if (!navigator.geolocation) {
        onError?.(new Error('Geolocation not supported by this browser'));
        return;
      }
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.currentPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            timestamp: position.timestamp
          };
          onUpdate?.(this.currentPosition);
        },
        (error) => {
          console.error('Web location watch error:', error);
          onError?.(new Error(`Location watch error: ${error.message}`));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
      return;
    }

    // Native: Capacitor Geolocation (unchanged)
    try {
      this.watchId = await Geolocation.watchPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }, (position) => {
        this.currentPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          timestamp: position.timestamp
        };
        onUpdate?.(this.currentPosition);
      });
    } catch (error) {
      console.error('Location watch error:', error);
      onError?.(new Error(`Location watch error: ${error.message}`));
    }
  }

  // Stop watching location updates
  async stopLocationWatch() {
    if (this.watchId !== null && this.watchId !== undefined) {
      try {
        if (this.isNative()) {
          await Geolocation.clearWatch({ id: this.watchId });
        } else {
          navigator.geolocation.clearWatch(this.watchId);
        }
        this.watchId = null;
      } catch (error) {
        console.error('Error stopping location watch:', error);
      }
    }
  }

  // Start watching device orientation (compass heading)
  async startHeadingWatch(onUpdate) {
    this.onHeadingUpdate = onUpdate;
    
    // iOS 13+ requires explicit permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          console.warn('Device orientation permission denied');
          return;
        }
      } catch (err) {
        console.warn('DeviceOrientationEvent.requestPermission error:', err);
      }
    }

    this.headingHandler = (event) => {
      let heading = null;
      if (event.webkitCompassHeading !== undefined) {
        // iOS provides true heading
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        // Android: absolute alpha is counter-clockwise from North
        // We negate it to get standard clockwise bearing
        heading = (360 - event.alpha) % 360;
      }
      
      if (heading !== null) {
        this.currentHeading = heading;
        this.onHeadingUpdate?.(this.currentHeading);
      }
    };

    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', this.headingHandler);
    } else {
      window.addEventListener('deviceorientation', this.headingHandler);
    }
  }

  // Stop watching device orientation
  stopHeadingWatch() {
    if (this.headingHandler) {
      if ('ondeviceorientationabsolute' in window) {
        window.removeEventListener('deviceorientationabsolute', this.headingHandler);
      }
      window.removeEventListener('deviceorientation', this.headingHandler);
      this.headingHandler = null;
      this.onHeadingUpdate = null;
    }
  }

  // Get current position (cached)
  getCurrentPosition() {
    return this.currentPosition;
  }

  getCurrentHeading() {
    return this.currentHeading;
  }

  // Calculate distance between two points in meters
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

// Export singleton instance
const locationService = new LocationService();
export default locationService; 