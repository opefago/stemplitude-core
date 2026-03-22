import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Users,
  Building2,
  GraduationCap,
  UserCheck,
  Shield,
  BookOpen,
  FlaskConical,
  Layout,
  FileStack,
  FileCheck,
  CreditCard,
  Repeat,
  Key,
  Image,
  Mail,
  Bell,
  ScrollText,
  UserCog,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Copy,
  Plus,
  X,
  Loader2,
  Database,
} from "lucide-react";
import {
  getEntityTypes,
  queryEntity,
  type EntityTypeDef,
  type EntityFilterDef,
} from "../../lib/api/platform";
import "./entity-browser.css";

/* -------------------------------------------------------------------------- */
/* Icon map — maps backend icon string to Lucide component                    */
/* -------------------------------------------------------------------------- */

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Users,
  Building2,
  GraduationCap,
  UserCheck,
  Shield,
  BookOpen,
  FlaskConical,
  Layout,
  FileStack,
  FileCheck,
  CreditCard,
  Repeat,
  Key,
  Image,
  Mail,
  Bell,
  ScrollText,
  UserCog,
  Database,
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function truncateUuid(uuid: string): string {
  return uuid.length > 12 ? `${uuid.slice(0, 8)}…` : uuid;
}

function isUuidLike(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{8}-/i.test(v);
}

const PAGE_SIZE = 25;

