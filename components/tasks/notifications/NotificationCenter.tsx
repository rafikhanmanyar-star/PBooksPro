import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import NotificationSettingsModal from './NotificationSettingsModal';

const NotificationCenter: React.FC = () => {
    // Mock Data
    const [notifications, setNotifications] = useState([
        { id: '1', type: 'Task', title: 'Task Assigned', message: 'You have been assigned to "Q1 Marketing Plan"', time: '10 min ago', isRead: false, icon: ICONS.checkSquare },
        { id: '2', type: 'Approval', title: 'Approval Required', message: 'Task "Budget Review" is waiting for your approval', time: '1 hour ago', isRead: false, icon: ICONS.checkCircle },
        { id: '3', type: 'SLA', title: 'SLA Warning', message: 'Task "Design Mockups" is approaching SLA deadline', time: '2 hours ago', isRead: true, icon: ICONS.alertTriangle },
        { id: '4', type: 'System', title: 'System Update', message: 'PBooksPro will be under maintenance tonight at 2 AM', time: '1 day ago', isRead: true, icon: ICONS.settings },
    ]);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [filter, setFilter] = useState('All');

    const markAsRead = (id: string) => {
        setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
    };

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    };

    const deleteNotification = (id: string) => {
        setNotifications(notifications.filter(n => n.id !== id));
    };

    const filteredNotifications = filter === 'Unread'
        ? notifications.filter(n => !n.isRead)
        : notifications;

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
                    <p className="text-gray-500">Stay updated with tasks, approvals, and system alerts.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={markAllAsRead}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Mark all as read
                    </button>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                        {ICONS.settings} Settings
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 border-b border-gray-200 pb-1 mb-6">
                {['All', 'Unread', 'Task', 'SLA', 'System'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`text-sm font-medium px-1 py-2 border-b-2 transition-colors ${filter === f ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Notification List */}
            <div className="space-y-3">
                {filteredNotifications.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <p>No notifications found.</p>
                    </div>
                ) : (
                    filteredNotifications.map((notif) => (
                        <div
                            key={notif.id}
                            className={`flex items-start gap-4 p-4 rounded-lg border transition-all hover:shadow-sm ${notif.isRead ? 'bg-white border-gray-200' : 'bg-green-50 border-green-200'}`}
                        >
                            <div className={`p-2 rounded-lg flex-shrink-0 ${notif.type === 'SLA' ? 'bg-amber-100 text-amber-600' : notif.type === 'Approval' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                {notif.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h4 className={`text-sm font-semibold ${notif.isRead ? 'text-gray-900' : 'text-gray-900'}`}>
                                        {notif.title}
                                        {!notif.isRead && <span className="ml-2 w-2 h-2 rounded-full bg-green-500 inline-block"></span>}
                                    </h4>
                                    <span className="text-xs text-gray-500 whitespace-nowrap">{notif.time}</span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                                <div className="flex gap-4 mt-3 text-xs font-medium">
                                    <button className="text-green-600 hover:text-green-800">View Details</button>
                                    {!notif.isRead && (
                                        <button onClick={() => markAsRead(notif.id)} className="text-gray-500 hover:text-gray-700">Mark as Read</button>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => deleteNotification(notif.id)} className="text-gray-400 hover:text-red-500 p-1">
                                {ICONS.x}
                            </button>
                        </div>
                    ))
                )}
            </div>

            {isSettingsOpen && (
                <NotificationSettingsModal onClose={() => setIsSettingsOpen(false)} />
            )}
        </div>
    );
};

export default NotificationCenter;
