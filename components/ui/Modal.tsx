
import React, { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'full';
  disableScroll?: boolean; // New prop to disable internal scrolling for custom layouts
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md', disableScroll = false }) => {
  const [mounted, setMounted] = useState(false);

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

  // Adjusted sizes for better screen utilization
  const sizeClasses = {
      md: 'max-w-2xl w-full',
      lg: 'max-w-4xl w-full',
      xl: 'max-w-6xl w-full',
      full: 'max-w-[95vw] w-full'
  }

  const currentSizeClass = sizeClasses[size as keyof typeof sizeClasses] || sizeClasses.md;

  return createPortal(
    <div className="fixed inset-0 bg-gray-900/70 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in-fast transition-all">
      <div 
        className={`bg-white rounded-t-2xl sm:rounded-xl shadow-2xl ${currentSizeClass} max-h-[90vh] sm:max-h-[96vh] flex flex-col overflow-hidden mx-auto sm:mx-0 transition-transform duration-300 transform translate-y-0 border border-gray-200`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 id="modal-title" className="text-lg font-bold text-gray-800 truncate pr-4">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
            aria-label="Close modal"
          >
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>
        <div className={`flex-grow min-h-0 ${disableScroll ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-4 sm:p-6 scroll-smooth'} pb-safe sm:pb-safe`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
