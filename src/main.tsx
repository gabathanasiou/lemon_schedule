import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {DialogProvider} from './components/Dialog';
import {GoogleAuthProvider} from './lib/googleDriveAuth';
import {SupabaseAuthProvider} from './lib/supabase/auth';
import './index.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

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
