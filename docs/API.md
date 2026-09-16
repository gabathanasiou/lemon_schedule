# Developer API / MCP Bridge

Status: **read this before changing the MCP/agent-bridge surface** (`tools/mcp/`,
`src/lib/agentBridgeClient.ts`, `useAgentBridge.ts`, `debugBridge.ts`) or adding a tool.

Stage 1 of roadmap **97**: drive the project open in the app from an MCP client
(opencode, Claude Desktop, Cursor, …). The API is *derived*, not a hand-written
endpoint list — it reads and writes through the app's existing debug bridge and
the single `Action` union, so new features are agent-reachable automatically.

## Architecture

```
MCP client ──stdio──▶ tools/mcp/lemon-mcp.mjs ──WebSocket──▶ app tab
(opencode, …)         127.0.0.1:3939                          src/lib/agentBridgeClient.ts
                      Origin + Host checked                    → getAgentBridge() (debug bridge)
                                                               → dispatch(Action) → reducer
```

- **`tools/mcp/lemon-mcp.mjs`** — MCP stdio server + the only WS listener
  (loopback). A second instance whose port is taken proxies to the first.
- **`tools/mcp/tools.mjs`** — tool definitions + handlers. Reads are nouns,
  writes funnel through one `apply_actions` tool.
- **`tools/mcp/actionSchema.mjs`** — parses `src/store/reducer.ts` (the `Action`
  union) and `src/types.ts` (core entity interfaces) with the TypeScript
  parser. `get_schema` serves that output, so agents never guess field names.
- **`src/lib/agentBridgeClient.ts`** — wire protocol + method whitelist (no
  `eval`). **`src/lib/useAgentBridge.ts`** — React glue (connect/reconnect).
- **`src/lib/debugBridge.ts`** — the bridge object is always installed
  in-module; `window.__lemonSchedule` stays gated behind DEV / `LEMON_AGENT=1`.
  The menu toggle + local WS are the opt-in.

## Setup

1. `npm install` (dev deps `@modelcontextprotocol/sdk`, `ws`).
2. Register the server:
   - **Published package (works anywhere, no clone):** add
     `npx -y lemon-schedule-mcp` as an MCP server in your client.
   - **From this repo:** `npm run mcp:install` — detects opencode,
     Codex / ChatGPT desktop, Claude Desktop and Cursor, and merges the config
     (backing up every changed file as `<file>.bak`). Flags: `--dry-run`,
     `--all` (create configs for clients not installed), `--only=<ids>`.
   - **Manual:** add it in the client's own config. opencode uses the repo's
     `opencode.json`; others take:
     ```json
     { "mcpServers": { "lemon": { "command": "node", "args": ["tools/mcp/lemon-mcp.mjs"] } } }
     ```
     Run from the repo root, or use the script's absolute path to make it work
     from any directory. `LEMON_MCP_PORT` overrides the port.
3. Start the app (`npm run dev`) and open a project.
4. **File → Connect agent bridge.** The first time, a short how-to dialog
   explains the flow (checkbox suppresses it for 24 hours); the dot then shows
   connecting / connected / helper not running. Connection failures surface as
   a warning dialog (once per episode) and the app retries every 2s while
   enabled. If another tab takes over the bridge, the older tab stops retrying
   and says so.

## Tools

| Tool | Kind | Notes |
|---|---|---|
| `get_project` | read | Active project; `scriptDocument`/`scriptBaseline` excluded unless `includeScript:true`. |
| `list_scenes` | read | Every scene × every breakdown column (Glide grid truth). |
| `get_schedule` | read | Computed rows + sections (call times, dates from the active calendar version). |
| `list_entities` | read | `kind`: cast · crew · locations · categories · day_types · element_categories · rules. |
| `get_versions` | read | Schedule versions + calendar versions + active ids. |
| `get_schema` | read | Derived actions (with payload types), entity interfaces, write conventions. |
| `apply_actions` | write | Array of `Action`s; `atomic:true` (default) = one undo entry. |
| `make_scene` | read | Valid blank Scene with optional overrides (build `ADD_SCENE` payloads). |
| `undo` / `redo` | write | Step the history stacks. |
| `get_bridge_status` | read | App connectivity, open project, read-only flag, sync diagnostics. |

