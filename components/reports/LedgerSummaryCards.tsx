import React from 'react';

export interface LedgerSummaryCardItem {
    label: string;
    value: string;
    tone?: 'in' | 'out' | 'neutral';
}

interface LedgerSummaryCardsProps {
    show: boolean;
    cards: LedgerSummaryCardItem[];
}

/** Compact summary row for rental ledger reports (screen only; hidden when printing). */
const LedgerSummaryCards: React.FC<LedgerSummaryCardsProps> = ({ show, cards }) => {
    if (!show || cards.length === 0) return null;

    return (
        <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 pb-3 no-print"
            role="region"
            aria-label="Ledger summary"
        >
            {cards.map((c) => (
                <div
                    key={c.label}
                    className="rounded-lg border border-app-border bg-app-toolbar/30 dark:bg-app-toolbar/20 px-4 py-3 shadow-sm"
                >
                    <p className="text-xs font-semibold text-app-muted uppercase tracking-wide">{c.label}</p>
                    <p
                        className={`text-lg font-bold tabular-nums mt-1.5 ${
                            c.tone === 'in'
                                ? 'text-success'
                                : c.tone === 'out'
                                  ? 'text-danger'
                                  : 'text-app-text'
                        }`}
                    >
                        {c.value}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default LedgerSummaryCards;
