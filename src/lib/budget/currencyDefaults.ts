import type { BudgetSettings } from '../../types';
import { getBrowserTimeZone } from '../timezones';
import { DEFAULT_BUDGET_CURRENCIES, DEFAULT_BUDGET_SETTINGS, currencySymbolFor } from './model';

/**
 * Item 354 — a NEW budget opens in the currency its project's timezone implies
 * (Europe/Athens → EUR, America/Toronto → CAD …). Existing budgets are never
 * migrated: the Library's Base currency picker remains the explicit override.
 *
 * The map is deliberately small and deterministic (no Intl region guessing —
 * a timezone does not carry a country): exact zones where the currency is not
 * the continent default, then a continent prefix, then USD.
 */
const EXACT: Record<string, string> = {
  // Europe — the non-EUR zones
  'Europe/London': 'GBP',
  'Europe/Zurich': 'CHF',
  'Europe/Stockholm': 'SEK',
  'Europe/Oslo': 'NOK',
  'Europe/Copenhagen': 'DKK',
  'Europe/Warsaw': 'PLN',
  'Europe/Prague': 'CZK',
  'Europe/Budapest': 'HUF',
  'Europe/Bucharest': 'RON',
  'Europe/Istanbul': 'TRY',
  'Europe/Kyiv': 'UAH',
  'Europe/Kiev': 'UAH',
  'Europe/Belgrade': 'RSD',
  'Europe/Moscow': 'RUB',
  // Americas
  'America/Toronto': 'CAD',
  'America/Vancouver': 'CAD',
  'America/Edmonton': 'CAD',
  'America/Winnipeg': 'CAD',
  'America/Halifax': 'CAD',
  'America/St_Johns': 'CAD',
  'America/Mexico_City': 'MXN',
  'America/Tijuana': 'MXN',
  'America/Monterrey': 'MXN',
  'America/Sao_Paulo': 'BRL',
  'America/Rio_Branco': 'BRL',
  'America/Argentina/Buenos_Aires': 'ARS',
  'America/Bogota': 'COP',
  'America/Lima': 'PEN',
  'America/Santiago': 'CLP',
  // Asia / Middle East
  'Asia/Tokyo': 'JPY',
  'Asia/Shanghai': 'CNY',
  'Asia/Chongqing': 'CNY',
  'Asia/Hong_Kong': 'HKD',
  'Asia/Singapore': 'SGD',
  'Asia/Seoul': 'KRW',
  'Asia/Kolkata': 'INR',
  'Asia/Calcutta': 'INR',
  'Asia/Bangkok': 'THB',
  'Asia/Kuala_Lumpur': 'MYR',
  'Asia/Jakarta': 'IDR',
  'Asia/Makassar': 'IDR',
  'Asia/Manila': 'PHP',
  'Asia/Taipei': 'TWD',
  'Asia/Dubai': 'AED',
  'Asia/Riyadh': 'SAR',
  'Asia/Jerusalem': 'ILS',
  'Asia/Tel_Aviv': 'ILS',
  // Africa / Oceania
  'Africa/Johannesburg': 'ZAR',
  'Pacific/Auckland': 'NZD',
};

/** Continent defaults, applied after the exact zones. */
const PREFIXES: { prefix: string; code: string }[] = [
  { prefix: 'Europe/', code: 'EUR' },
  { prefix: 'Australia/', code: 'AUD' },
  { prefix: 'America/', code: 'USD' },
];

/** ISO currency code implied by an IANA timezone (fallback USD). */
export function currencyForTimeZone(timeZone?: string): string {
  const tz = (timeZone || '').trim();
  if (!tz) return DEFAULT_BUDGET_SETTINGS.currency;
  const exact = EXACT[tz];
  if (exact) return exact;
  const prefix = PREFIXES.find(rule => tz.startsWith(rule.prefix));
  return prefix?.code || DEFAULT_BUDGET_SETTINGS.currency;
}

/** Complete settings for a budget created in `timeZone` (currency + derived symbol). */
export function defaultBudgetSettingsForTimeZone(timeZone?: string): BudgetSettings {
  const code = currencyForTimeZone(timeZone);
  return {
    ...DEFAULT_BUDGET_SETTINGS,
    currency: code,
    currencySymbol: currencySymbolFor(code, DEFAULT_BUDGET_CURRENCIES),
  };
}

/** A project's creation-time settings; the browser zone is the fallback. */
export function defaultBudgetSettingsForProject(project?: { productionInfo?: { timezone?: string } } | null): BudgetSettings {
  return defaultBudgetSettingsForTimeZone(project?.productionInfo?.timezone || getBrowserTimeZone());
}
