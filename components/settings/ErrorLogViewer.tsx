
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAppContext } from '../../context/AppContext';
import { ErrorLogEntry } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { getErrorLogger, ExtendedErrorLogEntry } from '../../services/errorLogger';

interface ErrorLogViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

const LogEntryView: React.FC<{ entry: ExtendedErrorLogEntry }> = ({ entry }) => {
    return (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <p className="font-semibold text-slate-800 break-words">{entry.message}</p>
            <p className="text-slate-500">{new Date(entry.timestamp).toLocaleString()}</p>
            {entry.stack && <pre className="mt-2 p-2 bg-slate-200 text-slate-700 rounded whitespace-pre-wrap break-all">{entry.stack}</pre>}
            {entry.componentStack && <pre className="mt-2 p-2 bg-rose-100 text-rose-800 rounded whitespace-pre-wrap break-all">Component Stack: {entry.componentStack}</pre>}
        </div>
    );
};


const ErrorLogViewer: React.FC<ErrorLogViewerProps> = ({ isOpen, onClose }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm } = useNotification();
    const [errorLogs, setErrorLogs] = useState<ExtendedErrorLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Load error logs when modal opens
    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            try {
                const logs = getErrorLogger().getLogs(100); // Get last 100 errors
                setErrorLogs(logs);
            } catch (error) {
                console.error('Failed to load error logs:', error);
                // Fallback to state.errorLog
                setErrorLogs(state.errorLog.map((log, index): ExtendedErrorLogEntry => ({
                    id: index.toString(),
                    timestamp: log.timestamp,
                    message: log.message,
                    stack: log.stack,
                    componentStack: log.componentStack,
                    errorType: 'legacy'
                })));
            } finally {
                setIsLoading(false);
            }
        }
    }, [isOpen, state.errorLog]);

    const handleClearLog = async () => {
        const confirmed = await showConfirm('Are you sure you want to clear the error log?', { title: 'Clear Log', confirmLabel: 'Clear' });
        if (confirmed) {
            try {
                await getErrorLogger().clearLogs();
                setErrorLogs([]);
                // Also clear from state
                dispatch({ type: 'CLEAR_ERROR_LOG' });
            } catch (error) {
                console.error('Failed to clear error logs:', error);
            }
        }
    };

    const stats = getErrorLogger().getStatistics();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="System Error Log" size="xl">
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-sm text-slate-600">
                        Showing {errorLogs.length} error{errorLogs.length !== 1 ? 's' : ''} 
                        {stats.recent > 0 && ` (${stats.recent} in last 24 hours)`}
                    </p>
                </div>
                <Button variant="danger" size="sm" onClick={handleClearLog} disabled={errorLogs.length === 0}>
                    Clear Log
                </Button>
            </div>
            
            {isLoading ? (
                <div className="text-center py-16 text-slate-500">
                    <p>Loading error logs...</p>
                </div>
            ) : errorLogs.length > 0 ? (
                <div className="max-h-[60vh] overflow-y-auto space-y-2 p-2 bg-slate-100 rounded">
                    {errorLogs.map((entry, index) => (
                        <LogEntryView key={entry.id || index} entry={entry} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 text-slate-500">
                    <p>No errors have been logged. The system is running smoothly! 🎉</p>
                </div>
            )}
             <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
        </div>
    </Modal>
  );
};

export default ErrorLogViewer;
