import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {DialogProvider} from './components/Dialog';
import {GoogleAuthProvider} from './lib/googleDriveAuth';
import {SupabaseAuthProvider} from './lib/supabase/auth';
import {PHONE_DEVICE_QUERY} from './lib/device';
import {installDevProbe} from './lib/devProbe';
import './index.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Phone (either orientation, roadmap 267): opt into edge-to-edge at boot so
// the shell can paint under the system UI (safe-area insets become real — the
// shell consumes them; in landscape they report the Dynamic Island). iPad/
// desktop keep the plain viewport meta (roadmap 265's two-layer model).
if (typeof window !== 'undefined' && window.matchMedia(PHONE_DEVICE_QUERY).matches) {
  document.querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
}

// TEMPORARY phone debugging (roadmap 267) — DEV builds only, beacons viewport
// measurements to the Mac's probe server. Remove with src/lib/devProbe.ts.
installDevProbe();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <SupabaseAuthProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </SupabaseAuthProvider>
    </GoogleAuthProvider>
  </StrictMode>,
);
