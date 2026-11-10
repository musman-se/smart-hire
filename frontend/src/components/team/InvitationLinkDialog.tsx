import { useEffect, useRef, useState } from "react";

import type { InvitationIssued } from "../../api/types";
import { Button, Input, Modal, Notice, formatDateTime } from "../ui";
import { invitationLink } from "./team";

export interface IssuedInvitation {
  name: string;
  email: string;
  invitation: InvitationIssued;
  /** "added": a new recruiter. "renewed": a new link for someone already invited. */
  reason: "added" | "renewed";
}

/**
 * The one time an invitation link is shown. The server keeps only a hash of the
 * token, so once this dialog closes nobody can show the link again — only issue a new
 * one, which retires this one. That is why it says so, and why copying is one click.
 */
export function InvitationLinkDialog({ issued, onClose }: { issued: IssuedInvitation; onClose: () => void }) {
  const link = invitationLink(issued.invitation.token);
  const copyRef = useRef<HTMLButtonElement>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copy !== "copied") return;
    const timer = window.setTimeout(() => setCopy("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copy]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      // Plain HTTP or a denied permission: the box is still there to select by hand.
      setCopy("failed");
    }
  }

  return (
    <Modal
      onClose={onClose}
      // Only Done closes it: a stray Escape, X or click outside must not lose a link the
      // server will never show again.
      dismissible={false}
      initialFocus={copyRef}
      title={issued.reason === "added" ? `${issued.name} is on the team` : `New invitation link for ${issued.name}`}
      description={
        issued.reason === "renewed" ? "Any link sent to them before has stopped working." : undefined
      }
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="team-link">
        <p>
          Send this link to {issued.name} at <strong>{issued.email}</strong> — by Slack, email or
          however your team talks. They open it, choose a password, and they are in.
        </p>

        <div className="team-link-row">
          <Input
            readOnly
            value={link}
            aria-label="Invitation link"
            className="team-link-input mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            ref={copyRef}
            variant="primary"
            leftIcon={copy === "copied" ? "check" : "copy"}
            onClick={() => void copyLink()}
          >
            {copy === "copied" ? "Copied" : "Copy link"}
          </Button>
        </div>
        {/* Always mounted, so the region exists before its text changes and is announced. */}
        <span role="status" className="sr-only">
          {copy === "copied" ? "Link copied" : ""}
        </span>
        {copy === "failed" && (
          <Notice tone="warning">Your browser blocked the clipboard. Select the link and copy it yourself.</Notice>
        )}

        <p className="team-link-meta">
          It works once, until{" "}
          <time dateTime={issued.invitation.expires_at}>{formatDateTime(issued.invitation.expires_at)}</time>.
          This is the only time it is shown: if it is lost, issue a new one from the team list.
        </p>
      </div>
    </Modal>
  );
}
