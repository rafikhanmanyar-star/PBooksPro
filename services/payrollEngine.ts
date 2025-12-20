
/**
 * Enterprise Payroll Engine
 * Handles all payroll calculations, proration, multi-project allocation, and compliance
 */

import { 
    Employee, 
    Payslip, 
    PayrollCycle, 
    PayrollFrequency, 
    EmployeeSalaryComponent, 
    ProjectAssignment,
    BonusRecord,
    PayrollAdjustment,
    AttendanceRecord,
    PayrollCostAllocation,
    PayslipItem,
    TaxConfiguration,
    StatutoryConfiguration
} from '../types';

export interface PayrollCalculationResult {
    payslip: Payslip;
    errors: string[];
    warnings: string[];
}

export interface PayrollEngineConfig {
    countryCode?: string;
    stateCode?: string;
    workingDaysPerMonth?: number;
    enableProration?: boolean;
    enableMultiProject?: boolean;
}

class PayrollEngine {
    private config: PayrollEngineConfig;

    constructor(config: PayrollEngineConfig = {}) {
        this.config = {
            workingDaysPerMonth: 26,
            enableProration: true,
            enableMultiProject: true,
            ...config
        };
    }

    /**
     * Calculate payroll for a single employee
     */
    calculateEmployeePayroll(
        employee: Employee,
        month: string, // YYYY-MM
        frequency: PayrollFrequency,
        bonuses: BonusRecord[],
        adjustments: PayrollAdjustment[],
        attendance: AttendanceRecord[],
        taxConfig?: TaxConfiguration,
        statutoryConfigs?: StatutoryConfiguration[]
    ): PayrollCalculationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Get pay period dates
        const { startDate, endDate } = this.getPayPeriodDates(month, frequency);
        
        // Check if employee is active during this period
        const isActive = this.isEmployeeActive(employee, startDate, endDate);
        if (!isActive) {
            errors.push(`Employee ${employee.employeeId} is not active during this period`);
        }

        // Calculate proration if needed
        const prorationInfo = this.calculateProration(employee, startDate, endDate);
        
        // Get effective salary structure for the period
        const effectiveSalaryStructure = this.getEffectiveSalaryStructure(
            employee.salaryStructure,
            startDate,
            endDate
        );

        // Calculate basic salary (prorated if needed)
        const basicSalary = this.calculateBasicSalary(
            employee.basicSalary,
            prorationInfo.days,
            prorationInfo.totalDays
        );

        // Calculate allowances
        const allowances = this.calculateAllowances(
            effectiveSalaryStructure,
            employee,
            basicSalary,
            prorationInfo
        );

        // Calculate bonuses for this period
        const applicableBonuses = bonuses.filter(b => 
            b.employeeId === employee.id &&
            b.status === 'Approved' &&
            (!b.payrollMonth || b.payrollMonth === month)
        );
        const bonusItems = this.calculateBonuses(applicableBonuses, prorationInfo);

        // Calculate overtime
        const overtimeItems = this.calculateOvertime(attendance, employee, prorationInfo);

        // Calculate commissions
        const commissionItems = this.calculateCommissions(employee, month, prorationInfo);

        // Calculate gross salary
        const totalAllowances = allowances.reduce((sum, a) => sum + a.amount, 0);
        const totalBonuses = bonusItems.reduce((sum, b) => sum + b.amount, 0);
        const totalOvertime = overtimeItems.reduce((sum, o) => sum + o.amount, 0);
        const totalCommissions = commissionItems.reduce((sum, c) => sum + c.amount, 0);
        
        const grossSalary = basicSalary + totalAllowances + totalBonuses + totalOvertime + totalCommissions;

        // Calculate deductions
        const deductions = this.calculateDeductions(
            effectiveSalaryStructure,
            employee,
            basicSalary,
            grossSalary,
            prorationInfo
        );

        // Calculate tax
        const taxItems = this.calculateTax(
            grossSalary,
            employee,
            taxConfig,
            allowances,
            deductions
        );

