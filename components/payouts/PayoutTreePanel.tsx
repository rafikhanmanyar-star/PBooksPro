import React from 'react';
import TreeView, { TreeNode } from '../ui/TreeView';

export interface PayoutTreeNode extends TreeNode {
    sortAmount?: number;
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

export function sortPayoutTreeNodes(nodes: PayoutTreeNode[], sortBy: 'name' | 'amount'): PayoutTreeNode[] {
    const sorted = [...nodes].sort((a, b) => {
        if (sortBy === 'amount') {
            const diff = (b.sortAmount ?? 0) - (a.sortAmount ?? 0);
            if (diff !== 0) return diff;
        }
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
    return sorted.map(n => ({
        ...n,
        children: n.children?.length ? sortPayoutTreeNodes(n.children as PayoutTreeNode[], sortBy) : undefined,
    }));
}

interface PayoutTreePanelProps {
    nodes: PayoutTreeNode[];
    selectedId: string | null;
    selectedParentId: string | null;
    onNodeSelect: (id: string, type?: string, parentId?: string | null) => void;
    valueColumnHeader: string;
}

const PayoutTreePanel: React.FC<PayoutTreePanelProps> = ({
    nodes,
    selectedId,
    selectedParentId,
    onNodeSelect,
    valueColumnHeader,
}) => {
    return (
        <div className="flex flex-col h-full min-h-0 border border-app-border rounded-xl bg-app-card overflow-hidden p-2">
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
            />
        </div>
    );
};

export default PayoutTreePanel;
