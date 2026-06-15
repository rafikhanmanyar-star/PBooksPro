import { UNPOSTED_TRANSACTION_TYPES } from '../../../types/executiveMobile.types';

export type ParsedVoiceCapture = {
  transactionType: string;
  amount: number;
  partyName?: string;
  description?: string;
  projectId?: string;
  costCenterCode?: string;
  rawTranscript: string;
  confidence: 'high' | 'partial';
};

const TYPE_KEYWORDS: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'fuel_expense', patterns: [/\bfuel\b/i, /\bpetrol\b/i, /\bdiesel\b/i] },
  { id: 'office_expense', patterns: [/\boffice\b/i] },
  { id: 'site_expense', patterns: [/\bsite\b/i] },
  { id: 'travel_expense', patterns: [/\btravel\b/i, /\btaxi\b/i, /\bflight\b/i] },
  {
    id: 'material_purchase',
    patterns: [/\bmaterial\b/i, /\bcement\b/i, /\bsteel\b/i, /\bbricks?\b/i],
  },
  {
    id: 'supplier_payment',
    patterns: [/\bvendor\b/i, /\bsupplier\b/i, /\bpaid\s+to\b/i, /\bpayment\s+to\b/i],
  },
  {
    id: 'employee_payment',
    patterns: [/\bworker\b/i, /\bwages?\b/i, /\blabou?r\b/i, /\bemployee\b/i, /\bcontractor\b/i],
  },
  { id: 'advance_payment', patterns: [/\badvance\b/i] },
  { id: 'cash_withdrawal', patterns: [/\bwithdraw/i, /\bcash\s+out\b/i] },
  {
    id: 'customer_collection',
    patterns: [/\bcollection\b/i, /\breceived\s+from\b/i, /\bcustomer\s+paid\b/i],
  },
  { id: 'cash_deposit', patterns: [/\bdeposit\b/i, /\bcash\s+in\b/i] },
  { id: 'other', patterns: [/\bother\b/i, /\bmisc\b/i] },
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

function detectTransactionType(text: string): string {
  const lower = text.toLowerCase();
  for (const entry of TYPE_KEYWORDS) {
    if (entry.patterns.some((p) => p.test(lower))) return entry.id;
  }
  if (/\bpaid\b/i.test(text) || /\bpayment\b/i.test(text)) return 'supplier_payment';
  if (/\breceived\b/i.test(text) || /\bcollect/i.test(text)) return 'customer_collection';
  return 'other';
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

function extractCostCenter(text: string): string | undefined {
  const m = text.match(/\bcost\s*center[:\s]+(\S+)/i);
  return m?.[1]?.trim();
}

/** Parse spoken quick-capture phrase into the same fields as the manual wizard. */
export function parseVoiceQuickCapture(transcript: string): ParsedVoiceCapture | null {
  const rawTranscript = transcript.trim();
  if (!rawTranscript) return null;

  const amount = extractAmount(rawTranscript);
  if (!amount || amount <= 0) return null;

  const transactionType = detectTransactionType(rawTranscript);
  const partyName = extractParty(rawTranscript);
  const projectId = extractProject(rawTranscript);
  const costCenterCode = extractCostCenter(rawTranscript);

  const validType = UNPOSTED_TRANSACTION_TYPES.some((t) => t.id === transactionType);
  const confidence: ParsedVoiceCapture['confidence'] =
    validType && amount > 0 && (partyName || projectId || /\b(fuel|office|site|vendor|collection)\b/i.test(rawTranscript))
      ? 'high'
      : 'partial';

  return {
    transactionType: validType ? transactionType : 'other',
    amount,
    partyName,
    projectId,
    costCenterCode,
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
