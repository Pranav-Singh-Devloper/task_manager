'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  PREF_COOKIE,
  PREF_STORAGE,
  parseContrast,
  parseMotion,
  parseTextSize,
  type Contrast,
  type Motion,
  type TextSize,
} from '@/shared/preferences';

interface Preferences {
  textSize: TextSize;
  contrast: Contrast;
  motion: Motion;
  setTextSize: (size: TextSize) => void;
  setContrast: (contrast: Contrast) => void;
  setMotion: (motion: Motion) => void;
}

type Kind = 'textSize' | 'contrast' | 'motion';

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
  initialMotion,
  children,
}: {
  initialTextSize: TextSize;
  initialContrast: Contrast;
  initialMotion: Motion;
  children: ReactNode;
}) {
  const [textSize, setTextSizeState] = useState(initialTextSize);
  const [contrast, setContrastState] = useState(initialContrast);
  const [motion, setMotionState] = useState(initialMotion);

  // If this device has a saved choice the cookie lost (cleared cookies), restore it.
  useEffect(() => {
    try {
      const size = parseTextSize(localStorage.getItem(PREF_STORAGE.textSize));
      const high = parseContrast(localStorage.getItem(PREF_STORAGE.contrast));
      const still = parseMotion(localStorage.getItem(PREF_STORAGE.motion));
      if (initialTextSize === '100' && size !== '100') apply('textSize', size);
      if (initialContrast === 'normal' && high === 'high') apply('contrast', high);
      if (initialMotion === 'on' && still === 'off') apply('motion', still);
    } catch {
      // ignore
    }
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(kind: Kind, value: string) {
    if (kind === 'textSize') {
      document.documentElement.dataset.textSize = value;
      setTextSizeState(value as TextSize);
    } else if (kind === 'contrast') {
      document.documentElement.dataset.contrast = value;
      setContrastState(value as Contrast);
    } else {
      document.documentElement.dataset.motion = value;
      setMotionState(value as Motion);
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

  const setMotion = useCallback((value: Motion) => {
    apply('motion', value);
    persist(PREF_COOKIE.motion, PREF_STORAGE.motion, value);
  }, []);

  const value = useMemo(
    () => ({ textSize, contrast, motion, setTextSize, setContrast, setMotion }),
    [textSize, contrast, motion, setTextSize, setContrast, setMotion],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribeReduce(onChange: () => void): () => void {
  const query = window.matchMedia?.(REDUCE);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/**
 * Should animated text, backgrounds and hover effects run? Not when the person turned animations off, chose high
 * contrast (plain black on white), or the device asks for reduced motion.
 */
export function useMotion(): boolean {
  const { motion, contrast } = usePreferences();
  const reduce = useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia?.(REDUCE).matches ?? false,
    // The server cannot know; the animated parts check again when they start.
    () => false,
  );
  return motion === 'on' && contrast === 'normal' && !reduce;
}
