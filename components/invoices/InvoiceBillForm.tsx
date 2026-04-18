
import React, { useState, useMemo, useEffect } from 'react';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { useNotification } from '../../context/NotificationContext';
import { usePrintContext } from '../../context/PrintContext';
import type { BillPrintData } from '../print/BillPrintTemplate';
import { Invoice, Bill, InvoiceStatus, Contact, Property, InvoiceType, ContactType, RentalAgreement, Project, TransactionType, Category, Unit, ProjectAgreement, Building, RecurringInvoiceTemplate, ProjectAgreementStatus, ContractStatus, Contract, ContractExpenseCategoryItem, Vendor } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useRecordLock, isAdminRole } from '../../hooks/useRecordLock';
import RecordLockBanner from '../recordLock/RecordLockBanner';
import RecordLockConflictModal from '../recordLock/RecordLockConflictModal';
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
import {
  fromPickerDateToYyyyMmDd,
  getFirstOfNextMonthLocal,
  parseStoredDateToYyyyMmDdInput,
  parseYyyyMmDdToLocalDate,
  todayLocalYyyyMmDd,
} from '../../utils/dateUtils';
import { sumExpenseLinkedToBill } from '../../utils/billLinkedPayments';

interface InvoiceBillFormProps {
  onClose: () => void;
  type: 'invoice' | 'bill';
  itemToEdit?: Invoice | Bill;
  invoiceTypeForNew?: InvoiceType | null;
  agreementForInvoice?: ProjectAgreement;
  initialContactId?: string;
  initialVendorId?: string;
  rentalContext?: boolean;
  onDuplicate?: (data: Partial<Invoice | Bill>) => void;
  initialData?: Partial<Invoice | Bill>;
  projectContext?: boolean; // When true, bill form is opened from project management - simplifies to project-only allocation
}

type BillAllocationType = 'project' | 'building' | 'owner' | 'tenant' | 'staff';
type RootBillType = 'project' | 'building' | 'staff';

