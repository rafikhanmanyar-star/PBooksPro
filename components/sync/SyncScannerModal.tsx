
import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { syncService } from '../../services/SyncService';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';

interface SyncScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

const SyncScannerModal: React.FC<SyncScannerModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [scanError, setScanError] = useState('');
    const [syncState, setSyncState] = useState<{ status: string, progress: { message: string, percentage: number } | null }>({ status: 'disconnected', progress: null });
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const { showToast } = useNotification();

    useEffect(() => {
        const unsub = syncService.subscribe((state) => {
            setSyncState({ status: state.status, progress: state.progress });
        });
        return unsub;
    }, []);

    useEffect(() => {
        // Only initialize scanner if open AND disconnected
        if (isOpen && syncState.status === 'disconnected') {
            const timeout = setTimeout(() => {
                if (!document.getElementById("reader")) return;
                
                if (scannerRef.current) {
                    try { scannerRef.current.clear().catch(() => {}); } catch(e) {}
                }

                const scanner = new Html5QrcodeScanner(
                    "reader",
                    { 
                        fps: 10, 
                        qrbox: { width: 250, height: 250 },
                        videoConstraints: { facingMode: "environment" }
                    },
                    /* verbose= */ false
                );
                scannerRef.current = scanner;

                scanner.render(async (decodedText) => {
                    try {
                        scanner.clear();
                        const data = JSON.parse(decodedText);
                        if (data.type === 'finance-sync' && data.hostId) {
                            await syncService.joinSession(data.hostId);
                            // Toast will be shown on success via syncService status change or below
                        } else {
                            setScanError('Invalid QR Code. Please scan the code from the Desktop app.');
                        }
                    } catch (e) {
                        setScanError('Failed to read QR Code.');
                        console.error(e);
                    }
                }, (error) => {
                    // Ignore transient scanning errors
                });
            }, 100);

            return () => {
                clearTimeout(timeout);
                if (scannerRef.current) {
                    try {
                        scannerRef.current.clear().catch(() => {});
                    } catch (e) { }
                }
            };
        }
    }, [isOpen, syncState.status]);

    useEffect(() => {
        if (syncState.status === 'connected' && onSuccess) {
             onSuccess();
        }
    }, [syncState.status, onSuccess]);

    const handleDisconnect = () => {
        syncService.disconnect();
        showToast('Disconnected from session.', 'info');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Sync Mobile">
            <div className="flex flex-col items-center justify-center space-y-4 w-full">
                
                {syncState.status === 'syncing' ? (
                     <div className="text-center py-8 w-full max-w-sm">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                        <p className="font-semibold text-slate-700 text-lg">Synchronizing...</p>
                        
                        {syncState.progress && (
                            <div className="w-full mt-4">
                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                    <span>{syncState.progress.message}</span>
                                    <span>{Math.round(syncState.progress.percentage)}%</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2.5">
                                    <div 
                                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" 
                                        style={{ width: `${syncState.progress.percentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                        <p className="text-sm text-slate-500 mt-2">Merging accounts, transactions, and settings.</p>
                    </div>
                ) : syncState.status === 'connecting' ? (
                     <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                        <p className="font-semibold text-slate-700">Connecting to Host...</p>
                    </div>
                ) : syncState.status === 'connected' ? (
                     <div className="text-center py-8 w-full">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">Connected!</h3>
                        <p className="text-sm text-slate-600 mt-2 mb-6">Device is synced with Desktop. Real-time updates enabled.</p>
                        <Button variant="danger" onClick={handleDisconnect} className="w-full">Disconnect Session</Button>
                    </div>
                ) : (
                    <>
                        <div id="reader" className="w-full max-w-sm overflow-hidden rounded-lg bg-slate-100"></div>
                        {scanError && <p className="text-rose-600 text-sm font-medium text-center">{scanError}</p>}
                        <p className="text-xs text-slate-500 text-center px-4">
                            On your Desktop, click <strong>"Sync Mobile"</strong> in the sidebar to reveal the QR code.
                        </p>
                    </>
                )}
                
                {syncState.status !== 'connected' && syncState.status !== 'syncing' && (
                    <Button variant="secondary" onClick={onClose} className="w-full">Cancel</Button>
                )}
            </div>
        </Modal>
    );
};

export default SyncScannerModal;
