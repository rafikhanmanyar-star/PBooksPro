import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { Contact } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { WhatsAppService } from '../../services/whatsappService';
import InfiniteVirtualizedTable from '../common/InfiniteVirtualizedTable';

export type ContactsSortKey = 'name' | 'type' | 'companyName' | 'contactNo' | 'address' | 'balance';

const ROW_HEIGHT = 44;
const OVERSCAN_COUNT = 6;
const MIN_TABLE_WIDTH = 720;

export interface VirtualizedContactsTableProps {
  contacts: Contact[];
  contactBalances: Map<string, number>;
  sortConfig: { key: ContactsSortKey; direction: 'asc' | 'desc' };
  onSort: (key: ContactsSortKey) => void;
  onOpenLedger: (contact: Contact) => void;
  onEdit: (contact: Contact, e: React.MouseEvent) => void;
  onWhatsApp: (contact: Contact, e: React.MouseEvent) => void;
  /** PERF-A3.2 — server-backed infinite scroll */
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  hasNextPage?: boolean;
  onFetchNextPage?: () => void;
  totalCount?: number;
}

type ContactsRowExtra = {
  contacts: Contact[];
  contactBalances: Map<string, number>;
  onOpenLedger: (contact: Contact) => void;
  onEdit: (contact: Contact, e: React.MouseEvent) => void;
  onWhatsApp: (contact: Contact, e: React.MouseEvent) => void;
};

