import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { EMPLOYMENT_TYPES, type EmploymentType, type Job } from "../../api/types";
import {
  JOB_FORM_FIELDS,
  JOB_LIMITS,
  EMPTY_JOB_FORM,
  changesContent,
  isSameForm,
  jobToFormValues,
  toCreatePayload,
  toUpdatePayload,
  validateJobForm,
  type JobFormField,
  type JobFormValues,
} from "../../components/jobs/jobForm";
import { canEditJob, canPublishJob } from "../../components/jobs/jobLifecycle";
import { JobPreviewCard } from "../../components/jobs/JobPreviewCard";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorFallback,
  ErrorNotice,
  Field,
  Input,
  Notice,
  PageHeader,
  PageSkeleton,
  SegmentedControl,
  Shortcut,
  StatusPill,
  TagInput,
  Textarea,
  humanize,
  useToast,
} from "../../components/ui";
import { useCreateJob, useJob, useJobTransition, useSuggestSkills, useUpdateJob } from "../../hooks/queries";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useIdempotencyKey } from "../../hooks/useIdempotencyKey";
import { usePublishJob } from "../../hooks/useJobsExtras";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";

/** Create (/jobs/new) and edit (/jobs/:jobId/edit) a job. Recruiters only. */
export function JobEditorPage() {
  const { jobId } = useParams();
  return jobId ? <EditJob key={jobId} jobId={jobId} /> : <NewJob />;
}

function NewJob() {
  useDocumentTitle("New job");
  return <JobEditor />;
}

function EditJob({ jobId }: { jobId: string }) {
  const { data: job, error, isLoading, refetch } = useJob(jobId);
  useDocumentTitle(job ? `Edit ${job.title}` : "Edit job");

  if (isLoading) return <PageSkeleton />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <PageHeader title="Job not found" breadcrumbs={[{ label: "Jobs", to: "/jobs" }, { label: "Not found" }]} />
        <Card>
          <EmptyState
            icon="briefcase"
            title="This job does not exist"
            description="It may have been deleted, or the link is incomplete."
            action={
              <ButtonLink to="/jobs" leftIcon="arrow-left">
                Back to jobs
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }
  if (!job) {
    return <ErrorFallback error={error} title="Could not load this job" onRetry={() => void refetch()} />;
  }
  // The form keeps its own copy of the job's values from here on; useJob keeps
  // polling only so the status — what may be edited — stays current.
  return <JobEditor job={job} />;
}

const TYPE_OPTIONS = EMPLOYMENT_TYPES.map((type) => ({ value: type, label: humanize(type) }));

const fieldId = (field: JobFormField) => `job-${field}`;

/** Matches the server, which lowercases skill names on save. */
const skillName = (skill: string) => skill.trim().toLowerCase();

type SaveIntent = "save" | "publish";

