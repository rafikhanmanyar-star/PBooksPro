/**
 * EmployeeProfile - View and manage employee details
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Briefcase, 
  UserCircle, 
  DollarSign, 
  TrendingUp,
  TrendingDown,
  FileText,
  PieChart,
  Plus,
  Trash2,
  Building2,
  AlertCircle,
  ChevronRight,
  Eye,
  ShieldCheck,
  Calendar,
  UserPlus,
  History,
  Edit3,
  Camera,
  Save,
  Mail,
  Phone,
  Award,
  CheckCircle2,
  Printer,
  Loader2,
  MessageCircle
} from 'lucide-react';
import { 
  PayrollEmployee, 
  EmploymentStatus, 
  ProjectAllocation, 
  BuildingAllocation,
  PayrollStatus, 
  PayrollRun, 
  Payslip,
  SalaryAdjustment, 
  PayrollProject,
  EmployeeProfileProps
} from './types';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';
import DatePicker from '../ui/DatePicker';
import { ActionModal } from './modals/ActionModals';
import { storageService } from './services/storageService';
import { payrollApi } from '../../services/api/payrollApi';
import PayslipModal from './modals/PayslipModal';
import AdjustmentModal from './modals/AdjustmentModal';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { usePrintContext } from '../../context/PrintContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { Contact, ContactType } from '../../types';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { mapAppProjectsToPayroll } from './utils/projectUtils';
import { formatDate, formatDateLong, formatCurrency, calculateAmount, roundToTwo } from './utils/formatters';
import { payslipDisplayPaidAmount, payslipIsFullyPaid } from './utils/payslipPaymentState';
import {
  allocationChanged,
  allocationChangeOnlyAffectsFutureAllocations,
  getLatestPayslipPeriodEndYyyyMmDd,
  normalizeAllocationsTotal,
  redistributeProjectBuildingShares,
} from './utils/allocationPercentages';

const EmployeeProfile: React.FC<EmployeeProfileProps> = ({
  employee: initialEmployee,
  onBack,
  onUpdate,
  payrollStorageRevision = 0,
}) => {
  const { user, tenant } = useAuth();
  const { state: appState } = useAppContext();
  const { print: triggerPrint } = usePrintContext();
  const { openChat } = useWhatsApp();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';
  
  const [employee, setEmployee] = useState<PayrollEmployee>(initialEmployee);
  const [activeModal, setActiveModal] = useState<'promote' | 'transfer' | 'terminate' | null>(null);

  // Sync from storage/DB when profile is shown so we always display persisted data (e.g. after navigating back)
  useEffect(() => {
    if (!tenantId || !initialEmployee?.id) return;
    const fromStorage = storageService.getEmployees(tenantId).find(e => e.id === initialEmployee.id);
    if (fromStorage) setEmployee(fromStorage);
  }, [tenantId, initialEmployee?.id]);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'payslips' | 'history' | 'edit'>('details');
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRun | null>(null);
  const [selectedPayslipData, setSelectedPayslipData] = useState<Payslip | null>(null);
  const [payslipModalAction, setPayslipModalAction] = useState<'view' | 'print'>('view');
  const [availableRuns, setAvailableRuns] = useState<PayrollRun[]>([]);
  const [editFormData, setEditFormData] = useState<Partial<PayrollEmployee>>({});
  const [globalProjects, setGlobalProjects] = useState<PayrollProject[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const availableGrades = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getGradeLevels(tenantId);
  }, [tenantId]);

  const availableDepartments = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getDepartments(tenantId).filter(d => d.is_active);
  }, [tenantId]);

  const globalBuildings = useMemo(() => (appState.buildings || []).map(b => ({ id: b.id, name: b.name })), [appState.buildings]);

  const MONTH_ORDER: Record<string, number> = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
  const employeePayslips = useMemo((): { run: PayrollRun; payslip: Payslip }[] => {
    if (!tenantId || !employee.id) return [];
    const payslips = storageService.getPayslips(tenantId).filter(p => p.employee_id === employee.id);
    const runs = storageService.getPayrollRuns(tenantId);
    const runMap = new Map(runs.map(r => [r.id, r]));
    const merged = payslips
      .map(ps => ({ run: runMap.get(ps.payroll_run_id), payslip: ps }))
      .filter((x): x is { run: PayrollRun; payslip: Payslip } => !!x.run);
    merged.sort((a, b) => {
      const y = b.run.year - a.run.year;
      if (y !== 0) return y;
      return (MONTH_ORDER[b.run.month] ?? 0) - (MONTH_ORDER[a.run.month] ?? 0);
    });
    return merged;
  }, [tenantId, employee.id, payrollStorageRevision]);

  // In local-only mode, use projects from AppContext (Settings → Assets → Projects)
  useEffect(() => {
    if (!isLocalOnlyMode() || !appState.projects) return;
    const payrollProjects = mapAppProjectsToPayroll(appState.projects, tenantId);
    const activeProjects = payrollProjects.filter(p => p.status === 'ACTIVE');
    setGlobalProjects(activeProjects);
    if (payrollProjects.length > 0) {
      storageService.setProjectsCache(payrollProjects);
    }
  }, [tenantId, appState.projects]);

  useEffect(() => {
    if (!tenantId) return;
    
    const fetchData = async () => {
      // Fetch payroll runs from API
      try {
        const apiRuns = await payrollApi.getPayrollRuns();
        if (apiRuns.length > 0) {
          setAvailableRuns(apiRuns.filter(r => r.status === PayrollStatus.PAID));
        } else {
          const runs = storageService.getPayrollRuns(tenantId).filter(r => r.status === PayrollStatus.PAID);
          setAvailableRuns(runs);
        }
      } catch (error) {
        console.warn('Failed to fetch payroll runs from API:', error);
        const runs = storageService.getPayrollRuns(tenantId).filter(r => r.status === PayrollStatus.PAID);
        setAvailableRuns(runs);
      }
      
      // When not local-only, fetch projects from main application API
      if (!isLocalOnlyMode()) {
        try {
          const projects = await payrollApi.getMainAppProjects();
          if (projects.length > 0) {
            const activeProjects = projects.filter(p => p.status === 'ACTIVE');
            setGlobalProjects(activeProjects);
            storageService.setProjectsCache(projects);
          } else {
            setGlobalProjects(storageService.getProjects(tenantId).filter(p => p.status === 'ACTIVE'));
          }
        } catch (error) {
          console.error('Error fetching projects:', error);
          setGlobalProjects(storageService.getProjects(tenantId).filter(p => p.status === 'ACTIVE'));
        }
      }
    };
    
    fetchData();
  }, [tenantId]);

  const getStatusColor = (status: EmploymentStatus) => {
    switch (status) {
      case EmploymentStatus.ACTIVE: return 'bg-ds-success/15 text-ds-success border-ds-success/30';
      case EmploymentStatus.TERMINATED: return 'bg-ds-danger/15 text-ds-danger border-ds-danger/30';
      case EmploymentStatus.RESIGNED: return 'bg-ds-warning/15 text-ds-warning border-ds-warning/30';
      case EmploymentStatus.ON_LEAVE: return 'bg-primary/15 text-primary border-primary/30';
      default: return 'bg-app-toolbar text-app-muted border-app-border';
    }
  };

  const calculateGross = () => {
    const allowances = (employee.salary?.allowances || [])
      .filter((a: any) => (a.name || '').toLowerCase() !== 'basic pay' && (a.name || '').toLowerCase() !== 'basic salary')
      .reduce((acc: number, curr: any) => {
        return acc + calculateAmount(employee.salary?.basic ?? 0, curr.amount, curr.is_percentage);
      }, 0);
    const earningsAdjustments = (employee.adjustments || [])
      .filter(a => a.type === 'EARNING')
      .reduce((acc, curr) => acc + curr.amount, 0);
    return roundToTwo((employee.salary?.basic ?? 0) + allowances + earningsAdjustments);
  };

  const calculateNet = () => {
    const grossWithoutAdjs = roundToTwo((employee.salary?.basic ?? 0) + (employee.salary?.allowances || [])
      .filter((a: any) => (a.name || '').toLowerCase() !== 'basic pay' && (a.name || '').toLowerCase() !== 'basic salary')
      .reduce((acc: number, curr: any) => {
        return acc + calculateAmount(employee.salary?.basic ?? 0, curr.amount, curr.is_percentage);
      }, 0));
    
    const gross = calculateGross();
    const deductions = (employee.salary?.deductions || []).reduce((acc: number, curr: any) => {
      return acc + calculateAmount(grossWithoutAdjs, curr.amount, curr.is_percentage);
    }, 0);

    const deductionAdjustments = (employee.adjustments || [])
      .filter(a => a.type === 'DEDUCTION')
      .reduce((acc, curr) => acc + curr.amount, 0);
    return roundToTwo(gross - deductions - deductionAdjustments);
  };

  const handleUpdate = async (updated: PayrollEmployee) => {
    if (!tenantId || !userId) return;

    if (allocationChanged(employee, updated)) {
      const pays = storageService.getPayslips(tenantId).filter((p) => p.employee_id === employee.id);
      if (pays.length > 0) {
        const lockedEnd = getLatestPayslipPeriodEndYyyyMmDd(
          pays,
          storageService.getPayrollRuns(tenantId),
          employee.id
        );
        const allowFutureOnly =
          lockedEnd != null &&
          allocationChangeOnlyAffectsFutureAllocations(employee, updated, lockedEnd);
        if (!allowFutureOnly) {
          alert(
            'This employee has payslips on record. Delete their payslips in Payroll Cycle before changing project or building assignments or effective dates that affect past payroll periods.'
          );
          return;
        }
      }
    }

    try {
      // Save to cloud API first
      const result = await payrollApi.updateEmployee(updated.id, {
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        photo: updated.photo,
        designation: updated.designation,
        department: updated.department,
        grade: updated.grade,
        joining_date: updated.joining_date,
        status: updated.status,
        salary: updated.salary,
        adjustments: updated.adjustments,
        projects: updated.projects,
        buildings: updated.buildings
      });
      
      if (result) {
        // Update local cache with response from server
        storageService.updateEmployee(tenantId, result, userId);
        setEmployee(result);
        onUpdate?.(result);
      } else {
        // Fallback to local storage only
        storageService.updateEmployee(tenantId, updated, userId);
        setEmployee(updated);
        onUpdate?.(updated);
      }
    } catch (error) {
      console.error('Failed to update employee via API:', error);
      // Fallback to local storage only
      storageService.updateEmployee(tenantId, updated, userId);
      setEmployee(updated);
      onUpdate?.(updated);
    }
  };

  const handleAddAdjustment = (adj: SalaryAdjustment) => {
    const updated = {
      ...employee,
      adjustments: [...(employee.adjustments || []), { ...adj, created_by: userId }]
    };
    handleUpdate(updated);
  };

  const handleProjectShareChange = (index: number, percent: number) => {
    const { projects, buildings } = redistributeProjectBuildingShares(
      employee.projects || [],
      employee.buildings || [],
      { type: 'project', index },
      percent
    );
    handleUpdate({ ...employee, projects, buildings });
  };

  const handleBuildingShareChange = (index: number, percent: number) => {
    const { projects, buildings } = redistributeProjectBuildingShares(
      employee.projects || [],
      employee.buildings || [],
      { type: 'building', index },
      percent
    );
    handleUpdate({ ...employee, projects, buildings });
  };

  const handleProjectStartDateChange = (index: number, startDate: string) => {
    const projects = (employee.projects || []).map((p, i) => (i === index ? { ...p, start_date: startDate } : p));
    handleUpdate({ ...employee, projects });
  };

  const handleBuildingStartDateChange = (index: number, startDate: string) => {
    const buildings = (employee.buildings || []).map((b, i) => (i === index ? { ...b, start_date: startDate } : b));
    handleUpdate({ ...employee, buildings });
  };

  const addProject = () => {
    const firstProject = globalProjects[0];
    const newProject: ProjectAllocation = {
      project_id: firstProject ? firstProject.id : `prj-${Date.now()}`,
      project_name: firstProject ? firstProject.name : 'New Assignment',
      percentage: 0,
      start_date: toLocalDateString(new Date())
    };
    handleUpdate({ ...employee, projects: [...(employee.projects || []), newProject] });
  };

  const addBuilding = () => {
    const first = globalBuildings[0];
    if (!first) return;
    const newB: BuildingAllocation = {
      building_id: first.id,
      building_name: first.name,
      percentage: 0,
      start_date: toLocalDateString(new Date())
    };
    handleUpdate({ ...employee, buildings: [...(employee.buildings || []), newB] });
  };

  const removeProject = (index: number) => {
    const nextProjects = (employee.projects || []).filter((_, i) => i !== index);
    const { projects, buildings } = normalizeAllocationsTotal(nextProjects, employee.buildings || []);
    handleUpdate({ ...employee, projects, buildings });
  };

  const removeBuilding = (index: number) => {
    const nextBuildings = (employee.buildings || []).filter((_, i) => i !== index);
    const { projects, buildings } = normalizeAllocationsTotal(employee.projects || [], nextBuildings);
    handleUpdate({ ...employee, projects, buildings });
  };

  const updateProjectRowField = (index: number, field: keyof ProjectAllocation, value: number | string) => {
    if (field === 'percentage') {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      const { projects, buildings } = redistributeProjectBuildingShares(
        employee.projects || [],
        employee.buildings || [],
        { type: 'project', index },
        num
      );
      handleUpdate({ ...employee, projects, buildings });
      return;
    }
    const projects = (employee.projects || []).map((p, i) => {
      if (i !== index) return p;
      if (field === 'project_id') {
        const gp = globalProjects.find((g) => g.id === value);
        return gp ? { ...p, project_id: gp.id, project_name: gp.name } : p;
      }
      return { ...p, [field]: value };
    });
    handleUpdate({ ...employee, projects });
  };

  const updateBuildingRowField = (index: number, field: keyof BuildingAllocation, value: number | string) => {
    if (field === 'percentage') {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      const { projects, buildings } = redistributeProjectBuildingShares(
        employee.projects || [],
        employee.buildings || [],
        { type: 'building', index },
        num
      );
      handleUpdate({ ...employee, projects, buildings });
      return;
    }
    const buildings = (employee.buildings || []).map((b, i) => {
      if (i !== index) return b;
      if (field === 'building_id') {
        const gb = globalBuildings.find((x) => x.id === value);
        return gb ? { ...b, building_id: gb.id, building_name: gb.name } : b;
      }
      return { ...b, [field]: value };
    });
    handleUpdate({ ...employee, buildings });
  };

  const totalAllocation = (employee.projects || []).reduce((a, b) => a + b.percentage, 0)
    + (employee.buildings || []).reduce((a, b) => a + b.percentage, 0);

  const startEditing = () => {
    // Format joining_date for date input (YYYY-MM-DD format)
    let formattedJoiningDate = '';
    if (employee.joining_date) {
      try {
        const date = new Date(employee.joining_date);
        if (!isNaN(date.getTime())) {
          formattedJoiningDate = toLocalDateString(date);
        }
      } catch (error) {
        console.warn('Error formatting joining date:', error);
      }
    }
    
    setEditFormData({
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      address: employee.address,
      designation: employee.designation,
      department: employee.department,
      grade: employee.grade,
      joining_date: formattedJoiningDate,
      photo: employee.photo,
      salary: { ...employee.salary },
      projects: (employee.projects || []).map(p => ({ ...p })),
      buildings: (employee.buildings || []).map(b => ({ ...b }))
    });
    setViewMode('edit');
  };

  const handleDeleteEmployee = async () => {
    if (!tenantId || !userId) return;
    
    setIsDeleting(true);
    try {
      // Try to delete from API first
      const success = await payrollApi.deleteEmployee(employee.id);
      
      if (success) {
        // Also remove from local storage
        storageService.deleteEmployee(tenantId, employee.id);
      } else {
        // Fallback to local storage only
        storageService.deleteEmployee(tenantId, employee.id);
      }
      
      // Navigate back to employee list
      onBack();
    } catch (error) {
      console.error('Failed to delete employee:', error);
      alert('Failed to delete employee. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const saveEdit = () => {
    const departmentName = (editFormData.department ?? employee.department) || '';
    const departmentId = availableDepartments.find(d => d.name === departmentName)?.id ?? employee.department_id ?? undefined;
    const updatedEmployee = {
      ...employee,
      ...editFormData,
      department_id: departmentId
    } as PayrollEmployee;
    handleUpdate(updatedEmployee);
    setViewMode('details');
  };

  const editProjects = editFormData.projects ?? [];
  const editBuildings = editFormData.buildings ?? [];
  const editTotalAllocation = editProjects.reduce((s, p) => s + p.percentage, 0) + editBuildings.reduce((s, b) => s + b.percentage, 0);

  const editAddProject = () => {
    const first = globalProjects[0];
    if (!first) return;
    const defaultStart =
      (editFormData.joining_date as string) || employee.joining_date || toLocalDateString(new Date());
    const newP: ProjectAllocation = {
      project_id: first.id,
      project_name: first.name,
      percentage: editProjects.length === 0 ? 100 : 0,
      start_date: defaultStart,
    };
    setEditFormData({ ...editFormData, projects: [...editProjects, newP] });
  };

  const editRemoveProject = (index: number) => {
    const nextProjects = editProjects.filter((_, i) => i !== index);
    const { projects, buildings } = normalizeAllocationsTotal(nextProjects, editBuildings);
    setEditFormData({ ...editFormData, projects, buildings });
  };

  const editUpdateProject = (index: number, field: keyof ProjectAllocation, value: number | string) => {
    if (field === 'percentage') {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      const { projects, buildings } = redistributeProjectBuildingShares(
        editProjects,
        editBuildings,
        { type: 'project', index },
        num
      );
      setEditFormData({ ...editFormData, projects, buildings });
      return;
    }
    const next = editProjects.map((p, i) => {
      if (i !== index) return p;
      if (field === 'project_id') {
        const gp = globalProjects.find(g => g.id === value);
        return gp ? { ...p, project_id: gp.id, project_name: gp.name } : p;
      }
      return { ...p, [field]: value };
    });
    setEditFormData({ ...editFormData, projects: next });
  };

  const editAddBuilding = () => {
    if (globalBuildings.length === 0) return;
    const first = globalBuildings[0];
    const defaultStart =
      (editFormData.joining_date as string) || employee.joining_date || toLocalDateString(new Date());
    const newB: BuildingAllocation = {
      building_id: first.id,
      building_name: first.name,
      percentage: editBuildings.length === 0 ? (editProjects.length > 0 ? 0 : 100) : 0,
      start_date: defaultStart,
    };
    setEditFormData({ ...editFormData, buildings: [...editBuildings, newB] });
  };

  const editRemoveBuilding = (index: number) => {
    const nextBuildings = editBuildings.filter((_, i) => i !== index);
    const { projects, buildings } = normalizeAllocationsTotal(editProjects, nextBuildings);
    setEditFormData({ ...editFormData, projects, buildings });
  };

  const editUpdateBuilding = (index: number, field: keyof BuildingAllocation, value: number | string) => {
    if (field === 'percentage') {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      const { projects, buildings } = redistributeProjectBuildingShares(
        editProjects,
        editBuildings,
        { type: 'building', index },
        num
      );
      setEditFormData({ ...editFormData, projects, buildings });
      return;
    }
    const next = editBuildings.map((b, i) => {
      if (i !== index) return b;
      if (field === 'building_id') {
        const gb = globalBuildings.find(x => x.id === value);
        return gb ? { ...b, building_id: gb.id, building_name: gb.name } : b;
      }
      return { ...b, [field]: value };
    });
    setEditFormData({ ...editFormData, buildings: next });
  };

  const QUICK_PERCENTAGES = [0, 25, 50, 75, 100];

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditFormData(prev => ({ ...prev, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const historyEvents = useMemo(() => {
    const events = [
      {
        id: 'h-1',
        date: employee.joining_date,
        type: 'JOINED',
        title: 'Joined Organization',
        description: `Onboarded as ${employee.designation} in ${employee.department} department.`,
        icon: <UserPlus size={16} />,
        color: 'blue'
      },
      ...(employee.adjustments || []).map(adj => ({
        id: adj.id,
        date: adj.date_added.split('T')[0],
        type: 'ADJUSTMENT',
        title: `${adj.type === 'EARNING' ? 'Incentive' : 'Deduction'} Applied`,
        description: `${adj.name} adjustment for PKR ${formatCurrency(adj.amount)}. Action by: ${adj.created_by}`,
        icon: adj.type === 'EARNING' ? <TrendingUp size={16} /> : <TrendingDown size={16} />,
        color: adj.type === 'EARNING' ? 'emerald' : 'amber'
      }))
    ];
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [employee]);

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-app-muted font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-20 animate-in fade-in duration-300">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <button 
          onClick={viewMode !== 'details' ? () => setViewMode('details') : onBack} 
          className="text-primary hover:underline flex items-center gap-1 font-bold group text-sm"
        >
          <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> 
          {viewMode !== 'details' ? 'Back to Profile' : 'Back to Workforce'}
        </button>
        <div className="flex flex-wrap gap-2">
          {viewMode === 'details' && (
            <>
              <button 
                onClick={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                className="p-2 sm:px-4 sm:py-2 bg-app-card border border-app-border rounded-xl shadow-ds-card hover:bg-app-toolbar/30 transition-colors font-bold text-sm flex items-center gap-2"
                title="Print Profile Summary"
              >
                <Printer size={16} className="text-app-muted" />
              </button>
              <button 
                onClick={startEditing}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-app-card border border-app-border rounded-xl shadow-ds-card hover:bg-app-toolbar/30 transition-colors font-bold text-xs sm:text-sm flex items-center gap-2"
              >
                <Edit3 size={16} className="text-app-muted" /> <span className="hidden sm:inline">Edit Profile</span><span className="sm:hidden">Edit</span>
              </button>
              {employee.status === EmploymentStatus.ACTIVE ? (
                <>
                  <button 
                    onClick={() => setIsAdjustmentModalOpen(true)}
                    className="px-3 sm:px-5 py-2 sm:py-2.5 bg-ds-success text-white rounded-xl shadow-ds-card hover:opacity-90 transition-colors font-bold text-xs sm:text-sm flex items-center gap-2"
                  >
                    <Plus size={16} /> <span className="hidden sm:inline">Add Bonus</span><span className="sm:hidden">Bonus</span>
                  </button>
                  <button 
                    onClick={() => setActiveModal('promote')}
                    className="hidden sm:flex px-5 py-2.5 bg-app-card border border-app-border rounded-xl shadow-ds-card hover:bg-app-toolbar/30 transition-colors font-bold text-sm items-center gap-2"
                  >
                    <TrendingUp size={16} className="text-primary" /> Promote
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 sm:px-5 py-2 sm:py-2.5 bg-red-600 text-white rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-colors font-bold text-xs sm:text-sm flex items-center gap-2"
                >
                  <Trash2 size={16} /> <span className="hidden sm:inline">Delete Profile</span><span className="sm:hidden">Delete</span>
                </button>
              )}
              {employee.status === EmploymentStatus.ACTIVE && (
                <button 
                  onClick={() => setActiveModal('terminate')}
                  className="hidden sm:block px-5 py-2.5 bg-red-600 text-white rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-colors font-bold text-sm"
                >
                  Offboard
                </button>
              )}
            </>
          )}
          {viewMode === 'edit' && (
            <>
              <button 
                onClick={() => setViewMode('details')}
                className="px-4 sm:px-6 py-2 sm:py-2.5 bg-app-toolbar text-app-text rounded-xl font-bold text-sm hover:bg-app-toolbar/80 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveEdit}
                disabled={(editProjects.length > 0 || editBuildings.length > 0) && editTotalAllocation !== 100}
                className="px-4 sm:px-8 py-2 sm:py-2.5 bg-primary text-ds-on-primary rounded-xl font-black text-sm shadow-ds-card hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} /> Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Profile Details View */}
      {viewMode === 'details' && (
        <div id="printable-area" className="printable-area bg-app-card rounded-2xl sm:rounded-3xl shadow-ds-card border border-app-border overflow-hidden print-full">
          <div className="h-24 sm:h-32 bg-gradient-to-r from-primary via-primary to-ds-primary-hover no-print opacity-95"></div>
          <div className="px-4 sm:px-8 pb-6 sm:pb-8 -mt-12 sm:-mt-16 print:mt-0">
            {/* Profile Header */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 mb-6 sm:mb-10 print:items-start">
              <div className="w-24 h-24 sm:w-32 sm:h-32 bg-app-toolbar rounded-2xl sm:rounded-3xl border-4 border-app-card shadow-xl overflow-hidden flex items-center justify-center relative print:shadow-none print:border-app-border shrink-0">
                {employee.photo ? (
                  <img src={employee.photo} alt={employee.name} className="w-full h-full object-cover" />
                ) : (
                  <UserCircle size={60} className="text-app-muted sm:w-20 sm:h-20" />
                )}
                {employee.status === EmploymentStatus.ACTIVE && (
                  <div className="absolute bottom-1 right-1 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-ds-success border-2 border-app-card no-print"></div>
                )}
              </div>
              <div className="flex-1 pb-0 sm:pb-2">
                <h2 className="text-2xl sm:text-3xl font-black text-app-text tracking-tight">{employee.name}</h2>
                <div className="flex flex-wrap gap-2 sm:gap-4 mt-2 text-app-muted font-bold text-xs sm:text-sm">
                  <span className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-app-toolbar/50 rounded-lg">
                    <Briefcase size={14} className="text-primary" /> {employee.designation}
                  </span>
                  <span className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-app-toolbar/50 rounded-lg">
                    <Building2 size={14} className="text-primary" /> {employee.department}
                  </span>
                  <span className={`px-2 sm:px-4 py-1 rounded-full text-[10px] sm:text-xs font-black border uppercase tracking-widest ${getStatusColor(employee.status)}`}>
                    {employee.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 print-full">
              <div className="lg:col-span-2 space-y-4 sm:space-y-8 print:w-full">
                {/* Contact Info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 bg-app-toolbar/40 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-app-border">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-app-muted uppercase tracking-widest">Email Address</p>
                    <p className="text-xs sm:text-sm font-bold text-app-text flex items-center gap-2 truncate">
                      <Mail size={14} className="text-app-muted shrink-0" /> {employee.email || 'Not provided'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-app-muted uppercase tracking-widest">Phone Number</p>
                    <p className="text-xs sm:text-sm font-bold text-app-text flex items-center gap-2">
                      <Phone size={14} className="text-app-muted shrink-0" /> {employee.phone || 'Not provided'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-app-muted uppercase tracking-widest">Grade Level</p>
                    <p className="text-xs sm:text-sm font-bold text-app-text flex items-center gap-2">
                      <Award size={14} className="text-app-muted shrink-0" /> {employee.grade}
                    </p>
                  </div>
                </div>

                {/* Salary Structure */}
                <div className="bg-app-toolbar/40 rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-app-border/60 print:border-app-border print-card">
                  <h3 className="text-lg sm:text-xl font-bold text-app-text mb-4 sm:mb-6 flex items-center gap-3">
                    <div className="p-2 bg-primary/15 text-primary rounded-xl no-print hidden sm:block"><DollarSign size={20} /></div>
                    Salary Structure
                  </h3>
                  <div className="space-y-4 sm:space-y-6">
                    <div className="flex justify-between items-center py-3 sm:py-4 border-b border-app-border print:border-app-border">
                      <div>
                        <span className="font-bold text-app-text text-sm sm:text-base">Basic Pay</span>
                        <p className="text-[10px] text-app-muted font-bold uppercase tracking-tighter hidden sm:block">Guaranteed Fixed</p>
                      </div>
                      <span className="text-lg sm:text-xl font-black text-app-text">PKR {formatCurrency(employee.salary?.basic ?? 0)}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-2 sm:space-y-3">
                        <p className="text-[10px] font-black uppercase text-app-muted tracking-widest">Earnings/Allowances</p>
                        {(employee.salary?.allowances || [])
                          .filter((a: any) => (a.name || '').toLowerCase() !== 'basic pay' && (a.name || '').toLowerCase() !== 'basic salary')
                          .map((a: any, i: number) => (
                            <div key={i} className="flex justify-between items-center p-2 sm:p-3 bg-app-card rounded-xl border border-app-border shadow-ds-card print:shadow-none">
                              <span className="text-xs sm:text-sm font-bold text-app-text">{a.name}</span>
                              <span className="text-ds-success font-black text-xs sm:text-sm">
                                +{a.is_percentage ? `${a.amount}%` : `PKR ${formatCurrency(a.amount)}`}
                              </span>
                            </div>
                          ))}
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        <p className="text-[10px] font-black uppercase text-app-muted tracking-widest">Statutory Deductions</p>
                        {(employee.salary?.deductions || []).map((d: any, i: number) => (
                          <div key={i} className="flex justify-between items-center p-2 sm:p-3 bg-app-card rounded-xl border border-app-border shadow-ds-card print:shadow-none">
                            <span className="text-xs sm:text-sm font-bold text-app-text">{d.name}</span>
                            <span className="text-red-500 font-black text-xs sm:text-sm">
                              -{d.is_percentage ? `${d.amount}%` : `PKR ${formatCurrency(d.amount)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Project Allocation */}
                <div className="bg-app-card rounded-3xl p-8 border border-app-border print:border-app-border print-card">
                  <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-app-text flex items-center gap-3">
                        <div className="p-2 bg-primary/15 text-primary rounded-xl no-print"><PieChart size={20} /></div>
                        Project Cost Allocation
                      </h3>
                      <p className="text-[10px] text-app-muted font-bold uppercase tracking-tight pl-0 md:pl-12 print:pl-0">Cost distribution among organizational entities</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 no-print">
                      <button 
                        type="button"
                        onClick={addProject}
                        disabled={globalProjects.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-ds-on-primary rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-ds-card disabled:opacity-50"
                      >
                        <Plus size={14} /> Assign project
                      </button>
                      <button 
                        type="button"
                        onClick={addBuilding}
                        disabled={globalBuildings.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-app-toolbar border border-app-border text-app-text rounded-xl font-black text-xs uppercase tracking-widest hover:bg-app-toolbar/80 transition-all disabled:opacity-50"
                      >
                        <Building2 size={14} /> Assign building
                      </button>
                    </div>
                  </div>
                  <div className="space-y-8">
                    {(employee.projects?.length ?? 0) === 0 && (employee.buildings?.length ?? 0) === 0 ? (
                      <div className="py-8 text-center bg-app-toolbar/50 rounded-2xl border border-dashed border-app-border">
                        <p className="text-app-muted text-sm font-medium">No projects or buildings assigned. Edit employee to add assignments.</p>
                      </div>
                    ) : (
                      <>
                    {(employee.projects || []).map((p, i) => (
                      <div key={i} className="group relative flex flex-col md:flex-row items-start gap-8 p-6 rounded-3xl bg-app-toolbar/40 hover:bg-app-card border border-app-border hover:border-primary/40 transition-all">
                        <div className="flex-1 w-full space-y-4">
                          <label className="block text-[10px] font-black text-app-muted uppercase tracking-widest">Organizational Project</label>
                          <select
                            value={p.project_id}
                            onChange={(e) => updateProjectRowField(i, 'project_id', e.target.value)}
                            className="no-print w-full bg-app-card border border-app-border rounded-xl px-4 py-3 text-sm font-black text-app-text print:border-app-border"
                            aria-label="Organizational project"
                          >
                            {globalProjects.map((gp) => (
                              <option key={gp.id} value={gp.id}>
                                {gp.name}
                              </option>
                            ))}
                          </select>
                          <p className="hidden print:block text-sm font-black text-app-text">{p.project_name}</p>
                          <div className="no-print max-w-md">
                            <DatePicker
                              label="Effective from"
                              value={parseStoredDateToYyyyMmDdInput(
                                p.start_date ||
                                  employee.joining_date ||
                                  toLocalDateString(new Date())
                              )}
                              onChange={(d) => handleProjectStartDateChange(i, toLocalDateString(d))}
                              className="!rounded-xl !border-app-border !font-bold !text-app-text"
                            />
                          </div>
                          <p className="hidden print:block text-[10px] font-bold text-app-muted">
                            Effective from {formatDateLong(p.start_date || employee.joining_date)}
                          </p>
                        </div>

                        <div className="w-full md:w-80 space-y-4">
                          <div className="flex justify-between items-end">
                            <label className="block text-[10px] font-black text-app-muted uppercase tracking-widest">Share Percentage</label>
                            <span className="text-2xl font-black text-primary tracking-tighter">{p.percentage}%</span>
                          </div>
                          
                          <div className="space-y-3 no-print">
                            <input 
                              type="range" min="0" max="100" step="5"
                              value={p.percentage}
                              onChange={(e) => handleProjectShareChange(i, parseInt(e.target.value))}
                              className="w-full h-2 bg-app-border rounded-lg appearance-none cursor-pointer accent-primary"
                              aria-label="Project share percentage"
                            />
                          </div>
                        </div>

                        <button 
                          onClick={() => removeProject(i)}
                          className="p-2.5 text-app-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-all self-center md:mt-6 no-print"
                          aria-label="Remove project assignment"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                    {(employee.buildings || []).map((b, i) => (
                      <div key={`b-${i}`} className="group relative flex flex-col md:flex-row items-start gap-8 p-6 rounded-3xl bg-app-toolbar/40 hover:bg-app-card border border-app-border hover:border-app-border transition-all">
                        <div className="flex-1 w-full space-y-4">
                          <label className="block text-[10px] font-black text-app-muted uppercase tracking-widest">Building</label>
                          <select
                            value={b.building_id}
                            onChange={(e) => updateBuildingRowField(i, 'building_id', e.target.value)}
                            className="no-print w-full bg-app-card border border-app-border rounded-xl px-4 py-3 text-sm font-black text-app-text"
                            aria-label="Building"
                          >
                            {globalBuildings.map((gb) => (
                              <option key={gb.id} value={gb.id}>
                                {gb.name}
                              </option>
                            ))}
                          </select>
                          <p className="hidden print:block text-sm font-black text-app-text">{b.building_name}</p>
                          <div className="no-print max-w-md">
                            <DatePicker
                              label="Effective from"
                              value={parseStoredDateToYyyyMmDdInput(
                                b.start_date ||
                                  employee.joining_date ||
                                  toLocalDateString(new Date())
                              )}
                              onChange={(d) => handleBuildingStartDateChange(i, toLocalDateString(d))}
                              className="!rounded-xl !border-app-border !font-bold !text-app-text"
                            />
                          </div>
                          <p className="hidden print:block text-[10px] font-bold text-app-muted">
                            Effective from {formatDateLong(b.start_date || employee.joining_date)}
                          </p>
                        </div>
                        <div className="w-full md:w-80 space-y-4">
                          <div className="flex justify-between items-end">
                            <label className="block text-[10px] font-black text-app-muted uppercase tracking-widest">Share %</label>
                            <span className="text-2xl font-black text-primary tracking-tighter">{b.percentage}%</span>
                          </div>
                          <div className="space-y-3 no-print">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={b.percentage}
                              onChange={(e) => handleBuildingShareChange(i, parseInt(e.target.value, 10))}
                              className="w-full h-2 bg-app-border rounded-lg appearance-none cursor-pointer accent-primary"
                              aria-label="Building share percentage"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBuilding(i)}
                          className="p-2.5 text-app-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-all self-center md:mt-6 no-print"
                          aria-label="Remove building assignment"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                    
                    {((employee.projects?.length ?? 0) + (employee.buildings?.length ?? 0)) > 0 && (
                      <div className="p-6 bg-primary rounded-3xl flex items-center justify-between text-ds-on-primary mt-8 print:bg-app-toolbar print:text-app-text">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl no-print ${totalAllocation === 100 ? 'bg-ds-success/30 text-white' : 'bg-ds-warning/30 text-white'}`}>
                            {totalAllocation === 100 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-white/80 uppercase tracking-widest print:text-app-muted">Total Combined Allocation</p>
                            <p className="text-xs font-bold text-white/70 print:text-app-muted">Projects + buildings must sum to 100%</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-3xl font-black tracking-tighter ${totalAllocation === 100 ? 'text-white print:text-ds-success' : 'text-white print:text-ds-warning'}`}>
                            {totalAllocation}%
                          </span>
                        </div>
                      </div>
                    )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Sidebar */}
              <div className="space-y-4 sm:space-y-6 print:mt-10">
                {/* Net Pay Card */}
                <div className="bg-gradient-to-br from-primary to-ds-primary-hover text-ds-on-primary rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-ds-card relative overflow-hidden print:bg-app-toolbar print:text-app-text print:shadow-none">
                  <div className="relative z-10">
                    <p className="text-white/80 text-[10px] sm:text-xs font-black uppercase tracking-widest opacity-80 print:text-app-muted">Net Take Home</p>
                    <p className="text-3xl sm:text-5xl font-black mt-2 leading-none">PKR {formatCurrency(calculateNet())}</p>
                    <div className="mt-4 sm:mt-8 pt-4 sm:pt-6 border-t border-white/10 space-y-2 sm:space-y-3">
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-white/85 font-medium">Monthly Gross</span>
                        <span className="font-bold">PKR {formatCurrency(calculateGross())}</span>
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-white/85 font-medium">Annual CTC</span>
                        <span className="font-bold">PKR {formatCurrency(calculateGross() * 12)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-app-card/5 rounded-full -mr-16 -mt-16 blur-3xl no-print"></div>
                </div>

                {/* Actions */}
                <div className="bg-app-card border border-app-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 no-print">
                  <h4 className="font-bold text-app-text mb-3 sm:mb-4 text-xs sm:text-sm uppercase tracking-widest text-center border-b border-app-border/50 pb-3 sm:pb-4">Actions</h4>
                  <div className="space-y-2">
                    <button 
                      onClick={() => setViewMode('payslips')}
                      className="w-full flex items-center justify-between p-3 sm:p-4 text-xs sm:text-sm font-bold rounded-xl sm:rounded-2xl hover:bg-app-toolbar/50 transition-all border border-app-border group"
                    >
                      <span className="flex items-center gap-2 sm:gap-3"><FileText size={16} className="text-app-muted" /> Past Payslips</span>
                      <ChevronRight size={14} className="text-app-muted opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                    <button 
                      onClick={() => setViewMode('history')}
                      className="w-full flex items-center justify-between p-3 sm:p-4 text-xs sm:text-sm font-bold rounded-xl sm:rounded-2xl hover:bg-app-toolbar/50 transition-all border border-app-border group"
                    >
                      <span className="flex items-center gap-2 sm:gap-3"><History size={16} className="text-app-muted" /> Tenure History</span>
                      <ChevronRight size={14} className="text-app-muted opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mode */}
      {viewMode === 'edit' && (
        <div className="bg-app-card rounded-3xl shadow-ds-card border border-app-border overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="p-8 border-b border-app-border flex items-center justify-between bg-app-toolbar/40">
            <div>
              <h3 className="text-xl font-black text-app-text tracking-tight">Edit Profile</h3>
              <p className="text-sm text-app-muted font-medium">Update employment and personal information for {employee.name}.</p>
            </div>
          </div>
          
          <div className="p-8 lg:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              {/* Photo Upload */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="w-48 h-48 bg-app-toolbar rounded-3xl border-4 border-app-border/50 shadow-inner overflow-hidden flex items-center justify-center">
                    {editFormData.photo ? (
                      <img src={editFormData.photo} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle size={100} className="text-app-muted" />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex flex-col items-center text-white">
                      <Camera size={32} />
                      <span className="text-xs font-black uppercase mt-2">Change Photo</span>
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handlePhotoUpload}
                    aria-label="Upload profile photo"
                  />
                </div>
                <p className="text-[10px] font-bold text-app-muted uppercase tracking-widest text-center max-w-[180px]">
                  Click to upload a professional headshot. Max 5MB recommended.
                </p>
              </div>

              {/* Form Fields */}
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Full Legal Name</label>
                    <input 
                      type="text" 
                      value={editFormData.name || ''}
                      onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-bold text-app-text"
                      aria-label="Full Legal Name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Work Email</label>
                    <input 
                      type="email" 
                      value={editFormData.email || ''}
                      onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-bold text-app-text"
                      aria-label="Work Email"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Phone Number</label>
                    <input 
                      type="text" 
                      value={editFormData.phone || ''}
                      onChange={e => setEditFormData({...editFormData, phone: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-bold text-app-text"
                      aria-label="Phone Number"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Residential Address</label>
                    <textarea 
                      rows={2}
                      value={editFormData.address || ''}
                      onChange={e => setEditFormData({...editFormData, address: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-bold text-app-text resize-none"
                      aria-label="Residential Address"
                    />
                  </div>
                </div>

                <div className="h-px bg-app-toolbar"></div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Current Designation</label>
                    <input 
                      type="text" 
                      value={editFormData.designation || ''}
                      onChange={e => setEditFormData({...editFormData, designation: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-bold text-app-text"
                      aria-label="Current Designation"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Department</label>
                    <select
                      value={editFormData.department || ''}
                      onChange={e => setEditFormData({...editFormData, department: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-bold text-app-text bg-app-card"
                      aria-label="Department"
                    >
                      {availableDepartments.length > 0 ? (
                        availableDepartments.map(d => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))
                      ) : (
                        <>
                          <option value="Engineering">Engineering</option>
                          <option value="Product">Product</option>
                          <option value="Sales">Sales</option>
                          <option value="Human Resources">Human Resources</option>
                          <option value="Operations">Operations</option>
                          <option value="Finance">Finance</option>
                          <option value="Marketing">Marketing</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Grade Level</label>
                    <select
                      value={editFormData.grade || ''}
                      onChange={e => setEditFormData({...editFormData, grade: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-bold text-app-text bg-app-card"
                      aria-label="Grade Level"
                    >
                      {availableGrades.map(g => (
                        <option key={g.id} value={g.name}>{g.name} - {g.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <DatePicker
                      label="Joining Date"
                      value={parseStoredDateToYyyyMmDdInput(editFormData.joining_date)}
                      onChange={(d) => setEditFormData({ ...editFormData, joining_date: toLocalDateString(d) })}
                      className="!rounded-xl !border-app-border !font-bold !text-app-text"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-app-muted uppercase mb-2">Basic Salary (Monthly)</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-app-muted font-bold text-[10px]">PKR</div>
                      <input 
                        type="number" 
                        value={editFormData.salary?.basic || 0}
                        onChange={e => setEditFormData({
                          ...editFormData, 
                          salary: { ...editFormData.salary!, basic: parseFloat(e.target.value) || 0 }
                        })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-app-border focus:ring-4 ring-primary/20 outline-none font-black text-app-text"
                        aria-label="Basic Salary (Monthly)"
                      />
                    </div>
                  </div>
                </div>

                {/* Project Allocation (edit) */}
                <div className="h-px bg-app-toolbar"></div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-app-text uppercase tracking-widest flex items-center gap-2">
                      <PieChart size={14} className="text-primary" /> Project Allocation
                    </h4>
                    <button
                      type="button"
                      onClick={editAddProject}
                      disabled={globalProjects.length === 0}
                      className="px-4 py-2 bg-primary text-ds-on-primary rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                    >
                      <Plus size={14} className="inline mr-1" /> Assign Project
                    </button>
                  </div>
                  {editProjects.length === 0 ? (
                    <p className="text-app-muted text-sm">No projects assigned. Add to distribute cost across projects.</p>
                  ) : (
                    <div className="space-y-4">
                      {editProjects.map((p, idx) => (
                        <div key={idx} className="flex flex-col gap-3 p-4 bg-app-toolbar/50 rounded-xl border border-app-border">
                          <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                              <label className="block text-[10px] font-black text-app-muted uppercase mb-1">Project</label>
                              <select
                                value={p.project_id}
                                onChange={e => editUpdateProject(idx, 'project_id', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-app-border bg-app-card text-sm font-bold text-app-text"
                                aria-label="Project"
                              >
                                {globalProjects.map(gp => (
                                  <option key={gp.id} value={gp.id}>{gp.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="w-full sm:w-48">
                              <label className="block text-[10px] font-black text-app-muted uppercase mb-1">Share %</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={p.percentage}
                                  onChange={e => editUpdateProject(idx, 'percentage', parseInt(e.target.value))}
                                  className="flex-1 h-2 bg-app-border rounded-lg accent-primary"
                                  aria-label="Project share percentage"
                                />
                                <span className="text-sm font-black text-primary w-10">{p.percentage}%</span>
                              </div>
                            </div>
                            <div className="w-full sm:w-52">
                              <DatePicker
                                label="Effective from"
                                value={parseStoredDateToYyyyMmDdInput(
                                  p.start_date ||
                                    (editFormData.joining_date as string) ||
                                    employee.joining_date ||
                                    toLocalDateString(new Date())
                                )}
                                onChange={(d) => editUpdateProject(idx, 'start_date', toLocalDateString(d))}
                                className="!rounded-xl !border-app-border !font-bold !text-app-text"
                              />
                            </div>
                            <button type="button" onClick={() => editRemoveProject(idx)} className="p-2 text-app-muted hover:text-red-500 hover:bg-red-50 rounded-lg self-end sm:self-center" aria-label="Remove project assignment">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Building Allocation (edit) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-app-text uppercase tracking-widest flex items-center gap-2">
                      <Building2 size={14} className="text-primary" /> Building Allocation
                    </h4>
                    <button
                      type="button"
                      onClick={editAddBuilding}
                      disabled={globalBuildings.length === 0}
                      className="px-4 py-2 bg-primary text-ds-on-primary rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                    >
                      <Plus size={14} className="inline mr-1" /> Assign Building
                    </button>
                  </div>
                  {editBuildings.length === 0 ? (
                    <p className="text-app-muted text-sm">No buildings assigned. Add to distribute cost across buildings.</p>
                  ) : (
                    <div className="space-y-4">
                      {editBuildings.map((b, idx) => (
                        <div key={idx} className="flex flex-col gap-3 p-4 bg-app-toolbar/50 rounded-xl border border-app-border">
                          <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                              <label className="block text-[10px] font-black text-app-muted uppercase mb-1">Building</label>
                              <select
                                value={b.building_id}
                                onChange={e => editUpdateBuilding(idx, 'building_id', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-app-border bg-app-card text-sm font-bold text-app-text"
                                aria-label="Building"
                              >
                                {globalBuildings.map(gb => (
                                  <option key={gb.id} value={gb.id}>{gb.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="w-full sm:w-48">
                              <label className="block text-[10px] font-black text-app-muted uppercase mb-1">Share %</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={b.percentage}
                                  onChange={e => editUpdateBuilding(idx, 'percentage', parseInt(e.target.value))}
                                  className="flex-1 h-2 bg-app-border rounded-lg accent-primary"
                                  aria-label="Building share percentage"
                                />
                                <span className="text-sm font-black text-primary w-10">{b.percentage}%</span>
                              </div>
                            </div>
                            <div className="w-full sm:w-52">
                              <DatePicker
                                label="Effective from"
                                value={parseStoredDateToYyyyMmDdInput(
                                  b.start_date ||
                                    (editFormData.joining_date as string) ||
                                    employee.joining_date ||
                                    toLocalDateString(new Date())
                                )}
                                onChange={(d) => editUpdateBuilding(idx, 'start_date', toLocalDateString(d))}
                                className="!rounded-xl !border-app-border !font-bold !text-app-text"
                              />
                            </div>
                            <button type="button" onClick={() => editRemoveBuilding(idx)} className="p-2 text-app-muted hover:text-red-500 hover:bg-red-50 rounded-lg self-end sm:self-center" aria-label="Remove building assignment">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(editProjects.length > 0 || editBuildings.length > 0) && (
                    <div className="flex items-center justify-between p-3 bg-app-toolbar rounded-xl">
                      <span className="text-xs font-bold text-app-muted">Total allocation</span>
                      <span className={`font-black ${editTotalAllocation === 100 ? 'text-ds-success' : 'text-ds-warning'}`}>
                        {editTotalAllocation}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payslips View */}
      {viewMode === 'payslips' && (
        <div className="bg-app-card rounded-3xl shadow-ds-card border border-app-border overflow-hidden min-h-[500px]">
          <div className="p-6 sm:p-8 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-app-toolbar/40">
            <div>
              <h3 className="text-xl font-black text-app-text tracking-tight">Past Payslips</h3>
              <p className="text-sm text-app-muted font-medium mt-1">View, print, or send payslips to {employee.name}.</p>
            </div>
            <div className="bg-app-card px-4 py-2 rounded-xl border border-app-border text-xs font-bold text-app-muted flex items-center gap-2 shrink-0">
              <ShieldCheck size={16} className="text-ds-success" /> Compliance Verified
            </div>
          </div>
          <div className="p-0">
            {employeePayslips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-app-muted">
                <FileText size={64} className="mb-4 opacity-30" />
                <p className="font-bold text-app-muted">No payslips yet</p>
                <p className="text-xs mt-1">Payslips created in Payroll Cycle will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-app-toolbar/50/80 border-b border-app-border text-[10px] font-black text-app-muted uppercase tracking-widest">
                      <th className="px-6 sm:px-8 py-4">Period</th>
                      <th className="px-6 sm:px-8 py-4">Status</th>
                      <th className="px-6 sm:px-8 py-4">Net Amount</th>
                      <th className="px-6 sm:px-8 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border">
                    {employeePayslips.map(({ run, payslip }) => {
                      const paidAmt = payslipDisplayPaidAmount(payslip);
                      const isFullyPaid = payslipIsFullyPaid(payslip);
                      const isPartiallyPaid = paidAmt > 0 && !isFullyPaid;
                      const statusLabel = isFullyPaid ? 'Paid' : isPartiallyPaid ? 'Partially paid' : 'Unpaid';
                      const openView = () => {
                        setSelectedPayslip(run);
                        setSelectedPayslipData(payslip);
                        setPayslipModalAction('view');
                      };
                      const openPrint = () => {
                        setSelectedPayslip(run);
                        setSelectedPayslipData(payslip);
                        setPayslipModalAction('print');
                      };
                      const companyName = tenant?.companyName || tenant?.name || 'Company';
                      const message = `Payslip for ${run.month} ${run.year}: Net Pay PKR ${formatCurrency(payslip.net_pay)}. ${companyName}.`;
                      const phone = (employee.phone || '').replace(/\D/g, '');
                      const waNumber = phone.startsWith('0') ? '92' + phone.slice(1) : phone.length >= 10 ? '92' + phone : '';
                      const contactLike: Contact = { id: employee.id, name: employee.name, type: ContactType.OWNER, contactNo: waNumber || employee.phone || '' };
                      const handleWhatsApp = () => {
                        try {
                          sendOrOpenWhatsApp(
                            { contact: contactLike, message, phoneNumber: contactLike.contactNo || undefined },
                            () => appState.whatsAppMode,
                            openChat
                          );
                        } catch (err) {
                          // no-op or showAlert if available
                        }
                      };
                      return (
                        <tr key={payslip.id} className="group hover:bg-app-toolbar/50/80 transition-colors">
                          <td className="px-6 sm:px-8 py-4 font-bold text-app-text">{run.month} {run.year}</td>
                          <td className="px-6 sm:px-8 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold ${isFullyPaid ? 'bg-ds-success/15 text-ds-success' : isPartiallyPaid ? 'bg-primary/15 text-primary' : 'bg-ds-warning/15 text-ds-warning'}`}>
                              {isFullyPaid ? <><ShieldCheck size={12} /> Paid</> : isPartiallyPaid ? 'Partially paid' : 'Unpaid'}
                            </span>
                          </td>
                          <td className="px-6 sm:px-8 py-4 font-black text-app-text tabular-nums">PKR {formatCurrency(payslip.net_pay)}</td>
                          <td className="px-6 sm:px-8 py-4 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                onClick={openView}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-ds-on-primary text-xs font-bold rounded-xl hover:opacity-90 transition-all"
                              >
                                <Eye size={14} /> View
                              </button>
                              <button
                                onClick={openPrint}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-app-toolbar text-app-text text-xs font-bold rounded-xl hover:bg-app-border transition-all"
                              >
                                <Printer size={14} /> Print
                              </button>
                              <button
                                type="button"
                                onClick={handleWhatsApp}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ds-success/15 text-ds-success text-xs font-bold rounded-xl hover:bg-ds-success/25 transition-all"
                              >
                                <MessageCircle size={14} /> WhatsApp
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History View */}
      {viewMode === 'history' && (
        <div className="bg-app-card rounded-3xl shadow-ds-card border border-app-border overflow-hidden min-h-[500px]">
          <div className="p-8 border-b border-app-border flex items-center justify-between bg-app-toolbar/40">
            <div>
              <h3 className="text-xl font-black text-app-text tracking-tight">Employment History</h3>
              <p className="text-sm text-app-muted font-medium">Timeline of roles, departments, and significant record changes.</p>
            </div>
            <div className="bg-app-card px-4 py-2 rounded-xl border border-app-border text-xs font-bold text-app-muted flex items-center gap-2">
              <Calendar size={16} className="text-primary" /> Since {formatDate(employee.joining_date)}
            </div>
          </div>
          <div className="p-12 max-w-2xl mx-auto">
            <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-app-border before:to-transparent">
              {historyEvents.map((event, index) => (
                <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-app-card bg-app-toolbar/50 group-hover:bg-app-card shadow-ds-card shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 transition-colors">
                    <div className={`text-${event.color}-600`}>{event.icon}</div>
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-3xl bg-app-card border border-app-border shadow-ds-card hover:shadow-md transition-shadow group-hover:border-app-border">
                    <div className="flex items-center justify-between mb-2">
                      <time className="text-[10px] font-black text-app-muted uppercase tracking-widest">
                        {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-${event.color}-50 text-${event.color}-600 border border-${event.color}-100`}>
                        {event.type}
                      </span>
                    </div>
                    <h4 className="font-bold text-app-text mb-1">{event.title}</h4>
                    <p className="text-xs text-app-muted leading-relaxed">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ActionModal 
        isOpen={activeModal !== null} 
        onClose={() => setActiveModal(null)}
        employee={employee}
        type={activeModal as any}
        onConfirm={handleUpdate}
      />

      <AdjustmentModal 
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
        onAdd={handleAddAdjustment}
      />

      {selectedPayslip && (
        <PayslipModal 
          isOpen={!!selectedPayslip} 
          onClose={() => { setSelectedPayslip(null); setSelectedPayslipData(null); }} 
          employee={employee} 
          run={selectedPayslip}
          payslipData={selectedPayslipData}
          initialAction={payslipModalAction}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-app-card rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-100 rounded-xl">
                <AlertCircle size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-app-text">Delete Employee Profile</h3>
                <p className="text-sm text-app-muted font-medium">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-app-text font-medium mb-2">
                Are you sure you want to permanently delete <span className="font-black">{employee.name}</span>'s profile?
              </p>
              <ul className="text-xs text-app-muted space-y-1 ml-4 list-disc">
                <li>All employee records will be removed</li>
                <li>Historical payslips will remain for audit purposes</li>
                <li>This action cannot be reversed</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-app-toolbar text-app-text rounded-xl font-bold hover:bg-app-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteEmployee}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeProfile;
