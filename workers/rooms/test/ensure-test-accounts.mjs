/**
 * Ensure the reusable ROBOT Supabase accounts exist and are recorded in the
 * gitignored `.env` — run this if `.env` is lost or the credentials stop
 * working (the two-window harness reads them; see its header).
 *
 *   node workers/rooms/test/ensure-test-accounts.mjs
 *
 * Idempotent, and it never prints a password:
 *   - credentials present + sign-in OK  → reports and exits (no writes)
 *   - credentials present + user gone   → re-creates with the SAME password
 *   - credentials missing               → creates the pair with a fresh random
 *                                         password and appends them to `.env`
 *
 * Requires `.env` to have VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, and the
 * Supabase project to have email confirmation OFF (mailer_autoconfirm) so
 * signup returns a session. Passwords must be recoverable, so a lost password
 * for an EXISTING account is reported (reset it in the dashboard or delete the
 * user and re-run) rather than silently rotated.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const ENV_PATH = `${REPO}/.env`;

const envRaw = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
const env = {};
for (const line of envRaw.split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing from .env — configure the\n' +
      'Supabase project first (see .env.example), then re-run this script.'
  );
  process.exit(1);
}

async function auth(path, body) {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const signIn = (email, password) => auth('token?grant_type=password', { email, password });
const signUp = (email, password) => auth('signup', { email, password });

const ACCOUNTS = [
  { suffix: 'A', fallbackEmail: 'lemon-agent-a@example.com' },
  { suffix: 'B', fallbackEmail: 'lemon-agent-b@example.com' },
];

const results = [];
for (const { suffix, fallbackEmail } of ACCOUNTS) {
  const email = env[`LEMON_TEST_SB_USER_${suffix}`] || fallbackEmail;
  const stored = env[`LEMON_TEST_SB_PASS_${suffix}`] || null;
  const password = stored || randomBytes(18).toString('base64url');

  let r = await signIn(email, password);
  if (r.json?.access_token) {
    results.push({ suffix, email, password, state: stored ? 'configured (sign-in OK)' : 'sign-in OK (recording to .env)' });
    continue;
  }
  r = await signUp(email, password);
  if (r.json?.access_token) {
    results.push({ suffix, email, password, state: stored ? 're-created (sign-in had failed)' : 'created' });
    continue;
  }
  const why = stored
    ? 'the stored password does not work — reset it in the Supabase dashboard (Authentication → Users), or delete the user and re-run this script'
    : `"${email}" already exists with another password — set LEMON_TEST_SB_PASS_${suffix} to its password, or delete the user and re-run`;
  results.push({ suffix, email, password: null, state: `FAILED: ${why}` });
}

for (const r of results) console.log(`  ${r.suffix}: ${r.email.padEnd(28)} ${r.state}`);

if (results.some((r) => r.password === null)) {
  console.error('\nFix the account(s) above, then re-run.');
  process.exit(1);
}

const missing = results.filter((r) => !env[`LEMON_TEST_SB_USER_${r.suffix}`] || !env[`LEMON_TEST_SB_PASS_${r.suffix}`]);
if (missing.length === 0) {
  console.log('\n.env already holds working credentials — nothing written.');
} else {
  const block =
    `\n# Reusable robot accounts for the manual room harness (workers/rooms/test/two-window-repro.mjs)\n` +
    `# Local-only test identities; the harness deletes the throwaway project rows it creates.\n` +
    results
      .map(
        (r) => `LEMON_TEST_SB_USER_${r.suffix}="${r.email}"\nLEMON_TEST_SB_PASS_${r.suffix}="${r.password}"`
      )
      .join('\n') +
    '\n';
  appendFileSync(ENV_PATH, block);
  console.log(`\nWrote ${missing.map((r) => `LEMON_TEST_SB_USER_${r.suffix}/PASS_${r.suffix}`).join(', ')} to .env (gitignored).`);
}
