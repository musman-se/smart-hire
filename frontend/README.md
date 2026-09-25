# SmartHire — Frontend

Recruiter console for the SmartHire API. React + TypeScript, built with Vite.

## Why Vite and not Next.js

FastAPI already owns every server concern — routing, validation, persistence, and
authentication when it arrives. Next.js earns its keep through SSR, React Server
Components, server actions and a Node server; this app would use none of them, while
adding a second runtime to operate, containerise and explain.

A Vite SPA compiles to static files served by nginx. The production image ships no Node
runtime at all.

**The tradeoff.** No SSR, so no server-rendered HTML for search engines, and the first
paint waits on the JS bundle. Neither matters for an internal recruiter console behind
(eventual) authentication. If SmartHire ever needs a public, indexable job board, that is
the moment to reconsider — and it would be a separate surface, not a rewrite of this one.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 6 | Fast dev server, static output |
| UI | React 19 + TypeScript | Existing team strength |
| Server state | TanStack Query | Caching, loading/error states, invalidation |
| Routing | React Router 7 | Client-side routes, no server needed |
| API types | `openapi-typescript` | Generated from the backend's own schema |
| Styling | Hand-written CSS | No framework to explain or fight |

## Running it

### Dev — against a local API

```bash
docker compose up -d db migrate api   # from the repo root
npm install
npm run dev                            # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8000`, so the app and the API share an origin.

### Production — the whole stack

```bash
npm run build                          # see the note below
docker compose up --build              # from the repo root
```

App at http://localhost:3000, API at http://localhost:8000.

## Contract: types are generated, not written

`src/api/schema.d.ts` is generated from the backend's live OpenAPI document:

```bash
npm run generate:api      # requires the API running on :8000
```

Nothing under `src/api/` describing the wire format is hand-maintained. If the backend
renames a field, the next generate makes this project **fail to compile** rather than
fail at runtime in front of a user. `src/api/types.ts` only puts friendly names on the
generated types.

The one deliberate duplication is `NEXT_STAGES` in `types.ts`, which mirrors
`ALLOWED_TRANSITIONS` in the backend. The UI uses it to decide which buttons to render;
the server remains the only thing that enforces it. A client copy that drifts can only
ever show a wrong button — it can never let an illegal transition through.

## Errors are the interesting part

The backend returns one envelope for every failure:

```json
{ "error": { "code": "not_eligible", "message": "…", "request_id": "…" } }
```

`src/api/client.ts` is the only file that knows that shape. Everything above it catches an
`ApiError` and reads `.code`. `ErrorNotice` maps codes to guidance, and renders rule
violations — duplicate application, not eligible, limit reached — in a different tone from
genuine faults, because they are the platform working rather than breaking.

Unmapped codes fall back to the server's own message, so a new backend error still
surfaces usefully instead of vanishing.

## Layout

```
src/
├── api/
│   ├── schema.d.ts    generated — do not edit
│   ├── types.ts       friendly aliases over the generated types
│   ├── client.ts      fetch wrapper, error envelope, ApiError
│   └── resources.ts   one function per endpoint, no React
├── hooks/queries.ts   TanStack Query hooks and cache keys
├── components/        Layout, pills, modal, pagination, error notice
└── pages/             Jobs, JobDetail, Candidates, CandidateDetail
```

`resources.ts` has no React in it, so the API layer is testable and reusable without
mounting components.

## Known environment issues

**Node version.** Vite is pinned to 6.x because this machine runs Node 22.11.0, and Vite
7+ requires 20.19+ or 22.12+. On Node 22.12 or newer, Vite can move up.

**npm and TLS inspection.** The corporate network inspects TLS, so `npm install` inside a
container fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` — the container does not trust
the corporate root CA, while Windows does. The `Dockerfile` therefore copies a bundle
built on the host rather than building inside the image; the two-stage build for a normal
network is kept in comments at the top of that file.

The npm bundled with Node 22.11 also produces lockfiles that crash `npm ci`, which is why
`package-lock.json` is not relied upon in the image build. Both issues disappear on
Node 22.12+ with npm 11.

## Not built

No authentication — the API has none yet, so there is no login, no roles, and no route
guards. When the backend gains auth, this app needs a token store, an `Authorization`
header in `client.ts`, and recruiter-only routes. No optimistic updates, no tests: with
the review deadline close, the effort went into the backend suite where the business
rules live.