interface CustomParam {
  key: string;
  value: string;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function EntityBrowserPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [entityTypes, setEntityTypes] = useState<EntityTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<EntityTypeDef | null>(null);

  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [queryLoading, setQueryLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [customParams, setCustomParams] = useState<CustomParam[]>([]);
  const [newParamKey, setNewParamKey] = useState("");
  const [newParamValue, setNewParamValue] = useState("");

  useEffect(() => {
    setLoading(true);
    getEntityTypes()
      .then((res) => {
        setEntityTypes(res.entities);
        const preselect = searchParams.get("selected");
        if (preselect) {
          const match = res.entities.find((e) => e.key === preselect);
          if (match) setSelectedEntity(match);
          setSearchParams({}, { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecords = useCallback(async () => {
    if (!selectedEntity) return;
    setQueryLoading(true);
    try {
      const allFilters: Record<string, string> = { ...filterValues };
      for (const cp of customParams) {
        if (cp.key && cp.value) allFilters[cp.key] = cp.value;
      }
      const res = await queryEntity(selectedEntity.key, {
        search: search || undefined,
        sort: sortCol,
        dir: sortDir,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        filters: allFilters,
      });
      setRecords(res.items);
      setTotal(res.total);
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setQueryLoading(false);
    }
  }, [selectedEntity, filterValues, customParams, search, sortCol, sortDir, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSelectEntity = (et: EntityTypeDef) => {
    setSelectedEntity(et);
    setPage(1);
    setSortCol("id");
    setSortDir("desc");
    setSearch("");
    setFilterValues({});
    setCustomParams([]);
  };

  const handleBack = () => {
    setSelectedEntity(null);
    setRecords([]);
    setTotal(0);
    setFilterValues({});
    setCustomParams([]);
    setSearch("");
  };

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleFilterChange = (column: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [column]: value }));
    setPage(1);
  };

  const handleAddCustomParam = () => {
    if (!newParamKey.trim()) return;
    setCustomParams((prev) => [...prev, { key: newParamKey.trim(), value: newParamValue.trim() }]);
    setNewParamKey("");
    setNewParamValue("");
    setPage(1);
  };

  const handleRemoveCustomParam = (idx: number) => {
    setCustomParams((prev) => prev.filter((_, i) => i !== idx));
    setPage(1);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
  };

  const handleViewDetail = (entityKey: string, entityId: string) => {
    navigate(`/app/platform/entities/${entityKey}/${entityId}`);
  };

  const columns = selectedEntity?.display_columns ?? [];

  return (
    <div className="eb" role="main" aria-label="Entity Browser">
      {!selectedEntity ? (
        <section className="eb__grid-section" aria-label="Entity types">
          <h1 className="eb__title">Entity Browser</h1>
          <p className="eb__subtitle">Browse and inspect all database entities</p>
          {loading ? (
            <div className="eb__loading">
              <Loader2 size={32} className="eb__spinner" />
              Loading entities...
            </div>
          ) : (
            <div className="eb__grid">
              {entityTypes.map((et) => {
                const Icon = ICON_MAP[et.icon] || Database;
                return (
                  <button
                    key={et.key}
                    type="button"
                    className="eb__card"
                    onClick={() => handleSelectEntity(et)}
                    aria-label={`Browse ${et.label} (${et.count} records)`}
                  >
                    <div className="eb__card-icon-wrap">
                      <Icon size={32} className="eb__card-icon" aria-hidden />
                    </div>
                    <span className="eb__card-name">{et.label}</span>
                    <span className="eb__card-count">{et.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="eb__detail" aria-label={`${selectedEntity.label} records`}>
          <div className="eb__detail-header">
            <button type="button" className="eb__back-btn" onClick={handleBack}>
              <ChevronLeft size={20} aria-hidden />
              Back
            </button>
            <h2 className="eb__detail-title">
              {selectedEntity.label}
              <span className="eb__detail-count">
                {total.toLocaleString()} records
              </span>
            </h2>
          </div>

          {/* Search bar */}
          <div className="eb__filter-bar">
            <div className="eb__search-wrap">
              <Search size={18} className="eb__search-icon" aria-hidden />
              <input
                type="search"
                placeholder="Search across text fields..."
                className="eb__search-input"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                aria-label="Text search"
              />
            </div>
          </div>

          {/* Entity-specific filters */}
          {selectedEntity.filters.length > 0 && (
            <div className="eb__filters-panel">
              <h3 className="eb__filters-title">Filters</h3>
              <div className="eb__filters-grid">
                {selectedEntity.filters.map((f: EntityFilterDef) => (
                  <div key={f.column} className="eb__filter-field">
                    <label className="eb__filter-label">{f.label}</label>
                    {f.type === "select" && f.options ? (
                      <select
                        className="eb__filter-select"
                        value={filterValues[f.column] ?? ""}
                        onChange={(e) => handleFilterChange(f.column, e.target.value)}
                      >
                        <option value="">All</option>
                        {f.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : f.type === "boolean" ? (
                      <select
                        className="eb__filter-select"
                        value={filterValues[f.column] ?? ""}
                        onChange={(e) => handleFilterChange(f.column, e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="eb__filter-input"
                        placeholder={f.type === "uuid" ? "UUID..." : `${f.label}...`}
                        value={filterValues[f.column] ?? ""}
                        onChange={(e) => handleFilterChange(f.column, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom search parameters */}
          <div className="eb__custom-params">
            <h3 className="eb__filters-title">Custom Parameters</h3>
            {customParams.map((cp, idx) => (
              <div key={idx} className="eb__custom-param-row">
                <code className="eb__custom-param-key">{cp.key}</code>
                <span className="eb__custom-param-eq">=</span>
                <code className="eb__custom-param-val">{cp.value}</code>
                <button
                  type="button"
                  className="eb__custom-param-remove"
                  onClick={() => handleRemoveCustomParam(idx)}
                  aria-label={`Remove ${cp.key} filter`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="eb__custom-param-add">
              <input
                type="text"
                className="eb__filter-input eb__filter-input--sm"
                placeholder="Column name"
                value={newParamKey}
                onChange={(e) => setNewParamKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomParam()}
              />
              <input
                type="text"
                className="eb__filter-input eb__filter-input--sm"
                placeholder="Value"
                value={newParamValue}
                onChange={(e) => setNewParamValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomParam()}
              />
              <button
                type="button"
                className="eb__add-param-btn"
                onClick={handleAddCustomParam}
                disabled={!newParamKey.trim()}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="eb__table-wrap">
            {queryLoading && (
              <div className="eb__table-loading">
                <Loader2 size={20} className="eb__spinner" /> Loading...
              </div>
            )}
            <table className="eb__table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="eb__th">
                      <button type="button" className="eb__th-btn" onClick={() => handleSort(col)}>
                        {col.replace(/_/g, " ")}
                        <ArrowUpDown
                          size={14}
                          className={`eb__th-icon ${sortCol === col ? "eb__th-icon--active" : ""}`}
                          aria-hidden
                        />
                      </button>
                    </th>
                  ))}
                  <th className="eb__th eb__th--actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && !queryLoading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="eb__td eb__empty-row">
                      No records found
                    </td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const recordId = String(record.id ?? "");
                    return (
                      <tr key={recordId} className="eb__tr">
                        {columns.map((col) => {
                          const val = record[col];
                          return (
                            <td key={col} className="eb__td">
                              {col === "id" ? (
                                <button
                                  type="button"
                                  className="eb__uuid-link"
                                  onClick={() => handleViewDetail(selectedEntity.key, recordId)}
                                  title={recordId}
                                >
                                  {truncateUuid(recordId)}
                                </button>
                              ) : typeof val === "boolean" ? (
                                <span className={`eb__badge eb__badge--${val ? "active" : "inactive"}`}>
                                  {val ? "Yes" : "No"}
                                </span>
                              ) : isUuidLike(val) ? (
                                <code className="eb__uuid" title={String(val)}>
                                  {truncateUuid(String(val))}
                                </code>
                              ) : val == null ? (
                                <span className="eb__null">null</span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                        <td className="eb__td eb__td--actions">
                          <button
                            type="button"
                            className="eb__action-btn"
                            onClick={() => handleCopyId(recordId)}
                            title="Copy ID"
                            aria-label="Copy ID"
                          >
                            <Copy size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="eb__pagination">
            <button
              type="button"
              className="eb__page-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft size={18} aria-hidden /> Prev
            </button>
            <span className="eb__page-info">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="eb__page-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
