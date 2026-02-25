
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { Project, Building, Property, Unit, ContactType, TransactionType } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';

interface AssetTypeOption {
    id: string;
    label: string;
    icon: React.ReactNode;
    color: string;
}

type AssetEntity = Project | Building | Property | Unit;
type AssetType = 'project' | 'building' | 'property' | 'unit';

const AssetsManagement: React.FC = () => {
    const { state: appState, dispatch: appDispatch } = useAppContext();
    const { isAuthenticated } = useAuth();
    const { showConfirm, showToast } = useNotification();
    
    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<AssetType>('project');
    const [selectedAssetTypeFilter, setSelectedAssetTypeFilter] = useState<AssetType | null>(null);
    const [editingEntity, setEditingEntity] = useState<AssetEntity | null>(null);
    
    // Common fields
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState('#10b981');
    
    // Project specific
    const [projectStatus, setProjectStatus] = useState<'Active' | 'Completed' | 'On Hold'>('Active');
    
    // Property specific
    const [ownerId, setOwnerId] = useState('');
    const [buildingId, setBuildingId] = useState('');
    const [monthlyServiceCharge, setMonthlyServiceCharge] = useState('');
    
    // Unit specific
    const [projectId, setProjectId] = useState('');
    const [unitContactId, setUnitContactId] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [unitType, setUnitType] = useState('');
    const [area, setArea] = useState('');
    const [floor, setFloor] = useState('');
    
    // Grid state
    const [gridSearchQuery, setGridSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const assetTypes: AssetTypeOption[] = [
        {
            id: 'project',
            label: 'Project',
            icon: ICONS.archive,
            color: 'indigo'
        },
        {
            id: 'building',
            label: 'Building',
            icon: ICONS.building,
            color: 'blue'
        },
        {
            id: 'property',
            label: 'Property',
            icon: ICONS.home,
            color: 'emerald'
        },
        {
            id: 'unit',
            label: 'Unit',
            icon: ICONS.layers,
            color: 'purple'
        }
    ];

    // Calculate balances for entities
    const balances = useMemo(() => {
        const balanceMap = new Map<string, number>();
        appState.transactions.forEach(t => {
            let amount = t.amount || 0;
            if (t.type === TransactionType.EXPENSE) amount = -amount;
            
            if (t.projectId) balanceMap.set(t.projectId, (balanceMap.get(t.projectId) || 0) + amount);
            if (t.buildingId) balanceMap.set(t.buildingId, (balanceMap.get(t.buildingId) || 0) + amount);
            if (t.propertyId) balanceMap.set(t.propertyId, (balanceMap.get(t.propertyId) || 0) + amount);
            if (t.unitId) balanceMap.set(t.unitId, (balanceMap.get(t.unitId) || 0) + amount);
        });
        return balanceMap;
    }, [appState.transactions]);

    // Get all entities for grid, filtered and sorted
    const gridEntities = useMemo(() => {
        let entities: any[] = [];
        
        // If no filter is selected, show all assets
        if (!selectedAssetTypeFilter) {
            // Combine all asset types
            const projects = appState.projects.map(p => ({ ...p, entityType: 'project' }));
            const buildings = appState.buildings.map(b => ({ ...b, entityType: 'building' }));
            const properties = appState.properties.map(p => ({
                ...p,
                entityType: 'property',
                ownerName: appState.contacts.find(c => c.id === p.ownerId)?.name || '-',
                buildingName: appState.buildings.find(b => b.id === p.buildingId)?.name || '-'
            }));
            const units = appState.units.map(u => ({
                ...u,
                entityType: 'unit',
                projectName: appState.projects.find(p => p.id === u.projectId)?.name || '-',
                ownerName: appState.contacts.find(c => c.id === u.contactId)?.name || '-'
            }));
            entities = [...projects, ...buildings, ...properties, ...units];
        } else {
            // Filter by selected type
            switch (selectedAssetTypeFilter) {
                case 'project':
                    entities = appState.projects.map(p => ({ ...p, entityType: 'project' }));
                    break;
                case 'building':
                    entities = appState.buildings.map(b => ({ ...b, entityType: 'building' }));
                    break;
                case 'property':
                    entities = appState.properties.map(p => ({
                        ...p,
                        entityType: 'property',
                        ownerName: appState.contacts.find(c => c.id === p.ownerId)?.name || '-',
                        buildingName: appState.buildings.find(b => b.id === p.buildingId)?.name || '-'
                    }));
                    break;
                case 'unit':
                    entities = appState.units.map(u => ({
                        ...u,
                        entityType: 'unit',
                        projectName: appState.projects.find(p => p.id === u.projectId)?.name || '-',
                        ownerName: appState.contacts.find(c => c.id === u.contactId)?.name || '-'
                    }));
                    break;
            }
        }

        // Apply search filter
        if (gridSearchQuery) {
            const query = gridSearchQuery.toLowerCase();
            entities = entities.filter(e => 
                Object.values(e).some(val => 
                    typeof val === 'string' && val.toLowerCase().includes(query)
                )
            );
        }

        // Apply sorting
        if (sortConfig) {
            entities.sort((a, b) => {
                let aVal: any = a[sortConfig.key];
                let bVal: any = b[sortConfig.key];
                
                if (aVal === undefined || aVal === null) aVal = '';
                if (bVal === undefined || bVal === null) bVal = '';
                
                aVal = String(aVal).toLowerCase();
                bVal = String(bVal).toLowerCase();
                
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            entities.sort((a, b) => a.name.localeCompare(b.name));
        }

        return entities;
    }, [appState.projects, appState.buildings, appState.properties, appState.units, appState.contacts, selectedAssetTypeFilter, gridSearchQuery, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const getTypeConfig = (type: AssetType) => {
        return assetTypes.find(t => t.id === type) || assetTypes[0];
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!name.trim()) {
            showToast('Name is required', 'error');
            return;
        }

        // Validation based on type
        if (selectedType === 'property') {
            if (!ownerId) {
                showToast('Owner is required', 'error');
                return;
            }
            if (!buildingId) {
                showToast('Building is required', 'error');
                return;
            }
        }
        
        if (selectedType === 'unit') {
            if (!projectId) {
                showToast('Project is required', 'error');
                return;
            }
        }

        // Check for duplicates
        let duplicate = false;
        switch (selectedType) {
            case 'project':
                duplicate = appState.projects.some(p => 
                    p.name.toLowerCase().trim() === name.toLowerCase().trim() && 
                    (!editingEntity || p.id !== editingEntity.id)
                );
                break;
            case 'building':
                duplicate = appState.buildings.some(b => 
                    b.name.toLowerCase().trim() === name.toLowerCase().trim() && 
                    (!editingEntity || b.id !== editingEntity.id)
                );
                break;
            case 'property':
                duplicate = appState.properties.some(p => 
                    p.name.toLowerCase().trim() === name.toLowerCase().trim() && 
                    (!editingEntity || p.id !== editingEntity.id)
                );
                break;
            case 'unit':
                duplicate = appState.units.some(u => 
                    u.name.toLowerCase().trim() === name.toLowerCase().trim() && 
                    (!editingEntity || u.id !== editingEntity.id)
                );
                break;
        }

        if (duplicate) {
            showToast(`A ${selectedType} with this name already exists.`, 'error');
            return;
        }

        // Create entity data based on type
        if (selectedType === 'project') {
            const projectData: Omit<Project, 'id'> = {
                name: name.trim(),
                description: description.trim() || undefined,
                color: color,
                status: projectStatus
            };
            
            if (editingEntity) {
                appDispatch({
                    type: 'UPDATE_PROJECT',
                    payload: { ...projectData, id: editingEntity.id }
                });
                showToast('Project updated successfully', 'success');
            } else {
                appDispatch({
                    type: 'ADD_PROJECT',
                    payload: { ...projectData, id: Date.now().toString() }
                });
                showToast('Project added successfully', 'success');
            }
        } else if (selectedType === 'building') {
            const buildingData: Omit<Building, 'id'> = {
                name: name.trim(),
                description: description.trim() || undefined,
                color: color
            };
            
            if (editingEntity) {
                appDispatch({
                    type: 'UPDATE_BUILDING',
                    payload: { ...buildingData, id: editingEntity.id }
                });
                showToast('Building updated successfully', 'success');
            } else {
                appDispatch({
                    type: 'ADD_BUILDING',
                    payload: { ...buildingData, id: Date.now().toString() }
                });
                showToast('Building added successfully', 'success');
            }
        } else if (selectedType === 'property') {
            const propertyData: Omit<Property, 'id'> = {
                name: name.trim(),
                ownerId: ownerId,
                buildingId: buildingId,
                description: description.trim() || undefined,
                monthlyServiceCharge: parseFloat(monthlyServiceCharge) || undefined
            };
            
            if (editingEntity) {
                appDispatch({
                    type: 'UPDATE_PROPERTY',
                    payload: { ...propertyData, id: editingEntity.id }
                });
                showToast('Property updated successfully', 'success');
            } else {
                appDispatch({
                    type: 'ADD_PROPERTY',
                    payload: { ...propertyData, id: Date.now().toString() }
                });
                showToast('Property added successfully', 'success');
            }
        } else if (selectedType === 'unit') {
            const unitData: Omit<Unit, 'id'> = {
                name: name.trim(),
                projectId: projectId,
                contactId: unitContactId || undefined,
                salePrice: salePrice ? parseFloat(salePrice) : undefined,
                type: unitType.trim() || undefined,
                area: area ? parseFloat(area) : undefined,
                floor: floor.trim() || undefined,
                description: description.trim() || undefined
            };
            
            if (editingEntity) {
                appDispatch({
                    type: 'UPDATE_UNIT',
                    payload: { ...unitData, id: editingEntity.id }
                });
                showToast('Unit updated successfully', 'success');
            } else {
                appDispatch({
                    type: 'ADD_UNIT',
                    payload: { ...unitData, id: Date.now().toString() }
                });
                showToast('Unit added successfully', 'success');
            }
        }

        handleResetForm(true);
    };

    const handleResetForm = (closeForm = false) => {
        setName('');
        setDescription('');
        setColor('#10b981');
        setProjectStatus('Active');
        setOwnerId('');
        setBuildingId('');
        setMonthlyServiceCharge('');
        setProjectId('');
        setUnitContactId('');
        setSalePrice('');
        setUnitType('');
        setArea('');
        setFloor('');
        setEditingEntity(null);
        if (closeForm) {
            setIsFormOpen(false);
        }
    };

    const handleOpenForm = () => {
        // Reset form fields
        setName('');
        setDescription('');
        setColor('#10b981');
        setProjectStatus('Active');
        setOwnerId('');
        setBuildingId('');
        setMonthlyServiceCharge('');
        setProjectId('');
        setUnitContactId('');
        setSalePrice('');
        setUnitType('');
        setArea('');
        setFloor('');
        setEditingEntity(null);
        // Set type based on filter or default to project
        if (selectedAssetTypeFilter) {
            setSelectedType(selectedAssetTypeFilter);
        } else {
            setSelectedType('project');
        }
        setIsFormOpen(true);
    };

    const handleEdit = (entity: any) => {
        setEditingEntity(entity);
        setName(entity.name);
        setDescription(entity.description || '');
        setColor(entity.color || '#10b981');
        
        // Determine entity type from entity data
        const entityType = entity.entityType || selectedType;
        setSelectedType(entityType as AssetType);
        
        if (entityType === 'project') {
            setProjectStatus(entity.status || 'Active');
        } else if (entityType === 'property') {
            setOwnerId(entity.ownerId || '');
            setBuildingId(entity.buildingId || '');
            setMonthlyServiceCharge(entity.monthlyServiceCharge?.toString() || '');
        } else if (entityType === 'unit') {
            setProjectId(entity.projectId || '');
            setUnitContactId(entity.contactId || '');
            setSalePrice(entity.salePrice?.toString() || '');
            setUnitType(entity.type || '');
            setArea(entity.area?.toString() || '');
            setFloor(entity.floor || '');
        }
        
        if (!isFormOpen) {
            setIsFormOpen(true);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (entity: any) => {
        const confirmed = await showConfirm(
            `Are you sure you want to delete "${entity.name}"? This action cannot be undone.`
        );
        if (!confirmed) return;

        const entityType = (entity.entityType || selectedType) as AssetType;
        const typeLabel = getTypeConfig(entityType).label;

        // Delete from cloud when we have a token (so it's removed on re-login). Use token so we don't skip due to isAuthenticated timing.
        const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('auth_token');
        if (isAuthenticated || hasToken) {
            try {
                const api = getAppStateApiService();
                switch (entityType) {
                    case 'project':
                        await api.deleteProject(entity.id);
                        break;
                    case 'building':
                        await api.deleteBuilding(entity.id);
                        break;
                    case 'property':
                        await api.deleteProperty(entity.id);
                        break;
                    case 'unit':
                        await api.deleteUnit(entity.id);
                        break;
                }
            } catch (err: any) {
                // 404 = already deleted on server, treat as success
                if (err?.status === 404) {
                    // Fall through to dispatch local delete
                } else {
                    const msg = err?.message || err?.error || 'Could not delete from cloud.';
                    showToast(`${typeLabel} could not be removed from cloud: ${msg}`, 'error');
                    return;
                }
            }
        }

        switch (entityType) {
            case 'project':
                appDispatch({ type: 'DELETE_PROJECT', payload: entity.id });
                break;
            case 'building':
                appDispatch({ type: 'DELETE_BUILDING', payload: entity.id });
                break;
            case 'property':
                appDispatch({ type: 'DELETE_PROPERTY', payload: entity.id });
                break;
            case 'unit':
                appDispatch({ type: 'DELETE_UNIT', payload: entity.id });
                break;
        }
        showToast(`${typeLabel} deleted successfully`, 'success');
        if (editingEntity?.id === entity.id) {
            handleResetForm();
        }
    };

    const filterType = selectedAssetTypeFilter || selectedType;
    const activeTypeConfig = getTypeConfig(filterType as AssetType);
    const owners = appState.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);

    // Get column configuration based on selected type
    const getColumns = () => {
        // When showing all assets, use a default column set (or show entity type column)
        if (!selectedAssetTypeFilter) {
            return [
                { key: 'entityType', label: 'Type' },
                { key: 'name', label: 'Name' },
                { key: 'description', label: 'Description' },
                { key: 'balance', label: 'Balance' },
                { key: 'actions', label: 'Actions' }
            ];
        }
        const filterType = selectedAssetTypeFilter;
        switch (filterType) {
            case 'project':
                return [
                    { key: 'name', label: 'Name' },
                    { key: 'status', label: 'Status' },
                    { key: 'description', label: 'Description' },
                    { key: 'balance', label: 'Balance' },
                    { key: 'actions', label: 'Actions' }
                ];
            case 'building':
                return [
                    { key: 'name', label: 'Name' },
                    { key: 'description', label: 'Description' },
                    { key: 'balance', label: 'Balance' },
                    { key: 'actions', label: 'Actions' }
                ];
            case 'property':
                return [
                    { key: 'name', label: 'Name' },
                    { key: 'ownerName', label: 'Owner' },
                    { key: 'buildingName', label: 'Building' },
                    { key: 'monthlyServiceCharge', label: 'Service Charge' },
                    { key: 'description', label: 'Description' },
                    { key: 'balance', label: 'Balance' },
                    { key: 'actions', label: 'Actions' }
                ];
            case 'unit':
                return [
                    { key: 'name', label: 'Name' },
                    { key: 'projectName', label: 'Project' },
                    { key: 'ownerName', label: 'Owner' },
                    { key: 'type', label: 'Type' },
                    { key: 'area', label: 'Area' },
                    { key: 'floor', label: 'Floor' },
                    { key: 'salePrice', label: 'Sale Price' },
                    { key: 'description', label: 'Description' },
                    { key: 'balance', label: 'Balance' },
                    { key: 'actions', label: 'Actions' }
                ];
            default:
                return [];
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4 overflow-hidden px-0 pt-2 pb-2">
            {/* Asset Type Filter Tabs - Top Level */}
            <div className="flex-shrink-0">
                <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
                    <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => setSelectedAssetTypeFilter(null)}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                                ${!selectedAssetTypeFilter
                                    ? 'bg-slate-100 text-slate-900 border-2 border-slate-300'
                                    : 'border-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }
                            `}
                        >
                            <span>All Assets</span>
                        </button>
                        {assetTypes.map((type) => {
                            const isSelected = selectedAssetTypeFilter === type.id;
                            return (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedAssetTypeFilter(type.id as AssetType);
                                        setSelectedType(type.id as AssetType);
                                    }}
                                    className={`
                                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ml-2
                                        ${isSelected
                                            ? (type.color === 'indigo' ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-500' :
                                               type.color === 'blue' ? 'bg-blue-50 text-blue-700 border-2 border-blue-500' :
                                               type.color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-500' :
                                               'bg-purple-50 text-purple-700 border-2 border-purple-500')
                                            : 'border-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }
                                    `}
                                >
                                    <div className={`w-4 h-4 ${isSelected ? (
                                        type.color === 'indigo' ? 'text-indigo-600' :
                                        type.color === 'blue' ? 'text-blue-600' :
                                        type.color === 'emerald' ? 'text-emerald-600' :
                                        'text-purple-600'
                                    ) : 'text-slate-400'}`}>
                                        {type.icon}
                                    </div>
                                    <span>{type.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isFormOpen) {
                                setIsFormOpen(false);
                            } else {
                                handleOpenForm();
                            }
                        }}
                        className={`
                            flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg transition-all
                            ${isFormOpen
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                            }
                        `}
                        title={isFormOpen ? 'Close Form' : 'Add New Asset'}
                    >
                        <div className={`w-5 h-5 transition-transform ${isFormOpen ? 'rotate-45' : ''}`}>
                            {ICONS.plus}
                        </div>
                    </button>
                </div>
            </div>

            {/* Add New Asset Form - Collapsible */}
            {isFormOpen && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <div className="w-5 h-5 text-indigo-600">{ICONS.plus}</div>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Add New Asset</h2>
                            <p className="text-xs text-slate-500">
                                {selectedAssetTypeFilter
                                    ? `Fill in the details for the new ${getTypeConfig(selectedType).label}.`
                                    : 'Select an asset type below, then fill in the details.'}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Asset Type Selection - only when no type selected from top tabs */}
                        {!selectedAssetTypeFilter && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-2">
                                    Asset Type <span className="text-red-500">*</span>
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {assetTypes.map((type) => {
                                        const isSelected = selectedType === type.id;
                                        return (
                                            <button
                                                key={type.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedType(type.id as AssetType);
                                                    handleResetForm();
                                                }}
                                                className={`
                                                    p-2 rounded-lg border-2 transition-all text-left
                                                    ${isSelected
                                                        ? (type.color === 'indigo' ? 'border-indigo-500 bg-indigo-50' :
                                                           type.color === 'blue' ? 'border-blue-500 bg-blue-50' :
                                                           type.color === 'emerald' ? 'border-emerald-500 bg-emerald-50' :
                                                           'border-purple-500 bg-purple-50')
                                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                    }
                                                `}
                                            >
                                                <div className={`w-5 h-5 mb-1 ${
                                                    isSelected
                                                        ? (type.color === 'indigo' ? 'text-indigo-600' :
                                                           type.color === 'blue' ? 'text-blue-600' :
                                                           type.color === 'emerald' ? 'text-emerald-600' :
                                                           'text-purple-600')
                                                        : 'text-slate-400'
                                                }`}>
                                                    {type.icon}
                                                </div>
                                                <div className={`font-semibold text-xs ${
                                                    isSelected
                                                        ? (type.color === 'indigo' ? 'text-indigo-700' :
                                                           type.color === 'blue' ? 'text-blue-700' :
                                                           type.color === 'emerald' ? 'text-emerald-700' :
                                                           'text-purple-700')
                                                        : 'text-slate-700'
                                                }`}>
                                                    {type.label}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                    {/* Form Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="sm:col-span-2 lg:col-span-1">
                            <Input
                                label="Name *"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={selectedType === 'project' ? 'Project Name' : selectedType === 'building' ? 'Building Name' : selectedType === 'property' ? 'Property Name' : 'Unit Name'}
                                required
                                autoFocus
                                className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                            />
                        </div>
                        
                        {selectedType === 'project' && (
                            <div className="sm:col-span-2 lg:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                                <select
                                    value={projectStatus}
                                    onChange={(e) => setProjectStatus(e.target.value as any)}
                                    className="block w-full px-3 py-2 border-2 border-slate-300 rounded-lg shadow-sm text-sm focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="Active">Active</option>
                                    <option value="Completed">Completed</option>
                                    <option value="On Hold">On Hold</option>
                                </select>
                            </div>
                        )}
                        
                        {selectedType === 'property' && (
                            <>
                                <div className="sm:col-span-2 lg:col-span-1">
                                    <ComboBox
                                        label="Owner *"
                                        items={owners}
                                        selectedId={ownerId}
                                        onSelect={(item) => setOwnerId(item?.id || '')}
                                        placeholder="Select owner"
                                        allowAddNew={false}
                                    />
                                </div>
                                <div className="sm:col-span-2 lg:col-span-1">
                                    <ComboBox
                                        label="Building *"
                                        items={appState.buildings}
                                        selectedId={buildingId}
                                        onSelect={(item) => setBuildingId(item?.id || '')}
                                        placeholder="Select building"
                                        allowAddNew={false}
                                    />
                                </div>
                            </>
                        )}
                        
                        {selectedType === 'unit' && (
                            <>
                                <div className="sm:col-span-2 lg:col-span-1">
                                    <ComboBox
                                        label="Project *"
                                        items={appState.projects}
                                        selectedId={projectId}
                                        onSelect={(item) => setProjectId(item?.id || '')}
                                        placeholder="Select project"
                                        allowAddNew={false}
                                    />
                                </div>
                                <div className="sm:col-span-2 lg:col-span-1">
                                    <ComboBox
                                        label="Owner (Optional)"
                                        items={owners}
                                        selectedId={unitContactId}
                                        onSelect={(item) => setUnitContactId(item?.id || '')}
                                        placeholder="Select owner"
                                        allowAddNew={false}
                                    />
                                </div>
                            </>
                        )}
                        
                        {(selectedType === 'project' || selectedType === 'building') && (
                            <div className="sm:col-span-2 lg:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        className="h-10 w-20 rounded-md cursor-pointer border-2 border-slate-300"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Additional fields row */}
                    {(selectedType === 'property' || selectedType === 'unit') && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {selectedType === 'property' && (
                                <Input
                                    label="Monthly Service Charge"
                                    type="number"
                                    value={monthlyServiceCharge}
                                    onChange={(e) => setMonthlyServiceCharge(e.target.value)}
                                    placeholder="0.00"
                                    className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                                />
                            )}
                            
                            {selectedType === 'unit' && (
                                <>
                                    <Input
                                        label="Type (e.g., 2BHK, Shop)"
                                        value={unitType}
                                        onChange={(e) => setUnitType(e.target.value)}
                                        placeholder="Unit type"
                                        className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                                    />
                                    <Input
                                        label="Area (sq ft)"
                                        type="number"
                                        value={area}
                                        onChange={(e) => setArea(e.target.value)}
                                        placeholder="Area"
                                        className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                                    />
                                    <Input
                                        label="Floor"
                                        value={floor}
                                        onChange={(e) => setFloor(e.target.value)}
                                        placeholder="Floor number"
                                        className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                                    />
                                    <Input
                                        label="Sale Price"
                                        type="number"
                                        value={salePrice}
                                        onChange={(e) => setSalePrice(e.target.value)}
                                        placeholder="0.00"
                                        className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                                    />
                                </>
                            )}
                        </div>
                    )}
                    
                    {/* Description and Submit */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="max-w-md">
                            <Textarea
                                label="Description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Additional details..."
                                rows={1}
                                className="text-sm !border-slate-300 !border-2 focus:!border-indigo-500"
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            {editingEntity && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleResetForm}
                                    className="flex-1 text-sm py-2"
                                >
                                    Cancel
                                </Button>
                            )}
                            <Button
                                type="submit"
                                className={`flex-1 text-sm py-2 ${
                                    activeTypeConfig.color === 'indigo' ? 'bg-indigo-600 hover:bg-indigo-700' :
                                    activeTypeConfig.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
                                    activeTypeConfig.color === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                    'bg-purple-600 hover:bg-purple-700'
                                } text-white`}
                            >
                                {editingEntity ? 'Update' : `Add ${activeTypeConfig.label}`}
                            </Button>
                        </div>
                    </div>
                </form>
                </div>
            )}

            {/* Data Grid - Full Width */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
                {/* Search Bar */}
                <div className="p-4 border-b border-slate-200 flex-shrink-0">
                    <div className="relative">
                        <Input
                            value={gridSearchQuery}
                            onChange={(e) => setGridSearchQuery(e.target.value)}
                            placeholder={selectedAssetTypeFilter ? `Search ${activeTypeConfig.label.toLowerCase()}s...` : "Search all assets..."}
                            className="w-full bg-white border-slate-200 shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all rounded-lg pl-10"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        {gridSearchQuery && (
                            <button
                                onClick={() => setGridSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                    <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                {getColumns().map((col) => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${
                                            col.key === 'actions' || col.key === 'balance' ? 'text-right' : ''
                                        } ${
                                            col.key !== 'actions' ? 'cursor-pointer hover:bg-slate-100' : ''
                                        }`}
                                        onClick={() => col.key !== 'actions' && handleSort(col.key)}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {sortConfig?.key === col.key && (
                                                <div className="w-3 h-3 text-indigo-600">
                                                    {sortConfig.direction === 'asc' ? ICONS.arrowUp : ICONS.arrowDown}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-50">
                            {gridEntities.length === 0 ? (
                                <tr>
                                    <td colSpan={getColumns().length} className="px-4 py-8 text-center text-slate-400">
                                        {gridSearchQuery 
                                            ? `No assets found matching your search.` 
                                            : `No assets found. Add your first asset above!`
                                        }
                                    </td>
                                </tr>
                            ) : (
                                gridEntities.map((entity) => (
                                    <tr
                                        key={entity.id}
                                        className="hover:bg-indigo-50/30 transition-colors group"
                                    >
                                        {getColumns().map((col) => {
                                            if (col.key === 'actions') {
                                                return (
                                                    <td key={col.key} className="px-4 py-2 whitespace-nowrap text-right">
                                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleEdit(entity)}
                                                                className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1 rounded transition-colors"
                                                                title="Edit"
                                                            >
                                                                <div className="w-3.5 h-3.5">{ICONS.edit}</div>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(entity)}
                                                                className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 p-1 rounded transition-colors"
                                                                title="Delete"
                                                            >
                                                                <div className="w-3.5 h-3.5">{ICONS.trash}</div>
                                                            </button>
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            
                                            if (col.key === 'balance') {
                                                const balance = balances.get(entity.id) || 0;
                                                return (
                                                    <td key={col.key} className="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold">
                                                        <span className={balance >= 0 ? 'text-slate-700' : 'text-rose-600'}>
                                                            {CURRENCY} {balance.toLocaleString()}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            
                                            if (col.key === 'entityType') {
                                                const typeConfig = getTypeConfig(entity.entityType as AssetType);
                                                return (
                                                    <td key={col.key} className="px-4 py-2 whitespace-nowrap text-xs">
                                                        <span className={`
                                                            px-2 py-1 rounded-full text-xs font-medium
                                                            ${entity.entityType === 'project' ? 'bg-indigo-100 text-indigo-700' :
                                                             entity.entityType === 'building' ? 'bg-blue-100 text-blue-700' :
                                                             entity.entityType === 'property' ? 'bg-emerald-100 text-emerald-700' :
                                                             'bg-purple-100 text-purple-700'}
                                                        `}>
                                                            {typeConfig.label}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            
                                            const value = entity[col.key];
                                            return (
                                                <td key={col.key} className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                                                    {col.key === 'name' ? (
                                                        <div className="font-semibold text-slate-900">{value}</div>
                                                    ) : value || '-'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AssetsManagement;
