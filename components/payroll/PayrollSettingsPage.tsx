/**
 * PayrollSettingsPage - Configure departments and grade levels for payroll.
 */

import React, { useState, useEffect } from 'react';
import { Building2, Award, Plus, Pencil, Settings } from 'lucide-react';
import { storageService } from './services/storageService';
import { syncPayrollFromServer } from './services/payrollSync';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useAuth } from '../../context/AuthContext';
import { Department, GradeLevel } from './types';
import DepartmentConfigModal from './modals/DepartmentConfigModal';
import GradeConfigModal from './modals/GradeConfigModal';
import { formatCurrency } from './utils/formatters';

const PayrollSettingsPage: React.FC = () => {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';

  const [departments, setDepartments] = useState<Department[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [editingGrade, setEditingGrade] = useState<GradeLevel | null>(null);

  const loadData = () => {
    if (!tenantId) return;
    setDepartments(storageService.getDepartments(tenantId));
    setGrades(storageService.getGradeLevels(tenantId));
  };

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      if (!isLocalOnlyMode()) {
        await syncPayrollFromServer(tenantId);
      }
      loadData();
    };
    void load();
  }, [tenantId]);

  const handleOpenAddDepartment = () => {
    setEditingDepartment(null);
    setDeptModalOpen(true);
  };

  const handleOpenEditDepartment = (dept: Department) => {
    setEditingDepartment(dept);
    setDeptModalOpen(true);
  };

  const handleSaveDepartment = (data: Department) => {
    if (tenantId && userId) {
      storageService.updateDepartment(tenantId, data, userId);
      loadData();
    }
  };

  const handleOpenAddGrade = () => {
    setEditingGrade(null);
    setGradeModalOpen(true);
  };

  const handleOpenEditGrade = (grade: GradeLevel) => {
    setEditingGrade(grade);
    setGradeModalOpen(true);
  };

  const handleSaveGrade = (data: GradeLevel) => {
    if (tenantId && userId) {
      storageService.updateGradeLevel(tenantId, data, userId);
      loadData();
    }
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-app-muted font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4 lg:p-6 xl:p-8 pb-20 sm:pb-24 md:pb-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight flex items-center gap-2">
            <Settings size={24} className="text-app-muted" />
            Payroll Settings
          </h1>
          <p className="text-app-muted text-sm mt-1">
            Configure departments and grade levels used when adding or editing employees.
          </p>
        </div>

        {/* Departments */}
        <div className="bg-app-card rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 bg-app-toolbar/40 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Building2 size={20} className="text-primary" />
              <h2 className="text-lg font-bold text-app-text">Departments</h2>
            </div>
            <button
              type="button"
              onClick={handleOpenAddDepartment}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-ds-on-primary rounded-xl text-sm font-bold hover:opacity-90 transition-colors shadow-ds-card"
            >
              <Plus size={18} /> Add Department
            </button>
          </div>
          <div className="divide-y divide-app-border">
            {departments.length === 0 ? (
              <div className="px-4 sm:px-6 py-10 text-center text-app-muted text-sm">
                No departments yet. Add one to organize employees (e.g. Engineering, Sales, Operations).
              </div>
            ) : (
              departments.map((dept) => (
                <div
                  key={dept.id}
                  className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-app-toolbar/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-app-text">{dept.name}</div>
                    {dept.description && (
                      <div className="text-sm text-app-muted mt-0.5 truncate max-w-md">{dept.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          dept.is_active ? 'bg-ds-success/15 text-ds-success' : 'bg-app-toolbar text-app-muted'
                        }`}
                      >
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEditDepartment(dept)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-app-text hover:bg-app-toolbar rounded-lg text-sm font-medium transition-colors shrink-0"
                  >
                    <Pencil size={16} /> Edit
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Grade Levels */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Award size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Grade Levels</h2>
            </div>
            <button
              type="button"
              onClick={handleOpenAddGrade}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={18} /> Add Grade
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {grades.length === 0 ? (
              <div className="px-4 sm:px-6 py-10 text-center text-slate-400 text-sm">
                No grade levels yet. Add salary bands (e.g. G1, G2, Senior) for employee grades.
              </div>
            ) : (
              grades.map((grade) => (
                <div
                  key={grade.id}
                  className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-app-toolbar/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-app-text">{grade.name}</div>
                    {grade.description && (
                      <div className="text-sm text-app-muted mt-0.5">{grade.description}</div>
                    )}
                    <div className="text-sm text-app-text/90 mt-1">
                      {formatCurrency(grade.min_salary)} – {formatCurrency(grade.max_salary)} (PKR)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEditGrade(grade)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-app-text hover:bg-app-toolbar rounded-lg text-sm font-medium transition-colors shrink-0"
                  >
                    <Pencil size={16} /> Edit
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <DepartmentConfigModal
        isOpen={deptModalOpen}
        onClose={() => { setDeptModalOpen(false); setEditingDepartment(null); }}
        initialData={editingDepartment}
        onSave={handleSaveDepartment}
      />
      <GradeConfigModal
        isOpen={gradeModalOpen}
        onClose={() => { setGradeModalOpen(false); setEditingGrade(null); }}
        initialData={editingGrade}
        onSave={handleSaveGrade}
      />
    </div>
  );
};

export default PayrollSettingsPage;
