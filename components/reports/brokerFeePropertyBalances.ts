import type { AppState } from '../../types';
import { ContactType, TransactionType } from '../../types';
import { CURRENCY } from '../../constants';
import type { TreeNode } from '../ui/TreeView';

/** One property’s rental broker commission position for a broker (matches ledger: fees minus payments on that property). */
export interface BrokerPropertyBalanceRow {
    propertyId: string;
    propertyName: string;
    buildingName: string;
    /** Earliest qualifying agreement start date on this property (YYYY-MM-DD) for default chronological ordering. */
    earliestStartDate: string;
    agreementSummary: string;
    totalFee: number;
    paid: number;
    amountDue: number;
    agreements: { agreementId: string; agreementNumber: string; fee: number; startDate: string }[];
}

function brokerFeeCategoryIds(state: AppState): { fee?: string; rebate?: string } {
    return {
        fee: state.categories.find((c) => c.name === 'Broker Fee')?.id,
        rebate: state.categories.find((c) => c.name === 'Rebate Amount')?.id,
    };
}

/** Total broker-fee payments recorded against a rental property (expense, broker contact, no project). */
export function totalBrokerPaymentsOnProperty(
    state: AppState,
    brokerId: string,
    propertyId: string
): number {
    const { fee, rebate } = brokerFeeCategoryIds(state);
    const catOk = new Set([fee, rebate].filter(Boolean) as string[]);
    let sum = 0;
    for (const tx of state.transactions) {
        if (tx.type !== TransactionType.EXPENSE) continue;
        if (!tx.contactId || tx.contactId !== brokerId) continue;
        if (tx.projectId) continue;
        if (!tx.categoryId || !catOk.has(tx.categoryId)) continue;
        if (!tx.propertyId || String(tx.propertyId) !== String(propertyId)) continue;
        const a = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        if (!isNaN(a)) sum += a;
    }
    return sum;
}

/**
 * Per-property broker commission rows for one broker (non-renewal rental agreements only).
 * `amountDue` = max(0, sum(agreement fees) − all broker-fee payments on that property).
 */
export function getBrokerPropertyBalanceRows(state: AppState, brokerId: string): BrokerPropertyBalanceRow[] {
    const byProp = new Map<
        string,
        {
            agreements: { agreementId: string; agreementNumber: string; fee: number; startDate: string }[];
            propertyName: string;
            buildingName: string;
        }
    >();

    for (const ra of state.rentalAgreements) {
        if (ra.previousAgreementId) continue;
        if (!ra.brokerId || ra.brokerId !== brokerId || !ra.propertyId) continue;
        const feeN = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee) : Number(ra.brokerFee);
        if (isNaN(feeN) || feeN <= 0) continue;

        const pid = String(ra.propertyId);
        const prop = state.properties.find((p) => String(p.id) === pid);
        const building = prop?.buildingId
            ? state.buildings.find((b) => b.id === prop.buildingId)
            : undefined;

        let bucket = byProp.get(pid);
        if (!bucket) {
            bucket = {
                agreements: [],
                propertyName: prop?.name || 'Unit',
                buildingName: building?.name || '—',
            };
            byProp.set(pid, bucket);
        }
        const startD = (ra.startDate || '').slice(0, 10);
        bucket.agreements.push({
            agreementId: ra.id,
            agreementNumber: ra.agreementNumber || ra.id.slice(0, 8),
            fee: feeN,
            startDate: startD || '9999-12-31',
        });
    }

    const rows: BrokerPropertyBalanceRow[] = [];
    for (const [propertyId, b] of byProp) {
        const totalFee = b.agreements.reduce((s, a) => s + a.fee, 0);
        const paid = totalBrokerPaymentsOnProperty(state, brokerId, propertyId);
        const amountDue = Math.max(0, totalFee - paid);
        const earliestStartDate = b.agreements.reduce(
            (min, a) => (a.startDate < min ? a.startDate : min),
            b.agreements[0]?.startDate ?? '9999-12-31'
        );
        rows.push({
            propertyId,
            propertyName: b.propertyName,
            buildingName: b.buildingName,
            earliestStartDate,
            agreementSummary: b.agreements.map((a) => a.agreementNumber).join(', '),
            totalFee,
            paid,
            amountDue,
            agreements: b.agreements,
        });
    }

    rows.sort((a, b) => {
        const d = a.earliestStartDate.localeCompare(b.earliestStartDate);
        if (d !== 0) return d;
        return a.propertyName.localeCompare(b.propertyName, undefined, { sensitivity: 'base' });
    });
    return rows;
}

