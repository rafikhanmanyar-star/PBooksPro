import React, { ReactNode } from 'react';

interface LoanManagerLayoutProps {
  sidebar: ReactNode;
  detail: ReactNode;
  sidebarOpen: boolean;
  onSidebarClose: () => void;
  onSidebarToggle: () => void;
}

export const LoanManagerLayout: React.FC<LoanManagerLayoutProps> = ({
  sidebar,
  detail,
  sidebarOpen,
  onSidebarClose,
  onSidebarToggle,
}) => {
  return (
    <div className="h-full min-h-0 flex flex-col md:flex-row bg-app-bg gap-0 overflow-hidden">
      {/* Desktop: fixed sidebar 30% */}
      <aside className="hidden md:flex md:w-[30%] md:min-w-0 md:max-w-[400px] md:flex-col md:shrink-0 bg-app-card rounded-r-xl shadow-ds-card border-r border-app-border overflow-hidden">
        {sidebar}
      </aside>

      {/* Tablet/Mobile: overlay backdrop when drawer open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onSidebarClose}
          aria-hidden="true"
        />
      )}

      {/* Tablet/Mobile: slide-in drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[min(100%,320px)] flex flex-col bg-app-card shadow-ds-modal border-r border-app-border
          transform transition-transform duration-300 ease-out md:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-3 border-b border-app-border bg-app-surface-2">
          <span className="font-semibold text-app-text">Loans</span>
          <button
            type="button"
            onClick={onSidebarClose}
            className="p-2 rounded-lg text-app-muted hover:bg-app-table-hover hover:text-app-text"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {sidebar}
        </div>
      </aside>

      {/* Main detail 70% */}
      <main className="flex-1 min-h-0 flex flex-col md:ml-0 overflow-hidden bg-app-bg">
        {/* Mobile: menu button to open drawer */}
        <div className="flex md:hidden items-center gap-2 p-2 bg-app-card border-b border-app-border shrink-0">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="p-2 rounded-xl text-app-muted hover:bg-app-table-hover hover:text-app-text"
            aria-label="Open loan list"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-medium text-app-text">Loan Manager</span>
        </div>
        {detail}
      </main>
    </div>
  );
};
