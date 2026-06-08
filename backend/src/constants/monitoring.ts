/**
 * Production monitoring categories, severities, and thresholds.
 */

export type MonitoringCategory =
  | 'application_error'
  | 'api_failure'
  | 'database'
  | 'authentication'
  | 'payment'
  | 'performance'
  | 'email'
  | 'user_activity';

export type MonitoringSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export const MONITORING_CATEGORIES: MonitoringCategory[] = [
  'application_error',
  'api_failure',
  'database',
  'authentication',
  'payment',
  'performance',
  'email',
  'user_activity',
];

export const CATEGORY_LABELS: Record<MonitoringCategory, string> = {
  application_error: 'Application Errors',
  api_failure: 'API Failures',
  database: 'Database Issues',
  authentication: 'Authentication Errors',
  payment: 'Payment Errors',
  performance: 'Performance Bottlenecks',
  email: 'Failed Emails',
  user_activity: 'User Activity',
};

export function getSlowRequestThresholdMs(): number {
  const raw = process.env.MONITORING_SLOW_REQUEST_MS;
  const n = raw ? Number(raw) : 3000;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3000;
}

export function isMonitoringEnabled(): boolean {
  return process.env.MONITORING_ENABLED !== 'false';
}
