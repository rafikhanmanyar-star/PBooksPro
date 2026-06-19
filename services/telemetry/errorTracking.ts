import type { ObservabilityErrorRecord, ObservabilitySeverity } from '../../shared/reliability/observabilityTypes';
import { monitoringIngestApi } from '../api/adminMonitoringApi';
import { getErrorLogger } from '../errorLogger';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `err_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export type ClientErrorInput = {
  module: string;
  severity?: ObservabilitySeverity;
  message: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
  source?: 'frontend_unhandled' | 'frontend_react' | 'frontend_network' | 'frontend_render';
};

export function buildClientErrorRecord(input: ClientErrorInput): ObservabilityErrorRecord {
  return {
    id: newId(),
    timestamp: new Date().toISOString(),
    module: input.module,
    severity: input.severity ?? 'error',
    message: input.message,
    stackTrace: input.stackTrace,
    context: {
      ...input.context,
      source: input.source ?? 'frontend_unhandled',
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    },
  };
}

/** Local log + server ingest (non-blocking). */
export async function trackClientError(input: ClientErrorInput): Promise<ObservabilityErrorRecord> {
  const record = buildClientErrorRecord(input);
  void getErrorLogger().logError(record.message, {
    errorType: input.source,
    stack: record.stackTrace,
    additionalInfo: record.context,
  });

  try {
    await monitoringIngestApi.reportClientError({
      message: record.message,
      stack: record.stackTrace,
      url: record.context?.url as string | undefined,
      metadata: {
        observabilityErrorId: record.id,
        module: record.module,
        severity: record.severity,
        ...record.context,
      },
    });
  } catch {
    /* local log retained */
  }

  return record;
}
