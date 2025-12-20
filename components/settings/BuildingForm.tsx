
import React, { useState } from 'react';
import { Building } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface BuildingFormProps {
    onSubmit: (building: Omit<Building, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    buildingToEdit?: Building;
    initialName?: string;
}

const BuildingForm: React.FC<BuildingFormProps> = ({ onSubmit, onCancel, onDelete, buildingToEdit, initialName }) => {
    const [name, setName] = useState(buildingToEdit?.name || initialName || '');
    const [description, setDescription] = useState(buildingToEdit?.description || '');
    const [color, setColor] = useState(buildingToEdit?.color || '#10b981'); // Default emerald-500

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({ name, description, color });
    };
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
                <div className="flex-grow">
                    <Input label="Building Name" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Color</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="color" 
                            value={color} 
                            onChange={(e) => setColor(e.target.value)}
                            className="h-10 w-20 rounded-md cursor-pointer border border-slate-300 p-1 bg-white"
                        />
                    </div>
                </div>
            </div>
            <Textarea label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="Building details, address, etc." />
            <div className="flex justify-between items-center pt-4">
                <div>
                    {buildingToEdit && onDelete && (
                        <Button type="button" variant="danger" onClick={onDelete}>Delete</Button>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button type="submit">{buildingToEdit ? 'Update' : 'Save'} Building</Button>
                </div>
            </div>
        </form>
    );
};

export default BuildingForm;
