
import React, { useState } from 'react';
import { InstallmentFrequency } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';

export type InstallmentConfig = {
    durationYears: number;
    downPaymentPercentage: number;
    frequency: InstallmentFrequency;
    optionalInstallment?: boolean;
    optionalInstallmentName?: string;
};

interface InstallmentConfigFormProps {
    config?: InstallmentConfig;
    onSave: (config: InstallmentConfig) => void;
    onCancel: () => void;
}

const DEFAULT_DURATION = '2';
const DEFAULT_DOWN_PAYMENT = '25';
const DEFAULT_FREQUENCY: InstallmentFrequency = 'Quarterly';
const DEFAULT_OPTIONAL_INSTALLMENT = true;
const DEFAULT_OPTIONAL_NAME = 'On Possession';

const InstallmentConfigForm: React.FC<InstallmentConfigFormProps> = ({ config, onSave, onCancel }) => {
    const [durationYears, setDurationYears] = useState(config?.durationYears?.toString() ?? DEFAULT_DURATION);
    const [downPaymentPercentage, setDownPaymentPercentage] = useState(config?.downPaymentPercentage?.toString() ?? DEFAULT_DOWN_PAYMENT);
    const [frequency, setFrequency] = useState<InstallmentFrequency>(config?.frequency ?? DEFAULT_FREQUENCY);
    const [optionalInstallment, setOptionalInstallment] = useState(config !== undefined && config.optionalInstallment !== undefined ? !!config.optionalInstallment : DEFAULT_OPTIONAL_INSTALLMENT);
    const [optionalInstallmentName, setOptionalInstallmentName] = useState(config?.optionalInstallmentName ?? DEFAULT_OPTIONAL_NAME);

    const handleSave = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        const duration = parseFloat(durationYears);
        const downPayment = parseFloat(downPaymentPercentage);
        
        if (isNaN(duration) || duration <= 0) return;
        if (isNaN(downPayment) || downPayment < 0 || downPayment > 100) return;
        
        onSave({
            durationYears: duration,
            downPaymentPercentage: downPayment,
            frequency,
            optionalInstallment: optionalInstallment || undefined,
            optionalInstallmentName: optionalInstallment ? (optionalInstallmentName.trim() || DEFAULT_OPTIONAL_NAME) : undefined
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

                <div className="border-t border-slate-200 pt-4 mt-4">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                            type="checkbox"
                            checked={optionalInstallment}
                            onChange={(e) => setOptionalInstallment(e.target.checked)}
                            className="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                        />
                        <span className="text-sm font-medium text-slate-700">Include optional installment</span>
                    </label>
                    <p className="text-xs text-slate-500 mb-2">Add one extra installment at the end (e.g. On Possession). It will receive the remainder so total installments equal the agreement value.</p>
                    {optionalInstallment && (
                        <Input
                            label="Optional installment name"
                            type="text"
                            value={optionalInstallmentName}
                            onChange={(e) => setOptionalInstallmentName(e.target.value)}
                            placeholder="e.g. On Possession"
                            className="max-w-xs"
                        />
                    )}
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
