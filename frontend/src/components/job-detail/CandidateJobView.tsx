import type { Candidate, Job } from "../../api/types";
import { useCandidate } from "../../hooks/queries";
import { useMyApplications } from "../../hooks/useCandidateExtras";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { cx } from "../../lib/cx";
import { CardError } from "../dashboard/parts";
import {
  ButtonLink,
  Card,
  CardHeader,
  Icon,
  PageHeader,
  SkeletonText,
  buttonClassName,
  formatYears,
  skillMatch,
} from "../ui";
import { ApplyPanel } from "./ApplyPanel";
import { JobMeta } from "./JobMeta";

/** The apply panel's anchor. Where the columns stack, the panel sits below the whole
 * posting, so the header links down to it. */
const APPLY_PANEL_ID = "apply";

/**
 * A job posting from the candidate's side: what the role is, how they measure up
 * against it, and the way to apply. Reads only what a candidate may — the job and
 * their own profile and applications — never the recruiter's publication, content or
 * applicant list.
 */
export function CandidateJobView({ job, candidateId }: { job: Job; candidateId: string }) {
  const profile = useCandidate(candidateId);
  const candidate = profile.data;
  // Without the profile neither card can say anything; each says why, with a retry,
  // rather than showing a skeleton that never resolves.
  const profileError = candidate ? null : profile.error;
  const retryProfile = () => void profile.refetch();
  useDocumentTitle(job.title);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Jobs", to: "/jobs" }, { label: job.title }]}
        leading={
          <span className="job-detail-tile" aria-hidden="true">
            <Icon name="briefcase" size={20} />
          </span>
        }
        title={job.title}
        description={job.department ? `${job.department} team` : undefined}
        meta={<JobMeta job={job} audience="candidate" />}
        actions={<ApplyJump job={job} />}
      />

      <div className="grid-sidebar job-detail-candidate">
        <div className="stack">
          <Card>
            <CardHeader title="About the role" icon="file-text" />
            <p className="prewrap job-detail-description">{job.description}</p>
          </Card>
          <FitCard job={job} candidate={candidate} profileError={profileError} onRetryProfile={retryProfile} />
        </div>
        <aside id={APPLY_PANEL_ID} className="job-detail-aside" aria-label="Your application">
          <ApplyPanel
            job={job}
            candidate={candidate}
            profileError={profileError}
            onRetryProfile={retryProfile}
          />
        </aside>
      </div>
    </>
  );
}

/**
 * "Apply" in the header, for narrow screens only (CSS hides it where the panel sits
 * beside the posting). A plain fragment link: the browser scrolls to the panel and
 * starts the next Tab there; the page's scroll-padding clears the top bar.
 */
function ApplyJump({ job }: { job: Job }) {
  const mine = useMyApplications();
  const applied = mine.data?.items.some((application) => application.job_id === job.id);
  // A closed job the candidate never applied to has nothing to jump to.
  if (!mine.data || (!applied && job.status !== "published")) return null;
  return (
    <a
      href={`#${APPLY_PANEL_ID}`}
      className={cx(buttonClassName({ variant: applied ? "secondary" : "primary" }), "job-detail-apply-jump")}
    >
      {applied ? "Your application" : "Apply"}
    </a>
  );
}

/** The job's requirements set against the candidate's own profile. */
function FitCard({
  job,
  candidate,
  profileError,
  onRetryProfile,
}: {
  job: Job;
  candidate: Candidate | undefined;
  profileError: unknown;
  onRetryProfile: () => void;
}) {
  const required = job.required_skills ?? [];

  if (profileError) {
    return (
      <Card>
        <CardHeader title="How you match" icon="target" />
        <CardError error={profileError} onRetry={onRetryProfile} />
      </Card>
    );
  }

  if (!candidate) {
    return (
      <Card>
        <CardHeader title="How you match" icon="target" />
        <SkeletonText lines={3} />
      </Card>
    );
  }

  const { matched, missing } = skillMatch(candidate.skills, required);
  const years = candidate.years_experience ?? 0;
  const enoughYears = years >= job.min_experience_years;

  return (
    <Card>
      <CardHeader
        className="job-detail-fit-header"
        title="How you match"
        icon="target"
        description="Compared with your profile. Keep it current — the team sees the same."
        actions={
          <ButtonLink to="/profile" size="sm" variant="ghost" leftIcon="edit">
            Edit profile
          </ButtonLink>
        }
      />
      <dl className="job-detail-fit">
        <div>
          <dt>Skills</dt>
          <dd>
            {required.length === 0 ? (
              <span className="muted">No specific skills required.</span>
            ) : (
              <>
                <p className="text-sm">
                  You have <strong>{matched.length}</strong> of {required.length} listed skills
                  {matched.length === 0 && " — at least one is needed to apply"}.
                </p>
                <div className="tag-list">
                  {matched.map((skill) => (
                    <span key={skill} className="tag match">
                      <Icon name="check" size={12} label="You have" /> {skill}
                    </span>
                  ))}
                  {missing.map((skill) => (
                    <span key={skill} className="tag missing">
                      <Icon name="minus" size={12} label="Not on your profile" /> {skill}
                    </span>
                  ))}
                </div>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd className="row">
            <Icon
              name={enoughYears ? "check-circle" : "alert-circle"}
              className={enoughYears ? "job-detail-ok" : "job-detail-short"}
              label={enoughYears ? "Meets it" : "Below it"}
            />
            <span className="text-sm">
              {job.min_experience_years > 0
                ? `${formatYears(job.min_experience_years)} or more asked; you have ${formatYears(years)}.`
                : `No minimum; you have ${formatYears(years)}.`}
            </span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
