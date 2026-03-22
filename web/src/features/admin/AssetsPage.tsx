import { useEffect, useMemo, useState } from "react";
import {
  Upload,
  Search,
  Grid3X3,
  List,
  Download,
  Pencil,
  Trash2,
  Link,
  FileText,
  Video,
  Image,
  FileCode,
  Presentation,
  HardDrive,
  X,
} from "lucide-react";
import { getAssetLibrary, type Asset as ApiAsset, type GlobalAsset } from "../../lib/api/assets";
import { KidDropdown } from "../../components/ui";
import "../../components/ui/ui.css";
import "./assets.css";

type AssetType = "document" | "text" | "video" | "image" | "presentation" | "sheet";
const ASSETS_PER_PAGE = 50;

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  size: string;
  usedIn: number;
  uploadedBy: string;
  date: string;
}

const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "images", label: "Images" },
  { value: "videos", label: "Videos" },
  { value: "documents", label: "Documents" },
  { value: "text", label: "Text" },
  { value: "presentations", label: "Presentations" },
  { value: "sheets", label: "Sheets" },
];

function typeToFilter(type: AssetType): string {
  switch (type) {
    case "image": return "images";
    case "video": return "videos";
    case "document": return "documents";
    case "presentation": return "presentations";
    case "text": return "text";
    case "sheet": return "sheets";
    default: return "all";
  }
}

function TypeIcon({ type }: { type: AssetType }) {
  const props = { size: 32, "aria-hidden": true as const };
  switch (type) {
    case "document": return <FileText {...props} />;
    case "video": return <Video {...props} />;
    case "image": return <Image {...props} />;
    case "text": return <FileCode {...props} />;
    case "sheet": return <HardDrive {...props} />;
    case "presentation": return <Presentation {...props} />;
    default: return <FileText {...props} />;
  }
}

function typeColor(type: AssetType): string {
  switch (type) {
    case "document": return "var(--color-primary)";
    case "video": return "#8b5cf6";
    case "image": return "var(--color-success)";
    case "text": return "var(--color-warning)";
    case "sheet": return "#14b8a6";
    case "presentation": return "#ec4899";
    default: return "var(--color-text-secondary)";
  }
}

