import { useEffect, useState } from "react";

import { IconButton } from "./Button";

export interface CopyButtonProps {
  value: string;
  /** What is copied, for the accessible name: "email" → "Copy email". */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

type CopyStatus = "idle" | "copied" | "failed";

/**
 * Copies a value to the clipboard and shows a check for a moment. The outcome is
 * announced from a status region next to the button: a live region reads out changes
 * to its text, not to a button's label, so the name stays "Copy …" throughout.
 */
export function CopyButton({ value, label = "to clipboard", size = "sm", className }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      // No clipboard access (plain HTTP, a denied permission): say so rather than
      // leave the click looking like it worked.
      setStatus("failed");
    }
  }

  return (
    <>
      <IconButton
        icon={status === "copied" ? "check" : "copy"}
        size={size}
        aria-label={`Copy ${label}`}
        className={className}
        onClick={() => void copy()}
      />
      {/* Always mounted, so the region exists before its text changes and is announced. */}
      <span role="status" className="sr-only">
        {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : ""}
      </span>
    </>
  );
}
