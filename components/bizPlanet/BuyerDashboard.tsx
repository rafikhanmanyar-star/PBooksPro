import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { apiClient } from '../../services/api/client';
import { PurchaseOrder, P2PInvoice, POStatus, P2PInvoiceStatus, POItem, TransactionType, SupplierRegistrationRequest, SupplierRegistrationStatus } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import Input from '../ui/Input';
import { useNotification } from '../../context/NotificationContext';

interface Supplier {
    id: string;
    name: string;
    company_name?: string;
}

const BuyerDashboard: React.FC = () => {
    const { tenant } = useAuth();
    const { state } = useAppContext();
    const { showToast, showAlert } = useNotification();
    const [outstandingPOs, setOutstandingPOs] = useState<PurchaseOrder[]>([]);
    const [invoicesAwaitingApproval, setInvoicesAwaitingApproval] = useState<P2PInvoice[]>([]);
    const [registrationRequests, setRegistrationRequests] = useState<SupplierRegistrationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [registeredSuppliers, setRegisteredSuppliers] = useState<Supplier[]>([]);
    const [supplierTenantId, setSupplierTenantId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [poDescription, setPoDescription] = useState('');
    const [items, setItems] = useState<POItem[]>([]);

    // Get expense categories for line items
    const expenseCategories = useMemo(() => 
        state.categories.filter(c => c.type === TransactionType.EXPENSE),
        [state.categories]
    );

    // Get projects list
    const projects = useMemo(() => state.projects || [], [state.projects]);

    useEffect(() => {
        loadData();
        loadRegistrationRequests();
        loadRegisteredSuppliers();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // Load outstanding POs (status: SENT, RECEIVED, INVOICED, DELIVERED)
            const outstandingStatuses = ['SENT', 'RECEIVED', 'INVOICED', 'DELIVERED'];
            const allPOs = await apiClient.get<PurchaseOrder[]>('/purchase-orders');
            const outstanding = allPOs.filter(po => outstandingStatuses.includes(po.status));
            setOutstandingPOs(outstanding);

            // Load invoices awaiting approval (status: PENDING, UNDER_REVIEW)
            const allInvoices = await apiClient.get<P2PInvoice[]>('/p2p-invoices');
            const awaitingApproval = allInvoices.filter(inv => 
                inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW
            );
            setInvoicesAwaitingApproval(awaitingApproval);

        } catch (error) {
            console.error('Error loading buyer dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadRegisteredSuppliers = async () => {
        try {
            // Only load registered (approved) suppliers
            const registeredList = await apiClient.get<Supplier[]>('/supplier-registrations/registered');
            setRegisteredSuppliers(registeredList);
            // Also update suppliers list for backward compatibility
            setSuppliers(registeredList);
        } catch (error) {
            console.error('Error loading registered suppliers:', error);
        }
    };

    const loadRegistrationRequests = async () => {
        try {
            const requests = await apiClient.get<SupplierRegistrationRequest[]>('/supplier-registrations/requests?status=PENDING');
            setRegistrationRequests(requests);
        } catch (error) {
            console.error('Error loading registration requests:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700';
            case 'SENT': return 'bg-blue-100 text-blue-700';
            case 'PENDING': return 'bg-yellow-100 text-yellow-700';
            case 'APPROVED': return 'bg-green-100 text-green-700';
            case 'REJECTED': return 'bg-red-100 text-red-700';
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const handleApproveInvoice = async (invoiceId: string) => {
        try {
            await apiClient.put(`/p2p-invoices/${invoiceId}/approve`);
            await loadData();
        } catch (error) {
            console.error('Error approving invoice:', error);
        }
    };

    const handleApproveRegistration = async (requestId: string, comments?: string) => {
        try {
            await apiClient.put(`/supplier-registrations/${requestId}/approve`, { comments });
            showToast('Supplier registration approved successfully');
            await loadRegistrationRequests();
            await loadRegisteredSuppliers();
        } catch (error: any) {
            console.error('Error approving registration:', error);
            showAlert(error.response?.data?.error || 'Failed to approve registration request');
        }
    };

    const handleRejectRegistration = async (requestId: string, comments?: string) => {
        try {
            await apiClient.put(`/supplier-registrations/${requestId}/reject`, { comments });
            showToast('Supplier registration rejected');
            await loadRegistrationRequests();
        } catch (error: any) {
            console.error('Error rejecting registration:', error);
            showAlert(error.response?.data?.error || 'Failed to reject registration request');
        }
    };

    // PO Form handlers
    const addItem = () => {
        setItems([...items, {
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            description: '',
            quantity: 1,
            unitPrice: 0,
            total: 0,
            categoryId: ''
        }]);
    };

    const removeItem = (itemId: string) => {
        setItems(items.filter(item => item.id !== itemId));
    };

    const updateItem = (itemId: string, field: keyof POItem, value: any) => {
        setItems(items.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, [field]: value };
                // Auto-calculate total if quantity or unitPrice changes
                if (field === 'quantity' || field === 'unitPrice') {
                    updated.total = updated.quantity * updated.unitPrice;
                }
                return updated;
            }
            return item;
        }));
    };

    const totalAmount = useMemo(() => {
        return items.reduce((sum, item) => sum + item.total, 0);
    }, [items]);

    const handleSubmitPO = async () => {
        // Validation
        if (!supplierTenantId) {
            showAlert('Please select a supplier');
            return;
        }

        if (!projectId) {
            showAlert('Please select a project');
            return;
        }

        if (items.length === 0) {
            showAlert('Please add at least one item');
            return;
        }

        // Validate items
        for (const item of items) {
            if (!item.description || !item.categoryId || item.quantity <= 0 || item.unitPrice <= 0) {
                showAlert('Please fill in all item fields (description, category, quantity, and price)');
                return;
            }
        }

        try {
            // Generate PO number
            const poNumber = `PO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

            const poData = {
                poNumber,
                supplierTenantId,
                items: items.map(item => ({
                    id: item.id,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total,
                    categoryId: item.categoryId
                })),
                description: poDescription,
                totalAmount
            };

            await apiClient.post('/purchase-orders', poData);
            showToast('Purchase Order created successfully');
            
            // Reset form
            setSupplierTenantId('');
            setProjectId('');
            setPoDescription('');
            setItems([]);
            setIsFormOpen(false);

            // Reload data
            await loadData();
        } catch (error: any) {
            console.error('Error creating purchase order:', error);
            showAlert(error.response?.data?.error || 'Failed to create purchase order');
        }
    };

    const handleCancelPO = () => {
        setSupplierTenantId('');
        setProjectId('');
        setPoDescription('');
        setItems([]);
        setIsFormOpen(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mb-2"></div>
                    <p className="text-sm text-slate-600">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4 sm:gap-6 overflow-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Buyer Dashboard</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Manage purchase orders and invoices</p>
                </div>
                <Button 
                    onClick={() => setIsFormOpen(!isFormOpen)} 
                    className="bg-slate-900 text-white hover:bg-slate-800"
                >
                    {isFormOpen ? 'Cancel' : '+ New Purchase Order'}
                </Button>
            </div>

            {/* Inline PO Creation Form */}
            {isFormOpen && (
                <Card className="p-6 border-2 border-blue-200 bg-blue-50/30">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Create New Purchase Order</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {/* Supplier Selection - Only registered suppliers */}
                        <ComboBox
                            label="Supplier *"
                            items={registeredSuppliers.map(s => ({ id: s.id, name: s.company_name || s.name }))}
                            selectedId={supplierTenantId}
                            onSelect={(selected) => setSupplierTenantId(selected?.id || '')}
                            placeholder={registeredSuppliers.length === 0 ? "No registered suppliers. Approve registration requests first." : "Select supplier organization"}
                            required
                            disabled={registeredSuppliers.length === 0}
                        />

                        {/* Project Selection */}
                        <ComboBox
                            label="Project *"
                            items={projects.map(p => ({ id: p.id, name: p.name }))}
                            selectedId={projectId}
                            onSelect={(selected) => setProjectId(selected?.id || '')}
                            placeholder="Select project"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div className="mb-6">
                        <Input
                            label="Description (Optional)"
                            value={poDescription}
                            onChange={(e) => setPoDescription(e.target.value)}
                            placeholder="Enter PO description"
                        />
                    </div>

                    {/* Line Items */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-md font-semibold text-slate-900">Items</h3>
                            <Button
                                variant="secondary"
                                onClick={addItem}
                                className="text-sm"
                            >
                                + Add Item
                            </Button>
                        </div>

                        {items.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                                <p>No items added yet. Click "Add Item" to start.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {items.map((item, index) => (
                                    <div key={item.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-sm font-semibold text-slate-700">Item {index + 1}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.id)}
                                                className="text-rose-500 hover:text-rose-700 text-sm font-medium"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                                            <div className="lg:col-span-2">
                                                <Input
                                                    label="Description *"
                                                    value={item.description}
                                                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                                                    placeholder="Item description"
                                                    required
                                                />
                                            </div>
                                            <ComboBox
                                                label="Category *"
                                                items={expenseCategories}
                                                selectedId={item.categoryId || ''}
                                                onSelect={(selected) => updateItem(item.id, 'categoryId', selected?.id || '')}
                                                placeholder="Select category"
                                                required
                                            />
                                            <Input
                                                label="Quantity *"
                                                type="number"
                                                value={item.quantity.toString()}
                                                onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                                required
                                                min="0"
                                                step="0.01"
                                            />
                                            <Input
                                                label="Unit Price *"
                                                type="number"
                                                value={item.unitPrice.toString()}
                                                onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                required
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                        <div className="mt-2 text-right">
                                            <span className="text-sm text-slate-600">
                                                Subtotal: <span className="font-semibold text-slate-900">
                                                    ${item.total.toFixed(2)}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {items.length > 0 && (
                            <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-semibold text-indigo-900">Total Amount:</span>
                                    <span className="text-2xl font-bold text-indigo-900">
                                        ${totalAmount.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Form Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                        <Button
                            variant="secondary"
                            onClick={handleCancelPO}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmitPO}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Create Purchase Order
                        </Button>
                    </div>
                </Card>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="text-sm text-slate-500 mb-1">Registration Requests</div>
                    <div className="text-2xl font-bold text-slate-900">{registrationRequests.length}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-500 mb-1">Outstanding POs</div>
                    <div className="text-2xl font-bold text-slate-900">{outstandingPOs.length}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-500 mb-1">Invoices Awaiting Approval</div>
                    <div className="text-2xl font-bold text-slate-900">{invoicesAwaitingApproval.length}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-500 mb-1">Registered Suppliers</div>
                    <div className="text-2xl font-bold text-slate-900">{registeredSuppliers.length}</div>
                </Card>
            </div>

            {/* Supplier Registration Requests */}
            {registrationRequests.length > 0 && (
                <Card className="flex-1 overflow-auto">
                    <div className="p-4 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Supplier Registration Requests</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Supplier</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Message</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Requested</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {registrationRequests.map(request => (
                                    <tr key={request.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm text-slate-900">
                                            {request.supplierCompanyName || request.supplierName || 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{request.buyerOrganizationEmail}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{request.supplierMessage || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {new Date(request.requestedAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="primary"
                                                    onClick={() => {
                                                        const comments = prompt('Add comments (optional):');
                                                        handleApproveRegistration(request.id, comments || undefined);
                                                    }}
                                                    className="text-xs bg-green-600 hover:bg-green-700 text-white"
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => {
                                                        const comments = prompt('Add rejection comments (optional):');
                                                        handleRejectRegistration(request.id, comments || undefined);
                                                    }}
                                                    className="text-xs"
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Outstanding POs Table */}
            <Card className="flex-1 overflow-auto">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Outstanding Purchase Orders</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO Number</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Supplier</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {outstandingPOs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                        No outstanding purchase orders
                                    </td>
                                </tr>
                            ) : (
                                outstandingPOs.map(po => (
                                    <tr key={po.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm text-slate-900">{po.poNumber}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{po.supplierTenantId}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                                            ${po.totalAmount.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(po.status)}`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Button
                                                variant="secondary"
                                                onClick={() => {}}
                                                className="text-xs"
                                            >
                                                View
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Invoices Awaiting Approval */}
            <Card className="flex-1 overflow-auto">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Invoices Awaiting Approval</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice Number</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO Number</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {invoicesAwaitingApproval.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                        No invoices awaiting approval
                                    </td>
                                </tr>
                            ) : (
                                invoicesAwaitingApproval.map(invoice => (
                                    <tr key={invoice.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm text-slate-900">{invoice.invoiceNumber}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{invoice.poId}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                                            ${invoice.amount.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="primary"
                                                    onClick={() => handleApproveInvoice(invoice.id)}
                                                    className="text-xs bg-green-600 hover:bg-green-700"
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => {}}
                                                    className="text-xs"
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default BuyerDashboard;