        // Calculate statutory deductions
        const statutoryItems = this.calculateStatutoryDeductions(
            grossSalary,
            employee,
            statutoryConfigs || [],
            prorationInfo
        );

        // Calculate loan/advance deductions
        const loanItems = this.calculateLoanDeductions(employee, month);

        // Calculate adjustments
        const adjustmentItems = this.calculateAdjustments(
            adjustments.filter(a => a.employeeId === employee.id && (!a.payrollMonth || a.payrollMonth === month)),
            prorationInfo
        );

        // Total deductions
        const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
        const totalTax = taxItems.reduce((sum, t) => sum + t.amount, 0);
        const totalStatutory = statutoryItems.reduce((sum, s) => sum + s.amount, 0);
        const totalLoanDeductions = loanItems.reduce((sum, l) => sum + l.amount, 0);
        const totalAdjustments = adjustmentItems.reduce((sum, a) => sum + a.amount, 0);

        const allDeductions = totalDeductions + totalTax + totalStatutory + totalLoanDeductions + totalAdjustments;

        // Calculate taxable income
        const taxableIncome = this.calculateTaxableIncome(
            grossSalary,
            allowances,
            deductions,
            taxConfig
        );

        // Calculate net salary
        const netSalary = grossSalary - allDeductions;

        // Calculate cost allocation across projects
        const costAllocations = this.calculateCostAllocation(
            employee.projectAssignments,
            {
                basicSalary,
                allowances: totalAllowances,
                bonuses: totalBonuses,
                deductions: allDeductions,
                netAmount: netSalary
            },
            startDate,
            endDate
        );

        // Create payslip
        const payslip: Payslip = {
            id: `payslip-${employee.id}-${month}-${Date.now()}`,
            employeeId: employee.id,
            payrollCycleId: '', // Will be set by caller
            month,
            issueDate: new Date().toISOString(),
            payPeriodStart: startDate,
            payPeriodEnd: endDate,
            basicSalary,
            allowances,
            totalAllowances,
            bonuses: bonusItems,
            totalBonuses,
            overtime: overtimeItems,
            totalOvertime,
            commissions: commissionItems,
            totalCommissions,
            deductions,
            totalDeductions,
            taxDeductions: taxItems,
            totalTax,
            statutoryDeductions: statutoryItems,
            totalStatutory,
            loanDeductions: loanItems,
            totalLoanDeductions,
            grossSalary,
            taxableIncome,
            netSalary,
            costAllocations,
            isProrated: prorationInfo.isProrated,
            prorationDays: prorationInfo.days,
            prorationReason: prorationInfo.reason,
            status: 'Pending',
            paidAmount: 0,
            generatedAt: new Date().toISOString(),
            snapshot: {
                salaryStructure: effectiveSalaryStructure,
                projectAssignments: employee.projectAssignments.filter(a => 
                    this.isDateInRange(startDate, endDate, a.effectiveDate, a.endDate)
                ),
                bonuses: applicableBonuses,
                adjustments: adjustments.filter(a => a.employeeId === employee.id),
                attendanceDays: attendance.filter(a => a.status === 'Present').length,
                workingDays: prorationInfo.totalDays
            }
        };

