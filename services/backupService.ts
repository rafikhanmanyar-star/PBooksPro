
import React from 'react';
import { AppAction } from '../types';
import { useProgress } from '../context/ProgressContext';
import { getDatabaseService } from './database/databaseService';
import { AppStateRepository } from './database/repositories/appStateRepository';

type ProgressReporter = ReturnType<typeof useProgress>;

// Helper to trigger file download
const downloadFile = (content: string | Uint8Array, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    let blob: Blob;
    
    if (content instanceof Uint8Array) {
        blob = new Blob([content], { type: contentType });
    } else {
        blob = new Blob([content], { type: contentType });
    }
    
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    // Fix: Add timeout to ensure download starts before revoking URL (crucial for Firefox)
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);
};

export const createBackup = async (progress: ProgressReporter, dispatch: React.Dispatch<AppAction>) => {
    progress.startProgress('Creating Full Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(25, 'Exporting database...');
        
        // Get database service and export binary backup
        const dbService = getDatabaseService();
        await dbService.initialize();
        
        const dbBackup = dbService.createBackup();
        
        await new Promise(res => setTimeout(res, 500));
        progress.updateProgress(90, 'Preparing download...');
        const date = new Date().toISOString().split('T')[0];
        
        // Download database backup
        downloadFile(dbBackup, `finance-tracker-backup-${date}.db`, 'application/octet-stream');
        
        progress.finishProgress('Backup file has been downloaded!');

    } catch (e) {
        console.error("Backup failed", e);
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        progress.errorProgress(`Backup failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Backup Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};

export const restoreBackup = async (file: File, dispatch: React.Dispatch<AppAction>, progress: ProgressReporter) => {
    progress.startProgress('Restoring from Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(25, `Reading file: ${file.name}...`);
        
        const dbService = getDatabaseService();
        await dbService.initialize();
        
        // Validate that it's a database backup file
        if (!file.name.endsWith('.db') && file.type !== 'application/octet-stream') {
            throw new Error('Invalid backup file format. Please select a database backup file (.db).');
        }
        
        // Database backup restore
        progress.updateProgress(40, 'Loading database backup...');
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        progress.updateProgress(60, 'Restoring database...');
        dbService.restoreBackup(uint8Array);
        
        progress.updateProgress(80, 'Loading application state...');
        const appStateRepo = new AppStateRepository();
        const restoredState = await appStateRepo.loadState();
        
        progress.updateProgress(90, 'Applying data to application...');
        dispatch({ type: 'SET_STATE', payload: restoredState });

        progress.finishProgress('Restore complete! The app will now reload.');

        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (e) {
        console.error("Restore failed", e);
        const message = e instanceof Error ? e.message : 'File might be corrupted or in an invalid format.';
        progress.errorProgress(`Restore failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Restore Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};
