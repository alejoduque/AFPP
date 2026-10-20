// Example authentication configuration
// Copy this file to auth.js and update with your actual values
// DO NOT commit auth.js to version control

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

export const AUTH_CONFIG = {
  // Collector mode password - change this to a secure password
  COLLECTOR_PASSWORD: import.meta.env.VITE_COLLECTOR_PASSWORD || 'your-secure-password-here',
  
  // Add other authentication settings here as needed
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes in milliseconds
};

// Helper function to validate password
export const validatePassword = (inputPassword) => {
  return inputPassword === AUTH_CONFIG.COLLECTOR_PASSWORD;
}; 