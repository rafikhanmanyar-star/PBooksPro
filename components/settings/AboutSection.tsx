import React, { useEffect, useState } from 'react';
import { useFeatures } from '../../hooks/useFeatures';
import {
  getDeploymentTypeLabel,
  getEditionDisplayLabel,
} from '../../shared/systemFeatures';
import { getApiBaseUrl, isStagingEnvironment } from '../../config/apiUrl';
import {
  getEmbeddedBuildTime,
  getEmbeddedBuildVersion,
} from '../../services/versionCheck';

function formatBuildDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function resolveEnvironmentLabel(): string {
  if (import.meta.env.DEV) return 'Development';
  if (isStagingEnvironment()) return 'Staging';
  return 'Production';
}

const AboutSection: React.FC = () => {
  const { edition, version, isLoading } = useFeatures();
  const [apiUrl, setApiUrl] = useState('—');

  const buildVersion = getEmbeddedBuildVersion();
  const buildTime = getEmbeddedBuildTime();
  const displayVersion = buildVersion || version || 'Unknown';
  const displayEdition = edition ? getEditionDisplayLabel(edition) : '—';
  const deploymentType = edition ? getDeploymentTypeLabel(edition) : '—';
  const environment = resolveEnvironmentLabel();

  useEffect(() => {
    try {
      setApiUrl(getApiBaseUrl() || '—');
    } catch {
      setApiUrl('—');
    }
  }, []);

  return (
    <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-6 max-w-2xl">
      <h3 className="text-lg font-bold text-app-text mb-1">System Information</h3>
      <p className="text-sm text-app-muted mb-6">
        Deployment details for support and troubleshooting.
      </p>

      {isLoading && !edition ? (
        <p className="text-sm text-app-muted">Loading system information…</p>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-[minmax(10rem,auto)_1fr] gap-x-6 gap-y-4 text-sm">
          <dt className="font-medium text-app-muted">Edition</dt>
          <dd className="text-app-text font-semibold">{displayEdition}</dd>

          <dt className="font-medium text-app-muted">Version</dt>
          <dd className="text-app-text font-semibold font-mono">{displayVersion}</dd>

          <dt className="font-medium text-app-muted">Build Date</dt>
          <dd className="text-app-text font-semibold">{formatBuildDate(buildTime)}</dd>

          <dt className="font-medium text-app-muted">Environment</dt>
          <dd className="text-app-text font-semibold">{environment}</dd>

          <dt className="font-medium text-app-muted">API URL</dt>
          <dd className="text-app-text font-semibold break-all font-mono text-xs sm:text-sm">{apiUrl}</dd>

          <dt className="font-medium text-app-muted">Deployment Type</dt>
          <dd className="text-app-text font-semibold">{deploymentType}</dd>
        </dl>
      )}
    </div>
  );
};

export default AboutSection;
