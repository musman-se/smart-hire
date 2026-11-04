import type { User } from "../api/types";
import { useUser } from "../auth/AuthProvider";
import { AccountCard } from "../components/profile/AccountCard";
import { AppearanceSettings } from "../components/profile/AppearanceSettings";
import { ProfileEditor } from "../components/profile/ProfileEditor";
import {
  Avatar,
  Card,
  CardHeader,
  ErrorNotice,
  PageHeader,
  Shortcut,
  SkeletonText,
} from "../components/ui";
import { useCandidate } from "../hooks/queries";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

function CandidateProfile({ user }: { user: User }) {
  const candidate = useCandidate(user.id);
  const name = candidate.data?.full_name ?? user.email;

  return (
    <>
      <PageHeader
        title="Your profile"
        description="This is what hiring teams see when you apply. Keep it current to be matched to more roles."
        leading={<Avatar name={name} size="lg" />}
      />
      <ErrorNotice error={candidate.error} />
      {candidate.isLoading ? (
        <div className="profile-layout" aria-busy="true">
          <Card className="profile-main">
            <SkeletonText lines={8} />
          </Card>
          <Card className="profile-rail">
            <SkeletonText lines={5} />
          </Card>
        </div>
      ) : (
        candidate.data && <ProfileEditor candidate={candidate.data} />
      )}
      <section className="profile-settings" aria-label="Account and preferences">
        <AccountCard user={user} />
        <AppearanceSettings />
      </section>
    </>
  );
}

function RecruiterProfile({ user }: { user: User }) {
  return (
    <>
      <PageHeader
        title="Your account"
        description="Sign-in details and how SmartHire looks for you."
        leading={<Avatar name={user.email} size="lg" />}
      />
      <div className="profile-settings">
        <AccountCard user={user} />
        <AppearanceSettings />
        <Card>
          <CardHeader title="Work faster" icon="keyboard" description="Most of SmartHire is a keystroke away." />
          <ul className="profile-tips">
            <li>
              <Shortcut combo="mod+k" /> Search jobs, candidates and pages
            </li>
            <li>
              <Shortcut combo="g d" /> Jump to the dashboard
            </li>
            <li>
              <Shortcut combo="?" /> See every shortcut
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}

/** A candidate edits their profile here; a recruiter sees their account. Both get the
 * appearance settings. */
export function ProfilePage() {
  const user = useUser();
  useDocumentTitle("Profile");
  return user.role === "candidate" ? <CandidateProfile user={user} /> : <RecruiterProfile user={user} />;
}
