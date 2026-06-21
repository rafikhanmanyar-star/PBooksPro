import React, { useEffect, useRef, useState } from 'react';
import Input from '../../../components/ui/Input';
import type { CaptureType } from '../constants/quickCaptureTypes';
import { isEntityPickerKind, isNameInputKind } from '../constants/quickCaptureTypes';
import { useQuickCaptureCatalog } from '../hooks/useQuickCaptureCatalog';
import QuickCaptureEntityPicker from './QuickCaptureEntityPicker';
import FieldSuggestionChips from './FieldSuggestionChips';
import type { QuickCaptureFieldKey } from '../utils/quickCaptureFieldHistory';

export type DetailsPhase = 'entity' | 'project' | 'description';

export type DetailsFormState = {
  partyName: string;
  supplierId: string;
  employeeId: string;
  projectId: string;
  description: string;
};

type Props = {
  captureType: CaptureType;
  value: DetailsFormState;
  onChange: (patch: Partial<DetailsFormState>) => void;
  fieldSuggestions: Record<QuickCaptureFieldKey, string[]>;
  onPhaseChange?: (phase: DetailsPhase) => void;
};

function entitySectionTitle(kind: CaptureType['kind']): string {
  if (kind === 'suppliers') return 'Select vendor';
  if (kind === 'staff') return 'Select staff member';
  if (kind === 'site') return 'Site name';
  if (kind === 'misc') return 'Name / reference';
  return 'Name';
}

function entityPlaceholder(kind: CaptureType['kind'], customLabel?: string): string {
  if (kind === 'site') return 'e.g. Site Office, Block A';
  if (kind === 'misc') return 'e.g. Petty cash, Parking';
  if (kind === 'custom') return customLabel ? `e.g. ${customLabel} details` : 'Enter a name';
  return 'Search by name';
}

