#!/usr/bin/env node
/**
 * lemon_schedule MCP helper (roadmap 97, stage 1).
 *
 * Bridges an MCP client (opencode, Claude Desktop, Cursor, …) to the project
 * open in the app:
 *
 *   MCP client ──stdio──▶ this process ──WebSocket──▶ app (File → Connect agent bridge)
 *
 * The app connects OUT to `ws://127.0.0.1:3939`; this helper only ever listens
 * on 127.0.0.1, checks the browser Origin against an allowlist + the Host header
 * (DNS-rebinding), and can only call the app's whitelisted bridge methods.
 * A second helper instance on a busy port proxies to the first instead of
 * failing.
 *
 * Run: `npm run mcp` (or point an MCP client at `node tools/mcp/lemon-mcp.mjs`).
 */
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HELPER_VERSION, TOOL_DEFS, callTool } from './tools.mjs';

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.LEMON_MCP_PORT || '3939', 10);
const APP_TIMEOUT_MS = 20_000;
const MAX_TEXT_CHARS = 400_000;

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]);

const log = (...parts) => process.stderr.write(`[lemon-mcp] ${parts.join(' ')}\n`);

let appSocket = null;
let appHello = null;
let proxySocket = null;
let nextId = 1;
const appPending = new Map();
const proxyPending = new Map();

function request(socket, pending, method, params, label) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      reject(new Error(label === 'app' ? 'app not connected' : 'primary helper not reachable'));
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${label} did not answer ${method} within ${APP_TIMEOUT_MS}ms`));
    }, APP_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ v: 1, id, method, params }));
  });
}

function settle(pending, msg) {
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  clearTimeout(entry.timer);
  if (msg.ok) entry.resolve(msg.result);
  else entry.reject(new Error(msg.error || 'request failed'));
}

function parseFrame(data) {
  try {
    return JSON.parse(typeof data === 'string' ? data : data.toString());
  } catch {
    return null;
  }
}

const primaryCtx = {
  callApp: (method, params) => request(appSocket, appPending, method, params, 'app'),
  isAppConnected: () => !!appSocket && appSocket.readyState === WebSocket.OPEN,
  appInfo: () => appHello,
};

function callProxyTool(name, args) {
  return request(proxySocket, proxyPending, 'tool.call', { name, args }, 'primary helper');
}

function runTool(name, args) {
  return proxySocket ? callProxyTool(name, args) : callTool(name, args, primaryCtx);
}

function stringifyResult(value) {
  let text;
  try {
    text = JSON.stringify(value, null, 2) ?? 'null';
  } catch (err) {
    text = `[unserializable result: ${err instanceof Error ? err.message : String(err)}]`;
  }
  if (text.length > MAX_TEXT_CHARS) {
    text = `${text.slice(0, MAX_TEXT_CHARS)}\n…[truncated at ${MAX_TEXT_CHARS} chars — request a narrower read]`;
  }
  return text;
}

// ---- MCP server -----------------------------------------------------------

const server = new Server(
  { name: 'lemon-schedule', version: HELPER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (!TOOL_DEFS.some((t) => t.name === name)) {
    return {
      content: [{ type: 'text', text: `Unknown tool '${name}'. Available: ${TOOL_DEFS.map((t) => t.name).join(', ')}` }],
      isError: true,
    };
  }
  try {
    const result = await runTool(name, args);
    return { content: [{ type: 'text', text: stringifyResult(result) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
});

// ---- WebSocket transport --------------------------------------------------

function handleProxyMessage(ws, data) {
  const msg = parseFrame(data);
  if (!msg) return;
  if (msg.type === 'hello') {
    log(`proxy client connected (${msg.role})`);
    return;
  }
  if (typeof msg.id === 'number' && msg.method === 'tool.call') {
    const { name, args } = msg.params || {};
    Promise.resolve()
      .then(() => callTool(name, args, primaryCtx))
      .then(
        (result) => ws.send(JSON.stringify({ v: 1, id: msg.id, ok: true, result })),
        (err) => ws.send(JSON.stringify({ v: 1, id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })),
      );
  }
}

function startServer() {
  const wss = new WebSocketServer({ host: HOST, port: PORT });

  wss.on('listening', () => log(`listening on ws://${HOST}:${PORT} — enable File → Connect agent bridge in the app`));
  wss.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log(`port ${PORT} is in use — proxying to the running helper`);
      startProxyClient();
    } else {
      log('websocket error:', err instanceof Error ? err.message : String(err));
    }
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const role = url.searchParams.get('role');
    const host = (req.headers.host || '').trim();
    const hostOk = host === `${HOST}:${PORT}` || host === `localhost:${PORT}` || host === HOST || host === 'localhost';
    if (!hostOk) {
      ws.close(1008, 'bad host');
      return;
    }
    if (role === 'app') {
      const origin = req.headers.origin;
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        log(`rejected app connection (origin: ${origin || 'none'})`);
        ws.close(1008, 'origin not allowed');
        return;
      }
      if (appSocket && appSocket.readyState === WebSocket.OPEN) {
        try {
          appSocket.close(1008, 'Another tab is now using the agent bridge — turn it off here, or toggle it back on in this tab.');
        } catch {
          // already closing
        }
      }
      appSocket = ws;
      appHello = null;
      ws.on('message', (data) => {
        const msg = parseFrame(data);
        if (!msg) return;
        if (msg.type === 'hello') {
          appHello = { projectId: msg.projectId ?? null, projectTitle: msg.projectTitle ?? null, readOnly: !!msg.readOnly, appVersion: msg.appVersion ?? null };
          log(`app connected: "${appHello.projectTitle ?? 'untitled'}"${appHello.readOnly ? ' (read-only)' : ''}`);
          return;
        }
        if (typeof msg.id === 'number') settle(appPending, msg);
      });
      ws.on('close', () => {
        if (appSocket === ws) {
          appSocket = null;
          appHello = null;
          log('app disconnected');
        }
      });
      ws.on('error', () => ws.close());
    } else if (role === 'proxy') {
      ws.on('message', (data) => handleProxyMessage(ws, data));
      ws.on('error', () => ws.close());
    } else {
      ws.close(1008, 'missing role');
    }
  });
}

function startProxyClient() {
  const connect = () => {
    const ws = new WebSocket(`ws://${HOST}:${PORT}/?role=proxy`);
    proxySocket = ws;
    ws.on('open', () => {
      ws.send(JSON.stringify({ v: 1, type: 'hello', role: 'proxy' }));
      log('proxy ready — tool calls forward to the primary helper');
    });
    ws.on('message', (data) => {
      const msg = parseFrame(data);
      if (msg && typeof msg.id === 'number') settle(proxyPending, msg);
    });
    ws.on('close', () => {
      if (proxySocket === ws) proxySocket = null;
      setTimeout(connect, 2000);
    });
    ws.on('error', () => {
      // close handler owns the retry
    });
  };
  connect();
}

function shutdown() {
  try {
    appSocket?.close();
    proxySocket?.close();
  } catch {
    // nothing to do
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  startServer();
  await server.connect(new StdioServerTransport());
  log(`v${HELPER_VERSION} ready (MCP over stdio)`);
}

main().catch((err) => {
  log('fatal:', err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
