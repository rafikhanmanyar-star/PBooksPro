/**
 * PayslipPrintTemplate - Data-driven print template for Employee Payslips.
 */

import React from 'react';
import { PrintSettings } from '../../types';
import { PrintLayout } from './PrintLayout';
import { CURRENCY } from '../../constants';

export interface PayslipPrintData {
    companyName: string;
    month: string;
    year: number;
    employee: {
        name: string;
        employee_code?: string;
        id: string;
        designation: string;
        joining_date: string;
    };
    earnings: {
        basic: number;
        allowances: Array<{ name: string; amount: number }>;
        adjustments: Array<{ name: string; amount: number }>;
        total: number;
    };
    deductions: {
        regular: Array<{ name: string; amount: number }>;
        adjustments: Array<{ name: string; amount: number }>;
        total: number;
    };
    netPay: number;
    isPaid: boolean;
    paidAt?: string;
}

export interface PayslipPrintTemplateProps {
    printSettings: PrintSettings;
    data: PayslipPrintData;
}

const tableBorder = '1px solid var(--print-table-border, #e2e8f0)';
const headerBg = 'var(--print-highlight, #f8fafc)';

export const PayslipPrintTemplate: React.FC<PayslipPrintTemplateProps> = ({ printSettings, data }) => {
    const { employee, earnings, deductions, netPay, isPaid } = data;

    return (
        <PrintLayout printSettings={printSettings} title="PAYSLIP">
            {/* Employee Info Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: '16px 0', borderTop: tableBorder, borderBottom: tableBorder, marginBottom: 24 }}>
                <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Employee Name</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{employee.name}</div>
                </div>
                <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Employee ID</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{employee.employee_code || employee.id}</div>
                </div>
                <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Designation</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{employee.designation}</div>
                </div>
                <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Month / Year</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{data.month} {data.year}</div>
                </div>
            </div>

            {/* Earnings & Deductions Tables */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 24 }}>
                {/* Earnings */}
                <div>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', paddingBottom: 6, borderBottom: '2px solid #0f172a', marginBottom: 12 }}>Earnings</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '6px 0', color: '#475569' }}>Basic Pay</td>
                                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{CURRENCY} {earnings.basic.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            {earnings.allowances.map((a, i) => (
                                <tr key={`allowance-${i}`}>
                                    <td style={{ padding: '6px 0', color: '#475569' }}>{a.name}</td>
                                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{CURRENCY} {a.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {earnings.adjustments.map((a, i) => (
                                <tr key={`earn-adj-${i}`}>
                                    <td style={{ padding: '6px 0', color: '#059669', fontStyle: 'italic' }}>+ {a.name}</td>
                                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{CURRENCY} {a.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                <td style={{ padding: '8px 4px', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Total Earnings</td>
                                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>{CURRENCY} {earnings.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Deductions */}
                <div>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', paddingBottom: 6, borderBottom: '2px solid #0f172a', marginBottom: 12 }}>Deductions</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                            {deductions.regular.map((d, i) => (
                                <tr key={`deduction-${i}`}>
                                    <td style={{ padding: '6px 0', color: '#475569' }}>{d.name}</td>
                                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{CURRENCY} {d.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {deductions.adjustments.map((a, i) => (
                                <tr key={`ded-adj-${i}`}>
                                    <td style={{ padding: '6px 0', color: '#dc2626', fontStyle: 'italic' }}>- {a.name}</td>
                                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{CURRENCY} {a.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                <td style={{ padding: '8px 4px', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Total Deductions</td>
                                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>{CURRENCY} {deductions.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Summary / Net Pay */}
            <div style={{ background: '#0f172a', color: 'white', padding: 20, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Net Payable Amount</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{CURRENCY} {netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    {isPaid ? (
                        <div style={{ background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', color: '#4ade80', padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                            PAID {data.paidAt ? `on ${new Date(data.paidAt).toLocaleDateString()}` : ''}
                        </div>
                    ) : (
                        <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171', padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                            UNPAID
                        </div>
                    )}
                </div>
            </div>

            <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px dashed #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64 }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ height: 40 }}></div>
                    <div style={{ borderTop: '1px solid #0f172a', paddingTop: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Employee Signature</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ height: 40 }}></div>
                    <div style={{ borderTop: '1px solid #0f172a', paddingTop: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Authorized Signatory</div>
                </div>
            </div>
        </PrintLayout>
    );
};

export default PayslipPrintTemplate;
