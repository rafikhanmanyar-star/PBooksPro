import React from 'react';
import type { MoneyFlow } from '../constants/quickCaptureTypes';

type Props = {
  value: MoneyFlow;
  onChange: (flow: MoneyFlow) => void;
  align?: 'center' | 'end';
};

export default function MoneyFlowToggle({ value, onChange, align = 'center' }: Props) {
  const isIn = value === 'in';

  const handleTrackClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    onChange(x < rect.width / 2 ? 'out' : 'in');
  };

  return (
    <div className={`qc-money-flow-toggle ${align === 'end' ? 'qc-money-flow-toggle--end' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={isIn}
        aria-label={isIn ? 'Money In — income' : 'Money Out — expense'}
        className="qc-money-flow-toggle__track touch-manipulation"
        data-flow={value}
        onClick={handleTrackClick}
      >
        <span className="qc-money-flow-toggle__side qc-money-flow-toggle__side--out" aria-hidden>
          <span className="qc-money-flow-toggle__glyph">↓</span>
        </span>
        <span className="qc-money-flow-toggle__side qc-money-flow-toggle__side--in" aria-hidden>
          <span className="qc-money-flow-toggle__glyph">↑</span>
        </span>
        <span className="qc-money-flow-toggle__thumb" aria-hidden>
          <span className="qc-money-flow-toggle__thumb-inner">
            <span className="qc-money-flow-toggle__thumb-dot" />
          </span>
        </span>
      </button>
      <div className="qc-money-flow-toggle__labels" aria-hidden>
        <span className={!isIn ? 'is-active is-out' : 'is-muted'}>Money Out</span>
        <span className={isIn ? 'is-active is-in' : 'is-muted'}>Money In</span>
      </div>
    </div>
  );
}
