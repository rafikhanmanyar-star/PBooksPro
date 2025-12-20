
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
}

const Input: React.FC<InputProps> = ({ label, id, helperText, onKeyDown, name, ...props }) => {
  // Mobile: py-3 and text-base to prevent zoom and increase touch area
  // Desktop: py-2 and text-sm for compactness
  // Added tabular-nums for consistent number width
  // Added appearance-none classes to hide spin buttons
  const finalClassName = props.className || `block w-full px-3 py-3 sm:py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-base sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

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

  const inputElement = (
      <input
        {...props}
        id={inputId}
        name={name || inputId}
        onKeyDown={handleKeyDown}
        className={finalClassName}
        autoComplete={props.autoComplete || "off"}
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={helperText && inputId ? `${inputId}-helper-text` : undefined}
      />
  );

  const helperTextElement = helperText ? (
    <p id={inputId ? `${inputId}-helper-text` : undefined} className="mt-1 text-xs text-gray-500">{helperText}</p>
  ) : null;

  if (!label) {
      return inputElement;
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
