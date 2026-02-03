import React, { useState } from 'react';
import { ICONS } from '../../../constants';

interface NotificationSettingsModalProps {
    onClose: () => void;
}

const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ onClose }) => {
    const [preferences, setPreferences] = useState({
        email: true,
        inApp: true,
        push: false,
        assignments: true,
        statusChanges: true,
        deadlines: true,
        approvals: true,
        comments: false
    });

    const toggle = (key: keyof typeof preferences) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl animate-scale-up">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h3 className="text-lg font-bold text-gray-900">Notification Preferences</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        {ICONS.x}
                    </button>
                </div>

                <div className="space-y-6">
                    <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Delivery Channels</h4>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-700">Email Notifications</span>
                                <button
                                    onClick={() => toggle('email')}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferences.email ? 'bg-green-600' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferences.email ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-700">In-App Alerts</span>
                                <button
                                    onClick={() => toggle('inApp')}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferences.inApp ? 'bg-green-600' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferences.inApp ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Triggers</h4>
                        <div className="space-y-3">
                            {[
                                { key: 'assignments', label: 'Task Assignments' },
                                { key: 'statusChanges', label: 'Status Updates' },
                                { key: 'deadlines', label: 'Deadline Reminders' },
                                { key: 'approvals', label: 'Approval Requests' },
                                { key: 'comments', label: 'Comments & Mentions' },
                            ].map((item) => (
                                <div key={item.key} className="flex items-center justify-between">
                                    <span className="text-sm text-gray-700">{item.label}</span>
                                    <button
                                        onClick={() => toggle(item.key as any)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferences[item.key as keyof typeof preferences] ? 'bg-green-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferences[item.key as keyof typeof preferences] ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">Cancel</button>
                    <button onClick={() => { console.log('Saved', preferences); onClose(); }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm">Save Preferences</button>
                </div>
            </div>
        </div>
    );
};

export default NotificationSettingsModal;
