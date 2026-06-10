import React from 'react';

/**
 * Shell shown immediately after login while initial app state is loading.
 * Mirrors app layout (sidebar + header + main) so LCP is fast and INP stays responsive.
 */
const LoadingShell: React.FC = () => (
  <div
    className="flex h-screen bg-app-bg overflow-hidden font-sans text-app-text overscroll-none"
    onContextMenu={(e) => e.preventDefault()}
  >
    <div
      className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 bg-app-card border-r border-app-border sidebar-desktop-width"
      aria-hidden
    >
      <div className="h-14 flex items-center px-4 border-b border-app-border">
        <div className="h-6 w-32 ds-skeleton" />
      </div>
      <div className="flex-1 p-2 space-y-1">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-9 ds-skeleton" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </div>

    <div className="flex-1 flex flex-col min-w-0 main-content-offset overflow-x-hidden">
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-app-border bg-app-header">
        <div className="h-5 w-24 ds-skeleton" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 ds-skeleton rounded-full" />
          <div className="h-8 w-8 ds-skeleton rounded-full" />
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="h-7 w-48 ds-skeleton" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 ds-skeleton rounded-ds-lg" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="h-64 ds-skeleton rounded-ds-lg" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-app-modal/90 px-6 py-4 rounded-ds-lg shadow-ds-card border border-app-border">
            <div className="w-10 h-10 border-4 border-app-border border-t-ds-success rounded-full animate-spin" />
            <p className="text-ds-body font-medium text-app-muted">Loading your data…</p>
          </div>
        </div>
      </main>
    </div>
  </div>
);

export default LoadingShell;
