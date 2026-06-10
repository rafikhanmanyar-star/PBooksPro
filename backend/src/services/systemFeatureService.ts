/**
 * Deployment edition and feature flags for the API server.
 * Keep feature map in sync with shared/systemFeatures.ts.
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

const EDITION_FEATURE_MAP: Record<AppEdition, SystemFeatures> = {
  desktop: {
    applicationUpdates: true,
    localBackup: true,
    offlineMode: true,
    tenantManagement: false,
    subscriptionBilling: false,
    advancedReporting: true,
  },
  cloud: {
    applicationUpdates: false,
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

export function getAppEdition(): AppEdition {
  return normalizeAppEdition(process.env.APP_EDITION);
}

export function getFeaturesForEdition(edition: AppEdition): SystemFeatures {
  return { ...EDITION_FEATURE_MAP[edition] };
}

export function isFeatureEnabled(feature: SystemFeatureKey, edition: AppEdition = getAppEdition()): boolean {
  return getFeaturesForEdition(edition)[feature] === true;
}

export function buildSystemInfo(version: string): SystemInfo {
  const edition = getAppEdition();
  return {
    edition,
    version,
    features: getFeaturesForEdition(edition),
  };
}
