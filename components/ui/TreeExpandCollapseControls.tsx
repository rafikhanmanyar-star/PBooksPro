import React, { useMemo } from 'react';
import { treeHasAnyExpandedBranch } from './treeExpandCollapseUtils';

export interface TreeExpandCollapseControlsProps {
    /** IDs of every expandable parent in the tree. */
    allExpandableIds: readonly string[];
    /** Currently expanded node IDs (must match the same tree as `allExpandableIds`). */
    expandedIds: Set<string>;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    disabled?: boolean;
    /** When false, nothing is rendered (e.g. no expandable rows). */
    visible?: boolean;
    className?: string;
    /** Tighter padding and icons for dense sidebars */
    compact?: boolean;
    /** Styling preset to match host (slate = bills/contacts orange-adjacent; app = theme tokens) */
    variant?: 'slate' | 'app';
}

/** Hierarchy visible (branches open) — next action is collapse all. */
function TreeBranchesOpenIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
        >
            <path
                d="M2 2.5h4v3H2v-3zm0 8h4v3H2v-3zM8 3.5h6M8 11.5h6"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
            />
            <path
                d="M6 4h1.5v7.5H6"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
            />
        </svg>
    );
}

/** Flat / folded — next action is expand all. */
function TreeBranchesClosedIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
        >
            <path
                d="M2 4.5h12M2 8h12M2 11.5h12"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * Single toggle: collapses all expandable parents when any branch is open; expands all when everything is collapsed.
 * Icon and aria-expanded reflect whether any branch is open.
 */
const TreeExpandCollapseControls: React.FC<TreeExpandCollapseControlsProps> = ({
    allExpandableIds,
    expandedIds,
    onExpandAll,
    onCollapseAll,
    disabled = false,
    visible = true,
    className = '',
    compact = true,
    variant = 'app',
}) => {
    const anyExpanded = useMemo(
        () => treeHasAnyExpandedBranch(expandedIds, allExpandableIds),
        [expandedIds, allExpandableIds]
    );
    if (!visible || allExpandableIds.length === 0) return null;

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (anyExpanded) onCollapseAll();
        else onExpandAll();
    };

    const baseBtn =
        variant === 'slate'
            ? 'rounded-md border border-slate-200/80 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none shadow-sm'
            : 'rounded-md border border-app-border bg-app-surface-2 text-app-muted hover:text-app-text hover:bg-app-toolbar disabled:opacity-40 disabled:pointer-events-none';

    const foldedHighlightStyles =
        variant === 'slate'
            ? 'data-tree-folded:bg-slate-200/90 data-tree-folded:border-slate-300 data-tree-folded:text-slate-900'
            : 'data-tree-folded:bg-app-toolbar data-tree-folded:text-app-text data-tree-folded:border-app-border';

    const sz = compact ? 'w-7 h-7' : 'w-8 h-8';
    const iconWrap = compact ? 'w-4 h-4' : 'w-[18px] h-[18px]';

    return (
        <div className={`inline-flex items-center flex-shrink-0 ${className}`}>
            <button
                type="button"
                className={`${sz} inline-flex items-center justify-center transition-colors ${baseBtn} ${foldedHighlightStyles}`}
                data-tree-folded={anyExpanded ? undefined : ''}
                onClick={handleClick}
                disabled={disabled}
                title={anyExpanded ? 'Collapse all branches' : 'Expand all branches'}
                aria-label={anyExpanded ? 'Collapse all branches' : 'Expand all branches'}
            >
                <span className={`${iconWrap} block`}>
                    {anyExpanded ? (
                        <TreeBranchesOpenIcon className="w-full h-full" />
                    ) : (
                        <TreeBranchesClosedIcon className="w-full h-full" />
                    )}
                </span>
            </button>
        </div>
    );
};

export default TreeExpandCollapseControls;
