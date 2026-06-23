/**
 * PayrollSettingsPage - Configure departments and grade levels (system configuration layout).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Building2, PenLine, PenTool, Megaphone, Plus, Pencil } from 'lucide-react';
import { storageService } from './services/storageService';
import { syncPayrollFromServer } from './services/payrollSync';
import { useAuth } from '../../context/AuthContext';
import { Department, GradeLevel, PayrollEmployee, EmploymentStatus } from './types';
import DepartmentConfigModal from './modals/DepartmentConfigModal';
import GradeConfigModal from './modals/GradeConfigModal';
import { formatCurrency } from './utils/formatters';
import LeaveTypeSettings from './leave/LeaveTypeSettings';
import WorkWeekSettings from './settings/WorkWeekSettings';
import GLDefaultsSettings from './settings/GLDefaultsSettings';
import EarningDeductionTypeSettings from './settings/EarningDeductionTypeSettings';

const DEPT_ICONS = [PenLine, PenTool, Megaphone, Building2, PenLine];

const sectionCardClass =
  'bg-app-card rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card overflow-hidden';

function countStaffInDepartment(employees: PayrollEmployee[], dept: Department): number {
  return employees.filter((emp) => {
    if (emp.status && emp.status !== EmploymentStatus.ACTIVE) return false;
    if (emp.department_id && emp.department_id === dept.id) return true;
    const name = (emp.department_name || emp.department || '').trim();
    return !emp.department_id && name === dept.name.trim();
  }).length;
}

function gradeCodeLabel(grade: GradeLevel, index: number): string {
  const raw = (grade.name || '').trim();
  const m = raw.match(/^(G\s*\d+)/i);
  if (m) return m[1].replace(/\s+/g, '').toUpperCase();
  return `G${index + 1}`;
}

function gradeTitle(grade: GradeLevel): string {
  if (grade.description?.trim()) return grade.description.trim();
  const name = (grade.name || '').trim();
  if (name.includes(',')) {
    const after = name.split(/,\s*/).slice(1).join(', ').trim();
    if (after) return after;
  }
  const dash = name.split(/[-–—]\s*/);
  if (dash.length > 1) return dash.slice(1).join(' – ').trim();
  if (/^G\d+$/i.test(name)) return name;
  return name || '—';
}

