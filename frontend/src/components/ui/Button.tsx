import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";

import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonLookProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon name, or any element (an Avatar, a Spinner). */
  leftIcon?: IconName | ReactElement;
  rightIcon?: IconName | ReactElement;
  /** Full width. */
  block?: boolean;
}

/** The class list for a button look — for the rare element that must look like a
 * button but cannot be <Button> or <ButtonLink>. */
export function buttonClassName({
  variant = "secondary",
  size = "md",
  block = false,
}: Pick<ButtonLookProps, "variant" | "size" | "block"> = {}): string {
  return cx("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, block && "btn-block");
}

function renderIcon(icon: IconName | ReactElement | undefined, size: ButtonSize): ReactNode {
  if (icon === undefined) return null;
  return typeof icon === "string" ? <Icon name={icon} size={size === "lg" ? 18 : size === "sm" ? 14 : 16} /> : icon;
}

export type ButtonProps = ButtonLookProps &
  ComponentPropsWithRef<"button"> & {
    /** Blocks the button and shows a spinner in place of its content, keeping its
     * width so the layout does not jump. It stays focusable and keeps its name. */
    loading?: boolean;
  };

/**
 * The app's button. `type` defaults to "button": a <button> inside a form submits it
 * unless told otherwise, which is how stray Cancel buttons end up saving forms.
 * Forms opt in with type="submit".
 */
export function Button({
  variant,
  size = "md",
  leftIcon,
  rightIcon,
  block,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClassName({ variant, size, block }), className)}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      onClick={(event) => {
        // A busy button is not natively disabled: disabling the focused element drops
        // keyboard focus to <body>. So clicks, and the implicit submit of a form, are
        // blocked here instead.
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {renderIcon(leftIcon, size)}
      {children !== undefined && children !== null && <span>{children}</span>}
      {renderIcon(rightIcon, size)}
      {loading && (
        <span className="btn-spinner">
          <Spinner size="sm" label="" />
        </span>
      )}
    </button>
  );
}

export type ButtonLinkProps = ButtonLookProps & ComponentPropsWithRef<typeof Link>;

/** A router link that looks like a button — navigation stays a link (middle-click,
 * "open in new tab"), not a button that calls navigate(). */
export function ButtonLink({
  variant,
  size = "md",
  leftIcon,
  rightIcon,
  block,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cx(buttonClassName({ variant, size, block }), className)} {...rest}>
      {renderIcon(leftIcon, size)}
      {children !== undefined && children !== null && <span>{children}</span>}
      {renderIcon(rightIcon, size)}
    </Link>
  );
}

export type IconButtonProps = Omit<ComponentPropsWithRef<"button">, "children"> & {
  icon: IconName;
  /** Required: an icon alone says nothing to a screen reader. */
  "aria-label": string;
  variant?: "ghost" | "secondary" | "danger";
  size?: ButtonSize;
};

/** A square, icon-only button. Pair with <Tooltip> when the icon is not self-evident. */
export function IconButton({
  icon,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "icon-btn",
        variant !== "ghost" && `icon-btn-${variant}`,
        size !== "md" && `icon-btn-${size}`,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === "lg" ? 20 : size === "sm" ? 14 : 16} />
    </button>
  );
}
