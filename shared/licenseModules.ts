/**
 * Subscription license modules — shared between main app, admin portal, and license services.
 * Keep backend mirrors (licenseService.ts) in sync when adding or removing modules.
 */

export type LicenseModuleKey = 'real_estate' | 'rental';

export const LICENSE_MODULES: { key: LicenseModuleKey; label: string }[] = [
  { key: 'real_estate', label: 'Real Estate Developer & Constructor' },
  { key: 'rental', label: 'Real Estate Rental Management' },
];

export const LICENSE_MODULE_KEYS: LicenseModuleKey[] = LICENSE_MODULES.map((m) => m.key);

export function isLicenseModuleKey(key: string): key is LicenseModuleKey {
  return (LICENSE_MODULE_KEYS as string[]).includes(key);
}
