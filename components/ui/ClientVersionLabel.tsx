import React from 'react';
import packageJson from '../../package.json';
import { useUpdate } from '../../context/UpdateContext';
import { getEmbeddedBuildVersion, getEmbeddedBuildTime } from '../../services/versionCheck';
import { isStagingEnvironment } from '../../config/apiUrl';

export function useClientDisplayVersion(): string {
  const { appVersion, isElectronUpdate } = useUpdate();
  const embedded = getEmbeddedBuildVersion();
  if (isElectronUpdate && appVersion) return appVersion;
  return embedded || packageJson.version;
}

export function useClientEnvironmentLabel(): string | null {
  if (import.meta.env.DEV) return 'Development';
  if (isStagingEnvironment()) return 'Staging';
  return null;
}

function formatBuildDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

type LabelProps = {
  prefix?: string;
  className?: string;
};

export function ClientVersionLabel({ prefix = 'v', className = '' }: LabelProps) {
  const version = useClientDisplayVersion();
  return (
    <span className={`font-mono ${className}`.trim()}>
      {prefix}
      {version}
    </span>
  );
}

type FootnoteProps = {
  className?: string;
};

/** Compact version line for login screens and footers. */
export function ClientVersionFootnote({ className = '' }: FootnoteProps) {
  const env = useClientEnvironmentLabel();
  return (
    <p className={`text-center text-xs text-app-muted ${className}`.trim()}>
      <ClientVersionLabel />
      {env ? <span className="ml-1.5 opacity-80">· {env}</span> : null}
    </p>
  );
}

type InfoProps = {
  className?: string;
  showBuildDate?: boolean;
};

/** Slightly richer version block for settings / about panels. */
export function ClientVersionInfo({ className = '', showBuildDate = true }: InfoProps) {
  const version = useClientDisplayVersion();
  const env = useClientEnvironmentLabel() ?? 'Production';
  const buildTime = getEmbeddedBuildTime();

  return (
    <dl className={`space-y-2 text-sm ${className}`.trim()}>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-app-muted">Version</dt>
        <dd className="font-mono font-semibold text-app-text">{version}</dd>
      </div>
      {showBuildDate && (
        <div className="flex items-center justify-between gap-4">
          <dt className="text-app-muted">Build</dt>
          <dd className="text-app-text">{formatBuildDate(buildTime)}</dd>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <dt className="text-app-muted">Environment</dt>
        <dd className="text-app-text">{env}</dd>
      </div>
    </dl>
  );
}
