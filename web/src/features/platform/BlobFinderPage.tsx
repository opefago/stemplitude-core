import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  File,
  FolderClosed,
  Loader2,
  Search,
  X,
} from "lucide-react";
import {
  getBlobDownloadUrl,
  getBlobItem,
  queryBlobs,
  type BlobDetailItem,
  type BlobListItem,
} from "../../lib/api/platform";
import { KidCheckbox } from "../../components/ui";
import "../../components/ui/ui.css";
import "./blob-finder.css";

function formatBytes(size?: number | null): string {
  if (size == null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleString();
}

export function BlobFinderPage() {
  const [keyInput, setKeyInput] = useState("");
  const [mode, setMode] = useState<"exact" | "contains">("contains");
  const [includeFolders, setIncludeFolders] = useState(true);
  const [maxRows, setMaxRows] = useState(100);
  const [prefix, setPrefix] = useState("");

  const [folders, setFolders] = useState<string[]>([]);
  const [items, setItems] = useState<BlobListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<BlobDetailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  // Holds the params that were last submitted — prefix updates immediately on
  // folder navigation; the rest only update when the user clicks Find.
  const [submittedKey, setSubmittedKey] = useState("");
  const [submittedMode, setSubmittedMode] = useState<"exact" | "contains">("contains");
  const [submittedFolders, setSubmittedFolders] = useState(true);
  const [submittedMax, setSubmittedMax] = useState(100);

  const refresh = async (params: {
    key: string;
    mode: "exact" | "contains";
    folders: boolean;
    max: number;
    prefix: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await queryBlobs({
        key: params.key.trim() || undefined,
        mode: params.mode,
        folders: params.folders,
        max: params.max,
        prefix: params.prefix,
      });
      setFolders(res.folders);
      setItems(res.items);
    } catch (err) {
      setFolders([]);
      setItems([]);
      setError(err instanceof Error ? err.message : "Failed to query blob store.");
    } finally {
      setLoading(false);
    }
  };

  // Run once on mount with default params.
  useEffect(() => {
    refresh({ key: "", mode: "contains", folders: true, max: 100, prefix: "" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmittedKey(keyInput);
    setSubmittedMode(mode);
    setSubmittedFolders(includeFolders);
    setSubmittedMax(maxRows);
    refresh({ key: keyInput, mode, folders: includeFolders, max: maxRows, prefix });
  };

  const navigateTo = (nextPrefix: string) => {
    setPrefix(nextPrefix);
    setSelectedKey(null);
    setSelectedItem(null);
    refresh({ key: submittedKey, mode: submittedMode, folders: submittedFolders, max: submittedMax, prefix: nextPrefix });
  };

  const handleFolderClick = (folderPrefix: string) => navigateTo(folderPrefix);

  const handleSelectItem = async (itemKey: string) => {
    setSelectedKey(itemKey);
    setDetailsOpen(true);
    setDetailLoading(true);
    setError(null);
    try {
      const res = await getBlobItem(itemKey);
      setSelectedItem(res.item);
    } catch (err) {
      setSelectedItem(null);
      setError(err instanceof Error ? err.message : "Failed to load blob details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const openItemUrl = async () => {
    if (!selectedItem?.key) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await getBlobDownloadUrl(selectedItem.key);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get download URL.");
    } finally {
      setActionLoading(false);
    }
  };

  const breadcrumbs = (() => {
    if (!prefix) return [];
    const raw = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    if (!raw) return [];
    return raw.split("/").map((label, i, parts) => ({
      label,
      value: `${parts.slice(0, i + 1).join("/")}/`,
    }));
  })();

  return (
    <div className="bf-page">
      <form className="bf-controls" onSubmit={onSubmit}>
        <label className="bf-field bf-field--key">
          <span>Key</span>
          <div className="bf-key-wrap">
            <Search size={16} />
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter key or folder prefix..."
            />
          </div>
        </label>

        <div className="bf-field">
          <span>Mode</span>
          <div className="bf-select-wrap">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "exact" | "contains")}
              aria-label="Search mode"
            >
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
            </select>
          </div>
        </div>

        <label className="bf-field">
          <span>Max</span>
          <input
            type="number"
            min={1}
            max={200}
            value={maxRows}
            onChange={(e) => setMaxRows(Number(e.target.value) || 100)}
          />
        </label>

        <KidCheckbox
          id="bf-include-folders"
          className="bf-checkbox"
          checked={includeFolders}
          onChange={setIncludeFolders}
        >
          Folders
        </KidCheckbox>

        <button type="submit" className="bf-search-btn" disabled={loading}>
          {loading ? <Loader2 size={16} className="bf-spin" /> : <Search size={16} />}
          Find
        </button>
      </form>

      <div className="bf-breadcrumbs">
        <button
          type="button"
          className="bf-crumb"
          onClick={() => navigateTo("")}
          disabled={!prefix}
        >
          root
        </button>
        {breadcrumbs.map((crumb) => (
          <button
            key={crumb.value}
            type="button"
            className="bf-crumb"
            onClick={() => navigateTo(crumb.value)}
          >
            / {crumb.label}
          </button>
        ))}
      </div>

      {error && <div className="bf-error">{error}</div>}

      <div className="bf-layout">
        <section className="bf-results">
          <div className="bf-results__head">
            <h2>Results</h2>
            <span>{folders.length + items.length} entries</span>
          </div>
          {loading ? (
            <div className="bf-loading">
              <Loader2 size={18} className="bf-spin" /> Loading...
            </div>
          ) : (
            <div className="bf-list">
              {prefix && (
                <button type="button" className="bf-row bf-row--folder" onClick={() => {
                  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                  const idx = trimmed.lastIndexOf("/");
                  navigateTo(idx >= 0 ? `${trimmed.slice(0, idx)}/` : "");
                }}>
                  <ArrowLeft size={16} /> ..
                </button>
              )}

              {folders.map((folder) => (
                <button
                  type="button"
                  key={folder}
                  className="bf-row bf-row--folder"
                  onClick={() => handleFolderClick(folder)}
                >
                  <FolderClosed size={18} strokeWidth={2.6} className="bf-row__icon bf-row__icon--folder" />
                  <span>{folder}</span>
                </button>
              ))}

              {items.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`bf-row bf-row--item ${selectedKey === item.key ? "is-selected" : ""}`}
                  onClick={() => handleSelectItem(item.key)}
                >
                  <File size={18} strokeWidth={2.2} className="bf-row__icon bf-row__icon--file" />
                  <span className="bf-row__key">{item.key}</span>
                  <span className="bf-row__meta">{formatBytes(item.size)}</span>
                </button>
              ))}

              {folders.length === 0 && items.length === 0 && (
                <div className="bf-empty">No folders or keys found.</div>
              )}
            </div>
          )}
        </section>
      </div>

      {detailsOpen && (
        <div className="bf-dialog-overlay" onClick={() => setDetailsOpen(false)}>
          <div className="bf-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="bf-dialog__head">
              <div className="bf-dialog__title-group">
                <File size={20} strokeWidth={2} className="bf-dialog__file-icon" />
                <h3 className="bf-dialog__title">
                  {(() => {
                    const parts = (selectedItem?.key ?? selectedKey ?? "").split("/").filter(Boolean);
                    return parts[parts.length - 1] ?? "File Details";
                  })()}
                </h3>
              </div>
              <button
                type="button"
                className="bf-dialog__close"
                onClick={() => setDetailsOpen(false)}
                aria-label="Close file info"
              >
                <X size={16} />
              </button>
            </div>

            {detailLoading && (
              <div className="bf-loading">
                <Loader2 size={18} className="bf-spin" /> Loading details…
              </div>
            )}

            {selectedItem && !detailLoading && (
              <div className="bf-detail-card">
                <div className="bf-meta-grid">
                  <div className="bf-meta-item">
                    <span className="bf-meta-label">Size</span>
                    <span className="bf-meta-value">{formatBytes(selectedItem.size)}</span>
                  </div>
                  <div className="bf-meta-item">
                    <span className="bf-meta-label">Content Type</span>
                    <span className="bf-meta-value">{selectedItem.content_type || "—"}</span>
                  </div>
                  <div className="bf-meta-item">
                    <span className="bf-meta-label">Last Modified</span>
                    <span className="bf-meta-value">{formatDate(selectedItem.last_modified)}</span>
                  </div>
                  <div className="bf-meta-item">
                    <span className="bf-meta-label">Storage Class</span>
                    <span className="bf-meta-value bf-meta-value--badge">
                      {selectedItem.storage_class || "STANDARD"}
                    </span>
                  </div>
                  <div className="bf-meta-item bf-meta-item--full">
                    <span className="bf-meta-label">ETag</span>
                    <code className="bf-meta-value bf-meta-value--mono">{selectedItem.etag || "—"}</code>
                  </div>
                  <div className="bf-meta-item bf-meta-item--full">
                    <div className="bf-meta-label-row">
                      <span className="bf-meta-label">Full Key</span>
                      <button
                        type="button"
                        className="bf-copy-btn"
                        onClick={() => copyKey(selectedItem.key)}
                        aria-label="Copy full key"
                      >
                        {keyCopied ? <Check size={12} /> : <Copy size={12} />}
                        {keyCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <code className="bf-meta-value bf-meta-value--mono">{selectedItem.key}</code>
                  </div>
                </div>

                {selectedItem.metadata && Object.keys(selectedItem.metadata).length > 0 && (
                  <div className="bf-custom-meta">
                    <p className="bf-custom-meta__label">Custom Metadata</p>
                    {Object.entries(selectedItem.metadata).map(([k, v]) => (
                      <div key={k} className="bf-meta-item bf-meta-item--full">
                        <span className="bf-meta-label">{k}</span>
                        <span className="bf-meta-value">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bf-actions">
                  <button type="button" className="bf-actions__btn bf-actions__btn--primary" onClick={openItemUrl} disabled={actionLoading}>
                    {actionLoading ? <Loader2 size={16} className="bf-spin" /> : <Download size={16} />}
                    Download
                  </button>
                  <button type="button" className="bf-actions__btn" onClick={openItemUrl} disabled={actionLoading}>
                    {actionLoading ? <Loader2 size={16} className="bf-spin" /> : <Eye size={16} />}
                    View in browser
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
