import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import type { CandidateFilters } from "../api/resources";
import { useUser } from "../auth/AuthProvider";
import { Empty, ErrorNotice, Pagination, Tags, formatDate } from "../components/ui";
import { useCandidates } from "../hooks/queries";

const PAGE_SIZE = 10;

/** Recruiters only. A candidate who lands here is sent to their own profile. */
export function CandidatesPage() {
  const user = useUser();
  if (user.role !== "recruiter") return <Navigate to={`/candidates/${user.id}`} replace />;
  return <CandidateList />;
}

function CandidateList() {
  const [filters, setFilters] = useState<CandidateFilters>({
    skill: "",
    search: "",
    limit: PAGE_SIZE,
    offset: 0,
  });

  const { data, isLoading, error } = useCandidates(filters);

  function patchFilters(next: Partial<CandidateFilters>) {
    setFilters((current) => ({ ...current, ...next, offset: 0 }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Candidates</h1>
          <p>
            Candidates register themselves, at <code>/register</code>; each profile belongs
            to its candidate's account.
          </p>
        </div>
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
    </>
  );
}
