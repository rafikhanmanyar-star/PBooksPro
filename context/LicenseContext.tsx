
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import useDatabaseLicense from '../hooks/useDatabaseLicense';
import { validateLicenseKey } from '../services/licenseService';
import { useAuth } from './AuthContext';

interface LicenseContextType {
    isRegistered: boolean;
    isTrial: boolean;
    isExpired: boolean;
    daysRemaining: number;
    licenseKey: string;
    deviceId: string;
    installDate: string;
    registerApp: (key: string) => boolean;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

const TRIAL_DURATION_DAYS = 30;

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
    } | null>(null);

    useEffect(() => {
        if (!isAuthenticated) {
            setCloudLicense(null);
            return;
        }

        const loadCloudLicense = async () => {
            try {
                const status = await checkLicenseStatus();
                setCloudLicense(status as any);
            } catch (error) {
                // Keep local license state if cloud check fails
                console.error('Cloud license check failed:', error);
            }
        };

        void loadCloudLicense();
    }, [isAuthenticated, checkLicenseStatus]);

    useEffect(() => {
        // 1. Initialize Device ID if missing
        let currentDeviceId = deviceId;
        if (!currentDeviceId) {
            currentDeviceId = crypto.randomUUID().toUpperCase().slice(0, 8); // Short unique ID
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

        // 3. Validate License against the specific Device ID
        const valid = validateLicenseKey(licenseKey, currentDeviceId);
        setIsRegistered(valid);

        // 4. Calculate Trial Status
        const start = new Date(date);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const remaining = TRIAL_DURATION_DAYS - diffDays;

        setDaysRemaining(remaining > 0 ? remaining : 0);
        setIsExpired(!valid && remaining <= 0);

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

    const registerApp = (key: string): boolean => {
        if (validateLicenseKey(key, deviceId)) {
            setLicenseKey(key);
            setIsRegistered(true);
            setIsExpired(false);
            return true;
        }
        return false;
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
            registerApp
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
