import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Input from '../ui/Input';
import {
  DEFAULT_MAX_AMOUNT,
  formatAmountForInput,
  processAmountInputChange,
  valueToRawString,
  type SanitizeAmountInputOptions,
} from '../../utils/numberFormatting';

export interface AmountInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange' | 'inputMode'
  > {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (numericValue: number | null, rawValue: string) => void;
  label?: string;
  helperText?: string;
  error?: string;
  enableSpellCheck?: boolean;
  icon?: React.ReactNode;
  horizontal?: boolean;
  compact?: boolean;
  decimalPlaces?: number;
  allowNegative?: boolean;
  max?: number;
  currency?: string;
  showCurrency?: boolean;
}

const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  (
    {
      value,
      onChange,
      onValueChange,
      label,
      helperText,
      error,
      decimalPlaces = 2,
      allowNegative = false,
      max = DEFAULT_MAX_AMOUNT,
      currency,
      showCurrency = false,
      onFocus,
      onBlur,
      onWheel,
      className,
      ...rest
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const isFocusedRef = useRef(false);
    const [displayValue, setDisplayValue] = useState('');

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const sanitizeOptions: SanitizeAmountInputOptions = {
      allowNegative,
      decimalPlaces,
      max,
    };

    const syncDisplayFromValue = useCallback(
      (externalValue: string | number) => {
        const raw = valueToRawString(externalValue);
        setDisplayValue(formatAmountForInput(raw, { decimalPlaces }));
      },
      [decimalPlaces]
    );

    useEffect(() => {
      if (!isFocusedRef.current) {
        syncDisplayFromValue(value);
      }
    }, [value, syncDisplayFromValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const cursorPos = input.selectionStart ?? input.value.length;
      const result = processAmountInputChange(input.value, cursorPos, {
        ...sanitizeOptions,
        decimalPlaces,
      });

      setDisplayValue(result.displayValue);

      const syntheticTarget = {
        ...input,
        value: result.rawValue,
      } as HTMLInputElement;

      onChange({
        ...e,
        target: syntheticTarget,
        currentTarget: syntheticTarget,
      });
      onValueChange?.(result.numericValue, result.rawValue);

      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el && document.activeElement === el) {
          el.setSelectionRange(result.cursorPosition, result.cursorPosition);
        }
      });
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = true;
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = false;
      syncDisplayFromValue(valueToRawString(value));
      onBlur?.(e);
    };

    const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
      e.currentTarget.blur();
      onWheel?.(e);
    };

    const inputElement = (
      <Input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        label={undefined}
        helperText={undefined}
        error={undefined}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onWheel={handleWheel}
        enableSpellCheck={false}
        className={`${className ?? ''} tabular-nums`.trim()}
        aria-label={rest['aria-label'] ?? (label ? undefined : 'Amount')}
      />
    );

    const wrappedInput =
      showCurrency && currency ? (
        <div className="relative flex w-full rounded-ds-md border border-app-input-border bg-app-input shadow-ds-card focus-within:border-ds-primary focus-within:ring-2 focus-within:ring-ds-primary/35">
          <span className="inline-flex shrink-0 items-center border-r border-app-input-border bg-app-toolbar px-ds-md text-ds-small font-semibold text-app-muted">
            {currency}
          </span>
          <div className="min-w-0 flex-1 [&_input]:border-0 [&_input]:shadow-none [&_input]:focus:ring-0">
            {inputElement}
          </div>
        </div>
      ) : (
        inputElement
      );

    if (!label && !helperText && !error) {
      return wrappedInput;
    }

    return (
      <div>
        {label ? (
          <label
            htmlFor={rest.id}
            className="mb-ds-sm block text-ds-body font-medium text-app-text"
          >
            {label}
          </label>
        ) : null}
        {wrappedInput}
        {error ? (
          <p className="mt-ds-xs text-ds-small text-app-error" role="alert">
            {error}
          </p>
        ) : helperText ? (
          <p className="mt-ds-xs text-ds-small text-app-muted">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

AmountInput.displayName = 'AmountInput';

export default AmountInput;
