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
  ShieldCheck,
  AlertCircle,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  MapPin,
  Award,
  CheckCircle2,
  XCircle,
  PieChart,
  Plus,
  Trash2
} from 'lucide-react';
import { 
  PayrollEmployee, 
  EmploymentStatus, 
  ProjectAllocation, 
  PayrollProject,
  EmployeeFormProps,
  EmployeeSalaryComponent
} from './types';
import { storageService } from './services/storageService';
import { useAuth } from '../../context/AuthContext';

interface SalaryComponentState {
  name: string;
  amount: number;
  is_percentage: boolean;
  isEnabled: boolean;
}

const EmployeeForm: React.FC<EmployeeFormProps> = ({ onBack, onSave, employee }) => {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';

  // Get configuration data
  const earningTemplates = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getEarningTypes(tenantId);
  }, [tenantId]);

  const deductionTemplates = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getDeductionTypes(tenantId);
  }, [tenantId]);

  const availableGrades = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getGradeLevels(tenantId);
  }, [tenantId]);

  const globalProjects = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getProjects(tenantId).filter(p => p.status === 'ACTIVE');
  }, [tenantId]);

  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: employee?.name || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    address: employee?.address || '',
    designation: employee?.designation || '',
    department: employee?.department || 'Engineering',
    grade: employee?.grade || (availableGrades.length > 0 ? availableGrades[0].name : ''),
    joiningDate: employee?.joining_date || new Date().toISOString().split('T')[0],
    basicSalary: employee?.salary.basic || 0,
  });

  const [allowances, setAllowances] = useState<SalaryComponentState[]>([]);
  const [deductions, setDeductions] = useState<SalaryComponentState[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<ProjectAllocation[]>(
    employee?.projects || []
  );

  // Initialize salary components from templates or existing employee
  useEffect(() => {
    if (employee) {
      // Use existing employee's salary components
      setAllowances(employee.salary.allowances.map(a => ({
        name: a.name,
        amount: a.amount,
        is_percentage: a.is_percentage,
        isEnabled: true
      })));
      setDeductions(employee.salary.deductions.map(d => ({
        name: d.name,
        amount: d.amount,
        is_percentage: d.is_percentage,
        isEnabled: true
      })));
    } else {
      // Use templates for new employee
      if (earningTemplates.length > 0) {
        setAllowances(earningTemplates.map(t => ({ 
          name: t.name,
          amount: t.amount,
          is_percentage: t.is_percentage,
          isEnabled: true 
        })));
      }
      if (deductionTemplates.length > 0) {
        setDeductions(deductionTemplates.map(t => ({ 
          name: t.name,
          amount: t.amount,
          is_percentage: t.is_percentage,
          isEnabled: true 
        })));
      }
    }
  }, [employee, earningTemplates, deductionTemplates, tenantId]);

  const handleToggleComponent = (type: 'allowance' | 'deduction', index: number) => {
    if (type === 'allowance') {
      const newArr = [...allowances];
      newArr[index].isEnabled = !newArr[index].isEnabled;
      setAllowances(newArr);
    } else {
      const newArr = [...deductions];
      newArr[index].isEnabled = !newArr[index].isEnabled;
      setDeductions(newArr);
    }
  };

  const handleUpdateComponentAmount = (type: 'allowance' | 'deduction', index: number, val: number) => {
    if (type === 'allowance') {
      const newArr = [...allowances];
      newArr[index].amount = val;
      setAllowances(newArr);
    } else {
      const newArr = [...deductions];
      newArr[index].amount = val;
      setDeductions(newArr);
    }
  };

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
    setAssignedProjects(assignedProjects.filter((_, i) => i !== index));
  };

  const updateProjectAssignment = (index: number, field: keyof ProjectAllocation, value: any) => {
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

  const totalAllocation = assignedProjects.reduce((sum, p) => sum + p.percentage, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantId || !userId) return;

    const employeeData: PayrollEmployee = {
      id: employee?.id || `emp-${Date.now()}`,
      tenant_id: tenantId,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      designation: formData.designation,
      department: formData.department,
      grade: formData.grade,
      status: employee?.status || EmploymentStatus.ACTIVE,
      joining_date: formData.joiningDate,
      salary: {
        basic: formData.basicSalary,
        allowances: allowances
          .filter(a => a.isEnabled)
          .map(({ name, amount, is_percentage }) => ({ name, amount, is_percentage })),
        deductions: deductions
          .filter(d => d.isEnabled)
          .map(({ name, amount, is_percentage }) => ({ name, amount, is_percentage }))
      },
      adjustments: employee?.adjustments || [],
      projects: assignedProjects,
      created_by: employee?.created_by || userId,
      updated_by: employee ? userId : undefined
    };

    if (employee) {
      storageService.updateEmployee(tenantId, employeeData, userId);
    } else {
      storageService.addEmployee(tenantId, employeeData, userId);
    }
    
    onSave();
  };

  const selectedGradeInfo = availableGrades.find(g => g.name === formData.grade);
  const QUICK_PERCENTAGES = [0, 25, 50, 75, 100];

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
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-transparent"
            style={{ borderBottomColor: isPersonalInfoOpen ? '#f1f5f9' : 'transparent' }}
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
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Department</label>
              <select 
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none bg-white font-medium text-sm"
              >
                <option value="Engineering">Engineering</option>
                <option value="Product">Product</option>
                <option value="Sales">Sales</option>
                <option value="HR">Human Resources</option>
                <option value="Operations">Operations</option>
                <option value="Finance">Finance</option>
                <option value="Marketing">Marketing</option>
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
              >
                {availableGrades.map(g => (
                  <option key={g.id} value={g.name}>{g.name} - {g.description}</option>
                ))}
              </select>
              {selectedGradeInfo && (
                <p className="mt-2 text-[10px] font-black uppercase text-blue-600 tracking-widest px-1">
                  Range: PKR {selectedGradeInfo.min_salary.toLocaleString()} - {selectedGradeInfo.max_salary.toLocaleString()}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                <Calendar size={12} className="text-slate-400" /> Joining Date
              </label>
              <input 
                type="date" required
                value={formData.joiningDate}
                onChange={e => setFormData({...formData, joiningDate: e.target.value})}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none transition-all font-medium text-sm"
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
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <select 
                        value={p.project_id}
                        onChange={(e) => updateProjectAssignment(idx, 'project_id', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-black text-sm text-slate-700 outline-none focus:ring-4 ring-indigo-500/10 transition-all"
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
                    
                    <button 
                      type="button"
                      onClick={() => removeProjectAssignment(idx)}
                      className="hidden md:flex p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all self-center mt-6"
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
                      <p className="text-xs font-black text-indigo-900 uppercase tracking-widest">Total Combined Allocation</p>
                      <p className="text-[10px] font-bold text-indigo-600/70 uppercase">Allocation must sum to exactly 100%</p>
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

        {/* Salary Setup */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <DollarSign size={14} className="text-emerald-600" /> Salary Setup
            </h3>
            <span className="text-[10px] font-black text-slate-400 uppercase bg-white border border-slate-200 px-2 py-1 rounded-lg">Customize Components</span>
          </div>
          
          <div className="p-8 space-y-10">
            <div className="max-w-xs">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Base Salary (Monthly) <span className="text-red-500">*</span></label>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4">
              {/* Allowances */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-tighter flex items-center gap-2">
                  <Building2 size={12} className="text-blue-500" /> Allowances
                </h4>
                <div className="space-y-3">
                  {allowances.map((a, idx) => (
                    <div 
                      key={idx} 
                      className={`relative flex flex-col p-4 rounded-2xl border transition-all ${a.isEnabled ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-slate-700">{a.name}</span>
                        <button 
                          type="button"
                          onClick={() => handleToggleComponent('allowance', idx)}
                          className={`p-1 rounded-lg transition-colors ${a.isEnabled ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-400 hover:bg-slate-200'}`}
                        >
                          {a.isEnabled ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black">{a.is_percentage ? '%' : 'PKR'}</div>
                          <input 
                            type="number"
                            value={a.amount}
                            disabled={!a.isEnabled}
                            onChange={(e) => handleUpdateComponentAmount('allowance', idx, parseFloat(e.target.value) || 0)}
                            className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-100 focus:border-blue-300 outline-none text-sm font-black disabled:bg-transparent"
                          />
                        </div>
                        {a.is_percentage && a.isEnabled && (
                          <div className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            = PKR {((formData.basicSalary * a.amount) / 100).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-tighter flex items-center gap-2">
                  <ShieldCheck size={12} className="text-red-500" /> Deductions
                </h4>
                <div className="space-y-3">
                  {deductions.map((d, idx) => (
                    <div 
                      key={idx} 
                      className={`relative flex flex-col p-4 rounded-2xl border transition-all ${d.isEnabled ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-slate-700">{d.name}</span>
                        <button 
                          type="button"
                          onClick={() => handleToggleComponent('deduction', idx)}
                          className={`p-1 rounded-lg transition-colors ${d.isEnabled ? 'text-red-600 hover:bg-red-50' : 'text-slate-400 hover:bg-slate-200'}`}
                        >
                          {d.isEnabled ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black">{d.is_percentage ? '%' : 'PKR'}</div>
                          <input 
                            type="number"
                            value={d.amount}
                            disabled={!d.isEnabled}
                            onChange={(e) => handleUpdateComponentAmount('deduction', idx, parseFloat(e.target.value) || 0)}
                            className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-100 focus:border-red-300 outline-none text-sm font-black disabled:bg-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 sm:p-6 bg-blue-50/50 rounded-2xl sm:rounded-3xl border border-blue-100/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900">Final Verification</p>
              <p className="text-xs text-blue-700 hidden sm:block">Individual component changes here apply only to this employee record.</p>
            </div>
          </div>
          <div className="flex gap-3 sm:gap-4 w-full lg:w-auto">
            <button 
              type="button" 
              onClick={onBack}
              className="flex-1 lg:flex-none px-4 sm:px-8 py-2.5 sm:py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-xl sm:rounded-2xl transition-colors text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={assignedProjects.length > 0 && totalAllocation !== 100}
              className="flex-1 lg:flex-none px-4 sm:px-10 py-2.5 sm:py-3 bg-blue-600 text-white font-black rounded-xl sm:rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 text-sm"
            >
              <Save size={18} /> <span className="hidden sm:inline">{employee ? 'Save Changes' : 'Complete Onboarding'}</span><span className="sm:hidden">Save</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default EmployeeForm;