Blocked over the bridge: `LOAD` (replaces the project + clears history) and
`EMPTY_TRASH` (irreversible). Writes are refused while
`diagnostics().readOnly` (cloud project offline). Reads never expose the undo
history (`getState`) or the OAuth token/session.

## Wire protocol (app ⇄ helper)

One JSON request/response per frame:

```
helper → app   { v:1, id, method, params }
app → helper   { v:1, id, ok:true, result }  |  { v:1, id, ok:false, error }
app → helper   { v:1, type:'hello', role:'app', projectId, projectTitle, readOnly, appVersion }
proxy → primary { v:1, id, method:'tool.call', params:{ name, args } }
```

Whitelisted app methods: `getProject`, `getProjectList`, `getCurrentProjectId`,
`getVersion`, `getRows`, `getSceneValues`, `getCalendarVersion`, `diagnostics`,
`applyActions`, `makeScene`, `undo`, `redo`.

## Security model

- Loopback only (`127.0.0.1`), never a public endpoint; off by default.
- Browser `Origin` allowlist (`localhost:3000`/`:4173` + the GitHub Pages
  origin) **and** a `Host` header check (DNS-rebinding), plus an explicit
  user toggle for consent.
- No arbitrary code: the helper can only call the whitelisted methods; writes
  go through the reducer and are undoable.
- Project data is untrusted input (scene names, notes, imports) — treat tool
  output as data, never instructions.

**Deferred (roadmap 97 P1+):** per-session pairing token, human-in-the-loop
confirmation for destructive ops, audit log, rate/size limits beyond the batch
cap, validation parity with UI flows (cast naming, cascades).

**Local-only for now (roadmap 145):** the toggle is offered only when the app
runs on loopback (`isAgentBridgeAvailable()` in `agentBridgeClient.ts`), and the
helper's origin allowlist has no hosted origin — visitors to the deployed site
never see a dead menu item, and a hosted copy cannot reach a local helper. The
intended way to ship this to everyone is a desktop app that hosts the web UI and
this MCP server in one process (item 145). The npm package under `tools/mcp/`
is prepared for power users but is not published yet.

## Adding features

- **New store action** → appears in `get_schema` and `apply_actions` with zero
  API work. Also add it to `ACTION_TYPES` (reducer rule).
- **New read** → add a tool in `tools/mcp/tools.mjs` and a whitelisted method in
  `src/lib/agentBridgeClient.ts`; reuse the canonical selector, never re-derive
  domain logic.
- Prefer the generic path; add a task-shaped wrapper only when it needs a
  multi-action sequence or validation the reducer doesn't do.

## Distribution (roadmap 145)

The feature is **local-only** right now: the app shows the toggle only on
loopback, and the helper accepts only localhost origins.

- **Interim (power users):** the helper at `tools/mcp/` is also packaged as a
  standalone npm package (`lemon-schedule-mcp`) — `tools/mcp/package.json` +
  `tools/mcp/action-schema.json`, the derived snapshot the installed package
  reads (it has no `src/` to parse). Regenerate the snapshot after touching the
  `Action` union or core entity interfaces with `npm run mcp:schema`; the unit
  test fails if it drifts. Publishing is deferred until the desktop path lands.
- **Ship path (planned):** a desktop app (Tauri/Electron) that renders the web
  UI and hosts this MCP server on `127.0.0.1` in one process — the Figma Dev
  Mode model. One download, no Node, data stays local, toggle shown to every
  user. See roadmap **145**.

## Tests

- `src/lib/__tests__/actionSchema.test.ts` — schema derived + in sync with
  `ACTION_TYPES`.
- `src/lib/__tests__/agentBridgeClient.test.ts` — blocked/read-only/batch rules
  + wire protocol.
- `e2e/debug-bridge.spec.ts` — the underlying read/write bridge.
- Manual: connect/disconnect dot, write from an MCP client, Cmd+Z in the app,
  helper restart reconnects.
