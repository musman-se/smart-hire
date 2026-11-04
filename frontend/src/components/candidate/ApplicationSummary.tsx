import type { Application } from "../../api/types";
import { KpiCard, pluralize } from "../ui";
import { capState, isActive } from "./applications";

interface ApplicationSummaryProps {
  applications: readonly Application[];
  loading: boolean;
}

/** The three numbers a candidate checks first: how many are live (against the cap),
 * how many reached interviews, and whether there is an offer on the table. */
export function ApplicationSummary({ applications, loading }: ApplicationSummaryProps) {
  const cap = capState(applications.filter(isActive).length);
  const interviewing = applications.filter((a) => a.stage === "interview").length;
  const offers = applications.filter((a) => a.stage === "offer").length;
  const hired = applications.some((a) => a.stage === "hired");

  return (
    <div className="kpi-grid candidate-kpis">
      <KpiCard
        label="Active applications"
        icon="send"
        loading={loading}
        to="/applications"
        value={
          <>
            {cap.used}
            <span className="candidate-kpi-of"> / {cap.max}</span>
          </>
        }
        hint={
          cap.level === "full"
            ? "At the limit. Withdraw one to apply again."
            : `${pluralize(cap.remaining, "slot")} left to apply with`
        }
      />
      <KpiCard
        label="Interviewing"
        icon="message-square"
        loading={loading}
        to="/applications"
        value={interviewing}
        hint={interviewing > 0 ? "Watch your inbox for scheduling" : "Nothing at this stage yet"}
      />
      <KpiCard
        label="Offers"
        icon="award"
        loading={loading}
        to="/applications"
        value={offers}
        hint={
          offers > 0
            ? "Congratulations! Check your email"
            : hired
              ? "You've been hired. Nice work!"
              : "Offers show up here"
        }
      />
    </div>
  );
}
