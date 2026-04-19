import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { checkFeatureFlags } from "../lib/api/featureFlags";
import { useAuth } from "./AuthProvider";

const STORAGE_KEY = "ff:cache";
const STORAGE_VERSION_KEY = "ff:v";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CURRENT_VERSION = 1;

interface CacheEntry {
  flags: Record<string, boolean>;
  fetchedAt: number;
}

function readCache(): CacheEntry | null {
  try {
    const ver = localStorage.getItem(STORAGE_VERSION_KEY);
    if (Number(ver) !== CURRENT_VERSION) return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry) {
  try {
    localStorage.setItem(STORAGE_VERSION_KEY, String(CURRENT_VERSION));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch { /* quota exceeded — ignore */ }
}

function clearCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_VERSION_KEY);
  } catch { /* ignore */ }
}

const REGISTERED_KEYS = [
  "gamification_enabled",
  "robotics_advanced_objects",
];

interface FeatureFlagContextValue {
  flags: Record<string, boolean>;
  loading: boolean;
  isEnabled: (key: string) => boolean;
  invalidate: () => void;
  ensureLoaded: () => void;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: {},
  loading: false,
  isEnabled: () => false,
  invalidate: () => {},
  ensureLoaded: () => {},
});

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const cached = readCache();
    return cached?.flags ?? {};
  });
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const fetchedAtRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      clearCache();
      setFlags({});
      setLoading(false);
      fetchedAtRef.current = 0;
      inflightRef.current = null;
    }
  }, [isAuthenticated]);

  const doFetch = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const result = await checkFeatureFlags(REGISTERED_KEYS);
      if (!mountedRef.current) return;
      const now = Date.now();
      const entry: CacheEntry = { flags: result, fetchedAt: now };
      setFlags(result);
      writeCache(entry);
      fetchedAtRef.current = now;
    } catch {
      /* keep stale values */
    } finally {
      if (mountedRef.current) setLoading(false);
      inflightRef.current = null;
    }
  }, []);

  const ensureLoaded = useCallback(() => {
    if (!isAuthenticated) return;
    if (inflightRef.current) return;

    const now = Date.now();
    const stale = now - fetchedAtRef.current > CACHE_TTL_MS;

    if (!stale && fetchedAtRef.current > 0) return;

    const cached = readCache();
    if (cached && fetchedAtRef.current === 0) {
      setFlags(cached.flags);
      fetchedAtRef.current = cached.fetchedAt;
      if (now - cached.fetchedAt <= CACHE_TTL_MS) return;
    }

    inflightRef.current = doFetch(fetchedAtRef.current === 0 && !cached);
  }, [isAuthenticated, doFetch]);

  const invalidate = useCallback(() => {
    clearCache();
    fetchedAtRef.current = 0;
    inflightRef.current = doFetch(false);
  }, [doFetch]);

  const isEnabled = useCallback(
    (key: string) => flags[key] ?? false,
    [flags],
  );

  return (
    <FeatureFlagContext.Provider value={{ flags, loading, isEnabled, invalidate, ensureLoaded }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlag(key: string): { enabled: boolean; loading: boolean } {
  const { isEnabled, loading, ensureLoaded } = useContext(FeatureFlagContext);
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  return { enabled: isEnabled(key), loading };
}

export function useFeatureFlags(): FeatureFlagContextValue {
  return useContext(FeatureFlagContext);
}