export function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size" | "type">("name");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    let mounted = true;
    function fromBytes(bytes: number | null): string {
      if (!bytes) return "—";
      if (bytes < 1024) return `${bytes}B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    }
    function mapType(raw: string): AssetType {
      const v = raw.toLowerCase();
      if (v.includes("video")) return "video";
      if (v.includes("image") || v.includes("sprite") || v.includes("background")) return "image";
      if (v.includes("text") || v.includes("code")) return "text";
      if (v.includes("sheet") || v.includes("excel") || v.includes("spreadsheet")) return "sheet";
      if (v.includes("presentation")) return "presentation";
      return "document";
    }
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const library = await getAssetLibrary();
        if (!mounted) return;
        const all = [
          ...library.own,
          ...library.shared,
          ...library.global_assets.map((g: GlobalAsset) => ({ ...g, owner_type: "global" })),
        ] as (ApiAsset & { owner_type: string })[];
        const mapped: Asset[] = all.map((a) => ({
          id: a.id,
          name: a.name,
          type: mapType(a.asset_type),
          size: fromBytes(a.file_size),
          usedIn: 0,
          uploadedBy: a.owner_type,
          date: a.created_at,
        }));
        setAssets(mapped);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load assets");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredAssets = useMemo(() => assets.filter((a) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query || a.name.toLowerCase().includes(query);
    const matchesType = typeFilter === "all" || typeToFilter(a.type) === typeFilter;
    return matchesSearch && matchesType;
  }), [assets, search, typeFilter]);

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    switch (sortBy) {
      case "name": return a.name.localeCompare(b.name);
      case "date": return new Date(b.date).getTime() - new Date(a.date).getTime();
      case "size": return parseSize(b.size) - parseSize(a.size);
      case "type": return a.type.localeCompare(b.type);
      default: return 0;
    }
  });

  function parseSize(s: string): number {
    const match = s.match(/^([\d.]+)\s*(KB|MB|GB)$/i);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "KB") return num * 1024;
    if (unit === "MB") return num * 1024 * 1024;
    if (unit === "GB") return num * 1024 * 1024 * 1024;
    return num;
  }

  const handleMockUpload = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 10;
      });
    }, 200);
  };

  const closeUploadDialog = () => {
    setShowUpload(false);
    setUploadProgress(0);
  };

  const storageUsed = 134;
  const storageTotal = 200;
  const storagePercent = Math.round((storageUsed / storageTotal) * 100);
  const showEmptyState = !loading && sortedAssets.length === 0;
  const totalPages = Math.max(1, Math.ceil(sortedAssets.length / ASSETS_PER_PAGE));
  const paginatedAssets = sortedAssets.slice(
    (page - 1) * ASSETS_PER_PAGE,
    page * ASSETS_PER_PAGE,
  );

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, sortBy]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="assets-page" role="main" aria-label="Asset management">
      <header className="assets-page__header">
        <h1 className="assets-page__title">Assets</h1>
        {error && <p className="assets-page__subtitle" style={{ color: "var(--color-error, #ef4444)" }}>{error}</p>}
        <button
          type="button"
          className="assets-page__btn assets-page__btn--primary"
          onClick={() => setShowUpload(true)}
        >
          <Upload size={18} /> Upload Asset
        </button>
      </header>

      <div className="assets-page__storage">
        <div className="assets-page__storage-info">
          <HardDrive size={18} aria-hidden />
          <span>
            {storageUsed}GB / {storageTotal}GB used ({storagePercent}%)
          </span>
        </div>
        <div className="assets-page__storage-bar">
          <div
            className="assets-page__storage-fill"
            style={{ width: `${storagePercent}%` }}
          />
        </div>
      </div>

      {/* Filter/Sort bar */}
      <div className="assets-page__toolbar">
        <div className="assets-page__search-wrap">
          <Search size={18} className="assets-page__search-icon" aria-hidden />
          <input
            type="search"
            placeholder="Search assets..."
            className="assets-page__search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search assets"
          />
        </div>
        <KidDropdown
          value={typeFilter}
          onChange={setTypeFilter}
          ariaLabel="Filter by type"
          minWidth={160}
          options={TYPE_FILTER_OPTIONS}
        />
        <KidDropdown
          value={sortBy}
          onChange={(v) => setSortBy(v as "name" | "date" | "size" | "type")}
          ariaLabel="Sort by"
          minWidth={140}
          options={[
            { value: "name", label: "Name" },
            { value: "date", label: "Date" },
            { value: "size", label: "Size" },
            { value: "type", label: "Type" },
          ]}
        />
        <div className="assets-page__view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`assets-page__view-btn ${viewMode === "grid" ? "assets-page__view-btn--active" : ""}`}
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            aria-label="Grid view"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            type="button"
            className={`assets-page__view-btn ${viewMode === "list" ? "assets-page__view-btn--active" : ""}`}
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
            aria-label="List view"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {loading && <p className="assets-page__subtitle">Loading assets...</p>}

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="assets-page__grid">
          {showEmptyState ? (
            <div className="assets-page__empty-state" role="status" aria-live="polite">
              <p className="assets-page__empty-title">No assets yet</p>
              <p className="assets-page__empty-hint">
                Upload your first approved asset to start building your library.
              </p>
            </div>
          ) : (
            paginatedAssets.map((asset) => (
              <div key={asset.id} className="assets-page__card">
                <div
                  className="assets-page__card-preview"
                  style={{ "--asset-color": typeColor(asset.type) } as React.CSSProperties}
                >
                  <TypeIcon type={asset.type} />
                </div>
                <div className="assets-page__card-body">
                  <span className="assets-page__card-name" title={asset.name}>
                    {asset.name}
                  </span>
                  <span className="assets-page__card-meta">
                    {asset.size} · {asset.date}
                  </span>
                  <span className="assets-page__card-badge">
                    Used in {asset.usedIn} lesson{asset.usedIn !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="assets-page__card-actions">
                  <button type="button" className="assets-page__card-action" title="Download" aria-label="Download">
                    <Download size={16} />
                  </button>
                  <button type="button" className="assets-page__card-action" title="Rename" aria-label="Rename">
                    <Pencil size={16} />
                  </button>
                  <button type="button" className="assets-page__card-action" title="Delete" aria-label="Delete">
                    <Trash2 size={16} />
                  </button>
                  <button type="button" className="assets-page__card-action" title="Copy URL" aria-label="Copy URL">
                    <Link size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="assets-page__table-wrap">
          <table className="assets-page__table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Used In</th>
                <th>Uploaded By</th>
                <th>Date</th>
                <th className="assets-page__th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="assets-page__table-empty">
                    Loading assets...
                  </td>
                </tr>
              ) : sortedAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="assets-page__table-empty">
                    No assets yet - upload your first approved asset to get started.
                  </td>
                </tr>
              ) : (
                paginatedAssets.map((asset) => (
                  <tr key={asset.id}>
                    <td>
                      <div
                        className="assets-page__list-preview"
                        style={{ "--asset-color": typeColor(asset.type) } as React.CSSProperties}
                      >
                        <TypeIcon type={asset.type} />
                      </div>
                    </td>
                    <td>
                      <span className="assets-page__list-name">{asset.name}</span>
                    </td>
                    <td className="assets-page__list-type">{asset.type}</td>
                    <td>{asset.size}</td>
                    <td>{asset.usedIn} lessons</td>
                    <td>{asset.uploadedBy}</td>
                    <td><time dateTime={asset.date}>{asset.date}</time></td>
                    <td className="assets-page__td-actions">
                      <button type="button" className="assets-page__action-btn" title="Download" aria-label="Download">
                        <Download size={16} />
                      </button>
                      <button type="button" className="assets-page__action-btn" title="Rename" aria-label="Rename">
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="assets-page__action-btn" title="Delete" aria-label="Delete">
                        <Trash2 size={16} />
                      </button>
                      <button type="button" className="assets-page__action-btn" title="Copy URL" aria-label="Copy URL">
                        <Link size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sortedAssets.length > 0 && (
        <div className="assets-page__pagination" role="navigation" aria-label="Assets pagination">
          <span className="assets-page__pagination-meta">
            Showing {(page - 1) * ASSETS_PER_PAGE + 1}-
            {Math.min(page * ASSETS_PER_PAGE, sortedAssets.length)} of {sortedAssets.length}
          </span>
          <div className="assets-page__pagination-actions">
            <button
              type="button"
              className="assets-page__btn assets-page__btn--secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span className="assets-page__pagination-page">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="assets-page__btn assets-page__btn--secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="assets-page__dialog-backdrop" role="presentation" onClick={closeUploadDialog}>
          <div
            className="assets-page__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Upload asset"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="assets-page__dialog-header">
              <h3 className="assets-page__dialog-title">Upload Asset</h3>
              <button
                type="button"
                className="assets-page__dialog-close"
                onClick={closeUploadDialog}
                aria-label="Close upload dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div
              className="assets-page__dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
            >
              <Upload size={40} className="assets-page__dropzone-icon" aria-hidden />
              <p className="assets-page__dropzone-text">
                Drag and drop files here, or click to browse
              </p>
              <button
                type="button"
                className="assets-page__btn assets-page__btn--secondary"
                onClick={handleMockUpload}
              >
                Browse files
              </button>
              <p className="assets-page__dropzone-hint">
                Accepted: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG, GIF, MP4, MP3, INO, PY
              </p>
              {uploadProgress > 0 && (
                <div className="assets-page__upload-progress">
                  <div
                    className="assets-page__upload-progress-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
