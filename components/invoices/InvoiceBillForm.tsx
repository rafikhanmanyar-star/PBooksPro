
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { usePrintContext } from '../../context/PrintContext';
import type { BillPrintData } from '../print/BillPrintTemplate';
import { Invoice, Bill, InvoiceStatus, Contact, Property, InvoiceType, ContactType, RentalAgreement, Project, TransactionType, Category, Unit, ProjectAgreement, Building, RecurringInvoiceTemplate, ProjectAgreementStatus, ContractStatus, ContractExpenseCategoryItem } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { CURRENCY, ICONS } from '../../constants';
import ContactForm from '../settings/ContactForm';
import ComboBox from '../ui/ComboBox';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';
import { uploadEntityDocument, openDocumentById } from '../../services/documentUploadService';

interface InvoiceBillFormProps {
  onClose: () => void;
  type: 'invoice' | 'bill';
  itemToEdit?: Invoice | Bill;
  invoiceTypeForNew?: InvoiceType | null;
  agreementForInvoice?: ProjectAgreement;
  initialContactId?: string;
  rentalContext?: boolean;
  onDuplicate?: (data: Partial<Bill>) => void;
  initialData?: Partial<Invoice | Bill>;
  projectContext?: boolean; // When true, bill form is opened from project management - simplifies to project-only allocation
}

type BillAllocationType = 'project' | 'building' | 'owner' | 'staff';
type RootBillType = 'project' | 'building' | 'staff';

