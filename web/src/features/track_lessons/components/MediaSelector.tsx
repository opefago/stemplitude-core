import { useEffect, useMemo, useRef, useState } from "react";
import { KidDropdown } from "../../../components/ui";
import {
  getConnectUrl,
  listOAuthConnections,
  listYouTubeVideos,
  type YouTubeVideo,
} from "../../../lib/api/integrations";

type MediaSelectorProps = {
  provider: "youtube" | "r2";
  source: string;
  onProviderChange: (provider: "youtube" | "r2") => void;
  onSourceChange: (source: string) => void;
  onUploadLocalFile?: (file: File) => Promise<void>;
  isUploadingLocalFile?: boolean;
  localUploadError?: string | null;
};

const YOUTUBE_RECENT_STORAGE_KEY = "track-lessons.youtube-recent";

function normalizeR2Input(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.pathname.replace(/^\/+/, "");
  } catch {
    return trimmed;
  }
}

function extractYouTubeId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (url.hostname.includes("youtube.com")) {
      const watch = url.searchParams.get("v");
      if (watch && /^[a-zA-Z0-9_-]{11}$/.test(watch)) return watch;
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1] ?? "";
      return /^[a-zA-Z0-9_-]{11}$/.test(last) ? last : "";
    }
  } catch {
    return "";
  }
  return "";
}

