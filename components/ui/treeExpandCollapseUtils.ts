/**
 * Collects ids of every node that has children (expandable parents) in a depth-first walk.
 */
export function collectExpandableParentIds<T extends { id: string; children?: T[] | undefined }>(
    nodes: T[] | undefined | null
): string[] {
    const ids: string[] = [];
    if (!nodes?.length) return ids;
    const walk = (n: T) => {
        const ch = n.children;
        if (ch && ch.length > 0) {
            ids.push(n.id);
            ch.forEach(walk);
        }
    };
    nodes.forEach(walk);
    return ids;
}

/** Invoice tree nodes: expandable when there are child groups or invoices at this level. */
export function collectInvoiceTreeExpandableIds<T extends { id: string; children: T[]; invoices: unknown[] }>(
    nodes: T[]
): string[] {
    const ids: string[] = [];
    const walk = (n: T) => {
        const expandable = (n.children?.length ?? 0) > 0 || (n.invoices?.length ?? 0) > 0;
        if (expandable) ids.push(n.id);
        n.children?.forEach(walk);
    };
    nodes.forEach(walk);
    return ids;
}

/** True if any expandable parent is currently expanded. */
export function treeHasAnyExpandedBranch(
    expandedIds: Set<string>,
    allExpandableIds: readonly string[]
): boolean {
    if (allExpandableIds.length === 0) return false;
    return allExpandableIds.some(id => expandedIds.has(id));
}
