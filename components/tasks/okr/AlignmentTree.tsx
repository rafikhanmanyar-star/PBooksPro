import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import { tasksApi, TaskObjective } from '../../../services/api/repositories/tasksApi';
import Loading from '../../ui/Loading';

interface TreeNode extends TaskObjective {
    children: TreeNode[];
}

const AlignmentTree: React.FC = () => {
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const objectives = await tasksApi.getObjectives();

            // Build tree structure
            const map: { [key: string]: TreeNode } = {};
            const roots: TreeNode[] = [];

            objectives.forEach(obj => {
                map[obj.id] = { ...obj, children: [] };
            });

            objectives.forEach(obj => {
                if (obj.parent_objective_id && map[obj.parent_objective_id]) {
                    map[obj.parent_objective_id].children.push(map[obj.id]);
                } else {
                    roots.push(map[obj.id]);
                }
            });

            setTreeData(roots);
        } catch (error) {
            console.error('Error fetching alignment tree:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderNode = (node: TreeNode, level: number = 0) => {
        const statusColor = node.status === 'Completed' ? 'bg-green-100 text-green-700' :
            node.status === 'At Risk' ? 'bg-red-100 text-red-700' :
                node.status === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';

        return (
            <div key={node.id} className="relative">
                <div
                    className="relative z-10 bg-white border border-gray-200 rounded-lg p-3 shadow-sm mb-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-12 rounded-full ${node.progress_percentage >= 70 ? 'bg-green-500' : node.progress_percentage >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}></div>
                        <div>
                            <h4 className="font-medium text-gray-900 text-sm">{node.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold">
                                        {node.owner_name?.charAt(0) || 'U'}
                                    </div>
                                    {node.owner_name || 'Unassigned'}
                                </span>
                                <span className={`text-[10px] px-1.5 rounded-full ${node.level === 'Company' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-600'}`}>
                                    {node.level}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="w-24">
                            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                <span>{Math.round(node.progress_percentage)}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div className="bg-green-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${node.progress_percentage}%` }}></div>
                            </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                            {node.status}
                        </span>
                    </div>
                </div>

                {/* Recursively render children */}
                {node.children && node.children.length > 0 && (
                    <div className="pl-8 border-l border-gray-200 ml-4">
                        {node.children.map((child) => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (loading) return <Loading message="Loading Alignment Tree..." />;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Alignment Tree</h2>
                <div className="flex items-center gap-2">
                    <button onClick={loadData} className="p-2 text-gray-500 hover:text-gray-800">
                        {ICONS.rotateCw}
                    </button>
                    <select className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-green-500">
                        <option>Current Period</option>
                        <option>All-Time</option>
                    </select>
                </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 overflow-x-auto min-h-[500px]">
                {treeData.length > 0 ? (
                    treeData.map(node => renderNode(node))
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        {ICONS.layers}
                        <p className="mt-2 text-sm text-gray-500">No objectives found for the current period.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlignmentTree;
