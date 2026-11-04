import { cx } from "../../lib/cx";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Announced to screen readers. Pass "" when a surrounding element already says
   * what is loading (a button with aria-busy, say). */
  label?: string;
  className?: string;
}

export function Spinner({ size = "md", label = "Loading", className }: SpinnerProps) {
  return (
    <span
      className={cx("spinner", size !== "md" && `spinner-${size}`, className)}
      role={label ? "status" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Centred spinner for a region that has nothing to show yet. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="page-loader">
      <Spinner size="lg" label={label} />
    </div>
  );
}
