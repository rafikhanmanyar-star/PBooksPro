/**
 * Privacy request tracking — create, list, and update data-subject requests.
 */

import type pg from 'pg';
import {
  isPrivacyRequestStatus,
  isPrivacyRequestType,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '../../constants/privacyRequestTypes.js';
import {
  PrivacyRequestRepository,
  newPrivacyRequestId,
} from '../../modules/privacy/repositories/PrivacyRepository.js';

export type PrivacyRequestRow = {
  id: string;
  tenant_id: string;
  request_type: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  requested_by_user_id: string | null;
  metadata: Record<string, unknown>;
};

export type CreatePrivacyRequestInput = {
  tenantId: string;
  requestedByUserId: string;
  requestType: PrivacyRequestType;
  metadata?: Record<string, unknown>;
  status?: PrivacyRequestStatus;
};

const requestRepo = new PrivacyRequestRepository();

export async function createPrivacyRequest(
  client: pg.PoolClient,
  input: CreatePrivacyRequestInput
): Promise<PrivacyRequestRow> {
  if (!isPrivacyRequestType(input.requestType)) {
    throw new Error(`Invalid privacy request type: ${input.requestType}`);
  }
  const status = input.status ?? 'pending';
  if (!isPrivacyRequestStatus(status)) {
    throw new Error(`Invalid privacy request status: ${status}`);
  }

  const id = newPrivacyRequestId();
  const completedAt = status === 'completed' ? new Date() : null;

  return requestRepo.insert(client, {
    ...input,
    id,
    status,
    completedAt,
  });
}

export async function getPrivacyRequest(
  client: pg.PoolClient,
  tenantId: string,
  requestId: string
): Promise<PrivacyRequestRow | null> {
  return requestRepo.getById(client, tenantId, requestId);
}

export async function listPrivacyRequests(
  client: pg.PoolClient,
  tenantId: string,
  options?: { userId?: string | null; limit?: number }
): Promise<PrivacyRequestRow[]> {
  return requestRepo.list(client, tenantId, options);
}

export async function updatePrivacyRequestStatus(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    requestId: string;
    status: PrivacyRequestStatus;
    metadataPatch?: Record<string, unknown>;
    completedAt?: Date | null;
  }
): Promise<PrivacyRequestRow | null> {
  if (!isPrivacyRequestStatus(input.status)) {
    throw new Error(`Invalid privacy request status: ${input.status}`);
  }

  const existing = await getPrivacyRequest(client, input.tenantId, input.requestId);
  if (!existing) return null;

  const mergedMetadata = {
    ...existing.metadata,
    ...(input.metadataPatch ?? {}),
  };
  const completedAt =
    input.completedAt !== undefined
      ? input.completedAt
      : input.status === 'completed' || input.status === 'rejected' || input.status === 'failed'
        ? new Date()
        : null;

  await requestRepo.updateStatus(client, {
    tenantId: input.tenantId,
    requestId: input.requestId,
    status: input.status,
    metadataJson: JSON.stringify(mergedMetadata),
    completedAt,
  });

  return getPrivacyRequest(client, input.tenantId, input.requestId);
}

export function canUserAccessRequest(
  request: PrivacyRequestRow,
  userId: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  return request.requested_by_user_id === userId;
}
