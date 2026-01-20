
import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Award, Loader2 } from 'lucide-react';
import { storageService } from '../services/storageService';
import { payrollApi } from '../../../services/api/payrollApi';
import { GradeLevel } from '../types';
import { useAuth } from '../../../context/AuthContext';

interface GradeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: GradeLevel | null;
  onSave: (data: GradeLevel) => void;
}

const GradeConfigModal: React.FC<GradeConfigModalProps> = ({ isOpen, onClose, initialData, onSave }) => {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';

  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<GradeLevel>({
    id: '',
    tenant_id: '',
    name: '',
    description: '',
    min_salary: 0,
    max_salary: 0
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        id: `grade-${Date.now()}`,
        tenant_id: tenantId,
        name: '',
        description: '',
        min_salary: 0,
        max_salary: 0
      });
    }
  }, [initialData, isOpen, tenantId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !userId) return;
    
    setIsSaving(true);
    
    try {
      let savedGrade: GradeLevel;
      
      if (initialData?.id && !initialData.id.startsWith('grade-')) {
        // Update existing grade in cloud DB
        const result = await payrollApi.updateGradeLevel(initialData.id, {
          name: formData.name,
          description: formData.description,
          min_salary: formData.min_salary,
          max_salary: formData.max_salary
        });
        savedGrade = result || { ...formData, tenant_id: tenantId };
      } else {
        // Create new grade in cloud DB
        const result = await payrollApi.createGradeLevel({
          name: formData.name,
          description: formData.description,
          min_salary: formData.min_salary,
          max_salary: formData.max_salary
        });
        savedGrade = result || { ...formData, tenant_id: tenantId, id: `grade-${Date.now()}` };
      }
      
      // Also update localStorage as cache
      storageService.updateGradeLevel(tenantId, savedGrade, userId);
      onSave(savedGrade);
      onClose();
    } catch (error) {
      console.error('Failed to save grade to cloud:', error);
      // Fallback to local storage only
      const gradeData: GradeLevel = {
        ...formData,
        tenant_id: tenantId
      };
      storageService.updateGradeLevel(tenantId, gradeData, userId);
      onSave(gradeData);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2"><Award size={20} className="text-blue-600" /><h3 className="font-bold text-slate-900">{initialData ? 'Update' : 'Add'} Grade Level</h3></div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Grade Name</label>
            <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-medium text-slate-700" placeholder="e.g. G1, Senior Manager" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Description</label>
            <input type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-medium text-slate-700" placeholder="e.g. Individual Contributor" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1"><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Min Salary (PKR)</label><input type="number" required value={formData.min_salary} onChange={(e) => setFormData({...formData, min_salary: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-medium text-slate-700" /></div>
            <div className="flex-1"><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Max Salary (PKR)</label><input type="number" required value={formData.max_salary} onChange={(e) => setFormData({...formData, max_salary: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-medium text-slate-700" /></div>
          </div>
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3"><AlertCircle size={20} className="text-blue-500 shrink-0" /><p className="text-xs text-blue-700 leading-relaxed font-medium">Grade levels help define standard salary bands across the organization.</p></div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors border border-slate-200 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-50">
              {isSaving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Save Grade</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GradeConfigModal;
