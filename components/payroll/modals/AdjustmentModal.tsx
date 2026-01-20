/**
 * AdjustmentModal - Add bonus or deduction adjustments
 */

import React, { useState } from 'react';
import { X, Save, Gift, AlertCircle, TrendingDown } from 'lucide-react';
import { SalaryAdjustment, AdjustmentType } from '../types';
import { useAuth } from '../../../context/AuthContext';

interface AdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (adjustment: SalaryAdjustment) => void;
}

const AdjustmentModal: React.FC<AdjustmentModalProps> = ({ isOpen, onClose, onAdd }) => {
  const { user } = useAuth();
  const userId = user?.id || 'unknown';

  const [formData, setFormData] = useState({
    name: '',
    amount: 0,
    type: 'EARNING' as 'EARNING' | 'DEDUCTION'
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: `adj-${Date.now()}`,
      name: formData.name,
      amount: formData.amount,
      type: formData.type as AdjustmentType,
      date_added: new Date().toISOString(),
      created_by: userId
    });
    setFormData({ name: '', amount: 0, type: 'EARNING' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${formData.type === 'EARNING' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {formData.type === 'EARNING' ? <Gift size={20} /> : <TrendingDown size={20} />}
            </div>
            <h3 className="font-bold text-xl text-slate-900">Add Adjustment</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Adjustment Reason / Title
            </label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Quarterly Bonus" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 ring-blue-500/10 outline-none font-bold text-slate-700" 
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Type</label>
              <select 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value as any})} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-700"
              >
                <option value="EARNING">Bonus / Incentive</option>
                <option value="DEDUCTION">Penalty / Advance</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount (PKR)</label>
              <input 
                type="number" 
                required 
                value={formData.amount} 
                onChange={e => setFormData({...formData, amount: parseFloat(e.target.value) || 0})} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 font-black text-slate-900" 
              />
            </div>
          </div>
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
            <AlertCircle className="text-amber-500 shrink-0" size={18} />
            <p className="text-xs text-amber-800 font-medium leading-relaxed">
              This is a <strong>one-time adjustment</strong>. It will be included in the very next payroll cycle run.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="flex-1 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
            >
              <Save size={18} /> Add to Next Run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdjustmentModal;
