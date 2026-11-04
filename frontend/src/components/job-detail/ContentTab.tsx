import type { Job, JobContent } from "../../api/types";
import { useJobContent } from "../../hooks/queries";
import { Card, CardHeader, EmptyState, ErrorNotice, Icon, SkeletonText, formatDateTime, formatRelative } from "../ui";
import { skillCoverage } from "./content";

/** Enough keywords to show what the text is about, without a word cloud. */
const KEYWORD_LIMIT = 16;

const SECTIONS = [
  { key: "responsibilities", title: "Responsibilities", icon: "clipboard" },
  { key: "requirements", title: "Requirements", icon: "check-circle" },
  { key: "benefits", title: "Benefits", icon: "star" },
] as const;

/**
 * What the publishing workflow read out of the description: its sections, the skills
 * it mentions and its weightiest terms. This is what search and match scoring see, so
 * a gap here — a required skill the text never names — is worth fixing in the posting.
 */
export function ContentTab({ job }: { job: Job }) {
  const { data: content, isLoading, error } = useJobContent(job.id, job.content_processed_at);

  if (!job.content_processed_at) {
    return (
      <Card>
        <EmptyState
          icon="sparkles"
          title="Nothing analysed yet"
          description={
            job.status === "processing"
              ? "The description is being analysed right now. Its structure appears here when publishing finishes."
              : "Publishing analyses the description into sections, skills and keywords. Publish the job to see them here."
          }
        />
      </Card>
    );
  }
  if (error) return <ErrorNotice error={error} />;
  if (isLoading || !content) {
    return (
      <div className="grid-2">
        <Card>
          <SkeletonText lines={6} />
        </Card>
        <Card>
          <SkeletonText lines={6} />
        </Card>
      </div>
    );
  }

  const summary = content.sections.summary;

  return (
    <div className="stack">
      <p className="text-xs subtle" title={formatDateTime(content.processed_at)}>
        <Icon name="sparkles" size={12} /> Analysed {formatRelative(content.processed_at)} by the publishing workflow.
      </p>

      {summary.length > 0 && (
        <Card>
          <CardHeader title="Summary" icon="file-text" />
          <div className="job-detail-summary">
            {summary.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </Card>
      )}

      <div className="grid-2">
        <SkillsCard job={job} content={content} />
        <KeywordsCard content={content} />
      </div>

      <div className="grid-cards">
        {SECTIONS.map(({ key, title, icon }) => {
          const items = content.sections[key];
          return (
            <Card key={key}>
              <CardHeader title={title} icon={icon} as="h3" />
              {items.length > 0 ? (
                <ul className="job-detail-list">
                  {items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm muted">None found in the description.</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SkillsCard({ job, content }: { job: Job; content: JobContent }) {
  const coverage = skillCoverage(job.required_skills, content.extracted_skills);

  return (
    <Card>
      <CardHeader
        title="Skills in the description"
        icon="target"
        description="Required ones are highlighted. The rest count toward 15% of each match score."
      />
      {content.extracted_skills.length === 0 ? (
        <p className="text-sm muted">No known skills were recognised in the text.</p>
      ) : (
        <div className="tag-list">
          {[...coverage.required, ...coverage.other].map((skill) => (
            <span
              key={skill.name}
              className={coverage.required.includes(skill) ? "tag match" : "tag"}
              title={`Mentioned ${skill.mentions} time${skill.mentions === 1 ? "" : "s"}`}
            >
              {skill.name}
              {skill.mentions > 1 && <span className="job-detail-mentions">×{skill.mentions}</span>}
            </span>
          ))}
        </div>
      )}
      {coverage.unmentioned.length > 0 && (
        <div className="job-detail-gap">
          <Icon name="alert-triangle" size={14} />
          <p className="text-sm">
            Required but never mentioned: <strong>{coverage.unmentioned.join(", ")}</strong>. Saying why the role needs
            them helps candidates self-select.
          </p>
        </div>
      )}
    </Card>
  );
}

function KeywordsCard({ content }: { content: JobContent }) {
  const keywords = [...content.keywords].sort((a, b) => b.score - a.score).slice(0, KEYWORD_LIMIT);

  return (
    <Card>
      <CardHeader title="Key terms" icon="bar-chart" description="Weighted against the description's strongest term." />
      {keywords.length === 0 ? (
        <p className="text-sm muted">No keywords were extracted.</p>
      ) : (
        <ul className="job-detail-keywords">
          {keywords.map((k) => (
            <li key={k.keyword} className="job-detail-keyword">
              <span className="truncate">{k.keyword}</span>
              <span className="job-detail-keyword-track" aria-hidden="true">
                <span className="job-detail-keyword-bar" style={{ width: `${Math.round(k.score * 100)}%` }} />
              </span>
              <span className="tabular text-xs subtle">{Math.round(k.score * 100)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
