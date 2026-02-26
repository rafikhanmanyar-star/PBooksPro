import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ICONS, CURRENCY } from '../../constants';

export interface ARTreeNode {
  id: string;
  name: string;
  type: 'building' | 'property' | 'tenant' | 'owner' | 'vendor' | 'bearer';
  outstanding: number;
  overdue: number;
  invoiceCount: number;
  children?: ARTreeNode[];
}

interface ARTreeViewProps {
  treeData: ARTreeNode[];
  selectedNodeId: string | null;
  onNodeSelect: (node: ARTreeNode) => void;
  searchQuery?: string;
  /** Column header for the amount column (default: "A/R") */
  amountLabel?: string;
  /** Label shown after overdue amount (default: "overdue") */
  overdueLabel?: string;
  /** Empty state text (default: "No receivables found") */
  emptyText?: string;
}

type SortKey = 'name' | 'outstanding';
type SortDirection = 'asc' | 'desc';

const formatAmount = (amount: number): string => {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const TreeItem: React.FC<{
  node: ARTreeNode;
  selectedNodeId: string | null;
  onNodeSelect: (node: ARTreeNode) => void;
  level: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  searchQuery?: string;
  overdueLabel: string;
}> = React.memo(({ node, selectedNodeId, onNodeSelect, level, expandedIds, onToggleExpand, searchQuery, overdueLabel }) => {
  const isSelected = selectedNodeId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const hasOverdue = node.overdue > 0;

  const isSearchMatch = searchQuery
    ? node.name.toLowerCase().includes(searchQuery.toLowerCase())
    : false;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  const handleSelect = () => {
    onNodeSelect(node);
  };

  return (
    <>
      <div
        onClick={handleSelect}
        className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors text-sm border-b border-slate-100 ${
          isSelected
            ? 'bg-indigo-600 text-white'
            : isSearchMatch
              ? 'bg-amber-50 hover:bg-amber-100'
              : hasOverdue
                ? 'hover:bg-rose-50/50'
                : 'hover:bg-slate-50'
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className={`flex items-center justify-center w-4 h-4 rounded flex-shrink-0 transition-colors ${
              isSelected ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200'
            }`}
          >
            <svg
              className={`w-2.5 h-2.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              viewBox="0 0 6 10" fill="currentColor"
            >
              <path d="M1 1l4 4-4 4" strokeWidth="0" />
            </svg>
          </button>
        ) : (
          <span className="w-4 inline-block flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="truncate font-medium" title={node.name}>
            {node.name}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 tabular-nums ${
            isSelected
              ? 'bg-white/20 text-white/90'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {node.invoiceCount}
          </span>
        </div>

        <div className="flex-shrink-0 text-right ml-2">
          <div className={`text-xs font-semibold tabular-nums ${
            isSelected ? 'text-white' : 'text-slate-800'
          }`}>
            {formatAmount(node.outstanding)}
          </div>
          {hasOverdue && (
            <div className={`text-[10px] tabular-nums ${
              isSelected ? 'text-rose-200' : 'text-rose-600'
            }`}>
              {formatAmount(node.overdue)} {overdueLabel}
            </div>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        node.children!.map(child => (
          <TreeItem
            key={child.id}
            node={child}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
            level={level + 1}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            searchQuery={searchQuery}
            overdueLabel={overdueLabel}
          />
        ))
      )}
    </>
  );
});

const ARTreeView: React.FC<ARTreeViewProps> = ({
  treeData,
  selectedNodeId,
  onNodeSelect,
  searchQuery,
  amountLabel = 'A/R',
  overdueLabel = 'overdue',
  emptyText = 'No receivables found',
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'outstanding',
    direction: 'desc',
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (searchQuery) {
      const allIds = new Set<string>();
      const collectMatchParents = (nodes: ARTreeNode[], parentIds: string[]) => {
        for (const node of nodes) {
          const matches = node.name.toLowerCase().includes(searchQuery.toLowerCase());
          if (matches) {
            parentIds.forEach(id => allIds.add(id));
          }
          if (node.children) {
            collectMatchParents(node.children, [...parentIds, node.id]);
          }
        }
      };
      collectMatchParents(treeData, []);
      setExpandedIds(allIds);
    } else {
      setExpandedIds(new Set(treeData.map(n => n.id)));
    }
  }, [searchQuery, treeData]);

  const onToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSort = (key: SortKey) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortNodes = useCallback((nodes: ARTreeNode[]): ARTreeNode[] => {
    const sorted = [...nodes].sort((a, b) => {
      if (sortConfig.key === 'name') {
        const cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      const diff = a.outstanding - b.outstanding;
      return sortConfig.direction === 'asc' ? diff : -diff;
    });

    return sorted.map(node => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }));
  }, [sortConfig]);

  const sortedTreeData = useMemo(() => sortNodes(treeData), [treeData, sortNodes]);

  const totalOutstanding = useMemo(
    () => treeData.reduce((sum, n) => sum + n.outstanding, 0),
    [treeData]
  );
  const totalOverdue = useMemo(
    () => treeData.reduce((sum, n) => sum + n.overdue, 0),
    [treeData]
  );

  const SortIcon = ({ column }: { column: SortKey }) => (
    <span className="ml-0.5 text-[9px] text-slate-400">
      {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex-shrink-0">
        <div
          className="flex-1 px-2 py-1.5 cursor-pointer hover:bg-slate-100 select-none"
          onClick={() => handleSort('name')}
        >
          Entity <SortIcon column="name" />
        </div>
        <div
          className="w-24 px-2 py-1.5 text-right cursor-pointer hover:bg-slate-100 select-none"
          onClick={() => handleSort('outstanding')}
        >
          {amountLabel} <SortIcon column="outstanding" />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sortedTreeData.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-sm italic">
            {emptyText}
          </div>
        ) : (
          sortedTreeData.map(node => (
            <TreeItem
              key={node.id}
              node={node}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              level={0}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              searchQuery={searchQuery}
              overdueLabel={overdueLabel}
            />
          ))
        )}
      </div>

      {/* Footer Total */}
      <div className="flex items-center border-t border-slate-200 bg-slate-50 px-2 py-1.5 flex-shrink-0">
        <div className="flex-1 text-xs font-bold text-slate-700">Total</div>
        <div className="text-right">
          <div className="text-xs font-bold text-slate-800 tabular-nums">
            {CURRENCY} {totalOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          {totalOverdue > 0 && (
            <div className="text-[10px] font-semibold text-rose-600 tabular-nums">
              {CURRENCY} {totalOverdue.toLocaleString(undefined, { maximumFractionDigits: 0 })} {overdueLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ARTreeView;
