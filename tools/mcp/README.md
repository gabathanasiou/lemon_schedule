# lemon-schedule-mcp

Local [MCP](https://modelcontextprotocol.io) bridge for the **Lemon Schedule**
web app. Lets an AI agent (Claude Desktop, opencode, Cursor, Codex, …) read and
edit the project you have open in your browser.

> **Status:** prepared but **not published to npm yet**. Until it is, register
> the server from the repo (`npm run mcp:install`, or point your client at
> `node <repo>/tools/mcp/lemon-mcp.mjs`). The app only offers the bridge toggle
> when it runs on localhost — shipping it to everyone is the desktop app
> (roadmap 145).

Nothing leaves your machine: the app connects *out* to this helper on
`127.0.0.1`, and the helper only listens on loopback.

## Use

1. Open the app (your local `npm run dev`, or the hosted copy) and open a project.
2. **File → Connect agent bridge** (the toggle is the consent).
3. Register this helper with your AI client:

   ```jsonc
   // Claude Desktop / Cursor style
   {
     "mcpServers": {
       "lemon": { "command": "npx", "args": ["-y", "lemon-schedule-mcp"] }
     }
   }
   ```

   ```toml
   # Codex / ChatGPT desktop (~/.codex/config.toml)
   [mcp_servers.lemon]
   command = "npx"
   args = ["-y", "lemon-schedule-mcp"]
   ```

4. Ask, e.g. *"break down scene 4 into props and wardrobe"* or *"add 5 dummy
   crew to the grip department"*. Edits appear live and are undoable (`⌘Z`).

## Tools

Reads: `get_project`, `list_scenes`, `get_scene_script`, `get_schedule`,
`list_entities`, `get_versions`, `get_schema`, `get_bridge_status`.
Writes: `apply_actions` (atomic batch → one undo entry), `make_scene`, `undo`,
`redo`.

`get_scene_script` returns ONE scene's breakdown row plus its retained
screenplay body (matched by scene number) — use it instead of pulling the whole
script. `get_schema` returns every store action + core entity shape, derived from the
app source, so agents never guess field names. `LOAD` and `EMPTY_TRASH` are
refused; writes are refused while the project is read-only (offline cloud).

## Config

- `LEMON_MCP_PORT` — port to listen on (default `3939`).
- The helper accepts only browser origins in its allowlist (`localhost:3000`,
  `localhost:4173`, the hosted app) and checks the `Host` header
  (DNS-rebinding). A second instance proxies to the first.

## License

Apache-2.0
