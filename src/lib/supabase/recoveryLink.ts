/**
 * Password-recovery link outcomes (roadmap 278, audit F6). GoTrue redirects a
 * dead link back to the app with its error in the URL — hash params for the
 * implicit flow (`#error=access_denied&error_code=otp_expired&…`), query
 * params for PKCE. supabase-js throws on them inside `initialize()`'s promise
 * where nobody listens, so the app used to land silently. ONE parser + ONE
 * strip helper for both shapes.
 */

export interface RecoveryLinkError {
  /** Raw GoTrue code (`otp_expired`, `access_denied`, …); '' when absent. */
  code: string;
  /** Human copy for the recovery modal. */
  message: string;
}

const FRIENDLY: Record<string, string> = {
  otp_expired: 'That reset link has expired or has already been used.',
  access_denied: 'That reset link is no longer valid.',
};

const AUTH_PARAMS = ['error', 'error_code', 'error_description'] as const;

/** Parse the recovery error out of a redirect URL — null when the URL is not
 *  an auth-error redirect. Hash first, then query (GoTrue uses one of the two
 *  depending on flow). */
export function parseRecoveryLinkError(href: string): RecoveryLinkError | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const param = (key: string) => hash.get(key) ?? url.searchParams.get(key);
  const error = param('error');
  const code = param('error_code') || error || '';
  const description = param('error_description')?.trim() ?? '';
  if (!error && !code && !description) return null;
  return {
    code,
    message: FRIENDLY[code] || description || 'That reset link is no longer valid.',
  };
}

/** Strip the auth-error params (both shapes) so a reload does not re-show the
 *  modal and the address bar carries no provider internals. Hash places
 *  without auth params (the app's own `#/…` navigation) stay untouched. */
export function stripRecoveryLinkParams(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  let changed = false;
  for (const key of AUTH_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (AUTH_PARAMS.some(key => hash.has(key))) {
    for (const key of AUTH_PARAMS) hash.delete(key);
    url.hash = hash.toString();
    changed = true;
  }
  return changed ? url.toString() : href;
}
