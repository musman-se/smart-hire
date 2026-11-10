# SmartHire UI foundation

The shared layer every page is built on: design tokens, the component library, hooks,
helpers and the app shell. **Feature teams read this; they do not edit it** (see
[File ownership](#file-ownership)).

```ts
import { Button, DataTable, PageHeader, formatRelative } from "../components/ui"; // always the barrel
```

---

## File ownership

Feature teams own **only the files assigned to them** (their pages, their CSS file in
`src/styles/pages/`, and any new files they create under their own page folder or
a new `src/hooks/<feature>.ts`). Everything below is **shared and read-only** to
feature teams. If a primitive is missing or wrong, build a local component inside your
own page file/folder and report the gap — do not edit a shared file.

| Shared, read-only | What |
|---|---|
| `src/styles/{tokens,base,layout,components,index}.css` | Design system |
| `src/components/ui/**` | Component library (this folder) |
| `src/components/{Layout,navigation,RouteErrorPage}.tsx/ts` | Shell |
| `src/lib/**` | `format.ts`, `match.ts`, `hotkeys.ts`, `cx.ts`, `refs.ts` |
| `src/hooks/{queries,useUrlState,useDebouncedValue,useDocumentTitle,useHotkeys,useMediaQuery,useLocalStorage,useNow,useTheme,useIdempotencyKey}.ts(x)` | Hooks |
| `src/api/**`, `src/auth/**`, `src/router.tsx`, `src/main.tsx` | Data, auth, routing |

New query hooks go in **your own file** (e.g. `src/hooks/pipeline.ts`), built on
`keys` and the `*Api` objects; add keys there by composing existing prefixes
(`[...keys.applications, "mine", …]`) so prefix invalidation still reaches them.

---

## CSS conventions

* **Every colour, size, radius, shadow, z-index and duration is a token** from
  `src/styles/tokens.css`. Never write a hex value or a raw px spacing in page CSS.
* Write page CSS **only in your file** under `src/styles/pages/` — it is already
  imported by `styles/index.css` (after the components, so you can refine them).
  Prefix classes with your area: `.pipeline-column`, `.dashboard-funnel`.
* Theme: `<html data-theme="light|dark">`. Semantic tokens switch per theme, so use
  `--color-*` tokens and both themes work for free. Never style by theme yourself.
* Motion: use `--duration-*` and `--ease-*`; reduced motion collapses them globally.

| Page CSS file | Intended for |
|---|---|
| `styles/pages/auth.css` | LoginPage, RegisterPage, InvitePage |
| `styles/pages/dashboard.css` | recruiter/DashboardPage, recruiter/ApplicationsPage |
| `styles/pages/jobs.css` | JobsPage, recruiter/JobEditorPage |
| `styles/pages/job-detail.css` | JobDetailPage |
| `styles/pages/pipeline.css` | recruiter/PipelinePage |
| `styles/pages/candidate.css` | candidate/HomePage, candidate/MyApplicationsPage, ProfilePage |
| `styles/pages/candidates.css` | CandidatesPage, CandidateDetailPage |
| `styles/pages/palette.css` | CommandPalette, ShortcutsDialog |
| `styles/pages/team.css` | admin/TeamPage and its dialogs (`components/team/`) |

### Tokens (summary)

| Group | Tokens |
|---|---|
| Surfaces | `--color-bg` (page), `--color-surface` (cards), `--color-surface-raised` (menus, dialogs), `--color-surface-sunken` (wells, tracks), `--color-surface-hover`, `--color-surface-active`, `--color-overlay` (backdrops), `--color-sidebar` |
| Borders | `--color-border`, `--color-border-subtle`, `--color-border-strong` |
| Text | `--color-text`, `--color-text-muted`, `--color-text-subtle` (still AA), `--color-text-disabled`, `--color-text-inverse` |
| Accent | `--color-accent` (solid fill), `--color-accent-hover`, `--color-accent-fg` (text on accent), `--color-accent-soft`, `--color-accent-soft-hover`, `--color-accent-text`, `--color-accent-border` |
| Semantic | `--color-{success,warning,danger,info}` (+ `-soft`, `-text`, `-border`); `--color-danger-solid`, `--color-danger-solid-hover`, `--color-danger-fg`; `--color-violet-{soft,text}`, `--color-cyan-{soft,text}`, `--color-neutral-{soft,text}` |
| Stages | `--stage-{applied,screening,interview,offer,hired,rejected,withdrawn}-{fg,bg}` |
| Job status | `--status-{draft,processing,published,publish_failed,closed}-{fg,bg}` |
| Scores | `--score-high`, `--score-mid`, `--score-low` |
| Focus | `--color-focus`, `--focus-ring`, `--focus-ring-inset`, `--color-selection` |
| Type | `--font-sans`, `--font-mono`; `--text-{2xs,xs,sm,base,md,lg,xl,2xl,3xl,4xl}` (11–36px, body = base 14px); `--leading-{tight,snug,normal}`; `--weight-{regular,medium,semibold,bold}`; `--tracking-{tight,wide}` |
| Spacing (4px grid) | `--space-{0,px,0-5,1,1-5,2,2-5,3,4,5,6,8,10,12,16,20}` (2,4,6,8,10,12,16,20,24,32,40,48,64,80px) |
| Radius | `--radius-{xs,sm,md,lg,xl,full}` (4,6,8,12,16,999) |
| Controls | `--control-{sm,md,lg}` heights (28/36/44px) |
| Elevation | `--shadow-{xs,sm,md,lg,xl}` |
| Z-index | `--z-{base,raised,sticky,sidebar,topbar,dropdown,drawer,modal,popover,toast,tooltip}` (popover: menus, which can open from inside a dialog) |
| Motion | `--duration-{fast,base,slow}`, `--ease-{out,in-out,spring}` |
| Layout | `--sidebar-width`, `--sidebar-width-collapsed`, `--topbar-height`, `--content-max` |
| Primitives | `--gray-{0…950}`, `--teal-{50…950}`, plus green/amber/red/blue/violet/cyan — only for decoration where no semantic token fits |

### Utility and layout classes

`.stack` / `.stack-sm` (column gap 16/8) · `.row` / `.row-wrap` / `.row-between` ·
`.spacer` (margin-left auto) · `.button-row` · `.grid-2` (1.4fr/1fr, stacks < 900px) ·
`.grid-sidebar` (main + 20rem rail, stacks < 1100px) · `.grid-cards` (auto-fill 17rem
cards) · `.kpi-grid` · `.section` / `.section-title` · `.form-grid` / `.form-row` /
`.form-actions` · `.detail-list` (dl) · `.muted` `.subtle` `.mono` `.tabular`
`.text-xs` `.text-sm` `.truncate` `.prewrap` `.sr-only` · `.meta-item` (icon + text in a
PageHeader meta row) · `.tag-list` / `.tag` / `.tag.match` / `.tag.missing` ·
`.listbox` / `.listbox-option` (combobox popups) · `.mini-head` (a small uppercase
label over a block in a drawer or card) · `.standalone-page` / `.standalone-card` (a
centred screen outside the shell, for session and route errors).

Keyframes available: `fade-in`, `pop-in`, `slide-in-right`, `spin`, `pulse`, `shimmer`.

---

## Components

All are typed, themed and keyboard-accessible. `ComponentPropsWithRef<"x">` means every
native prop of that element (including `ref`, React 19 style) is accepted too.

### Foundations

| Export | Props | Example |
|---|---|---|
| `Icon` | `{ name: IconName; size?: number = 16; label?: string; strokeWidth? } & SVGProps` — decorative unless `label` | `<Icon name="briefcase" />` |
| `ICON_NAMES`, `IconName` | all names (see below) | |
| `Button` | `{ variant?: "primary"\|"secondary"\|"ghost"\|"danger"\|"link" = "secondary"; size?: "sm"\|"md"\|"lg"; loading?; leftIcon?/rightIcon?: IconName \| ReactElement; block? } & ComponentPropsWithRef<"button">` — `type` defaults to `"button"` | `<Button variant="primary" leftIcon="plus" loading={m.isPending}>New job</Button>` |
| `ButtonLink` | same look props `& ComponentPropsWithRef<typeof Link>` (router link) | `<ButtonLink to="/jobs/new" variant="primary">Create</ButtonLink>` |
| `IconButton` | `{ icon: IconName; "aria-label": string (required); variant?: "ghost"\|"secondary"\|"danger"; size? } & button props` | `<IconButton icon="trash" variant="danger" aria-label="Delete job" />` |
| `buttonClassName` | `({ variant?, size?, block? }) => string` | |
| `Card` / `Panel` | `{ padding?: "md"\|"none"; interactive? } & ComponentPropsWithRef<"div">` | `<Card padding="none">…</Card>` |
| `CardHeader` | `{ title; description?; actions?; icon?: IconName; as?: "h2"\|"h3" }` | `<CardHeader title="Applicants" actions={<Badge>12</Badge>} />` |
| `Badge` | `{ tone?: "neutral"\|"accent"\|"success"\|"warning"\|"danger"\|"info"\|"violet"; dot?; icon?; size?: "sm"\|"md"; variant?: "soft"\|"outline"; title?; children }` | `<Badge tone="success" dot>Open</Badge>` |
| `StatusPill` | `{ status: JobStatus }` — "Publish failed", colour from tokens | `<StatusPill status={job.status} />` |
| `StagePill` | `{ stage: ApplicationStage }` | `<StagePill stage="interview" />` |
| `Tags` | `{ items: readonly string[]; highlight?: readonly string[] (case-insensitive); max?: number }` → "+N" | `<Tags items={job.required_skills ?? []} highlight={me.skills} max={4} />` |
| `Avatar` | `{ name: string; size?: "xs"\|"sm"\|"md"\|"lg"\|"xl"; title? }` — initials + stable hue | `<Avatar name={c.full_name} size="lg" />` |
| `AvatarGroup` | `{ names: readonly string[]; max?: 4; size? }` | |
| `Kbd` | `{ children }` | `<Kbd>Esc</Kbd>` |
| `Shortcut` | `{ combo: string }` — same syntax as `useHotkeys` | `<Shortcut combo="mod+k" />` |

**Icon names:** `home dashboard menu sidebar kanban list grid layers briefcase user users
user-plus user-check user-x building award target inbox file-text clipboard bookmark
archive search plus minus edit trash check x copy filter sliders sort sort-asc sort-desc
refresh upload download send save link external-link log-out log-in play chevron-down
chevron-up chevron-left chevron-right chevrons-up-down chevrons-left chevrons-right
arrow-left arrow-right arrow-up arrow-down arrow-up-right more-horizontal more-vertical
calendar clock map-pin globe mail phone message-square bell info help-circle
alert-triangle alert-circle check-circle x-circle circle star sparkles zap activity
trending-up trending-down bar-chart pie-chart flag eye eye-off lock shield settings sun
moon monitor keyboard command`

### Feedback

| Export | Props | Example |
|---|---|---|
| `Notice` | `{ tone?: "info"\|"success"\|"warning"\|"rule"\|"error"; title?; children?; action? }` (error/rule are `role="alert"`) | `<Notice tone="info" title="Heads up">…</Notice>` |
| `ErrorNotice` | `{ error: unknown }` — nothing when falsy; ApiError → `RULE_COPY` title (rules amber, failures red) | `<ErrorNotice error={mutation.error} />` |
| `RULE_COPY` | `Record<code, { title; rule }>` | |
| `describeError` | `(error: unknown) => { title; message; rule }` | |
| `EmptyState` | `{ icon?: IconName = "inbox"; title; description?; action?; compact? }` | `<EmptyState icon="briefcase" title="No jobs yet" action={<ButtonLink …/>} />` |
| `Spinner` | `{ size?: "sm"\|"md"\|"lg"; label?: string = "Loading" ("" = decorative) }` | |
| `PageLoader` | `{ label? }` centred spinner | |
| `Skeleton` | `{ width?; height?; circle?; style? }` | `<Skeleton width="8rem" />` |
| `SkeletonText` | `{ lines?: 3 }` | |
| `SkeletonRows` | `{ rows?: 5; columns?: 4 }` — `<tr>`s for a tbody | |
| `SkeletonTable` | `{ rows?; columns? }` | |
| `PageSkeleton` | — (the lazy-route fallback) | |
| `ProgressBar` | `{ value; max?: 100; label: string; valueText?; tone?: "accent"\|"success"\|"warning"\|"danger"\|"info"; size?: "sm"\|"md" }` | `<ProgressBar value={active} max={MAX_ACTIVE_APPLICATIONS} label="Active applications" valueText={`${active} of 10`} />` |
| `ToastProvider` / `useToast()` | → `{ success(title, opts?), error(messageOrError, opts?), info(title, opts?), promise(promise, { loading, success, error? }), dismiss(id) }`; opts `{ description?; action?: { label; onClick }; duration?: ms (0 = sticky) }`. `error(caughtError)` uses RULE_COPY. `promise` returns the same promise. | `toast.success("Job published", { action: { label: "View", onClick } })` |
| `ErrorBoundary` | `{ children; fallback?: (error, reset) => ReactNode; onReset? }` | |
| `ErrorFallback` | `{ error?; onRetry?; title? }` | |

### Forms

Put one control inside `<Field>` and it is wired automatically (id, `htmlFor`,
`aria-describedby`, `aria-invalid`, `required`). Custom controls call `useFieldControl(props)`.

| Export | Props | Example |
|---|---|---|
| `Field` | `{ label; hint?; error?; required?; optional?; labelAside? (e.g. a counter/link); id?; children }` | `<Field label="Title" required error={err}><Input value={t} onChange={…} /></Field>` |
| `useFieldControl` | `<P>(props: P) => P` merges Field wiring | |
| `Input` | `{ size?: "sm"\|"md"\|"lg" } & ComponentPropsWithRef<"input">` | |
| `Textarea` | `{ showCount?: boolean } & ComponentPropsWithRef<"textarea">` (count needs controlled `value`; shows `n / maxLength`) | `<Textarea value={v} maxLength={2000} showCount />` |
| `Select` | `{ options?: {value,label,disabled?}[]; placeholder?: string (empty option); size? } & select props` | `<Select value={s} onChange={…} placeholder="All statuses" options={…} />` |
| `Checkbox` | `{ label?; description?; indeterminate? } & input props` (no label → give aria-label; `className` then lands on the input) | |
| `Switch` | `{ checked; onCheckedChange(checked); label?; "aria-label"?; description?; disabled?; id? }` | |
| `SearchInput` | `{ value: string; onValueChange(v); size? } & input props` — clear button, Esc clears | `<SearchInput value={q} onValueChange={setQ} aria-label="Search jobs" />` |
| `TagInput` | `{ value: readonly string[]; onChange(tags: string[]); placeholder?; suggestions?: readonly string[]; suggest?: (q) => Promise<string[]>; maxTags?; normalize?: (t) => string (default trim); disabled?; id?; required?; "aria-label"?; "aria-describedby"?; "aria-invalid"? }` — Enter/comma add, Backspace removes, paste splits, case-insensitive dedupe, combobox listbox | `<Field label="Skills"><TagInput value={skills} onChange={setSkills} suggest={useSuggestSkills()} maxTags={20} /></Field>` |

### Navigation and structure

| Export | Props | Example |
|---|---|---|
| `PageHeader` | `{ title; description?; actions?; breadcrumbs?: BreadcrumbItem[]; meta?; leading? }` — the page's only `<h1>` | `<PageHeader title={job.title} breadcrumbs={[{label:"Jobs",to:"/jobs"},{label:job.title}]} meta={<StatusPill status={job.status} />} actions={…} />` |
| `Breadcrumbs` | `{ items: { label; to? }[] }` | |
| `Tabs<V>` | `{ items: { value: V; label; count?; icon?; disabled? }[]; value: V; onChange(v: V); "aria-label": string; id? }` — roving focus | `<Tabs aria-label="Stages" items={…} value={stage} onChange={setStage} />` |
| `TabPanel` | `{ tabsId; value; children }` (pair with `<Tabs id>`) | |
| `SegmentedControl<V>` | `{ options: { value: V; label; icon?; "aria-label"? }[]; value; onChange; "aria-label": string; size?: "sm"\|"md" }` | List / Board toggle |
| `Pagination` | `{ total; limit; offset; onChange(offset); pageSizeOptions?: number[]; onLimitChange?(limit); compact?; noun? }` | `<Pagination {...page} onChange={(offset) => setFilters({ offset })} noun="jobs" />` |
| `pageItems` | `(current, pageCount, radius = 1) => (number \| "gap")[]` | |

### Overlays

| Export | Props | Example |
|---|---|---|
| `Modal` | `{ open?: boolean = true; onClose; title; description?; size?: "sm"\|"md"\|"lg"\|"xl"; footer?; children?; closeOnBackdrop? = true; initialFocus?: RefObject }` — portal, focus trap/restore, Esc, scroll lock | `<Modal open={o} onClose={close} title="Move stage" footer={…}>…</Modal>` |
| `Drawer` | `{ open; onClose; title; description?; size?; headerActions?; footer?; children?; initialFocus? }` — right side sheet | |
| `ConfirmProvider` / `useConfirm()` | `confirm({ title; body?; confirmLabel? = "Confirm"; cancelLabel?; tone?: "default"\|"danger" }) => Promise<boolean>` | `if (await confirm({ title: "Withdraw?", tone: "danger", confirmLabel: "Withdraw" })) …` |
| `ConfirmDialog` | controlled: `ConfirmOptions & { open; onConfirm; onCancel; busy? }` | |
| `DropdownMenu` | `{ trigger: (props: MenuTriggerProps) => ReactNode; items: MenuEntry[]; align?: "start"\|"end"; side?: "bottom"\|"top"; "aria-label"? }`. Renders in a portal (never clipped by a card or a scrolling table) and flips or nudges to stay on screen. `MenuEntry` = `{ label; icon?; onSelect?; to?; hint?; danger?; disabled?; checked? }` \| `{ type: "separator" }` \| `{ type: "label"; label }` | `<DropdownMenu align="end" items={[{label:"Edit",icon:"edit",to:`/jobs/${id}/edit`},{type:"separator"},{label:"Delete",icon:"trash",danger:true,onSelect}]} trigger={(p) => <IconButton {...p} icon="more-horizontal" aria-label="Job actions" />} />` |
| `Tooltip` | `{ content; side?: "top"\|"bottom"; children: one focusable element }` — nudged inside the viewport near an edge | `<Tooltip content="Copy link"><IconButton …/></Tooltip>` |
| `useOverlay` | `(ref, { open; onClose; initialFocus?; lockScroll? = true })` — for custom modal surfaces | |
| `focusableWithin`, `rovingIndex(key, current, count, orientation)`, `focusItem(container, value)` | low-level helpers for composite widgets | |

### Data display

| Export | Props | Example |
|---|---|---|
| `DataTable<T>` | `{ columns: Column<T>[]; rows: T[] \| undefined; getRowId(row); loading?; skeletonRows? = 5; empty?: ReactNode; error?: unknown; onRetry?() (a failed first load shows "Couldn't load this list" instead of `empty`); onRowClick?(row); initialSort?: { key; direction: "asc"\|"desc" }; sort?/onSortChange? (controlled); selectable?; selectedIds?: ReadonlySet<string>; onSelectionChange?(ids: Set<string>); getRowLabel?(row); caption?; maxHeight? (sticky header scroll); rowClassName?(row) }`. `Column<T>` = `{ key; header; cell(row, i); sortValue?(row) (makes it sortable); sortable?; width?; align?: "left"\|"center"\|"right"; className? }`. Sort cycles asc → desc → off; **client-side over the loaded rows only**. Row click ignores clicks on inner links/buttons; rows are focusable + Enter. | see `DataTable.test.tsx` |
| `compareValues` | `(a, b, direction = "asc")` — numeric/natural compare; empty values last in either direction | |
| `KpiCard` / `Stat` | `{ label; value; icon?; delta?: { value; trend: "up"\|"down"\|"flat"; goodWhen?: "up"\|"down"; label? }; hint?; loading?; to? (whole card links) }` | `<KpiCard label="Open roles" value={counts.published} icon="briefcase" to="/jobs?status=published" />` |
| `ScoreRing` | `{ score: number \| null \| undefined; size? = 40; strokeWidth? = 4; hideLabel? }` — null = "pending" | `<ScoreRing score={a.match_score} />` |
| `scoreBand` | `(score) => "high"(≥75) \| "mid"(≥50) \| "low" \| "pending"` | |
| `StageStepper` | `{ stage: ApplicationStage; stoppedAt?: ApplicationStage \| null; compact? }`. `stoppedAt(history)` (also exported) works out where a rejected or withdrawn application stopped | `<StageStepper stage={a.stage} stoppedAt={stoppedAt(history)} />` |
| `Timeline` | `{ items: { id?; icon?: IconName; tone?: "neutral"\|"accent"\|"success"\|"warning"\|"danger"\|"info"; title; meta?; body? }[]; "aria-label"? }` | |
| `CopyButton` | `{ value: string; label? ("email" → "Copy email"); size? }` | |

### Helpers (also exported from the barrel)

| Export | Signature |
|---|---|
| `formatDate` | `(value: string \| number \| Date \| null \| undefined) => string` — "Mar 4, 2026", "—" when empty |
| `formatDateTime` | same → "Mar 4, 2026, 14:05" |
| `formatRelative` | `(value, now = Date.now()) => string` — "just now", "5m ago", "3h ago", "6d ago", "in 2h", then the date after 7 days |
| `humanize` | `(value) => string` — "full_time" → "Full time" |
| `pluralize` | `(count, singular, plural = singular + "s") => string` — "3 jobs" |
| `initials` | `(name) => string` — "Ayesha Khan" → "AK", emails use the local part |
| `formatPercent` | `(ratio 0–1, fractionDigits = 0) => string` — "76%" |
| `formatNumber` | `(n) => string` — locale grouping |
| `formatYears` | `(n) => string` — "1 year", "4 years" |
| `greeting` | `(hour) => string` — "Good morning" / "Good afternoon" (from noon) / "Good evening" (from six) |
| `skillMatch` (`lib/match.ts`) | `(candidateSkills, jobSkills) => { matched: string[]; missing: string[]; ratio: number }` — case-insensitive; no job skills → ratio 1 |
| `eligibility` | `(candidate: {years_experience, skills}, job: {min_experience_years, required_skills}) => { eligible; reasons: string[]; match: SkillMatch }` — mirrors the server rule (years ≥ min AND ≥1 skill overlap when the job lists skills); a preview only |
| `cx` | `(...parts) => string` class joiner |
| `assignRef` (`lib/refs.ts`) | `(ref, node)` |
| `parseCombo`, `matchesChord`, `formatCombo`, `isMac` (`lib/hotkeys.ts`) | combo parsing/formatting |

Constants in `src/api/types.ts`: `JOB_STATUSES`, `APPLICATION_STAGES`, `PIPELINE_STAGES`
(applied→hired), `TERMINAL_STAGES`, `NEXT_STAGES`, `EMPLOYMENT_TYPES`,
`MAX_ACTIVE_APPLICATIONS` (10, the backend default cap on non-terminal applications).

---

## Hooks

| Hook | Signature | Notes |
|---|---|---|
| `useDebouncedValue` | `<T>(value: T, delay = 250) => T` | debounce the query, not the input |
| `useUrlState` | `<S>(schema: S, { resetOnChange?: keyof S }) => [state, setState(patch \| (cur) => patch, { history? })]` | Schema from `urlParam.string(def?, {history?})`, `.number(def?, {min,max,history?})`, `.optionalNumber({history?})`, `.boolean(def?)`, `.oneOf(values, def?)`, `.list(def?)`. Defaults are omitted from the URL; free text **replaces** the history entry, every other type **pushes** one (so Back steps through tabs and pages), and `setState(patch, { history: "replace" })` overrides for corrections the user did not make; unknown params preserved; several updates in one tick compose into one entry. Define the schema at module level. |
| `useDocumentTitle` | `(title?: string \| null) => void` | "Jobs · SmartHire" |
| `useHotkeys` | `(hotkeys: { combo; handler(e); allowInInputs? }[], { enabled? = true })` | `"mod+k"`, `"shift+n"`, `"?"`, `"g j"` (sequence ≤1s). Ignored while typing unless `allowInInputs`. The shell already binds mod+k, ?, [, and g-sequences — don't rebind those. |
| `useMediaQuery` | `(query: string) => boolean` | |
| `useLocalStorage` | `<T>(key, initial) => [value, setValue]` | UI preferences only; every user of a key stays in step (this tab and others); storage failures degrade to memory |
| `useNow` | `(intervalMs: number \| null = 30_000) => number` | the clock, re-read on an interval, for age labels ("waiting 3d"); null pauses it |
| `ThemeProvider` / `useTheme` | `() => { preference: "light"\|"dark"\|"system"; resolved: "light"\|"dark"; setPreference; toggle }` | |
| `useIdempotencyKey` | `(input) => { key; settle(error) }` | use for job create and apply |

### Query hooks (`src/hooks/queries.ts`)

`keys` is the single source of query keys:

```ts
keys.jobs                         // ["jobs"]                  — prefix for everything job-related
keys.jobList(filters)             // ["jobs","list",filters]
keys.job(id)                      // ["jobs","detail",id]
keys.publication(id, status)      // ["jobs","publication",id,status]
keys.content(id, processedAt)     // ["jobs","content",id,processedAt]
keys.jobStatusCount(status)       // ["jobs","count",status]
keys.candidates                   // ["candidates"]
keys.candidateList(filters)       // ["candidates","list",filters]
keys.candidate(id)                // ["candidates","detail",id]
keys.applications                 // ["applications"]          — prefix; every application mutation invalidates it
keys.applicationList(filters)     // ["applications","list",filters]
keys.application(id)              // ["applications","detail",id]
keys.stageCount(stage, jobId?)    // ["applications","count",stage,jobId|null]
keys.jobApplications(jobId)       // ["applications","job",jobId]
keys.candidateApplications(id)    // ["applications","candidate",id]
keys.history(applicationId)       // ["applications","history",id]
keys.notifications(applicationId) // ["applications","notifications",id]
keys.skills(search)               // ["skills", search lower-cased]
keys.readiness                    // ["health","ready"]
```

| Hook | Returns / notes |
|---|---|
| `useJobs(filters: JobFilters, { enabled? })` | `Page<Job>`; keeps previous page while loading |
| `useJob(id)` | polls every 1s while `processing` |
| `useJobPublication(id, status)`, `useJobContent(id, processedAt)` | recruiter only |
| `useCreateJob()` | `mutate({ payload, idempotencyKey })` |
| `useUpdateJob(id)`, `useJobTransition(id)` (`"publish"\|"close"\|"reopen"`), `useDeleteJob()` | |
| `useJobStatusCounts({ enabled? })` | `{ counts: Record<JobStatus, number\|undefined>; total; isLoading; isError }` — recruiter only |
| `useJobsByIds(ids)` | `{ byId: Map<string, Job>; isLoading }` — shares cache with `useJob`; ids a candidate cannot read are absent |
| `useCandidates(filters)`, `useCandidate(id, { enabled? })` | |
| `useCandidatesByIds(ids)` | `{ byId: Map<string, Candidate>; isLoading }` — recruiter only |
| `useUpdateCandidate(id)` | `mutate(payload: CandidateUpdate)`; writes the result into the cache |
| `useApplications(filters: ApplicationFilters, { enabled? })` | `Page<Application>`; candidates get only their own |
| `useApplication(id)` | |
| `useStageCounts({ jobId?, enabled? })` | `{ counts: Record<ApplicationStage, number\|undefined>; total; isLoading; isError }` |
| `useJobApplications(jobId)` | latest 100 for a job; polls while fresh ones await a score |
| `useCandidateApplications(candidateId)` | latest 100; the recruiter's view. Candidates use `useMyApplications()` |
| `useApplyToJob(jobId)` | `mutate({ payload: { cover_letter }, idempotencyKey })` |
| `useAdvanceStage()` | `mutate({ id, stage, note? })` |
| `useWithdrawApplication()` | `mutate(id)` |
| `useApplicationHistory(id, enabled)`, `useApplicationNotifications(id, enabled)` | |
| `useProcessApplication()` | `mutate(id)` re-runs scoring |
| `useSuggestSkills()` | stable `(q) => Promise<string[]>` cached per prefix — pass to `TagInput suggest` |
| `suggestSkills(q)` | uncached plain function |
| `useSkillSuggestions(q)` | query form |
| `useReadiness()` | health, polls 15s |

---

## Routes

| Path | Page file → export | Access |
|---|---|---|
| `/login` | `pages/LoginPage.tsx` → `LoginPage` | public |
| `/register` | `pages/RegisterPage.tsx` → `RegisterPage` | public |
| `/` | redirect: recruiter → `/dashboard`, candidate → `/home` | |
| `/dashboard` | `pages/recruiter/DashboardPage.tsx` → `DashboardPage` | recruiter (candidate → /home) |
| `/home` | `pages/candidate/HomePage.tsx` → `CandidateHomePage` | candidate (recruiter → /dashboard) |
| `/jobs` | `pages/JobsPage.tsx` → `JobsPage` | both, role-aware |
| `/jobs/new` | `pages/recruiter/JobEditorPage.tsx` → `JobEditorPage` | recruiter |
| `/jobs/:jobId` | `pages/JobDetailPage.tsx` → `JobDetailPage` | both, role-aware |
| `/jobs/:jobId/edit` | `pages/recruiter/JobEditorPage.tsx` → `JobEditorPage` | recruiter |
| `/jobs/:jobId/pipeline` | `pages/recruiter/PipelinePage.tsx` → `PipelinePage` | recruiter |
| `/candidates` | `pages/CandidatesPage.tsx` → `CandidatesPage` | recruiter |
| `/candidates/:candidateId` | `pages/CandidateDetailPage.tsx` → `CandidateDetailPage` | recruiter (candidate → /applications) |
| `/applications` | recruiter: `pages/recruiter/ApplicationsPage.tsx` → `ApplicationsPage`; candidate: `pages/candidate/MyApplicationsPage.tsx` → `MyApplicationsPage` | both |
| `/profile` | `pages/ProfilePage.tsx` → `ProfilePage` | both |
| `*` | `pages/NotFoundPage.tsx` → `NotFoundPage` | |

Keep each page's **named export** exactly as listed (the router lazy-loads by name).
Pages render inside the shell's `<main>`, Suspense (`PageSkeleton`) and a per-path
`ErrorBoundary`; start each page with `<PageHeader>` and `useDocumentTitle(...)`.
`RequireRole`, `RoleSwitch`, `RoleHome` live in `src/auth/RequireRole.tsx`;
`NAV_ITEMS`, `GLOBAL_SHORTCUTS`, `ROLE_HOME` in `src/components/navigation.ts`.

## Testing

`npm test` (Vitest + Testing Library, jsdom). Put tests next to the file:
`Thing.test.tsx`. Import `describe/it/expect` from `vitest` (no globals);
`@testing-library/jest-dom` matchers are loaded by `src/test/setup.ts`.
