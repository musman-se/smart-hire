import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { STAGE_NOTE_MAX_LENGTH, type ApplicationStage } from "../../api/types";
import { Button, ErrorNotice, Field, Icon, Modal, StagePill, Textarea, cx, humanize } from "../ui";
import { moveLabel } from "./model";

/** One click for the reasons recruiters give most; they can still write their own. */
const REJECTION_REASONS = [
  "Not enough relevant experience",
  "Missing key skills",
  "Stronger candidates further along",
  "Role filled",
  "Did not respond",
] as const;

/** Appends a reason as its own sentence, after whatever is already written. */
function addReason(note: string, reason: string): string {
  const written = note.trimEnd();
  if (!written) return reason;
  return `${written}${/[.!?]$/.test(written) ? " " : ". "}${reason}`;
}

/** Takes a reason back out, closing the gap it leaves between the sentences around it. */
function removeReason(note: string, reason: string): string {
  const at = note.indexOf(reason);
  const before = note.slice(0, at).replace(/[\s,;]+$/, "");
  const after = note.slice(at + reason.length).replace(/^[\s.,;]+/, "");
  if (!before || !after) return before || after;
  return `${before}${/[.!?]$/.test(before) ? " " : ". "}${after}`;
}

export interface StageChangeRequest {
  applicationId: string;
  candidateName: string;
  /** Names the application on screens that span jobs, where the name alone is ambiguous. */
  jobTitle?: string;
  from: ApplicationStage;
  to: ApplicationStage;
}

export interface StageChangeDialogProps {
  request: StageChangeRequest;
  /** Lets the recruiter change the destination here, starting from `request.to`. A
   * drop on the board has already chosen it, so the board leaves this out. */
  targets?: readonly ApplicationStage[];
  /** The move is in flight: callers that wait for the server keep the dialog open. */
  pending?: boolean;
  /** Why the server refused, for callers that keep the dialog open to show it. */
  error?: unknown;
  onCancel: () => void;
  onConfirm: (note: string, stage: ApplicationStage) => void;
}

/**
 * The pause between "drop" and "done": a stage change is visible to the candidate and
 * cannot be undone, so it is confirmed, with room to record why. A rejection asks for
 * its reason more firmly — the next recruiter to open the file will want it — but does
 * not insist.
 *
 * Render it keyed by the request, so every request starts with an empty note.
 */
export function StageChangeDialog({
  request,
  targets,
  pending = false,
  error,
  onCancel,
  onConfirm,
}: StageChangeDialogProps) {
  const [stage, setStage] = useState<ApplicationStage>(request.to);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();

  const rejecting = stage === "rejected";
  const missingReason = rejecting && note.trim() === "";
  const subject = request.jobTitle ? `their application for ${request.jobTitle}` : "the application";

  /** A chip adds its reason to the note, or takes it back out, then hands the caret to
   * the note so the recruiter can go on to add detail. */
  function toggleReason(reason: string) {
    const next = note.includes(reason) ? removeReason(note, reason) : addReason(note, reason);
    flushSync(() => setNote(next.slice(0, STAGE_NOTE_MAX_LENGTH)));
    const field = noteRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    onConfirm(note.trim(), stage);
  }

  return (
    <Modal
      onClose={onCancel}
      size="sm"
      initialFocus={noteRef}
      // A stray click outside must not throw away a reason already written.
      closeOnBackdrop={note.trim() === "" && !pending}
      title={rejecting ? `Reject ${request.candidateName}?` : `${moveLabel(stage)}?`}
      description={
        rejecting
          ? `They will see that ${subject} is not going ahead. This cannot be undone.`
          : `${request.candidateName} will see the new stage on their applications page.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant={rejecting ? "danger" : "primary"} loading={pending}>
            {rejecting ? (missingReason ? "Reject without a reason" : "Reject") : moveLabel(stage)}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit}>
        {targets && targets.length > 1 ? (
          <fieldset className="apps-move-options">
            <legend className="apps-move-legend">
              From <StagePill stage={request.from} /> to
            </legend>
            {targets.map((target) => (
              <label
                key={target}
                className={cx("apps-move-option", target === "rejected" && "apps-move-option-danger")}
              >
                <input
                  type="radio"
                  name={`${formId}-stage`}
                  value={target}
                  checked={stage === target}
                  onChange={() => setStage(target)}
                />
                <Icon name={target === "rejected" ? "x-circle" : "arrow-right"} />
                <span>{humanize(target)}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          // A div's aria-label is ignored; the arrow's meaning is spelled out instead.
          <div className="pipeline-transition">
            <span className="sr-only">Moving from </span>
            <StagePill stage={request.from} />
            <Icon name="arrow-right" />
            <span className="sr-only"> to </span>
            <StagePill stage={stage} />
          </div>
        )}

        <Field
          label={rejecting ? "Reason" : "Note"}
          optional={!rejecting}
          hint="Kept in the stage history for your team. Candidates never see notes."
        >
          <Textarea
            ref={noteRef}
            rows={3}
            value={note}
            maxLength={STAGE_NOTE_MAX_LENGTH}
            showCount={note.length > STAGE_NOTE_MAX_LENGTH * 0.8}
            placeholder={rejecting ? "Why is this application not going ahead?" : "Anything the team should know"}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              // A textarea swallows Enter; mod+Enter is the familiar "send".
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
            }}
          />
        </Field>

        {rejecting && (
          <div className="pipeline-reasons" role="group" aria-label="Common reasons">
            {REJECTION_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className="pipeline-reason"
                aria-pressed={note.includes(reason)}
                onClick={() => toggleReason(reason)}
              >
                {reason}
              </button>
            ))}
          </div>
        )}

        <ErrorNotice error={error} />
      </form>
    </Modal>
  );
}
