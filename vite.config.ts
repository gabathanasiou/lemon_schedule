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

export default defineConfig(() => {
  return {
    base: '/lemon_schedule/',
    plugins: [react(), tailwindcss(), hubStorageBridge()],
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
