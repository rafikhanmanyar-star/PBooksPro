import React from 'react';
import Button from '../ui/Button';
import { usePWA } from '../../context/PWAContext';
import { ICONS } from '../../constants';

interface InstallPWAProps {
    variant?: 'sidebar' | 'full' | 'header';
}

const InstallPWA: React.FC<InstallPWAProps> = ({ variant = 'sidebar' }) => {
  const { installPrompt, isInstalled, showInstallPrompt } = usePWA();

  if (!installPrompt && !isInstalled) {
    return null; // Don't show if not installable (and not installed)
  }

  if (isInstalled) {
      if (variant === 'full') {
          return (
             <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 text-center text-sm font-medium">
                 App is installed on this device ✓
             </div>
          );
      }
      return null;
  }

  if (variant === 'header') {
      return (
        <button 
            onClick={(e) => { e.preventDefault(); showInstallPrompt(); }}
            className="p-2 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors relative group"
            title="Install App"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span className="absolute top-full right-0 mt-1 w-max px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Install App
            </span>
        </button>
      );
  }

  return (
    <Button 
        onClick={(e) => { e.preventDefault(); showInstallPrompt(); }}
        className={variant === 'sidebar' 
            ? "w-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all flex items-center justify-center gap-2 text-xs py-2"
            : "w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-base"
        }
        aria-label="Install App"
        title="Install to Desktop/Home Screen"
    >
        <svg xmlns="http://www.w3.org/2000/svg" width={variant === 'sidebar' ? 16 : 20} height={variant === 'sidebar' ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Install App
    </Button>
  );
};

export default InstallPWA;