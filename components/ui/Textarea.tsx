import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

const Textarea: React.FC<TextareaProps> = ({ label, id, name, ...props }) => {
  const finalClassName = `block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300`;

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
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
};

export default Textarea;
