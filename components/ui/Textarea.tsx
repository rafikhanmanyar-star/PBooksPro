import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  enableSpellCheck?: boolean;
}

const fieldClass =
  'block w-full px-ds-md py-3 sm:py-2 border rounded-ds-md shadow-ds-card placeholder:text-app-muted/80 bg-app-input text-app-text border-app-input-border focus:outline-none text-base sm:text-ds-body disabled:opacity-60 disabled:cursor-not-allowed focus:ring-2 focus:ring-ds-primary/35 focus:border-ds-primary transition-colors';

const Textarea: React.FC<TextareaProps> = ({ label, id, name, enableSpellCheck = true, className, ...props }) => {
  const textareaId = id || `textarea-${name || label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <label htmlFor={textareaId} className="block text-ds-body font-medium text-app-text mb-ds-sm">
        {label}
      </label>
      <textarea
        {...props}
        id={textareaId}
        name={name || textareaId}
        rows={3}
        className={className ? `${fieldClass} ${className}` : fieldClass}
        autoComplete={props.autoComplete || 'off'}
        autoCorrect={enableSpellCheck ? 'on' : 'off'}
        spellCheck={enableSpellCheck}
      />
    </div>
  );
};

export default Textarea;
