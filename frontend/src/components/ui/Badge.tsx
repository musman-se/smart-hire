import type { ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet";

export interface BadgeProps {
  tone?: BadgeTone;
  /** A leading dot in the text colour — reads as a status rather than a label. */
  dot?: boolean;
  icon?: IconName;
  size?: "sm" | "md";
  variant?: "soft" | "outline";
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  dot,
  icon,
  size = "md",
  variant = "soft",
  title,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "badge",
        `badge-${tone}`,
        size === "sm" && "badge-sm",
        variant === "outline" && "badge-outline",
        className,
      )}
      title={title}
    >
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}
