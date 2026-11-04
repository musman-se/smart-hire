import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";

export type CardProps = ComponentPropsWithRef<"div"> & {
  /** "none" for edge-to-edge content (a table); pair with a CardHeader for the title. */
  padding?: "md" | "none";
  /** Hover lift, for cards that are themselves a link or button target. */
  interactive?: boolean;
};

/** The basic surface: a bordered, rounded box on the page background. */
export function Card({ padding = "md", interactive, className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        "card",
        padding === "none" && "card-flush",
        interactive && "card-interactive",
        className,
      )}
      {...rest}
    />
  );
}

/** Same component under the name the original pages used. */
export const Panel = Card;

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, a menu, a count — right-aligned. */
  actions?: ReactNode;
  icon?: IconName;
  /** Heading level: h2 by default, h3 for a card nested under a section heading. */
  as?: "h2" | "h3";
  className?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  as: Heading = "h2",
  className,
}: CardHeaderProps) {
  return (
    <div className={cx("card-header", className)}>
      {icon && <Icon name={icon} size={18} className="subtle" />}
      <div className="card-header-text">
        <Heading className="card-title">{title}</Heading>
        {description && <p className="card-description">{description}</p>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}
