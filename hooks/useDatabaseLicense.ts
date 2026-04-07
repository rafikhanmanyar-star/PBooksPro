/**
 * useDatabaseLicense Hook
 * 
 * Manages license settings in SQL database instead of localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { getDatabaseService } from '../services/database/databaseService';
import { getUnifiedDatabaseService } from '../services/database/unifiedDatabaseService';
import { isLocalOnlyMode } from '../config/apiUrl';
import { isMobileDevice } from '../utils/platformDetection';

let dbInitialized = false;

async function ensureDatabaseInitialized(): Promise<void> {
  if (dbInitialized) return;
  if (!isLocalOnlyMode()) return;

  const unifiedService = getUnifiedDatabaseService();
    await unifiedService.initialize();

    if (!isMobileDevice()) {
        const dbService = getDatabaseService();
        await dbService.initialize();
        if (!dbService.isReady()) {
            // No company DB open yet — silently skip; will retry on next call.
            return;
        }
    }

    dbInitialized = true;
}

export function useDatabaseLicense() {
    const [installDate, setInstallDateState] = useState<string>('');
    const [licenseKey, setLicenseKeyState] = useState<string>('');
    const [deviceId, setDeviceIdState] = useState<string>('');

    // Load license settings from database
    useEffect(() => {
        let isMounted = true;

        const loadSettings = async () => {
            try {
                if (!isLocalOnlyMode()) return;
                await ensureDatabaseInitialized();
                if (!isMounted) return;

                const dbService = getDatabaseService();
                if (!dbService.isReady()) return;
                
                try {
                    dbService.query('SELECT 1 FROM license_settings LIMIT 1');
                } catch (error: any) {
                    console.warn('License settings table check failed, ensuring table exists:', error?.message);
                }
                
                const installDateResult = dbService.query<{ value: string }>(
                    'SELECT value FROM license_settings WHERE key = ?',
                    ['app_install_date']
                );
                const licenseKeyResult = dbService.query<{ value: string }>(
                    'SELECT value FROM license_settings WHERE key = ?',
                    ['app_license_key']
                );
                const deviceIdResult = dbService.query<{ value: string }>(
                    'SELECT value FROM license_settings WHERE key = ?',
                    ['app_device_id']
                );

                if (isMounted) {
                    setInstallDateState(installDateResult[0]?.value || '');
                    setLicenseKeyState(licenseKeyResult[0]?.value || '');
                    setDeviceIdState(deviceIdResult[0]?.value || '');
                }
            } catch (error) {
                console.error('Failed to load license settings:', error);
            }
        };

        loadSettings();

        return () => {
            isMounted = false;
        };
    }, []);

    const setInstallDate = useCallback(async (value: string) => {
        if (!isLocalOnlyMode()) return;
        try {
            await ensureDatabaseInitialized();
            const dbService = getDatabaseService();
            
            // Check if install date already exists - never overwrite it during upgrades
            const existing = dbService.query<{ value: string }>(
                'SELECT value FROM license_settings WHERE key = ?',
                ['app_install_date']
            );
            
            // Only set install date if it doesn't exist (first install)
            // This ensures license timer never resets during version upgrades
            if (!existing || existing.length === 0 || !existing[0]?.value) {
                dbService.execute(
                    'INSERT INTO license_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
                    ['app_install_date', value]
                );
                dbService.save();
                setInstallDateState(value);
            } else {
                // Install date already exists, use the existing value
                setInstallDateState(existing[0].value);
            }
        } catch (error) {
            console.error('Failed to save install date:', error);
        }
    }, []);

    const setLicenseKey = useCallback(async (value: string) => {
        if (!isLocalOnlyMode()) return;
        try {
            await ensureDatabaseInitialized();
            const dbService = getDatabaseService();
            dbService.execute(
                'INSERT OR REPLACE INTO license_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
                ['app_license_key', value]
            );
            dbService.save();
            setLicenseKeyState(value);
        } catch (error) {
            console.error('Failed to save license key:', error);
        }
    }, []);

    const setDeviceId = useCallback(async (value: string) => {
        if (!isLocalOnlyMode()) return;
        try {
            await ensureDatabaseInitialized();
            const dbService = getDatabaseService();
            dbService.execute(
                'INSERT OR REPLACE INTO license_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
                ['app_device_id', value]
            );
            dbService.save();
            setDeviceIdState(value);
        } catch (error) {
            console.error('Failed to save device ID:', error);
        }
    }, []);

    return {
        installDate,
        licenseKey,
        deviceId,
        setInstallDate,
        setLicenseKey,
        setDeviceId
    };
}

export default useDatabaseLicense;