        return {
            payslip,
            errors,
            warnings
        };
    }

    /**
     * Process entire payroll cycle
     */
    processPayrollCycle(
        cycle: PayrollCycle,
        employees: Employee[],
        bonuses: BonusRecord[],
        adjustments: PayrollAdjustment[],
        attendance: AttendanceRecord[],
        taxConfig?: TaxConfiguration,
        statutoryConfigs?: StatutoryConfiguration[]
    ): { payslips: Payslip[]; errors: string[]; warnings: string[] } {
        const payslips: Payslip[] = [];
        const allErrors: string[] = [];
        const allWarnings: string[] = [];

        // Filter active employees for this period
        const { startDate, endDate } = this.getPayPeriodDates(cycle.month, cycle.frequency);
        const eligibleEmployees = employees.filter(emp => 
            this.isEmployeeActive(emp, startDate, endDate)
        );

        for (const employee of eligibleEmployees) {
            const result = this.calculateEmployeePayroll(
                employee,
                cycle.month,
                cycle.frequency,
                bonuses,
                adjustments,
                attendance.filter(a => a.employeeId === employee.id),
                taxConfig,
                statutoryConfigs
            );

            if (result.payslip) {
                result.payslip.payrollCycleId = cycle.id;
                payslips.push(result.payslip);
            }

            allErrors.push(...result.errors);
            allWarnings.push(...result.warnings);
        }

        return { payslips, errors: allErrors, warnings: allWarnings };
    }

    // ==================== Helper Methods ====================

    private getPayPeriodDates(month: string, frequency: PayrollFrequency): { startDate: string; endDate: string } {
        const [year, monthNum] = month.split('-').map(Number);
        const startDate = new Date(year, monthNum - 1, 1);
        let endDate: Date;

        switch (frequency) {
            case 'Monthly':
                endDate = new Date(year, monthNum, 0); // Last day of month
                break;
            case 'Semi-Monthly':
                if (new Date().getDate() <= 15) {
                    endDate = new Date(year, monthNum - 1, 15);
                } else {
                    endDate = new Date(year, monthNum, 0);
                }
                break;
            case 'Weekly':
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                break;
            case 'Bi-Weekly':
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 13);
                break;
            default:
                endDate = new Date(year, monthNum, 0);
        }

        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };
    }

    private isEmployeeActive(employee: Employee, startDate: string, endDate: string): boolean {
        if (employee.status !== 'Active') return false;
        if (employee.terminationDetails) {
            const termDate = new Date(employee.terminationDetails.lastWorkingDay);
            const periodStart = new Date(startDate);
            if (termDate < periodStart) return false;
        }
        const joinDate = new Date(employee.employmentDetails.joiningDate);
        const periodEnd = new Date(endDate);
        if (joinDate > periodEnd) return false;
        return true;
    }

    private calculateProration(
        employee: Employee,
        startDate: string,
        endDate: string
    ): { days: number; totalDays: number; isProrated: boolean; reason?: string } {
        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);
        const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        let actualStart = periodStart;
        let actualEnd = periodEnd;
        let reason: string | undefined;

        // Check if joined during period
        const joinDate = new Date(employee.employmentDetails.joiningDate);
        if (joinDate > periodStart) {
            actualStart = joinDate;
            reason = 'Join';
        }

        // Check if terminated during period
        if (employee.terminationDetails) {
            const termDate = new Date(employee.terminationDetails.lastWorkingDay);
            if (termDate < periodEnd) {
                actualEnd = termDate;
                reason = reason ? 'Join & Exit' : 'Exit';
            }
        }

        // Check for transfers/promotions during period
        const lifecycleEvents = employee.lifecycleHistory.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate >= periodStart && eventDate <= periodEnd &&
                   (e.type === 'Transfer' || e.type === 'Promotion' || e.type === 'Salary Revision');
        });

        if (lifecycleEvents.length > 0 && !reason) {
            reason = lifecycleEvents[0].type;
        }

        const days = Math.ceil((actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const isProrated = days < totalDays;

        return { days, totalDays, isProrated, reason };
    }

    private calculateBasicSalary(
        monthlyBasic: number,
        days: number,
        totalDays: number
    ): number {
        if (days === totalDays) return monthlyBasic;
        return Math.round((monthlyBasic / totalDays) * days * 100) / 100;
    }

    private getEffectiveSalaryStructure(
        structure: EmployeeSalaryComponent[],
        startDate: string,
        endDate: string
    ): EmployeeSalaryComponent[] {
        return structure.filter(comp => {
            const compStart = new Date(comp.effectiveDate);
            const compEnd = comp.endDate ? new Date(comp.endDate) : null;
            const periodStart = new Date(startDate);
            const periodEnd = new Date(endDate);

            if (compEnd && compEnd < periodStart) return false;
            if (compStart > periodEnd) return false;
            return true;
        });
    }

    private calculateAllowances(
        structure: EmployeeSalaryComponent[],
        employee: Employee,
        basicSalary: number,
        proration: { days: number; totalDays: number }
    ): PayslipItem[] {
        // This would use salaryComponents from state to get component details
        // For now, simplified implementation
        return structure
            .filter(comp => {
                // Filter for allowance-type components
                return true; // Simplified
            })
            .map(comp => {
                let amount = comp.amount || 0;
                if (comp.calculationType === 'Percentage of Basic') {
                    amount = (basicSalary * (comp.amount || 0)) / 100;
                }
                // Apply proration
                if (proration.days < proration.totalDays) {
                    amount = (amount / proration.totalDays) * proration.days;
                }
                return {
                    name: `Component ${comp.componentId}`, // Would get from salaryComponents
                    amount: Math.round(amount * 100) / 100,
                    componentId: comp.componentId,
                    type: 'Allowance' as const
                };
            });
    }

    private calculateBonuses(
        bonuses: BonusRecord[],
        proration: { days: number; totalDays: number }
    ): PayslipItem[] {
        return bonuses.map(bonus => ({
            name: `${bonus.type} Bonus`,
            amount: bonus.amount,
            date: bonus.effectiveDate,
            type: 'Bonus' as const
        }));
    }

    private calculateOvertime(
        attendance: AttendanceRecord[],
        employee: Employee,
        proration: { days: number; totalDays: number }
    ): PayslipItem[] {
        // Simplified - would calculate based on overtime hours and rates
        return [];
    }

    private calculateCommissions(
        employee: Employee,
        month: string,
        proration: { days: number; totalDays: number }
    ): PayslipItem[] {
        // Would calculate based on commission rules
        return [];
    }

    private calculateDeductions(
        structure: EmployeeSalaryComponent[],
        employee: Employee,
        basicSalary: number,
        grossSalary: number,
        proration: { days: number; totalDays: number }
    ): PayslipItem[] {
        // Similar to allowances but for deduction components
        return [];
    }

    private calculateTax(
        grossSalary: number,
        employee: Employee,
        taxConfig?: TaxConfiguration,
        allowances: PayslipItem[] = [],
        deductions: PayslipItem[] = []
    ): PayslipItem[] {
        if (!taxConfig) return [];

        // Calculate taxable income
        const taxableIncome = this.calculateTaxableIncome(grossSalary, allowances, deductions, taxConfig);

        // Apply tax slabs
        let totalTax = 0;
        for (const slab of taxConfig.taxSlabs) {
            if (taxableIncome > slab.minIncome) {
                const applicableIncome = Math.min(
                    taxableIncome,
                    slab.maxIncome || Infinity
                ) - slab.minIncome;
                totalTax += (applicableIncome * slab.rate) / 100;
                if (slab.fixedAmount) {
                    totalTax += slab.fixedAmount;
                }
            }
        }

        // Apply exemptions and credits
        // Simplified implementation

        return totalTax > 0 ? [{
            name: 'Income Tax',
            amount: Math.round(totalTax * 100) / 100,
            type: 'Tax' as const
        }] : [];
    }

    private calculateTaxableIncome(
        grossSalary: number,
        allowances: PayslipItem[],
        deductions: PayslipItem[],
        taxConfig?: TaxConfiguration
    ): number {
        // Start with gross
        let taxable = grossSalary;

        // Add taxable allowances
        const taxableAllowances = allowances
            .filter(a => a.isTaxable)
            .reduce((sum, a) => sum + a.amount, 0);
        taxable += taxableAllowances;

        // Subtract tax-exempt deductions
        // Simplified - would check taxConfig exemptions

        return Math.max(0, taxable);
    }

    private calculateStatutoryDeductions(
        grossSalary: number,
        employee: Employee,
        configs: StatutoryConfiguration[],
        proration: { days: number; totalDays: number }
    ): PayslipItem[] {
        const items: PayslipItem[] = [];

        for (const config of configs) {
            if (!config.employeeContributionRate) continue;

            let baseAmount = grossSalary;
            if (config.maxSalaryLimit) {
                baseAmount = Math.min(baseAmount, config.maxSalaryLimit);
            }

            const contribution = (baseAmount * config.employeeContributionRate) / 100;
            
            // Apply proration
            const proratedContribution = proration.days < proration.totalDays
                ? (contribution / proration.totalDays) * proration.days
                : contribution;

            items.push({
                name: config.type,
                amount: Math.round(proratedContribution * 100) / 100,
                type: 'Statutory' as const
            });
        }

        return items;
    }

    private calculateLoanDeductions(employee: Employee, month: string): PayslipItem[] {
        // Would calculate based on active loans and repayment schedules
        return [];
    }

    private calculateAdjustments(
        adjustments: PayrollAdjustment[],
        proration: { days: number; totalDays: number }
    ): PayslipItem[] {
        return adjustments
            .filter(a => a.status === 'Active')
            .map(adj => ({
                name: adj.description,
                amount: adj.type === 'Deduction' ? -adj.amount : adj.amount,
                date: adj.effectiveDate,
                type: adj.category as any
            }));
    }

    private calculateCostAllocation(
        assignments: ProjectAssignment[],
        totals: {
            basicSalary: number;
            allowances: number;
            bonuses: number;
            deductions: number;
            netAmount: number;
        },
        startDate: string,
        endDate: string
    ): PayrollCostAllocation[] {
        if (!this.config.enableMultiProject || assignments.length === 0) {
            return [];
        }

        const activeAssignments = assignments.filter(a =>
            this.isDateInRange(startDate, endDate, a.effectiveDate, a.endDate)
        );

        if (activeAssignments.length === 0) {
            return [];
        }

        // Calculate allocation based on percentage or hours
        const allocations: PayrollCostAllocation[] = [];

        for (const assignment of activeAssignments) {
            let allocationFactor = 1;
            if (activeAssignments.length > 1) {
                if (assignment.percentage) {
                    allocationFactor = assignment.percentage / 100;
                } else if (assignment.hoursPerMonth) {
                    const totalHours = activeAssignments.reduce((sum, a) => sum + (a.hoursPerMonth || 0), 0);
                    allocationFactor = totalHours > 0 ? (assignment.hoursPerMonth || 0) / totalHours : 1 / activeAssignments.length;
                } else {
                    allocationFactor = 1 / activeAssignments.length;
                }
            }

            allocations.push({
                projectId: assignment.projectId,
                percentage: assignment.percentage,
                hours: assignment.hoursPerMonth,
                amount: totals.netAmount * allocationFactor,
                basicSalary: totals.basicSalary * allocationFactor,
                allowances: totals.allowances * allocationFactor,
                bonuses: totals.bonuses * allocationFactor,
                deductions: totals.deductions * allocationFactor,
                netAmount: totals.netAmount * allocationFactor
            });
        }

        return allocations;
    }

    private isDateInRange(
        rangeStart: string,
        rangeEnd: string,
        itemStart: string,
        itemEnd?: string
    ): boolean {
        const rangeStartDate = new Date(rangeStart);
        const rangeEndDate = new Date(rangeEnd);
        const itemStartDate = new Date(itemStart);
        const itemEndDate = itemEnd ? new Date(itemEnd) : null;

        if (itemEndDate && itemEndDate < rangeStartDate) return false;
        if (itemStartDate > rangeEndDate) return false;
        return true;
    }
}

// Export singleton instance
export const payrollEngine = new PayrollEngine();

// Export for testing/configuration
export { PayrollEngine };

