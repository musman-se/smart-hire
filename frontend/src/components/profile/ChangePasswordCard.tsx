import { useRef, useState, type FormEvent, type RefObject } from "react";

import { ApiError } from "../../api/client";
import type { User } from "../../api/types";
import { useChangePassword } from "../../hooks/queries";
import {
  PASSWORD_CHANGE_ORDER,
  validatePasswordChange,
  type PasswordChangeField,
} from "../auth/password";
import { PasswordInput } from "../auth/PasswordInput";
import { PasswordStrength } from "../auth/PasswordStrength";
import { useTouched } from "../auth/useTouched";
import { firstInvalid, visibleErrors } from "../auth/validation";
import { Button, Card, CardHeader, ErrorNotice, Field, useToast } from "../ui";

const EMPTY: Record<PasswordChangeField, string> = { current: "", next: "", confirm: "" };

const isWrongCurrentPassword = (error: unknown) =>
  error instanceof ApiError && error.code === "invalid_current_password";

/** Mounted afresh each time the card opens, so a cancelled attempt leaves nothing behind. */
function ChangePasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast();
  const change = useChangePassword();
  const [values, setValues] = useState(EMPTY);
  const { touched, touch, touchOnBlur } = useTouched<PasswordChangeField>();

  const refs: Record<PasswordChangeField, RefObject<HTMLInputElement | null>> = {
    current: useRef<HTMLInputElement>(null),
    next: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  const errors = validatePasswordChange(values);
  const shown = visibleErrors(errors, touched);
  const wrongCurrent = isWrongCurrentPassword(change.error);

  function update(field: PasswordChangeField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // A retyped current password is a new attempt: the old refusal no longer applies.
    if (field === "current" && change.error) change.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    touch(PASSWORD_CHANGE_ORDER);
    const invalid = firstInvalid(PASSWORD_CHANGE_ORDER, errors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }
    try {
      await change.mutateAsync({ current: values.current, next: values.next });
      toast.success("Password changed", {
        description: "You were signed out everywhere else. This device stays signed in.",
      });
      onClose();
    } catch (caught) {
      if (isWrongCurrentPassword(caught)) {
        refs.current.current?.select();
        refs.current.current?.focus();
      }
    }
  }

  return (
    <form
      className="profile-password-form"
      onSubmit={submit}
      noValidate
      aria-busy={change.isPending || undefined}
    >
      {/* For password managers: the account these passwords belong to. */}
      <input type="text" hidden readOnly autoComplete="username" value={user.email} />

      <Field
        label="Current password"
        error={shown.current ?? (wrongCurrent ? "That is not your current password" : undefined)}
        required
      >
        <PasswordInput
          ref={refs.current}
          autoComplete="current-password"
          autoFocus
          value={values.current}
          onChange={(event) => update("current", event.target.value)}
          onBlur={touchOnBlur("current")}
        />
      </Field>

      <div className="auth-password-field">
        <Field label="New password" error={shown.next} required>
          <PasswordInput
            ref={refs.next}
            autoComplete="new-password"
            value={values.next}
            onChange={(event) => update("next", event.target.value)}
            onBlur={touchOnBlur("next")}
          />
        </Field>
        <PasswordStrength password={values.next} context={{ email: user.email }} />
      </div>

      <Field label="Confirm new password" error={shown.confirm} required>
        <PasswordInput
          ref={refs.confirm}
          autoComplete="new-password"
          value={values.confirm}
          onChange={(event) => update("confirm", event.target.value)}
          onBlur={touchOnBlur("confirm")}
        />
      </Field>

      {/* A wrong current password is shown on its field; anything else is a fault. */}
      {!wrongCurrent && <ErrorNotice error={change.error} />}

      <div className="profile-password-actions">
        <Button variant="ghost" onClick={onClose} disabled={change.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={change.isPending}>
          Update password
        </Button>
      </div>
    </form>
  );
}

/**
 * Change the password while signed in. Every session ends, on every device; this tab
 * carries on with the new pair the API returns (see useChangePassword). Resetting a
 * forgotten password needs an email channel, which the API does not have yet.
 */
export function ChangePasswordCard({ user }: { user: User }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Password"
        icon="shield"
        description={
          open
            ? "Changing it signs you out on every other device."
            : "Change the password you sign in with."
        }
        actions={
          !open && (
            <Button size="sm" leftIcon="lock" onClick={() => setOpen(true)}>
              Change password
            </Button>
          )
        }
      />
      {open && <ChangePasswordForm user={user} onClose={() => setOpen(false)} />}
    </Card>
  );
}
