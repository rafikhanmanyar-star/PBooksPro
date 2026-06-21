import type { CoreCaptureKind, MoneyFlow } from '../constants/quickCaptureTypes';

export type ParsedVoiceCapture = {
  captureTypeId?: string;
  captureKind: CoreCaptureKind;
  moneyFlow: MoneyFlow;
  amount: number;
  partyName?: string;
  description?: string;
  projectId?: string;
  rawTranscript: string;
  confidence: 'high' | 'partial';
};

const OUTFLOW_KEYWORDS: Array<{ kind: CoreCaptureKind; patterns: RegExp[] }> = [
  {
    kind: 'suppliers',
    patterns: [/\bvendor\b/i, /\bsupplier\b/i, /\bpaid\s+to\b/i, /\bpayment\s+to\b/i, /\bmaterial\b/i],
  },
  {
    kind: 'staff',
    patterns: [/\bworker\b/i, /\bwages?\b/i, /\blabou?r\b/i, /\bemployee\b/i, /\bstaff\b/i, /\bcontractor\b/i],
  },
  { kind: 'site', patterns: [/\bsite\b/i, /\boffice\b/i, /\bfuel\b/i, /\bpetrol\b/i] },
  { kind: 'misc', patterns: [/\bother\b/i, /\bmisc\b/i, /\btravel\b/i, /\badvance\b/i] },
];

const INFLOW_KEYWORDS: Array<{ kind: CoreCaptureKind; patterns: RegExp[] }> = [
  {
    kind: 'customer_collection',
    patterns: [/\bcustomer\b/i, /\bcollection\b/i, /\breceived\s+from\b/i, /\binstallment\b/i],
  },
  { kind: 'cash_deposit', patterns: [/\bdeposit\b/i, /\bcash\s+in\b/i, /\bbank\s+deposit\b/i] },
];

function extractAmount(text: string): number | null {
  const normalized = text.replace(/,/g, ' ');

  const kMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);

  const thousandMatch = normalized.match(/(\d+(?:\.\d+)?)\s*thousand\b/i);
  if (thousandMatch) return Math.round(parseFloat(thousandMatch[1]) * 1000);

  const currencyFirst = normalized.match(/(?:pkr|rs\.?|rupees?)\s*(\d+(?:\.\d+)?)/i);
  if (currencyFirst) return Math.round(parseFloat(currencyFirst[1]));

  const currencyAfter = normalized.match(/(\d+(?:\.\d+)?)\s*(?:pkr|rs\.?|rupees?)/i);
  if (currencyAfter) return Math.round(parseFloat(currencyAfter[1]));

  const paidMatch = normalized.match(/(?:paid|pay|payment|spent|expense|collected?)\s*(\d{3,9})/i);
  if (paidMatch) return Math.round(parseFloat(paidMatch[1]));

  const anyNumber = normalized.match(/\b(\d{3,9})\b/);
  if (anyNumber) return Math.round(parseFloat(anyNumber[1]));

  return null;
}

function detectMoneyFlow(text: string): MoneyFlow {
  const lower = text.toLowerCase();
  if (/\b(received|collection|collected|deposit|cash\s+in|customer\s+paid)\b/i.test(lower)) {
    return 'in';
  }
  if (/\b(paid|payment|spent|expense|withdraw)\b/i.test(lower)) return 'out';
  return 'out';
}

function detectCaptureKind(text: string, moneyFlow: MoneyFlow): CoreCaptureKind {
  const keywords = moneyFlow === 'in' ? INFLOW_KEYWORDS : OUTFLOW_KEYWORDS;
  const lower = text.toLowerCase();
  for (const entry of keywords) {
    if (entry.patterns.some((p) => p.test(lower))) return entry.kind;
  }
  if (moneyFlow === 'in') return 'cash_deposit';
  if (/\bpaid\b/i.test(text) || /\bpayment\b/i.test(text)) return 'suppliers';
  return 'misc';
}

function extractParty(text: string): string | undefined {
  const patterns = [
    /\bat\s+(.+?)(?:\s+for\s+project|\s+project\s+|$)/i,
    /\bto\s+(.+?)(?:\s+for\s+project|\s+project\s+|$)/i,
    /\bfrom\s+(.+?)(?:\s+for\s+project|\s+project\s+|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const party = m[1].trim().replace(/\s+/g, ' ');
      if (party.length >= 2 && party.length <= 120) return party;
    }
  }
  return undefined;
}

function extractProject(text: string): string | undefined {
  const m = text.match(/\bproject[:\s]+(.+?)(?:\s+at\s+|\s*$)/i);
  if (m?.[1]) return m[1].trim().slice(0, 120);
  return undefined;
}

/** Parse spoken quick-capture phrase into wizard fields. */
export function parseVoiceQuickCapture(transcript: string): ParsedVoiceCapture | null {
  const rawTranscript = transcript.trim();
  if (!rawTranscript) return null;

  const amount = extractAmount(rawTranscript);
  if (!amount || amount <= 0) return null;

  const moneyFlow = detectMoneyFlow(rawTranscript);
  const captureKind = detectCaptureKind(rawTranscript, moneyFlow);
  const partyName = extractParty(rawTranscript);
  const projectId = extractProject(rawTranscript);

  const confidence: ParsedVoiceCapture['confidence'] =
    amount > 0 && (partyName || projectId || /\b(vendor|staff|site|supplier|customer|collection)\b/i.test(rawTranscript))
      ? 'high'
      : 'partial';

  return {
    moneyFlow,
    captureKind,
    captureTypeId: captureKind,
    amount,
    partyName,
    projectId,
    description: rawTranscript,
    rawTranscript,
    confidence,
  };
}

export function voiceDescriptionForFinance(rawTranscript: string, extra?: string): string {
  const base = `[Voice capture] ${rawTranscript.trim()}`;
  if (extra?.trim()) return `${base} — ${extra.trim()}`;
  return base;
}
