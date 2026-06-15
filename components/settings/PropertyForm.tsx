
import { useDispatchOnly } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Property, Contact, ContactType, Building, InvoiceType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Textarea from '../ui/Textarea';
import ComboBox from '../ui/ComboBox';
import Modal from '../ui/Modal';
import ContactForm from './ContactForm';
import BuildingForm from './BuildingForm';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
// Note: useEntityFormModal removed to avoid circular dependency - using local modal pattern instead

interface PropertyFormProps {
    onSubmit: (property: Omit<Property, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    propertyToEdit?: Property;
    contacts: Contact[];
    buildings: Building[];
    properties: Property[];
}

const PropertyForm: React.FC<PropertyFormProps> = ({ onSubmit, onCancel, onDelete, propertyToEdit, contacts, buildings, properties }) => {
    const dispatch = useDispatchOnly();
    const { showAlert } = useNotification();
    const { isAuthenticated } = useAuth();
    
    // Use ref to track the last property ID we initialized with
    // This prevents resetting the form when props change but we're still editing the same property
    const lastInitializedPropertyId = useRef<string | 'new' | null>(null);
    
    const [name, setName] = useState(propertyToEdit?.name || '');
    const [ownerId, setOwnerId] = useState(propertyToEdit?.ownerId || '');
    const [buildingId, setBuildingId] = useState(propertyToEdit?.buildingId || '');
    const [description, setDescription] = useState(propertyToEdit?.description || '');
    const [monthlyServiceCharge, setMonthlyServiceCharge] = useState(propertyToEdit?.monthlyServiceCharge?.toString() || '');
    const [nameError, setNameError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [addModalType, setAddModalType] = useState<string | null>(null);
    const [newItemName, setNewItemName] = useState('');

    // Allow both Owner and Client types for the "Global Owner" concept
    const owners = contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
    
    // Update form state when propertyToEdit changes (for editing mode)
    // Only update if propertyToEdit exists and we're actually editing (not creating new)
    useEffect(() => {
        const currentPropertyId = propertyToEdit?.id || 'new';
        
        // Only update form if we're switching to a different property
        // This preserves user input when creating a new property
        if (currentPropertyId !== lastInitializedPropertyId.current) {
            if (propertyToEdit) {
                // Editing mode - load property data
                setName(propertyToEdit.name || '');
                setOwnerId(propertyToEdit.ownerId || '');
                setBuildingId(propertyToEdit.buildingId || '');
                setDescription(propertyToEdit.description || '');
                setMonthlyServiceCharge(propertyToEdit.monthlyServiceCharge?.toString() || '');
            }
            // For new property mode, we don't reset - preserve user input
            lastInitializedPropertyId.current = currentPropertyId;
        }
    }, [propertyToEdit?.id]); // Only update when the property ID changes (switching between properties)
    
    // Check for duplicate property names
    useEffect(() => {
        if (!name.trim()) {
            setNameError('Property name is required.');
            return;
        }
        const duplicate = properties.find(p => p.name.toLowerCase().trim() === name.toLowerCase().trim() && p.id !== propertyToEdit?.id);
        if (duplicate) {
            setNameError('A property with this name already exists.');
        } else {
            setNameError('');
        }
    }, [name, properties, propertyToEdit]);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        if (nameError) {
            await showAlert("Please fix the errors before submitting.");
            return;
        }
        if (!ownerId) { await showAlert("Owner is required."); return; }
        if (!buildingId) { await showAlert("Building is required."); return; }
        setIsSubmitting(true);
        try {
            await Promise.resolve(onSubmit({
                name,
                ownerId,
                buildingId,
                description,
                monthlyServiceCharge: parseFloat(monthlyServiceCharge) || 0,
            }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateNew = (type: 'OWNER' | 'BUILDING', name: string) => {
        setNewItemName(name);
        setAddModalType(type);
    }

    const handleGenericSubmit = (type: 'CONTACT' | 'BUILDING') => async (data: any) => {
        if (type === 'CONTACT') {
            if (isAuthenticated) {
                try {
                    const saved = await getAppStateApiService().saveContact({
                        ...data,
                        type: ContactType.OWNER,
                    });
                    dispatch({ type: 'ADD_CONTACT', payload: { ...saved, type: saved.type || ContactType.OWNER } });
                    setOwnerId(saved.id);
                } catch (err: unknown) {
                    const e = err as { message?: string; error?: string };
                    await showAlert(e?.message || e?.error || 'Could not save owner to server.');
                    return;
                }
            } else {
                const newId = Date.now().toString();
                dispatch({ type: 'ADD_CONTACT', payload: { ...data, id: newId, type: ContactType.OWNER } });
                setOwnerId(newId);
            }
        } else {
            if (isAuthenticated) {
                try {
                    const saved = await getAppStateApiService().saveBuilding({ ...data });
                    dispatch({ type: 'ADD_BUILDING', payload: { ...saved, id: saved.id } });
                    setBuildingId(saved.id);
                } catch (err: unknown) {
                    const e = err as { message?: string; error?: string };
                    await showAlert(e?.message || e?.error || 'Could not save building to server.');
                    return;
                }
            } else {
                const newId = Date.now().toString();
                dispatch({ type: 'ADD_BUILDING', payload: { ...data, id: newId } });
                setBuildingId(newId);
            }
        }
        setAddModalType(null);
        setNewItemName('');
    };
    
    return (
        <>
            <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
                <div className="flex-grow min-h-0 overflow-y-auto space-y-4">
                    <div>
                        <Input label="Property Name (e.g., Unit 101)" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
                        {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ComboBox 
                            label="Owner" 
                            items={owners} 
                            selectedId={ownerId} 
                            onSelect={(item) => setOwnerId(item?.id || '')}
                            placeholder="Search or add new owner..."
                            entityType="contact"
                            onAddNew={(entityType, name) => handleCreateNew('OWNER', name)}
                        />
                        <ComboBox 
                            label="Building" 
                            items={buildings} 
                            selectedId={buildingId} 
                            onSelect={(item) => setBuildingId(item?.id || '')}
                            placeholder="Search or add new building..."
                            entityType="building"
                            onAddNew={(entityType, name) => handleCreateNew('BUILDING', name)}
                        />
                    </div>
                    <Input 
                        label="Monthly Service Charge (for Rental Auto-Run)" 
                        type="text"
                        inputMode="decimal"
                        value={monthlyServiceCharge} 
                        onChange={e => setMonthlyServiceCharge(e.target.value)} 
                        placeholder="e.g. 1500"
                        helperText="Amount deducted from owner's rental income when running monthly service charges."
                    />
                    <Textarea label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="Property details, notes, etc." />
                </div>
                
                <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 mt-auto border-t">
                    <div>
                        {propertyToEdit && onDelete && (
                            <Button type="button" variant="danger" onClick={onDelete} className="w-full sm:w-auto">Delete</Button>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-2 w-full sm:w-auto">
                        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting} className="w-full sm:w-auto">Cancel</Button>
                        <LoadingButton type="submit" loading={isSubmitting} loadingText="Saving..." className="w-full sm:w-auto">
                            {propertyToEdit ? 'Update' : 'Save'} Property
                        </LoadingButton>
                    </div>
                </div>
            </form>

            <Modal isOpen={addModalType === 'OWNER'} onClose={() => setAddModalType(null)} title="Add New Owner">
                <ContactForm 
                    onSubmit={handleGenericSubmit('CONTACT')} 
                    onCancel={() => setAddModalType(null)} 
                    existingContacts={contacts} 
                    initialName={newItemName}
                    fixedTypeForNew={ContactType.OWNER}
                />
            </Modal>
            <Modal isOpen={addModalType === 'BUILDING'} onClose={() => setAddModalType(null)} title="Add New Building">
                <BuildingForm 
                    onSubmit={handleGenericSubmit('BUILDING')} 
                    onCancel={() => setAddModalType(null)}
                    initialName={newItemName}
                />
            </Modal>
        </>
    );
};

export default PropertyForm;
