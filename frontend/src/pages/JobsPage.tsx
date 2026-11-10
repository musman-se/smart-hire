import { useUser } from "../auth/AuthProvider";
import { isStaff } from "../auth/roles";
import { CandidateJobBoard } from "../components/jobs/CandidateJobBoard";
import { RecruiterJobsView } from "../components/jobs/RecruiterJobsView";

/** /jobs is two different pages behind one address: the hiring team manages every job,
 * candidates browse the published ones (the only ones the server gives them). */
export function JobsPage() {
  return isStaff(useUser().role) ? <RecruiterJobsView /> : <CandidateJobBoard />;
}
