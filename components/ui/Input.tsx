
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  /** Shows error styling and message; sets aria-invalid when present */
  error?: string;
  enableSpellCheck?: boolean;
  icon?: React.ReactNode;
  horizontal?: boolean;
  compact?: boolean;
}

const Input: React.FC<InputProps> = ({ label, id, helperText, error, onKeyDown, onWheel, name, enableSpellCheck = true, icon, horizontal = false, compact = false, ...props }) => {
  // Mobile: py-3 and text-base to prevent zoom and increase touch area
  // Desktop: py-2 and text-sm for compactness
  // Added tabular-nums for consistent number width
  // Spinner removal classes for number inputs
  const spinnerRemovalClasses = `[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  const isNumberInput = props.type === 'number';
  const baseClassName = `block w-full border rounded-ds-md shadow-ds-card placeholder:text-app-muted/80 bg-app-input text-app-text border-app-input-border focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed transition-colors tabular-nums focus:ring-2 focus:ring-ds-primary/35 focus:border-ds-primary ${
    error ? 'ds-input-error' : ''
  } ${
    compact ? 'py-1 px-2 text-ds-small' : 'px-ds-md py-3 sm:py-2 text-base sm:text-ds-body'
  }`;

  const errorClass = error ? 'ds-input-error' : '';
  const finalClassName = props.className
    ? `${props.className} ${errorClass} ${isNumberInput ? spinnerRemovalClasses : ''}`.trim()
    : (isNumberInput ? `${baseClassName} ${spinnerRemovalClasses}` : baseClassName);

  // Generate an id if not provided but label exists (for accessibility)
  const inputId = id || (label ? `input-${name || label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  // Determine if spell check should be enabled
  // Disable for number, email, password, tel, url input types
  const shouldEnableSpellCheck = enableSpellCheck && !['number', 'email', 'password', 'tel', 'url'].includes(props.type || 'text');

  const inputElement = (
    <div className="relative w-full">
      {icon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {icon}
        </div>
      )}
      <input
        {...props}
        id={inputId}
        name={name || inputId}
        onKeyDown={handleKeyDown}
        onWheel={props.type === 'number' ? (e) => { e.currentTarget.blur(); onWheel?.(e); } : onWheel}
        className={`${finalClassName} ${icon ? 'pl-10' : ''}`}
        autoComplete={props.autoComplete || "off"}
        autoCorrect={shouldEnableSpellCheck ? "on" : "off"}
        spellCheck={shouldEnableSpellCheck}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error && inputId
            ? `${inputId}-error-text`
            : helperText && inputId
              ? `${inputId}-helper-text`
              : undefined
        }
      />
    </div>
  );

  const helperTextElement =
    error && inputId ? (
      <p id={`${inputId}-error-text`} className="mt-ds-xs text-ds-small text-app-error" role="alert">
        {error}
      </p>
    ) : helperText ? (
      <p id={inputId ? `${inputId}-helper-text` : undefined} className="mt-ds-xs text-ds-small text-app-muted">
        {helperText}
      </p>
    ) : null;

  if (!label) {
    return (
      <div>
        {inputElement}
        {helperTextElement}
      </div>
    );
  }

  if (horizontal) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="block text-ds-small font-bold text-app-muted uppercase tracking-wider shrink-0 w-24">
          {label}
        </label>
        <div className="flex-1">
          {inputElement}
          {helperTextElement}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className="block text-ds-body font-medium text-app-text mb-ds-sm">
        {label}
      </label>
      {inputElement}
      {helperTextElement}
    </div>
  );
};

export default Input;
