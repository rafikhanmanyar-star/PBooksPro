import type { ProjectAgreement, RentalAgreement, Transaction } from '../types';
import { TransactionType } from '../types';

export type CommissionCategoryIds = {
    brokerFeeCategoryId?: string;
    rebateCategoryId?: string;
};

/**
 * For broker-fee / rebate commission expenses, attribute the payment to the broker currently on the
 * linked agreement (project rebate broker or rental broker) when `agreementId` is set.
 * Otherwise keeps `contactId` (payee on the transaction).
 *
 * This keeps broker payout balances and "paid already" in sync when broker info is edited on an agreement.
 */
export function getEffectiveCommissionBrokerContactId(
    tx: Transaction,
    opts: CommissionCategoryIds & {
        projectAgreements: ProjectAgreement[];
        rentalAgreements: RentalAgreement[];
    }
): string | undefined {
    if (tx.type !== TransactionType.EXPENSE) return tx.contactId || undefined;
    const cid = tx.categoryId;
    const catMatch =
        (opts.brokerFeeCategoryId && cid === opts.brokerFeeCategoryId) ||
        (opts.rebateCategoryId && cid === opts.rebateCategoryId);
    if (!catMatch) return tx.contactId || undefined;

    const aid = tx.agreementId?.trim();
    if (!aid) return tx.contactId || undefined;

    const pa = opts.projectAgreements.find((p) => p.id === aid);
    if (pa) {
        return pa.rebateBrokerId?.trim() || tx.contactId || undefined;
    }

    const ra = opts.rentalAgreements.find((r) => r.id === aid);
    if (ra) {
        return ra.brokerId?.trim() || tx.contactId || undefined;
    }

    return tx.contactId || undefined;
}
