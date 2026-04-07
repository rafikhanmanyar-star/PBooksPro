/**
 * BackDateSalaryModal - Select employee, month/year and run salary creation for that period only.
 * Skips if that employee already has a payslip for the run; creates with prorata for joining month; amounts rounded to nearest 100.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, CalendarClock, Loader2, AlertCircle } from 'lucide-react';
import { Payslip } from '../types';
import { runSalaryCreationForPeriodAsync } from '../services/runSalaryCreation';
import { storageService } from '../services/storageService';
import { formatApiErrorMessage } from '../../../services/api/client';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
];

interface BackDateSalaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (runId: string, payslips: Payslip[]) => void;
  tenantId: string;
  userId: string;
}

const BackDateSalaryModal: React.FC<BackDateSalaryModalProps> = ({ isOpen, onClose, onSuccess, tenantId, userId }) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, i) => currentYear - 8 + i);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employees = useMemo(() => {
    if (!tenantId || !isOpen) return [];
    storageService.init(tenantId);
    return storageService.getEmployees(tenantId).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [tenantId, isOpen]);

  useEffect(() => {
    if (!isOpen || employees.length === 0) return;
    setSelectedEmployeeId((prev) => (prev && employees.some((e) => e.id === prev) ? prev : employees[0].id));
  }, [isOpen, employees]);

  const handleRun = async () => {
    setError(null);
    if (!selectedEmployeeId) {
      setError('Select an employee.');
      return;
    }
    setIsRunning(true);
    try {
      if (!tenantId) {
        setError('Tenant not found.');
        setIsRunning(false);
        return;
      }
      const { runId, payslips } = await runSalaryCreationForPeriodAsync(
        tenantId,
        userId,
        selectedYear,
        selectedMonth,
        selectedEmployeeId
      );
      onSuccess(runId, payslips);
      onClose();
    } catch (e: unknown) {
      setError(formatApiErrorMessage(e) || 'Failed to create salary.');
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-blue-600" size={24} />
            <h2 className="text-lg font-bold text-slate-900">Create salary in back date</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Choose one employee and the payroll month. Only that employee gets a payslip for the selected period (if they do not already have one). Joining-month salaries are prorated.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              disabled={employees.length === 0}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
              aria-label="Employee"
            >
              {employees.length === 0 ? (
                <option value="">No employees — add in Workforce first</option>
              ) : (
                employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                    {emp.department ? ` — ${emp.department}` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Month"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Year"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || employees.length === 0 || !selectedEmployeeId}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isRunning ? <Loader2 size={18} className="animate-spin" /> : null}
            {isRunning ? 'Running...' : 'Run salary creation'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackDateSalaryModal;
