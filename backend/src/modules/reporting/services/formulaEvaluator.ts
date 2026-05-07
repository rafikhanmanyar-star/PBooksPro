/** Braced placeholders reference row keys (`{paid_total}`). No code execution beyond parsed math/TIF/TRound. */

function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function interpolatesFieldRefs(expr: string, row: Record<string, unknown>): string {
  return expr.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_, key: string) => String(toNumber(row[key])));
}

function stripOuterParens(src: string): string {
  let s = src.trim();
  if (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0 && i < s.length - 1) return s;
      }
    }
    if (depth === 0) return s.slice(1, -1).trim();
  }
  return s;
}

function splitTopLevelArgs(inner: string, arity: 2 | 3): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(inner.slice(start).trim());
  if (arity === 2 && out.length !== 2) throw new Error('FORMULA_ARG_COUNT');
  if (arity === 3 && out.length !== 3) throw new Error('FORMULA_ARG_COUNT');
  return out;
}

function compareValues(a: number, op: string, b: number): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
    case '=':
    case '==':
      return a === b;
    case '!=':
    case '<>':
      return a !== b;
    default:
      throw new Error(`FORMULA_UNKNOWN_COMPARATOR:${op}`);
  }
}

function parseComparison(expr: string): boolean {
  const s = expr.trim();
  const two = s.match(/^(.+?)\s*(<=|>=|!=|<>|==|=|<|>)\s*(.+)$/);
  if (!two) throw new Error('FORMULA_BAD_CONDITION');
  const left = evalExpr(two[1]!.trim());
  const op = two[2]!;
  const right = evalExpr(two[3]!.trim());
  return compareValues(left, op, right);
}

function evalIf(expr: string): number {
  const t = expr.trim();
  if (!/^IF\s*\(/i.test(t)) throw new Error('FORMULA_IF_SYNTAX');
  const open = t.indexOf('(');
  const close = t.lastIndexOf(')');
  if (open === -1 || close <= open) throw new Error('FORMULA_IF_SYNTAX');
  const inner = t.slice(open + 1, close);
  const args = splitTopLevelArgs(inner, 3);
  const cond = parseComparison(args[0]!);
  return cond ? evalExpr(args[1]!) : evalExpr(args[2]!);
}

function evalRound(expr: string): number {
  const t = expr.trim();
  if (!/^ROUND\s*\(/i.test(t)) throw new Error('FORMULA_ROUND_SYNTAX');
  const open = t.indexOf('(');
  const close = t.lastIndexOf(')');
  if (open === -1 || close <= open) throw new Error('FORMULA_ROUND_SYNTAX');
  const inner = t.slice(open + 1, close);
  const args = splitTopLevelArgs(inner, 2);
  const val = evalExpr(args[0]!);
  const places = Math.trunc(evalExpr(args[1]!));
  const m = 10 ** Math.max(0, Math.min(12, places));
  return Math.round(val * m) / m;
}

function evalExpr(expr: string): number {
  const p = stripOuterParens(expr.trim());
  if (!p) return 0;
  if (/^IF\s*\(/i.test(p)) return evalIf(p);
  if (/^ROUND\s*\(/i.test(p)) return evalRound(p);
  return evalArithmetic(p);
}

function tokenizeArithmetic(src: string): string[] {
  const s = src.replace(/\s+/g, '');
  const toks: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if ('+-*/()'.includes(c)) {
      toks.push(c);
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i + 1;
      while (j < s.length && ((s[j]! >= '0' && s[j]! <= '9') || s[j] === '.')) j++;
      toks.push(s.slice(i, j));
      i = j;
      continue;
    }
    throw new Error(`FORMULA_UNEXPECTED_CHAR:${c}`);
  }
  return toks;
}

function precedence(op: string): number {
  if (op === '+' || op === '-') return 1;
  if (op === '*' || op === '/') return 2;
  return 0;
}

function applyOp(a: number, op: string, b: number): number {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') return b === 0 ? 0 : a / b;
  throw new Error(`FORMULA_BAD_OP:${op}`);
}

function evalArithmetic(expr: string): number {
  const raw = stripOuterParens(expr.trim());
  if (!raw) return 0;
  const toks = tokenizeArithmetic(raw);
  const values: number[] = [];
  const ops: string[] = [];
  const pushVal = (t: string) => {
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error('FORMULA_BAD_NUMBER');
    values.push(n);
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t === '(') {
      ops.push(t);
      continue;
    }
    if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        const op = ops.pop()!;
        const b = values.pop()!;
        const a = values.pop()!;
        values.push(applyOp(a, op, b));
      }
      ops.pop();
      continue;
    }
    if ('+-*/'.includes(t)) {
      while (ops.length && precedence(ops[ops.length - 1]!) >= precedence(t)) {
        const op = ops.pop()!;
        const b = values.pop()!;
        const a = values.pop()!;
        values.push(applyOp(a, op, b));
      }
      ops.push(t);
      continue;
    }
    pushVal(t);
  }
  while (ops.length) {
    const op = ops.pop()!;
    const b = values.pop()!;
    const a = values.pop()!;
    values.push(applyOp(a, op, b));
  }
  if (values.length !== 1) throw new Error('FORMULA_EVAL_STACK');
  return values[0]!;
}

export function evaluateNumericFormula(expression: string, row: Record<string, unknown>): number {
  const prepared = interpolatesFieldRefs(expression, row);
  return evalExpr(prepared);
}

/** Registry-defined `{a} - {b}` style; null-like values become 0 via interpolation. */
export function evaluateTemplateFormula(template: string, row: Record<string, unknown>): number {
  const s = interpolatesFieldRefs(template, row);
  return evalExpr(s);
}
