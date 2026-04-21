import React, { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RentalAgreement, RentalAgreementStatus } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import ARTreeView, { ARTreeNode } from '../rentalManagement/ARTreeView';
import RentalAgreementDetailPanel from './RentalAgreementDetailPanel';
import RentalAgreementForm from './RentalAgreementForm';
import RentalAgreementTerminationModal from './RentalAgreementTerminationModal';
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

  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('agreements_dash_sidebar', 320);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'startDate', dir: 'desc' });

  const contactMap = useMemo(() => new Map(state.contacts.map(c => [c.id, c])), [state.contacts]);
  const propertyMap = useMemo(() => new Map(state.properties.map(p => [p.id, p])), [state.properties]);
  const buildingMap = useMemo(() => new Map(state.buildings.map(b => [b.id, b])), [state.buildings]);
  const rentalAgreementMap = useMemo(() => new Map(state.rentalAgreements.map(a => [a.id, a])), [state.rentalAgreements]);

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
        const tenant = contactMap.get(ra.contactId);
        if (tenant?.name?.toLowerCase().includes(q)) return true;
        const prop = propertyMap.get(ra.propertyId);
        if (prop?.name?.toLowerCase().includes(q)) return true;
        if (prop?.buildingId) {
          const bld = buildingMap.get(prop.buildingId);
          if (bld?.name?.toLowerCase().includes(q)) return true;
        }
        const ownerId = ra.ownerId || prop?.ownerId;
        if (ownerId) {
          const owner = contactMap.get(ownerId);
          if (owner?.name?.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    return result;
  }, [state.rentalAgreements, statusFilter, searchQuery, contactMap, propertyMap, buildingMap, isExpiringSoon]);

  /** Keeps filters/table in sync while letting React yield during huge tree builds after full API merges. */
  const deferredAgreementsForTree = useDeferredValue(filteredAgreements);

  const treeData = useMemo((): ARTreeNode[] => {
    const calcStats = (agreements: RentalAgreement[]) => {
      let activeRent = 0;
      let activeSecurity = 0;
      let expiringRent = 0;
      for (const ra of agreements) {
        if (ra.status === RentalAgreementStatus.ACTIVE) {
          activeRent += parseFloat(String(ra.monthlyRent)) || 0;
          activeSecurity += parseFloat(String(ra.securityDeposit)) || 0;
        }
        if (isExpiringSoon(ra)) expiringRent += parseFloat(String(ra.monthlyRent)) || 0;
      }
      return { outstanding: activeRent, overdue: expiringRent, invoiceCount: agreements.length, secondary: activeSecurity };
    };

    const getPropertyDetails = (propertyId: string) => {
      const prop = propertyMap.get(propertyId);
      return {
        property: prop,
        buildingId: prop?.buildingId || '__unassigned',
        ownerId: prop?.ownerId || '__unassigned',
      };
    };

    if (viewBy === 'building') {
      const grouped = new Map<string, RentalAgreement[]>();
      for (const ra of deferredAgreementsForTree) {
        const { buildingId } = getPropertyDetails(ra.propertyId);
        if (!grouped.has(buildingId)) grouped.set(buildingId, []);
        grouped.get(buildingId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([bId, ras]) => {
        const building = buildingMap.get(bId);

        const propGrouped = new Map<string, RentalAgreement[]>();
        for (const ra of ras) {
          if (!propGrouped.has(ra.propertyId)) propGrouped.set(ra.propertyId, []);
          propGrouped.get(ra.propertyId)!.push(ra);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([pId, pRas]) => {
          const prop = propertyMap.get(pId);

          const tenantChildren: ARTreeNode[] = pRas.map(ra => {
            const tenant = contactMap.get(ra.contactId);
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
      for (const ra of deferredAgreementsForTree) {
        if (!grouped.has(ra.propertyId)) grouped.set(ra.propertyId, []);
        grouped.get(ra.propertyId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([pId, ras]) => {
        const prop = propertyMap.get(pId);
        const tenantChildren: ARTreeNode[] = ras.map(ra => {
          const tenant = contactMap.get(ra.contactId);
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
      for (const ra of deferredAgreementsForTree) {
        if (!grouped.has(ra.contactId)) grouped.set(ra.contactId, []);
        grouped.get(ra.contactId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([cId, ras]) => {
        const tenant = contactMap.get(cId);
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
      for (const ra of deferredAgreementsForTree) {
        const { ownerId } = getPropertyDetails(ra.propertyId);
        const effectiveOwnerId = ra.ownerId || ownerId;
        if (!grouped.has(effectiveOwnerId)) grouped.set(effectiveOwnerId, []);
        grouped.get(effectiveOwnerId)!.push(ra);
      }

      return Array.from(grouped.entries()).map(([oId, ras]) => {
        const owner = contactMap.get(oId);

        const propGrouped = new Map<string, RentalAgreement[]>();
        for (const ra of ras) {
          if (!propGrouped.has(ra.propertyId)) propGrouped.set(ra.propertyId, []);
          propGrouped.get(ra.propertyId)!.push(ra);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([pId, pRas]) => {
          const prop = propertyMap.get(pId);
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
  }, [deferredAgreementsForTree, viewBy, contactMap, propertyMap, buildingMap, isExpiringSoon]);

  useEffect(() => { setSelectedNode(null); }, [viewBy, statusFilter]);

  useEffect(() => {
    const agreementId = sessionStorage.getItem('openRentalAgreementId');
    if (!agreementId) return;
    const agreement = state.rentalAgreements.find(a => a.id === agreementId);
    if (agreement) {
      sessionStorage.removeItem('openRentalAgreementId');
      setSelectedAgreement(agreement);
    }
  }, [state.rentalAgreements]);

  const nodeAgreements = useMemo(() => {
    if (!selectedNode) return filteredAgreements;
    const nodeId = selectedNode.id;

    return filteredAgreements.filter(ra => {
      const prop = propertyMap.get(ra.propertyId);
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
  }, [selectedNode, filteredAgreements, propertyMap]);

  const sortedAgreements = useMemo(() => {
    const sorted = [...nodeAgreements];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortConfig.key) {
        case 'agreementNumber': cmp = a.agreementNumber.localeCompare(b.agreementNumber); break;
        case 'tenant': {
          const nA = contactMap.get(a.contactId)?.name || '';
          const nB = contactMap.get(b.contactId)?.name || '';
          cmp = nA.localeCompare(nB); break;
        }
        case 'property': {
          const pA = propertyMap.get(a.propertyId)?.name || '';
          const pB = propertyMap.get(b.propertyId)?.name || '';
          cmp = pA.localeCompare(pB); break;
        }
        case 'rent': cmp = (parseFloat(String(a.monthlyRent)) || 0) - (parseFloat(String(b.monthlyRent)) || 0); break;
        case 'security': cmp = (parseFloat(String(a.securityDeposit)) || 0) - (parseFloat(String(b.securityDeposit)) || 0); break;
        case 'startDate': cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime(); break;
        case 'endDate': cmp = new Date(a.endDate).getTime() - new Date(b.endDate).getTime(); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        default: cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [nodeAgreements, sortConfig, contactMap, propertyMap]);

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
    window.addEventListener('blur', handleUp);
    document.addEventListener('visibilitychange', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('blur', handleUp);
      document.removeEventListener('visibilitychange', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove]);

  useEffect(() => {
    if (selectedAgreement) {
      const updated = rentalAgreementMap.get(selectedAgreement.id);
      if (updated) setSelectedAgreement(updated); else setSelectedAgreement(null);
    }
  }, [rentalAgreementMap]);

  const handleSortClick = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };
  const SortArrow = ({ column }: { column: string }) => (
    <span className="ml-0.5 text-[9px] text-app-muted">
      {sortConfig.key === column ? (sortConfig.dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  const getStatusBadge = (ra: RentalAgreement) => {
    const pill = 'px-1.5 py-0.5 rounded text-[10px] font-semibold border';
    if (isExpiringSoon(ra)) return <span className={`${pill} border-ds-warning/35 bg-app-toolbar text-ds-warning`}>Expiring</span>;
    if (ra.status === RentalAgreementStatus.ACTIVE) return <span className={`${pill} border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success`}>Active</span>;
    if (ra.status === RentalAgreementStatus.RENEWED) return <span className={`${pill} border-primary/25 bg-app-toolbar text-primary`}>Renewed</span>;
    if (ra.status === RentalAgreementStatus.TERMINATED) return <span className={`${pill} border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-ds-danger`}>Terminated</span>;
    if (ra.status === RentalAgreementStatus.EXPIRED) return <span className={`${pill} border-app-border bg-app-toolbar text-app-muted`}>Expired</span>;
    return <span className={`${pill} border-app-border bg-app-toolbar text-app-muted`}>{ra.status}</span>;
  };

  const statusCounts = useMemo(() => ({
    all: state.rentalAgreements.length,
    active: state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.ACTIVE).length,
    expiring: state.rentalAgreements.filter(isExpiringSoon).length,
    renewed: state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.RENEWED).length,
    terminated: state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.TERMINATED || a.status === RentalAgreementStatus.EXPIRED).length,
  }), [state.rentalAgreements, isExpiringSoon]);

  const selectClass = 'ds-input-field px-2 py-1 text-xs cursor-pointer min-w-[100px]';

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Compact Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-app-card border-b border-app-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-app-muted uppercase">View</label>
          <select value={viewBy} onChange={e => setViewBy(e.target.value as ViewBy)} className={selectClass} aria-label="View by">
            <option value="building">Building</option>
            <option value="property">Property</option>
            <option value="tenant">Tenant</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        <div className="w-px h-5 bg-app-border" />

        <div className="flex items-center gap-1 flex-wrap">
          {([
            { key: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
            { key: 'active' as StatusFilter, label: 'Active', count: statusCounts.active },
            { key: 'expiring' as StatusFilter, label: 'Expiring', count: statusCounts.expiring },
            { key: 'renewed' as StatusFilter, label: 'Renewed', count: statusCounts.renewed },
            { key: 'terminated' as StatusFilter, label: 'Ended', count: statusCounts.terminated },
          ]).map(tab => (
            <button
              type="button"
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === tab.key ? 'bg-primary text-ds-on-primary' : 'bg-app-toolbar text-app-muted hover:bg-app-toolbar/80 hover:text-app-text'
              }`}
            >
              {tab.label} <span className="text-[10px] opacity-75">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-app-border" />

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-app-muted">
            <div className="w-3.5 h-3.5">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder="Search tenant, owner, property..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ds-input-field pl-7 pr-2 py-1 w-full text-xs rounded-md placeholder:text-app-muted"
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
        <div className="flex-shrink-0 border-r border-app-border overflow-hidden hidden md:flex flex-col bg-app-card" style={{ width: `${sidebarWidth}px` }}>
          <div className="px-2 py-1.5 bg-app-toolbar border-b border-app-border flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Agreements</span>
            <span className="text-[10px] text-app-muted">{treeData.length} groups</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ARTreeView
              treeData={treeData}
              selectedNodeId={selectedNode?.id || null}
              onNodeSelect={setSelectedNode}
              searchQuery={searchQuery}
              amountLabel="Rent"
              secondaryLabel="Security"
              overdueLabel="expiring"
              emptyText="No agreements found"
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors hidden md:block flex-shrink-0"
          onMouseDown={e => { e.preventDefault(); setIsResizing(true); }}
        />

        {/* Right Panel: Agreement List + Detail */}
        <div className="flex-1 min-w-0 flex overflow-hidden">
          {/* Agreement Table */}
          <div className={`flex-1 min-w-0 flex flex-col overflow-hidden transition-all ${selectedAgreement ? 'border-r-0' : ''}`}>
            <div className="px-3 py-1.5 bg-app-toolbar border-b border-app-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-app-text truncate">
                  {selectedNode ? selectedNode.name : 'All Agreements'}
                </span>
                {selectedNode && (
                  <button type="button" onClick={() => setSelectedNode(null)} className="text-[10px] text-app-muted hover:text-app-text px-1.5 py-0.5 rounded hover:bg-app-toolbar/80">Clear</button>
                )}
              </div>
              <span className="text-[10px] text-app-muted tabular-nums flex-shrink-0">
                {sortedAgreements.length} agreement{sortedAgreements.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Mobile dropdown */}
            <div className="md:hidden px-3 py-2 bg-app-card border-b border-app-border">
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
                className="ds-input-field w-full px-2 py-1.5 text-sm"
                aria-label="Select agreement node"
              >
                <option value="">All Agreements</option>
                {treeData.map(n => <option key={n.id} value={n.id}>{n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})</option>)}
              </select>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-auto bg-app-card">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider border-b border-app-border">
                    <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('agreementNumber')}>ID <SortArrow column="agreementNumber" /></th>
                    <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('tenant')}>Tenant <SortArrow column="tenant" /></th>
                    <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('property')}>Property <SortArrow column="property" /></th>
                    <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('rent')}>Rent <SortArrow column="rent" /></th>
                    <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('security')}>Security <SortArrow column="security" /></th>
                    <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('startDate')}>Start <SortArrow column="startDate" /></th>
                    <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('endDate')}>End <SortArrow column="endDate" /></th>
                    <th className="px-2 py-1.5 text-center cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('status')}>Status <SortArrow column="status" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {sortedAgreements.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-app-muted italic">No agreements found</td></tr>
                  ) : sortedAgreements.map(ra => {
                    const tenant = contactMap.get(ra.contactId);
                    const prop = propertyMap.get(ra.propertyId);
                    const building = prop ? buildingMap.get(prop.buildingId) ?? null : null;

                    return (
                      <tr
                        key={ra.id}
                        onClick={() => setSelectedAgreement(ra)}
                        className={`cursor-pointer transition-colors ${
                          selectedAgreement?.id === ra.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-app-toolbar/60'
                        }`}
                      >
                        <td className="px-2 py-1.5 font-mono text-xs text-app-muted">{ra.agreementNumber}</td>
                        <td className="px-2 py-1.5 font-medium text-app-text truncate max-w-[140px]" title={tenant?.name}>{tenant?.name || '—'}</td>
                        <td className="px-2 py-1.5 text-app-text truncate max-w-[140px]" title={prop?.name}>
                          {prop?.name || '—'}
                          {building && <span className="text-app-muted text-[10px] ml-1">({building.name})</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-app-text">{CURRENCY} {(parseFloat(String(ra.monthlyRent)) || 0).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-app-muted">{ra.securityDeposit ? `${CURRENCY} ${(parseFloat(String(ra.securityDeposit)) || 0).toLocaleString()}` : '—'}</td>
                        <td className="px-2 py-1.5 text-app-text text-xs tabular-nums">{formatDate(ra.startDate)}</td>
                        <td className="px-2 py-1.5 text-app-text text-xs tabular-nums">{formatDate(ra.endDate)}</td>
                        <td className="px-2 py-1.5 text-center">{getStatusBadge(ra)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-3 py-1.5 bg-app-toolbar/40 border-t border-app-border flex items-center justify-between text-xs text-app-muted flex-shrink-0">
              <span>{sortedAgreements.length} agreements</span>
              <div className="flex gap-4 tabular-nums">
                <span>Rent: <strong className="text-app-text">{CURRENCY} {sortedAgreements.filter(a => a.status === RentalAgreementStatus.ACTIVE).reduce((s, a) => s + (parseFloat(String(a.monthlyRent)) || 0), 0).toLocaleString()}</strong></span>
                <span>Security: <strong className="text-app-text">{CURRENCY} {sortedAgreements.filter(a => a.status === RentalAgreementStatus.ACTIVE).reduce((s, a) => s + (parseFloat(String(a.securityDeposit)) || 0), 0).toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          {/* Detail Panel - inline on the right */}
          {selectedAgreement && (
            <RentalAgreementDetailPanel
              agreement={selectedAgreement}
              onClose={() => setSelectedAgreement(null)}
              onEdit={(a) => { setEditingAgreement(a); setSelectedAgreement(null); }}
              onTerminate={(a) => setTerminationAgreement(a)}
            />
          )}
        </div>
      </div>

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

      <RentalAgreementTerminationModal isOpen={!!terminationAgreement} onClose={() => setTerminationAgreement(null)} agreement={terminationAgreement} />
    </div>
  );
};

export default RentalAgreementsDashboard;
