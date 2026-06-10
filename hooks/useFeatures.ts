import { useSystemContext } from '../context/SystemContext';
import type { SystemFeatureKey, SystemFeatures } from '../shared/systemFeatures';

export function useFeatures(): {
  features: SystemFeatures;
  isFeatureEnabled: (feature: SystemFeatureKey) => boolean;
  edition: 'desktop' | 'cloud' | null;
  version: string | null;
  isLoading: boolean;
} {
  const { features, isFeatureEnabled, edition, version, isLoading } = useSystemContext();

  return {
    features: features ?? {
      applicationUpdates: false,
      localBackup: false,
      offlineMode: false,
      tenantManagement: false,
      subscriptionBilling: false,
      advancedReporting: false,
    },
    isFeatureEnabled,
    edition,
    version,
    isLoading,
  };
}
