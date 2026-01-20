
import React, { useState, useEffect, useContext } from 'react';
import { X, Save, AlertCircle, Percent, DollarSign as DollarIcon } from 'lucide-react';
import { storageService } from '../services/storageService';
import { AppContext } from '../../../App';

interface SalaryConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'earning' | 'deduction';
  initialData?: any;
  onSave: (data: any) => void;
}

const SalaryConfigModal: React.FC<SalaryConfigModalProps> = ({ isOpen, onClose, type, initialData, onSave }) => {
  const context = useContext(AppContext);
  const currentTenant = context?.currentTenant;

  const [formData, setFormData] = useState({
    name: '',
    isPercentage: false,
    amount: 0,
    frequency: 'Monthly',
    isStatutory: false
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        isPercentage: initialData.isPercentage || false,
        amount: initialData.amount || 0,
        frequency: initialData.frequency || 'Monthly',
        isStatutory: initialData.isStatutory || false
      });
    } else {
      setFormData({
        name: '',
        isPercentage: false,
        amount: 0,
        frequency: 'Monthly',
        isStatutory: false
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Fix: Pass currentUser.id to satisfy storageService requirements
    if (currentTenant && context?.currentUser) {
      if (type === 'earning') {
        storageService.updateEarningType(currentTenant.id, formData, context.currentUser.id);
      } else {
        storageService.updateDeductionType(currentTenant.id, formData, context.currentUser.id);
      }
    }
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 capitalize">Configure {type} Rule</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Component Name</label>
            <input type="text" required value={formData.name} disabled={!!initialData} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-medium text-slate-700 disabled:bg-slate-50 disabled:text-slate-400" placeholder="e.g. Travel Allowance" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Calculation Type</label>
              <div className="flex p-1 bg-slate-100 rounded-xl">
                <button type="button" onClick={() => setFormData({...formData, isPercentage: false})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${!formData.isPercentage ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><DollarIcon size={14} /> Fixed</button>
                <button type="button" onClick={() => setFormData({...formData, isPercentage: true})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${formData.isPercentage ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Percent size={14} /> Percent</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{formData.isPercentage ? 'Rate (%)' : 'Amount (PKR)'}</label>
              <input type="number" required value={formData.amount} onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-medium text-slate-700" />
            </div>
          </div>
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
            <AlertCircle size={20} className="text-blue-500 shrink-0" /><p className="text-xs text-blue-700 leading-relaxed font-medium">Changes to this rule will apply globally to all employees using this {type}. Historical data remains locked for audit purposes.</p>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors border border-slate-200">Cancel</button>
            <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"><Save size={18} /> Save Component</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalaryConfigModal;
