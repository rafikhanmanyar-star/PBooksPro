
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';

interface GeneratePayrollModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (month: string, issueDate: string) => void;
    defaultMonth: string;
}

const GeneratePayrollModal: React.FC<GeneratePayrollModalProps> = ({ isOpen, onClose, onGenerate, defaultMonth }) => {
    const [month, setMonth] = useState(defaultMonth);
    
    const getLastDayOfMonth = (monthStr: string) => {
        if (!monthStr) return '';
        const [y, m] = monthStr.split('-').map(Number);
        const date = new Date(y, m, 0);
        const year = date.getFullYear();
        const monthVal = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${monthVal}-${day}`;
    };

    const [issueDate, setIssueDate] = useState(() => getLastDayOfMonth(defaultMonth));

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setMonth(defaultMonth);
        }
    }, [isOpen, defaultMonth]);

    // Automatically update issue date to last day of month when month changes
    useEffect(() => {
        setIssueDate(getLastDayOfMonth(month));
    }, [month]);

    const handleGenerate = () => {
        onGenerate(month, issueDate);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate Payroll">
            <div className="space-y-4">
                <p className="text-sm text-slate-600">
                    Select the pay period (month) and the official issue date for the payslips.
                    Staff members who joined after the selected month will be excluded.
                </p>
                <Input 
                    label="Pay Period (Month)" 
                    type="month" 
                    value={month} 
                    onChange={e => setMonth(e.target.value)} 
                    required
                />
                <DatePicker 
                    label="Payslip Issue Date" 
                    value={issueDate} 
                    onChange={d => setIssueDate(d.toISOString().split('T')[0])} 
                    required
                />
                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleGenerate}>Generate</Button>
                </div>
            </div>
        </Modal>
    );
};

export default GeneratePayrollModal;
