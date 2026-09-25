import { useState } from "react";
import { Link } from "react-router-dom";

import type { CandidateFilters } from "../api/resources";
import type { CandidateCreate } from "../api/types";
import { Empty, ErrorNotice, Modal, Pagination, Tags, formatDate } from "../components/ui";
import { useCandidates, useCreateCandidate, useDeleteCandidate } from "../hooks/queries";

const PAGE_SIZE = 10;

function NewCandidateForm({ onDone }: { onDone: () => void }) {
  const createCandidate = useCreateCandidate();
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    headline: "",
    years_experience: 0,
    skills: "",
    resume_url: "",
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload: CandidateCreate = {
      email: form.email,
      full_name: form.full_name,
      phone: form.phone || null,
      headline: form.headline || null,
      years_experience: Number(form.years_experience) || 0,
      skills: form.skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
      resume_url: form.resume_url || null,
    };

    createCandidate.mutate(payload, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="form-row">
          <div className="field">
            <label htmlFor="full_name">Full name</label>
            <input
              id="full_name"
              required
              minLength={2}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Ayesha Khan"
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="ayesha@example.com"
            />
            <span className="field-hint">Must be unique. Stored lowercase.</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="headline">Headline</label>
          <input
            id="headline"
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
            placeholder="Backend engineer, distributed systems"
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="years">Years of experience</label>
            <input
              id="years"
              type="number"
              min={0}
              max={60}
              value={form.years_experience}
              onChange={(e) => setForm({ ...form, years_experience: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="skills">Skills</label>
          <input
            id="skills"
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
            placeholder="python, fastapi, postgresql"
          />
          <span className="field-hint">Comma separated.</span>
        </div>

        <div className="field">
          <label htmlFor="resume_url">Resume URL</label>
          <input
            id="resume_url"
            value={form.resume_url}
            onChange={(e) => setForm({ ...form, resume_url: e.target.value })}
            placeholder="https://…"
          />
        </div>
      </div>

      <ErrorNotice error={createCandidate.error} />

      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={createCandidate.isPending}>
          {createCandidate.isPending ? "Registering…" : "Register candidate"}
        </button>
      </div>
    </form>
  );
}

export function CandidatesPage() {
  const [filters, setFilters] = useState<CandidateFilters>({
    skill: "",
    search: "",
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, error } = useCandidates(filters);
  const deleteCandidate = useDeleteCandidate();

  function patchFilters(next: Partial<CandidateFilters>) {
    setFilters((current) => ({ ...current, ...next, offset: 0 }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Candidates</h1>
          <p>Registered profiles available to apply for jobs.</p>
        </div>
        <span className="spacer" />
        <button type="button" className="primary" onClick={() => setShowNew(true)}>
          Register candidate
        </button>
      </div>

      <div className="panel">
        <div className="filters">
          <div className="field">
            <label htmlFor="c-skill">Skill</label>
            <input
              id="c-skill"
              value={filters.skill}
              onChange={(e) => patchFilters({ skill: e.target.value })}
              placeholder="python"
            />
          </div>

          <div className="field">
            <label htmlFor="c-exp">Min. experience</label>
            <input
              id="c-exp"
              type="number"
              min={0}
              value={filters.min_experience ?? ""}
              onChange={(e) =>
                patchFilters({
                  min_experience: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="any"
            />
          </div>

          <div className="field" style={{ flex: 1, minWidth: "12rem" }}>
            <label htmlFor="c-search">Name contains</label>
            <input
              id="c-search"
              value={filters.search}
              onChange={(e) => patchFilters({ search: e.target.value })}
              placeholder="ayesha"
            />
          </div>
        </div>
      </div>

      <ErrorNotice error={error} />

      <div className="panel">
        {isLoading ? (
          <Empty>Loading candidates…</Empty>
        ) : !data || data.items.length === 0 ? (
          <Empty>No candidates match these filters.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Experience</th>
                    <th>Skills</th>
                    <th>Registered</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((candidate) => (
                    <tr key={candidate.id}>
                      <td>
                        <Link to={`/candidates/${candidate.id}`}>{candidate.full_name}</Link>
                        {candidate.headline && (
                          <div className="muted" style={{ fontSize: "0.8rem" }}>
                            {candidate.headline}
                          </div>
                        )}
                      </td>
                      <td className="mono muted">{candidate.email}</td>
                      <td>{candidate.years_experience}y</td>
                      <td style={{ maxWidth: "16rem" }}>
                        <Tags items={candidate.skills ?? []} />
                      </td>
                      <td className="muted">{formatDate(candidate.created_at)}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="small danger"
                          onClick={() => deleteCandidate.mutate(candidate.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
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
        <Modal title="Register candidate" onClose={() => setShowNew(false)}>
          <NewCandidateForm onDone={() => setShowNew(false)} />
        </Modal>
      )}
    </>
  );
}
