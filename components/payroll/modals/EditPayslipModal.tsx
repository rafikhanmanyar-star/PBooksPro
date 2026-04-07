/**
 * EditPayslipModal - Edit payslip amounts, save, or delete (unpaid only).
 */

import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Trash2 } from 'lucide-react';
import { Payslip, PayrollEmployee, normalizePayslip } from '../types';
import { storageService } from '../services/storageService';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import { payrollApi } from '../../../services/api/payrollApi';
import { syncPayrollFromServer } from '../services/payrollSync';

interface EditPayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  payslip: Payslip | null;
  employee: PayrollEmployee | null;
  tenantId: string;
  userId: string;
}

const EditPayslipModal: React.FC<EditPayslipModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onDeleted,
  payslip,
  employee,
  tenantId,
  userId
}) => {
  const [basicPay, setBasicPay] = useState(0);
  const [totalAllowances, setTotalAllowances] = useState(0);
  const [totalDeductions, setTotalDeductions] = useState(0);
  const [totalAdjustments, setTotalAdjustments] = useState(0);
  const [netPay, setNetPay] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (payslip) {
      setBasicPay(payslip.basic_pay);
      setTotalAllowances(payslip.total_allowances);
      setTotalDeductions(payslip.total_deductions);
      setTotalAdjustments(payslip.total_adjustments);
      setNetPay(payslip.net_pay);
    }
  }, [payslip]);

  const grossPay = basicPay + totalAllowances;
  const computedNet = grossPay - totalDeductions + totalAdjustments;

  const handleSave = async () => {
    if (!payslip) return;
    setIsSaving(true);
    try {
      const updated: Payslip = {
        ...payslip,
        basic_pay: basicPay,
        total_allowances: totalAllowances,
        total_deductions: totalDeductions,
        total_adjustments: totalAdjustments,
        gross_pay: grossPay,
        net_pay: computedNet,
        updated_at: new Date().toISOString()
      };
      if (isLocalOnlyMode()) {
        storageService.updatePayslip(tenantId, updated, userId);
      } else {
        const row = await payrollApi.updatePayslip(payslip.id, {
          basic_pay: basicPay,
          total_allowances: totalAllowances,
          total_deductions: totalDeductions,
          total_adjustments: totalAdjustments,
          gross_pay: grossPay,
          net_pay: computedNet,
          allowance_details: updated.allowance_details,
          deduction_details: updated.deduction_details,
          adjustment_details: updated.adjustment_details,
        });
        if (row) {
          const norm = normalizePayslip(row);
          storageService.updatePayslip(tenantId, norm, userId);
        }
        await syncPayrollFromServer(tenantId);
      }
      onSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!payslip) return;
    setIsDeleting(true);
    try {
      let deleted: boolean;
      if (isLocalOnlyMode()) {
        deleted = storageService.deletePayslip(tenantId, payslip.id, userId);
      } else {
        deleted = await payrollApi.deletePayslip(payslip.id, tenantId, userId);
        if (deleted) await syncPayrollFromServer(tenantId);
      }
      if (deleted) {
        onDeleted?.();
        onClose();
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen || !payslip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            Edit payslip {employee ? `– ${employee.name}` : ''}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="edit-payslip-basic-pay" className="block text-sm font-medium text-slate-700 mb-1">Basic pay</label>
            <input
              id="edit-payslip-basic-pay"
              type="number"
              min={0}
              value={basicPay}
              onChange={(e) => setBasicPay(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
              aria-label="Basic pay"
            />
          </div>
          <div>
            <label htmlFor="edit-payslip-total-allowances" className="block text-sm font-medium text-slate-700 mb-1">Total allowances</label>
            <input
              id="edit-payslip-total-allowances"
              type="number"
              min={0}
              value={totalAllowances}
              onChange={(e) => setTotalAllowances(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
              aria-label="Total allowances"
            />
          </div>
          <div>
            <label htmlFor="edit-payslip-total-deductions" className="block text-sm font-medium text-slate-700 mb-1">Total deductions</label>
            <input
              id="edit-payslip-total-deductions"
              type="number"
              min={0}
              value={totalDeductions}
              onChange={(e) => setTotalDeductions(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
              aria-label="Total deductions"
            />
          </div>
          <div>
            <label htmlFor="edit-payslip-total-adjustments" className="block text-sm font-medium text-slate-700 mb-1">Total adjustments</label>
            <input
              id="edit-payslip-total-adjustments"
              type="number"
              value={totalAdjustments}
              onChange={(e) => setTotalAdjustments(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
              aria-label="Total adjustments"
            />
          </div>
          <div className="pt-2 border-t border-slate-200">
            <span className="text-sm font-medium text-slate-600">Net pay: </span>
            <span className="font-bold text-slate-900">{computedNet.toLocaleString()}</span>
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-medium text-amber-800">
              {payslip.is_paid
                ? 'Remove this payslip from the run? Use this if the payment was already deleted from the ledger. The run will be updated and Payment History will refresh.'
                : 'Delete this payslip? You can create it again from Payroll Cycle.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-amber-800 hover:bg-amber-100">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={isDeleting} className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-3">
          <div>
            {!showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 rounded-xl font-medium text-red-600 hover:bg-red-50 flex items-center gap-1.5 text-sm"
              >
                <Trash2 size={16} /> {payslip.is_paid ? 'Remove payslip' : 'Delete payslip'}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditPayslipModal;
