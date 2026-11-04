import { useCallback } from "react";

import { APPLICATION_STAGES, type ApplicationStage, type Job } from "../../api/types";
import { useJobApplications } from "../../hooks/queries";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { urlParam, useUrlState } from "../../hooks/useUrlState";
import { Icon, PageHeader, StatusPill, TabPanel, Tabs, type TabItem } from "../ui";
import { ApplicantsTab, type ApplicantFilterState } from "./ApplicantsTab";
import { ContentTab } from "./ContentTab";
import { JobActions } from "./JobActions";
import { JobMeta } from "./JobMeta";
import { OverviewTab } from "./OverviewTab";
import { PublishingTab } from "./PublishingTab";

const TABS = ["overview", "applicants", "publishing", "content"] as const;
type Tab = (typeof TABS)[number];

/** Tab, filters and the open applicant all live in the URL, so any view can be shared. */
const PARAMS = {
  tab: urlParam.oneOf(TABS, "overview"),
  stage: urlParam.oneOf(APPLICATION_STAGES),
  q: urlParam.string(),
  applicant: urlParam.string(),
};

const TABS_ID = "job-detail-tabs";

/** A job from the recruiter's side: its lifecycle, its applicants, and what publishing made of it. */
export function RecruiterJobView({ job }: { job: Job }) {
  const [params, setParams] = useUrlState(PARAMS);
  // The same cache entry the Applicants tab and the board read: one request for all.
  const { data: applications } = useJobApplications(job.id);

  useDocumentTitle(job.title);

  const showStage = (stage: ApplicationStage) => setParams({ tab: "applicants", stage, q: "" });
  const setOpen = useCallback((applicant: string) => setParams({ applicant }), [setParams]);

  const tabs: TabItem<Tab>[] = [
    { value: "overview", label: "Overview", icon: "layers" },
    { value: "applicants", label: "Applicants", icon: "users", count: applications?.total },
    { value: "publishing", label: "Publishing", icon: job.status === "processing" ? "refresh" : "send" },
    { value: "content", label: "Content", icon: "sparkles" },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Jobs", to: "/jobs" }, { label: job.title }]}
        leading={
          <span className="job-detail-tile" aria-hidden="true">
            <Icon name="briefcase" size={20} />
          </span>
        }
        title={job.title}
        meta={
          <>
            <StatusPill status={job.status} />
            <JobMeta job={job} audience="recruiter" />
          </>
        }
        actions={
          <JobActions
            job={job}
            applicationCount={applications?.total}
            onShowPublishing={() => setParams({ tab: "publishing" })}
          />
        }
      />

      <Tabs
        id={TABS_ID}
        aria-label="Job sections"
        items={tabs}
        value={params.tab}
        onChange={(tab) => setParams({ tab })}
        className="job-detail-tabs"
      />
      <TabPanel tabsId={TABS_ID} value={params.tab} className="job-detail-panel">
        {params.tab === "overview" && (
          <OverviewTab
            job={job}
            applications={applications?.items}
            total={applications?.total}
            onShowStage={showStage}
          />
        )}
        {params.tab === "applicants" && (
          <ApplicantsTab
            job={job}
            filters={{ stage: params.stage, q: params.q }}
            onFiltersChange={(patch: Partial<ApplicantFilterState>) => setParams(patch)}
            openId={params.applicant}
            onOpenChange={setOpen}
          />
        )}
        {params.tab === "publishing" && <PublishingTab job={job} />}
        {params.tab === "content" && <ContentTab job={job} />}
      </TabPanel>
    </>
  );
}
