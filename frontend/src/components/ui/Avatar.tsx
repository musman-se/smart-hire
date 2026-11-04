import type { CSSProperties } from "react";

import { cx } from "../../lib/cx";
import { initials } from "../../lib/format";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/** A stable hue per name, so the same person is the same colour on every screen. */
export function avatarHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export interface AvatarProps {
  /** A person's name, or an email when there is no name. */
  name: string;
  size?: AvatarSize;
  /** Tooltip; defaults to the name. */
  title?: string;
  className?: string;
}

/** Initials on a colour derived from the name — the API has no profile photos. */
export function Avatar({ name, size = "md", title, className }: AvatarProps) {
  return (
    <span
      className={cx("avatar", `avatar-${size}`, className)}
      style={{ "--avatar-hue": avatarHue(name) } as CSSProperties}
      title={title ?? name}
      role="img"
      aria-label={name}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}

export interface AvatarGroupProps {
  names: readonly string[];
  /** How many avatars before "+N". */
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({ names, max = 4, size = "sm", className }: AvatarGroupProps) {
  const shown = names.slice(0, max);
  const rest = names.slice(max);
  return (
    <span className={cx("avatar-group", className)}>
      {shown.map((name, index) => (
        <Avatar key={`${name}-${index}`} name={name} size={size} />
      ))}
      {rest.length > 0 && (
        <span
          className={cx("avatar", `avatar-${size}`, "avatar-group-more")}
          title={rest.join(", ")}
          role="img"
          aria-label={`${rest.length} more`}
        >
          <span aria-hidden="true">+{rest.length}</span>
        </span>
      )}
    </span>
  );
}
