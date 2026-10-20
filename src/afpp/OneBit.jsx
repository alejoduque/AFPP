/**
 * The 1-bit map look of the street map (WalkMap.jsx).
 *
 * <OneBitFilter/> mounts the SVG filter once. OSM tiles go through it: anything
 * darker than luminance 0.81 (road casings, water, paths, labels; not
 * buildings, at 0.82) becomes a solid shape, a Laplacian keeps only its edges,
 * and the edges are inked in a dim purple, so shared traces stay the brightest
 * thing. addLineArtTiles(map) adds the one tile layer that takes this filter;
 * satellite or coloured layers cannot be reduced to line art and are not offered.
 */
import React from 'react';
import L from 'leaflet';

export function OneBitFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="afpp-1bit" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix
          type="matrix"
          values="-4.252 -14.304 -1.444 0 16.2  -4.252 -14.304 -1.444 0 16.2  -4.252 -14.304 -1.444 0 16.2  0 0 0 0 1"
        />
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues="0 0.5" />
          <feFuncG type="discrete" tableValues="0 0.5" />
          <feFuncB type="discrete" tableValues="0 0.5" />
        </feComponentTransfer>
        <feConvolveMatrix order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="true" edgeMode="duplicate" />
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues="0 0.29 0.29 0.29" />
          <feFuncG type="discrete" tableValues="0 0.137 0.137 0.137" />
          <feFuncB type="discrete" tableValues="0 0.55 0.55 0.55" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/** OSM standard tiles, inked to line art by #afpp-1bit (theme.css: .afpp-tiles).
 *  For heavy public traffic, point VITE_AFPP_TILES at your own tile server. */
export function addLineArtTiles(map) {
  return L.tileLayer(import.meta.env.VITE_AFPP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'afpp-tiles',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
}
