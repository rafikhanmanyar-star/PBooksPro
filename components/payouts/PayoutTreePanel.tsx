import React from 'react';
import TreeView, { TreeNode } from '../ui/TreeView';

export interface PayoutTreeNode extends TreeNode {
    sortAmount?: number;
    /** Net balance for owner-income rows (signed); parent building totals sum this when present. */
    rollupSigned?: number;
}

export function filterPayoutTreeNodes(nodes: PayoutTreeNode[], query: string): PayoutTreeNode[] {
    if (!query.trim()) return nodes;
    const lower = query.trim().toLowerCase();
    const recur = (n: PayoutTreeNode): PayoutTreeNode | null => {
        const kids = n.children?.map(recur).filter((x): x is PayoutTreeNode => x !== null) ?? [];
        const self = n.label.toLowerCase().includes(lower);
        if (self || kids.length > 0) {
            return { ...n, children: kids.length ? kids : undefined };
        }
        return null;
    };
    return nodes.map(recur).filter((x): x is PayoutTreeNode => x !== null);
}

export function sortPayoutTreeNodes(
    nodes: PayoutTreeNode[],
    sortBy: 'name' | 'amount',
    direction: 'asc' | 'desc'
): PayoutTreeNode[] {
    const cmpName = (a: PayoutTreeNode, b: PayoutTreeNode) => {
        const c = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
        return direction === 'asc' ? c : -c;
    };
    const cmpAmount = (a: PayoutTreeNode, b: PayoutTreeNode) => {
        const diff = (a.sortAmount ?? 0) - (b.sortAmount ?? 0);
        return direction === 'asc' ? diff : -diff;
    };
    const sorted = [...nodes].sort((a, b) => {
        if (sortBy === 'amount') {
            const diff = (a.sortAmount ?? 0) - (b.sortAmount ?? 0);
            if (diff !== 0) return direction === 'asc' ? diff : -diff;
            return cmpName(a, b);
        }
        const c = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
        if (c !== 0) return direction === 'asc' ? c : -c;
        return cmpAmount(a, b);
    });
    return sorted.map(n => ({
        ...n,
        children: n.children?.length
            ? sortPayoutTreeNodes(n.children as PayoutTreeNode[], sortBy, direction)
            : undefined,
    }));
}

interface PayoutTreePanelProps {
    nodes: PayoutTreeNode[];
    selectedId: string | null;
    selectedParentId: string | null;
    onNodeSelect: (id: string, type?: string, parentId?: string | null) => void;
    valueColumnHeader: string;
    treeSortKey: 'name' | 'amount';
    treeSortDirection: 'asc' | 'desc';
    onTreeSortColumn: (column: 'label' | 'value') => void;
}

const PayoutTreePanel: React.FC<PayoutTreePanelProps> = ({
    nodes,
    selectedId,
    selectedParentId,
    onNodeSelect,
    valueColumnHeader,
    treeSortKey,
    treeSortDirection,
    onTreeSortColumn,
}) => {
    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden bg-app-card">
            <TreeView
                nodes={nodes}
                showLines
                defaultExpanded
                selectedId={selectedId}
                selectedParentId={selectedParentId}
                onSelect={onNodeSelect}
                valueColumnHeader={valueColumnHeader}
                labelColumnHeader="Entity"
                showExpandCollapseAll
                scrollableContent
                activeSortColumn={treeSortKey === 'name' ? 'label' : 'value'}
                sortDirection={treeSortDirection}
                onSortColumn={onTreeSortColumn}
            />
        </div>
    );
};

export default PayoutTreePanel;
