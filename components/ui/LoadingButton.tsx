import React from 'react';
import { Loader2 } from 'lucide-react';
import Button from './Button';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'icon';
  /** When true, button is disabled and shows spinner + loading text. */
  loading?: boolean;
  /** Text shown while loading (default: "Saving..."). */
  loadingText?: string;
}

/**
 * Submit/action button with built-in duplicate-click protection via disabled state.
 * Pair with useSubmitGuard for async handlers.
 */
const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  loadingText = 'Saving...',
  children,
  disabled,
  ...props
}) => (
  <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
    {loading ? loadingText : children}
  </Button>
);

export default LoadingButton;
