import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { ensureRoomsWorker, localPortFromUrl, roomsPort, stopRoomsWorker } from './tools/rooms-dev.mjs';

// Dev-only: injects the hub storage bridge into every page served inside a
// worker-preview-hub iframe (see public/hub-bridge.js — shared localStorage
// across worker tabs). No effect in production builds or direct tabs.
const hubStorageBridge = () => ({
  name: 'hub-storage-bridge',
  apply: 'serve' as const,
  transformIndexHtml(html: string) {
    return html.replace('</head>', '<script src="/lemon_schedule/hub-bridge.js"></script></head>');
  },
});

// Dev-only: the local S4 room worker (roadmap 246). Brings `wrangler dev` up
// AFTER the dev server listens — through the ONE launcher (tools/rooms-dev.mjs,
// which reuses a healthy worker so parallel dev servers share one) — and
// serves the on-demand `GET /__rooms-dev/ensure` the app calls before a collab
// session connects: a browser cannot spawn processes, the dev server owns the
// launcher. A worker that fails to start never blocks the dev server — the
// header badge goes `unreachable` and edits buffer (roadmap 239).
const roomsDev = (): Plugin => ({
  name: 'rooms-dev',
  apply: 'serve',
  configureServer(server: ViteDevServer) {
    const httpServer = server.httpServer;
    if (!httpServer) return;
    httpServer.once('listening', () => {
      void ensureRoomsWorker({});
    });
    httpServer.once('close', () => stopRoomsWorker());
    server.middlewares.use('/__rooms-dev/ensure', (req, res) => {
      // `?url=` is the client's effective rooms URL; only loopback may reach
      // the local launcher (a deployed worker URL has nothing to ensure here).
      const target = new URL(req.url ?? '/', 'http://localhost').searchParams.get('url');
      const port = target ? localPortFromUrl(target) : roomsPort();
      if (port === null) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'url must point at the local worker (loopback)' }));
        return;
      }
      void ensureRoomsWorker({ port }).then((result) => {
        if (res.destroyed) return; // the app gave up waiting — never write
        res.statusCode = result.ok ? 200 : 503;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(result));
      });
    });
  },
});

// Per-port dep cache: the hub runs several dev servers (main + worker
// worktrees) that share the SYMLINKED node_modules — a shared .vite cache
// lets one server's re-optimization nuke another's hashed chunks
// (504 "Outdated Optimize Dep"). Each server gets its own cache dir,
// keyed by the EFFECTIVE port (last --port in argv — workers are spawned
// as `vite --port=3000 … --port 3101` where 3101 wins).
const argvPort = (() => {
  let port;
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--port=')) port = a.split('=')[1];
    else if (a === '--port' && i + 1 < process.argv.length) port = process.argv[i + 1];
  }
  return port;
})();
const cacheDir = argvPort ? `node_modules/.vite-${argvPort}` : 'node_modules/.vite';

export default defineConfig(() => {
  return {
    base: '/lemon_schedule/',
    plugins: [react(), tailwindcss(), hubStorageBridge(), roomsDev()],
    define: {
      // Build-time app version for the boot-screen lockup (roadmap 80).
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    cacheDir,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Glide's overlay editor is React.lazy()-loaded (a separate prod chunk)
        // — its exports map blocks deep imports, so alias the internal file to
        // preload the chunk at app boot (see BreakdownTabGlide.tsx). Rollup
        // dedupes this to the SAME chunk Glide's lazy() requests.
        '@glide-overlay-editor': path.resolve(__dirname, 'node_modules/@glideapps/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/data-grid-overlay-editor.js'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        // Hub/orchestration files are not app code — don't hot-reload the app on their edits.
        ignored: ['**/.opencode/**'],
      },
    },
  };
});