const InvoiceBillForm: React.FC<InvoiceBillFormProps> = ({ onClose, type, itemToEdit, invoiceTypeForNew, agreementForInvoice, initialContactId, initialVendorId, rentalContext, onDuplicate, initialData, projectContext = false }) => {
  const state = useStateSelector(s => s);
  const dispatch = useDispatchOnly();
  const { isAuthenticated } = useAuth();
  const { showToast, showAlert, showConfirm } = useNotification();
  const { print: triggerPrint } = usePrintContext();
  const { rentalInvoiceSettings, projectInvoiceSettings } = state;

  const recordLock = useRecordLock({
    recordType: 'invoice',
    recordId: type === 'invoice' ? itemToEdit?.id : undefined,
    enabled: type === 'invoice' && Boolean(itemToEdit?.id) && !isLocalOnlyMode(),
    currentUserId: state.currentUser?.id,
    currentUserName: state.currentUser?.name,
    userRole: state.currentUser?.role,
  });

  const handleForceInvoiceLock = async () => {
    const ok = await showConfirm(
      'Take over editing? The other user may lose unsaved changes.',
      { title: 'Force edit' }
    );
    if (ok) await recordLock.forceTakeover();
  };

  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  /** When saving, also create a recurring template (rental invoices only; hidden if one already exists). */
  const [addToRecurring, setAddToRecurring] = useState(false);
  const entityFormModal = useEntityFormModal();

  // Merge itemToEdit with initialData for defaults (initialData used when duplicating)
  const defaults = itemToEdit || initialData || {};

  /** Editing uses the record; new/duplicate uses prop or falls back to initialData so type (e.g. RENTAL vs SECURITY_DEPOSIT) is never lost. */
  const invoiceType = itemToEdit
    ? (itemToEdit as Invoice).invoiceType
    : (invoiceTypeForNew ?? (initialData as Invoice | undefined)?.invoiceType);

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
      // Check if projectAgreementId is a rental agreement (tenant-borne expense)
      if (bill.projectAgreementId) {
        const rentalAgreement = state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId);
        if (rentalAgreement) return 'tenant';
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
      setVendorId(bill.vendorId || '');
      setPropertyId(bill.propertyId || '');
      setProjectId(bill.projectId || '');
      setBuildingId(bill.buildingId || '');
      setStaffId(bill.staffId || '');
      setContractId(bill.contractId || '');
      setCategoryId(bill.categoryId || '');
      if (bill.issueDate) {
        setIssueDate(parseStoredDateToYyyyMmDdInput(String(bill.issueDate)));
      }
      if (bill.dueDate) {
        setDueDate(parseStoredDateToYyyyMmDdInput(String(bill.dueDate)));
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
  const [vendorId, setVendorId] = useState((defaults as Bill)?.vendorId || initialVendorId || '');
  const [propertyId, setPropertyId] = useState(defaults.propertyId || '');
  const [projectId, setProjectId] = useState(
    (defaults && 'projectId' in defaults ? defaults.projectId : '') ||
    agreementForInvoice?.projectId ||
    (type === 'bill' && !itemToEdit && !rentalContext ? (state.defaultProjectId || '') : '')
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
      return parseStoredDateToYyyyMmDdInput(String(defaults.issueDate));
    }
    if (state.enableDatePreservation && state.lastPreservedDate && !itemToEdit) {
      return state.lastPreservedDate;
    }
    return todayLocalYyyyMmDd();
  };

  const [issueDate, setIssueDate] = useState(getInitialIssueDate());
  const [dueDate, setDueDate] = useState(
    defaults && 'dueDate' in defaults && defaults.dueDate ? parseStoredDateToYyyyMmDdInput(String((defaults as Invoice | Bill).dueDate)) : ''
  );

  // Save date to preserved date when changed (if option is enabled)
  const handleIssueDateChange = (date: Date) => {
    const dateStr = fromPickerDateToYyyyMmDd(date);
    setIssueDate(dateStr);
    if (state.enableDatePreservation && !itemToEdit) {
      dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: dateStr });
    }
  };

  // Keep issue/due in sync when switching which invoice is edited (same as bill effect for bills).
  useEffect(() => {
    if (type !== 'invoice' || !itemToEdit) return;
    const inv = itemToEdit as Invoice;
    if (inv.issueDate) setIssueDate(parseStoredDateToYyyyMmDdInput(String(inv.issueDate)));
    if (inv.dueDate) setDueDate(parseStoredDateToYyyyMmDdInput(String(inv.dueDate)));
    else setDueDate('');
  }, [itemToEdit?.id, type]);

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

  const initialRentForEdit = useMemo(() => {
    if (!defaults || !('invoiceType' in defaults)) return '0';
    const inv = defaults as Invoice;
    if (inv.invoiceType !== InvoiceType.RENTAL && inv.invoiceType !== InvoiceType.SECURITY_DEPOSIT) return '0';
    const rent =
      (inv.amount ?? 0) - (inv.securityDepositCharge || 0) - (inv.serviceCharges || 0);
    return String(rent);
  }, [defaults]);

  const [rentAmount, setRentAmount] = useState(initialRentForEdit);
  const [securityDepositCharge, setSecurityDepositCharge] = useState(defaults && 'securityDepositCharge' in defaults ? String(defaults.securityDepositCharge || '0') : '0');
  const [gracePeriodDays, setGracePeriodDays] = useState('0');

  /** Source invoice (edit or duplicate prefill) — used to preserve fields not shown as inputs (e.g. serviceCharges). */
  const sourceInvoice = useMemo((): Invoice | undefined => {
    if (type !== 'invoice') return undefined;
    return (itemToEdit as Invoice | undefined) ?? (initialData as Invoice | undefined);
  }, [type, itemToEdit, initialData]);

  const preservedServiceCharges = sourceInvoice?.serviceCharges ?? 0;

  const calculatedAmount =
    (parseFloat(rentAmount) || 0) +
    (parseFloat(securityDepositCharge) || 0) +
    (preservedServiceCharges || 0);
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
  }, [number, contactId, propertyId, projectId, buildingId, staffId, unitId, categoryId, issueDate, dueDate, description, amount, rentAmount, securityDepositCharge, contractId, expenseCategoryItems, vendorId]);

  // Reset dirty state initially after mount
  useEffect(() => {
    setIsDirty(false);
  }, []);

  // Validate contractId when vendor or project changes, and auto-set projectId from contract (only for project allocation)
  useEffect(() => {
    if (contractId && vendorId && type === 'bill' && rootAllocationType === 'project') {
      const contract = state.contracts.find(c => c.id === contractId);
      if (contract) {
        // If contract exists but vendor doesn't match, clear the contract link
        if (contract.vendorId !== vendorId) {
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
    // When in building allocation, contracts are project-scoped so clear contract and avoid setting projectId
    if (type === 'bill' && rootAllocationType === 'building' && contractId) {
      const contract = state.contracts.find(c => c.id === contractId);
      if (contract?.projectId) {
        setContractId('');
      }
    }
  }, [vendorId, contractId, state.contracts, type, projectId, rootAllocationType]);

  // Auto-set issue date to agreement start date if this is the first invoice for the agreement
  useEffect(() => {
    if (!defaults.id && (invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT) && agreementId) {
      const agreement = state.rentalAgreements.find(ra => ra.id === agreementId);
      if (agreement) {
        const hasInvoices = state.invoices.some(inv => inv.agreementId === agreement.id);
        if (!hasInvoices && agreement.startDate) {
          setIssueDate(parseStoredDateToYyyyMmDdInput(String(agreement.startDate)));
        }
      }
    }
  }, [agreementId, invoiceType, defaults, state.rentalAgreements, state.invoices]);

  useEffect(() => {
    if (invoiceTypeForNew === InvoiceType.RENTAL || invoiceTypeForNew === InvoiceType.SECURITY_DEPOSIT || (defaults as Invoice)?.invoiceType === InvoiceType.RENTAL || (defaults as Invoice)?.invoiceType === InvoiceType.SECURITY_DEPOSIT) setAmount(calculatedAmount.toString());
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
      const issue = parseYyyyMmDdToLocalDate(issueDate);
      if (isNaN(issue.getTime())) return;

      if (type === 'invoice') {
        const nextWeek = new Date(issue.getFullYear(), issue.getMonth(), issue.getDate());
        nextWeek.setDate(nextWeek.getDate() + 7);
        setDueDate(fromPickerDateToYyyyMmDd(nextWeek));
      } else if (type === 'bill') {
        const nextMonth = new Date(issue.getFullYear(), issue.getMonth(), issue.getDate());
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        setDueDate(fromPickerDateToYyyyMmDd(nextMonth));
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
    if (type !== 'bill' || billAllocationType !== 'project' || !vendorId) return [];

    // Filter contracts for the same vendor AND same project
    // Rule: Bill and contract must have the same projectId (or both be null/undefined)
    // Active only, unless editing an existing bill with that contract
    const vendorContracts = (state.contracts || []).filter(c => {
      // Must match vendor
      if (c.vendorId !== vendorId) return false;

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
  }, [state.contracts, state.projects, type, billAllocationType, projectId, vendorId, contractId]);

  // Auto-link contract when exactly one active contract matches vendor + project
  useEffect(() => {
    if (type !== 'bill' || contractId || !vendorId || !projectId || itemToEdit) return;
    if (availableContracts.length === 1) {
      const contractIdToSet = availableContracts[0].id;
      setContractId(contractIdToSet);
      const contract = state.contracts.find(c => c.id === contractIdToSet);
      if (contract) applyContractExpenseCategoriesToBill(contract);
    }
  }, [availableContracts, type, contractId, vendorId, projectId, itemToEdit, state.contracts]);

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

  /** When creating a new bill and user links a contract, pre-fill expense categories and total from contract. */
  const applyContractExpenseCategoriesToBill = (contract: Contract) => {
    if (type !== 'bill' || itemToEdit || !contract.expenseCategoryItems || contract.expenseCategoryItems.length === 0) return;
    const cloned = contract.expenseCategoryItems.map((item, i) => ({
      ...item,
      id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
    }));
    setExpenseCategoryItems(cloned);
    const total = cloned.reduce((s, i) => s + (i.netValue ?? 0), 0);
    setAmount(total.toString());
  };

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
        // Reverse calculation: if net value is edited directly, calculate price per unit (rounded to 2 decimals)
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const netValue = updated.netValue || 0;
        const quantity = updated.quantity || 0;
        if (quantity > 0) {
          updated.pricePerUnit = round2(netValue / quantity);
        } else {
          // If quantity is 0, set price per unit to net value (treat as single item)
          updated.pricePerUnit = round2(netValue);
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

  const handleContactSubmit = async (data: Omit<Contact, 'id'> | Omit<Vendor, 'id'>) => {
    if (type === 'bill') {
      const newId = `vendor_${Date.now()}`;
      let newVendor = { ...data, id: newId } as Vendor;
      if (!isLocalOnlyMode() && isAuthenticated) {
        try {
          const merged = await getAppStateApiService().saveVendor({
            ...newVendor,
            userId: state.currentUser?.id,
          });
          newVendor = { ...newVendor, ...merged };
        } catch (e: any) {
          showToast(e?.message || e?.error || 'Could not save vendor.', 'error');
          return;
        }
      }
      dispatch({ type: 'ADD_VENDOR', payload: newVendor });
      setVendorId(newVendor.id);
    } else {
      const newId = Date.now().toString();
      const newContact = { ...data, id: newId } as Contact;
      dispatch({ type: 'ADD_CONTACT', payload: newContact });
      setContactId(newId);
    }
    setIsContactModalOpen(false);
    setNewItemName('');
    showToast(`New ${type === 'bill' ? 'vendor' : 'contact'} ${data.name} added!`);
  };

  const tenantAgreements = useMemo(() => {
    if (!contactId && (invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT)) return [];
    const targetId = (invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT) ? contactId : tenantId;
    if (!targetId) return [];
    return state.rentalAgreements.filter(ra => ra.contactId === targetId);
  }, [contactId, tenantId, invoiceType, state.rentalAgreements]);

  /** Same matching rules as InvoiceDetailView — used to hide "add to recurring" when a template already exists. */
  const existingRecurringTemplate = useMemo(() => {
    if (invoiceType !== InvoiceType.RENTAL) return undefined;
    const templates = (state.recurringInvoiceTemplates || []).filter(t => !t.deletedAt);
    let resolvedPropId = propertyId;
    if (!resolvedPropId && agreementId) {
      resolvedPropId = state.rentalAgreements.find(ra => ra.id === agreementId)?.propertyId;
    }
    return templates.find(
      t =>
        (agreementId &&
          t.agreementId === agreementId &&
          (t.invoiceType || InvoiceType.RENTAL) === invoiceType) ||
        (!agreementId &&
          resolvedPropId &&
          t.propertyId === resolvedPropId &&
          t.contactId === contactId &&
          (t.invoiceType || InvoiceType.RENTAL) === invoiceType)
    );
  }, [
    invoiceType,
    agreementId,
    contactId,
    propertyId,
    state.recurringInvoiceTemplates,
    state.rentalAgreements,
  ]);

  useEffect(() => {
    setAddToRecurring(false);
  }, [itemToEdit?.id, agreementId, contactId]);

  useEffect(() => {
    if (itemToEdit) return;
    // Duplicate / prefill from initialData: keep rent, description, and dates from the source invoice
    if (initialData) return;
    if (invoiceType !== InvoiceType.RENTAL && invoiceType !== InvoiceType.SECURITY_DEPOSIT) return;

    const selectedAgreement = state.rentalAgreements.find(ra => ra.id === agreementId);
    if (!selectedAgreement) {
      setRentAmount('0');
      return;
    }

    const dateObj = parseYyyyMmDdToLocalDate(issueDate);
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

      const issueBase = parseYyyyMmDdToLocalDate(issueDate);
      const newDueDate = new Date(issueBase.getFullYear(), issueBase.getMonth(), issueBase.getDate());
      newDueDate.setDate(selectedAgreement.rentDueDate);
      if (newDueDate < issueBase) {
        newDueDate.setMonth(newDueDate.getMonth() + 1);
      }
      setDueDate(fromPickerDateToYyyyMmDd(newDueDate));
    }

  }, [agreementId, issueDate, gracePeriodDays, invoiceType, itemToEdit, initialData, state.rentalAgreements, state.properties]);


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
      if (agr) {
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
    if (type === 'invoice' && !isLocalOnlyMode() && recordLock.viewOnly) {
      await showAlert('This invoice is open in view-only mode.', { title: 'Cannot delete' });
      return;
    }
    if (itemToEdit.paidAmount > 0) {
      const linkedPay =
        type === 'bill' ? sumExpenseLinkedToBill(state.transactions, (itemToEdit as Bill).id) : 0;
      if (type === 'bill' && linkedPay < 0.01) {
        const ok = await showConfirm(
          `This bill is marked paid (${CURRENCY} ${(itemToEdit as Bill).paidAmount.toLocaleString()}) but there are no expense transactions linked to it in the ledger — the record is inconsistent.\n\nDelete this bill anyway? (PM cycle links will be removed if present.)`,
          { title: 'Delete bill without ledger payments', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        if (!ok) return;
        const alloc = state.pmCycleAllocations?.find((a) => a.billId === itemToEdit.id);
        if (alloc) {
          dispatch({ type: 'DELETE_PM_CYCLE_ALLOCATION', payload: alloc.id });
        }
        dispatch({ type: 'DELETE_BILL', payload: itemToEdit.id });
        onClose();
        showToast('Bill deleted successfully.', 'info');
        return;
      }
      await showAlert(`Cannot delete this ${type} because it has associated payments (${CURRENCY} ${itemToEdit.paidAmount.toLocaleString()}).\n\nPlease delete the payment transactions from the ledger first.`, { title: 'Deletion Blocked' });
      return;
    }
    if (await showConfirm(`Are you sure you want to delete this ${type}?`, { title: `Delete ${type === 'invoice' ? 'Invoice' : 'Bill'}`, confirmLabel: 'Delete', cancelLabel: 'Cancel' })) {
      if (type === 'invoice') {
        dispatch({ type: 'DELETE_INVOICE', payload: itemToEdit.id });
      } else {
        const alloc = state.pmCycleAllocations?.find((a) => a.billId === itemToEdit.id);
        if (alloc) dispatch({ type: 'DELETE_PM_CYCLE_ALLOCATION', payload: alloc.id });
        dispatch({ type: 'DELETE_BILL', payload: itemToEdit.id });
      }
      onClose();
      showToast(`${type === 'invoice' ? 'Invoice' : 'Bill'} deleted successfully.`, 'info');
    }
  };

  // Function to gather current form data
  const getFormData = () => {
    let finalAmount: number;
    if (invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT) {
      finalAmount = calculatedAmount;
    } else if (type === 'bill' && expenseCategoryItems.length > 0) {
      finalAmount = totalAmountFromItems;
    } else {
      finalAmount = parseFloat(amount) || 0;
    }

    const issueYmd = parseStoredDateToYyyyMmDdInput(issueDate || todayLocalYyyyMmDd());
    const dueYmd = dueDate ? parseStoredDateToYyyyMmDdInput(dueDate) : undefined;

    const srcInv = type === 'invoice' ? sourceInvoice : undefined;
    const rentalMonthResolved =
      invoiceType === InvoiceType.RENTAL
        ? issueYmd.slice(0, 7)
        : invoiceType === InvoiceType.SECURITY_DEPOSIT
          ? srcInv?.rentalMonth ?? issueYmd.slice(0, 7)
          : srcInv?.rentalMonth;

    return {
      contactId: type === 'bill' ? undefined : (contactId || ''),
      vendorId: type === 'bill' ? (vendorId || contactId || '') : undefined,
      propertyId: propertyId || undefined,
      projectId: projectId || undefined,
      amount: finalAmount,
      issueDate: issueYmd,
      description: description || undefined, // Preserve empty strings as undefined for optional fields
      invoiceNumber: number,
      billNumber: number,
      dueDate: dueYmd,
      invoiceType: invoiceType!,
      buildingId: buildingId || undefined,
      categoryId: (type === 'bill' && expenseCategoryItems.length > 0) ? undefined : (categoryId || undefined), // Don't save categoryId if using expenseCategoryItems
      agreementId: agreementId || undefined,
      securityDepositCharge: parseFloat(securityDepositCharge) || undefined,
      unitId: unitId || undefined,
      serviceCharges: srcInv?.serviceCharges,
      staffId: staffId || undefined,
      contractId: contractId || undefined,
      rentalMonth: rentalMonthResolved,
      userId: srcInv?.userId,
      expenseCategoryItems: (type === 'bill' && expenseCategoryItems.length > 0) ? expenseCategoryItems : undefined,
      // Note: documentPath is handled separately in handleSubmit
    };
  };

  const handleSubmit = async (e: React.FormEvent, skipClose = false) => {
    if (e) e.preventDefault();

    if (type === 'invoice' && itemToEdit?.id && !isLocalOnlyMode() && recordLock.viewOnly) {
      await showAlert('This invoice is open in view-only mode.', { title: 'Cannot save' });
      return;
    }

    if (!number || !number.trim()) {
      await showAlert(`${type === 'invoice' ? 'Invoice' : 'Bill'} number is required.`);
      return;
    }

    // Check if expense category items are required for Bills
    if (type === 'bill' && expenseCategoryItems.length === 0) {
      await showAlert('Please add at least one expense category item.');
      return;
    }

    // Validate tenant bill has agreement selected
    if (type === 'bill' && rentalContext && billAllocationType === 'tenant' && !agreementId) {
      await showAlert('Please select a tenant and agreement for tenant-borne expenses.');
      return;
    }

    // Validate owner bill has property selected
    if (type === 'bill' && rentalContext && billAllocationType === 'owner' && !propertyId) {
      await showAlert('Please select a property for owner-borne expenses.');
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
    if (invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT) {
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

    /* Recurring template creation disabled */

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

    const maybeAddRecurringAfterInvoiceSave = (_inv: Invoice) => {
      /* Recurring template creation disabled — no-op */
    };

    if (itemToEdit) {
      if (type === 'invoice') {
        // For rental invoices, always use Rental Income category for the rent portion
        // For security deposit invoices, use Security Deposit category
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');

        if (invoiceType === InvoiceType.RENTAL && !rentalIncomeCategory) {
          await showAlert("Critical Error: 'Rental Income' category not found. Please check settings.");
          return;
        }
        if (invoiceType === InvoiceType.SECURITY_DEPOSIT && !securityDepositCategory) {
          await showAlert("Critical Error: 'Security Deposit' category not found. Please check settings.");
          return;
        }

        const resolvedCategoryId = invoiceType === InvoiceType.SECURITY_DEPOSIT
          ? securityDepositCategory?.id
          : invoiceType === InvoiceType.RENTAL
            ? rentalIncomeCategory!.id
            : (categoryId || undefined);

        const merged: Invoice = {
          ...(itemToEdit as Invoice),
          ...formData,
          categoryId: resolvedCategoryId,
        };
        const paidAmt = merged.paidAmount || 0;
        const invAmt = merged.amount || 0;
        if (paidAmt >= invAmt - 0.1) merged.status = InvoiceStatus.PAID;
        else if (paidAmt > 0.1) merged.status = InvoiceStatus.PARTIALLY_PAID;
        else merged.status = InvoiceStatus.UNPAID;

        dispatch({ type: 'UPDATE_INVOICE', payload: merged });
        showToast("Invoice updated successfully");
        maybeAddRecurringAfterInvoiceSave(merged);
      } else {
        // Compute expenseBearerType for rental bills
        const expenseBearerType = (rentalContext && type === 'bill' && rootAllocationType === 'building' && ['building', 'owner', 'tenant'].includes(billAllocationType))
          ? (billAllocationType as 'building' | 'owner' | 'tenant') : undefined;

        // Ensure all bill fields are preserved when updating
        const updatedBill: Bill = {
          ...(itemToEdit as Bill),
          ...formData,
          projectAgreementId: billAllocationType === 'tenant' ? (agreementId || undefined) : undefined,
          propertyId: (billAllocationType === 'owner' || billAllocationType === 'tenant') ? (propertyId || undefined) : undefined,
          expenseBearerType,
          documentPath: type === 'bill' ? (finalDocumentPath || (itemToEdit as Bill).documentPath || undefined) : undefined,
          documentId: type === 'bill' ? (finalDocumentId ?? (itemToEdit as Bill).documentId) : undefined,
          expenseCategoryItems: (type === 'bill' && expenseCategoryItems.length > 0) ? expenseCategoryItems : ((itemToEdit as Bill).expenseCategoryItems || undefined),
        };
        if (type === 'bill' && rootAllocationType === 'building') {
          updatedBill.projectId = undefined;
          updatedBill.contractId = undefined;
        }
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

        // For rental invoices: categoryId = Rental Income; for security deposit: Security Deposit category
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');

        if (invoiceType === InvoiceType.RENTAL && !rentalIncomeCategory) {
          await showAlert("Critical Error: 'Rental Income' category not found. Please check settings.");
          return;
        }
        if (invoiceType === InvoiceType.SECURITY_DEPOSIT && !securityDepositCategory) {
          await showAlert("Critical Error: 'Security Deposit' category not found. Please check settings.");
          return;
        }

        const resolvedCategoryId = invoiceType === InvoiceType.SECURITY_DEPOSIT
          ? securityDepositCategory!.id
          : invoiceType === InvoiceType.RENTAL
            ? rentalIncomeCategory!.id
            : (categoryId || undefined);

        const newInvoice: Invoice = {
          ...newData,
          invoiceType: invoiceType!,
          categoryId: resolvedCategoryId,
        };
        dispatch({ type: 'ADD_INVOICE', payload: newInvoice });
        showToast("Invoice created successfully");
        maybeAddRecurringAfterInvoiceSave(newInvoice);
      } else {
        const expenseBearerType = (rentalContext && type === 'bill' && rootAllocationType === 'building' && ['building', 'owner', 'tenant'].includes(billAllocationType))
          ? (billAllocationType as 'building' | 'owner' | 'tenant') : undefined;

        const newBill: Bill = {
          ...newData,
          projectAgreementId: billAllocationType === 'tenant' ? (agreementId || undefined) : undefined,
          propertyId: (billAllocationType === 'owner' || billAllocationType === 'tenant') ? (propertyId || undefined) : undefined,
          expenseBearerType,
          documentPath: type === 'bill' ? (finalDocumentPath || undefined) : undefined,
          documentId: type === 'bill' ? finalDocumentId : undefined
        };
        if (type === 'bill' && rootAllocationType === 'building') {
          newBill.projectId = undefined;
          newBill.contractId = undefined;
        }
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
      const label = type === 'invoice' ? 'invoice' : 'bill';

      if (isDirty && itemToEdit) {
        const confirmSave = await showConfirm(`You have unsaved changes on this ${label}. Do you want to save them before duplicating?`, {
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
      const payload =
        itemToEdit && type === 'bill'
          ? { ...(itemToEdit as Bill), ...getFormData() }
          : itemToEdit && type === 'invoice'
            ? { ...(itemToEdit as Invoice), ...getFormData() }
            : getFormData();
      onDuplicate(payload);
    }
  };

  /* Updated to use state.vendors for bills */
  const { contactLabel, filteredContacts, fixedContactTypeForNew } = useMemo(() => {
    // If it's a bill, we should look at vendors.
    if (type === 'bill') {
      const vendorList = (state.vendors || []).filter(v => v.isActive !== false || v.id === (vendorId || contactId));
      return {
        contactLabel: 'Vendor / Supplier',
        filteredContacts: vendorList,
        fixedContactTypeForNew: ContactType.VENDOR
      };
    }
    const tenantList = state.contacts.filter(c => c.type === ContactType.TENANT && (c.isActive !== false || c.id === contactId));
    if (invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT) return { contactLabel: 'Tenant', filteredContacts: tenantList, fixedContactTypeForNew: ContactType.TENANT };
    const owners = state.contacts.filter(c => (c.type === ContactType.CLIENT || c.type === ContactType.OWNER) && (c.isActive !== false || c.id === contactId));
    return { contactLabel: 'Owner', filteredContacts: owners, fixedContactTypeForNew: ContactType.OWNER };
  }, [type, invoiceType, state.contacts, state.vendors, contactId, vendorId]);

  const agreementItems = useMemo(() => tenantAgreements.map(a => ({ id: a.id, name: `${a.agreementNumber} - ${state.properties.find(p => p.id === a.propertyId)?.name}` })), [tenantAgreements, state.properties]);

  // For tenant bill allocation: filter agreements to current building only
  const tenantBillAgreementItems = useMemo(() => {
    if (billAllocationType !== 'tenant' || !buildingId) return agreementItems;
    const buildingPropertyIds = new Set(state.properties.filter(p => p.buildingId === buildingId).map(p => p.id));
    return agreementItems.filter(a => {
      const ra = state.rentalAgreements.find(r => r.id === a.id);
      return ra && buildingPropertyIds.has(ra.propertyId);
    });
  }, [agreementItems, billAllocationType, buildingId, state.properties, state.rentalAgreements]);

  const handleContactSelect = (item: { id: string; name: string } | null, newName?: string) => {
    if (newName) { setNewItemName(newName); setIsContactModalOpen(true); }
    else {
      if (type === 'bill') {
        setVendorId(item?.id || '');
      } else {
        setContactId(item?.id || '');
        if (invoiceType === InvoiceType.RENTAL) setAgreementId('');
      }
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
      name: `${p.name} (${state.contacts.find(c => c.id === p.ownerId)?.name || 'Owner'})`
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


  const isRentalLayout = invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT;

  const renderRentalInvoiceForm = () => {
    const property = state.properties.find(p => p.id === propertyId);
    const building = property ? state.buildings.find(b => b.id === property.buildingId) : null;
    const showDetails = itemToEdit || initialData || agreementId;
    const showSecurityDeposit = !itemToEdit || parseFloat(securityDepositCharge) > 0 || !isLocked;

    const tenantName = state.contacts.find(c => c.id === contactId)?.name || '';
    const agreementLabel = agreementItems.find(a => a.id === agreementId)?.name || '';
    const rentVal = parseFloat(rentAmount) || 0;
    const secVal = parseFloat(securityDepositCharge) || 0;

    return (
      <div className="space-y-5">
        {/* Header: breadcrumb + invoice number + editing badge */}
        <div>
          <p className="text-xs text-slate-400 mb-1">
            Financials &gt; Invoices
          </p>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              {itemToEdit ? 'Edit Invoice' : 'New Invoice'}
              {number && <span className="text-slate-400 font-semibold">#{number}</span>}
            </h2>
            {itemToEdit && !isLocalOnlyMode() && recordLock.bannerMode === 'self' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Editing by you ({state.currentUser?.name || 'You'})
              </span>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* LEFT COLUMN — 3/5 width */}
          <div className="lg:col-span-3 space-y-5">
            {/* Invoice Details Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Invoice Details</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <DatePicker
                  label="Date"
                  value={issueDate}
                  onChange={handleIssueDateChange}
                  required
                  disabled={isAgreementCancelled}
                />
                <DatePicker
                  label="Due Date"
                  value={dueDate}
                  onChange={d => setDueDate(fromPickerDateToYyyyMmDd(d))}
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
                <ComboBox
                  label="Agreement"
                  items={agreementItems}
                  selectedId={agreementId}
                  onSelect={(item) => setAgreementId(item?.id || '')}
                  placeholder="Search agreements..."
                  required
                  disabled={!contactId || !!itemToEdit || isAgreementCancelled}
                  allowAddNew={false}
                />
                <Input label="Property" value={property?.name || ''} disabled />
                <Input label="Building" value={building?.name || ''} disabled />
              </div>
            </div>

            {/* Financial Particulars Card */}
            {showDetails ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Financial Particulars</h3>

                {!itemToEdit && (
                  <div className="flex gap-3 items-end bg-yellow-50 p-3 rounded-lg border border-yellow-100 mb-4">
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
                          const d = parseYyyyMmDdToLocalDate(issueDate);
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <Input
                    label={`Rent Amount (${CURRENCY})`}
                    type="text"
                    inputMode="decimal"
                    value={rentAmount}
                    onChange={e => setRentAmount(e.target.value)}
                    required
                    disabled={isAgreementCancelled}
                  />
                  {showSecurityDeposit && (
                    <Input
                      label="Security Deposit (Optional)"
                      type="text"
                      inputMode="decimal"
                      value={securityDepositCharge}
                      onChange={e => setSecurityDepositCharge(e.target.value)}
                      placeholder="Enter amount"
                      readOnly={isLocked || isAgreementCancelled}
                    />
                  )}
                </div>

                <div className="mt-4">
                  <Input
                    label="Description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    disabled={isAgreementCancelled}
                  />
                </div>

                {/* Invoice Number (hidden in reference but needed) */}
                <div className="mt-3">
                  <Input label="Invoice Number" value={number} onChange={e => setNumber(e.target.value)} required disabled={isAgreementCancelled} />
                  {numberError && <p className="text-danger text-xs mt-1">{numberError}</p>}
                </div>

{/* Recurring invoice option removed — recurring auto-generation is disabled */}
              </div>
            ) : (
              <div className="text-center p-8 text-slate-500 border-2 border-dashed rounded-xl bg-white">
                <p>Select a tenant and an agreement to populate invoice details.</p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — 2/5 width */}
          <div className="lg:col-span-2 space-y-4">
            {/* Total Amount Card */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200 mb-1">Total Amount</p>
              <p className="text-3xl font-bold mb-3">
                {CURRENCY} <span className="tabular-nums">{calculatedAmount.toLocaleString()}</span>
              </p>
              <div className="border-t border-blue-500/40 pt-3 space-y-1.5">
                {rentVal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-200">Monthly Rent</span>
                    <span className="font-semibold tabular-nums">{rentVal.toLocaleString()}</span>
                  </div>
                )}
                {preservedServiceCharges > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-200">Maintenance</span>
                    <span className="font-semibold tabular-nums">{preservedServiceCharges.toLocaleString()}</span>
                  </div>
                )}
                {secVal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-200">Security Deposit</span>
                    <span className="font-semibold tabular-nums">{secVal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                type="submit"
                disabled={!!numberError || isAgreementCancelled || (type === 'invoice' && Boolean(itemToEdit) && recordLock.viewOnly)}
                className="w-full text-sm py-2.5 bg-blue-600 hover:bg-blue-700"
              >
                {itemToEdit ? 'Update Invoice' : 'Save Invoice'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="w-full text-sm py-2.5 border-slate-300"
              >
                Cancel Changes
              </Button>
            </div>

            {/* Secondary Actions */}
            {itemToEdit && (
              <div className="flex flex-col items-center gap-2 pt-1">
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={handleDuplicateClick}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Duplicate Invoice
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isAgreementCancelled || (type === 'invoice' && recordLock.viewOnly)}
                  className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete Invoice
                </button>
              </div>
            )}

            {/* Audit Notice */}
            {itemToEdit && tenantName && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-800 mb-0.5">Audit Notice</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Updates will be logged in the activity trail. Notifications will be sent to <span className="font-semibold text-blue-600">{tenantName}</span> upon confirmation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderRentalBillForm = () => {
    return (
      <div className="space-y-4">
        {/* ROW 1: Vendor, Bill #, Issue Date, Due Date — 2x2 grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Vendor / Supplier</label>
            {isPartiallyPaid ? (
              <div>
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800">
                  {(state.vendors || []).find(v => v.id === vendorId)?.name || state.contacts.find(c => c.id === contactId)?.name || '—'}
                </div>
                <p className="text-[10px] text-amber-600 mt-1">Cannot change vendor while payments exist.</p>
              </div>
            ) : (
              <ComboBox
                items={filteredContacts}
                selectedId={vendorId || contactId}
                onSelect={handleContactSelect}
                placeholder="Select vendor..."
                required
                disabled={isAgreementCancelled}
                entityType="vendor"
                onAddNew={(_entityType, name) => { setNewItemName(name || ''); setIsContactModalOpen(true); }}
              />
            )}
          </div>

          <div className="flex flex-col">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Bill #</label>
            <Input value={number} onChange={e => setNumber(e.target.value)} required disabled={isAgreementCancelled} />
            {numberError && <p className="text-danger text-[10px] mt-1">{numberError}</p>}
          </div>

          <div className="flex flex-col">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Issue Date</label>
            <DatePicker value={issueDate} onChange={handleIssueDateChange} required disabled={isAgreementCancelled} />
          </div>

          <div className="flex flex-col">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Due Date</label>
            <DatePicker value={dueDate} onChange={d => setDueDate(fromPickerDateToYyyyMmDd(d))} required disabled={isAgreementCancelled} />
          </div>
        </div>

        {/* ROW 2: Cost Allocation | Description + Document side-by-side */}
        <div className="grid grid-cols-2 gap-3">
          {/* Cost Allocation Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs w-4 h-4">{ICONS.building || '🏢'}</span>
              <h3 className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Cost Allocation</h3>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Building</label>
                <ComboBox
                  items={state.buildings}
                  selectedId={buildingId || ''}
                  onSelect={(item) => { setBuildingId(item?.id || ''); setPropertyId(''); setTenantId(''); }}
                  placeholder="Search buildings..."
                  entityType="building"
                  onAddNew={(_entityType, name) => {
                    entityFormModal.openForm('building', name, undefined, undefined, (newId) => {
                      setBuildingId(newId); setPropertyId(''); setTenantId('');
                    });
                  }}
                />
              </div>

              {buildingId && (
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Expense Bearer</label>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => { setBillAllocationType('building'); setPropertyId(''); setAgreementId(''); setTenantId(''); }}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition-all ${billAllocationType === 'building' ? 'bg-slate-800 border-slate-800 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      Building
                    </button>
                    <button type="button" onClick={() => { setBillAllocationType('owner'); setAgreementId(''); setTenantId(''); }}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition-all ${billAllocationType === 'owner' ? 'bg-slate-800 border-slate-800 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      Owner
                    </button>
                    <button type="button" onClick={() => { setBillAllocationType('tenant'); setPropertyId(''); }}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition-all ${billAllocationType === 'tenant' ? 'bg-slate-800 border-slate-800 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      Tenant
                    </button>
                  </div>
                </div>
              )}

              {buildingId && billAllocationType === 'owner' && (
                <div className="animate-fade-in">
                  <ComboBox label="Property" items={propertyItems} selectedId={propertyId || ''} onSelect={(item) => setPropertyId(item?.id || '')} placeholder="Search properties..." allowAddNew={false} />
                </div>
              )}

              {buildingId && billAllocationType === 'tenant' && (
                <div className="animate-fade-in space-y-2">
                  <ComboBox label="Tenant" items={filteredTenants} selectedId={tenantId || ''} onSelect={handleTenantSelect} placeholder="Search tenants..." allowAddNew={false} />
                  {tenantId && <ComboBox label="Agreement" items={tenantBillAgreementItems} selectedId={agreementId || ''} onSelect={(item) => { setAgreementId(item?.id || ''); const ra = state.rentalAgreements.find(r => r.id === item?.id); if (ra) setPropertyId(ra.propertyId); }} placeholder="Select agreement..." allowAddNew={false} />}
                </div>
              )}
            </div>
          </div>

          {/* Description + Document stacked */}
          <div className="flex flex-col gap-3">
            {/* Description */}
            <div className="flex flex-col">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={isAgreementCancelled}
                placeholder="Enter bill description..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-colors disabled:opacity-50 disabled:bg-gray-50"
              />
            </div>

            {/* Bill Document Upload */}
            <div className="flex flex-col flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Bill Document</label>
              {(documentId || (documentPath && !documentFile)) ? (
                <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <div className="w-4 h-4 text-indigo-600">{ICONS.fileText}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {documentId ? (state.documents?.find(d => d.id === documentId)?.fileName || 'Document') : documentPath.split('/').pop()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button type="button" onClick={async () => {
                      if (documentId) {
                        await openDocumentById(documentId, state.documents, url => window.open(url, '_blank'), showAlert);
                      } else if (documentPath && (window as any).electronAPI?.openDocumentFile) {
                        try { const result = await (window as any).electronAPI.openDocumentFile({ filePath: documentPath }); if (!result?.success) await showAlert(`Failed to open: ${result?.error || 'Unknown'}`); } catch (error) { await showAlert(error instanceof Error ? error.message : 'Error opening document'); }
                      } else { await showAlert('File system access not available'); }
                    }} className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors">Open</button>
                    <button type="button" onClick={() => { setDocumentPath(''); setDocumentId(''); setDocumentFile(null); }} className="text-[10px] font-medium text-rose-500 hover:text-rose-700 transition-colors">Remove</button>
                  </div>
                </div>
              ) : (
                <label className="flex-1 cursor-pointer">
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setDocumentFile(file); setDocumentPath(''); setDocumentId(''); } }} className="hidden" disabled={isAgreementCancelled} />
                  <div className={`h-full border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 py-4 hover:border-slate-400 hover:bg-slate-50 transition-all ${isAgreementCancelled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {documentFile ? (
                      <>
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <p className="text-xs font-medium text-gray-800 truncate max-w-[140px]">{documentFile.name}</p>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocumentFile(null); }} className="text-[10px] text-rose-500 hover:text-rose-700 font-medium ml-1">Clear</button>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500">Click to upload document</p>
                          <p className="text-[10px] text-gray-400">PDF, JPG, PNG (Max 5MB)</p>
                        </div>
                      </>
                    )}
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* ROW 3: Expense Categories Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Expense Categories</h3>
            <div className="w-40">
              <ComboBox
                items={availableCategories}
                selectedId=""
                onSelect={handleAddExpenseCategory}
                placeholder="⊕ Add Row"
                disabled={isAgreementCancelled}
                entityType="category"
                onAddNew={(_entityType, name) => {
                  entityFormModal.openForm('category', name, undefined, TransactionType.EXPENSE, (newId) => {
                    handleAddExpenseCategory({ id: newId, name });
                  });
                }}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Unit</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-16">Qty</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Price</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-28">Net</th>
                  <th className="px-1 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenseCategoryItems.length > 0 ? (
                  expenseCategoryItems.map((item) => {
                    const category = expenseCategories.find(c => c.id === item.categoryId);
                    return (
                      <tr key={item.id} className="group hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-800 text-xs">{category?.name || 'Unknown'}</span>
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={item.unit}
                            onChange={(e) => updateExpenseCategoryItem(item.id, { unit: e.target.value as ContractExpenseCategoryItem['unit'] })}
                            className="text-xs border-gray-200 rounded-lg h-8 w-full bg-gray-50"
                            disabled={isAgreementCancelled}
                            hideIcon={false}
                          >
                            <option value="Cubic Feet">Cubic Feet</option>
                            <option value="Square feet">Sq. feet</option>
                            <option value="feet">feet</option>
                            <option value="quantity">quantity</option>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity?.toString() || ''}
                            onChange={(e) => { updateExpenseCategoryItem(item.id, { quantity: parseFloat(e.target.value) || 0 }); }}
                            className="w-full text-center text-xs h-8 bg-gray-50 rounded-lg"
                            disabled={isAgreementCancelled}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.pricePerUnit.toString() || ''}
                            onChange={(e) => { updateExpenseCategoryItem(item.id, { pricePerUnit: parseFloat(e.target.value) || 0 }); }}
                            className="w-full text-right text-xs h-8 bg-gray-50 rounded-lg"
                            disabled={isAgreementCancelled}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.netValue?.toString() || '0'}
                            onChange={(e) => { updateExpenseCategoryItem(item.id, { netValue: parseFloat(e.target.value) || 0 }, true); }}
                            className="w-full text-right font-semibold text-xs h-8 bg-gray-50 rounded-lg"
                            disabled={isAgreementCancelled}
                          />
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button type="button" onClick={() => handleRemoveExpenseCategoryItem(item.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500 transition-all p-1 rounded-md hover:bg-rose-50" title="Remove" disabled={isAgreementCancelled}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center">
                      <p className="text-xs text-gray-400">No expense categories added yet.</p>
                      <p className="text-[10px] text-gray-300 mt-1">Use "Add Row" above to add categories.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Total Amount Footer */}
            <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between rounded-b-xl">
              <span className="text-xs font-semibold tracking-wide">Total Amount</span>
              <span className="text-sm font-bold tabular-nums">
                {CURRENCY} {totalAmountFromItems.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStandardForm = () => {
    if (type === 'bill' && rentalContext) {
      return renderRentalBillForm();
    }

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
                <Input label={contactLabel} value={state.contacts.find(c => c.id === contactId)?.name || ''} disabled />
                <p className="text-xs text-amber-600 mt-1">Supplier cannot be changed. Please delete all payments first to edit the supplier.</p>
              </div>
            ) : (
              <ComboBox
                label={contactLabel}
                items={filteredContacts}
                selectedId={type === 'bill' ? (vendorId || contactId) : contactId}
                onSelect={handleContactSelect}
                placeholder={type === 'bill' ? 'Select vendor or type to add...' : `Select ${contactLabel}...`}
                required
                disabled={isContactLockedByUnit || !!agreementForInvoice || isAgreementCancelled}
                entityType={type === 'bill' ? 'vendor' : 'contact'}
                onAddNew={(entityType, name) => {
                  if (type === 'bill' || entityType === 'vendor') {
                    setNewItemName(name || '');
                    setIsContactModalOpen(true);
                  } else {
                    entityFormModal.openForm('contact', name, fixedContactTypeForNew, undefined, (newId) => {
                      setContactId(newId);
                    });
                  }
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
                onChange={d => setDueDate(fromPickerDateToYyyyMmDd(d))}
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
            {(vendorId || contactId) && (
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
                        if ((projectId || contract.projectId) && projectId !== contract.projectId) {
                          showAlert('This contract belongs to a different project. A bill can only be linked to a contract with the same project.');
                          return;
                        }
                        setContractId(selectedContractId);
                        if (contract.projectId && !projectId) {
                          setProjectId(contract.projectId);
                        }
                        applyContractExpenseCategoriesToBill(contract);
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
                  {(vendorId || contactId) && (
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
                              if ((projectId || contract.projectId) && projectId !== contract.projectId) {
                                showAlert('This contract belongs to a different project. A bill can only be linked to a contract with the same project.');
                                return;
                              }
                              setContractId(selectedContractId);
                              if (contract.projectId && !projectId) {
                                setProjectId(contract.projectId);
                              }
                              applyContractExpenseCategoriesToBill(contract);
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
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Expense Bearer</label>
                        <div className="flex gap-2 flex-wrap">
                          <button type="button" onClick={() => { setBillAllocationType('building'); setPropertyId(''); setAgreementId(''); setTenantId(''); }} className={`flex-1 min-w-[80px] px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${billAllocationType === 'building' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`} title="Deduct from building management funds">Building</button>
                          <button type="button" onClick={() => { setBillAllocationType('owner'); setAgreementId(''); setTenantId(''); }} className={`flex-1 min-w-[80px] px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${billAllocationType === 'owner' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`} title="Deduct from owner income">Owner</button>
                          <button type="button" onClick={() => { setBillAllocationType('tenant'); setPropertyId(''); }} className={`flex-1 min-w-[80px] px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${billAllocationType === 'tenant' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`} title="Deduct from tenant security deposit">Tenant</button>
                        </div>
                      </div>

                      {billAllocationType === 'owner' && (
                        <div className="animate-fade-in">
                          <ComboBox label="Property" items={propertyItems} selectedId={propertyId || ''} onSelect={(item) => setPropertyId(item?.id || '')} placeholder="Search properties..." allowAddNew={false} />
                        </div>
                      )}

                      {billAllocationType === 'tenant' && (
                        <div className="animate-fade-in space-y-2">
                          <ComboBox label="Tenant" items={filteredTenants} selectedId={tenantId || ''} onSelect={handleTenantSelect} placeholder="Search tenants..." allowAddNew={false} />
                          {tenantId && <ComboBox label="Agreement" items={tenantBillAgreementItems} selectedId={agreementId || ''} onSelect={(item) => { setAgreementId(item?.id || ''); const ra = state.rentalAgreements.find(r => r.id === item?.id); if (ra) setPropertyId(ra.propertyId); }} placeholder="Select agreement..." allowAddNew={false} />}
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
                    <div className="w-4 h-4 text-indigo-600">{ICONS.fileText}</div>
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
    )
  };

  return (
    <>
      <RecordLockConflictModal
        isOpen={recordLock.showConflictModal}
        lockedByName={recordLock.lockedByName ?? 'Another user'}
        isAdmin={isAdminRole(state.currentUser?.role)}
        onViewOnly={recordLock.chooseViewOnly}
        onForceEdit={handleForceInvoiceLock}
        onDismiss={recordLock.dismissModal}
      />
      <form onSubmit={handleSubmit} className="flex flex-col h-full" style={formStyle}>
        {type === 'invoice' && itemToEdit?.id && !isLocalOnlyMode() && recordLock.bannerMode === 'self' && !isRentalLayout && (
          <RecordLockBanner mode="self" currentUserName={state.currentUser?.name} />
        )}
        {type === 'invoice' && itemToEdit?.id && !isLocalOnlyMode() && recordLock.bannerMode === 'other' && (
          <RecordLockBanner mode="other" otherEditorName={recordLock.lockedByName} />
        )}
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
        <div
          className={`flex-grow min-h-0 overflow-y-auto pr-1 -mr-1 ${
            type === 'invoice' && recordLock.viewOnly ? 'pointer-events-none opacity-[0.88]' : ''
          }`}
        >
          <div className="space-y-3">
            {(invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT) ? renderRentalInvoiceForm()
              : renderStandardForm()}
          </div>
        </div>

        {/* Shared footer — hidden for rental layout (buttons are in right column) */}
        {!isRentalLayout && (
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-3 border-t border-gray-200 mt-3 flex-shrink-0 pointer-events-auto">
            <div className="flex flex-wrap gap-2">
              {itemToEdit && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleDelete}
                  disabled={isAgreementCancelled || (type === 'invoice' && recordLock.viewOnly)}
                  className="w-full sm:w-auto text-sm py-2"
                >
                  Delete
                </Button>
              )}
              {itemToEdit && onDuplicate && (
                <Button type="button" variant="secondary" onClick={handleDuplicateClick} className="text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 w-full sm:w-auto text-sm py-2">
                  {type === 'invoice' ? 'Duplicate Invoice' : 'Duplicate Bill'}
                </Button>
              )}
              {type === 'bill' && billPrintData && (
                <Button type="button" variant="secondary" onClick={() => triggerPrint('BILL', billPrintData)} className="w-full sm:w-auto text-sm py-2 flex items-center gap-1">
                  {ICONS.print && <span className="w-4 h-4 inline-block [&>svg]:w-full [&>svg]:h-full">{ICONS.print}</span>}
                  Print
                </Button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
              <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto text-sm py-2">Cancel</Button>
              <Button
                type="submit"
                disabled={!!numberError || isAgreementCancelled || (type === 'invoice' && Boolean(itemToEdit) && recordLock.viewOnly)}
                className="w-full sm:w-auto text-sm py-2"
              >
                {itemToEdit ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </form>
      <Modal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} title={`Add New ${contactLabel}`}>
        <ContactForm
          onSubmit={handleContactSubmit}
          onCancel={() => setIsContactModalOpen(false)}
          existingContacts={state.contacts}
          existingVendors={state.vendors}
          isVendorForm={type === 'bill'}
          fixedTypeForNew={fixedContactTypeForNew}
          initialName={newItemName}
        />
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
