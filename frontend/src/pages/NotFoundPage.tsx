import { useLocation, useNavigate } from "react-router-dom";

import type { Role } from "../api/types";
import { useUser } from "../auth/AuthProvider";
import { isStaff } from "../auth/roles";
import { NAV_ITEMS, ROLE_HOME } from "../components/navigation";
import { Button, ButtonLink, Icon, Shortcut } from "../components/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const HOME_LABEL: Record<Role, string> = {
  recruiter: "Go to the dashboard",
  admin: "Go to the dashboard",
  candidate: "Go home",
};

/**
 * Any path the router does not know, inside the signed-in shell. It says which address
 * failed (the most useful fact when a link was mistyped or shared), offers the two
 * obvious ways out, and points at the palette for everything else.
 */
export function NotFoundPage() {
  const user = useUser();
  const { pathname, search, key } = useLocation();
  const navigate = useNavigate();
  useDocumentTitle("Page not found");

  const home = ROLE_HOME[user.role];
  const homeIcon = NAV_ITEMS[user.role].find((item) => item.to === home)?.icon ?? "home";
  // "default" is the key of the entry the app started on: this tab opened straight onto
  // the broken link, so "back" would leave the app.
  const canGoBack = key !== "default";
  const elsewhere = NAV_ITEMS[user.role].filter((item) => item.to !== home);

  return (
    <section className="notfound" aria-labelledby="notfound-title">
      <LostIllustration />
      <p className="notfound-code">Error 404</p>
      <h1 id="notfound-title" className="notfound-title">
        This page doesn’t exist
      </h1>
      <p className="notfound-lede">
        Nothing lives at{" "}
        <code className="notfound-path" title={pathname + search}>
          {pathname + search}
        </code>
        . The link may be old, mistyped, or for something that has since been removed.
      </p>

      <div className="notfound-actions">
        <ButtonLink to={home} variant="primary" leftIcon={homeIcon}>
          {HOME_LABEL[user.role]}
        </ButtonLink>
        {canGoBack && (
          <Button leftIcon="arrow-left" onClick={() => navigate(-1)}>
            Go back
          </Button>
        )}
      </div>

      <nav className="notfound-links" aria-label="Other places">
        {elsewhere.map((item) => (
          <ButtonLink key={item.to} to={item.to} variant="ghost" size="sm" leftIcon={item.icon}>
            {item.label}
          </ButtonLink>
        ))}
      </nav>

      <p className="notfound-hint">
        {/* Search, not ⌘: the key caps already name the platform's own modifier. */}
        <Icon name="search" />
        <span>
          Looking for something specific? Press <Shortcut combo="mod+k" /> to search{" "}
          {isStaff(user.role) ? "jobs, candidates and pages" : "open jobs and pages"}.
        </span>
      </p>
    </section>
  );
}

/** A signpost pointing nowhere over a dotted trail that runs out. Decorative; colours
 * come from tokens through currentColor and CSS classes, so it follows the theme. */
function LostIllustration() {
  return (
    <svg
      className="notfound-art"
      viewBox="0 0 240 160"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="notfound-art-ground" cx="120" cy="138" rx="96" ry="10" />
      <path
        className="notfound-art-trail"
        d="M24 138 C 60 120, 84 146, 120 132 S 176 116, 196 128"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 9"
      />
      <rect className="notfound-art-post" x="114" y="44" width="10" height="94" rx="3" />
      <path
        className="notfound-art-sign"
        d="M70 40 h86 l16 14 l-16 14 h-86 a6 6 0 0 1 -6 -6 v-16 a6 6 0 0 1 6 -6 z"
      />
      <path
        className="notfound-art-sign notfound-art-sign-back"
        d="M170 76 h-86 l-16 14 l16 14 h86 a6 6 0 0 0 6 -6 v-16 a6 6 0 0 0 -6 -6 z"
      />
      <text className="notfound-art-text" x="112" y="59" textAnchor="middle">
        404
      </text>
      <path
        className="notfound-art-mark"
        d="M110 86 q 4 -6 10 -2 t 4 8 q -2 3 -6 4 M118 100 v 0.5"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle className="notfound-art-spark" cx="196" cy="34" r="4" />
      <circle className="notfound-art-spark" cx="42" cy="62" r="3" />
      <circle className="notfound-art-spark" cx="210" cy="96" r="2.5" />
    </svg>
  );
}
