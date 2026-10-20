/**
 * @fileoverview AFPP · Deriva Sonora.
 *
 * Copyright (c) 2026 Alejandro Duque Jaramillo. Licensed CC BY-NC-SA 4.0
 * (see the header of the files inherited from SoundWalk for the full terms).
 *
 * One app (AfppApp) in a browser and on the phone (Capacitor): the planet and
 * the street map, recording and listening, the #AFPP chat. The phone starts
 * its GPS at once and shows the splash; a browser asks for the location only
 * when you want to walk. Old ?recorder links open the same app.
 */
import React, { Component } from 'react';
import { subscribe } from './i18n';
import AfppApp from './afpp/AfppApp.jsx';

const IS_NATIVE = typeof window !== 'undefined' && !!window.Capacitor &&
  (window.Capacitor.isNative || (window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

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
    return <AfppApp native={IS_NATIVE} />;
  }
}

export default App;