export const BROKER_TREE_SELECT_AUTO = '__broker_auto_first__';

export function findFirstBrokerTreeId(nodes: TreeNode[]): string | null {
    for (const n of nodes) {
        if (n.id.startsWith('broker:') && !n.id.startsWith('brokerprop:')) return n.id;
        if (n.children?.length) {
            const inner = findFirstBrokerTreeId(n.children);
            if (inner) return inner;
        }
    }
    return null;
}

function pruneBrokerTree(nodes: TreeNode[], query: string): TreeNode[] {
    const t = query.trim().toLowerCase();
    if (!t) return nodes;
    const labelMatches = (label: string) => label.toLowerCase().includes(t);
    const prune = (node: TreeNode): TreeNode | null => {
        const childList = node.children;
        if (!childList?.length) {
            return labelMatches(node.label) ? node : null;
        }
        const nextChildren = childList.map(prune).filter((n): n is TreeNode => n !== null);
        if (labelMatches(node.label) || nextChildren.length > 0) {
            return { ...node, children: nextChildren.length ? nextChildren : undefined };
        }
        return null;
    };
    return nodes.map(prune).filter((n): n is TreeNode => n !== null);
}

function collectIds(nodes: TreeNode[]): Set<string> {
    const ids = new Set<string>();
    const walk = (list: TreeNode[]) => {
        for (const n of list) {
            ids.add(n.id);
            if (n.children?.length) walk(n.children);
        }
    };
    walk(nodes);
    return ids;
}

/** Brokers (BROKER/DEALER) that have at least one qualifying rental agreement with a fee. */
export function buildBrokerFeeTreeNodes(state: AppState): TreeNode[] {
    const brokerIds = new Set<string>();
    for (const ra of state.rentalAgreements) {
        if (ra.previousAgreementId) continue;
        if (!ra.brokerId || !(ra.brokerFee || 0)) continue;
        brokerIds.add(ra.brokerId);
    }

    const brokerList = [...brokerIds]
        .map((id) => {
            const c = state.contacts.find((x) => x.id === id);
            return { id, name: c?.name || 'Broker', contact: c };
        })
        .filter((b) => {
            const t = b.contact?.type;
            return t === ContactType.BROKER || t === ContactType.DEALER || !b.contact;
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const nodes: TreeNode[] = brokerList.map((b) => {
        const rows = getBrokerPropertyBalanceRows(state, b.id);
        const children: TreeNode[] = rows.map((r) => {
            const dueLabel =
                r.amountDue > 0.01
                    ? ` — ${CURRENCY} ${r.amountDue.toLocaleString(undefined, { maximumFractionDigits: 2 })} due`
                    : '';
            return {
                id: `brokerprop:${b.id}:${r.propertyId}`,
                label: `${r.propertyName}${dueLabel}`,
                type: 'unit' as const,
            };
        });
        return {
            id: `broker:${b.id}`,
            label: b.name,
            type: 'owner' as const,
            children: children.length ? children : undefined,
        };
    });

    return nodes.filter((n) => !!n.children?.length);
}

export function buildBrokerFeeTreeData(
    state: AppState,
    treeSearchQuery: string
): { treeData: TreeNode[]; collectTreeNodeIds: Set<string> } {
    const allNode: TreeNode = { id: 'all', label: 'All Brokers', type: 'all' };
    const brokerRoots = pruneBrokerTree(buildBrokerFeeTreeNodes(state), treeSearchQuery);
    const treeData = [allNode, ...brokerRoots];
    return { treeData, collectTreeNodeIds: collectIds(treeData) };
}

export function resolveBrokerTreeSelection(id: string): { brokerId: string; propertyId: string } {
    if (id === 'all') return { brokerId: 'all', propertyId: 'all' };
    if (id.startsWith('brokerprop:')) {
        const rest = id.slice('brokerprop:'.length);
        const idx = rest.indexOf(':');
        if (idx === -1) return { brokerId: 'all', propertyId: 'all' };
        return { brokerId: rest.slice(0, idx), propertyId: rest.slice(idx + 1) };
    }
    if (id.startsWith('broker:')) {
        return { brokerId: id.slice('broker:'.length), propertyId: 'all' };
    }
    return { brokerId: 'all', propertyId: 'all' };
}
