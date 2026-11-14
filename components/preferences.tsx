'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  PREF_COOKIE,
  PREF_STORAGE,
  parseContrast,
  parseTextSize,
  type Contrast,
  type TextSize,
} from '@/shared/preferences';

interface Preferences {
  textSize: TextSize;
  contrast: Contrast;
  setTextSize: (size: TextSize) => void;
  setContrast: (contrast: Contrast) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(cookie: string, storageKey: string, value: string): void {
  document.cookie = `${cookie}=${value}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // Storage can be blocked; the cookie still remembers the choice.
  }
}

export function PreferencesProvider({
  initialTextSize,
  initialContrast,
  children,
}: {
  initialTextSize: TextSize;
  initialContrast: Contrast;
  children: ReactNode;
}) {
  const [textSize, setTextSizeState] = useState(initialTextSize);
  const [contrast, setContrastState] = useState(initialContrast);

  // If this device has a saved choice the cookie lost (cleared cookies), restore it.
  useEffect(() => {
    try {
      const size = parseTextSize(localStorage.getItem(PREF_STORAGE.textSize));
      const high = parseContrast(localStorage.getItem(PREF_STORAGE.contrast));
      if (initialTextSize === '100' && size !== '100') apply('textSize', size);
      if (initialContrast === 'normal' && high === 'high') apply('contrast', high);
    } catch {
      // ignore
    }
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(kind: 'textSize' | 'contrast', value: string) {
    if (kind === 'textSize') {
      document.documentElement.dataset.textSize = value;
      setTextSizeState(value as TextSize);
    } else {
      document.documentElement.dataset.contrast = value;
      setContrastState(value as Contrast);
    }
  }

  const setTextSize = useCallback((size: TextSize) => {
    apply('textSize', size);
    persist(PREF_COOKIE.textSize, PREF_STORAGE.textSize, size);
  }, []);

  const setContrast = useCallback((value: Contrast) => {
    apply('contrast', value);
    persist(PREF_COOKIE.contrast, PREF_STORAGE.contrast, value);
  }, []);

  const value = useMemo(
    () => ({ textSize, contrast, setTextSize, setContrast }),
    [textSize, contrast, setTextSize, setContrast],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
