/**
 * Share-link tokens (roadmap 229 S2, docs/COLLABORATION.md §6).
 *
 * The raw token lives only in the link (and the sharer's clipboard); the
 * database stores its sha256 hex (`share_links.token_hash`) — the app hashes
 * client-side with WebCrypto, so the raw token never leaves the browser.
 * Pure helpers: unit-tested in `__tests__/shareTokens.test.ts`.
 */

/** A visitor URL: `…/#/share/<token>` (hash route — appNav ignores unknown paths). */
const SHARE_HASH_RE = /^#\/share\/([A-Za-z0-9_-]{16,128})\/?$/;

/** 32 random bytes, base64url — the capability in the invite link. */
export function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** sha256 hex of the token — what the redeem RPC and `share_links` see. */
export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** The full invite URL for a raw token. */
export function shareLinkUrl(token: string, origin: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${origin}${base}#/share/${token}`;
}

/** `#/share/<token>` from a location hash, or null (ignores other hashes). */
export function parseShareTokenFromHash(hash: string): string | null {
  const m = SHARE_HASH_RE.exec(hash);
  return m ? m[1] : null;
}
