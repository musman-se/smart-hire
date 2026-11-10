import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";

import type { Candidate } from "../../api/types";
import { useSuggestSkills, useUpdateCandidate } from "../../hooks/queries";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { ProfileChecklist } from "../candidate/ProfileChecklist";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Icon,
  Input,
  Shortcut,
  TagInput,
  useToast,
} from "../ui";
import { MIN_SKILLS, profileFieldId } from "./completeness";
import {
  FIELD_ORDER,
  LIMITS,
  isHttpUrl,
  normalizeSkill,
  previewCandidate,
  profileChanges,
  validateProfile,
  valuesFromCandidate,
  type ProfileValues,
} from "./profileForm";
import { RecruiterPreview } from "./RecruiterPreview";

type Key = keyof ProfileValues;

/** "12 / 200" beside a label, warning as the limit gets close. */
function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span data-over={value.length > max * 0.9 || undefined} className="profile-counter tabular">
      {value.length} / {max}
    </span>
  );
}

/** Arriving on /profile#skills (from a checklist item) focuses that field. */
function useFocusFromHash() {
  const { hash, key } = useLocation();
  useEffect(() => {
    const field = hash ? document.getElementById(profileFieldId(hash.slice(1))) : null;
    if (!field) return;
    // CSS's reduced-motion override does not reach a scroll started from script.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    field.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    field.focus({ preventScroll: true });
    // `key` too: clicking the same checklist item twice is a new navigation.
  }, [hash, key]);
}

/**
 * The candidate's own profile form. It sends only the fields that changed, mirrors
 * the server's limits under each field, and keeps a live preview beside it. Errors
 * show once a field has been left (or on save), not while it is first being typed.
 */
