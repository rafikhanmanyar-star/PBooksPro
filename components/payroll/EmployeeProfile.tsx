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
  Printer
} from 'lucide-react';
import { 
  PayrollEmployee, 
  EmploymentStatus, 
  ProjectAllocation, 
  PayrollStatus, 
  PayrollRun, 
  SalaryAdjustment, 
  PayrollProject,
  EmployeeProfileProps
} from './types';
import { ActionModal } from './modals/ActionModals';
import { storageService } from './services/storageService';
import PayslipModal from './modals/PayslipModal';
import AdjustmentModal from './modals/AdjustmentModal';
import { useAuth } from '../../context/AuthContext';

const EmployeeProfile: React.FC<EmployeeProfileProps> = ({ employee: initialEmployee, onBack }) => {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';
  
  const [employee, setEmployee] = useState<PayrollEmployee>(initialEmployee);
  const [activeModal, setActiveModal] = useState<'promote' | 'transfer' | 'terminate' | null>(null);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'payslips' | 'history' | 'edit'>('details');
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRun | null>(null);
  const [availableRuns, setAvailableRuns] = useState<PayrollRun[]>([]);
  const [editFormData, setEditFormData] = useState<Partial<PayrollEmployee>>({});
  const [globalProjects, setGlobalProjects] = useState<PayrollProject[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableGrades = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getGradeLevels(tenantId);
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      const runs = storageService.getPayrollRuns(tenantId).filter(r => r.status === PayrollStatus.PAID);
      setAvailableRuns(runs);
      setGlobalProjects(storageService.getProjects(tenantId).filter(p => p.status === 'ACTIVE'));
    }
  }, [tenantId]);

  const getStatusColor = (status: EmploymentStatus) => {
    switch (status) {
      case EmploymentStatus.ACTIVE: return 'bg-green-100 text-green-700 border-green-200';
      case EmploymentStatus.TERMINATED: return 'bg-red-100 text-red-700 border-red-200';
      case EmploymentStatus.RESIGNED: return 'bg-orange-100 text-orange-700 border-orange-200';
      case EmploymentStatus.ON_LEAVE: return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const calculateGross = () => {
    const allowances = employee.salary.allowances.reduce((acc, curr) => {
      return acc + (curr.is_percentage ? (employee.salary.basic * curr.amount) / 100 : curr.amount);
    }, 0);
    const earningsAdjustments = (employee.adjustments || [])
      .filter(a => a.type === 'EARNING')
      .reduce((acc, curr) => acc + curr.amount, 0);
    return employee.salary.basic + allowances + earningsAdjustments;
  };

  const calculateNet = () => {
    const grossWithoutAdjs = employee.salary.basic + employee.salary.allowances.reduce((acc, curr) => {
      return acc + (curr.is_percentage ? (employee.salary.basic * curr.amount) / 100 : curr.amount);
    }, 0);
    
    const gross = calculateGross();
    const deductions = employee.salary.deductions.reduce((acc, curr) => {
      return acc + (curr.is_percentage ? (grossWithoutAdjs * curr.amount) / 100 : curr.amount);
    }, 0);

    const deductionAdjustments = (employee.adjustments || [])
      .filter(a => a.type === 'DEDUCTION')
      .reduce((acc, curr) => acc + curr.amount, 0);
    return gross - deductions - deductionAdjustments;
  };

  const handleUpdate = (updated: PayrollEmployee) => {
    if (tenantId && userId) {
      storageService.updateEmployee(tenantId, updated, userId);
      setEmployee(updated);
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
    const updatedProjects = [...employee.projects];
    updatedProjects[index].percentage = percent;
    handleUpdate({ ...employee, projects: updatedProjects });
  };

  const addProject = () => {
    const firstProject = globalProjects[0];
    const newProject: ProjectAllocation = {
      project_id: firstProject ? firstProject.id : `prj-${Date.now()}`,
      project_name: firstProject ? firstProject.name : 'New Assignment',
      percentage: 0,
      start_date: new Date().toISOString().split('T')[0]
    };
    handleUpdate({ ...employee, projects: [...employee.projects, newProject] });
  };

  const removeProject = (index: number) => {
    const updatedProjects = employee.projects.filter((_, i) => i !== index);
    handleUpdate({ ...employee, projects: updatedProjects });
  };

  const totalAllocation = employee.projects.reduce((a, b) => a + b.percentage, 0);

  const startEditing = () => {
    setEditFormData({
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      address: employee.address,
      designation: employee.designation,
      department: employee.department,
      grade: employee.grade,
      photo: employee.photo,
      salary: { ...employee.salary }
    });
    setViewMode('edit');
  };

  const saveEdit = () => {
    const updatedEmployee = {
      ...employee,
      ...editFormData
    } as PayrollEmployee;
    handleUpdate(updatedEmployee);
    setViewMode('details');
  };

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
        description: `${adj.name} adjustment for PKR ${adj.amount.toLocaleString()}. Action by: ${adj.created_by}`,
        icon: adj.type === 'EARNING' ? <TrendingUp size={16} /> : <TrendingDown size={16} />,
        color: adj.type === 'EARNING' ? 'emerald' : 'amber'
      }))
    ];
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [employee]);

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20 animate-in fade-in duration-300">
      {/* Header Actions */}
      <div className="flex items-center justify-between no-print">
        <button 
          onClick={viewMode !== 'details' ? () => setViewMode('details') : onBack} 
          className="text-blue-600 hover:underline flex items-center gap-1 font-bold group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> 
          {viewMode !== 'details' ? 'Back to Profile' : 'Back to Workforce'}
        </button>
        <div className="flex gap-2">
          {viewMode === 'details' && (
            <>
              <button 
                onClick={() => window.print()}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors font-bold text-sm flex items-center gap-2"
                title="Print Profile Summary"
              >
                <Printer size={16} className="text-slate-600" />
              </button>
              <button 
                onClick={startEditing}
                className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors font-bold text-sm flex items-center gap-2"
              >
                <Edit3 size={16} className="text-slate-600" /> Edit Profile
              </button>
              <button 
                onClick={() => setIsAdjustmentModalOpen(true)}
                disabled={employee.status !== EmploymentStatus.ACTIVE}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors font-bold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Plus size={16} /> Add Bonus
              </button>
              <button 
                onClick={() => setActiveModal('promote')}
                disabled={employee.status !== EmploymentStatus.ACTIVE}
                className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors font-bold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <TrendingUp size={16} className="text-blue-600" /> Promote
              </button>
              {employee.status === EmploymentStatus.ACTIVE && (
                <button 
                  onClick={() => setActiveModal('terminate')}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-colors font-bold text-sm"
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
                className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveEdit}
                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-black text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <Save size={16} /> Save Changes
              </button>
            </>
          )}
        </div>
      </div>

      {/* Profile Details View */}
      {viewMode === 'details' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print-full">
          <div className="h-32 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 no-print"></div>
          <div className="px-8 pb-8 -mt-16 print:mt-0">
            {/* Profile Header */}
            <div className="flex flex-col md:flex-row items-end gap-6 mb-10 print:items-start">
              <div className="w-32 h-32 bg-slate-100 rounded-3xl border-4 border-white shadow-xl overflow-hidden flex items-center justify-center relative print:shadow-none print:border-slate-100">
                {employee.photo ? (
                  <img src={employee.photo} alt={employee.name} className="w-full h-full object-cover" />
                ) : (
                  <UserCircle size={80} className="text-slate-300" />
                )}
                {employee.status === EmploymentStatus.ACTIVE && (
                  <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white no-print"></div>
                )}
              </div>
              <div className="flex-1 pb-2">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">{employee.name}</h2>
                <div className="flex flex-wrap gap-4 mt-2 text-slate-500 font-bold text-sm">
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg">
                    <Briefcase size={16} className="text-blue-500" /> {employee.designation}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg">
                    <Building2 size={16} className="text-purple-500" /> {employee.department}
                  </span>
                  <span className={`px-4 py-1 rounded-full text-xs font-black border uppercase tracking-widest ${getStatusColor(employee.status)}`}>
                    {employee.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print-full">
              <div className="lg:col-span-2 space-y-8 print:w-full">
                {/* Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2 truncate">
                      <Mail size={14} className="text-slate-400 shrink-0" /> {employee.email || 'Not provided'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone Number</p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Phone size={14} className="text-slate-400 shrink-0" /> {employee.phone || 'Not provided'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grade Level</p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Award size={14} className="text-slate-400 shrink-0" /> {employee.grade}
                    </p>
                  </div>
                </div>

                {/* Salary Structure */}
                <div className="bg-slate-50/50 rounded-3xl p-8 border border-slate-200/60 print:border-slate-100 print-card">
                  <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl no-print"><DollarSign size={20} /></div>
                    Salary Structure
                  </h3>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center py-4 border-b border-slate-200 print:border-slate-100">
                      <div>
                        <span className="font-bold text-slate-900">Basic Pay</span>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Guaranteed Fixed</p>
                      </div>
                      <span className="text-xl font-black text-slate-900">PKR {employee.salary.basic.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Earnings/Allowances</p>
                        {employee.salary.allowances.map((a, i) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm print:shadow-none">
                            <span className="text-sm font-bold text-slate-700">{a.name}</span>
                            <span className="text-green-600 font-black">
                              +{a.is_percentage ? `${a.amount}%` : `PKR ${a.amount.toLocaleString()}`}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Statutory Deductions</p>
                        {employee.salary.deductions.map((d, i) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm print:shadow-none">
                            <span className="text-sm font-bold text-slate-700">{d.name}</span>
                            <span className="text-red-500 font-black">
                              -{d.is_percentage ? `${d.amount}%` : `PKR ${d.amount.toLocaleString()}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Project Allocation */}
                <div className="bg-white rounded-3xl p-8 border border-slate-200 print:border-slate-100 print-card">
                  <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl no-print"><PieChart size={20} /></div>
                        Project Cost Allocation
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight pl-0 md:pl-12 print:pl-0">Cost distribution among organizational entities</p>
                    </div>
                    <button 
                      onClick={addProject}
                      disabled={globalProjects.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 no-print"
                    >
                      <Plus size={14} /> Assign
                    </button>
                  </div>
                  <div className="space-y-8">
                    {employee.projects.length === 0 ? (
                      <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm font-medium">No projects assigned to this employee.</p>
                      </div>
                    ) : employee.projects.map((p, i) => (
                      <div key={i} className="group relative flex flex-col md:flex-row items-start gap-8 p-6 rounded-3xl bg-slate-50/50 hover:bg-white border border-slate-100 hover:border-indigo-200 transition-all">
                        <div className="flex-1 w-full space-y-4">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Organizational Project</label>
                          <div className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-700 print:border-slate-100">
                            {p.project_name}
                          </div>
                        </div>

                        <div className="w-full md:w-80 space-y-4">
                          <div className="flex justify-between items-end">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Share Percentage</label>
                            <span className="text-2xl font-black text-indigo-600 tracking-tighter">{p.percentage}%</span>
                          </div>
                          
                          <div className="space-y-3 no-print">
                            <input 
                              type="range" min="0" max="100" step="5"
                              value={p.percentage}
                              onChange={(e) => handleProjectShareChange(i, parseInt(e.target.value))}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>
                        </div>

                        <button 
                          onClick={() => removeProject(i)}
                          className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all self-center md:mt-6 no-print"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                    
                    {employee.projects.length > 0 && (
                      <div className="p-6 bg-slate-900 rounded-3xl flex items-center justify-between text-white mt-8 print:bg-slate-100 print:text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl no-print ${totalAllocation === 100 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {totalAllocation === 100 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-slate-500">Total Combined Allocation</p>
                            <p className="text-xs font-bold text-slate-300 print:text-slate-500">Sum of all projects must be 100%</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-3xl font-black tracking-tighter ${totalAllocation === 100 ? 'text-green-400 print:text-green-600' : 'text-amber-400 print:text-amber-600'}`}>
                            {totalAllocation}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6 print:mt-10">
                {/* Net Pay Card */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-800 text-white rounded-3xl p-8 shadow-2xl shadow-blue-200 relative overflow-hidden print:bg-slate-900 print:shadow-none">
                  <div className="relative z-10">
                    <p className="text-blue-100 text-xs font-black uppercase tracking-widest opacity-80 print:text-slate-300">Net Take Home</p>
                    <p className="text-5xl font-black mt-2 leading-none">PKR {calculateNet().toLocaleString()}</p>
                    <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-200 font-medium">Monthly Gross</span>
                        <span className="font-bold">PKR {calculateGross().toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-200 font-medium">Annual CTC</span>
                        <span className="font-bold">PKR {(calculateGross() * 12).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl no-print"></div>
                </div>

                {/* Actions */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 no-print">
                  <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-widest text-center border-b border-slate-50 pb-4">Actions</h4>
                  <div className="space-y-2">
                    <button 
                      onClick={() => setViewMode('payslips')}
                      className="w-full flex items-center justify-between p-4 text-sm font-bold rounded-2xl hover:bg-slate-50 transition-all border border-slate-100 group"
                    >
                      <span className="flex items-center gap-3"><FileText size={18} className="text-slate-400" /> Past Payslips</span>
                      <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                    <button 
                      onClick={() => setViewMode('history')}
                      className="w-full flex items-center justify-between p-4 text-sm font-bold rounded-2xl hover:bg-slate-50 transition-all border border-slate-100 group"
                    >
                      <span className="flex items-center gap-3"><History size={18} className="text-slate-400" /> Tenure History</span>
                      <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
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
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Edit Profile</h3>
              <p className="text-sm text-slate-500 font-medium">Update employment and personal information for {employee.name}.</p>
            </div>
          </div>
          
          <div className="p-8 lg:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              {/* Photo Upload */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="w-48 h-48 bg-slate-100 rounded-3xl border-4 border-slate-50 shadow-inner overflow-hidden flex items-center justify-center">
                    {editFormData.photo ? (
                      <img src={editFormData.photo} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle size={100} className="text-slate-300" />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-slate-900/40 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                  />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center max-w-[180px]">
                  Click to upload a professional headshot. Max 5MB recommended.
                </p>
              </div>

              {/* Form Fields */}
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Full Legal Name</label>
                    <input 
                      type="text" 
                      value={editFormData.name || ''}
                      onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Work Email</label>
                    <input 
                      type="email" 
                      value={editFormData.email || ''}
                      onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Phone Number</label>
                    <input 
                      type="text" 
                      value={editFormData.phone || ''}
                      onChange={e => setEditFormData({...editFormData, phone: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Residential Address</label>
                    <textarea 
                      rows={2}
                      value={editFormData.address || ''}
                      onChange={e => setEditFormData({...editFormData, address: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700 resize-none"
                    />
                  </div>
                </div>

                <div className="h-px bg-slate-100"></div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Current Designation</label>
                    <input 
                      type="text" 
                      value={editFormData.designation || ''}
                      onChange={e => setEditFormData({...editFormData, designation: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Department</label>
                    <select 
                      value={editFormData.department || ''}
                      onChange={e => setEditFormData({...editFormData, department: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700 bg-white"
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
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Grade Level</label>
                    <select 
                      value={editFormData.grade || ''}
                      onChange={e => setEditFormData({...editFormData, grade: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700 bg-white"
                    >
                      {availableGrades.map(g => (
                        <option key={g.id} value={g.name}>{g.name} - {g.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Basic Salary (Monthly)</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">PKR</div>
                      <input 
                        type="number" 
                        value={editFormData.salary?.basic || 0}
                        onChange={e => setEditFormData({
                          ...editFormData, 
                          salary: { ...editFormData.salary!, basic: parseFloat(e.target.value) || 0 }
                        })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-black text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payslips View */}
      {viewMode === 'payslips' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Payslip History</h3>
              <p className="text-sm text-slate-500 font-medium">View and download historical payment documents for {employee.name}.</p>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center gap-2">
              <ShieldCheck size={16} className="text-green-500" /> Compliance Verified
            </div>
          </div>
          <div className="p-0">
            {availableRuns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                <FileText size={64} className="mb-4 opacity-20" />
                <p className="font-bold">No payslips generated yet.</p>
                <p className="text-xs">Once a payroll cycle is marked as PAID, documents will appear here.</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-5">Period</th>
                    <th className="px-8 py-5">Payout Status</th>
                    <th className="px-8 py-5">Net Amount</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {availableRuns.map((run) => (
                    <tr key={run.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-5 font-bold text-slate-900">{run.month} {run.year}</td>
                      <td className="px-8 py-5">
                        <span className="flex items-center gap-1.5 text-green-600 font-bold text-xs uppercase tracking-widest">
                          <ShieldCheck size={14} /> Transferred
                        </span>
                      </td>
                      <td className="px-8 py-5 font-black text-slate-700">PKR {calculateNet().toLocaleString()}</td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => setSelectedPayslip(run)}
                          className="px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex items-center gap-2 ml-auto"
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* History View */}
      {viewMode === 'history' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Employment History</h3>
              <p className="text-sm text-slate-500 font-medium">Timeline of roles, departments, and significant record changes.</p>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center gap-2">
              <Calendar size={16} className="text-blue-500" /> Since {employee.joining_date}
            </div>
          </div>
          <div className="p-12 max-w-2xl mx-auto">
            <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {historyEvents.map((event, index) => (
                <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-50 group-hover:bg-white shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 transition-colors">
                    <div className={`text-${event.color}-600`}>{event.icon}</div>
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow group-hover:border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <time className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-${event.color}-50 text-${event.color}-600 border border-${event.color}-100`}>
                        {event.type}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1">{event.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{event.description}</p>
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
          onClose={() => setSelectedPayslip(null)} 
          employee={employee} 
          run={selectedPayslip} 
        />
      )}
    </div>
  );
};

export default EmployeeProfile;
