/**
 * Invite-target classification (roadmap 254): the sharing picker commits one
 * string per interaction — a suggestion's account id (a pick, or Enter on a
 * highlighted row) or free-typed text (Enter/blur on the field). This is the
 * ONE place that decides what that commit means:
 *   - a known suggestion → invite by account id (the server resolves nothing);
 *   - a well-formed email → the email invite (people without an account yet,
 *     incl. the picker's synthetic "Add …" row);
 *   - anything else (a half-typed name, empty text) → nothing, silently.
 * Pure, so the routing is unit-tested instead of smoked in the modal.
 */

export type InviteTarget =
  | { kind: 'member'; userId: string }
  | { kind: 'email'; email: string };

/** The same acceptance the server applies to an address (single @, a dot in
 *  the domain) — keep in step with `invite_collaborator`'s check. */
const EMAIL_RE = /.+@.+\..+/;

export function classifyInviteTarget(
  value: string,
  suggestions: { userId: string; email?: string | null }[],
): InviteTarget | null {
  const v = value.trim();
  if (!v) return null;
  const member = suggestions.find(s => s.userId === v);
  if (member) return { kind: 'member', userId: member.userId };
  if (EMAIL_RE.test(v)) return { kind: 'email', email: v };
  return null;
}
