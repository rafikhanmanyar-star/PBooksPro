
import React, { useState } from 'react';
import { Project } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface ProjectFormProps {
    onSubmit: (project: Omit<Project, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    projectToEdit?: Project;
    initialName?: string;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ onSubmit, onCancel, onDelete, projectToEdit, initialName }) => {
    const [name, setName] = useState(projectToEdit?.name || initialName || '');
    const [description, setDescription] = useState(projectToEdit?.description || '');
    const [color, setColor] = useState(projectToEdit?.color || '#4f46e5'); // Default indigo-600

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({ name, description, color });
    };
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
                <div className="flex-grow">
                    <Input label="Project Name" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
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
            <Textarea label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="Project details, scope, etc." />
            <div className="flex justify-between items-center pt-4">
                <div>
                    {projectToEdit && onDelete && (
                        <Button type="button" variant="danger" onClick={onDelete}>Delete</Button>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button type="submit">{projectToEdit ? 'Update' : 'Save'} Project</Button>
                </div>
            </div>
        </form>
    );
};

export default ProjectForm;
