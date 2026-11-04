import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { cx } from "../../lib/cx";
import { useFieldControl } from "./Field";
import { Icon } from "./Icon";

export interface TagInputProps {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** A fixed vocabulary to suggest from, filtered as the user types. */
  suggestions?: readonly string[];
  /** Or look suggestions up as the user types (debounced; stale answers dropped). */
  suggest?: (query: string) => Promise<string[]>;
  maxTags?: number;
  /** Applied to each new tag before it is added. Defaults to trimming whitespace. */
  normalize?: (tag: string) => string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

const MAX_OPTIONS = 8;
const SUGGEST_DELAY_MS = 150;

const defaultNormalize = (tag: string) => tag.trim();
const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Chips with a text box: Enter or comma adds what was typed, Backspace in an empty box
 * removes the last chip, and pasting "a, b, c" adds all three. Duplicates are dropped
 * case-insensitively — "Python" after "python" is not a second skill.
 *
 * With `suggestions` or `suggest`, a listbox opens under the box (the ARIA combobox
 * pattern): arrows move through it, Enter picks, Escape closes.
 */
export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  suggestions,
  suggest,
  maxTags,
  normalize = defaultNormalize,
  disabled,
  className,
  ...control
}: TagInputProps) {
  const wired = useFieldControl(control);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<{ query: string; items: string[] }>({ query: "", items: [] });

  const query = draft.trim();
  const atMax = maxTags !== undefined && value.length >= maxTags;

  useEffect(() => {
    if (!suggest || !query) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      suggest(query)
        .catch(() => [] as string[]) // a failed lookup just offers nothing
        .then((items) => {
          // A slower, older lookup must not overwrite a newer one.
          if (!cancelled) setRemote({ query, items });
        });
    }, SUGGEST_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, suggest]);

  const candidates = suggest
    ? remote.query === query && query
      ? remote.items
      : []
    : (suggestions ?? []).filter((item) => item.toLowerCase().includes(query.toLowerCase()));
  const options = candidates
    .filter((item) => !value.some((tag) => sameTag(tag, item)))
    .slice(0, MAX_OPTIONS);
  const expanded = open && !atMax && options.length > 0;

  /** Adds tags, skipping blanks and duplicates (against the list and each other). */
  function addTags(raw: readonly string[]) {
    const next = [...value];
    for (const item of raw) {
      const tag = normalize(item);
      if (!tag || next.some((existing) => sameTag(existing, tag))) continue;
      if (maxTags !== undefined && next.length >= maxTags) break;
      next.push(tag);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
    setActive(-1);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (options.length === 0) return;
        event.preventDefault();
        setOpen(true);
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => (current + step + options.length) % options.length);
        return;
      }
      case "Enter": {
        const picked = expanded && active >= 0 ? options[active] : undefined;
        if (picked === undefined && !query) return; // nothing to add: let the form submit
        event.preventDefault();
        addTags([picked ?? draft]);
        return;
      }
      case ",":
        event.preventDefault();
        addTags([draft]);
        return;
      case "Backspace":
        if (draft === "" && value.length > 0) removeAt(value.length - 1);
        return;
      case "Escape":
        if (expanded) {
          // Close the list, not the dialog the input sits in.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
        return;
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!/[,\n]/.test(text)) return;
    event.preventDefault();
    addTags(text.split(/[,\n]/));
  }

  const activeId = expanded && active >= 0 ? `${listboxId}-${active}` : undefined;

  return (
    <div
      className={cx("tag-input", className)}
      data-disabled={disabled || undefined}
      data-invalid={wired["aria-invalid"] || undefined}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, index) => (
        <span key={tag} className="tag-input-chip">
          {tag}
          {!disabled && (
            <button
              type="button"
              className="tag-input-chip-remove"
              aria-label={`Remove ${tag}`}
              onClick={(event) => {
                event.stopPropagation();
                removeAt(index);
              }}
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </span>
      ))}

      <input
        {...wired}
        ref={inputRef}
        className="tag-input-field"
        value={draft}
        disabled={disabled}
        placeholder={atMax ? `Limit of ${maxTags} reached` : value.length === 0 ? placeholder : ""}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          // Leaving the box keeps what was typed rather than silently dropping it.
          if (query) addTags([draft]);
        }}
      />

      <ul id={listboxId} role="listbox" className="listbox" hidden={!expanded} aria-label="Suggestions">
        {options.map((option, index) => (
          <li
            key={option}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={index === active}
            className="listbox-option"
            // mousedown, not click: picking must not blur the input first.
            onMouseDown={(event) => {
              event.preventDefault();
              addTags([option]);
            }}
            onMouseEnter={() => setActive(index)}
          >
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
}
