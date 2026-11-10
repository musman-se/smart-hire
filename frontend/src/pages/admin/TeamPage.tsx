import { useState } from "react";

import type { StaffMember } from "../../api/types";
import { useUser } from "../../auth/AuthProvider";
import { AddRecruiterDialog } from "../../components/team/AddRecruiterDialog";
import { InvitationLinkDialog, type IssuedInvitation } from "../../components/team/InvitationLinkDialog";
import { describeStatus } from "../../components/team/team";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CopyButton,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  formatDate,
  formatRelative,
  humanize,
  pluralize,
  useConfirm,
  useToast,
  type Column,
} from "../../components/ui";
import { useClampOffset } from "../../hooks/useClampOffset";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useNow } from "../../hooks/useNow";
import { useReissueInvitation, useStaffAccess, useTeam } from "../../hooks/useTeam";
import { urlParam, useUrlState } from "../../hooks/useUrlState";

const PAGE_SIZES = [25, 50, 100] as const;

const FILTERS = {
  offset: urlParam.number(0, { min: 0 }),
  limit: urlParam.number(PAGE_SIZES[0], { min: 1, max: 100 }),
};

/**
 * The hiring team, for admins: who has an account, who is still to accept their
 * invitation, and who has left. Adding someone creates the account at once; they
 * choose their password through the link the admin sends them.
 */
export function TeamPage() {
  useDocumentTitle("Team");
  const me = useUser();
  const now = useNow();
  const [filters, setFilters] = useUrlState(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useTeam({
    limit: filters.limit,
    offset: filters.offset,
  });
  useClampOffset(data, filters.offset, filters.limit, (offset) =>
    setFilters({ offset }, { history: "replace" }),
  );

  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);

  const columns: Column<StaffMember>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (member) => member.full_name,
      cell: (member) => (
        <div className="team-person">
          <Avatar name={member.full_name} size="sm" />
          <div className="team-person-text">
            <span className="team-person-name">
              {member.full_name}
              {member.id === me.id && (
                <Badge tone="accent" size="sm">
                  You
                </Badge>
              )}
            </span>
            <span className="team-person-title truncate">{member.title || "No title"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      className: "team-col-email",
      cell: (member) => (
        <span className="team-email">
          <span className="truncate">{member.email}</span>
          <CopyButton value={member.email} label={`${member.full_name}'s email`} />
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (member) => member.role,
      cell: (member) => (
        <Badge tone={member.role === "admin" ? "accent" : "violet"} size="sm">
          {humanize(member.role)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (member) => member.status,
      cell: (member) => {
        const status = describeStatus(member, now);
        return (
          <div className="team-status">
            <Badge tone={status.tone} dot size="sm">
              {status.label}
            </Badge>
            {status.detail && (
              <span className="team-status-detail" data-urgent={status.needsLink || undefined}>
                {status.detail}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "added",
      header: "Added",
      className: "team-col-added",
      sortValue: (member) => member.created_at,
      cell: (member) => (
        <time dateTime={member.created_at} title={formatDate(member.created_at)} className="muted">
          {formatRelative(member.created_at, now)}
        </time>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (member) => (
        <MemberActions member={member} isSelf={member.id === me.id} onLinkIssued={setIssued} />
      ),
    },
  ];

  return (
    <div className="stack team-page">
      <PageHeader
        title="Team"
        description="Everyone on the hiring side. Add recruiters, send their invitation links, and switch off accounts for people who leave."
        meta={
          data && (
            <Badge tone="neutral" icon="users">
              {pluralize(data.total, "member")}
            </Badge>
          )
        }
        actions={
          <Button variant="primary" leftIcon="user-plus" onClick={() => setAdding(true)}>
            Add recruiter
          </Button>
        }
      />

      <Card padding="none">
        <DataTable
          caption="Hiring team"
          columns={columns}
          rows={data?.items}
          getRowId={(member) => member.id}
          loading={isLoading || isFetching}
          skeletonRows={6}
          error={error}
          onRetry={() => void refetch()}
          empty={
            // Never really empty — the admin is on it — but a filtered page can be.
            <EmptyState icon="users" title="Nobody here yet" description="Add a recruiter to get started." />
          }
        />
        {data && data.total > 0 && (
          <div className="team-footer">
            <Pagination
              total={data.total}
              limit={filters.limit}
              offset={filters.offset}
              onChange={(offset) => setFilters({ offset })}
              pageSizeOptions={PAGE_SIZES}
              onLimitChange={(limit) => setFilters({ limit, offset: 0 })}
              noun="members"
            />
          </div>
        )}
      </Card>

      {adding && (
        <AddRecruiterDialog
          onClose={() => setAdding(false)}
          onInvited={({ member, invitation }) => {
            setAdding(false);
            setIssued({ name: member.full_name, email: member.email, invitation, reason: "added" });
          }}
        />
      )}
      {issued && <InvitationLinkDialog issued={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

/**
 * One row's actions. Each row has its own mutations, so a pending action spins only
 * its own button. Deactivating is confirmed in an in-app dialog: it signs the person
 * out everywhere at once.
 */
function MemberActions({
  member,
  isSelf,
  onLinkIssued,
}: {
  member: StaffMember;
  isSelf: boolean;
  onLinkIssued: (issued: IssuedInvitation) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const reissue = useReissueInvitation();
  const access = useStaffAccess();
  const name = member.full_name;
  // Names each button for screen readers, where "Deactivate" alone repeats per row.
  const whom = <span className="sr-only"> {name}</span>;

  async function newLink() {
    try {
      const invitation = await reissue.mutateAsync(member.id);
      onLinkIssued({ name, email: member.email, invitation, reason: "renewed" });
    } catch (caught) {
      toast.error(caught);
    }
  }

  async function deactivate() {
    const confirmed = await confirm({
      title: `Deactivate ${name}?`,
      body: "They are signed out everywhere at once and cannot sign in until an admin reactivates them. Their jobs and hiring history stay as they are.",
      confirmLabel: "Deactivate",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await access.mutateAsync({ id: member.id, action: "deactivate" });
      toast.success(`${name} is deactivated`);
    } catch (caught) {
      toast.error(caught);
    }
  }

  async function reactivate() {
    try {
      const updated = await access.mutateAsync({ id: member.id, action: "reactivate" });
      toast.success(
        `${name} is reactivated`,
        updated.status === "invited"
          ? { description: "They never chose a password, so send them a new invite link." }
          : undefined,
      );
    } catch (caught) {
      toast.error(caught);
    }
  }

  return (
    <div className="team-actions">
      {member.status === "invited" && (
        <Button size="sm" leftIcon="link" loading={reissue.isPending} onClick={() => void newLink()}>
          New invite link{whom}
        </Button>
      )}
      {member.status === "deactivated" ? (
        <Button size="sm" leftIcon="user-check" loading={access.isPending} onClick={() => void reactivate()}>
          Reactivate{whom}
        </Button>
      ) : (
        // An admin cannot lock themself out; the server refuses it too.
        !isSelf && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon="user-x"
            loading={access.isPending}
            onClick={() => void deactivate()}
          >
            Deactivate{whom}
          </Button>
        )
      )}
    </div>
  );
}
