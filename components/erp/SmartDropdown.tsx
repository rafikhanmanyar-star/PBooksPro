import React from 'react';
import ComboBox from '../ui/ComboBox';

export interface SmartDropdownItem {
  id: string;
  name: string;
  /** Auto-fill payload when this row is selected (address, balance, terms, …) */
  meta?: Record<string, unknown>;
}

export interface SmartDropdownProps {
  label?: string;
  items: SmartDropdownItem[];
  selectedId: string;
  /**
   * Receives selected item and merged meta for auto-fill.
   * When `newContactName` is set (ComboBox “add new”), item is null — parent should create entity or clear selection.
   */
  onSelect: (
    item: SmartDropdownItem | null,
    meta: Record<string, unknown> | undefined,
    newContactName?: string
  ) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  horizontal?: boolean;
  className?: string;
  /** Forwarded to ComboBox for add-new flows */
  allowAddNew?: boolean;
  entityType?: React.ComponentProps<typeof ComboBox>['entityType'];
  onAddNew?: (entityType: string, name: string) => void;
}

/**
 * Searchable, keyboard-friendly dropdown built on the existing ComboBox.
 * Selecting an item passes optional `meta` for parent forms to auto-fill fields.
 */
export const SmartDropdown: React.FC<SmartDropdownProps> = ({
  items,
  selectedId,
  onSelect,
  ...rest
}) => {
  const comboItems = items.map(({ id, name }) => ({ id, name }));

  const handleSelect = (item: { id: string; name: string } | null, newContactName?: string) => {
    if (!item) {
      onSelect(null, undefined, newContactName);
      return;
    }
    const full = items.find((i) => i.id === item.id);
    onSelect(full ?? { id: item.id, name: item.name, meta: undefined }, full?.meta, newContactName);
  };

  return (
    <ComboBox
      {...rest}
      items={comboItems}
      selectedId={selectedId}
      onSelect={handleSelect}
    />
  );
};

export default SmartDropdown;
