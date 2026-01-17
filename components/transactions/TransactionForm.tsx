
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Transaction, TransactionType, LoanSubtype, ContactType, Account, InvoiceStatus, AccountType, ContractStatus } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY } from '../../constants';
import { WhatsAppService } from '../../services/whatsappService';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';

interface TransactionFormProps {
    onClose: () => void;
    transactionToEdit?: Transaction | null;
    transactionTypeForNew?: TransactionType | null;
    onShowDeleteWarning: (tx: Transaction) => void;
}

type CostCenterType = 'project' | 'building' | 'general';

const TransactionForm: React.FC<TransactionFormProps> = ({ onClose, transactionToEdit, transactionTypeForNew, onShowDeleteWarning }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showConfirm } = useNotification();
    const entityFormModal = useEntityFormModal();

    const [type, setType] = useState<TransactionType>(transactionToEdit?.type || transactionTypeForNew || TransactionType.EXPENSE);
    const [subtype, setSubtype] = useState<LoanSubtype | ''>(transactionToEdit?.subtype || '');
    const [amount, setAmount] = useState(transactionToEdit ? Math.abs(transactionToEdit.amount).toString() : '');
    
    // Get initial date: use preserved date if option is enabled and creating new transaction
    const getInitialDate = () => {
        if (transactionToEdit) {
            return new Date(transactionToEdit.date).toISOString().split('T')[0];
        }
        if (state.enableDatePreservation && state.lastPreservedDate) {
            return state.lastPreservedDate;
        }
        return new Date().toISOString().split('T')[0];
    };
    
    const [date, setDate] = useState(getInitialDate());
    
    // Save date to preserved date when changed (if option is enabled)
    const handleDateChange = (dateValue: Date) => {
        const dateStr = dateValue.toISOString().split('T')[0];
        setDate(dateStr);
        if (state.enableDatePreservation && !transactionToEdit) {
            dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: dateStr });
        }
    };
    const [description, setDescription] = useState(transactionToEdit?.description || '');
    
    const [accountId, setAccountId] = useState(transactionToEdit?.accountId || '');
    const [toAccountId, setToAccountId] = useState(transactionToEdit?.toAccountId || '');
    
    const [categoryId, setCategoryId] = useState(transactionToEdit?.categoryId || '');
    const [contactId, setContactId] = useState(transactionToEdit?.contactId || '');
    const [projectId, setProjectId] = useState(transactionToEdit?.projectId || state.defaultProjectId || '');
    const [buildingId, setBuildingId] = useState(transactionToEdit?.buildingId || '');
    const [propertyId, setPropertyId] = useState(transactionToEdit?.propertyId || '');
    const [unitId, setUnitId] = useState(transactionToEdit?.unitId || '');
    const [linkedBillId, setLinkedBillId] = useState(transactionToEdit?.billId || '');
    const [contractId, setContractId] = useState(transactionToEdit?.contractId || '');

    // Derived State for Bill Payment
    const billBeingPaid = useMemo(() => state.bills.find(b => b.id === linkedBillId), [state.bills, linkedBillId]);
    const isPayingBill = !!billBeingPaid;

    // Filter for Bank Accounts Only (exclude Internal Clearing)
    const bankAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    // Cost Center State Logic
    const [costCenterType, setCostCenterType] = useState<CostCenterType>(() => {
        if (transactionToEdit?.projectId) return 'project';
        if (transactionToEdit?.buildingId) return 'building';
        return 'general';
    });

    // Available Contracts Logic
    const availableContracts = useMemo(() => {
        if (type !== TransactionType.EXPENSE || costCenterType !== 'project' || !projectId || !contactId) return [];
        
        // Filter contracts for this project and vendor (Active only, unless editing an existing transaction with that contract)
        return (state.contracts || []).filter(c => 
            c.projectId === projectId && 
            c.vendorId === contactId && 
            (c.status === ContractStatus.ACTIVE || c.id === contractId)
        ).map(c => ({ id: c.id, name: `${c.contractNumber} - ${c.name}` }));
    }, [state.contracts, type, costCenterType, projectId, contactId, contractId]);

    // Initialize default account
    useEffect(() => {
        if (!transactionToEdit && !accountId) {
            const cash = bankAccounts.find(a => a.name === 'Cash');
            if (cash) setAccountId(cash.id);
            else if (bankAccounts.length > 0) setAccountId(bankAccounts[0].id);
        }
    }, [transactionToEdit, accountId, bankAccounts]);

    // Reset fields when switching types
    useEffect(() => {
        if (type !== TransactionType.LOAN) setSubtype('');
        else if (!subtype && !transactionToEdit) setSubtype(LoanSubtype.GIVE);
    }, [type]);

    // Auto-update context based on Cost Center selections (only if NOT paying a specific bill or editing one with fixed context)
    useEffect(() => {
        if (type !== TransactionType.TRANSFER && type !== TransactionType.LOAN && !linkedBillId && !transactionToEdit) {
            if (costCenterType === 'project') {
                setBuildingId('');
                setPropertyId('');
                if (!projectId) setContactId(''); 
            } else if (costCenterType === 'building') {
                setProjectId('');
                setPropertyId(''); 
                // Keep contactId as it might be a vendor for the building
            } else {
                setProjectId('');
                setBuildingId('');
                setPropertyId('');
            }
        }
    }, [costCenterType, type, linkedBillId, transactionToEdit, projectId]); 

    const filteredCategories = useMemo(() => {
        return state.categories.filter(c => c.type === type);
    }, [state.categories, type]);

    const filteredContacts = useMemo(() => {
        if (type === TransactionType.LOAN) {
            return state.contacts.filter(c => c.type === ContactType.FRIEND_FAMILY);
        }
        return state.contacts;
    }, [state.contacts, type]);

    // Filtered Bills for Linking
    const availableBills = useMemo(() => {
        if (type !== TransactionType.EXPENSE) return [];
        return state.bills.filter(b => {
            if (b.status === InvoiceStatus.PAID && b.id !== transactionToEdit?.billId) return false;
            
            // Match Context
            if (costCenterType === 'project') {
                return b.projectId === projectId;
            }
            if (costCenterType === 'building') {
                return b.buildingId === buildingId;
            }
            return !b.projectId && !b.buildingId; // General bills
        });
    }, [state.bills, type, costCenterType, projectId, buildingId, transactionToEdit]);

    const getAccountLabel = () => {
        if (type === TransactionType.TRANSFER) return "From Account";
        if (type === TransactionType.INCOME) return "Deposit To";
        if (type === TransactionType.LOAN) {
             return subtype === LoanSubtype.RECEIVE ? "Deposit To" : "Pay From";
        }
        return "Pay From";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert('Please enter a valid positive amount.');
            return;
        }
        if (!accountId) {
            await showAlert('Please select an account.');
            return;
        }
        
        // Cost Center Validation (For Expense OR Income if Project/Building selected)
        // For loans, project/building is optional
        if (type !== TransactionType.TRANSFER && type !== TransactionType.LOAN && !isPayingBill) {
            if (costCenterType === 'project' && !projectId) {
                await showAlert('Please select a Project.');
                return;
            }
            if (costCenterType === 'building' && !buildingId) {
                await showAlert('Please select a Building.');
                return;
            }
        }

        if (type === TransactionType.TRANSFER && !toAccountId) {
            await showAlert('Please select a destination account for transfer.');
            return;
        }
        if (type === TransactionType.TRANSFER && accountId === toAccountId) {
            await showAlert('Source and destination accounts cannot be the same.');
            return;
        }
        if (type === TransactionType.LOAN && !contactId) {
            await showAlert('Please select a contact for the loan.');
            return;
        }

        const baseTx = {
            type,
            subtype: subtype || undefined,
            amount: numAmount,
            date: new Date(date).toISOString(),
            description,
            accountId,
            fromAccountId: type === TransactionType.TRANSFER ? accountId : undefined,
            toAccountId: type === TransactionType.TRANSFER ? toAccountId : undefined,
            categoryId: (type === TransactionType.TRANSFER || type === TransactionType.LOAN) ? undefined : categoryId,
            contactId: contactId || undefined,
            projectId: projectId || undefined,
            buildingId: buildingId || undefined,
            propertyId: propertyId || undefined,
            unitId: unitId || undefined,
            invoiceId: transactionToEdit?.invoiceId,
            billId: linkedBillId || undefined, // Use state linked bill
            agreementId: transactionToEdit?.agreementId,
            contractId: contractId || undefined,
        };

        if (transactionToEdit && transactionToEdit.id) {
            dispatch({ type: 'UPDATE_TRANSACTION', payload: { ...transactionToEdit, ...baseTx } });
        } else {
            dispatch({ type: 'ADD_TRANSACTION', payload: { ...baseTx, id: Date.now().toString() } });
            
            // --- WhatsApp Receipt Logic for New Invoice Payments ---
            if (type === TransactionType.INCOME && baseTx.invoiceId) {
                const invoice = state.invoices.find(i => i.id === baseTx.invoiceId);
                const contact = state.contacts.find(c => c.id === baseTx.contactId);
                
                if (invoice && contact && contact.contactNo) {
                    const confirmReceipt = await showConfirm(
                        "Payment recorded successfully. Do you want to send the receipt on WhatsApp?", 
                        { title: "Send Receipt", confirmLabel: "Send WhatsApp", cancelLabel: "No, Later" }
                    );
                    
                    if (confirmReceipt) {
                        // Resolve Context Name (Project/Unit)
                        let subject = 'Invoice';
                        let unitName = '';
                        if (invoice.projectId) {
                            const project = state.projects.find(p => p.id === invoice.projectId);
                            const unit = state.units.find(u => u.id === invoice.unitId);
                            subject = project ? project.name : 'Project';
                            if (unit) {
                                subject += ` - Unit ${unit.name}`;
                                unitName = unit.name;
                            }
                        }

                        // Balance Calculation (Invoice Amount - (Already Paid + Current Payment))
                        const totalPaid = (invoice.paidAmount || 0) + numAmount;
                        const remainingBalance = Math.max(0, invoice.amount - totalPaid);

                        try {
                            const { whatsAppTemplates } = state;
                            const message = WhatsAppService.generateInvoiceReceipt(
                                whatsAppTemplates.invoiceReceipt,
                                contact,
                                invoice.invoiceNumber,
                                numAmount,
                                remainingBalance,
                                subject,
                                unitName
                            );
                            WhatsAppService.sendMessage({ contact, message });
                        } catch (error) {
                            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
                        }
                    }
                }
            }
        }
        onClose();
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (transactionToEdit && transactionToEdit.id) {
            onShowDeleteWarning(transactionToEdit);
        }
    };

    return (
        <>
        <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* BILL PAYMENT CONTEXT BANNER */}
            {isPayingBill && (!transactionToEdit?.billId || transactionToEdit.id) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm mb-4">
                    <div className="flex justify-between items-start mb-2 border-b border-gray-200 pb-2">
                        <div>
                            <span className="font-semibold text-gray-800 block">Paying Bill #{billBeingPaid.billNumber}</span>
                            <span className="text-gray-500 text-xs">Vendor: {state.contacts.find(c => c.id === billBeingPaid.contactId)?.name}</span>
                        </div>
                        {/* Only allow unlinking if we are not in forced edit/pay mode */}
                        {!transactionToEdit?.billId && (
                            <button type="button" onClick={() => setLinkedBillId('')} className="text-xs text-red-600 hover:text-red-700 font-medium">
                                Unlink Bill
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-gray-600">
                        <div><span className="font-semibold">Category:</span> {state.categories.find(c => c.id === billBeingPaid.categoryId)?.name || 'Uncategorized'}</div>
                        {billBeingPaid.projectId && <div><span className="font-semibold">Project:</span> {state.projects.find(p => p.id === billBeingPaid.projectId)?.name}</div>}
                        {billBeingPaid.buildingId && <div><span className="font-semibold">Building:</span> {state.buildings.find(b => b.id === billBeingPaid.buildingId)?.name}</div>}
                        {billBeingPaid.propertyId && <div><span className="font-semibold">Property:</span> {state.properties.find(p => p.id === billBeingPaid.propertyId)?.name}</div>}
                    </div>
                    {billBeingPaid.contractId && (
                        <div className="text-green-600 font-medium mt-1 pt-1 border-t border-gray-200">
                            Linked to Contract: {state.contracts.find(c => c.id === billBeingPaid.contractId)?.name}
                        </div>
                    )}
                </div>
            )}

            {/* Top Row: Type & Date */}
            <div className="grid grid-cols-2 gap-4">
                {!isPayingBill && (
                    <Select 
                        id="transaction-type"
                        name="transaction-type"
                        label="Type" 
                        value={type} 
                        onChange={e => setType(e.target.value as TransactionType)} 
                        disabled={!!transactionToEdit}
                    >
                        {Object.values(TransactionType).map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                )}
                
                <div className={isPayingBill ? "col-span-2" : ""}>
                    {type === TransactionType.LOAN ? (
                        <Select 
                            id="transaction-action"
                            name="transaction-action"
                            label="Action" 
                            value={subtype} 
                            onChange={e => setSubtype(e.target.value as LoanSubtype)}
                        >
                            <option value={LoanSubtype.RECEIVE}>Receive Loan</option>
                            <option value={LoanSubtype.GIVE}>Give Loan</option>
                        </Select>
                    ) : (
                        <DatePicker 
                            id="transaction-date"
                            name="transaction-date"
                            label="Date" 
                            value={date} 
                            onChange={handleDateChange} 
                            required 
                        />
                    )}
                </div>
            </div>
            
            {type === TransactionType.LOAN && (
                 <DatePicker 
                    id="transaction-loan-date"
                    name="transaction-loan-date"
                    label="Date" 
                    value={date} 
                    onChange={handleDateChange} 
                    required 
                 />
            )}

            {/* Amount */}
            <Input 
                id="transaction-amount"
                name="transaction-amount"
                label="Amount" 
                type="number" 
                step="0.01" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                required 
                autoFocus={!isPayingBill} 
                className="block w-full px-3 py-3 sm:py-2 border-2 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-base sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors tabular-nums text-lg font-bold" 
            />

            {/* Account Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ComboBox 
                    id="transaction-account"
                    name="transaction-account"
                    label={getAccountLabel()} 
                    items={bankAccounts} 
                    selectedId={accountId} 
                    onSelect={item => setAccountId(item?.id || '')} 
                    required 
                    entityType="account"
                    onAddNew={(entityType, name) => {
                        entityFormModal.openForm('account', name, undefined, undefined, (newId) => {
                            setAccountId(newId);
                        });
                    }}
                />
                {type === TransactionType.TRANSFER && (
                    <ComboBox 
                        id="transaction-to-account"
                        name="transaction-to-account"
                        label="To Account" 
                        items={bankAccounts} 
                        selectedId={toAccountId} 
                        onSelect={item => setToAccountId(item?.id || '')} 
                        required 
                        entityType="account"
                        onAddNew={(entityType, name) => {
                            entityFormModal.openForm('account', name, undefined, undefined, (newId) => {
                                setToAccountId(newId);
                            });
                        }}
                    />
                )}
            </div>

            {/* Hidden inputs when paying bill - Context is managed via bill ID logic */}
            {!isPayingBill && (
                <>
                    {/* Category */}
                    {type !== TransactionType.TRANSFER && type !== TransactionType.LOAN && (
                        <ComboBox 
                            id="transaction-category"
                            name="transaction-category"
                            label="Category" 
                            items={filteredCategories} 
                            selectedId={categoryId} 
                            onSelect={item => setCategoryId(item?.id || '')} 
                            placeholder="Select Category"
                            entityType="category"
                            onAddNew={(entityType, name) => {
                                entityFormModal.openForm('category', name, undefined, type, (newId) => {
                                    setCategoryId(newId);
                                });
                            }}
                        />
                    )}

                    {/* COST CENTER SELECTION - INCOME, EXPENSE & LOAN */}
                    {type !== TransactionType.TRANSFER && (
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                            <label className="block text-sm font-semibold text-gray-700">Cost Center Allocation {type === TransactionType.LOAN && '(Optional)'}</label>
                            
                            <div className="flex gap-2">
                                <button 
                                    type="button" 
                                    onClick={() => setCostCenterType('general')}
                                    className={`flex-1 py-2 text-xs font-medium rounded border ${costCenterType === 'general' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    General
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setCostCenterType('project')}
                                    className={`flex-1 py-2 text-xs font-medium rounded border ${costCenterType === 'project' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Project
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setCostCenterType('building')}
                                    className={`flex-1 py-2 text-xs font-medium rounded border ${costCenterType === 'building' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Building
                                </button>
                            </div>

                            {costCenterType === 'project' && (
                                <div className="animate-fade-in space-y-3">
                                    <ComboBox 
                                        id="transaction-project"
                                        name="transaction-project"
                                        label="Select Project" 
                                        items={state.projects} 
                                        selectedId={projectId} 
                                        onSelect={item => setProjectId(item?.id || '')} 
                                        placeholder="Search Projects..."
                                        entityType="project"
                                        onAddNew={(entityType, name) => {
                                            entityFormModal.openForm('project', name, undefined, undefined, (newId) => {
                                                setProjectId(newId);
                                            });
                                        }}
                                    />
                                </div>
                            )}

                            {costCenterType === 'building' && (
                                <div className="animate-fade-in space-y-3">
                                    <ComboBox 
                                        id="transaction-building"
                                        name="transaction-building"
                                        label="Select Building" 
                                        items={state.buildings} 
                                        selectedId={buildingId} 
                                        onSelect={item => setBuildingId(item?.id || '')} 
                                        placeholder="Search Buildings..."
                                        entityType="building"
                                        onAddNew={(entityType, name) => {
                                            entityFormModal.openForm('building', name, undefined, undefined, (newId) => {
                                                setBuildingId(newId);
                                            });
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Link to Bill (Optional) - EXPENSE ONLY */}
                    {type === TransactionType.EXPENSE && (costCenterType !== 'general' || linkedBillId) && (
                        <div className="bg-white border border-gray-200 rounded p-3">
                            <ComboBox 
                                id="transaction-linked-bill"
                                name="transaction-linked-bill"
                                label="Link to Bill (Optional)" 
                                items={availableBills.map(b => ({ 
                                    id: b.id, 
                                    name: `#${b.billNumber} - ${state.contacts.find(c=>c.id===b.contactId)?.name || 'Supplier'} (${Math.round(b.amount - b.paidAmount)})` 
                                }))} 
                                selectedId={linkedBillId} 
                                onSelect={item => {
                                    setLinkedBillId(item?.id || '');
                                    if (item?.id) {
                                        // Auto-fill context from bill if linked
                                        const bill = state.bills.find(b => b.id === item.id);
                                        if (bill) {
                                            setAmount((bill.amount - bill.paidAmount).toString());
                                            if (bill.projectId) setProjectId(bill.projectId);
                                            if (bill.buildingId) setBuildingId(bill.buildingId);
                                            if (bill.propertyId) setPropertyId(bill.propertyId);
                                            
                                            // Check if this is a tenant-allocated bill
                                            let tenantId: string | undefined = undefined;
                                            
                                            // Check if bill has a rental agreement (tenant bill)
                                            if (bill.projectAgreementId) {
                                                const rentalAgreement = state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId);
                                                if (rentalAgreement) {
                                                    tenantId = rentalAgreement.contactId;
                                                }
                                            }
                                            
                                            // If no rental agreement found via projectAgreementId, check propertyId
                                            if (!tenantId && bill.propertyId) {
                                                const rentalAgreement = state.rentalAgreements.find(ra => 
                                                    ra.propertyId === bill.propertyId && ra.status === 'Active'
                                                );
                                                if (rentalAgreement) {
                                                    tenantId = rentalAgreement.contactId;
                                                }
                                            }
                                            
                                            // For tenant-allocated bills, use tenant contactId; otherwise use vendor contactId
                                            if (tenantId) {
                                                setContactId(tenantId);
                                                // Update category to include "(Tenant)" suffix if original category exists
                                                if (bill.categoryId) {
                                                    const originalCategory = state.categories.find(c => c.id === bill.categoryId);
                                                    if (originalCategory) {
                                                        const tenantCategoryName = `${originalCategory.name} (Tenant)`;
                                                        const tenantCategory = state.categories.find(c => 
                                                            c.name === tenantCategoryName && c.type === TransactionType.EXPENSE
                                                        );
                                                        setCategoryId(tenantCategory?.id || bill.categoryId);
                                                    } else {
                                                        setCategoryId(bill.categoryId);
                                                    }
                                                }
                                            } else {
                                                // Not a tenant bill - use vendor contactId
                                                if (bill.contactId) setContactId(bill.contactId);
                                                if (bill.categoryId) setCategoryId(bill.categoryId);
                                            }
                                            
                                            if (bill.contractId) setContractId(bill.contractId);
                                        }
                                    }
                                }} 
                                placeholder="Select unpaid bill..." 
                                allowAddNew={false}
                            />
                        </div>
                    )}

                    {/* Standard Contact Selection */}
                    {(type !== TransactionType.EXPENSE || costCenterType === 'general' || (costCenterType === 'project' && !linkedBillId)) && (
                        <ComboBox 
                            id="transaction-contact"
                            name="transaction-contact"
                            label={type === TransactionType.LOAN ? "Contact / Payee" : "Contact"} 
                            items={filteredContacts} 
                            selectedId={contactId} 
                            onSelect={item => { setContactId(item?.id || ''); setContractId(''); }} 
                            placeholder={type === TransactionType.LOAN ? "Select Friend & Family" : "Select Contact"} 
                            allowAddNew={type !== TransactionType.LOAN}
                            required={type === TransactionType.LOAN}
                            entityType={type !== TransactionType.LOAN ? "contact" : undefined}
                            onAddNew={type !== TransactionType.LOAN ? ((entityType, name) => {
                                // Determine contact type based on transaction type
                                let contactType: ContactType | undefined = undefined;
                                if (type === TransactionType.EXPENSE) {
                                    contactType = ContactType.VENDOR;
                                } else if (type === TransactionType.INCOME) {
                                    contactType = ContactType.CLIENT;
                                }
                                entityFormModal.openForm('contact', name, contactType, undefined, (newId) => {
                                    setContactId(newId);
                                });
                            }) : undefined}
                        />
                    )}

                    {/* Contract Selection (If Project + Vendor Selected) */}
                    {availableContracts.length > 0 && (
                         <div className="bg-green-50 border border-green-200 rounded p-3">
                             <ComboBox
                                id="transaction-contract"
                                name="transaction-contract"
                                label="Link to Contract (Optional)"
                                items={availableContracts}
                                selectedId={contractId}
                                onSelect={item => setContractId(item?.id || '')}
                                placeholder="Select a contract..."
                                allowAddNew={false}
                             />
                             <p className="text-xs text-green-600 mt-1">Linking to a contract will track this expense against the contract budget.</p>
                         </div>
                    )}
                </>
            )}

            <Input 
                id="transaction-description"
                name="transaction-description"
                label="Description" 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                placeholder="Details..." 
            />

            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4">
                <div>
                    {transactionToEdit && transactionToEdit.id && (
                        <Button type="button" variant="danger" onClick={handleDelete} className="w-full sm:w-auto">Delete</Button>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
                    <Button type="submit" className="w-full sm:w-auto">{transactionToEdit && transactionToEdit.id ? 'Update' : 'Save'}</Button>
                </div>
            </div>
        </form>
        <EntityFormModal
            isOpen={entityFormModal.isFormOpen}
            formType={entityFormModal.formType}
            initialName={entityFormModal.initialName}
            contactType={entityFormModal.contactType}
            categoryType={entityFormModal.categoryType}
            onClose={entityFormModal.closeForm}
            onSubmit={entityFormModal.handleSubmit}
        />
    </>
    );
};

export default TransactionForm;
