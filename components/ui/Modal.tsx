
import React, { ReactNode, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '../../hooks/useViewport';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'full';
  disableScroll?: boolean;
  fullScreen?: boolean; // Optional full-screen mode for mobile
  maxContentHeight?: number; // Optional max content height in pixels
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md', 
  disableScroll = false,
  fullScreen = false,
  maxContentHeight
}) => {
  const [mounted, setMounted] = useState(false);
  const { isMobile, height: viewportHeight } = useViewport();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  // Dynamic size classes that adapt to viewport
  const sizeClasses = useMemo(() => {
    if (fullScreen && isMobile) {
      return 'w-full h-full max-w-full max-h-full rounded-none';
    }
    
    const baseSizes = {
      md: 'max-w-2xl w-full',
      lg: 'max-w-4xl w-full',
      xl: 'max-w-6xl w-full',
      full: 'max-w-[95vw] w-full'
    };
    
    return baseSizes[size as keyof typeof baseSizes] || baseSizes.md;
  }, [size, fullScreen, isMobile]);

  // Dynamic max-height calculation based on viewport
  const maxHeightStyle = useMemo(() => {
    if (fullScreen && isMobile) {
      return { maxHeight: '100vh' };
    }
    
    if (maxContentHeight) {
      return { maxHeight: `${maxContentHeight}px` };
    }
    
    // Calculate based on viewport height minus padding
    // Mobile: 100vh - 1rem (top) - 1rem (bottom) = calc(100vh - 2rem)
    // Desktop: 100vh - 2rem (top) - 2rem (bottom) = calc(100vh - 4rem)
    const padding = isMobile ? '2rem' : '4rem';
    return { maxHeight: `calc(100vh - ${padding})` };
  }, [isMobile, fullScreen, maxContentHeight, viewportHeight]);

  // Responsive padding classes
  const paddingClasses = isMobile 
    ? 'p-4' 
    : 'p-6 lg:p-8';

  // Container alignment - bottom sheet on mobile, centered on desktop
  const containerClasses = fullScreen && isMobile
    ? 'items-stretch justify-stretch'
    : 'items-end sm:items-center justify-center';

  // Modal positioning
  const modalPositionClasses = fullScreen && isMobile
    ? 'rounded-none'
    : 'rounded-t-2xl sm:rounded-xl';

  return createPortal(
    <div 
      className={`fixed inset-0 bg-gray-900/70 z-[9999] flex ${containerClasses} p-0 sm:p-4 backdrop-blur-sm animate-fade-in-fast transition-all`}
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className={`bg-white ${modalPositionClasses} shadow-2xl ${sizeClasses} flex flex-col overflow-hidden mx-auto sm:mx-0 transition-transform duration-300 transform translate-y-0 border border-gray-200`}
        style={maxHeightStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 id="modal-title" className="text-lg font-bold text-gray-800 truncate pr-4">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 min-w-[var(--touch-target-min)] min-h-[var(--touch-target-min)] flex items-center justify-center"
            aria-label="Close modal"
          >
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>
        <div 
          className={`flex-grow min-h-0 ${disableScroll ? 'overflow-hidden flex flex-col' : 'overflow-y-auto scroll-smooth'} ${!disableScroll ? paddingClasses : ''}`}
          style={{
            paddingBottom: `calc(${isMobile ? 'var(--safe-area-bottom, 0px)' : '0px'} + ${disableScroll ? '0' : isMobile ? '1rem' : '1.5rem'})`
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
