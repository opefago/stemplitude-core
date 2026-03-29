/**
 * RecognitionToast — animated full-width announcement shown to all session
 * participants when a student receives a reward (points, high-five, callout).
 *
 * Slides in from the top, auto-dismisses after ~2 minutes, can be closed manually.
 */
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./RecognitionToast.css";

export type AwardEventType = "points_awarded" | "high_five" | "callout";

export interface RecognitionEvent {
  eventId?: string;
  eventType: AwardEventType;
  studentName: string;
  points?: number;
  message?: string;
}

interface Props {
  event: RecognitionEvent | null;
  onDismiss: () => void;
}

const ICON: Record<AwardEventType, string> = {
  points_awarded: "🏆",
  high_five: "✋",
  callout: "📣",
};

const LABEL: Record<AwardEventType, string> = {
  points_awarded: "Points Awarded",
  high_five: "High Five!",
  callout: "Shout-out",
};

const AUTO_DISMISS_MS = 12000;

export function RecognitionToast({ event, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);
  const onDismissRef = useRef(onDismiss);
  const activeEventKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const dismissWithAnimation = () => {
    setVisible(false);
    // Give the exit animation time to finish before clearing the event.
    window.setTimeout(() => onDismissRef.current(), 350);
  };

  useEffect(() => {
    if (!event) {
      setVisible(false);
      activeEventKeyRef.current = null;
      return;
    }
    const eventKey =
      event.eventId ??
      `${event.eventType}:${event.studentName}:${event.points ?? ""}:${event.message ?? ""}`;
    if (activeEventKeyRef.current === eventKey) {
      return;
    }
    activeEventKeyRef.current = eventKey;
    setVisible(true);
    const timer = window.setTimeout(() => {
      dismissWithAnimation();
    }, AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [event]);

  if (!event) return null;

  return (
    <div
      className={`recognition-toast recognition-toast--${event.eventType}${visible ? " recognition-toast--visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="recognition-toast__icon">{ICON[event.eventType]}</span>
      <div className="recognition-toast__body">
        <span className="recognition-toast__label">{LABEL[event.eventType]}</span>
        <span className="recognition-toast__text">
          <strong>{event.studentName}</strong>
          {event.eventType === "points_awarded" && event.points != null && (
            <> received <strong>{event.points} point{event.points !== 1 ? "s" : ""}!</strong></>
          )}
          {event.eventType === "high_five" && <> got a High Five!</>}
          {event.eventType === "callout" && (
            <> was called out{event.message ? `: "${event.message}"` : "!"}</>
          )}
        </span>
      </div>
      <button
        type="button"
        className="recognition-toast__close"
        onClick={dismissWithAnimation}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
