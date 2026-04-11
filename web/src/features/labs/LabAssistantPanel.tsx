import { AlertCircle, Bell, BellOff, ChevronDown, ChevronUp, Eye, HelpCircle, MessageSquare, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClassroomRealtimeClient,
  type RealtimeEventEnvelope,
  type RealtimeSnapshot,
  type SessionPresenceParticipant,
} from "../../lib/api/classrooms";
import { useChildContextStudentId } from "../../lib/childContext";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import type { LabClassroomContext } from "./useLabSession";
import { buildLabLaunchPath, isCurriculumLabUuid } from "./labRouting";
import { playAwardSound, playChatSound, playHelpSound, playJoinSound } from "./labSounds";
import { RecognitionToast, type RecognitionEvent } from "../classrooms/RecognitionToast";
import "./lab-assistant.css";

interface Props {
  classroomContext: LabClassroomContext;
}

type Tab = "chat" | "help" | "assignments";

export function LabAssistantPanel({ classroomContext }: Props) {
  const { classroomId, sessionId } = classroomContext;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const childContextStudentId = useChildContextStudentId();

  const isInstructor = user?.subType === "user";

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  // Draggable state
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Realtime state
  const clientRef = useRef<ClassroomRealtimeClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [chatEvents, setChatEvents] = useState<RealtimeEventEnvelope[]>([]);
  const [helpRequests, setHelpRequests] = useState<RealtimeEventEnvelope[]>([]);
  const [assignments, setAssignments] = useState<unknown[]>([]);
  const [participants, setParticipants] = useState<SessionPresenceParticipant[]>([]);
  // Track known participant IDs to detect new joins (avoid playing sound on initial snapshot load).
  const knownParticipantIdsRef = useRef<Set<string> | null>(null);
  const [helpSent, setHelpSent] = useState(false);
  const [helpNote, setHelpNote] = useState("");
  const [recognitionEvent, setRecognitionEvent] = useState<RecognitionEvent | null>(null);

  const [chatInput, setChatInput] = useState("");
  const chatThreadRef = useRef<HTMLDivElement>(null);

  const handleSnapshot = useCallback((snap: RealtimeSnapshot) => {
    setChatEvents(snap.events.filter((e) => e.event_type === "chat"));
    setHelpRequests(snap.events.filter((e) => e.event_type === "help_request"));
    setAssignments(snap.state.assignments ?? []);
    const initialParticipants = snap.participants ?? [];
    setParticipants(initialParticipants);
    // Seed known IDs so we don't play a join sound for participants already present.
    knownParticipantIdsRef.current = new Set(initialParticipants.map((p) => p.actor_id));
  }, []);

  const handleEvent = useCallback((ev: RealtimeEventEnvelope) => {
    const actorId = ev.actor?.id ?? (ev as unknown as Record<string, string>)["actor_id"];

    if (ev.event_type === "chat") {
      setChatEvents((prev) => [...prev, ev]);
      // Play chat sound for instructor when someone else sends a message.
      if (isInstructor && actorId !== user?.id && !mutedRef.current) {
        playChatSound();
      }
    }

    if (ev.event_type === "help_request") {
      setHelpRequests((prev) => [...prev, ev]);
      if (isInstructor && !mutedRef.current) {
        playHelpSound();
      }
    }

    if (ev.event_type === "presence_updated") {
      const updated = (ev as unknown as { payload?: { participants?: SessionPresenceParticipant[] } }).payload?.participants;
      if (updated) {
        setParticipants(updated);
        // Play join sound when a new student arrives (only after the snapshot is seeded).
        if (isInstructor && !mutedRef.current && knownParticipantIdsRef.current) {
          const newJoiner = updated.find(
            (p) => p.actor_type === "student" && !knownParticipantIdsRef.current!.has(p.actor_id),
          );
          if (newJoiner) {
            playJoinSound();
          }
          // Keep known set up-to-date.
          updated.forEach((p) => knownParticipantIdsRef.current!.add(p.actor_id));
        }
      }
    }

    if (
      ev.event_type === "assignment.updated" ||
      ev.event_type === "assignment.created" ||
      ev.event_type === "assignment.deleted"
    ) {
      setAssignments((ev as unknown as { payload?: { assignments?: unknown[] } }).payload?.assignments ?? []);
    }

    if (
      ev.event_type === "points_awarded" ||
      ev.event_type === "high_five" ||
      ev.event_type === "callout"
    ) {
      const awardType = ev.event_type as "points_awarded" | "high_five" | "callout";
      if (!mutedRef.current) {
        playAwardSound(awardType);
      }
      const payload = ev.payload as Record<string, unknown> | undefined;
      setRecognitionEvent({
        eventId:
          typeof (ev as { event_id?: unknown }).event_id === "string"
            ? ((ev as { event_id?: string }).event_id ?? undefined)
            : `${String((ev as { sequence?: number }).sequence ?? "na")}-${String((ev as { occurred_at?: string }).occurred_at ?? new Date().toISOString())}-${awardType}`,
        eventType: awardType,
        studentName: (payload?.["student_display_name"] as string | undefined) ?? "A student",
        points:
          awardType === "points_awarded"
            ? (payload?.["points_delta"] as number | undefined)
            : undefined,
        message: payload?.["message"] as string | undefined,
      });
    }
  }, [isInstructor, user?.id]);

  // Connect to classroom realtime channel
  useEffect(() => {
    if (!tenant) return;
    const client = new ClassroomRealtimeClient({
      classroomId,
      sessionId,
      tenantId: tenant.id,
      childContextStudentId,
      // Student is already in a lab — don't let this WS connection reset their in_lab status.
      preserveInLab: true,
      onConnected: () => setConnected(true),
      onDisconnected: () => setConnected(false),
      onSnapshot: handleSnapshot,
      onEvent: handleEvent,
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [classroomId, sessionId, tenant, childContextStudentId, handleSnapshot, handleEvent]);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (!collapsed && activeTab === "chat" && chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
    }
  }, [chatEvents, collapsed, activeTab]);

  // Dragging handlers
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, textarea")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    setPos({ x: dragStartRef.current.px + dx, y: dragStartRef.current.py + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  const sendChat = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg || !clientRef.current) return;
    clientRef.current.send("chat.send", { message: msg });
    setChatInput("");
  }, [chatInput]);

  const sendHelpRequest = useCallback(() => {
    if (!clientRef.current) return;
    clientRef.current.send("help.request", { note: helpNote.trim() });
    setHelpSent(true);
    setTimeout(() => setHelpSent(false), 5000);
    setHelpNote("");
  }, [helpNote]);

  // Find instructor participant who is in a lab
  const instructorInLab = participants.find(
    (p) => (p.actor_type === "instructor" || p.actor_type === "user") && p.in_lab,
  );

  const handleObserveInstructor = useCallback(() => {
    if (!instructorInLab) return;
    navigate(
      `/app/classrooms/${classroomId}/observe-lab/${instructorInLab.actor_id}` +
        `?session_id=${sessionId}&lab=${instructorInLab.lab_type ?? ""}`,
    );
  }, [instructorInLab, classroomId, sessionId, navigate]);

  return (
    <>
    <RecognitionToast event={recognitionEvent} onDismiss={() => setRecognitionEvent(null)} />
    <div
      ref={panelRef}
      className={`lab-assistant-panel${collapsed ? " lab-assistant-panel--collapsed" : ""}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Header */}
      <div className="lab-assistant-panel__header">
        <span className="lab-assistant-panel__title">
          <MessageSquare size={14} />
          Class Assistant
        </span>
        <div className="lab-assistant-panel__header-actions">
          <span
            className={`lab-assistant-panel__conn-dot${connected ? " lab-assistant-panel__conn-dot--connected" : ""}`}
            title={connected ? "Connected" : "Reconnecting…"}
          />
          {isInstructor && (
            <button
              type="button"
              className="lab-assistant-panel__icon-btn"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              title={muted ? "Unmute notification sounds" : "Mute notification sounds"}
            >
              {muted ? <BellOff size={13} /> : <Bell size={13} />}
            </button>
          )}
          <button
            type="button"
            className="lab-assistant-panel__icon-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Tab bar */}
          <div className="lab-assistant-panel__tabs" role="tablist">
            {(["chat", "help", "assignments"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={`lab-assistant-panel__tab${activeTab === tab ? " lab-assistant-panel__tab--active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "chat" && <MessageSquare size={12} />}
                {tab === "help" && <HelpCircle size={12} />}
                {tab === "assignments" && <AlertCircle size={12} />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "help" && isInstructor && helpRequests.length > 0 && (
                  <span className="lab-assistant-panel__badge">{helpRequests.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Chat tab */}
          {activeTab === "chat" && (
            <div className="lab-assistant-panel__body">
              <div className="lab-assistant-panel__chat-thread" ref={chatThreadRef}>
                {chatEvents.length === 0 ? (
                  <p className="lab-assistant-panel__empty">No messages yet.</p>
                ) : (
                  chatEvents.map((ev) => {
                    const actorId = ev.actor?.id ?? (ev as unknown as Record<string, string>)["actor_id"];
                    const isOwn = user?.id === actorId;
                    return (
                      <div
                        key={ev.event_id ?? String(ev.sequence)}
                        className={`lab-assistant-panel__bubble${isOwn ? " lab-assistant-panel__bubble--own" : ""}`}
                      >
                        <strong className="lab-assistant-panel__bubble-name">
                          {ev.actor?.display_name ?? (ev as unknown as Record<string, string>)["actor_display_name"] ?? ""}
                        </strong>
                        <span>{(ev as unknown as Record<string, string>)["message"] ?? (ev.payload as Record<string, string> | undefined)?.["message"] ?? ""}</span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="lab-assistant-panel__composer">
                <input
                  type="text"
                  className="lab-assistant-panel__input"
                  placeholder="Type a message…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button
                  type="button"
                  className="lab-assistant-panel__send-btn"
                  onClick={sendChat}
                  aria-label="Send message"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Help tab */}
          {activeTab === "help" && (
            <div className="lab-assistant-panel__body">
              {isInstructor ? (
                /* Instructor: see all incoming help requests */
                <>
                  <p className="lab-assistant-panel__help-desc">
                    {helpRequests.length === 0
                      ? "No help requests yet."
                      : `${helpRequests.length} help request${helpRequests.length === 1 ? "" : "s"}`}
                  </p>
                  {helpRequests.length === 0 ? (
                    <p className="lab-assistant-panel__empty">Students will appear here when they ask for help.</p>
                  ) : (
                    <ul className="lab-assistant-panel__assignment-list">
                      {helpRequests.map((ev) => {
                        const actorId = ev.actor?.id ?? (ev as unknown as Record<string, string>)["actor_id"];
                        const actorName = ev.actor?.display_name ?? (ev as unknown as Record<string, string>)["actor_display_name"] ?? "Unknown student";
                        const note = (ev.payload as Record<string, string> | undefined)?.["note"] ?? "";
                        const studentParticipant = participants.find((p) => p.actor_id === actorId);
                        return (
                          <li key={ev.event_id ?? String(ev.sequence)} className="lab-assistant-panel__assignment-item">
                            <strong>{actorName}</strong>
                            {note && <p style={{ margin: "2px 0 4px", color: "#d1d5db", fontSize: 11 }}>{note}</p>}
                            {studentParticipant?.in_lab && (
                              <button
                                type="button"
                                className="lab-assistant-panel__observe-btn"
                                style={{ marginTop: 4 }}
                                onClick={() =>
                                  navigate(
                                    `/app/classrooms/${classroomId}/observe-lab/${actorId}` +
                                      `?session_id=${sessionId}&lab=${studentParticipant.lab_type ?? ""}`,
                                  )
                                }
                              >
                                <Eye size={12} />
                                Join Lab
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                /* Student: send a help request */
                <>
                  <p className="lab-assistant-panel__help-desc">
                    Stuck? Send a help request and your instructor will be notified.
                  </p>
                  <textarea
                    className="lab-assistant-panel__input lab-assistant-panel__input--textarea"
                    placeholder="Describe what you need help with (optional)…"
                    rows={3}
                    value={helpNote}
                    onChange={(e) => setHelpNote(e.target.value)}
                  />
                  <button
                    type="button"
                    className="lab-assistant-panel__help-btn"
                    onClick={sendHelpRequest}
                    disabled={helpSent}
                  >
                    <HelpCircle size={14} />
                    {helpSent ? "Help request sent!" : "Ask for help"}
                  </button>

                  {instructorInLab && (
                    <button
                      type="button"
                      className="lab-assistant-panel__observe-btn"
                      onClick={handleObserveInstructor}
                    >
                      <Eye size={14} />
                      Watch Instructor's Lab
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Assignments tab */}
          {activeTab === "assignments" && (
            <div className="lab-assistant-panel__body">
              {assignments.length === 0 ? (
                <p className="lab-assistant-panel__empty">No assignments yet.</p>
              ) : (
                <ul className="lab-assistant-panel__assignment-list">
                  {(
                    assignments as Array<Record<string, unknown>>
                  ).map((a) => {
                    const aid = String(a.id ?? "");
                    const title = String(a.title ?? "Untitled");
                    const desc = a.description;
                    const labLauncher =
                      typeof a.lab_launcher_id === "string" &&
                      a.lab_launcher_id.trim()
                        ? a.lab_launcher_id.trim()
                        : null;
                    const rawLid =
                      typeof a.lab_id === "string" ? a.lab_id.trim() : "";
                    const launcher =
                      labLauncher ||
                      (rawLid && !isCurriculumLabUuid(rawLid) ? rawLid : null);
                    return (
                      <li key={aid} className="lab-assistant-panel__assignment-item">
                        <strong>{title}</strong>
                        {typeof desc === "string" && desc ? <p>{desc}</p> : null}
                        {isInstructor && launcher ? (
                          <button
                            type="button"
                            className="lab-assistant-panel__observe-btn"
                            style={{ marginTop: 6 }}
                            onClick={() =>
                              navigate(
                                buildLabLaunchPath(launcher, {
                                  classroomId,
                                  sessionId,
                                  referrer: "classroom_live_session",
                                  assignmentId: aid,
                                  curriculumLabId: isCurriculumLabUuid(rawLid)
                                    ? rawLid
                                    : undefined,
                                }),
                              )
                            }
                          >
                            <Eye size={12} />
                            Open lab
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
