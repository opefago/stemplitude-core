import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onApiError, type ApiErrorEvent } from "../lib/api/client";

export type BannerVariant = "error" | "warning" | "info" | "offline" | "auth";

export interface BannerAction {
  label: string;
  onClick: () => void;
}

export interface BannerItem {
  id: string;
  variant: BannerVariant;
  message: string;
  action?: BannerAction;
  /** If true the banner cannot be dismissed by the user (e.g. offline). */
  persistent?: boolean;
}

interface GlobalBannerContextValue {
  banners: BannerItem[];
  showBanner: (banner: Omit<BannerItem, "id"> & { id?: string }) => string;
  dismissBanner: (id: string) => void;
  clearAll: () => void;
}

const GlobalBannerContext = createContext<GlobalBannerContextValue | null>(null);

let _nextId = 0;
function uid() {
  return `banner-${++_nextId}-${Date.now()}`;
}

const OFFLINE_BANNER_ID = "__offline__";
const AUTH_BANNER_ID = "__auth__";
/** One generic 5xx banner — parallel failing requests used to each append a duplicate. */
const SERVER_ERROR_BANNER_ID = "__server_error__";

export function GlobalBannerProvider({ children }: { children: ReactNode }) {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const bannersRef = useRef(banners);
  bannersRef.current = banners;

  const showBanner = useCallback(
    (input: Omit<BannerItem, "id"> & { id?: string }): string => {
      const id = input.id ?? uid();
      setBanners((prev) => {
        const exists = prev.find((b) => b.id === id);
        if (exists) {
          return prev.map((b) => (b.id === id ? { ...input, id } : b));
        }
        return [...prev, { ...input, id }];
      });
      return id;
    },
    [],
  );

  const dismissBanner = useCallback((id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const clearAll = useCallback(() => setBanners([]), []);

  useEffect(() => {
    function handleOffline() {
      showBanner({
        id: OFFLINE_BANNER_ID,
        variant: "offline",
        message: "You appear to be offline. Some features may not work until your connection is restored.",
        persistent: true,
      });
    }

    function handleOnline() {
      dismissBanner(OFFLINE_BANNER_ID);
    }

    if (!navigator.onLine) handleOffline();

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [showBanner, dismissBanner]);

  useEffect(() => {
    return onApiError((evt: ApiErrorEvent) => {
      if (evt.kind === "auth") {
        showBanner({
          id: AUTH_BANNER_ID,
          variant: "auth",
          message: evt.message,
          action: { label: "Log in", onClick: () => { window.location.href = "/"; } },
          persistent: true,
        });
      } else if (evt.kind === "network") {
        showBanner({
          id: OFFLINE_BANNER_ID,
          variant: "offline",
          message: "A network error occurred. Check your connection and try again.",
          action: { label: "Retry", onClick: () => window.location.reload() },
        });
      } else if (evt.kind === "server") {
        showBanner({
          id: SERVER_ERROR_BANNER_ID,
          variant: "error",
          message: "Looks like something went wrong. Please refresh the page.",
          action: { label: "Refresh", onClick: () => window.location.reload() },
        });
      }
    });
  }, [showBanner]);

  return (
    <GlobalBannerContext.Provider
      value={{ banners, showBanner, dismissBanner, clearAll }}
    >
      {children}
    </GlobalBannerContext.Provider>
  );
}

export function useGlobalBanner() {
  const ctx = useContext(GlobalBannerContext);
  if (!ctx) throw new Error("useGlobalBanner must be used inside GlobalBannerProvider");
  return ctx;
}

export { AUTH_BANNER_ID };
