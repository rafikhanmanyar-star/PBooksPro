/**
 * PERF-A4 — shared observability contracts (frontend + backend).
 * Operational infrastructure only; no business logic.
 */

export type ObservabilitySeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export type ObservabilityErrorSource =
  | 'frontend_unhandled'
  | 'frontend_react'
  | 'frontend_network'
  | 'frontend_render'
  | 'backend_unhandled'
  | 'backend_api'
  | 'backend_database'
  | 'backend_sync';

/** Standard error model (A4.2). */
export type ObservabilityErrorRecord = {
  id: string;
  timestamp: string;
  module: string;
  severity: ObservabilitySeverity;
  message: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
};

export type FrontendTelemetryMetric = {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'score';
  tags?: Record<string, string>;
  timestamp?: string;
};

export type ApiEndpointStats = {
  routeKey: string;
  method: string;
  path: string;
  requestCount: number;
  errorCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  warningBreaches: number;
  criticalBreaches: number;
};

export const API_LATENCY_WARN_MS = 500;
export const API_LATENCY_CRITICAL_MS = 1000;
