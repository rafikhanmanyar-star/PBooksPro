import type { CSSProperties } from 'react';
import type {
  Bill,
  Building,
  Contact,
  Invoice,
  InvoiceStatus,
  Project,
  ProjectAgreement,
  Property,
  RentalAgreement,
  Unit,
} from '../../types';
import { InvoiceStatus, InvoiceType } from '../../types';

export interface InvoiceBillItemBuildContext {
  contacts: Contact[];
  projectAgreements: ProjectAgreement[];
  rentalAgreements: RentalAgreement[];
  units: Unit[];
  properties: Property[];
  buildings: Building[];
  projects: Project[];
  enableColorCoding: boolean;
  contactNameById: Map<string, string>;
}

export interface InvoiceBillItemStamp {
  label: string;
  color: string;
  border: string;
}

export interface InvoiceBillItemViewModel {
  id: string;
  item: Invoice | Bill;
  type: 'invoice' | 'bill';
  renderKey: string;
  number: string;
  contactName: string;
  contactLabel: string;
  balance: number;
  amount: number;
  paidAmount: number;
  issueDate: string;
  dueDate?: string;
  status: InvoiceStatus;
  description?: string;
  isRental: boolean;
  isPaid: boolean;
  canEdit: boolean;
  isAgreementCancelled: boolean;
  statusClass: string;
  customStyle: CSSProperties;
  stamp: InvoiceBillItemStamp | null;
  projectName?: string;
  unitName?: string;
  buildingName?: string;
  propertyName?: string;
  staffName?: string;
  showProjectContext: boolean;
  showBuildingContext: boolean;
  showPropertyContext: boolean;
  showStaffContext: boolean;
  rentalPropertyLabel: string;
}

export function getInvoiceBillStatusClass(status: InvoiceStatus): string {
  switch (status) {
    case InvoiceStatus.PAID:
      return 'ds-badge-paid';
    case InvoiceStatus.PARTIALLY_PAID:
      return 'ds-badge-partial';
    case InvoiceStatus.OVERDUE:
      return 'ds-badge-overdue';
    case InvoiceStatus.UNPAID:
      return 'ds-badge-unpaid';
    case InvoiceStatus.DRAFT:
      return 'ds-pill-type';
    default:
      return 'ds-pill-type';
  }
}

function getStamp(description?: string): InvoiceBillItemStamp | null {
  if (description?.includes('[Security]')) {
    return { label: 'SECURITY', color: 'text-amber-600/20', border: 'border-amber-600/20' };
  }
  if (description?.includes('[Rental]')) {
    return { label: 'RENTAL', color: 'text-gray-500/10', border: 'border-gray-500/10' };
  }
  return null;
}

function buildCustomStyle(
  projectId: string | undefined,
  buildingId: string | undefined,
  projects: Project[],
  buildings: Building[],
  enableColorCoding: boolean
): CSSProperties {
  if (!enableColorCoding) return {};

  let color: string | null = null;
  if (projectId) {
    const p = projects.find((proj) => proj.id === projectId);
    if (p?.color) color = p.color;
  }
  if (!color && buildingId) {
    const b = buildings.find((bd) => bd.id === buildingId);
    if (b?.color) color = b.color;
  }

  if (color) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return {
      background: `linear-gradient(0deg, rgba(${r}, ${g}, ${b}, 0.12), rgba(${r}, ${g}, ${b}, 0.12)), #ffffff`,
      borderLeft: `4px solid ${color}`,
    };
  }
  return {};
}

function buildRenderKey(item: Invoice | Bill, type: 'invoice' | 'bill'): string {
  const number = type === 'invoice' ? (item as Invoice).invoiceNumber : (item as Bill).billNumber;
  return [
    item.id,
    item.status,
    item.paidAmount,
    item.amount,
    item.issueDate,
    item.description ?? '',
    item.contactId ?? '',
    number,
  ].join('|');
}

