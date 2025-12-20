
// A secret salt used to sign the keys. In a real app, obfuscate this.
const SECRET_SALT = "MY_ACCOUNTANT_SECURE_SALT_2024";

// Format: MA-[RANDOM_HEX]-[CHECKSUM]
// Example: MA-A1B2C3D4-9F21

/**
 * Generates a simplistic hash code from a string
 */
const hashCode = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

/**
 * Validates a license key string against a specific Device ID.
 */
export const validateLicenseKey = (key: string, deviceId: string): boolean => {
    if (!key || !deviceId) return false;
    
    const parts = key.trim().toUpperCase().split('-');
    if (parts.length !== 3) return false;
    
    const [prefix, randomSegment, checksum] = parts;
    
    if (prefix !== 'MA') return false;
    
    // The signature now includes the Device ID, binding the key to the hardware/browser instance
    const rawString = `${randomSegment}-${deviceId}-${SECRET_SALT}`;
    const expectedChecksum = hashCode(rawString).toString(16).toUpperCase().slice(0, 4).padStart(4, '0');
    
    return checksum === expectedChecksum;
};
