import type { Page, Transaction, Bill, Contract, RentalAgreement, ProjectAgreement, Contact } from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

export interface BuiltSearchRow {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  /** sessionStorage key/value set before navigation */
  session?: { key: string; value: string };
  /** Target page for SET_PAGE */
  page: Page;
  /** Optional: editing entity (e.g. contact in settings) */
  editing?: { type: string; id: string };
}

interface SearchBuildContext {
  currentPage: Page;
  transactions: Transaction[];
  bills: Bill[];
  contracts: Contract[];
  contractById: Map<string, Contract>;
  projectAgreements: ProjectAgreement[];
  rentalAgreements: RentalAgreement[];
  contacts: Contact[];
  accountById: Map<string, { name?: string }>;
  categoryById: Map<string, { name?: string }>;
  contactById: Map<string, Contact>;
  vendorById: Map<string, { name?: string }>;
}

/**
 * Pure search builder — no React, no dispatch. Keeps main thread work in one place for profiling.
 */
export function buildSearchRows(rawQuery: string, c: SearchBuildContext): BuiltSearchRow[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const results: BuiltSearchRow[] = [];
  const { currentPage } = c;

  switch (currentPage) {
    case 'transactions': {
      for (const tx of c.transactions) {
        if (results.length >= 20) break;
        const description = tx.description?.toLowerCase() || '';
        const account = c.accountById.get(tx.accountId || '')?.name?.toLowerCase() || '';
        const cat = c.categoryById.get(tx.categoryId || '')?.name?.toLowerCase() || '';
        const contact = c.contactById.get(tx.contactId || '')?.name?.toLowerCase() || '';
        const amount = tx.amount.toString();
        if (
          description.includes(q) ||
          account.includes(q) ||
          cat.includes(q) ||
          contact.includes(q) ||
          amount.includes(q)
        ) {
          const accName = c.accountById.get(tx.accountId || '')?.name || 'Unknown';
          results.push({
            id: tx.id,
            type: 'Transaction',
            title: tx.description || 'No description',
            subtitle: `${accName} • ${CURRENCY}${tx.amount.toFixed(2)} • ${formatDate(tx.date)}`,
            session: { key: 'openTransactionId', value: tx.id },
            page: 'transactions',
          });
        }
      }
      break;
    }

    case 'bills': {
      for (const bill of c.bills) {
        if (results.length >= 20) break;
        const billNumber = bill.billNumber?.toLowerCase() || '';
        const description = bill.description?.toLowerCase() || '';
        const vendorFromContact = bill.contactId ? c.contactById.get(bill.contactId)?.name?.toLowerCase() : '';
        const vendorFromVendor = bill.vendorId ? c.vendorById.get(bill.vendorId)?.name?.toLowerCase() : '';
        const vendor = vendorFromContact || vendorFromVendor || '';
        const contract = (bill.contractId ? c.contractById.get(bill.contractId)?.name : undefined)?.toLowerCase() || '';
        const amount = bill.amount.toString();
        if (
          billNumber.includes(q) ||
          description.includes(q) ||
          vendor.includes(q) ||
          contract.includes(q) ||
          amount.includes(q)
        ) {
          const vendorName =
            (bill.vendorId ? c.vendorById.get(bill.vendorId)?.name : undefined) ||
            (bill.contactId ? c.contactById.get(bill.contactId)?.name : undefined) ||
            'Unknown';
          results.push({
            id: bill.id,
            type: 'Bill',
            title: bill.billNumber || 'No number',
            subtitle: `${vendorName} • ${CURRENCY}${bill.amount.toFixed(2)} • ${formatDate(bill.issueDate)}`,
            session: { key: 'openBillId', value: bill.id },
            page: 'bills',
          });
        }
      }
      break;
    }

    case 'projectManagement': {
      let contractCount = 0;
      for (const contract of c.contracts) {
        if (contractCount >= 20) break;
        const contractNumber = contract.contractNumber?.toLowerCase() || '';
        const name = contract.name?.toLowerCase() || '';
        const vendor = c.vendorById.get(contract.vendorId || '')?.name?.toLowerCase() || '';
        if (contractNumber.includes(q) || name.includes(q) || vendor.includes(q)) {
          contractCount += 1;
          const vendorName = c.vendorById.get(contract.vendorId || '')?.name || 'Unknown';
          results.push({
            id: contract.id,
            type: 'Contract',
            title: contract.name || contract.contractNumber || 'No name',
            subtitle: `${vendorName} • ${CURRENCY}${contract.totalAmount.toFixed(2)}`,
            session: { key: 'openContractId', value: contract.id },
            page: 'projectManagement',
          });
        }
      }
      let agreementCount = 0;
      for (const agreement of c.projectAgreements) {
        if (agreementCount >= 10) break;
        const agreementNumber = agreement.agreementNumber?.toLowerCase() || '';
        const client = c.contactById.get(agreement.clientId || '')?.name?.toLowerCase() || '';
        if (agreementNumber.includes(q) || client.includes(q)) {
          agreementCount += 1;
          const clientName = c.contactById.get(agreement.clientId || '')?.name || 'Unknown';
          results.push({
            id: agreement.id,
            type: 'Project Agreement',
            title: agreement.agreementNumber || 'No number',
            subtitle: `${clientName} • ${CURRENCY}${agreement.sellingPrice.toFixed(2)}`,
            session: { key: 'openProjectAgreementId', value: agreement.id },
            page: 'projectManagement',
          });
        }
      }
      break;
    }

    case 'rentalAgreements': {
      for (const agreement of c.rentalAgreements) {
        if (results.length >= 20) break;
        const agreementNumber = agreement.agreementNumber?.toLowerCase() || '';
        const tenant = c.contactById.get(agreement.contactId || '')?.name?.toLowerCase() || '';
        if (agreementNumber.includes(q) || tenant.includes(q)) {
          const tenantName = c.contactById.get(agreement.contactId || '')?.name || 'Unknown';
          results.push({
            id: agreement.id,
            type: 'Rental Agreement',
            title: agreement.agreementNumber || 'No number',
            subtitle: `${tenantName} • ${CURRENCY}${agreement.monthlyRent.toFixed(2)}/month`,
            session: { key: 'openRentalAgreementId', value: agreement.id },
            page: 'rentalAgreements',
          });
        }
      }
      break;
    }

    case 'vendorDirectory':
    case 'contacts': {
      for (const contact of c.contacts) {
        if (results.length >= 20) break;
        const name = contact.name?.toLowerCase() || '';
        const description = contact.description?.toLowerCase() || '';
        const type = contact.type?.toLowerCase() || '';
        if (name.includes(q) || description.includes(q) || type.includes(q)) {
          if (currentPage === 'vendorDirectory') {
            results.push({
              id: contact.id,
              type: contact.type || 'Contact',
              title: contact.name || 'No name',
              subtitle: contact.description || contact.type || '',
              session: { key: 'openVendorId', value: contact.id },
              page: 'vendorDirectory',
            });
          } else {
            results.push({
              id: contact.id,
              type: contact.type || 'Contact',
              title: contact.name || 'No name',
              subtitle: contact.description || contact.type || '',
              page: 'settings',
              editing: { type: `CONTACT_${contact.type}`, id: contact.id },
            });
          }
        }
      }
      break;
    }

    default: {
      for (const contact of c.contacts) {
        if (results.length >= 10) break;
        if (contact.name?.toLowerCase().includes(q)) {
          results.push({
            id: contact.id,
            type: contact.type || 'Contact',
            title: contact.name || 'No name',
            subtitle: contact.type || '',
            page: 'settings',
            editing: { type: `CONTACT_${contact.type}`, id: contact.id },
          });
        }
      }
      break;
    }
  }

  return results;
}
