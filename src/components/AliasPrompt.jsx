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
import React, { useState } from 'react';
import { t } from '../i18n';

const AliasPrompt = ({ onSubmit, onCancel }) => {
  const [alias, setAlias] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (alias.trim()) {
      onSubmit(alias.trim());
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgb(20 50 20 / 65%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: '#f0f1ec',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '340px',
        width: '90%',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)'
      }}>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#000000c9'
        }}>
          {t('alias.title')}
        </h3>
        <p style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: '#6B7280'
        }}>
          {t('alias.subtitle')}
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder={t('alias.placeholder')}
            autoFocus
            maxLength={30}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid rgba(78,78,134,0.22)',
              borderRadius: '8px',
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '16px'
            }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="submit"
              disabled={!alias.trim()}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: alias.trim() ? '#9dc04cd4' : '#9CA3AF',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: alias.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              {t('alias.continue')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 16px',
                backgroundColor: '#f0f1ec',
                color: 'rgb(1 9 2 / 84%)',
                border: '1px solid rgba(78,78,134,0.22)',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              {t('alias.skip')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AliasPrompt;
