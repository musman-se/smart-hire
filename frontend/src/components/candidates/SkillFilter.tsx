import { useId, useRef, useState, type KeyboardEvent } from "react";

import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useSkillSuggestions } from "../../hooks/queries";
import { Icon, IconButton, Input } from "../ui";

export interface SkillFilterProps {
  /** The applied skill; "" for any. */
  value: string;
  onChange: (skill: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * One skill to filter by, with suggestions from the skills vocabulary. The API matches
 * a single skill exactly, so this is a combobox with one value rather than a TagInput:
 * typing only drafts, and the filter applies on Enter, on picking a suggestion, or on
 * leaving the box — not on every keystroke, which would query for "pyt".
 */
export function SkillFilter({
  value,
  onChange,
  placeholder = "Any skill",
  "aria-label": ariaLabel = "Filter by skill",
}: SkillFilterProps) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // "Clear filters" elsewhere on the page changes the value under us.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  const query = useDebouncedValue(draft.trim(), 200);
  const suggestions = useSkillSuggestions(open ? query : "");
  const options = open && query ? (suggestions.data ?? []) : [];
  const expanded = options.length > 0;

  function commit(text: string) {
    // Skill names are stored lower-cased; the server compares that way too.
    const skill = text.trim().toLowerCase();
    setDraft(skill);
    setOpen(false);
    setActive(-1);
    if (skill !== value) onChange(skill);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActive((current) => Math.min(current + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => Math.max(current - 1, -1));
        break;
      case "Enter":
        // Enter that confirms an IME composition (Japanese, Chinese…) is not a pick.
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        commit(options[active] ?? draft);
        break;
      case "Escape":
        if (expanded) {
          // Closes the list without also closing whatever the box sits in.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (draft) {
          event.preventDefault();
          commit("");
        }
        break;
    }
  }

  return (
    <div className="search-input candidates-skill">
      <Icon name="award" className="search-input-icon" />
      <Input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listboxId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
      />
      {draft && (
        <IconButton
          icon="x"
          size="sm"
          aria-label="Clear skill filter"
          className="search-input-clear"
          onClick={() => {
            commit("");
            inputRef.current?.focus();
          }}
        />
      )}
      <ul id={listboxId} role="listbox" className="listbox" hidden={!expanded} aria-label="Skills">
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
              commit(option);
            }}
            onMouseEnter={() => setActive(index)}
          >
            <Icon name="award" size={14} />
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
}
