import type { Bill, Transaction } from '../../types';
import type { ContractorLedgerAdvance, VendorBillSettlementRow } from '../../services/api/contractorApi';

export type BillsSortKey =
  | 'issueDate'
  | 'entityName'
  | 'dueDate'
  | 'amount'
  | 'status'
  | 'balance'
  | 'vendorName'
  | 'billNumber'
  | 'contract'
  | 'type';

export interface BillsTableRow {
  id: string;
  type: 'bill' | 'payment' | 'advance' | 'vendor_settlement';
  bill?: Bill;
  payment?: Transaction;
  advance?: ContractorLedgerAdvance;
  vendorSettlement?: VendorBillSettlementRow;
  date: string;
  billNumber?: string;
  vendorName?: string;
  projectName?: string;
  contractNumber?: string;
  dueDate?: string;
  amount: number;
  status?: string;
  balance?: number;
}
