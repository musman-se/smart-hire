import { useUser } from "../auth/AuthProvider";
import { CandidateJobBoard } from "../components/jobs/CandidateJobBoard";
import { RecruiterJobsView } from "../components/jobs/RecruiterJobsView";

/** /jobs is two different pages behind one address: recruiters manage every job,
 * candidates browse the published ones (the only ones the server gives them). */
export function JobsPage() {
  return useUser().role === "recruiter" ? <RecruiterJobsView /> : <CandidateJobBoard />;
}
