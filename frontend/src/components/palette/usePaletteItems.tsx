import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth, useUser } from "../../auth/AuthProvider";
import { useApplications } from "../../hooks/queries";
import { useGlobalSearch, type GlobalSearch } from "../../hooks/useGlobalSearch";
import { useTheme, type ThemePreference } from "../../hooks/useTheme";
import { NAV_ITEMS } from "../navigation";
import { Badge, StatusPill, formatNumber, formatYears, humanize, type IconName } from "../ui";
import { rankItems, type Ranked, type Rankable } from "./rank";
import { recentPath, type RecentItems } from "./recent";
import { NEW_JOB_SHORTCUT } from "./shortcuts";

export interface PaletteItem extends Rankable {
  /** Unique across the whole list; also the option's DOM id suffix. */
  id: string;
  icon?: IconName;
  /** A person: drawn as their avatar instead of an icon. */
  avatar?: string;
  /** Secondary text after the label. */
  description?: string;
  /** Right-aligned extra: a status pill, a count. */
  meta?: ReactNode;
  shortcut?: string;
  /** For a choice among several (the theme): shows a check and aria-checked. */
  checked?: boolean;
  run: () => void;
}

const THEME_CHOICES: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Match system", icon: "monitor" },
];

interface Options {
  query: string;
  recent: RecentItems;
  onClose: () => void;
  onShowShortcuts: () => void;
}

export interface PaletteResults {
  ranked: Ranked<PaletteItem>[];
  search: GlobalSearch;
}

/**
 * Everything the palette can offer this user right now, ranked against the query.
 * Local commands are matched here; jobs and candidates come from the server's search
 * and are only highlighted, not re-filtered.
 */
