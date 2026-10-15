/**
 * Room tokens (S4) — issued by a Supabase Edge Function, verified by the room
 * worker (`workers/rooms`). The shared `ROOM_TOKEN_SECRET` never leaves either
 * server-side secret store.
 *
 * Format: `v1.<base64url(payload)>.<base64url(HMAC-SHA256(secret, "v1.<payload>"))>`
 * payload = `{ p: projectId, u: userId, r: role, exp: unixSeconds }`.
 *
 * Dev tokens: the LOCAL worker (`DEV_AUTH=1` in `.dev.vars`, never deployed)
 * accepts `dev:<userId>:<role>` so `wrangler dev` needs no secret at all.
 *
 * WebCrypto only — runs in the worker, the edge function, the browser and Node.
 */
// Explicit `.ts` extension: this module is shared with the Deno-bundled Supabase
// Edge Function (`supabase/functions/room-token` — roadmap 229), whose remote
// bundler resolves with Deno semantics and rejects extensionless specifiers.
// Vite / esbuild / tsx all accept the extension too (noEmit programs).
import { ROOM_ROLES, type RoomRole } from './protocol.ts';

export interface RoomTokenClaims {
  projectId: string;
  userId: string;
  role: RoomRole;
}

export interface VerifiedRoomToken {
  userId: string;
  role: RoomRole;
}

const TOKEN_VERSION = 'v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function sign(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function isRoomRole(v: unknown): v is RoomRole {
  return typeof v === 'string' && (ROOM_ROLES as readonly string[]).includes(v);
}

export async function mintRoomToken(
  secret: string,
  claims: RoomTokenClaims,
  ttlSeconds = 3600
): Promise<string> {
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        p: claims.projectId,
        u: claims.userId,
        r: claims.role,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      })
    )
  );
  const sig = bytesToBase64Url(await sign(secret, `${TOKEN_VERSION}.${payload}`));
  return `${TOKEN_VERSION}.${payload}.${sig}`;
}

/** Verify a token against ONE room. Returns the identity, or null for anything invalid. */
export async function verifyRoomToken(
  secret: string,
  token: string,
  projectId: string
): Promise<VerifiedRoomToken | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const [, payload, sig] = parts;
  const givenSig = base64UrlToBytes(sig);
  if (!givenSig) return null;
  const expectedSig = await sign(secret, `${TOKEN_VERSION}.${payload}`);
  if (!constantTimeEqual(givenSig, expectedSig)) return null;
  const payloadBytes = base64UrlToBytes(payload);
  if (!payloadBytes) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return null;
  }
  if (typeof claims !== 'object' || claims === null) return null;
  const c = claims as Record<string, unknown>;
  if (c.p !== projectId) return null;
  if (typeof c.u !== 'string' || c.u.length === 0) return null;
  if (!isRoomRole(c.r)) return null;
  if (typeof c.exp !== 'number' || c.exp <= Math.floor(Date.now() / 1000)) return null;
  return { userId: c.u, role: c.r };
}

/** `dev:<userId>:<role>` — only meaningful when the local worker runs with DEV_AUTH=1. */
export function parseDevToken(token: string): VerifiedRoomToken | null {
  const match = /^dev:([^:]+):(owner|editor|viewer)$/.exec(token);
  if (!match) return null;
  return { userId: match[1], role: match[2] as RoomRole };
}
