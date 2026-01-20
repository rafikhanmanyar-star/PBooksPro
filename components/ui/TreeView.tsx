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
}

interface TreeViewProps {
    nodes: TreeNode[];
    className?: string;
    showLines?: boolean;
    defaultExpanded?: boolean;
}

const TreeNodeItem: React.FC<{
    node: TreeNode;
    level: number;
    showLines: boolean;
}> = ({ node, level, showLines }) => {
    const [isExpanded, setIsExpanded] = useState(node.isExpanded ?? true);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div className={`${level > 0 ? (showLines ? 'ml-4 border-l border-slate-200 pl-4' : 'ml-6') : ''}`}>
            <div className="flex items-center py-1.5 hover:bg-slate-50 rounded px-1 -mx-1 transition-colors">
                {hasChildren ? (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 mr-1"
                    >
                        {isExpanded ? ICONS.chevronDown : ICONS.chevronRight}
                    </button>
                ) : (
                    <span className="w-5 h-5 mr-1" />
                )}
                
                {node.icon && <span className="mr-2 text-slate-500">{node.icon}</span>}
                
                <span className="flex-1 text-sm font-medium text-slate-700">{node.label}</span>
                
                {node.value !== undefined && (
                    <span
                        className={`text-sm font-semibold tabular-nums ${node.valueColor || 'text-slate-900'}`}
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const TreeView: React.FC<TreeViewProps> = ({
    nodes,
    className = '',
    showLines = true,
    defaultExpanded = true,
}) => {
    return (
        <div className={`${className}`}>
            {nodes.map(node => (
                <TreeNodeItem
                    key={node.id}
                    node={{ ...node, isExpanded: node.isExpanded ?? defaultExpanded }}
                    level={0}
                    showLines={showLines}
                />
            ))}
        </div>
    );
};

export default TreeView;
