import { roundMoney } from '../contract-retention/contractRetentionCore.js';

const MONEY_EPS = 0.01;

export type ContractBillAmountValidation = {
  exceeds: boolean;
  remaining: number;
  alreadyBilled: number;
  contractValue: number;
  message?: string;
};

export function getContractBilledTotal(
  bills: Array<{ contractId?: string; amount: number; id?: string }>,
  contractId: string,
  excludeBillId?: string
): number {
  let sum = 0;
  for (const bill of bills) {
    if (bill.contractId !== contractId) continue;
    if (excludeBillId && bill.id === excludeBillId) continue;
    const amt = typeof bill.amount === 'number' ? bill.amount : Number(bill.amount) || 0;
    sum += amt;
  }
  return roundMoney(sum);
}

export function getContractRemainingBillable(contractValue: number, alreadyBilled: number): number {
  return roundMoney(Math.max(0, contractValue - alreadyBilled));
}

export function validateContractBillAmount(input: {
  contractValue: number;
  alreadyBilled: number;
  billAmount: number;
  contractNumber?: string;
  currencyLabel?: string;
}): ContractBillAmountValidation {
  const contractValue = roundMoney(Math.max(0, input.contractValue));
  const alreadyBilled = roundMoney(Math.max(0, input.alreadyBilled));
  const billAmount = roundMoney(Math.max(0, input.billAmount));
  const remaining = getContractRemainingBillable(contractValue, alreadyBilled);
  const currency = input.currencyLabel?.trim() || '';
  const ref = input.contractNumber?.trim() ? ` (${input.contractNumber.trim()})` : '';

  if (billAmount > remaining + MONEY_EPS) {
    const prefix = currency ? `${currency} ` : '';
    return {
      exceeds: true,
      remaining,
      alreadyBilled,
      contractValue,
      message:
        `Bill amount cannot exceed the remaining contract value of ${prefix}${remaining.toLocaleString()}${ref}. ` +
        `Contract value: ${prefix}${contractValue.toLocaleString()}, already billed: ${prefix}${alreadyBilled.toLocaleString()}.`,
    };
  }

  return {
    exceeds: false,
    remaining,
    alreadyBilled,
    contractValue,
  };
}
