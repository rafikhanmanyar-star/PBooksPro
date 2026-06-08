/**
 * Privacy request type and status constants.
 */

export const PRIVACY_REQUEST_TYPES = [
  'data_export',
  'user_data_export',
  'tenant_data_export',
  'deletion',
  'correction',
  'anonymization',
] as const;

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export const PRIVACY_REQUEST_STATUSES = [
  'pending',
  'processing',
  'completed',
  'rejected',
  'failed',
] as const;

export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export const PRIVACY_EXPORT_FORMAT = 'pbooks-privacy-export-v1' as const;

export type PrivacyExportScope = 'data' | 'user' | 'tenant';

export function isPrivacyRequestType(value: string): value is PrivacyRequestType {
  return (PRIVACY_REQUEST_TYPES as readonly string[]).includes(value);
}

export function isPrivacyRequestStatus(value: string): value is PrivacyRequestStatus {
  return (PRIVACY_REQUEST_STATUSES as readonly string[]).includes(value);
}

export function privacyRequestTypeLabel(type: PrivacyRequestType): string {
  const labels: Record<PrivacyRequestType, string> = {
    data_export: 'Data export',
    user_data_export: 'User data export',
    tenant_data_export: 'Tenant data export',
    deletion: 'Deletion request',
    correction: 'Correction request',
    anonymization: 'Anonymization',
  };
  return labels[type];
}

export function privacyRequestStatusLabel(status: PrivacyRequestStatus): string {
  const labels: Record<PrivacyRequestStatus, string> = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    rejected: 'Rejected',
    failed: 'Failed',
  };
  return labels[status];
}

export function mapExportScopeToRequestType(scope: PrivacyExportScope): PrivacyRequestType {
  if (scope === 'tenant') return 'tenant_data_export';
  if (scope === 'user') return 'user_data_export';
  return 'data_export';
}
