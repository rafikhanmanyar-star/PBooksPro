import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  enableSpellCheck?: boolean;
}

const Textarea: React.FC<TextareaProps> = ({ label, id, name, enableSpellCheck = true, ...props }) => {
  // Mobile: py-3 and text-base to prevent zoom and increase touch area
  // Desktop: py-2 and text-sm for compactness
  const finalClassName = `block w-full px-3 py-3 sm:py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-base sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors`;

  // Generate an id if not provided (for accessibility)
  const textareaId = id || `textarea-${name || label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <label htmlFor={textareaId} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <textarea
        {...props}
        id={textareaId}
        name={name || textareaId}
        rows={3}
        className={finalClassName}
        autoComplete={props.autoComplete || "off"}
        autoCorrect={enableSpellCheck ? "on" : "off"}
        spellCheck={enableSpellCheck}
      />
    </div>
  );
};

export default Textarea;
