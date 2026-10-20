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
import { t, tOption, formatDate, formatDateTime } from '../i18n';

class DetailView extends React.Component {

  render () {
    const { point: feature } = this.props;
    if (!feature || !feature.properties) return null;
    const point = feature.properties;
    const coords = feature.geometry && feature.geometry.coordinates;

    return (
      <div className="absolute w-full p-2 pt-4 md:pt-16 pin-b pin-l gradient flex items-center justify-center" style={{ height: "50%", backgroundColor: "rgb(20 50 20 / 85%)"}}>
        <i onClick={() => this.props.getPreviousRecording(feature)} className="fas fa-chevron-left text-4xl text-white hover:text-black cursor-pointer m-2 md:m-12"></i>
        <div className="max-w-xl flex flex-col sm:flex-row flex items-start md:items-center h-full">
          <div className="h-1/2 p-4 text-black leading-normal pb-3 font-sans overflow-auto" style={{ flex:2 }}>
            <div className="text-lg font-semibold mb-2">
              🔊 {point.filename}</div>
            <div className="text-sm mb-3">
              {point.duration != null && <><span className="font-medium">{t('detail.duration')}:</span> {point.duration}s | </>}
              {point.quality && <><span className="font-medium ml-2">{t('detail.quality')}:</span> {tOption('meta.quality', point.quality)} | </>}
              {point.timestamp && <><span className="font-medium ml-2">{t('detail.date')}:</span> {formatDate(point.timestamp)}</>}
            </div>
            {point.notes && (
              <div className="mb-3">
                <span className="font-medium">{t('detail.description')}:</span> {point.notes}
              </div>
            )}
            {point.speciesTags && point.speciesTags.length > 0 && (
              <div className="mb-3">
                <span className="font-medium">{t('detail.species')}:</span> {point.speciesTags.map((tag) => tOption('meta.species', tag)).join(', ')}
              </div>
            )}
            {(point.weather || point.temperature) && (
              <div className="mb-3">
                {point.weather && <><span className="font-medium">{t('detail.weather')}:</span> {tOption('meta.weather', point.weather)}</>}
                {point.temperature && <><span className="font-medium ml-2">{t('detail.temperature')}:</span> {tOption('meta.temperature', point.temperature)}</>}
              </div>
            )}
          </div>
          <div className="p-4 text-large font-sans text-white flex-1">
              <div className="text-lg md:text-4xl mb-6">
                📍 {t('detail.gpsLocation')}
              </div>
              {coords && coords.length >= 2 && (
                <div className="text-sm opacity-75">
                  {coords[1].toFixed(6)}, {coords[0].toFixed(6)}
                </div>
              )}
              {point.timestamp && (
                <div className="text-xs opacity-75 mt-2">
                  {formatDateTime(point.timestamp)}
                </div>
              )}
          </div>
        </div>
        <i onClick={() => this.props.getNextRecording(feature)} className="fas fa-chevron-right text-4xl text-white hover:text-black cursor-pointer m-2 md:m-12"></i>
      </div>
    );
  }
}

export default DetailView
