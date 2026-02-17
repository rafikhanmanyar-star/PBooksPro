/**
 * Sync Progress Bar Component
 * 
 * Displays a detailed progress bar for synchronization status.
 * Shows completed vs total items and a visual progress line.
 */

import React, { useMemo } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { isMobileDevice } from '../../utils/platformDetection';

interface SyncProgressBarProps {
    className?: string;
}

const SyncProgressBar: React.FC<SyncProgressBarProps> = ({ className = '' }) => {
    const { progress, isSyncing, pending, failed } = useSyncStatus();
    const isMobile = isMobileDevice();

    const { total, completed, failed: progressFailed, inboundTotal, inboundCompleted } = progress || {
        total: pending || 0,
        completed: 0,
        failed: 0
    };

    const isInbound = (inboundTotal ?? 0) > 0 && (inboundCompleted ?? 0) < (inboundTotal ?? 0);

    const percentage = useMemo(() => {
        if (isInbound) {
            return Math.min(100, Math.round(((inboundCompleted ?? 0) / (inboundTotal ?? 1)) * 100));
        }
        if (!total || total === 0) return 0;
        return Math.min(100, Math.round((completed / total) * 100));
    }, [total, completed, inboundTotal, inboundCompleted, isInbound]);

    // Don't show on mobile or if not syncing (after all hooks)
    if (isMobile || (!isSyncing && !progress)) {
        return null;
    }

    // Use the global failed count from useSyncStatus if it's higher than the session failed count
    const displayFailed = Math.max(progressFailed, failed);

    return (
        <div className={`flex flex-col gap-1 min-w-[120px] max-w-[180px] ${className}`}>
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isInbound ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                    {isInbound ? 'Loading' : 'Syncing'}
                </span>
                <span>
                    {isInbound ? `${inboundCompleted}/${inboundTotal}` : `${completed}/${total}`}
                </span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-300/30 shadow-inner">
                <div
                    className={`h-full transition-all duration-500 ease-out relative rounded-full ${isInbound ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${percentage}%` }}
                >
                    {/* Shimmer effect overlay */}
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer-slide" />
                </div>
            </div>
            {displayFailed > 0 && (
                <span className="text-[9px] font-bold text-rose-500 text-right flex items-center justify-end gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    {displayFailed} {displayFailed === 1 ? 'Error' : 'Errors'}
                </span>
            )}
        </div>
    );
};

export default SyncProgressBar;
