import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
  Video,
  X,
  Move,
  Expand,
  ScreenShare,
  ScreenShareOff,
  Circle,
  Volume2,
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import { AppTooltip, ModalDialog } from "../../components/ui";
import {
  issueSessionVideoToken,
  listSessionRecordings,
  startSessionRecording,
  stopSessionRecording,
  type SessionRecordingRecord,
} from "../../lib/api/classrooms";

type WidgetMode = "docked" | "expanded" | "minimized";
type FeedSource = "camera" | "screen_share";

type TrackLike = {
  attach: () => HTMLElement;
  detach?: (el?: HTMLElement) => void;
};

type VideoFeed = {
  id: string;
  participantSid: string;
  participantIdentity: string;
  participantName: string;
  source: FeedSource;
  isLocal: boolean;
  track: TrackLike;
};

interface LiveVideoWidgetProps {
  classroomId: string;
  sessionId: string;
  isInstructorView: boolean;
}

function FeedTile({
  feed,
  className,
  muted,
}: {
  feed: VideoFeed;
  className: string;
  muted: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.innerHTML = "";
    const el = feed.track.attach();
    if (el instanceof HTMLVideoElement) {
      el.autoplay = true;
      el.playsInline = true;
      el.muted = muted;
    }
    if (el instanceof HTMLAudioElement) {
      el.autoplay = true;
      el.muted = muted;
    }
    node.appendChild(el);
    return () => {
      if (typeof feed.track.detach === "function") {
        try {
          feed.track.detach(el);
        } catch {
          // no-op
        }
      }
      node.innerHTML = "";
    };
  }, [feed, muted]);
  return <div ref={ref} className={className} />;
}

