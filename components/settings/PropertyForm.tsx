
import React, { useState, useMemo } from 'react';
import { Property, Contact, ContactType, Building, InvoiceType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import ComboBox from '../ui/ComboBox';
import Modal from '../ui/Modal';
import ContactForm from './ContactForm';
import BuildingForm from './BuildingForm';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';

interface PropertyFormProps {
    onSubmit: (property: Omit<Property, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    propertyToEdit?: Property;
    contacts: Contact[];
    buildings: Building[];
    properties: Property[];
}

const PropertyForm: React.FC<PropertyFormProps> = ({ onSubmit, onCancel, onDelete, propertyToEdit, contacts, buildings }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert } = useNotification();
    const [name, setName] = useState(propertyToEdit?.name || '');
    const [ownerId, setOwnerId] = useState(propertyToEdit?.ownerId || '');
    const [buildingId, setBuildingId] = useState(propertyToEdit?.buildingId || '');
    const [description, setDescription] = useState(propertyToEdit?.description || '');
    const [monthlyServiceCharge, setMonthlyServiceCharge] = useState(propertyToEdit?.monthlyServiceCharge?.toString() || '');

    const [addModalType, setAddModalType] = useState<string | null>(null);
    const [newItemName, setNewItemName] = useState('');

    // Allow both Owner and Client types for the "Global Owner" concept
    const owners = contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ownerId) { await showAlert("Owner is required."); return; }
        if (!buildingId) { await showAlert("Building is required."); return; }
        onSubmit({ 
            name, 
            ownerId, 
            buildingId, 
            description, 
            monthlyServiceCharge: parseFloat(monthlyServiceCharge) || 0 
        });
    };

    const handleCreateNew = (type: 'OWNER' | 'BUILDING', name: string) => {
        setNewItemName(name);
        setAddModalType(type);
    }

    const handleGenericSubmit = (type: 'CONTACT' | 'BUILDING') => (data: any) => {
        const newId = Date.now().toString();
        let payload;
        if (type === 'CONTACT') {
            payload = { ...data, id: newId, type: ContactType.OWNER };
        } else { // BUILDING
            payload = { ...data, id: newId };
        }
        
        dispatch({ type: `ADD_${type}` as any, payload });

        switch(type) {
            case 'CONTACT': setOwnerId(newId); break;
            case 'BUILDING': setBuildingId(newId); break;
        }
        setAddModalType(null);
        setNewItemName('');
    }
    
    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Property Name (e.g., Unit 101)" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
                <ComboBox 
                    label="Owner" 
                    items={owners} 
                    selectedId={ownerId} 
                    onSelect={(item, newName) => newName ? handleCreateNew('OWNER', newName) : setOwnerId(item?.id || '')}
                    placeholder="Search or add new owner..."
                />
                <ComboBox 
                    label="Building" 
                    items={buildings} 
                    selectedId={buildingId} 
                    onSelect={(item, newName) => newName ? handleCreateNew('BUILDING', newName) : setBuildingId(item?.id || '')}
                    placeholder="Search or add new building..."
                />
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
                
                <div className="flex justify-between items-center pt-4">
                    <div>
                        {propertyToEdit && onDelete && (
                            <Button type="button" variant="danger" onClick={onDelete}>Delete</Button>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                        <Button type="submit">{propertyToEdit ? 'Update' : 'Save'} Property</Button>
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
