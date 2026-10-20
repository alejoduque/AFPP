import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tier is decided at build time (VITE_APP_TIER=free|paid, default paid).
// Injected via define so the built bundle contains ONLY the active tier's
// marker string — build_release.sh asserts on it to prevent shipping the
// wrong tier.
const isFree = process.env.VITE_APP_TIER === 'free';

export default defineConfig({
  plugins: [react()],
  define: {
    __SOUNDWALK_IS_FREE__: JSON.stringify(isFree),
    __SOUNDWALK_TIER__: JSON.stringify(isFree ? 'SOUNDWALK_TIER_FREE' : 'SOUNDWALK_TIER_PAID')
  },
  server: {
    open: true,
    // Dev only: the static pages (bitacora/) call ../afpp/api/ as they do in
    // production under /AlpineFeministPunkParade/; send that to a local server/afpp.
    proxy: {
      '/afpp/api': { target: 'http://127.0.0.1:8790', changeOrigin: true },
      // The chat's room relay (KLAP's realtime/, `go run .` or docker, on :8001): VITE_AFPP_ROOMS=/afpp/_rooms
      '/afpp/_rooms': { target: 'ws://127.0.0.1:8001', ws: true, rewrite: () => '/_rooms' },
    },
  },
  build: {
    rollupOptions: {
      external: []
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    force: true
  }
});