
import React, { useState, useEffect } from 'react';
import { Project, InstallmentFrequency } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';

interface InstallmentConfigFormProps {
    project: Project;
    onSave: (project: Project) => void;
    onCancel: () => void;
}

const InstallmentConfigForm: React.FC<InstallmentConfigFormProps> = ({ project, onSave, onCancel }) => {
    const [durationYears, setDurationYears] = useState(project.installmentConfig?.durationYears?.toString() || '1');
    const [downPaymentPercentage, setDownPaymentPercentage] = useState(project.installmentConfig?.downPaymentPercentage?.toString() || '20');
    const [frequency, setFrequency] = useState<InstallmentFrequency>(project.installmentConfig?.frequency || 'Monthly');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...project,
            installmentConfig: {
                durationYears: parseFloat(durationYears) || 0,
                downPaymentPercentage: parseFloat(downPaymentPercentage) || 0,
                frequency
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="font-semibold text-lg text-slate-800 mb-4">Installment Configuration for {project.name}</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <Input 
                        id="installment-duration-years"
                        name="installment-duration-years"
                        label="Project Duration (Years)" 
                        type="number" 
                        min="0.1" 
                        step="0.1"
                        value={durationYears} 
                        onChange={e => setDurationYears(e.target.value)} 
                        required 
                    />
                    <Input 
                        id="installment-down-payment"
                        name="installment-down-payment"
                        label="Down Payment (%)" 
                        type="number" 
                        min="0" 
                        max="100"
                        value={downPaymentPercentage} 
                        onChange={e => setDownPaymentPercentage(e.target.value)} 
                        required 
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Installment Frequency</label>
                    <div className="flex flex-wrap gap-4">
                        {(['Yearly', 'Quarterly', 'Monthly'] as InstallmentFrequency[]).map((freq) => (
                            <label key={freq} className="flex items-center cursor-pointer">
                                <input 
                                    id={`installment-frequency-${freq.toLowerCase()}`}
                                    name="installment-frequency"
                                    type="radio" 
                                    value={freq} 
                                    checked={frequency === freq} 
                                    onChange={() => setFrequency(freq)}
                                    className="w-4 h-4 text-accent border-gray-300 focus:ring-accent"
                                />
                                <span className="ml-2 text-sm text-slate-700">{freq} Plan</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit">Save Configuration</Button>
            </div>
        </form>
    );
};

export default InstallmentConfigForm;
