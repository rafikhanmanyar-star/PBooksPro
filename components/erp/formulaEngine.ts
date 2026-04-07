/**
 * Safe formula engine for financial line items: only + - * / ( ) and identifiers.
 * No eval(), no Function(). Identifiers resolve from a numeric context.
 */

export type FormulaMap = Record<string, string>;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'lp' }
  | { t: 'rp' };

/** Collect distinct identifier names used in an expression (for dependency graph). */
export function extractIdentifiers(expr: string): string[] {
  const cleaned = expr.replace(/\s+/g, ' ');
  const seen = new Set<string>();
  const re = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    seen.add(m[0]);
  }
  return Array.from(seen);
}

function tokenize(expr: string): Tok[] {
  const s = expr.replace(/\s+/g, '');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '(') {
      out.push({ t: 'lp' });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ t: 'rp' });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      const n = parseFloat(s.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`Invalid number in formula near "${s.slice(i, j)}"`);
      out.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      out.push({ t: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Invalid character in formula: "${c}"`);
  }
  return out;
}

function getNum(ctx: Record<string, number>, id: string): number {
  const v = ctx[id];
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  return v;
}

class EvalParser {
  private pos = 0;

  constructor(
    private readonly tokens: Tok[],
    private readonly ctx: Record<string, number>
  ) {}

  parse(): number {
    const v = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new Error('Unexpected token in formula');
    }
    return v;
  }

  private peek(): Tok | undefined {
    return this.tokens[this.pos];
  }

  private parseExpr(): number {
    let v = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'op' || (t.v !== '+' && t.v !== '-')) break;
      this.pos++;
      const right = this.parseTerm();
      v = t.v === '+' ? v + right : v - right;
    }
    return v;
  }

  private parseTerm(): number {
    let v = this.parseFactor();
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'op' || (t.v !== '*' && t.v !== '/')) break;
      this.pos++;
      const right = this.parseFactor();
      if (t.v === '*') v = v * right;
      else {
        if (right === 0) v = 0;
        else v = v / right;
      }
    }
    return v;
  }

  private parseFactor(): number {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of formula');

    if (t.t === 'op' && t.v === '-') {
      this.pos++;
      return -this.parseFactor();
    }

    if (t.t === 'num') {
      this.pos++;
      return t.v;
    }

    if (t.t === 'id') {
      this.pos++;
      return getNum(this.ctx, t.v);
    }

    if (t.t === 'lp') {
      this.pos++;
      const inner = this.parseExpr();
      const cl = this.peek();
      if (!cl || cl.t !== 'rp') throw new Error('Expected ")"');
      this.pos++;
      return inner;
    }

    throw new Error('Invalid expression');
  }
}

/** Evaluate a single expression against numeric context. */
export function evaluateExpression(expr: string, ctx: Record<string, number>): number {
  if (!expr || !expr.trim()) return 0;
  const tokens = tokenize(expr);
  const p = new EvalParser(tokens, ctx);
  const v = p.parse();
  return Number.isFinite(v) ? v : 0;
}

/** Topological order of formula keys (dependencies first). Throws on cycle. */
export function sortFormulasTopological(formulas: FormulaMap): string[] {
  const keys = Object.keys(formulas);
  const keySet = new Set(keys);
  const deps = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  for (const k of keys) {
    deps.set(k, new Set());
    reverse.set(k, new Set());
  }

  for (const k of keys) {
    for (const id of extractIdentifiers(formulas[k])) {
      if (keySet.has(id) && id !== k) {
        deps.get(k)!.add(id);
        reverse.get(id)!.add(k);
      }
    }
  }

  const indegree = new Map<string, number>();
  for (const k of keys) indegree.set(k, deps.get(k)!.size);

  const queue: string[] = keys.filter((k) => indegree.get(k)! === 0);
  const out: string[] = [];

  while (queue.length) {
    const d = queue.shift()!;
    out.push(d);
    for (const k of reverse.get(d) || []) {
      const next = indegree.get(k)! - 1;
      indegree.set(k, next);
      if (next === 0) queue.push(k);
    }
  }

  if (out.length !== keys.length) {
    throw new Error('Circular dependency in formulas');
  }
  return out;
}

/**
 * Apply all formulas in dependency order. Input `base` should contain user-editable fields;
 * computed keys from `formulas` are written into the result (overwriting same keys in base).
 */
export function computeFormulas(formulas: FormulaMap, base: Record<string, number>): Record<string, number> {
  const order = sortFormulasTopological(formulas);
  const out: Record<string, number> = { ...base };
  for (const key of order) {
    out[key] = evaluateExpression(formulas[key], out);
  }
  return out;
}
