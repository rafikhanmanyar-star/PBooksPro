
import React, { useState, useMemo, useCallback } from 'react';
import { ICONS, CURRENCY } from '../../constants';

export interface BillTreeNode {
    id: string;
    name: string;
    type: 'group' | 'vendor'; // group = Project/Building
    children: BillTreeNode[];
    count: number;
    amount: number;
    balance: number;
}

type SortKey = 'name' | 'balance' | 'count';
type SortDirection = 'asc' | 'desc';

interface BillTreeViewProps {
    treeData: BillTreeNode[];
    selectedNodeId: string | null;
    selectedParentId?: string | null;
    onNodeSelect: (id: string, type: 'group' | 'vendor', parentId?: string) => void;
}

const TreeItem: React.FC<{ 
    node: BillTreeNode; 
    selectedNodeId: string | null;
    selectedParentId?: string | null;
    onNodeSelect: (id: string, type: 'group' | 'vendor', parentId?: string) => void; 
    parentId?: string;
    level?: number 
}> = ({ node, selectedNodeId, selectedParentId, onNodeSelect, parentId, level = 0 }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Only select if ID matches AND (it's a group OR the parent context matches)
    const isSelected = selectedNodeId === node.id && (node.type === 'group' || selectedParentId === parentId);
    
    const hasChildren = node.children && node.children.length > 0;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    const handleSelect = () => {
        if (node.type === 'group') {
            setIsExpanded(true);
        }
        onNodeSelect(node.id, node.type, parentId);
    };

    const paddingLeft = `${level * 12 + 8}px`;

    return (
        <li>
            <button 
                onClick={handleSelect}
                className={`w-full flex items-center justify-between text-left py-2 pr-2 rounded-md transition-all duration-200 
                    ${isSelected 
                        ? 'bg-indigo-600 text-white font-bold shadow-md transform scale-[1.02] origin-left z-10 relative' 
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                style={{ paddingLeft }}
            >
                <div className="flex items-center gap-2 truncate min-w-0">
                    {hasChildren ? (
                        <span 
                            onClick={handleToggle}
                            className={`transform transition-transform p-0.5 rounded ${isExpanded ? 'rotate-90' : ''} ${isSelected ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200'}`}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </span>
                    ) : (
                        <span className="w-5 h-5 inline-block"></span>
                    )}
                    
                    {node.type === 'group' ? (
                         <span className={`opacity-70 ${isSelected ? 'text-white' : 'text-slate-400'}`}>{ICONS.briefcase}</span>
                    ) : (
                         <span className={`opacity-70 ${isSelected ? 'text-white' : 'text-slate-400'}`}>{ICONS.users}</span>
                    )}

                    <span className="truncate text-sm" title={node.name}>{node.name}</span>
                </div>
                
                {node.balance > 0 ? (
                    <span className={`text-[10px] font-mono font-bold rounded px-1.5 py-0.5 ml-2 flex-shrink-0 ${isSelected ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                        {CURRENCY} {node.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                ) : (
                    node.count > 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ml-2 flex-shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {node.count}
                        </span>
                    )
                )}
            </button>
            
            {isExpanded && hasChildren && (
                <ul className="space-y-0.5 mt-0.5 border-l border-slate-200 ml-4">
                    {node.children.map(childNode => (
                        <TreeItem 
                            key={childNode.id} 
                            node={childNode} 
                            selectedNodeId={selectedNodeId}
                            selectedParentId={selectedParentId}
                            onNodeSelect={onNodeSelect}
                            parentId={node.id}
                            level={level + 1}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

const BillTreeView: React.FC<BillTreeViewProps> = ({ treeData, selectedNodeId, selectedParentId, onNodeSelect }) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'balance', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Recursive sort function
    const sortNodes = useCallback((nodes: BillTreeNode[]): BillTreeNode[] => {
        const sorted = [...nodes].sort((a, b) => {
            let aVal: any = a[sortConfig.key];
            let bVal: any = b[sortConfig.key];

            if (sortConfig.key === 'name') {
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

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-indigo-600 ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200/80 h-full flex flex-col overflow-hidden">
            {/* Sort Header */}
            <div className="px-2 py-2 border-b border-slate-200 flex-shrink-0 bg-slate-50">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        title="Sort by Name"
                    >
                        Name <SortIcon column="name" />
                    </button>
                    <div className="flex-1"></div>
                    <button
                        onClick={() => handleSort('balance')}
                        className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        title="Sort by Account Payable (Balance)"
                    >
                        Payable <SortIcon column="balance" />
                    </button>
                    <button
                        onClick={() => handleSort('count')}
                        className="flex items-center gap-1 hover:text-slate-900 cursor-pointer ml-2"
                        title="Sort by Count"
                    >
                        Count <SortIcon column="count" />
                    </button>
                </div>
            </div>
            
            {/* Tree Content */}
            <div className="flex-1 overflow-y-auto p-2">
                <ul className="space-y-1">
                    {sortedTreeData.map(node => (
                        <TreeItem 
                            key={node.id} 
                            node={node} 
                            selectedNodeId={selectedNodeId} 
                            selectedParentId={selectedParentId}
                            onNodeSelect={onNodeSelect} 
                        />
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default BillTreeView;
