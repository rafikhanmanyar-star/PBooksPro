import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  entityType?: 'contact' | 'project' | 'building' | 'category' | 'account' | 'property' | 'unit' | 'contract' | 'report'; // 'report' means don't show add option
  onAddNew?: (entityType: string, name: string) => void; // Callback to open form modal
  className?: string;
  compact?: boolean;
}

const ComboBox: React.FC<ComboBoxProps> = ({ label, items, selectedId, onSelect, onQueryChange, placeholder, disabled = false, allowAddNew = true, required = false, id, name, entityType, onAddNew, className = '', compact = false }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const shouldSelectOnFocusRef = useRef(true);
  const lastUserTypedValueRef = useRef<string | null>(null);

  // Generate an id if not provided (for accessibility)
  const inputId = id || (label ? `combobox-${name || label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const selectedItem = useMemo(() => items.find(item => item.id === selectedId), [items, selectedId]);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Calculate dropdown position when opening with smart positioning
  useEffect(() => {
    if (isOpen && inputRef.current && mounted) {
      const inputRect = inputRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownMaxHeight = 240; // max-h-60 = 240px
      
      // Calculate available space below and above input
      const spaceBelow = viewportHeight - inputRect.bottom;
      const spaceAbove = inputRect.top;
      
      let top: number;
      // If not enough space below but more space above, position above
      if (spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow) {
        top = inputRect.top + window.scrollY - dropdownMaxHeight - 4; // 4px gap above
      } else {
        top = inputRect.bottom + window.scrollY + 4; // 4px gap below
      }
      
      // Ensure dropdown doesn't go off-screen horizontally
      const minMargin = 8; // Minimum margin from screen edges
      const minWidth = 200; // Minimum dropdown width
      let left = inputRect.left + window.scrollX;
      let width = inputRect.width;
      
      // Adjust if dropdown would go off right edge
      const maxRight = viewportWidth + window.scrollX - minMargin;
      if (left + width > maxRight) {
        width = Math.max(minWidth, maxRight - left);
      }
      
      // Adjust if dropdown would go off left edge
      const minLeft = window.scrollX + minMargin;
      if (left < minLeft) {
        const adjustment = minLeft - left;
        left = minLeft;
        // Try to maintain width by extending right if possible
        const newRight = left + width;
        const availableRight = viewportWidth + window.scrollX - minMargin;
        if (newRight <= availableRight) {
          // Width is fine, just adjust left
        } else {
          // Need to reduce width to fit
          width = Math.max(minWidth, availableRight - left);
        }
      }
      
      // Final check: ensure width meets minimum
      width = Math.max(width, minWidth);
      
      setDropdownPosition({
        top: Math.max(4, top), // Ensure at least 4px from top
        left,
        width
      });
    } else {
      setDropdownPosition(null);
    }
  }, [isOpen, mounted]);

  useEffect(() => {
    // Only sync query from selectedItem if user hasn't typed anything
    // This prevents overwriting what the user is actively typing
    if (lastUserTypedValueRef.current === null) {
      // User hasn't typed anything - safe to sync from selectedItem
      if (selectedItem) {
        setQuery(selectedItem.name);
      } else if (!selectedId) {
        setQuery('');
      }
    }
    // If lastUserTypedValueRef is not null, user has typed something - don't overwrite
  }, [selectedItem, selectedId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // CRITICAL: Set ref IMMEDIATELY and BEFORE any state updates
    // This prevents useEffect from overwriting the typed value
    lastUserTypedValueRef.current = newValue;
    shouldSelectOnFocusRef.current = false;

    // Update query state - this is what makes the character appear in React controlled input
    setQuery(newValue);

    if (onQueryChange) {
      onQueryChange(newValue);
    }

    // Don't call onSelect(null) immediately while user is typing
    // This prevents triggering useEffect which could overwrite the input
    // We'll clear the selection after user stops typing (on blur)

    if (!isOpen) {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        wrapperRef.current && 
        !wrapperRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        const revertedQuery = selectedItem ? selectedItem.name : '';
        if (query !== revertedQuery) {
          setQuery(revertedQuery);
        }
      }
    };
    const handleScroll = () => {
      // Update position on scroll
      if (isOpen && inputRef.current) {
        const inputRect = inputRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: inputRect.bottom + window.scrollY + 4,
          left: inputRect.left + window.scrollX,
          width: inputRect.width
        });
      }
    };
    const handleResize = () => {
      // Close on resize to prevent positioning issues
      if (isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true); // Capture phase to catch scroll in nested containers
      window.addEventListener('resize', handleResize);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, wrapperRef, selectedItem, query]);

  const filteredItems = useMemo(() => {
    if (!query || (selectedItem && query === selectedItem.name)) {
      return items;
    }
    return items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  }, [items, query, selectedItem]);

  // Check if query exactly matches any item
  const hasExactMatch = useMemo(() => {
    if (!query) return false;
    return items.some(item => item.name.toLowerCase() === query.toLowerCase().trim());
  }, [items, query]);

  // Determine if we should show "Add" option
  const shouldShowAddOption = useMemo(() => {
    // Don't show if disabled, no query, or entityType is 'report'
    if (disabled || !query || !query.trim() || entityType === 'report') return false;
    // Don't show if allowAddNew is false
    if (!allowAddNew) return false;
    // Show if query doesn't exactly match any item
    return !hasExactMatch;
  }, [disabled, query, entityType, allowAddNew, hasExactMatch]);

  const handleSelect = (item: ComboBoxItem) => {
    onSelect(item, undefined);
    setQuery(item.name);
    lastUserTypedValueRef.current = null; // Reset since we're setting from selection
    setIsOpen(false);
  };

  const handleInputMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    // Open dropdown on mousedown (fires before click, so dropdown opens immediately)
    if (!disabled) {
      setIsOpen(true);
      // Reset flag for text selection on focus
      shouldSelectOnFocusRef.current = true;
    }
  };

  const handleInputClick = () => {
    // Ensure dropdown is open on click
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text when input receives focus so typing immediately replaces it
    if (!disabled) {
      setIsOpen(true);
      if (shouldSelectOnFocusRef.current) {
        const input = e.target;
        // Select immediately - the browser handles this correctly
        // When user types with text selected, the browser replaces it naturally
        input.select();
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // When user starts typing, disable text selection to prevent interference
    // This ensures the first typed character appears correctly
    if (shouldSelectOnFocusRef.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      shouldSelectOnFocusRef.current = false;
    }
  };

  const handleInputBlur = () => {
    // Clear selection if user typed something different from the selected item
    if (selectedId && selectedItem && lastUserTypedValueRef.current &&
      lastUserTypedValueRef.current !== selectedItem.name) {
      onSelect(null);
    }

    // Reset flags when input loses focus
    shouldSelectOnFocusRef.current = true;
    // Reset user typed value ref after a delay to allow useEffect to sync
    setTimeout(() => {
      lastUserTypedValueRef.current = null;
    }, 100);
  };

  const handleAddNew = () => {
    if (!query || !query.trim()) return;

    // If onAddNew callback is provided and entityType is specified, use it
    if (onAddNew && entityType && entityType !== 'report') {
      onAddNew(entityType, query.trim());
      setIsOpen(false);
      // Don't clear query - let the form handle it
      return;
    }

    // Fallback to old behavior for backward compatibility
    if (allowAddNew) {
      onSelect(null, query);
      setIsOpen(false);
    }
  };

  const focusClasses = 'focus:ring-2 focus:ring-green-500/50 focus:border-green-500';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <input
        ref={inputRef}
        id={inputId}
        name={name || inputId}
        type="text"
        className={`block w-full border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed border-gray-300 ${focusClasses} ${compact ? 'py-1 px-2 text-xs' : 'px-3 py-3 sm:py-2 text-base sm:text-sm'
          } ${!label && !compact ? 'h-8' : ''}`}
        value={query}
        onMouseDown={handleInputMouseDown}
        onClick={handleInputClick}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required && !selectedId}
        autoComplete="off"
        spellCheck={true}
      />
      {isOpen && !disabled && mounted && dropdownPosition && createPortal(
        <ul
          ref={dropdownRef}
          className="fixed z-[10000] bg-white border border-gray-300 rounded-md shadow-xl max-h-60 overflow-auto"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            // Ensure dropdown appears above everything
            position: 'fixed'
          }}
        >
          {filteredItems.length > 0 && filteredItems.map(item => (
            <li
              key={item.id}
              className="px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handleSelect(item)}
            >
              {item.name}
            </li>
          ))}
          {shouldShowAddOption && (
            <li
              className="px-3 py-2 cursor-pointer hover:bg-green-50 flex items-center gap-2 text-green-600 font-medium border-t border-gray-200 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent input blur
                handleAddNew();
              }}
            >
              <div className="w-4 h-4">{ICONS.plus}</div> {query.trim()}
              {entityType && entityType !== 'report' && (
                <span className="text-xs text-green-500 ml-1">({entityType})</span>
              )}
            </li>
          )}
        </ul>,
        document.body
      )}
    </div>
  );
};

export default ComboBox;