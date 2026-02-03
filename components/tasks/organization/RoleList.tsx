import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';

const RoleList: React.FC = () => {
    // Mock Data
    const [roles, setRoles] = useState([
        { id: '1', name: 'Task Admin', scope: 'Company', users: 3 },
        { id: '2', name: 'Dept Head', scope: 'Department', users: 4 },
        { id: '3', name: 'Team Lead', scope: 'Team', users: 8 },
        { id: '4', name: 'Contributor', scope: 'Team', users: 30 },
    ]);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Roles & Permissions</h2>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                    {ICONS.plus} Add Role
                </button>
            </div>

            {/* List View */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Users</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {roles.map((role) => (
                            <tr key={role.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{role.name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium 
                                        ${role.scope === 'Company' ? 'bg-purple-100 text-purple-800' :
                                            role.scope === 'Department' ? 'bg-blue-100 text-blue-800' :
                                                'bg-green-100 text-green-800'}`}>
                                        {role.scope}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">{role.users} Users</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button className="text-blue-600 hover:text-blue-900 mr-3">{ICONS.edit}</button>
                                    <button className="text-red-600 hover:text-red-900">{ICONS.trash}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Add New Role"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role Name *</label>
                        <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="e.g. Project Manager" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="Company">Company</option>
                            <option value="Department">Department</option>
                            <option value="Team">Team</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                        <div className="space-y-2 bg-gray-50 p-3 rounded-md border border-gray-200">
                            <label className="flex items-center gap-2">
                                <input type="checkbox" className="rounded text-green-600" />
                                <span className="text-sm">Manage OKRs</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" className="rounded text-green-600" />
                                <span className="text-sm">Create/Edit Tasks</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" className="rounded text-green-600" />
                                <span className="text-sm">Delete Tasks</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" className="rounded text-green-600" />
                                <span className="text-sm">View Analytics</span>
                            </label>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Save Role</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default RoleList;
