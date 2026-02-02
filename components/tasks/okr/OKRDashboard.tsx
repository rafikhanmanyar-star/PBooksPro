import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import { tasksApi, TaskObjective } from '../../../services/api/repositories/tasksApi';
import Loading from '../../ui/Loading';

interface OKRSummaryCardProps {
    objective: TaskObjective;
    onClick: () => void;
}

const OKRSummaryCard: React.FC<OKRSummaryCardProps> = ({ objective, onClick }) => {
    const getConfidenceColor = (score: number) => {
        if (score >= 80) return 'text-green-600 bg-green-50';
        if (score >= 50) return 'text-amber-600 bg-amber-50';
        return 'text-red-600 bg-red-50';
    };

    const getProgressBarColor = (progress: number) => {
        if (progress >= 80) return 'bg-green-600';
        if (progress >= 50) return 'bg-amber-500';
        return 'bg-blue-600'; // Default progress color
    };

    return (
        <div
            onClick={onClick}
            className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block
                        ${objective.level === 'Company' ? 'bg-purple-100 text-purple-700' :
                            objective.level === 'Department' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'}`}>
                        {objective.level}
                    </span>
                    <h3 className="font-semibold text-gray-800 line-clamp-2">{objective.title}</h3>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded ${getConfidenceColor(objective.confidence_score)}`}>
                    {objective.confidence_score}% Conf.
                </div>
            </div>

            <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{Math.round(objective.progress_percentage)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full transition-all duration-500 ${getProgressBarColor(objective.progress_percentage)}`}
                        style={{ width: `${objective.progress_percentage}%` }}
                    ></div>
                </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {objective.owner_name?.charAt(0) || 'U'}
                    </div>
                    <span className="text-xs text-gray-600 truncate max-w-[100px]">{objective.owner_name || 'Unassigned'}</span>
                </div>
                <button className="text-gray-400 hover:text-gray-600">
                    {ICONS.chevronRight}
                </button>
            </div>
        </div>
    );
};

interface OKRDashboardProps {
    onNavigate: (view: string, id?: string) => void;
}

const OKRDashboard: React.FC<OKRDashboardProps> = ({ onNavigate }) => {
    const [objectives, setObjectives] = useState<TaskObjective[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterLevel, setFilterLevel] = useState('All');

    useEffect(() => {
        loadObjectives();
    }, []);

    const loadObjectives = async () => {
        try {
            setLoading(true);
            const data = await tasksApi.getObjectives();
            setObjectives(data);
        } catch (error) {
            console.error('Error fetching objectives:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredOKRs = filterLevel === 'All'
        ? objectives
        : objectives.filter(okr => okr.level === filterLevel);

    // Stats
    const companyStats = objectives.filter(o => o.level === 'Company');
    const atRiskCount = objectives.filter(o => o.status === 'At Risk').length;
    companyProgress = companyStats.length > 0
        ? companyStats.reduce((acc, curr) => acc + curr.progress_percentage, 0) / companyStats.length
        : 0;

    if (loading) return <Loading message="Loading OKR Dashboard..." />;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-5 text-white shadow-md">
                    <h3 className="text-blue-100 text-sm font-medium mb-1">Company Objectives</h3>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold">{companyStats.length}</span>
                        <span className="text-blue-200 text-sm mb-1">Active</span>
                    </div>
                    <div className="mt-3 w-full bg-blue-800 rounded-full h-1.5">
                        <div className="bg-blue-300 h-1.5 rounded-full transition-all duration-500" style={{ width: `${companyProgress}%` }}></div>
                    </div>
                    <p className="text-xs text-blue-200 mt-1">{Math.round(companyProgress)}% Overall Progress</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                    <h3 className="text-gray-500 text-sm font-medium mb-1">At Risk Objectives</h3>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold text-red-600">{atRiskCount}</span>
                        <span className="text-gray-400 text-sm mb-1">Needs Attention</span>
                    </div>
                    <button className="mt-3 text-sm text-red-600 font-medium hover:text-red-700 flex items-center gap-1">
                        View Details {ICONS.arrowRight}
                    </button>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                    <h3 className="text-gray-500 text-sm font-medium mb-1">Total Objectives</h3>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold text-gray-900">{objectives.length}</span>
                        <span className="text-gray-400 text-sm mb-1">In Period</span>
                    </div>
                    <button onClick={loadObjectives} className="mt-3 text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1">
                        Refresh Data {ICONS.rotateCw}
                    </button>
                </div>
            </div>

            {/* Filters & Actions */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm overflow-x-auto no-scrollbar max-w-full">
                    {['All', 'Company', 'Department', 'Team', 'Individual'].map(level => (
                        <button
                            key={level}
                            onClick={() => setFilterLevel(level)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${filterLevel === level
                                ? 'bg-gray-100 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            {level}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={() => onNavigate('create')}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm transition-colors"
                    >
                        {ICONS.plus} New Objective
                    </button>
                </div>
            </div>

            {/* OKR Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOKRs.map(okr => (
                    <OKRSummaryCard
                        key={okr.id}
                        objective={okr}
                        onClick={() => onNavigate('details', okr.id)}
                    />
                ))}
            </div>

            {filteredOKRs.length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
                    <div className="mx-auto h-12 w-12 text-gray-400 flex items-center justify-center">
                        {ICONS.target}
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No OKRs found</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new objective.</p>
                    <div className="mt-6">
                        <button
                            onClick={() => onNavigate('create')}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            {ICONS.plus} New Objective
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

let companyProgress = 0; // Added this since it was used but not defined

export default OKRDashboard;
