import { Link } from "react-router-dom";

import type { Candidate } from "../../api/types";
import { Avatar, Checkbox, Icon, Tags, formatRelative, formatYears } from "../ui";

export interface CandidateCardProps {
  candidate: Candidate;
  selected: boolean;
  onToggle: () => void;
  /** Skills to highlight — the one being filtered on. */
  highlight?: readonly string[];
}

/**
 * The grid view's profile card. The name is the card's one link, stretched over the
 * card with CSS, so the whole card opens the profile while the checkbox stays its own
 * control — and a screen reader hears one link, not a card-sized blob.
 */
export function CandidateCard({ candidate, selected, onToggle, highlight }: CandidateCardProps) {
  return (
    <article className="candidates-card" data-selected={selected || undefined}>
      <div className="candidates-card-head">
        <Avatar name={candidate.full_name} size="lg" />
        <div className="candidates-card-identity">
          <h3 className="candidates-card-name">
            <Link to={`/candidates/${candidate.id}`} className="candidates-card-link">
              {candidate.full_name}
            </Link>
          </h3>
          <p className="candidates-card-headline truncate">
            {candidate.headline || <span className="subtle">No headline yet</span>}
          </p>
        </div>
        {/* Above the stretched link, so it stays clickable. */}
        <span className="candidates-card-select">
          <Checkbox
            aria-label={`Select ${candidate.full_name}`}
            checked={selected}
            onChange={onToggle}
          />
        </span>
      </div>

      <ul className="candidates-card-facts">
        <li className="meta-item">
          <Icon name="clock" size={14} />
          {formatYears(candidate.years_experience)}
        </li>
        <li className="meta-item truncate">
          <Icon name="mail" size={14} />
          <span className="truncate">{candidate.email}</span>
        </li>
      </ul>

      <Tags items={candidate.skills ?? []} highlight={highlight} max={5} />

      <p className="candidates-card-foot subtle text-xs">
        Joined {formatRelative(candidate.created_at)}
      </p>
    </article>
  );
}
