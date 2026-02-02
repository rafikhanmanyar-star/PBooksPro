import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import MilestonesList from './MilestonesList';

interface InitiativeDetailsProps {
    initiativeId: string;
    onBack: () => void;
}

const InitiativeDetails: React.FC<InitiativeDetailsProps> = ({ initiativeId, onBack }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'milestones' | 'team' | 'activity'>('overview');

    // Mock Data
    const initiative = {
        id: initiativeId,
        title: 'Q1 Marketing Campaign Launch',
        description: 'Comprehensive marketing blitz to increase brand awareness and lead gen for Q1.',
        owner: 'Sarah Connor',
        department: 'Marketing',
        progress: 35,
        health: 'On Track',
        status: 'In Progress',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        priority: 'High',
        linkedOKR: 'Achieve $10M ARR',
        contributors: [
            { name: 'Sarah Connor', role: 'Owner', email: 'sarah@example.com', avatar: 'S' },
            { name: 'Mike Ross', role: 'Contributor', email: 'mike@example.com', avatar: 'M' },
            { name: 'Rachel Zane', role: 'Reviewer', email: 'rachel@example.com', avatar: 'R' }
        ],
        tasks: [
            { id: '1', title: 'Draft Email Copy', owner: 'Mike Ross', status: 'In Progress', progress: 50, dueDate: '2026-02-10', priority: 'High' },
            { id: '2', title: 'Design Assets', owner: 'Rachel Zane', status: 'Not Started', progress: 0, dueDate: '2026-02-15', priority: 'Medium' },
            { id: '3', title: 'Setup Landing Page', owner: 'Sarah Connor', status: 'Completed', progress: 100, dueDate: '2026-01-20', priority: 'High' }
        ],
        activity: [
            { id: 1, user: 'Sarah Connor', action: 'Created Initiative', date: '2026-01-01 09:00 AM' },
            { id: 2, user: 'Sarah Connor', action: 'Added Mike Ross as Contributor', date: '2026-01-02 10:30 AM' },
            { id: 3, user: 'Mike Ross', action: 'Completed task "Setup Landing Page"', date: '2026-01-20 02:15 PM' },
            { id: 4, user: 'System', action: 'Health changed to On Track', date: '2026-01-25 09:00 AM' }
        ]
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header & Nav */}
            <div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
                >
                    {ICONS.chevronLeft} Back to Dashboard
                </button>

                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border bg-green-100 text-green-700 border-green-200`}>
                                    {initiative.health}
                                </span>
                                <span className="text-gray-400 text-xs flex items-center gap-1">{ICONS.calendar} Due {initiative.endDate}</span>
                                <span className="text-gray-400 text-xs flex items-center gap-1">{ICONS.users} {initiative.department}</span>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{initiative.title}</h1>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                    {initiative.owner.charAt(0)}
                                </div>
                                <span className="text-sm text-gray-600">Owner: <span className="font-medium text-gray-900">{initiative.owner}</span></span>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-3 min-w-[200px]">
                            <div className="w-full">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">Progress</span>
                                    <span className="font-bold text-gray-900">{initiative.progress}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5">
                                    <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${initiative.progress}%` }}></div>
                                </div>
                            </div>
                            <button className="text-sm font-medium text-blue-600 hover:text-blue-700">
                                Update Progress
                            </button>
                        </div>
                    </div>

                    <div className="flex border-b border-gray-200 overflow-x-auto">
                        {['overview', 'tasks', 'milestones', 'team', 'activity'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${activeTab === tab ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Description</h3>
                            <p className="text-gray-700 leading-relaxed">{initiative.description}</p>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Latest Activity</h3>
                            <div className="space-y-3">
                                {initiative.activity.slice(0, 3).map(act => (
                                    <div key={act.id} className="flex gap-3 text-sm">
                                        <div className="min-w-[4px] bg-gray-200 rounded-full"></div>
                                        <div>
                                            <p className="text-gray-900"><span className="font-medium">{act.user}</span> {act.action}</p>
                                            <p className="text-xs text-gray-500">{act.date}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Details</h3>
                            <div className="space-y-4">
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">Linked OKR</span>
                                    <div className="flex items-center gap-2 text-sm font-medium text-blue-600 cursor-pointer hover:underline">
                                        {ICONS.link} {initiative.linkedOKR}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">Priority</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium 
                                        ${initiative.priority === 'High' ? 'bg-red-100 text-red-800' :
                                            initiative.priority === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {initiative.priority}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">Start Date</span>
                                    <span className="text-sm text-gray-900">{initiative.startDate}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">End Date</span>
                                    <span className="text-sm text-gray-900">{initiative.endDate}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Key Participants</h3>
                            <div className="flex -space-x-2 overflow-hidden">
                                {initiative.contributors.map((c, i) => (
                                    <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600" title={c.name}>
                                        {c.avatar}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'tasks' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            Linked Tasks
                            <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{initiative.tasks.length}</span>
                        </h3>
                        <button className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1">
                            {ICONS.plus} Link Task
                        </button>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {initiative.tasks.map((task) => (
                                <tr key={task.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {task.title}
                                        {task.priority === 'High' && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800">High</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.owner}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.dueDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                            ${task.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                                task.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                                    task.status === 'Not Started' ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-800'}`}>
                                            {task.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${task.progress}%` }}></div>
                                            </div>
                                            <span className="text-xs">{task.progress}%</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button className="text-blue-600 hover:text-blue-900">Edit</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'milestones' && (
                <MilestonesList initiativeId={initiativeId} />
            )}

            {activeTab === 'team' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-bold text-gray-800">Team & Participants</h3>
                        <button className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1">
                            {ICONS.plus} Add Participant
                        </button>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {initiative.contributors.map((member, idx) => (
                            <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold">
                                        {member.avatar}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-900">{member.name}</div>
                                        <div className="text-sm text-gray-500">{member.email}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600 font-medium">
                                        {member.role}
                                    </span>
                                    <button className="text-gray-400 hover:text-red-600">
                                        {ICONS.trash}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'activity' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-800">Activity Timeline</h3>
                        <div className="flex gap-2">
                            <select className="text-sm border-gray-300 rounded-md shadow-sm focus:border-green-500 focus:ring-green-500">
                                <option>All Activity</option>
                                <option>Comments</option>
                                <option>Updates</option>
                            </select>
                        </div>
                    </div>
                    <div className="flow-root">
                        <ul className="-mb-8">
                            {initiative.activity.map((event, eventIdx) => (
                                <li key={event.id}>
                                    <div className="relative pb-8">
                                        {eventIdx !== initiative.activity.length - 1 ? (
                                            <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                                        ) : null}
                                        <div className="relative flex space-x-3">
                                            <div>
                                                <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                                                    <span className="text-white text-xs font-bold">{event.user.charAt(0)}</span>
                                                </span>
                                            </div>
                                            <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                                                <div>
                                                    <p className="text-sm text-gray-500">
                                                        <span className="font-medium text-gray-900">{event.user}</span> {event.action}
                                                    </p>
                                                </div>
                                                <div className="text-right text-sm whitespace-nowrap text-gray-500">
                                                    <time dateTime={event.date}>{event.date}</time>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="mt-6 pt-6 border-t border-gray-100">
                        <div className="flex gap-3">
                            <div className="h-8 w-8 rounded-full bg-gray-200 flex-shrink-0"></div>
                            <div className="flex-1">
                                <textarea rows={2} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm" placeholder="Add a comment..."></textarea>
                                <div className="mt-2 flex justify-end">
                                    <button className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none">
                                        Post Comment
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InitiativeDetails;
