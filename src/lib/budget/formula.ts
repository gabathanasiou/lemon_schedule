import type { BudgetGlobal } from '../../types';

/**
 * Safe arithmetic evaluator for budget formulas (`docs/BUDGETING.md` §4).
 * Grammar: numbers, `+ - * /`, parentheses, unary minus and global symbols.
 * No functions, no `eval`, no property access. Errors never throw — they come
 * back as `#REF!` (unknown symbol), `#DIV/0!`, `#VALUE!` (syntax) or `#CYCLE!`.
 */

export interface FormulaResult {
  value: number;
  error?: string;
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'sym'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lparen' }
  | { t: 'rparen' };

const SYMBOL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function tokenize(input: string): { tokens: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(') { tokens.push({ t: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ t: 'rparen' }); i++; continue; }
    if ('+-*/'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      let seenDot = false;
      while (j < input.length && /[0-9.]/.test(input[j])) {
        if (input[j] === '.') {
          if (seenDot) return { tokens: [], error: '#VALUE!' };
          seenDot = true;
        }
        j++;
      }
      const n = Number(input.slice(i, j));
      if (!Number.isFinite(n)) return { tokens: [], error: '#VALUE!' };
      tokens.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      tokens.push({ t: 'sym', v: input.slice(i, j) });
      i = j;
      continue;
    }
    return { tokens: [], error: '#VALUE!' };
  }
  return { tokens };
}

class Parser {
  private pos = 0;
  private error?: string;
  constructor(private tokens: Token[], private globals: Record<string, number>) {}

  parse(): FormulaResult {
    if (this.tokens.length === 0) return { value: 0, error: '#VALUE!' };
    const value = this.expr();
    if (this.error) return { value: 0, error: this.error };
    if (this.pos !== this.tokens.length) return { value: 0, error: '#VALUE!' };
    return { value };
  }

  private peek(): Token | undefined { return this.tokens[this.pos]; }

  private expr(): number {
    let left = this.term();
    while (!this.error) {
      const tok = this.peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '+' && tok.v !== '-')) break;
      this.pos++;
      const right = this.term();
      left = tok.v === '+' ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.unary();
    while (!this.error) {
      const tok = this.peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '*' && tok.v !== '/')) break;
      this.pos++;
      const right = this.unary();
      if (tok.v === '/') {
        if (right === 0) { this.error = '#DIV/0!'; return 0; }
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  private unary(): number {
    const tok = this.peek();
    if (tok && tok.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      this.pos++;
      const v = this.unary();
      return tok.v === '-' ? -v : v;
    }
    return this.primary();
  }

  private primary(): number {
    const tok = this.peek();
    if (!tok) { this.error = '#VALUE!'; return 0; }
    if (tok.t === 'num') { this.pos++; return tok.v; }
    if (tok.t === 'lparen') {
      this.pos++;
      const v = this.expr();
      const close = this.peek();
      if (!close || close.t !== 'rparen') { this.error = '#VALUE!'; return 0; }
      this.pos++;
      return v;
    }
    if (tok.t === 'sym') {
      this.pos++;
      const key = tok.v.toUpperCase();
      const v = this.globals[key] ?? this.globals[tok.v];
      if (v === undefined) { this.error = '#REF!'; return 0; }
      return v;
    }
    this.error = '#VALUE!';
    return 0;
  }
}

/** Evaluate one expression against a symbol table (symbol → number). */
export function evaluateFormula(expr: string | undefined, globals: Record<string, number> = {}): FormulaResult {
  const text = String(expr ?? '').trim();
  if (!text) return { value: 0 };
  const { tokens, error } = tokenize(text);
  if (error) return { value: 0, error };
  return new Parser(tokens, globals).parse();
}

/** Identifiers referenced by an expression (for autocomplete + where-used). */
export function formulaSymbols(expr: string | undefined): string[] {
  const { tokens } = tokenize(String(expr ?? ''));
  const out = new Set<string>();
  for (const t of tokens) if (t.t === 'sym') out.add(t.v);
  return [...out];
}

export interface GlobalEvaluation {
  values: Record<string, number>;
  errors: Record<string, string>;
}

/**
 * Resolve user globals topologically: a global may reference earlier or later
 * globals; cycles and unknowns become `#CYCLE!`/`#REF!`, never a crash.
 * System globals are supplied already-computed and are never re-evaluated.
 */
export function evaluateGlobals(defs: BudgetGlobal[], system: Record<string, number> = {}): GlobalEvaluation {
  const values: Record<string, number> = { ...system };
  const errors: Record<string, string> = {};
  const pending = defs.filter(d => d.symbol && !d.system);
  let progress = true;
  while (pending.length > 0 && progress) {
    progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const def = pending[i];
      const key = def.symbol.toUpperCase();
      if (def.formula && def.formula.trim()) {
        const result = evaluateFormula(def.formula, values);
        if (result.error === '#REF!') continue; // may resolve on a later pass
        if (result.error) {
          values[key] = 0;
          errors[key] = result.error;
        } else {
          values[key] = result.value;
        }
        pending.splice(i, 1);
        progress = true;
        continue;
      }
      values[key] = Number(def.value) || 0;
      pending.splice(i, 1);
      progress = true;
    }
  }
  for (const def of pending) {
    const key = def.symbol.toUpperCase();
    values[key] = 0;
    errors[key] = '#CYCLE!';
  }
  return { values, errors };
}

export function isValidFormulaSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol);
}
