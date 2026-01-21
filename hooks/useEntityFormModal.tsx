
import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { ContactType, TransactionType } from '../types';
import Modal from '../components/ui/Modal';
import ContactForm from '../components/settings/ContactForm';
import ProjectForm from '../components/ui/ProjectForm';
import BuildingForm from '../components/settings/BuildingForm';
import CategoryForm from '../components/settings/CategoryForm';
import AccountForm from '../components/settings/AccountForm';
import PropertyForm from '../components/settings/PropertyForm';
import UnitForm from '../components/settings/UnitForm';

export type EntityType = 'contact' | 'project' | 'building' | 'category' | 'account' | 'property' | 'unit';

interface UseEntityFormModalReturn {
  openForm: (entityType: EntityType, initialName?: string, contactType?: ContactType, categoryType?: TransactionType, onCreated?: (id: string) => void) => void;
  closeForm: () => void;
  isFormOpen: boolean;
  formType: EntityType | null;
  initialName: string;
  contactType?: ContactType;
  categoryType?: TransactionType;
  handleSubmit: (data: any) => void;
  onCreatedCallback?: (id: string) => void;
}

export const useEntityFormModal = (): UseEntityFormModalReturn => {
  const { state, dispatch } = useAppContext();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formType, setFormType] = useState<EntityType | null>(null);
  const [initialName, setInitialName] = useState<string>('');
  const [contactType, setContactType] = useState<ContactType | undefined>(undefined);
  const [categoryType, setCategoryType] = useState<TransactionType | undefined>(undefined);
  const [onCreatedCallback, setOnCreatedCallback] = useState<((id: string) => void) | undefined>(undefined);

  const openForm = useCallback((
    entityType: EntityType, 
    name?: string, 
    ct?: ContactType,
    catType?: TransactionType,
    onCreated?: (id: string) => void
  ) => {
    setFormType(entityType);
    setInitialName(name || '');
    setContactType(ct);
    setCategoryType(catType);
    setOnCreatedCallback(() => onCreated);
    setIsFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setFormType(null);
    setInitialName('');
    setContactType(undefined);
    setCategoryType(undefined);
    setOnCreatedCallback(undefined);
  }, []);

  const handleSubmit = useCallback((data: any) => {
    let payload: any;
    const newId = Date.now().toString();

    switch (formType) {
      case 'contact':
        payload = { ...data, id: newId };
        dispatch({ type: 'ADD_CONTACT', payload });
        break;
      case 'project':
        payload = { ...data, id: newId };
        dispatch({ type: 'ADD_PROJECT', payload });
        break;
      case 'building':
        payload = { ...data, id: newId };
        dispatch({ type: 'ADD_BUILDING', payload });
        break;
      case 'category':
        payload = { ...data, id: newId };
        dispatch({ type: 'ADD_CATEGORY', payload });
        break;
      case 'account':
        payload = { ...data, id: newId };
        dispatch({ type: 'ADD_ACCOUNT', payload });
        break;
      case 'property':
        payload = { ...data, id: newId };
        dispatch({ type: 'ADD_PROPERTY', payload });
        break;
      case 'unit':
        payload = { ...data, id: newId };
        dispatch({ type: 'ADD_UNIT', payload });
        break;
    }

    // Call the callback with the new ID if provided
    if (onCreatedCallback) {
      onCreatedCallback(newId);
    }

    closeForm();
  }, [formType, dispatch, closeForm, onCreatedCallback]);

  return {
    openForm,
    closeForm,
    isFormOpen,
    formType,
    initialName,
    contactType,
    categoryType,
    handleSubmit,
    onCreatedCallback,
  };
};

// Helper component to render the form modal
export const EntityFormModal: React.FC<{
  isOpen: boolean;
  formType: EntityType | null;
  initialName: string;
  contactType?: ContactType;
  categoryType?: TransactionType;
  onClose: () => void;
  onSubmit: (data: any) => void;
}> = ({ isOpen, formType, initialName, contactType, categoryType, onClose, onSubmit }) => {
  const { state } = useAppContext();

  const getFormTitle = () => {
    if (!formType) return 'Add New';
    const titles: Record<EntityType, string> = {
      contact: 'Add New Contact',
      project: 'Add New Project',
      building: 'Add New Building',
      category: 'Add New Category',
      account: 'Add New Account',
      property: 'Add New Property',
      unit: 'Add New Unit',
    };
    return titles[formType];
  };

  if (!formType) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getFormTitle()}>
      {formType === 'contact' && (
        <ContactForm
          onSubmit={onSubmit}
          onCancel={onClose}
          existingContacts={state.contacts}
          fixedTypeForNew={contactType}
          initialName={initialName}
        />
      )}
      {formType === 'project' && (
        <ProjectForm
          onSubmit={onSubmit}
          onCancel={onClose}
          initialName={initialName}
        />
      )}
      {formType === 'building' && (
        <BuildingForm
          onSubmit={onSubmit}
          onCancel={onClose}
          initialName={initialName}
        />
      )}
      {formType === 'category' && (
        <CategoryForm
          onSubmit={onSubmit}
          onCancel={onClose}
          fixedTypeForNew={categoryType}
          initialName={initialName}
        />
      )}
      {formType === 'account' && (
        <AccountForm
          onSubmit={onSubmit}
          onCancel={onClose}
          initialName={initialName}
        />
      )}
      {formType === 'property' && (
        <PropertyForm
          onSubmit={onSubmit}
          onCancel={onClose}
          contacts={state.contacts}
          buildings={state.buildings}
          properties={state.properties}
          initialName={initialName}
        />
      )}
      {formType === 'unit' && (
        <UnitForm
          onSubmit={onSubmit}
          onCancel={onClose}
          initialName={initialName}
        />
      )}
    </Modal>
  );
};


