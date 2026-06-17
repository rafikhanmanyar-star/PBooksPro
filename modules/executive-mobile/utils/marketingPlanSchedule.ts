import { formatDate } from '../../../utils/dateUtils';

export type MobilePlanScheduleRow = {
  label: string;
  due: string;
  amount: number;
  balance: number;
};

function frequencyMonths(frequency?: string): number {
  if (frequency === 'Quarterly') return 3;
  if (frequency === 'Yearly') return 12;
  return 1;
}

/** Build a compact payment schedule from stored plan amounts (mobile approval view). */
export function buildMobileInstallmentSchedule(plan: {
  netValue?: number;
  downPaymentAmount?: number;
  installmentAmount?: number;
  totalInstallments?: number;
  frequency?: string;
}): MobilePlanScheduleRow[] {
  const netValue = plan.netValue ?? 0;
  const dpAmount = plan.downPaymentAmount ?? 0;
  const installmentAmount = plan.installmentAmount ?? 0;
  const totalInstallments = Math.max(0, plan.totalInstallments ?? 0);
  const freqMonths = frequencyMonths(plan.frequency);

  const rows: MobilePlanScheduleRow[] = [];
  let balance = netValue;

  if (dpAmount > 0) {
    balance = Math.max(0, netValue - dpAmount);
    rows.push({
      label: 'Down payment',
      due: 'At booking',
      amount: dpAmount,
      balance,
    });
  }

  const baseDate = new Date();
  for (let i = 1; i <= totalInstallments; i++) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(baseDate.getMonth() + i * freqMonths);
    const amount = i === totalInstallments ? balance : installmentAmount;
    balance = Math.max(0, balance - amount);
    rows.push({
      label: `Installment ${i}`,
      due: formatDate(dueDate.toISOString()),
      amount,
      balance,
    });
  }

  return rows;
}
