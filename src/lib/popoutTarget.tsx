import { createContext, useContext } from 'react';

export const PopoutWindowContext = createContext<Window | null>(null);

export function usePopoutWindow(): Window | null {
  return useContext(PopoutWindowContext);
}

export function usePortalTarget(): HTMLElement | null {
  const popout = usePopoutWindow();
  if (popout) return popout.document.body;
  return null;
}

export function useCurrentDocument(): Document {
  const popout = usePopoutWindow();
  return popout?.document ?? document;
}

export function useCurrentWindow(): Window {
  const popout = usePopoutWindow();
  return popout ?? window;
}
