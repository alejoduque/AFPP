/**
 * The ticker strip (public/ticker/ticker.js): tiny 1-bit actors walking past.
 * Decorative, so hidden from screen readers.
 */
import React, { useEffect, useRef } from 'react';

let loading = null;
function loadTicker() {
  if (window.AfppTicker) return Promise.resolve(window.AfppTicker);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${import.meta.env.BASE_URL}ticker/ticker.js`;
      s.async = true;
      s.onload = () => resolve(window.AfppTicker);
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }
  return loading;
}

export default function Ticker({ scale = 2 }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    loadTicker().then((tk) => alive && tk?.mount(ref.current)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return <canvas ref={ref} className="afpp-ticker" data-scale={scale} aria-hidden="true" />;
}
