/**
 * EmployeeForm - Add/Edit employee form
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserPlus, 
  ArrowLeft, 
  Save, 
  Briefcase, 
  Building2, 
  DollarSign, 
  AlertCircle,
  User,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  MapPin,
  Award,
  CheckCircle2,
  PieChart,
  Plus,
  Trash2,
  Loader2
} from 'lucide-react';
import { 
  PayrollEmployee, 
  EmploymentStatus, 
  ProjectAllocation, 
  BuildingAllocation,
  PayrollProject,
  EmployeeFormProps,
} from './types';
import { storageService } from './services/storageService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { payrollApi } from '../../services/api/payrollApi';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { formatCurrency } from './utils/formatters';
import {
  allocationChanged,
  allocationChangeOnlyAffectsFutureAllocations,
  getLatestPayslipPeriodEndYyyyMmDd,
  normalizeAllocationsTotal,
  redistributeProjectBuildingShares,
} from './utils/allocationPercentages';
import { mapAppProjectsToPayroll } from './utils/projectUtils';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';
import DatePicker from '../ui/DatePicker';

const EmployeeForm: React.FC<EmployeeFormProps> = ({ onBack, onSave, employee }) => {
  const { user, tenant } = useAuth();
  const { state: appState } = useAppContext();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';

  // Departments and grades - fetch from API with localStorage fallback
  const [availableDepartments, setAvailableDepartments] = useState<{ id: string; name: string }[]>([]);
  const [availableGrades, setAvailableGrades] = useState<{ id: string; name: string; description?: string; min_salary?: number; max_salary?: number }[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!tenantId) return;
      try {
        const [depts, grades] = await Promise.all([
          payrollApi.getDepartments(),
          payrollApi.getGradeLevels(),
        ]);
        if (depts.length > 0) {
          setAvailableDepartments(depts.filter((d: any) => d.is_active !== false).map((d: any) => ({ id: d.id, name: d.name })));
        } else {
          const fromStorage = storageService.getDepartments(tenantId).filter(d => d.is_active);
          setAvailableDepartments(fromStorage.map(d => ({ id: d.id, name: d.name })));
        }
        if (grades.length > 0) {
          setAvailableGrades(grades.map((g: any) => ({ id: g.id, name: g.name, description: g.description, min_salary: g.min_salary, max_salary: g.max_salary })));
        } else {
          const fromStorage = storageService.getGradeLevels(tenantId);
          setAvailableGrades(fromStorage.map(g => ({ id: g.id, name: g.name, description: g.description, min_salary: g.min_salary, max_salary: g.max_salary })));
        }
      } catch {
        setAvailableDepartments(storageService.getDepartments(tenantId).filter(d => d.is_active).map(d => ({ id: d.id, name: d.name })));
        setAvailableGrades(storageService.getGradeLevels(tenantId).map(g => ({ id: g.id, name: g.name, description: g.description, min_salary: g.min_salary, max_salary: g.max_salary })));
      }
    };
    fetchConfig();
  }, [tenantId]);

  // Projects state - from Settings → Assets → Projects (AppContext in local-only, API otherwise)
  const [globalProjects, setGlobalProjects] = useState<PayrollProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // In local-only mode, use projects from AppContext (same as Settings → Assets → Projects)
  useEffect(() => {
    if (!isLocalOnlyMode() || !appState.projects) return;
    const payrollProjects = mapAppProjectsToPayroll(appState.projects, tenantId);
    const activeProjects = payrollProjects.filter(p => p.status === 'ACTIVE');
    setGlobalProjects(activeProjects);
    if (payrollProjects.length > 0) {
      storageService.setProjectsCache(payrollProjects);
    }
  }, [tenantId, appState.projects]);

  // When not local-only, fetch projects from main application API
  useEffect(() => {
    if (isLocalOnlyMode() || !tenantId) return;
    const fetchProjects = async () => {
      setIsLoadingProjects(true);
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
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchProjects();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tenantId]);

  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: employee?.name || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    address: employee?.address || '',
    designation: employee?.designation || '',
    department: employee?.department || 'General',
    grade: employee?.grade || '',
    joiningDate: employee?.joining_date || toLocalDateString(new Date()),
    basicSalary: employee?.salary?.basic || 0,
  });

  const [assignedProjects, setAssignedProjects] = useState<ProjectAllocation[]>(
    employee?.projects || []
  );
  const [assignedBuildings, setAssignedBuildings] = useState<BuildingAllocation[]>(
    employee?.buildings || []
  );

  // Update department/grade defaults when config loads (new employees only)
  useEffect(() => {
    if (employee || availableDepartments.length === 0) return;
    setFormData(f => {
      if (f.department === 'General' && availableDepartments[0]) {
        return { ...f, department: availableDepartments[0].name };
      }
      if (!f.grade && availableGrades[0]) {
        return { ...f, grade: availableGrades[0].name };
      }
      return f;
    });
  }, [availableDepartments, availableGrades, employee]);

  const addProjectAssignment = () => {
    if (globalProjects.length === 0) return;
    const project = globalProjects[0];
    const newAlloc: ProjectAllocation = {
      project_id: project.id,
      project_name: project.name,
      percentage: assignedProjects.length === 0 ? 100 : 0,
      start_date: formData.joiningDate
    };
    setAssignedProjects([...assignedProjects, newAlloc]);
  };

  const removeProjectAssignment = (index: number) => {
    const nextProjects = assignedProjects.filter((_, i) => i !== index);
    const { projects, buildings } = normalizeAllocationsTotal(nextProjects, assignedBuildings);
    setAssignedProjects(projects);
    setAssignedBuildings(buildings);
  };

  const updateProjectAssignment = (index: number, field: keyof ProjectAllocation, value: any) => {
    if (field === 'percentage') {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      const { projects, buildings } = redistributeProjectBuildingShares(
        assignedProjects,
        assignedBuildings,
        { type: 'project', index },
        num
      );
      setAssignedProjects(projects);
      setAssignedBuildings(buildings);
      return;
    }
    const updated = [...assignedProjects];
    if (field === 'project_id') {
      const gp = globalProjects.find(p => p.id === value);
      if (gp) {
        updated[index].project_id = gp.id;
        updated[index].project_name = gp.name;
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setAssignedProjects(updated);
  };

  const totalProjectAllocation = assignedProjects.reduce((sum, p) => sum + p.percentage, 0);
  const totalBuildingAllocation = assignedBuildings.reduce((sum, b) => sum + b.percentage, 0);
  const totalAllocation = totalProjectAllocation + totalBuildingAllocation;

  const globalBuildings = useMemo(() => (appState.buildings || []).map(b => ({ id: b.id, name: b.name })), [appState.buildings]);

  const addBuildingAssignment = () => {
    if (globalBuildings.length === 0) return;
    const building = globalBuildings[0];
    const newAlloc: BuildingAllocation = {
      building_id: building.id,
      building_name: building.name,
      percentage: assignedBuildings.length === 0 ? (assignedProjects.length > 0 ? 0 : 100) : 0,
      start_date: formData.joiningDate,
    };
    setAssignedBuildings([...assignedBuildings, newAlloc]);
  };

  const removeBuildingAssignment = (index: number) => {
    const nextBuildings = assignedBuildings.filter((_, i) => i !== index);
    const { projects, buildings } = normalizeAllocationsTotal(assignedProjects, nextBuildings);
    setAssignedProjects(projects);
    setAssignedBuildings(buildings);
  };

  const updateBuildingAssignment = (index: number, field: keyof BuildingAllocation, value: any) => {
    if (field === 'percentage') {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      const { projects, buildings } = redistributeProjectBuildingShares(
        assignedProjects,
        assignedBuildings,
        { type: 'building', index },
        num
      );
      setAssignedProjects(projects);
      setAssignedBuildings(buildings);
      return;
    }
    const updated = [...assignedBuildings];
    if (field === 'building_id') {
      const b = globalBuildings.find(x => x.id === value);
      if (b) {
        updated[index].building_id = b.id;
        updated[index].building_name = b.name;
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setAssignedBuildings(updated);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantId || !userId) return;

    setIsSaving(true);
    setSaveError(null);

    const salaryData = {
      basic: formData.basicSalary,
      allowances: [],
      deductions: []
    };

    try {
      if (employee) {
        // Update existing employee
        const selectedDeptId = availableDepartments.find(d => d.name === formData.department)?.id ?? employee.department_id ?? null;
        const updateData = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          designation: formData.designation,
          department: formData.department,
          department_id: selectedDeptId,
          grade: formData.grade,
          joining_date: formData.joiningDate,
          salary: salaryData,
          projects: assignedProjects,
          buildings: assignedBuildings,
          adjustments: employee.adjustments
        };

        const proposedEmployee = { ...employee, ...updateData } as PayrollEmployee;
        if (allocationChanged(employee, proposedEmployee)) {
          const pays = storageService.getPayslips(tenantId).filter((p) => p.employee_id === employee.id);
          if (pays.length > 0) {
            const lockedEnd = getLatestPayslipPeriodEndYyyyMmDd(
              pays,
              storageService.getPayrollRuns(tenantId),
              employee.id
            );
            const allowFutureOnly =
              lockedEnd != null &&
              allocationChangeOnlyAffectsFutureAllocations(employee, proposedEmployee, lockedEnd);
            if (!allowFutureOnly) {
              setSaveError(
                'This employee has payslips on record. Delete their payslips in Payroll Cycle before changing project or building assignments or effective dates that affect past payroll periods.'
              );
              setIsSaving(false);
              return;
            }
          }
        }

        // Try API first
        try {
          await payrollApi.updateEmployee(employee.id, updateData);
        } catch (apiError) {
          console.warn('API update failed, falling back to localStorage:', apiError);
          // Fallback to localStorage
          const employeeData: PayrollEmployee = {
            ...employee,
            ...updateData,
            updated_by: userId
          };
          storageService.updateEmployee(tenantId, employeeData, userId);
        }
      } else {
        // Create new employee - generate ID upfront so API and localStorage use same ID (enables sync on later update)
        const newEmployeeId = `emp-${Date.now()}`;
        const selectedDeptId = availableDepartments.find(d => d.name === formData.department)?.id ?? null;
        const createData = {
          id: newEmployeeId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          designation: formData.designation,
          department: formData.department,
          department_id: selectedDeptId,
          grade: formData.grade,
          joining_date: formData.joiningDate,
          salary: salaryData,
          projects: assignedProjects,
          buildings: assignedBuildings
        };

        // Try API first to save to cloud database
        try {
          const createdEmployee = await payrollApi.createEmployee(createData as any);
          if (createdEmployee) {
            // Update localStorage cache only when using API (in local-only, createEmployee already added to storage)
            if (!isLocalOnlyMode()) {
              storageService.addEmployee(tenantId, createdEmployee, userId);
            }
          }
        } catch (apiError) {
          console.warn('API create failed, falling back to localStorage:', apiError);
          
          // Generate employee code in format EID-0001, EID-0002, etc.
          const existingEmployees = storageService.getEmployees(tenantId);
          const eidEmployees = existingEmployees.filter(e => e.employee_code?.startsWith('EID-'));
          let employeeCode = 'EID-0001';
          
          if (eidEmployees.length > 0) {
            const codes = eidEmployees.map(e => {
              const match = e.employee_code?.match(/EID-(\d+)/);
              return match ? parseInt(match[1]) : 0;
            });
            const maxNumber = Math.max(...codes);
            employeeCode = `EID-${(maxNumber + 1).toString().padStart(4, '0')}`;
          }
          
          // Fallback to localStorage only (same ID as createData for later sync)
          const employeeData: PayrollEmployee = {
            id: newEmployeeId,
            tenant_id: tenantId,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            designation: formData.designation,
            department: formData.department,
            department_id: selectedDeptId ?? undefined,
            grade: formData.grade,
            status: EmploymentStatus.ACTIVE,
            joining_date: formData.joiningDate,
            employee_code: employeeCode,
            salary: salaryData,
            adjustments: [],
            projects: assignedProjects,
            buildings: assignedBuildings,
            created_by: userId
          };
          storageService.addEmployee(tenantId, employeeData, userId);
        }
      }

      onSave();
    } catch (error) {
      console.error('Error saving employee:', error);
      setSaveError('Failed to save employee. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedGradeInfo = availableGrades.find((g: any) => g.name === formData.grade);
  const QUICK_PERCENTAGES = [0, 25, 50, 75, 100];

  // Net salary = basic salary (simplified - no components)
  const netSalary = formData.basicSalary || 0;

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button onClick={onBack} className="text-blue-600 hover:underline flex items-center gap-1 font-bold group text-sm">
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Workforce
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-xl text-blue-600 hidden sm:block">
            <UserPlus size={20} />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {employee ? 'Edit Employee' : 'Onboard New Employee'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information (Collapsible) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300">
          <button 
            type="button"
            onClick={() => setIsPersonalInfoOpen(!isPersonalInfoOpen)}
            className={`w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors border-b ${isPersonalInfoOpen ? 'border-slate-100' : 'border-transparent'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl transition-colors ${isPersonalInfoOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <User size={18} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Personal Information</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Optional details for employee records</p>
              </div>
            </div>
            {isPersonalInfoOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>

          <div className={`transition-all duration-300 ease-in-out ${isPersonalInfoOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
            <div className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 bg-slate-50/30">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <Mail size={12} className="text-slate-400" /> Professional Email
                </label>
                <input 
                  type="email" placeholder="john.doe@company.com"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none transition-all font-medium bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <Phone size={12} className="text-slate-400" /> Phone Number
                </label>
                <input 
                  type="tel" placeholder="+92 3XX XXXXXXX"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none transition-all font-medium bg-white text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <MapPin size={12} className="text-slate-400" /> Residential Address
                </label>
                <textarea 
                  rows={2}
                  placeholder="Street address, City, Province"
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none transition-all font-medium bg-white resize-none text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-8 py-4 sm:py-5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Briefcase size={14} className="text-blue-600" /> Employment Details
            </h3>
          </div>
          <div className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Full Name <span className="text-red-500">*</span></label>
              <input 
                type="text" required placeholder="Full Name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none transition-all font-medium text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Designation <span className="text-red-500">*</span></label>
              <input 
                type="text" required placeholder="Senior Engineer"
                value={formData.designation}
                onChange={e => setFormData({...formData, designation: e.target.value})}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none transition-all font-medium text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                <Building2 size={12} className="text-slate-400" /> Department
              </label>
              <select 
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none bg-white font-medium text-sm"
                aria-label="Department"
              >
                {availableDepartments.length > 0 ? (
                  availableDepartments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))
                ) : (
                  <>
                    <option value="General">General</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Product">Product</option>
                    <option value="Sales">Sales</option>
                    <option value="Operations">Operations</option>
                    <option value="Finance">Finance</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                <Award size={12} className="text-slate-400" /> Grade Level
              </label>
              <select 
                value={formData.grade}
                onChange={e => setFormData({...formData, grade: e.target.value})}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none bg-white font-medium text-sm"
                aria-label="Grade Level"
              >
                {availableGrades.length > 0 ? (
                  availableGrades.map((g: any) => (
                    <option key={g.id} value={g.name}>{g.name}{g.description ? ` - ${g.description}` : ''}</option>
                  ))
                ) : (
                  <>
                    <option value="">Select grade</option>
                    <option value="Junior">Junior</option>
                    <option value="Mid">Mid</option>
                    <option value="Senior">Senior</option>
                    <option value="Lead">Lead</option>
                  </>
                )}
              </select>
              {selectedGradeInfo && (
                <p className="mt-2 text-[10px] font-black uppercase text-blue-600 tracking-widest px-1">
                  Range: PKR {formatCurrency(selectedGradeInfo.min_salary)} - {formatCurrency(selectedGradeInfo.max_salary)}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <DatePicker
                label="Joining Date"
                value={formData.joiningDate}
                onChange={(d) => setFormData({ ...formData, joiningDate: toLocalDateString(d) })}
                required
                className="!rounded-xl !border-slate-200 !font-medium !text-sm"
              />
            </div>
          </div>
        </div>

        {/* Project Allocation */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <PieChart size={14} className="text-indigo-600" /> Project Allocation
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Balance employee cost across multiple active projects</p>
            </div>
            <button 
              type="button"
              onClick={addProjectAssignment}
              disabled={globalProjects.length === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              <Plus size={14} className="inline mr-1" /> Assign Project
            </button>
          </div>
          <div className="p-8 space-y-6">
            {assignedProjects.length === 0 ? (
              <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <PieChart size={32} className="mx-auto text-slate-300 mb-2 opacity-50" />
                <p className="text-slate-400 text-sm font-medium">No projects assigned yet. Costs will go to General overhead.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {assignedProjects.map((p, idx) => (
                  <div key={idx} className="group relative flex flex-col md:flex-row items-start gap-6 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-200 transition-all">
                    <div className="flex-1 w-full space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Active Project</label>
                        <button 
                          type="button"
                          onClick={() => removeProjectAssignment(idx)}
                          className="md:hidden text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                          aria-label="Remove project assignment"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <select 
                        value={p.project_id}
                        onChange={(e) => updateProjectAssignment(idx, 'project_id', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-black text-sm text-slate-700 outline-none focus:ring-4 ring-indigo-500/10 transition-all"
                        aria-label="Select Active Project"
                      >
                        {globalProjects.map(gp => (
                          <option key={gp.id} value={gp.id}>{gp.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="w-full md:w-80 space-y-4">
                      <div className="flex justify-between items-end">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost Share</label>
                          <p className="text-[10px] text-slate-400 font-medium">Step: 5%</p>
                        </div>
                        <span className="text-xl font-black text-indigo-600">{p.percentage}%</span>
                      </div>
                      
                      <div className="space-y-3">
                        <input 
                          type="range" min="0" max="100" step="5"
                          value={p.percentage}
                          onChange={(e) => updateProjectAssignment(idx, 'percentage', parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          aria-label="Project cost share percentage"
                        />
                        <div className="flex justify-between gap-1">
                          {QUICK_PERCENTAGES.map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => updateProjectAssignment(idx, 'percentage', val)}
                              className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all border ${
                                p.percentage === val 
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 scale-105 z-10' 
                                : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200 hover:text-indigo-600'
                              }`}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="w-full md:w-52 shrink-0">
                      <DatePicker
                        label="Effective from"
                        value={parseStoredDateToYyyyMmDdInput(p.start_date || formData.joiningDate)}
                        onChange={(d) => updateProjectAssignment(idx, 'start_date', toLocalDateString(d))}
                        className="!rounded-xl !border-slate-200 !font-bold !text-sm"
                      />
                    </div>
                    
                    <button 
                      type="button"
                      onClick={() => removeProjectAssignment(idx)}
                      className="hidden md:flex p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all self-center mt-6"
                      aria-label="Remove project assignment"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
                
                <div className="flex items-center justify-between p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 mt-8">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${totalAllocation === 100 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                      {totalAllocation === 100 ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    </div>
                    <div>
                      <p className="text-xs font-black text-indigo-900 uppercase tracking-widest">Total Combined Allocation (Projects + Buildings)</p>
                      <p className="text-[10px] font-bold text-indigo-600/70 uppercase">Must sum to exactly 100%</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-black tracking-tighter ${totalAllocation === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                      {totalAllocation}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Building Allocation */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-5 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Building2 size={14} className="text-slate-600" /> Building Allocation
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Assign employee cost to buildings (Settings → Buildings)</p>
            </div>
            <button 
              type="button"
              onClick={addBuildingAssignment}
              disabled={globalBuildings.length === 0}
              className="px-4 py-2 bg-slate-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-all shadow-lg shadow-slate-100 disabled:opacity-50"
            >
              <Plus size={14} className="inline mr-1" /> Assign Building
            </button>
          </div>
          <div className="p-8 space-y-6">
            {assignedBuildings.length === 0 ? (
              <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <Building2 size={32} className="mx-auto text-slate-300 mb-2 opacity-50" />
                <p className="text-slate-400 text-sm font-medium">No buildings assigned. Add buildings in Settings if needed.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {assignedBuildings.map((b, idx) => (
                  <div key={idx} className="group relative flex flex-col md:flex-row items-start gap-6 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-slate-200 transition-all">
                    <div className="flex-1 w-full space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Building</label>
                        <button type="button" onClick={() => removeBuildingAssignment(idx)} className="md:hidden text-red-500 hover:bg-red-50 p-1.5 rounded-lg" aria-label="Remove building assignment">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <select 
                        value={b.building_id}
                        onChange={(e) => updateBuildingAssignment(idx, 'building_id', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-black text-sm text-slate-700 outline-none focus:ring-4 ring-slate-500/10"
                        aria-label="Select Building"
                      >
                        {globalBuildings.map(gb => (
                          <option key={gb.id} value={gb.id}>{gb.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full md:w-80 space-y-4">
                      <div className="flex justify-between items-end">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost Share</label>
                        <span className="text-xl font-black text-slate-600">{b.percentage}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" step="5"
                        value={b.percentage}
                        onChange={(e) => updateBuildingAssignment(idx, 'percentage', parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        aria-label="Building cost share percentage"
                      />
                      <div className="flex justify-between gap-1">
                        {QUICK_PERCENTAGES.map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateBuildingAssignment(idx, 'percentage', val)}
                            className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all border ${
                              b.percentage === val ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            {val}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="w-full md:w-52 shrink-0">
                      <DatePicker
                        label="Effective from"
                        value={parseStoredDateToYyyyMmDdInput(b.start_date || formData.joiningDate)}
                        onChange={(d) => updateBuildingAssignment(idx, 'start_date', toLocalDateString(d))}
                        className="!rounded-xl !border-slate-200 !font-bold !text-sm"
                      />
                    </div>

                    <button type="button" onClick={() => removeBuildingAssignment(idx)} className="hidden md:flex p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl self-center mt-6" aria-label="Remove building assignment">
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between p-6 bg-slate-50/50 rounded-3xl border border-slate-100 mt-8">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Projects + Buildings total</p>
                  <span className={`text-2xl font-black ${totalAllocation === 100 ? 'text-green-600' : 'text-amber-600'}`}>{totalAllocation}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Salary - Simple: Basic salary only */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <DollarSign size={14} className="text-emerald-600" /> Monthly Salary
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">Basic pay per month. Net pay = basic salary.</p>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Basic Salary (Monthly) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">PKR</div>
                  <input 
                    type="number" required placeholder="0.00"
                    value={formData.basicSalary}
                    onChange={e => setFormData({...formData, basicSalary: parseFloat(e.target.value) || 0})}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-emerald-500/10 outline-none transition-all font-black text-lg text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Net Payable</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">PKR</div>
                  <input 
                    type="text"
                    readOnly
                    value={netSalary.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border outline-none transition-all font-black text-lg cursor-not-allowed bg-emerald-50 border-emerald-200 text-emerald-700"
                    aria-label="Net Payable"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 sm:p-6 bg-blue-50/50 rounded-2xl sm:rounded-3xl border border-blue-100/50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${saveError ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              <AlertCircle size={20} />
            </div>
            <div>
              {saveError ? (
                <>
                  <p className="text-sm font-bold text-red-900">Error Saving</p>
                  <p className="text-xs text-red-700">{saveError}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-blue-900">Final Verification</p>
                  <p className="text-xs text-blue-700 hidden sm:block">Individual component changes here apply only to this employee record.</p>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-3 sm:gap-4 w-full lg:w-auto">
            <button 
              type="button" 
              onClick={onBack}
              disabled={isSaving}
              className="flex-1 lg:flex-none px-4 sm:px-8 py-2.5 sm:py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-xl sm:rounded-2xl transition-colors text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving || ((assignedProjects.length > 0 || assignedBuildings.length > 0) && totalAllocation !== 100)}
              className="flex-1 lg:flex-none px-4 sm:px-10 py-2.5 sm:py-3 bg-blue-600 text-white font-black rounded-xl sm:rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 text-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> <span className="hidden sm:inline">Saving...</span><span className="sm:hidden">Saving</span>
                </>
              ) : (
                <>
                  <Save size={18} /> <span className="hidden sm:inline">{employee ? 'Save Changes' : 'Complete Onboarding'}</span><span className="sm:hidden">Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default EmployeeForm;
