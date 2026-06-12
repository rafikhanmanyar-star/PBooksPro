/**
 * Deployment edition and feature flags — shared contract for frontend and backend.
 * Backend mirror: backend/src/services/systemFeatureService.ts (keep in sync).
 */

export type AppEdition = 'desktop' | 'cloud';

export type SystemFeatureKey =
  | 'applicationUpdates'
  | 'localBackup'
  | 'offlineMode'
  | 'tenantManagement'
  | 'subscriptionBilling'
  | 'advancedReporting';

export type SystemFeatures = Record<SystemFeatureKey, boolean>;

export type SystemInfo = {
  edition: AppEdition;
  version: string;
  features: SystemFeatures;
};

export const EDITION_FEATURE_MAP: Record<AppEdition, SystemFeatures> = {
  desktop: {
    applicationUpdates: true,
    localBackup: true,
    offlineMode: true,
    tenantManagement: false,
    subscriptionBilling: false,
    advancedReporting: true,
  },
  cloud: {
    applicationUpdates: true,
    localBackup: false,
    offlineMode: false,
    tenantManagement: false,
    subscriptionBilling: false,
    advancedReporting: true,
  },
};

export function normalizeAppEdition(raw: string | undefined | null): AppEdition {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'cloud' ? 'cloud' : 'desktop';
}

export function getFeaturesForEdition(edition: AppEdition): SystemFeatures {
  return { ...EDITION_FEATURE_MAP[edition] };
}

export function getDeploymentTypeLabel(edition: AppEdition): string {
  return edition === 'cloud' ? 'SaaS' : 'Local Installation';
}

export function getEditionDisplayLabel(edition: AppEdition): string {
  return edition === 'cloud' ? 'Cloud' : 'Desktop';
}

/** Offline SQLite desktop sessions without API — treat as desktop edition. */
export function getLocalDesktopSystemInfo(version: string): SystemInfo {
  return {
    edition: 'desktop',
    version,
    features: getFeaturesForEdition('desktop'),
  };
}