/** The form for both modes; `job` undefined means create. */
function JobEditor({ job }: { job?: Job }) {
  const navigate = useNavigate();
  const toast = useToast();
  const suggestSkills = useSuggestSkills();

  const [baseline] = useState<JobFormValues>(() => (job ? jobToFormValues(job) : EMPTY_JOB_FORM));
  const [values, setValues] = useState(baseline);
  const [touched, setTouched] = useState<ReadonlySet<JobFormField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState<SaveIntent | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);

  const createJob = useCreateJob();
  // Unused when creating; a hook cannot be called conditionally.
  const updateJob = useUpdateJob(job?.id ?? "");
  const publishJob = usePublishJob();
  // A double-clicked "Save" or a retry after a timeout must not create the job twice.
  const { key: idempotencyKey, settle } = useIdempotencyKey(values);

  const errors = useMemo(() => validateJobForm(values), [values]);
  const dirty = !isSameForm(values, baseline);
  const patch = useMemo(() => (job ? toUpdatePayload(values, baseline) : {}), [job, values, baseline]);
  const { allowNavigation } = useUnsavedChangesGuard(dirty, {
    body: "Your edits to this job have not been saved. Leaving now throws them away.",
  });

  const status = job?.status;
  const locked = status !== undefined && !canEditJob(status);
  const offersPublish = status === undefined || canPublishJob(status);
  const reanalyses = status === "published" && changesContent(patch);

  function update<K extends JobFormField>(field: K, value: JobFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function touch(field: JobFormField) {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));
  }

  /** Errors appear once a field has been left, or after a save attempt — not while
   * the first characters are still being typed. */
  const errorFor = (field: JobFormField) =>
    submitted || touched.has(field) ? errors[field] : undefined;

  async function persist(): Promise<Job> {
    if (job) {
      // Nothing changed: "Save & publish" just publishes.
      return Object.keys(patch).length === 0 ? job : updateJob.mutateAsync(patch);
    }
    try {
      const created = await createJob.mutateAsync({ payload: toCreatePayload(values), idempotencyKey });
      settle(null);
      return created;
    } catch (error) {
      settle(error);
      throw error;
    }
  }

  async function save(intent: SaveIntent) {
    if (saving || locked) return;
    setSubmitted(true);
    setSaveError(null);

    const firstInvalid = JOB_FORM_FIELDS.find((field) => errors[field]);
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    setSaving(intent);
    let saved: Job;
    try {
      saved = await persist();
    } catch (error) {
      setSaveError(error);
      setSaving(null);
      return;
    }

    if (intent === "publish") {
      try {
        await publishJob.mutateAsync(saved.id);
      } catch (error) {
        // The job itself is safe; only starting the workflow failed.
        toast.error(error, {
          description: "The job is saved as a draft. Publish it again from its page.",
        });
        leave(saved.id);
        return;
      }
    }

    toast.success(successTitle(saved, intent, Boolean(job)), {
      description: successDescription(intent, reanalyses, Boolean(job)),
    });
    leave(saved.id);
  }

  function leave(id: string) {
    allowNavigation();
    navigate(`/jobs/${id}`);
  }

  useHotkeys([{ combo: "mod+s", handler: () => void save("save"), allowInInputs: true }]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save("save");
  }

  const backTo = job ? `/jobs/${job.id}` : "/jobs";
  const saveLabel = job ? "Save changes" : "Save draft";

  return (
    <>
      <PageHeader
        title={job ? `Edit ${job.title}` : "New job"}
        description={
          job
            ? undefined
            : "Jobs start as private drafts. Publish when it is ready and the role goes on the job board for candidates."
        }
        breadcrumbs={[
          { label: "Jobs", to: "/jobs" },
          ...(job ? [{ label: job.title, to: `/jobs/${job.id}` }] : []),
          { label: job ? "Edit" : "New job" },
        ]}
        meta={job && <StatusPill status={job.status} />}
      />

      {job && <EditNotice job={job} />}

      <form className="jobs-editor" noValidate onSubmit={handleSubmit} aria-label={job ? "Edit job" : "New job"}>
        <div className="jobs-editor-layout">
          <fieldset className="jobs-editor-sections" disabled={locked || saving !== null}>
            <legend className="sr-only">Job details</legend>

            <Card>
              <CardHeader title="Basics" description="What the role is called and where it sits." icon="briefcase" />
              <div className="form-grid">
                <Field
                  id={fieldId("title")}
                  label="Job title"
                  required
                  error={errorFor("title")}
                  labelAside={`${values.title.length} / ${JOB_LIMITS.titleMax}`}
                >
                  <Input
                    value={values.title}
                    maxLength={JOB_LIMITS.titleMax}
                    onChange={(event) => update("title", event.target.value)}
                    onBlur={() => touch("title")}
                    placeholder="Senior Backend Engineer"
                    autoFocus={!job}
                  />
                </Field>
                <div className="form-row">
                  <Field id={fieldId("department")} label="Department" optional error={errorFor("department")}>
                    <Input
                      value={values.department}
                      maxLength={JOB_LIMITS.departmentMax}
                      onChange={(event) => update("department", event.target.value)}
                      onBlur={() => touch("department")}
                      placeholder="Engineering"
                    />
                  </Field>
                  <Field
                    id={fieldId("location")}
                    label="Location"
                    optional
                    error={errorFor("location")}
                    hint="A city, or Remote. Candidates can filter by it."
                  >
                    <Input
                      value={values.location}
                      maxLength={JOB_LIMITS.locationMax}
                      onChange={(event) => update("location", event.target.value)}
                      onBlur={() => touch("location")}
                      placeholder="Islamabad, or Remote"
                    />
                  </Field>
                </div>
                <div className="field">
                  <span className="field-label" aria-hidden="true">
                    Employment type
                  </span>
                  <SegmentedControl
                    className="jobs-type-control"
                    options={TYPE_OPTIONS}
                    value={values.employment_type}
                    onChange={(type: EmploymentType) => update("employment_type", type)}
                    aria-label="Employment type"
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Description"
                description="What the person will do, who they will work with, and what success looks like."
                icon="file-text"
              />
              <Field
                id={fieldId("description")}
                label="Job description"
                required
                error={errorFor("description")}
                hint="Plain text — line breaks are kept."
              >
                <Textarea
                  value={values.description}
                  maxLength={JOB_LIMITS.descriptionMax}
                  showCount
                  rows={12}
                  onChange={(event) => update("description", event.target.value)}
                  onBlur={() => touch("description")}
                  placeholder={"About the role\n\nWhat you will do\n\nWhat we are looking for"}
                />
              </Field>
            </Card>

            <Card>
              <CardHeader
                title="Requirements"
                description="Candidates need at least one of the skills and the minimum experience to apply."
                icon="target"
              />
              <div className="form-grid">
                <Field
                  id={fieldId("required_skills")}
                  label="Required skills"
                  error={errors.required_skills}
                  hint="Press Enter or comma to add. Leave empty to accept any skill set."
                >
                  <TagInput
                    value={values.required_skills}
                    onChange={(skills) => update("required_skills", skills)}
                    suggest={suggestSkills}
                    normalize={skillName}
                    placeholder="python, postgresql, kafka"
                  />
                </Field>
                <Field
                  id={fieldId("min_experience_years")}
                  label="Minimum experience (years)"
                  required
                  error={errorFor("min_experience_years")}
                  hint="0 accepts every experience level."
                  className="jobs-editor-narrow"
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={JOB_LIMITS.experienceMax}
                    step={1}
                    value={values.min_experience_years}
                    onChange={(event) => update("min_experience_years", event.target.value)}
                    onBlur={() => touch("min_experience_years")}
                  />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Capacity"
                description="Stop accepting applications once enough have arrived."
                icon="users"
              />
              <Field
                id={fieldId("max_applications")}
                label="Maximum applications"
                optional
                error={errorFor("max_applications")}
                hint="Leave blank for no limit. Every application received counts, including withdrawn and rejected ones."
                className="jobs-editor-narrow"
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={JOB_LIMITS.capacityMax}
                  step={1}
                  value={values.max_applications}
                  onChange={(event) => update("max_applications", event.target.value)}
                  onBlur={() => touch("max_applications")}
                  placeholder="No limit"
                />
              </Field>
            </Card>
          </fieldset>

          <aside className="jobs-editor-aside">
            <JobPreviewCard values={values} />
          </aside>
        </div>

        <div className="jobs-editor-actions">
          {saveError ? <SaveErrorNotice error={saveError} /> : null}
          <div className="jobs-editor-actions-row">
            <p className="jobs-editor-state" aria-live="polite">
              <span className="jobs-editor-state-dot" data-dirty={dirty} aria-hidden="true" />
              {dirty ? "Unsaved changes" : job ? "No changes" : "Nothing saved yet"}
              {reanalyses && <span className="subtle"> · content will be re-analysed</span>}
            </p>
            <span className="jobs-editor-shortcut subtle">
              <Shortcut combo="mod+s" /> to save
            </span>
            <span className="spacer" />
            <ButtonLink to={backTo} variant="ghost">
              Cancel
            </ButtonLink>
            {!locked && (
              <>
                <Button
                  type="submit"
                  variant={offersPublish ? "secondary" : "primary"}
                  loading={saving === "save"}
                  disabled={saving !== null || (job !== undefined && !dirty)}
                >
                  {saveLabel}
                </Button>
                {offersPublish && (
                  <Button
                    variant="primary"
                    leftIcon="send"
                    loading={saving === "publish"}
                    disabled={saving !== null}
                    onClick={() => void save("publish")}
                  >
                    {dirty || !job ? "Save & publish" : "Publish"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </form>
    </>
  );
}

/** What the status of the job being edited means for the edit: why it is locked, or
 * that a live job's changes reach candidates at once. */
function EditNotice({ job }: { job: Job }) {
  const reopen = useJobTransition(job.id);
  const toast = useToast();

  if (job.status === "closed") {
    return (
      <Notice
        tone="rule"
        title="Closed jobs cannot be edited"
        className="jobs-editor-notice"
        action={
          <Button
            size="sm"
            leftIcon="refresh"
            loading={reopen.isPending}
            onClick={() =>
              void toast
                .promise(reopen.mutateAsync("reopen"), {
                  loading: "Reopening…",
                  success: "Reopened as a draft — edit away",
                })
                .catch(() => undefined)
            }
          >
            Reopen as draft
          </Button>
        }
      >
        Reopening returns the job to draft so it can be changed; it then needs publishing again.
      </Notice>
    );
  }
  if (job.status === "processing") {
    return (
      <Notice tone="info" title="Publishing in progress" className="jobs-editor-notice">
        The content is being analysed, usually for a few seconds. Editing unlocks by itself when it
        finishes.
      </Notice>
    );
  }
  if (job.status === "published") {
    return (
      <Notice tone="warning" title="This job is live" className="jobs-editor-notice">
        Candidates see your changes as soon as you save. Changing the title, description or required
        skills also re-runs content analysis; the job stays live while it runs.
      </Notice>
    );
  }
  if (job.status === "publish_failed" && job.publish_error) {
    return (
      <Notice tone="error" title="The last publish failed" className="jobs-editor-notice">
        {job.publish_error}
      </Notice>
    );
  }
  return null;
}

/** job_not_open is worded for applicants in RULE_COPY; here it means the job changed
 * status under the editor (closed or publishing elsewhere), so it gets its own copy. */
function SaveErrorNotice({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === "job_not_open") {
    return (
      <Notice tone="rule" title="This job cannot be edited right now">
        {error.message}
      </Notice>
    );
  }
  return <ErrorNotice error={error} />;
}

function successTitle(job: Job, intent: SaveIntent, editing: boolean): string {
  const name = `“${job.title}”`;
  if (intent === "publish") return `Publishing ${name}`;
  return editing ? `${name} saved` : `${name} saved as a draft`;
}

function successDescription(intent: SaveIntent, reanalyses: boolean, editing: boolean): string | undefined {
  if (intent === "publish") {
    return "It goes live on the job board once its content is analysed, usually within seconds.";
  }
  if (reanalyses) return "It stays live while the updated content is re-analysed.";
  return editing ? undefined : "It stays private until you publish it.";
}
