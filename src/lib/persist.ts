import { useState, useEffect, useCallback } from 'react';

export function usePersistState<T>(storageKey: string, defaults: T): [T, (value: T) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
  }, [storageKey, value]);

  const reset = useCallback(() => {
    setValue(defaults);
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey, defaults]);

  return [value, setValue, reset];
}
