import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Sparkles } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useGuardianLearner } from "../../providers/GuardianLearnerProvider";
import { setChildContextStudentId, useChildContextStudentId } from "../../lib/childContext";
import { studentProfileDisplayName } from "../../lib/studentDisplayName";
import { KidDropdown } from "../ui";
import "./child-mode-banner.css";

const IDLE_MS = 30 * 60 * 1000;

export function ChildModeBanner() {
  const navigate = useNavigate();
  const { user, subType, role } = useAuth();
  const childId = useChildContextStudentId();
  const gl = useGuardianLearner();
  const [confirmExit, setConfirmExit] = useState(false);
  const idleRef = useRef<number | null>(null);

  const isGuardianSession =
    Boolean(childId) &&
    subType === "user" &&
    (role === "parent" || role === "homeschool_parent");

  const resetIdle = useCallback(() => {
    if (idleRef.current != null) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => {
      setChildContextStudentId(null);
      navigate("/app", { replace: true });
    }, IDLE_MS);
  }, [navigate]);

  useEffect(() => {
    if (!isGuardianSession) {
      if (idleRef.current != null) {
        window.clearTimeout(idleRef.current);
        idleRef.current = null;
      }
      return undefined;
    }
    const ev = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    resetIdle();
    const onAct = () => resetIdle();
    ev.forEach((e) => window.addEventListener(e, onAct, { passive: true }));
    return () => {
      ev.forEach((e) => window.removeEventListener(e, onAct));
      if (idleRef.current != null) window.clearTimeout(idleRef.current);
    };
  }, [isGuardianSession, resetIdle]);

  const learnerDropdownOptions = useMemo(
    () =>
      gl.guardianChildren.map((c) => ({
        value: c.id,
        label: studentProfileDisplayName(c),
      })),
    [gl.guardianChildren],
  );

  if (!isGuardianSession) return null;

  const doExit = () => {
    setConfirmExit(false);
    setChildContextStudentId(null);
    navigate("/app", { replace: true });
  };

  const learnerLabel =
    gl.activeLearnerProfile != null
      ? studentProfileDisplayName(gl.activeLearnerProfile)
      : gl.loadingGuardianChildren
        ? "Loading learner…"
        : "Learner";

  const showSwitcher =
    gl.guardianChildren.length > 0 && childId != null;

  return (
    <>
      {confirmExit ? (
        <div
          className="child-mode-banner__overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="child-mode-exit-title"
        >
          <div className="child-mode-banner__modal">
            <div className="child-mode-banner__modal-burst" aria-hidden>
              <Sparkles className="child-mode-banner__modal-sparkle" size={28} strokeWidth={2.25} />
            </div>
            <h2 id="child-mode-exit-title" className="child-mode-banner__modal-title">
              Exit learner view?
            </h2>
            <p className="child-mode-banner__modal-copy">
              Your learner&apos;s progress is saved. You&apos;ll leave their view and return to your
              guardian dashboard.
            </p>
            <div className="child-mode-banner__modal-actions">
              <button
                type="button"
                className="child-mode-banner__modal-btn child-mode-banner__modal-btn--stay"
                onClick={() => setConfirmExit(false)}
              >
                Keep exploring
              </button>
              <button
                type="button"
                className="child-mode-banner__modal-btn child-mode-banner__modal-btn--go"
                onClick={doExit}
              >
                <LogOut size={18} strokeWidth={2.5} aria-hidden />
                Exit learner view
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="child-mode-banner" role="status">
        <div className="child-mode-banner__main">
          <span className="child-mode-banner__text">
            <span className="child-mode-banner__kicker">Viewing as</span>{" "}
            <strong className="child-mode-banner__name">{learnerLabel}</strong>
            <span className="child-mode-banner__hint">
              {" "}
              (guardian: {user?.firstName ?? "you"})
            </span>
          </span>
          {showSwitcher ? (
            <div className="child-mode-banner__switcher">
              <span className="child-mode-banner__switcher-label">Switch learner</span>
              <KidDropdown
                value={childId}
                options={learnerDropdownOptions}
                onChange={(id) => {
                  if (id) gl.switchLearner(id);
                }}
                ariaLabel="Switch learner"
                minWidth={200}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="child-mode-banner__exit"
          onClick={() => setConfirmExit(true)}
        >
          <LogOut className="child-mode-banner__exit-icon" size={17} strokeWidth={2.5} aria-hidden />
          <span className="child-mode-banner__exit-label">Exit learner view</span>
        </button>
      </div>
    </>
  );
}
