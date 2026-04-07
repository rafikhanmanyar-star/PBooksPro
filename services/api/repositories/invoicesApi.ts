/**
 * Invoices API Repository
 *
 * Provides API-based access to invoices data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Invoice, InvoiceStatus } from '../../../types';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../../utils/dateUtils';

/** Map API JSON (camelCase) to app Invoice */
export function normalizeInvoiceFromApi(raw: Record<string, unknown>): Invoice {
  return {
    id: String(raw.id ?? ''),
    invoiceNumber: String(raw.invoiceNumber ?? raw.invoice_number ?? ''),
    contactId: String(raw.contactId ?? raw.contact_id ?? ''),
    amount: Number(raw.amount ?? 0),
    paidAmount: Number(raw.paidAmount ?? raw.paid_amount ?? 0),
    status: (raw.status as InvoiceStatus) || InvoiceStatus.UNPAID,
    issueDate: parseStoredDateToYyyyMmDdInput(String(raw.issueDate ?? raw.issue_date ?? toLocalDateString(new Date()))),
    dueDate: (() => {
      const d = raw.dueDate ?? raw.due_date;
      if (d != null && String(d) !== '') return parseStoredDateToYyyyMmDdInput(String(d));
      const i = raw.issueDate ?? raw.issue_date;
      return i != null ? parseStoredDateToYyyyMmDdInput(String(i)) : toLocalDateString(new Date());
    })(),
    invoiceType: (raw.invoiceType ?? raw.invoice_type) as Invoice['invoiceType'],
    description: raw.description != null ? String(raw.description) : undefined,
    projectId: (raw.projectId ?? raw.project_id) as string | undefined,
    buildingId: (raw.buildingId ?? raw.building_id) as string | undefined,
    propertyId: (raw.propertyId ?? raw.property_id) as string | undefined,
    unitId: (raw.unitId ?? raw.unit_id) as string | undefined,
    categoryId: (raw.categoryId ?? raw.category_id) as string | undefined,
    agreementId: (raw.agreementId ?? raw.agreement_id) as string | undefined,
    securityDepositCharge:
      raw.securityDepositCharge != null || raw.security_deposit_charge != null
        ? Number(raw.securityDepositCharge ?? raw.security_deposit_charge)
        : undefined,
    serviceCharges:
      raw.serviceCharges != null || raw.service_charges != null
        ? Number(raw.serviceCharges ?? raw.service_charges)
        : undefined,
    rentalMonth: (raw.rentalMonth ?? raw.rental_month) as string | undefined,
    userId: raw.userId != null || raw.user_id != null ? String(raw.userId ?? raw.user_id) : undefined,
    version: typeof raw.version === 'number' ? raw.version : undefined,
    deletedAt:
      raw.deletedAt != null || raw.deleted_at != null
        ? String(raw.deletedAt ?? raw.deleted_at)
        : undefined,
  };
}

export class InvoicesApiRepository {
  /**
   * Get all invoices
   */
  async findAll(filters?: {
    status?: string;
    invoiceType?: string;
    projectId?: string;
    agreementId?: string;
    /** Include soft-deleted invoices (required for computing next P-INV-* without colliding with DB unique constraint). */
    includeDeleted?: boolean;
  }): Promise<Invoice[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.invoiceType) params.append('invoiceType', filters.invoiceType);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.agreementId) params.append('agreementId', filters.agreementId);
    if (filters?.includeDeleted) params.append('includeDeleted', 'true');

    const query = params.toString();
    const rows = await apiClient.get<Record<string, unknown>[]>(`/invoices${query ? `?${query}` : ''}`);
    return Array.isArray(rows) ? rows.map((r) => normalizeInvoiceFromApi(r)) : [];
  }

  /**
   * Get invoice by ID
   */
  async findById(id: string): Promise<Invoice | null> {
    try {
      const raw = await apiClient.get<Record<string, unknown>>(`/invoices/${id}`);
      return normalizeInvoiceFromApi(raw);
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new invoice
   */
  async create(invoice: Partial<Invoice>): Promise<Invoice> {
    const raw = await apiClient.post<Record<string, unknown>>('/invoices', invoice);
    return normalizeInvoiceFromApi(raw);
  }

  /**
   * Update an existing invoice
   */
  async update(id: string, invoice: Partial<Invoice>): Promise<Invoice> {
    const raw = await apiClient.put<Record<string, unknown>>(`/invoices/${id}`, invoice);
    return normalizeInvoiceFromApi(raw);
  }

  /**
   * Delete an invoice
   */
  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/invoices/${id}${qs}`);
  }

  /**
   * Check if invoice exists
   */
  async exists(id: string): Promise<boolean> {
    const invoice = await this.findById(id);
    return invoice !== null;
  }
}

