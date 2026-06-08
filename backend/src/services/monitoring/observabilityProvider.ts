/**
 * Integration points for external APM / error tracking.
 * Wire real SDKs here when SENTRY_DSN, APPLICATIONINSIGHTS_CONNECTION_STRING,
 * or OTEL_EXPORTER_OTLP_ENDPOINT are configured.
 */

import { logger } from '../../utils/logger.js';
import type { MonitoringCategory, MonitoringSeverity } from '../../constants/monitoring.js';

export type ObservabilityEvent = {
  category: MonitoringCategory;
  severity: MonitoringSeverity;
  message: string;
  code?: string;
  tenantId?: string | null;
  userId?: string | null;
  route?: string;
  requestId?: string;
  durationMs?: number;
  stack?: string;
  metadata?: Record<string, unknown>;
};

export type ObservabilityProvider = {
  name: string;
  captureEvent: (event: ObservabilityEvent) => void | Promise<void>;
};

const providers: ObservabilityProvider[] = [];

function sentryProvider(): ObservabilityProvider | null {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    name: 'sentry',
    captureEvent(event) {
      // Integration point: npm install @sentry/node and call Sentry.captureException / captureMessage
      logger.debug('[observability:sentry] capture', {
        dsnConfigured: true,
        category: event.category,
        severity: event.severity,
        message: event.message,
      });
    },
  };
}

function appInsightsProvider(): ObservabilityProvider | null {
  const conn = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();
  if (!conn) return null;
  return {
    name: 'application-insights',
    captureEvent(event) {
      // Integration point: npm install applicationinsights and trackException / trackTrace
      logger.debug('[observability:app-insights] capture', {
        category: event.category,
        severity: event.severity,
        message: event.message,
      });
    },
  };
}

function openTelemetryProvider(): ObservabilityProvider | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return null;
  return {
    name: 'opentelemetry',
    captureEvent(event) {
      // Integration point: @opentelemetry/sdk-node + OTLP exporter
      logger.debug('[observability:otel] capture', {
        endpoint,
        category: event.category,
        severity: event.severity,
        message: event.message,
        requestId: event.requestId,
      });
    },
  };
}

export function initObservabilityProviders(): void {
  providers.length = 0;
  for (const factory of [sentryProvider, appInsightsProvider, openTelemetryProvider]) {
    const p = factory();
    if (p) providers.push(p);
  }
  if (providers.length > 0) {
    logger.info('[observability] Providers registered', { providers: providers.map((p) => p.name) });
  }
}

export function forwardToObservability(event: ObservabilityEvent): void {
  for (const provider of providers) {
    try {
      void provider.captureEvent(event);
    } catch (err) {
      logger.warn('[observability] Provider failed', { provider: provider.name, err });
    }
  }
}

export function getObservabilityStatus() {
  return {
    sentry: Boolean(process.env.SENTRY_DSN?.trim()),
    applicationInsights: Boolean(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim()),
    openTelemetry: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()),
    registeredProviders: providers.map((p) => p.name),
  };
}