export function usePaletteItems({
  query,
  recent,
  onClose,
  onShowShortcuts,
}: Options): PaletteResults {
  const user = useUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { preference, resolved, setPreference } = useTheme();
  const search = useGlobalSearch(query);
  const recruiter = user.role === "recruiter";

  // One limit=1 read: the total is the size of the "applied" queue.
  const { data: newApplications } = useApplications(
    { stage: "applied", limit: 1 },
    { enabled: recruiter },
  );
  const newCount = newApplications?.total ?? 0;

  const items = useMemo<PaletteItem[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const then = (action: () => void) => () => {
      onClose();
      action();
    };
    // The palette shows a handful of hits; this hands the search to the full list page.
    const encoded = encodeURIComponent(search.term);
    const seeAll = (group: "Jobs" | "Candidates", total: number, to: string): PaletteItem => ({
      id: `${group}:all`,
      group,
      label: `See all ${formatNumber(total)} ${group.toLowerCase()} matching “${search.term}”`,
      pinned: true,
      icon: "search",
      run: go(to),
    });

    const recentItems: PaletteItem[] = recent.items.map((item) => ({
      id: `recent:${item.kind}:${item.id}`,
      group: "Recent",
      label: item.title,
      keywords: item.subtitle,
      icon: item.kind === "job" ? "briefcase" : undefined,
      avatar: item.kind === "candidate" ? item.title : undefined,
      description: item.subtitle,
      meta: <span className="palette-kind">{humanize(item.kind)}</span>,
      run: go(recentPath(item)),
    }));
    const inRecent = new Set(recent.items.map((item) => `${item.kind}:${item.id}`));

    const actions: PaletteItem[] = [];
    if (recruiter) {
      actions.push(
        {
          id: "action:new-job",
          group: "Actions",
          label: "Create a job",
          keywords: "new posting add open role requisition",
          icon: "plus",
          shortcut: NEW_JOB_SHORTCUT,
          run: go("/jobs/new"),
        },
        {
          id: "action:review",
          group: "Actions",
          label: "Review new applications",
          keywords: "queue applied triage screen inbox",
          icon: "inbox",
          meta:
            newCount > 0 ? (
              <Badge tone="accent" size="sm">
                {formatNumber(newCount)} new
              </Badge>
            ) : undefined,
          run: go("/applications"),
        },
      );
    } else {
      actions.push({
        id: "action:profile",
        group: "Actions",
        label: "Edit your profile",
        keywords: "skills resume headline experience phone",
        icon: "edit",
        run: go("/profile"),
      });
    }
    const nextTheme = resolved === "dark" ? "light" : "dark";
    actions.push(
      {
        id: "action:toggle-theme",
        group: "Actions",
        label: `Switch to ${nextTheme} theme`,
        keywords: "toggle theme appearance mode colour color",
        icon: nextTheme === "dark" ? "moon" : "sun",
        run: then(() => setPreference(nextTheme)),
      },
      {
        id: "action:shortcuts",
        group: "Actions",
        label: "Keyboard shortcuts",
        keywords: "keys hotkeys help",
        icon: "keyboard",
        shortcut: "?",
        run: then(onShowShortcuts),
      },
    );
    if (recent.items.length > 0) {
      actions.push({
        id: "action:clear-recent",
        group: "Actions",
        label: "Clear recent items",
        keywords: "history forget",
        icon: "x-circle",
        run: then(recent.clear),
      });
    }
    actions.push({
      id: "action:sign-out",
      group: "Actions",
      label: "Sign out",
      keywords: "log out logout exit",
      icon: "log-out",
      run: then(() => void signOut()),
    });

    const navigation: PaletteItem[] = NAV_ITEMS[user.role].map((item) => ({
      id: `nav:${item.to}`,
      group: "Navigation",
      label: item.label,
      keywords: `go to ${item.keywords ?? ""}`,
      icon: item.icon,
      shortcut: item.shortcut,
      run: go(item.to),
    }));

    const jobs: PaletteItem[] = search.jobs.items
      .filter((job) => !inRecent.has(`job:${job.id}`))
      .map((job) => ({
        id: `job:${job.id}`,
        group: "Jobs",
        label: job.title,
        pinned: true,
        icon: "briefcase",
        description: [job.department, job.location].filter(Boolean).join(" · ") || undefined,
        // Candidates only ever see published jobs, so a status would say nothing.
        meta: recruiter ? <StatusPill status={job.status} /> : humanize(job.employment_type),
        run: go(`/jobs/${job.id}`),
      }));
    if (search.jobs.total > search.jobs.items.length) {
      jobs.push(seeAll("Jobs", search.jobs.total, `/jobs?search=${encoded}`));
    }

    const candidates: PaletteItem[] = search.candidates.items
      .filter((candidate) => !inRecent.has(`candidate:${candidate.id}`))
      .map((candidate) => ({
        id: `candidate:${candidate.id}`,
        group: "Candidates",
        label: candidate.full_name,
        pinned: true,
        avatar: candidate.full_name,
        description: candidate.headline || candidate.email,
        meta: formatYears(candidate.years_experience),
        run: go(`/candidates/${candidate.id}`),
      }));
    if (search.candidates.total > search.candidates.items.length) {
      candidates.push(seeAll("Candidates", search.candidates.total, `/candidates?q=${encoded}`));
    }

    const theme: PaletteItem[] = THEME_CHOICES.map(({ value, label, icon }) => ({
      id: `theme:${value}`,
      group: "Theme",
      label,
      keywords: "theme appearance mode",
      icon,
      checked: preference === value,
      run: then(() => setPreference(value)),
    }));

    return [...recentItems, ...actions, ...navigation, ...jobs, ...candidates, ...theme];
  }, [
    recent,
    recruiter,
    newCount,
    resolved,
    preference,
    setPreference,
    user.role,
    search.jobs,
    search.candidates,
    search.term,
    navigate,
    onClose,
    onShowShortcuts,
    signOut,
  ]);

  const ranked = useMemo(() => rankItems(items, query), [items, query]);
  return { ranked, search };
}
