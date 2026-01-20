/**
 * PayslipModal - View employee payslip for a specific payroll run
 */

import React from 'react';
import { X, Download, Printer, ShieldCheck, Building2, Plus, TrendingDown } from 'lucide-react';
import { PayrollEmployee, PayrollRun } from '../types';
import { useAuth } from '../../../context/AuthContext';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: PayrollEmployee;
  run: PayrollRun;
}

const PayslipModal: React.FC<PayslipModalProps> = ({ isOpen, onClose, employee, run }) => {
  const { tenant } = useAuth();
  const companyName = tenant?.companyName || tenant?.name || 'Organization';

  if (!isOpen) return null;

  const basic = employee.salary.basic;
  
  // Calculate allowances
  const allowances = employee.salary.allowances.map(a => ({
    ...a,
    calculated: a.is_percentage ? (basic * a.amount) / 100 : a.amount
  }));
  
  // Get adjustments
  const adjustmentEarnings = (employee.adjustments || []).filter(a => a.type === 'EARNING');
  const adjustmentDeductions = (employee.adjustments || []).filter(a => a.type === 'DEDUCTION');

  // Calculate totals
  const totalEarnings = basic + 
    allowances.reduce((acc, curr) => acc + curr.calculated, 0) + 
    adjustmentEarnings.reduce((acc, curr) => acc + curr.amount, 0);
  
  const recurringGrossForDeductions = basic + allowances.reduce((acc, curr) => acc + curr.calculated, 0);

  const deductions = employee.salary.deductions.map(d => ({
    ...d,
    calculated: d.is_percentage ? (recurringGrossForDeductions * d.amount) / 100 : d.amount
  }));

  const totalDeductions = deductions.reduce((acc, curr) => acc + curr.calculated, 0) + 
    adjustmentDeductions.reduce((acc, curr) => acc + curr.amount, 0);

  const netPay = totalEarnings - totalDeductions;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 no-print-backdrop">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col print-full">
        {/* Header */}
        <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center gap-2">
            <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
              <ShieldCheck size={10} /> Verified Payslip
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.print()}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors" 
              title="Print"
            >
              <Printer size={18} />
            </button>
            <button 
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors" 
              title="Download PDF"
            >
              <Download size={18} />
            </button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-12 space-y-10 print-area">
          {/* Company Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2.5 rounded-xl text-white">
                <Building2 size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{companyName}</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Payroll Department</p>
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Payslip</h1>
              <p className="text-slate-500 font-bold">{run.month} {run.year}</p>
            </div>
          </div>

          {/* Employee Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-y border-slate-100">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee Name</p>
              <p className="font-bold text-slate-900">{employee.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee ID</p>
              <p className="font-bold text-slate-900">{employee.employee_code || employee.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Designation</p>
              <p className="font-bold text-slate-900">{employee.designation}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Joining Date</p>
              <p className="font-bold text-slate-900">{employee.joining_date}</p>
            </div>
          </div>

          {/* Earnings & Deductions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Earnings */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest pb-2 border-b-2 border-slate-900 w-fit">
                Earnings
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  <tr className="group">
                    <td className="py-3 text-slate-600 font-medium">Basic Pay</td>
                    <td className="py-3 text-right font-bold text-slate-900">PKR {basic.toLocaleString()}</td>
                  </tr>
                  {allowances.map((a, i) => (
                    <tr key={i}>
                      <td className="py-3 text-slate-600 font-medium">{a.name}</td>
                      <td className="py-3 text-right font-bold text-slate-900">PKR {a.calculated.toLocaleString()}</td>
                    </tr>
                  ))}
                  {adjustmentEarnings.map((a, i) => (
                    <tr key={`adj-earn-${i}`} className="bg-green-50/30">
                      <td className="py-3 text-green-700 font-bold flex items-center gap-2 italic">
                        <Plus size={12}/> {a.name}
                      </td>
                      <td className="py-3 text-right font-black text-green-700">PKR {a.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/50">
                    <td className="py-4 font-black text-slate-900 uppercase text-[10px]">Total Earnings</td>
                    <td className="py-4 text-right font-black text-slate-900">PKR {totalEarnings.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deductions */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest pb-2 border-b-2 border-slate-900 w-fit">
                Deductions
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  {deductions.map((d, i) => (
                    <tr key={i}>
                      <td className="py-3 text-slate-600 font-medium">{d.name}</td>
                      <td className="py-3 text-right font-bold text-slate-900">PKR {d.calculated.toLocaleString()}</td>
                    </tr>
                  ))}
                  {adjustmentDeductions.map((a, i) => (
                    <tr key={`adj-ded-${i}`} className="bg-red-50/30">
                      <td className="py-3 text-red-700 font-bold flex items-center gap-2 italic">
                        <TrendingDown size={12}/> {a.name}
                      </td>
                      <td className="py-3 text-right font-black text-red-700">-PKR {a.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/50">
                    <td className="py-4 font-black text-slate-900 uppercase text-[10px]">Total Deductions</td>
                    <td className="py-4 text-right font-black text-slate-900">PKR {totalDeductions.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Pay */}
          <div className="bg-slate-900 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between text-white gap-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Net Payable Amount</p>
              <p className="text-4xl font-black">PKR {netPay.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 font-medium italic mb-2">
                Transaction generated from cycle {run.month}-{run.year}
              </p>
              <div className="flex gap-4 no-print">
                <div className="px-4 py-2 bg-white/10 rounded-xl text-xs font-bold border border-white/10">
                  Compliance: ISO 27001
                </div>
                <div className="px-4 py-2 bg-white/10 rounded-xl text-xs font-bold border border-white/10">
                  Mode: Auto-Transfer
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayslipModal;
