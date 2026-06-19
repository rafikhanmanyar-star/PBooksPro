import { randomUUID } from 'crypto';
import type {
  ObservabilityErrorRecord,
  ObservabilityErrorSource,
  ObservabilitySeverity,
} from '../../reliability/observabilityTypes.js';
import { captureMonitoringEvent } from '../monitoring/monitoringCapture.js';
import type { MonitoringCategory } from '../../constants/monitoring.js';

export function toObservabilityError(input: {
  module: string;
  severity: ObservabilitySeverity;
  message: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
  source?: ObservabilityErrorSource;
}): ObservabilityErrorRecord {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    module: input.module,
    severity: input.severity,
    message: input.message,
    stackTrace: input.stackTrace,
    context: {
      ...input.context,
      source: input.source,
    },
  };
}

function categoryForSource(source?: ObservabilityErrorSource): MonitoringCategory {
  if (source === 'backend_database') return 'database';
  if (source === 'backend_sync') return 'sync';
  if (source?.startsWith('frontend')) return 'application_error';
  return 'api_failure';
}

/** Persist standard error to monitoring_events (non-blocking). */
export function trackObservabilityError(
  record: ObservabilityErrorRecord,
  opts?: { tenantId?: string | null; userId?: string | null; route?: string; requestId?: string }
): void {
  const source = record.context?.source as ObservabilityErrorSource | undefined;
  captureMonitoringEvent({
    category: categoryForSource(source),
    severity: record.severity,
    message: record.message,
    code: `OBS_ERR_${record.module}`,
    tenantId: opts?.tenantId ?? null,
    userId: opts?.userId ?? null,
    route: opts?.route,
    requestId: opts?.requestId,
    stackTrace: record.stackTrace,
    metadata: {
      observabilityErrorId: record.id,
      module: record.module,
      ...record.context,
    },
  });
}
