import { AnimatePresence, motion } from "framer-motion";
import { WifiOff, ShieldAlert, AlertTriangle, Info, XCircle, X, RefreshCw } from "lucide-react";
import { useGlobalBanner, type BannerItem, type BannerVariant } from "../../contexts/GlobalBannerContext";
import "./feedback.css";

const VARIANT_ICONS: Record<BannerVariant, typeof XCircle> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  offline: WifiOff,
  auth: ShieldAlert,
};

const VARIANT_LABELS: Record<BannerVariant, string> = {
  error: "Whoops!",
  warning: "Heads up!",
  info: "Info",
  offline: "No internet",
  auth: "Session expired",
};

function BannerRow({ banner }: { banner: BannerItem }) {
  const { dismissBanner } = useGlobalBanner();
  const Icon = VARIANT_ICONS[banner.variant];
  const label = VARIANT_LABELS[banner.variant];

  return (
    <motion.div
      className={`global-banner global-banner--${banner.variant}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      layout
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
    >
      <div className="global-banner__inner">
        <Icon size={18} className="global-banner__icon" aria-hidden />
        <span className="global-banner__text">
          <strong>{label}</strong> {banner.message}
          {banner.action && (
            <button
              type="button"
              className="global-banner__action"
              onClick={banner.action.onClick}
            >
              {banner.variant === "error" || banner.variant === "offline" ? (
                <RefreshCw size={14} aria-hidden />
              ) : null}
              {banner.action.label}
            </button>
          )}
        </span>
        {!banner.persistent && (
          <button
            type="button"
            className="global-banner__dismiss"
            onClick={() => dismissBanner(banner.id)}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function GlobalBanner() {
  const { banners } = useGlobalBanner();

  if (banners.length === 0) return null;

  return (
    <div className="global-banner__container">
      <AnimatePresence initial={false}>
        {banners.map((b) => (
          <BannerRow key={b.id} banner={b} />
        ))}
      </AnimatePresence>
    </div>
  );
}