export default function QuickCaptureDetailsStep({
  captureType,
  value,
  onChange,
  fieldSuggestions,
  onPhaseChange,
}: Props) {
  const { vendorItems, staffItems, projectItems, isLoadingEmployees } = useQuickCaptureCatalog();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const entityComplete = isEntityPickerKind(captureType.kind)
    ? captureType.kind === 'suppliers'
      ? Boolean(value.supplierId)
      : Boolean(value.employeeId)
    : Boolean(value.partyName.trim());

  const projectComplete = Boolean(value.projectId);

  const [phase, setPhase] = useState<DetailsPhase>('entity');

  useEffect(() => {
    setPhase('entity');
  }, [captureType.id]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    if (phase === 'description') {
      descriptionRef.current?.focus();
    }
  }, [phase]);

  const advanceToProject = () => setPhase('project');
  const advanceToDescription = () => setPhase('description');

  const handleVendorSelect = (item: { id: string; name: string }) => {
    onChange({ supplierId: item.id, partyName: item.name, employeeId: '' });
    advanceToProject();
  };

  const handleStaffSelect = (item: { id: string; name: string }) => {
    onChange({ employeeId: item.id, partyName: item.name, supplierId: '' });
    advanceToProject();
  };

  const handleProjectSelect = (item: { id: string; name: string }) => {
    onChange({ projectId: item.id });
    advanceToDescription();
  };

  const handleNameConfirm = () => {
    if (!value.partyName.trim()) return;
    advanceToProject();
  };

  const entityExpanded = phase === 'entity' || !entityComplete;
  const projectExpanded = phase === 'project' || (entityComplete && !projectComplete && phase !== 'entity');
  const descriptionExpanded = phase === 'description' || (entityComplete && projectComplete);

  return (
    <div className="space-y-3">
      {/* Entity / name section */}
      <section
        className={`qc-detail-card ${entityComplete && !entityExpanded ? 'qc-detail-card--done' : ''} ${
          phase === 'entity' ? 'qc-detail-card--active' : ''
        }`}
      >
        <header className="qc-detail-card-header">
          <span className="qc-detail-step-badge">{entityComplete ? '✓' : '1'}</span>
          <h3 className="text-sm font-semibold text-app-text">{entitySectionTitle(captureType.kind)}</h3>
        </header>

        {(entityExpanded || phase === 'entity') && (
          <div className="qc-detail-card-body">
            {captureType.kind === 'suppliers' && (
              <QuickCaptureEntityPicker
                label=""
                items={vendorItems}
                selectedId={value.supplierId}
                onSelect={handleVendorSelect}
                autoFocus={phase === 'entity'}
                placeholder={entityPlaceholder(captureType.kind)}
                emptyMessage="No vendors found. Add vendors in ERP or type a name below."
              />
            )}

            {captureType.kind === 'staff' && (
              <QuickCaptureEntityPicker
                label=""
                items={staffItems}
                selectedId={value.employeeId}
                onSelect={handleStaffSelect}
                autoFocus={phase === 'entity'}
                loading={isLoadingEmployees}
                placeholder={entityPlaceholder(captureType.kind)}
                emptyMessage="No staff found in payroll."
              />
            )}

            {isNameInputKind(captureType.kind) && (
              <div className="space-y-2">
                <Input
                  label=""
                  value={value.partyName}
                  onChange={(e) => onChange({ partyName: e.target.value, supplierId: '', employeeId: '' })}
                  placeholder={entityPlaceholder(captureType.kind, captureType.label)}
                  autoFocus={phase === 'entity'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleNameConfirm();
                    }
                  }}
                />
                <FieldSuggestionChips
                  suggestions={fieldSuggestions.partyName}
                  currentValue={value.partyName}
                  onSelect={(name) => {
                    onChange({ partyName: name });
                    setTimeout(advanceToProject, 0);
                  }}
                />
                {value.partyName.trim() && (
                  <button
                    type="button"
                    onClick={handleNameConfirm}
                    className="text-xs font-semibold text-ds-primary touch-manipulation"
                  >
                    Continue to project →
                  </button>
                )}
              </div>
            )}

          </div>
        )}

        {entityComplete && !entityExpanded && (
          <button
            type="button"
            className="qc-detail-summary touch-manipulation"
            onClick={() => setPhase('entity')}
          >
            {value.partyName || '—'}
          </button>
        )}
      </section>

      {/* Project section */}
      {(entityComplete || phase !== 'entity') && (
        <section
          className={`qc-detail-card ${projectComplete && phase !== 'project' ? 'qc-detail-card--done' : ''} ${
            phase === 'project' ? 'qc-detail-card--active' : ''
          } ${!entityComplete ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <header className="qc-detail-card-header">
            <span className="qc-detail-step-badge">{projectComplete ? '✓' : '2'}</span>
            <h3 className="text-sm font-semibold text-app-text">Select project</h3>
          </header>

          {(projectExpanded || phase === 'project') && entityComplete && (
            <div className="qc-detail-card-body">
              <QuickCaptureEntityPicker
                label=""
                items={projectItems}
                selectedId={value.projectId}
                onSelect={handleProjectSelect}
                autoFocus={phase === 'project'}
                placeholder="Search projects…"
                emptyMessage="No projects in system — you can skip and add notes."
              />
              {projectItems.length === 0 && (
                <button
                  type="button"
                  onClick={advanceToDescription}
                  className="mt-2 text-xs font-semibold text-app-muted touch-manipulation"
                >
                  Skip project →
                </button>
              )}
            </div>
          )}

          {projectComplete && phase !== 'project' && (
            <button
              type="button"
              className="qc-detail-summary touch-manipulation"
              onClick={() => setPhase('project')}
            >
              {projectItems.find((p) => p.id === value.projectId)?.name ?? value.projectId}
            </button>
          )}
        </section>
      )}

      {/* Description section */}
      {(entityComplete && (projectComplete || phase === 'description')) && (
        <section
          className={`qc-detail-card ${phase === 'description' ? 'qc-detail-card--active' : ''}`}
        >
          <header className="qc-detail-card-header">
            <span className="qc-detail-step-badge">3</span>
            <h3 className="text-sm font-semibold text-app-text">Description</h3>
          </header>
          <div className="qc-detail-card-body space-y-2">
            <textarea
              ref={descriptionRef}
              value={value.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="What was this for? e.g. Cement delivery, fuel for generator…"
              rows={3}
              className="w-full rounded-xl border border-app-border bg-app-input text-app-text text-sm px-3 py-2.5 resize-none"
            />
            <FieldSuggestionChips
              suggestions={fieldSuggestions.description}
              currentValue={value.description}
              onSelect={(text) => onChange({ description: text })}
            />
          </div>
        </section>
      )}
    </div>
  );
}
