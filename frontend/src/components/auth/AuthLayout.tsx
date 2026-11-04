import type { ReactNode } from "react";

import { useTheme } from "../../hooks/useTheme";
import { Avatar, Icon, IconButton, ScoreRing, StagePill, cx, type IconName } from "../ui";

/**
 * The signed-out frame: the form on the right, the brand panel on the left. The panel
 * comes second in the DOM so the page's h1 — the form's — is the first heading a
 * screen reader meets; the grid puts it back on the left. Below 900px it is hidden
 * and a compact logo sits above the form instead.
 */
export function AuthLayout({
  children,
  width = "narrow",
}: {
  children: ReactNode;
  /** "wide" for multi-column forms, like registration's profile step. */
  width?: "narrow" | "wide";
}) {
  return (
    <div className="auth-shell">
      <div className="auth-main">
        <header className="auth-main-bar">
          <BrandMark className="auth-main-brand" />
          <ThemeToggle />
        </header>
        <main id="main" className="auth-main-content">
          <div className="auth-form-card" data-width={width}>
            {children}
          </div>
        </main>
        <footer className="auth-main-footer">© {new Date().getFullYear()} SmartHire</footer>
      </div>
      <BrandPanel />
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx("brand", className)}>
      <span className="brand-mark" aria-hidden="true">
        S
      </span>
      <span className="brand-text">
        Smart<span>Hire</span>
      </span>
    </span>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  // A native title, not <Tooltip>: pinned to the viewport's right edge, the tooltip
  // would overflow it and give the page a horizontal scrollbar.
  return (
    <IconButton
      icon={resolved === "dark" ? "sun" : "moon"}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={toggle}
    />
  );
}

interface Audience {
  icon: IconName;
  title: string;
  lead: string;
  points: string[];
}

const AUDIENCES: Audience[] = [
  {
    icon: "user",
    title: "For candidates",
    lead: "One profile, transparent progress.",
    points: [
      "Apply to any open role with the profile you already have",
      "See every stage your application reaches, as it happens",
      "Know whether a role is a fit before you apply",
    ],
  },
  {
    icon: "users",
    title: "For hiring teams",
    lead: "Pipeline, scoring, workflows.",
    points: [
      "A stage-by-stage pipeline for every role",
      "A skill-match score on each application",
      "Publishing that runs as a durable workflow",
    ],
  },
];

function BrandPanel() {
  return (
    <aside className="auth-brand" aria-label="About SmartHire">
      <BrandMark className="auth-brand-logo" />

      <div className="auth-brand-body">
        <p className="auth-brand-eyebrow">Hiring, in the open</p>
        <h2 className="auth-brand-title">
          Candidates and hiring teams, looking at the same picture.
        </h2>

        <div className="auth-audiences">
          {AUDIENCES.map((audience) => (
            <section key={audience.title} className="auth-audience">
              <h3 className="auth-audience-title">
                <span className="auth-audience-icon">
                  <Icon name={audience.icon} size={14} />
                </span>
                {audience.title}
              </h3>
              <p className="auth-audience-lead">{audience.lead}</p>
              <ul className="auth-audience-points">
                {audience.points.map((point) => (
                  <li key={point}>
                    <Icon name="check" size={14} />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <ProductGlimpse />
    </aside>
  );
}

/** A still of the product — an application as both sides see it. Decorative: the
 * value props above already say it in words. */
function ProductGlimpse() {
  return (
    <div className="auth-glimpse" aria-hidden="true">
      <div className="auth-glimpse-row">
        <Avatar name="Ayesha Khan" size="md" />
        <div className="auth-glimpse-who">
          <span className="auth-glimpse-name">Ayesha Khan</span>
          <span className="auth-glimpse-role">Senior Backend Engineer</span>
        </div>
        <ScoreRing score={86} size={40} />
      </div>
      <div className="auth-glimpse-row auth-glimpse-foot">
        <StagePill stage="interview" />
        <span className="auth-glimpse-meta">
          <Icon name="clock" size={12} />
          Moved 2h ago
        </span>
      </div>
    </div>
  );
}
