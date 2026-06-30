import { apiClient } from '../client';
import { Quotation, QuotationItem } from '../../../types';

function parseItems(raw: unknown): QuotationItem[] {
  if (raw == null) return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else {
    return [];
  }

  return arr.map((item, idx) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const qty = Number(row.quantity ?? 0);
    const rate = Number(row.pricePerQuantity ?? row.price_per_quantity ?? row.unitRate ?? row.unit_rate ?? 0);
    return {
      id: String(row.id ?? idx),
      categoryId: String(row.categoryId ?? row.category_id ?? ''),
      itemId: row.itemId ?? row.item_id ? String(row.itemId ?? row.item_id) : undefined,
      itemName: row.itemName ?? row.item_name ? String(row.itemName ?? row.item_name) : undefined,
      brand: row.brand != null ? String(row.brand) : undefined,
      specification: row.specification != null ? String(row.specification) : undefined,
      quantity: qty,
      pricePerQuantity: rate,
      unit: row.unit != null ? String(row.unit) : undefined,
      marketRate: row.marketRate ?? row.market_rate ? Number(row.marketRate ?? row.market_rate) : undefined,
      previousRate: row.previousRate ?? row.previous_rate ? Number(row.previousRate ?? row.previous_rate) : undefined,
      variancePercent:
        row.variancePercent ?? row.variance_percent ? Number(row.variancePercent ?? row.variance_percent) : undefined,
      approvalThresholdPercent: Number(row.approvalThresholdPercent ?? row.approval_threshold_percent ?? 5),
      totalAmount: row.totalAmount ?? row.total_amount ? Number(row.totalAmount ?? row.total_amount) : qty * rate,
    };
  });
}

export function normalizeQuotationFromApi(raw: Record<string, unknown>): Quotation {
  const items = parseItems(raw.items);
  const totalRaw = raw.totalAmount ?? raw.total_amount;
  const totalFallback = Number(totalRaw);
  const computedTotal = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.pricePerQuantity || 0), 0);
  const status = String(raw.status ?? (raw.isActive === false || raw.is_active === false ? 'Draft' : 'Draft'));

  return {
    id: String(raw.id ?? ''),
    vendorId: String(raw.vendorId ?? raw.vendor_id ?? ''),
    name: String(raw.name ?? ''),
    quotationNumber: raw.quotationNumber ?? raw.quotation_number ? String(raw.quotationNumber ?? raw.quotation_number) : undefined,
    date: String(raw.date ?? ''),
    expiryDate: raw.expiryDate ?? raw.expiry_date ? String(raw.expiryDate ?? raw.expiry_date) : undefined,
    enablePriceValidation: raw.enablePriceValidation !== false && raw.enable_price_validation !== false,
    validationScope: raw.validationScope === 'ITEM' || raw.validation_scope === 'ITEM' ? 'ITEM' : 'CATEGORY',
    isActive: raw.isActive !== false && raw.is_active !== false,
    contactPerson: raw.contactPerson ?? raw.contact_person ? String(raw.contactPerson ?? raw.contact_person) : undefined,
    contactPhone: raw.contactPhone ?? raw.contact_phone ? String(raw.contactPhone ?? raw.contact_phone) : undefined,
    contactEmail: raw.contactEmail ?? raw.contact_email ? String(raw.contactEmail ?? raw.contact_email) : undefined,
    currency: String(raw.currency ?? 'PKR'),
    projectId: raw.projectId ?? raw.project_id ? String(raw.projectId ?? raw.project_id) : undefined,
    buildingId: raw.buildingId ?? raw.building_id ? String(raw.buildingId ?? raw.building_id) : undefined,
    packageName: raw.packageName ?? raw.package_name ? String(raw.packageName ?? raw.package_name) : undefined,
    quotationType: raw.quotationType ?? raw.quotation_type ? (String(raw.quotationType ?? raw.quotation_type) as Quotation['quotationType']) : undefined,
    status: status as Quotation['status'],
    isApprovedRate: raw.isApprovedRate === true || raw.is_approved_rate === true || status === 'Approved',
    paymentTerms: raw.paymentTerms ?? raw.payment_terms ? String(raw.paymentTerms ?? raw.payment_terms) : undefined,
    deliveryPeriod: raw.deliveryPeriod ?? raw.delivery_period ? String(raw.deliveryPeriod ?? raw.delivery_period) : undefined,
    warrantyPeriod: raw.warrantyPeriod ?? raw.warranty_period ? String(raw.warrantyPeriod ?? raw.warranty_period) : undefined,
    retentionPercent: Number(raw.retentionPercent ?? raw.retention_percent ?? 0) || 0,
    advancePercent: Number(raw.advancePercent ?? raw.advance_percent ?? 0) || 0,
    remarks: raw.remarks != null ? String(raw.remarks) : undefined,
    items,
    documentId: raw.documentId ?? raw.document_id ? String(raw.documentId ?? raw.document_id) : undefined,
    totalAmount: Number.isFinite(totalFallback) && totalFallback > 0 ? totalFallback : computedTotal,
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()),
    version: typeof raw.version === 'number' ? raw.version : undefined,
  };
}

export class QuotationsApiRepository {
  async findAll(): Promise<Quotation[]> {
    const rows = await apiClient.get<Record<string, unknown>[]>('/quotations');
    return Array.isArray(rows) ? rows.map((r) => normalizeQuotationFromApi(r)) : [];
  }

  async findById(id: string): Promise<Quotation | null> {
    try {
      const raw = await apiClient.get<Record<string, unknown>>(`/quotations/${id}`);
      return normalizeQuotationFromApi(raw);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(quotation: Partial<Quotation>): Promise<Quotation> {
    const raw = await apiClient.post<Record<string, unknown>>('/quotations', quotation);
    return normalizeQuotationFromApi(raw);
  }

  async update(id: string, quotation: Partial<Quotation>): Promise<Quotation> {
    const raw = await apiClient.post<Record<string, unknown>>('/quotations', { ...quotation, id });
    return normalizeQuotationFromApi(raw);
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/quotations/${id}`);
  }

  async exists(id: string): Promise<boolean> {
    const quotation = await this.findById(id);
    return quotation !== null;
  }
}