export function LiveVideoWidget({ classroomId, sessionId, isInstructorView }: LiveVideoWidgetProps) {
  const [mode, setMode] = useState<WidgetMode>("docked");
  const [open, setOpen] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [screenShareOn, setScreenShareOn] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<SessionRecordingRecord[]>([]);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 420, height: 350 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [feeds, setFeeds] = useState<VideoFeed[]>([]);
  const [activeSpeakerIdentity, setActiveSpeakerIdentity] = useState<string | null>(null);
  const [pinnedFeedId, setPinnedFeedId] = useState<string | null>(null);
  const [localParticipantName, setLocalParticipantName] = useState("You");
  const [resumeOnMount, setResumeOnMount] = useState(false);

  const widgetRef = useRef<HTMLElement>(null);
  const roomRef = useRef<Room | null>(null);
  const remoteAudioHostRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const suppressAutoResumeRef = useRef(false);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    active: boolean;
    pointerId: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
  } | null>(null);

  const storageKey = `live-video-widget:${sessionId}:layout`;
  const mediaStorageKey = `live-video-widget:${sessionId}:media`;
  useEffect(() => {
    const savedRaw = localStorage.getItem(storageKey);
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw) as {
          mode?: WidgetMode;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        };
        if (saved.mode === "docked" || saved.mode === "expanded" || saved.mode === "minimized") {
          setMode(saved.mode);
        }
        if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
          setSize({
            width: Math.max(320, Math.min(900, saved.width as number)),
            height: Math.max(220, Math.min(700, saved.height as number)),
          });
        }
        if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          setPosition({ x: saved.x as number, y: saved.y as number });
          return;
        }
      } catch {
        // ignore malformed local state
      }
    }
    const defaultWidth = 420;
    const defaultHeight = 350;
    const rightPad = 20;
    const bottomPad = 20;
    setPosition({
      x: Math.max(12, window.innerWidth - defaultWidth - rightPad),
      y: Math.max(12, window.innerHeight - defaultHeight - bottomPad),
    });
  }, [storageKey]);

  useEffect(() => {
    const raw = localStorage.getItem(mediaStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        camera_on?: boolean;
        mic_on?: boolean;
        should_resume?: boolean;
      };
      if (typeof parsed.camera_on === "boolean") setCameraOn(parsed.camera_on);
      if (typeof parsed.mic_on === "boolean") setMicOn(parsed.mic_on);
      if (parsed.should_resume === true) {
        setOpen(true);
        setMode("expanded");
        setResumeOnMount(true);
      }
    } catch {
      // ignore malformed persisted media state
    }
  }, [mediaStorageKey]);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        mode,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      }),
    );
  }, [mode, position.x, position.y, size.height, size.width, storageKey]);

  useEffect(() => {
    localStorage.setItem(
      mediaStorageKey,
      JSON.stringify({
        camera_on: cameraOn,
        mic_on: micOn,
        should_resume: connected && !suppressAutoResumeRef.current,
      }),
    );
  }, [cameraOn, micOn, connected, mediaStorageKey]);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => ({
        x: Math.max(8, Math.min(prev.x, window.innerWidth - size.width - 8)),
        y: Math.max(8, Math.min(prev.y, window.innerHeight - size.height - 8)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [size.height, size.width]);

  useEffect(() => {
    const onFs = () => {
      const target = widgetRef.current;
      setIsFullscreen(Boolean(target && document.fullscreenElement === target));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const upsertFeed = useCallback((next: VideoFeed) => {
    setFeeds((prev) => {
      const idx = prev.findIndex((f) => f.id === next.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      }
      return [...prev, next];
    });
  }, []);

  const removeFeed = useCallback((feedId: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    setPinnedFeedId((prev) => (prev === feedId ? null : prev));
  }, []);

  const teardownRoom = useCallback(() => {
    const room = roomRef.current;
    const shouldResume = Boolean(room) && !suppressAutoResumeRef.current;
    roomRef.current = null;
    localStorage.setItem(
      mediaStorageKey,
      JSON.stringify({
        camera_on: cameraOn,
        mic_on: micOn,
        should_resume: shouldResume,
      }),
    );
    setConnected(false);
    setScreenShareOn(false);
    setActiveSpeakerIdentity(null);
    setPinnedFeedId(null);
    setFeeds([]);
    if (room) room.disconnect();
    if (remoteAudioHostRef.current) remoteAudioHostRef.current.innerHTML = "";
    suppressAutoResumeRef.current = false;
  }, [cameraOn, mediaStorageKey, micOn]);

  useEffect(() => () => teardownRoom(), [teardownRoom]);

  const refreshRecordings = useCallback(async () => {
    try {
      const rows = await listSessionRecordings(classroomId, sessionId);
      setRecordings(rows);
    } catch {
      // Keep UI usable if recording list fails.
    }
  }, [classroomId, sessionId]);

  useEffect(() => {
    if (!isInstructorView) return;
    void refreshRecordings();
  }, [isInstructorView, refreshRecordings]);

  const pingControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current != null) {
      window.clearTimeout(controlsTimerRef.current);
    }
    if (!connected || mode === "minimized") return;
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2400);
  }, [connected, mode]);

  useEffect(
    () => () => {
      if (controlsTimerRef.current != null) {
        window.clearTimeout(controlsTimerRef.current);
      }
    },
    [],
  );

  const connect = useCallback(async () => {
    if (connected || connecting) return;
    setError(null);
    setConnecting(true);
    try {
      const token = await issueSessionVideoToken(classroomId, sessionId);
      setLocalParticipantName(token.participant_name || "You");
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const first = speakers[0];
        setActiveSpeakerIdentity(first?.identity ?? null);
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video) {
          const source: FeedSource =
            publication.source === Track.Source.ScreenShare ? "screen_share" : "camera";
          upsertFeed({
            id: `${participant.sid}:${publication.trackSid}`,
            participantSid: participant.sid,
            participantIdentity: participant.identity ?? participant.sid,
            participantName: participant.name || participant.identity || "Participant",
            source,
            isLocal: false,
            track,
          });
          return;
        }
        if (track.kind === Track.Kind.Audio) {
          const host = remoteAudioHostRef.current;
          if (!host) return;
          const shell = document.createElement("div");
          shell.dataset.trackSid = publication.trackSid;
          host.appendChild(shell);
          const el = track.attach();
          if (el instanceof HTMLAudioElement) {
            el.autoplay = true;
            el.muted = false;
          }
          shell.appendChild(el);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video) {
          removeFeed(`${participant.sid}:${publication.trackSid}`);
          return;
        }
        if (track.kind === Track.Kind.Audio) {
          const host = remoteAudioHostRef.current;
          if (!host) return;
          const node = host.querySelector(`[data-track-sid="${publication.trackSid}"]`);
          node?.remove();
        }
      });

      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        const localTrack = publication.track;
        if (!localTrack || localTrack.kind !== Track.Kind.Video) return;
        const source: FeedSource =
          publication.source === Track.Source.ScreenShare ? "screen_share" : "camera";
        upsertFeed({
          id: `local:${publication.trackSid}`,
          participantSid: room.localParticipant.sid,
          participantIdentity: room.localParticipant.identity ?? "local",
          participantName: room.localParticipant.name || "You",
          source,
          isLocal: true,
          track: localTrack,
        });
      });

      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        removeFeed(`local:${publication.trackSid}`);
        if (publication.source === Track.Source.ScreenShare) {
          setScreenShareOn(false);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        teardownRoom();
      });

      await room.connect(token.ws_url, token.token);
      setLocalParticipantName(room.localParticipant.name || token.participant_name || "You");
      await room.localParticipant.setCameraEnabled(cameraOn);
      await room.localParticipant.setMicrophoneEnabled(micOn);
      setConnected(true);
      setOpen(true);
      pingControls();
      if (mode === "docked") setMode("expanded");
      localStorage.setItem(
        mediaStorageKey,
        JSON.stringify({
          camera_on: cameraOn,
          mic_on: micOn,
          should_resume: true,
        }),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not connect live video.";
      setError(message);
      teardownRoom();
    } finally {
      setConnecting(false);
    }
  }, [
    cameraOn,
    classroomId,
    connected,
    connecting,
    micOn,
    mode,
    mediaStorageKey,
    pingControls,
    removeFeed,
    sessionId,
    teardownRoom,
    upsertFeed,
  ]);

  useEffect(() => {
    if (!resumeOnMount || connected || connecting) return;
    setResumeOnMount(false);
    void connect();
  }, [connect, connected, connecting, resumeOnMount]);

  const openJoinDialog = useCallback(() => {
    setPermissionError(null);
    setShowPermissionsDialog(true);
    setOpen(true);
    if (mode === "docked") setMode("expanded");
  }, [mode]);

  const requestDevicePermissions = useCallback(async () => {
    if (!cameraOn && !micOn) return;
    const api = navigator.mediaDevices;
    if (!api || typeof api.getUserMedia !== "function") {
      throw new Error("Your browser does not support camera/microphone permissions.");
    }
    const stream = await api.getUserMedia({
      video: cameraOn,
      audio: micOn,
    });
    stream.getTracks().forEach((t) => t.stop());
  }, [cameraOn, micOn]);

  const confirmJoinWithPermissions = useCallback(async () => {
    setPermissionBusy(true);
    setPermissionError(null);
    try {
      await requestDevicePermissions();
      setShowPermissionsDialog(false);
      await connect();
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : "Camera/microphone permission was denied. Please allow access and try again.";
      setPermissionError(message);
    } finally {
      setPermissionBusy(false);
    }
  }, [connect, requestDevicePermissions]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    void room.localParticipant.setCameraEnabled(cameraOn).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not toggle camera.");
    });
  }, [cameraOn, connected]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    void room.localParticipant.setMicrophoneEnabled(micOn).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not toggle microphone.");
    });
  }, [connected, micOn]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    void room.localParticipant.setScreenShareEnabled(screenShareOn).catch((e: unknown) => {
      setScreenShareOn(false);
      setError(e instanceof Error ? e.message : "Could not start screen sharing.");
    });
  }, [connected, screenShareOn]);

  const activeRecording = useMemo(
    () => recordings.find((row) => row.status === "recording") ?? null,
    [recordings],
  );
  const videoControlTooltipProps = useMemo(
    () => ({
      delay: [2000, 0],
      duration: [120, 80],
      maxWidth: 180,
      offset: [0, 8],
    }),
    [],
  );

  const cameraFeeds = useMemo(() => feeds.filter((f) => f.source === "camera"), [feeds]);
  const screenFeeds = useMemo(() => feeds.filter((f) => f.source === "screen_share"), [feeds]);

  const mainFeed = useMemo(() => {
    if (pinnedFeedId) {
      const pinned = feeds.find((f) => f.id === pinnedFeedId);
      if (pinned) return pinned;
    }
    if (screenFeeds.length > 0) {
      const activeScreen = screenFeeds.find((f) => f.participantIdentity === activeSpeakerIdentity);
      return activeScreen ?? screenFeeds[0];
    }
    if (cameraFeeds.length > 0) {
      const activeCam = cameraFeeds.find(
        (f) => !f.isLocal && f.participantIdentity === activeSpeakerIdentity,
      );
      return activeCam ?? cameraFeeds.find((f) => !f.isLocal) ?? cameraFeeds[0];
    }
    return null;
  }, [activeSpeakerIdentity, cameraFeeds, feeds, pinnedFeedId, screenFeeds]);

  const splitFeeds = useMemo(() => {
    if (screenFeeds.length > 0) return null;
    if (cameraFeeds.length === 2) return cameraFeeds;
    return null;
  }, [cameraFeeds, screenFeeds.length]);

  const stripFeeds = useMemo(
    () =>
      feeds.filter(
        (f) =>
          f.id !== mainFeed?.id &&
          !(splitFeeds && splitFeeds.some((s) => s.id === f.id)),
      ),
    [feeds, mainFeed?.id, splitFeeds],
  );

  const localInitials = useMemo(() => {
    const parts = (localParticipantName || "You")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }, [localParticipantName]);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (mode === "minimized" || isFullscreen) return;
      const target = event.target as HTMLElement;
      if (target.closest("button")) return;
      event.preventDefault();
      dragStateRef.current = {
        active: true,
        pointerId: event.pointerId,
        originX: position.x,
        originY: position.y,
        startX: event.clientX,
        startY: event.clientY,
      };
      const onMove = (e: PointerEvent) => {
        const s = dragStateRef.current;
        if (!s || !s.active || s.pointerId !== e.pointerId) return;
        const nextX = s.originX + (e.clientX - s.startX);
        const nextY = s.originY + (e.clientY - s.startY);
        setPosition({
          x: Math.max(8, Math.min(nextX, window.innerWidth - size.width - 8)),
          y: Math.max(8, Math.min(nextY, window.innerHeight - size.height - 8)),
        });
      };
      const onUp = (e: PointerEvent) => {
        const s = dragStateRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isFullscreen, mode, position.x, position.y, size.height, size.width],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (isFullscreen) return;
      event.preventDefault();
      event.stopPropagation();
      resizeStateRef.current = {
        active: true,
        pointerId: event.pointerId,
        width: size.width,
        height: size.height,
        startX: event.clientX,
        startY: event.clientY,
      };
      const onMove = (e: PointerEvent) => {
        const s = resizeStateRef.current;
        if (!s || !s.active || s.pointerId !== e.pointerId) return;
        const nextWidth = s.width + (e.clientX - s.startX);
        const nextHeight = s.height + (e.clientY - s.startY);
        setSize({
          width: Math.max(320, Math.min(nextWidth, Math.floor(window.innerWidth * 0.9))),
          height: Math.max(220, Math.min(nextHeight, Math.floor(window.innerHeight * 0.9))),
        });
      };
      const onUp = (e: PointerEvent) => {
        const s = resizeStateRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        resizeStateRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isFullscreen, size.height, size.width],
  );

  const toggleFullscreen = useCallback(async () => {
    const node = widgetRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    await node.requestFullscreen().catch(() => {});
  }, []);

  async function onStartRecording() {
    if (!isInstructorView || recordingBusy) return;
    setRecordingBusy(true);
    setError(null);
    try {
      await startSessionRecording(classroomId, sessionId);
      await refreshRecordings();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start recording.");
    } finally {
      setRecordingBusy(false);
    }
  }

  async function onStopRecording() {
    if (!activeRecording || recordingBusy) return;
    setRecordingBusy(true);
    setError(null);
    try {
      await stopSessionRecording(classroomId, sessionId, activeRecording.id, { status: "ready" });
      await refreshRecordings();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not stop recording.");
    } finally {
      setRecordingBusy(false);
    }
  }

  if (!open && mode === "docked") {
    return (
      <AppTooltip
        title="Live video"
        description="Open the floating call widget."
        forceCustomInReact19
        theme="light"
        tippyProps={videoControlTooltipProps}
      >
        <button type="button" className="classroom-live__video-dock-btn" onClick={openJoinDialog}>
          <Video size={16} />
          {connecting ? "Connecting..." : "Live video"}
        </button>
      </AppTooltip>
    );
  }

  return (
    <section
      ref={widgetRef}
      className={`classroom-live__video-widget classroom-live__video-widget--${mode} ${isFullscreen ? "classroom-live__video-widget--fullscreen" : ""}`}
      style={
        !isFullscreen
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${size.width}px`,
              height: mode === "minimized" ? "auto" : `${size.height}px`,
            }
          : undefined
      }
      onPointerMove={pingControls}
      onMouseMove={pingControls}
      onMouseEnter={pingControls}
    >
      <header className="classroom-live__video-header" onPointerDown={startDrag}>
        <strong>Live Video</strong>
        <span className="classroom-live__video-drag-hint">
          <Move size={12} /> Drag
        </span>
        <div className="classroom-live__video-header-actions">
          <AppTooltip
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            description="Expand this widget to your whole screen."
            forceCustomInReact19
            theme="light"
            tippyProps={videoControlTooltipProps}
          >
            <button
              type="button"
              className="classroom-live__video-icon-btn"
              onClick={() => void toggleFullscreen()}
            >
              <Expand size={14} />
            </button>
          </AppTooltip>
          <AppTooltip
            title={mode === "expanded" ? "Minimize widget" : "Expand widget"}
            description="Toggle compact and expanded floating sizes."
            forceCustomInReact19
            theme="light"
            tippyProps={videoControlTooltipProps}
          >
            <button
              type="button"
              className="classroom-live__video-icon-btn"
              onClick={() => setMode(mode === "expanded" ? "minimized" : "expanded")}
            >
              {mode === "expanded" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </AppTooltip>
          <AppTooltip
            title="Close live video"
            description="Close the widget and leave the call."
            forceCustomInReact19
            theme="light"
            tippyProps={videoControlTooltipProps}
          >
            <button
              type="button"
              className="classroom-live__video-icon-btn"
              onClick={() => {
                suppressAutoResumeRef.current = true;
                setMode("docked");
                setOpen(false);
                teardownRoom();
              }}
            >
              <X size={14} />
            </button>
          </AppTooltip>
        </div>
      </header>

      {mode !== "minimized" && (
        <div className="classroom-live__video-body">
          <div
            className={`classroom-live__video-stage ${splitFeeds ? "classroom-live__video-stage--split" : ""}`}
            onDoubleClick={() => void toggleFullscreen()}
          >
            {splitFeeds ? (
              <div className="classroom-live__video-split-grid">
                {splitFeeds.map((feed) => (
                  <div key={feed.id} className="classroom-live__video-split-item">
                    <FeedTile feed={feed} className="classroom-live__video-main" muted={feed.isLocal} />
                    <div className="classroom-live__video-label">
                      {feed.participantName}
                      {feed.participantIdentity === activeSpeakerIdentity ? (
                        <span className="classroom-live__video-speaking-pill">
                          <Volume2 size={11} /> Speaking
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : mainFeed ? (
              <>
                <FeedTile feed={mainFeed} className="classroom-live__video-main" muted={mainFeed.isLocal} />
                <div className="classroom-live__video-label">
                  {mainFeed.participantName}
                  {mainFeed.participantIdentity === activeSpeakerIdentity ? (
                    <span className="classroom-live__video-speaking-pill">
                      <Volume2 size={11} /> Speaking
                    </span>
                  ) : null}
                  {mainFeed.source === "screen_share" ? (
                    <span className="classroom-live__video-sharing-pill">
                      <ScreenShare size={11} /> Sharing screen
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              connected && !cameraOn ? (
                <div className="classroom-live__video-empty classroom-live__video-empty--identity">
                  <div className="classroom-live__video-avatar">{localInitials}</div>
                  <span>{localParticipantName}</span>
                </div>
              ) : (
                <div className="classroom-live__video-empty">
                  <Video size={20} />
                  <span>Join to start video</span>
                </div>
              )
            )}

            <div
              className={`classroom-live__video-overlay-controls ${controlsVisible ? "is-visible" : "is-hidden"}`}
            >
              <AppTooltip
                title={cameraOn ? "Turn camera off" : "Turn camera on"}
                description="Toggle your camera feed for this call."
                forceCustomInReact19
                theme="light"
                tippyProps={videoControlTooltipProps}
              >
                <button
                  type="button"
                  className={`classroom-live__video-circle-btn ${cameraOn ? "" : "is-off"}`}
                  onClick={() => setCameraOn((v) => !v)}
                >
                  {cameraOn ? <Camera size={16} /> : <CameraOff size={16} />}
                </button>
              </AppTooltip>
              <AppTooltip
                title={micOn ? "Mute microphone" : "Unmute microphone"}
                description="Control whether others can hear you."
                forceCustomInReact19
                theme="light"
                tippyProps={videoControlTooltipProps}
              >
                <button
                  type="button"
                  className={`classroom-live__video-circle-btn ${micOn ? "" : "is-off"}`}
                  onClick={() => setMicOn((v) => !v)}
                >
                  {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                </button>
              </AppTooltip>
              <AppTooltip
                title={screenShareOn ? "Stop screen share" : "Share your screen"}
                description="Share your screen with participants."
                forceCustomInReact19
                theme="light"
                tippyProps={videoControlTooltipProps}
              >
                <button
                  type="button"
                  className={`classroom-live__video-circle-btn ${screenShareOn ? "is-on" : ""}`}
                  onClick={() => setScreenShareOn((v) => !v)}
                  disabled={!connected}
                >
                  {screenShareOn ? <ScreenShareOff size={16} /> : <ScreenShare size={16} />}
                </button>
              </AppTooltip>
              {!connected ? (
                <AppTooltip
                  title="Join call"
                  description="Connect to the classroom live video room."
                  forceCustomInReact19
                  theme="light"
                  tippyProps={videoControlTooltipProps}
                >
                  <button
                    type="button"
                    className="classroom-live__video-circle-btn classroom-live__video-circle-btn--join"
                    onClick={openJoinDialog}
                    disabled={connecting}
                  >
                    <Video size={16} />
                  </button>
                </AppTooltip>
              ) : (
                <AppTooltip
                  title="Leave call"
                  description="Disconnect from live video now."
                  forceCustomInReact19
                  theme="light"
                  tippyProps={videoControlTooltipProps}
                >
                  <button
                    type="button"
                    className="classroom-live__video-circle-btn classroom-live__video-circle-btn--leave"
                    onClick={() => {
                      suppressAutoResumeRef.current = true;
                      teardownRoom();
                    }}
                  >
                    <X size={16} />
                  </button>
                </AppTooltip>
              )}
              {isInstructorView && (
                <AppTooltip
                  title={activeRecording ? "Stop recording" : "Start recording"}
                  description="Toggle cloud recording for this live class session."
                  forceCustomInReact19
                  theme="light"
                  tippyProps={videoControlTooltipProps}
                >
                  <button
                    type="button"
                    className={`classroom-live__video-circle-btn ${activeRecording ? "is-recording" : ""}`}
                    onClick={() => void (activeRecording ? onStopRecording() : onStartRecording())}
                    disabled={recordingBusy || !connected}
                  >
                    <Circle size={14} />
                  </button>
                </AppTooltip>
              )}
            </div>
          </div>

          {stripFeeds.length > 0 && (
            <div className="classroom-live__participant-strip" aria-label="Participant strip">
              {stripFeeds.map((feed) => (
                <AppTooltip
                  key={feed.id}
                  title={`Focus ${feed.participantName}`}
                  description="Pin this participant in the main video area."
                  forceCustomInReact19
                  theme="light"
                  tippyProps={videoControlTooltipProps}
                >
                  <button
                    type="button"
                    className={`classroom-live__participant-chip ${feed.participantIdentity === activeSpeakerIdentity ? "is-speaking" : ""}`}
                    onClick={() => setPinnedFeedId(feed.id)}
                  >
                    <FeedTile
                      feed={feed}
                      className="classroom-live__participant-chip-media"
                      muted={feed.isLocal}
                    />
                    <span className="classroom-live__participant-chip-label">{feed.participantName}</span>
                  </button>
                </AppTooltip>
              ))}
            </div>
          )}
        </div>
      )}
      {error ? <p className="classroom-live__video-error">{error}</p> : null}
      {!isFullscreen && mode !== "minimized" ? (
        <AppTooltip
          title="Resize widget"
          description="Drag this corner to resize the video panel."
          forceCustomInReact19
          theme="light"
          tippyProps={videoControlTooltipProps}
        >
          <button
            type="button"
            className="classroom-live__video-resize-handle"
            onPointerDown={startResize}
            aria-label="Resize video widget"
          />
        </AppTooltip>
      ) : null}
      <div ref={remoteAudioHostRef} style={{ display: "none" }} />
      <ModalDialog
        isOpen={showPermissionsDialog}
        onClose={() => {
          if (permissionBusy) return;
          setShowPermissionsDialog(false);
        }}
        title="Join Live Video"
        ariaLabel="Join live video dialog"
        contentClassName="classroom-live__video-permission-dialog"
        footer={
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setShowPermissionsDialog(false)}
              disabled={permissionBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={() => void confirmJoinWithPermissions()}
              disabled={permissionBusy}
            >
              {permissionBusy ? "Checking..." : "Allow & Join"}
            </button>
          </div>
        }
      >
        <div className="classroom-live__video-permissions">
          <p>
            Choose your video settings before joining. The browser will then ask for permission in one step.
          </p>
          <div className="classroom-live__video-permission-toggles">
            <button
              type="button"
              className={`classroom-live__video-permission-toggle ${cameraOn ? "is-on" : "is-off"}`}
              onClick={() => setCameraOn((v) => !v)}
            >
              {cameraOn ? <Camera size={14} /> : <CameraOff size={14} />}
              Camera {cameraOn ? "On" : "Off"}
            </button>
            <button
              type="button"
              className={`classroom-live__video-permission-toggle ${micOn ? "is-on" : "is-off"}`}
              onClick={() => setMicOn((v) => !v)}
            >
              {micOn ? <Mic size={14} /> : <MicOff size={14} />}
              Microphone {micOn ? "On" : "Off"}
            </button>
          </div>
          {permissionError ? <p className="classroom-live__video-error">{permissionError}</p> : null}
        </div>
      </ModalDialog>
    </section>
  );
}
