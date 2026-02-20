import React, { useState } from 'react';
import { ICONS } from '../../constants';

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
}

const TreeNodeItem: React.FC<{
    node: TreeNode;
    level: number;
    showLines: boolean;
    selectedId?: string | null;
    selectedParentId?: string | null;
    onSelect?: (id: string, type?: string, parentId?: string | null) => void;
    parentId?: string | null;
}> = ({ node, level, showLines, selectedId, selectedParentId, onSelect, parentId }) => {
    const [isExpanded, setIsExpanded] = useState(node.isExpanded ?? true);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedId === node.id && 
        (selectedParentId === undefined || selectedParentId === parentId);

    const handleClick = () => {
        if (onSelect) {
            onSelect(node.id, node.type, parentId);
        }
    };

    return (
        <div className={`${level > 0 ? (showLines ? 'ml-4 border-l border-slate-200 pl-4' : 'ml-6') : ''}`}>
            <div 
                className={`flex items-center py-1.5 rounded px-1 -mx-1 transition-colors cursor-pointer ${
                    isSelected 
                        ? 'bg-indigo-100 text-indigo-900' 
                        : 'hover:bg-slate-50'
                }`}
                onClick={handleClick}
            >
                {hasChildren ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 mr-1"
                    >
                        {isExpanded ? ICONS.chevronDown : ICONS.chevronRight}
                    </button>
                ) : (
                    <span className="w-5 h-5 mr-1" />
                )}
                
                {node.icon && <span className="mr-2 text-slate-500">{node.icon}</span>}
                
                <span className={`flex-1 text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                    {node.label}
                </span>
                
                {node.value !== undefined && (
                    <span
                        className={`text-sm font-semibold tabular-nums ${node.valueColor || (isSelected ? 'text-indigo-900' : 'text-slate-900')}`}
                    >
                        {typeof node.value === 'number' ? node.value.toLocaleString() : node.value}
                    </span>
                )}
            </div>
            
            {hasChildren && isExpanded && (
                <div className="mt-0.5">
                    {node.children!.map(child => (
                        <TreeNodeItem
                            key={child.id}
                            node={child}
                            level={level + 1}
                            showLines={showLines}
                            selectedId={selectedId}
                            selectedParentId={selectedParentId}
                            onSelect={onSelect}
                            parentId={node.id}
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
}) => {
    // Support both 'nodes' and 'treeData' props for backward compatibility
    const data = nodes || treeData || [];
    
    // Defensive check: if no data, render nothing
    if (!data || data.length === 0) {
        return (
            <div className={`${className} text-sm text-slate-400 italic p-2`}>
                No items to display
            </div>
        );
    }
    
    return (
        <div className={`${className}`}>
            {data.map(node => (
                <TreeNodeItem
                    key={node.id}
                    node={{ ...node, isExpanded: node.isExpanded ?? defaultExpanded }}
                    level={0}
                    showLines={showLines}
                    selectedId={selectedId}
                    selectedParentId={selectedParentId}
                    onSelect={onSelect}
                    parentId={null}
                />
            ))}
        </div>
    );
};

export default TreeView;
