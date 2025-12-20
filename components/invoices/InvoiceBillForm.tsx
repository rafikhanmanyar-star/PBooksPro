
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { Invoice, Bill, InvoiceStatus, Contact, Property, InvoiceType, ContactType, RentalAgreement, Project, TransactionType, Category, Unit, ProjectAgreement, Building, RecurringInvoiceTemplate, ProjectAgreementStatus, ContractStatus } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { CURRENCY, ICONS } from '../../constants';
import ContactForm from '../settings/ContactForm';
import ComboBox from '../ui/ComboBox';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';

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
}

type BillAllocationType = 'project' | 'building' | 'owner' | 'tenant' | 'staff';
type RootBillType = 'project' | 'building' | 'staff';

const InvoiceBillForm: React.FC<InvoiceBillFormProps> = ({ onClose, type, itemToEdit, invoiceTypeForNew, agreementForInvoice, initialContactId, rentalContext, onDuplicate, initialData }) => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert, showConfirm } = useNotification();
  const { rentalInvoiceSettings, projectInvoiceSettings } = state;
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Merge itemToEdit with initialData for defaults (initialData used when duplicating)
  const defaults = itemToEdit || initialData || {};

  const invoiceType = itemToEdit ? (itemToEdit as Invoice).invoiceType : invoiceTypeForNew;

  // --- Initialization Logic ---
  const getInitialRootType = (): RootBillType => {
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

  const getInitialAllocationType = (): BillAllocationType => {
      if (type === 'bill' && defaults) {
          const bill = defaults as Bill;
          if (bill.staffId) return 'staff';
          if (bill.projectAgreementId) return 'tenant'; // Assuming projectAgreementId can be used to track tenant context too if needed, but usually RentalAgreement
          if (bill.propertyId) return 'owner';
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
          if (inv.invoiceNumber.startsWith(prefix)) {
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
          if (b.billNumber.startsWith(prefix)) {
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
          setNumber(type === 'invoice' ? (itemToEdit as Invoice).invoiceNumber : (itemToEdit as Bill).billNumber);
      } else {
          // New Record or Duplicate
          if (type === 'invoice') {
              setNumber(generateNextInvoiceNumber());
          } else {
              setNumber(generateNextBillNumber());
          }
      }
  }, [itemToEdit, type, invoiceType, rentalInvoiceSettings, projectInvoiceSettings, state.bills]);


  const [numberError, setNumberError] = useState('');
  const [contactId, setContactId] = useState(defaults.contactId || agreementForInvoice?.clientId || initialContactId || '');
  const [propertyId, setPropertyId] = useState(defaults.propertyId || '');
  const [projectId, setProjectId] = useState((defaults && 'projectId' in defaults ? defaults.projectId : '') || agreementForInvoice?.projectId || '');
  
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
  const [issueDate, setIssueDate] = useState(defaults.issueDate ? (defaults.issueDate as string).split('T')[0] : new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(defaults && 'dueDate' in defaults && defaults.dueDate ? (defaults.dueDate as string).split('T')[0] : '');
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
  
  const { amountAlreadyInvoiced, agreementBalance } = useMemo(() => {
    if (!agreementForInvoice) return { amountAlreadyInvoiced: 0, agreementBalance: 0 };
    const alreadyInvoiced = state.invoices.filter(inv => inv.agreementId === agreementForInvoice.id).reduce((sum, inv) => sum + inv.amount, 0);
    return { amountAlreadyInvoiced: alreadyInvoiced, agreementBalance: agreementForInvoice.sellingPrice - alreadyInvoiced };
  }, [agreementForInvoice, state.invoices]);

  const formStyle = useMemo(() => {
      if (!state.enableColorCoding) return {};

      let color = null;
      if (projectId) {
          const p = state.projects.find(proj => proj.id === projectId);
          if (p?.color) color = p.color;
      }
      if (!color && buildingId) {
          const b = state.buildings.find(bd => bd.id === buildingId);
          if (b?.color) color = b.color;
      }

      if (color) {
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          return { 
              background: `linear-gradient(0deg, rgba(${r}, ${g}, ${b}, 0.12), rgba(${r}, ${g}, ${b}, 0.12)), #ffffff`,
              padding: '1rem', 
              borderRadius: '0.75rem' 
          };
      }
      return {};
  }, [projectId, buildingId, state.projects, state.buildings, state.enableColorCoding]);

  // Mark dirty on changes
  useEffect(() => {
      setIsDirty(true);
  }, [number, contactId, propertyId, projectId, buildingId, staffId, unitId, categoryId, issueDate, dueDate, description, amount, rentAmount, securityDepositCharge, contractId]);
  
  // Reset dirty state initially after mount
  useEffect(() => {
      setIsDirty(false);
  }, []);

  // Validate contractId when vendor or project changes
  useEffect(() => {
      if (contractId && contactId && type === 'bill') {
          const contract = state.contracts.find(c => c.id === contractId);
          // If contract exists but vendor doesn't match, clear the contract link
          if (contract && contract.vendorId !== contactId) {
              setContractId('');
          }
      }
  }, [contactId, contractId, state.contracts, type]);

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
    if (invoiceType === InvoiceType.INSTALLMENT && !categoryId && !defaults.id) {
        const defaultCat = state.categories.find(c => c.name === 'Unit Selling Income' && c.type === TransactionType.INCOME);
        if (defaultCat) setCategoryId(defaultCat.id);
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
    if (!number.trim()) {
      return;
    }
    
    let isDuplicate = false;
    if (type === 'invoice') {
      isDuplicate = state.invoices.some(
        inv => inv.invoiceNumber.trim().toLowerCase() === number.trim().toLowerCase() && inv.id !== itemToEdit?.id
      );
    } else { 
      isDuplicate = state.bills.some(
        bill => bill.billNumber.trim().toLowerCase() === number.trim().toLowerCase() && bill.id !== itemToEdit?.id
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
      
      // Filter contracts for the same vendor (Active only, unless editing an existing bill with that contract)
      // If projectId is set, prioritize contracts from that project but also show others from the same vendor
      const vendorContracts = (state.contracts || []).filter(c => 
          c.vendorId === contactId && 
          (c.status === ContractStatus.ACTIVE || c.id === contractId)
      );
      
      // Sort: contracts from the selected project first, then others
      const sorted = vendorContracts.sort((a, b) => {
          if (projectId) {
              if (a.projectId === projectId && b.projectId !== projectId) return -1;
              if (a.projectId !== projectId && b.projectId === projectId) return 1;
          }
          return 0;
      });
      
      return sorted.map(c => {
          const project = state.projects.find(p => p.id === c.projectId);
          const projectName = project ? ` (${project.name})` : '';
          return { id: c.id, name: `${c.contractNumber} - ${c.name}${projectName}` };
      });
  }, [state.contracts, state.projects, type, billAllocationType, projectId, contactId, contractId]);

  const incomeCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.INCOME), [state.categories]);
  const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);

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
    return state.rentalAgreements.filter(ra => ra.tenantId === targetId);
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
              if (ra.tenantId !== item.id || ra.status !== 'Active') return false;
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
      // Auto-populate context based on staff assignment
      if (selectedId) {
          const staffMember = [...state.projectStaff, ...state.rentalStaff].find(s => s.id === selectedId);
          if (staffMember) {
              if (staffMember.projectId) {
                  setProjectId(staffMember.projectId);
                  setBuildingId('');
                  setRootAllocationType('project'); // Might flip root visually if auto-assigned to project
              } else if (staffMember.buildingId) {
                  setBuildingId(staffMember.buildingId);
                  setProjectId('');
                  setRootAllocationType('building');
              }
          }
      }
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
     const finalAmount = invoiceType === InvoiceType.RENTAL ? calculatedAmount : parseFloat(amount);
     return {
        contactId, 
        propertyId: propertyId || undefined, 
        projectId: projectId || undefined, 
        amount: finalAmount, 
        issueDate, 
        description,
        invoiceNumber: number, 
        billNumber: number,
        dueDate, 
        invoiceType: invoiceType!,
        buildingId: buildingId || undefined,
        categoryId: categoryId || undefined,
        agreementId: agreementId || undefined, 
        securityDepositCharge: parseFloat(securityDepositCharge) || undefined, 
        unitId: unitId || undefined,
        serviceCharges: undefined,
        staffId: staffId || undefined,
        contractId: contractId || undefined,
        rentalMonth: (invoiceType === InvoiceType.RENTAL) ? new Date(issueDate).toISOString().slice(0, 7) : undefined,
     };
  };

  const handleSubmit = async (e: React.FormEvent, skipClose = false) => {
    if (e) e.preventDefault();
    
    if (!number.trim()) {
        await showAlert(`${type === 'invoice' ? 'Invoice' : 'Bill'} number is required.`);
        return;
    }
    
    // Check if category is mandatory for Bills
    if (type === 'bill' && !categoryId) {
        await showAlert('Expense Category is required for Bills.');
        return;
    }

    // Explicit Duplicate Check
    let isDuplicate = false;
    if (type === 'invoice') {
      isDuplicate = state.invoices.some(
        inv => inv.invoiceNumber.trim().toLowerCase() === number.trim().toLowerCase() && inv.id !== itemToEdit?.id
      );
    } else { 
      isDuplicate = state.bills.some(
        bill => bill.billNumber.trim().toLowerCase() === number.trim().toLowerCase() && bill.id !== itemToEdit?.id
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
    
    const finalAmount = invoiceType === InvoiceType.RENTAL ? calculatedAmount : parseFloat(amount);
    
    if (isPartiallyPaid && finalAmount < itemToEdit!.paidAmount) {
        await showAlert(`Cannot reduce amount below the already paid amount of ${CURRENCY} ${itemToEdit!.paidAmount.toLocaleString()}.`, { title: 'Invalid Amount' });
        return;
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
            const updatedBill: Bill = { 
                ...(itemToEdit as Bill), 
                ...formData, 
                projectAgreementId: agreementId || undefined
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
                if (number.startsWith(projectInvoiceSettings.prefix)) {
                     const numPart = parseInt(number.substring(projectInvoiceSettings.prefix.length));
                     if (!isNaN(numPart) && numPart >= projectInvoiceSettings.nextNumber) {
                         settingsToUpdate = { ...projectInvoiceSettings, nextNumber: numPart + 1 };
                         updateType = 'UPDATE_PROJECT_INVOICE_SETTINGS';
                     }
                }
            } else {
                if (number.startsWith(rentalInvoiceSettings.prefix)) {
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
                projectAgreementId: agreementId || undefined
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
      const relevantTenantIds = new Set(state.rentalAgreements.filter(ra => relevantPropertyIds.has(ra.propertyId)).map(ra => ra.tenantId));
      
      return state.contacts.filter(c => c.type === ContactType.TENANT && relevantTenantIds.has(c.id));
  }, [state.contacts, state.properties, state.rentalAgreements, buildingId]);

  const staffList = useMemo(() => {
      const allStaff = [...state.projectStaff, ...state.rentalStaff];
      const uniqueStaff = Array.from(new Map(allStaff.map(s => [s.id, s])).values());
      return uniqueStaff.map(s => ({ id: s.id, name: state.contacts.find(c=>c.id===s.id)?.name || 'Unknown' }));
  }, [state.projectStaff, state.rentalStaff, state.contacts]);


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
                onChange={d => setIssueDate(d.toISOString().split('T')[0])} 
                required 
                disabled={isAgreementCancelled} 
            />
            <ComboBox label="Tenant" items={filteredContacts} selectedId={contactId} onSelect={handleContactSelect} placeholder="Search or add tenant..." required disabled={!!itemToEdit || isAgreementCancelled} />
            <ComboBox label="Agreement" items={agreementItems} selectedId={agreementId} onSelect={(item) => setAgreementId(item?.id || '')} placeholder="Search agreements..." required disabled={!contactId || !!itemToEdit || isAgreementCancelled} allowAddNew={false} />
            
            {showDetails ? (
                <div className="space-y-4 p-4 bg-white/60 rounded-lg border border-slate-200">
                     {!itemToEdit && (
                        <div className="flex gap-4 items-end bg-yellow-50 p-2 rounded border border-yellow-100">
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
     <div className="space-y-6">
      {agreementForInvoice && (
        <div className="p-3 bg-slate-50 rounded-lg border text-sm space-y-1">
            <h4 className="font-semibold text-slate-800">From Agreement #{agreementForInvoice.agreementNumber}</h4>
            <div className="flex justify-between"><span>Selling Price:</span> <span>{CURRENCY} {agreementForInvoice.sellingPrice.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Already Invoiced:</span> <span>{CURRENCY} {amountAlreadyInvoiced.toLocaleString()}</span></div>
            <div className="flex justify-between font-bold"><span>Remaining to Invoice:</span> <span>{CURRENCY} {agreementBalance.toLocaleString()}</span></div>
        </div>
      )}

      {/* Header Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <Input label={type === 'invoice' ? 'Invoice Number' : 'Bill Number'} value={number} onChange={e => setNumber(e.target.value)} required disabled={isAgreementCancelled} />
            {numberError && <p className="text-danger text-xs mt-1">{numberError}</p>}
          </div>
          
          <div className="md:col-span-1">
             <DatePicker 
                label="Issue Date" 
                value={issueDate} 
                onChange={d => setIssueDate(d.toISOString().split('T')[0])} 
                required 
                disabled={isAgreementCancelled} 
             />
          </div>

           <div className="md:col-span-1">
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
      
      {/* Amount & Contact Container */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                 <Input 
                    label="Amount" 
                    type="text" 
                    inputMode="decimal" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    required 
                    disabled={isAgreementCancelled} 
                    className="text-lg font-semibold"
                    placeholder="0.00"
                />
            </div>
            
            <div>
              {isPartiallyPaid && type === 'bill' ? (
                  <div className="mb-2">
                      <Input label={contactLabel} value={state.contacts.find(c=>c.id===contactId)?.name || ''} disabled />
                      <p className="text-xs text-amber-600 mt-1">Cannot change supplier on a paid bill.</p>
                  </div>
              ) : (
                  <ComboBox label={contactLabel} items={filteredContacts} selectedId={contactId} onSelect={handleContactSelect} placeholder={`Select ${contactLabel}...`} required disabled={isContactLockedByUnit || !!agreementForInvoice || isAgreementCancelled} />
              )}
           </div>
        </div>
      </div>
      
      {/* Bill Allocation Context Selector (Only for Bills) */}
      {type === 'bill' && (
          <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2">Cost Allocation</h3>
              
              {/* Root Source Toggle Tabs */}
              <div className="flex p-1 bg-slate-100 rounded-lg">
                  {!rentalContext && (
                    <button type="button" onClick={() => handleRootChange('project')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${rootAllocationType === 'project' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                        Project
                    </button>
                  )}
                  <button type="button" onClick={() => handleRootChange('building')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${rootAllocationType === 'building' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
                      Building / Property
                  </button>
                  {!rentalContext && (
                    <button type="button" onClick={() => handleRootChange('staff')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${rootAllocationType === 'staff' ? 'bg-white shadow text-slate-700' : 'text-slate-500 hover:text-slate-700'}`}>
                        Staff
                    </button>
                  )}
              </div>

              <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
                  {/* PROJECT FLOW */}
                  {rootAllocationType === 'project' && (
                      <div className="space-y-4 animate-fade-in">
                          <ComboBox label="Select Project" items={state.projects} selectedId={projectId || ''} onSelect={(item) => { setProjectId(item?.id || ''); setUnitId(''); }} placeholder="Search projects..." allowAddNew={false} />
                          
                          {/* Contract Linking - Show when vendor is selected, even if no contracts match */}
                          {contactId && (
                              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                                 <ComboBox
                                    label="Link to Contract (Optional)"
                                    items={availableContracts}
                                    selectedId={contractId}
                                    onSelect={item => setContractId(item?.id || '')}
                                    placeholder={availableContracts.length > 0 ? "Select contract..." : "No contracts available for this vendor"}
                                    allowAddNew={false}
                                 />
                                 {availableContracts.length > 0 ? (
                                     <p className="text-xs text-indigo-600 mt-1">This bill will be tracked against the contract budget. Showing contracts for the same vendor.</p>
                                 ) : (
                                     <p className="text-xs text-slate-500 mt-1">No active contracts found for this vendor. Create a contract first to link bills.</p>
                                 )}
                             </div>
                          )}
                      </div>
                  )}

                  {/* BUILDING FLOW */}
                  {rootAllocationType === 'building' && (
                      <div className="space-y-4 animate-fade-in">
                          <ComboBox label="Select Building" items={state.buildings} selectedId={buildingId || ''} onSelect={(item) => { setBuildingId(item?.id || ''); setPropertyId(''); setTenantId(''); }} placeholder="Search buildings..." allowAddNew={false} />
                          
                          {buildingId && (
                            <div className="space-y-3 pt-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase">Expense Type</label>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setBillAllocationType('building')} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${billAllocationType === 'building' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Building Service (Common)</button>
                                    <button type="button" onClick={() => setBillAllocationType('owner')} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${billAllocationType === 'owner' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Owner Unit Expense</button>
                                    <button type="button" onClick={() => setBillAllocationType('tenant')} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${billAllocationType === 'tenant' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Tenant Specific (Recharge)</button>
                                </div>

                                {billAllocationType === 'owner' && (
                                    <div className="animate-fade-in pt-2">
                                        <ComboBox label="Select Property (Owner Expense)" items={propertyItems} selectedId={propertyId || ''} onSelect={(item) => setPropertyId(item?.id || '')} placeholder="Search properties..." allowAddNew={false} />
                                    </div>
                                )}
                                
                                {billAllocationType === 'tenant' && (
                                    <div className="animate-fade-in pt-2">
                                        <ComboBox label="Select Tenant" items={filteredTenants} selectedId={tenantId || ''} onSelect={(item) => handleTenantSelect(item)} placeholder="Search tenants..." allowAddNew={false} />
                                    </div>
                                )}
                            </div>
                          )}
                      </div>
                  )}

                  {/* STAFF FLOW */}
                  {rootAllocationType === 'staff' && (
                      <div className="animate-fade-in">
                          <ComboBox 
                            label="Select Staff Member" 
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <ComboBox label="Project" items={state.projects} selectedId={projectId || ''} onSelect={(item, newName) => { if (newName) showAlert("Please create new projects from Settings."); else setProjectId(item?.id || ''); }} placeholder="Select a project..." disabled={!!agreementForInvoice || isAgreementCancelled} />
            {projectId && (<ComboBox label="Unit (Optional)" items={availableUnitsForProject} selectedId={unitId || ''} onSelect={(item) => setUnitId(item?.id || '')} placeholder="Select a unit" allowAddNew={false} disabled={!!agreementForInvoice || isAgreementCancelled} />)}
          </div>
      )}

      {/* Category and Description */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
                {(type === 'invoice' && invoiceType === InvoiceType.INSTALLMENT) || type === 'bill' ? (
                    <ComboBox 
                        label={type === 'bill' ? "Expense Category" : "Income Category"} 
                        items={type === 'bill' ? expenseCategories : incomeCategories} 
                        selectedId={categoryId || ''} 
                        onSelect={(item, newName) => { if (newName) showAlert("Please create new categories from Settings."); else setCategoryId(item?.id || ''); }} 
                        placeholder="Select category..." 
                        required={true}
                        disabled={isAgreementCancelled} 
                    />
                ) : null}
           </div>
           <div>
                <Input label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} disabled={isAgreementCancelled} placeholder="Add notes..." />
           </div>
      </div>
      
    </div>
  )};

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4" style={formStyle}>
      {isPartiallyPaid && (
          <div className="bg-amber-50 text-amber-800 p-3 rounded-md border border-amber-200 text-sm font-medium mb-4">
              This {type} has associated payments recorded. Editing critical details may affect your ledger consistency.
          </div>
      )}
      {isAgreementCancelled && (
          <div className="bg-red-50 text-red-800 p-3 rounded-md border border-red-200 text-sm font-medium mb-4">
              This invoice belongs to a cancelled agreement and cannot be updated.
          </div>
      )}
      {invoiceType === InvoiceType.RENTAL ? renderRentalInvoiceForm()
          : renderStandardForm()}
      
      <div className="flex justify-between pt-4 border-t border-slate-100 mt-6">
        <div className="flex gap-2">
            {itemToEdit && (
                <Button type="button" variant="danger" onClick={handleDelete} disabled={isAgreementCancelled}>
                    Delete
                </Button>
            )}
        </div>
        <div className="flex gap-2">
            {itemToEdit && type === 'bill' && onDuplicate && (
                <Button type="button" variant="secondary" onClick={handleDuplicateClick} className="text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100">
                    Duplicate Bill
                </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!!numberError || isAgreementCancelled}>{itemToEdit ? 'Update' : 'Save'}</Button>
        </div>
      </div>
    </form>
    <Modal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} title={`Add New ${contactLabel}`}>
        <ContactForm onSubmit={handleContactSubmit} onCancel={() => setIsContactModalOpen(false)} existingContacts={state.contacts} fixedTypeForNew={fixedContactTypeForNew} initialName={newItemName} />
    </Modal>
    </>
  );
};

export default InvoiceBillForm;
