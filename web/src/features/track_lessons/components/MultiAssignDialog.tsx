import { useMemo, useRef, useState } from "react";
import { KidCheckbox, KidDialog } from "../../../components/ui";

const PAGE_SIZE = 20;

type MultiAssignDialogItem = {
  id: string;
  label: string;
};

type MultiAssignDialogProps = {
  isOpen: boolean;
  title: string;
  items: MultiAssignDialogItem[];
  selectedIds: string[];
  confirmLabel: string;
  emptyLabel: string;
  searchPlaceholder: string;
  isSubmitting?: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function MultiAssignDialog({
  isOpen,
  title,
  items,
  selectedIds,
  confirmLabel,
  emptyLabel,
  searchPlaceholder,
  isSubmitting = false,
  onSelectedIdsChange,
  onConfirm,
  onClose,
}: MultiAssignDialogProps) {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filteredItems = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.label.toLowerCase().includes(needle));
  }, [items, searchQuery]);
  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
  const hasMore = visibleCount < filteredItems.length;

  const loadMore = () => {
    if (!hasMore) return;
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredItems.length));
  };

  const toggleId = (id: string) => {
    onSelectedIdsChange(
      selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id],
    );
  };

  return (
    <KidDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showActions={false}
      closeVariant="neutral"
    >
      <div className="track-lessons-lesson-picker">
        <label className="ui-form-field">
          <span>Search</span>
          <div className="track-lessons-lesson-picker__search">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={searchPlaceholder}
            />
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => {
                setSearchQuery(searchInput);
                setVisibleCount(PAGE_SIZE);
                listRef.current?.scrollTo({ top: 0 });
              }}
            >
              Search
            </button>
          </div>
        </label>
        <div
          ref={listRef}
          className="track-lessons-lesson-picker__list"
          onScroll={(event) => {
            const target = event.currentTarget;
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
              loadMore();
            }
          }}
        >
          {filteredItems.length === 0 ? (
            <div className="track-lessons-lesson-picker__empty">
              <p className="track-lessons-help">{emptyLabel}</p>
            </div>
          ) : (
            visibleItems.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`track-lessons-lesson-picker__item ${checked ? "track-lessons-lesson-picker__item--selected" : ""}`}
                >
                  <KidCheckbox
                    checked={checked}
                    compact
                    ariaLabel={`Select ${item.label}`}
                    onChange={() => toggleId(item.id)}
                  />
                  <span className="track-lessons-lesson-picker__title">{item.label}</span>
                </label>
              );
            })
          )}
          {hasMore ? (
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={loadMore}
            >
              Load more
            </button>
          ) : null}
        </div>
        <p className="track-lessons-help">
          Showing {visibleItems.length} of {filteredItems.length} matching items.
        </p>
        <div className="track-lessons-actions">
          <button
            type="button"
            className="track-lessons-cancel-button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="kid-button"
            disabled={selectedIds.length === 0 || isSubmitting}
            onClick={() => void onConfirm()}
          >
            {isSubmitting ? "Assigning..." : `${confirmLabel} (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </KidDialog>
  );
}
