/**
 * DepartmentConfigModal - Add/Edit department configuration
 */

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Building2, Loader2 } from 'lucide-react';
import { storageService } from '../services/storageService';
import { payrollApi } from '../../../services/api/payrollApi';
import { Department } from '../types';
import { useAuth } from '../../../context/AuthContext';

interface DepartmentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Department | null;
  onSave: (data: Department) => void;
}

const DepartmentConfigModal: React.FC<DepartmentConfigModalProps> = ({ isOpen, onClose, initialData, onSave }) => {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';

  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Department>({
    id: '',
    tenant_id: '',
    name: '',
    description: '',
    is_active: true
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        id: `dept-${Date.now()}`,
        tenant_id: tenantId,
        name: '',
        description: '',
        is_active: true
      });
    }
  }, [initialData, isOpen, tenantId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !userId) return;
    
    setIsSaving(true);
    
    try {
      let savedDepartment: Department;
      
      if (initialData?.id && !initialData.id.startsWith('dept-')) {
        const result = await payrollApi.updateDepartment(initialData.id, {
          name: formData.name,
          description: formData.description,
          is_active: formData.is_active
        });
        savedDepartment = result || { ...formData, tenant_id: tenantId };
      } else {
        const result = await payrollApi.createDepartment({
          name: formData.name,
          description: formData.description,
          is_active: formData.is_active
        });
        savedDepartment = result || { ...formData, tenant_id: tenantId, id: `dept-${Date.now()}` };
      }
      
      storageService.updateDepartment(tenantId, savedDepartment, userId);
      onSave(savedDepartment);
      onClose();
    } catch (error) {
      console.error('Failed to save department to cloud:', error);
      const departmentData: Department = {
        ...formData,
        tenant_id: tenantId
      };
      storageService.updateDepartment(tenantId, departmentData, userId);
      onSave(departmentData);
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
            <Building2 size={20} className="text-primary" />
            <h3 className="font-bold text-app-text">{initialData ? 'Update' : 'Add'} Department</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-app-table-hover rounded-lg transition-colors text-app-muted hover:text-app-text" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Department Name</label>
            <input 
              type="text" 
              required 
              value={formData.name} 
              onChange={(e) => setFormData({...formData, name: e.target.value})} 
              className="w-full px-4 py-2.5 rounded-xl ds-input-field font-medium" 
              placeholder="e.g. Engineering, Marketing" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Description</label>
            <textarea 
              rows={2}
              value={formData.description || ''} 
              onChange={(e) => setFormData({...formData, description: e.target.value})} 
              className="w-full px-4 py-2.5 rounded-xl ds-input-field font-medium resize-none" 
              placeholder="e.g. Software development and technical operations" 
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
              className="w-4 h-4 rounded border-app-border text-primary focus:ring-primary"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-app-text">
              Active (available for selection)
            </label>
          </div>
          <div className="bg-primary/10 p-4 rounded-xl border border-primary/20 flex gap-3">
            <AlertCircle size={20} className="text-primary shrink-0" />
            <p className="text-xs text-app-text leading-relaxed font-medium">
              Departments help organize employees and enable departmental reporting in payroll analytics.
            </p>
          </div>
          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isSaving} 
              className="flex-1 py-3 text-app-text font-bold hover:bg-app-table-hover rounded-xl transition-colors border border-app-border disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSaving} 
              className="flex-1 py-3 bg-primary text-ds-on-primary font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-ds-card disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save size={18} /> Save Department
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DepartmentConfigModal;
