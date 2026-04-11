
import React, { useState, useEffect, useMemo } from 'react';
import { Project, ProjectStatus } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { suggestProjectClosed } from '../../services/accounting/accountingLedgerCore';
import { toLocalDateString } from '../../utils/dateUtils';

interface ProjectFormProps {
    onSubmit: (project: Omit<Project, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    projectToEdit?: Project;
    initialName?: string;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ onSubmit, onCancel, onDelete, projectToEdit, initialName }) => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const [name, setName] = useState(projectToEdit?.name || initialName || '');
    const [description, setDescription] = useState(projectToEdit?.description || '');
    const [location, setLocation] = useState(projectToEdit?.location || '');
    const [projectType, setProjectType] = useState(projectToEdit?.projectType || '');
    const [color, setColor] = useState(projectToEdit?.color || '#4f46e5'); // Default indigo-600
    const [status, setStatus] = useState<ProjectStatus>(projectToEdit?.status || 'Active');
    const [nameError, setNameError] = useState('');

    const booksClearForClose = useMemo(() => {
        if (!projectToEdit?.id) return false;
        return suggestProjectClosed(state, projectToEdit.id, toLocalDateString(new Date()));
    }, [state, projectToEdit?.id]);

    useEffect(() => {
        setStatus(projectToEdit?.status || 'Active');
    }, [projectToEdit?.id, projectToEdit?.status]);

    // Check for duplicate project names
    useEffect(() => {
        if (!name.trim()) {
            setNameError('Project name is required.');
            return;
        }
        const duplicate = state.projects.find(p => p.name.toLowerCase().trim() === name.toLowerCase().trim() && p.id !== projectToEdit?.id);
        if (duplicate) {
            setNameError('A project with this name already exists.');
        } else {
            setNameError('');
        }
    }, [name, state.projects, projectToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (nameError) {
            await showAlert("Please fix the errors before submitting.");
            return;
        }
        onSubmit({
            name,
            description,
            color,
            location: location.trim() || undefined,
            projectType: projectType.trim() || undefined,
            status,
        });
    };
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {projectToEdit && booksClearForClose && status !== 'Closed' && (
                <div
                    className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900"
                    role="status"
                >
                    <p className="font-medium">Books show zero cash, assets, and liabilities for this project (balanced).</p>
                    <p className="mt-1 text-emerald-800/90">You can mark the project as Closed when the lifecycle is finished.</p>
                    <Button
                        type="button"
                        variant="secondary"
                        className="mt-2"
                        onClick={() => setStatus('Closed')}
                    >
                        Set status to Closed
                    </Button>
                </div>
            )}
            <div className="flex gap-4">
                <div className="flex-grow">
                    <Input label="Project Name" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
                    {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Location (Optional)" value={location} onChange={e => setLocation(e.target.value)} placeholder="Site / address" />
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Project type</label>
                    <select
                        value={projectType}
                        onChange={(e) => setProjectType(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label="Project type"
                    >
                        <option value="">— Select —</option>
                        <option value="building">Building</option>
                        <option value="society">Society</option>
                        <option value="commercial">Commercial</option>
                        <option value="mixed">Mixed</option>
                        <option value="plot">Plot / land</option>
                        <option value="other">Other</option>
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    className="block w-full max-w-xs px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Project status"
                >
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Closed">Closed</option>
                </select>
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
