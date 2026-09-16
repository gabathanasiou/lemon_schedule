#!/usr/bin/env node
/**
 * Register the lemon MCP server with the AI clients found on this machine.
 *
 *   npm run mcp:install              # detect installed clients, merge config
 *   npm run mcp:install -- --dry-run # show what would change
 *   npm run mcp:install -- --all     # also create configs for clients not installed
 *   npm run mcp:install -- --only=codex,opencode
 *
 * JSON clients (opencode, Claude Desktop, Cursor) are deep-merged; Codex's TOML
 * gets an upserted `[mcp_servers.lemon]` block. Every changed file is backed up
 * next to the original as `<file>.bak`. Re-running is safe (idempotent).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SERVER = path.join(REPO_ROOT, 'tools', 'mcp', 'lemon-mcp.mjs');
const COMMAND = 'node';
const ARGS = [SERVER];

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const ALL = argv.includes('--all');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim())) : null;

const home = os.homedir();
const clients = [
  {
    id: 'opencode',
    label: 'opencode (global)',
    file: path.join(home, '.config', 'opencode', 'opencode.json'),
    detect: [path.join(home, '.config', 'opencode')],
    apply: (abs) => upsertJson(path.join(home, '.config', 'opencode', 'opencode.json'), 'mcp', {
      lemon: { type: 'local', command: [COMMAND, ...ARGS], enabled: true, environment: {} },
    }),
  },
  {
    id: 'codex',
    label: 'Codex / ChatGPT desktop',
    file: path.join(home, '.codex', 'config.toml'),
    detect: [path.join(home, '.codex')],
    apply: () => upsertToml(path.join(home, '.codex', 'config.toml'), 'lemon'),
  },
  {
    id: 'claude',
    label: 'Claude Desktop',
    file: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    detect: [path.join(home, 'Library', 'Application Support', 'Claude')],
    apply: () => upsertJson(path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), 'mcpServers', { lemon: { command: COMMAND, args: ARGS } }),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    file: path.join(home, '.cursor', 'mcp.json'),
    detect: [path.join(home, '.cursor')],
    apply: () => upsertJson(path.join(home, '.cursor', 'mcp.json'), 'mcpServers', { lemon: { command: COMMAND, args: ARGS } }),
  },
];

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

function backup(file) {
  if (!DRY_RUN && fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
}

function upsertJson(file, rootKey, entry) {
  const data = readJson(file);
  const before = JSON.stringify(data[rootKey] || {});
  data[rootKey] = { ...(data[rootKey] || {}), ...entry };
  const after = JSON.stringify(entry);
  if (before === JSON.stringify(data[rootKey])) return 'unchanged';
  if (DRY_RUN) return 'would update';
  backup(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return 'updated';
}

function tomlString(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function upsertToml(file, name) {
  const header = `[mcp_servers.${name}]`;
  const block = [
    header,
    `command = ${tomlString(COMMAND)}`,
    `args = [${ARGS.map(tomlString).join(', ')}]`,
    'startup_timeout_sec = 20',
  ].join('\n');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = text.replace(/\s+$/, '').split('\n');
  const start = lines.findIndex((l) => l.trim() === header);
  let output;
  let changed = true;
  if (start === -1) {
    output = text.replace(/\s+$/, '') + (text.trim() ? '\n\n' : '') + block + '\n';
  } else {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*\[/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const existing = lines.slice(start, end).join('\n');
    changed = existing !== block;
    output = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end)].join('\n').replace(/\s+$/, '') + '\n';
  }
  if (!changed) return 'unchanged';
  if (DRY_RUN) return 'would update';
  backup(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, output);
  return 'updated';
}

console.log(`lemon MCP installer\n  server: ${SERVER}\n`);
let touched = 0;
for (const client of clients) {
  if (ONLY && !ONLY.has(client.id)) continue;
  const installed = client.detect.some((p) => fs.existsSync(p));
  if (!installed && !ALL) {
    console.log(`  ${client.id.padEnd(8)} skipped (not installed) — use --all to create anyway`);
    continue;
  }
  try {
    const result = client.apply();
    if (result === 'updated') touched += 1;
    console.log(`  ${client.id.padEnd(8)} ${result.padEnd(13)} ${client.file}`);
  } catch (err) {
    console.log(`  ${client.id.padEnd(8)} FAILED        ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`\n${DRY_RUN ? 'Dry run — nothing written.' : `Done (${touched} file(s) changed). Restart the affected AI client to load the server.`}`);
