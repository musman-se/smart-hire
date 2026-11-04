/** Builders for the candidate-side tests: a valid entity with only the fields a test
 * cares about overridden. Not imported by app code. */

import type { Application, Candidate, Job, Notification, StageChange } from "../../api/types";

const T0 = "2026-10-01T09:00:00Z";

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Backend Engineer",
    description: "Build things.",
    department: "Engineering",
    location: "Remote",
    employment_type: "full_time",
    required_skills: [],
    min_experience_years: 0,
    max_applications: null,
    status: "published",
    published_at: T0,
    created_at: T0,
    updated_at: T0,
    ...overrides,
  };
}

export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "cand-1",
    email: "ayesha@example.com",
    full_name: "Ayesha Khan",
    phone: null,
    headline: null,
    years_experience: 0,
    skills: [],
    resume_url: null,
    created_at: T0,
    updated_at: T0,
    ...overrides,
  };
}

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    job_id: "job-1",
    candidate_id: "cand-1",
    stage: "applied",
    cover_letter: null,
    match_score: null,
    created_at: T0,
    updated_at: T0,
    ...overrides,
  };
}

export function makeChange(overrides: Partial<StageChange> = {}): StageChange {
  return { from_stage: null, to_stage: "applied", note: null, changed_at: T0, ...overrides };
}

export function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    kind: "application_received",
    channel: "email",
    recipient: "ayesha@example.com",
    subject: "We received your application: Backend Engineer",
    body: "Thank you for applying.",
    sent_at: T0,
    ...overrides,
  };
}
