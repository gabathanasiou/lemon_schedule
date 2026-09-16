import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import SceneDuplicateModal from '../components/script/SceneDuplicateModal';
import type { Scene } from '../types';

interface DuplicateRequest {
  scene: Scene;
  /** Called inside the modal's undo batch with the built duplicate. */
  onConfirm: (duplicate: Scene) => void;
}

interface SceneDuplicateContextValue {
  request: (r: DuplicateRequest) => void;
}

const SceneDuplicateContext = createContext<SceneDuplicateContextValue>({ request: () => {} });

/** Open the ONE scene-duplicate modal (roadmap 132 Part D) from any surface. */
export const useSceneDuplicate = (): SceneDuplicateContextValue => useContext(SceneDuplicateContext);

/** Mounts the shared duplicate modal once (App root); every duplicate surface
 *  routes through `request(...)` so the flow + modes are unified. */
export function SceneDuplicateProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<DuplicateRequest | null>(null);
  const request = useCallback((r: DuplicateRequest) => setPending(r), []);
  const value = useMemo(() => ({ request }), [request]);
  return (
    <SceneDuplicateContext.Provider value={value}>
      {children}
      {pending && (
        <SceneDuplicateModal
          scene={pending.scene}
          onConfirm={pending.onConfirm}
          onClose={() => setPending(null)}
        />
      )}
    </SceneDuplicateContext.Provider>
  );
}
