import { apiClient } from "~/lib/api-client";
import type { AuthOrganization, PaginatedResponse, User } from "~/types/api";

// ─── Types mirroring the NestJS AdminController responses ──────────────────

export interface AdminUserListItem {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    deletedAt: string | null;
    isSuperAdmin: boolean;
    organizationCount: number;
}

export interface AdminUserMembership {
    organizationId: string;
    orgName: string;
    orgSlug: string;
    orgType: "PERSONAL" | "ORGANIZATION";
    role: "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
    isActive: boolean;
}

export interface AdminUserDetail {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    isSuperAdmin: boolean;
    memberships: AdminUserMembership[];
}

export interface ImpersonationResponse {
    accessToken: string;
    refreshToken: string;
    user: User;
    organizations: AuthOrganization[];
    currentOrganization: AuthOrganization | null;
    impersonatedBy: string;
}

export interface StopImpersonationResponse {
    accessToken: string;
    refreshToken: string;
    user: User;
    organizations: AuthOrganization[];
    currentOrganization: AuthOrganization | null;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Super-admin-only API surface. Every endpoint 403s unless the caller's JWT
 * carries `isSuperAdmin: true` (or an active `impersonatedBy` claim — used only
 * by `stopImpersonating`).
 */
export const adminService = {
    listUsers: (params: { page?: number; limit?: number; search?: string }) =>
        apiClient
            .get<PaginatedResponse<AdminUserListItem>>("/admin/users", { params })
            .then((r) => r.data),

    getUser: (userId: string) =>
        apiClient.get<AdminUserDetail>(`/admin/users/${userId}`).then((r) => r.data),

    impersonate: (userId: string, orgId?: string) =>
        apiClient
            .post<ImpersonationResponse>(`/admin/users/${userId}/impersonate`, { orgId })
            .then((r) => r.data),

    stopImpersonating: () =>
        apiClient
            .post<StopImpersonationResponse>("/admin/stop-impersonating", {})
            .then((r) => r.data),

    softDelete: (userId: string) =>
        apiClient.patch<{ ok: true }>(`/admin/users/${userId}/soft-delete`, {}).then((r) => r.data),

    reactivate: (userId: string) =>
        apiClient.patch<{ ok: true }>(`/admin/users/${userId}/reactivate`, {}).then((r) => r.data),

    forceVerifyEmail: (userId: string) =>
        apiClient
            .post<{ ok: true }>(`/admin/users/${userId}/force-verify-email`, {})
            .then((r) => r.data),

    forceLogout: (userId: string) =>
        apiClient.post<{ ok: true }>(`/admin/users/${userId}/force-logout`, {}).then((r) => r.data),
};
