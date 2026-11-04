import type { ReactNode } from "react";

import { ButtonLink, Card, Icon, cx } from "../ui";
import type { Completeness } from "../profile/completeness";

interface Step {
  title: string;
  description: ReactNode;
  done: boolean;
  action: ReactNode;
}

/**
 * The first-run path for a candidate with no applications: profile, browse, apply.
 * Only step one can show as done — the card is replaced by the application summary
 * as soon as there is a first application.
 */
export function GettingStarted({ completeness }: { completeness: Completeness }) {
  const profileDone = completeness.done === completeness.total;
  const steps: Step[] = [
    {
      title: "Complete your profile",
      description: profileDone
        ? "Done. Recruiters have everything they need."
        : `${completeness.done} of ${completeness.total} done. Your skills and experience decide which roles you can apply to.`,
      done: profileDone,
      action: !profileDone && (
        <ButtonLink to="/profile" size="sm" variant="primary">
          Finish profile
        </ButtonLink>
      ),
    },
    {
      title: "Find a role you like",
      description: "Browse open roles. Each one shows how well your skills match it.",
      done: false,
      action: (
        <ButtonLink to="/jobs" size="sm" variant={profileDone ? "primary" : "secondary"}>
          Browse jobs
        </ButtonLink>
      ),
    },
    {
      title: "Apply in a minute",
      description: "A cover letter is optional. You can follow every step from here.",
      done: false,
      action: null,
    },
  ];

  return (
    <Card className="candidate-onboarding">
      <div className="candidate-onboarding-intro">
        <span className="candidate-onboarding-badge" aria-hidden="true">
          <Icon name="sparkles" size={18} />
        </span>
        <div>
          <h2 className="candidate-onboarding-title">Welcome to SmartHire</h2>
          <p className="candidate-onboarding-lead">Three steps to your first application.</p>
        </div>
      </div>
      <ol className="candidate-steps">
        {steps.map((step, index) => (
          <li key={step.title} className={cx("candidate-step", step.done && "is-done")}>
            <span className="candidate-step-marker" aria-hidden="true">
              {step.done ? <Icon name="check" size={14} strokeWidth={3} /> : index + 1}
            </span>
            <div className="candidate-step-text">
              <h3 className="candidate-step-title">
                {step.title}
                {step.done && <span className="sr-only"> (done)</span>}
              </h3>
              <p className="candidate-step-description">{step.description}</p>
            </div>
            {step.action && <div className="candidate-step-action">{step.action}</div>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
