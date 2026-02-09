
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import useDatabaseLicense from '../hooks/useDatabaseLicense';
import { useAuth } from './AuthContext';

interface LicenseContextType {
    isRegistered: boolean;
    isTrial: boolean;
    isExpired: boolean;
    daysRemaining: number;
    licenseKey: string;
    deviceId: string;
    installDate: string;
    modules: string[];
    hasModule: (moduleKey: string) => boolean;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

const TRIAL_DURATION_DAYS = 30;

/** Generate a short unique ID; works in HTTP and older browsers where crypto.randomUUID may be missing. */
function generateDeviceId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().toUpperCase().slice(0, 8);
    }
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(4);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 8);
    }
    return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export const LicenseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { installDate, licenseKey, deviceId, setInstallDate, setLicenseKey, setDeviceId } = useDatabaseLicense();
    const { isAuthenticated, checkLicenseStatus } = useAuth();

    const [isRegistered, setIsRegistered] = useState(false);
    const [daysRemaining, setDaysRemaining] = useState(0);
    const [isExpired, setIsExpired] = useState(false);
    const [cloudLicense, setCloudLicense] = useState<{
        licenseType?: string;
        licenseStatus?: string;
        expiryDate?: string | Date | null;
        daysRemaining?: number;
        isExpired?: boolean;
        modules?: string[];
    } | null>(null);

    // Only treat as valid server response if it has license fields (avoids treating error fallback as data)
    const isRealLicenseResponse = (s: any) =>
        s && typeof s === 'object' && ('licenseType' in s || 'licenseStatus' in s);

    useEffect(() => {
        if (!isAuthenticated) {
            setCloudLicense(null);
            return;
        }

        let cancelled = false;
        const maxRetries = 3;

        const loadCloudLicense = async (attempt = 0) => {
            try {
                const status = await checkLicenseStatus();
                if (cancelled) return;
                if (isRealLicenseResponse(status)) {
                    setCloudLicense(status as any);
                }
            } catch (error) {
                if (cancelled) return;
                console.error('Cloud license check failed:', error);
                if (attempt < maxRetries) {
                    setTimeout(() => void loadCloudLicense(attempt + 1), 1000 * (attempt + 1));
                }
            }
        };

        void loadCloudLicense(0);
        return () => { cancelled = true; };
    }, [isAuthenticated, checkLicenseStatus]);

    // Listen for license loaded event from login flow (added on mount so we never miss the event)
    useEffect(() => {
        const onLicenseLoaded = (e: CustomEvent) => {
            const status = e.detail;
            if (isRealLicenseResponse(status)) setCloudLicense(status);
        };
        window.addEventListener('license-status-loaded' as any, onLicenseLoaded);
        return () => window.removeEventListener('license-status-loaded' as any, onLicenseLoaded);
    }, []);

    useEffect(() => {
        // 1. Initialize Device ID if missing
        let currentDeviceId = deviceId;
        if (!currentDeviceId) {
            currentDeviceId = generateDeviceId();
            setDeviceId(currentDeviceId);
        }

        // 2. Check Installation Date
        // Only set install date if it doesn't exist in database (first install)
        // This ensures license timer never resets during version upgrades
        // The useDatabaseLicense hook already loads from database, so we trust its value
        // setInstallDate will only set if it doesn't exist (protected in the hook)
        let date = installDate;
        if (!date) {
            // First run - no install date exists
            // setInstallDate will check database and only set if it doesn't exist
            date = new Date().toISOString();
            setInstallDate(date);
        }

        // 3. Calculate Trial Status (for offline/local use)
        const start = new Date(date);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const remaining = TRIAL_DURATION_DAYS - diffDays;

        setDaysRemaining(remaining > 0 ? remaining : 0);
        setIsExpired(remaining <= 0);

        // 5. If user is authenticated and cloud license is active, override local status
        if (isAuthenticated && cloudLicense) {
            const cloudExpired = cloudLicense.isExpired === true || cloudLicense.licenseStatus === 'expired';
            const cloudDays = typeof cloudLicense.daysRemaining === 'number'
                ? cloudLicense.daysRemaining
                : remaining;

            const cloudRegistered =
                !cloudExpired &&
                cloudLicense.licenseType &&
                cloudLicense.licenseType !== 'trial';

            setIsRegistered(!!cloudRegistered);
            setIsExpired(cloudExpired);
            setDaysRemaining(cloudDays > 0 ? cloudDays : 0);
        }

    }, [installDate, licenseKey, deviceId, isAuthenticated, cloudLicense]);

    const hasModule = (moduleKey: string) => {
        if (!isAuthenticated) return false;
        if (!cloudLicense?.modules) return false;
        return cloudLicense.modules.includes(moduleKey);
    };

    return (
        <LicenseContext.Provider value={{
            isRegistered,
            isTrial: !isRegistered && !isExpired,
            isExpired,
            daysRemaining,
            licenseKey,
            deviceId,
            installDate,
            modules: cloudLicense?.modules || [],
            hasModule
        }}>
            {children}
        </LicenseContext.Provider>
    );
};

export const useLicense = () => {
    const context = useContext(LicenseContext);
    if (!context) {
        throw new Error('useLicense must be used within a LicenseProvider');
    }
    return context;
};
