import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RentalAgreement, RentalAgreementStatus } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import ARTreeView, { ARTreeNode } from '../rentalManagement/ARTreeView';
import RentalAgreementDetailPanel from './RentalAgreementDetailPanel';
import RentalAgreementForm from './RentalAgreementForm';
import RentalAgreementTerminationModal from './RentalAgreementTerminationModal';
import RentalAgreementRenewalModal from './RentalAgreementRenewalModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import useLocalStorage from '../../hooks/useLocalStorage';

type ViewBy = 'building' | 'property' | 'tenant' | 'owner';
type StatusFilter = 'all' | 'active' | 'expiring' | 'renewed' | 'terminated';

const RentalAgreementsDashboard: React.FC = () => {
  const { state } = useAppContext();

  const [viewBy, setViewBy] = useLocalStorage<ViewBy>('agreements_dash_viewBy', 'building');
  const [statusFilter, setStatusFilter] = useLocalStorage<StatusFilter>('agreements_dash_status', 'all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedNode, setSelectedNode] = useState<ARTreeNode | null>(null);
  const [selectedAgreement, setSelectedAgreement] = useState<RentalAgreement | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<RentalAgreement | null>(null);
  const [terminationAgreement, setTerminationAgreement] = useState<RentalAgreement | null>(null);
  const [renewalAgreement, setRenewalAgreement] = useState<RentalAgreement | null>(null);

  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('agreements_dash_sidebar', 320);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'startDate', dir: 'desc' });

  const today = useMemo(() => new Date(), []);
  const thirtyDaysLater = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; }, []);

  const isExpiringSoon = useCallback((ra: RentalAgreement) =>
    ra.status === RentalAgreementStatus.ACTIVE &&
    new Date(ra.endDate) <= thirtyDaysLater &&
    new Date(ra.endDate) >= today,
    [today, thirtyDaysLater]
  );

  const filteredAgreements = useMemo(() => {
    let result = [...state.rentalAgreements];

    if (statusFilter === 'active') result = result.filter(a => a.status === RentalAgreementStatus.ACTIVE);
    else if (statusFilter === 'expiring') result = result.filter(isExpiringSoon);
    else if (statusFilter === 'renewed') result = result.filter(a => a.status === RentalAgreementStatus.RENEWED);
    else if (statusFilter === 'terminated') result = result.filter(a =>
      a.status === RentalAgreementStatus.TERMINATED || a.status === RentalAgreementStatus.EXPIRED
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(ra => {
        if (ra.agreementNumber.toLowerCase().includes(q)) return true;
        const tenant = state.contacts.find(c => c.id === ra.contactId);
        if (tenant?.name?.toLowerCase().includes(q)) return true;
        const prop = state.properties.find(p => p.id === ra.propertyId);
        if (prop?.name?.toLowerCase().includes(q)) return true;
        if (prop?.buildingId) {
          const bld = state.buildings.find(b => b.id === prop.buildingId);
          if (bld?.name?.toLowerCase().includes(q)) return true;
        }
        const ownerId = ra.ownerId || prop?.ownerId;
        if (ownerId) {
          const owner = state.contacts.find(c => c.id === ownerId);
          if (owner?.name?.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    return result;
  }, [state.rentalAgreements, statusFilter, searchQuery, state.contacts, state.properties, state.buildings, isExpiringSoon]);

  const treeData = useMemo((): ARTreeNode[] => {
    const calcStats = (agreements: RentalAgreement[]) => {
      let totalRent = 0;
      let expiringRent = 0;
      for (const ra of agreements) {
        const rent = parseFloat(String(ra.monthlyRent)) || 0;
        totalRent += rent;
        if (isExpiringSoon(ra)) expiringRent += rent;
      }
      return { outstanding: totalRent, overdue: expiringRent, invoiceCount: agreements.length };
    };

    const getPropertyDetails = (propertyId: string) => {
      const prop = state.properties.find(p => p.id === propertyId);
      return {
        property: prop,
        buildingId: prop?.buildingId || '__unassigned',
        ownerId: prop?.ownerId || '__unassigned',
      };
    };

    if (viewBy === 'building') {
      const grouped = new Map<string, RentalAgreement[]>();
      for (const ra of filteredAgreements) {
        const { buildingId } = getPropertyDetails(ra.propertyId);
        if (!grouped.has(buildingId)) grouped.set(buildingId, []);
        grouped.get(buildingId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([bId, ras]) => {
        const building = state.buildings.find(b => b.id === bId);

        const propGrouped = new Map<string, RentalAgreement[]>();
        for (const ra of ras) {
          if (!propGrouped.has(ra.propertyId)) propGrouped.set(ra.propertyId, []);
          propGrouped.get(ra.propertyId)!.push(ra);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([pId, pRas]) => {
          const prop = state.properties.find(p => p.id === pId);

          const tenantChildren: ARTreeNode[] = pRas.map(ra => {
            const tenant = state.contacts.find(c => c.id === ra.contactId);
            return {
              id: `tenant-${ra.contactId}-${pId}`,
              name: tenant?.name || 'Unknown',
              type: 'tenant' as const,
              ...calcStats([ra]),
            };
          });

          return {
            id: pId,
            name: prop?.name || 'Unknown Property',
            type: 'property' as const,
            ...calcStats(pRas),
            children: tenantChildren.length > 0 ? tenantChildren : undefined,
          };
        });

        return {
          id: bId === '__unassigned' ? '__building_unassigned' : bId,
          name: building?.name || 'Unassigned Building',
          type: 'building' as const,
          ...calcStats(ras),
          children: children.length > 0 ? children : undefined,
        };
      });
    }

    if (viewBy === 'property') {
      const grouped = new Map<string, RentalAgreement[]>();
      for (const ra of filteredAgreements) {
        if (!grouped.has(ra.propertyId)) grouped.set(ra.propertyId, []);
        grouped.get(ra.propertyId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([pId, ras]) => {
        const prop = state.properties.find(p => p.id === pId);
        const tenantChildren: ARTreeNode[] = ras.map(ra => {
          const tenant = state.contacts.find(c => c.id === ra.contactId);
          return {
            id: `tenant-${ra.contactId}-${pId}`,
            name: tenant?.name || 'Unknown',
            type: 'tenant' as const,
            ...calcStats([ra]),
          };
        });

        return {
          id: pId,
          name: prop?.name || 'Unknown Property',
          type: 'property' as const,
          ...calcStats(ras),
          children: tenantChildren.length > 0 ? tenantChildren : undefined,
        };
      });
    }

    if (viewBy === 'tenant') {
      const grouped = new Map<string, RentalAgreement[]>();
      for (const ra of filteredAgreements) {
        if (!grouped.has(ra.contactId)) grouped.set(ra.contactId, []);
        grouped.get(ra.contactId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([cId, ras]) => {
        const tenant = state.contacts.find(c => c.id === cId);
        return {
          id: cId,
          name: tenant?.name || 'Unknown',
          type: 'tenant' as const,
          ...calcStats(ras),
        };
      });
    }

    if (viewBy === 'owner') {
      const grouped = new Map<string, RentalAgreement[]>();
      for (const ra of filteredAgreements) {
        const { ownerId } = getPropertyDetails(ra.propertyId);
        const effectiveOwnerId = ra.ownerId || ownerId;
        if (!grouped.has(effectiveOwnerId)) grouped.set(effectiveOwnerId, []);
        grouped.get(effectiveOwnerId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([oId, ras]) => {
        const owner = state.contacts.find(c => c.id === oId);

        const propGrouped = new Map<string, RentalAgreement[]>();
        for (const ra of ras) {
          if (!propGrouped.has(ra.propertyId)) propGrouped.set(ra.propertyId, []);
          propGrouped.get(ra.propertyId)!.push(ra);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([pId, pRas]) => {
          const prop = state.properties.find(p => p.id === pId);
          return {
            id: `${pId}-owner-${oId}`,
            name: prop?.name || 'Unknown Property',
            type: 'property' as const,
            ...calcStats(pRas),
          };
        });

        return {
          id: oId === '__unassigned' ? '__owner_unassigned' : oId,
          name: owner?.name || 'Unassigned Owner',
          type: 'owner' as const,
          ...calcStats(ras),
          children: children.length > 0 ? children : undefined,
        };
      });
    }

    return [];
  }, [filteredAgreements, viewBy, state.buildings, state.properties, state.contacts, isExpiringSoon]);

  useEffect(() => { setSelectedNode(null); }, [viewBy, statusFilter]);

  const nodeAgreements = useMemo(() => {
    if (!selectedNode) return filteredAgreements;
    const nodeId = selectedNode.id;

    return filteredAgreements.filter(ra => {
      const prop = state.properties.find(p => p.id === ra.propertyId);
      const buildingId = prop?.buildingId || '__unassigned';
      const ownerId = ra.ownerId || prop?.ownerId || '__unassigned';

      if (nodeId.startsWith('tenant-')) {
        const contactId = nodeId.replace('tenant-', '').split('-')[0];
        return ra.contactId === contactId;
      }

      switch (selectedNode.type) {
        case 'building':
          return buildingId === nodeId || (nodeId.includes('__unassigned') && !prop?.buildingId);
        case 'property': {
          const cleanId = nodeId.includes('-owner-') ? nodeId.split('-owner-')[0] : nodeId;
          return ra.propertyId === cleanId;
        }
        case 'tenant':
          return ra.contactId === nodeId;
        case 'owner':
          return ownerId === nodeId || (nodeId.includes('__unassigned') && !ownerId);
        default:
          return true;
      }
    });
  }, [selectedNode, filteredAgreements, state.properties]);

  const sortedAgreements = useMemo(() => {
    const sorted = [...nodeAgreements];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortConfig.key) {
        case 'agreementNumber': cmp = a.agreementNumber.localeCompare(b.agreementNumber); break;
        case 'tenant': {
          const nA = state.contacts.find(c => c.id === a.contactId)?.name || '';
          const nB = state.contacts.find(c => c.id === b.contactId)?.name || '';
          cmp = nA.localeCompare(nB); break;
        }
        case 'property': {
          const pA = state.properties.find(p => p.id === a.propertyId)?.name || '';
          const pB = state.properties.find(p => p.id === b.propertyId)?.name || '';
          cmp = pA.localeCompare(pB); break;
        }
        case 'rent': cmp = (parseFloat(String(a.monthlyRent)) || 0) - (parseFloat(String(b.monthlyRent)) || 0); break;
        case 'startDate': cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime(); break;
        case 'endDate': cmp = new Date(a.endDate).getTime() - new Date(b.endDate).getTime(); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        default: cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [nodeAgreements, sortConfig, state.contacts, state.properties]);

  // Resize
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const newWidth = e.clientX - containerLeft;
    if (newWidth > 200 && newWidth < 600) setSidebarWidth(newWidth);
  }, [setSidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleUp = () => { setIsResizing(false); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
  }, [isResizing, handleMouseMove]);

  useEffect(() => {
    if (selectedAgreement) {
      const updated = state.rentalAgreements.find(a => a.id === selectedAgreement.id);
      if (updated) setSelectedAgreement(updated); else setSelectedAgreement(null);
    }
  }, [state.rentalAgreements]);

  const handleSortClick = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };
  const SortArrow = ({ column }: { column: string }) => (
    <span className="ml-0.5 text-[9px] opacity-50">
      {sortConfig.key === column ? (sortConfig.dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  const getStatusBadge = (ra: RentalAgreement) => {
    if (isExpiringSoon(ra)) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">Expiring</span>;
    if (ra.status === RentalAgreementStatus.ACTIVE) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">Active</span>;
    if (ra.status === RentalAgreementStatus.RENEWED) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">Renewed</span>;
    if (ra.status === RentalAgreementStatus.TERMINATED) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">Terminated</span>;
    if (ra.status === RentalAgreementStatus.EXPIRED) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">Expired</span>;
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{ra.status}</span>;
  };

  const statusCounts = useMemo(() => ({
    all: state.rentalAgreements.length,
    active: state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.ACTIVE).length,
    expiring: state.rentalAgreements.filter(isExpiringSoon).length,
    renewed: state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.RENEWED).length,
    terminated: state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.TERMINATED || a.status === RentalAgreementStatus.EXPIRED).length,
  }), [state.rentalAgreements, isExpiringSoon]);

  const selectClass = 'px-2 py-1 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-accent/50 focus:border-accent cursor-pointer';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/50">
      {/* Compact Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-slate-500 uppercase">View</label>
          <select value={viewBy} onChange={e => setViewBy(e.target.value as ViewBy)} className={selectClass}>
            <option value="building">Building</option>
            <option value="property">Property</option>
            <option value="tenant">Tenant</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1">
          {([
            { key: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
            { key: 'active' as StatusFilter, label: 'Active', count: statusCounts.active },
            { key: 'expiring' as StatusFilter, label: 'Expiring', count: statusCounts.expiring },
            { key: 'renewed' as StatusFilter, label: 'Renewed', count: statusCounts.renewed },
            { key: 'terminated' as StatusFilter, label: 'Ended', count: statusCounts.terminated },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === tab.key ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label} <span className="text-[10px] opacity-75">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-400">
            <div className="w-3.5 h-3.5">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder="Search tenant, owner, property..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-1 w-full text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-accent/50 focus:border-accent"
          />
        </div>

        <div className="ml-auto">
          <Button onClick={() => setIsCreateModalOpen(true)} size="sm" className="text-xs">
            <div className="w-3.5 h-3.5 mr-1">{ICONS.plus}</div>
            New Agreement
          </Button>
        </div>
      </div>

      {/* Split Layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel: Tree */}
        <div className="flex-shrink-0 border-r border-slate-200 overflow-hidden hidden md:flex flex-col" style={{ width: `${sidebarWidth}px` }}>
          <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Agreements</span>
            <span className="text-[10px] text-slate-400">{treeData.length} groups</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ARTreeView
              treeData={treeData}
              selectedNodeId={selectedNode?.id || null}
              onNodeSelect={setSelectedNode}
              searchQuery={searchQuery}
              amountLabel="Rent"
              overdueLabel="expiring"
              emptyText="No agreements found"
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1.5 cursor-col-resize hover:bg-indigo-200 active:bg-indigo-300 transition-colors hidden md:block flex-shrink-0"
          onMouseDown={e => { e.preventDefault(); setIsResizing(true); }}
        />

        {/* Right Panel: Agreement List */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-700 truncate">
                {selectedNode ? selectedNode.name : 'All Agreements'}
              </span>
              {selectedNode && (
                <button onClick={() => setSelectedNode(null)} className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-200">Clear</button>
              )}
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
              {sortedAgreements.length} agreement{sortedAgreements.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Mobile dropdown */}
          <div className="md:hidden px-3 py-2 bg-white border-b border-slate-200">
            <select
              value={selectedNode?.id || ''}
              onChange={e => {
                const id = e.target.value;
                if (!id) { setSelectedNode(null); return; }
                const findNode = (nodes: ARTreeNode[]): ARTreeNode | null => {
                  for (const n of nodes) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children); if (f) return f; } } return null;
                };
                setSelectedNode(findNode(treeData));
              }}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
            >
              <option value="">All Agreements</option>
              {treeData.map(n => <option key={n.id} value={n.id}>{n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('agreementNumber')}>ID <SortArrow column="agreementNumber" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('tenant')}>Tenant <SortArrow column="tenant" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('property')}>Property <SortArrow column="property" /></th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('rent')}>Rent <SortArrow column="rent" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('startDate')}>Start <SortArrow column="startDate" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('endDate')}>End <SortArrow column="endDate" /></th>
                  <th className="px-2 py-1.5 text-center cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('status')}>Status <SortArrow column="status" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedAgreements.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">No agreements found</td></tr>
                ) : sortedAgreements.map(ra => {
                  const tenant = state.contacts.find(c => c.id === ra.contactId);
                  const prop = state.properties.find(p => p.id === ra.propertyId);
                  const building = prop ? state.buildings.find(b => b.id === prop.buildingId) : null;

                  return (
                    <tr
                      key={ra.id}
                      onClick={() => setSelectedAgreement(ra)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${
                        selectedAgreement?.id === ra.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-2 py-1.5 font-mono text-xs text-slate-600">{ra.agreementNumber}</td>
                      <td className="px-2 py-1.5 font-medium text-slate-800 truncate max-w-[140px]" title={tenant?.name}>{tenant?.name || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-600 truncate max-w-[140px]" title={prop?.name}>
                        {prop?.name || '—'}
                        {building && <span className="text-slate-400 text-[10px] ml-1">({building.name})</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-700">{CURRENCY} {(parseFloat(String(ra.monthlyRent)) || 0).toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-slate-600 text-xs tabular-nums">{formatDate(ra.startDate)}</td>
                      <td className="px-2 py-1.5 text-slate-600 text-xs tabular-nums">{formatDate(ra.endDate)}</td>
                      <td className="px-2 py-1.5 text-center">{getStatusBadge(ra)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
            <span>{sortedAgreements.length} agreements</span>
            <span className="tabular-nums">
              Total Rent: <strong className="text-slate-700">{CURRENCY} {sortedAgreements.reduce((s, a) => s + (parseFloat(String(a.monthlyRent)) || 0), 0).toLocaleString()}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedAgreement && (
        <RentalAgreementDetailPanel
          agreement={selectedAgreement}
          onClose={() => setSelectedAgreement(null)}
          onEdit={(a) => { setEditingAgreement(a); setSelectedAgreement(null); }}
          onRenew={(a) => setRenewalAgreement(a)}
          onTerminate={(a) => setTerminationAgreement(a)}
        />
      )}

      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create New Rental Agreement" size="xl" disableScroll>
        <div className="h-full min-h-0 flex flex-col p-4">
          <RentalAgreementForm key="new" onClose={() => setIsCreateModalOpen(false)} agreementToEdit={null} />
        </div>
      </Modal>

      <Modal isOpen={!!editingAgreement} onClose={() => setEditingAgreement(null)} title={editingAgreement ? `Edit Agreement ${editingAgreement.agreementNumber}` : ''} size="xl" disableScroll>
        <div className="h-full min-h-0 flex flex-col p-4">
          <RentalAgreementForm key={editingAgreement?.id || 'edit'} onClose={() => setEditingAgreement(null)} agreementToEdit={editingAgreement} />
        </div>
      </Modal>

      <RentalAgreementRenewalModal isOpen={!!renewalAgreement} onClose={() => setRenewalAgreement(null)} agreement={renewalAgreement} />
      <RentalAgreementTerminationModal isOpen={!!terminationAgreement} onClose={() => setTerminationAgreement(null)} agreement={terminationAgreement} />
    </div>
  );
};

export default RentalAgreementsDashboard;
