import React, { useRef, useState, useEffect, useCallback } from 'react';

import { List } from 'react-window';

import { Invoice } from '../../types';

import { formatDate } from '../../utils/dateUtils';



const ROW_HEIGHT = 36;



export interface VirtualizedInvoiceTableProps {

  sortedInvoices: Invoice[];

  contactPropByInvoiceId: Map<string, { contactName: string; propertyName: string }>;

  selectedInvoiceIds: Set<string>;

  onInvoiceClick: (invoice: Invoice) => void;

  onToggleSelect: (id: string) => void;

  getStatusColorClass: (status: string) => string;

  selectAllChecked: boolean;

  onSelectAll: () => void;

  invoiceSort: { key: string; dir: 'asc' | 'desc' };

  onSort: (key: string) => void;

  emptyMessage?: string;

}



const SortArrow: React.FC<{ column: string; currentKey: string; dir: string }> = ({ column, currentKey, dir }) => (

  <span className="ml-0.5 text-[9px] text-app-muted">

    {currentKey === column ? (dir === 'asc' ? '▲' : '▼') : '↕'}

  </span>

);



const VirtualizedInvoiceTable: React.FC<VirtualizedInvoiceTableProps> = ({

  sortedInvoices,

  contactPropByInvoiceId,

  selectedInvoiceIds,

  onInvoiceClick,

  onToggleSelect,

  getStatusColorClass,

  selectAllChecked,

  onSelectAll,

  invoiceSort,

  onSort,

  emptyMessage = 'No rental invoices found',

}) => {

  const containerRef = useRef<HTMLDivElement>(null);

  const listRef = useRef<any>(null);

  const [height, setHeight] = useState(400);



  useEffect(() => {

    if (!containerRef.current) return;

    const ro = new ResizeObserver((entries) => {

      for (const entry of entries) {

        setHeight(entry.contentRect.height);

      }

    });

    ro.observe(containerRef.current);

    return () => ro.disconnect();

  }, []);



  const Row = useCallback(

    ({ index, style }: { index: number; style: React.CSSProperties }) => {

      const inv = sortedInvoices[index];

      if (!inv) return <div style={style} />;

      const lookup = contactPropByInvoiceId.get(inv.id);

      const contactName = lookup?.contactName ?? '—';

      const propertyName = lookup?.propertyName ?? '—';

      const amt = Number(inv.amount) || 0;

      const paid = Number(inv.paidAmount) ?? 0;

      const remaining = Math.max(0, amt - paid);

      const isChecked = selectedInvoiceIds.has(inv.id);

      const statusClass = getStatusColorClass(inv.status);



      return (

        <div

          style={style}

          className={`flex items-center border-b border-app-border cursor-pointer transition-colors ${

            isChecked ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-app-toolbar/60'

          }`}

          onClick={() => onInvoiceClick(inv)}

        >

          <div className="w-8 px-2 py-1.5 text-center flex-shrink-0" onClick={e => e.stopPropagation()}>

            <input

              type="checkbox"

              checked={isChecked}

              onChange={() => onToggleSelect(inv.id)}

              className="w-3.5 h-3.5 rounded border-app-border"

            />

          </div>

          <div className="px-2 py-1.5 font-medium text-primary flex-shrink-0 min-w-0 truncate max-w-[100px]">

            {inv.invoiceNumber}

          </div>

          <div className="px-2 py-1.5 text-app-text tabular-nums flex-shrink-0 w-20">

            {formatDate(inv.issueDate)}

          </div>

          <div className="px-2 py-1.5 text-app-text truncate max-w-[150px] flex-shrink-0" title={contactName}>

            {contactName}

          </div>

          <div className="px-2 py-1.5 text-app-muted truncate max-w-[120px] flex-shrink-0" title={propertyName}>

            {propertyName}

          </div>

          <div className="px-2 py-1.5 text-right tabular-nums text-app-text flex-shrink-0 w-20">

            {amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}

          </div>

          <div

            className={`px-2 py-1.5 text-right tabular-nums font-medium flex-shrink-0 w-20 ${

              remaining > 0 ? 'text-ds-danger' : 'text-ds-success'

            }`}

          >

            {remaining > 0 ? remaining.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}

          </div>

          <div className="px-2 py-1.5 text-center flex-shrink-0">

            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusClass}`}>

              {inv.status}

            </span>

          </div>

        </div>

      );

    },

    [

      sortedInvoices,

      contactPropByInvoiceId,

      selectedInvoiceIds,

      onInvoiceClick,

      onToggleSelect,

      getStatusColorClass,

    ]

  );



  if (sortedInvoices.length === 0) {

    return (

      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center">

        <p className="text-app-muted italic text-sm">{emptyMessage}</p>

      </div>

    );

  }



  return (

    <div ref={containerRef} className="flex-1 min-h-0 flex flex-col overflow-hidden bg-app-card">

      <div className="flex-shrink-0 overflow-x-auto">

        <div className="flex bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider min-w-full border-b border-app-border">

          <div className="w-8 px-2 py-1.5 text-center flex-shrink-0">

            <input

              type="checkbox"

              checked={selectAllChecked}

              onChange={onSelectAll}

              className="w-3.5 h-3.5 rounded border-app-border"

            />

          </div>

          <div

            className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60 flex-shrink-0 min-w-[100px]"

            onClick={() => onSort('invoiceNumber')}

          >

            Invoice # <SortArrow column="invoiceNumber" currentKey={invoiceSort.key} dir={invoiceSort.dir} />

          </div>

          <div

            className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60 flex-shrink-0 w-20"

            onClick={() => onSort('date')}

          >

            Date <SortArrow column="date" currentKey={invoiceSort.key} dir={invoiceSort.dir} />

          </div>

          <div

            className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60 flex-shrink-0 max-w-[150px] truncate"

            onClick={() => onSort('tenant')}

          >

            Tenant <SortArrow column="tenant" currentKey={invoiceSort.key} dir={invoiceSort.dir} />

          </div>

          <div className="px-2 py-1.5 text-left flex-shrink-0 max-w-[120px]">Unit</div>

          <div

            className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60 flex-shrink-0 w-20"

            onClick={() => onSort('amount')}

          >

            Amount <SortArrow column="amount" currentKey={invoiceSort.key} dir={invoiceSort.dir} />

          </div>

          <div

            className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60 flex-shrink-0 w-20"

            onClick={() => onSort('due')}

          >

            Due <SortArrow column="due" currentKey={invoiceSort.key} dir={invoiceSort.dir} />

          </div>

          <div

            className="px-2 py-1.5 text-center cursor-pointer hover:bg-app-toolbar/60 flex-shrink-0"

            onClick={() => onSort('status')}

          >

            Status <SortArrow column="status" currentKey={invoiceSort.key} dir={invoiceSort.dir} />

          </div>

        </div>

      </div>

      <div className="flex-1 min-h-0">

        <List

          listRef={listRef}

          defaultHeight={height}

          rowCount={sortedInvoices.length}

          rowHeight={ROW_HEIGHT}

          rowComponent={Row}

          rowProps={{}}

          style={{ height, width: '100%' }}

          className="scrollbar-thin scrollbar-thumb-[color:var(--border-color)]"

        />

      </div>

    </div>

  );

};



export default React.memo(VirtualizedInvoiceTable);

