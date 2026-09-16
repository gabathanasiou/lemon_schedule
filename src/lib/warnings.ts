/**
 * Shared 24-hour warning suppression (same window the kit Dialog's
 * `suppressKey` uses). Keyed by a localStorage string per warning.
 */
const DAY_MS = 86_400_000;

export function isWarningSuppressed(key: string): boolean {
  try {
    const until = Number(localStorage.getItem(key));
    return Number.isFinite(until) && until > 0 && Date.now() < until;
  } catch {
    return false;
  }
}

export function suppressWarningFor24h(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now() + DAY_MS));
  } catch {
    // storage unavailable — the warning simply shows again next time
  }
}
