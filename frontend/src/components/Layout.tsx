import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
} from "react";
import { Link, NavLink, Outlet, useLocation, useMatches, useNavigate } from "react-router-dom";

import { useAuth, useUser } from "../auth/AuthProvider";
import { isStaff } from "../auth/roles";
import { useHotkeys, type Hotkey } from "../hooks/useHotkeys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useReadiness } from "../hooks/queries";
import { useTheme } from "../hooks/useTheme";
import { isMac } from "../lib/hotkeys";
import { CommandPalette } from "./CommandPalette";
import { NAV_ITEMS, ROLE_HOME, SIDEBAR_COLLAPSED_KEY, type RouteHandle } from "./navigation";
import { ShortcutsDialog } from "./ShortcutsDialog";
import {
  Avatar,
  DropdownMenu,
  ErrorBoundary,
  Icon,
  IconButton,
  PageSkeleton,
  Shortcut,
  Tooltip,
  cx,
  humanize,
  useOverlay,
  type MenuEntry,
} from "./ui";

/** Below this width the sidebar becomes a drawer. Mirrors the 900px in layout.css. */
const MOBILE_QUERY = "(max-width: 900px)";

/**
 * Surfaces /health/ready in the header — for recruiters only. Degraded (Temporal or
 * Redis down) holds up publishing, which only recruiters do; candidates' reads and
 * applications keep working, so to them it would be alarming noise. They get
 * ConnectionNotice instead.
 *
 * Readiness rather than liveness: the question is "can this thing serve me", and that
 * includes its dependencies. It polls every 15 seconds.
 */
function HealthBadge() {
  const { data, isError, isLoading } = useReadiness();

  const unreachable = data
    ? (["temporal", "redis"] as const).filter((name) => data[name] === "unreachable")
    : [];
  const state = isLoading ? "" : isError ? "down" : unreachable.length > 0 ? "degraded" : "up";
  const label = isLoading
    ? "Checking API…"
    : isError
      ? "API unreachable"
      : unreachable.length > 0
        ? `API degraded · ${unreachable.join(", ")} down`
        : "API ready · db · temporal · redis";
  const short = isLoading
    ? "Checking"
    : isError
      ? "Offline"
      : unreachable.length > 0
        ? "Degraded"
        : "Online";

  return (
    <Tooltip content={label} side="bottom">
      {/* role="img" makes it one named thing: a bare span's aria-label is ignored. */}
      <span className="health" role="img" tabIndex={0} aria-label={label}>
        <span className={cx("dot", state)} aria-hidden="true" />
        <span className="topbar-desktop-only" aria-hidden="true">
          {short}
        </span>
      </span>
    </Tooltip>
  );
}

/**
 * The candidate's side of the health check: silent unless the API cannot be reached
 * at all, and then in plain words. It shares HealthBadge's query, so it costs nothing.
 */
function ConnectionNotice() {
  const { isError } = useReadiness();
  return (
    <div role="status">
      {isError && (
        <p className="connection-notice">
          <Icon name="alert-circle" size={16} />
          We're having trouble connecting. Your changes may not save.
        </p>
      )}
    </div>
  );
}

/** In the collapsed rail only the icon shows, so its label (and shortcut) goes in a
 * tooltip — which, unlike `title`, also appears on keyboard focus. */
