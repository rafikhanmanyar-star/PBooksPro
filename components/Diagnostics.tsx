/**
 * Diagnostics Component
 * 
 * Shows diagnostic information to help debug initialization issues
 */

import React, { useState, useEffect } from 'react';
import { getDatabaseService } from '../services/database/databaseService';
import { getErrorLogger } from '../services/errorLogger';

export const Diagnostics: React.FC = () => {
    const [diagnostics, setDiagnostics] = useState<any>({});

    useEffect(() => {
        const gatherDiagnostics = () => {
            const diag: any = {
                timestamp: new Date().toISOString(),
                browser: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform,
                    language: navigator.language,
                    cookieEnabled: navigator.cookieEnabled,
                    onLine: navigator.onLine,
                },
                localStorage: {
                    available: typeof Storage !== 'undefined',
                    quota: 'unknown', // Can't easily check quota
                    keys: Object.keys(localStorage),
                    financeDb: !!localStorage.getItem('finance_db'),
                    migratedFlag: localStorage.getItem('migrated_to_sql'),
                    oldState: !!localStorage.getItem('finance_app_state_v4'),
                },
                webAssembly: {
                    supported: typeof WebAssembly !== 'undefined',
                },
                database: {
                    initialized: false,
                    hasError: false,
                    error: null,
                },
                errors: {
                    count: 0,
                    recent: [],
                }
            };

            // Check database
            try {
                const dbService = getDatabaseService();
                diag.database.initialized = dbService.isReady();
                diag.database.hasError = dbService.hasError();
                diag.database.error = dbService.getError()?.message || null;
            } catch (error) {
                diag.database.error = error instanceof Error ? error.message : String(error);
            }

            // Check error logger
            try {
                const errorLogger = getErrorLogger();
                const stats = errorLogger.getStatistics();
                diag.errors.count = stats.total;
                diag.errors.recent = errorLogger.getLogs(5);
            } catch (error) {
                diag.errors.error = error instanceof Error ? error.message : String(error);
            }

            return diag;
        };

        setDiagnostics(gatherDiagnostics());
    }, []);

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: 'white',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem',
            maxWidth: '400px',
            maxHeight: '500px',
            overflow: 'auto',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            fontSize: '0.75rem',
            zIndex: 9999
        }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 'bold' }}>
                🔍 Diagnostics
            </h3>
            <pre style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.7rem',
                fontFamily: 'monospace'
            }}>
                {JSON.stringify(diagnostics, null, 2)}
            </pre>
        </div>
    );
};
