import React from 'react';
import { ICONS } from '../../constants';

export interface TreeExpandCollapseControlsProps {
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

/**
 * Icon-only expand / collapse all for hierarchical trees (parent nodes).
 */
const TreeExpandCollapseControls: React.FC<TreeExpandCollapseControlsProps> = ({
    onExpandAll,
    onCollapseAll,
    disabled = false,
    visible = true,
    className = '',
    compact = true,
    variant = 'app',
}) => {
    if (!visible) return null;

    const baseBtn =
        variant === 'slate'
            ? 'rounded-md border border-slate-200/80 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none'
            : 'rounded-md border border-app-border bg-app-surface-2 text-app-muted hover:text-app-text hover:bg-app-toolbar disabled:opacity-40 disabled:pointer-events-none';

    const sz = compact ? 'w-6 h-6' : 'w-7 h-7';
    const iconWrap = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';

    return (
        <div
            className={`inline-flex items-center gap-0.5 flex-shrink-0 ${className}`}
            role="group"
            aria-label="Tree expand controls"
        >
            <button
                type="button"
                className={`${sz} inline-flex items-center justify-center transition-colors ${baseBtn}`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onExpandAll();
                }}
                disabled={disabled}
                title="Expand all"
                aria-label="Expand all branches"
            >
                <span className={`${iconWrap} block scale-90`}>{ICONS.chevronDown}</span>
            </button>
            <button
                type="button"
                className={`${sz} inline-flex items-center justify-center transition-colors ${baseBtn}`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCollapseAll();
                }}
                disabled={disabled}
                title="Collapse all"
                aria-label="Collapse all branches"
            >
                <span className={`${iconWrap} block scale-90`}>{ICONS.chevronRight}</span>
            </button>
        </div>
    );
};

export default TreeExpandCollapseControls;
