import { useState, type FormEvent } from "react";

import type { RecruiterProfile } from "../../api/types";
import { useRecruiterProfile, useUpdateRecruiterProfile } from "../../hooks/queries";
import { useTouched } from "../auth/useTouched";
import { codePointLength, firstInvalid, visibleErrors } from "../auth/validation";
import { Button, Card, CardHeader, ErrorNotice, Field, Input, SkeletonText, useToast } from "../ui";
import {
  RECRUITER_LIMITS,
  RECRUITER_PROFILE_ORDER,
  recruiterProfileChanges,
  validateRecruiterProfile,
  valuesFromProfile,
  type RecruiterProfileField,
} from "./recruiterProfile";

const fieldId = (field: RecruiterProfileField) => `recruiter-profile-${field}`;

/** Keyed by the saved profile's updated_at, so a save (or a change from another tab)
 * starts the form again from what the server holds. */
function RecruiterProfileForm({ profile }: { profile: RecruiterProfile }) {
  const toast = useToast();
  const update = useUpdateRecruiterProfile();
  const [values, setValues] = useState(() => valuesFromProfile(profile));
  const { touched, touch, touchOnBlur } = useTouched<RecruiterProfileField>();

  const errors = validateRecruiterProfile(values);
  const shown = visibleErrors(errors, touched);
  const changes = recruiterProfileChanges(profile, values);
  const dirty = Object.keys(changes).length > 0;

  function set(field: RecruiterProfileField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (update.error) update.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    touch(RECRUITER_PROFILE_ORDER);
    const invalid = firstInvalid(RECRUITER_PROFILE_ORDER, errors);
    if (invalid) {
      document.getElementById(fieldId(invalid))?.focus();
      return;
    }
    if (!dirty) return;
    try {
      await update.mutateAsync(changes);
      toast.success("Profile saved");
    } catch {
      // Shown under the form.
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-busy={update.isPending || undefined}>
      <Field label="Full name" id={fieldId("full_name")} error={shown.full_name} required>
        <Input
          autoComplete="name"
          value={values.full_name}
          onChange={(event) => set("full_name", event.target.value)}
          onBlur={touchOnBlur("full_name")}
        />
      </Field>
      <Field
        label="Title"
        id={fieldId("title")}
        error={shown.title}
        optional
        hint="What you do on the team, like Senior Recruiter."
        labelAside={`${codePointLength(values.title.trim())} / ${RECRUITER_LIMITS.titleMax}`}
      >
        <Input
          autoComplete="organization-title"
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          onBlur={touchOnBlur("title")}
          placeholder="Talent Partner"
        />
      </Field>
      <ErrorNotice error={update.error} />
      <div className="button-row">
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

/** The name and title a recruiter goes by — the dashboard greets them with it. */
export function RecruiterProfileCard() {
  const profile = useRecruiterProfile();

  return (
    <Card>
      <CardHeader title="Profile" icon="user" description="Your name and title, as your team sees them." />
      {profile.data ? (
        <RecruiterProfileForm key={profile.data.updated_at} profile={profile.data} />
      ) : profile.error ? (
        <ErrorNotice error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <SkeletonText lines={4} />
      )}
    </Card>
  );
}
