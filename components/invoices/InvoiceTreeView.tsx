
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Invoice } from '../../types';
import { ICONS, CURRENCY } from '../../constants';

export interface TreeNode {
    id: string;
    name: string;
    type: 'group' | 'subgroup'; // group = Building/Project, subgroup = Tenant/Owner
    children: TreeNode[]; // Nested groups
    invoices: Invoice[];  // Invoices at this level
    count: number;
    balance: number; // Account Receivable
}

interface InvoiceTreeViewProps {
    treeData: TreeNode[];
    selectedNodeId: string | null;
    onNodeSelect: (id: string, type: 'group' | 'subgroup' | 'invoice') => void;
    onContextMenu?: (node: TreeNode, event: React.MouseEvent) => void;
}

type SortKey = 'name' | 'count' | 'balance';
type SortDirection = 'asc' | 'desc';

const TreeItem: React.FC<{
    node: TreeNode;
    selectedNodeId: string | null;
    onNodeSelect: (id: string, type: 'group' | 'subgroup' | 'invoice') => void;
    onContextMenu?: (node: TreeNode, event: React.MouseEvent) => void;
    level?: number;
    colWidths: { count: number; balance: number };
}> = React.memo(({ node, selectedNodeId, onNodeSelect, onContextMenu, level = 0, colWidths }) => {
    const [isExpanded, setIsExpanded] = useState(true); // Default expanded for better visibility
    const isSelected = selectedNodeId === node.id;
    const hasChildren = node.children.length > 0 || node.invoices.length > 0;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    const handleSelect = () => {
        onNodeSelect(node.id, node.type);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onContextMenu && node.type === 'subgroup') {
            onContextMenu(node, e);
        }
    };

    // Indentation for the name column
    const paddingLeft = `${level * 16 + 8}px`;

    return (
        <div className="contents">
            <div
                onClick={handleSelect}
                onContextMenu={handleContextMenu}
                className={`group contents cursor-pointer text-sm transition-all duration-200`}
            >
                {/* Name Column (Fluid) */}
                <div
                    className={`p-2 border-b border-r border-slate-200 flex items-center gap-2 min-w-0 overflow-hidden transition-colors
                        ${isSelected
                            ? 'bg-indigo-600 text-white font-bold z-10 shadow-sm relative scale-[1.01] origin-left'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    style={{ paddingLeft }}
                >
                    {hasChildren ? (
                        <button
                            onClick={handleToggle}
                            className={`p-0.5 rounded flex-shrink-0 transition-colors ${isSelected ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200'}`}
                        >
                            <div className={`w-3 h-3 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                {ICONS.chevronRight}
                            </div>
                        </button>
                    ) : (
                        <span className="w-4 h-4 inline-block flex-shrink-0"></span>
                    )}
                    <span className="truncate" title={node.name}>{node.name}</span>
                </div>

                {/* Balance Column (Fixed/Resizable) */}
                <div
                    className={`p-2 border-b border-slate-200 text-right flex-shrink-0 tabular-nums text-xs transition-colors
                        ${isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'hover:bg-slate-50'
                        }`}
                    style={{ width: colWidths.balance }}
                >
                    {node.balance > 0 ? (
                        <span className={`font-semibold ${isSelected ? 'text-rose-200' : 'text-rose-600'}`}>
                            {node.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    ) : (
                        <span className={`${isSelected ? 'text-white/60' : 'text-emerald-600'}`}>-</span>
                    )}
                </div>
            </div>

            {isExpanded && (
                <>
                    {node.children.map(childNode => (
                        <TreeItem
                            key={childNode.id}
                            node={childNode}
                            selectedNodeId={selectedNodeId}
                            onNodeSelect={onNodeSelect}
                            onContextMenu={onContextMenu}
                            level={level + 1}
                            colWidths={colWidths}
                        />
                    ))}
                </>
            )}
        </div>
    );
});

const InvoiceTreeView: React.FC<InvoiceTreeViewProps> = ({ treeData, selectedNodeId, onNodeSelect, onContextMenu }) => {
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

    // Column Resizing State (Pixels)
    const [colWidths, setColWidths] = useState({ count: 64, balance: 96 });
    const resizingCol = useRef<SortKey | null>(null);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Recursive sort function
    const sortNodes = useCallback((nodes: TreeNode[]): TreeNode[] => {
        const sorted = [...nodes].sort((a, b) => {
            let aVal: any = a[sortConfig.key];
            let bVal: any = b[sortConfig.key];

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return sorted.map(node => ({
            ...node,
            children: sortNodes(node.children)
        }));
    }, [sortConfig]);

    const sortedTreeData = useMemo(() => sortNodes(treeData), [treeData, sortNodes]);

    // Resizing Logic
    const startResizing = (key: 'count' | 'balance') => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingCol.current = key;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingCol.current) return;
        const deltaX = e.movementX;
        setColWidths(prev => ({
            ...prev,
            [resizingCol.current!]: Math.max(40, prev[resizingCol.current!] + deltaX)
        }));
    }, []);

    const handleMouseUp = useCallback(() => {
        resizingCol.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, [handleMouseMove]);

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[9px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    // Dynamic grid template
    // Name col is 1fr (fluid), others are fixed pixel widths based on state
    const gridTemplateColumns = `1fr ${colWidths.balance}px`;

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-300 flex flex-col h-full overflow-hidden">
            {/* Header Row */}
            <div
                className="grid bg-slate-100 border-b border-slate-300 font-bold text-xs text-slate-600 uppercase tracking-wider sticky top-0 z-10"
                style={{ gridTemplateColumns }}
            >
                <div
                    className="p-2 border-r border-slate-300 cursor-pointer hover:bg-slate-200 flex items-center justify-between select-none"
                    onClick={() => handleSort('name')}
                >
                    Entity <SortIcon column="name" />
                </div>

                <div
                    className="p-2 text-right cursor-pointer hover:bg-slate-200 flex items-center justify-end relative select-none"
                    onClick={() => handleSort('balance')}
                >
                    A/R <SortIcon column="balance" />
                    <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20"
                        onMouseDown={startResizing('balance')}
                        onClick={e => e.stopPropagation()}
                    ></div>
                </div>
            </div>

            {/* Tree Content */}
            <div className="overflow-y-auto flex-grow">
                <div className="grid" style={{ gridTemplateColumns }}>
                    {sortedTreeData.map(node => (
                        <TreeItem
                            key={node.id}
                            node={node}
                            selectedNodeId={selectedNodeId}
                            onNodeSelect={onNodeSelect}
                            onContextMenu={onContextMenu}
                            colWidths={colWidths}
                        />
                    ))}
                    {sortedTreeData.length === 0 && (
                        <div className="col-span-2 p-4 text-center text-slate-500 italic text-sm">
                            No data found.
                        </div>
                    )}
                </div>
            </div>

            {/* Total Footer */}
            <div
                className="grid bg-slate-50 border-t border-slate-300 font-bold text-xs text-slate-700"
                style={{ gridTemplateColumns }}
            >
                <div className="p-2 text-left border-r border-slate-300">Total</div>
                <div className="p-2 text-right text-rose-600 tabular-nums">
                    {CURRENCY} {treeData.reduce((sum, n) => sum + n.balance, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
            </div>
        </div>
    );
};


export default InvoiceTreeView;
