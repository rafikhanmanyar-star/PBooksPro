/**
 * Reusable print button component with consistent styling
 */

import React from 'react';
import Button from './Button';
import { ICONS } from '../../constants';

export interface PrintButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  onPrint: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  showLabel?: boolean;
  label?: string;
}

/**
 * PrintButton component
 * Provides consistent print button styling and icon across the application
 */
const PrintButton: React.FC<PrintButtonProps> = ({
  variant = 'secondary',
  size = 'sm',
  onPrint,
  disabled = false,
  isLoading = false,
  className = '',
  showLabel = true,
  label = 'Print'
}) => {
  const baseClasses = variant === 'primary'
    ? 'bg-slate-800 text-white hover:bg-slate-900'
    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300';

  return (
    <Button
      variant={variant}
      size={size}
      onClick={onPrint}
      disabled={disabled || isLoading}
      className={`${baseClasses} ${className}`}
      title="Print"
    >
      <div className="w-4 h-4 mr-1">{ICONS.print}</div>
      {showLabel && <span className={size === 'sm' ? 'hidden sm:inline' : ''}>{label}</span>}
    </Button>
  );
};

export default PrintButton;

