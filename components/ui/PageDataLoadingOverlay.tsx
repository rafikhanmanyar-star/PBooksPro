import React from 'react';

interface PageDataLoadingOverlayProps {
  pageTitle: string;
}

/**
 * Full-page loading alert shown while navigating to a route whose data or lazy chunk is not ready.
 */
const PageDataLoadingOverlay: React.FC<PageDataLoadingOverlayProps> = ({ pageTitle }) => (
  <div
    className="absolute inset-0 bg-app-bg/90 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-200 animate-fade-in pointer-events-auto"
    role="alert"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-gray-200 border-t-green-600 rounded-full animate-spin" />
        <div
          className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-green-400 rounded-full animate-spin"
          style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
        />
      </div>
      <div className="text-center">
        <p className="text-gray-700 text-base font-semibold mb-1">Loading data…</p>
        <p className="text-gray-500 text-sm">{pageTitle}</p>
      </div>
      <div className="flex gap-1.5 mt-2">
        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  </div>
);

export default PageDataLoadingOverlay;
