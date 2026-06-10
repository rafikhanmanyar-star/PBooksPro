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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl">
      <h3 className="text-lg font-bold text-slate-800 mb-1">System Information</h3>
      <p className="text-sm text-slate-500 mb-6">
        Deployment details for support and troubleshooting.
      </p>

      {isLoading && !edition ? (
        <p className="text-sm text-slate-500">Loading system information…</p>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-[minmax(10rem,auto)_1fr] gap-x-6 gap-y-4 text-sm">
          <dt className="font-medium text-slate-600">Edition</dt>
          <dd className="text-slate-800 font-semibold">{displayEdition}</dd>

          <dt className="font-medium text-slate-600">Version</dt>
          <dd className="text-slate-800 font-semibold">{displayVersion}</dd>

          <dt className="font-medium text-slate-600">Deployment Type</dt>
          <dd className="text-slate-800 font-semibold">{deploymentType}</dd>
        </dl>
      )}
    </div>
  );
};

export default AboutSection;
