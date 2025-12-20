
import React, { useState } from 'react';
import { Unit, Project, Contact, ContactType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';

interface UnitFormProps {
    onSubmit: (unit: Omit<Unit, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    unitToEdit?: Unit;
}

const UnitForm: React.FC<UnitFormProps> = ({ onSubmit, onCancel, onDelete, unitToEdit }) => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const [name, setName] = useState(unitToEdit?.name || '');
    const [projectId, setProjectId] = useState(unitToEdit?.projectId || '');
    const [contactId, setContactId] = useState(unitToEdit?.contactId || '');
    const [salePrice, setSalePrice] = useState(unitToEdit?.salePrice?.toString() || '');

    // Include both Owners and Clients
    const owners = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Unit Name (e.g., Apt 101, Shop 5)" value={name} onChange={e => setName(e.target.value)} required autoFocus />
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
                allowAddNew={false}
            />
            <Input label="Sale Price (Optional)" type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={salePrice} onChange={e => setSalePrice(e.target.value)} />

            <div className="flex justify-between items-center pt-4">
                <div>
                    {unitToEdit && onDelete && (
                        <Button type="button" variant="danger" onClick={onDelete}>Delete</Button>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button type="submit">{unitToEdit ? 'Update' : 'Save'} Unit</Button>
                </div>
            </div>
        </form>
    );
};

export default UnitForm;
