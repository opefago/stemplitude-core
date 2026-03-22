import { Link, useLocation } from "react-router-dom";
import { Home } from "lucide-react";
import { useUIMode } from "../../providers/UIModeProvider";
import "./breadcrumbs.css";

function formatSegment(segment: string): string {
  if (!segment) return "";
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function Breadcrumbs() {
  const { mode } = useUIMode();
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter(Boolean);

  if (mode === "kids") {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol className="breadcrumbs__list">
        <li className="breadcrumbs__item">
          <Link to="/" className="breadcrumbs__link">
            <Home size={16} aria-hidden />
            <span>Home</span>
          </Link>
        </li>
        {pathnames.map((segment, index) => {
          const path = `/${pathnames.slice(0, index + 1).join("/")}`;
          const isLast = index === pathnames.length - 1;
          const label = formatSegment(segment);

          return (
            <li key={path} className="breadcrumbs__item">
              <span className="breadcrumbs__separator" aria-hidden>
                /
              </span>
              {isLast ? (
                <span
                  className="breadcrumbs__current"
                  aria-current="page"
                >
                  {label}
                </span>
              ) : (
                <Link to={path} className="breadcrumbs__link">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
