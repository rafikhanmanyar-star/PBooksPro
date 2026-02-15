import React from 'react';

/**
 * Shell shown immediately after login while initial app state is loading.
 * Mirrors app layout (sidebar + header + main) so LCP is fast and INP stays responsive.
 */
const LoadingShell: React.FC = () => (
  <div
    className="flex h-screen bg-white overflow-hidden font-sans text-gray-900 overscroll-none"
    onContextMenu={(e) => e.preventDefault()}
  >
    {/* Sidebar placeholder - same width as real Sidebar (md:pl-64) */}
    <div
      className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-gray-50 border-r border-gray-200"
      aria-hidden
    >
      <div className="h-14 flex items-center px-4 border-b border-gray-200">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="flex-1 p-2 space-y-1">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-9 bg-gray-200 rounded animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </div>

    {/* Main content area */}
    <div className="flex-1 flex flex-col min-w-0 md:pl-64">
      {/* Header placeholder */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-gray-200 bg-white">
        <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
        </div>
      </header>

      {/* Main area: skeleton blocks + spinner */}
      <main className="flex-1 relative overflow-hidden p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-white/90 px-6 py-4 rounded-lg shadow-sm">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-green-600 rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600">Loading your data…</p>
          </div>
        </div>
      </main>
    </div>
  </div>
);

export default LoadingShell;
