import { ButtonLink, Card, CardHeader, Icon, type IconName } from "../ui";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "edit",
    title: "Write the job",
    body: "Title, description, required skills and minimum experience — those decide who is eligible.",
  },
  {
    icon: "send",
    title: "Publish it",
    body: "Publishing runs in the background and takes a few seconds. Candidates see it once it is live.",
  },
  {
    icon: "kanban",
    title: "Work the pipeline",
    body: "Every application is scored against the job. Move the best through screening, interview and offer.",
  },
];

/** A brand-new workspace has no numbers to show, so it shows the way to the first one. */
export function GettingStarted() {
  return (
    <Card className="dashboard-card dashboard-onboarding">
      <CardHeader
        icon="sparkles"
        title="Post your first job"
        description="Three steps from an empty workspace to a ranked shortlist."
        actions={
          <ButtonLink to="/jobs/new" variant="primary" leftIcon="plus">
            Create a job
          </ButtonLink>
        }
      />
      <ol className="dashboard-steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="dashboard-step">
            <span className="dashboard-step-icon" aria-hidden="true">
              <Icon name={step.icon} size={18} />
            </span>
            <div>
              <p className="dashboard-step-title">
                <span className="subtle">{index + 1}. </span>
                {step.title}
              </p>
              <p className="dashboard-step-body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
