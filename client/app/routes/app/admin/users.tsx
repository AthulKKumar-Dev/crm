import { useNavigate } from "react-router";
import { ShieldCheck, Users } from "lucide-react";
import { useAdminUsers } from "~/hooks/use-admin-queries";
import { useListUrlState } from "~/hooks/use-list-url-state";
import { useAuthStore } from "~/stores/auth.store";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/app/empty-state";
import {
  DataTable,
  DateCell,
  NumCell,
  TextCell,
  useDataTableState,
  type ColumnDef,
} from "~/components/app/data-table";
import type { AdminUserListItem } from "~/services/admin.service";

export function meta() {
    return [{ title: "Super Admin · Users | Collabo CRM" }];
}

const COLUMNS: ColumnDef<AdminUserListItem>[] = [
  {
    key: "user",
    label: "User",
    width: 220,
    locked: true,
    cell: (u) => (
      <div className="flex min-w-0 items-center gap-2">
        <Avatar size="sm">
          <AvatarImage src={u.avatarUrl ?? ""} />
          <AvatarFallback className="bg-brand text-xs font-bold text-brand-foreground">
            {u.firstName[0]}
            {u.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <span className="truncate font-medium text-foreground">
          {u.firstName} {u.lastName}
        </span>
      </div>
    ),
  },
  {
    key: "email",
    label: "Email",
    width: 220,
    cell: (u) => <TextCell title={u.email}>{u.email}</TextCell>,
  },
  {
    key: "verified",
    label: "Verified",
    width: 100,
    cell: (u) =>
      u.emailVerified ? (
        <Badge variant="secondary">Verified</Badge>
      ) : (
        <Badge variant="outline">Pending</Badge>
      ),
  },
  {
    key: "orgs",
    label: "Orgs",
    width: 70,
    align: "right",
    cell: (u) => <NumCell value={u.organizationCount} />,
  },
  {
    key: "lastLogin",
    label: "Last login",
    width: 120,
    cell: (u) =>
      u.lastLoginAt ? <DateCell value={u.lastLoginAt} /> : <TextCell muted>Never</TextCell>,
  },
  {
    key: "joined",
    label: "Joined",
    width: 120,
    cell: (u) => <DateCell value={u.createdAt} />,
  },
  {
    key: "status",
    label: "Status",
    width: 110,
    cell: (u) =>
      u.deletedAt ? (
        <Badge variant="destructive">Deleted</Badge>
      ) : u.isSuperAdmin ? (
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Super Admin</Badge>
      ) : (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
      ),
  },
];

/**
 * Super-admin users list. Shows every registered user with search + pagination.
 * Row click → user detail page (which is where impersonation starts).
 *
 * Server-side enforcement lives in `SuperAdminGuard`; this guard is a UX
 * shortcut so non-super-admins don't see the page at all. The list itself is
 * a separate component so its hooks never run for someone the guard turns
 * away.
 */
export default function AdminUsersPage() {
    const { user, impersonatedBy } = useAuthStore();
    const navigate = useNavigate();

    if (!user?.isSuperAdmin || impersonatedBy) {
        return (
            <EmptyState
                icon={ShieldCheck}
                title="Not authorized"
                description="This area is only available to the Collabo team."
                action={<Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>}
            />
        );
    }

    return <AdminUsersList />;
}

function AdminUsersList() {
    const navigate = useNavigate();
    // Page, search and page size live in the URL so Back from a user returns
    // to the same list.
    const list = useListUrlState("admin-users");
    const table = useDataTableState({ key: "admin-users", list, columns: COLUMNS });

    const { data, isLoading, isError, isPlaceholderData, refetch } = useAdminUsers({
        page: table.page,
        limit: table.limit,
        search: table.debouncedSearch || undefined,
    });

    return (
        <div className="space-y-4">
            <header className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-amber-600" />
                <h1 className="text-2xl font-bold">All users</h1>
                {data && (
                    <span className="text-sm text-gray-500">({data.meta.total} total)</span>
                )}
            </header>

            <DataTable
                state={table}
                rows={data?.data ?? []}
                rowKey={(u) => u.id}
                meta={data?.meta}
                status={{ isLoading, isError, isPlaceholderData, refetch }}
                noun="users"
                searchPlaceholder="Search by name or email"
                onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
                emptyState={{
                    icon: Users,
                    title: "No users yet",
                    description: "Once people sign up, they'll appear here.",
                }}
            />
        </div>
    );
}