function gradeMultiplier(grade: GradeLevel): string {
  const { min_salary, max_salary } = grade;
  if (min_salary > 0 && max_salary > 0) {
    return `${(max_salary / min_salary).toFixed(1)}X`;
  }
  if (min_salary > 0) return '1.0X';
  return '—';
}

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
              await syncPayrollFromServer(tenantId, { source: 'payroll-settings' });
      loadData();
    };
    void load();
  }, [tenantId]);

  const staffCountByDeptId = useMemo(() => {
    if (!tenantId) return new Map<string, number>();
    const employees = storageService.getEmployees(tenantId);
    const map = new Map<string, number>();
    for (const d of departments) {
      const fromApi = typeof d.employee_count === 'number' ? d.employee_count : null;
      const local = fromApi != null ? fromApi : countStaffInDepartment(employees, d);
      map.set(d.id, local);
    }
    return map;
  }, [tenantId, departments]);

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
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 sm:mb-10">
          <p className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] text-ds-warning uppercase mb-2">
            Organization architecture
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-app-text tracking-tight font-serif">
            System Configuration
          </h1>
          <p className="text-app-muted text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
            Manage the foundational structures of your editorial organization. Define departments and specify
            professional grade levels for payroll calculation.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* Departments */}
          <section className={sectionCardClass} aria-label="Departments">
            <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-app-border">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-app-text font-serif">Departments</h2>
                <p className="text-sm text-app-muted mt-0.5">Operational units within the organization.</p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddDepartment}
                className="self-start sm:self-auto text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                Add Department
              </button>
            </div>
            <div className="px-3 sm:px-4 pb-4 sm:pb-5 pt-2">
              {departments.length === 0 ? (
                <div className="px-2 py-8 text-center text-app-muted text-sm bg-app-toolbar/40 rounded-2xl border border-app-border">
                  No departments yet. Add one to organize employees (e.g. Engineering, Sales, Operations).
                </div>
              ) : (
                <ul className="space-y-1">
                  {departments.map((dept, i) => {
                    const Icon = DEPT_ICONS[i % DEPT_ICONS.length];
                    const n = staffCountByDeptId.get(dept.id) ?? 0;
                    return (
                      <li key={dept.id}>
                        <div
                          className={`flex items-center gap-3 sm:gap-4 rounded-xl px-3 py-3 sm:px-3.5 ${
                            dept.is_active === false ? 'opacity-50' : ''
                          } hover:bg-app-table-hover transition-colors group`}
                        >
                          <div
                            className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
                            aria-hidden
                          >
                            <Icon className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-app-text truncate">{dept.name}</div>
                            <div className="text-sm text-app-muted">
                              {n} Staff Member{n === 1 ? '' : 's'}
                            </div>
                            {dept.description && (
                              <div className="text-xs text-app-muted/80 mt-0.5 truncate max-w-sm">{dept.description}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenEditDepartment(dept)}
                            className="shrink-0 p-2 text-app-muted hover:text-app-text hover:bg-app-toolbar rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                            aria-label={`Edit ${dept.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Grade levels */}
          <section className={sectionCardClass} aria-label="Grade levels">
            <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-app-border">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-app-text font-serif">Grade Levels</h2>
                <p className="text-sm text-app-muted mt-0.5">Hierarchical compensation tiers.</p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddGrade}
                className="self-start sm:self-auto text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                Add Grade
              </button>
            </div>

            <div className="px-3 sm:px-4 pb-4 sm:pb-5 pt-2">
              {grades.length === 0 ? (
                <div className="py-8 text-center text-app-muted text-sm bg-app-toolbar/40 rounded-2xl border border-app-border">
                  No grade levels yet. Add salary bands (e.g. G1, G2, Senior) for employee grades.
                </div>
              ) : (
                <ul className="space-y-3">
                  {grades.map((grade, index) => (
                    <li key={grade.id}>
                      <div className="flex items-stretch gap-3 bg-app-toolbar/30 rounded-xl sm:rounded-2xl border border-app-border shadow-sm px-3 py-3 sm:px-4 sm:py-3.5 hover:bg-app-table-hover transition-colors group">
                        <div
                          className="flex h-12 w-12 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--badge-partial-bg)] text-[color:var(--badge-partial-text)] font-bold text-sm tabular-nums"
                          title="Grade code"
                        >
                          {gradeCodeLabel(grade, index)}
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col justify-center gap-2">
                          <p className="font-bold text-app-text leading-snug">{gradeTitle(grade)}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full bg-app-toolbar px-2.5 py-0.5 text-xs font-medium text-app-muted border border-app-border">
                              BASE: {formatCurrency(grade.min_salary, true)}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary border border-primary/20">
                              MULTIPLIER: {gradeMultiplier(grade)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenEditGrade(grade)}
                          className="self-center shrink-0 p-2 text-app-muted hover:text-app-text hover:bg-app-toolbar rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                          aria-label={`Edit ${grade.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className={`${sectionCardClass} mt-6 p-4 sm:p-5`}>
          <LeaveTypeSettings />
        </section>

        <section className={`${sectionCardClass} mt-6 p-4 sm:p-5`}>
          <WorkWeekSettings />
        </section>

        <section className={`${sectionCardClass} mt-6 p-5 sm:p-6`} aria-label="Salary component types">
          <div className="mb-5 border-b border-app-border pb-4">
            <h2 className="text-lg sm:text-xl font-bold text-app-text font-serif">Salary Component Types</h2>
            <p className="text-sm text-app-muted mt-0.5">Earning and deduction types available for employee salary structures.</p>
          </div>
          <EarningDeductionTypeSettings />
        </section>

        <section className={`${sectionCardClass} mt-6 p-5 sm:p-6`} aria-label="GL defaults">
          <div className="mb-5 border-b border-app-border pb-4">
            <h2 className="text-lg sm:text-xl font-bold text-app-text font-serif">Payroll GL Defaults</h2>
            <p className="text-sm text-app-muted mt-0.5">Default GL account, category, and project for payroll expense transactions.</p>
          </div>
          <GLDefaultsSettings />
        </section>
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
