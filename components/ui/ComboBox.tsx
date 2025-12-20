

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ICONS } from '../../constants';

interface ComboBoxItem {
  id: string;
  name: string;
}

interface ComboBoxProps {
  label?: string;
  items: ComboBoxItem[];
  selectedId: string;
  onSelect: (item: ComboBoxItem | null, newContactName?: string) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowAddNew?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
}

const ComboBox: React.FC<ComboBoxProps> = ({ label, items, selectedId, onSelect, onQueryChange, placeholder, disabled = false, allowAddNew = true, required = false, id, name }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Generate an id if not provided (for accessibility)
  const inputId = id || (label ? `combobox-${name || label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  
  const selectedItem = useMemo(() => items.find(item => item.id === selectedId), [items, selectedId]);

  useEffect(() => {
    if (selectedItem) {
        setQuery(selectedItem.name);
    } else if (!selectedId) {
        // Clear query if selection is cleared from outside
        setQuery('');
    }
  }, [selectedItem, selectedId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    if(onQueryChange) {
        onQueryChange(newValue);
    }
    if (selectedId && selectedItem && newValue !== selectedItem.name) {
        onSelect(null);
    }
    if (!isOpen) {
        setIsOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        const revertedQuery = selectedItem ? selectedItem.name : '';
        if (query !== revertedQuery) {
            setQuery(revertedQuery);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef, selectedItem, query]);

  const filteredItems = useMemo(() => {
    if (!query || (selectedItem && query === selectedItem.name)) {
        return items;
    }
    return items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  }, [items, query, selectedItem]);

  const handleSelect = (item: ComboBoxItem) => {
    onSelect(item, undefined);
    setQuery(item.name);
    setIsOpen(false);
  };

  const handleInputClick = () => {
    setIsOpen(true);
  };

  const handleAddNew = () => {
    if(query){
        onSelect(null, query);
        setIsOpen(false);
    }
  };
  
  const focusClasses = 'focus:ring-2 focus:ring-green-500/50 focus:border-green-500';

  return (
    <div ref={wrapperRef} className="relative">
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        id={inputId}
        name={name || inputId}
        type="text"
        className={`block w-full px-3 py-1.5 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none text-xs sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed border-gray-300 ${focusClasses} ${!label ? 'h-8' : ''}`}
        value={query}
        onClick={handleInputClick}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required && !selectedId}
        autoComplete="off"
      />
      {isOpen && !disabled && (
        <ul className="absolute z-20 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto mt-1">
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <li
                key={item.id}
                className="px-3 py-2 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSelect(item)}
              >
                {item.name}
              </li>
            ))
          ) : (
            allowAddNew && query && (
              <li
                className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 text-green-600"
                onClick={handleAddNew}
              >
                <div className="w-4 h-4">{ICONS.plus}</div> Add "{query}"
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
};

export default ComboBox;