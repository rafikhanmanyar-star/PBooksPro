
import React, { useState } from 'react';
import { InstallmentFrequency } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface InstallmentConfigFormProps {
    config?: {
        durationYears: number;
        downPaymentPercentage: number;
        frequency: InstallmentFrequency;
    };
    onSave: (config: { durationYears: number; downPaymentPercentage: number; frequency: InstallmentFrequency }) => void;
    onCancel: () => void;
}

const InstallmentConfigForm: React.FC<InstallmentConfigFormProps> = ({ config, onSave, onCancel }) => {
    const [durationYears, setDurationYears] = useState(config?.durationYears?.toString() || '1');
    const [downPaymentPercentage, setDownPaymentPercentage] = useState(config?.downPaymentPercentage?.toString() || '20');
    const [frequency, setFrequency] = useState<InstallmentFrequency>(config?.frequency || 'Monthly');

    const handleSave = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Validate inputs
        const duration = parseFloat(durationYears);
        const downPayment = parseFloat(downPaymentPercentage);
        
        if (isNaN(duration) || duration <= 0) {
            return; // Input component should handle this, but add safety check
        }
        
        if (isNaN(downPayment) || downPayment < 0 || downPayment > 100) {
            return; // Input component should handle this, but add safety check
        }
        
        onSave({
            durationYears: duration,
            downPaymentPercentage: downPayment,
            frequency
        });
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="font-semibold text-lg text-slate-800 mb-4">Organizational Installment Configuration</h3>
                <p className="text-sm text-slate-600 mb-4">This configuration will be used as the default for all project agreements when auto-generating installments.</p>
                
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
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSave();
                            }
                        }}
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
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSave();
                            }
                        }}
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
                <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onCancel();
                    }}
                >
                    Cancel
                </Button>
                <Button 
                    type="button"
                    onClick={handleSave}
                >
                    Save Configuration
                </Button>
            </div>
        </div>
    );
};

export default InstallmentConfigForm;
