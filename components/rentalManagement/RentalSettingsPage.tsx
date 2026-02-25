
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS } from '../../constants';
import Card from '../ui/Card';
import { useNotification } from '../../context/NotificationContext';
import BuildingForm from '../settings/BuildingForm';
import PropertyForm from '../settings/PropertyForm';
import ContactForm from '../settings/ContactForm';
import Modal from '../ui/Modal';
import { ContactType } from '../../types';

const RentalSettingsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { isAuthenticated } = useAuth();
    const { showConfirm, showToast } = useNotification();
    const [activeCategory, setActiveCategory] = useState('buildings');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal States
    const [editingItem, setEditingItem] = useState<{ type: string, item?: any } | null>(null);

    const settingCategories = [
        { id: 'buildings', label: 'Buildings', icon: ICONS.building },
        { id: 'properties', label: 'Properties (Units)', icon: ICONS.home },
        { id: 'tenants', label: 'Tenants', icon: ICONS.users },
        { id: 'owners', label: 'Owners', icon: ICONS.briefcase },
    ];

    const filteredItems = useMemo(() => {
        const query = searchQuery.toLowerCase();
        switch (activeCategory) {
            case 'buildings': return state.buildings.filter(i => i.name.toLowerCase().includes(query));
            case 'properties': return state.properties.filter(i => i.name.toLowerCase().includes(query));
            case 'tenants': return state.contacts.filter(i => i.type === ContactType.TENANT && i.name.toLowerCase().includes(query));
            case 'owners': return state.contacts.filter(i => i.type === ContactType.OWNER && i.name.toLowerCase().includes(query));
            default: return [];
        }
    }, [activeCategory, searchQuery, state]);

    const handleAddNew = () => {
        setEditingItem({ type: activeCategory });
    };

    const handleEdit = (item: any) => {
        setEditingItem({ type: activeCategory, item });
    };

    const handleSubmit = (data: any) => {
        if (!editingItem) return;
        const isEdit = !!editingItem.item;
        const id = isEdit ? editingItem.item.id : Date.now().toString();
        const payload = { ...data, id };

        switch (editingItem.type) {
            case 'buildings':
                dispatch({ type: isEdit ? 'UPDATE_BUILDING' : 'ADD_BUILDING', payload });
                break;
            case 'properties':
                dispatch({ type: isEdit ? 'UPDATE_PROPERTY' : 'ADD_PROPERTY', payload });
                break;
            case 'tenants':
            case 'owners':
                dispatch({ type: isEdit ? 'UPDATE_CONTACT' : 'ADD_CONTACT', payload: { ...payload, type: editingItem.type === 'tenants' ? ContactType.TENANT : ContactType.OWNER } });
                break;
        }
        setEditingItem(null);
    };

    const handleDelete = async () => {
        if (!editingItem?.item) return;
        const confirmed = await showConfirm('Are you sure you want to delete this item?');
        if (!confirmed) return;

        const itemId = editingItem.item.id;
        if (isAuthenticated && (editingItem.type === 'buildings' || editingItem.type === 'properties')) {
            try {
                const api = getAppStateApiService();
                if (editingItem.type === 'buildings') await api.deleteBuilding(itemId);
                else if (editingItem.type === 'properties') await api.deleteProperty(itemId);
            } catch (err: any) {
                if (err?.status !== 404) {
                    showToast(err?.message || err?.error || 'Could not delete from cloud.', 'error');
                    return;
                }
            }
        }
        if (isAuthenticated && (editingItem.type === 'tenants' || editingItem.type === 'owners')) {
            try {
                await getAppStateApiService().deleteContact(itemId);
            } catch (err: any) {
                if (err?.status !== 404) {
                    showToast(err?.message || err?.error || 'Could not delete from cloud.', 'error');
                    return;
                }
            }
        }

        switch (editingItem.type) {
            case 'buildings': dispatch({ type: 'DELETE_BUILDING', payload: itemId }); break;
            case 'properties': dispatch({ type: 'DELETE_PROPERTY', payload: itemId }); break;
            case 'tenants':
            case 'owners': dispatch({ type: 'DELETE_CONTACT', payload: itemId }); break;
        }
        setEditingItem(null);
    };

    const addLabel = `Add ${settingCategories.find(c => c.id === activeCategory)?.label.slice(0, -1)}`;

    return (
        <div className="flex flex-col md:flex-row h-full gap-6">
            {/* Sidebar */}
            <Card className="md:w-64 flex-shrink-0 p-2">
                <div className="space-y-1">
                    {settingCategories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => { setActiveCategory(cat.id); setSearchQuery(''); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                activeCategory === cat.id ? 'bg-indigo-50 text-accent' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <div className="w-5 h-5 opacity-70">{cat.icon}</div>
                            {cat.label}
                        </button>
                    ))}
                </div>
            </Card>

            {/* Content */}
            <div className="flex-grow flex flex-col h-full">
                <div className="mb-4 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-slate-800">{settingCategories.find(c => c.id === activeCategory)?.label}</h2>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Input 
                                placeholder="Search..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="pr-8"
                            />
                             {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </button>
                            )}
                        </div>
                        <Button onClick={handleAddNew}>
                            <div className="w-4 h-4 sm:mr-2">{ICONS.plus}</div> <span className="hidden sm:inline">{addLabel}</span>
                        </Button>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden flex-grow overflow-y-auto">
                    <div className="divide-y divide-slate-100">
                        {filteredItems.map((item: any) => (
                            <div 
                                key={item.id} 
                                onClick={() => handleEdit(item)}
                                className="p-4 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors"
                            >
                                <span className="font-medium text-slate-700">{item.name}</span>
                                <div className="text-slate-400">{ICONS.edit}</div>
                            </div>
                        ))}
                        {filteredItems.length === 0 && <div className="p-8 text-center text-slate-500">No items found.</div>}
                    </div>
                </div>
            </div>

            <Modal isOpen={!!editingItem} onClose={() => setEditingItem(null)} title={`${editingItem?.item ? 'Edit' : 'Add'} ${activeCategory.slice(0, -1)}`}>
                {editingItem?.type === 'buildings' && (
                    <BuildingForm 
                        onSubmit={handleSubmit} 
                        onCancel={() => setEditingItem(null)} 
                        onDelete={handleDelete}
                        buildingToEdit={editingItem.item} 
                    />
                )}
                {editingItem?.type === 'properties' && (
                    <PropertyForm 
                        onSubmit={handleSubmit} 
                        onCancel={() => setEditingItem(null)} 
                        onDelete={handleDelete}
                        propertyToEdit={editingItem.item}
                        contacts={state.contacts}
                        buildings={state.buildings}
                        properties={state.properties}
                    />
                )}
                {(editingItem?.type === 'tenants' || editingItem?.type === 'owners') && (
                    <ContactForm 
                        onSubmit={handleSubmit} 
                        onCancel={() => setEditingItem(null)} 
                        onDelete={handleDelete}
                        contactToEdit={editingItem.item}
                        existingContacts={state.contacts}
                        fixedTypeForNew={editingItem.type === 'tenants' ? ContactType.TENANT : ContactType.OWNER}
                    />
                )}
            </Modal>
        </div>
    );
};

export default RentalSettingsPage;
