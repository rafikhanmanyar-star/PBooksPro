
import React, { useState, useMemo, useRef, useCallback } from 'react';
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

    const getPaidAmount = (contractId: string) => {
        return state.transactions
            .filter(tx => tx.contractId === contractId)
            .reduce((sum, tx) => sum + tx.amount, 0);
    };

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                <div className="relative flex-grow w-full sm:w-auto">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <span className="h-5 w-5">{ICONS.search}</span>
                    </div>
                    <Input 
                        placeholder="Search contracts..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="pl-10"
                    />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.CONTRACTS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.download}</div> Bulk Import
                    </Button>
                    <Button onClick={() => { setEditingContract(null); setIsFormOpen(true); }}>
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New Contract
                    </Button>
                </div>
            </div>

            {/* Main Content Split View */}
            <div className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
                
                {/* Left Tree View */}
                <div 
                    className="hidden md:flex flex-col h-full flex-shrink-0"
                    style={{ width: sidebarWidth }}
                >
                    <div className="font-bold text-slate-700 mb-2 px-1 flex justify-between items-center">
                        <span>Projects & Vendors</span>
                        {selectedNode && (
                            <button onClick={() => setSelectedNode(null)} className="text-xs text-accent hover:underline">Clear Selection</button>
                        )}
                    </div>
                    <BillTreeView 
                        treeData={treeData} 
                        selectedNodeId={selectedNode?.id || null} 
                        selectedParentId={selectedNode?.parentId || null}
                        onNodeSelect={(id, type, parentId) => setSelectedNode({ id, type, parentId })} 
                    />
                </div>

                {/* Resizer Handle */}
                <div className="hidden md:block h-full">
                    <ResizeHandle onMouseDown={startResizing} />
                </div>

                {/* Right Data Grid */}
                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th onClick={() => handleSort('contractNumber')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">ID <SortIcon column="contractNumber"/></th>
                                    <th onClick={() => handleSort('name')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Title <SortIcon column="name"/></th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Vendor</th>
                                    <th onClick={() => handleSort('totalAmount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Amount <SortIcon column="totalAmount"/></th>
                                    <th onClick={() => handleSort('paid')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid <SortIcon column="paid"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                    <th onClick={() => handleSort('startDate')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Start Date <SortIcon column="startDate"/></th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Status <SortIcon column="status"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {filteredContracts.length > 0 ? filteredContracts.map((contract) => {
                                    const paid = getPaidAmount(contract.id);
                                    const balance = contract.totalAmount - paid;
                                    const vendor = state.contacts.find(c => c.id === contract.vendorId);
                                    const project = state.projects.find(p => p.id === contract.projectId);
                                    
                                    return (
                                        <tr 
                                            key={contract.id} 
                                            onClick={() => handleView(contract)}
                                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-3 font-mono text-xs text-slate-600">{contract.contractNumber}</td>
                                            <td className="px-4 py-3 font-medium text-slate-800">
                                                {contract.name}
                                                <div className="text-xs text-slate-500 font-normal">{project?.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{vendor?.name || 'Unknown'}</td>
                                            <td className="px-4 py-3 text-right font-medium">{CURRENCY} {contract.totalAmount.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-emerald-600">{CURRENCY} {paid.toLocaleString()}</td>
                                            <td className={`px-4 py-3 text-right font-bold ${balance < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{CURRENCY} {balance.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-slate-500">{formatDate(contract.startDate)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                    contract.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 
                                                    contract.status === 'Terminated' ? 'bg-rose-100 text-rose-800' : 
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {contract.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                            No contracts found matching your criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 text-sm font-medium text-slate-600 flex justify-between">
                        <span>Count: {filteredContracts.length}</span>
                        <span>Total Value: {CURRENCY} {filteredContracts.reduce((sum, c) => sum + c.totalAmount, 0).toLocaleString()}</span>
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
