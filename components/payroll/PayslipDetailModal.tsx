
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Payslip, Staff, PayslipStatus } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY, ICONS } from '../../constants';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import { formatDate } from '../../utils/dateUtils';
import Input from '../ui/Input';
import { useNotification } from '../../context/NotificationContext';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface PayslipDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    payslip: Payslip;
    onPay?: () => void;
}

const PayslipDetailModal: React.FC<PayslipDetailModalProps> = ({ isOpen, onClose, payslip, onPay }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    const { handlePrint } = usePrint();
    // Support both old (staffId) and new (employeeId) payslip structures
    const employeeId = (payslip as any).employeeId || (payslip as any).staffId;
    const staff = [...state.projectStaff, ...state.rentalStaff].find(s => s.id === employeeId);
    const employee = (state.employees || []).find(e => e.id === employeeId);
    const contact = state.contacts.find(c => c.id === employeeId);
    const { printSettings } = state;

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [editedIssueDate, setEditedIssueDate] = useState('');
    const [editedBonuses, setEditedBonuses] = useState<{name: string, amount: number, date?: string}[]>([]);
    const [editedDeductions, setEditedDeductions] = useState<{name: string, amount: number}[]>([]);
    const [newBonusName, setNewBonusName] = useState('');
    const [newBonusAmount, setNewBonusAmount] = useState('');
    const [newBonusDate, setNewBonusDate] = useState('');
    const [newDeductionName, setNewDeductionName] = useState('');
    const [newDeductionAmount, setNewDeductionAmount] = useState('');


    useEffect(() => {
        if (isOpen) {
            setEditedIssueDate(payslip.issueDate.split('T')[0]);
            setEditedBonuses(payslip.bonuses || []);
            setEditedDeductions(payslip.deductions || []);
            setNewBonusName('');
            setNewBonusAmount('');
            setNewBonusDate(payslip.issueDate.split('T')[0]);
            setNewDeductionName('');
            setNewDeductionAmount('');
            setIsEditing(false);
        }
    }, [isOpen, payslip]);


    const handleDelete = async () => {
        const isPaid = payslip.status === PayslipStatus.PAID || (payslip.paidAmount && payslip.paidAmount > 0);
        const confirmMsg = isPaid 
            ? "This payslip has payments recorded. Deleting it will NOT remove the payment transactions from the ledger (you must delete those manually). Are you sure you want to delete this payslip?" 
            : "Are you sure you want to delete this payslip?";
            
        if (await showConfirm(confirmMsg, { title: 'Delete Payslip', confirmLabel: 'Delete', cancelLabel: 'Cancel' })) {
            const actionType = (state.projectPayslips || []).some(p => p.id === payslip.id) ? 'DELETE_PROJECT_PAYSLIP' : 'DELETE_RENTAL_PAYSLIP';
            dispatch({ type: actionType, payload: payslip.id });
            showToast('Payslip deleted.');
            onClose();
        }
    };

    const handleAddBonus = () => {
        const amount = parseFloat(newBonusAmount);
        if (!newBonusName || isNaN(amount) || amount <= 0) return;
        
        setEditedBonuses([...editedBonuses, { name: newBonusName, amount, date: newBonusDate }]);
        setNewBonusName('');
        setNewBonusAmount('');
    };

    const handleRemoveBonus = (index: number) => {
        setEditedBonuses(editedBonuses.filter((_, i) => i !== index));
    };

    const handleAddDeduction = () => {
        const amount = parseFloat(newDeductionAmount);
        if (!newDeductionName || isNaN(amount) || amount <= 0) return;
        
        setEditedDeductions([...editedDeductions, { name: newDeductionName, amount }]);
        setNewDeductionName('');
        setNewDeductionAmount('');
    };

    const handleRemoveDeduction = (index: number) => {
        setEditedDeductions(editedDeductions.filter((_, i) => i !== index));
    };
    
    // Allow editing amount of existing deduction directly
    const handleDeductionChange = (index: number, newAmount: string) => {
        const amt = parseFloat(newAmount);
        if (isNaN(amt)) return;
        const newDeductions = [...editedDeductions];
        newDeductions[index].amount = amt;
        setEditedDeductions(newDeductions);
    };


    const handleSaveChanges = () => {
        const newTotalBonuses = editedBonuses.reduce((sum, b) => sum + b.amount, 0);
        const newTotalDeductions = editedDeductions.reduce((sum, d) => sum + d.amount, 0);
        const newGross = payslip.basicSalary + payslip.totalAllowances + newTotalBonuses;
        const newNet = newGross - newTotalDeductions;

        const updatedPayslip = {
            ...payslip,
            issueDate: new Date(editedIssueDate).toISOString(),
            bonuses: editedBonuses,
            totalBonuses: newTotalBonuses,
            deductions: editedDeductions,
            totalDeductions: newTotalDeductions,
            grossSalary: newGross,
            netSalary: newNet
        };
        
        dispatch({ type: 'UPDATE_PAYSLIP', payload: updatedPayslip });
        setIsEditing(false);
        showToast('Payslip updated successfully!', 'success');
        onClose();
    };

    const isPending = payslip.status === PayslipStatus.PENDING;

    // Calculate live totals for edit view
    const currentTotalBonuses = editedBonuses.reduce((sum, b) => sum + b.amount, 0);
    const currentTotalDeductions = editedDeductions.reduce((sum, d) => sum + d.amount, 0);
    const currentGross = payslip.basicSalary + payslip.totalAllowances + currentTotalBonuses;
    const currentNet = currentGross - currentTotalDeductions;
    const balance = (isEditing ? currentNet : payslip.netSalary) - (payslip.paidAmount || 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Payslip" : "Payslip Details"} size="xl">
            <div className="p-4 bg-white">
                
                {/* Styles for printing - robust isolation of the printable area */}
                <style>{STANDARD_PRINT_STYLES}</style>

                {/* Printable Content Area */}
                <div className="printable-area border p-8 rounded-lg border-slate-300 relative bg-white" id="printable-area">
                    
                    {/* Header */}
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
                        <div className="flex gap-4 items-center">
                            {printSettings.showLogo && printSettings.logoUrl && (
                                <img src={printSettings.logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
                            )}
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-wide">{printSettings.companyName}</h2>
                                <div className="text-sm text-slate-600 mt-1 space-y-0.5">
                                    <p className="whitespace-pre-wrap">{printSettings.companyAddress}</p>
                                    <p>{printSettings.companyContact}</p>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <h3 className="text-3xl font-bold text-slate-800 uppercase tracking-widest">Payslip</h3>
                            <p className="text-base text-slate-600 font-medium mt-1">
                                {new Date(payslip.month + '-01').toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                            </p>
                            <div className="mt-3">
                                <span className={`inline-block px-3 py-1 rounded border-2 text-xs font-bold uppercase tracking-wider ${
                                    payslip.status === 'Paid' ? 'border-emerald-600 text-emerald-700' : 
                                    payslip.status === 'Partially Paid' ? 'border-amber-600 text-amber-700' :
                                    'border-slate-400 text-slate-600'
                                }`}>
                                    {payslip.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Employee Details Grid */}
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-6 grid grid-cols-2 gap-8 text-sm">
                        <div>
                            <p className="text-slate-400 uppercase text-[10px] font-bold tracking-widest mb-2">Employee To</p>
                            <p className="font-bold text-lg text-slate-900">
                                {employee 
                                    ? `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`
                                    : contact?.name || 'Unknown Employee'
                                }
                            </p>
                            <p className="text-slate-700 font-medium">
                                {employee?.employmentDetails.designation || staff?.designation || 'N/A'}
                            </p>
                            {(employee?.employeeId || staff?.id) && (
                                <p className="text-slate-500 mt-1 font-mono text-xs">
                                    ID: {(employee?.employeeId || staff?.id || '').slice(-6).toUpperCase()}
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-slate-400 uppercase text-[10px] font-bold tracking-widest mb-2">Payment Details</p>
                            {isEditing ? (
                                <div className="flex justify-end no-print">
                                    <Input type="date" label="Issue Date" value={editedIssueDate} onChange={e => setEditedIssueDate(e.target.value)} className="w-40 text-right" />
                                </div>
                            ) : (
                                <p className="text-slate-800"><span className="text-slate-500 mr-2">Date:</span>{formatDate(payslip.issueDate)}</p>
                            )}
                            {((employee?.bankDetails?.bankName) || (staff?.bankDetails?.bankName)) && (
                                <p className="text-slate-800 mt-1">
                                    <span className="text-slate-500 mr-2">Bank:</span>
                                    {employee?.bankDetails?.bankName || staff?.bankDetails?.bankName}
                                </p>
                            )}
                            {((employee?.bankDetails?.accountNumber) || (staff?.bankDetails?.accountNumber)) && (
                                <p className="text-slate-800">
                                    <span className="text-slate-500 mr-2">Acc:</span>
                                    {employee?.bankDetails?.accountNumber || staff?.bankDetails?.accountNumber}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Salary Breakdown Table */}
                    <div className="mb-8">
                        <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                            {/* Earnings Column */}
                            <div className="bg-white p-4">
                                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-3 uppercase text-xs tracking-wider flex justify-between items-center">
                                    Earnings
                                    <span className="text-slate-400 font-normal normal-case">Amount</span>
                                </h4>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-700 font-medium">Basic Salary</span>
                                        <span className="font-mono tabular-nums text-slate-900">{CURRENCY} {payslip.basicSalary.toLocaleString()}</span>
                                    </div>
                                    {payslip.allowances.map((a, idx) => (
                                        <div key={idx} className="flex justify-between text-slate-600">
                                            <span>{a.name}</span>
                                            <span className="font-mono tabular-nums">{CURRENCY} {a.amount.toLocaleString()}</span>
                                        </div>
                                    ))}
                                    
                                    {/* Bonuses Section */}
                                    {isEditing ? (
                                        <div className="bg-indigo-50 p-2 rounded-md border border-indigo-100 my-2 space-y-2 no-print">
                                            <p className="text-xs font-bold text-indigo-800 uppercase">Special Bonuses</p>
                                            {editedBonuses.map((b, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-indigo-700 border-b border-indigo-100 pb-1">
                                                    <div>
                                                        <span className="block font-medium">{b.name}</span>
                                                        {b.date && <span className="text-[10px] text-indigo-400">{formatDate(b.date)}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span>{CURRENCY} {b.amount.toLocaleString()}</span>
                                                        <button onClick={() => handleRemoveBonus(idx)} className="text-rose-500 hover:text-rose-700"><div className="w-3 h-3">{ICONS.trash}</div></button>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex flex-col gap-1 pt-1">
                                                <input 
                                                    placeholder="Bonus Name (e.g. Eid)" 
                                                    className="w-full px-2 py-1 text-xs border rounded"
                                                    value={newBonusName}
                                                    onChange={e => setNewBonusName(e.target.value)}
                                                />
                                                <div className="flex gap-1">
                                                    <input 
                                                        placeholder="Amt" 
                                                        type="number"
                                                        className="w-20 px-2 py-1 text-xs border rounded [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        value={newBonusAmount}
                                                        onChange={e => setNewBonusAmount(e.target.value)}
                                                    />
                                                    <input 
                                                        type="date"
                                                        className="flex-1 px-2 py-1 text-xs border rounded"
                                                        value={newBonusDate}
                                                        onChange={e => setNewBonusDate(e.target.value)}
                                                    />
                                                    <button onClick={handleAddBonus} className="bg-indigo-600 text-white px-2 rounded text-xs hover:bg-indigo-700">+</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        (payslip.bonuses && payslip.bonuses.length > 0) && (
                                            <div className="pt-2 space-y-2 border-t border-dashed border-slate-100 mt-2">
                                                {payslip.bonuses.map((b, idx) => (
                                                    <div key={idx} className="flex justify-between text-slate-700">
                                                        <span className="flex items-center gap-1">
                                                            {b.name} 
                                                            {b.date && <span className="text-[10px] text-slate-400 bg-slate-50 px-1 rounded border border-slate-100">{formatDate(b.date)}</span>}
                                                        </span>
                                                        <span className="font-mono tabular-nums">{CURRENCY} {b.amount.toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </div>
                                <div className="flex justify-between font-bold pt-3 border-t border-slate-200 mt-4 text-slate-900 text-base">
                                    <span>Gross Earnings</span>
                                    <span className="font-mono tabular-nums">{CURRENCY} {(isEditing ? currentGross : payslip.grossSalary).toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Deductions Column */}
                            <div className="bg-white p-4">
                                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-3 uppercase text-xs tracking-wider flex justify-between items-center">
                                    Deductions
                                    <span className="text-slate-400 font-normal normal-case">Amount</span>
                                </h4>
                                <div className="space-y-3 text-sm min-h-[4rem]">
                                    {isEditing ? (
                                        <>
                                            {editedDeductions.map((d, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-slate-700">
                                                    <span>{d.name}</span>
                                                    <div className="flex items-center gap-1">
                                                        <input 
                                                            type="number"
                                                            className="w-20 px-1 py-0.5 text-right border rounded text-xs no-print [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            value={d.amount}
                                                            onChange={e => handleDeductionChange(idx, e.target.value)}
                                                        />
                                                        {d.name !== 'Advance Adjustment' && (
                                                             <button onClick={() => handleRemoveDeduction(idx)} className="text-rose-500 hover:text-rose-700 no-print ml-1"><div className="w-3 h-3">{ICONS.trash}</div></button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            <div className="bg-amber-50 p-2 rounded border border-amber-100 mt-2 no-print">
                                                 <div className="flex flex-col gap-1">
                                                    <input 
                                                        placeholder="Deduction Name" 
                                                        className="w-full px-2 py-1 text-xs border rounded"
                                                        value={newDeductionName}
                                                        onChange={e => setNewDeductionName(e.target.value)}
                                                    />
                                                    <div className="flex gap-1">
                                                        <input 
                                                            placeholder="Amt" 
                                                            type="number"
                                                            className="flex-1 px-2 py-1 text-xs border rounded [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            value={newDeductionAmount}
                                                            onChange={e => setNewDeductionAmount(e.target.value)}
                                                        />
                                                        <button onClick={handleAddDeduction} className="bg-amber-600 text-white px-2 rounded text-xs hover:bg-amber-700">+</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        payslip.deductions.length > 0 ? payslip.deductions.map((d, idx) => (
                                            <div key={idx} className="flex justify-between text-slate-700">
                                                <span>{d.name}</span>
                                                <span className="font-mono tabular-nums">{CURRENCY} {d.amount.toLocaleString()}</span>
                                            </div>
                                        )) : <p className="text-slate-400 italic text-xs py-2">No deductions applied.</p>
                                    )}
                                </div>
                                <div className="flex justify-between font-bold pt-3 border-t border-slate-200 mt-auto text-slate-900 text-base">
                                    <span>Total Deductions</span>
                                    <span className="font-mono tabular-nums">{CURRENCY} {(isEditing ? currentTotalDeductions : payslip.totalDeductions).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Net Pay Box */}
                    <div className="bg-slate-800 text-white p-6 rounded-lg flex flex-col sm:flex-row justify-between items-center shadow-none mb-12 border border-slate-800 gap-4">
                        <div className="w-full sm:w-auto">
                            <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Net Pay</span>
                            <span className="block text-xs text-slate-400">(Earnings - Deductions)</span>
                            <span className="font-bold text-2xl sm:text-3xl font-mono tabular-nums mt-1 block">{CURRENCY} {(isEditing ? currentNet : payslip.netSalary).toLocaleString()}</span>
                        </div>
                        
                        {/* Partial Payment Details */}
                        <div className="w-full sm:w-auto bg-slate-700/50 rounded px-4 py-2 text-right">
                            <div className="text-xs text-slate-300 flex justify-between sm:justify-end gap-4">
                                <span>Paid:</span>
                                <span className="font-mono tabular-nums text-emerald-400">{CURRENCY} {(payslip.paidAmount || 0).toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-slate-300 flex justify-between sm:justify-end gap-4 mt-1 border-t border-slate-600 pt-1">
                                <span>Balance:</span>
                                <span className="font-mono tabular-nums text-rose-400 font-bold">{CURRENCY} {balance.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Signature Section */}
                    <div className="flex justify-between px-8 mt-auto pt-12 text-xs text-slate-500">
                        <div className="text-center">
                            <div className="border-t border-slate-300 w-48 mb-2"></div>
                            <p className="font-medium uppercase tracking-wide">Employer Signature</p>
                        </div>
                        <div className="text-center">
                            <div className="border-t border-slate-300 w-48 mb-2"></div>
                            <p className="font-medium uppercase tracking-wide">Employee Signature</p>
                        </div>
                    </div>
                    
                    <div className="text-center mt-8 text-[10px] text-slate-400">
                        <p>{printSettings.footerText || 'Computer Generated Payslip'}</p>
                    </div>
                </div>

                {/* Action Buttons (Screen Only) */}
                <div className="flex justify-between items-center mt-6 pt-4 border-t no-print">
                    <div className="flex gap-2">
                        {!isEditing && (
                            <>
                                <Button variant="danger" onClick={handleDelete} className="px-3">
                                    <div className="w-4 h-4 mr-1">{ICONS.trash}</div> Delete
                                </Button>
                                {isPending && (
                                    <Button variant="secondary" onClick={() => setIsEditing(true)} className="text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100">
                                        <div className="w-4 h-4 mr-2">{ICONS.edit}</div>
                                        Edit Payslip
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                                <Button onClick={handleSaveChanges}>Save Changes</Button>
                            </>
                        ) : (
                            <>
                                {onPay && payslip.status !== 'Paid' && (
                                    <Button onClick={onPay} className="bg-emerald-600 hover:bg-emerald-700">Mark as Paid</Button>
                                )}
                                <Button variant="secondary" onClick={onClose}>Close</Button>
                                <PrintButton
                                    variant="primary"
                                    onPrint={handlePrint}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default PayslipDetailModal;
