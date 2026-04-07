/**
 * PrintPreviewModal - Shows print content in a modal before opening the system print dialog.
 * Used by PrintController when phase is 'preview'. User can Print or Close.
 */

import React, { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

export interface PrintPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onPrint: () => void;
  children: ReactNode;
}

export function PrintPreviewModal({
  open,
  onClose,
  onPrint,
  children
}: PrintPreviewModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-preview-title"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-slate-50 rounded-t-xl">
          <h2 id="print-preview-title" className="text-lg font-bold text-slate-800">
            Print preview
          </h2>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onPrint}
              className="flex items-center gap-2"
            >
              <span className="w-4 h-4">{ICONS.print}</span>
              Print
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="flex items-center gap-2"
            >
              <span className="w-4 h-4">{ICONS.x}</span>
              Close
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-100">
          <div className="bg-white shadow-sm rounded-lg p-4 print-preview-content min-h-[200px]">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PrintPreviewModal;
