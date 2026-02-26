import React, { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { List } from 'react-window';
import { ARTreeNode, ViewBy, AgingFilter, rentalArApi } from '../../services/api/rentalArApi';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

export interface RentalARTreeViewProps {
  viewBy: ViewBy;
  aging: AgingFilter;
  search: string;
  onInvoiceClick?: (invoiceId: string) => void;
  onRecordPayment?: (invoiceId: string) => void;
}

const ROW_HEIGHT = 40;
const STICKY_RIGHT_WIDTH = 320;

function AgingBadge({ node }: { node: ARTreeNode }) {
  const buckets = node.agingBuckets;
  if (!buckets) return null;
  const { days30, days60, days90, days90plus } = buckets;
  const overdue = days30 + days60 + days90 + days90plus;
  if (overdue <= 0) return <span className="text-xs text-slate-400">Current</span>;
  const parts: string[] = [];
  if (days90plus > 0) parts.push('90+');
  if (days90 > 0) parts.push('61-90');
  if (days60 > 0) parts.push('31-60');
  if (days30 > 0) parts.push('0-30');
  return (
    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
      {parts.join(', ')}
    </span>
  );
}

interface FlatRow {
  node: ARTreeNode;
  depth: number;
  parentType: ViewBy;
}

function flattenTree(
  rootNodes: ARTreeNode[],
  expandedIds: Set<string>,
  childrenCache: Map<string, ARTreeNode[]>,
  viewBy: ViewBy
): FlatRow[] {
  const out: FlatRow[] = [];
  function walk(nodes: ARTreeNode[], depth: number, parentType: ViewBy) {
    for (const node of nodes) {
      out.push({ node, depth, parentType });
      if (expandedIds.has(node.id) && node.hasChildren) {
        const key = `${parentType}:${node.id}`;
        const children = childrenCache.get(key);
        if (children && children.length > 0) {
          const childType = node.type as ViewBy;
          walk(children, depth + 1, childType);
        }
      }
    }
  }
  walk(rootNodes, 0, viewBy);
  return out;
}

const RentalARTreeView: React.FC<RentalARTreeViewProps> = ({
  viewBy,
  aging,
  search,
  onInvoiceClick,
  onRecordPayment,
}) => {
  const { showToast } = useNotification();
  const [rootNodes, setRootNodes] = useState<ARTreeNode[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Map<string, ARTreeNode[]>>(new Map());

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await rentalArApi.getSummary({ groupBy: viewBy, aging, search: search || undefined });
      setRootNodes(res.nodes || []);
      setExpandedIds(new Set());
      setChildrenCache(new Map());
    } catch (e: any) {
      showToast(e?.message || 'Failed to load AR summary');
      setRootNodes([]);
    } finally {
      setLoadingSummary(false);
    }
  }, [viewBy, aging, search, showToast]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const loadChildren = useCallback(
    async (parentType: ViewBy, parentId: string) => {
      const key = `${parentType}:${parentId}`;
      if (childrenCache.has(key)) return;
      setLoadingChildren(prev => new Set(prev).add(parentId));
      try {
        const res = await rentalArApi.getChildren({ parentType, parentId, viewBy });
        const nodes = res.nodes || [];
        setChildrenCache(prev => new Map(prev).set(key, nodes));
      } catch (e: any) {
        showToast(e?.message || 'Failed to load children');
      } finally {
        setLoadingChildren(prev => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
    },
    [viewBy, childrenCache, showToast]
  );

  const toggleExpand = useCallback(
    (row: FlatRow) => {
      const { node, parentType } = row;
      if (!node.hasChildren || node.type === 'invoice') return;
      const key = `${parentType}:${node.id}`;
      const alreadyExpanded = expandedIds.has(node.id);
      if (alreadyExpanded) {
        setExpandedIds(prev => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
        return;
      }
      setExpandedIds(prev => new Set(prev).add(node.id));
      if (!childrenCache.has(key)) {
        loadChildren(parentType, node.id);
      }
    },
    [expandedIds, childrenCache, loadChildren]
  );

  const flatRows = useMemo(
    () => flattenTree(rootNodes, expandedIds, childrenCache, viewBy),
    [rootNodes, expandedIds, childrenCache, viewBy]
  );

  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listSize, setListSize] = useState({ height: 400, width: 800 });
  useLayoutEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { height, width } = entries[0]?.contentRect ?? {};
      if (typeof height === 'number' && height > 0 && typeof width === 'number' && width > 0) {
        setListSize({ height: Math.max(100, height), width });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isExpanded = (id: string) => expandedIds.has(id);
  const isLoading = (id: string) => loadingChildren.has(id);

  const Row = useCallback(
    ({ index, style, ariaAttributes }: { index: number; style: React.CSSProperties; ariaAttributes?: { role: string; 'aria-posinset': number; 'aria-setsize': number } }) => {
      const row = flatRows[index];
      if (!row) return null;
      const { node, depth } = row;
      const expanded = isExpanded(node.id);
      const loading = isLoading(node.id);
      const canExpand = node.hasChildren && node.type !== 'invoice';
      const showSpinner = canExpand && loading;
      const isInvoice = node.type === 'invoice';

      return (
        <div
          style={style}
          {...(ariaAttributes || {})}
          className={`flex items-center border-b border-slate-200 text-sm hover:bg-slate-50 ${isInvoice ? 'cursor-pointer' : ''}`}
          onClick={() => {
            if (isInvoice) {
              onInvoiceClick?.(node.id);
            } else if (canExpand) {
              toggleExpand(row);
            }
          }}
        >
          <div
            className="flex items-center min-w-0 flex-1 pl-2 pr-2"
            style={{ paddingLeft: 8 + depth * 20 }}
          >
            {canExpand ? (
              <button
                type="button"
                className="p-0.5 rounded flex-shrink-0 text-slate-400 hover:bg-slate-200"
                onClick={e => {
                  e.stopPropagation();
                  toggleExpand(row);
                }}
              >
                {showSpinner ? (
                  <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-accent rounded-full animate-spin" />
                ) : (
                  <div className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}>
                    {ICONS.chevronRight}
                  </div>
                )}
              </button>
            ) : (
              <span className="w-4 inline-block flex-shrink-0" />
            )}
            <span className="truncate ml-1" title={node.name}>
              {node.name}
            </span>
            {node.invoiceCount != null && node.invoiceCount > 0 && (
              <span className="text-slate-400 text-xs ml-1">({node.invoiceCount})</span>
            )}
          </div>
          <div className="flex items-center flex-shrink-0 gap-2 pr-2" style={{ width: STICKY_RIGHT_WIDTH }}>
            <div className="text-right tabular-nums w-24 font-medium text-slate-800">
              {CURRENCY} {(node.outstanding ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-right tabular-nums w-20 text-rose-600">
              {(node.overdue ?? 0) > 0
                ? `${CURRENCY} ${(node.overdue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : '-'}
            </div>
            <div className="w-20 flex justify-end">
              <AgingBadge node={node} />
            </div>
            {isInvoice && (
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={e => {
                  e.stopPropagation();
                  onRecordPayment?.(node.id);
                }}
              >
                Pay
              </button>
            )}
          </div>
        </div>
      );
    },
    [flatRows, toggleExpand, onInvoiceClick, onRecordPayment]
  );

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500">
        <span>Loading AR summary...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-[1fr_320px] border-b border-slate-200 bg-slate-100 font-semibold text-xs text-slate-600 uppercase tracking-wider sticky top-0 z-10">
        <div className="px-2 py-2">Name</div>
        <div className="flex items-center gap-2 pr-2">
          <div className="text-right w-24">Outstanding</div>
          <div className="text-right w-20">Overdue</div>
          <div className="w-20 flex justify-end">Aging</div>
          <div className="w-10" />
        </div>
      </div>
      <div ref={listContainerRef} className="flex-1 min-h-0">
        {flatRows.length === 0 ? (
          <div className="p-4 text-center text-slate-500 italic">No receivables match the current filters.</div>
        ) : (
          <List
            rowCount={flatRows.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={Row}
            rowProps={{}}
            defaultHeight={listSize.height}
            defaultWidth={listSize.width}
            style={{ height: listSize.height, width: listSize.width }}
            overscanCount={8}
          />
        )}
      </div>
    </div>
  );
};

export default RentalARTreeView;
