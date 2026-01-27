
import React from 'react';
import ComboBox, { ComboBoxItem } from './ComboBox';
import { useEntityFormModal, EntityFormModal, EntityType } from '../../hooks/useEntityFormModal';
import { ContactType, TransactionType } from '../../types';

interface SmartComboBoxProps {
  label?: string;
  items: ComboBoxItem[];
  selectedId: string;
  onSelect: (item: ComboBoxItem | null) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  entityType?: EntityType | 'report'; // 'report' means don't show add option
  contactType?: ContactType; // For contact entities
  categoryType?: TransactionType; // For category entities
  allowAddNew?: boolean; // Override default behavior
}

/**
 * SmartComboBox - A wrapper around ComboBox that automatically handles
 * "Add New" functionality by opening the appropriate form modal.
 * 
 * Usage:
 * <SmartComboBox
 *   label="Project"
 *   items={projects}
 *   selectedId={projectId}
 *   onSelect={(item) => setProjectId(item?.id || '')}
 *   entityType="project"
 * />
 */
const SmartComboBox: React.FC<SmartComboBoxProps> = ({
  label,
  items,
  selectedId,
  onSelect,
  onQueryChange,
  placeholder,
  disabled = false,
  required = false,
  id,
  name,
  entityType,
  contactType,
  categoryType,
  allowAddNew = true,
}) => {
  const entityFormModal = useEntityFormModal();

  const handleAddNew = (type: string, name: string) => {
    if (!entityType || entityType === 'report') return;
    
    entityFormModal.openForm(
      entityType as EntityType,
      name,
      contactType,
      categoryType,
      (newId) => {
        // Auto-select the newly created item
        const newItem = items.find(item => item.id === newId);
        if (newItem) {
          onSelect(newItem);
        } else {
          // If item not found yet (state hasn't updated), wait a bit and try again
          setTimeout(() => {
            const updatedItems = items; // This will be updated from state
            const foundItem = updatedItems.find(item => item.id === newId);
            if (foundItem) {
              onSelect(foundItem);
            }
          }, 100);
        }
      }
    );
  };

  return (
    <>
      <ComboBox
        label={label}
        items={items}
        selectedId={selectedId}
        onSelect={onSelect}
        onQueryChange={onQueryChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        id={id}
        name={name}
        entityType={entityType === 'report' ? 'report' : entityType}
        onAddNew={entityType && entityType !== 'report' && allowAddNew ? handleAddNew : undefined}
        allowAddNew={allowAddNew && entityType !== 'report'}
      />
      <EntityFormModal
        isOpen={entityFormModal.isFormOpen}
        formType={entityFormModal.formType}
        initialName={entityFormModal.initialName}
        contactType={entityFormModal.contactType}
        categoryType={entityFormModal.categoryType}
        onClose={entityFormModal.closeForm}
        onSubmit={entityFormModal.handleSubmit}
      />
    </>
  );
};

export default SmartComboBox;

