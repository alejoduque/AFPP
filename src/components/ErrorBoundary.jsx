/**
 * @fileoverview This file is part of the BioMapp project, developed for Reserva MANAAKI.
 *
 * Copyright (c) 2026 Alejandro Duque Jaramillo. All rights reserved.
 *
 * This code is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) License.
 * For the full license text, please visit: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
 */
import React from 'react';
import { t } from '../i18n';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f0f1ec',
                    padding: '20px',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '500px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                        <h2 style={{ color: '#c24a6e', marginTop: 0 }}>{t('error.title')}</h2>
                        <p style={{ color: '#6B7280' }}>
                            {t('error.message')}
                        </p>
                        {this.state.error && (
                            <details style={{ marginTop: '16px' }}>
                                <summary style={{ cursor: 'pointer', color: '#4e4e86' }}>
                                    {t('error.details')}
                                </summary>
                                <pre style={{
                                    marginTop: '8px',
                                    padding: '12px',
                                    backgroundColor: '#F3F4F6',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    overflow: 'auto',
                                    maxHeight: '200px'
                                }}>
                                    {this.state.error.toString()}
                                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                                </pre>
                            </details>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                marginTop: '16px',
                                backgroundColor: '#4e4e86',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 20px',
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            {t('error.reload')}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
