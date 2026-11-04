import { Badge, Card, Icon, Tags, formatNumber, humanize, pluralize } from "../ui";
import { publishChecklist, validateJobForm, type JobFormValues } from "./jobForm";

/** Long enough to read as the opening of the description, short enough for a card. */
const EXCERPT_LENGTH = 280;

function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= EXCERPT_LENGTH ? trimmed : `${trimmed.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

/**
 * The job as a candidate will meet it on the job board, redrawn as the recruiter
 * types, with the checklist of what the posting still lacks underneath.
 */
export function JobPreviewCard({ values }: { values: JobFormValues }) {
  const title = values.title.trim();
  const description = excerpt(values.description);
  // Invalid numbers are not drawn as if they were valid ones: "-3" is not "no minimum".
  const errors = validateJobForm(values);
  const years = Number(values.min_experience_years);
  const capacity = values.max_applications.trim();
  const checklist = publishChecklist(values);
  const missing = checklist.filter((item) => !item.done).length;

  return (
    <div className="jobs-preview">
      <p className="jobs-preview-label">
        <Icon name="eye" size={14} />
        What candidates see
      </p>

      <article className="jobs-card jobs-card-grid jobs-preview-card" aria-label="Candidate preview">
        <div className="jobs-card-body">
          <div className="jobs-card-head">
            <span className="jobs-card-icon" aria-hidden="true">
              <Icon name="briefcase" size={18} />
            </span>
            <div className="jobs-card-heading">
              <p className={title ? "jobs-card-title" : "jobs-card-title jobs-preview-placeholder"}>
                {title || "Job title"}
              </p>
              {values.department.trim() && (
                <p className="jobs-card-department">{values.department.trim()}</p>
              )}
            </div>
          </div>

          <ul className="jobs-card-facts" aria-label="Role details">
            <li>
              <Badge size="sm" tone="neutral">
                {humanize(values.employment_type)}
              </Badge>
            </li>
            <li className="meta-item">
              <Icon name="map-pin" size={14} />
              {values.location.trim() || "Location not specified"}
            </li>
            <li className="meta-item">
              <Icon name="award" size={14} />
              {errors.min_experience_years ? (
                <span className="jobs-preview-placeholder">Minimum experience</span>
              ) : years > 0 ? (
                `${years}+ years`
              ) : (
                "No minimum experience"
              )}
            </li>
          </ul>

          {values.required_skills.length > 0 ? (
            <Tags items={values.required_skills} max={8} />
          ) : (
            <p className="jobs-preview-placeholder text-sm">Open to any skill set</p>
          )}

          <p className={description ? "jobs-preview-description prewrap" : "jobs-preview-description jobs-preview-placeholder"}>
            {description || "The description's opening lines appear here."}
          </p>

          {capacity !== "" && !errors.max_applications && (
            <p className="meta-item text-sm">
              <Icon name="users" size={14} />
              Closes to new applications after {formatNumber(Number(capacity))}
            </p>
          )}
        </div>
      </article>

      <Card className="jobs-checklist">
        <p className="jobs-checklist-title">
          {missing === 0 ? "Ready to publish" : `${pluralize(missing, "thing")} to add`}
        </p>
        <ul className="jobs-checklist-items">
          {checklist.map((item) => (
            <li key={item.label} data-done={item.done}>
              <Icon name={item.done ? "check-circle" : "circle"} size={14} />
              <span>
                {item.label}
                {!item.required && <span className="subtle"> · recommended</span>}
              </span>
              <span className="sr-only">{item.done ? "done" : "missing"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
