import { useState } from "react";
import { Link } from "react-router-dom";

import type { JobFilters } from "../api/resources";
import { EMPLOYMENT_TYPES, JOB_STATUSES, type JobCreate } from "../api/types";
import { Empty, ErrorNotice, Modal, Pagination, StatusPill, Tags, formatDate } from "../components/ui";
import { useCreateJob, useDeleteJob, useJobTransition, useJobs } from "../hooks/queries";

const PAGE_SIZE = 10;

function NewJobForm({ onDone }: { onDone: () => void }) {
  const createJob = useCreateJob();
  const [form, setForm] = useState({
    title: "",
    description: "",
    department: "",
    location: "",
    employment_type: "full_time",
    required_skills: "",
    min_experience_years: 0,
    max_applications: "",
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload: JobCreate = {
      title: form.title,
      description: form.description,
      department: form.department || null,
      location: form.location || null,
      employment_type: form.employment_type as JobCreate["employment_type"],
      // The server normalises skills too — trims, lowercases, de-duplicates. Splitting
      // here is only so the user can type a comma-separated list.
      required_skills: form.required_skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
      min_experience_years: Number(form.min_experience_years) || 0,
      max_applications: form.max_applications ? Number(form.max_applications) : null,
    };

    createJob.mutate(payload, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            required
            minLength={3}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Senior Backend Engineer"
          />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            required
            minLength={10}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What the role involves…"
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="department">Department</label>
            <input
              id="department"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="Engineering"
            />
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Islamabad / Remote"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="employment_type">Employment type</label>
            <select
              id="employment_type"
              value={form.employment_type}
              onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="min_experience_years">Minimum experience (years)</label>
            <input
              id="min_experience_years"
              type="number"
              min={0}
              max={50}
              value={form.min_experience_years}
              onChange={(e) => setForm({ ...form, min_experience_years: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="required_skills">Required skills</label>
            <input
              id="required_skills"
              value={form.required_skills}
              onChange={(e) => setForm({ ...form, required_skills: e.target.value })}
              placeholder="python, postgresql, kafka"
            />
            <span className="field-hint">Comma separated. A candidate needs at least one.</span>
          </div>
          <div className="field">
            <label htmlFor="max_applications">Application cap</label>
            <input
              id="max_applications"
              type="number"
              min={1}
              value={form.max_applications}
              onChange={(e) => setForm({ ...form, max_applications: e.target.value })}
              placeholder="unlimited"
            />
          </div>
        </div>
      </div>

      <ErrorNotice error={createJob.error} />

      <p className="field-hint" style={{ marginTop: "0.9rem" }}>
        Jobs are always created as a draft — publishing is a separate, deliberate step.
      </p>

      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={createJob.isPending}>
          {createJob.isPending ? "Creating…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

export function JobsPage() {
  const [filters, setFilters] = useState<JobFilters>({
    status: "",
    skill: "",
    search: "",
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, error } = useJobs(filters);
  const deleteJob = useDeleteJob();

  function patchFilters(next: Partial<JobFilters>) {
    // Any filter change resets to the first page — otherwise you can land on page 4 of
    // a two-page result and see nothing.
    setFilters((current) => ({ ...current, ...next, offset: 0 }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p>Create, publish and manage job postings.</p>
        </div>
        <span className="spacer" />
        <button type="button" className="primary" onClick={() => setShowNew(true)}>
          New job
        </button>
      </div>

      <div className="panel">
        <div className="filters">
          <div className="field">
            <label htmlFor="f-status">Status</label>
            <select
              id="f-status"
              value={filters.status}
              onChange={(e) => patchFilters({ status: e.target.value as JobFilters["status"] })}
            >
              <option value="">All</option>
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="f-skill">Skill</label>
            <input
              id="f-skill"
              value={filters.skill}
              onChange={(e) => patchFilters({ skill: e.target.value })}
              placeholder="python"
            />
          </div>

          <div className="field" style={{ flex: 1, minWidth: "12rem" }}>
            <label htmlFor="f-search">Title contains</label>
            <input
              id="f-search"
              value={filters.search}
              onChange={(e) => patchFilters({ search: e.target.value })}
              placeholder="engineer"
            />
          </div>
        </div>
      </div>

      <ErrorNotice error={error} />

      <div className="panel">
        {isLoading ? (
          <Empty>Loading jobs…</Empty>
        ) : !data || data.items.length === 0 ? (
          <Empty>No jobs match these filters.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Skills</th>
                    <th>Min. exp</th>
                    <th>Published</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((job) => (
                    <JobRow key={job.id} job={job} onDelete={() => deleteJob.mutate(job.id)} />
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              total={data.total}
              limit={data.limit}
              offset={data.offset}
              onChange={(offset) => setFilters((current) => ({ ...current, offset }))}
            />
          </>
        )}
      </div>

      {showNew && (
        <Modal title="New job" onClose={() => setShowNew(false)}>
          <NewJobForm onDone={() => setShowNew(false)} />
        </Modal>
      )}
    </>
  );
}

function JobRow({
  job,
  onDelete,
}: {
  job: import("../api/types").Job;
  onDelete: () => void;
}) {
  const transition = useJobTransition(job.id);

  return (
    <tr>
      <td>
        <Link to={`/jobs/${job.id}`}>{job.title}</Link>
        <div className="muted" style={{ fontSize: "0.8rem" }}>
          {[job.department, job.location].filter(Boolean).join(" · ") || "—"}
        </div>
      </td>
      <td>
        <StatusPill status={job.status} />
      </td>
      <td style={{ maxWidth: "16rem" }}>
        <Tags items={job.required_skills ?? []} />
      </td>
      <td>{job.min_experience_years}y</td>
      <td className="muted">{formatDate(job.published_at)}</td>
      <td className="actions">
        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          {job.status === "draft" && (
            <button
              type="button"
              className="small"
              disabled={transition.isPending}
              onClick={() => transition.mutate("publish")}
            >
              Publish
            </button>
          )}
          {job.status === "published" && (
            <button
              type="button"
              className="small"
              disabled={transition.isPending}
              onClick={() => transition.mutate("close")}
            >
              Close
            </button>
          )}
          {job.status === "closed" && (
            <button
              type="button"
              className="small"
              disabled={transition.isPending}
              onClick={() => transition.mutate("reopen")}
            >
              Reopen
            </button>
          )}
          <button type="button" className="small danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
