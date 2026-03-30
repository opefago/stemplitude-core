import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  getGuardianChildControls,
  getParentChildren,
  patchGuardianChildControls,
  unlinkGuardianChildLink,
  type GuardianChildControls,
  type GuardianMessagingScope,
  type StudentProfile,
} from "../../lib/api/students";
import { useAuth } from "../../providers/AuthProvider";
import { KidCheckbox, KidDropdown, ModalDialog } from "../../components/ui";
import "../../components/ui/ui.css";
import "./parent-controls.css";

const GRADE_PRESETS = [
  "Pre-K",
  "K",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
  "Other",
] as const;

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "Student";
}

const MESSAGING_SCOPE_OPTIONS: { value: GuardianMessagingScope; label: string }[] = [
  { value: "instructors_only", label: "Teachers & staff only" },
  { value: "classmates", label: "Teachers and classmates" },
  { value: "disabled", label: "Direct messaging off" },
];

const MESSAGING_SCOPE_DETAIL: Record<GuardianMessagingScope, string> = {
  instructors_only:
    "No direct messages to other students. Class and announcement channels may still apply based on your school.",
  classmates:
    "Can DM instructors and other learners where the school allows it. Class and announcement channels may still apply.",
  disabled:
    "Learner should not start new DMs. School broadcasts and announcements may still apply.",
};

const MESSAGING_KID_OPTIONS = MESSAGING_SCOPE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

const GRADE_KID_OPTIONS = [
  { value: "", label: "Not set" },
  ...GRADE_PRESETS.map((g) => ({ value: g, label: g })),
];

