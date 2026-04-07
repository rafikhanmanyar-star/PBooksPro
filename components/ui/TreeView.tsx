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
    /** When nodes show `value`, label for the right column (e.g. provisional PM fee). */
    valueColumnHeader?: string;
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
        <div className={`${level > 0 ? (showLines ? 'ml-4 border-l border-app-border pl-4' : 'ml-6') : ''}`}>
            <div 
                className={`flex items-center py-1.5 rounded px-1 -mx-1 transition-colors duration-ds cursor-pointer ${
                    isSelected 
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
                            setIsExpanded(!isExpanded);
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
}) => {
    // Support both 'nodes' and 'treeData' props for backward compatibility
    const data = nodes || treeData || [];
    
    // Defensive check: if no data, render nothing
    if (!data || data.length === 0) {
        return (
            <div className={`${className} text-sm text-app-muted italic p-2`}>
                No items to display
            </div>
        );
    }
    
    return (
        <div className={`${className}`}>
            {valueColumnHeader ? (
                <div className="flex items-center gap-1 px-1 pb-2 mb-1 border-b border-app-border text-[10px] font-bold text-app-muted uppercase tracking-wider">
                    <span className="flex-1 pl-6">Project</span>
                    <span className="shrink-0 tabular-nums max-w-[9rem] text-right">{valueColumnHeader}</span>
                </div>
            ) : null}
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
