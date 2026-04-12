import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ICONS } from '../../constants';
import TreeExpandCollapseControls from './TreeExpandCollapseControls';
import { collectExpandableParentIds } from './treeExpandCollapseUtils';

export interface TreeNode {
    id: string;
    label: string;
    value?: string | number;
    valueColor?: string;
    icon?: React.ReactNode;
    children?: TreeNode[];
    isExpanded?: boolean;
    type?: string; // For selection tracking
}

interface TreeViewProps {
    nodes?: TreeNode[];
    treeData?: TreeNode[]; // Alias for nodes (backward compatibility)
    className?: string;
    showLines?: boolean;
    defaultExpanded?: boolean;
    selectedId?: string | null; // Currently selected node ID
    selectedParentId?: string | null; // Parent of the selected node (for scoped selection)
    onSelect?: (id: string, type?: string, parentId?: string | null) => void; // Selection callback
    /** When nodes show `value`, label for the right column (e.g. amount due). */
    valueColumnHeader?: string;
    /** Label for the left column when `valueColumnHeader` is set (default: Project). */
    labelColumnHeader?: string;
    /** Show expand/collapse-all controls in the header row (when a header is shown) or above the tree. */
    showExpandCollapseAll?: boolean;
    /** When true, node list scrolls inside a flex child (parent should be flex column with a bounded height). */
    scrollableContent?: boolean;
    /** Column sort affordance when `onSortColumn` is set. */
    activeSortColumn?: 'label' | 'value' | null;
    sortDirection?: 'asc' | 'desc';
    onSortColumn?: (column: 'label' | 'value') => void;
}

