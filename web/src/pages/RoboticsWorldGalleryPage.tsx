import { Search, Filter, Trophy, Play, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  listRoboticsWorldGallery,
  getRoboticsWorldByShareCode,
  type RoboticsWorldGalleryItem,
} from "../lib/api/robotics";
import { GRID_CELL_CM } from "../features/robotics_lab/workspaceDefaults";

const DIFFICULTY_OPTIONS = [
  { value: "", label: "All Levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function RoboticsWorldGalleryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [worlds, setWorlds] = useState<RoboticsWorldGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [shareCodeInput, setShareCodeInput] = useState("");
  const [shareCodeError, setShareCodeError] = useState("");

  useEffect(() => {
    setLoading(true);
    listRoboticsWorldGallery({
      search: search || undefined,
      difficulty: difficulty || undefined,
      limit: 50,
    })
      .then(setWorlds)
      .catch(() => setWorlds([]))
      .finally(() => setLoading(false));
  }, [search, difficulty]);

  async function handleShareCodeLoad() {
    if (!shareCodeInput.trim()) return;
    setShareCodeError("");
    try {
      const world = await getRoboticsWorldByShareCode(shareCodeInput.trim());
      navigate(`/playground/robotics/sim?world_id=${world.id}`);
    } catch {
      setShareCodeError("World not found. Check the code and try again.");
    }
  }

  function handlePlayWorld(worldId: string) {
    navigate(`/playground/robotics/sim?world_id=${worldId}`);
  }

  return (
    <div className="robotics-gallery-page">
      <header className="robotics-gallery-header">
        <h2>World Gallery</h2>
        <p>Browse and play community worlds, or load a world by share code.</p>
      </header>

      <div className="robotics-gallery-toolbar">
        <div className="robotics-gallery-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search worlds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="robotics-gallery-filters">
          <Filter size={14} />
          {DIFFICULTY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`robotics-lab-btn${difficulty === opt.value ? " active" : ""}`}
              onClick={() => setDifficulty(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="robotics-gallery-share-code">
          <input
            type="text"
            placeholder="Enter share code"
            value={shareCodeInput}
            onChange={(e) => {
              setShareCodeInput(e.target.value.toUpperCase());
              setShareCodeError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleShareCodeLoad()}
            maxLength={12}
          />
          <button className="robotics-lab-btn" onClick={handleShareCodeLoad}>
            <Share2 size={14} /> Load
          </button>
          {shareCodeError && <span className="robotics-gallery-error">{shareCodeError}</span>}
        </div>
      </div>

      <div className="robotics-gallery-grid">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="robotics-skeleton robotics-skeleton-card" style={{ height: 160 }} />
          ))
        ) : worlds.length === 0 ? (
          <div className="robotics-gallery-empty">
            <p>No worlds found. Try a different search or create your own in the simulator editor.</p>
          </div>
        ) : (
          worlds.map((world) => (
            <div key={world.id} className="robotics-gallery-card">
              <div className="robotics-gallery-card-header">
                <strong>{world.title}</strong>
                {world.difficulty && (
                  <span className={`robotics-difficulty-badge robotics-difficulty-badge--${world.difficulty}`}>
                    {world.difficulty}
                  </span>
                )}
              </div>
              {world.description && <p className="robotics-gallery-card-desc">{world.description}</p>}
              <div className="robotics-gallery-card-meta">
                <span>{world.width_cells * GRID_CELL_CM}x{world.height_cells * GRID_CELL_CM} cm</span>
                <span>{world.object_count} objects</span>
                <span><Trophy size={12} /> {world.play_count} plays</span>
              </div>
              {world.tags.length > 0 && (
                <div className="robotics-gallery-card-tags">
                  {world.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="robotics-gallery-tag">{tag}</span>
                  ))}
                </div>
              )}
              <div className="robotics-gallery-card-actions">
                <button className="robotics-lab-btn" onClick={() => handlePlayWorld(world.id)}>
                  <Play size={14} /> Play
                </button>
                {world.share_code && (
                  <button
                    className="robotics-lab-btn"
                    onClick={() => navigator.clipboard?.writeText(world.share_code!)}
                    title={`Share code: ${world.share_code}`}
                  >
                    <Share2 size={14} /> {world.share_code}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
