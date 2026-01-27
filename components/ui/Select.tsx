
import React, { ReactNode } from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
  hideIcon?: boolean;
}

const Select: React.FC<SelectProps> = ({ label, id, name, children, hideIcon = false, ...props }) => {
  // Generate an id if not provided (for accessibility)
  const selectId = id || (label ? `select-${name || label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  // Mobile: py-3 and text-base
  const selectElement = (
    <select
      id={selectId}
      name={name || selectId}
      className={`block w-full px-3 py-3 sm:py-2 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-base sm:text-sm transition-colors appearance-none ${props.className || ''}`}
      style={hideIcon ? {} : { backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%231e293b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7em top 50%', backgroundSize: '.65em auto', paddingRight: '2.5em' }}
      {...props}
    >
      {children}
    </select>
  );

  if (!label) {
    return selectElement;
  }
  
  return (
    <div>
      <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {selectElement}
    </div>
  );
};

export default Select;
