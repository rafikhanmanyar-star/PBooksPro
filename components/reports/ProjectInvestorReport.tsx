
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType, AppState } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { useNotification } from '../../context/NotificationContext';
import InvestorHistoryModal from './InvestorHistoryModal';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface InvestorRow {
    accountId: string;
    investorName: string;
    equityInvested: number; // Principal (Bank -> Equity)
    ownershipPercentage: number;
    profitDistributed: number; // Realized Profit (Income -> Equity)
    withdrawals: number;
    netBalance: number; // Current Equity Balance
}

interface ProjectBreakdownRow {
    projectId: string;
    projectName: string;
    equityInvested: number;
    ownershipPercentage: number;
    profitDistributed: number;
    withdrawals: number;
    netBalance: number;
}

type InvestorMapEntry = { name: string; invested: number; withdrawn: number; profit: number };

function accumulateInvestorMapForProject(
    state: AppState,
    asOf: Date,
    projectId: string | 'all'
): Record<string, InvestorMapEntry> {
    const equityAccounts = state.accounts.filter(a => a.type === AccountType.EQUITY);
    const equityAccountIds = new Set(equityAccounts.map(a => a.id));
    const investorMap: Record<string, InvestorMapEntry> = {};

    equityAccounts.forEach(a => {
        investorMap[a.id] = { name: a.name, invested: 0, withdrawn: 0, profit: 0 };
    });

    state.transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        if (txDate > asOf) return;

        if (projectId !== 'all' && tx.projectId !== projectId) return;

        const fromEquity = tx.fromAccountId && equityAccountIds.has(tx.fromAccountId);
        const toEquity = tx.toAccountId && equityAccountIds.has(tx.toAccountId);

        const fromAccount = state.accounts.find(a => a.id === tx.fromAccountId);
        const isFromClearing = fromAccount?.name === 'Internal Clearing';
        const isDivestment = tx.description && tx.description.includes('Equity Move out');
        const isPMFeeTransfer = tx.description?.toLowerCase().includes('pm fee') ||
            tx.description?.toLowerCase().includes('pm fee equity');

        if (tx.type === TransactionType.TRANSFER) {
            if (fromEquity && !toEquity && investorMap[tx.fromAccountId!]) {
                investorMap[tx.fromAccountId!].invested += tx.amount;
            }

            if (toEquity && !fromEquity && investorMap[tx.toAccountId!]) {
                if (isFromClearing && isPMFeeTransfer) {
                    investorMap[tx.toAccountId!].invested += tx.amount;
                } else if (isFromClearing && !isDivestment) {
                    investorMap[tx.toAccountId!].profit += tx.amount;
                } else {
                    investorMap[tx.toAccountId!].withdrawn += tx.amount;
                }
            }
        }

        if (tx.type === TransactionType.INCOME && tx.accountId && equityAccountIds.has(tx.accountId)) {
            if (investorMap[tx.accountId]) {
                investorMap[tx.accountId].profit += tx.amount;
            }
        }
    });

    return investorMap;
}

/** Keep project rows that have any equity activity in scope (matches investor-table behavior). */
function projectBreakdownRowHasActivity(r: ProjectBreakdownRow): boolean {
    return (
        r.equityInvested > 0 ||
        r.withdrawals > 0 ||
        r.profitDistributed > 0 ||
        Math.abs(r.netBalance) > 0.01
    );
}

function mapEntryToInvestorRow(
    accountId: string,
    data: InvestorMapEntry,
    totalEquityRaised: number
): InvestorRow {
    const ownershipPercentage = totalEquityRaised > 0 ? (data.invested / totalEquityRaised) * 100 : 0;
    const netBalance = (data.invested - data.withdrawn) + data.profit;
    return {
        accountId,
        investorName: data.name,
        equityInvested: data.invested,
        ownershipPercentage,
        profitDistributed: data.profit,
        withdrawals: data.withdrawn,
        netBalance
    };
}

