import type { BudgetSettings, MoneyCents } from '../../types';
import { DEFAULT_BUDGET_SETTINGS } from './model';

/**
 * Money/percent formatting — the ONE place cents become display strings.
 * Deterministic (no locale-dependent Intl): comma-grouped whole units and
 * `settings.decimals` fractional digits, currency symbol prefix, negatives
 * per `settings.negativeStyle`.
 */

export interface MoneyFormatOptions {
  decimals?: 0 | 2;
  symbol?: string;
  negativeStyle?: 'minus' | 'parentheses';
  /** v0.2.14 item 354 — show the ISO code beside the symbol (`€ (EUR) 1,200`)
   *  when the cell has room. Off by default. */
  showCode?: boolean;
  /** Currency code for `showCode` (defaults to `settings.currency`). */
  code?: string;
}

function optionsOf(settings?: Partial<BudgetSettings> | null): Required<MoneyFormatOptions> {
  return {
    decimals: settings?.decimals ?? DEFAULT_BUDGET_SETTINGS.decimals ?? 0,
    symbol: settings?.currencySymbol ?? DEFAULT_BUDGET_SETTINGS.currencySymbol ?? '$',
    negativeStyle: settings?.negativeStyle ?? 'minus',
    showCode: false,
    code: settings?.currency ?? DEFAULT_BUDGET_SETTINGS.currency,
  };
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(cents: MoneyCents | null | undefined, settings?: Partial<BudgetSettings> | null, opts?: MoneyFormatOptions): string {
  const { decimals, symbol, negativeStyle, showCode, code } = { ...optionsOf(settings), ...opts };
  const value = Number.isFinite(Number(cents)) ? Math.round(Number(cents)) : 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100).toString();
  const frac = abs % 100;
  const body = decimals === 2
    ? `${groupThousands(whole)}.${String(frac).padStart(2, '0')}`
    : groupThousands(String(Math.round(abs / 100)));
  const prefix = showCode && code ? `${symbol} (${code}) ` : symbol;
  const text = `${prefix}${body}`;
  if (value < 0) return negativeStyle === 'parentheses' ? `(${text})` : `-${text}`;
  return text;
}

/** Parse a typed money string into integer cents. Accepts `$1,200.50`,
 *  `(300)` (negative), `-300`, blank = 0. Rounds half-up at the cent. */
export function parseMoney(input: string | number | null | undefined): MoneyCents {
  if (typeof input === 'number') return Math.round(input);
  const raw = String(input ?? '').trim();
  if (!raw) return 0;
  const negativeParen = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[()$€£,\s]/g, '');
  if (!cleaned || cleaned === '-') return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  const cents = Math.round(Math.abs(value) * 100);
  return (value < 0 || negativeParen) ? -cents : cents;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  const fixed = digits > 0 ? n.toFixed(digits) : String(Math.round(n));
  return `${fixed}%`;
}

/** Currency symbol lookup for a per-line currency code (falls back to code). */
export function currencySymbolOf(code: string | undefined, currencies: { code: string; symbol?: string }[], fallback?: string): string {
  if (!code) return fallback || '$';
  const hit = currencies.find(c => c.code === code);
  return hit?.symbol || code;
}