export function MediaSelector({
  provider,
  source,
  onProviderChange,
  onSourceChange,
  onUploadLocalFile,
  isUploadingLocalFile = false,
  localUploadError = null,
}: MediaSelectorProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const [youtubeSource, setYoutubeSource] = useState<"mine" | "public">("mine");
  const [youtubeQuery, setYoutubeQuery] = useState("");
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeRows, setYoutubeRows] = useState<YouTubeVideo[]>([]);
  const [youtubeNextPageToken, setYoutubeNextPageToken] = useState<string | null>(null);
  const [recentYoutube, setRecentYoutube] = useState<Array<{ id: string; title: string }>>([]);
  const [youtubeLinked, setYoutubeLinked] = useState<boolean | null>(null);
  const [youtubeLinking, setYoutubeLinking] = useState(false);
  const [youtubeLinkError, setYoutubeLinkError] = useState<string | null>(null);

  const youtubeVideoId = useMemo(() => extractYouTubeId(source), [source]);
  const hasYoutubeSource = provider === "youtube" && Boolean(youtubeVideoId);
  const hasHostedSource = provider === "r2" && Boolean(source.trim());

  const refreshYouTubeConnection = async () => {
    try {
      const rows = await listOAuthConnections();
      setYoutubeLinked(rows.some((row) => row.provider === "youtube" && row.is_active !== false));
      setYoutubeLinkError(null);
    } catch {
      setYoutubeLinked(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(YOUTUBE_RECENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRecentYoutube(
          parsed
            .filter((item): item is { id: string; title: string } => Boolean(item?.id && item?.title))
            .slice(0, 8),
        );
      }
    } catch {
      setRecentYoutube([]);
    }
  }, []);

  const addRecentYoutube = (id: string, title: string) => {
    setRecentYoutube((prev) => {
      const next = [{ id, title }, ...prev.filter((item) => item.id !== id)].slice(0, 8);
      localStorage.setItem(YOUTUBE_RECENT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loadYouTubeVideos = async (pageToken?: string | null) => {
    if (!youtubeLinked) {
      setYoutubeRows([]);
      setYoutubeNextPageToken(null);
      setYoutubeError("Connect YouTube to browse listed and unlisted videos.");
      return;
    }
    setYoutubeLoading(true);
    setYoutubeError(null);
    try {
      const res = await listYouTubeVideos({
        source: youtubeSource,
        q: youtubeQuery.trim() || undefined,
        pageToken: pageToken || undefined,
      });
      setYoutubeRows(res.items ?? []);
      setYoutubeNextPageToken(res.next_page_token ?? null);
    } catch (error) {
      setYoutubeRows([]);
      setYoutubeNextPageToken(null);
      setYoutubeError(error instanceof Error ? error.message : "Could not load YouTube videos");
    } finally {
      setYoutubeLoading(false);
    }
  };

  useEffect(() => {
    if (provider !== "youtube") return;
    void refreshYouTubeConnection();
  }, [provider]);

  useEffect(() => {
    if (provider !== "youtube" || !youtubeLinked) return;
    void loadYouTubeVideos();
  }, [provider, youtubeSource, youtubeLinked]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; ok?: boolean } | null;
      if (!data || data.type !== "oauth:connected") return;
      if (data.ok) {
        void refreshYouTubeConnection();
        setYoutubeLinking(false);
      } else {
        setYoutubeLinkError("YouTube connection was not completed.");
        setYoutubeLinking(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const connectYouTube = async () => {
    setYoutubeLinking(true);
    setYoutubeLinkError(null);
    try {
      const res = await getConnectUrl("youtube");
      const popup = window.open(
        res.url,
        "oauth-connect-youtube",
        "width=720,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes",
      );
      if (!popup) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setYoutubeLinkError(error instanceof Error ? error.message : "Could not start YouTube linking.");
      setYoutubeLinking(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label className="ui-form-field">
        <span>Video provider</span>
        <KidDropdown
          value={provider}
          onChange={(value) => onProviderChange(value as "youtube" | "r2")}
          ariaLabel="Video provider"
          fullWidth
          options={[
            { value: "youtube", label: "YouTube" },
            { value: "r2", label: "Tenant-hosted video" },
          ]}
        />
      </label>
      {provider === "youtube" ? (
        <div className="track-lessons-youtube-panel">
          <div className="track-lessons-upload-flow__status">
            <span
              className={`track-lessons-upload-flow__badge ${
                hasYoutubeSource
                  ? "track-lessons-upload-flow__badge--linked"
                  : "track-lessons-upload-flow__badge--pending"
              }`}
            >
              {hasYoutubeSource ? "Linked to lesson video" : "Not linked yet"}
            </span>
            <span className="track-lessons-upload-flow__source">
              {hasYoutubeSource ? youtubeVideoId : "Select or paste a YouTube video to link this lesson video."}
            </span>
          </div>
          <label className="ui-form-field">
            <span>YouTube video ID</span>
            <input
              value={source}
              onChange={(event) =>
                onSourceChange(extractYouTubeId(event.target.value) || event.target.value)
              }
              placeholder="dQw4w9WgXcQ"
            />
          </label>
          <div className="track-lessons-actions">
            <KidDropdown
              value={youtubeSource}
              onChange={(value) => setYoutubeSource(value as "mine" | "public")}
              ariaLabel="YouTube source"
              disabled={youtubeLinked === false}
              options={[
                { value: "mine", label: "My channel (listed + unlisted)" },
                { value: "public", label: "Public YouTube search" },
              ]}
            />
            <input
              value={youtubeQuery}
              onChange={(event) => setYoutubeQuery(event.target.value)}
              placeholder={youtubeSource === "mine" ? "Search your videos" : "Search public videos"}
              disabled={youtubeLinked === false}
            />
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => void loadYouTubeVideos()}
              disabled={youtubeLinked === false || youtubeLoading}
            >
              Search
            </button>
          </div>
          {youtubeLinked === false ? (
            <div className="track-lessons-actions" style={{ alignItems: "center" }}>
              <p className="track-lessons-help" style={{ margin: 0 }}>
                Connect YouTube to use search and channel video browsing.
              </p>
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => void connectYouTube()}
                disabled={youtubeLinking}
              >
                {youtubeLinking ? "Opening YouTube link..." : "Link YouTube account"}
              </button>
            </div>
          ) : null}
          {youtubeLinkError ? <p className="track-lessons-help">{youtubeLinkError}</p> : null}
          {youtubeLoading ? <p className="track-lessons-help">Loading YouTube videos…</p> : null}
          {youtubeError ? <p className="track-lessons-help">{youtubeError}</p> : null}
          <div className="track-lessons-grid">
            {youtubeRows.map((video) => (
              <button
                key={video.id}
                type="button"
                className={`track-lessons-youtube-item ${source === video.id ? "track-lessons-youtube-item--selected" : ""}`}
                onClick={() => {
                  onSourceChange(video.id);
                  addRecentYoutube(video.id, video.title || video.id);
                }}
              >
                <span>{video.title || video.id}</span>
                <small>{video.privacy_status || "video"}</small>
              </button>
            ))}
          </div>
          {youtubeNextPageToken ? (
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => void loadYouTubeVideos(youtubeNextPageToken)}
              disabled={youtubeLinked === false || youtubeLoading}
            >
              Load more
            </button>
          ) : null}
          {recentYoutube.length > 0 ? (
            <>
              <p className="track-lessons-help">Recent videos</p>
              <div className="track-lessons-actions">
                {recentYoutube.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="kid-button kid-button--ghost"
                    onClick={() => onSourceChange(item.id)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <p className="track-lessons-help">
            Paste any YouTube URL and it auto-converts to a video ID.
          </p>
          {youtubeVideoId ? (
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => addRecentYoutube(youtubeVideoId, youtubeVideoId)}
            >
              Save current ID to recent
            </button>
          ) : null}
        </div>
      ) : null}
      {provider === "r2" ? (
        <>
          <div className="track-lessons-upload-flow">
            <label className="ui-form-field">
              <span>Hosted video key</span>
              <input
                value={source}
                onChange={(event) => onSourceChange(normalizeR2Input(event.target.value))}
                placeholder="videos/lesson-1.mp4"
              />
            </label>
            <p className="track-lessons-help">
              Paste either a hosted video URL or storage key. URLs are auto-converted to storage keys.
            </p>
            <div className="track-lessons-upload-flow__steps" aria-label="Upload flow">
              <span
                className={`track-lessons-upload-flow__step ${
                  selectedFile ? "track-lessons-upload-flow__step--done" : ""
                }`}
              >
                1. Choose file
              </span>
              <span className="track-lessons-upload-flow__arrow" aria-hidden>
                →
              </span>
              <span
                className={`track-lessons-upload-flow__step ${
                  isUploadingLocalFile ? "track-lessons-upload-flow__step--active" : ""
                }`}
              >
                2. Upload
              </span>
              <span className="track-lessons-upload-flow__arrow" aria-hidden>
                →
              </span>
              <span
                className={`track-lessons-upload-flow__step ${
                  hasHostedSource ? "track-lessons-upload-flow__step--done" : ""
                }`}
              >
                3. Key auto-fills
              </span>
            </div>
            {onUploadLocalFile ? (
              <div className="track-lessons-inline-grid">
                <label className="ui-form-field">
                  <span>Upload local file</span>
                  <div className="track-lessons-file-picker">
                    <input
                      ref={localFileInputRef}
                      type="file"
                      accept="video/*"
                      className="track-lessons-file-picker__native"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="kid-button kid-button--ghost"
                      onClick={() => localFileInputRef.current?.click()}
                    >
                      Choose file
                    </button>
                    <span className="track-lessons-file-picker__name">
                      {selectedFile?.name ?? "No file selected"}
                    </span>
                  </div>
                </label>
                <div style={{ display: "grid", alignContent: "end" }}>
                  <button
                    type="button"
                    className="kid-button kid-button--ghost"
                    disabled={!selectedFile || isUploadingLocalFile}
                    onClick={async () => {
                      if (!selectedFile) return;
                      await onUploadLocalFile(selectedFile);
                      setSelectedFile(null);
                    }}
                  >
                    {isUploadingLocalFile ? "Uploading..." : "Upload to tenant storage"}
                  </button>
                </div>
              </div>
            ) : null}
            {localUploadError ? <p className="track-lessons-help">{localUploadError}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