function RailTooltip({
  iconsOnly,
  label,
  shortcut,
  children,
}: {
  iconsOnly: boolean;
  label: string;
  shortcut: string;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  if (!iconsOnly) return children;
  return (
    <Tooltip
      side="right"
      content={
        <span className="rail-tooltip">
          {label}
          <Shortcut combo={shortcut} />
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}

function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  mobile,
  mobileOpen,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
  mobile: boolean;
  mobileOpen: boolean;
}) {
  const user = useUser();
  const sidebarRef = useRef<HTMLElement>(null);
  // As a drawer it is modal: focus moves in, Escape closes, Tab stays inside.
  useOverlay(sidebarRef, { open: mobile && mobileOpen, onClose: onNavigate });
  const iconsOnly = collapsed && !mobile;

  return (
    <aside
      ref={sidebarRef}
      id="app-sidebar"
      className="sidebar"
      // Not "Main": that would read as a second <main> landmark.
      aria-label="Navigation"
      // Off-screen as a closed drawer: out of the tab order and the accessibility tree.
      inert={mobile && !mobileOpen}
      role={mobile && mobileOpen ? "dialog" : undefined}
      aria-modal={mobile && mobileOpen ? true : undefined}
      tabIndex={-1}
    >
      <div className="sidebar-header">
        <Link
          to={ROLE_HOME[user.role]}
          className="brand"
          onClick={onNavigate}
          aria-label="SmartHire home"
        >
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-text">
            Smart<span>Hire</span>
          </span>
        </Link>
        {/* The drawer is a modal dialog: it needs a way out that screen readers and
            touch users can reach — Escape and the backdrop are neither. */}
        {mobile && (
          <IconButton
            icon="x"
            aria-label="Close navigation"
            className="sidebar-close"
            onClick={onNavigate}
          />
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        <span className="nav-section-label">
          {isStaff(user.role) ? "Hiring" : "Your search"}
        </span>
        {/* The "g …" sequences cannot be written in aria-keyshortcuts, which has no
            notion of a sequence; the rail's tooltip and the shortcuts dialog show them. */}
        {NAV_ITEMS[user.role].map((item) => (
          <RailTooltip key={item.to} iconsOnly={iconsOnly} label={item.label} shortcut={item.shortcut}>
            <NavLink
              to={item.to}
              className={({ isActive }) => cx("nav-item", isActive && "active")}
              onClick={onNavigate}
              aria-label={iconsOnly ? item.label : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span className="nav-item-label">{item.label}</span>
            </NavLink>
          </RailTooltip>
        ))}
      </nav>

      {!mobile && (
        <div className="sidebar-footer">
          <RailTooltip iconsOnly={iconsOnly} label="Expand sidebar" shortcut="[">
            <button
              type="button"
              className="nav-item"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-keyshortcuts="["
            >
              <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} size={18} />
              <span className="nav-item-label">Collapse</span>
            </button>
          </RailTooltip>
        </div>
      )}
    </aside>
  );
}

const THEME_CHOICES = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
] as const;

function UserMenu({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const user = useUser();
  const { signOut } = useAuth();
  const { preference, setPreference } = useTheme();

  const items: MenuEntry[] = [
    {
      type: "label",
      label: (
        <span className="menu-identity">
          <span className="menu-identity-email truncate">{user.email}</span>
          {humanize(user.role)}
        </span>
      ),
    },
    { type: "separator" },
    { label: user.role === "candidate" ? "Your profile" : "Account", icon: "user", to: "/profile" },
    { label: "Keyboard shortcuts", icon: "keyboard", hint: "?", onSelect: onShowShortcuts },
    { type: "separator" },
    { type: "label", label: "Theme" },
    ...THEME_CHOICES.map(
      ({ value, label, icon }): MenuEntry => ({
        label,
        icon,
        checked: preference === value,
        onSelect: () => setPreference(value),
      }),
    ),
    { type: "separator" },
    { label: "Sign out", icon: "log-out", onSelect: () => void signOut() },
  ];

  return (
    <DropdownMenu
      align="end"
      aria-label="Account"
      items={items}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className="icon-btn"
          aria-label={`Account menu for ${user.email}`}
        >
          <Avatar name={user.email} size="sm" title="" />
        </button>
      )}
    />
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <Tooltip content={`Switch to ${next} theme`} side="bottom">
      <IconButton
        icon={resolved === "dark" ? "sun" : "moon"}
        aria-label={`Switch to ${next} theme`}
        onClick={toggle}
      />
    </Tooltip>
  );
}

/**
 * The signed-in shell: sidebar, topbar, and the routed page. It owns the global
 * keyboard layer — ⌘K / Ctrl K for the palette, "?" for the shortcut list, "[" to
 * collapse the sidebar, and the "g …" sequences from navigation.ts.
 */
export function Layout() {
  const user = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.wide);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [collapsed, setCollapsed] = useLocalStorage(SIDEBAR_COLLAPSED_KEY, false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const focusedPath = useRef(location.pathname);

  // useHotkeys stands every binding down while a dialog or drawer is open; only ⌘K
  // opts out, because it is also how the palette closes.
  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        combo: "mod+k",
        allowInInputs: true,
        allowInModal: true,
        handler: () => setPaletteOpen((open) => !open),
      },
      { combo: "?", handler: () => setShortcutsOpen(true) },
      { combo: "[", handler: () => setCollapsed((value) => !value) },
      ...NAV_ITEMS[user.role].map((item) => ({
        combo: item.shortcut,
        handler: () => navigate(item.to),
      })),
    ],
    [user.role, navigate, setCollapsed],
  );
  useHotkeys(hotkeys);

  // A route change remounts the page (the ErrorBoundary is keyed by path), so focus
  // would drop to <body>: screen readers hear nothing and Tab restarts at the top.
  // Moving it to <main> lands on the new page instead. Only the path counts — a
  // filter written to the query string must not steal focus — and focus that is
  // somewhere else on purpose (the topbar, an overlay) is left alone. Comparing with
  // the last path, rather than skipping the first run, keeps a full page load from
  // focusing <main> even when StrictMode runs the effect twice.
  useEffect(() => {
    if (focusedPath.current === location.pathname) return;
    focusedPath.current = location.pathname;
    const active = document.activeElement;
    if (active === null || active === document.body || mainRef.current?.contains(active)) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  return (
    <div
      className="app-shell"
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      data-mobile-nav={mobile && mobileOpen ? "open" : "closed"}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onNavigate={() => setMobileOpen(false)}
        mobile={mobile}
        mobileOpen={mobileOpen}
      />
      <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />

      <div className="app-body">
        <header className="topbar">
          <IconButton
            icon="menu"
            aria-label="Open navigation"
            aria-controls="app-sidebar"
            aria-expanded={mobileOpen}
            className="topbar-mobile-only"
            onClick={() => setMobileOpen(true)}
          />
          {/* Named outright: on phones the label is hidden by CSS, and so would the
              name be if it came from the text inside. */}
          <button
            type="button"
            className="search-trigger"
            aria-label="Search or jump to…"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            onClick={() => setPaletteOpen(true)}
          >
            <Icon name="search" />
            <span className="search-trigger-label">Search or jump to…</span>
            <Shortcut combo="mod+k" />
          </button>

          <div className="topbar-right">
            {isStaff(user.role) && <HealthBadge />}
            <ThemeToggle />
            <UserMenu onShowShortcuts={() => setShortcutsOpen(true)} />
          </div>
        </header>

        {user.role === "candidate" && <ConnectionNotice />}

        <main ref={mainRef} id="main" className={cx("page", wide && "page-wide")} tabIndex={-1}>
          {/* Keyed by path: a crash on one page is left behind by navigating away. */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
