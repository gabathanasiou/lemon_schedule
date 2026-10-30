import type { BudgetCurrency } from '../../types';

/**
 * Manual FX rate sync (roadmap 341). Frankfurter is the key-free, CORS-friendly
 * ECB feed: `GET /v1/latest?from=<BASE>` returns X per 1 BASE. `rateToBase`
 * stores base units per 1 X, so it is the reciprocal. NO key/token ever lands in
 * project state; a failure leaves every rate untouched. The old `.app` host
 * 301-redirects to `.dev` — a redirect is a new origin and the CSP blocked it,
 * so use the canonical `.dev/v1` endpoint directly.
 */
export const RATES_PROVIDER_ORIGIN = 'https://api.frankfurter.dev';

export interface RateSyncResult {
  /** Currency code → units of that currency per 1 base unit. */
  rates: Record<string, number>;
  base: string;
  /** The provider's rate date (ISO yyyy-mm-dd). */
  date: string;
}

export interface FetchRatesOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Fetch the daily rates against `base`. Throws with a user-readable message. */
export async function fetchDailyRates(base: string, options: FetchRatesOptions = {}): Promise<RateSyncResult> {
  const code = (base || 'USD').toUpperCase();
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  let res: Response;
  try {
    res = await fetchImpl(`${RATES_PROVIDER_ORIGIN}/v1/latest?from=${encodeURIComponent(code)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    throw new Error(err instanceof Error && err.name === 'AbortError'
      ? 'The rates request timed out. Check the connection and try again.'
      : 'Could not reach the rates service. Check the connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Daily rates are not published for ${code}. Enter its rate by hand.`);
    throw new Error(`The rates service answered ${res.status}. Rates were left unchanged.`);
  }
  const body = await res.json() as { base?: string; date?: string; rates?: Record<string, unknown> };
  if (!body || typeof body !== 'object' || !body.rates || typeof body.rates !== 'object') {
    throw new Error('The rates service returned an unexpected response. Rates were left unchanged.');
  }
  const rates: Record<string, number> = {};
  for (const [key, value] of Object.entries(body.rates)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) rates[key.toUpperCase()] = value;
  }
  if (Object.keys(rates).length === 0) throw new Error('The rates service returned no usable rates.');
  return { rates, base: (body.base || code).toUpperCase(), date: String(body.date || '') };
}

/** Apply a fetched rate table to the library: base = 1, covered codes get the
 *  reciprocal, everything else (and hand-added currencies) keeps its value. */
export function applyRatesToCurrencies(
  currencies: BudgetCurrency[],
  base: string,
  rates: Record<string, number>,
): BudgetCurrency[] {
  const code = (base || 'USD').toUpperCase();
  return currencies.map(currency => {
    if (currency.code.toUpperCase() === code) return { ...currency, rateToBase: 1 };
    const perBase = rates[currency.code.toUpperCase()];
    if (!Number.isFinite(perBase) || (perBase as number) <= 0) return currency;
    // Six decimals keeps cent-level conversions stable without float noise.
    return { ...currency, rateToBase: Math.round((1 / (perBase as number)) * 1e6) / 1e6 };
  });
}

/** Human stamp for the Library card ("2026-10-30 16:42"). */
export function formatRatesSyncedAt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
