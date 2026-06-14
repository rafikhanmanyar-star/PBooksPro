
import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Award, Loader2 } from 'lucide-react';
import { storageService } from '../services/storageService';
import { payrollApi } from '../../../services/api/payrollApi';
import { GradeLevel } from '../types';
import { useAuth } from '../../../context/AuthContext';
import AmountInput from '../../common/AmountInput';

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
        const result = await payrollApi.updateGradeLevel(initialData.id, {
          name: formData.name,
          description: formData.description,
          min_salary: formData.min_salary,
          max_salary: formData.max_salary
        });
        savedGrade = result || { ...formData, tenant_id: tenantId };
      } else {
        const result = await payrollApi.createGradeLevel({
          name: formData.name,
          description: formData.description,
          min_salary: formData.min_salary,
          max_salary: formData.max_salary
        });
        savedGrade = result || { ...formData, tenant_id: tenantId, id: `grade-${Date.now()}` };
      }
      
      storageService.updateGradeLevel(tenantId, savedGrade, userId);
      onSave(savedGrade);
      onClose();
    } catch (error) {
      console.error('Failed to save grade to cloud:', error);
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-app-modal w-full max-w-md rounded-3xl shadow-ds-modal overflow-hidden animate-in zoom-in-95 duration-200 border border-app-border">
        <div className="px-6 py-4 bg-app-toolbar border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={20} className="text-primary" />
            <h3 className="font-bold text-app-text">{initialData ? 'Update' : 'Add'} Grade Level</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-app-table-hover rounded-lg transition-colors text-app-muted hover:text-app-text" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="grade-config-name" className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Grade Name</label>
            <input id="grade-config-name" type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 rounded-xl ds-input-field font-medium" placeholder="e.g. G1, Senior Manager" aria-label="Grade name" />
          </div>
          <div>
            <label htmlFor="grade-config-description" className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Description</label>
            <input id="grade-config-description" type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2.5 rounded-xl ds-input-field font-medium" placeholder="e.g. Individual Contributor" aria-label="Description" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="grade-config-min-salary" className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Min Salary (PKR)</label>
              <AmountInput id="grade-config-min-salary" required value={formData.min_salary} onChange={(e) => setFormData({...formData, min_salary: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 rounded-xl ds-input-field font-medium" aria-label="Minimum salary in PKR" />
            </div>
            <div className="flex-1">
              <label htmlFor="grade-config-max-salary" className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Max Salary (PKR)</label>
              <AmountInput id="grade-config-max-salary" required value={formData.max_salary} onChange={(e) => setFormData({...formData, max_salary: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 rounded-xl ds-input-field font-medium" aria-label="Maximum salary in PKR" />
            </div>
          </div>
          <div className="bg-primary/10 p-4 rounded-xl border border-primary/20 flex gap-3">
            <AlertCircle size={20} className="text-primary shrink-0" />
            <p className="text-xs text-app-text leading-relaxed font-medium">Grade levels help define standard salary bands across the organization.</p>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 py-3 text-app-text font-bold hover:bg-app-table-hover rounded-xl transition-colors border border-app-border disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-primary text-ds-on-primary font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-ds-card disabled:opacity-50">
              {isSaving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Save Grade</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GradeConfigModal;
