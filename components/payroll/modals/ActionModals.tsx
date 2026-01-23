/**
 * ActionModal - Handle employee actions (promote, transfer, terminate)
 */

import React, { useState, useMemo } from 'react';
import { X, TrendingUp, MapPin, Skull, Save } from 'lucide-react';
import { PayrollEmployee, EmploymentStatus, Department } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../../../context/AuthContext';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: PayrollEmployee;
  onConfirm: (updatedEmployee: PayrollEmployee) => void;
  type: 'promote' | 'transfer' | 'terminate';
}

export const ActionModal: React.FC<ActionModalProps> = ({ isOpen, onClose, employee, onConfirm, type }) => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';

  const availableDepartments = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getDepartments(tenantId).filter(d => d.is_active);
  }, [tenantId]);

  const [formData, setFormData] = useState({
    designation: employee.designation,
    department: employee.department,
    grade: employee.grade,
    // Convert to number if string (handles database DECIMAL types)
    basicSalary: typeof employee.salary.basic === 'string' ? parseFloat(employee.salary.basic) : employee.salary.basic,
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
  });

  if (!isOpen || !type) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = { ...employee };
    
    if (type === 'promote') {
      updated.designation = formData.designation;
      updated.grade = formData.grade;
      updated.salary = {
        ...updated.salary,
        basic: formData.basicSalary
      };
    } else if (type === 'transfer') {
      updated.department = formData.department;
    } else if (type === 'terminate') {
      updated.status = EmploymentStatus.TERMINATED;
      updated.termination_date = formData.effectiveDate;
    }
    
    onConfirm(updated);
    onClose();
  };

  const getTitle = () => {
    switch(type) {
      case 'promote': return { text: 'Promote Employee', icon: <TrendingUp className="text-blue-600" /> };
      case 'transfer': return { text: 'Transfer Department', icon: <MapPin className="text-purple-600" /> };
      case 'terminate': return { text: 'Offboard Employee', icon: <Skull className="text-red-600" /> };
    }
  };

  const info = getTitle();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">{info.icon}</div>
            <h3 className="font-bold text-xl text-slate-900">{info.text}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Employee Info */}
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center font-bold text-slate-400 uppercase">
              {employee.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <p className="font-bold text-slate-900">{employee.name}</p>
              <p className="text-xs font-medium text-slate-500">{employee.designation} • {employee.department}</p>
            </div>
          </div>

          {/* Promotion Fields */}
          {type === 'promote' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">New Designation</label>
                <input 
                  type="text" 
                  required 
                  value={formData.designation} 
                  onChange={e => setFormData({...formData, designation: e.target.value})} 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 ring-blue-500/20" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">New Grade</label>
                <input 
                  type="text" 
                  required 
                  value={formData.grade} 
                  onChange={e => setFormData({...formData, grade: e.target.value})} 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 ring-blue-500/20" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">New Basic Salary (PKR)</label>
                <input 
                  type="number" 
                  required 
                  value={formData.basicSalary} 
                  onChange={e => setFormData({...formData, basicSalary: parseFloat(e.target.value)})} 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 ring-blue-500/20" 
                />
              </div>
            </div>
          )}

          {/* Transfer Fields */}
          {type === 'transfer' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Target Department</label>
              <select 
                value={formData.department} 
                onChange={e => setFormData({...formData, department: e.target.value})} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 ring-blue-500/20 bg-white"
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
          )}

          {/* Terminate Fields */}
          {type === 'terminate' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Effective Date</label>
                <input 
                  type="date" 
                  required 
                  value={formData.effectiveDate} 
                  onChange={e => setFormData({...formData, effectiveDate: e.target.value})} 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 ring-red-500/20" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Reason (Optional)</label>
                <textarea 
                  value={formData.reason} 
                  onChange={e => setFormData({...formData, reason: e.target.value})} 
                  placeholder="Enter reason for termination..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 ring-red-500/20 resize-none" 
                />
              </div>
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                <p className="text-xs text-red-800 font-medium">
                  <strong>Warning:</strong> This action will mark the employee as terminated and they will be excluded from future payroll runs.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all"
            >
              Discard Changes
            </button>
            <button 
              type="submit" 
              className={`flex-1 py-4 rounded-2xl text-white font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                type === 'terminate' 
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-100' 
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
              }`}
            >
              <Save size={20} /> {type === 'terminate' ? 'Process Termination' : 'Confirm Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ActionModal;
