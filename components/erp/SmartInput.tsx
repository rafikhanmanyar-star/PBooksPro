import React, { useMemo } from 'react';
import { computeFormulas, type FormulaMap } from './formulaEngine';

export type SmartInputValues = Record<string, number>;

export interface SmartInputProps {
  /** Keys the user may edit (numbers). */
  editableKeys: string[];
  /** Computed fields: key -> expression using other keys. */
  formulas: FormulaMap;
  /** Current numeric values (typically includes editable + last computed snapshot). */
  values: SmartInputValues;
  onValuesChange: (next: SmartInputValues) => void;
  /** Optional labels per key */
  labels?: Record<string, string>;
  className?: string;
  /** Per-field errors */
  errors?: Record<string, string>;
  disabled?: boolean;
  compact?: boolean;
}

const spinnerRemovalClasses =
  '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export const SmartInput: React.FC<SmartInputProps> = ({
  editableKeys,
  formulas,
  values,
  onValuesChange,
  labels = {},
  className = '',
  errors = {},
  disabled = false,
  compact = false,
}) => {
  const computedKeys = useMemo(() => new Set(Object.keys(formulas)), [formulas]);

  const merged = useMemo(() => computeFormulas(formulas, values), [formulas, values]);

  const handleNumberChange = (key: string, raw: string) => {
    const trimmed = raw.trim();
    const n = trimmed === '' ? 0 : parseFloat(trimmed);
    const nextBase: SmartInputValues = {
      ...values,
      [key]: Number.isFinite(n) ? n : 0,
    };
    onValuesChange(computeFormulas(formulas, nextBase));
  };

  const baseInputClass = `block w-full border rounded-ds-md shadow-ds-card bg-app-input text-app-text border-app-input-border focus:outline-none focus:ring-2 focus:ring-ds-primary/35 focus:border-ds-primary tabular-nums transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${spinnerRemovalClasses} ${
    compact ? 'py-1 px-2 text-ds-small' : 'px-ds-md py-2 text-base sm:text-ds-body'
  }`;

  const allKeysOrdered = useMemo(() => {
    const set = new Set([...editableKeys, ...Object.keys(formulas)]);
    return Array.from(set);
  }, [editableKeys, formulas]);

  return (
    <div className={`grid gap-ds-sm sm:grid-cols-2 ${className}`}>
      {allKeysOrdered.map((key) => {
        const isComputed = computedKeys.has(key);
        const label = labels[key] ?? key;
        const displayVal = merged[key];
        const str =
          typeof displayVal === 'number' && Number.isFinite(displayVal)
            ? String(displayVal)
            : '';
        const err = errors[key];

        if (isComputed) {
          return (
            <div key={key}>
              <label className="block text-ds-small font-medium text-app-muted mb-ds-xs">{label}</label>
              <div
                className={`${baseInputClass} text-right bg-app-muted/10 border-dashed border-app-input-border text-app-text ${
                  err ? 'ds-input-error' : ''
                }`}
                title="Calculated"
              >
                <span className="tabular-nums">{str}</span>
              </div>
              {err ? (
                <p className="mt-ds-xs text-ds-small text-app-error" role="alert">
                  {err}
                </p>
              ) : null}
            </div>
          );
        }

        return (
          <div key={key}>
            <label htmlFor={`smart-input-${key}`} className="block text-ds-small font-medium text-app-text mb-ds-xs">
              {label}
            </label>
            <input
              id={`smart-input-${key}`}
              type="number"
              inputMode="decimal"
              disabled={disabled}
              className={`${baseInputClass} text-right ${err ? 'ds-input-error' : ''}`}
              value={str}
              onChange={(e) => handleNumberChange(key, e.target.value)}
              {...(err ? { 'aria-invalid': true as const } : {})}
            />
            {err ? (
              <p className="mt-ds-xs text-ds-small text-app-error" role="alert">
                {err}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default SmartInput;