export function ParentChildControlsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get("student")?.trim() || "";
  const { user } = useAuth();

  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [controls, setControls] = useState<GuardianChildControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [messagingScope, setMessagingScope] =
    useState<GuardianMessagingScope>("classmates");
  const [allowPublish, setAllowPublish] = useState(true);
  const [gradeChoice, setGradeChoice] = useState<string>("");
  const [gradeCustom, setGradeCustom] = useState("");

  const activeChild = useMemo(
    () => children.find((c) => c.id === studentId) ?? null,
    [children, studentId],
  );

  const load = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setChildren([]);
      setControls(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSavedMsg(null);
    try {
      const [rows, ctrl] = await Promise.all([
        getParentChildren(),
        getGuardianChildControls(studentId),
      ]);
      setChildren(rows);
      if (!rows.some((r) => r.id === studentId)) {
        setError("This learner is not in your list for this workspace.");
        setControls(null);
        return;
      }
      setControls(ctrl);
      setMessagingScope(ctrl.messaging_scope);
      setAllowPublish(ctrl.allow_public_game_publishing);
      const gl = (ctrl.grade_level ?? "").trim();
      if (gl && GRADE_PRESETS.includes(gl as (typeof GRADE_PRESETS)[number])) {
        setGradeChoice(gl);
        setGradeCustom("");
      } else if (gl) {
        setGradeChoice("Other");
        setGradeCustom(gl);
      } else {
        setGradeChoice("");
        setGradeCustom("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings");
      setControls(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedGrade = useMemo(() => {
    if (gradeChoice === "Other") return gradeCustom.trim() || null;
    if (gradeChoice) return gradeChoice;
    return null;
  }, [gradeChoice, gradeCustom]);

  const onSave = async () => {
    if (!studentId || !controls) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const next = await patchGuardianChildControls(studentId, {
        messaging_scope: messagingScope,
        allow_public_game_publishing: allowPublish,
        grade_level: resolvedGrade,
      });
      setControls(next);
      setSavedMsg("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!studentId) return;
    setRemoving(true);
    setError(null);
    try {
      await unlinkGuardianChildLink(studentId);
      setConfirmRemove(false);
      navigate("/app/children", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove link");
    } finally {
      setRemoving(false);
    }
  };

  if (!user || (user.role !== "parent" && user.role !== "homeschool_parent")) {
    return (
      <div className="parent-controls" role="main">
        <p className="parent-controls__error">This page is only for guardian accounts.</p>
        <Link to="/app" className="parent-controls__back">
          Back to home
        </Link>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="parent-controls" role="main">
        <Link to="/app" className="parent-controls__back">
          <ArrowLeft size={16} aria-hidden />
          Back to home
        </Link>
        <header className="parent-controls__header">
          <h1 className="parent-controls__title">Parent &amp; learner settings</h1>
          <p className="parent-controls__subtitle">
            Choose a learner from the menu on your dashboard (learner dropdown), then open
            settings again—or pick a child from{" "}
            <Link to="/app/children" className="parent-controls__back" style={{ margin: 0 }}>
              My children
            </Link>
            .
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="parent-controls" role="main">
      <Link to="/app" className="parent-controls__back">
        <ArrowLeft size={16} aria-hidden />
        Back to home
      </Link>
      <header className="parent-controls__header">
        <h1 className="parent-controls__title">Parent &amp; learner settings</h1>
        <p className="parent-controls__subtitle">
          {activeChild
            ? `${childLabel(activeChild)} — messaging, publishing, grade, and your link to this account.`
            : "Loading…"}
        </p>
      </header>

      {loading ? (
        <p className="parent-controls__card-desc">Loading…</p>
      ) : null}
      {error ? (
        <div className="parent-controls__error" role="alert">
          {error}
        </div>
      ) : null}
      {savedMsg ? (
        <div className="parent-controls__ok" role="status">
          {savedMsg}
        </div>
      ) : null}

      {!loading && controls ? (
        <>
          <section className="parent-controls__card" aria-labelledby="pc-msg">
            <h2 id="pc-msg" className="parent-controls__card-title">
              Messaging
            </h2>
            <p className="parent-controls__card-desc">
              Choose who this learner may start direct messages with. Enforcement in chat will align
              with this setting as it rolls out across workspaces.
            </p>
            <div className="parent-controls__field">
              <span className="parent-controls__label">Who can this learner message</span>
              <KidDropdown
                value={messagingScope}
                onChange={(v) => {
                  if (v === "instructors_only" || v === "classmates" || v === "disabled") {
                    setMessagingScope(v);
                  }
                }}
                options={MESSAGING_KID_OPTIONS}
                fullWidth
                ariaLabel="Who can this learner message"
              />
              <p className="parent-controls__scope-detail" aria-live="polite">
                {MESSAGING_SCOPE_DETAIL[messagingScope]}
              </p>
            </div>
          </section>

          <section className="parent-controls__card" aria-labelledby="pc-pub">
            <h2 id="pc-pub" className="parent-controls__card-title">
              Games &amp; publishing
            </h2>
            <p className="parent-controls__card-desc">
              When labs add sharing or public galleries, this preference will control whether this
              learner may publish games or projects publicly.
            </p>
            <KidCheckbox
              checked={allowPublish}
              onChange={setAllowPublish}
              className="parent-controls__kid-checkbox"
            >
              Allow publicly publishing games and creative projects (when the feature is available)
            </KidCheckbox>
          </section>

          <section className="parent-controls__card" aria-labelledby="pc-grade">
            <h2 id="pc-grade" className="parent-controls__card-title">
              Grade level
            </h2>
            <p className="parent-controls__card-desc">
              Used for recommendations and placement in this workspace. You can update it anytime.
            </p>
            <div className="parent-controls__field">
              <span className="parent-controls__label">Grade</span>
              <KidDropdown
                value={gradeChoice}
                onChange={setGradeChoice}
                options={GRADE_KID_OPTIONS}
                fullWidth
                ariaLabel="Grade level"
                placeholder="Not set"
              />
            </div>
            {gradeChoice === "Other" ? (
              <div className="parent-controls__field">
                <span className="parent-controls__label">Describe grade</span>
                <input
                  className="parent-controls__kid-input"
                  value={gradeCustom}
                  onChange={(e) => setGradeCustom(e.target.value)}
                  placeholder="e.g. 5th, middle school"
                  maxLength={20}
                  aria-label="Custom grade"
                />
              </div>
            ) : null}
          </section>

          <div className="parent-controls__actions">
            <button
              type="button"
              className="parent-controls__btn parent-controls__btn--primary"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>

          <section className="parent-controls__card" aria-labelledby="pc-remove">
            <h2 id="pc-remove" className="parent-controls__card-title">
              Remove from your account
            </h2>
            {controls.has_parent_link ? (
              <>
                <p className="parent-controls__card-desc">
                  Unlink this learner from your guardian account in this workspace. Their school
                  account and progress stay with the organization; you will no longer see them in
                  your parent view until the school links you again.
                </p>
                <button
                  type="button"
                  className="parent-controls__btn parent-controls__btn--danger"
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove learner from my account
                </button>
              </>
            ) : (
              <div className="parent-controls__alert">
                There is no separate guardian link for this learner (common for home
                organizations). To remove them from your workspace entirely, use the{" "}
                <Link to="/app/students">Students</Link> page if you manage accounts there, or
                contact your administrator.
              </div>
            )}
          </section>
        </>
      ) : null}

      <ModalDialog
        isOpen={confirmRemove}
        onClose={() => {
          if (!removing) setConfirmRemove(false);
        }}
        title="Remove this learner?"
        disableClose={removing}
        contentClassName="parent-controls__remove-modal"
        footer={
          <div className="parent-controls__modal-footer">
            <button
              type="button"
              className="parent-controls__btn"
              onClick={() => setConfirmRemove(false)}
              disabled={removing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="parent-controls__btn parent-controls__btn--danger"
              disabled={removing}
              onClick={() => void onRemove()}
            >
              {removing ? "Removing…" : "Remove link"}
            </button>
          </div>
        }
      >
        <p className="parent-controls__remove-modal-body">
          You will be unlinked as their guardian in this workspace. This does not delete their student
          profile at the school.
        </p>
      </ModalDialog>
    </div>
  );
}
