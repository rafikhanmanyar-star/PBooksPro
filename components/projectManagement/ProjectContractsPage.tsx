
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contract, ContactType, ContractStatus } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import ProjectContractForm from './ProjectContractForm';
import ProjectContractDetailModal from './ProjectContractDetailModal';
import BillTreeView, { BillTreeNode } from '../bills/BillTreeView';
import { formatDate } from '../../utils/dateUtils';
import useLocalStorage from '../../hooks/useLocalStorage';
import ResizeHandle from '../ui/ResizeHandle';
import { ImportType } from '../../services/importService';

type SortKey = 'contractNumber' | 'name' | 'totalAmount' | 'paid' | 'balance' | 'status' | 'startDate';

const ProjectContractsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [editingContract, setEditingContract] = useState<Contract | null>(null);

    // Tree Selection
    const [selectedNode, setSelectedNode] = useState<{ id: string; type: 'group' | 'vendor'; parentId?: string } | null>(null);

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'startDate', direction: 'desc' });

    // Sidebar Resizing
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('projectContracts_sidebarWidth', 300);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // --- Tree Data Generation ---
    const treeData = useMemo<BillTreeNode[]>(() => {
        const groupMap = new Map<string, BillTreeNode>();
        const contracts = state.contracts || [];

        // Initialize with Projects that have contracts
        state.projects.forEach(p => {
            groupMap.set(p.id, {
                id: p.id,
                name: p.name,
                type: 'group',
                children: [],
                count: 0,
                amount: 0,
                balance: 0
            });
        });

        // Pre-calculate payments per contract for performance
        const contractPayments = new Map<string, number>();
        state.transactions.forEach(tx => {
            if (tx.contractId) {
                contractPayments.set(tx.contractId, (contractPayments.get(tx.contractId) || 0) + tx.amount);
            }
        });

        contracts.forEach(contract => {
            const groupId = contract.projectId;
            const group = groupMap.get(groupId);
            const paid = contractPayments.get(contract.id) || 0;
            const balance = contract.totalAmount - paid;

            if (group) {
                group.count++;
                group.amount += contract.totalAmount;
                group.balance += balance;

                // Find or create Vendor node under this project
                let vendorNode = group.children.find(c => c.id === contract.vendorId);
                if (!vendorNode) {
                    const vendor = state.contacts.find(c => c.id === contract.vendorId);
                    vendorNode = {
                        id: contract.vendorId,
                        name: vendor?.name || 'Unknown Vendor',
                        type: 'vendor',
                        children: [],
                        count: 0,
                        amount: 0,
                        balance: 0
                    };
                    group.children.push(vendorNode);
                }
                vendorNode.count++;
                vendorNode.amount += contract.totalAmount;
                vendorNode.balance += balance;
            }
        });

        return Array.from(groupMap.values())
            .filter(g => g.count > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

    }, [state.contracts, state.projects, state.contacts, state.transactions]);

    // --- Filter Logic ---
    const filteredContracts = useMemo(() => {
        let contracts = state.contracts || [];

        // 1. Tree Filter
        if (selectedNode) {
            if (selectedNode.type === 'group') {
                contracts = contracts.filter(c => c.projectId === selectedNode.id);
            } else if (selectedNode.type === 'vendor') {
                const projectId = selectedNode.parentId;
                contracts = contracts.filter(c => c.vendorId === selectedNode.id && c.projectId === projectId);
            }
        }

        // 2. Search Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            contracts = contracts.filter(c =>
                c.contractNumber.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q) ||
                state.projects.find(p => p.id === c.projectId)?.name.toLowerCase().includes(q) ||
                state.contacts.find(v => v.id === c.vendorId)?.name.toLowerCase().includes(q)
            );
        }

        // 3. Sort
        return contracts.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            const getPaid = (c: Contract) => state.transactions.filter(tx => tx.contractId === c.id).reduce((s, t) => s + t.amount, 0);

            switch (sortConfig.key) {
                case 'contractNumber': valA = a.contractNumber; valB = b.contractNumber; break;
                case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
                case 'totalAmount': valA = a.totalAmount; valB = b.totalAmount; break;
                case 'paid': valA = getPaid(a); valB = getPaid(b); break;
                case 'balance': valA = a.totalAmount - getPaid(a); valB = b.totalAmount - getPaid(b); break;
                case 'status': valA = a.status; valB = b.status; break;
                case 'startDate': valA = new Date(a.startDate).getTime(); valB = new Date(b.startDate).getTime(); break;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    }, [state.contracts, state.projects, state.contacts, state.transactions, searchQuery, selectedNode, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Sidebar Resize Handlers
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = sidebarWidth;

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    const handleResize = useCallback((e: MouseEvent) => {
        if (isResizing.current) {
            const delta = e.clientX - startX.current;
            const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
            setSidebarWidth(newWidth);
        }
    }, [setSidebarWidth]);

    const stopResize = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const handleEdit = (contract: Contract) => {
        setEditingContract(contract);
        setIsFormOpen(true);
    };

    const handleView = (contract: Contract) => {
        setSelectedContract(contract);
        setIsDetailOpen(true);
    };

    // Check if we need to open a contract from search
    useEffect(() => {
        const contractId = sessionStorage.getItem('openContractId');
        if (contractId) {
            sessionStorage.removeItem('openContractId');
            const contract = state.contracts.find(c => c.id === contractId);
            if (contract) {
                setSelectedContract(contract);
                setIsDetailOpen(true);
            }
        }
    }, [state.contracts]);

    const getPaidAmount = (contractId: string) => {
        return state.transactions
            .filter(tx => tx.contractId === contractId)
            .reduce((sum, tx) => sum + tx.amount, 0);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4 sm:gap-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Project Contracts</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Manage vendor legal agreements, project values, and payment tracking.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.CONTRACTS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                        className="!px-4 !py-2 !rounded-xl !text-sm !border-slate-200 hover:!border-indigo-300 hover:!text-indigo-600 !bg-white transition-all shadow-sm"
                    >
                        <div className="w-4 h-4 mr-2 opacity-70">{ICONS.download}</div> Bulk Import
                    </Button>
                    <Button
                        onClick={() => { setEditingContract(null); setIsFormOpen(true); }}
                        className="!px-4 !py-2 !rounded-xl !text-sm !bg-indigo-600 hover:!bg-indigo-700 !text-white transition-all shadow-md shadow-indigo-500/20"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New Contract
                    </Button>
                </div>
            </div>

            {/* Toolbar Area */}
            <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center flex-shrink-0">
                <div className="relative flex-grow w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <div className="w-4 h-4">{ICONS.search}</div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search by contract ID, title, vendor, or project..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full pl-9 pr-8 py-2 text-sm border-0 bg-transparent focus:ring-0 placeholder:text-slate-400 text-slate-700"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                            <div className="w-4 h-4">{ICONS.x}</div>
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content Split View */}
            <div className="flex-grow flex flex-col md:flex-row gap-6 overflow-hidden min-h-0">

                {/* Left Tree View */}
                <div
                    className="hidden md:flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                    style={{ width: sidebarWidth }}
                >
                    <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hierarchy</span>
                        {selectedNode && (
                            <button
                                onClick={() => setSelectedNode(null)}
                                className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full hover:bg-indigo-100 font-bold transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex-grow overflow-auto p-2">
                        <BillTreeView
                            treeData={treeData}
                            selectedNodeId={selectedNode?.id || null}
                            selectedParentId={selectedNode?.parentId || null}
                            onNodeSelect={(id, type, parentId) => setSelectedNode({ id, type, parentId })}
                        />
                    </div>
                </div>

                {/* Resizer Handle */}
                <div className="hidden md:flex items-center justify-center w-2 hover:w-3 -ml-3 -mr-3 z-10 cursor-col-resize group transition-all" onMouseDown={startResizing}>
                    <div className="w-1 h-8 rounded-full bg-slate-200 group-hover:bg-indigo-400 transition-colors"></div>
                </div>

                {/* Right Data Grid */}
                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-auto">
                        <table className="min-w-full divide-y divide-slate-100 text-xs border-separate border-spacing-0">
                            <thead className="bg-slate-50 sticky top-0 z-20">
                                <tr>
                                    <th onClick={() => handleSort('contractNumber')} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 transition-colors">
                                        ID <SortIcon column="contractNumber" />
                                    </th>
                                    <th onClick={() => handleSort('name')} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 transition-colors">
                                        Contract Details <SortIcon column="name" />
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Vendor</th>
                                    <th onClick={() => handleSort('totalAmount')} className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 transition-colors">
                                        Value <SortIcon column="totalAmount" />
                                    </th>
                                    <th onClick={() => handleSort('paid')} className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 transition-colors">
                                        Paid <SortIcon column="paid" />
                                    </th>
                                    <th onClick={() => handleSort('balance')} className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 transition-colors">
                                        Balance <SortIcon column="balance" />
                                    </th>
                                    <th onClick={() => handleSort('startDate')} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 transition-colors">
                                        Started <SortIcon column="startDate" />
                                    </th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 transition-colors">
                                        Status <SortIcon column="status" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                                {filteredContracts.length > 0 ? filteredContracts.map((contract) => {
                                    const paid = getPaidAmount(contract.id);
                                    const balance = contract.totalAmount - paid;
                                    const vendor = state.contacts.find(c => c.id === contract.vendorId);
                                    const project = state.projects.find(p => p.id === contract.projectId);

                                    return (
                                        <tr
                                            key={contract.id}
                                            onClick={() => handleView(contract)}
                                            className="hover:bg-slate-50 cursor-pointer transition-all duration-150 group"
                                        >
                                            <td className="px-4 py-2.5">
                                                <span className="font-mono text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
                                                    {contract.contractNumber}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors leading-tight">{contract.name}</div>
                                                <div className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] uppercase tracking-tight mt-0.5">
                                                    {project?.name || 'No Project'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200">
                                                        {(vendor?.name || 'U')[0]}
                                                    </div>
                                                    <span className="text-slate-600 font-medium">{vendor?.name || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-semibold text-slate-700 tabular-nums">
                                                {CURRENCY} {contract.totalAmount.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-emerald-600 font-medium tabular-nums">
                                                {CURRENCY} {paid.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">
                                                <span className={`font-bold ${balance > 0.01 ? 'text-rose-600' : 'text-slate-400 font-normal'}`}>
                                                    {CURRENCY} {balance.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                                                {formatDate(contract.startDate)}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${contract.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                        contract.status === 'Terminated' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                                            'bg-slate-100 text-slate-600 border border-slate-200'
                                                    }`}>
                                                    {contract.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>}
                                                    {contract.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-16 text-center">
                                            <div className="flex flex-col items-center justify-center text-slate-400 opacity-60">
                                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                                    <div className="w-6 h-6">{ICONS.fileText}</div>
                                                </div>
                                                <p className="text-sm font-medium">No contracts found</p>
                                                <p className="text-xs mt-1">Try adjusting your selection or search query</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Compact Footer */}
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 backdrop-blur-sm flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <div className="flex items-center gap-4">
                            <span>Count: <span className="text-slate-900">{filteredContracts.length}</span></span>
                            <span>Active: <span className="text-emerald-600">{filteredContracts.filter(c => c.status === 'Active').length}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Total Exposure:</span>
                            <span className="text-slate-900 text-xs font-bold tabular-nums">
                                {CURRENCY} {filteredContracts.reduce((sum, c) => sum + (c.totalAmount - getPaidAmount(c.id)), 0).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingContract ? "Edit Contract" : "New Contract"} size="xl">
                <ProjectContractForm
                    onClose={() => setIsFormOpen(false)}
                    contractToEdit={editingContract}
                />
            </Modal>

            <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Contract Details" size="xl">
                {selectedContract && (
                    <ProjectContractDetailModal
                        contract={selectedContract}
                        onClose={() => setIsDetailOpen(false)}
                        onEdit={() => { setIsDetailOpen(false); handleEdit(selectedContract); }}
                    />
                )}
            </Modal>
        </div>
    );
};

export default ProjectContractsPage;
