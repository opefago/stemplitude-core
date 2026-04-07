import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gamepad2 } from "lucide-react";
import { listExploreGameCards } from "../lib/api/labs";
import LMSStaticHeader from "./lms/LMSStaticHeader";
import "./LMSHome.css";
import "./ExploreGamesPage.css";

const PAGE_SIZE = 24;

function formatDate(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ExploreGamesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listExploreGameCards({ limit: PAGE_SIZE, skip: 0 })
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load explore games.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => rows, [rows]);

  return (
    <div className="explore-games">
      <LMSStaticHeader solidHero />
      <main role="main" aria-label="Explore published games">
        <section className="explore-games__hero">
          <p className="explore-games__eyebrow">Explore</p>
          <h1 className="explore-games__title">Published Games by Learners</h1>
          <p className="explore-games__subtitle">
            Discover creations shared by students. Only projects marked public by permitted
            classrooms are shown here.
          </p>
        </section>

        {error ? (
          <div className="explore-games__error" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="explore-games__empty">Loading public games…</div>
        ) : null}

        {!loading && !error && cards.length === 0 ? (
          <div className="explore-games__empty">
            No published games yet. Check back soon.
          </div>
        ) : null}

        {!loading && !error && cards.length > 0 ? (
          <section className="explore-games__grid" aria-label="Published game gallery">
            {cards.map((card) => {
              const dateText = formatDate(card.published_at);
              const cta = card.play_url ? (
                <a
                  className="explore-games__play"
                  href={card.play_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Play <ArrowRight size={14} aria-hidden />
                </a>
              ) : (
                <span className="explore-games__play explore-games__play--disabled">
                  Coming soon
                </span>
              );

              return (
                <article key={card.id} className="explore-games__card">
                  <div className="explore-games__thumb">
                    {card.icon_url ? (
                      <img src={card.icon_url} alt={`${card.title} cover`} loading="lazy" />
                    ) : (
                      <div className="explore-games__thumb-fallback" aria-hidden>
                        <Gamepad2 size={28} />
                      </div>
                    )}
                  </div>
                  <div className="explore-games__content">
                    <h2 className="explore-games__card-title">{card.title}</h2>
                    <p className="explore-games__creator">By {card.creator_name}</p>
                    {dateText ? <p className="explore-games__date">Published {dateText}</p> : null}
                  </div>
                  <div className="explore-games__footer">{cta}</div>
                </article>
              );
            })}
          </section>
        ) : null}

        <div className="explore-games__back">
          <Link to="/" className="explore-games__home-link">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
