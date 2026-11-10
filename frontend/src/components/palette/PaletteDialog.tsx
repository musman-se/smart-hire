import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useUser } from "../../auth/AuthProvider";
import { isStaff } from "../../auth/roles";
import { MIN_SEARCH_LENGTH } from "../../hooks/useGlobalSearch";
import { Avatar, Icon, Kbd, Shortcut, Spinner, pluralize, rovingIndex, useOverlay } from "../ui";
import { Highlight } from "./Highlight";
import { PALETTE_GROUPS, type PaletteGroup, type Ranked } from "./rank";
import type { RecentItems } from "./recent";
import { usePaletteItems, type PaletteItem } from "./usePaletteItems";

interface PaletteDialogProps {
  recent: RecentItems;
  onClose: () => void;
  onShowShortcuts: () => void;
}

/**
 * The palette itself: a modal combobox. Focus never leaves the text box; the arrow
 * keys move a highlight through the listbox, announced with aria-activedescendant, so
 * typing and choosing never fight over focus.
 */
export function PaletteDialog({ recent, onClose, onShowShortcuts }: PaletteDialogProps) {
  const user = useUser();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  // Tracked by id, not index: when search results arrive, the highlight stays on the
  // item the user was on rather than jumping to whatever now sits at that index.
  const [activeId, setActiveId] = useState<string | null>(null);
  useOverlay(dialogRef, { open: true, onClose, initialFocus: inputRef });

  const { ranked, search } = usePaletteItems({ query, recent, onClose, onShowShortcuts });
  const found = ranked.findIndex(({ item }) => item.id === activeId);
  const activeIndex = found === -1 ? 0 : found;
  const active = ranked[activeIndex]?.item;
  const optionId = (item: PaletteItem) => `${listId}-${item.id}`;
  const activeOptionId = active ? optionId(active) : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    // jsdom has no scrollIntoView.
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      active?.run();
      return;
    }
    // The first Escape clears a search; the overlay closes on the next one.
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
      setActiveId(null);
      return;
    }
    const next = rovingIndex(event.key, activeIndex, ranked.length, "vertical");
    if (next !== null) {
      event.preventDefault();
      setActiveId(ranked[next]?.item.id ?? null);
    }
  }

  const trimmed = query.trim();
  const searching = search.jobs.loading || search.candidates.loading;
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_SEARCH_LENGTH;
  const recruiter = isStaff(user.role);
  const scope = recruiter ? "jobs and candidates" : "open jobs";

  const statusFor: Partial<Record<PaletteGroup, ReactNode>> = {
    Jobs: sectionStatus("jobs", search.jobs),
    Candidates: sectionStatus("candidates", search.candidates),
  };

  const announcement = !trimmed
    ? ""
    : searching
      ? "Searching…"
      : ranked.length === 0
        ? "No results"
        : pluralize(ranked.length, "result");

  return createPortal(
    <div
      className="cmdk-backdrop palette-backdrop"
      // mousedown, not click: a text selection dragged out must not close the palette.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="cmdk palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="cmdk-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder={`Search ${scope} and commands…`}
            aria-label={`Search ${scope} and commands`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveId(null);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {searching && <Spinner size="sm" label="" />}
          {/* Phones have no Escape key; this is their way out besides the backdrop. */}
          <button type="button" className="palette-close" onClick={onClose} aria-label="Close">
            <Kbd>Esc</Kbd>
          </button>
        </div>

        <div id={listId} role="listbox" className="cmdk-list palette-list" aria-label="Results">
          {PALETTE_GROUPS.map((group) => {
            const rows = ranked.filter(({ item }) => item.group === group);
            const status = statusFor[group];
            if (rows.length === 0 && !status) return null;
            const headingId = `${listId}-group-${group}`;
            return (
              <div key={group} role="group" aria-labelledby={headingId} className="palette-group">
                <div id={headingId} className="cmdk-group-label" role="presentation">
                  {group}
                </div>
                {rows.map((row) => (
                  <PaletteOption
                    key={row.item.id}
                    id={optionId(row.item)}
                    row={row}
                    selected={row.item === active}
                    onHover={() => setActiveId(row.item.id)}
                  />
                ))}
                {status}
              </div>
            );
          })}

          {ranked.length === 0 && !searching && (
            <div className="palette-empty" role="presentation">
              <Icon name="search" size={20} />
              <p className="palette-empty-title">
                {tooShort ? "Keep typing to search" : <>Nothing matches “{trimmed}”</>}
              </p>
              <p className="palette-empty-hint">
                {tooShort
                  ? `Searching ${scope} starts at ${MIN_SEARCH_LENGTH} characters.`
                  : recruiter
                    ? "Try part of a job title or a candidate’s name, or a page like “applications”."
                    : "Try part of a job title, or a page like “applications”."}
              </p>
            </div>
          )}
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>

        <div className="cmdk-footer palette-footer" aria-hidden="true">
          <span className="palette-hint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="palette-hint">
            <Kbd>↵</Kbd> to open
          </span>
          <span className="palette-hint palette-hint-wide">
            <Kbd>Esc</Kbd> to {query ? "clear" : "close"}
          </span>
          <span className="spacer" />
          <span className="palette-hint palette-hint-wide">
            Searches {scope}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface SectionState {
  enabled: boolean;
  items: readonly unknown[];
  loading: boolean;
  error: unknown;
}

/** A non-selectable line under a server-backed group: still loading, or failed. The
 * live region announces the same, so these are for the eye only. */
function sectionStatus(noun: string, section: SectionState): ReactNode {
  if (!section.enabled) return null;
  if (section.error) {
    return (
      <div className="palette-status palette-status-error" aria-hidden="true">
        <Icon name="alert-circle" />
        Couldn’t search {noun}. Check your connection and try again.
      </div>
    );
  }
  if (section.loading && section.items.length === 0) {
    return (
      <div className="palette-status" aria-hidden="true">
        <Spinner size="sm" label="" />
        Searching {noun}…
      </div>
    );
  }
  return null;
}

interface PaletteOptionProps {
  id: string;
  row: Ranked<PaletteItem>;
  selected: boolean;
  onHover: () => void;
}

function PaletteOption({ id, row: { item, ranges }, selected, onHover }: PaletteOptionProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-checked={item.checked}
      className="cmdk-item palette-item"
      // mousemove, not mouseenter: a list scrolling under a still pointer must not
      // steal the highlight from the keyboard.
      onMouseMove={selected ? undefined : onHover}
      // Keeps focus in the text box, so typing can continue after a click elsewhere.
      onMouseDown={(event) => event.preventDefault()}
      onClick={item.run}
    >
      {item.avatar ? (
        <Avatar name={item.avatar} size="xs" title="" />
      ) : (
        <Icon name={item.icon ?? "circle"} />
      )}
      <span className="cmdk-item-label palette-item-text">
        <span className="palette-item-label truncate">
          <Highlight text={item.label} ranges={ranges} />
        </span>
        {item.description && (
          <span className="palette-item-description truncate">{item.description}</span>
        )}
      </span>
      {item.meta && <span className="palette-item-meta">{item.meta}</span>}
      {item.checked && <Icon name="check" className="palette-check" />}
      {item.shortcut && <Shortcut combo={item.shortcut} className="palette-shortcut" />}
      {selected && <Icon name="arrow-right" className="palette-enter" />}
    </div>
  );
}