const TreeNodeItem: React.FC<{
    node: TreeNode;
    level: number;
    showLines: boolean;
    selectedId?: string | null;
    selectedParentId?: string | null;
    onSelect?: (id: string, type?: string, parentId?: string | null) => void;
    parentId?: string | null;
    expandedIds: Set<string>;
    toggleExpanded: (id: string) => void;
}> = ({ node, level, showLines, selectedId, selectedParentId, onSelect, parentId, expandedIds, toggleExpanded }) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedId === node.id &&
        (selectedParentId === undefined || selectedParentId === parentId);

    const handleClick = () => {
        if (onSelect) {
            onSelect(node.id, node.type, parentId);
        }
    };

    return (
        <div className={`${level > 0 ? (showLines ? 'ml-4 border-l border-app-border pl-4' : 'ml-6') : ''}`}>
            <div
                className={`flex items-center py-1.5 rounded px-1 -mx-1 transition-colors duration-ds cursor-pointer ${isSelected
                    ? 'bg-nav-active text-app-text'
                    : 'hover:bg-app-toolbar/60'
                    }`}
                onClick={handleClick}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(node.id);
                        }}
                        className="w-5 h-5 flex items-center justify-center text-app-muted hover:text-app-text mr-1"
                    >
                        {isExpanded ? ICONS.chevronDown : ICONS.chevronRight}
                    </button>
                ) : (
                    <span className="w-5 h-5 mr-1" />
                )}

                {node.icon && <span className="mr-2 text-app-muted">{node.icon}</span>}

                <span className={`flex-1 text-sm font-medium ${isSelected ? 'text-primary' : 'text-app-text'}`}>
                    {node.label}
                </span>

                {node.value !== undefined && (
                    <span
                        className={`text-sm font-semibold tabular-nums ${node.valueColor || (isSelected ? 'text-primary' : 'text-app-text')}`}
                    >
                        {typeof node.value === 'number'
                            ? (node.value === 0 || Object.is(node.value, -0) ? '0' : node.value.toLocaleString())
                            : node.value}
                    </span>
                )}
            </div>

            {hasChildren && isExpanded && (
                <div className="mt-0.5">
                    {node.children!.map(child => (
                        <TreeNodeItem
                            key={`${parentId ?? 'root'}::${child.id}`}
                            node={child}
                            level={level + 1}
                            showLines={showLines}
                            selectedId={selectedId}
                            selectedParentId={selectedParentId}
                            onSelect={onSelect}
                            parentId={node.id}
                            expandedIds={expandedIds}
                            toggleExpanded={toggleExpanded}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const TreeView: React.FC<TreeViewProps> = ({
    nodes,
    treeData,
    className = '',
    showLines = true,
    defaultExpanded = true,
    selectedId,
    selectedParentId,
    onSelect,
    valueColumnHeader,
    labelColumnHeader = 'Project',
    showExpandCollapseAll = true,
    scrollableContent = false,
    activeSortColumn = null,
    sortDirection = 'desc',
    onSortColumn,
}) => {
    const data = nodes || treeData || [];

    const allExpandableIds = useMemo(() => collectExpandableParentIds(data), [data]);

    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        if (!defaultExpanded || allExpandableIds.length === 0) return new Set();
        return new Set(allExpandableIds);
    });

    useEffect(() => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            allExpandableIds.forEach(id => {
                if (defaultExpanded) next.add(id);
            });
            return next;
        });
    }, [allExpandableIds, defaultExpanded]);

    const toggleExpanded = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleExpandAll = useCallback(() => {
        setExpandedIds(new Set(allExpandableIds));
    }, [allExpandableIds]);

    const handleCollapseAll = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const hasExpandable = allExpandableIds.length > 0;
    const showControls = showExpandCollapseAll && hasExpandable;

    const SortHeaderIcon = ({ column }: { column: 'label' | 'value' }) => (
        <span className="ml-0.5 text-[9px] text-app-muted inline tabular-nums">
            {activeSortColumn === column ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const labelHeaderEl = onSortColumn ? (
        <button
            type="button"
            onClick={e => {
                e.stopPropagation();
                onSortColumn('label');
            }}
            className="flex-1 pl-6 min-w-0 text-left flex items-center hover:bg-app-toolbar/50 rounded px-0.5 -mx-0.5 transition-colors"
        >
            <span>{labelColumnHeader}</span>
            <SortHeaderIcon column="label" />
        </button>
    ) : (
        <span className="flex-1 pl-6 min-w-0">{labelColumnHeader}</span>
    );

    const valueHeaderEl = onSortColumn ? (
        <button
            type="button"
            onClick={e => {
                e.stopPropagation();
                onSortColumn('value');
            }}
            className="shrink-0 tabular-nums max-w-[7rem] text-right hover:bg-app-toolbar/50 rounded px-0.5 -mx-0.5 transition-colors inline-flex items-center justify-end gap-0"
        >
            <span>{valueColumnHeader}</span>
            <SortHeaderIcon column="value" />
        </button>
    ) : (
        <span className="shrink-0 tabular-nums max-w-[9rem] text-right">{valueColumnHeader}</span>
    );

    const nodeList = data.map(node => (
        <TreeNodeItem
            key={node.id}
            node={node}
            level={0}
            showLines={showLines}
            selectedId={selectedId}
            selectedParentId={selectedParentId}
            onSelect={onSelect}
            parentId={null}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
        />
    ));

    if (!data || data.length === 0) {
        return (
            <div className={`${className} text-sm text-app-muted italic p-2`}>
                No items to display
            </div>
        );
    }

    const inner = (
        <>
            {valueColumnHeader ? (
                <div className="flex-shrink-0 flex items-center gap-2 px-1 pb-2 mb-1 border-b border-app-border text-[10px] font-bold text-app-muted uppercase tracking-wider">
                    {labelHeaderEl}
                    {showControls && (
                        <TreeExpandCollapseControls
                            variant="app"
                            allExpandableIds={allExpandableIds}
                            expandedIds={expandedIds}
                            onExpandAll={handleExpandAll}
                            onCollapseAll={handleCollapseAll}
                            visible={showControls}
                        />
                    )}
                    {valueHeaderEl}
                </div>
            ) : showControls ? (
                <div className="flex justify-end mb-1.5 flex-shrink-0">
                    <TreeExpandCollapseControls
                        variant="app"
                        allExpandableIds={allExpandableIds}
                        expandedIds={expandedIds}
                        onExpandAll={handleExpandAll}
                        onCollapseAll={handleCollapseAll}
                        visible={showControls}
                    />
                </div>
            ) : null}
            {scrollableContent ? (
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-[color:var(--border-color)] scrollbar-track-transparent pr-0.5">
                    {nodeList}
                </div>
            ) : (
                nodeList
            )}
        </>
    );

    return (
        <div className={`${scrollableContent ? 'flex flex-col min-h-0 h-full' : ''} ${className}`}>
            {inner}
        </div>
    );
};

export default TreeView;
