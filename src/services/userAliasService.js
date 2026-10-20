// User Alias Service - lightweight per-device identity for SoundWalk sessions
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
import config from '../config.json';

const ALIAS_KEY = config.storage?.userAliasKey || 'soundwalk_user_alias';

class UserAliasService {
  constructor() {
    this._profile = null;
  }

  getProfile() {
    if (this._profile) return this._profile;
    try {
      const raw = localStorage.getItem(ALIAS_KEY);
      if (raw) {
        this._profile = JSON.parse(raw);
        return this._profile;
      }
    } catch (e) {
      console.error('Error reading user alias:', e);
    }
    return null;
  }

  getAlias() {
    return this.getProfile()?.alias || null;
  }

  hasAlias() {
    return !!this.getAlias();
  }

  getDeviceId() {
    const profile = this.getProfile();
    if (profile?.deviceId) return profile.deviceId;
    // Generate and persist a new device ID
    const deviceId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this._save({ ...(profile || {}), deviceId, createdAt: profile?.createdAt || new Date().toISOString() });
    return deviceId;
  }

  setAlias(alias) {
    if (!alias || typeof alias !== 'string' || !alias.trim()) {
      throw new Error('Alias must be a non-empty string');
    }
    const profile = this.getProfile() || {};
    this._save({
      alias: alias.trim(),
      deviceId: profile.deviceId || this.getDeviceId(),
      createdAt: profile.createdAt || new Date().toISOString()
    });
  }

  /**
   * Deterministic color from alias string.
   * Returns an HSL string suitable for CSS / Leaflet.
   * Different aliases produce visually distinct hues.
   */
  aliasToColor(alias) {
    const str = (alias || 'anon').toLowerCase();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash; // Convert to 32-bit int
    }
    const hue = ((hash % 360) + 360) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  /**
   * Returns a hex color from alias (useful for Leaflet which prefers hex).
   */
  aliasToHexColor(alias) {
    const str = (alias || 'anon').toLowerCase();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    const hue = ((hash % 360) + 360) % 360;
    // Convert HSL(hue, 70%, 50%) to hex
    return this._hslToHex(hue, 70, 50);
  }

  _hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  _save(profile) {
    this._profile = profile;
    try {
      localStorage.setItem(ALIAS_KEY, JSON.stringify(profile));
    } catch (e) {
      console.error('Error saving user alias:', e);
    }
  }
}

const userAliasService = new UserAliasService();
export default userAliasService;
