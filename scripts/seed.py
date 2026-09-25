"""Populate a running SmartHire instance with demo data.

Deliberately goes through the HTTP API rather than inserting rows: the seed data is then
guaranteed to satisfy every rule the API enforces, and running it doubles as a smoke test.

    python scripts/seed.py                       # against http://localhost:8000
    python scripts/seed.py http://localhost:3000/api

Safe to re-run — anything that already exists is reported and skipped.
"""

from __future__ import annotations

import sys
import urllib.error
import urllib.request
import json

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8000"

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


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    request = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
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


def main() -> None:
    print(f"Seeding {BASE}\n")

    status, _ = call("GET", "/health")
    if status != 200:
        print("API is not healthy — aborting.")
        raise SystemExit(1)

    jobs: list[dict] = []
    for spec in JOBS:
        publish = spec.pop("publish", False)
        status, job = call("POST", "/jobs", spec)
        if status != 201:
            print(f"  job  {spec['title']:<28} skipped ({code_of(job)})")
            continue
        if publish:
            _, job = call("POST", f"/jobs/{job['id']}/publish")
        jobs.append(job)
        print(f"  job  {job['title']:<28} {job['status']}")

    candidates: list[dict] = []
    for spec in CANDIDATES:
        status, candidate = call("POST", "/candidates", spec)
        if status != 201:
            print(f"  cand {spec['full_name']:<28} skipped ({code_of(candidate)})")
            continue
        candidates.append(candidate)
        print(f"  cand {candidate['full_name']:<28} {candidate['years_experience']}y")

    if not jobs or not candidates:
        print("\nNothing new to apply with.")
        return

    print("\nApplications (rule violations below are expected and intentional):")
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
        status, result = call(
            "POST", f"/jobs/{job['id']}/applications", {"candidate_id": candidate["id"]}
        )
        outcome = result.get("stage", code_of(result))
        print(f"  {name:<14} -> {title:<28} {status} {outcome}")

    print("\nDone. Open http://localhost:3000")


if __name__ == "__main__":
    main()
