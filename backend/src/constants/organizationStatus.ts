export const ORGANIZATION_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export function isOrganizationStatus(value: string): value is OrganizationStatus {
  return (ORGANIZATION_STATUSES as readonly string[]).includes(value);
}

export const ORG_STATUS_LOGIN_MESSAGES: Record<
  Exclude<OrganizationStatus, 'ACTIVE'>,
  { code: string; title: string; message: string }
> = {
  PENDING: {
    code: 'ORG_PENDING_APPROVAL',
    title: 'Account Pending Approval',
    message:
      'Your organization has not yet been approved. Please contact support if approval is delayed.',
  },
  REJECTED: {
    code: 'ORG_REGISTRATION_REJECTED',
    title: 'Organization Registration Rejected',
    message: 'Please contact support for additional information.',
  },
  SUSPENDED: {
    code: 'ORG_SUSPENDED',
    title: 'Organization Suspended',
    message: 'Please contact billing or support.',
  },
};

export function isOrganizationApprovalEnabled(): boolean {
  const raw = process.env.ORG_APPROVAL_REQUIRED?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  return process.env.ALLOW_SELF_SIGNUP?.trim().toLowerCase() === 'true';
}
