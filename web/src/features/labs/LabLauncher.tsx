import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  FlaskConical,
  Cpu,
  Palette,
  Blocks,
  Clock,
  FolderOpen,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useUIMode } from "../../providers/UIModeProvider";
import { useTenant } from "../../providers/TenantProvider";
import { resolveLabRoute } from "./labRouting";
import "./labs.css";

interface LabItem {
  id: string;
  name: string;
  description: string;
  path: string;
  icon?: LucideIcon;
  iconSrc?: string;
  colorVar: string;
}

const LABS: LabItem[] = [
  {
    id: "circuit-maker",
    name: "Circuit Maker",
    description: "Build and simulate electronic circuits",
    path: "/playground/circuit-maker",
    icon: FlaskConical,
    colorVar: "--lab-card-circuit",
  },
  {
    id: "micro-maker",
    name: "Micro Maker",
    description: "Program microcontrollers with blocks",
    path: "/playground/micro-maker",
    icon: Cpu,
    colorVar: "--lab-card-micro",
  },
  {
    id: "python-game",
    name: "Python Game Maker",
    description: "Build games with Python",
    path: "/playground/python-game",
    iconSrc: "/assets/python-logo.svg",
    colorVar: "--lab-card-python",
  },
  {
    id: "game-maker",
    name: "Game Maker",
    description: "Design games with visual tools",
    path: "/playground/game-maker",
    icon: Palette,
    colorVar: "--lab-card-maker",
  },
  {
    id: "design-maker",
    name: "Design Maker",
    description: "3D modeling and design",
    path: "/playground/design-maker",
    icon: Blocks,
    colorVar: "--lab-card-design",
  },
];

export function LabLauncher() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { mode } = useUIMode();
  useTenant();

  useEffect(() => {
    const requestedLab = searchParams.get("lab");
    if (!requestedLab) return;
    const match = resolveLabRoute(requestedLab);
    if (!match) return;
    const params = new URLSearchParams(searchParams);
    params.set("lab", match.id);
    navigate(`${match.route}?${params.toString()}`, { replace: true });
  }, [navigate, searchParams]);

  return (
    <div
      className="lab-launcher"
      data-ui-mode={mode}
      role="main"
      aria-label="Lab launcher"
    >
      <header className="lab-launcher__header">
        <h1 className="lab-launcher__title">Your Labs</h1>
        {user && (
          <p className="lab-launcher__subtitle">
            Hi, {user.firstName}! Choose a lab to start creating.
          </p>
        )}
      </header>

      <section
        className="lab-launcher__grid"
        aria-labelledby="labs-heading"
      >
        <h2 id="labs-heading" className="visually-hidden">
          Available labs
        </h2>
        {LABS.map((lab) => {
          const Icon = lab.icon;
          return (
            <article
              key={lab.id}
              className="lab-launcher__card"
              style={
                {
                  "--lab-card-accent": `var(${lab.colorVar})`,
                } as React.CSSProperties
              }
            >
              <div className="lab-launcher__card-icon-wrap">
                {lab.iconSrc ? (
                  <img
                    src={lab.iconSrc}
                    alt=""
                    aria-hidden
                    className="lab-launcher__card-icon-image"
                  />
                ) : Icon ? (
                  <Icon
                    className="lab-launcher__card-icon"
                    aria-hidden
                    size={32}
                  />
                ) : null}
              </div>
              <h3 className="lab-launcher__card-title">{lab.name}</h3>
              <p className="lab-launcher__card-desc">{lab.description}</p>
              <p className="lab-launcher__card-meta" aria-label="Last opened">
                <Clock size={14} aria-hidden />
                Last opened: 2 days ago
              </p>
              <p className="lab-launcher__card-meta" aria-label="Project count">
                <FolderOpen size={14} aria-hidden />
                3 projects
              </p>
              <Link
                to={lab.path}
                className="lab-launcher__card-action"
                aria-label={`Launch ${lab.name}`}
              >
                Launch <ArrowRight size={16} aria-hidden />
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
