"""Populate a running SmartHire instance with demo data.

Deliberately goes through the HTTP API rather than inserting rows: the seed data is then
guaranteed to satisfy every rule the API enforces, and running it doubles as a smoke test.

    docker compose run --rm seed                 # inside Compose, against http://api:8000
    python scripts/seed.py                       # from your machine, http://localhost:8000
    python scripts/seed.py http://localhost:3000/api

The target is, in order: the first argument, then SMARTHIRE_API_URL, then
http://localhost:8000. Compose sets SMARTHIRE_API_URL for the seed service.

It signs in as the recruiter SEED_RECRUITER_EMAIL (default recruiter@example.com) with
SEED_PASSWORD, which must already exist — the Compose seed service creates it first with
`python -m app.auth.cli create-recruiter`. Every demo candidate is registered with the
same SEED_PASSWORD, so you can sign in to the console as any of them.

Safe to re-run — anything that already exists is reported and skipped.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = (
    sys.argv[1]
    if len(sys.argv) > 1
    else os.environ.get("SMARTHIRE_API_URL", "http://localhost:8000")
).rstrip("/")
RECRUITER_EMAIL = os.environ.get("SEED_RECRUITER_EMAIL", "recruiter@example.com")
# No default: a password is never baked into the code, not even a demo one.
PASSWORD = os.environ.get("SEED_PASSWORD", "")

JOBS = [
    {
        "title": "Senior Backend Engineer",
        "description": "Design and operate the SmartHire recruitment platform: FastAPI, "
        "PostgreSQL, Kafka and Temporal.",
        "department": "Engineering",
        "location": "Islamabad / Remote",
        "employment_type": "full_time",
        "required_skills": ["python", "postgresql", "kafka"],
        "min_experience_years": 4,
        "publish": True,
    },
    {
        "title": "Frontend Engineer",
        "description": "Build the recruiter console in React and TypeScript, consuming "
        "the SmartHire API.",
        "department": "Engineering",
        "location": "Lahore",
        "employment_type": "full_time",
        "required_skills": ["react", "typescript"],
        "min_experience_years": 2,
        "publish": True,
    },
    {
        "title": "Platform Intern",
        "description": "Six-month internship working alongside the platform team on "
        "tooling and observability.",
        "department": "Platform",
        "location": "Remote",
        "employment_type": "internship",
        "required_skills": ["python"],
        "min_experience_years": 0,
        "max_applications": 2,
        "publish": True,
    },
    {
        "title": "Engineering Manager",
        "description": "Lead a team of backend engineers building recruitment "
        "infrastructure at scale.",
        "department": "Engineering",
        "location": "Islamabad",
        "employment_type": "full_time",
        "required_skills": ["leadership", "python"],
        "min_experience_years": 8,
        "publish": False,  # stays a draft, to show the lifecycle
    },
]

CANDIDATES = [
    {
        "email": "ayesha.khan@example.com",
        "full_name": "Ayesha Khan",
        "headline": "Backend engineer, distributed systems",
        "years_experience": 6,
        "skills": ["python", "postgresql", "kafka", "docker"],
    },
    {
        "email": "bilal.ahmed@example.com",
        "full_name": "Bilal Ahmed",
        "headline": "Frontend engineer",
        "years_experience": 4,
        "skills": ["react", "typescript", "css"],
    },
    {
        "email": "sara.iqbal@example.com",
        "full_name": "Sara Iqbal",
        "headline": "Graduate developer",
        "years_experience": 0,
        "skills": ["python"],
    },
    {
        "email": "omar.farooq@example.com",
        "full_name": "Omar Farooq",
        "headline": "Data analyst",
        "years_experience": 3,
        "skills": ["excel", "sql"],
    },
]


def call(
    method: str, path: str, body: dict | None = None, token: str | None = None
) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read()
        return error.code, json.loads(raw) if raw else {}
    except urllib.error.URLError as error:
        print(f"Cannot reach {BASE} — is the stack running? ({error.reason})")
        raise SystemExit(1) from error


def code_of(payload: dict) -> str:
    return payload.get("error", {}).get("code", "?")


def sign_in(email: str) -> str | None:
    """An access token, or None. It lasts minutes — far longer than this script runs."""
    status, tokens = call("POST", "/auth/login", {"email": email, "password": PASSWORD})
    return tokens["access_token"] if status == 200 else None


def publish_and_wait(job: dict, token: str, timeout: float = 60) -> dict:
    """Publishing answers 202 and runs as a workflow; wait for it to finish.

    Exactly what any client of a 202 endpoint must do: a job is not open for
    applications until the workflow has moved it from processing to published.
    """
    status, accepted = call("POST", f"/jobs/{job['id']}/publish", token=token)
    if status != 202:
        return accepted
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        _, current = call("GET", f"/jobs/{job['id']}", token=token)
        if current.get("status") != "processing":
            return current
        time.sleep(0.5)
    print(f"  ! {job['title']} still processing after {timeout:.0f}s — is the worker running?")
    return current


def main() -> None:
    print(f"Seeding {BASE}\n")

    status, _ = call("GET", "/health")
    if status != 200:
        print("API is not healthy — aborting.")
        raise SystemExit(1)

    if not PASSWORD:
        print("SEED_PASSWORD is not set — copy .env.example to .env, or export it.")
        raise SystemExit(1)
    recruiter = sign_in(RECRUITER_EMAIL)
    if recruiter is None:
        print(
            f"Cannot sign in as {RECRUITER_EMAIL}. Create the recruiter first:\n"
            f"  python -m app.auth.cli create-recruiter {RECRUITER_EMAIL}\n"
            "(`docker compose run --rm seed` does this for you.)"
        )
        raise SystemExit(1)

    # Jobs, unlike candidate emails, have no natural unique key, so re-running would
    # duplicate them. Skip any title that already exists.
    _, existing = call("GET", "/jobs?limit=100", token=recruiter)
    existing_titles = {job["title"] for job in existing.get("items", [])}

    jobs: list[dict] = []
    for spec in JOBS:
        publish = spec.pop("publish", False)
        if spec["title"] in existing_titles:
            print(f"  job  {spec['title']:<28} skipped (already exists)")
            continue
        status, job = call("POST", "/jobs", spec, token=recruiter)
        if status != 201:
            print(f"  job  {spec['title']:<28} skipped ({code_of(job)})")
            continue
        if publish:
            job = publish_and_wait(job, recruiter)
        jobs.append(job)
        print(f"  job  {job['title']:<28} {job['status']}")

    candidates: list[dict] = []
    tokens: dict[str, str] = {}
    for spec in CANDIDATES:
        # Candidates register themselves; the recruiter cannot create them.
        status, candidate = call("POST", "/auth/register", spec | {"password": PASSWORD})
        if status != 201:
            print(f"  cand {spec['full_name']:<28} skipped ({code_of(candidate)})")
            continue
        candidates.append(candidate)
        tokens[candidate["full_name"]] = sign_in(spec["email"]) or ""
        print(f"  cand {candidate['full_name']:<28} {candidate['years_experience']}y")

    if not jobs or not candidates:
        print("\nNothing new to apply with.")
        return

    print("\nApplications, each made by the candidate signed in")
    print("(rule violations below are expected and intentional):")
    by_title = {job["title"]: job for job in jobs}
    by_name = {c["full_name"]: c for c in candidates}

    attempts = [
        ("Senior Backend Engineer", "Ayesha Khan"),   # eligible
        ("Frontend Engineer", "Bilal Ahmed"),         # eligible
        ("Platform Intern", "Sara Iqbal"),            # eligible
        ("Senior Backend Engineer", "Ayesha Khan"),   # duplicate -> 409
        ("Senior Backend Engineer", "Sara Iqbal"),    # too junior -> 422
        ("Frontend Engineer", "Omar Farooq"),         # no matching skill -> 422
        ("Engineering Manager", "Ayesha Khan"),       # draft job -> 409
    ]

    for title, name in attempts:
        job, candidate = by_title.get(title), by_name.get(name)
        if not job or not candidate:
            continue
        # No candidate_id in the body: the applicant is whoever the token names.
        status, result = call("POST", f"/jobs/{job['id']}/applications", {}, token=tokens[name])
        outcome = result.get("stage", code_of(result))
        print(f"  {name:<14} -> {title:<28} {status} {outcome}")

    print(f"\nDone. Open http://localhost:3000 and sign in as {RECRUITER_EMAIL},")
    print("or as any candidate above, with SEED_PASSWORD.")


if __name__ == "__main__":
    main()
