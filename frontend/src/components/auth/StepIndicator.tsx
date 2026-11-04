import { Icon } from "../ui";

export interface StepItem<S extends string> {
  id: S;
  title: string;
  description?: string;
}

export interface StepIndicatorProps<S extends string> {
  steps: readonly StepItem<S>[];
  current: S;
  /** Completed steps become buttons that go back to them. Later steps never are:
   * they are reached only through the current step's validation. */
  onSelect?: (step: S) => void;
  "aria-label": string;
}

/** "Step 1 · Account → Step 2 · Profile", with the current step marked for assistive tech. */
export function StepIndicator<S extends string>({
  steps,
  current,
  onSelect,
  "aria-label": label,
}: StepIndicatorProps<S>) {
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <ol className="auth-steps" aria-label={label}>
      {steps.map((step, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
        const body = (
          <>
            <span className="auth-step-marker" aria-hidden="true">
              {state === "done" ? <Icon name="check" size={14} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className="auth-step-text">
              <span className="auth-step-count">
                Step {index + 1} of {steps.length}
              </span>
              <span className="auth-step-title">{step.title}</span>
              {step.description && <span className="auth-step-description">{step.description}</span>}
            </span>
            {state === "done" && <span className="sr-only">(completed)</span>}
          </>
        );

        return (
          <li
            key={step.id}
            className="auth-steps-item"
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            {state === "done" && onSelect ? (
              <button type="button" className="auth-step" onClick={() => onSelect(step.id)}>
                {body}
              </button>
            ) : (
              <div className="auth-step">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
