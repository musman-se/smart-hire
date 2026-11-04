import { createContext, useContext, useId, type ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Icon } from "./Icon";

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  label: ReactNode;
  /** Help text under the control. Hidden while there is an error, which replaces it. */
  hint?: ReactNode;
  /** An error message. Marks the control aria-invalid and describes it, so it is read
   * when the control is focused. Not a live region: on submit every invalid field would
   * interrupt at once, so forms move focus to the first error instead. */
  error?: ReactNode;
  required?: boolean;
  /** Shows "(optional)" after the label — for forms where most fields are required. */
  optional?: boolean;
  /** Right side of the label row: a character count, a "Forgot password?" link. */
  labelAside?: ReactNode;
  /** The control's id; generated when omitted. */
  id?: string;
  className?: string;
  /** One control: Input, Textarea, Select, TagInput, SearchInput — they wire
   * themselves to this field. A custom control can call useFieldControl(). */
  children: ReactNode;
}

/**
 * Label, control, hint and error, wired together: the label points at the control, the
 * control is described by the hint or error, and the error marks it invalid. The
 * control picks all of that up from context — there are no ids to pass by hand.
 *
 *   <Field label="Title" required error={errors.title}>
 *     <Input value={title} onChange={…} />
 *   </Field>
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optional,
  labelAside,
  id,
  className,
  children,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const invalid = Boolean(error);
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid, required }}>
      <div className={cx("field", className)}>
        <div className="field-label-row">
          <label className="field-label" htmlFor={controlId}>
            {label}
            {required && (
              <span className="field-required" aria-hidden="true">
                *
              </span>
            )}
            {optional && <span className="field-optional">(optional)</span>}
          </label>
          {labelAside && <span className="field-counter">{labelAside}</span>}
        </div>
        {children}
        {invalid ? (
          <span className="field-error" id={errorId}>
            <Icon name="alert-circle" size={12} />
            {error}
          </span>
        ) : (
          hint && (
            <span className="field-hint" id={hintId}>
              {hint}
            </span>
          )
        )}
      </div>
    </FieldContext.Provider>
  );
}

interface ControlAria {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
}

/**
 * The id and aria attributes a control inside <Field> should carry. Props the caller
 * set explicitly win; described-by ids are merged. Outside a Field it returns the
 * props unchanged, so every control also works on its own.
 */
export function useFieldControl<P extends ControlAria>(props: P): P {
  const field = useContext(FieldContext);
  if (!field) return props;
  const describedBy =
    [field.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return {
    ...props,
    id: props.id ?? field.id,
    required: props.required ?? (field.required || undefined),
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}
