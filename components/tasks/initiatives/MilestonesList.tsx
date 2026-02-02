import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';

interface MilestonesListProps {
    initiativeId: string;
}

const MilestonesList: React.FC<MilestonesListProps> = ({ initiativeId }) => {
    // Mock Data
    const [milestones, setMilestones] = useState([
        { id: '1', title: 'Requirement Gathering', date: '2026-02-15', status: 'Completed', owner: 'Alice' },
        { id: '2', title: 'Design Mockups', date: '2026-03-01', status: 'In Progress', owner: 'Bob' },
        { id: '3', title: 'MVP Development', date: '2026-04-15', status: 'Not Started', owner: 'Charlie' }
    ]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    {ICONS.flag} Milestones
                    <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{milestones.length}</span>
                </h3>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1"
                >
                    {ICONS.plus} Add Milestone
                </button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Milestone</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {milestones.map((milestone) => (
                            <tr key={milestone.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{milestone.title}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{milestone.date}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{milestone.owner}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${milestone.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                            milestone.status === 'In Progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {milestone.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button className="text-gray-400 hover:text-green-600">{ICONS.edit}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Milestone Modal Placeholder */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Add New Milestone"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                        <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500" placeholder="e.g. Design Freeze" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                        <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500">
                            <option value="">Select User...</option>
                            <option value="Alice">Alice</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Add Milestone</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default MilestonesList;
