import { useId, useRef, useState, type FormEvent, type RefObject } from "react";

import { ApiError } from "../../api/client";
import type { RecruiterInvited } from "../../api/types";
import { useInviteRecruiter } from "../../hooks/useTeam";
import { useTouched } from "../auth/useTouched";
import { codePointLength, firstInvalid, visibleErrors } from "../auth/validation";
import { Button, ErrorNotice, Field, Input, Modal } from "../ui";
import {
  EMPTY_INVITE,
  INVITE_FIELDS,
  TEAM_LIMITS,
  serverFieldError,
  toInvitePayload,
  validateInvite,
  type InviteDraft,
  type InviteField,
} from "./team";

const isDuplicateEmail = (error: unknown) =>
  error instanceof ApiError && error.code === "duplicate_email";

/**
 * Adds a recruiter. There is no password to set here: the answer carries an
 * invitation, which the page shows next, and the recruiter chooses their own password
 * through it. Mounted afresh each time it opens, so a cancelled form leaves nothing.
 */
export function AddRecruiterDialog({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: (result: RecruiterInvited) => void;
}) {
  const invite = useInviteRecruiter();
  const formId = useId();
  const [draft, setDraft] = useState<InviteDraft>(EMPTY_INVITE);
  const { touched, touch, touchOnBlur } = useTouched<InviteField>();

  const refs: Record<InviteField, RefObject<HTMLInputElement | null>> = {
    full_name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    title: useRef<HTMLInputElement>(null),
  };

  const errors = validateInvite(draft);
  const shown = visibleErrors(errors, touched);
  // What the server refused, on the field it refused — until that field is edited,
  // which resets the mutation.
  const fromServer = serverFieldError(invite.error);
  const duplicate = isDuplicateEmail(invite.error);
  const fieldError = (field: InviteField) =>
    shown[field] ??
    (fromServer?.field === field ? fromServer.message : undefined) ??
    (field === "email" && duplicate ? "This email already has a SmartHire account" : undefined);
  const dirty = Object.values(draft).some((value) => value.trim() !== "");

  function update(field: InviteField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (invite.error) invite.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invite.isPending) return;
    touch(INVITE_FIELDS);
    const invalid = firstInvalid(INVITE_FIELDS, errors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }
    try {
      onInvited(await invite.mutateAsync(toInvitePayload(draft)));
    } catch (caught) {
      const field = isDuplicateEmail(caught) ? "email" : serverFieldError(caught)?.field;
      if (field) {
        refs[field].current?.select();
        refs[field].current?.focus();
      }
    }
  }

  return (
    <Modal
      onClose={onClose}
      // A stray Escape, X or click outside must not throw away what was typed, or close
      // the form under a request in flight. Cancel still does.
      dismissible={!dirty && !invite.isPending}
      initialFocus={refs.full_name}
      title="Add a recruiter"
      description="They get an invitation link to choose their own password. You send it to them."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" leftIcon="user-plus" loading={invite.isPending}>
            Add recruiter
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="form-grid"
        onSubmit={submit}
        noValidate
        aria-busy={invite.isPending || undefined}
      >
        <Field label="Full name" error={fieldError("full_name")} required>
          <Input
            ref={refs.full_name}
            autoComplete="off"
            value={draft.full_name}
            onChange={(event) => update("full_name", event.target.value)}
            onBlur={touchOnBlur("full_name")}
            placeholder="Sara Khan"
          />
        </Field>
        <Field
          label="Work email"
          error={fieldError("email")}
          hint="They will sign in with it."
          required
        >
          <Input
            ref={refs.email}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={draft.email}
            onChange={(event) => update("email", event.target.value)}
            onBlur={touchOnBlur("email")}
            placeholder="sara@yourcompany.com"
          />
        </Field>
        <Field
          label="Job title"
          error={fieldError("title")}
          labelAside={`${codePointLength(draft.title.trim())} / ${TEAM_LIMITS.titleMax}`}
          optional
        >
          <Input
            ref={refs.title}
            autoComplete="off"
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            onBlur={touchOnBlur("title")}
            placeholder="Talent Partner"
          />
        </Field>
        {/* Field-level refusals are shown on their field; anything else is a fault. */}
        {!duplicate && !fromServer && <ErrorNotice error={invite.error} />}
      </form>
    </Modal>
  );
}
