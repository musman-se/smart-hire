import { Link } from "react-router-dom";

import type { Candidate } from "../../api/types";
import { profileCompleteness, profileFieldHref } from "../profile/completeness";
import { Card, CardHeader, Icon, ProgressBar, formatPercent } from "../ui";

/**
 * The profile-strength meter: a bar and a checklist. Every open item links to the
 * field that fixes it, so "add a headline" is one click from the headline box.
 */
export function ProfileChecklist({ candidate }: { candidate: Candidate }) {
  const { items, done, total, ratio } = profileCompleteness(candidate);
  const complete = done === total;

  return (
    <Card className="candidate-checklist">
      <CardHeader
        title="Profile strength"
        description={
          complete
            ? "Everything recruiters look for is in place."
            : "A complete profile is matched to more roles."
        }
        actions={<span className="candidate-checklist-percent tabular">{formatPercent(ratio)}</span>}
      />
      <ProgressBar
        value={done}
        max={total}
        label="Profile complete"
        valueText={`${done} of ${total} steps done`}
        tone={complete ? "success" : "accent"}
      />
      <ul className="candidate-checklist-items">
        {items.map((item) => (
          <li key={item.key} data-done={item.done || undefined}>
            <span className="candidate-checklist-mark" aria-hidden="true">
              <Icon name={item.done ? "check" : "circle"} size={12} strokeWidth={item.done ? 3 : 2} />
            </span>
            {item.done ? (
              <span className="candidate-checklist-label">
                {item.label}
                <span className="sr-only"> (done)</span>
              </span>
            ) : (
              <span className="stack-sm candidate-checklist-open">
                <Link to={profileFieldHref(item.key)} className="candidate-checklist-link">
                  {item.label}
                  <Icon name="arrow-right" size={12} />
                </Link>
                <span className="candidate-checklist-hint">{item.hint}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
