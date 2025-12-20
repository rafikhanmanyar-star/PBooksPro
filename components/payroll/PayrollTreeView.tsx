
import React, { useState } from 'react';
import { ICONS, CURRENCY } from '../../constants';

export interface PayrollTreeNode {
    id: string;
    name: string;
    type: 'project' | 'building' | 'staff';
    children: PayrollTreeNode[];
    count?: number;
    amount?: number;
}

interface PayrollTreeViewProps {
    treeData: PayrollTreeNode[];
    selectedId: string | null;
    onSelect: (id: string, type: 'project' | 'building' | 'staff', parentId?: string) => void;
}

const TreeItem: React.FC<{ 
    node: PayrollTreeNode; 
    selectedId: string | null; 
    onSelect: (id: string, type: 'project' | 'building' | 'staff', parentId?: string) => void; 
    level?: number;
    parentId?: string;
}> = ({ node, selectedId, onSelect, level = 0, parentId }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const isSelected = selectedId === node.id;
    const hasChildren = node.children.length > 0;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    const handleSelect = () => {
        if (hasChildren) setIsExpanded(true);
        onSelect(node.id, node.type, parentId);
    };

    const paddingLeft = `${level * 12 + 8}px`;
    
    const getIcon = () => {
        if (node.type === 'project') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isSelected ? 'text-white' : 'text-indigo-500'}>
                    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
                    <path d="M12 12v.01"/>
                </svg>
            );
        }
        if (node.type === 'building') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isSelected ? 'text-white' : 'text-emerald-500'}>
                    <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                    <path d="M9 22v-4h6v4" />
                    <path d="M8 6h.01" />
                    <path d="M16 6h.01" />
                    <path d="M8 10h.01" />
                    <path d="M16 10h.01" />
                    <path d="M8 14h.01" />
                    <path d="M16 14h.01" />
                </svg>
            );
        }
        // Staff
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isSelected ? 'text-white' : 'text-slate-400'}>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        );
    };

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
                <div className="flex items-center gap-3 truncate min-w-0">
                    {hasChildren ? (
                        <span 
                            onClick={handleToggle}
                            className={`transform transition-transform p-0.5 rounded ${isExpanded ? 'rotate-90' : ''} ${isSelected ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200'} flex-shrink-0`}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </span>
                    ) : (
                        <span className="w-5 h-5 inline-block flex-shrink-0"></span>
                    )}
                    
                    <span className={`w-4 h-4 flex-shrink-0`}>{getIcon()}</span>
                    <span className="truncate text-sm" title={node.name}>{node.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    {node.amount !== undefined && node.amount > 0 && (
                        <span className={`text-xs font-medium whitespace-nowrap ${isSelected ? 'text-rose-200' : 'text-rose-600'}`}>
                            {CURRENCY} {node.amount.toLocaleString()}
                        </span>
                    )}
                    {node.count !== undefined && (
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{node.count}</span>
                    )}
                </div>
            </button>
            
            {isExpanded && hasChildren && (
                <ul className="space-y-0.5 mt-0.5 border-l border-slate-200 ml-4">
                    {node.children.map(childNode => (
                        <TreeItem 
                            key={childNode.id} 
                            node={childNode} 
                            selectedId={selectedId} 
                            onSelect={onSelect}
                            level={level + 1}
                            parentId={node.id}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

const PayrollTreeView: React.FC<PayrollTreeViewProps> = ({ treeData, selectedId, onSelect }) => {
    return (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-2 h-full overflow-y-auto">
            <ul className="space-y-1">
                {treeData.map(node => (
                    <TreeItem 
                        key={node.id} 
                        node={node} 
                        selectedId={selectedId} 
                        onSelect={onSelect} 
                    />
                ))}
            </ul>
        </div>
    );
};

export default PayrollTreeView;
