import React, { useState } from 'react';
import type { ProcurementSettings } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { useDispatchOnly } from '../../hooks/useSelectiveState';
import { useNotification } from '../../context/NotificationContext';

interface ProcurementSettingsSectionProps {
  settings: ProcurementSettings;
}

const ProcurementSettingsSection: React.FC<ProcurementSettingsSectionProps> = ({ settings }) => {
  const dispatch = useDispatchOnly();
  const { showToast } = useNotification();
  const [local, setLocal] = useState(settings);

  const save = () => {
    dispatch({ type: 'UPDATE_PROCUREMENT_SETTINGS', payload: local });
    showToast('Procurement settings saved.', 'success');
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-lg font-bold text-app-text mb-1">Procurement</h3>
        <p className="text-sm text-app-muted">
          Configure vendor quotation price validation for contracts and bills.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={local.enableQuotationValidationGlobally}
          onChange={(e) =>
            setLocal({ ...local, enableQuotationValidationGlobally: e.target.checked })
          }
          className="rounded border-app-border"
        />
        <span className="text-sm text-app-text">Enable Quotation Validation Globally</span>
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={local.showWarningOnly}
          onChange={(e) => setLocal({ ...local, showWarningOnly: e.target.checked })}
          className="rounded border-app-border"
        />
        <span className="text-sm text-app-text">Show Warning Only (do not block saves)</span>
      </label>

      <Input
        id="procurement-variance-threshold"
        name="procurement-variance-threshold"
        label="Variance Approval Threshold (%)"
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={String(local.varianceApprovalThreshold)}
        onChange={(e) =>
          setLocal({
            ...local,
            varianceApprovalThreshold: parseFloat(e.target.value) || 10,
          })
        }
        helperText="Future: purchases above this variance may require approval workflow."
      />

      <div className="flex justify-end">
        <Button type="button" onClick={save}>
          Save Procurement Settings
        </Button>
      </div>
    </div>
  );
};

export default ProcurementSettingsSection;