const SortIcon: React.FC<{ column: ContactsSortKey; sortConfig: VirtualizedContactsTableProps['sortConfig'] }> = ({
  column,
  sortConfig,
}) => (
  <span className="ml-1 text-[10px] text-slate-400">
    {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
  </span>
);

const ContactsTableRow = memo(function ContactsTableRow(props: RowComponentProps<ContactsRowExtra>) {
  const { index, style, ariaAttributes, contacts, contactBalances, onOpenLedger, onEdit, onWhatsApp } = props;
  const contact = contacts[index];
  if (!contact) {
    return <div style={style} aria-hidden />;
  }

  const balance = contactBalances.get(contact.id) || 0;
  const stripe = index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';

  return (
    <div
      {...ariaAttributes}
      className={`flex items-center cursor-pointer transition-colors group touch-manipulation border-b border-slate-100 ${stripe} hover:bg-slate-100`}
      style={{ ...style, minWidth: MIN_TABLE_WIDTH }}
      onClick={() => onOpenLedger(contact)}
    >
      <div
        className={`flex-[2] min-w-[140px] px-2 md:px-4 py-2 font-medium whitespace-nowrap text-xs md:text-sm ${
          contact.isActive === false ? 'text-slate-400 line-through' : 'text-gray-800'
        }`}
      >
        {contact.name}
        {contact.isActive === false && (
          <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-slate-100 text-[8px] text-slate-500 uppercase font-bold tracking-tight">
            Deactivated
          </span>
        )}
      </div>
      <div className="w-24 shrink-0 px-2 md:px-4 py-2">
        <span className="inline-block bg-gray-100 text-gray-700 text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full font-medium uppercase tracking-wide whitespace-nowrap">
          {contact.type}
        </span>
      </div>
      <div className="hidden sm:block w-32 shrink-0 px-2 md:px-4 py-2 text-gray-600 whitespace-nowrap text-xs md:text-sm">
        {contact.companyName || '-'}
      </div>
      <div className="w-28 shrink-0 px-2 md:px-4 py-2 text-gray-600 font-mono whitespace-nowrap text-xs md:text-sm">
        {contact.contactNo || '-'}
      </div>
      <div
        className="hidden lg:block flex-[1.5] min-w-[120px] px-2 md:px-4 py-2 text-gray-600 truncate text-xs md:text-sm"
        title={contact.address}
      >
        {contact.address || '-'}
      </div>
      <div
        className={`w-28 shrink-0 px-2 md:px-4 py-2 text-right font-bold font-mono whitespace-nowrap text-xs md:text-sm ${
          balance > 0 ? 'text-green-600' : balance < 0 ? 'text-red-600' : 'text-gray-400'
        }`}
      >
        <span className="hidden sm:inline">{CURRENCY} </span>
        {Math.abs(balance).toLocaleString()}
        <span className="text-[9px] md:text-[10px] font-normal ml-0.5 md:ml-1 text-gray-400">
          {balance > 0 ? '(Cr)' : balance < 0 ? '(Dr)' : ''}
        </span>
      </div>
      <div className="w-20 shrink-0 px-2 md:px-4 py-2 text-right">
        <div className="flex justify-end gap-0.5 md:gap-1">
          {contact.contactNo && WhatsAppService.isValidPhoneNumber(contact.contactNo) && (
            <button
              type="button"
              onClick={(e) => onWhatsApp(contact, e)}
              className="text-gray-400 hover:text-green-600 active:text-green-700 p-1 md:p-1.5 rounded-full hover:bg-green-50 active:bg-green-100 transition-colors md:opacity-0 md:group-hover:opacity-100 touch-manipulation"
              title="Send WhatsApp Message"
            >
              <div className="w-3.5 h-3.5 md:w-4 md:h-4">{ICONS.whatsapp}</div>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => onEdit(contact, e)}
            className="text-gray-400 hover:text-blue-600 active:text-blue-700 p-1 md:p-1.5 rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors md:opacity-0 md:group-hover:opacity-100 touch-manipulation"
            title="Edit Contact"
          >
            <div className="w-3.5 h-3.5 md:w-4 md:h-4">{ICONS.edit}</div>
          </button>
        </div>
      </div>
    </div>
  );
});

ContactsTableRow.displayName = 'ContactsTableRow';

const VirtualizedContactsTable: React.FC<VirtualizedContactsTableProps> = ({
  contacts,
  contactBalances,
  sortConfig,
  onSort,
  onOpenLedger,
  onEdit,
  onWhatsApp,
  loading = false,
  loadingMore = false,
  error = null,
  hasNextPage = false,
  onFetchNextPage,
  totalCount,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = Math.max(ROW_HEIGHT, Math.floor(entry.contentRect.height));
        setHeight(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowProps = useMemo(
    () =>
      ({
        contacts,
        contactBalances,
        onOpenLedger,
        onEdit,
        onWhatsApp,
      }) satisfies ContactsRowExtra,
    [contacts, contactBalances, onOpenLedger, onEdit, onWhatsApp]
  );

  const headerButtonClass =
    'text-left text-[10px] md:text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 active:bg-gray-200 select-none whitespace-nowrap transition-colors touch-manipulation px-2 md:px-4 py-2 md:py-3';

  const tableHeader = (
    <div className="overflow-x-auto flex-shrink-0 border-b border-gray-200 bg-gray-50 sticky top-0 z-10 shadow-sm">
      <div className="flex min-w-[720px]" style={{ minWidth: MIN_TABLE_WIDTH }}>
        <button type="button" onClick={() => onSort('name')} className={`${headerButtonClass} flex-[2] min-w-[140px]`}>
          Name <SortIcon column="name" sortConfig={sortConfig} />
        </button>
        <button type="button" onClick={() => onSort('type')} className={`${headerButtonClass} w-24 shrink-0`}>
          Type <SortIcon column="type" sortConfig={sortConfig} />
        </button>
        <button
          type="button"
          onClick={() => onSort('companyName')}
          className={`${headerButtonClass} hidden sm:block w-32 shrink-0`}
        >
          Company <SortIcon column="companyName" sortConfig={sortConfig} />
        </button>
        <button type="button" onClick={() => onSort('contactNo')} className={`${headerButtonClass} w-28 shrink-0`}>
          Phone <SortIcon column="contactNo" sortConfig={sortConfig} />
        </button>
        <button
          type="button"
          onClick={() => onSort('address')}
          className={`${headerButtonClass} hidden lg:block flex-[1.5] min-w-[120px]`}
        >
          Address <SortIcon column="address" sortConfig={sortConfig} />
        </button>
        <button
          type="button"
          onClick={() => onSort('balance')}
          className={`${headerButtonClass} w-28 shrink-0 text-right`}
        >
          Balance <SortIcon column="balance" sortConfig={sortConfig} />
        </button>
        <div className={`${headerButtonClass} w-20 shrink-0 text-right cursor-default hover:bg-gray-50`}>Actions</div>
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500 flex-grow">
      <div className="w-12 h-12 opacity-20 mb-2">{ICONS.users}</div>
      <p>No contacts found.</p>
    </div>
  );

  if (onFetchNextPage) {
    return (
      <InfiniteVirtualizedTable<ContactsRowExtra>
        rowCount={contacts.length}
        rowHeight={ROW_HEIGHT}
        minTableWidth={MIN_TABLE_WIDTH}
        overscanCount={OVERSCAN_COUNT}
        rowComponent={ContactsTableRow}
        rowProps={rowProps}
        header={tableHeader}
        emptyState={emptyState}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasNextPage={hasNextPage}
        onFetchNextPage={onFetchNextPage}
        loadedCount={contacts.length}
        totalCount={totalCount}
        footerLabel="Contacts"
      />
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col flex-grow min-h-0 h-full overflow-hidden">
        {tableHeader}
        {emptyState}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-grow min-h-0 h-full overflow-hidden">
      {tableHeader}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-x-auto">
        <List<ContactsRowExtra>
          rowCount={contacts.length}
          rowHeight={ROW_HEIGHT}
          overscanCount={OVERSCAN_COUNT}
          rowComponent={ContactsTableRow}
          rowProps={rowProps}
          style={{ height, width: '100%', minWidth: MIN_TABLE_WIDTH }}
        />
      </div>
    </div>
  );
};

export default memo(VirtualizedContactsTable);
