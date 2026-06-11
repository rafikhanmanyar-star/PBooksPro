import React from 'react';
import { useFeatures } from '../../hooks/useFeatures';
import {
  getDeploymentTypeLabel,
  getEditionDisplayLabel,
} from '../../shared/systemFeatures';
import packageJson from '../../package.json';

const AboutSection: React.FC = () => {
  const { edition, version, isLoading } = useFeatures();
  const displayVersion = version || packageJson.version || 'Unknown';
  const displayEdition = edition ? getEditionDisplayLabel(edition) : '—';
  const deploymentType = edition ? getDeploymentTypeLabel(edition) : '—';

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
          <dd className="text-app-text font-semibold">{displayVersion}</dd>

          <dt className="font-medium text-app-muted">Deployment Type</dt>
          <dd className="text-app-text font-semibold">{deploymentType}</dd>
        </dl>
      )}
    </div>
  );
};

export default AboutSection;
