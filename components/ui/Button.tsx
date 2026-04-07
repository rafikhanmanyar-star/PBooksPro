import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'icon';
}

const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'default',
  ...props
}) => {
  const baseClasses =
    'font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 rounded-ds-md select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg';

  const sizeClasses = {
    // Touch-friendly sizing: minimum 44x44px on mobile
    default: 'px-ds-md py-2.5 sm:py-2 text-ds-body min-h-[44px] sm:min-h-0',
    sm: 'px-ds-sm py-2 sm:py-1.5 text-ds-small min-h-[44px] sm:min-h-0',
    icon: 'p-2.5 sm:p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0',
  };

  const variantClasses = {
    primary:
      'bg-ds-primary text-ds-on-primary hover:bg-ds-primary-hover active:bg-ds-primary-active focus-visible:ring-ds-primary',
    secondary:
      'bg-ds-surface-2 text-app-text border border-app-border hover:brightness-[0.98] active:brightness-95 dark:hover:brightness-110 focus-visible:ring-ds-primary',
    danger:
      'bg-ds-danger text-white hover:bg-[var(--color-danger-hover)] active:opacity-95 focus-visible:ring-ds-danger',
    ghost:
      'bg-transparent text-app-text hover:bg-black/[0.04] active:bg-black/[0.08] dark:hover:bg-white/10 dark:active:bg-white/[0.14] focus-visible:ring-ds-primary',
    outline:
      'border border-app-border bg-transparent text-app-text hover:bg-ds-surface-2 active:opacity-90 focus-visible:ring-ds-primary',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;