const ProjectInvestorReport: React.FC = () => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const { print: triggerPrint } = usePrintContext();
    const { openChat } = useWhatsApp();
    const [dateRange, setDateRange] = useState<ReportDateRange>('all');
    const [startDate, setStartDate] = useState(toLocalDateString(new Date())); // Not used for calculation but for UI state
    const [endDate, setEndDate] = useState(toLocalDateString(new Date()));
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
    const [selectedInvestorId, setSelectedInvestorId] = useState<string>('all');
    
    // Modal State (projectId when drilling down from a project row in “All Projects” mode)
    const [historyModal, setHistoryModal] = useState<{
        isOpen: boolean;
        investorId: string;
        investorName: string;
        projectId?: string;
    } | null>(null);

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);
    
    const investorItems = useMemo(() => {
        const investors = state.accounts.filter(a => a.type === AccountType.EQUITY);
        return [{ id: 'all', name: 'All Investors' }, ...investors];
    }, [state.accounts]);

    const handleRangeChange = (type: ReportDateRange) => {
        setDateRange(type);
        const now = new Date();
        if (type === 'all') {
             setEndDate('2100-12-31'); 
        } else if (type === 'thisMonth') {
             const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
             setEndDate(toLocalDateString(lastDay));
        } else if (type === 'lastMonth') {
             const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
             setEndDate(toLocalDateString(lastDay));
        }
    };

    // Investor-level totals (portfolio or single project) — summary cards + single-project table
    const reportData = useMemo(() => {
        const asOf = new Date(endDate);
        asOf.setHours(23, 59, 59, 999);

        const investorMap = accumulateInvestorMapForProject(state, asOf, selectedProjectId);
        const totalEquityRaised = Object.values(investorMap).reduce((sum, i) => sum + i.invested, 0);
        const totalProfitDistributed = Object.values(investorMap).reduce((sum, i) => sum + i.profit, 0);

        const rows: InvestorRow[] = Object.entries(investorMap)
            .filter(([id]) => selectedInvestorId === 'all' || id === selectedInvestorId)
            .map(([accountId, data]) => mapEntryToInvestorRow(accountId, data, totalEquityRaised))
            .filter(r => r.equityInvested > 0 || r.withdrawals > 0 || r.profitDistributed > 0 || Math.abs(r.netBalance) > 0.01)
            .sort((a, b) => b.equityInvested - a.equityInvested);

        return {
            rows,
            summary: { totalEquityRaised, totalProfitDistributed }
        };
    }, [state, endDate, selectedProjectId, selectedInvestorId]);

    /** One row per project when “All Projects” is selected (scoped by investor filter). */
    const projectBreakdownData = useMemo(() => {
        if (selectedProjectId !== 'all') {
            return { rows: [] as ProjectBreakdownRow[] };
        }

        const asOf = new Date(endDate);
        asOf.setHours(23, 59, 59, 999);

        const portfolioMap = accumulateInvestorMapForProject(state, asOf, 'all');
        const totalPortfolioPrincipal = Object.values(portfolioMap).reduce((s, i) => s + i.invested, 0);

        const rows: ProjectBreakdownRow[] = state.projects.map(project => {
            const investorMap = accumulateInvestorMapForProject(state, asOf, project.id);
            const totalInProject = Object.values(investorMap).reduce((s, i) => s + i.invested, 0);

            if (selectedInvestorId === 'all') {
                const agg = Object.values(investorMap).reduce(
                    (acc, e) => ({
                        invested: acc.invested + e.invested,
                        withdrawn: acc.withdrawn + e.withdrawn,
                        profit: acc.profit + e.profit
                    }),
                    { invested: 0, withdrawn: 0, profit: 0 }
                );
                const netBalance = (agg.invested - agg.withdrawn) + agg.profit;
                const ownershipPercentage = totalPortfolioPrincipal > 0
                    ? (agg.invested / totalPortfolioPrincipal) * 100
                    : 0;
                return {
                    projectId: project.id,
                    projectName: project.name,
                    equityInvested: agg.invested,
                    ownershipPercentage,
                    profitDistributed: agg.profit,
                    withdrawals: agg.withdrawn,
                    netBalance
                };
            }

            const data = investorMap[selectedInvestorId];
            if (!data) {
                return {
                    projectId: project.id,
                    projectName: project.name,
                    equityInvested: 0,
                    ownershipPercentage: 0,
                    profitDistributed: 0,
                    withdrawals: 0,
                    netBalance: 0
                };
            }
            const netBalance = (data.invested - data.withdrawn) + data.profit;
            const ownershipPercentage = totalInProject > 0 ? (data.invested / totalInProject) * 100 : 0;
            return {
                projectId: project.id,
                projectName: project.name,
                equityInvested: data.invested,
                ownershipPercentage,
                profitDistributed: data.profit,
                withdrawals: data.withdrawn,
                netBalance
            };
        });

        const visible = rows.filter(projectBreakdownRowHasActivity);
        visible.sort((a, b) => (a.projectName || '').localeCompare(b.projectName || ''));

        return { rows: visible };
    }, [state, endDate, selectedProjectId, selectedInvestorId]);

    const handleRowClick = (row: InvestorRow) => {
        setHistoryModal({
            isOpen: true,
            investorId: row.accountId,
            investorName: row.investorName,
            projectId: selectedProjectId !== 'all' ? selectedProjectId : undefined
        });
    };

    const handleProjectRowClick = (row: ProjectBreakdownRow) => {
        if (selectedInvestorId === 'all') return;
        const inv = state.accounts.find(a => a.id === selectedInvestorId);
        setHistoryModal({
            isOpen: true,
            investorId: selectedInvestorId,
            investorName: inv?.name || 'Investor',
            projectId: row.projectId
        });
    };

    const handleExport = () => {
        if (selectedProjectId === 'all') {
            const data = projectBreakdownData.rows.map(r => ({
                'Project': r.projectName,
                'Principal Invested': r.equityInvested,
                'Share %': `${r.ownershipPercentage.toFixed(2)}%`,
                'Profit Realized': r.profitDistributed,
                'Withdrawals': r.withdrawals,
                'Net Equity': r.netBalance
            }));
            exportJsonToExcel(data, 'investor-distribution-by-project.xlsx', 'Projects');
            return;
        }
        const data = reportData.rows.map(r => ({
            'Investor': r.investorName,
            'Invested Amount': r.equityInvested,
            'Share %': `${r.ownershipPercentage.toFixed(2)}%`,
            'Profit Distributed': r.profitDistributed,
            'Withdrawals': r.withdrawals,
            'Net Equity': r.netBalance
        }));
        exportJsonToExcel(data, 'investor-distribution.xlsx', 'Investors');
    };

    const handleWhatsApp = async () => {
        if (selectedInvestorId === 'all') {
            await showAlert("Please select a specific investor to send a report to.");
            return;
        }
        
        const row = reportData.rows.find(r => r.accountId === selectedInvestorId);
        if (!row) {
            await showAlert("No data available for the selected investor.");
            return;
        }

        const projectLabel = selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name;
        // Attempt to find a matching contact for phone number
        const matchingContact = state.contacts.find(c => c.name.toLowerCase() === row.investorName.toLowerCase());
        
        let message = `*Investment Distribution Report*\n`;
        message += `Investor: ${row.investorName}\n`;
        message += `Project: ${projectLabel}\n`;
        message += `As of: ${formatDate(endDate)}\n\n`;
        message += `Invested: ${CURRENCY} ${row.equityInvested.toLocaleString()}\n`;
        message += `Share: ${row.ownershipPercentage.toFixed(2)}%\n`;
        message += `Profit Realized: ${CURRENCY} ${row.profitDistributed.toLocaleString()}\n`;
        message += `Withdrawals: ${CURRENCY} ${row.withdrawals.toLocaleString()}\n`;
        message += `--------------------\n`;
        message += `*Net Equity: ${CURRENCY} ${row.netBalance.toLocaleString()}*\n`;
        
        try {
            if (matchingContact && matchingContact.contactNo) {
                sendOrOpenWhatsApp(
                    { contact: matchingContact, message, phoneNumber: matchingContact.contactNo },
                    () => state.whatsAppMode,
                    openChat
                );
            } else {
                // If no contact found, open WhatsApp without phone number
                const encodedMessage = encodeURIComponent(message);
                window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
            }
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };

    const projectName = selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name || 'Unknown Project';

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex-shrink-0">
                <ReportToolbar
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={(_, end) => { setEndDate(end); setDateRange('custom'); }}
                    onExport={handleExport}
                    onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                    onWhatsApp={handleWhatsApp}
                    disableWhatsApp={selectedInvestorId === 'all'}
                    hideGroup={true}
                    hideDate={false} // Show date picker for "As Of" date
                    showDateFilterPills={true}
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                    hideSearch={true}
                >
                    <div className="w-full sm:w-48">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Project</label>
                        <ComboBox label={undefined} items={projectItems} selectedId={selectedProjectId} onSelect={(item) => setSelectedProjectId(item?.id || 'all')} allowAddNew={false} />
                    </div>
                    
                    <div className="w-full sm:w-48">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Investor</label>
                        <ComboBox label={undefined} items={investorItems} selectedId={selectedInvestorId} onSelect={(item) => setSelectedInvestorId(item?.id || 'all')} allowAddNew={false} />
                    </div>
                </ReportToolbar>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Investor Distribution Report</h3>
                        <p className="text-sm text-slate-500 font-medium">
                            {projectName}
                            {selectedProjectId === 'all' && selectedInvestorId !== 'all' && (
                                <span> · {state.accounts.find(a => a.id === selectedInvestorId)?.name ?? 'Investor'}</span>
                            )}
                        </p>
                        <p className="text-xs text-slate-400">As of {formatDate(endDate)}</p>
                    </div>
                    
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8 text-center">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Principal</p>
                            <p className="text-xl font-bold text-indigo-700">{CURRENCY} {(reportData.summary.totalEquityRaised || 0).toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Profit Distributed</p>
                            <p className="text-xl font-bold text-emerald-600">
                                {CURRENCY} {(reportData.summary.totalProfitDistributed || 0).toLocaleString()}
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                {selectedProjectId === 'all' ? 'Projects' : 'Investors'}
                            </p>
                            <p className="text-xl font-bold text-slate-700">
                                {selectedProjectId === 'all' ? projectBreakdownData.rows.length : reportData.rows.length}
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        {selectedProjectId === 'all' ? (
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs">Project Name</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Principal Invested</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Share %</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Profit Realized</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Withdrawals</th>
                                        <th className="px-4 py-3 text-right font-bold text-slate-700 uppercase tracking-wider text-xs bg-slate-100">Net Equity</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {projectBreakdownData.rows.length > 0 ? projectBreakdownData.rows.map((row) => (
                                        <tr
                                            key={row.projectId}
                                            className={`hover:bg-slate-50 transition-colors ${selectedInvestorId !== 'all' ? 'cursor-pointer' : ''}`}
                                            onClick={() => handleProjectRowClick(row)}
                                            title={selectedInvestorId !== 'all' ? 'Click to view transactions for this project' : undefined}
                                        >
                                            <td className="px-4 py-3 font-medium text-slate-800">{row.projectName}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{CURRENCY} {(row.equityInvested || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-indigo-600">{(row.ownershipPercentage || 0).toFixed(2)}%</td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                                                {CURRENCY} {(row.profitDistributed || 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-rose-600">
                                                {row.withdrawals > 0 ? `-${CURRENCY} ${row.withdrawals.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900 bg-slate-100/50">
                                                {CURRENCY} {(row.netBalance || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-slate-500 italic bg-slate-50/30">
                                                No projects found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {projectBreakdownData.rows.length > 0 && (
                                    <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300">
                                        <tr>
                                            <td className="px-4 py-3 text-right text-slate-700">NET TOTAL</td>
                                            <td className="px-4 py-3 text-right">{CURRENCY} {projectBreakdownData.rows.reduce((sum, r) => sum + r.equityInvested, 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">
                                                {selectedInvestorId === 'all'
                                                    ? `${projectBreakdownData.rows.reduce((sum, r) => sum + r.ownershipPercentage, 0).toFixed(2)}%`
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">{CURRENCY} {projectBreakdownData.rows.reduce((sum, r) => sum + r.profitDistributed, 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">{CURRENCY} {projectBreakdownData.rows.reduce((sum, r) => sum + r.withdrawals, 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right bg-slate-100">{CURRENCY} {projectBreakdownData.rows.reduce((sum, r) => sum + r.netBalance, 0).toLocaleString()}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        ) : (
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs">Investor Name</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Principal Invested</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Share %</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Profit Realized</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Withdrawals</th>
                                        <th className="px-4 py-3 text-right font-bold text-slate-700 uppercase tracking-wider text-xs bg-slate-100">Net Equity</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {reportData.rows.length > 0 ? reportData.rows.map((row) => (
                                        <tr
                                            key={row.accountId}
                                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                                            onClick={() => handleRowClick(row)}
                                            title="Click to view full transaction history"
                                        >
                                            <td className="px-4 py-3 font-medium text-slate-800">{row.investorName}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{CURRENCY} {(row.equityInvested || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-indigo-600">{(row.ownershipPercentage || 0).toFixed(2)}%</td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                                                {CURRENCY} {(row.profitDistributed || 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-rose-600">
                                                {row.withdrawals > 0 ? `-${CURRENCY} ${row.withdrawals.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900 bg-slate-100/50">
                                                {CURRENCY} {(row.netBalance || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-slate-500 italic bg-slate-50/30">
                                                No equity data found for this selection.<br/>
                                                <span className="text-xs text-slate-400 mt-2 block">Ensure Investor Equity accounts are credited via Transfer transactions linked to this project.</span>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {reportData.rows.length > 0 && (
                                    <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300">
                                        <tr>
                                            <td className="px-4 py-3 text-right text-slate-700">TOTALS</td>
                                            <td className="px-4 py-3 text-right">{CURRENCY} {reportData.rows.reduce((sum, r) => sum + r.equityInvested, 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">{reportData.rows.reduce((sum, r) => sum + r.ownershipPercentage, 0).toFixed(2)}%</td>
                                            <td className="px-4 py-3 text-right">{CURRENCY} {reportData.rows.reduce((sum, r) => sum + r.profitDistributed, 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">{CURRENCY} {reportData.rows.reduce((sum, r) => sum + r.withdrawals, 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right bg-slate-100">{CURRENCY} {reportData.rows.reduce((sum, r) => sum + r.netBalance, 0).toLocaleString()}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        )}
                    </div>
                    
                    <div className="mt-4 text-xs text-slate-400 italic">
                        * Net Equity = (Principal - Withdrawals) + Profit Realized.
                        <br/>
                        * Rollovers are represented by Net Equity remaining in the account.
                        {selectedProjectId === 'all' && (
                            <>
                                <br/>
                                * With All Projects: Share % is each project&apos;s share of total portfolio principal (all investors), or the selected investor&apos;s share within each project (one investor). Net Total sums all project rows.
                            </>
                        )}
                        <br/>
                        * Click a row to view transaction details{selectedProjectId === 'all' && selectedInvestorId === 'all' ? ' (select one investor to enable).' : '.'}
                    </div>
                    <ReportFooter />
                </Card>
            </div>
            
            {historyModal && (
                <InvestorHistoryModal
                    isOpen={historyModal.isOpen}
                    onClose={() => setHistoryModal(null)}
                    investorId={historyModal.investorId}
                    investorName={historyModal.investorName}
                    initialProjectId={historyModal.projectId ?? (selectedProjectId !== 'all' ? selectedProjectId : 'all')}
                />
            )}
        </div>
    );
};

export default ProjectInvestorReport;
