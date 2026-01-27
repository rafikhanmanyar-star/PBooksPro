
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  enableSpellCheck?: boolean;
  icon?: React.ReactNode;
  horizontal?: boolean;
  compact?: boolean;
}

const Input: React.FC<InputProps> = ({ label, id, helperText, onKeyDown, name, enableSpellCheck = true, icon, horizontal = false, compact = false, ...props }) => {
  // Mobile: py-3 and text-base to prevent zoom and increase touch area
  // Desktop: py-2 and text-sm for compactness
  // Added tabular-nums for consistent number width
  // Spinner removal classes for number inputs
  const spinnerRemovalClasses = `[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  const isNumberInput = props.type === 'number';
  const baseClassName = `block w-full border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors tabular-nums ${
    compact ? 'py-1 px-2 text-xs' : 'px-3 py-3 sm:py-2 text-base sm:text-sm'
  }`;

  // If custom className is provided, append spinner removal classes for number inputs
  // Otherwise use the default className with spinner removal classes
  const finalClassName = props.className
    ? (isNumberInput ? `${props.className} ${spinnerRemovalClasses}` : props.className)
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
        className={`${finalClassName} ${icon ? 'pl-10' : ''}`}
        autoComplete={props.autoComplete || "off"}
        autoCorrect={shouldEnableSpellCheck ? "on" : "off"}
        spellCheck={shouldEnableSpellCheck}
        aria-describedby={helperText && inputId ? `${inputId}-helper-text` : undefined}
      />
    </div>
  );

  const helperTextElement = helperText ? (
    <p id={inputId ? `${inputId}-helper-text` : undefined} className="mt-1 text-xs text-gray-500">{helperText}</p>
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
        <label htmlFor={inputId} className="block text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 w-24">
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
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {inputElement}
      {helperTextElement}
    </div>
  );
};

export default Input;
