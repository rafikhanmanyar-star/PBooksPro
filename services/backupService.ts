/**
 * Legacy SQLite backup helpers — replaced by PostgreSQL API backup (Settings → Backup & Restore).
 */
import React from 'react';
import { AppAction } from '../types';
import { useProgress } from '../context/ProgressContext';
import { downloadPostgresBackup, restorePostgresBackup } from './databaseBackupService';

type ProgressReporter = ReturnType<typeof useProgress>;

export const createBackup = async (progress: ProgressReporter, dispatch: React.Dispatch<AppAction>) => {
  progress.startProgress('Creating Full Backup');
  try {
    progress.updateProgress(25, 'Requesting PostgreSQL backup from server...');
    await downloadPostgresBackup();
    progress.finishProgress('Backup file has been downloaded.');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unknown error occurred.';
    progress.errorProgress(`Backup failed: ${message}`);
    dispatch({
      type: 'ADD_ERROR_LOG',
      payload: { message: `Backup Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) },
    });
  }
};

export const restoreBackup = async (file: File, dispatch: React.Dispatch<AppAction>, progress: ProgressReporter) => {
  progress.startProgress('Restoring from Backup');
  try {
    progress.updateProgress(25, `Uploading ${file.name}...`);
    const message = await restorePostgresBackup(file);
    progress.finishProgress(message);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unknown error occurred.';
    progress.errorProgress(`Restore failed: ${message}`);
    dispatch({
      type: 'ADD_ERROR_LOG',
      payload: { message: `Restore Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) },
    });
  }
};
