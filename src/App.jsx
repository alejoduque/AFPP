/**
 * @fileoverview Deriva Sonora (permasoftware branch).
 *
 * Copyright (c) 2026 Alejandro Duque Jaramillo. Licensed CC BY-NC-SA 4.0
 * (see the header of the files inherited from SoundWalk for the full terms).
 *
 *   on the phone (Capacitor)   PermaApp: record derives, see yours, open the globe
 *   in a browser               AfppApp: the globe, the local map, the rings
 *   in a browser, ?recorder    PermaApp, for development (MediaRecorder + web GPS)
 *
 * No landing page, no SoundWalk screens: those live on main / AFPP.
 */
import React, { Component, Suspense, lazy } from 'react';
import { subscribe } from './i18n';
import AfppApp from './afpp/AfppApp.jsx';

const PermaApp = lazy(() => import('./perma/PermaApp.jsx'));

const IS_NATIVE = typeof window !== 'undefined' && !!window.Capacitor &&
  (window.Capacitor.isNative || (window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
const WEB_RECORDER = typeof location !== 'undefined' && new URLSearchParams(location.search).has('recorder');

class App extends Component {
  state = { lang: null };

  componentDidMount() {
    // Re-render the tree when the UI language changes (components call t() at render).
    this.unsubscribe = subscribe((lang) => this.setState({ lang }));
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    return (
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000' }} />}>
        {IS_NATIVE || WEB_RECORDER ? <PermaApp /> : <AfppApp web />}
      </Suspense>
    );
  }
}

export default App;
