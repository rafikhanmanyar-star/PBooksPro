import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';

const TeamList: React.FC = () => {
    // Mock Data
    const [teams, setTeams] = useState([
        { id: '1', name: 'Frontend Squad', dept: 'Engineering', manager: 'Alice Cooper', members: 5, status: 'Active' },
        { id: '2', name: 'Backend Squad', dept: 'Engineering', manager: 'Bob Dylan', members: 4, status: 'Active' },
        { id: '3', name: 'Sales Team', dept: 'Sales & Marketing', manager: 'Charlie Puth', members: 8, status: 'Active' },
    ]);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Teams</h2>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                    {ICONS.plus} Add Team
                </button>
            </div>

            {/* List View */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manager</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {teams.map((team) => (
                            <tr key={team.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{team.name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">{team.dept}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">{team.manager}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex -space-x-2 overflow-hidden">
                                        {[...Array(Math.min(team.members, 4))].map((_, i) => (
                                            <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-gray-300 flex items-center justify-center text-xs font-medium text-white">
                                                U{i + 1}
                                            </div>
                                        ))}
                                        {team.members > 4 && (
                                            <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                                                +{team.members - 4}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${team.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {team.status}
                                    </span>
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
                title="Add New Team"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Team Name *</label>
                        <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="e.g. Frontend Squad" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="">Select Department...</option>
                            <option value="Engineering">Engineering</option>
                            <option value="Product">Product</option>
                            <option value="Sales">Sales & Marketing</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="">Select Manager...</option>
                            <option value="1">John Doe</option>
                            <option value="2">Jane Smith</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Members</label>
                        <div className="p-3 border border-gray-300 rounded-md h-32 overflow-y-auto bg-gray-50">
                            <div className="space-y-2">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" className="rounded text-green-600" />
                                    <span className="text-sm">Employee 1</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" className="rounded text-green-600" />
                                    <span className="text-sm">Employee 2</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" className="rounded text-green-600" />
                                    <span className="text-sm">Employee 3</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Active Status</label>
                        <input type="checkbox" defaultChecked className="h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500" />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Save Team</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default TeamList;
