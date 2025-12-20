
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { ICONS, CURRENCY } from '../../constants';
import { Staff } from '../../types';

interface RunPayrollWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

const RunPayrollWizard: React.FC<RunPayrollWizardProps> = ({ isOpen, onClose }) => {
    const { state, dispatch } = useAppContext();
    const [step, setStep] = useState(1);
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [issueDate, setIssueDate] = useState('');
    const [payrollType, setPayrollType] = useState<'All' | 'Project' | 'Rental'>('All');
    
    // --- Step 2 Data ---
    const [eligibleStaff, setEligibleStaff] = useState<Staff[]>([]);

    const handleNext = () => {
        if (step === 1) {
            // Validate and Prepare
            const [y, m] = month.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            const autoIssueDate = `${month}-${lastDay}`;
            setIssueDate(autoIssueDate);
            
            let staff: Staff[] = [];
            if (payrollType === 'All' || payrollType === 'Project') staff = [...staff, ...state.projectStaff];
            if (payrollType === 'All' || payrollType === 'Rental') staff = [...staff, ...state.rentalStaff];
            
            // Filter active
            staff = staff.filter(s => s.status !== 'Terminated' || new Date(s.exitDetails?.date || '') >= new Date(`${month}-01`));
            setEligibleStaff(staff);
            setStep(2);
        } else if (step === 2) {
            // Execute
             dispatch({ type: 'GENERATE_PAYROLL', payload: { month, issueDate, type: payrollType } });
             onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Run Payroll Wizard" size="lg">
            <div className="min-h-[400px] flex flex-col">
                {/* Steps Indicator */}
                <div className="flex items-center justify-center mb-8">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200'}`}>1</div>
                    <div className="w-16 h-1 bg-slate-200 mx-2"></div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200'}`}>2</div>
                </div>

                {step === 1 && (
                    <div className="space-y-6 flex-grow">
                        <h3 className="text-xl font-bold text-center">Select Period & Scope</h3>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <Input 
                                label="Pay Month" 
                                type="month" 
                                value={month} 
                                onChange={e => setMonth(e.target.value)} 
                                required 
                            />
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Payroll Scope</label>
                                <select 
                                    className="w-full border rounded-lg p-2"
                                    value={payrollType}
                                    onChange={(e) => setPayrollType(e.target.value as any)}
                                >
                                    <option value="All">Global (All Staff)</option>
                                    <option value="Project">Projects Only</option>
                                    <option value="Rental">Rental Mgmt Only</option>
                                </select>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
                            <h4 className="font-bold mb-2">Automated Checks:</h4>
                            <ul className="list-disc pl-4 space-y-1 text-slate-600">
                                <li>Prorate salaries for new joiners in {month}.</li>
                                <li>Prorate final settlement for exits in {month}.</li>
                                <li>Apply configured tax slabs.</li>
                                <li>Deduct active loan installments.</li>
                            </ul>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6 flex-grow">
                        <h3 className="text-xl font-bold text-center">Review Summary</h3>
                        
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-4 bg-indigo-50 rounded-lg">
                                <p className="text-sm text-indigo-600 font-bold uppercase">Staff Count</p>
                                <p className="text-2xl font-bold text-indigo-900">{eligibleStaff.length}</p>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-lg">
                                <p className="text-sm text-emerald-600 font-bold uppercase">Est. Cost</p>
                                <p className="text-2xl font-bold text-emerald-900">
                                    {CURRENCY} {eligibleStaff.reduce((sum, s) => sum + s.basicSalary, 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-600 font-bold uppercase">Pay Date</p>
                                <p className="text-xl font-bold text-slate-900">{issueDate}</p>
                            </div>
                        </div>
                        
                        <p className="text-center text-slate-500">
                            Clicking 'Process' will generate draft payslips for all eligible employees. You can review and edit individual payslips before payment.
                        </p>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-6 border-t mt-auto">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleNext}>{step === 1 ? 'Next' : 'Process Payroll'}</Button>
                </div>
            </div>
        </Modal>
    );
};

export default RunPayrollWizard;