export function buildInvoiceBillItemViewModel(
  item: Invoice | Bill,
  type: 'invoice' | 'bill',
  ctx: InvoiceBillItemBuildContext
): InvoiceBillItemViewModel {
  const { contactId, amount, paidAmount, issueDate, status, description, projectId } = item;
  const number = type === 'invoice' ? (item as Invoice).invoiceNumber : (item as Bill).billNumber;
  const dueDate = 'dueDate' in item ? item.dueDate : undefined;
  const invoiceType = type === 'invoice' ? (item as Invoice).invoiceType : undefined;

  const buildingId = type === 'invoice' ? (item as Invoice).buildingId : (item as Bill).buildingId;
  const unitId = type === 'invoice' ? (item as Invoice).unitId : undefined;
  const propertyId = item.propertyId;
  const staffId = type === 'bill' ? (item as Bill).staffId : undefined;

  const contactName = (contactId && ctx.contactNameById.get(contactId)) || 'N/A';
  const contactLabel = type === 'invoice' ? (invoiceType === InvoiceType.RENTAL ? 'Tenant' : 'Owner') : 'Supplier';
  const balance = amount - paidAmount;

  const agreementId = type === 'invoice' ? (item as Invoice).agreementId : (item as Bill).projectAgreementId;
  const projectAgreement = agreementId
    ? ctx.projectAgreements.find((pa) => pa.id === agreementId)
    : undefined;
  const isAgreementCancelled = projectAgreement?.status === ProjectAgreementStatus.CANCELLED;

  const isRental = type === 'invoice' && (item as Invoice).invoiceType === InvoiceType.RENTAL;

  let resolvedProjectId = projectId;
  let resolvedUnitId = unitId;
  let resolvedPropertyId = propertyId;

  if (type === 'invoice' && agreementId) {
    const pa = ctx.projectAgreements.find((a) => a.id === agreementId);
    if (pa) {
      if (!resolvedProjectId) resolvedProjectId = pa.projectId;
      if (!resolvedUnitId && pa.unitIds?.length > 0) resolvedUnitId = pa.unitIds[0];
    }
    if (!resolvedPropertyId) {
      const ra = ctx.rentalAgreements.find((a) => a.id === agreementId);
      if (ra) resolvedPropertyId = ra.propertyId;
    }
  }
  if (!resolvedProjectId && resolvedUnitId) {
    const u = ctx.units.find((unit) => unit.id === resolvedUnitId);
    if (u?.projectId) resolvedProjectId = u.projectId;
  }

  const property =
    isRental || resolvedPropertyId
      ? ctx.properties.find(
          (p) => p.id === (isRental ? (item as Invoice).propertyId || resolvedPropertyId : resolvedPropertyId)
        )
      : null;
  const building = property
    ? ctx.buildings.find((b) => b.id === property.buildingId)
    : buildingId
      ? ctx.buildings.find((b) => b.id === buildingId)
      : null;
  const project = resolvedProjectId ? ctx.projects.find((p) => p.id === resolvedProjectId) : null;
  const unit = resolvedUnitId ? ctx.units.find((u) => u.id === resolvedUnitId) : null;
  const staff = staffId ? ctx.contacts.find((c) => c.id === staffId) : null;

  const isPaid = status === InvoiceStatus.PAID;
  const canEdit = !isAgreementCancelled;

  return {
    id: item.id,
    item,
    type,
    renderKey: buildRenderKey(item, type),
    number,
    contactName,
    contactLabel,
    balance,
    amount,
    paidAmount,
    issueDate,
    dueDate,
    status,
    description,
    isRental,
    isPaid,
    canEdit,
    isAgreementCancelled,
    statusClass: getInvoiceBillStatusClass(status),
    customStyle: buildCustomStyle(projectId, buildingId, ctx.projects, ctx.buildings, ctx.enableColorCoding),
    stamp: getStamp(description),
    projectName: project?.name,
    unitName: unit?.name,
    buildingName: building?.name,
    propertyName: property?.name,
    staffName: staff?.name,
    showProjectContext: Boolean(project && !isRental),
    showBuildingContext: Boolean(!project && building),
    showPropertyContext: Boolean(!project && !building && property),
    showStaffContext: Boolean(staff),
    rentalPropertyLabel: property?.name || 'Unknown Unit',
  };
}

export function buildInvoiceBillItemViewModels(
  items: (Invoice | Bill)[],
  type: 'invoice' | 'bill',
  ctx: InvoiceBillItemBuildContext
): InvoiceBillItemViewModel[] {
  return items.map((item) => buildInvoiceBillItemViewModel(item, type, ctx));
}
