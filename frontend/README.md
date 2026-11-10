# SmartHire — Frontend

The SmartHire console — for recruiters and candidates alike. React + TypeScript, built
with Vite.

## Why Vite and not Next.js

FastAPI already owns every server concern — routing, validation, persistence, and
authentication. Next.js earns its keep through SSR, React Server
Components, server actions and a Node server; this app would use none of them, while
adding a second runtime to operate, containerise and explain.

A Vite SPA compiles to static files served by nginx. The production image ships no Node
runtime at all.

**The tradeoff.** No SSR, so no server-rendered HTML for search engines, and the first
paint waits on the JS bundle. Neither matters for a console behind a sign-in. If SmartHire ever needs a public, indexable job board, that is
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
docker compose up -d db migrate api temporal worker redis   # from the repo root
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

## Asynchronous state (Module 2)

Since Module 2, two things the console shows finish *after* the request that started
them: publishing (a Temporal workflow — `POST /publish` answers 202 with the job in
`processing`) and an application's score and confirmation (the ProcessApplication
workflow). The console polls rather than waiting:

| What | Polls | Stops |
|---|---|---|
| A job (`useJob`) | every 1 s | when the status leaves `processing` |
| Publishing status (`useJobPublication`) | every 1 s, for the live step | with the job |
| A job's applications (`useJobApplications`) | every 1.5 s | when every active application created in the last minute has a score. Bounded per application, so a stopped worker never means polling forever; an older unscored one shows a "score" button instead |

Polling, not WebSockets: the waits are seconds long, a handful of clients watch them, and
polling needs nothing new on the server. Push becomes worth it with Module 3's events.

**Idempotency keys.** Applying and creating a job send an `Idempotency-Key`.
`useIdempotencyKey(input)` keeps the key stable while the input is unchanged *and no
answer has come back*, so pressing Submit again after a timeout resends the same key and
the backend replays its first answer instead of acting twice. Once the server answers —
success or refusal — the key is renewed: reusing it after a refusal would replay that
refusal for a day, even after its cause was fixed. Network errors and 5xx keep the key,
and so does a 409 `idempotency_in_progress` (the first attempt is still running): only
the same key can get its outcome, where a new one would act a second time.
Outside a secure context (plain HTTP from another machine) `crypto.randomUUID` does not
exist, and the key is built from `crypto.getRandomValues` instead.

**Stranded jobs.** A job that is `processing` while its workflow is not running — the run
ended, or never started — shows *Restart publishing* in its publishing panel.

**Temporal UI.** The publishing panel links each run to the Temporal UI at
`VITE_TEMPORAL_UI_URL` (default `http://localhost:8233`), in the `default` namespace.

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
│   ├── types.ts       friendly aliases over the generated types, plus mirrored rules
│   ├── client.ts      fetch wrapper, error envelope, ApiError, token refresh
│   └── resources.ts   one function per endpoint, no React
├── auth/
│   ├── session.ts        where the tokens live
│   ├── AuthProvider.tsx  who is signed in
│   ├── RequireAuth.tsx   the sign-in guard
│   └── RequireRole.tsx   the role guard, and each role's home
├── hooks/
│   ├── queries.ts            TanStack Query hooks, cache keys, polling rules
│   ├── use*Extras.ts         a feature's extra queries, on the same keys
│   └── use….ts               URL state, hotkeys, theme, the clock, unsaved-changes guard
├── lib/               formatting, skill matching, hotkey parsing — pure, tested
├── components/
│   ├── ui/            the design system: one import for every primitive (see its README)
│   ├── Layout.tsx     the shell: sidebar, topbar, command palette, shortcuts
│   └── <feature>/     a page's parts and its pure logic (pipeline/model.ts, …)
├── pages/             one file per route; recruiter/ and candidate/ hold role-only pages
├── styles/            tokens, base, layout and components, then one file per page area
└── router.tsx         the route map; every page is its own lazily loaded chunk
```

`resources.ts` has no React in it, so the API layer is testable and reusable without
mounting components. Likewise each feature keeps its rules in a plain `.ts` module next
to its components, tested on their own.

## Tests

```bash
npm test                  # Vitest + Testing Library, in jsdom
npx tsc --noEmit          # the typecheck the build also runs
```

Pure modules (board rules, funnel maths, form validation, fuzzy search) are unit tested;
components with real interaction (the pipeline board, the stage dialog, the job editor,
the command palette) are tested through what a user does with them.

## Known environment issues

**Node version.** Vite is pinned to 6.x because this machine runs Node 22.11.0, and Vite
7+ requires 20.19+ or 22.12+. On Node 22.12 or newer, Vite can move up.

**nginx: caching and headers.** `index.html` is served `Cache-Control: no-cache`
(revalidated on every load, so a deploy is picked up at once) and `/assets/` — hashed
filenames — `immutable` for a year. Responses are gzipped. Every response carries the
headers in `nginx/security-headers.conf` (nosniff, `Referrer-Policy: same-origin`, no
framing, and a Content-Security-Policy that allows only this origin plus the inline
theme script in `index.html`, by hash). nginx drops inherited `add_header`s in a
location that sets its own, so the file is included at server level *and* in each such
location. Changing that inline script means changing its hash in the policy;
`src/test/csp.test.ts` fails until you do and prints the new values. A tab left open
across a deploy that asks for a chunk that no longer exists reloads itself once to fetch
the new build (`src/lib/chunkReload.ts`).

**nginx and recreated containers.** The proxy target in `nginx.conf.template` is a
variable resolved through Docker's DNS at request time. A literal hostname is resolved
once at startup, so recreating the `api` container (new IP) used to break `/api` with
502s until `web` was restarted too.

**npm and TLS inspection.** The corporate network inspects TLS, so `npm install` inside a
container fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` — the container does not trust
the corporate root CA, while Windows does. The `Dockerfile` therefore copies a bundle
built on the host rather than building inside the image; the two-stage build for a normal
network is kept in comments at the top of that file.

