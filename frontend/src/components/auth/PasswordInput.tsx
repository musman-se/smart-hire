import { useId, useState, type KeyboardEvent } from "react";

import { Icon, IconButton, Input, cx, type InputProps } from "../ui";

export type PasswordInputProps = Omit<InputProps, "type">;

/**
 * A password box with a show/hide toggle and a Caps Lock warning. Inside <Field> it
 * is wired like any Input; the warning joins its description while it shows, so a
 * screen reader hears it on focus as well as when it appears.
 */
export function PasswordInput({
  onKeyDown,
  onKeyUp,
  onBlur,
  className,
  "aria-describedby": describedBy,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const capsLockId = useId();

  // Caps Lock can only be read from a key event, so the warning tracks every keystroke
  // and is dropped on blur, when the state can no longer be known.
  const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));

  return (
    <div className={cx("auth-password", className)}>
      <div className="auth-password-control">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={cx(describedBy, capsLock && capsLockId) || undefined}
          onKeyDown={(event) => {
            readCapsLock(event);
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            readCapsLock(event);
            onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setCapsLock(false);
            onBlur?.(event);
          }}
        />
        <IconButton
          className="auth-password-toggle"
          size="sm"
          icon={visible ? "eye-off" : "eye"}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
        />
      </div>
      {/* Always mounted: a live region announces changes, not its own arrival. */}
      <span id={capsLockId} className="auth-capslock" role="status">
        {capsLock && (
          <>
            <Icon name="alert-triangle" size={12} />
            Caps Lock is on
          </>
        )}
      </span>
    </div>
  );
}