const InvoiceBillForm: React.FC<InvoiceBillFormProps> = ({ onClose, type, itemToEdit, invoiceTypeForNew, agreementForInvoice, initialContactId, rentalContext, onDuplicate, initialData, projectContext = false }) => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert, showConfirm } = useNotification();
  const { print: triggerPrint } = usePrintContext();
  const { rentalInvoiceSettings, projectInvoiceSettings } = state;
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const entityFormModal = useEntityFormModal();

  // Merge itemToEdit with initialData for defaults (initialData used when duplicating)
  const defaults = itemToEdit || initialData || {};

  const invoiceType = itemToEdit ? (itemToEdit as Invoice).invoiceType : invoiceTypeForNew;

  // --- Initialization Logic ---
  const getInitialRootType = (): RootBillType => {
      // When opened from project management, always use project allocation
      if (projectContext && type === 'bill') return 'project';
      
      if (type === 'bill' && defaults) {
          const bill = defaults as Bill;
          if (bill.staffId) return 'staff';
          if (bill.projectId) return 'project';
          // If any building/property/agreement logic implies building context
          if (bill.buildingId || bill.propertyId || bill.projectAgreementId) return 'building';
          // Fallback
          if (rentalContext) return 'building';
      }
      if (rentalContext) return 'building';
      return 'project';
  };

  const [rootAllocationType, setRootAllocationType] = useState<RootBillType>(getInitialRootType());
  
  // When projectContext is true, force rootAllocationType to 'project'
  useEffect(() => {
      if (projectContext && type === 'bill') {
          setRootAllocationType('project');
          setBillAllocationType('project');
      }
  }, [projectContext, type]);

  const getInitialAllocationType = (): BillAllocationType => {
      if (type === 'bill' && defaults) {
          const bill = defaults as Bill;
          if (bill.staffId) return 'staff';
          // Check if projectAgreementId is a rental agreement
          if (bill.projectAgreementId) {
              const rentalAgreement = state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId);
              if (rentalAgreement) {
                  // Tenant bills are removed, default to building (service)
                  return 'building';
              }
              // It's a project agreement, so it's a project bill (not tenant in building context)
              return 'project';
          }
          // Check if propertyId belongs to a building (owner bill)
          if (bill.propertyId) {
              return 'owner';
          }
          if (bill.buildingId) return 'building';
          return 'project';
      }
      if (rentalContext) return 'owner';
      return 'project';
  };

  const [billAllocationType, setBillAllocationType] = useState<BillAllocationType>(getInitialAllocationType());

  // Initialize Tenant ID lookup if editing a tenant bill
  // Note: For rental bills, we might use a different field than projectAgreementId if we tracked rental agreements on bills, but currently Bill has projectAgreementId.
  // If we need rental agreement link on Bill, we should add it to types. 
  // For now, assuming standard logic or project context.
  const [tenantId, setTenantId] = useState('');

  const generateNextInvoiceNumber = () => {
      if (type !== 'invoice') return '';
      let settings;
      if (invoiceType === InvoiceType.INSTALLMENT) {
          settings = projectInvoiceSettings;
      } else {
          settings = rentalInvoiceSettings;
      }
      
      if (!settings) return '';
      const { prefix, nextNumber, padding } = settings;
      
      let maxNum = nextNumber;
      // Robust Scanning: Check existing invoices for higher number to avoid duplicates
      state.invoices.forEach(inv => {
          if (inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)) {
              const part = inv.invoiceNumber.substring(prefix.length);
              // Ensure we are parsing a valid number part
              if (/^\d+$/.test(part)) {
                  const num = parseInt(part, 10);
                  if (num >= maxNum) {
                      maxNum = num + 1; // Next safe number
                  }
              }
          }
      });

      return `${prefix}${String(maxNum).padStart(padding, '0')}`;
  };
  
  const generateNextBillNumber = () => {
      const prefix = 'BILL-';
      const padding = 5;
      let maxNum = 0;
      
      state.bills.forEach(b => {
          if (b.billNumber && b.billNumber.startsWith(prefix)) {
              const part = b.billNumber.substring(prefix.length);
              if (/^\d+$/.test(part)) {
                  const num = parseInt(part, 10);
                  if (num > maxNum) maxNum = num;
              }
          }
      });
      
      return `${prefix}${String(maxNum + 1).padStart(padding, '0')}`;
  };
  
  // Initialize ID state - auto generate if new invoice or bill
  const [number, setNumber] = useState('');
  
  useEffect(() => {
      if (itemToEdit) {
          const invoiceOrBillNumber = type === 'invoice' 
              ? (itemToEdit as Invoice).invoiceNumber 
              : (itemToEdit as Bill).billNumber;
          setNumber(invoiceOrBillNumber || '');
      } else {
          // New Record or Duplicate
          if (type === 'invoice') {
              setNumber(generateNextInvoiceNumber());
          } else {
              setNumber(generateNextBillNumber());
          }
      }
  }, [itemToEdit, type, invoiceType, rentalInvoiceSettings, projectInvoiceSettings, state.bills]);

  // Update all form fields when itemToEdit changes (ensures data is loaded correctly)
  // This is critical to ensure all bill data is displayed when editing
  useEffect(() => {
      if (itemToEdit && type === 'bill') {
          const bill = itemToEdit as Bill;
          // Update all fields from the bill - handle both null/undefined and empty strings
          // Use nullish coalescing to preserve empty strings but default undefined/null to empty string
          setNumber(bill.billNumber || '');
          setContactId(bill.contactId || '');
          setPropertyId(bill.propertyId || '');
          setProjectId(bill.projectId || '');
          setBuildingId(bill.buildingId || '');
          setStaffId(bill.staffId || '');
          setContractId(bill.contractId || '');
          setCategoryId(bill.categoryId || '');
          if (bill.issueDate) {
              setIssueDate(bill.issueDate.split('T')[0]);
          }
          if (bill.dueDate) {
              setDueDate(bill.dueDate.split('T')[0]);
          } else {
              setDueDate('');
          }
          setDescription(bill.description || '');
          if (bill.amount !== undefined && bill.amount !== null) {
              setAmount(bill.amount.toString());
          }
          setDocumentPath(bill.documentPath || '');
          setDocumentId(bill.documentId || '');
          
          // Restore tenant information if this is a tenant-allocated bill
          // First, check if projectAgreementId is a rental agreement ID
          if (bill.projectAgreementId) {
              // Check if it's a rental agreement
              const rentalAgreement = state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId);
              if (rentalAgreement) {
                  // It's a rental agreement - restore tenant information
                  setTenantId(rentalAgreement.contactId);
                  // Only set propertyId if bill doesn't already have it (preserve existing)
                  if (!bill.propertyId) {
                      setPropertyId(rentalAgreement.propertyId);
                  }
                  const property = state.properties.find(p => p.id === (bill.propertyId || rentalAgreement.propertyId));
                  if (property && !bill.buildingId) {
                      setBuildingId(property.buildingId);
                  }
                  setAgreementId(rentalAgreement.id);
                  setBillAllocationType('building');
                  if (!bill.projectId && !bill.staffId) {
                      setRootAllocationType('building');
                  }
              } else {
                  // It's a project agreement - keep as is
                  setAgreementId(bill.projectAgreementId);
              }
          } else if (bill.propertyId) {
              // No projectAgreementId but has propertyId - it's an owner bill
              const property = state.properties.find(p => p.id === bill.propertyId);
              if (property) {
                  // Derive buildingId from property if not already set
                  if (!bill.buildingId && property.buildingId) {
                      setBuildingId(property.buildingId);
                  }
                  
                  setTenantId('');
                  setAgreementId('');
                  setBillAllocationType('owner');
                  // Ensure root allocation type is building for owner bills
                  if (!bill.projectId && !bill.staffId) {
                      setRootAllocationType('building');
                  }
              }
          } else if (bill.buildingId) {
              // Building-only bill (service charge)
              setTenantId('');
              setAgreementId('');
              setBillAllocationType('building');
              setRootAllocationType('building');
          }
          
          // Handle expenseCategoryItems - use the bill's items if they exist
          if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
              setExpenseCategoryItems(bill.expenseCategoryItems);
          } else if (bill.categoryId) {
              // Migration: if bill has categoryId but no expenseCategoryItems, create one
              setExpenseCategoryItems([{
                  id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                  categoryId: bill.categoryId,
                  unit: 'quantity' as const,
                  quantity: 1,
                  pricePerUnit: bill.amount || 0,
                  netValue: bill.amount || 0
              }]);
          } else {
              setExpenseCategoryItems([]);
          }
      }
  }, [itemToEdit?.id, type, state.properties, state.rentalAgreements]); // Use itemToEdit?.id to trigger when bill changes


  const [numberError, setNumberError] = useState('');
  const [contactId, setContactId] = useState(defaults.contactId || agreementForInvoice?.clientId || initialContactId || '');
  const [propertyId, setPropertyId] = useState(defaults.propertyId || '');
  const [projectId, setProjectId] = useState(
    (defaults && 'projectId' in defaults ? defaults.projectId : '') || 
    agreementForInvoice?.projectId || 
    (type === 'bill' && !itemToEdit ? (state.defaultProjectId || '') : '')
  );
  
  // For Building flow: buildingId might come from defaults, or be derived from propertyId. 
  // We need it in state to drive the filter.
  const [buildingId, setBuildingId] = useState(() => {
      if (defaults && 'buildingId' in defaults && (defaults as any).buildingId) return (defaults as any).buildingId;
      // Try to derive from property if editing
      if (defaults.propertyId) {
          const p = state.properties.find(prop => prop.id === defaults.propertyId);
          if (p) return p.buildingId;
      }
      return '';
  });

  const [staffId, setStaffId] = useState((defaults && 'staffId' in defaults ? (defaults as Bill).staffId : ''));
  const [contractId, setContractId] = useState((defaults && 'contractId' in defaults ? (defaults as Bill).contractId : ''));

  const [unitId, setUnitId] = useState(
      defaults && 'unitId' in defaults 
        ? (defaults as Invoice).unitId 
        : (agreementForInvoice && agreementForInvoice.unitIds.length > 0 ? agreementForInvoice.unitIds[0] : '')
  );

  const [categoryId, setCategoryId] = useState(defaults && 'categoryId' in defaults ? (defaults as Invoice | Bill).categoryId : '');
  
  // Get initial date: use preserved date if option is enabled and creating new record, otherwise use defaults or current date
  const getInitialIssueDate = () => {
    if (defaults.issueDate) {
      return (defaults.issueDate as string).split('T')[0];
    }
    if (state.enableDatePreservation && state.lastPreservedDate && !itemToEdit) {
      return state.lastPreservedDate;
    }
    return new Date().toISOString().split('T')[0];
  };
  
  const [issueDate, setIssueDate] = useState(getInitialIssueDate());
  const [dueDate, setDueDate] = useState(defaults && 'dueDate' in defaults && defaults.dueDate ? (defaults.dueDate as string).split('T')[0] : '');
  
  // Save date to preserved date when changed (if option is enabled)
  const handleIssueDateChange = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    setIssueDate(dateStr);
    if (state.enableDatePreservation && !itemToEdit) {
      dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: dateStr });
    }
  };
  const [description, setDescription] = useState(defaults.description || '');

  const [agreementId, setAgreementId] = useState(
      defaults && 'agreementId' in defaults ? defaults.agreementId : 
      (defaults && 'projectAgreementId' in defaults ? (defaults as Bill).projectAgreementId : 
      agreementForInvoice?.id || '')
  );
  
  const isAgreementCancelled = useMemo(() => {
      if (agreementId) {
          const projectAgreement = state.projectAgreements.find(pa => pa.id === agreementId);
          return projectAgreement?.status === ProjectAgreementStatus.CANCELLED;
      }
      return false;
  }, [agreementId, state.projectAgreements]);

  const isPartiallyPaid = itemToEdit ? itemToEdit.paidAmount > 0 : false;

  const initialRentForEdit = useMemo(() => (defaults && 'invoiceType' in defaults && defaults.invoiceType === InvoiceType.RENTAL)
        ? String(defaults.amount! - (defaults.securityDepositCharge || 0))
        : '0', [defaults]);

  const [rentAmount, setRentAmount] = useState(initialRentForEdit);
  const [securityDepositCharge, setSecurityDepositCharge] = useState(defaults && 'securityDepositCharge' in defaults ? String(defaults.securityDepositCharge || '0') : '0');
  const [gracePeriodDays, setGracePeriodDays] = useState('0');
  
  const calculatedAmount = (parseFloat(rentAmount) || 0) + (parseFloat(securityDepositCharge) || 0);
  const [amount, setAmount] = useState(defaults.amount?.toString() || '');
  const [isContactLockedByUnit, setIsContactLockedByUnit] = useState(false);
  const isLocked = !!(defaults && 'agreementId' in defaults && defaults.agreementId);
  
  // Expense Category Items - for Bills only
  // Handle backward compatibility: if bill has categoryId but no expenseCategoryItems, migrate it
  const initialExpenseCategoryItems = useMemo(() => {
    if (type !== 'bill' || !defaults) return [];
    
    const bill = defaults as Bill;
    if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
      return bill.expenseCategoryItems;
    }
    
    // Migration: convert old categoryId to expenseCategoryItem
    if (bill.categoryId) {
      return [{
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        categoryId: bill.categoryId,
        unit: 'quantity' as const,
        quantity: 1,
        pricePerUnit: bill.amount || 0,
        netValue: bill.amount || 0
      }];
    }
    
    return [];
  }, [type, defaults]);
  
  const [expenseCategoryItems, setExpenseCategoryItems] = useState<ContractExpenseCategoryItem[]>(initialExpenseCategoryItems);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPath, setDocumentPath] = useState((defaults as Bill)?.documentPath || '');
  const [documentId, setDocumentId] = useState((defaults as Bill)?.documentId || '');
  
  const { amountAlreadyInvoiced, agreementBalance } = useMemo(() => {
    if (!agreementForInvoice) return { amountAlreadyInvoiced: 0, agreementBalance: 0 };
    const alreadyInvoiced = state.invoices.filter(inv => inv.agreementId === agreementForInvoice.id).reduce((sum, inv) => sum + inv.amount, 0);
    return { amountAlreadyInvoiced: alreadyInvoiced, agreementBalance: agreementForInvoice.sellingPrice - alreadyInvoiced };
  }, [agreementForInvoice, state.invoices]);

  const formStyle = useMemo(() => {
      const bgStyle = getFormBackgroundColorStyle(projectId, buildingId, state);
      // If we have a background color, add padding and border radius for better appearance
      if (bgStyle.backgroundColor) {
          return {
              ...bgStyle,
              padding: '1rem',
              borderRadius: '0.75rem'
          };
      }
      return {};
  }, [projectId, buildingId, state]);

  /** Bill print data for context-based print (when type === 'bill') */
  const billPrintData = useMemo((): BillPrintData | null => {
    if (type !== 'bill') return null;
    const contact = state.contacts.find(c => c.id === contactId);
    const contactAddress = [contact?.address, contact?.contactNo].filter(Boolean).join('\n') || undefined;
    const amountNum = parseFloat(amount) || 0;
    const items = expenseCategoryItems.length > 0
      ? expenseCategoryItems.map(item => {
          const cat = state.categories.find(c => c.id === item.categoryId);
          return {
            description: cat?.name || 'Item',
            quantity: item.quantity ?? 1,
            pricePerUnit: item.pricePerUnit,
            total: item.netValue,
          };
        })
      : undefined;
    return {
      billNumber: number.trim() || '—',
      contactName: contact?.name,
      contactAddress,
      amount: amountNum,
      paidAmount: itemToEdit ? (itemToEdit as Bill).paidAmount : 0,
      status: itemToEdit ? (itemToEdit as Bill).status : 'Unpaid',
      issueDate,
      dueDate,
      description: description?.trim() || undefined,
      items,
    };
  }, [type, number, contactId, amount, issueDate, dueDate, description, expenseCategoryItems, itemToEdit, state.contacts, state.categories]);

  // Mark dirty on changes
  useEffect(() => {
      setIsDirty(true);
  }, [number, contactId, propertyId, projectId, buildingId, staffId, unitId, categoryId, issueDate, dueDate, description, amount, rentAmount, securityDepositCharge, contractId, expenseCategoryItems]);
  
  // Reset dirty state initially after mount
  useEffect(() => {
      setIsDirty(false);
  }, []);

  // Validate contractId when vendor or project changes, and auto-set projectId from contract
  useEffect(() => {
      if (contractId && contactId && type === 'bill') {
          const contract = state.contracts.find(c => c.id === contractId);
          if (contract) {
              // If contract exists but vendor doesn't match, clear the contract link
              if (contract.vendorId !== contactId) {
                  setContractId('');
                  return;
              } 
              // Validate projectId match: if either has a projectId, they must match
              if (projectId || contract.projectId) {
                  if (projectId !== contract.projectId) {
                      // ProjectIds don't match - clear the contract
                      setContractId('');
                      return;
                  }
              }
              // Auto-set projectId from contract if not already set (only if contract has projectId)
              if (contract.projectId && !projectId) {
                  setProjectId(contract.projectId);
              }
          }
      }
  }, [contactId, contractId, state.contracts, type, projectId]);

  // Auto-set issue date to agreement start date if this is the first invoice for the agreement
  useEffect(() => {
    if (!defaults.id && invoiceType === InvoiceType.RENTAL && agreementId) {
        const agreement = state.rentalAgreements.find(ra => ra.id === agreementId);
        if (agreement) {
             const hasInvoices = state.invoices.some(inv => inv.agreementId === agreement.id);
             if (!hasInvoices && agreement.startDate) {
                 setIssueDate(agreement.startDate.split('T')[0]);
             }
        }
    }
  }, [agreementId, invoiceType, defaults, state.rentalAgreements, state.invoices]);

  useEffect(() => {
    if (invoiceTypeForNew === InvoiceType.RENTAL || (defaults as Invoice)?.invoiceType === InvoiceType.RENTAL) setAmount(calculatedAmount.toString());
    else if (agreementForInvoice) setAmount(agreementBalance.toString());
  }, [calculatedAmount, invoiceTypeForNew, defaults, agreementForInvoice, agreementBalance]);

  useEffect(() => {
    if (!categoryId && !defaults.id) {
        if (invoiceType === InvoiceType.INSTALLMENT) {
            const defaultCat = state.categories.find(c => c.name === 'Unit Selling Income' && c.type === TransactionType.INCOME);
            if (defaultCat) setCategoryId(defaultCat.id);
        } else if (invoiceType === InvoiceType.SERVICE_CHARGE) {
            const defaultCat = state.categories.find(c => c.name === 'Service Charge Income' && c.type === TransactionType.INCOME);
            if (defaultCat) setCategoryId(defaultCat.id);
        }
    }
  }, [invoiceType, categoryId, defaults, state.categories]);

  useEffect(() => {
    if (!defaults.id) {
      // Validate date before creating object to prevent crashes
      const timestamp = Date.parse(issueDate);
      if (isNaN(timestamp)) return;

      const issue = new Date(issueDate + 'T00:00:00');
      // Double check validity
      if (isNaN(issue.getTime())) return;

      if (type === 'invoice') {
          const nextWeek = new Date(issue);
          nextWeek.setDate(nextWeek.getDate() + 7);
          setDueDate(nextWeek.toISOString().split('T')[0]);
      }
      else if (type === 'bill') {
          const nextMonth = new Date(issue);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          setDueDate(nextMonth.toISOString().split('T')[0]);
      }
    }
  }, [issueDate, type, defaults]);

  useEffect(() => {
    if (!number || !number.trim()) {
      return;
    }
    
    let isDuplicate = false;
    if (type === 'invoice') {
      isDuplicate = state.invoices.some(
        inv => inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === number.trim().toLowerCase() && inv.id !== itemToEdit?.id
      );
    } else { 
      isDuplicate = state.bills.some(
        bill => bill.billNumber && bill.billNumber.trim().toLowerCase() === number.trim().toLowerCase() && bill.id !== itemToEdit?.id
      );
    }

    if (isDuplicate) {
      setNumberError(`This ${type} number is already in use.`);
    } else {
      setNumberError('');
    }
  }, [number, type, itemToEdit, state.invoices, state.bills]);

  // Available Contracts for Bills
  const availableContracts = useMemo(() => {
      if (type !== 'bill' || billAllocationType !== 'project' || !contactId) return [];
      
      // Filter contracts for the same vendor AND same project
      // Rule: Bill and contract must have the same projectId (or both be null/undefined)
      // Active only, unless editing an existing bill with that contract
      const vendorContracts = (state.contracts || []).filter(c => {
          // Must match vendor
          if (c.vendorId !== contactId) return false;
          
          // Must match project: if either has a projectId, they must be the same
          if (projectId || c.projectId) {
              if (projectId !== c.projectId) return false;
          }
          
          // Active contracts only, unless it's the currently selected contract
          return c.status === ContractStatus.ACTIVE || c.id === contractId;
      });
      
      return vendorContracts.map(c => {
          const project = state.projects.find(p => p.id === c.projectId);
          const projectName = project ? ` (${project.name})` : '';
          return { id: c.id, name: `${c.contractNumber} - ${c.name}${projectName}` };
      });
  }, [state.contracts, state.projects, type, billAllocationType, projectId, contactId, contractId]);

  const incomeCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.INCOME), [state.categories]);
  const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);

  // Get available categories (not already used in items) - for Bills only
  const usedCategoryIds = useMemo(() => new Set(expenseCategoryItems.map(item => item.categoryId)), [expenseCategoryItems]);
  const availableCategories = useMemo(() => {
    if (type !== 'bill') return [];
    return expenseCategories.filter(c => !usedCategoryIds.has(c.id));
  }, [expenseCategories, usedCategoryIds, type]);

  // Calculate total amount from expense category items - for Bills only
  const totalAmountFromItems = useMemo(() => {
    if (type !== 'bill') return 0;
    return expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
  }, [expenseCategoryItems, type]);

  // Add new expense category item
  const handleAddExpenseCategory = (category: { id: string; name: string } | null) => {
    if (!category || type !== 'bill') return;
    
    const newItem: ContractExpenseCategoryItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      categoryId: category.id,
      unit: 'quantity',
      quantity: 1,
      pricePerUnit: 0,
      netValue: 0
    };
    
    setExpenseCategoryItems(prev => [...prev, newItem]);
  };

  // Remove expense category item
  const handleRemoveExpenseCategoryItem = (itemId: string) => {
    setExpenseCategoryItems(prev => prev.filter(item => item.id !== itemId));
  };

  // Update expense category item
  const updateExpenseCategoryItem = (itemId: string, updates: Partial<ContractExpenseCategoryItem>, isNetValueDirectEdit = false) => {
    setExpenseCategoryItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      
      const updated = { ...item, ...updates };
      
      if (isNetValueDirectEdit) {
        // Reverse calculation: if net value is edited directly, calculate price per unit
        const netValue = updated.netValue || 0;
        const quantity = updated.quantity || 0;
        if (quantity > 0) {
          updated.pricePerUnit = netValue / quantity;
        } else {
          // If quantity is 0, set price per unit to net value (treat as single item)
          updated.pricePerUnit = netValue;
          updated.quantity = 1; // Auto-set quantity to 1 if it was 0
        }
      } else {
        // Forward calculation: quantity × price per unit = net value
        const quantity = updated.quantity || 0;
        const pricePerUnit = updated.pricePerUnit || 0;
        updated.netValue = quantity * pricePerUnit;
      }
      
      return updated;
    }));
  };

  const handleContactSubmit = (contact: Omit<Contact, 'id'>) => {
    const newContact = { ...contact, id: Date.now().toString() };
    dispatch({ type: 'ADD_CONTACT', payload: newContact });
    setContactId(newContact.id);
    setIsContactModalOpen(false);
    setNewItemName('');
    showToast(`New contact ${contact.name} added!`);
  }
  
  const tenantAgreements = useMemo(() => {
    if (!contactId && invoiceType === InvoiceType.RENTAL) return [];
    const targetId = invoiceType === InvoiceType.RENTAL ? contactId : tenantId;
    if (!targetId) return [];
    return state.rentalAgreements.filter(ra => ra.contactId === targetId);
  }, [contactId, tenantId, invoiceType, state.rentalAgreements]);

  useEffect(() => {
    if (itemToEdit) return; 
    if (invoiceType !== InvoiceType.RENTAL) return;

    const selectedAgreement = state.rentalAgreements.find(ra => ra.id === agreementId);
    if (!selectedAgreement) {
        setRentAmount('0');
        return;
    }

    const dateObj = new Date(issueDate);
    if (isNaN(dateObj.getTime())) return;

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const currentDay = dateObj.getDate();
    const remainingDays = daysInMonth - currentDay + 1;
    const grace = parseInt(gracePeriodDays) || 0;
    const billableDays = Math.max(0, remainingDays - grace);
    const monthlyRent = selectedAgreement.monthlyRent || 0;
    const dailyRate = monthlyRent / daysInMonth;
    const proRatedRent = dailyRate * billableDays;
    
    setRentAmount(proRatedRent.toFixed(2));

    if (selectedAgreement) {
        setPropertyId(selectedAgreement.propertyId);
        const property = state.properties.find(p => p.id === selectedAgreement.propertyId);
        
        if (property) {
            setBuildingId(property.buildingId);
            setProjectId('');
            const monthYear = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
            
            let desc = `Rent for ${property.name} - ${monthYear}`;
            if (grace > 0 || billableDays < daysInMonth) {
                desc += ` (Pro-rata: ${billableDays} days)`;
            }
            setDescription(desc);
        }

        setSecurityDepositCharge(String(selectedAgreement.securityDeposit || 0));
        
        const newDueDate = new Date(issueDate);
        newDueDate.setDate(selectedAgreement.rentDueDate);
        if (newDueDate < new Date(issueDate)) {
            newDueDate.setMonth(newDueDate.getMonth() + 1);
        }
        setDueDate(newDueDate.toISOString().split('T')[0]);
    }

  }, [agreementId, issueDate, gracePeriodDays, invoiceType, itemToEdit, state.rentalAgreements, state.properties]);


  const availableUnitsForProject = useMemo(() => {
    if (!projectId) return [];
    if (agreementForInvoice) return state.units.filter(u => agreementForInvoice.unitIds?.includes(u.id));
    const unitsInProject = state.units.filter(u => u.projectId === projectId);
    if (contactId) return unitsInProject.filter(unit => !unit.contactId || unit.contactId === contactId);
    else return unitsInProject;
  }, [projectId, contactId, state.units, agreementForInvoice]);

  useEffect(() => { if (!agreementForInvoice) setUnitId(''); }, [projectId, agreementForInvoice]);
  
  useEffect(() => {
      const selectedUnit = state.units.find(u => u.id === unitId);
      if (selectedUnit?.contactId && !agreementForInvoice) {
          setContactId(selectedUnit.contactId);
          setIsContactLockedByUnit(true);
      } else setIsContactLockedByUnit(false);
  }, [unitId, state.units, agreementForInvoice]);

  // Handlers for Root Switcher
  const handleRootChange = (rt: RootBillType) => {
    setRootAllocationType(rt);
    // Reset dependent fields based on root choice
    if (rt === 'project') {
        setBillAllocationType('project');
        setBuildingId(''); 
        setPropertyId('');
        setTenantId('');
        setStaffId('');
    } else if (rt === 'staff') {
        setBillAllocationType('staff');
        setProjectId('');
        setBuildingId('');
        setPropertyId('');
        setTenantId('');
    } else {
        // Building
        setBillAllocationType('building'); // Default to service
        setProjectId('');
        setStaffId('');
        setPropertyId('');
        setTenantId('');
    }
  }

  // Handlers for Sub Selectors within Building Context
  const handleTenantSelect = (item: any) => {
      setTenantId(item?.id || '');
      // Auto-select first active agreement for this tenant/building combo if exists
      // Need to check agreements that link to properties in this building
      if (item?.id && buildingId) {
          const agr = state.rentalAgreements.find(ra => {
              if (ra.contactId !== item.id || ra.status !== 'Active') return false;
              const prop = state.properties.find(p => p.id === ra.propertyId);
              return prop && prop.buildingId === buildingId;
          });
          if(agr) {
              setAgreementId(agr.id);
              setPropertyId(agr.propertyId);
          }
      }
  };
  
  const handleStaffSelect = (item: any) => {
      const selectedId = item?.id || '';
      setStaffId(selectedId);
      // Staff selection - user can manually select project/building
  };

  const handleDelete = async () => {
      if (!itemToEdit) return;
      if (itemToEdit.paidAmount > 0) {
          await showAlert(`Cannot delete this ${type} because it has associated payments (${CURRENCY} ${itemToEdit.paidAmount.toLocaleString()}).\n\nPlease delete the payment transactions from the ledger first.`, { title: 'Deletion Blocked' });
          return;
      }
      if (await showConfirm(`Are you sure you want to delete this ${type}?`, { title: `Delete ${type === 'invoice' ? 'Invoice' : 'Bill'}`, confirmLabel: 'Delete', cancelLabel: 'Cancel' })) {
          if (type === 'invoice') dispatch({ type: 'DELETE_INVOICE', payload: itemToEdit.id });
          else dispatch({ type: 'DELETE_BILL', payload: itemToEdit.id });
          onClose();
          showToast(`${type === 'invoice' ? 'Invoice' : 'Bill'} deleted successfully.`, 'info');
      }
  };

  // Function to gather current form data
  const getFormData = () => {
     let finalAmount: number;
     if (invoiceType === InvoiceType.RENTAL) {
       finalAmount = calculatedAmount;
     } else if (type === 'bill' && expenseCategoryItems.length > 0) {
       finalAmount = totalAmountFromItems;
     } else {
       finalAmount = parseFloat(amount) || 0;
     }
     
     return {
        contactId: contactId || '', // Ensure contactId is always set (required field)
        propertyId: propertyId || undefined, 
        projectId: projectId || undefined, 
        amount: finalAmount, 
        issueDate: issueDate || new Date().toISOString().split('T')[0], // Ensure issueDate is always set
        description: description || undefined, // Preserve empty strings as undefined for optional fields
        invoiceNumber: number, 
        billNumber: number,
        dueDate: dueDate || undefined, 
        invoiceType: invoiceType!,
        buildingId: buildingId || undefined,
        categoryId: (type === 'bill' && expenseCategoryItems.length > 0) ? undefined : (categoryId || undefined), // Don't save categoryId if using expenseCategoryItems
        agreementId: agreementId || undefined, 
        securityDepositCharge: parseFloat(securityDepositCharge) || undefined, 
        unitId: unitId || undefined,
        serviceCharges: undefined,
        staffId: staffId || undefined,
        contractId: contractId || undefined,
        rentalMonth: (invoiceType === InvoiceType.RENTAL) ? new Date(issueDate).toISOString().slice(0, 7) : undefined,
        expenseCategoryItems: (type === 'bill' && expenseCategoryItems.length > 0) ? expenseCategoryItems : undefined,
        // Note: documentPath is handled separately in handleSubmit
     };
  };

  const handleSubmit = async (e: React.FormEvent, skipClose = false) => {
    if (e) e.preventDefault();
    
    if (!number || !number.trim()) {
        await showAlert(`${type === 'invoice' ? 'Invoice' : 'Bill'} number is required.`);
        return;
    }
    
    // Check if expense category items are required for Bills
    if (type === 'bill' && expenseCategoryItems.length === 0) {
        await showAlert('Please add at least one expense category item.');
        return;
    }

    // Explicit Duplicate Check
    let isDuplicate = false;
    if (type === 'invoice') {
      isDuplicate = state.invoices.some(
        inv => inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === number.trim().toLowerCase() && inv.id !== itemToEdit?.id
      );
    } else { 
      isDuplicate = state.bills.some(
        bill => bill.billNumber && bill.billNumber.trim().toLowerCase() === number.trim().toLowerCase() && bill.id !== itemToEdit?.id
      );
    }

    if (isDuplicate) {
        await showAlert(`This ${type} number is already in use. Please choose a unique number.`);
        return;
    }

    if (numberError) {
        await showAlert(`Please fix the errors before saving: ${numberError}`, { title: 'Validation Error' });
        return;
    }
    if (isAgreementCancelled) {
        await showAlert(`Cannot update invoice: The associated project agreement is cancelled.`, { title: 'Agreement Cancelled' });
        return;
    }
    if (agreementForInvoice && (parseFloat(amount) > agreementBalance)) {
        await showAlert(`Invoice amount cannot exceed remaining agreement balance of ${CURRENCY} ${agreementBalance.toLocaleString()}.`, { title: 'Limit Exceeded' });
        return;
    }
    
    let finalAmount: number;
    if (invoiceType === InvoiceType.RENTAL) {
      finalAmount = calculatedAmount;
    } else if (type === 'bill' && expenseCategoryItems.length > 0) {
      finalAmount = totalAmountFromItems;
    } else {
      finalAmount = parseFloat(amount) || 0;
    }
    
    if (isPartiallyPaid && finalAmount < itemToEdit!.paidAmount) {
        await showAlert(`Cannot reduce amount below the already paid amount of ${CURRENCY} ${itemToEdit!.paidAmount.toLocaleString()}.`, { title: 'Invalid Amount' });
        return;
    }

    const finalDocumentPath = documentPath;
    const billId = itemToEdit?.id || Date.now().toString();
    let finalDocumentId = documentId || undefined;
    if (type === 'bill' && documentFile) {
      try {
        finalDocumentId = await uploadEntityDocument(documentFile, 'bill', billId, dispatch, state.currentUser?.id);
      } catch (err) {
        await showAlert(err instanceof Error ? err.message : 'Failed to upload document.');
        return;
      }
    }

    const formData = getFormData();

        if (itemToEdit) {
        if (type === 'invoice') {
            // For rental invoices, always use Rental Income category for the rent portion
            // Security deposit is tracked separately via securityDepositCharge field
            const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
            
            // Ensure category exists for rental invoices
            if (invoiceType === InvoiceType.RENTAL && !rentalIncomeCategory) {
                await showAlert("Critical Error: 'Rental Income' category not found. Please check settings.");
                return;
            }
            
            const updatedInvoice: Invoice = {
                ...(itemToEdit as Invoice), 
                ...formData,
                // For rental invoices: categoryId = Rental Income (for rent portion)
                // Security deposit portion is tracked via securityDepositCharge field
                categoryId: invoiceType === InvoiceType.RENTAL ? rentalIncomeCategory!.id : (categoryId || undefined),
            };
            dispatch({ type: 'UPDATE_INVOICE', payload: updatedInvoice });
            showToast("Invoice updated successfully");
        } else {
            // Ensure all bill fields are preserved when updating
            const updatedBill: Bill = { 
                ...(itemToEdit as Bill),
                ...formData,
                projectAgreementId: agreementId || undefined,
                documentPath: type === 'bill' ? (finalDocumentPath || (itemToEdit as Bill).documentPath || undefined) : undefined,
                documentId: type === 'bill' ? (finalDocumentId ?? (itemToEdit as Bill).documentId) : undefined,
                expenseCategoryItems: (type === 'bill' && expenseCategoryItems.length > 0) ? expenseCategoryItems : ((itemToEdit as Bill).expenseCategoryItems || undefined),
            };
            dispatch({ type: 'UPDATE_BILL', payload: updatedBill });
            showToast("Bill updated successfully");
        }
    } else {
        const newData = { ...formData, id: Date.now().toString(), paidAmount: 0, status: InvoiceStatus.UNPAID };
        if (type === 'invoice') {
            // Update Settings Next Number if auto-generated
            let settingsToUpdate = null;
            let updateType = null;
            
            if (invoiceType === InvoiceType.INSTALLMENT) {
                if (number && number.startsWith(projectInvoiceSettings.prefix)) {
                     const numPart = parseInt(number.substring(projectInvoiceSettings.prefix.length));
                     if (!isNaN(numPart) && numPart >= projectInvoiceSettings.nextNumber) {
                         settingsToUpdate = { ...projectInvoiceSettings, nextNumber: numPart + 1 };
                         updateType = 'UPDATE_PROJECT_INVOICE_SETTINGS';
                     }
                }
            } else {
                if (number && number.startsWith(rentalInvoiceSettings.prefix)) {
                     const numPart = parseInt(number.substring(rentalInvoiceSettings.prefix.length));
                     if (!isNaN(numPart) && numPart >= rentalInvoiceSettings.nextNumber) {
                         settingsToUpdate = { ...rentalInvoiceSettings, nextNumber: numPart + 1 };
                         updateType = 'UPDATE_RENTAL_INVOICE_SETTINGS';
                     }
                }
            }
            
            if (settingsToUpdate && updateType) {
                dispatch({ type: updateType as any, payload: settingsToUpdate });
            }

            // For rental invoices, always use Rental Income category for the rent portion
            // Security deposit is tracked separately via securityDepositCharge field
            const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
            const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');
            
            // Ensure categories exist for rental invoices
            if (invoiceType === InvoiceType.RENTAL && !rentalIncomeCategory) {
                await showAlert("Critical Error: 'Rental Income' category not found. Please check settings.");
                return;
            }
            
            const newInvoice: Invoice = {
                ...newData, 
                invoiceType: invoiceType!,
                // For rental invoices: categoryId = Rental Income (for rent portion)
                // Security deposit portion is tracked via securityDepositCharge field
                categoryId: invoiceType === InvoiceType.RENTAL ? rentalIncomeCategory!.id : (categoryId || undefined),
            };
            dispatch({ type: 'ADD_INVOICE', payload: newInvoice });
            showToast("Invoice created successfully");
        } else {
            const newBill: Bill = { 
                ...newData, 
                projectAgreementId: agreementId || undefined,
                documentPath: type === 'bill' ? (finalDocumentPath || undefined) : undefined,
                documentId: type === 'bill' ? finalDocumentId : undefined
            };
            dispatch({ type: 'ADD_BILL', payload: newBill });
            showToast("Bill created successfully");
        }
    }
    
    // Reset Dirty State after save
    setIsDirty(false);

    if (!skipClose) {
        onClose();
    }
  };

  const handleDuplicateClick = async () => {
      if (onDuplicate) {
          const currentData = getFormData();
          
          if (isDirty && itemToEdit) {
               const confirmSave = await showConfirm("You have unsaved changes on this bill. Do you want to save them before duplicating?", {
                   title: "Save Changes?",
                   confirmLabel: "Save & Duplicate",
                   cancelLabel: "Cancel"
               });
               
               if (confirmSave) {
                   await handleSubmit(new Event('submit') as any, true);
               } else {
                   return; 
               }
          }
          onDuplicate(currentData);
      }
  };
  
  const { contactLabel, filteredContacts, fixedContactTypeForNew } = useMemo(() => {
    if (type === 'bill') return { contactLabel: 'Supplier', filteredContacts: state.contacts.filter(c => c.type === ContactType.VENDOR), fixedContactTypeForNew: ContactType.VENDOR };
    if (invoiceType === InvoiceType.RENTAL) return { contactLabel: 'Tenant', filteredContacts: state.contacts.filter(c => c.type === ContactType.TENANT), fixedContactTypeForNew: ContactType.TENANT };
    const owners = state.contacts.filter(c => c.type === ContactType.CLIENT || c.type === ContactType.OWNER);
    return { contactLabel: 'Owner', filteredContacts: owners, fixedContactTypeForNew: ContactType.OWNER };
  }, [type, invoiceType, state.contacts]);
  
  const agreementItems = useMemo(() => tenantAgreements.map(a => ({ id: a.id, name: `${a.agreementNumber} - ${state.properties.find(p => p.id === a.propertyId)?.name}` })), [tenantAgreements, state.properties]);
  
  const handleContactSelect = (item: { id: string; name: string } | null, newName?: string) => {
    if (newName) { setNewItemName(newName); setIsContactModalOpen(true); }
    else { 
        setContactId(item?.id || ''); 
        if (invoiceType === InvoiceType.RENTAL) setAgreementId(''); 
        setContractId('');
    }
  };

  // --- Memoized Lists for Bill Allocations ---
  const propertyItems = useMemo(() => {
      let props = state.properties;
      if (buildingId) {
          props = props.filter(p => p.buildingId === buildingId);
      }
      return props.map(p => ({
          id: p.id,
          name: `${p.name} (${state.contacts.find(c=>c.id===p.ownerId)?.name || 'Owner'})`
      }));
  }, [state.properties, state.contacts, buildingId]);
  
  const filteredTenants = useMemo(() => {
      if (!buildingId) return state.contacts.filter(c => c.type === ContactType.TENANT);
      
      const relevantPropertyIds = new Set(state.properties.filter(p => p.buildingId === buildingId).map(p => p.id));
      const relevantTenantIds = new Set(state.rentalAgreements.filter(ra => relevantPropertyIds.has(ra.propertyId)).map(ra => ra.contactId));
      
      return state.contacts.filter(c => c.type === ContactType.TENANT && relevantTenantIds.has(c.id));
  }, [state.contacts, state.properties, state.rentalAgreements, buildingId]);

  const staffList = useMemo(() => {
      // Staff contacts (those marked as type STAFF)
      return state.contacts
          .filter(c => c.type === ContactType.STAFF)
          .map(c => ({ id: c.id, name: c.name || 'Unknown' }));
  }, [state.contacts]);


  const renderRentalInvoiceForm = () => {
    const property = state.properties.find(p => p.id === propertyId);
    const building = property ? state.buildings.find(b => b.id === property.buildingId) : null;
    const showDetails = itemToEdit || initialData || agreementId; 
    const showSecurityDeposit = !itemToEdit || parseFloat(securityDepositCharge) > 0 || !isLocked;

    return (
        <>
            <DatePicker 
                label="Date" 
                value={issueDate} 
                onChange={handleIssueDateChange} 
                required 
                disabled={isAgreementCancelled} 
            />
            <ComboBox 
              label="Tenant" 
              items={filteredContacts} 
              selectedId={contactId} 
              onSelect={(item) => setContactId(item?.id || '')} 
              placeholder="Search or add tenant..." 
              required 
              disabled={!!itemToEdit || isAgreementCancelled}
              entityType="contact"
              onAddNew={(entityType, name) => {
                entityFormModal.openForm('contact', name, fixedContactTypeForNew, undefined, (newId) => {
                  setContactId(newId);
                });
              }}
            />
            <ComboBox label="Agreement" items={agreementItems} selectedId={agreementId} onSelect={(item) => setAgreementId(item?.id || '')} placeholder="Search agreements..." required disabled={!contactId || !!itemToEdit || isAgreementCancelled} allowAddNew={false} />
            
            {showDetails ? (
                <div className="space-y-2 p-2 bg-white/60 rounded-lg border border-slate-200">
                     {!itemToEdit && (
                        <div className="flex gap-2 items-end bg-yellow-50 p-2 rounded border border-yellow-100">
                            <div className="flex-grow">
                                <Input 
                                    label="Grace Period (Days)" 
                                    type="number" 
                                    min="0" 
                                    value={gracePeriodDays} 
                                    onChange={e => setGracePeriodDays(e.target.value)} 
                                    helperText="Reduces billing days for the current month."
                                    disabled={isAgreementCancelled}
                                />
                            </div>
                            <div className="flex-grow">
                                <p className="text-xs text-slate-500 mb-1">Pro-rata Calculation:</p>
                                <p className="text-sm font-medium text-slate-700">
                                    {(() => {
                                        const d = new Date(issueDate);
                                        if (isNaN(d.getTime())) return "Invalid date";
                                        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                                        const remaining = daysInMonth - d.getDate() + 1;
                                        const grace = parseInt(gracePeriodDays) || 0;
                                        const billable = Math.max(0, remaining - grace);
                                        return `${billable} billable days (Month total: ${daysInMonth})`;
                                    })()}
                                </p>
                            </div>
                        </div>
                    )}
                    <Input label="Rent Amount" type="text" inputMode="decimal" value={rentAmount} onChange={e => setRentAmount(e.target.value)} required disabled={isAgreementCancelled} />
                    {showSecurityDeposit && (
                        <Input label="Security Deposit (Optional)" type="text" inputMode="decimal" value={securityDepositCharge} onChange={e => setSecurityDepositCharge(e.target.value)} readOnly={isLocked || isAgreementCancelled} />
                    )}
                    <hr/>
                    <div className="flex justify-between items-center"><span className="font-bold text-lg">Total Amount:</span><span className="font-bold text-lg">{CURRENCY} {calculatedAmount.toLocaleString()}</span></div>
                    <DatePicker 
                        label="Due Date" 
                        value={dueDate} 
                        onChange={d => setDueDate(d.toISOString().split('T')[0])} 
                        required 
                        disabled={isAgreementCancelled} 
                    />
                    <Input label="Property" value={property?.name || ''} disabled />
                    <Input label="Building" value={building?.name || ''} disabled />
                    <div>
                        <Input label="Invoice Number" value={number} onChange={e => setNumber(e.target.value)} required disabled={isAgreementCancelled} />
                        {numberError && <p className="text-danger text-xs mt-1">{numberError}</p>}
                    </div>
                    <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} disabled={isAgreementCancelled} />
                </div>
            ) : (
                <div className="text-center p-8 text-slate-500 border-2 border-dashed rounded-lg">
                    <p>Select a tenant and an agreement to populate invoice details.</p>
                </div>
            )}
        </>
    );
};

  const renderStandardForm = () => {
      return (
     <div className="space-y-4">
      {agreementForInvoice && (
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
            <h4 className="font-semibold text-gray-800 mb-2">From Agreement #{agreementForInvoice.agreementNumber}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex justify-between"><span className="text-gray-600">Selling Price:</span> <span className="font-medium text-gray-800">{CURRENCY} {agreementForInvoice.sellingPrice.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Already Invoiced:</span> <span className="font-medium text-gray-800">{CURRENCY} {amountAlreadyInvoiced.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold"><span className="text-gray-600">Remaining:</span> <span className="text-gray-800">{CURRENCY} {agreementBalance.toLocaleString()}</span></div>
            </div>
        </div>
      )}

      {/* Header Fields - 4 columns on large screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Supplier Field - First */}
          <div className="flex flex-col">
            {isPartiallyPaid && type === 'bill' ? (
                <div>
                    <Input label={contactLabel} value={state.contacts.find(c=>c.id===contactId)?.name || ''} disabled />
                    <p className="text-xs text-amber-600 mt-1">Supplier cannot be changed. Please delete all payments first to edit the supplier.</p>
                </div>
            ) : (
                <ComboBox 
                  label={contactLabel} 
                  items={filteredContacts} 
                  selectedId={contactId} 
                  onSelect={(item) => setContactId(item?.id || '')} 
                  placeholder={`Select ${contactLabel}...`} 
                  required 
                  disabled={isContactLockedByUnit || !!agreementForInvoice || isAgreementCancelled} 
                  entityType="contact"
                  onAddNew={(entityType, name) => {
                    entityFormModal.openForm('contact', name, fixedContactTypeForNew, undefined, (newId) => {
                      setContactId(newId);
                    });
                  }}
                />
            )}
          </div>

          <div className="flex flex-col">
            <Input label={type === 'invoice' ? 'Invoice #' : 'Bill #'} value={number} onChange={e => setNumber(e.target.value)} required disabled={isAgreementCancelled} />
            {numberError && <p className="text-danger text-xs mt-1">{numberError}</p>}
          </div>
          
          <div className="flex flex-col">
             <DatePicker 
                label="Issue Date" 
                value={issueDate} 
                onChange={handleIssueDateChange} 
                required 
                disabled={isAgreementCancelled}
             />
          </div>

          <div className="flex flex-col">
              {(type === 'invoice' || type === 'bill') && (
                <DatePicker 
                    label="Due Date" 
                    value={dueDate} 
                    onChange={d => setDueDate(d.toISOString().split('T')[0])} 
                    required 
                    disabled={isAgreementCancelled}
                />
              )}
          </div>
      </div>
      
      {/* Simplified Project Fields (Only for Bills from Project Management) */}
      {type === 'bill' && projectContext && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <ComboBox 
                label="Project" 
                items={state.projects} 
                selectedId={projectId || ''} 
                onSelect={(item) => { setProjectId(item?.id || ''); setUnitId(''); }} 
                placeholder="Search projects..." 
                entityType="project"
                onAddNew={(entityType, name) => {
                  entityFormModal.openForm('project', name, undefined, undefined, (newId) => {
                    setProjectId(newId);
                    setUnitId('');
                  });
                }}
              />
              
              {/* Amount Field - Aligned with Project */}
              <div className="flex flex-col">
                {expenseCategoryItems.length > 0 ? (
                  <div className="flex flex-col">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                    <div className="bg-gray-50 border border-gray-300 rounded-lg shadow-sm px-2 py-2 flex items-center text-sm font-semibold text-gray-800">
                      {CURRENCY} {totalAmountFromItems.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ) : (
                  <Input
                    label="Amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    disabled={isAgreementCancelled}
                    placeholder="0.00"
                  />
                )}
              </div>
              
              {/* Contract Linking - Inline */}
              {contactId && (
                  <div className="flex flex-col">
                     <ComboBox
                        label="Contract (Optional)"
                        items={availableContracts}
                        selectedId={contractId}
                        onSelect={item => {
                            const selectedContractId = item?.id || '';
                            if (selectedContractId) {
                                const contract = state.contracts.find(c => c.id === selectedContractId);
                                if (contract) {
                                    // Validate: bill and contract must have the same projectId
                                    // If either has a projectId, they must match exactly
                                    if ((projectId || contract.projectId) && projectId !== contract.projectId) {
                                        showAlert('This contract belongs to a different project. A bill can only be linked to a contract with the same project.');
                                        return;
                                    }
                                    setContractId(selectedContractId);
                                    // Auto-set projectId from contract if not already set
                                    if (contract.projectId && !projectId) {
                                        setProjectId(contract.projectId);
                                    }
                                } else {
                                    setContractId('');
                                }
                            } else {
                                setContractId('');
                            }
                        }}
                        placeholder={availableContracts.length > 0 ? "Select contract..." : "No contracts"}
                        allowAddNew={false}
                     />
                     {availableContracts.length > 0 && (
                         <p className="text-xs text-indigo-600 mt-1">Tracked against contract budget</p>
                     )}
                 </div>
              )}
          </div>
      )}
      
      {/* Bill Allocation Context Selector (Only for Bills) */}
      {type === 'bill' && !projectContext && (
          <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Cost Allocation</h3>
                {/* Root Source Toggle Tabs */}
                <div className="flex gap-1.5 flex-1">
                    {!rentalContext && (
                      <button type="button" onClick={() => handleRootChange('project')} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded border transition-all ${rootAllocationType === 'project' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                          Project
                      </button>
                    )}
                    <button type="button" onClick={() => handleRootChange('building')} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded border transition-all ${rootAllocationType === 'building' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                        Building
                    </button>
                    {!rentalContext && (
                      <button type="button" onClick={() => handleRootChange('staff')} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded border transition-all ${rootAllocationType === 'staff' ? 'bg-gray-100 text-gray-700 border-gray-400' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                          Staff
                      </button>
                    )}
                </div>
              </div>

              <div className="bg-white p-2 border border-gray-200 rounded-lg shadow-sm">
                  {/* PROJECT FLOW */}
                  {rootAllocationType === 'project' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-fade-in">
                          <ComboBox 
                            label="Project" 
                            items={state.projects} 
                            selectedId={projectId || ''} 
                            onSelect={(item) => { setProjectId(item?.id || ''); setUnitId(''); }} 
                            placeholder="Search projects..." 
                            entityType="project"
                            onAddNew={(entityType, name) => {
                              entityFormModal.openForm('project', name, undefined, undefined, (newId) => {
                                setProjectId(newId);
                                setUnitId('');
                              });
                            }}
                          />
                          
                          {/* Amount Field */}
                          <div className="flex flex-col">
                            {type === 'bill' && expenseCategoryItems.length > 0 ? (
                              <div className="flex flex-col">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                                <div className="bg-gray-50 border border-gray-300 rounded-lg shadow-sm px-2 py-2 flex items-center text-sm font-semibold text-gray-800">
                                  {CURRENCY} {totalAmountFromItems.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            ) : (
                              <Input
                                label="Amount"
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                required
                                disabled={isAgreementCancelled}
                                placeholder="0.00"
                              />
                            )}
                          </div>
                          
                          {/* Contract Linking */}
                          {contactId && (
                              <div className="flex flex-col">
                                 <ComboBox
                                    label="Contract (Optional)"
                                    items={availableContracts}
                                    selectedId={contractId}
                                    onSelect={item => {
                                        const selectedContractId = item?.id || '';
                                        if (selectedContractId) {
                                            const contract = state.contracts.find(c => c.id === selectedContractId);
                                            if (contract) {
                                                // Validate: bill and contract must have the same projectId
                                                // If either has a projectId, they must match exactly
                                                if ((projectId || contract.projectId) && projectId !== contract.projectId) {
                                                    showAlert('This contract belongs to a different project. A bill can only be linked to a contract with the same project.');
                                                    return;
                                                }
                                                setContractId(selectedContractId);
                                                // Auto-set projectId from contract if not already set
                                                if (contract.projectId && !projectId) {
                                                    setProjectId(contract.projectId);
                                                }
                                            } else {
                                                setContractId('');
                                            }
                                        } else {
                                            setContractId('');
                                        }
                                    }}
                                    placeholder={availableContracts.length > 0 ? "Select contract..." : "No contracts"}
                                    allowAddNew={false}
                                 />
                                 {availableContracts.length > 0 && (
                                     <p className="text-xs text-indigo-600 mt-1">Tracked against contract budget</p>
                                 )}
                             </div>
                          )}
                      </div>
                  )}

                  {/* BUILDING FLOW */}
                  {rootAllocationType === 'building' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-fade-in">
                          <ComboBox 
                            label="Building" 
                            items={state.buildings} 
                            selectedId={buildingId || ''} 
                            onSelect={(item) => { setBuildingId(item?.id || ''); setPropertyId(''); setTenantId(''); }} 
                            placeholder="Search buildings..." 
                            entityType="building"
                            onAddNew={(entityType, name) => {
                              entityFormModal.openForm('building', name, undefined, undefined, (newId) => {
                                setBuildingId(newId);
                                setPropertyId('');
                                setTenantId('');
                              });
                            }}
                          />
                          
                          {buildingId && (
                            <>
                              <div className="flex flex-col">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setBillAllocationType('building')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${billAllocationType === 'building' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>Service</button>
                                    <button type="button" onClick={() => setBillAllocationType('owner')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${billAllocationType === 'owner' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>Owner</button>
                                </div>
                              </div>

                              {billAllocationType === 'owner' && (
                                  <div className="animate-fade-in">
                                      <ComboBox label="Property" items={propertyItems} selectedId={propertyId || ''} onSelect={(item) => setPropertyId(item?.id || '')} placeholder="Search properties..." allowAddNew={false} />
                                  </div>
                              )}
                            </>
                          )}
                      </div>
                  )}

                  {/* STAFF FLOW */}
                  {rootAllocationType === 'staff' && (
                      <div className="animate-fade-in max-w-md">
                          <ComboBox 
                            label="Staff Member" 
                            items={staffList} 
                            selectedId={staffId || ''} 
                            onSelect={handleStaffSelect} 
                            placeholder="Search staff..." 
                            allowAddNew={false}
                          />
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Project Invoice Specifics */}
      {type === 'invoice' && invoiceType === InvoiceType.INSTALLMENT && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
            <ComboBox 
              label="Project" 
              items={state.projects} 
              selectedId={projectId || ''} 
              onSelect={(item) => setProjectId(item?.id || '')} 
              placeholder="Select a project..." 
              disabled={!!agreementForInvoice || isAgreementCancelled}
              entityType="project"
              onAddNew={(entityType, name) => {
                entityFormModal.openForm('project', name, undefined, undefined, (newId) => {
                  setProjectId(newId);
                });
              }}
            />
            {projectId && (<ComboBox label="Unit (Optional)" items={availableUnitsForProject} selectedId={unitId || ''} onSelect={(item) => setUnitId(item?.id || '')} placeholder="Select a unit" allowAddNew={false} disabled={!!agreementForInvoice || isAgreementCancelled} />)}
          </div>
      )}

      {/* Amount Field for Project Invoices (INSTALLMENT) */}
      {type === 'invoice' && invoiceType === InvoiceType.INSTALLMENT && (
          <Input
            label="Amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
            disabled={isAgreementCancelled}
            placeholder="0.00"
            helperText={agreementForInvoice ? `Max: ${CURRENCY} ${agreementBalance.toLocaleString()}` : undefined}
          />
      )}

      {/* Expense Category Items (for Bills) or Category (for Invoices) */}
      {type === 'bill' ? (
        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50 flex flex-col min-h-0" style={{ maxHeight: 'calc(100vh - 500px)', minHeight: '200px' }}>
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <label className="block text-sm font-medium text-gray-700">Expense Categories</label>
            <div className="w-40">
              <ComboBox
                items={availableCategories}
                selectedId=""
                onSelect={handleAddExpenseCategory}
                placeholder="Add category..."
                disabled={isAgreementCancelled}
                entityType="category"
                onAddNew={(entityType, name) => {
                  entityFormModal.openForm('category', name, undefined, TransactionType.EXPENSE, (newId) => {
                    handleAddExpenseCategory({ id: newId, name });
                  });
                }}
              />
            </div>
          </div>

          {expenseCategoryItems.length > 0 ? (
            <>
              {/* Data Grid */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col flex-grow min-h-0">
                <div className="overflow-y-auto flex-grow" style={{ maxHeight: 'calc(100vh - 500px)', minHeight: '150px' }}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-200 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-700">Category</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-700 w-24">Unit</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-700 w-20">Qty</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-700 w-24">Price</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-700 w-28">Net</th>
                        <th className="px-1 py-1.5 text-center font-semibold text-gray-700 w-8">X</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {expenseCategoryItems.map((item) => {
                        const category = expenseCategories.find(c => c.id === item.categoryId);
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5">
                              <span className="font-medium text-gray-800 truncate block max-w-[120px]">{category?.name || 'Unknown'}</span>
                            </td>
                            <td className="px-2 py-1.5">
                              <Select
                                value={item.unit}
                                onChange={(e) => updateExpenseCategoryItem(item.id, { unit: e.target.value as ContractExpenseCategoryItem['unit'] })}
                                className="text-xs border-gray-300 h-8 w-full"
                                disabled={isAgreementCancelled}
                                hideIcon={false}
                              >
                                <option value="Cubic Feet">Cubic Feet</option>
                                <option value="Square feet">Square feet</option>
                                <option value="feet">feet</option>
                                <option value="quantity">quantity</option>
                              </Select>
                            </td>
                            <td className="px-2 py-1.5 relative">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.quantity?.toString() || ''}
                                onChange={(e) => {
                                  const quantity = parseFloat(e.target.value) || 0;
                                  updateExpenseCategoryItem(item.id, { quantity });
                                }}
                                className="w-full pr-6 text-xs h-8"
                                disabled={isAgreementCancelled}
                              />
                              <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.pricePerUnit.toString() || ''}
                                onChange={(e) => {
                                  const pricePerUnit = parseFloat(e.target.value) || 0;
                                  updateExpenseCategoryItem(item.id, { pricePerUnit });
                                }}
                                className="w-full text-xs h-8"
                                disabled={isAgreementCancelled}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.netValue?.toString() || '0'}
                                onChange={(e) => {
                                  const netValue = parseFloat(e.target.value) || 0;
                                  updateExpenseCategoryItem(item.id, { netValue }, true);
                                }}
                                className="w-full text-right font-semibold text-xs h-8"
                                disabled={isAgreementCancelled}
                              />
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveExpenseCategoryItem(item.id)}
                                className="text-gray-400 hover:text-rose-500 transition-colors"
                                title="Remove"
                                disabled={isAgreementCancelled}
                              >
                                <div className="w-3.5 h-3.5">{ICONS.x}</div>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100 border-t-2 border-gray-300 sticky bottom-0">
                      <tr>
                        <td colSpan={4} className="px-2 py-1.5 text-right font-bold text-gray-700 text-xs">
                          Total:
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-gray-800 text-xs">
                          {CURRENCY} {totalAmountFromItems.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 italic py-2 text-center bg-white border border-gray-200 rounded-lg">
              No expense categories added. Use the dropdown above to add categories.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
           <div>
            {type === 'invoice' && (invoiceType === InvoiceType.INSTALLMENT || invoiceType === InvoiceType.SERVICE_CHARGE) ? (
                    <ComboBox 
                        label="Income Category" 
                        items={incomeCategories} 
                        selectedId={categoryId || ''} 
                        onSelect={(item) => setCategoryId(item?.id || '')} 
                        placeholder="Select category..." 
                        required={invoiceType === InvoiceType.INSTALLMENT}
                        disabled={isAgreementCancelled}
                        entityType="category"
                        onAddNew={(entityType, name) => {
                            entityFormModal.openForm('category', name, undefined, TransactionType.INCOME, (newId) => {
                                setCategoryId(newId);
                            });
                        }}
                    />
                ) : null}
           </div>
           <div>
                <Input label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} disabled={isAgreementCancelled} placeholder="Add notes..." />
           </div>
      </div>
      )}
      
      {/* Description field for Bills */}
      {type === 'bill' && (
        <Input label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} disabled={isAgreementCancelled} placeholder="Add notes..." />
      )}

      {/* Document Upload Section for Bills */}
      {type === 'bill' && (
        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-1">Bill Document</label>
          <p className="text-xs text-gray-500 mb-2">Upload a scanned copy of the bill document.</p>
          
          {(documentId || (documentPath && !documentFile)) && (
            <div className="mb-3 p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-100 rounded flex items-center justify-center">
                  <div className="w-4 h-4 text-indigo-600">{ICONS.file}</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Document attached</p>
                  <p className="text-xs text-gray-500">
                    {documentId ? (state.documents?.find(d => d.id === documentId)?.fileName || 'Document') : documentPath.split('/').pop()}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    if (documentId) {
                      await openDocumentById(documentId, state.documents, url => window.open(url, '_blank'), showAlert);
                    } else if (documentPath && (window as any).electronAPI?.openDocumentFile) {
                      try {
                        const result = await (window as any).electronAPI.openDocumentFile({ filePath: documentPath });
                        if (!result?.success) await showAlert(`Failed to open: ${result?.error || 'Unknown'}`);
                      } catch (error) {
                        await showAlert(error instanceof Error ? error.message : 'Error opening document');
                      }
                    } else {
                      await showAlert('File system access not available');
                    }
                  }}
                >
                  Open
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDocumentPath('');
                    setDocumentId('');
                    setDocumentFile(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <label className="flex-1">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setDocumentFile(file);
                    setDocumentPath('');
                    setDocumentId('');
                  }
                }}
                className="hidden"
                disabled={isAgreementCancelled}
              />
              <div className={`cursor-pointer border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors ${isAgreementCancelled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="text-gray-600 text-sm">
                  {documentFile ? documentFile.name : 'Click to upload document'}
                </div>
              </div>
            </label>
            {documentFile && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDocumentFile(null);
                }}
                disabled={isAgreementCancelled}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
      
    </div>
  )};

  return (
    <>
    <form onSubmit={handleSubmit} className="flex flex-col h-full" style={formStyle}>
      {isPartiallyPaid && type === 'bill' && (
          <div className="bg-amber-50 text-amber-800 p-1.5 rounded border border-amber-200 text-[10px] font-medium mb-2 flex-shrink-0">
              This bill has associated payments recorded. You can edit expense categories and amounts, but the supplier cannot be changed. To change the supplier, please delete all payments first.
          </div>
      )}
      {isPartiallyPaid && type === 'invoice' && (
          <div className="bg-amber-50 text-amber-800 p-1.5 rounded border border-amber-200 text-[10px] font-medium mb-2 flex-shrink-0">
              This {type} has associated payments recorded. Editing critical details may affect your ledger consistency.
          </div>
      )}
      {isAgreementCancelled && (
          <div className="bg-red-50 text-red-800 p-1.5 rounded border border-red-200 text-[10px] font-medium mb-2 flex-shrink-0">
              This invoice belongs to a cancelled agreement and cannot be updated.
          </div>
      )}
      <div className="flex-grow min-h-0 overflow-y-auto pr-1 -mr-1">
        <div className="space-y-3">
          {invoiceType === InvoiceType.RENTAL ? renderRentalInvoiceForm()
              : renderStandardForm()}
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-3 border-t border-gray-200 mt-3 flex-shrink-0">
        <div className="flex gap-2">
            {itemToEdit && (
                <Button type="button" variant="danger" onClick={handleDelete} disabled={isAgreementCancelled} className="w-full sm:w-auto text-sm py-2">
                    Delete
                </Button>
            )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {itemToEdit && type === 'bill' && onDuplicate && (
                <Button type="button" variant="secondary" onClick={handleDuplicateClick} className="text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 w-full sm:w-auto text-sm py-2">
                    Duplicate Bill
                </Button>
            )}
            {type === 'bill' && billPrintData && (
                <Button type="button" variant="secondary" onClick={() => triggerPrint('BILL', billPrintData)} className="w-full sm:w-auto text-sm py-2 flex items-center gap-1">
                    {ICONS.print && <span className="w-4 h-4 inline-block [&>svg]:w-full [&>svg]:h-full">{ICONS.print}</span>}
                    Print
                </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto text-sm py-2">Cancel</Button>
            <Button type="submit" disabled={!!numberError || isAgreementCancelled} className="w-full sm:w-auto text-sm py-2">{itemToEdit ? 'Update' : 'Save'}</Button>
        </div>
      </div>
    </form>
    <Modal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} title={`Add New ${contactLabel}`}>
        <ContactForm onSubmit={handleContactSubmit} onCancel={() => setIsContactModalOpen(false)} existingContacts={state.contacts} fixedTypeForNew={fixedContactTypeForNew} initialName={newItemName} />
    </Modal>
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

export default InvoiceBillForm;
