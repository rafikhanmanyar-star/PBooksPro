
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { AttendanceRecord, Employee } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';

interface AttendanceEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    date: string;
    onSuccess?: () => void;
}

const AttendanceEntryModal: React.FC<AttendanceEntryModalProps> = ({
    isOpen,
    onClose,
    employee,
    date: initialDate,
    onSuccess
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [date, setDate] = useState(initialDate);
    const [status, setStatus] = useState<AttendanceRecord['status'] | 'Custom'>('Present');
    const [customAttendanceStatus, setCustomAttendanceStatus] = useState('');
    const [checkIn, setCheckIn] = useState('');
    const [checkOut, setCheckOut] = useState('');
    const [hoursWorked, setHoursWorked] = useState('');
    const [leaveType, setLeaveType] = useState('');
    const [projectId, setProjectId] = useState('');
    const [notes, setNotes] = useState('');

    const activeEmployees = useMemo(() => 
        (state.employees || []).filter(e => e.status === 'Active'),
        [state.employees]
    );

    const existingRecord = useMemo(() => {
        if (!selectedEmployeeId || !date) return null;
        return (state.attendanceRecords || []).find(
            r => r.employeeId === selectedEmployeeId && r.date === date
        );
    }, [state.attendanceRecords, selectedEmployeeId, date]);

    useEffect(() => {
        if (isOpen) {
            if (employee) {
                setSelectedEmployeeId(employee.id);
                setProjectId(employee.projectAssignments?.[0]?.projectId || '');
            } else {
                setSelectedEmployeeId('');
            }
            setDate(initialDate);
            setStatus('Present');
            setCustomAttendanceStatus('');
            setCheckIn('');
            setCheckOut('');
            setHoursWorked('');
            setLeaveType('');
            setNotes('');
        }
    }, [isOpen, employee, initialDate]);

    useEffect(() => {
        if (existingRecord) {
            // Check if status is a standard status or custom
            const standardStatuses: AttendanceRecord['status'][] = ['Present', 'Absent', 'Leave', 'Holiday', 'Half Day'];
            if (standardStatuses.includes(existingRecord.status)) {
                setStatus(existingRecord.status);
                setCustomAttendanceStatus('');
            } else {
                setStatus('Custom');
                setCustomAttendanceStatus(existingRecord.status);
            }
            setCheckIn(existingRecord.checkIn || '');
            setCheckOut(existingRecord.checkOut || '');
            setHoursWorked(existingRecord.hoursWorked?.toString() || '');
            setLeaveType(existingRecord.leaveType || '');
            setProjectId(existingRecord.projectId || '');
            setNotes(existingRecord.notes || '');
        }
    }, [existingRecord]);

    const calculateHours = () => {
        if (checkIn && checkOut) {
            const [inHour, inMin] = checkIn.split(':').map(Number);
            const [outHour, outMin] = checkOut.split(':').map(Number);
            const inMinutes = inHour * 60 + inMin;
            const outMinutes = outHour * 60 + outMin;
            let diffMinutes = outMinutes - inMinutes;
            
            // Handle overnight (check-out next day)
            if (diffMinutes < 0) {
                diffMinutes += 24 * 60;
            }
            
            const hours = diffMinutes / 60;
            setHoursWorked(hours.toFixed(2));
        }
    };

    useEffect(() => {
        if (checkIn && checkOut) {
            calculateHours();
        }
    }, [checkIn, checkOut]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedEmployeeId) {
            await showAlert('Please select an employee.');
            return;
        }

        if (!date) {
            await showAlert('Please select a date.');
            return;
        }

        const attendanceStatus = status === 'Custom' ? customAttendanceStatus.trim() : status;

        if (!attendanceStatus) {
            await showAlert('Please enter an attendance status.');
            return;
        }

        const record: AttendanceRecord = {
            id: existingRecord?.id || `attendance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            employeeId: selectedEmployeeId,
            date,
            status: attendanceStatus as AttendanceRecord['status'],
            checkIn: checkIn || undefined,
            checkOut: checkOut || undefined,
            hoursWorked: hoursWorked ? parseFloat(hoursWorked) : undefined,
            leaveType: leaveType || undefined,
            projectId: projectId || undefined,
            notes: notes || undefined
        };

        if (existingRecord) {
            dispatch({ type: 'UPDATE_ATTENDANCE', payload: record });
            showToast('Attendance record updated successfully!', 'success');
        } else {
            dispatch({ type: 'ADD_ATTENDANCE', payload: record });
            showToast('Attendance record added successfully!', 'success');
        }
        
        if (onSuccess) onSuccess();
        else onClose();
    };

    const selectedEmployee = useMemo(() => 
        activeEmployees.find(e => e.id === selectedEmployeeId),
        [activeEmployees, selectedEmployeeId]
    );

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={existingRecord ? 'Edit Attendance' : 'Mark Attendance'}
            size="lg"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <ComboBox
                    label="Employee"
                    items={activeEmployees.map(e => ({
                        id: e.id,
                        name: `${e.personalDetails.firstName} ${e.personalDetails.lastName} (${e.employeeId})`
                    }))}
                    selectedId={selectedEmployeeId}
                    onSelect={(item) => setSelectedEmployeeId(item?.id || '')}
                    placeholder="Select Employee"
                    required
                    disabled={!!employee}
                />

                <DatePicker
                    label="Date"
                    value={date}
                    onChange={d => setDate(d.toISOString().split('T')[0])}
                    required
                />

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Status <span className="text-rose-500">*</span>
                    </label>
                    <ComboBox
                        items={[
                            { id: 'Present', name: 'Present' },
                            { id: 'Absent', name: 'Absent' },
                            { id: 'Leave', name: 'Leave' },
                            { id: 'Holiday', name: 'Holiday' },
                            { id: 'Half Day', name: 'Half Day' },
                            { id: 'Custom', name: '+ Add Custom Status...' }
                        ]}
                        selectedId={status === 'Custom' ? 'Custom' : status}
                        onSelect={(item) => {
                            if (item?.id === 'Custom') {
                                setStatus('Custom');
                                setCustomAttendanceStatus('');
                            } else {
                                setStatus((item?.id as AttendanceRecord['status']) || 'Present');
                                setCustomAttendanceStatus('');
                            }
                        }}
                        placeholder="Select or add attendance status"
                        required
                    />
                    {status === 'Custom' && (
                        <Input
                            label="Custom Attendance Status"
                            value={customAttendanceStatus}
                            onChange={e => setCustomAttendanceStatus(e.target.value)}
                            placeholder="Enter custom status..."
                            className="mt-2"
                            required
                        />
                    )}
                </div>

                {(status === 'Leave' || (status === 'Custom' && customAttendanceStatus.toLowerCase().includes('leave'))) && (
                    <Input
                        label="Leave Type"
                        value={leaveType}
                        onChange={e => setLeaveType(e.target.value)}
                        placeholder="e.g. Sick Leave, Casual Leave, Annual Leave"
                    />
                )}

                {(status === 'Present' || status === 'Half Day' || (status === 'Custom' && !customAttendanceStatus.toLowerCase().includes('leave'))) && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Check-in Time"
                                type="time"
                                value={checkIn}
                                onChange={e => setCheckIn(e.target.value)}
                                placeholder="HH:MM"
                            />
                            <Input
                                label="Check-out Time"
                                type="time"
                                value={checkOut}
                                onChange={e => setCheckOut(e.target.value)}
                                placeholder="HH:MM"
                            />
                        </div>
                        <Input
                            label="Hours Worked"
                            type="number"
                            step="0.01"
                            value={hoursWorked}
                            onChange={e => setHoursWorked(e.target.value)}
                            placeholder="Auto-calculated from check-in/out"
                            disabled={!!(checkIn && checkOut)}
                        />
                    </>
                )}

                <ComboBox
                    label="Project (Optional)"
                    items={state.projects.map(p => ({ id: p.id, name: p.name }))}
                    selectedId={projectId}
                    onSelect={(item) => setProjectId(item?.id || '')}
                    placeholder="Select Project"
                />

                <Textarea
                    label="Notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Additional notes..."
                    rows={3}
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">{existingRecord ? 'Update' : 'Save'} Attendance</Button>
                </div>
            </form>
        </Modal>
    );
};

export default AttendanceEntryModal;
