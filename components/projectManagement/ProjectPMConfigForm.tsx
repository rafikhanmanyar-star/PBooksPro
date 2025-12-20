
import React, { useState, useMemo, useEffect } from 'react';
import { Project, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { useAppContext } from '../../context/AppContext';
import { ICONS } from '../../constants';

interface ProjectPMConfigFormProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    onSave: (project: Project) => void;
}

const ProjectPMConfigForm: React.FC<ProjectPMConfigFormProps> = ({ isOpen, onClose, project, onSave }) => {
    const { state } = useAppContext();
    const [rate, setRate] = useState(project.pmConfig?.rate?.toString() || '0');
    const [frequency, setFrequency] = useState<'Monthly' | 'Weekly' | 'Yearly'>(project.pmConfig?.frequency || 'Monthly');
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set(project.pmConfig?.excludedCategoryIds || []));
    const [searchQuery, setSearchQuery] = useState('');

    // Categories available for exclusion (Expenses only)
    const expenseCategories = useMemo(() => {
        return state.categories
            .filter(c => c.type === TransactionType.EXPENSE)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [state.categories]);

    // Initialize defaults if not set (Legacy behavior migration)
    useEffect(() => {
        if (!project.pmConfig?.excludedCategoryIds) {
            // Default legacy exclusions if never configured
            const legacyDefaults = expenseCategories.filter(c => 
                ['Broker Fee', 'Rebate Amount', 'Owner Payout', 'Project Management Cost'].includes(c.name) ||
                ['Customer Discount', 'Floor Discount', 'Lump Sum Discount', 'Misc Discount'].includes(c.name)
            ).map(c => c.id);
            setExcludedIds(new Set(legacyDefaults));
        }
    }, [project.pmConfig, expenseCategories]);

    const handleToggleCategory = (id: string) => {
        const newSet = new Set(excludedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExcludedIds(newSet);
    };

    const handleSubmit = () => {
        const numRate = parseFloat(rate);
        if (isNaN(numRate) || numRate < 0) return;

        const updatedProject: Project = {
            ...project,
            pmConfig: {
                rate: numRate,
                frequency,
                excludedCategoryIds: Array.from(excludedIds)
            }
        };
        onSave(updatedProject);
    };

    const filteredCategories = expenseCategories.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`PM Configuration: ${project.name}`}>
            <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-600 mb-4">
                        Define the Project Management fee structure.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input 
                                label="Fee Percentage (%)" 
                                type="number" 
                                min="0" 
                                step="0.1" 
                                value={rate} 
                                onChange={e => setRate(e.target.value)} 
                                required
                            />
                        </div>
                        <div>
                            <Select 
                                label="Calculation Frequency" 
                                value={frequency} 
                                onChange={e => setFrequency(e.target.value as any)}
                            >
                                <option value="Monthly">Monthly</option>
                                <option value="Weekly">Weekly</option>
                                <option value="Yearly">Yearly</option>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-100 p-3 border-b border-slate-200">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Excluded Cost Categories</label>
                        <p className="text-xs text-slate-500 mb-2">Select expense categories that should NOT contribute to the PM Fee calculation.</p>
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Search categories..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <div className="absolute left-2.5 top-1.5 text-slate-400">
                                <div className="w-4 h-4">{ICONS.search}</div>
                            </div>
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 bg-white">
                        {filteredCategories.map(cat => (
                            <label key={cat.id} className="flex items-center p-2 hover:bg-slate-50 rounded cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={excludedIds.has(cat.id)} 
                                    onChange={() => handleToggleCategory(cat.id)}
                                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300"
                                />
                                <span className="ml-3 text-sm text-slate-700">{cat.name}</span>
                            </label>
                        ))}
                        {filteredCategories.length === 0 && (
                            <p className="text-center text-xs text-slate-400 py-4">No categories found.</p>
                        )}
                    </div>
                    <div className="bg-slate-50 p-2 text-right border-t border-slate-200">
                        <span className="text-xs font-semibold text-indigo-600">
                            {excludedIds.size} categories excluded
                        </span>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t pt-4">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Save Configuration</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ProjectPMConfigForm;
