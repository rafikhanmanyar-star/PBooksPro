import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, ProjectAgreementStatus } from '../../types';
import Card from '../ui/Card';
import { ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface UserStats {
    userId: string;
    userName: string;
    leads: number;
    agreements: number;
    closed: number;
    pendingApprovals: number;
    conversionRate: number;
}

const MarketingActivityReport: React.FC = () => {
    const { state } = useAppContext();
    const { handlePrint } = usePrint();
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);

    const handleRangeChange = (option: ReportDateRange) => {
        setDateRange(option);
        const now = new Date();
        if (option === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (option === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
        }
    };

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        if (dateRange !== 'custom') setDateRange('custom');
    };

    const reportData = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const includeAllDates = dateRange === 'all';

        const parseDate = (value?: string) => {
            if (!value) return null;
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        };

        const inRange = (value?: string) => {
            if (includeAllDates) return true;
            const date = parseDate(value);
            if (!date) return false;
            return date >= start && date <= end;
        };

        const leads = state.contacts.filter(c => c.type === ContactType.LEAD);
        const leadsInRange = leads.filter(lead => inRange(lead.createdAt || lead.updatedAt));
        const leadsMissingDates = leads.filter(lead => !lead.createdAt && !lead.updatedAt).length;

        const plans = state.installmentPlans || [];
        const plansInRange = plans.filter(plan => inRange(plan.createdAt));
        const plansMissingDates = plans.filter(plan => !plan.createdAt).length;

        const agreements = state.projectAgreements || [];
        const agreementsInRange = agreements.filter(agreement => inRange(agreement.issueDate));

        const leadIds = new Set(leadsInRange.map(lead => lead.id));
        const agreementsForLeads = agreementsInRange.filter(agreement => leadIds.has(agreement.clientId));
        const convertedLeadIds = new Set(agreementsForLeads.map(agreement => agreement.clientId));

        const pendingPlans = plansInRange.filter(plan => plan.status === 'Pending Approval');
        const approvedPlans = plansInRange.filter(plan => plan.status === 'Approved');
        const rejectedPlans = plansInRange.filter(plan => plan.status === 'Rejected');
        const draftPlans = plansInRange.filter(plan => plan.status === 'Draft');
        const lockedPlans = plansInRange.filter(plan => plan.status === 'Locked');

        const userLookup = new Map(state.users.map(user => [user.id, user]));
        const statsMap = new Map<string, UserStats>();

        const getUserName = (userId?: string) => {
            if (!userId) return 'Unassigned';
            const user = userLookup.get(userId);
            return user?.name || user?.username || 'Unassigned';
        };

        const getStats = (userId?: string) => {
            const key = userId || 'unassigned';
            if (!statsMap.has(key)) {
                statsMap.set(key, {
                    userId: key,
                    userName: getUserName(userId),
                    leads: 0,
                    agreements: 0,
                    closed: 0,
                    pendingApprovals: 0,
                    conversionRate: 0
                });
            }
            return statsMap.get(key)!;
        };

        leadsInRange.forEach(lead => {
            getStats(lead.userId).leads += 1;
        });

        agreementsInRange.forEach(agreement => {
            const stats = getStats(agreement.userId);
            stats.agreements += 1;
            if (agreement.status === ProjectAgreementStatus.COMPLETED) {
                stats.closed += 1;
            }
        });

        pendingPlans.forEach(plan => {
            getStats(plan.approvalRequestedById).pendingApprovals += 1;
        });

        const userStats = Array.from(statsMap.values())
            .map(item => ({
                ...item,
                conversionRate: item.leads > 0 ? (item.agreements / item.leads) * 100 : 0
            }))
            .filter(item => item.leads > 0 || item.agreements > 0 || item.pendingApprovals > 0)
            .sort((a, b) => b.agreements - a.agreements || b.leads - a.leads);

        return {
            leadsInRange,
            leadsMissingDates,
            plansInRange,
            plansMissingDates,
            agreementsInRange,
            convertedLeadCount: convertedLeadIds.size,
            pendingPlans,
            approvedPlans,
            rejectedPlans,
            draftPlans,
            lockedPlans,
            userStats
        };
    }, [state.contacts, state.installmentPlans, state.projectAgreements, state.users, startDate, endDate, dateRange]);

    const handleExport = () => {
        const exportRows = reportData.userStats.map(row => ({
            'User': row.userName,
            'Leads Created': row.leads,
            'Sales Agreements': row.agreements,
            'Closed Agreements': row.closed,
            'Pending Approvals': row.pendingApprovals,
            'Conversion Rate': `${row.conversionRate.toFixed(1)}%`
        }));
        exportJsonToExcel(exportRows, `marketing-activity-report-${startDate}-${endDate}.xlsx`, 'User Stats');
    };

    const summaryCards = [
        { label: 'Leads Created', value: reportData.leadsInRange.length.toLocaleString() },
        { label: 'Converted Leads', value: reportData.convertedLeadCount.toLocaleString() },
        { label: 'Conversion Rate', value: reportData.leadsInRange.length ? `${((reportData.convertedLeadCount / reportData.leadsInRange.length) * 100).toFixed(1)}%` : '0%' },
        { label: 'Installment Plans', value: reportData.plansInRange.length.toLocaleString() },
        { label: 'Pending Approvals', value: reportData.pendingPlans.length.toLocaleString() },
        { label: 'Sales Agreements', value: reportData.agreementsInRange.length.toLocaleString() }
    ];

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        onExport={handleExport}
                        onPrint={handlePrint}
                        hideGroup={true}
                        hideSearch={true}
                        showDateFilterPills={true}
                        activeDateRange={dateRange}
                        onRangeChange={handleRangeChange}
                    />
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full flex flex-col">
                        <ReportHeader />
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold text-slate-800">Marketing Activity Report</h3>
                            <p className="text-sm text-slate-500">
                                From {formatDate(startDate)} to {formatDate(endDate)}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
                            {summaryCards.map(card => (
                                <div key={card.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{card.label}</div>
                                    <div className="text-lg font-bold text-slate-800">{card.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Installment Plan Status</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Draft</span>
                                        <span className="font-semibold text-slate-800">{reportData.draftPlans.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Pending Approval</span>
                                        <span className="font-semibold text-amber-600">{reportData.pendingPlans.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Approved</span>
                                        <span className="font-semibold text-emerald-600">{reportData.approvedPlans.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Rejected</span>
                                        <span className="font-semibold text-rose-600">{reportData.rejectedPlans.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Locked</span>
                                        <span className="font-semibold text-slate-800">{reportData.lockedPlans.length}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Lead Funnel</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Leads Created</span>
                                        <span className="font-semibold text-slate-800">{reportData.leadsInRange.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Leads with Plans</span>
                                        <span className="font-semibold text-slate-800">{new Set(reportData.plansInRange.map(plan => plan.leadId)).size}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Converted to Agreement</span>
                                        <span className="font-semibold text-emerald-600">{reportData.convertedLeadCount}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Agreements Completed</span>
                                        <span className="font-semibold text-indigo-600">{reportData.agreementsInRange.filter(agreement => agreement.status === ProjectAgreementStatus.COMPLETED).length}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold text-slate-600">User</th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Leads</th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Agreements</th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Closed</th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Pending Approval</th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Conversion</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {reportData.userStats.length > 0 ? (
                                        reportData.userStats.map(row => (
                                            <tr key={row.userId}>
                                                <td className="px-3 py-2 font-medium text-slate-800">{row.userName}</td>
                                                <td className="px-3 py-2 text-right">{row.leads}</td>
                                                <td className="px-3 py-2 text-right">{row.agreements}</td>
                                                <td className="px-3 py-2 text-right">{row.closed}</td>
                                                <td className="px-3 py-2 text-right">{row.pendingApprovals}</td>
                                                <td className="px-3 py-2 text-right">{row.conversionRate.toFixed(1)}%</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                                                No marketing activity found for the selected period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {(reportData.leadsMissingDates > 0 || reportData.plansMissingDates > 0) && (
                            <div className="mt-4 text-xs text-slate-500">
                                {reportData.leadsMissingDates > 0 && <div>Leads without created dates: {reportData.leadsMissingDates}</div>}
                                {reportData.plansMissingDates > 0 && <div>Plans without created dates: {reportData.plansMissingDates}</div>}
                            </div>
                        )}

                        {reportData.leadsInRange.length === 0 && reportData.plansInRange.length === 0 && reportData.agreementsInRange.length === 0 && (
                            <div className="text-center py-10">
                                <div className="mx-auto h-16 w-16 text-slate-400">{ICONS.archive}</div>
                                <h3 className="mt-2 text-lg font-semibold text-slate-800">No Marketing Records</h3>
                                <p className="mt-1 text-sm text-slate-500">Try a wider date range to see marketing activity.</p>
                            </div>
                        )}

                        <div className="mt-auto">
                            <ReportFooter />
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
};

export default MarketingActivityReport;
