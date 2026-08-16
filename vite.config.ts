import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Dev-only: injects the hub storage bridge into every page served inside a
// worker-preview-hub iframe (see public/hub-bridge.js — shared localStorage
// across worker tabs). No effect in production builds or direct tabs.
const hubStorageBridge = () => ({
  name: 'hub-storage-bridge',
  apply: 'serve',
  transformIndexHtml(html: string) {
    return html.replace('</head>', '<script src="/lemon_schedule/hub-bridge.js"></script></head>');
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
    plugins: [react(), tailwindcss(), hubStorageBridge()],
    cacheDir,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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
