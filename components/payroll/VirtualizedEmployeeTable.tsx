import React, { memo, useMemo } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { Mail, Phone } from 'lucide-react';
import type { PayrollEmployee } from './types';

const ROW_HEIGHT = 64;
const LIST_MAX_HEIGHT = 520;
const OVERSCAN_COUNT = 6;
const MIN_TABLE_WIDTH = 880;

export interface VirtualizedEmployeeTableProps {
    employees: PayrollEmployee[];
    onSelect: (employee: PayrollEmployee) => void;
    emptyMessage: string;
}

type EmployeeRowExtra = {
    employees: PayrollEmployee[];
    onSelect: (employee: PayrollEmployee) => void;
};

const EmployeeTableRow = memo(function EmployeeTableRow(props: RowComponentProps<EmployeeRowExtra>) {
    const { index, style, ariaAttributes, employees, onSelect } = props;
    const emp = employees[index];
    if (!emp) {
        return <div style={style} aria-hidden />;
    }

    return (
        <div
            {...ariaAttributes}
            style={{ ...style, minWidth: MIN_TABLE_WIDTH }}
            className="flex items-center group hover:bg-app-toolbar/30 cursor-pointer transition-colors border-b border-app-border bg-app-card"
            onClick={() => onSelect(emp)}
        >
            <div className="min-w-0 flex-[1.4] px-6 lg:px-8 py-4">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-app-toolbar flex items-center justify-center font-bold text-app-muted group-hover:bg-primary/15 group-hover:text-primary transition-colors uppercase shrink-0">
                        {emp.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className="min-w-0">
                        <div className="font-bold text-app-text group-hover:text-primary transition-colors truncate">
                            {emp.name}
                        </div>
                        <div className="text-xs text-app-muted font-medium truncate">
                            {emp.employee_code || `ID: ${emp.id}`}
                        </div>
                    </div>
                </div>
            </div>
            <div className="min-w-0 flex-1 px-6 lg:px-8 py-4">
                {emp.email || emp.phone ? (
                    <div className="space-y-1">
                        {emp.email && (
                            <div className="flex items-center gap-1.5 text-xs text-app-muted font-medium truncate max-w-[180px]">
                                <Mail size={10} className="shrink-0" />
                                <span className="truncate">{emp.email}</span>
                            </div>
                        )}
                        {emp.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-app-muted font-medium truncate max-w-[150px]">
                                <Phone size={10} className="shrink-0" />
                                {emp.phone}
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-[10px] text-app-muted/60 uppercase font-black tracking-widest">Not Provided</span>
                )}
            </div>
            <div className="min-w-0 flex-[0.9] px-6 lg:px-8 py-4">
                <div className="text-sm font-bold text-app-text truncate">{emp.designation}</div>
                <div className="text-xs text-app-muted font-medium truncate">{emp.department}</div>
            </div>
            <div className="w-40 shrink-0 px-6 lg:px-8 py-4 text-right">
                <button
                    type="button"
                    className="text-primary font-bold text-xs uppercase tracking-wider hover:bg-primary hover:text-ds-on-primary px-3 py-1.5 rounded-lg border border-primary/20 transition-all"
                >
                    View Profile
                </button>
            </div>
        </div>
    );
});

EmployeeTableRow.displayName = 'EmployeeTableRow';

const VirtualizedEmployeeTable: React.FC<VirtualizedEmployeeTableProps> = ({
    employees,
    onSelect,
    emptyMessage,
}) => {
    const rowProps = useMemo(
        () => ({ employees, onSelect }) satisfies EmployeeRowExtra,
        [employees, onSelect]
    );

    if (employees.length === 0) {
        return (
            <div className="px-8 py-20 text-center text-app-muted font-medium">{emptyMessage}</div>
        );
    }

    const listHeight = Math.min(LIST_MAX_HEIGHT, Math.max(employees.length * ROW_HEIGHT, ROW_HEIGHT));

    return (
        <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="overflow-x-auto flex-shrink-0 bg-app-toolbar/40 border-b border-app-border">
                <div
                    className="flex text-[10px] font-black text-app-muted uppercase tracking-widest"
                    style={{ minWidth: MIN_TABLE_WIDTH }}
                >
                    <div className="min-w-0 flex-[1.4] px-6 lg:px-8 py-5">Employee Info</div>
                    <div className="min-w-0 flex-1 px-6 lg:px-8 py-5">Contact Details</div>
                    <div className="min-w-0 flex-[0.9] px-6 lg:px-8 py-5">Role & Dept</div>
                    <div className="w-40 shrink-0 px-6 lg:px-8 py-5 text-right">Actions</div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <List<EmployeeRowExtra>
                    rowCount={employees.length}
                    rowHeight={ROW_HEIGHT}
                    overscanCount={OVERSCAN_COUNT}
                    rowComponent={EmployeeTableRow}
                    rowProps={rowProps}
                    style={{ height: listHeight, width: '100%', minWidth: MIN_TABLE_WIDTH }}
                />
            </div>
        </div>
    );
};

export default memo(VirtualizedEmployeeTable);
