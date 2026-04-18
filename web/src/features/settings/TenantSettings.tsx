import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useFeatureFlag as useFeatureFlagHook } from "../../providers/FeatureFlagProvider";
import type { HomepageTemplateDTO } from "../../lib/api/homepageTemplates";
import { listHomepageTemplates, listHomepageTemplateCategories } from "../../lib/api/homepageTemplates";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  GripVertical,
  LayoutTemplate,
  type LucideIcon,
  Monitor,
  Paintbrush,
  Search,
  Smartphone,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { uploadAsset } from "../../lib/api/assets";
import { TenantHomepage } from "../../components/tenant-homepage/TenantHomepage";
import { useTenant } from "../../providers/TenantProvider";
import {
  createSupportAccessGrant,
  decideFranchiseJoinRequest,
  getSupportAccessOptions,
  getTenantById,
  getTenantLabSettings,
  listFranchiseJoinRequests,
  listSupportAccessGrants,
  patchTenant,
  revokeSupportAccessGrant,
  submitFranchiseJoinRequest,
  updateTenantLabSetting,
  updateTenantSettings,
  type FranchiseGovernanceMode,
  type FranchiseJoinRequest,
  type SupportAccessGrant,
  type SupportAccessRoleOption,
  type SupportAccessUserOption,
} from "../../lib/api/tenants";
import {
  getTenantGamificationConfig,
  listGamificationGoals,
  createGamificationGoal,
  deleteGamificationGoal,
  simulateLabEvent,
  type GamificationGoal,
  type GoalReward,
  updateTenantGamificationConfig,
  type TenantGamificationConfig,
} from "../../lib/api/gamification";
import { AppTooltip, KidDropdown, KidSwitch } from "../../components/ui";
import {
  AttendanceSettings,
  type AttendanceConfig,
} from "../classrooms/AttendanceSettings";
import { GamificationPuzzleBuilder } from "./GamificationPuzzleBuilder";
import "../../components/ui/ui.css";
import "./settings.css";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese (Simplified)" },
  { value: "yo", label: "Yoruba" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const LABS = [
  { id: "circuit-maker", name: "Circuit Maker" },
  { id: "micro-maker", name: "Micro Maker" },
  { id: "robotics-lab", name: "Robotics Lab" },
  { id: "python-game", name: "Python Game Maker" },
  { id: "game-maker", name: "Game Maker" },
  { id: "design-maker", name: "Design Maker" },
];

/** lab.id → tenant_lab_settings.lab_type aliases (keep in sync with backend LAB_FEATURE_TO_TENANT_LAB_TYPES). */
const LAB_SETTING_ALIASES: Record<string, string[]> = {
  "circuit-maker": ["access_electronics_lab", "electronics_lab", "circuit-maker"],
  "micro-maker": ["access_robotics_lab", "robotics_lab", "micro-maker"],
  "robotics-lab": ["access_robotics_lab", "robotics_lab", "robotics-lab", "robotics_vr", "robotics_lab_vr"],
  "game-maker": ["access_game_maker", "game_maker", "game-maker"],
  "design-maker": ["access_design_maker", "design_maker", "design-maker", "3d_designer"],
  "python-game": ["access_python_lab", "python_lab", "python-game"],
};

/** Opt-out: enabled unless at least one row is expressly false and none are expressly true. */
function deriveLabEnabledFromRows(
  rows: Array<{ lab_type: string; enabled: boolean }>,
): Record<string, boolean> {
  const byType = new Map(rows.map((r) => [r.lab_type, r.enabled]));
  return LABS.reduce<Record<string, boolean>>((acc, lab) => {
    const aliases = LAB_SETTING_ALIASES[lab.id] ?? [lab.id];
    let sawTrue = false;
    let sawFalse = false;
    for (const t of aliases) {
      if (!byType.has(t)) continue;
      const v = byType.get(t);
      if (v === true) sawTrue = true;
      else if (v === false) sawFalse = true;
    }
    acc[lab.id] = sawTrue || !sawFalse;
    return acc;
  }, {});
}

const UI_MODES = [
  { value: "auto", label: "Auto" },
  { value: "kids", label: "Kids" },
  { value: "explorer", label: "Explorer" },
  { value: "pro", label: "Pro" },
];

const REWARD_THEMES = [
  { value: "classic", label: "Classic" },
  { value: "celebration", label: "Celebration" },
];

const REWARD_INTENSITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const GAMIFICATION_MODES = [
  { value: "academic", label: "Academic (minimal gamification)" },
  { value: "light", label: "Light gamification" },
  { value: "balanced", label: "Balanced" },
  { value: "full", label: "Full gamification" },
];

const LAB_EVENTS: Record<string, { value: string; label: string }[]> = {
  "circuit-maker": [
    { value: "OBJECT_CONNECTED", label: "Object connected" },
    { value: "CIRCUIT_COMPLETE", label: "Circuit completed" },
    { value: "OBJECT_ERROR", label: "Object error" },
  ],
  "design-maker": [
    { value: "OBJECT_CREATED", label: "Object created" },
    { value: "OBJECT_TRANSFORMED", label: "Object transformed" },
    { value: "MODEL_COMPLETE", label: "Model complete" },
  ],
  "micro-maker": [
    { value: "SENSOR_CONNECTED", label: "Sensor connected" },
    { value: "CODE_DEPLOYED", label: "Code deployed" },
    { value: "PROGRAM_COMPLETE", label: "Program complete" },
  ],
  "robotics-lab": [
    { value: "RUN_STARTED", label: "Run started" },
    { value: "RUN_COMPLETED", label: "Run completed" },
    { value: "MISSION_COMPLETED", label: "Mission completed" },
  ],
  "python-game": [
    { value: "SCRIPT_RUN", label: "Script run" },
    { value: "LEVEL_COMPLETE", label: "Level complete" },
    { value: "BUG_FIXED", label: "Bug fixed" },
  ],
  "game-maker": [
    { value: "SCENE_BUILT", label: "Scene built" },
    { value: "LOGIC_CONNECTED", label: "Logic connected" },
    { value: "GAME_COMPLETE", label: "Game complete" },
  ],
};

const GOAL_TEMPLATES = [
  {
    key: "electronics-led",
    label: "Electronics: Light an LED",
    lab_type: "circuit-maker",
    name: "Light an LED",
    description: "Student successfully completes a safe LED circuit.",
    eventType: "CIRCUIT_COMPLETE",
  },
  {
    key: "electronics-series",
    label: "Electronics: Build a series circuit",
    lab_type: "circuit-maker",
    name: "Build a series circuit",
    description: "Student creates a valid series circuit connection path.",
    eventType: "OBJECT_CONNECTED",
  },
  {
    key: "design-mug",
    label: "3D: Build a hollow mug",
    lab_type: "design-maker",
    name: "Build a hollow mug",
    description: "Student builds mug shell and subtracts interior volume.",
    eventType: "OBJECT_TRANSFORMED",
  },
  {
    key: "design-handle",
    label: "3D: Add handle",
    lab_type: "design-maker",
    name: "Add handle",
    description: "Student unions a handle into the base model.",
    eventType: "OBJECT_TRANSFORMED",
  },
  {
    key: "robotics-first-run",
    label: "Robotics: Complete first run",
    lab_type: "robotics-lab",
    name: "Complete first robotics run",
    description: "Student runs a robotics mission successfully in simulator.",
    eventType: "RUN_COMPLETED",
  },
];

const REWARD_MIN_MS = 1000;
const REWARD_MAX_DURATION_MS = 5000;
const REWARD_MAX_BIG_WIN_POINTS = 200;
const REWARD_LOW_MAX_MS = 3000;
const REWARD_MEDIUM_MAX_MS = 4000;
const REWARD_HIGH_MAX_MS = 5000;


type RewardAnimationSettings = {
  enabled: boolean;
  theme: "classic" | "celebration";
  max_intensity: "low" | "medium" | "high";
  max_duration_ms: number;
  big_win_enabled: boolean;
  big_win_points: number;
  durations: {
    low: number;
    medium: number;
    high: number;
  };
};

const DEFAULT_REWARD_SETTINGS: RewardAnimationSettings = {
  enabled: true,
  theme: "classic",
  max_intensity: "high",
  max_duration_ms: 4200,
  big_win_enabled: true,
  big_win_points: 50,
  durations: {
    low: 2200,
    medium: 2800,
    high: 3600,
  },
};

const DEFAULT_GAMIFICATION_CONFIG: TenantGamificationConfig = {
  mode: "balanced",
  enabled: true,
  enabled_labs: [],
  max_points_per_event: 50,
  allow_badges: true,
  allow_live_recognition: true,
  allow_leaderboard: true,
  allow_streaks: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampRewardSettings(input: RewardAnimationSettings): RewardAnimationSettings {
  return {
    ...input,
    max_duration_ms: clamp(
      input.max_duration_ms,
      REWARD_MIN_MS,
      REWARD_MAX_DURATION_MS,
    ),
    big_win_points: clamp(input.big_win_points, 1, REWARD_MAX_BIG_WIN_POINTS),
    durations: {
      low: clamp(input.durations.low, REWARD_MIN_MS, REWARD_LOW_MAX_MS),
      medium: clamp(input.durations.medium, REWARD_MIN_MS, REWARD_MEDIUM_MAX_MS),
      high: clamp(input.durations.high, REWARD_MIN_MS, REWARD_HIGH_MAX_MS),
    },
  };
}


function FieldHint({ title, description }: { title: string; description: string }) {
  return (
    <AppTooltip title={title} description={description} placement="top" forceCustomInReact19>
      <button
        type="button"
        className="tenant-settings__hint-btn"
        aria-label={`Info: ${title}`}
      >
        <CircleHelp size={14} />
      </button>
    </AppTooltip>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="tenant-settings__panel-title-row">
      <h2 className="tenant-settings__panel-title">{title}</h2>
      <FieldHint title={title} description={description} />
    </div>
  );
}

/* ---------- Logo Uploader ---------- */
function LogoUploader({
  currentUrl,
  onUploaded,
  onRemove,
}: {
  currentUrl: string | null | undefined;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const asset = await uploadAsset({
        file,
        name: file.name,
        asset_type: "image",
        owner_type: "tenant",
      });
      const url = asset.blob_url || asset.thumbnail_url || "";
      if (url) onUploaded(url);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`tenant-settings__logo-upload${dragover ? " tenant-settings__logo-upload--dragover" : ""}${currentUrl ? " tenant-settings__logo-upload--has-image" : ""}`}
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragover(false);
        const f = e.dataTransfer.files[0];
        if (f) void handleFile(f);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {currentUrl ? (
        <>
          <img src={currentUrl} alt="Logo" className="tenant-settings__logo-preview" />
          <p className="tenant-settings__logo-upload-text">Click or drag to replace</p>
          <button
            type="button"
            className="tenant-settings__logo-remove"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label="Remove logo"
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <Upload size={28} style={{ color: "#94a3b8", marginBottom: 8 }} />
          <p className="tenant-settings__logo-upload-text">
            {uploading ? "Uploading..." : <><strong>Click to upload</strong> or drag & drop</>}
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- Color Picker Combo ---------- */
function ColorPickerField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);

  const commitHex = (v: string) => {
    const clean = v.startsWith("#") ? v : `#${v}`;
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      onChange(clean);
    }
  };

  return (
    <div className="tenant-settings__field">
      <label>{label}</label>
      <div className="tenant-settings__color-field">
        <div className="tenant-settings__color-swatch">
          <input
            type="color"
            value={value}
            onChange={(e) => {
              setHex(e.target.value);
              onChange(e.target.value);
            }}
          />
        </div>
        <input
          type="text"
          className="tenant-settings__color-hex"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => commitHex(hex)}
          onKeyDown={(e) => { if (e.key === "Enter") commitHex(hex); }}
          maxLength={7}
        />
      </div>
      <span className="tenant-settings__field-hint">{hint}</span>
    </div>
  );
}

/* ---------- Inline visual editing primitives ---------- */
type SectionItem = { type: string; content: Record<string, unknown>; visible?: boolean; _id: string };
const EMPTY_HP_SECTIONS: Array<{ type: string; content: Record<string, unknown>; visible?: boolean }> = [];

const FONT_SIZE_OPTIONS = [
  { label: "XS", value: "0.75rem" },
  { label: "S", value: "0.875rem" },
  { label: "M", value: "1rem" },
  { label: "L", value: "1.25rem" },
  { label: "XL", value: "1.5rem" },
  { label: "2XL", value: "2rem" },
  { label: "3XL", value: "2.5rem" },
  { label: "4XL", value: "3rem" },
];

function EditableText({
  value,
  placeholder,
  onChange,
  tag: Tag = "span",
  className,
  style,
  styleOverrides,
  onStyleChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  tag?: "span" | "h1" | "h2" | "h3" | "p" | "div";
  className?: string;
  style?: React.CSSProperties;
  styleOverrides?: { fontSize?: string; color?: string; fontWeight?: string };
  onStyleChange?: (patch: { fontSize?: string; color?: string; fontWeight?: string }) => void;
}) {
  const elRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

  const handleBlur = () => {
    const text = elRef.current?.innerText || "";
    if (text !== value) onChange(text);
    setEditing(false);
    setTimeout(() => setShowToolbar(false), 200);
  };

  const handleFocus = () => {
    setEditing(true);
    setShowToolbar(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      elRef.current?.blur();
    }
    if (e.key === "Escape") {
      if (elRef.current) elRef.current.innerText = value;
      elRef.current?.blur();
    }
  };

  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(styleOverrides?.fontSize ? { fontSize: styleOverrides.fontSize } : {}),
    ...(styleOverrides?.color ? { color: styleOverrides.color } : {}),
    ...(styleOverrides?.fontWeight ? { fontWeight: styleOverrides.fontWeight as React.CSSProperties["fontWeight"] } : {}),
  };

  return (
    <span style={{ position: "relative", display: Tag === "span" ? "inline" : "block" }}>
      {showToolbar && onStyleChange && (
        <div className="ie-toolbar" onMouseDown={(e) => e.preventDefault()}>
          <select
            className="ie-toolbar__size-select"
            value={styleOverrides?.fontSize || ""}
            onChange={(e) => onStyleChange({ fontSize: e.target.value || undefined })}
          >
            <option value="">Auto</option>
            {FONT_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="ie-toolbar__sep" />
          <button
            type="button"
            className={`ie-toolbar__btn${styleOverrides?.fontWeight === "800" ? " ie-toolbar__btn--active" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); onStyleChange({ fontWeight: styleOverrides?.fontWeight === "800" ? undefined : "800" }); }}
          >
            B
          </button>
          <span className="ie-toolbar__sep" />
          <div className="ie-toolbar__color-btn" style={{ background: styleOverrides?.color || "#ffffff" }}>
            <input
              type="color"
              value={styleOverrides?.color || "#ffffff"}
              onChange={(e) => onStyleChange({ color: e.target.value })}
            />
          </div>
        </div>
      )}
      <Tag
        ref={elRef as unknown as React.Ref<HTMLDivElement>}
        className={`ie-text${editing ? " ie-text--editing" : ""} ${className || ""}`}
        style={mergedStyle}
        contentEditable
        suppressContentEditableWarning
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{ __html: value || `<span class="ie-text__placeholder">${placeholder}</span>` }}
      />
    </span>
  );
}

function EditableImage({
  url,
  onChange,
  className,
  placeholderText,
  imgStyle,
}: {
  url: string;
  onChange: (url: string) => void;
  className?: string;
  placeholderText?: string;
  imgStyle?: React.CSSProperties;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const asset = await uploadAsset({ file, name: file.name, asset_type: "image", owner_type: "tenant" });
      const u = asset.blob_url || asset.thumbnail_url || "";
      if (u) onChange(u);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`ie-image ${className || ""}`} onClick={() => fileRef.current?.click()}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      {url ? (
        <>
          <img src={url} alt="" className="ie-image__img" style={imgStyle} />
          <div className="ie-image__overlay">{uploading ? "Uploading..." : "Click to change"}</div>
        </>
      ) : (
        <div className="ie-image__placeholder">
          <Upload size={20} />
          {uploading ? "Uploading..." : (placeholderText || "Click to add image")}
        </div>
      )}
    </div>
  );
}

/* ---------- Editable CTA button ---------- */
type BtnStyleOverrides = {
  backgroundColor?: string;
  color?: string;
  borderRadius?: string;
  paddingV?: string;
  paddingH?: string;
};

const RADIUS_OPTIONS = [
  { label: "Square", value: "4px" },
  { label: "Rounded", value: "8px" },
  { label: "More", value: "16px" },
  { label: "Pill", value: "50px" },
];

function EditableButton({
  text,
  placeholder,
  onTextChange,
  btnStyle,
  onStyleChange,
  linkValue,
  onLinkChange,
  linkLabel,
  visible = true,
  onVisibleChange,
}: {
  text: string;
  placeholder: string;
  onTextChange: (v: string) => void;
  btnStyle?: BtnStyleOverrides;
  onStyleChange: (patch: BtnStyleOverrides) => void;
  linkValue?: string;
  onLinkChange?: (v: string) => void;
  linkLabel?: string;
  visible?: boolean;
  onVisibleChange?: (v: boolean) => void;
}) {
  const { primary } = useContext(BrandingColorsCtx);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!showToolbar || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.top + window.scrollY, left: rect.left + rect.width / 2 + window.scrollX });
  }, [showToolbar, text, btnStyle]);

  useEffect(() => {
    if (!showToolbar) return;
    const handleOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (toolbarRef.current?.contains(t)) return;
      setShowToolbar(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowToolbar(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [showToolbar]);

  const computedStyle: React.CSSProperties = {
    display: "inline-block",
    background: btnStyle?.backgroundColor || "#fff",
    color: btnStyle?.color || primary,
    padding: `${btnStyle?.paddingV || "10px"} ${btnStyle?.paddingH || "24px"}`,
    borderRadius: btnStyle?.borderRadius || "50px",
    fontWeight: 700,
    fontSize: "0.9rem",
    cursor: "pointer",
    outline: showToolbar ? "2px solid var(--color-secondary, #1cb0f6)" : "none",
    outlineOffset: 2,
    transition: "outline 0.15s, opacity 0.2s",
  };

  const hiddenStyle: React.CSSProperties = {
    ...computedStyle,
    opacity: 0.35,
    cursor: "pointer",
    outline: "2px dashed #94a3b8",
    outlineOffset: 2,
  };

  const toolbar = showToolbar && pos
    ? createPortal(
        <div
          ref={toolbarRef}
          className="ie-btn-toolbar"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="ie-btn-toolbar__arrow" />
          <div className="ie-btn-toolbar__row ie-btn-toolbar__row--text">
            <label>Label</label>
            <input
              type="text"
              className="ie-btn-toolbar__text-input"
              value={text}
              placeholder={placeholder}
              onChange={(e) => onTextChange(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="ie-btn-toolbar__row">
            <label>BG</label>
            <div className="ie-toolbar__color-btn" style={{ background: btnStyle?.backgroundColor || "#ffffff" }}>
              <input
                type="color"
                value={btnStyle?.backgroundColor || "#ffffff"}
                onChange={(e) => onStyleChange({ backgroundColor: e.target.value })}
              />
            </div>
            <label>Text</label>
            <div className="ie-toolbar__color-btn" style={{ background: btnStyle?.color || primary }}>
              <input
                type="color"
                value={btnStyle?.color || primary}
                onChange={(e) => onStyleChange({ color: e.target.value })}
              />
            </div>
            {onVisibleChange && (
              <>
                <span className="ie-btn-toolbar__sep" />
                <button
                  type="button"
                  className={`ie-btn-toolbar__vis${visible ? " ie-btn-toolbar__vis--on" : ""}`}
                  onClick={() => onVisibleChange(!visible)}
                  title={visible ? "Hide on public page" : "Show on public page"}
                >
                  {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </>
            )}
          </div>
          <div className="ie-btn-toolbar__row">
            <label>Shape</label>
            {RADIUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`ie-btn-toolbar__radius${(btnStyle?.borderRadius || "50px") === o.value ? " ie-btn-toolbar__radius--active" : ""}`}
                style={{ borderRadius: o.value }}
                onClick={() => onStyleChange({ borderRadius: o.value })}
                title={o.label}
              />
            ))}
          </div>
          <div className="ie-btn-toolbar__row">
            <label>Size</label>
            <span className="ie-btn-toolbar__slider-label">V</span>
            <input
              type="range"
              min={4}
              max={24}
              value={parseInt(btnStyle?.paddingV || "10")}
              onChange={(e) => onStyleChange({ paddingV: `${e.target.value}px` })}
              className="ie-btn-toolbar__slider"
            />
            <span className="ie-btn-toolbar__slider-label">H</span>
            <input
              type="range"
              min={8}
              max={48}
              value={parseInt(btnStyle?.paddingH || "24")}
              onChange={(e) => onStyleChange({ paddingH: `${e.target.value}px` })}
              className="ie-btn-toolbar__slider"
            />
          </div>
          {onLinkChange && (
            <div className="ie-btn-toolbar__row ie-btn-toolbar__row--link">
              <label>{linkLabel || "Link"}</label>
              <input
                type="text"
                className="ie-btn-toolbar__link-input"
                value={linkValue || ""}
                placeholder="/signup or https://..."
                onChange={(e) => onLinkChange(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="ie-editable-btn-wrap">
      <span
        ref={anchorRef}
        style={visible ? computedStyle : hiddenStyle}
        onClick={() => setShowToolbar(true)}
      >
        {text || <span className="ie-text__placeholder">{placeholder}</span>}
      </span>
      {toolbar}
    </div>
  );
}

/* ---------- Section background editor ---------- */
import { type BgSettings, getBgFromContent, sectionBgStyle } from "../../components/tenant-homepage/sectionBg";

const GRADIENT_PRESETS = [
  { label: "Sunset", value: "linear-gradient(135deg, #f97316, #ec4899)" },
  { label: "Ocean", value: "linear-gradient(135deg, #0ea5e9, #6366f1)" },
  { label: "Forest", value: "linear-gradient(135deg, #22c55e, #0d9488)" },
  { label: "Night", value: "linear-gradient(135deg, #1e293b, #334155)" },
  { label: "Berry", value: "linear-gradient(135deg, #a855f7, #ec4899)" },
  { label: "Dawn", value: "linear-gradient(135deg, #fbbf24, #f97316, #ef4444)" },
  { label: "Mint", value: "linear-gradient(135deg, #6ee7b7, #3b82f6)" },
  { label: "Slate", value: "linear-gradient(135deg, #64748b, #475569)" },
];

function SectionBgEditor({
  bg,
  onChange,
  defaultColor = "#ffffff",
}: {
  bg: BgSettings;
  onChange: (bg: BgSettings) => void;
  defaultColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"color" | "gradient" | "image">(bg.image_url ? "image" : bg.gradient ? "gradient" : "color");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const asset = await uploadAsset({ file, name: file.name, asset_type: "image", owner_type: "tenant" });
      const url = asset.blob_url || asset.thumbnail_url || "";
      if (url) onChange({ ...bg, image_url: url });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ie-bg-editor" ref={panelRef}>
      <AppTooltip title="Edit background" placement="left" forceCustomInReact19>
        <button
          type="button"
          className="ie-bg-editor__trigger"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          <Paintbrush size={14} />
        </button>
      </AppTooltip>
      {open && (
        <div className="ie-bg-editor__popover" onClick={(e) => e.stopPropagation()}>
          <div className="ie-bg-editor__tabs">
            <button type="button" className={`ie-bg-editor__tab${tab === "color" ? " ie-bg-editor__tab--active" : ""}`} onClick={() => setTab("color")}>Color</button>
            <button type="button" className={`ie-bg-editor__tab${tab === "gradient" ? " ie-bg-editor__tab--active" : ""}`} onClick={() => setTab("gradient")}>Gradient</button>
            <button type="button" className={`ie-bg-editor__tab${tab === "image" ? " ie-bg-editor__tab--active" : ""}`} onClick={() => setTab("image")}>Image</button>
          </div>

          {tab === "color" && (
            <div className="ie-bg-editor__row">
              <div className="tenant-settings__color-field">
                <div className="tenant-settings__color-swatch" style={{ width: 32, height: 32 }}>
                  <input
                    type="color"
                    value={bg.color || defaultColor}
                    onChange={(e) => onChange({ ...bg, color: e.target.value, gradient: undefined })}
                  />
                </div>
                <input
                  type="text"
                  className="tenant-settings__color-hex"
                  style={{ width: 76 }}
                  value={bg.color || defaultColor}
                  placeholder="#hex"
                  maxLength={7}
                  onChange={(e) => onChange({ ...bg, color: e.target.value, gradient: undefined })}
                />
                {bg.color && (
                  <button type="button" className="ie-bg-editor__clear" onClick={() => onChange({ ...bg, color: undefined })}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "gradient" && (
            <div className="ie-bg-editor__row">
              <div className="ie-bg-editor__gradient-grid">
                {GRADIENT_PRESETS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    className={`ie-bg-editor__gradient-swatch${bg.gradient === g.value ? " ie-bg-editor__gradient-swatch--active" : ""}`}
                    style={{ background: g.value }}
                    title={g.label}
                    onClick={() => onChange({ ...bg, gradient: g.value, color: undefined })}
                  />
                ))}
              </div>
              <input
                type="text"
                className="tenant-settings__color-hex"
                style={{ width: "100%", maxWidth: "100%", marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: "0.72rem" }}
                value={bg.gradient || ""}
                placeholder="linear-gradient(135deg, #000, #fff)"
                onChange={(e) => onChange({ ...bg, gradient: e.target.value || undefined, color: undefined })}
              />
              {bg.gradient && (
                <button type="button" className="ie-bg-editor__clear" style={{ marginTop: 4 }} onClick={() => onChange({ ...bg, gradient: undefined })}>
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          )}

          {tab === "image" && (
            <>
              <div className="ie-bg-editor__row">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
                {bg.image_url ? (
                  <div className="ie-bg-editor__image-preview">
                    <img src={bg.image_url} alt="" />
                    <div className="ie-bg-editor__image-actions">
                      <button type="button" onClick={() => fileRef.current?.click()}>{uploading ? "..." : "Replace"}</button>
                      <button type="button" onClick={() => onChange({ ...bg, image_url: undefined })}>Remove</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="ie-bg-editor__upload-btn" onClick={() => fileRef.current?.click()}>
                    <Upload size={13} /> {uploading ? "Uploading..." : "Upload image"}
                  </button>
                )}
              </div>
              {bg.image_url && (
                <div className="ie-bg-editor__row">
                  <label>Overlay ({Math.round((bg.overlay ?? 0.4) * 100)}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((bg.overlay ?? 0.4) * 100)}
                    onChange={(e) => onChange({ ...bg, overlay: parseInt(e.target.value) / 100 })}
                    className="ie-bg-editor__slider"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Visual section form editors ---------- */

const BrandingColorsCtx = createContext({ primary: "#58cc02", accent: "#1cb0f6" });

type SectionFormProps = { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void };

function HeroForm({ content, onChange }: SectionFormProps) {
  const { primary } = useContext(BrandingColorsCtx);
  const set = (k: string, v: unknown) => onChange({ ...content, [k]: v === "" ? undefined : v });
  const styles = (content._styles as Record<string, Record<string, string>>) || {};
  const setStyle = (field: string, patch: Record<string, string | undefined>) => {
    const cur = styles[field] || {};
    onChange({ ...content, _styles: { ...styles, [field]: { ...cur, ...patch } } });
  };

  const rawBg = getBgFromContent(content);
  const bg: BgSettings = { ...rawBg, image_url: rawBg.image_url || (content.background_image_url as string) || undefined };

  return (
    <div className="ie-section ie-section--hero" style={sectionBgStyle(bg, primary)}>
      <SectionBgEditor
        bg={bg}
        defaultColor={primary}
        onChange={(newBg) => {
          onChange({ ...content, _bg: newBg, background_image_url: newBg.image_url || undefined });
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>
        <EditableText
          tag="h1"
          value={(content.title as string) || ""}
          placeholder="Enter hero title..."
          onChange={(v) => set("title", v)}
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.4rem)", fontWeight: 800, margin: "0 0 10px", lineHeight: 1.15 }}
          styleOverrides={styles.title}
          onStyleChange={(p) => setStyle("title", p)}
        />
        <EditableText
          tag="p"
          value={(content.subtitle as string) || ""}
          placeholder="Enter subtitle..."
          onChange={(v) => set("subtitle", v)}
          style={{ fontSize: "1rem", opacity: 0.9, margin: "0 0 18px", lineHeight: 1.6 }}
          styleOverrides={styles.subtitle}
          onStyleChange={(p) => setStyle("subtitle", p)}
        />
        <EditableButton
          text={(content.cta_text as string) || ""}
          placeholder="Button text..."
          onTextChange={(v) => set("cta_text", v)}
          btnStyle={styles.cta_btn as BtnStyleOverrides | undefined}
          onStyleChange={(p) => setStyle("cta_btn", p as Record<string, string | undefined>)}
          linkValue={(content.cta_link as string) || ""}
          onLinkChange={(v) => set("cta_link", v)}
          linkLabel="CTA Link:"
          visible={content.cta_visible !== false}
          onVisibleChange={(v) => set("cta_visible", v)}
        />
      </div>
    </div>
  );
}

function FeaturesForm({ content, onChange }: SectionFormProps) {
  const items = ((content.items as Array<{ title?: string; description?: string; icon_url?: string }>) || []);
  const updateItems = (newItems: typeof items) => onChange({ ...content, items: newItems });
  const updateItem = (idx: number, patch: Partial<typeof items[number]>) => updateItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => updateItems(items.filter((_, i) => i !== idx));
  const bg = getBgFromContent(content);

  return (
    <div className="ie-section ie-section--features" style={sectionBgStyle(bg, undefined)}>
      <SectionBgEditor bg={bg} onChange={(newBg) => onChange({ ...content, _bg: newBg })} />
      <EditableText
        tag="h2"
        className="ie-section__heading"
        value={(content.heading as string) || ""}
        placeholder="Section heading..."
        onChange={(v) => onChange({ ...content, heading: v || undefined })}
        style={{ marginBottom: 16 }}
      />
      <div className="ie-section__cards-grid">
        {items.map((item, idx) => (
          <div key={idx} className="ie-section__feature-card">
            <button type="button" className="ie-remove-badge" onClick={() => removeItem(idx)}><X size={10} /></button>
            <EditableImage
              url={item.icon_url || ""}
              onChange={(u) => updateItem(idx, { icon_url: u })}
              placeholderText="Icon"
              imgStyle={{ width: 36, height: 36, objectFit: "contain" }}
              className="ie-section__feature-icon"
            />
            <EditableText
              tag="h3"
              className="ie-section__feature-title"
              value={item.title || ""}
              placeholder="Feature title..."
              onChange={(v) => updateItem(idx, { title: v })}
            />
            <EditableText
              tag="p"
              className="ie-section__feature-desc"
              value={item.description || ""}
              placeholder="Description..."
              onChange={(v) => updateItem(idx, { description: v })}
            />
          </div>
        ))}
        <button type="button" className="ie-add-item" onClick={() => updateItems([...items, { title: "", description: "", icon_url: "" }])}>
          <Plus size={14} /> Add Feature
        </button>
      </div>
    </div>
  );
}

function CTAForm({ content, onChange }: SectionFormProps) {
  const { accent } = useContext(BrandingColorsCtx);
  const set = (k: string, v: unknown) => onChange({ ...content, [k]: v === "" ? undefined : v });
  const styles = (content._styles as Record<string, Record<string, string>>) || {};
  const setStyle = (field: string, patch: Record<string, string | undefined>) => {
    const cur = styles[field] || {};
    onChange({ ...content, _styles: { ...styles, [field]: { ...cur, ...patch } } });
  };
  const bg = getBgFromContent(content);

  return (
    <div className="ie-section ie-section--cta" style={sectionBgStyle(bg, accent)}>
      <SectionBgEditor bg={bg} defaultColor={accent} onChange={(newBg) => onChange({ ...content, _bg: newBg })} />
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <EditableText
          tag="h2"
          value={(content.heading as string) || ""}
          placeholder="Call to action heading..."
          onChange={(v) => set("heading", v)}
          style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 8px" }}
          styleOverrides={styles.heading}
          onStyleChange={(p) => setStyle("heading", p)}
        />
        <EditableText
          tag="p"
          value={(content.description as string) || ""}
          placeholder="Supporting text..."
          onChange={(v) => set("description", v)}
          style={{ fontSize: "0.95rem", opacity: 0.9, margin: "0 0 16px" }}
          styleOverrides={styles.description}
          onStyleChange={(p) => setStyle("description", p)}
        />
        <EditableButton
          text={(content.button_text as string) || ""}
          placeholder="Button text..."
          onTextChange={(v) => set("button_text", v)}
          btnStyle={styles.cta_btn as BtnStyleOverrides | undefined}
          onStyleChange={(p) => setStyle("cta_btn", p as Record<string, string | undefined>)}
          linkValue={(content.button_link as string) || ""}
          onLinkChange={(v) => set("button_link", v)}
          linkLabel="Button Link:"
          visible={content.button_visible !== false}
          onVisibleChange={(v) => set("button_visible", v)}
        />
      </div>
    </div>
  );
}

function TestimonialsForm({ content, onChange }: SectionFormProps) {
  const items = ((content.items as Array<{ quote?: string; author?: string; role?: string; avatar_url?: string }>) || []);
  const updateItems = (newItems: typeof items) => onChange({ ...content, items: newItems });
  const updateItem = (idx: number, patch: Partial<typeof items[number]>) => updateItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => updateItems(items.filter((_, i) => i !== idx));
  const bg = getBgFromContent(content);

  return (
    <div className="ie-section ie-section--testimonials" style={sectionBgStyle(bg, undefined)}>
      <SectionBgEditor bg={bg} onChange={(newBg) => onChange({ ...content, _bg: newBg })} />
      <EditableText
        tag="h2"
        className="ie-section__heading"
        value={(content.heading as string) || ""}
        placeholder="Section heading..."
        onChange={(v) => onChange({ ...content, heading: v || undefined })}
        style={{ marginBottom: 16 }}
      />
      <div className="ie-section__cards-grid">
        {items.map((item, idx) => (
          <div key={idx} className="ie-section__testimonial-card" style={{ position: "relative" }}>
            <button type="button" className="ie-remove-badge" onClick={() => removeItem(idx)}><X size={10} /></button>
            <EditableText
              tag="p"
              className="ie-section__testimonial-quote"
              value={item.quote || ""}
              placeholder="Testimonial quote..."
              onChange={(v) => updateItem(idx, { quote: v })}
            />
            <div className="ie-section__testimonial-footer">
              <EditableImage
                url={item.avatar_url || ""}
                onChange={(u) => updateItem(idx, { avatar_url: u })}
                placeholderText="Av"
                imgStyle={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                className="ie-section__testimonial-avatar"
              />
              <div>
                <EditableText
                  tag="span"
                  value={item.author || ""}
                  placeholder="Author name..."
                  onChange={(v) => updateItem(idx, { author: v })}
                  style={{ fontWeight: 700, fontSize: "0.875rem", display: "block" }}
                />
                <EditableText
                  tag="span"
                  value={item.role || ""}
                  placeholder="Role..."
                  onChange={(v) => updateItem(idx, { role: v })}
                  style={{ fontSize: "0.78rem", color: "#888", display: "block" }}
                />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="ie-add-item" onClick={() => updateItems([...items, { quote: "", author: "", role: "", avatar_url: "" }])}>
          <Plus size={14} /> Add Testimonial
        </button>
      </div>
    </div>
  );
}

function RichTextToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (active: boolean, onClick: () => void, label: string, children: React.ReactNode) => (
    <button
      type="button"
      className={`rt-toolbar__btn${active ? " rt-toolbar__btn--active" : ""}`}
      onClick={onClick}
      title={label}
    >
      {children}
    </button>
  );
  return (
    <div className="rt-toolbar">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold", <strong>B</strong>)}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic", <em>I</em>)}
      {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "Underline", <u>U</u>)}
      {btn(editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "Strikethrough", <s>S</s>)}
      <span className="rt-toolbar__sep" />
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Heading 2", "H2")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "Heading 3", "H3")}
      <span className="rt-toolbar__sep" />
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "Bullet List",
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="2.5" cy="4" r="1.5"/><rect x="6" y="3" width="9" height="2" rx=".5"/><circle cx="2.5" cy="8" r="1.5"/><rect x="6" y="7" width="9" height="2" rx=".5"/><circle cx="2.5" cy="12" r="1.5"/><rect x="6" y="11" width="9" height="2" rx=".5"/></svg>
      )}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Numbered List",
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><text x="1" y="5.5" fontSize="5" fontWeight="700">1</text><rect x="6" y="3" width="9" height="2" rx=".5"/><text x="1" y="9.5" fontSize="5" fontWeight="700">2</text><rect x="6" y="7" width="9" height="2" rx=".5"/><text x="1" y="13.5" fontSize="5" fontWeight="700">3</text><rect x="6" y="11" width="9" height="2" rx=".5"/></svg>
      )}
      <span className="rt-toolbar__sep" />
      {btn(editor.isActive({ textAlign: "left" }), () => editor.chain().focus().setTextAlign("left").run(), "Align Left",
        <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="3" x2="15" y2="3"/><line x1="1" y1="7" x2="10" y2="7"/><line x1="1" y1="11" x2="13" y2="11"/></svg>
      )}
      {btn(editor.isActive({ textAlign: "center" }), () => editor.chain().focus().setTextAlign("center").run(), "Align Center",
        <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="3" x2="15" y2="3"/><line x1="3" y1="7" x2="13" y2="7"/><line x1="2" y1="11" x2="14" y2="11"/></svg>
      )}
      {btn(editor.isActive({ textAlign: "right" }), () => editor.chain().focus().setTextAlign("right").run(), "Align Right",
        <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="3" x2="15" y2="3"/><line x1="6" y1="7" x2="15" y2="7"/><line x1="3" y1="11" x2="15" y2="11"/></svg>
      )}
      <span className="rt-toolbar__sep" />
      <input
        type="color"
        className="rt-toolbar__color"
        title="Text color"
        value={editor.getAttributes("textStyle").color || "#000000"}
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
      />
      {btn(editor.isActive("highlight"), () => editor.chain().focus().toggleHighlight().run(), "Highlight", 
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="12" width="14" height="3" rx="1" opacity=".5"/><path d="M4 2l6 8H4z"/></svg>
      )}
      {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "Blockquote",
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 3h4v4H5l-1 3H3V7l1-4zm6 0h4v4h-2l-1 3h-1V7l1-4z"/></svg>
      )}
    </div>
  );
}

function RichTextForm({ content, onChange }: SectionFormProps) {
  const bg = getBgFromContent(content);
  const initialHtml = (content.html as string) || (content.markdown ? `<p>${(content.markdown as string).replace(/\n/g, "</p><p>")}</p>` : "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
    ],
    content: initialHtml,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const isEmpty = ed.isEmpty;
      onChange({ ...content, html: isEmpty ? undefined : html, markdown: undefined });
    },
  });

  return (
    <div className="ie-section ie-section--richtext" style={sectionBgStyle(bg, undefined)}>
      <SectionBgEditor bg={bg} onChange={(newBg) => onChange({ ...content, _bg: newBg })} />
      <RichTextToolbar editor={editor} />
      <EditorContent editor={editor} className="rt-editor" />
    </div>
  );
}

function StatsForm({ content, onChange }: SectionFormProps) {
  const items = ((content.items as Array<{ value?: string; label?: string }>) || []);
  const updateItems = (newItems: typeof items) => onChange({ ...content, items: newItems });
  const updateItem = (idx: number, patch: Partial<typeof items[number]>) => updateItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => updateItems(items.filter((_, i) => i !== idx));
  const bg = getBgFromContent(content);

  return (
    <div className="ie-section ie-section--stats" style={sectionBgStyle(bg, undefined)}>
      <SectionBgEditor bg={bg} defaultColor="#f7f7f7" onChange={(newBg) => onChange({ ...content, _bg: newBg })} />
      <EditableText
        tag="h2"
        className="ie-section__heading"
        value={(content.heading as string) || ""}
        placeholder="Section heading..."
        onChange={(v) => onChange({ ...content, heading: v || undefined })}
        style={{ marginBottom: 16 }}
      />
      <div className="ie-section__stat-grid">
        {items.map((item, idx) => (
          <div key={idx} className="ie-section__stat-item">
            <button type="button" className="ie-remove-badge" onClick={() => removeItem(idx)}><X size={10} /></button>
            <EditableText
              tag="span"
              className="ie-section__stat-value"
              value={item.value || ""}
              placeholder="500+"
              onChange={(v) => updateItem(idx, { value: v })}
            />
            <EditableText
              tag="span"
              className="ie-section__stat-label"
              value={item.label || ""}
              placeholder="Label"
              onChange={(v) => updateItem(idx, { label: v })}
            />
          </div>
        ))}
        <button type="button" className="ie-add-item" style={{ maxWidth: 120 }} onClick={() => updateItems([...items, { value: "", label: "" }])}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

function ImageGridForm({ content, onChange }: SectionFormProps) {
  const items = ((content.items as Array<{ url?: string; alt?: string; caption?: string }>) || []);
  const cols = (content.columns as number) || 3;
  const updateItems = (newItems: typeof items) => onChange({ ...content, items: newItems });
  const updateItem = (idx: number, patch: Partial<typeof items[number]>) => updateItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => updateItems(items.filter((_, i) => i !== idx));
  const bg = getBgFromContent(content);

  return (
    <div className="ie-section ie-section--imagegrid" style={sectionBgStyle(bg, undefined)}>
      <SectionBgEditor bg={bg} onChange={(newBg) => onChange({ ...content, _bg: newBg })} />
      <EditableText
        tag="h2"
        className="ie-section__heading"
        value={(content.heading as string) || ""}
        placeholder="Section heading..."
        onChange={(v) => onChange({ ...content, heading: v || undefined })}
        style={{ marginBottom: 12 }}
      />
      <div className="ie-columns-control">
        <label>Columns:</label>
        <input type="number" min={1} max={6} value={cols} onChange={(e) => onChange({ ...content, columns: parseInt(e.target.value) || 3 })} />
      </div>
      <div className="ie-section__image-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {items.map((item, idx) => (
          <div key={idx} className="ie-section__image-item">
            <button type="button" className="ie-remove-badge" onClick={() => removeItem(idx)}><X size={10} /></button>
            <EditableImage
              url={item.url || ""}
              onChange={(u) => updateItem(idx, { url: u })}
              placeholderText="Add image"
              imgStyle={{ width: "100%", borderRadius: 10, objectFit: "cover", minHeight: 80 }}
            />
            <EditableText
              tag="p"
              className="ie-section__image-caption"
              value={item.caption || ""}
              placeholder="Caption..."
              onChange={(v) => updateItem(idx, { caption: v })}
            />
          </div>
        ))}
        <button type="button" className="ie-add-item" onClick={() => updateItems([...items, { url: "", alt: "", caption: "" }])}>
          <Plus size={14} /> Add Image
        </button>
      </div>
    </div>
  );
}

const SECTION_FORM_MAP: Record<string, React.ComponentType<SectionFormProps>> = {
  hero: HeroForm,
  features: FeaturesForm,
  cta: CTAForm,
  testimonials: TestimonialsForm,
  richText: RichTextForm,
  stats: StatsForm,
  imageGrid: ImageGridForm,
};

/* ---------- Sortable section card ---------- */
function SortableSectionCard({
  item,
  expanded,
  onToggleExpand,
  onToggleVisible,
  onRemove,
  onUpdateContent,
}: {
  item: SectionItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
  onUpdateContent: (content: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const meta = SECTION_TYPE_OPTIONS.find((o) => o.value === item.type);
  const FormComp = SECTION_FORM_MAP[item.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tenant-settings__section-card${isDragging ? " tenant-settings__section-card--dragging" : ""}${expanded ? " tenant-settings__section-card--expanded" : ""}`}
    >
      <div className="tenant-settings__section-header" onClick={onToggleExpand}>
        <div className="tenant-settings__section-handle" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
          <GripVertical size={16} />
        </div>
        <span className="tenant-settings__section-icon">{meta?.svgIcon ? <meta.svgIcon size={16} /> : <SvgHero size={16} />}</span>
        <span className="tenant-settings__section-label">{meta?.label || item.type}</span>
        <div className="tenant-settings__section-toolbar" onClick={(e) => e.stopPropagation()}>
          <AppTooltip title={item.visible !== false ? "Visible" : "Hidden"} placement="top" forceCustomInReact19>
            <button
              type="button"
              className={`tenant-settings__section-toolbar-btn${item.visible !== false ? " tenant-settings__section-toolbar-btn--active" : ""}`}
              onClick={onToggleVisible}
            >
              {item.visible !== false ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </AppTooltip>
          <AppTooltip title="Remove section" placement="top" forceCustomInReact19>
            <button
              type="button"
              className="tenant-settings__section-toolbar-btn tenant-settings__section-toolbar-btn--danger"
              onClick={onRemove}
            >
              <Trash2 size={15} />
            </button>
          </AppTooltip>
        </div>
        <ChevronDown size={16} className={`tenant-settings__section-chevron${expanded ? " tenant-settings__section-chevron--open" : ""}`} />
      </div>
      {expanded && (
        <div className="tenant-settings__section-body">
          {FormComp ? <FormComp content={item.content} onChange={onUpdateContent} /> : (
            <p className="tenant-settings__field-hint">No editor available for this section type.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Homepage preview modal ---------- */
type PreviewViewport = "desktop" | "mobile";

function HomepagePreview({
  sections,
  branding,
  onClose,
  title = "Homepage Preview",
  action,
}: {
  sections: Array<{ type: string; content: Record<string, unknown>; visible?: boolean }>;
  branding: Record<string, unknown> | null;
  onClose: () => void;
  title?: string;
  action?: { label: string; onClick: () => void };
}) {
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");

  return (
    <div className="tenant-settings__preview-overlay" onClick={onClose}>
      <div className="tenant-settings__preview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tenant-settings__preview-toolbar">
          <span className="tenant-settings__preview-toolbar-title">{title}</span>
          <div className="tenant-settings__preview-viewport-toggle">
            <button
              type="button"
              className={`tenant-settings__preview-vp-btn${viewport === "desktop" ? " tenant-settings__preview-vp-btn--active" : ""}`}
              onClick={() => setViewport("desktop")}
              title="Desktop view"
            >
              <Monitor size={16} />
            </button>
            <button
              type="button"
              className={`tenant-settings__preview-vp-btn${viewport === "mobile" ? " tenant-settings__preview-vp-btn--active" : ""}`}
              onClick={() => setViewport("mobile")}
              title="Mobile view"
            >
              <Smartphone size={16} />
            </button>
          </div>
          <div className="tenant-settings__preview-toolbar-right">
            {action && (
              <button type="button" className="tenant-settings__preview-action-btn" onClick={action.onClick}>
                {action.label}
              </button>
            )}
            <button type="button" className="tenant-settings__preview-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="tenant-settings__preview-frame">
          <div className={`tenant-settings__preview-inner${viewport === "mobile" ? " tenant-settings__preview-inner--mobile" : ""}`}>
            <TenantHomepage
              sections={sections.filter((s) => s.visible !== false).map((s) => ({ type: s.type, content: s.content, visible: s.visible }))}
              branding={branding as import("../../lib/api/tenants").PublicTenantBranding | null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Template Thumbnail (measured auto-scroll) ---------- */

const THUMB_SCALE = 0.17;
const THUMB_FRAME_H = 182;

function TemplateThumb({ sections, branding, sectionCount }: {
  sections: Array<{ type: string; content: Record<string, unknown>; visible?: boolean }>;
  branding: Record<string, unknown> | null;
  sectionCount: number;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [scrollPx, setScrollPx] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      const contentH = el.scrollHeight;
      const visibleH = THUMB_FRAME_H / THUMB_SCALE;
      setScrollPx(Math.max(0, contentH - visibleH));
    }, 150);
    return () => clearTimeout(timer);
  }, [sections]);

  return (
    <div className="hp-templates__card-thumb">
      <div className="hp-templates__card-thumb-frame">
        <div
          ref={innerRef}
          className="hp-templates__card-thumb-inner"
          style={{ "--thumb-scroll": `-${scrollPx}px` } as React.CSSProperties}
        >
          <TenantHomepage
            sections={sections.filter((s) => s.visible !== false).map((s) => ({ type: s.type, content: s.content, visible: s.visible }))}
            branding={branding as import("../../lib/api/tenants").PublicTenantBranding | null}
          />
        </div>
      </div>
      <span className="hp-templates__card-badge">{sectionCount} sections</span>
    </div>
  );
}

/* ---------- Template Picker ---------- */

const PAGE_SIZE = 20;

function TemplatePicker({ onApply, branding, onClose }: { onApply: (sections: HomepageTemplateDTO["sections"]) => void; branding?: Record<string, unknown> | null; onClose?: () => void }) {
  const [templates, setTemplates] = useState<HomepageTemplateDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cat, setCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    listHomepageTemplateCategories()
      .then((cats) => {
        setAllCategories([
          { id: "all", label: "All" },
          ...cats.map((c) => ({ id: c, label: c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " ") })),
        ]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTemplates([]);
    setLoading(true);
    listHomepageTemplates({
      skip: 0,
      limit: PAGE_SIZE,
      category: cat === "all" ? undefined : cat,
      search: debouncedSearch || undefined,
    })
      .then((resp) => {
        if (cancelled) return;
        setTemplates(resp.items);
        setTotal(resp.total);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cat, debouncedSearch]);

  const loadMore = useCallback(() => {
    if (loadingMore || templates.length >= total) return;
    setLoadingMore(true);
    listHomepageTemplates({
      skip: templates.length,
      limit: PAGE_SIZE,
      category: cat === "all" ? undefined : cat,
      search: debouncedSearch || undefined,
    })
      .then((resp) => {
        setTemplates((prev) => [...prev, ...resp.items]);
        setTotal(resp.total);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [loadingMore, templates.length, total, cat, debouncedSearch]);

  const hasMore = templates.length < total;
  const confirming = templates.find((t) => t.id === confirmId);
  const previewing = templates.find((t) => t.id === previewId);

  return (
    <div className="hp-templates">
      <div className="hp-templates__header">
        <h3 className="hp-templates__title">Start from a Template</h3>
        <p className="hp-templates__subtitle">Choose a professionally designed starting point, then customize everything to match your brand.</p>
      </div>
      <div className="hp-templates__filters">
        <div className="hp-templates__search">
          <Search size={15} className="hp-templates__search-icon" />
          <input
            type="text"
            className="hp-templates__search-input"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="hp-templates__search-clear" onClick={() => setSearch("")}>
              <X size={13} />
            </button>
          )}
        </div>
        <div className="hp-templates__tabs">
          {allCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`hp-templates__tab${cat === c.id ? " hp-templates__tab--active" : ""}`}
              onClick={() => setCat(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="hp-templates__grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="hp-templates__card hp-templates__card--skeleton">
              <div className="hp-templates__skel-thumb" />
              <div className="hp-templates__card-body">
                <div className="hp-templates__skel-line hp-templates__skel-line--title" />
                <div className="hp-templates__skel-line hp-templates__skel-line--desc" />
                <div className="hp-templates__skel-line hp-templates__skel-line--desc hp-templates__skel-line--short" />
                <div className="hp-templates__skel-actions">
                  <div className="hp-templates__skel-btn" />
                  <div className="hp-templates__skel-btn" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="hp-templates__grid">
            {templates.length === 0 && (
              <p className="hp-templates__no-results">No templates match your search. Try a different keyword or category.</p>
            )}
            {templates.map((t) => (
              <div key={t.id} className="hp-templates__card">
                <TemplateThumb sections={t.sections} branding={branding ?? null} sectionCount={t.sections.length} />
                <div className="hp-templates__card-body">
                  <h4 className="hp-templates__card-name">{t.name}</h4>
                  <p className="hp-templates__card-desc">{t.description}</p>
                  <div className="hp-templates__card-actions">
                    <button
                      type="button"
                      className="hp-templates__card-btn hp-templates__card-btn--preview"
                      onClick={() => setPreviewId(t.id)}
                    >
                      <Eye size={14} /> Preview
                    </button>
                    <button
                      type="button"
                      className="hp-templates__card-btn hp-templates__card-btn--use"
                      onClick={() => setConfirmId(t.id)}
                    >
                      Use Template
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="hp-templates__load-more">
              <button
                type="button"
                className="hp-templates__load-more-btn"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Loading…" : `Load More (${templates.length} of ${total})`}
              </button>
            </div>
          )}
        </>
      )}

      {previewing && (
        <HomepagePreview
          sections={previewing.sections}
          branding={branding ?? null}
          onClose={() => setPreviewId(null)}
          title={`Preview: ${previewing.name}`}
          action={{ label: "Use This Template", onClick: () => { setPreviewId(null); setConfirmId(previewing.id); } }}
        />
      )}

      {confirming && (
        <div className="hp-templates__confirm-overlay" onClick={() => setConfirmId(null)}>
          <div className="hp-templates__confirm-panel" onClick={(e) => e.stopPropagation()}>
            <div className="hp-templates__confirm-swatch" style={{ background: confirming.gradient }} />
            <h4 className="hp-templates__confirm-name">{confirming.name}</h4>
            <p className="hp-templates__confirm-desc">{confirming.description}</p>
            <p className="hp-templates__confirm-warning">This will replace any existing sections with the template content. You can customize everything afterwards.</p>
            <div className="hp-templates__confirm-actions">
              <button type="button" className="hp-templates__confirm-cancel" onClick={() => setConfirmId(null)}>Cancel</button>
              <button
                type="button"
                className="hp-templates__confirm-apply"
                onClick={() => { onApply(confirming.sections); setConfirmId(null); }}
              >
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- New HomepageSectionBuilder ---------- */
let _sectionIdCounter = 0;
function nextSectionId() { return `sec-${++_sectionIdCounter}-${Date.now()}`; }

function HomepageSectionBuilder({
  sections,
  branding,
  isLive,
  hasLiveSections,
  onSaveDraft,
  onPublish,
  onUnpublish,
}: {
  sections: Array<{ type: string; content: Record<string, unknown>; visible?: boolean }>;
  branding: Record<string, unknown> | null;
  isLive: boolean;
  hasLiveSections: boolean;
  onSaveDraft: (sections: Array<{ type: string; content: Record<string, unknown>; visible?: boolean }>) => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
}) {
  const [items, setItems] = useState<SectionItem[]>(() =>
    sections.map((s) => ({ ...s, _id: nextSectionId() })),
  );
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const applyTemplate = (tplSections: HomepageTemplateDTO["sections"]) => {
    setItems(tplSections.map((s) => ({ ...s, _id: nextSectionId() })));
    setDirty(true);
    setShowTemplates(false);
    setExpandedId(null);
  };

  const primaryColor = (branding?.primary_color as string) || "#58cc02";
  const accentColor = (branding?.accent_color as string) || "#1cb0f6";

  const sectionsJson = useMemo(() => JSON.stringify(sections), [sections]);
  const prevSectionsJson = useRef(sectionsJson);
  useEffect(() => {
    if (prevSectionsJson.current === sectionsJson) return;
    prevSectionsJson.current = sectionsJson;
    setItems(sections.map((s) => ({ ...s, _id: nextSectionId() })));
    setDirty(false);
  }, [sectionsJson, sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i._id === active.id);
        const newIndex = prev.findIndex((i) => i._id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
      setDirty(true);
    }
  }, []);

  const updateItem = (id: string, patch: Partial<SectionItem>) => {
    setItems((prev) => prev.map((s) => (s._id === id ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((s) => s._id !== id));
    if (expandedId === id) setExpandedId(null);
    setDirty(true);
  };

  const addSection = (type: string) => {
    const newId = nextSectionId();
    setItems((prev) => [...prev, { type, content: {}, visible: true, _id: newId }]);
    setDirty(true);
    setShowPicker(false);
    setExpandedId(newId);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await onSaveDraft(items.map(({ type, content, visible }) => ({ type, content, visible })));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (dirty) await handleSaveDraft();
    setPublishing(true);
    try {
      await onPublish();
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setPublishing(true);
    try {
      await onUnpublish();
    } finally {
      setPublishing(false);
    }
  };

  const brandingColors = useMemo(() => ({ primary: primaryColor, accent: accentColor }), [primaryColor, accentColor]);

  return (
    <BrandingColorsCtx.Provider value={brandingColors}>
    <div className="tenant-settings__homepage-builder" style={{ "--th-primary": primaryColor, "--th-accent": accentColor } as React.CSSProperties}>
      <div className="hp-status-bar">
        <div className="hp-status-bar__left">
          <span className={`hp-status-bar__badge${isLive ? " hp-status-bar__badge--live" : ""}`}>
            {isLive ? "Live" : "Draft"}
          </span>
          {dirty && <span className="hp-status-bar__hint">Unsaved changes</span>}
          {!dirty && !isLive && hasLiveSections && <span className="hp-status-bar__hint">Draft differs from live</span>}
          {!dirty && !isLive && !hasLiveSections && items.length > 0 && <span className="hp-status-bar__hint">Not published yet</span>}
        </div>
        <div className="hp-status-bar__right">
          {hasLiveSections && (
            <button
              type="button"
              className="hp-status-bar__btn hp-status-bar__btn--unpublish"
              onClick={handleUnpublish}
              disabled={publishing}
            >
              {publishing ? "Unpublishing…" : "Unpublish"}
            </button>
          )}
          <button
            type="button"
            className="hp-status-bar__btn hp-status-bar__btn--publish"
            onClick={handlePublish}
            disabled={publishing || saving || items.length === 0}
          >
            {publishing ? "Publishing…" : "Go Live"}
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="hp-empty-state">
          <div className="hp-empty-state__icon"><LayoutTemplate size={32} /></div>
          <h3 className="hp-empty-state__title">Build your homepage</h3>
          <p className="hp-empty-state__desc">Add sections one by one, or jump-start with a professionally designed template.</p>
          <div className="hp-empty-state__actions">
            <button type="button" className="hp-empty-state__btn hp-empty-state__btn--secondary" onClick={() => setShowPicker(!showPicker)}>
              <Plus size={16} /> Add Section
            </button>
            <button type="button" className="hp-empty-state__btn hp-empty-state__btn--primary" onClick={() => setShowTemplates(true)}>
              <LayoutTemplate size={16} /> Start from Template
            </button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i._id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableSectionCard
              key={item._id}
              item={item}
              expanded={expandedId === item._id}
              onToggleExpand={() => setExpandedId(expandedId === item._id ? null : item._id)}
              onToggleVisible={() => updateItem(item._id, { visible: item.visible === false })}
              onRemove={() => removeItem(item._id)}
              onUpdateContent={(content) => updateItem(item._id, { content })}
            />
          ))}
        </SortableContext>
      </DndContext>

      {showPicker ? (
        <div className="tenant-settings__section-add-grid">
          {SECTION_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="tenant-settings__section-add-card"
              onClick={() => addSection(opt.value)}
            >
              <span className="tenant-settings__section-add-icon">
                <opt.svgIcon size={18} />
              </span>
              <span className="tenant-settings__section-add-label">{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="tenant-settings__homepage-footer">
        <button
          type="button"
          className="tenant-settings__save-btn tenant-settings__save-btn--secondary"
          onClick={() => setShowPicker(!showPicker)}
        >
          <Plus size={16} /> {showPicker ? "Cancel" : "Add Section"}
        </button>
        <button
          type="button"
          className="tenant-settings__save-btn tenant-settings__save-btn--secondary"
          onClick={() => setShowTemplates(true)}
        >
          <LayoutTemplate size={16} /> Templates
        </button>
        <button
          type="button"
          className="tenant-settings__save-btn tenant-settings__save-btn--secondary"
          onClick={() => setShowPreview(true)}
          disabled={items.length === 0}
        >
          <Eye size={16} /> Preview
        </button>
        {dirty && (
          <button type="button" className="tenant-settings__save-btn" onClick={handleSaveDraft} disabled={saving}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
        )}
      </div>

      {showPreview && (
        <HomepagePreview
          sections={items}
          branding={branding}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showTemplates && (
        <div
          className="hp-templates__modal-overlay"
          onClick={() => setShowTemplates(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowTemplates(false); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="hp-templates__modal-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="hp-templates__modal-close" onClick={() => setShowTemplates(false)}><X size={18} /></button>
            <TemplatePicker onApply={applyTemplate} branding={branding} onClose={() => setShowTemplates(false)} />
          </div>
        </div>
      )}
    </div>
    </BrandingColorsCtx.Provider>
  );
}

type TabId =
  | "general"
  | "franchise"
  | "branding"
  | "homepage"
  | "labs"
  | "ui"
  | "parent"
  | "attendance"
  | "rewards"
  | "support"
  | "danger";

const VALID_SETTINGS_TAB_PARAMS = new Set<string>([
  "general",
  "franchise",
  "branding",
  "homepage",
  "labs",
  "ui",
  "parent",
  "attendance",
  "rewards",
  "support",
  "danger",
]);

/* Inline SVG section icons (16×16 viewBox, stroke-based) */
const SvgHero = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="14" height="12" rx="2" />
    <path d="M4 7h8M5 10h6" />
    <circle cx="8" cy="4.5" r="0.5" fill="currentColor" stroke="none" />
  </svg>
);
const SvgFeatures = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="5.5" height="5.5" rx="1.2" />
    <rect x="9.5" y="1" width="5.5" height="5.5" rx="1.2" />
    <rect x="1" y="9.5" width="5.5" height="5.5" rx="1.2" />
    <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.2" />
  </svg>
);
const SvgCta = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="2" />
    <rect x="4.5" y="8" width="7" height="3" rx="1.5" />
    <path d="M4 6h8" />
  </svg>
);
const SvgTestimonials = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h12v8H9l-3 2.5V11H2z" />
    <path d="M5 6h6M5 8.5h4" />
  </svg>
);
const SvgRichText = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3h10M3 6.5h7M3 10h10M3 13.5h5" />
  </svg>
);
const SvgStats = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="9" width="3" height="5" rx="0.6" />
    <rect x="6.5" y="5" width="3" height="9" rx="0.6" />
    <rect x="11" y="2" width="3" height="12" rx="0.6" />
  </svg>
);
const SvgImageGrid = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="6" height="6" rx="1.2" />
    <rect x="9" y="1" width="6" height="6" rx="1.2" />
    <rect x="1" y="9" width="6" height="6" rx="1.2" />
    <rect x="9" y="9" width="6" height="6" rx="1.2" />
    <path d="M3 5l1.5-1.5L6 5" />
    <circle cx="12" cy="3.5" r="1" />
  </svg>
);

const SECTION_TYPE_OPTIONS: { value: string; label: string; svgIcon: React.ComponentType<{ size?: number }> }[] = [
  { value: "hero", label: "Hero", svgIcon: SvgHero },
  { value: "features", label: "Features", svgIcon: SvgFeatures },
  { value: "cta", label: "Call to Action", svgIcon: SvgCta },
  { value: "testimonials", label: "Testimonials", svgIcon: SvgTestimonials },
  { value: "richText", label: "Rich Text", svgIcon: SvgRichText },
  { value: "stats", label: "Stats", svgIcon: SvgStats },
  { value: "imageGrid", label: "Image Grid", svgIcon: SvgImageGrid },
];


const TABS: { id: TabId; label: string; iconSrc?: string; icon?: LucideIcon }[] = [
  { id: "general", label: "General", iconSrc: "/assets/cartoon-icons/settings.png" },
  { id: "franchise", label: "Franchise & domain", icon: Building2 },
  { id: "branding", label: "Branding", iconSrc: "/assets/cartoon-icons/cursor2.png" },
  { id: "homepage", label: "Homepage", iconSrc: "/assets/cartoon-icons/telescope.png" },
  { id: "labs", label: "Lab Settings", iconSrc: "/assets/cartoon-icons/telescope.png" },
  { id: "ui", label: "UI Policy", iconSrc: "/assets/cartoon-icons/cursor2.png" },
  { id: "parent", label: "Parent Policies", iconSrc: "/assets/cartoon-icons/Players.png" },
  { id: "attendance", label: "Attendance", iconSrc: "/assets/cartoon-icons/Callendar.png" },
  { id: "rewards", label: "Reward Animations", iconSrc: "/assets/cartoon-icons/Gift1.png" },
  { id: "support", label: "Support Access", iconSrc: "/assets/cartoon-icons/Information.png" },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export function TenantSettings() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const { tenant, setTenant } = useTenant();
  const { enabled: gamificationEnabled } = useFeatureFlagHook("gamification_enabled");
  const visibleTabs = useMemo(
    () => (gamificationEnabled ? TABS : TABS.filter((t) => t.id !== "rewards")),
    [gamificationEnabled],
  );
  const [activeTab, setActiveTab] = useState<TabId>("general");

  useEffect(() => {
    if (tabParam && VALID_SETTINGS_TAB_PARAMS.has(tabParam)) {
      setActiveTab(tabParam as TabId);
    }
  }, [tabParam]);
  const [labEnabled, setLabEnabled] = useState<Record<string, boolean>>(() =>
    LABS.reduce((acc, lab) => ({ ...acc, [lab.id]: true }), {}),
  );
  const [labSettingsLoading, setLabSettingsLoading] = useState(true);
  const [labSettingsError, setLabSettingsError] = useState("");
  const [labToggleBusy, setLabToggleBusy] = useState<Record<string, boolean>>({});
  const [uiMode, setUiMode] = useState("auto");
  const [allowCancel, setAllowCancel] = useState(true);
  const [allowReschedule, setAllowReschedule] = useState(true);
  const [cancelDeadlineHours, setCancelDeadlineHours] = useState(24);
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [supportUsers, setSupportUsers] = useState<SupportAccessUserOption[]>([]);
  const [supportRoles, setSupportRoles] = useState<SupportAccessRoleOption[]>([]);
  const [supportGrants, setSupportGrants] = useState<SupportAccessGrant[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportSuccess, setSupportSuccess] = useState("");
  const [selectedSupportUserId, setSelectedSupportUserId] = useState("");
  const [selectedSupportRoleId, setSelectedSupportRoleId] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportExpiry, setSupportExpiry] = useState(() => {
    const dt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });

  const [hostSub, setHostSub] = useState("");
  const [customDom, setCustomDom] = useState("");
  const [hostSaving, setHostSaving] = useState(false);
  const [hostErr, setHostErr] = useState("");
  const [hostOk, setHostOk] = useState(false);
  const [parentSlugReq, setParentSlugReq] = useState("");
  const [prefBill, setPrefBill] = useState<"central" | "independent" | "">("");
  const [franchiseMsg, setFranchiseMsg] = useState("");
  const [franchiseBusy, setFranchiseBusy] = useState(false);
  const [franchiseNote, setFranchiseNote] = useState("");
  const [incomingFr, setIncomingFr] = useState<FranchiseJoinRequest[]>([]);
  const [incLoading, setIncLoading] = useState(false);
  const [approveFranchiseGovernance, setApproveFranchiseGovernance] =
    useState<FranchiseGovernanceMode>("hybrid");

  // Attendance settings
  const [attendanceCfg, setAttendanceCfg] = useState<AttendanceConfig>({
    enabled: true,
    mode: "any_join",
    minimum_minutes: 15,
    percentage: 75,
  });
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [rewardCfg, setRewardCfg] = useState<RewardAnimationSettings>(
    DEFAULT_REWARD_SETTINGS,
  );
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardSaved, setRewardSaved] = useState(false);
  const [rewardError, setRewardError] = useState("");
  const [gamificationCfg, setGamificationCfg] = useState<TenantGamificationConfig>(
    DEFAULT_GAMIFICATION_CONFIG,
  );
  const [gamificationSaving, setGamificationSaving] = useState(false);
  const [gamificationSaved, setGamificationSaved] = useState(false);
  const [gamificationError, setGamificationError] = useState("");
  const [goals, setGoals] = useState<GamificationGoal[]>([]);
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalLabType, setGoalLabType] = useState(LABS[0]?.id ?? "circuit-maker");
  const [goalEventType, setGoalEventType] = useState("OBJECT_CONNECTED");
  const [goalRewardType, setGoalRewardType] = useState<"points" | "reward">("points");
  const [goalPoints, setGoalPoints] = useState(10);
  const [goalRewardKind, setGoalRewardKind] = useState<"badge" | "hi-five" | "sticker" | "custom">("badge");
  const [goalBadgeSlug, setGoalBadgeSlug] = useState("circuit_rookie");
  const [simulateContextJson, setSimulateContextJson] = useState("{}");
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateResult, setSimulateResult] = useState<{
    points_awarded_total: number;
    matched_goals: Array<{ goal_name: string; points_awarded: number; reward_type: string }>;
  } | null>(null);

  // Load attendance config from tenant settings on mount
  useEffect(() => {
    const raw = tenant?.settings?.attendance as Record<string, unknown> | undefined;
    if (raw && typeof raw === "object") {
      setAttendanceCfg((prev) => ({
        ...prev,
        ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
        ...(typeof raw.mode === "string" ? { mode: raw.mode as AttendanceConfig["mode"] } : {}),
        ...(typeof raw.minimum_minutes === "number" ? { minimum_minutes: raw.minimum_minutes } : {}),
        ...(typeof raw.percentage === "number" ? { percentage: raw.percentage } : {}),
      }));
    }
  }, [tenant?.settings]);

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    async function loadGamificationConfig() {
      try {
        const cfg = await getTenantGamificationConfig();
        if (!cancelled) {
          setGamificationCfg(cfg);
        }
      } catch {
        if (!cancelled) {
          setGamificationCfg(DEFAULT_GAMIFICATION_CONFIG);
        }
      }
    }
    void loadGamificationConfig();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  useEffect(() => {
    const tenantId = tenant?.id;
    if (!tenantId) {
      setLabSettingsLoading(false);
      return;
    }
    let cancelled = false;
    setLabSettingsLoading(true);
    setLabSettingsError("");
    async function loadLabSettings() {
      try {
        const rows = await getTenantLabSettings(tenantId);
        if (!cancelled) {
          setLabEnabled(deriveLabEnabledFromRows(rows));
        }
      } catch {
        if (!cancelled) {
          setLabSettingsError("Could not load lab settings.");
          setLabEnabled(LABS.reduce((acc, lab) => ({ ...acc, [lab.id]: true }), {}));
        }
      } finally {
        if (!cancelled) {
          setLabSettingsLoading(false);
        }
      }
    }
    void loadLabSettings();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  useEffect(() => {
    const defaultEvent = LAB_EVENTS[goalLabType]?.[0]?.value ?? "OBJECT_CONNECTED";
    setGoalEventType(defaultEvent);
  }, [goalLabType]);

  useEffect(() => {
    const raw =
      tenant?.settings?.reward_animations as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") {
      setRewardCfg(DEFAULT_REWARD_SETTINGS);
      return;
    }
    const durationsRaw =
      raw.durations && typeof raw.durations === "object"
        ? (raw.durations as Record<string, unknown>)
        : {};
    setRewardCfg(clampRewardSettings({
      enabled:
        typeof raw.enabled === "boolean"
          ? raw.enabled
          : DEFAULT_REWARD_SETTINGS.enabled,
      theme:
        raw.theme === "celebration" || raw.theme === "classic"
          ? raw.theme
          : DEFAULT_REWARD_SETTINGS.theme,
      max_intensity:
        raw.max_intensity === "low" ||
        raw.max_intensity === "medium" ||
        raw.max_intensity === "high"
          ? raw.max_intensity
          : DEFAULT_REWARD_SETTINGS.max_intensity,
      max_duration_ms:
        typeof raw.max_duration_ms === "number" &&
        Number.isFinite(raw.max_duration_ms)
          ? raw.max_duration_ms
          : DEFAULT_REWARD_SETTINGS.max_duration_ms,
      big_win_enabled:
        typeof raw.big_win_enabled === "boolean"
          ? raw.big_win_enabled
          : DEFAULT_REWARD_SETTINGS.big_win_enabled,
      big_win_points:
        typeof raw.big_win_points === "number" &&
        Number.isFinite(raw.big_win_points)
          ? raw.big_win_points
          : DEFAULT_REWARD_SETTINGS.big_win_points,
      durations: {
        low:
          typeof durationsRaw.low === "number" && Number.isFinite(durationsRaw.low)
            ? durationsRaw.low
            : DEFAULT_REWARD_SETTINGS.durations.low,
        medium:
          typeof durationsRaw.medium === "number" &&
          Number.isFinite(durationsRaw.medium)
            ? durationsRaw.medium
            : DEFAULT_REWARD_SETTINGS.durations.medium,
        high:
          typeof durationsRaw.high === "number" && Number.isFinite(durationsRaw.high)
            ? durationsRaw.high
            : DEFAULT_REWARD_SETTINGS.durations.high,
      },
    }));
  }, [tenant?.settings]);

  useEffect(() => {
    if (activeTab !== "franchise" || !tenant?.id) return;
    setHostErr("");
    setHostOk(false);
    setFranchiseNote("");
    setIncLoading(true);
    getTenantById(tenant.id)
      .then((t) => {
        setHostSub(t.publicHostSubdomain ?? "");
        setCustomDom(t.customDomain ?? "");
      })
      .catch(() => {});
    listFranchiseJoinRequests(tenant.id, "pending")
      .then((r) => setIncomingFr(r.items))
      .catch(() => setIncomingFr([]))
      .finally(() => setIncLoading(false));
  }, [activeTab, tenant?.id]);

  const handleSaveHosts = async () => {
    if (!tenant?.id) return;
    setHostSaving(true);
    setHostErr("");
    setHostOk(false);
    try {
      const updated = await patchTenant(tenant.id, {
        public_host_subdomain: hostSub.trim() || null,
        custom_domain: customDom.trim() || null,
      });
      setTenant({
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        code: updated.code,
        type: updated.type,
        logoUrl: updated.logoUrl,
        settings: updated.settings,
        publicHostSubdomain: updated.publicHostSubdomain,
        customDomain: updated.customDomain,
      });
      setHostOk(true);
      setTimeout(() => setHostOk(false), 2500);
    } catch (e) {
      setHostErr(e instanceof Error ? e.message : "Could not save host settings.");
    } finally {
      setHostSaving(false);
    }
  };

  const handleLabToggle = async (labId: string, next: boolean) => {
    if (!tenant?.id || labSettingsLoading) return;
    const aliases = LAB_SETTING_ALIASES[labId] ?? [labId];
    setLabToggleBusy((b) => ({ ...b, [labId]: true }));
    setLabSettingsError("");
    setLabEnabled((prev) => ({ ...prev, [labId]: next }));
    try {
      await Promise.all(
        aliases.map((lab_type) =>
          updateTenantLabSetting(tenant.id, { lab_type, enabled: next }),
        ),
      );
    } catch {
      setLabSettingsError("Could not save lab settings. Try again.");
      try {
        const rows = await getTenantLabSettings(tenant.id);
        setLabEnabled(deriveLabEnabledFromRows(rows));
      } catch {
        /* keep optimistic state if reload fails */
      }
    } finally {
      setLabToggleBusy((b) => ({ ...b, [labId]: false }));
    }
  };

  const handleSubmitFranchiseRequest = async () => {
    if (!tenant?.id || !parentSlugReq.trim()) return;
    setFranchiseBusy(true);
    setFranchiseNote("");
    try {
      await submitFranchiseJoinRequest({
        parent_slug: parentSlugReq.trim().toLowerCase(),
        message: franchiseMsg.trim() || undefined,
        preferred_billing_mode: prefBill || undefined,
      });
      setFranchiseNote(
        "Request sent. The parent organization can approve it from their Franchise & domain tab.",
      );
      setParentSlugReq("");
      setFranchiseMsg("");
    } catch (e) {
      setFranchiseNote(e instanceof Error ? e.message : "Could not submit request.");
    } finally {
      setFranchiseBusy(false);
    }
  };

  const handleFranchiseDecision = async (
    requestId: string,
    approve: boolean,
    billing?: "central" | "independent",
  ) => {
    if (!tenant?.id) return;
    setIncLoading(true);
    setFranchiseNote("");
    try {
      await decideFranchiseJoinRequest(tenant.id, requestId, {
        approve,
        billing_mode: billing,
        rejection_reason: approve ? undefined : "Declined by administrator",
        governance_mode: approve ? approveFranchiseGovernance : undefined,
      });
      const r = await listFranchiseJoinRequests(tenant.id, "pending");
      setIncomingFr(r.items);
      setFranchiseNote(approve ? "Link created." : "Request declined.");
    } catch (e) {
      setFranchiseNote(e instanceof Error ? e.message : "Could not update request.");
    } finally {
      setIncLoading(false);
    }
  };

  const handleSaveAttendance = async () => {
    if (!tenant?.id) return;
    setAttendanceSaving(true);
    try {
      const existing = (tenant.settings as Record<string, unknown> | undefined) ?? {};
      await updateTenantSettings(tenant.id, { ...existing, attendance: attendanceCfg });
      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 2500);
    } catch {
      // Silently ignore for now — settings page is non-critical
    } finally {
      setAttendanceSaving(false);
    }
  };

  const handleSaveRewards = async () => {
    if (!tenant?.id) return;
    setRewardSaving(true);
    setRewardSaved(false);
    setRewardError("");
    try {
      const existing = (tenant.settings as Record<string, unknown> | undefined) ?? {};
      const mergedSettings = {
        ...existing,
        reward_animations: clampRewardSettings(rewardCfg),
      };
      const updated = await updateTenantSettings(tenant.id, mergedSettings);
      setTenant({
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        code: updated.code,
        type: updated.type,
        logoUrl: updated.logoUrl,
        settings: updated.settings,
      });
      setRewardSaved(true);
      setTimeout(() => setRewardSaved(false), 2500);
    } catch (error) {
      setRewardError(
        error instanceof Error ? error.message : "Failed to save reward settings.",
      );
    } finally {
      setRewardSaving(false);
    }
  };

  const handleSaveGamification = async () => {
    setGamificationSaving(true);
    setGamificationSaved(false);
    setGamificationError("");
    try {
      await updateTenantGamificationConfig(gamificationCfg);
      setGamificationSaved(true);
      setTimeout(() => setGamificationSaved(false), 2500);
    } catch (error) {
      setGamificationError(
        error instanceof Error ? error.message : "Failed to save gamification settings.",
      );
    } finally {
      setGamificationSaving(false);
    }
  };


  const refreshGoals = async (labType?: string) => {
    setGoalLoading(true);
    setGoalError("");
    try {
      const list = await listGamificationGoals(
        labType ? { lab_type: labType } : undefined,
      );
      setGoals(list);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Failed to load goals.");
    } finally {
      setGoalLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "rewards") return;
    void refreshGoals();
  }, [activeTab]);

  const handleApplyTemplate = () => {
    const template = GOAL_TEMPLATES.find((item) => item.key === selectedTemplateKey);
    if (!template) return;
    setGoalLabType(template.lab_type);
    setGoalName(template.name);
    setGoalDescription(template.description);
    setGoalEventType(template.eventType);
    setGoalRewardType("points");
    setGoalPoints(10);
  };

  const handleCreateGoal = async () => {
    if (!goalName.trim()) {
      setGoalError("Goal name is required.");
      return;
    }
    setGoalSaving(true);
    setGoalError("");
    try {
      const reward: GoalReward =
        goalRewardType === "points"
          ? { type: "points", value: Math.max(1, goalPoints) }
          : { type: "reward", reward_kind: goalRewardKind, badge_slug: goalBadgeSlug || undefined };
      await createGamificationGoal({
        lab_type: goalLabType,
        name: goalName.trim(),
        description: goalDescription.trim(),
        event_map: { events: [goalEventType], context_match: {} },
        conditions: [],
        reward,
        is_active: true,
      });
      setGoalName("");
      setGoalDescription("");
      setGoalPoints(10);
      setGoalRewardType("points");
      await refreshGoals(goalLabType);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Failed to create goal.");
    } finally {
      setGoalSaving(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    setGoalError("");
    try {
      await deleteGamificationGoal(goalId);
      await refreshGoals(goalLabType);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Failed to delete goal.");
    }
  };

  const handleSimulate = async () => {
    setSimulateLoading(true);
    setGoalError("");
    setSimulateResult(null);
    try {
      const context = JSON.parse(simulateContextJson || "{}") as Record<string, unknown>;
      const result = await simulateLabEvent({
        lab_id: "preview-lab",
        lab_type: goalLabType,
        event_type: goalEventType,
        context,
      });
      setSimulateResult({
        points_awarded_total: result.points_awarded_total,
        matched_goals: result.matched_goals.map((item) => ({
          goal_name: item.goal_name,
          points_awarded: item.points_awarded,
          reward_type: item.reward_type,
        })),
      });
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setSimulateLoading(false);
    }
  };

  const tenantName = tenant?.name ?? "Organization";
  const tenantSlug = tenant?.slug ?? "org";
  const contactEmail = "admin@example.com";
  const roleNameById = useMemo(
    () => Object.fromEntries(supportRoles.map((item) => [item.id, item.name])),
    [supportRoles],
  );
  const supportUserLabelById = useMemo(
    () =>
      Object.fromEntries(
        supportUsers.map((item) => [
          item.id,
          `${item.first_name} ${item.last_name}`.trim() || item.email,
        ]),
      ),
    [supportUsers],
  );

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;

    async function loadSupportAccess() {
      setSupportLoading(true);
      setSupportError("");
      try {
        const [options, grants] = await Promise.all([
          getSupportAccessOptions(tenant.id),
          listSupportAccessGrants(tenant.id),
        ]);
        if (cancelled) return;
        setSupportUsers(options.support_users);
        setSupportRoles(options.roles);
        setSupportGrants(grants.items);
      } catch (error) {
        if (cancelled) return;
        setSupportError(error instanceof Error ? error.message : "Failed to load support access");
      } finally {
        if (!cancelled) setSupportLoading(false);
      }
    }

    loadSupportAccess();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  const refreshSupportGrants = async () => {
    if (!tenant?.id) return;
    const grants = await listSupportAccessGrants(tenant.id);
    setSupportGrants(grants.items);
  };

  const handleCreateSupportGrant = async () => {
    if (!tenant?.id) return;
    setSupportError("");
    setSupportSuccess("");
    try {
      await createSupportAccessGrant(tenant.id, {
        support_user_id: selectedSupportUserId,
        role_id: selectedSupportRoleId,
        reason: supportReason.trim() || undefined,
        expires_at: new Date(supportExpiry).toISOString(),
      });
      setSupportSuccess("Support access granted.");
      setSupportReason("");
      await refreshSupportGrants();
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Failed to grant support access");
    }
  };

  const handleRevokeSupportGrant = async (grantId: string) => {
    if (!tenant?.id) return;
    setSupportError("");
    setSupportSuccess("");
    try {
      await revokeSupportAccessGrant(tenant.id, grantId);
      setSupportSuccess("Support access revoked.");
      await refreshSupportGrants();
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Failed to revoke support access");
    }
  };

  return (
    <div
      className="tenant-settings"
      role="main"
      aria-label="Tenant settings"
    >
      <header className="tenant-settings__header">
        <div className="tenant-settings__panel-title-row">
          <h1 className="tenant-settings__title">Organization Settings</h1>
          <FieldHint
            title="Organization Settings"
            description="Manage tenant-wide defaults for labs, UI policy, attendance, rewards, and support access."
          />
        </div>
        <p className="tenant-settings__subtitle">
          Manage your organization configuration
        </p>
      </header>

      <div className="tenant-settings__layout">
        <nav
          className="tenant-settings__nav"
          role="tablist"
          aria-label="Settings sections"
        >
          {visibleTabs.map((tab) => {
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`tenant-settings__nav-btn ${
                  activeTab === tab.id ? "tenant-settings__nav-btn--active" : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.iconSrc ? (
                  <img
                    src={tab.iconSrc}
                    alt=""
                    className="tenant-settings__nav-icon-img"
                    aria-hidden
                  />
                ) : tab.icon ? (
                  <tab.icon size={18} aria-hidden />
                ) : null}
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="tenant-settings__content">
          {/* General */}
          <section
            id="panel-general"
            role="tabpanel"
            aria-labelledby="tab-general"
            hidden={activeTab !== "general"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="General"
              description="Core tenant identity and locale defaults. Name, slug, and contact are read-only from org setup."
            />
            <div className="tenant-settings__form">
              <div className="tenant-settings__field">
                <label htmlFor="org-name">Organization name</label>
                <input
                  id="org-name"
                  type="text"
                  value={tenantName}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-slug">Slug</label>
                <input
                  id="org-slug"
                  type="text"
                  value={tenantSlug}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="contact-email">Contact email</label>
                <input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-language">Language</label>
                <KidDropdown
                  value={language}
                  onChange={setLanguage}
                  fullWidth
                  ariaLabel="Language"
                  options={LANGUAGES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-timezone">Timezone</label>
                <KidDropdown
                  value={timezone}
                  onChange={setTimezone}
                  fullWidth
                  ariaLabel="Timezone"
                  options={TIMEZONES}
                />
              </div>
            </div>
          </section>

          <section
            id="panel-franchise"
            role="tabpanel"
            aria-labelledby="tab-franchise"
            hidden={activeTab !== "franchise"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Franchise & domain"
              description="Map a public subdomain or custom hostname, request to join a parent organization, or approve child sites. Production routing also requires backend PUBLIC_HOST_BASE_DOMAIN and DNS."
            />
            <div className="tenant-settings__form">
              <h3 className="tenant-settings__panel-desc" style={{ marginTop: 0 }}>
                Public hostname
              </h3>
              <p className="tenant-settings__panel-desc">
                Subdomain label for <code>{`{label}.your-platform-domain`}</code> (set the apex domain on the
                server). Custom domain: point DNS to your app, then enter the hostname here.
              </p>
              <div className="tenant-settings__field">
                <label htmlFor="host-sub">Public subdomain label</label>
                <input
                  id="host-sub"
                  className="tenant-settings__input"
                  value={hostSub}
                  onChange={(e) => setHostSub(e.target.value.toLowerCase())}
                  placeholder="e.g. oakridge"
                  autoComplete="off"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="custom-dom">Custom domain (optional)</label>
                <input
                  id="custom-dom"
                  className="tenant-settings__input"
                  value={customDom}
                  onChange={(e) => setCustomDom(e.target.value.toLowerCase())}
                  placeholder="learn.oakridge.edu"
                  autoComplete="off"
                />
              </div>
              {hostErr ? <p className="auth-error">{hostErr}</p> : null}
              {hostOk ? <p className="auth-success">Saved host mapping.</p> : null}
              <button
                type="button"
                className="tenant-settings__save-btn"
                onClick={() => void handleSaveHosts()}
                disabled={hostSaving || !tenant?.id}
              >
                {hostSaving ? "Saving…" : "Save hostname settings"}
              </button>

              <h3 className="tenant-settings__panel-desc" style={{ marginTop: "1.75rem" }}>
                Request link under a parent org
              </h3>
              <p className="tenant-settings__panel-desc">
                Sends a pending request to the parent workspace. An owner/admin there chooses{" "}
                <strong>central</strong> (shared billing pool) or <strong>independent</strong> billing, and
                can set shared curriculum / brand / rollup policies on approval.
              </p>
              <div className="tenant-settings__field">
                <label htmlFor="parent-slug-req">Parent organization slug</label>
                <input
                  id="parent-slug-req"
                  className="tenant-settings__input"
                  value={parentSlugReq}
                  onChange={(e) => setParentSlugReq(e.target.value)}
                  placeholder="district-slug"
                  autoComplete="off"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="pref-bill">Preferred structure (optional hint)</label>
                <KidDropdown
                  value={prefBill || "any"}
                  onChange={(v) =>
                    setPrefBill(v === "any" ? "" : (v as "central" | "independent"))
                  }
                  fullWidth
                  ariaLabel="Billing preference"
                  options={[
                    { value: "any", label: "No preference" },
                    { value: "central", label: "Central (parent license)" },
                    { value: "independent", label: "Independent (child billing)" },
                  ]}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="fr-msg">Message to parent (optional)</label>
                <textarea
                  id="fr-msg"
                  className="tenant-settings__input"
                  rows={3}
                  value={franchiseMsg}
                  onChange={(e) => setFranchiseMsg(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="tenant-settings__save-btn"
                onClick={() => void handleSubmitFranchiseRequest()}
                disabled={franchiseBusy || !parentSlugReq.trim()}
              >
                {franchiseBusy ? "Sending…" : "Submit join request"}
              </button>

              <h3 className="tenant-settings__panel-desc" style={{ marginTop: "1.75rem" }}>
                Incoming franchise requests
              </h3>
              <p className="tenant-settings__panel-desc">
                Child organizations asking to link under this workspace. Choose how curriculum, shared asset
                libraries, brand, and parent rollups apply, then approve with central or independent billing.
              </p>
              <div className="tenant-settings__field">
                <label>Policy when approving</label>
                <KidDropdown
                  value={approveFranchiseGovernance}
                  onChange={(v) => setApproveFranchiseGovernance(v as FranchiseGovernanceMode)}
                  fullWidth
                  ariaLabel="Franchise governance when approving"
                  options={[
                    {
                      value: "child_managed",
                      label: "Child-managed — child curriculum & brand only",
                    },
                    {
                      value: "parent_managed",
                      label: "Parent-managed — parent curriculum, library & brand (read-only for child)",
                    },
                    {
                      value: "hybrid",
                      label: "Hybrid — child may author; parent catalog & library visible",
                    },
                    {
                      value: "isolated",
                      label: "Isolated — billing/ops link only; no parent content, brand, or rollups",
                    },
                  ]}
                />
              </div>
              {franchiseNote ? <p className="tenant-settings__panel-desc">{franchiseNote}</p> : null}
              {incLoading ? (
                <p className="tenant-settings__panel-desc">Loading…</p>
              ) : incomingFr.length === 0 ? (
                <p className="tenant-settings__panel-desc">No pending requests.</p>
              ) : (
                <ul className="tenant-settings__panel-desc" style={{ listStyle: "none", padding: 0 }}>
                  {incomingFr.map((r) => (
                    <li key={r.id} className="tenant-settings__franchise-card">
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        Child tenant ID: {r.child_tenant_id}
                      </div>
                      {r.message ? <p style={{ margin: "0 0 8px" }}>{r.message}</p> : null}
                      {r.preferred_billing_mode ? (
                        <p style={{ margin: "0 0 8px", fontSize: "0.875rem" }}>
                          Preferred: {r.preferred_billing_mode}
                        </p>
                      ) : null}
                      <div className="tenant-settings__franchise-actions">
                        <button
                          type="button"
                          className="tenant-settings__save-btn"
                          onClick={() => void handleFranchiseDecision(r.id, true, "central")}
                        >
                          Approve (central)
                        </button>
                        <button
                          type="button"
                          className="tenant-settings__save-btn"
                          onClick={() => void handleFranchiseDecision(r.id, true, "independent")}
                        >
                          Approve (independent)
                        </button>
                        <button
                          type="button"
                          className="tenant-settings__save-btn tenant-settings__save-btn--secondary"
                          onClick={() => void handleFranchiseDecision(r.id, false)}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Lab Settings */}
          <section
            id="panel-labs"
            role="tabpanel"
            aria-labelledby="tab-labs"
            hidden={activeTab !== "labs"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Lab Settings"
              description="Enable or disable lab surfaces for this tenant. When disabled, a lab is unavailable to learners."
            />
            <p className="tenant-settings__panel-desc">
              Enable or disable labs for your organization
            </p>
            {labSettingsError ? (
              <p className="tenant-settings__panel-desc" role="alert">
                {labSettingsError}
              </p>
            ) : null}
            <div className="tenant-settings__toggles">
              {LABS.map((lab) => (
                <div
                  key={lab.id}
                  className="tenant-settings__toggle-row"
                  role="group"
                  aria-label={`${lab.name} lab`}
                >
                  <label
                    htmlFor={`lab-${lab.id}`}
                    className="tenant-settings__toggle-label"
                  >
                    {lab.name}
                  </label>
                  <KidSwitch
                    id={`lab-${lab.id}`}
                    checked={labEnabled[lab.id] ?? true}
                    disabled={labSettingsLoading || labToggleBusy[lab.id]}
                    onChange={(next) => void handleLabToggle(lab.id, next)}
                    ariaLabel={`${lab.name} lab toggle`}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* UI Policy */}
          <section
            id="panel-ui"
            role="tabpanel"
            aria-labelledby="tab-ui"
            hidden={activeTab !== "ui"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="UI Policy"
              description="Controls the tenant-wide default UI mode for student experiences."
            />
            <p className="tenant-settings__panel-desc">
              Set tenant-wide UI mode
            </p>
            <div className="tenant-settings__field">
              <label htmlFor="ui-mode">UI mode</label>
              <KidDropdown
                value={uiMode}
                onChange={setUiMode}
                fullWidth
                ariaLabel="UI mode"
                options={UI_MODES}
              />
            </div>
          </section>

          {/* Parent Policies */}
          <section
            id="panel-parent"
            role="tabpanel"
            aria-labelledby="tab-parent"
            hidden={activeTab !== "parent"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Parent Policies"
              description="Defines whether parents can cancel or reschedule and how close to session start those actions are allowed."
            />
            <p className="tenant-settings__panel-desc">
              Configure parent-facing policies
            </p>
            <div className="tenant-settings__toggles">
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Allow cancel"
              >
                <label
                  htmlFor="allow-cancel"
                  className="tenant-settings__toggle-label"
                >
                  Allow cancel
                </label>
                <KidSwitch
                  id="allow-cancel"
                  checked={allowCancel}
                  onChange={setAllowCancel}
                  ariaLabel="Allow cancel toggle"
                />
              </div>
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Allow reschedule"
              >
                <label
                  htmlFor="allow-reschedule"
                  className="tenant-settings__toggle-label"
                >
                  Allow reschedule
                </label>
                <KidSwitch
                  id="allow-reschedule"
                  checked={allowReschedule}
                  onChange={setAllowReschedule}
                  ariaLabel="Allow reschedule toggle"
                />
              </div>
            </div>
            <div className="tenant-settings__field">
              <label htmlFor="cancel-deadline">Cancel deadline (hours)</label>
              <input
                id="cancel-deadline"
                type="number"
                min={0}
                value={cancelDeadlineHours}
                onChange={(e) =>
                  setCancelDeadlineHours(Number(e.target.value) || 0)
                }
                className="tenant-settings__input"
              />
            </div>
          </section>

          {/* Attendance */}
          <section
            id="panel-attendance"
            role="tabpanel"
            aria-labelledby="tab-attendance"
            hidden={activeTab !== "attendance"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Attendance"
              description="Sets the organization default attendance rule. Programs/classes can override this default."
            />
            <p className="tenant-settings__panel-desc">
              Set the default attendance policy for your organization. Programs and classes can override this setting.
            </p>
            <AttendanceSettings
              value={attendanceCfg}
              onChange={(v) => setAttendanceCfg(v ?? attendanceCfg)}
              saving={attendanceSaving}
            />
            <div className="ui-form-actions" style={{ marginTop: 24 }}>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => void handleSaveAttendance()}
                disabled={attendanceSaving}
              >
                {attendanceSaving ? "Saving…" : attendanceSaved ? "Saved!" : "Save Attendance Settings"}
              </button>
            </div>
          </section>

          {/* Reward Animations */}
          {gamificationEnabled && <section
            id="panel-rewards"
            role="tabpanel"
            aria-labelledby="tab-rewards"
            hidden={activeTab !== "rewards"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Reward Animations"
              description="Global reward effects across live class and app pages, with guardrails to protect performance."
            />
            <p className="tenant-settings__panel-desc">
              Configure global reward animation behavior for students across live class and app pages.
            </p>
            {false ? (
            <>
            <div className="tenant-settings__support-card" style={{ marginBottom: 18 }}>
              <h3 className="tenant-settings__support-title">Gamification Policy</h3>
              <div className="tenant-settings__form tenant-settings__form--rewards">
                <div className="tenant-settings__field">
                  <label htmlFor="gamification-mode">
                    <span className="tenant-settings__label-with-hint">
                      Mode
                      <FieldHint
                        title="Gamification mode"
                        description="Academic minimizes game mechanics. Full applies strongest point rewards."
                      />
                    </span>
                  </label>
                  <KidDropdown
                    value={gamificationCfg.mode}
                    onChange={(value) =>
                      setGamificationCfg((prev) => ({
                        ...prev,
                        mode:
                          value === "academic" ||
                          value === "light" ||
                          value === "balanced" ||
                          value === "full"
                            ? value
                            : prev.mode,
                      }))
                    }
                    fullWidth
                    ariaLabel="Gamification mode"
                    options={GAMIFICATION_MODES}
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="gamification-max-points">
                    <span className="tenant-settings__label-with-hint">
                      Max points per lab event
                      <FieldHint
                        title="Max points per lab event"
                        description="Safety cap to prevent accidental oversized rewards from custom rules."
                      />
                    </span>
                  </label>
                  <input
                    id="gamification-max-points"
                    type="number"
                    min={1}
                    max={500}
                    value={gamificationCfg.max_points_per_event}
                    onChange={(event) =>
                      setGamificationCfg((prev) => ({
                        ...prev,
                        max_points_per_event: clamp(
                          Number(event.target.value) || 1,
                          1,
                          500,
                        ),
                      }))
                    }
                    className="tenant-settings__input"
                  />
                </div>
              </div>
              <div className="tenant-settings__toggles">
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Enable gamification</span>
                  <KidSwitch
                    checked={gamificationCfg.enabled}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, enabled: next }))
                    }
                    ariaLabel="Enable gamification"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow stickers</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_badges}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, allow_badges: next }))
                    }
                    ariaLabel="Allow stickers"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow leaderboard</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_leaderboard}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, allow_leaderboard: next }))
                    }
                    ariaLabel="Allow leaderboard"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow streaks</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_streaks}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, allow_streaks: next }))
                    }
                    ariaLabel="Allow streaks"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow live recognition popups</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_live_recognition}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({
                        ...prev,
                        allow_live_recognition: next,
                      }))
                    }
                    ariaLabel="Allow live recognition popups"
                  />
                </div>
              </div>
              <div className="tenant-settings__toggles" style={{ marginTop: 12 }}>
                {LABS.map((lab) => {
                  const enabled = gamificationCfg.enabled_labs.includes(lab.id);
                  return (
                    <div key={`gamification-lab-${lab.id}`} className="tenant-settings__toggle-row">
                      <span className="tenant-settings__toggle-label">{lab.name} events</span>
                      <KidSwitch
                        checked={enabled}
                        onChange={(next) =>
                          setGamificationCfg((prev) => {
                            const current = new Set(prev.enabled_labs);
                            if (next) current.add(lab.id);
                            else current.delete(lab.id);
                            return { ...prev, enabled_labs: Array.from(current) };
                          })
                        }
                        ariaLabel={`Enable ${lab.name} gamification events`}
                      />
                    </div>
                  );
                })}
              </div>
              {gamificationError ? (
                <p className="tenant-settings__reward-error">{gamificationError}</p>
              ) : null}
              <div className="ui-form-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  onClick={() => void handleSaveGamification()}
                  disabled={gamificationSaving}
                >
                  {gamificationSaving
                    ? "Saving…"
                    : gamificationSaved
                      ? "Saved!"
                      : "Save Gamification Policy"}
                </button>
              </div>
            </div>
            <GamificationPuzzleBuilder />
            <div className="tenant-settings__support-card" style={{ marginBottom: 18 }}>
              <h3 className="tenant-settings__support-title">Goal Builder (Instructor-Friendly)</h3>
              <p className="tenant-settings__panel-desc">
                Create lab goals using templates or custom events. Choose points or rewards per goal.
              </p>
              <div className="tenant-settings__form tenant-settings__form--rewards">
                <div className="tenant-settings__field">
                  <label htmlFor="goal-template">Template</label>
                  <KidDropdown
                    value={selectedTemplateKey}
                    onChange={setSelectedTemplateKey}
                    fullWidth
                    ariaLabel="Goal template"
                    options={[
                      { value: "", label: "Select a template" },
                      ...GOAL_TEMPLATES.map((item) => ({ value: item.key, label: item.label })),
                    ]}
                  />
                  <div className="ui-form-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      onClick={handleApplyTemplate}
                      disabled={!selectedTemplateKey}
                    >
                      Apply Template
                    </button>
                  </div>
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-lab-type">Lab type</label>
                  <KidDropdown
                    value={goalLabType}
                    onChange={setGoalLabType}
                    fullWidth
                    ariaLabel="Goal lab type"
                    options={LABS.map((lab) => ({ value: lab.id, label: lab.name }))}
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-name">Goal name</label>
                  <input
                    id="goal-name"
                    className="tenant-settings__input tenant-settings__input--wide"
                    value={goalName}
                    onChange={(event) => setGoalName(event.target.value)}
                    placeholder="e.g. Light an LED"
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-event-type">Event trigger</label>
                  <KidDropdown
                    value={goalEventType}
                    onChange={setGoalEventType}
                    fullWidth
                    ariaLabel="Goal event type"
                    options={(LAB_EVENTS[goalLabType] ?? LAB_EVENTS["circuit-maker"]).map((evt) => ({
                      value: evt.value,
                      label: evt.label,
                    }))}
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-description">Description</label>
                  <input
                    id="goal-description"
                    className="tenant-settings__input tenant-settings__input--wide"
                    value={goalDescription}
                    onChange={(event) => setGoalDescription(event.target.value)}
                    placeholder="Describe success criteria in simple terms"
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-reward-type">Reward type</label>
                  <KidDropdown
                    value={goalRewardType}
                    onChange={(value) => setGoalRewardType(value === "reward" ? "reward" : "points")}
                    fullWidth
                    ariaLabel="Goal reward type"
                    options={[
                      { value: "points", label: "Points" },
                      { value: "reward", label: "Reward" },
                    ]}
                  />
                </div>
                {goalRewardType === "points" ? (
                  <div className="tenant-settings__field">
                    <label htmlFor="goal-points">Points</label>
                    <input
                      id="goal-points"
                      type="number"
                      min={1}
                      max={500}
                      className="tenant-settings__input"
                      value={goalPoints}
                      onChange={(event) =>
                        setGoalPoints(clamp(Number(event.target.value) || 1, 1, 500))
                      }
                    />
                  </div>
                ) : (
                  <>
                    <div className="tenant-settings__field">
                      <label htmlFor="goal-reward-kind">Reward kind</label>
                      <KidDropdown
                        value={goalRewardKind}
                        onChange={(value) =>
                          setGoalRewardKind(
                            value === "hi-five" || value === "sticker" || value === "custom"
                              ? value
                              : "badge",
                          )
                        }
                        fullWidth
                        ariaLabel="Goal reward kind"
                        options={[
                          { value: "badge", label: "Sticker" },
                          { value: "hi-five", label: "Hi-five" },
                          { value: "sticker", label: "Sticker" },
                          { value: "custom", label: "Custom image" },
                        ]}
                      />
                    </div>
                    <div className="tenant-settings__field">
                      <label htmlFor="goal-badge-slug">Sticker slug (optional)</label>
                      <input
                        id="goal-badge-slug"
                        className="tenant-settings__input tenant-settings__input--wide"
                        value={goalBadgeSlug}
                        onChange={(event) => setGoalBadgeSlug(event.target.value)}
                        placeholder="e.g. circuit_master"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="ui-form-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  onClick={() => void handleCreateGoal()}
                  disabled={goalSaving}
                >
                  {goalSaving ? "Creating…" : "Create Goal"}
                </button>
              </div>
              <div className="tenant-settings__field" style={{ marginTop: 16 }}>
                <label htmlFor="goal-simulate-context">Simulation context (JSON)</label>
                <input
                  id="goal-simulate-context"
                  className="tenant-settings__input tenant-settings__input--wide"
                  value={simulateContextJson}
                  onChange={(event) => setSimulateContextJson(event.target.value)}
                />
              </div>
              <div className="ui-form-actions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => void handleSimulate()}
                  disabled={simulateLoading}
                >
                  {simulateLoading ? "Simulating…" : "Preview / Simulate Rule Match"}
                </button>
              </div>
              {simulateResult ? (
                <div className="tenant-settings__support-message tenant-settings__support-message--success" style={{ marginTop: 12 }}>
                  Matched {simulateResult.matched_goals.length} goal(s), total points preview: {simulateResult.points_awarded_total}
                </div>
              ) : null}
              {goalError ? (
                <p className="tenant-settings__reward-error">{goalError}</p>
              ) : null}

              <div style={{ marginTop: 16 }}>
                <h4 className="tenant-settings__support-title" style={{ marginBottom: 8 }}>
                  Existing goals
                </h4>
                {goalLoading ? (
                  <p className="tenant-settings__panel-desc">Loading goals...</p>
                ) : goals.length === 0 ? (
                  <p className="tenant-settings__panel-desc">No goals yet for this tenant.</p>
                ) : (
                  <div className="tenant-settings__support-list">
                    {goals.map((goal) => (
                      <div key={goal.id} className="tenant-settings__support-item">
                        <div className="tenant-settings__support-item-main">
                          <div className="tenant-settings__support-item-name">
                            {goal.name}
                          </div>
                          <div className="tenant-settings__support-item-meta">
                            <span>{goal.lab_type}</span>
                            <span>{goal.event_map?.events?.join(", ") || "No event"}</span>
                            <span>
                              {goal.reward.type === "points"
                                ? `${goal.reward.value ?? 0} points`
                                : `${goal.reward.reward_kind ?? "reward"}`}
                            </span>
                          </div>
                        </div>
                        <div className="tenant-settings__support-item-actions">
                          <span
                            className={`tenant-settings__status-badge ${
                              goal.is_active
                                ? "tenant-settings__status-badge--active"
                                : "tenant-settings__status-badge--inactive"
                            }`}
                          >
                            {goal.is_active ? "Active" : "Inactive"}
                          </span>
                          <button
                            type="button"
                            className="tenant-settings__secondary-btn"
                            onClick={() => void handleDeleteGoal(goal.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </>
            ) : (
              gamificationEnabled ? <div className="tenant-settings__support-card" style={{ marginBottom: 18 }}>
                <h3 className="tenant-settings__support-title">Gamification Moved</h3>
                <p className="tenant-settings__panel-desc">
                  Gamification policy and nested puzzle goal builder are now in the dedicated sidebar tab.
                </p>
                <div className="ui-form-actions">
                  <a href="/app/gamification" className="ui-btn ui-btn--primary">
                    Open Gamification Studio
                  </a>
                </div>
              </div> : null
            )}
            <div className="tenant-settings__toggles">
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Enable reward animations"
              >
                <label
                  htmlFor="reward-enabled"
                  className="tenant-settings__toggle-label"
                >
                  <span className="tenant-settings__label-with-hint">
                    Enable reward animations
                    <FieldHint
                      title="Enable reward animations"
                      description="Turns reward effects on/off globally for this tenant. Disable to maximize performance on very low-end devices."
                    />
                  </span>
                </label>
                <KidSwitch
                  id="reward-enabled"
                  checked={rewardCfg.enabled}
                  onChange={(next) =>
                    setRewardCfg((prev) => ({ ...prev, enabled: next }))
                  }
                  ariaLabel="Enable reward animations toggle"
                />
              </div>

              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Enable big win mode"
              >
                <label
                  htmlFor="reward-big-win"
                  className="tenant-settings__toggle-label"
                >
                  <span className="tenant-settings__label-with-hint">
                    Enable BIG WIN mode
                    <FieldHint
                      title="Enable BIG WIN mode"
                      description="Adds a short flash + stronger effect for high-point rewards. Recommended to keep enabled."
                    />
                  </span>
                </label>
                <KidSwitch
                  id="reward-big-win"
                  checked={rewardCfg.big_win_enabled}
                  onChange={(next) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      big_win_enabled: next,
                    }))
                  }
                  ariaLabel="Enable BIG WIN mode toggle"
                />
              </div>
            </div>

            <div className="tenant-settings__form tenant-settings__form--rewards">
              <div className="tenant-settings__field">
                <label htmlFor="reward-theme">
                  <span className="tenant-settings__label-with-hint">
                    Animation theme
                    <FieldHint
                      title="Animation theme"
                      description="Classic is calmer. Celebration is brighter and more festive."
                    />
                  </span>
                </label>
                <KidDropdown
                  value={rewardCfg.theme}
                  onChange={(value) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      theme:
                        value === "celebration" || value === "classic"
                          ? value
                          : prev.theme,
                    }))
                  }
                  fullWidth
                  ariaLabel="Reward animation theme"
                  options={REWARD_THEMES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-max-intensity">
                  <span className="tenant-settings__label-with-hint">
                    Maximum intensity
                    <FieldHint
                      title="Maximum intensity"
                      description="Caps all animations to Low, Medium, or High to prevent excessive particle load."
                    />
                  </span>
                </label>
                <KidDropdown
                  value={rewardCfg.max_intensity}
                  onChange={(value) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      max_intensity:
                        value === "low" || value === "medium" || value === "high"
                          ? value
                          : prev.max_intensity,
                    }))
                  }
                  fullWidth
                  ariaLabel="Reward maximum intensity"
                  options={REWARD_INTENSITIES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-max-duration">
                  <span className="tenant-settings__label-with-hint">
                    Max duration (ms)
                    <FieldHint
                      title="Max duration (ms)"
                      description="Hard cap for any single animation. Allowed range: 1000 to 5000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-max-duration"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_MAX_DURATION_MS}
                  value={rewardCfg.max_duration_ms}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      max_duration_ms: clamp(
                        Number(e.target.value) ||
                          DEFAULT_REWARD_SETTINGS.max_duration_ms,
                        REWARD_MIN_MS,
                        REWARD_MAX_DURATION_MS,
                      ),
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-big-win-points">
                  <span className="tenant-settings__label-with-hint">
                    BIG WIN threshold (points)
                    <FieldHint
                      title="BIG WIN threshold (points)"
                      description="Points needed to trigger BIG WIN visuals. Allowed range: 1 to 200 points."
                    />
                  </span>
                </label>
                <input
                  id="reward-big-win-points"
                  type="number"
                  min={1}
                  max={REWARD_MAX_BIG_WIN_POINTS}
                  value={rewardCfg.big_win_points}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      big_win_points: clamp(
                        Number(e.target.value) ||
                          DEFAULT_REWARD_SETTINGS.big_win_points,
                        1,
                        REWARD_MAX_BIG_WIN_POINTS,
                      ),
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
            </div>

            <div className="tenant-settings__reward-duration-grid">
              <div className="tenant-settings__field">
                <label htmlFor="reward-duration-low">
                  <span className="tenant-settings__label-with-hint">
                    Low duration (ms)
                    <FieldHint
                      title="Low duration (ms)"
                      description="Animation length for low intensity. Allowed range: 1000 to 3000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-duration-low"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_LOW_MAX_MS}
                  value={rewardCfg.durations.low}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      durations: {
                        ...prev.durations,
                        low: clamp(
                          Number(e.target.value) ||
                            DEFAULT_REWARD_SETTINGS.durations.low,
                          REWARD_MIN_MS,
                          REWARD_LOW_MAX_MS,
                        ),
                      },
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-duration-medium">
                  <span className="tenant-settings__label-with-hint">
                    Medium duration (ms)
                    <FieldHint
                      title="Medium duration (ms)"
                      description="Animation length for medium intensity. Allowed range: 1000 to 4000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-duration-medium"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_MEDIUM_MAX_MS}
                  value={rewardCfg.durations.medium}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      durations: {
                        ...prev.durations,
                        medium: clamp(
                          Number(e.target.value) ||
                            DEFAULT_REWARD_SETTINGS.durations.medium,
                          REWARD_MIN_MS,
                          REWARD_MEDIUM_MAX_MS,
                        ),
                      },
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-duration-high">
                  <span className="tenant-settings__label-with-hint">
                    High duration (ms)
                    <FieldHint
                      title="High duration (ms)"
                      description="Animation length for high intensity. Allowed range: 1000 to 5000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-duration-high"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_HIGH_MAX_MS}
                  value={rewardCfg.durations.high}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      durations: {
                        ...prev.durations,
                        high: clamp(
                          Number(e.target.value) ||
                            DEFAULT_REWARD_SETTINGS.durations.high,
                          REWARD_MIN_MS,
                          REWARD_HIGH_MAX_MS,
                        ),
                      },
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
            </div>

            {rewardError ? (
              <p className="tenant-settings__reward-error">{rewardError}</p>
            ) : null}

            <div className="ui-form-actions" style={{ marginTop: 24 }}>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => void handleSaveRewards()}
                disabled={rewardSaving}
              >
                {rewardSaving
                  ? "Saving…"
                  : rewardSaved
                    ? "Saved!"
                    : "Save Reward Animation Settings"}
              </button>
            </div>
          </section>}

          {/* Support Access */}
          <section
            id="panel-support"
            role="tabpanel"
            aria-labelledby="tab-support"
            hidden={activeTab !== "support"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Support Access"
              description="Grant temporary, role-scoped access to support staff for troubleshooting and operations."
            />
            <p className="tenant-settings__panel-desc">
              Grant time-limited, role-scoped access to a specific STEMplitude support user.
            </p>

            <div className="tenant-settings__support-grid">
              <div className="tenant-settings__support-card">
                <h3 className="tenant-settings__support-title">Grant access</h3>
                <div className="tenant-settings__form">
                  <div className="tenant-settings__field">
                    <label htmlFor="support-user">Support user</label>
                    <KidDropdown
                      value={selectedSupportUserId}
                      onChange={setSelectedSupportUserId}
                      fullWidth
                      ariaLabel="Support user"
                      options={[
                        { value: "", label: "Select a support user" },
                        ...supportUsers.map((user) => ({
                          value: user.id,
                          label: `${`${user.first_name} ${user.last_name}`.trim() || user.email}${user.global_role ? ` • ${user.global_role}` : ""}`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-role">Tenant role scope</label>
                    <KidDropdown
                      value={selectedSupportRoleId}
                      onChange={setSelectedSupportRoleId}
                      fullWidth
                      ariaLabel="Tenant role scope"
                      options={[
                        { value: "", label: "Select tenant role" },
                        ...supportRoles.map((roleOption) => ({
                          value: roleOption.id,
                          label: roleOption.name,
                        })),
                      ]}
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-expiry">Expires at</label>
                    <input
                      id="support-expiry"
                      type="datetime-local"
                      value={supportExpiry}
                      onChange={(e) => setSupportExpiry(e.target.value)}
                      className="tenant-settings__input"
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-reason">Reason</label>
                    <input
                      id="support-reason"
                      type="text"
                      value={supportReason}
                      onChange={(e) => setSupportReason(e.target.value)}
                      className="tenant-settings__input tenant-settings__input--wide"
                      placeholder="Investigating sync issue, billing issue, onboarding help..."
                    />
                  </div>

                  {(supportError || supportSuccess) && (
                    <div
                      className={`tenant-settings__support-message ${
                        supportError
                          ? "tenant-settings__support-message--error"
                          : "tenant-settings__support-message--success"
                      }`}
                    >
                      {supportError || supportSuccess}
                    </div>
                  )}

                  <div className="tenant-settings__support-actions">
                    <button
                      type="button"
                      className="tenant-settings__primary-btn"
                      disabled={
                        supportLoading ||
                        !selectedSupportUserId ||
                        !selectedSupportRoleId ||
                        !supportExpiry
                      }
                      onClick={handleCreateSupportGrant}
                    >
                      Grant support access
                    </button>
                  </div>
                </div>
              </div>

              <div className="tenant-settings__support-card">
                <h3 className="tenant-settings__support-title">Active and past grants</h3>
                {supportLoading ? (
                  <p className="tenant-settings__panel-desc">Loading support grants...</p>
                ) : supportGrants.length === 0 ? (
                  <p className="tenant-settings__panel-desc">No support access grants yet.</p>
                ) : (
                  <div className="tenant-settings__support-list">
                    {supportGrants.map((grant) => {
                      const isExpired = new Date(grant.expires_at).getTime() <= Date.now();
                      const isRevoked = grant.status !== "active" || !!grant.revoked_at || isExpired;
                      return (
                        <div key={grant.id} className="tenant-settings__support-item">
                          <div className="tenant-settings__support-item-main">
                            <div className="tenant-settings__support-item-name">
                              {supportUserLabelById[grant.support_user_id] ?? grant.support_user_id}
                            </div>
                            <div className="tenant-settings__support-item-meta">
                              <span>{roleNameById[grant.role_id ?? ""] ?? "No role scope"}</span>
                              <span>Expires {new Date(grant.expires_at).toLocaleString()}</span>
                              {grant.reason && <span>{grant.reason}</span>}
                            </div>
                          </div>
                          <div className="tenant-settings__support-item-actions">
                            <span
                              className={`tenant-settings__status-badge ${
                                isRevoked
                                  ? "tenant-settings__status-badge--inactive"
                                  : "tenant-settings__status-badge--active"
                              }`}
                            >
                              {isExpired ? "Expired" : isRevoked ? "Revoked" : "Active"}
                            </span>
                            {!isRevoked && (
                              <button
                                type="button"
                                className="tenant-settings__secondary-btn"
                                onClick={() => handleRevokeSupportGrant(grant.id)}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Branding */}
          <section
            id="panel-branding"
            role="tabpanel"
            aria-labelledby="tab-branding"
            hidden={activeTab !== "branding"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Branding"
              description="Customize how your organization appears on its public landing page and login screen."
            />
            {(() => {
              const existing = (tenant?.settings as Record<string, unknown>) ?? {};
              const br = (typeof existing.branding === "object" && existing.branding ? existing.branding : {}) as Record<string, string>;
              const saveBranding = (patch: Record<string, string | null>) => {
                const updated = { ...br, ...patch };
                const merged = { ...existing, branding: updated };
                void updateTenantSettings(tenant!.id, merged);
                setTenant({ ...tenant!, settings: merged });
              };

              return (
                <div className="tenant-settings__form">
                  <div className="tenant-settings__field">
                    <label className="tenant-settings__label-with-hint">
                      Logo
                      <FieldHint title="Organization Logo" description="Upload your organization logo. Displayed on the login page and navigation bar." />
                    </label>
                    <LogoUploader
                      currentUrl={tenant?.logoUrl}
                      onUploaded={(url) => {
                        void patchTenant(tenant!.id, { logo_url: url });
                        setTenant({ ...tenant!, logoUrl: url });
                      }}
                      onRemove={() => {
                        void patchTenant(tenant!.id, { logo_url: "" });
                        setTenant({ ...tenant!, logoUrl: "" });
                      }}
                    />
                  </div>

                  <div className="tenant-settings__form-grid">
                    <ColorPickerField
                      label="Primary Color"
                      hint="Used for buttons and main accents"
                      value={br.primary_color || "#58cc02"}
                      onChange={(hex) => saveBranding({ primary_color: hex })}
                    />
                    <ColorPickerField
                      label="Accent Color"
                      hint="Secondary highlight color"
                      value={br.accent_color || "#1cb0f6"}
                      onChange={(hex) => saveBranding({ accent_color: hex })}
                    />
                  </div>

                  <div className="tenant-settings__color-preview">
                    <div className="tenant-settings__color-preview-swatch" style={{ background: br.primary_color || "#58cc02" }} />
                    <div className="tenant-settings__color-preview-swatch" style={{ background: br.accent_color || "#1cb0f6" }} />
                  </div>

                  <div className="tenant-settings__field">
                    <label className="tenant-settings__label-with-hint">
                      Hero Title
                      <FieldHint title="Hero Title" description="Main headline on your landing page." />
                    </label>
                    <input
                      type="text"
                      className="tenant-settings__input tenant-settings__input--wide"
                      placeholder="e.g. Welcome to Robotics Academy"
                      defaultValue={br.hero_title || ""}
                      onBlur={(e) => saveBranding({ hero_title: e.target.value || null })}
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label className="tenant-settings__label-with-hint">
                      Hero Subtitle
                      <FieldHint title="Hero Subtitle" description="Supporting text below the main headline." />
                    </label>
                    <input
                      type="text"
                      className="tenant-settings__input tenant-settings__input--wide"
                      placeholder="e.g. Learn, Build, Innovate"
                      defaultValue={br.hero_subtitle || ""}
                      onBlur={(e) => saveBranding({ hero_subtitle: e.target.value || null })}
                    />
                  </div>

                  <div className="tenant-settings__form-grid">
                    <div className="tenant-settings__field">
                      <label className="tenant-settings__label-with-hint">
                        Tagline
                        <FieldHint title="Tagline" description="Short phrase shown below your logo." />
                      </label>
                      <input
                        type="text"
                        className="tenant-settings__input tenant-settings__input--wide"
                        placeholder="Short tagline below logo"
                        defaultValue={br.tagline || ""}
                        onBlur={(e) => saveBranding({ tagline: e.target.value || null })}
                      />
                    </div>
                    <div className="tenant-settings__field">
                      <label className="tenant-settings__label-with-hint">
                        Favicon URL
                        <FieldHint title="Favicon" description="Custom browser tab icon URL." />
                      </label>
                      <input
                        type="text"
                        className="tenant-settings__input tenant-settings__input--wide"
                        placeholder="https://example.com/favicon.ico"
                        defaultValue={br.favicon_url || ""}
                        onBlur={(e) => saveBranding({ favicon_url: e.target.value || null })}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Homepage */}
          <section
            id="panel-homepage"
            role="tabpanel"
            aria-labelledby="tab-homepage"
            hidden={activeTab !== "homepage"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Custom Homepage"
              description="Build a custom landing page for visitors on your subdomain or custom domain. Add, remove, and reorder sections."
            />
            {(() => {
              const s = (tenant?.settings as Record<string, unknown>) ?? {};
              const draft = (s.homepage_draft_sections as Array<{ type: string; content: Record<string, unknown>; visible?: boolean }>) ?? null;
              const live = (s.homepage_sections as Array<{ type: string; content: Record<string, unknown>; visible?: boolean }>) ?? null;
              const editorSections = draft ?? live ?? EMPTY_HP_SECTIONS;
              const isLive = !!live?.length && JSON.stringify(draft ?? live) === JSON.stringify(live);
              return (
                <HomepageSectionBuilder
                  sections={editorSections}
                  branding={(s.branding as Record<string, unknown>) || null}
                  isLive={isLive}
                  hasLiveSections={!!live?.length}
                  onSaveDraft={async (sections) => {
                    const existing = (tenant?.settings as Record<string, unknown>) ?? {};
                    const merged = { ...existing, homepage_draft_sections: sections };
                    await updateTenantSettings(tenant!.id, merged);
                    setTenant({ ...tenant!, settings: merged });
                  }}
                  onPublish={async () => {
                    const existing = (tenant?.settings as Record<string, unknown>) ?? {};
                    const draftSections = (existing.homepage_draft_sections ?? existing.homepage_sections ?? []) as Array<unknown>;
                    const merged = { ...existing, homepage_sections: draftSections, homepage_draft_sections: draftSections };
                    await updateTenantSettings(tenant!.id, merged);
                    setTenant({ ...tenant!, settings: merged });
                  }}
                  onUnpublish={async () => {
                    const existing = (tenant?.settings as Record<string, unknown>) ?? {};
                    const merged = { ...existing, homepage_sections: null };
                    await updateTenantSettings(tenant!.id, merged);
                    setTenant({ ...tenant!, settings: merged });
                  }}
                />
              );
            })()}
          </section>

          {/* Danger Zone */}
          <section
            id="panel-danger"
            role="tabpanel"
            aria-labelledby="tab-danger"
            hidden={activeTab !== "danger"}
            className="tenant-settings__panel tenant-settings__panel--danger"
          >
            <SectionHeading
              title="Danger Zone"
              description="High-risk organization actions. Use carefully because changes may be irreversible."
            />
            <p className="tenant-settings__panel-desc">
              Irreversible actions. Proceed with caution.
            </p>
            <div className="tenant-settings__danger-actions">
              <button
                type="button"
                className="tenant-settings__danger-btn"
                disabled
                title="Contact support to delete your organization"
                aria-disabled="true"
              >
                Delete organization
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