The npm bundled with Node 22.11 also produces lockfiles that crash `npm ci`, which is why
`package-lock.json` is not relied upon in the image build. Both issues disappear on
Node 22.12+ with npm 11.

## Authentication

Everything except `/login`, `/register` and `/invite` sits behind `RequireAuth`.
Candidates create their own accounts at `/register`. Recruiters are invited by an admin
from the Team page and set their password at `/invite` (the token rides in the URL
fragment, which browsers never send to a server); the first admin comes from the
backend's CLI (the seed creates one — see the root README).

| Piece | Does |
|---|---|
| `auth/session.ts` | Holds the tokens in memory; parks the refresh token in sessionStorage across a reload — for seconds, not across a closed tab |
| `api/client.ts` | Sends `Authorization: Bearer`; on a 401, exchanges the refresh token once and retries. Signs out when the server *refuses* the refresh (any 4xx but 408/429) — not when it is unreachable, unless that has lasted too long to try the token again safely |
| `auth/AuthProvider.tsx` | Who is signed in; restores the session on reload; clears the query cache on sign-out |
| `auth/RequireAuth.tsx` | Redirects to `/login`, remembering the page — except after the sign-out button, when the next person may be someone else |

The console is one app for both roles. A recruiter sees every job, the pipeline and the
candidate list. A candidate sees published jobs, applies as themselves, and follows and
withdraws their own applications under *My applications*. The role only decides what is
**shown**; the server decides what is **allowed**, and refuses the rest.

**Where the refresh token lives.** In memory while the tab is open. On `pagehide` it is
parked in sessionStorage with the time, and the next page load takes it back out and
deletes it — so a reload keeps you signed in. Only if it was parked in the last 10
seconds, though: `pagehide` fires on tab close too, and a browser restoring closed tabs
(Ctrl+Shift+T, "continue where you left off") brings sessionStorage back with them — on
a shared computer, to the next person. A page restored from the back/forward cache, which
only an open tab has, may take a token parked up to 30 minutes ago. The care is about two tabs: each refresh token works
once; the server refuses a second use, and after a few seconds treats it as theft and
ends every session the user has.
localStorage is shared by every tab, so tabs would race to use one token; and "Duplicate
tab" copies sessionStorage — which is why the token is never left there while a tab is
open. A duplicated tab starts signed out instead of racing the original. So does a tab
the browser discards to save memory — it gets no `pagehide` to park the token in.

If a refresh gets no answer (a deploy, a network blip), the console tries again after 1
and 3 seconds — inside the server's 10-second grace window, so if the unanswered attempt
did rotate the token, the retry is merely refused rather than taken for theft. If there
is still no answer, it says so and offers a retry instead of the sign-in form: usually
the token is still good. Once 8 seconds have passed since the first unanswered attempt,
the token is never presented automatically again — a later 401 (a poll, say) signs the
tab out locally instead, and so does sign-out skip ending it on the server. Only the
person's own "Try again" may present it once more. Every answer is applied
compare-and-set: if the session moved on meanwhile (a password change stored a new
pair, or a sign-out), the answer about the old token changes nothing, and a pair issued
for a token nobody holds any more is ended at once. A page restored from the back/forward cache re-establishes its
session from the parked token, with an empty cache — it may belong to someone else.

The cost: a script injected into the page could read the token. React escapes
everything it renders and this app never sets raw HTML, which is the defence today; an
httpOnly cookie, which no script can read, is the upgrade path.

**Why the refresh is single-flight.** Several queries can find the access token expired
at the same moment. If each refreshed on its own, the second would present a refresh
token the first had just used — and the server would refuse it, or a few seconds later
end every session as stolen. They share one exchange instead.

## Not built

No server-side sorting: the API orders by newest first, so table sorting is client-side
over the loaded page and the UI says so ("latest 100"). No push updates: the console
polls the few things that change on their own (see above).
