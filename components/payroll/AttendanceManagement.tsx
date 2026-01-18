
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { AttendanceRecord, Employee } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';
import AttendanceEntryModal from './AttendanceEntryModal';

const AttendanceManagement: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
    const [projectFilter, setProjectFilter] = useState<string>(state.defaultProjectId || 'all');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    const filteredRecords = useMemo(() => {
        let filtered = state.attendanceRecords || [];

        // Date filter
        if (dateFilter) {
            filtered = filtered.filter(r => r.date === dateFilter);
        }

        // Project filter
        if (projectFilter !== 'all') {
            filtered = filtered.filter(r => r.projectId === projectFilter);
        }

        // Status filter
        if (statusFilter !== 'All') {
            filtered = filtered.filter(r => r.status === statusFilter);
        }

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(r => {
                const employee = (state.employees || []).find(e => e.id === r.employeeId);
                if (!employee) return false;
                const name = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`.toLowerCase();
                const employeeId = employee.employeeId.toLowerCase();
                return name.includes(q) || employeeId.includes(q);
            });
        }

        return filtered.sort((a, b) => {
            const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (dateCompare !== 0) return dateCompare;
            const empA = (state.employees || []).find(e => e.id === a.employeeId);
            const empB = (state.employees || []).find(e => e.id === b.employeeId);
            if (!empA || !empB) return 0;
            const nameA = `${empA.personalDetails.firstName} ${empA.personalDetails.lastName}`;
            const nameB = `${empB.personalDetails.firstName} ${empB.personalDetails.lastName}`;
            return nameA.localeCompare(nameB);
        });
    }, [state.attendanceRecords, state.employees, dateFilter, projectFilter, statusFilter, searchQuery]);

    const activeEmployees = useMemo(() => 
        (state.employees || []).filter(e => e.status === 'Active'),
        [state.employees]
    );

    const handleAddAttendance = () => {
        setSelectedEmployee(null);
        setSelectedDate(new Date().toISOString().split('T')[0]);
        setIsEntryModalOpen(true);
    };

    const handleEditAttendance = (record: AttendanceRecord) => {
        const employee = (state.employees || []).find(e => e.id === record.employeeId);
        setSelectedEmployee(employee || null);
        setSelectedDate(record.date);
        setIsEntryModalOpen(true);
    };

    const handleDeleteAttendance = async (recordId: string) => {
        const confirmed = await showConfirm(
            'Are you sure you want to delete this attendance record?',
            { title: 'Delete Attendance', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        if (confirmed) {
            dispatch({ type: 'DELETE_ATTENDANCE', payload: recordId });
            showToast('Attendance record deleted successfully');
        }
    };

    const getStatusBadge = (status: AttendanceRecord['status']) => {
        const colors: Record<AttendanceRecord['status'], string> = {
            'Present': 'bg-green-100 text-green-700 border-green-200',
            'Absent': 'bg-red-100 text-red-700 border-red-200',
            'Leave': 'bg-blue-100 text-blue-700 border-blue-200',
            'Holiday': 'bg-purple-100 text-purple-700 border-purple-200',
            'Half Day': 'bg-amber-100 text-amber-700 border-amber-200'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[status] || 'bg-gray-100'}`}>
                {status}
            </span>
        );
    };

    const getStats = useMemo(() => {
        const stats = {
            present: 0,
            absent: 0,
            leave: 0,
            holiday: 0,
            halfDay: 0,
            total: filteredRecords.length
        };

        filteredRecords.forEach(r => {
            if (r.status === 'Present') stats.present++;
            else if (r.status === 'Absent') stats.absent++;
            else if (r.status === 'Leave') stats.leave++;
            else if (r.status === 'Holiday') stats.holiday++;
            else if (r.status === 'Half Day') stats.halfDay++;
        });

        return stats;
    }, [filteredRecords]);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Attendance Management</h2>
                            <p className="text-sm text-slate-500 mt-1">Track employee attendance and working hours</p>
                        </div>
                        <Button onClick={handleAddAttendance} className="shadow-md hover:shadow-lg">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            Mark Attendance
                        </Button>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        <Card className="bg-green-50 border-green-200">
                            <div className="text-xs font-semibold text-green-600 uppercase mb-1">Present</div>
                            <div className="text-2xl font-bold text-green-900">{getStats.present}</div>
                        </Card>
                        <Card className="bg-red-50 border-red-200">
                            <div className="text-xs font-semibold text-red-600 uppercase mb-1">Absent</div>
                            <div className="text-2xl font-bold text-red-900">{getStats.absent}</div>
                        </Card>
                        <Card className="bg-blue-50 border-blue-200">
                            <div className="text-xs font-semibold text-blue-600 uppercase mb-1">Leave</div>
                            <div className="text-2xl font-bold text-blue-900">{getStats.leave}</div>
                        </Card>
                        <Card className="bg-purple-50 border-purple-200">
                            <div className="text-xs font-semibold text-purple-600 uppercase mb-1">Holiday</div>
                            <div className="text-2xl font-bold text-purple-900">{getStats.holiday}</div>
                        </Card>
                        <Card className="bg-amber-50 border-amber-200">
                            <div className="text-xs font-semibold text-amber-600 uppercase mb-1">Half Day</div>
                            <div className="text-2xl font-bold text-amber-900">{getStats.halfDay}</div>
                        </Card>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <div className="w-4 h-4">{ICONS.search}</div>
                                </div>
                                <Input
                                    placeholder="Search employees..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="w-40">
                            <DatePicker
                                value={dateFilter}
                                onChange={d => setDateFilter(d.toISOString().split('T')[0])}
                                label="Date"
                            />
                        </div>
                        <div className="w-48">
                            <ComboBox
                                items={[
                                    { id: 'All', name: 'All Status' },
                                    { id: 'Present', name: 'Present' },
                                    { id: 'Absent', name: 'Absent' },
                                    { id: 'Leave', name: 'Leave' },
                                    { id: 'Holiday', name: 'Holiday' },
                                    { id: 'Half Day', name: 'Half Day' }
                                ]}
                                selectedId={statusFilter}
                                onSelect={(item) => setStatusFilter(item?.id || 'All')}
                                placeholder="Filter by Status"
                            />
                        </div>
                        <div className="w-48">
                            <ComboBox
                                items={[
                                    { id: 'all', name: 'All Projects' },
                                    ...state.projects.map(p => ({ id: p.id, name: p.name }))
                                ]}
                                selectedId={projectFilter}
                                onSelect={(item) => setProjectFilter(item?.id || 'all')}
                                placeholder="Filter by Project"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Attendance Records */}
            <div className="flex-1 overflow-y-auto p-6">
                {filteredRecords.length > 0 ? (
                    <div className="space-y-2">
                        {filteredRecords.map(record => {
                            const employee = (state.employees || []).find(e => e.id === record.employeeId);
                            if (!employee) return null;

                            const employeeName = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`;
                            const project = record.projectId 
                                ? state.projects.find(p => p.id === record.projectId)
                                : null;

                            return (
                                <Card key={record.id} className="hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="flex-shrink-0">
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                                                    {employee.personalDetails.firstName[0]}{employee.personalDetails.lastName[0]}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <h3 className="font-bold text-slate-900 truncate">
                                                        {employeeName}
                                                    </h3>
                                                    {getStatusBadge(record.status)}
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-slate-600">
                                                    <span className="font-mono">{record.date}</span>
                                                    {record.checkIn && (
                                                        <span>Check-in: {record.checkIn}</span>
                                                    )}
                                                    {record.checkOut && (
                                                        <span>Check-out: {record.checkOut}</span>
                                                    )}
                                                    {record.hoursWorked && (
                                                        <span className="font-semibold">
                                                            Hours: {record.hoursWorked.toFixed(2)}h
                                                        </span>
                                                    )}
                                                    {project && (
                                                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded border border-indigo-200">
                                                            {project.name}
                                                        </span>
                                                    )}
                                                    {record.leaveType && (
                                                        <span className="text-xs text-blue-600">
                                                            Leave: {record.leaveType}
                                                        </span>
                                                    )}
                                                </div>
                                                {record.notes && (
                                                    <div className="mt-1 text-xs text-slate-500 italic">
                                                        {record.notes}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleEditAttendance(record)}
                                            >
                                                <div className="w-3 h-3 mr-1">{ICONS.edit}</div>
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleDeleteAttendance(record.id)}
                                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                            >
                                                <div className="w-3 h-3">{ICONS.trash}</div>
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-12">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <div className="w-10 h-10 text-slate-400">{ICONS.calendar}</div>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">No attendance records found</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {searchQuery || dateFilter || statusFilter !== 'All' || projectFilter !== 'all'
                                ? 'Try adjusting your filters'
                                : 'Mark attendance for employees to get started'}
                        </p>
                        {!searchQuery && !dateFilter && statusFilter === 'All' && projectFilter === 'all' && (
                            <Button onClick={handleAddAttendance}>
                                <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                                Mark Attendance
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Attendance Entry Modal */}
            <AttendanceEntryModal
                isOpen={isEntryModalOpen}
                onClose={() => {
                    setIsEntryModalOpen(false);
                    setSelectedEmployee(null);
                }}
                employee={selectedEmployee}
                date={selectedDate}
                onSuccess={() => {
                    setIsEntryModalOpen(false);
                    setSelectedEmployee(null);
                    setDateFilter(selectedDate); // Update filter to show the newly added record
                }}
            />
        </div>
    );
};

export default AttendanceManagement;
