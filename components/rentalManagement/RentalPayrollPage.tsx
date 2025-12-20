
import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import PayrollPage from '../payroll/PayrollPage';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { TransactionType } from '../../types';

const RentalPayrollPage: React.FC = () => {
    const { state } = useAppContext();

    const buildingFundBalances = useMemo(() => {
        const serviceChargeCategory = state.categories.find(c => c.name === 'Service Charge Income');
        const rentalSalaryCategory = state.categories.find(c => c.name === 'Rental Staff Salary');

        const balances: { [buildingId: string]: { name: string, collected: number, paid: number } } = {};

        // Initialize with all buildings
        state.buildings.forEach(b => {
            balances[b.id] = { name: b.name, collected: 0, paid: 0 };
        });

        // Calculate service charges collected per building
        if (serviceChargeCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === serviceChargeCategory.id && tx.propertyId)
                .forEach(tx => {
                    const property = state.properties.find(p => p.id === tx.propertyId!);
                    if (property && balances[property.buildingId]) {
                        balances[property.buildingId].collected += tx.amount;
                    }
                });
        }

        // Calculate salaries paid per building
        if (rentalSalaryCategory) {
                state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && tx.categoryId === rentalSalaryCategory.id && tx.payslipId)
                .forEach(tx => {
                    const payslip = state.rentalPayslips.find(p => p.id === tx.payslipId);
                    const staff = payslip ? state.rentalStaff.find(s => s.id === payslip.staffId) : undefined;
                    if (staff && (staff as any).buildingId && balances[(staff as any).buildingId]) {
                        balances[(staff as any).buildingId].paid += tx.amount;
                    }
                });
        }

        return Object.entries(balances).map(([id, data]) => ({
            id,
            name: data.name,
            balance: data.collected - data.paid,
        })).sort((a, b) => a.name.localeCompare(b.name));

    }, [state]);

    return (
        <div className="space-y-4">
            <Card>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Building Service Fund Balances</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {buildingFundBalances.length > 0 ? buildingFundBalances.map(fund => (
                            <div key={fund.id} className="flex justify-between items-center text-sm p-2 rounded bg-slate-50">
                            <span className="font-medium text-slate-800">{fund.name}</span>
                            <span className={`font-bold ${fund.balance >= 0 ? 'text-accent' : 'text-danger'}`}>
                                {CURRENCY} {fund.balance.toLocaleString()}
                            </span>
                            </div>
                    )) : <p className="text-xs text-slate-500 text-center">No buildings found.</p>}
                </div>
                <p className="text-xs text-slate-500 mt-2">Total service charges collected minus salaries of staff assigned to that building.</p>
            </Card>
            <PayrollPage payrollType="Rental" />
        </div>
    );
};

export default RentalPayrollPage;
