
import React, { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [isDragging, setIsDragging] = useState(false);
  const [mouseDownTarget, setMouseDownTarget] = useState<EventTarget | null>(null);
  const [mouseDownPosition, setMouseDownPosition] = useState<{ x: number; y: number } | null>(null);
  const modalContentRef = React.useRef<HTMLDivElement>(null);

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

    const handleMouseUp = () => {
      // Reset drag state on mouseup anywhere
      // This handles cases where mouse is released outside the modal
      setIsDragging(false);
      setMouseDownTarget(null);
      setMouseDownPosition(null);
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.overflow = 'unset';
      // Reset state when modal closes
      setIsDragging(false);
      setMouseDownTarget(null);
      setMouseDownPosition(null);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  // Dynamic size classes that adapt to viewport (using CSS classes only)
  const sizeClasses = (() => {
    if (fullScreen) {
      return 'w-full h-full max-w-full max-h-full rounded-none sm:rounded-xl';
    }
    
    const baseSizes = {
      md: 'max-w-2xl w-full',
      lg: 'max-w-4xl w-full',
      xl: 'max-w-6xl w-full',
      full: 'max-w-[95vw] w-full'
    };
    
    return baseSizes[size as keyof typeof baseSizes] || baseSizes.md;
  })();

  // Dynamic max-height calculation based on viewport (using CSS classes)
  const maxHeightClass = (() => {
    if (fullScreen) {
      return 'max-h-screen';
    }
    
    if (maxContentHeight) {
      return '';
    }
    
    // Use CSS classes for responsive max-height
    // Mobile: calc(100vh - 2rem), Desktop: calc(100vh - 4rem)
    return 'max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]';
  })();

  const maxHeightStyle: React.CSSProperties = maxContentHeight 
    ? { maxHeight: `${maxContentHeight}px` }
    : {};

  // Responsive padding classes (CSS-only)
  const paddingClasses = 'p-4 sm:p-6 lg:p-8';

  // Container alignment - bottom sheet on mobile, centered on desktop (CSS-only)
  const containerClasses = fullScreen
    ? 'items-stretch justify-stretch sm:items-center sm:justify-center'
    : 'items-end sm:items-center justify-center';

  // Modal positioning (CSS-only)
  const modalPositionClasses = fullScreen
    ? 'rounded-none sm:rounded-xl'
    : 'rounded-t-2xl sm:rounded-xl';

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    // Track where the mouse was pressed down
    if (e.target === e.currentTarget) {
      setMouseDownTarget(e.target);
      setIsDragging(false);
      setMouseDownPosition({ x: e.clientX, y: e.clientY });
    } else {
      // Mouse down was inside modal content - don't close on backdrop click
      setMouseDownTarget(null);
      setMouseDownPosition(null);
    }
  };

  const handleBackdropMouseMove = (e: React.MouseEvent) => {
    // If mouse moves significantly after mousedown, it's a drag operation
    if (mouseDownPosition) {
      const deltaX = Math.abs(e.clientX - mouseDownPosition.x);
      const deltaY = Math.abs(e.clientY - mouseDownPosition.y);
      // If mouse moved more than 5 pixels, consider it a drag
      if (deltaX > 5 || deltaY > 5) {
        setIsDragging(true);
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if:
    // 1. Click was on the backdrop (not modal content)
    // 2. Mouse down was also on the backdrop (not inside modal content)
    // 3. It wasn't a drag operation (user didn't move mouse significantly)
    if (
      e.target === e.currentTarget && 
      mouseDownTarget === e.currentTarget && 
      !isDragging
    ) {
      onClose();
    }
    // Reset drag state
    setIsDragging(false);
    setMouseDownTarget(null);
    setMouseDownPosition(null);
  };

  const handleModalContentMouseDown = (e: React.MouseEvent) => {
    // Track that mousedown happened inside modal content
    setMouseDownTarget(e.target);
    setMouseDownPosition({ x: e.clientX, y: e.clientY });
    setIsDragging(false);
    // Stop propagation to prevent backdrop handler from firing
    e.stopPropagation();
  };

  return createPortal(
    <div 
      className={`fixed inset-0 bg-gray-900/70 z-[9999] flex ${containerClasses} p-0 sm:p-4 backdrop-blur-sm animate-fade-in-fast transition-all`}
      onMouseDown={handleBackdropMouseDown}
      onMouseMove={handleBackdropMouseMove}
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalContentRef}
        className={`bg-white ${modalPositionClasses} shadow-2xl ${sizeClasses} ${maxHeightClass} flex flex-col overflow-hidden mx-auto sm:mx-0 transition-transform duration-300 transform translate-y-0 border border-gray-200`}
        style={maxHeightStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={handleModalContentMouseDown}
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
          className={`flex-grow min-h-0 ${disableScroll ? 'overflow-hidden flex flex-col' : 'overflow-y-auto scroll-smooth'} ${!disableScroll ? paddingClasses : ''} ${!disableScroll ? 'pb-[calc(var(--safe-area-bottom,0px)+1rem)] sm:pb-[calc(var(--safe-area-bottom,0px)+1.5rem)]' : ''}`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
