
import React, { useState, useEffect } from 'react';
import { Unit, Project, Contact, ContactType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';

interface UnitFormProps {
    onSubmit: (unit: Omit<Unit, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    unitToEdit?: Unit;
}

const UnitForm: React.FC<UnitFormProps> = ({ onSubmit, onCancel, onDelete, unitToEdit }) => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const entityFormModal = useEntityFormModal();
    const [name, setName] = useState(unitToEdit?.name || '');
    const [projectId, setProjectId] = useState(unitToEdit?.projectId || state.defaultProjectId || '');
    const [contactId, setContactId] = useState(unitToEdit?.contactId || '');
    const [salePrice, setSalePrice] = useState(unitToEdit?.salePrice?.toString() || '');
    const [nameError, setNameError] = useState('');

    // Include both Owners and Clients
    const owners = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);

    // Check for duplicate unit names
    useEffect(() => {
        if (!name.trim()) {
            setNameError('Unit name is required.');
            return;
        }
        const duplicate = state.units.find(u => u.name.toLowerCase().trim() === name.toLowerCase().trim() && u.id !== unitToEdit?.id);
        if (duplicate) {
            setNameError('A unit with this name already exists.');
        } else {
            setNameError('');
        }
    }, [name, state.units, unitToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (nameError) {
            await showAlert("Please fix the errors before submitting.");
            return;
        }
        if (!projectId) {
            await showAlert("Project is required.");
            return;
        }
        onSubmit({ 
            name, 
            projectId, 
            contactId: contactId || undefined, 
            salePrice: salePrice ? parseFloat(salePrice) : undefined 
        });
    };

    return (
        <>
            <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
                <div className="flex-grow min-h-0 overflow-y-auto space-y-4">
                    <div>
                        <Input label="Unit Name (e.g., Apt 101, Shop 5)" value={name} onChange={e => setName(e.target.value)} required autoFocus />
                        {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ComboBox 
                            label="Project" 
                            items={state.projects} 
                            selectedId={projectId} 
                            onSelect={(item) => setProjectId(item?.id || '')}
                            placeholder="Select a project"
                            required
                            allowAddNew={false}
                        />
                        <ComboBox 
                            label="Owner (Optional)" 
                            items={owners} 
                            selectedId={contactId} 
                            onSelect={(item) => setContactId(item?.id || '')}
                            placeholder="Assign to an owner"
                            entityType="contact"
                            onAddNew={(entityType, name) => {
                                entityFormModal.openForm('contact', name, ContactType.OWNER, undefined, (newId) => {
                                    setContactId(newId);
                                });
                            }}
                        />
                    </div>
                    <Input label="Sale Price (Optional)" type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={salePrice} onChange={e => setSalePrice(e.target.value)} />
                </div>

                <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 mt-auto border-t">
                    <div>
                        {unitToEdit && onDelete && (
                            <Button type="button" variant="danger" onClick={onDelete} className="w-full sm:w-auto">Delete</Button>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-2 w-full sm:w-auto">
                        <Button type="button" variant="secondary" onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>
                        <Button type="submit" className="w-full sm:w-auto">{unitToEdit ? 'Update' : 'Save'} Unit</Button>
                    </div>
                </div>
            </form>
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

export default UnitForm;
