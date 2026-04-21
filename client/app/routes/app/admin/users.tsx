import { useState } from "react";
import { useNavigate } from "react-router";
import { Search, ShieldCheck, Users } from "lucide-react";
import { useAdminUsers } from "~/hooks/use-admin-queries";
import { useAuthStore } from "~/stores/auth.store";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { EmptyState } from "~/components/app/empty-state";
import { TableSkeleton } from "~/components/app/table-skeleton";

export function meta() {
    return [{ title: "Super Admin · Users | Collabo CRM" }];
}

const PAGE_SIZE = 20;

/**
 * Super-admin users list. Shows every registered user with search + pagination.
 * Row click → user detail page (which is where impersonation starts).
 *
 * Server-side enforcement lives in `SuperAdminGuard`; this guard is a UX
 * shortcut so non-super-admins don't see the page at all.
 */
export default function AdminUsersPage() {
    const { user, impersonatedBy } = useAuthStore();
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

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

    const { data, isLoading } = useAdminUsers({ page, search });
    const items = data?.data ?? [];
    const totalPages = data?.meta.totalPages ?? 1;

    return (
        <div className="space-y-4">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-amber-600" />
                    <h1 className="text-2xl font-bold">All users</h1>
                    {data && (
                        <span className="text-sm text-gray-500">({data.meta.total} total)</span>
                    )}
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                    <Input
                        placeholder="Search by name or email"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                        className="w-80 pl-9"
                    />
                </div>
            </header>

            {isLoading ? (
                <TableSkeleton rows={PAGE_SIZE / 2} columns={7} />
            ) : items.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No users found"
                    description={
                        search
                            ? "Try a different search term."
                            : "Once people sign up, they'll appear here."
                    }
                />
            ) : (
                <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Verified</TableHead>
                                <TableHead>Orgs</TableHead>
                                <TableHead>Last login</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((u) => (
                                <TableRow
                                    key={u.id}
                                    className="cursor-pointer hover:bg-gray-50"
                                    onClick={() => navigate(`/admin/users/${u.id}`)}
                                >
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Avatar size="sm">
                                                <AvatarImage src={u.avatarUrl ?? ""} />
                                                <AvatarFallback className="bg-[#CEF17B] text-xs font-bold text-gray-900">
                                                    {u.firstName[0]}
                                                    {u.lastName[0]}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="font-medium">
                                                {u.firstName} {u.lastName}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-700">{u.email}</TableCell>
                                    <TableCell>
                                        {u.emailVerified ? (
                                            <Badge variant="secondary">Verified</Badge>
                                        ) : (
                                            <Badge variant="outline">Pending</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm">{u.organizationCount}</TableCell>
                                    <TableCell className="text-sm text-gray-600">
                                        {u.lastLoginAt
                                            ? new Date(u.lastLoginAt).toLocaleDateString()
                                            : "Never"}
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-600">
                                        {new Date(u.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        {u.deletedAt ? (
                                            <Badge variant="destructive">Deleted</Badge>
                                        ) : u.isSuperAdmin ? (
                                            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                                                Super Admin
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                                Active
                                            </Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            <footer className="flex items-center justify-between text-sm text-gray-600">
                <span>
                    Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            </footer>
        </div>
    );
}
