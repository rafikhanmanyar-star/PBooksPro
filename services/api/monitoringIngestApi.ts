import { apiClient } from './client';

/**
 * Tenant-scoped client telemetry / error ingest.
 *
 * These endpoints (/monitoring/client-errors, /monitoring/telemetry) are tenant-safe
 * write-only ingest and remain on the tenant API. They were split out of the former
 * adminMonitoringApi when the cross-tenant platform monitoring dashboard was moved to the
 * admin portal — keep this module free of any cross-tenant read surface.
 */
export const monitoringIngestApi = {
  async reportClientError(input: {
    message: string;
    stack?: string;
    componentStack?: string;
    url?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await apiClient.post('/monitoring/client-errors', input);
  },

  async reportTelemetry(
    metrics: Array<{
      name: string;
      value: number;
      unit: 'ms' | 'bytes' | 'count' | 'score';
      tags?: Record<string, string>;
      timestamp?: string;
    }>
  ): Promise<void> {
    await apiClient.post('/monitoring/telemetry', { metrics });
  },
};
