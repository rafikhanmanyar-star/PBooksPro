import type { Contact, Contract, Project, Vendor } from '../../types';
import { normalizeContactFromApi } from '../api/repositories/contactsApi';
import { normalizeContractFromApi } from '../api/repositories/contractsApi';

export function normalizeRemoteContactRow(raw: Record<string, unknown>): Contact {
  return normalizeContactFromApi(raw);
}

export function normalizeRemoteContractRow(raw: Record<string, unknown>): Contract {
  return normalizeContractFromApi(raw);
}

/** Map API / WebSocket vendor payloads (camelCase or snake_case) to app Vendor. */
export function normalizeRemoteVendorRow(raw: Record<string, unknown>): Vendor {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    description: raw.description != null ? String(raw.description) : undefined,
    contactNo: (raw.contactNo ?? raw.contact_no) != null ? String(raw.contactNo ?? raw.contact_no) : undefined,
    companyName: (raw.companyName ?? raw.company_name) != null ? String(raw.companyName ?? raw.company_name) : undefined,
    isActive: raw.isActive === false || raw.is_active === false ? false : true,
    address: raw.address != null ? String(raw.address) : undefined,
    userId: (raw.userId ?? raw.user_id) != null ? String(raw.userId ?? raw.user_id) : undefined,
    createdAt: (raw.createdAt ?? raw.created_at) as string | undefined,
    updatedAt: (raw.updatedAt ?? raw.updated_at) as string | undefined,
    version:
      typeof raw.version === 'number'
        ? raw.version
        : raw.version != null
          ? parseInt(String(raw.version), 10)
          : undefined,
  };
}

/** Map API / WebSocket project payloads (camelCase or snake_case) to app Project. */
export function normalizeRemoteProjectRow(raw: Record<string, unknown>): Project {
  const parseJsonField = (value: unknown): unknown => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    }
    return value;
  };

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    location: (raw.location as string | undefined) ?? undefined,
    projectType: (raw.projectType ?? raw.project_type) as string | undefined,
    description: raw.description != null ? String(raw.description) : undefined,
    color: raw.color != null ? String(raw.color) : undefined,
    status: (raw.status as Project['status']) || 'Active',
    version:
      typeof raw.version === 'number'
        ? raw.version
        : raw.version != null
          ? parseInt(String(raw.version), 10)
          : undefined,
    installmentConfig: parseJsonField(raw.installmentConfig ?? raw.installment_config) as Project['installmentConfig'],
    pmConfig: parseJsonField(raw.pmConfig ?? raw.pm_config) as Project['pmConfig'],
  };
}

/** Skip stale remote patches when server version is older than local (LWW). */
export function shouldApplyRemoteEntityPatch(
  existing: { version?: number } | undefined,
  incomingVersion: number | undefined
): boolean {
  if (incomingVersion == null) return true;
  const current = existing?.version ?? 0;
  return incomingVersion >= current;
}

export function resolveDeletedEntityId(
  payload: { id?: string },
  data: unknown
): string | undefined {
  if (typeof payload.id === 'string') return payload.id;
  if (data && typeof data === 'object' && data !== null && 'id' in data) {
    const id = (data as { id: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return undefined;
}
