import React, { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface InlineEditableCellProps {
  value: string | number;
  /** When true, cell shows text only */
  readOnly?: boolean;
  /** Parse display string to value for onCommit */
  parse: (raw: string) => unknown;
  format: (v: unknown) => string;
  onCommit: (parsed: unknown) => Promise<void> | void;
  validate?: (parsed: unknown) => string | null;
  /** Align like table column */
  align?: 'left' | 'right' | 'center';
  className?: string;
  inputClassName?: string;
  /** Called when user presses Tab (next) or Shift+Tab (prev) from input */
  onTabNext?: (dir: 1 | -1) => void;
  /** Enter moves down (Excel-style) when provided */
  onEnterDown?: () => void;
  /** Optional status indicator from parent */
  saveStatus?: SaveStatus;
  saveError?: string;
  onRetry?: () => void;
}

const spinnerRemovalClasses =
  '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export const InlineEditableCell: React.FC<InlineEditableCellProps> = ({
  value,
  readOnly = false,
  parse,
  format,
  onCommit,
  validate,
  align = 'left',
  className = '',
  inputClassName = '',
  onTabNext,
  onEnterDown,
  saveStatus = 'idle',
  saveError,
  onRetry,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const display = format(value);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async () => {
    const err = validate ? validate(parse(draft)) : null;
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    try {
      await onCommit(parse(draft));
      setEditing(false);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Save failed');
    }
  }, [draft, onCommit, parse, validate]);

  const cancel = useCallback(() => {
    setDraft(display);
    setLocalError(null);
    setEditing(false);
  }, [display]);

  if (readOnly) {
    const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
      <div className={`px-2 py-1.5 tabular-nums ${alignClass} ${className}`} title={String(display)}>
        {display}
      </div>
    );
  }

  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (!editing) {
    const errShow = localError || saveError;
    return (
      <div className={`relative min-h-[2rem] ${className}`}>
        <button
          type="button"
          className={`w-full px-2 py-1.5 text-left rounded hover:bg-app-table-hover/80 focus:outline-none focus:ring-2 focus:ring-ds-primary/30 tabular-nums ${alignClass} ${
            errShow ? 'ring-1 ring-app-error/50' : ''
          }`}
          onClick={() => {
            setDraft(display);
            setEditing(true);
          }}
        >
          {display}
        </button>
        {saveStatus === 'saving' && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-app-muted">…</span>
        )}
        {saveStatus === 'saved' && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600">Saved</span>
        )}
        {errShow && (
          <div className="flex items-center gap-1 mt-0.5 px-1">
            <span className="text-[10px] text-app-error">{errShow}</span>
            {onRetry && (
              <button type="button" className="text-[10px] underline text-ds-primary" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={`w-full min-w-0 px-2 py-1.5 border rounded-ds-md bg-app-input border-app-input-border text-app-text tabular-nums focus:ring-2 focus:ring-ds-primary/35 ${spinnerRemovalClasses} ${alignClass} ${inputClassName}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit().then(() => onEnterDown?.());
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            void commit().then(() => onTabNext?.(e.shiftKey ? -1 : 1));
          }
        }}
      />
      {localError && (
        <p className="text-[10px] text-app-error mt-0.5 px-1" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
};

export default InlineEditableCell;
