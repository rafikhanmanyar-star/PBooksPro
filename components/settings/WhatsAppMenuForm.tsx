import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api/client';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';
import Input from '../ui/Input';

// --- Types ---

interface SubMenuItem {
  id: string;
  number: string;
  label: string;
  type: 'reply' | 'back';
  replyText: string | null;
}

interface SubMenu {
  message: string;
  items: SubMenuItem[];
}

interface MenuItem {
  id: string;
  number: string;
  label: string;
  type: 'reply' | 'submenu';
  replyText: string | null;
  subMenu: SubMenu | null;
}

interface WhatsAppMenuConfig {
  enabled: boolean;
  welcomeMessage: string;
  menuItems: MenuItem[];
  invalidOptionMessage: string;
  sessionTimeoutMinutes: number;
}

const DEFAULT_CONFIG: WhatsAppMenuConfig = {
  enabled: false,
  welcomeMessage: 'Welcome! Please select an option:',
  menuItems: [],
  invalidOptionMessage: 'Invalid option. Please reply with a valid number from the menu.',
  sessionTimeoutMinutes: 30,
};

const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// --- Component ---

const WhatsAppMenuForm: React.FC = () => {
  const { showToast, showAlert } = useNotification();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<WhatsAppMenuConfig>(DEFAULT_CONFIG);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<{ key: string; value: WhatsAppMenuConfig }>('/app-settings/whatsapp_auto_menu');
      if (response?.value) {
        setConfig(response.value);
      }
    } catch (error: any) {
      // 404 means no config yet -- that's fine, use defaults
      if (error?.status !== 404 && error?.message !== 'Setting not found') {
        console.error('Error loading WhatsApp menu config:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiClient.post('/app-settings', {
        key: 'whatsapp_auto_menu',
        value: config,
      });
      showToast('WhatsApp menu configuration saved successfully!', 'success');
    } catch (error: any) {
      console.error('Error saving WhatsApp menu config:', error);
      await showAlert(error.message || 'Failed to save WhatsApp menu configuration');
    } finally {
      setSaving(false);
    }
  };

  // --- Menu Item Helpers ---

  const addMenuItem = () => {
    const nextNumber = String(config.menuItems.length + 1);
    setConfig(prev => ({
      ...prev,
      menuItems: [
        ...prev.menuItems,
        {
          id: generateId(),
          number: nextNumber,
          label: '',
          type: 'reply',
          replyText: '',
          subMenu: null,
        },
      ],
    }));
  };

  const removeMenuItem = (id: string) => {
    setConfig(prev => ({
      ...prev,
      menuItems: prev.menuItems.filter(item => item.id !== id),
    }));
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateMenuItem = (id: string, updates: Partial<MenuItem>) => {
    setConfig(prev => ({
      ...prev,
      menuItems: prev.menuItems.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        // When switching type to submenu, initialize subMenu if null
        if (updates.type === 'submenu' && !updated.subMenu) {
          updated.subMenu = {
            message: `${updated.label || 'Sub-menu'} options:`,
            items: [
              { id: generateId(), number: '0', label: 'Back to Main Menu', type: 'back', replyText: null },
            ],
          };
          updated.replyText = null;
          // Auto-expand to show the submenu
          setExpandedItems(prev => new Set(prev).add(id));
        }
        if (updates.type === 'reply') {
          updated.subMenu = null;
          updated.replyText = updated.replyText || '';
        }
        return updated;
      }),
    }));
  };

  // --- Sub-Menu Item Helpers ---

  const addSubMenuItem = (parentId: string) => {
    setConfig(prev => ({
      ...prev,
      menuItems: prev.menuItems.map(item => {
        if (item.id !== parentId || !item.subMenu) return item;
        // Find next number (excluding the "back" item which is typically 0)
        const existingNumbers = item.subMenu.items
          .filter(si => si.type !== 'back')
          .map(si => parseInt(si.number, 10))
          .filter(n => !isNaN(n));
        const nextNumber = String(existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1);
        return {
          ...item,
          subMenu: {
            ...item.subMenu,
            items: [
              // Insert before the back item
              ...item.subMenu.items.filter(si => si.type !== 'back'),
              { id: generateId(), number: nextNumber, label: '', type: 'reply' as const, replyText: '' },
              ...item.subMenu.items.filter(si => si.type === 'back'),
            ],
          },
        };
      }),
    }));
  };

  const removeSubMenuItem = (parentId: string, subItemId: string) => {
    setConfig(prev => ({
      ...prev,
      menuItems: prev.menuItems.map(item => {
        if (item.id !== parentId || !item.subMenu) return item;
        return {
          ...item,
          subMenu: {
            ...item.subMenu,
            items: item.subMenu.items.filter(si => si.id !== subItemId),
          },
        };
      }),
    }));
  };

  const updateSubMenuItem = (parentId: string, subItemId: string, updates: Partial<SubMenuItem>) => {
    setConfig(prev => ({
      ...prev,
      menuItems: prev.menuItems.map(item => {
        if (item.id !== parentId || !item.subMenu) return item;
        return {
          ...item,
          subMenu: {
            ...item.subMenu,
            items: item.subMenu.items.map(si =>
              si.id === subItemId ? { ...si, ...updates } : si
            ),
          },
        };
      }),
    }));
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Preview ---

  const formatMenuPreview = (): string => {
    if (config.menuItems.length === 0) return '(No menu items configured)';
    let text = config.welcomeMessage + '\n\n';
    for (const item of config.menuItems) {
      text += `${item.number}. ${item.label}\n`;
    }
    return text;
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-slate-500">Loading menu configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div>
          <h3 className="font-semibold text-slate-800">Auto-Reply Menu</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Automatically send a menu when a client messages you on WhatsApp.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
            config.enabled ? 'bg-green-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Welcome Message */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Welcome Message</label>
        <textarea
          value={config.welcomeMessage}
          onChange={e => setConfig(prev => ({ ...prev, welcomeMessage: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-sm transition-colors"
          placeholder="Welcome! Please select an option:"
        />
        <p className="mt-1 text-xs text-slate-500">This message is sent before the numbered menu options.</p>
      </div>

      {/* Menu Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-slate-700">Menu Items</label>
          <button
            type="button"
            onClick={addMenuItem}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>

        {config.menuItems.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
            <p className="text-sm text-slate-400">No menu items yet. Click "Add Item" to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {config.menuItems.map((item, index) => (
              <div key={item.id} className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Item Header */}
                <div className="flex items-start gap-3 p-3 bg-white">
                  {/* Number */}
                  <div className="flex-shrink-0 pt-1">
                    <input
                      type="text"
                      value={item.number}
                      onChange={e => updateMenuItem(item.id, { number: e.target.value })}
                      className="w-10 text-center px-1 py-1 border border-gray-300 rounded text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                      title="Menu number"
                    />
                  </div>

                  <div className="flex-1 space-y-2">
                    {/* Label */}
                    <Input
                      value={item.label}
                      onChange={e => updateMenuItem(item.id, { label: e.target.value })}
                      placeholder="Menu item label (e.g., Our Services)"
                      compact
                    />

                    {/* Type Selector */}
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`type-${item.id}`}
                          checked={item.type === 'reply'}
                          onChange={() => updateMenuItem(item.id, { type: 'reply' })}
                          className="text-green-600 focus:ring-green-500"
                        />
                        <span className="text-slate-600">Direct Reply</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`type-${item.id}`}
                          checked={item.type === 'submenu'}
                          onChange={() => updateMenuItem(item.id, { type: 'submenu' })}
                          className="text-green-600 focus:ring-green-500"
                        />
                        <span className="text-slate-600">Sub-Menu</span>
                      </label>
                    </div>

                    {/* Reply Text (if type=reply) */}
                    {item.type === 'reply' && (
                      <textarea
                        value={item.replyText || ''}
                        onChange={e => updateMenuItem(item.id, { replyText: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-xs transition-colors"
                        placeholder="Reply text sent when client selects this option..."
                      />
                    )}

                    {/* Sub-Menu Toggle (if type=submenu) */}
                    {item.type === 'submenu' && item.subMenu && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${expandedItems.has(item.id) ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {expandedItems.has(item.id) ? 'Hide' : 'Show'} Sub-Menu ({item.subMenu.items.length} items)
                      </button>
                    )}
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => removeMenuItem(item.id)}
                    className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors"
                    title="Remove item"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Expanded Sub-Menu Section */}
                {item.type === 'submenu' && item.subMenu && expandedItems.has(item.id) && (
                  <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-3">
                    {/* Sub-Menu Message */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Sub-Menu Message</label>
                      <input
                        type="text"
                        value={item.subMenu.message}
                        onChange={e =>
                          updateMenuItem(item.id, {
                            subMenu: { ...item.subMenu!, message: e.target.value },
                          })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                        placeholder="Sub-menu header message"
                      />
                    </div>

                    {/* Sub-Menu Items */}
                    <div className="space-y-2">
                      {item.subMenu.items.map(subItem => (
                        <div key={subItem.id} className="flex items-start gap-2 p-2 bg-white rounded border border-slate-200">
                          {/* Number */}
                          <input
                            type="text"
                            value={subItem.number}
                            onChange={e => updateSubMenuItem(item.id, subItem.id, { number: e.target.value })}
                            className="w-8 text-center px-1 py-1 border border-gray-300 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                            title="Sub-menu number"
                          />

                          <div className="flex-1 space-y-1.5">
                            <input
                              type="text"
                              value={subItem.label}
                              onChange={e => updateSubMenuItem(item.id, subItem.id, { label: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                              placeholder={subItem.type === 'back' ? 'Back to Main Menu' : 'Sub-item label'}
                            />

                            {subItem.type === 'back' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Goes back to main menu
                              </span>
                            ) : (
                              <textarea
                                value={subItem.replyText || ''}
                                onChange={e => updateSubMenuItem(item.id, subItem.id, { replyText: e.target.value })}
                                rows={2}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                                placeholder="Reply text for this sub-option..."
                              />
                            )}
                          </div>

                          {/* Remove sub-item (don't allow removing the back item if it's the only back) */}
                          <button
                            type="button"
                            onClick={() => removeSubMenuItem(item.id, subItem.id)}
                            className="flex-shrink-0 p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Remove sub-item"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add Sub-Item Button */}
                    <button
                      type="button"
                      onClick={() => addSubMenuItem(item.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Sub-Item
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invalid Option Message */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Invalid Option Message</label>
        <textarea
          value={config.invalidOptionMessage}
          onChange={e => setConfig(prev => ({ ...prev, invalidOptionMessage: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-sm transition-colors"
          placeholder="Sorry, that option is not valid. Please reply with a number from the menu."
        />
        <p className="mt-1 text-xs text-slate-500">Sent when a client replies with a number that doesn't match any option.</p>
      </div>

      {/* Session Timeout */}
      <div>
        <Input
          label="Session Timeout (minutes)"
          type="number"
          value={String(config.sessionTimeoutMinutes)}
          onChange={e => setConfig(prev => ({ ...prev, sessionTimeoutMinutes: Math.max(1, parseInt(e.target.value, 10) || 30) }))}
          helperText="After this many minutes of inactivity, the main menu is re-sent on the next message."
        />
      </div>

      {/* Preview */}
      {config.menuItems.length > 0 && (
        <div className="border border-green-200 rounded-lg overflow-hidden">
          <div className="bg-green-50 px-4 py-2 border-b border-green-200">
            <h4 className="text-sm font-semibold text-green-800">Menu Preview</h4>
          </div>
          <div className="p-4 bg-white">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-w-sm">
              <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                {formatMenuPreview()}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Menu Configuration'}
        </Button>
      </div>
    </div>
  );
};

export default WhatsAppMenuForm;
