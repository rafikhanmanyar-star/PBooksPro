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
    <div className="h-full min-h-0 flex flex-col md:flex-row bg-[#f5f6f8] gap-0 overflow-hidden">
      {/* Desktop: fixed sidebar 30% */}
      <aside className="hidden md:flex md:w-[30%] md:min-w-0 md:max-w-[400px] md:flex-col md:shrink-0 bg-white rounded-r-xl shadow-sm border-r border-slate-200 overflow-hidden">
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
          fixed inset-y-0 left-0 z-50 w-[min(100%,320px)] flex flex-col bg-white shadow-xl border-r border-slate-200
          transform transition-transform duration-300 ease-out md:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-slate-50">
          <span className="font-semibold text-slate-800">Loans</span>
          <button
            type="button"
            onClick={onSidebarClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700"
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
      <main className="flex-1 min-h-0 flex flex-col md:ml-0 overflow-hidden">
        {/* Mobile: menu button to open drawer */}
        <div className="flex md:hidden items-center gap-2 p-2 bg-white border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100"
            aria-label="Open loan list"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-medium text-slate-600">Loan Manager</span>
        </div>
        {detail}
      </main>
    </div>
  );
};
