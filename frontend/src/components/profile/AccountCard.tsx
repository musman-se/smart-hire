import type { User } from "../../api/types";
import { isStaff } from "../../auth/roles";
import { Badge, Card, CardHeader, CopyButton, formatDate, formatRelative, humanize } from "../ui";

/** Sign-in identity: read-only here, since changing an email needs a verification
 * flow the API does not have yet. */
export function AccountCard({ user }: { user: User }) {
  return (
    <Card>
      <CardHeader
        title="Account"
        icon="lock"
        description="Your sign-in details. Contact support to change your email."
      />
      <dl className="detail-list profile-account">
        <dt>Email</dt>
        <dd className="profile-account-email">
          <span className="truncate">{user.email}</span>
          <CopyButton value={user.email} label="email" size="sm" />
        </dd>
        <dt>Role</dt>
        <dd>
          <Badge tone={isStaff(user.role) ? "violet" : "accent"}>{humanize(user.role)}</Badge>
        </dd>
        <dt>Member since</dt>
        <dd>
          <time dateTime={user.created_at}>{formatDate(user.created_at)}</time>{" "}
          <span className="subtle">({formatRelative(user.created_at)})</span>
        </dd>
      </dl>
    </Card>
  );
}
