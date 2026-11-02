import { NavLink, Outlet } from "react-router-dom";

import { useAuth, useUser } from "../auth/AuthProvider";
import { useReadiness } from "../hooks/queries";

/**
 * Surfaces /health/ready in the header.
 *
 * Readiness rather than liveness: the question a user cares about is "can this thing
 * serve me", and that includes its dependencies. Degraded — Temporal or Redis down —
 * is shown apart from down: reads and applications still work, publishing waits.
 * It polls every 15 seconds.
 */
function HealthBadge() {
  const { data, isError, isLoading } = useReadiness();

  const unreachable = data
    ? (["temporal", "redis"] as const).filter((name) => data[name] === "unreachable")
    : [];
  const state = isLoading ? "" : isError ? "down" : unreachable.length > 0 ? "degraded" : "up";
  const label = isLoading
    ? "checking"
    : isError
      ? "API unreachable"
      : unreachable.length > 0
        ? `API degraded · ${unreachable.join(", ")} down`
        : "API ready · db · temporal · redis";

  return (
    <span className="health" title="GET /health/ready">
      <span className={`dot ${state}`} />
      {label}
    </span>
  );
}

/** Recruiters manage candidates; a candidate has only their own profile. */
function Navigation() {
  const user = useUser();
  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

  return (
    <nav className="nav">
      <NavLink to="/jobs" className={linkClass}>
        Jobs
      </NavLink>
      {user.role === "recruiter" ? (
        <NavLink to="/candidates" className={linkClass}>
          Candidates
        </NavLink>
      ) : (
        <NavLink to={`/candidates/${user.id}`} className={linkClass}>
          My applications
        </NavLink>
      )}
    </nav>
  );
}

function UserMenu() {
  const user = useUser();
  const { signOut } = useAuth();

  return (
    <span className="user-menu">
      <span className="muted" title={user.email}>
        {user.email} · {user.role}
      </span>
      <button type="button" className="small ghost" onClick={() => void signOut()}>
        Sign out
      </button>
    </span>
  );
}

export function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          Smart<span>Hire</span>
        </span>
        <Navigation />
        <div className="topbar-right">
          <HealthBadge />
          <UserMenu />
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
