import type { AppState } from '../../types';
import type { TreeNode } from '../ui/TreeView';
import {
    getLedgerOwnerIdsForProperty,
    isFormerOwner,
    getOwnershipSharesForPropertyOnDate,
} from '../../services/propertyOwnershipService';
import { toLocalDateString } from '../../utils/dateUtils';

/** Initial tree selection: first owner in portfolio order until the user picks a node explicitly. */
export const TREE_SELECT_AUTO = '__portfolio_auto_first_owner__';

export function pruneTreeNodesBySearchQuery(nodes: TreeNode[], query: string): TreeNode[] {
    const t = query.trim().toLowerCase();
    if (!t) return nodes;
    const labelMatches = (label: string) => label.toLowerCase().includes(t);
    const prune = (node: TreeNode): TreeNode | null => {
        const childList = node.children;
        if (!childList?.length) {
            return labelMatches(node.label) ? node : null;
        }
        const nextChildren = childList
            .map(prune)
            .filter((n): n is TreeNode => n !== null);
        if (labelMatches(node.label) || nextChildren.length > 0) {
            return { ...node, children: nextChildren.length ? nextChildren : undefined };
        }
        return null;
    };
    return nodes.map(prune).filter((n): n is TreeNode => n !== null);
}

export function collectTreeNodeIds(nodes: TreeNode[]): Set<string> {
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

export function findFirstOwnerTreeIdInNodes(nodes: TreeNode[]): string | null {
    for (const n of nodes) {
        if (n.id.startsWith('owner:')) return n.id;
        if (n.children?.length) {
            const inner = findFirstOwnerTreeIdInNodes(n.children);
            if (inner) return inner;
        }
    }
    return null;
}

/** Building → owner → unit tree for rental reports (matches Owner Rental Income). */
export function buildRentalPortfolioTreeNodes(state: AppState): TreeNode[] {
    const buildingNodes: TreeNode[] = state.buildings
        .map((building) => {
            const propsInBuilding = state.properties.filter((p) => p.buildingId === building.id);

            const ownerIdSet = new Set<string>();
            const ownerIds: string[] = [];
            for (const p of propsInBuilding) {
                const all = getLedgerOwnerIdsForProperty(state, p.id);
                for (const oid of all) {
                    if (!ownerIdSet.has(oid)) {
                        ownerIdSet.add(oid);
                        ownerIds.push(oid);
                    }
                }
            }

            const todayStr = toLocalDateString(new Date());
            const ownerChildren: TreeNode[] = ownerIds
                .map((ownerId) => {
                    const owner = state.contacts.find((c) => c.id === ownerId);
                    const ownerLabelBase = owner?.name ?? 'Owner';
                    const former = isFormerOwner(state, ownerId);
                    const unitChildren: TreeNode[] = propsInBuilding
                        .filter((p) => {
                            const owners = getLedgerOwnerIdsForProperty(state, p.id);
                            return owners.has(ownerId);
                        })
                        .map((prop) => {
                            const shares = getOwnershipSharesForPropertyOnDate(state, prop.id, todayStr);
                            const ownerShare = shares.find((s) => s.ownerId === ownerId);
                            const pctSuffix =
                                shares.length > 1 && ownerShare ? ` (${ownerShare.percentage.toFixed(0)}%)` : '';
                            return {
                                id: `unit:${prop.id}:${ownerId}`,
                                label: `${prop.name}${pctSuffix}`,
                                type: 'unit' as const,
                            };
                        });
                    unitChildren.sort((a, b) => a.label.localeCompare(b.label));
                    let ownerLabel = ownerLabelBase;
                    if (former) ownerLabel += ' (Former)';
                    return {
                        id: `owner:${ownerId}`,
                        label: ownerLabel,
                        type: 'owner',
                        children: unitChildren.length ? unitChildren : undefined,
                    } as TreeNode;
                });
            ownerChildren.sort((a, b) => a.label.localeCompare(b.label));

            return {
                id: `building:${building.id}`,
                label: building.name,
                type: 'building',
                children: ownerChildren.length ? ownerChildren : undefined,
            };
        })
        .filter((n) => !!n.children?.length);
    buildingNodes.sort((a, b) => a.label.localeCompare(b.label));
    return buildingNodes;
}

export function resolvePortfolioTreeSelection(
    treeSelId: string,
    properties: AppState['properties']
): { selectedBuildingId: string; selectedOwnerId: string; selectedUnitId: string } {
    if (treeSelId === 'all') {
        return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
    }
    if (treeSelId.startsWith('building:')) {
        const id = treeSelId.slice('building:'.length);
        return { selectedBuildingId: id, selectedOwnerId: 'all', selectedUnitId: 'all' };
    }
    if (treeSelId.startsWith('owner:')) {
        const id = treeSelId.slice('owner:'.length);
        return { selectedBuildingId: 'all', selectedOwnerId: id, selectedUnitId: 'all' };
    }
    if (treeSelId.startsWith('unit:')) {
        const rest = treeSelId.slice('unit:'.length);
        const colonIdx = rest.indexOf(':');
        const propertyIdStr = colonIdx === -1 ? rest : rest.slice(0, colonIdx);
        const ownerFromTree = colonIdx === -1 ? undefined : rest.slice(colonIdx + 1);
        const property = properties.find((p) => String(p.id) === propertyIdStr);
        if (!property) return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
        return {
            selectedBuildingId: property.buildingId || 'all',
            selectedOwnerId: ownerFromTree || 'all',
            selectedUnitId: property.id,
        };
    }
    return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
}
