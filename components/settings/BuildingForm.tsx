
import React, { useState, useEffect } from 'react';
import { Building } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';

interface BuildingFormProps {
    onSubmit: (building: Omit<Building, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    buildingToEdit?: Building;
    initialName?: string;
}

const BuildingForm: React.FC<BuildingFormProps> = ({ onSubmit, onCancel, onDelete, buildingToEdit, initialName }) => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const [name, setName] = useState(buildingToEdit?.name || initialName || '');
    const [description, setDescription] = useState(buildingToEdit?.description || '');
    const [color, setColor] = useState(buildingToEdit?.color || '#10b981'); // Default emerald-500
    const [nameError, setNameError] = useState('');

    // Check for duplicate building names
    useEffect(() => {
        if (!name.trim()) {
            setNameError('Building name is required.');
            return;
        }
        const duplicate = state.buildings.find(b => b.name.toLowerCase().trim() === name.toLowerCase().trim() && b.id !== buildingToEdit?.id);
        if (duplicate) {
            setNameError('A building with this name already exists.');
        } else {
            setNameError('');
        }
    }, [name, state.buildings, buildingToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (nameError) {
            await showAlert("Please fix the errors before submitting.");
            return;
        }
        onSubmit({ name, description, color });
    };
    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
            <div className="flex-grow min-h-0 overflow-y-auto space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-grow">
                        <Input label="Building Name" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
                        {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Color</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="color" 
                                value={color} 
                                onChange={(e) => setColor(e.target.value)}
                                className="h-10 w-20 sm:w-20 rounded-md cursor-pointer border border-slate-300 p-1 bg-white touch-manipulation"
                            />
                        </div>
                    </div>
                </div>
                <Textarea label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="Building details, address, etc." />
            </div>
            <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 mt-auto border-t">
                <div>
                    {buildingToEdit && onDelete && (
                        <Button type="button" variant="danger" onClick={onDelete} className="w-full sm:w-auto">Delete</Button>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-2 w-full sm:w-auto">
                    <Button type="button" variant="secondary" onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>
                    <Button type="submit" className="w-full sm:w-auto">{buildingToEdit ? 'Update' : 'Save'} Building</Button>
                </div>
            </div>
        </form>
    );
};

export default BuildingForm;
