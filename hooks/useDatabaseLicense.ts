/**
 * useDatabaseLicense Hook
 *
 * License settings are managed via the API in PostgreSQL-only mode.
 */

import { useCallback } from 'react';

export function useDatabaseLicense() {
  const setInstallDate = useCallback(async (_value: string) => {}, []);
  const setLicenseKey = useCallback(async (_value: string) => {}, []);
  const setDeviceId = useCallback(async (_value: string) => {}, []);

  return {
    installDate: '',
    licenseKey: '',
    deviceId: '',
    setInstallDate,
    setLicenseKey,
    setDeviceId,
  };
}

export default useDatabaseLicense;