export function ProfileEditor({ candidate }: { candidate: Candidate }) {
  const toast = useToast();
  const update = useUpdateCandidate(candidate.id);
  const suggestSkills = useSuggestSkills();

  const [baseline, setBaseline] = useState(() => valuesFromCandidate(candidate));
  const [values, setValues] = useState(baseline);
  const [touched, setTouched] = useState<ReadonlySet<Key>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);

  const errors = validateProfile(values);
  const changes = profileChanges(baseline, values);
  const dirty = Object.keys(changes).length > 0;
  const preview = previewCandidate(candidate, values);

  useFocusFromHash();
  useUnsavedChangesGuard(dirty && !update.isPending, {
    body: "You've edited your profile without saving. Leave and lose those changes?",
  });

  const errorFor = (key: Key) => (submitted || touched.has(key) ? errors[key] : undefined);
  const set = <K extends Key>(key: K, value: ProfileValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const touch = (key: Key) => () => setTouched((current) => new Set(current).add(key));

  function reset(next: ProfileValues) {
    setValues(next);
    setTouched(new Set());
    setSubmitted(false);
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!dirty || update.isPending) return;
    setSubmitted(true);
    const firstInvalid = FIELD_ORDER.find((key) => errors[key]);
    if (firstInvalid) {
      document.getElementById(profileFieldId(firstInvalid))?.focus();
      return;
    }
    try {
      const saved = await update.mutateAsync(changes);
      const next = valuesFromCandidate(saved);
      setBaseline(next);
      reset(next);
      toast.success("Profile saved", {
        description: "Recruiters see the update on every application you've sent.",
      });
    } catch (error) {
      toast.error(error);
    }
  }

  // Bound even with nothing to save (save() then does nothing), so ⌘S never falls
  // through to the browser's "Save page as…".
  useHotkeys([{ combo: "mod+s", allowInInputs: true, handler: () => void save() }]);

  const resumeUrl = values.resume_url.trim();

  return (
    <form className="profile-layout" onSubmit={save} noValidate aria-label="Your profile">
      <div className="stack profile-main">
        <Card>
          <CardHeader title="About you" icon="user" description="The first things a recruiter reads." />
          <div className="form-grid">
            <Field label="Full name" required id={profileFieldId("full_name")} error={errorFor("full_name")}>
              <Input
                value={values.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                onBlur={touch("full_name")}
                autoComplete="name"
                maxLength={LIMITS.fullNameMax}
              />
            </Field>
            <Field
              label="Headline"
              optional
              id={profileFieldId("headline")}
              error={errorFor("headline")}
              hint="One line on what you do — “Data engineer who loves clean pipelines”."
              labelAside={<Counter value={values.headline} max={LIMITS.headlineMax} />}
            >
              <Input
                value={values.headline}
                onChange={(e) => set("headline", e.target.value)}
                onBlur={touch("headline")}
                maxLength={LIMITS.headlineMax}
                placeholder="e.g. Backend engineer, 5 years in fintech"
              />
            </Field>
            <div className="form-row">
              <Field
                label="Phone"
                optional
                id={profileFieldId("phone")}
                error={errorFor("phone")}
                hint="Shared only with teams you apply to."
              >
                <Input
                  type="tel"
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  onBlur={touch("phone")}
                  autoComplete="tel"
                  maxLength={LIMITS.phoneMax}
                  placeholder="+92 300 1234567"
                />
              </Field>
              <Field
                label="Years of experience"
                required
                id={profileFieldId("years_experience")}
                error={errorFor("years_experience")}
                hint="Roles with a minimum compare against this."
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LIMITS.yearsMax}
                  step={1}
                  value={values.years_experience}
                  onChange={(e) => set("years_experience", e.target.value)}
                  onBlur={touch("years_experience")}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Skills"
            icon="target"
            description="They decide which roles you can apply to: most ask for at least one match."
          />
          <Field
            label="Your skills"
            id={profileFieldId("skills")}
            error={errorFor("skills")}
            hint={
              values.skills.length < MIN_SKILLS
                ? `Add at least ${MIN_SKILLS}. Press Enter or a comma after each one.`
                : "Press Enter or a comma after each one. Suggestions come from skills roles ask for."
            }
            labelAside={<span className="tabular">{values.skills.length} / {LIMITS.skillsMax}</span>}
          >
            <TagInput
              value={values.skills}
              maxTags={LIMITS.skillsMax}
              onChange={(skills) => {
                set("skills", skills);
                touch("skills")();
              }}
              suggest={suggestSkills}
              normalize={normalizeSkill}
              placeholder={values.skills.length ? "Add another…" : "python, sql, react…"}
            />
          </Field>
        </Card>

        <Card>
          <CardHeader title="Resume" icon="file-text" description="A link recruiters can open: Drive, Dropbox, a personal site." />
          <Field
            label="Resume link"
            optional
            id={profileFieldId("resume_url")}
            error={errorFor("resume_url")}
            hint="Make sure the link is viewable by anyone who has it."
            labelAside={
              resumeUrl && isHttpUrl(resumeUrl) ? (
                <a href={resumeUrl} target="_blank" rel="noreferrer noopener" className="profile-link-check">
                  Open link
                  <Icon name="external-link" size={12} />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : undefined
            }
          >
            <Input
              type="url"
              inputMode="url"
              value={values.resume_url}
              onChange={(e) => set("resume_url", e.target.value)}
              onBlur={touch("resume_url")}
              maxLength={LIMITS.resumeUrlMax}
              placeholder="https://"
            />
          </Field>
        </Card>
      </div>

      <aside className="stack profile-rail" aria-label="Preview">
        <RecruiterPreview candidate={preview} />
        <ProfileChecklist candidate={preview} />
      </aside>

      {dirty && (
        <div className="profile-savebar" role="region" aria-label="Unsaved changes">
          <span className="profile-savebar-text">
            <Icon name="alert-circle" size={16} />
            You have unsaved changes
          </span>
          <span className="profile-savebar-shortcut">
            <Shortcut combo="mod+s" />
          </span>
          <div className="button-row">
            <Button variant="ghost" onClick={() => reset(baseline)} disabled={update.isPending}>
              Discard
            </Button>
            <Button type="submit" variant="primary" leftIcon="save" loading={update.isPending}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
