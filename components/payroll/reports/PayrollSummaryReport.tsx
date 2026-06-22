import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';
import payrollReportsApi from '../../../services/api/payrollReportsApi';
import PayrollReportShell, { PeriodFilters } from './PayrollReportShell';
import { formatReportCurrency } from '../utils/payrollReportExport';

type Summary = {
  employees_processed: number;
  total_gross_payroll: number;
  total_deductions: number;
  total_net_payroll: number;
  total_paid: number;
  outstanding_liability: number;
  average_salary: number;
  department_breakdown: Array<{
    department: string;
    employee_count: number;
    gross_pay: number;
    net_pay: number;
    paid: number;
    outstanding: number;
  }>;
};

const PayrollSummaryReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll-report', 'summary', month, year],
    enabled: isApi,
    queryFn: async () => {
      const resp = await payrollReportsApi.getSummary({ month, year });
      return resp?.summary as Summary;
    },
  });

  const s = q.data;

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">Summary report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="Payroll Summary"
      subtitle="Management overview for the selected period."
      loading={q.isLoading}
      error={q.error ? (q.error as Error).message : null}
      companyName={tenant?.companyName ?? tenant?.name}
      filters={<PeriodFilters month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />}
    >
      {s && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              ['Employees', String(s.employees_processed)],
              ['Gross Payroll', formatReportCurrency(s.total_gross_payroll)],
              ['Net Payroll', formatReportCurrency(s.total_net_payroll)],
              ['Total Paid', formatReportCurrency(s.total_paid)],
              ['Deductions', formatReportCurrency(s.total_deductions)],
              ['Outstanding', formatReportCurrency(s.outstanding_liability)],
              ['Avg Salary', formatReportCurrency(s.average_salary)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl border border-app-border p-3 bg-app-card">
                <p className="text-[10px] font-bold uppercase text-app-muted tracking-wider">{label}</p>
                <p className="text-lg font-black text-app-text mt-1">{val}</p>
              </div>
            ))}
          </div>
          <h4 className="text-sm font-bold mb-2">Department Breakdown</h4>
          <div className="overflow-x-auto rounded-xl border border-app-border">
            <table className="min-w-full text-sm">
              <thead className="bg-app-muted/10 text-[10px] uppercase text-app-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-right">Employees</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {s.department_breakdown.map((d) => (
                  <tr key={d.department} className="border-t border-app-border">
                    <td className="px-3 py-2 font-medium">{d.department}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.employee_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(d.gross_pay)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(d.net_pay)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(d.paid)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(d.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PayrollReportShell>
  );
};

export default PayrollSummaryReport;
