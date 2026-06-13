import type { Bill, Contract } from '../types';
import {
  getContractBilledTotal,
  getContractRemainingBillable,
  validateContractBillAmount,
  type ContractBillAmountValidation,
} from '../shared/contract-billing/contractBillingCore';

export {
  getContractBilledTotal,
  getContractRemainingBillable,
  validateContractBillAmount,
  type ContractBillAmountValidation,
};

export function validateBillAgainstContract(input: {
  contract: Contract | undefined;
  bills: Bill[];
  billAmount: number;
  excludeBillId?: string;
  currencyLabel?: string;
}): ContractBillAmountValidation | null {
  if (!input.contract?.id) return null;

  const alreadyBilled = getContractBilledTotal(input.bills, input.contract.id, input.excludeBillId);
  return validateContractBillAmount({
    contractValue: input.contract.totalAmount ?? 0,
    alreadyBilled,
    billAmount: input.billAmount,
    contractNumber: input.contract.contractNumber,
    currencyLabel: input.currencyLabel,
  });
}
