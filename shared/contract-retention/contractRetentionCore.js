import { BLOCK_PAYMENTS_ABOVE_RETENTION_LIMIT, RETENTION_WARNING_RATIO, } from './types.js';
const MONEY_EPS = 0.01;
export function roundMoney(n) {
    return Math.round(n * 100) / 100;
}
export function normalizeRetentionType(raw) {
    const v = String(raw ?? 'NONE').trim().toUpperCase().replace(/\s+/g, '_');
    if (v === 'PERCENTAGE' || v === 'FIXED_AMOUNT' || v === 'FIXED') {
        return v === 'FIXED' ? 'FIXED_AMOUNT' : v;
    }
    return 'NONE';
}
export function calculateRetentionAmount(contractValue, fields) {
    const type = fields.retentionType ?? 'NONE';
    const value = roundMoney(Math.max(0, contractValue));
    if (type === 'NONE' || value <= 0)
        return 0;
    if (type === 'PERCENTAGE') {
        const pct = Number(fields.retentionPercentage);
        if (!Number.isFinite(pct) || pct <= 0)
            return 0;
        return roundMoney(Math.min(value, (value * pct) / 100));
    }
    if (type === 'FIXED_AMOUNT') {
        const fixed = Number(fields.retentionAmount);
        if (!Number.isFinite(fixed) || fixed <= 0)
            return 0;
        return roundMoney(Math.min(value, fixed));
    }
    return 0;
}
export function calculateMaximumPayable(contractValue, retentionAmount) {
    const value = roundMoney(Math.max(0, contractValue));
    const retention = roundMoney(Math.max(0, retentionAmount));
    return roundMoney(Math.max(0, value - retention));
}
export function resolveRetentionAlertLevel(paidAmount, maximumPayable, hasRetention) {
    if (!hasRetention || maximumPayable <= 0)
        return 'none';
    const paid = roundMoney(Math.max(0, paidAmount));
    const max = roundMoney(maximumPayable);
    if (paid >= max - MONEY_EPS)
        return 'critical';
    if (paid >= roundMoney(max * RETENTION_WARNING_RATIO) - MONEY_EPS)
        return 'warning';
    return 'none';
}
export function buildRetentionSummary(input) {
    const contractValue = roundMoney(Math.max(0, input.contractValue));
    const paidAmount = roundMoney(Math.max(0, input.paidAmount));
    const retentionAmount = calculateRetentionAmount(contractValue, input.fields);
    const maximumPayable = calculateMaximumPayable(contractValue, retentionAmount);
    const retentionReleased = roundMoney(Math.max(0, input.fields.retentionReleased ?? 0));
    const retentionHeld = roundMoney(Math.max(0, retentionAmount - retentionReleased));
    const remainingPayable = roundMoney(Math.max(0, maximumPayable - paidAmount));
    const outstandingAmount = roundMoney(Math.max(0, contractValue - paidAmount));
    const hasRetention = (input.fields.retentionType ?? 'NONE') !== 'NONE' && retentionAmount > 0;
    const warningThreshold = roundMoney(maximumPayable * RETENTION_WARNING_RATIO);
    return {
        contractValue,
        retentionAmount,
        maximumPayable,
        paidAmount,
        outstandingAmount,
        retentionHeld,
        retentionReleased,
        remainingRetention: retentionHeld,
        remainingPayable,
        warningThreshold,
        alertLevel: resolveRetentionAlertLevel(paidAmount, maximumPayable, hasRetention),
    };
}
export function validateRetentionThreshold(input) {
    const projectedPaid = roundMoney(Math.max(0, input.projectedPaidAmount ?? input.paidAmount));
    const summary = buildRetentionSummary({
        contractValue: input.contractValue,
        paidAmount: projectedPaid,
        fields: input.fields,
    });
    const currency = input.currencyLabel ?? '';
    const prefix = currency ? `${currency} ` : '';
    if (summary.alertLevel === 'critical') {
        return {
            ...summary,
            title: 'Retention Threshold Reached',
            message: `Payments have reached the maximum payable amount excluding retention.\n\n` +
                `Paid Amount: ${prefix}${summary.paidAmount.toLocaleString()}\n` +
                `Payable Limit: ${prefix}${summary.maximumPayable.toLocaleString()}\n\n` +
                `Further payments may exceed the retained amount.`,
        };
    }
    if (summary.alertLevel === 'warning') {
        return {
            ...summary,
            title: 'Contract Nearing Retention Limit',
            message: `Contract nearing retention limit.\n\n` +
                `Paid Amount: ${prefix}${summary.paidAmount.toLocaleString()}\n` +
                `Remaining Before Retention: ${prefix}${summary.remainingPayable.toLocaleString()}`,
        };
    }
    return summary;
}
export function shouldBlockPaymentAboveRetentionLimit(validation) {
    if (!BLOCK_PAYMENTS_ABOVE_RETENTION_LIMIT)
        return false;
    return validation.alertLevel === 'critical';
}
export function computeRetentionBalanceOnSave(contractValue, fields) {
    const retentionAmount = calculateRetentionAmount(contractValue, fields);
    const released = roundMoney(Math.max(0, fields.retentionReleased ?? 0));
    const balance = roundMoney(Math.max(0, retentionAmount - released));
    return { retentionBalance: balance, retentionReleased: released };
}
