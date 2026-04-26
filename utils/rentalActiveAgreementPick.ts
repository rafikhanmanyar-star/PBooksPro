import { RentalAgreement, RentalAgreementStatus } from '../types';
import { parseYyyyMmDdToLocalDate, toDateOnly } from './dateUtils';

/**
 * Choose which ACTIVE agreement drives property-level UI (visual layout card, quick panel).
 * Ignores Renewed / Terminated / Expired. If several ACTIVE rows exist, prefers the renewal-chain
 * leaf (not referenced as `previousAgreementId` by another ACTIVE on the same property), then
 * latest end date, then latest start date.
 */
export function pickDisplayActiveAgreement(actives: RentalAgreement[]): RentalAgreement {
    if (actives.length === 1) return actives[0];
    const leaves = actives.filter((a) => !actives.some((o) => o.previousAgreementId === a.id));
    const pool = leaves.length > 0 ? leaves : actives;
    return pool.reduce((best, cur) => {
        const bestEnd = parseYyyyMmDdToLocalDate(toDateOnly(best.endDate)).getTime();
        const curEnd = parseYyyyMmDdToLocalDate(toDateOnly(cur.endDate)).getTime();
        if (curEnd !== bestEnd) return curEnd > bestEnd ? cur : best;
        const bestStart = parseYyyyMmDdToLocalDate(toDateOnly(best.startDate)).getTime();
        const curStart = parseYyyyMmDdToLocalDate(toDateOnly(cur.startDate)).getTime();
        return curStart >= bestStart ? cur : best;
    });
}

export function getDisplayActiveAgreementForProperty(
    agreements: RentalAgreement[],
    propertyId: string,
): RentalAgreement | null {
    const pid = String(propertyId);
    const actives = agreements.filter(
        (a) =>
            a.propertyId != null &&
            String(a.propertyId) === pid &&
            a.status === RentalAgreementStatus.ACTIVE,
    );
    if (actives.length === 0) return null;
    return pickDisplayActiveAgreement(actives);
}

export function buildActiveAgreementByPropertyId(agreements: RentalAgreement[]): Map<string, RentalAgreement> {
    const byProp = new Map<string, RentalAgreement[]>();
    for (const agreement of agreements) {
        if (agreement.status !== RentalAgreementStatus.ACTIVE || agreement.propertyId == null || agreement.propertyId === '') {
            continue;
        }
        const propertyId = String(agreement.propertyId);
        let arr = byProp.get(propertyId);
        if (!arr) {
            arr = [];
            byProp.set(propertyId, arr);
        }
        arr.push(agreement);
    }
    const result = new Map<string, RentalAgreement>();
    for (const [propertyId, actives] of byProp) {
        result.set(propertyId, pickDisplayActiveAgreement(actives));
    }
    return result;
}
