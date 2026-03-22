import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

export interface SearchableDropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  searchText?: string;
}

interface SearchableDropdownProps {
  value: string;
  options: SearchableDropdownOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  disabled?: boolean;
  disableSearch?: boolean;
  fullWidth?: boolean;
  minWidth?: number;
}

export function SearchableDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyLabel = "No results found",
  emptyActionLabel,
  onEmptyAction,
  disabled = false,
  disableSearch = false,
  fullWidth = false,
  minWidth,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>(undefined);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (disableSearch) return options;
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.searchText ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [disableSearch, options, query]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPad = 8;
      const desiredWidth = Math.max(rect.width, minWidth ?? 0);

      let left = rect.left;
      if (left + desiredWidth > window.innerWidth - viewportPad) {
        left = window.innerWidth - desiredWidth - viewportPad;
      }
      left = Math.max(viewportPad, left);

      const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
      const spaceAbove = rect.top - viewportPad;
      const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(360, available - viewportPad));
      const top = openUp
        ? Math.max(viewportPad, rect.top - maxHeight - 6)
        : Math.min(window.innerHeight - maxHeight - viewportPad, rect.bottom + 6);

      setMenuStyle({
        position: "fixed",
        top,
        left,
        width: desiredWidth,
        maxHeight,
      });
    }

    updateMenuPosition();
    const raf = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, minWidth]);

  return (
    <div
      ref={wrapRef}
      className={`kid-dropdown ${fullWidth ? "kid-dropdown--full" : ""}`}
      style={minWidth ? { minWidth } : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className="kid-dropdown__trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            const next = !prev;
            if (next) setQuery("");
            return next;
          });
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="kid-dropdown__value">{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={16}
          className={`kid-dropdown__chevron ${open ? "kid-dropdown__chevron--open" : ""}`}
          aria-hidden
        />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="kid-dropdown__menu searchable-dropdown__menu"
          aria-label={ariaLabel}
          style={menuStyle}
        >
          <div className="searchable-dropdown__search-wrap">
            <Search size={14} aria-hidden />
            <input
              ref={searchInputRef}
              type="search"
              className="searchable-dropdown__search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={disableSearch ? "No instructors available" : searchPlaceholder}
              aria-label={searchPlaceholder}
              disabled={disableSearch}
            />
          </div>
          <div className="searchable-dropdown__options" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="searchable-dropdown__empty-wrap">
                <p className="searchable-dropdown__empty">{emptyLabel}</p>
                {emptyActionLabel && onEmptyAction ? (
                  <button
                    type="button"
                    className="searchable-dropdown__empty-action"
                    onClick={() => {
                      onEmptyAction();
                      setOpen(false);
                    }}
                  >
                    {emptyActionLabel}
                  </button>
                ) : null}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`kid-dropdown__option ${isSelected ? "kid-dropdown__option--selected" : ""}`}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
