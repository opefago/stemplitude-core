import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useColorScheme } from "../../hooks/useColorScheme";
import { useCommandPalette } from "../../contexts/CommandPaletteContext";
import "./command-palette.css";

type Command = {
  id: string;
  label: string;
  iconSrc: string;
  action: () => void;
  keywords: string[];
};

function fuzzyMatch(search: string, text: string): boolean {
  if (!search.trim()) return true;
  const s = search.toLowerCase().trim();
  const t = text.toLowerCase();
  let j = 0;
  for (let i = 0; i < t.length && j < s.length; i++) {
    if (t[i] === s[j]) j++;
  }
  return j === s.length;
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const { logout, role, isSuperAdmin } = useAuth();
  const { isPlatformView } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleColorScheme } = useColorScheme();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const classroomMatch = location.pathname.match(/^\/app\/classrooms\/([^/]+)(?:\/live)?$/);
    const classroomId = classroomMatch?.[1];
    const base = [
      {
        id: "toggle-dark",
        label: "Toggle Dark Mode",
        iconSrc: "/assets/cartoon-icons/gear.png",
        action: toggleColorScheme,
        keywords: ["dark", "light", "theme", "mode", "toggle"],
      },
      {
        id: "logout",
        label: "Log Out",
        iconSrc: "/assets/cartoon-icons/Forbidden.png",
        action: logout,
        keywords: ["logout", "log out", "sign out"],
      },
    ];
    const sessionCommands: Command[] = classroomId
      ? [
          ...(isSuperAdmin || role === "admin" || role === "owner" || role === "instructor"
            ? [{
                id: "class-start-session",
                label: "Start Session Now",
                iconSrc: "/assets/cartoon-icons/Rocket1.png",
                action: () => navigate(`/app/classrooms/${classroomId}?sessionAction=start`),
                keywords: ["start", "session", "class", "live"],
              }]
            : []),
          {
            id: "class-join-session",
            label: "Join Active Session",
            iconSrc: "/assets/cartoon-icons/portal1.png",
            action: () => navigate(`/app/classrooms/${classroomId}/live`),
            keywords: ["join", "session", "meeting"],
          },
          {
            id: "class-waiting-room",
            label: "Open Waiting Room",
            iconSrc: "/assets/cartoon-icons/Clock.png",
            action: () => navigate(`/app/classrooms/${classroomId}?sessionAction=waiting`),
            keywords: ["waiting", "room", "class"],
          },
        ]
      : [];

    /* Platform view: admin tasks and platform actions only via platform shield dropdown */
    if (isSuperAdmin && isPlatformView) {
      return base;
    }

    if (role === "admin" || role === "owner") {
      return [
        { id: "dashboard", label: "Go to Dashboard", iconSrc: "/assets/cartoon-icons/house.png", action: () => navigate("/app"), keywords: ["home", "dashboard"] },
        { id: "labs", label: "Go to Labs", iconSrc: "/assets/cartoon-icons/telescope.png", action: () => navigate("/app/labs"), keywords: ["labs", "lab", "workspace"] },
        { id: "classrooms", label: "Go to Classrooms", iconSrc: "/assets/cartoon-icons/bag.png", action: () => navigate("/app/classrooms"), keywords: ["classrooms", "classroom", "class"] },
        { id: "members", label: "Go to Users", iconSrc: "/assets/cartoon-icons/Players.png", action: () => navigate("/app/members"), keywords: ["users", "members", "people"] },
        { id: "curriculum", label: "Go to Curriculum", iconSrc: "/assets/cartoon-icons/Books.png", action: () => navigate("/app/curriculum"), keywords: ["curriculum", "course", "content"] },
        { id: "programs", label: "Go to Programs", iconSrc: "/assets/cartoon-icons/Globe.png", action: () => navigate("/app/programs"), keywords: ["programs"] },
        { id: "assets", label: "Go to Assets", iconSrc: "/assets/cartoon-icons/Chest.png", action: () => navigate("/app/assets"), keywords: ["assets"] },
        { id: "settings", label: "Go to Settings", iconSrc: "/assets/cartoon-icons/settings.png", action: () => navigate("/app/settings"), keywords: ["settings", "setting", "preferences"] },
        { id: "integrations", label: "Go to Integrations", iconSrc: "/assets/cartoon-icons/Thunder.png", action: () => navigate("/app/integrations"), keywords: ["integrations"] },
        { id: "billing", label: "Go to Billing", iconSrc: "/assets/cartoon-icons/coin.png", action: () => navigate("/app/billing"), keywords: ["billing"] },
        { id: "roles", label: "Go to Roles", iconSrc: "/assets/cartoon-icons/Lock.png", action: () => navigate("/app/roles"), keywords: ["roles", "permissions"] },

        ...sessionCommands,
        ...base,
      ];
    }

    if (role === "instructor") {
      return [
        { id: "dashboard", label: "Go to Dashboard", iconSrc: "/assets/cartoon-icons/house.png", action: () => navigate("/app"), keywords: ["home", "dashboard"] },
        { id: "classrooms", label: "Go to Classrooms", iconSrc: "/assets/cartoon-icons/bag.png", action: () => navigate("/app/classrooms"), keywords: ["classrooms", "classroom", "class"] },
        { id: "students", label: "Go to Students", iconSrc: "/assets/cartoon-icons/Players.png", action: () => navigate("/app/students"), keywords: ["students"] },
        { id: "curriculum", label: "Go to Curriculum", iconSrc: "/assets/cartoon-icons/Books.png", action: () => navigate("/app/curriculum"), keywords: ["curriculum", "course"] },
        { id: "messages", label: "Go to Messages", iconSrc: "/assets/cartoon-icons/Information.png", action: () => navigate("/app/messages"), keywords: ["messages", "message", "inbox"] },
        ...sessionCommands,
        ...base,
      ];
    }

    if (role === "parent") {
      return [
        { id: "dashboard", label: "Go to Dashboard", iconSrc: "/assets/cartoon-icons/house.png", action: () => navigate("/app"), keywords: ["home", "dashboard"] },
        { id: "children", label: "Go to Children", iconSrc: "/assets/cartoon-icons/Players.png", action: () => navigate("/app/children"), keywords: ["children", "kids"] },
        { id: "messages", label: "Go to Updates & Messages", iconSrc: "/assets/cartoon-icons/Information.png", action: () => navigate("/app/messages"), keywords: ["messages", "message", "inbox", "updates"] },
        { id: "notifications", label: "Go to Notifications", iconSrc: "/assets/cartoon-icons/Bell.png", action: () => navigate("/app/notifications"), keywords: ["notifications"] },
        ...sessionCommands,
        ...base,
      ];
    }

    if (role === "homeschool_parent") {
      return [
        { id: "dashboard", label: "Go to Dashboard", iconSrc: "/assets/cartoon-icons/house.png", action: () => navigate("/app"), keywords: ["home", "dashboard"] },
        { id: "students", label: "Go to Students", iconSrc: "/assets/cartoon-icons/Players.png", action: () => navigate("/app/students"), keywords: ["students", "learners"] },
        { id: "classrooms", label: "Go to Classrooms", iconSrc: "/assets/cartoon-icons/bag.png", action: () => navigate("/app/classrooms"), keywords: ["classrooms", "class"] },
        { id: "curriculum", label: "Go to Curriculum", iconSrc: "/assets/cartoon-icons/Books.png", action: () => navigate("/app/curriculum"), keywords: ["curriculum", "courses"] },
        { id: "labs", label: "Go to Labs", iconSrc: "/assets/cartoon-icons/telescope.png", action: () => navigate("/app/labs"), keywords: ["labs", "lab"] },
        { id: "children", label: "Go to Children", iconSrc: "/assets/cartoon-icons/Players.png", action: () => navigate("/app/children"), keywords: ["children", "kids"] },
        { id: "billing", label: "Go to Billing", iconSrc: "/assets/cartoon-icons/coin.png", action: () => navigate("/app/billing"), keywords: ["billing", "subscription", "plan"] },
        { id: "settings", label: "Go to Settings", iconSrc: "/assets/cartoon-icons/Lock.png", action: () => navigate("/app/settings"), keywords: ["settings", "tenant"] },
        { id: "messages", label: "Go to Updates & Messages", iconSrc: "/assets/cartoon-icons/Information.png", action: () => navigate("/app/messages"), keywords: ["messages", "message", "inbox", "updates"] },
        { id: "notifications", label: "Go to Notifications", iconSrc: "/assets/cartoon-icons/Bell.png", action: () => navigate("/app/notifications"), keywords: ["notifications"] },
        ...sessionCommands,
        ...base,
      ];
    }

    return [
      { id: "dashboard", label: "Go to Dashboard", iconSrc: "/assets/cartoon-icons/house.png", action: () => navigate("/app"), keywords: ["home", "dashboard"] },
      { id: "labs", label: "Go to Labs", iconSrc: "/assets/cartoon-icons/telescope.png", action: () => navigate("/app/labs"), keywords: ["labs", "lab", "workspace"] },
      { id: "achievements", label: "Go to Achievements", iconSrc: "/assets/cartoon-icons/trophy.png", action: () => navigate("/app/achievements"), keywords: ["achievements", "achievement", "badges", "stickers"] },
      { id: "messages", label: "Go to Messages", iconSrc: "/assets/cartoon-icons/Information.png", action: () => navigate("/app/messages"), keywords: ["messages", "message", "inbox"] },
      ...sessionCommands,
      ...base,
    ];
  }, [navigate, toggleColorScheme, logout, role, isSuperAdmin, isPlatformView, location.pathname]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter(
      (c) =>
        fuzzyMatch(query, c.label) ||
        c.keywords.some((k) => fuzzyMatch(query, k)),
    );
  }, [commands, query]);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, [setOpen]);

  const executeCommand = useCallback(
    (cmd: Command) => {
      closePalette();
      cmd.action();
    },
    [closePalette],
  );

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) {
            setQuery("");
            setSelectedIndex(0);
            requestAnimationFrame(() => inputRef.current?.focus());
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closePalette();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, closePalette]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLDivElement>) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closePalette();
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            i < filteredCommands.length - 1 ? i + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredCommands.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;
      }
    },
    [closePalette, filteredCommands, selectedIndex, executeCommand],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const option = el.querySelector(
      `[data-index="${selectedIndex}"]`,
    ) as HTMLElement | null;
    option?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={closePalette}
      role="presentation"
    >
      <div
        className="command-palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-search-wrap">
          <Search
            className="command-palette-search-icon"
            size={24}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-search"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-controls="command-palette-listbox"
            aria-activedescendant={
              filteredCommands[selectedIndex]
                ? `command-option-${filteredCommands[selectedIndex].id}`
                : undefined
            }
            aria-expanded={filteredCommands.length > 0}
          />
        </div>

        <div
          ref={listRef}
          id="command-palette-listbox"
          className="command-palette-results"
          role="listbox"
          tabIndex={-1}
          aria-label="Commands"
        >
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              {query.trim() ? (
                "No commands found"
              ) : (
                <>
                  <span>Type to search commands</span>
                  <div className="command-palette-shortcut">
                    <kbd>⌘</kbd>
                    <kbd>K</kbd> or <kbd>Ctrl</kbd>
                    <kbd>K</kbd> to open
                  </div>
                </>
              )}
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              return (
                <button
                  key={cmd.id}
                  type="button"
                  className="command-palette-item"
                  role="option"
                  id={`command-option-${cmd.id}`}
                  data-index={idx}
                  aria-selected={idx === selectedIndex}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <img
                    src={cmd.iconSrc}
                    className="command-palette-item-icon command-palette-item-icon--img"
                    alt=""
                    aria-hidden
                  />
                  {cmd.label}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
