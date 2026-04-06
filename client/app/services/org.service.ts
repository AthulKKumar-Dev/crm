import { apiClient } from "~/lib/api-client";
import type {
  OrgResponse,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  OrgMember,
  UpdateMemberRoleRequest,
  SendInviteRequest,
  OrgInvite,
} from "~/types/api";

/**
 * Service layer for organization, member, and invite API endpoints.
 *
 * Each method returns the unwrapped response data (the API client
 * already strips the `{ success, data }` envelope).
 */
export const orgService = {
  // ─── Organizations ───

  create: (data: CreateOrganizationRequest) =>
    apiClient.post<OrgResponse>("/organizations", data).then((response) => response.data),

  createPersonal: () =>
    apiClient.post<OrgResponse>("/organizations/personal").then((response) => response.data),

  list: () =>
    apiClient.get<OrgResponse[]>("/organizations").then((response) => response.data),

  get: (orgId: string) =>
    apiClient.get<OrgResponse>(`/organizations/${orgId}`).then((response) => response.data),

  update: (orgId: string, data: UpdateOrganizationRequest) =>
    apiClient.patch<OrgResponse>(`/organizations/${orgId}`, data).then((response) => response.data),

  delete: (orgId: string) =>
    apiClient.delete<{ message: string }>(`/organizations/${orgId}`).then((response) => response.data),

  // ─── Members ───

  listMembers: (orgId: string) =>
    apiClient.get<OrgMember[]>(`/organizations/${orgId}/members`).then((response) => response.data),

  updateMemberRole: (orgId: string, memberId: string, data: UpdateMemberRoleRequest) =>
    apiClient
      .patch<OrgMember>(`/organizations/${orgId}/members/${memberId}`, data)
      .then((response) => response.data),

  removeMember: (orgId: string, memberId: string) =>
    apiClient
      .delete<OrgMember>(`/organizations/${orgId}/members/${memberId}`)
      .then((response) => response.data),

  // ─── Invites ───

  sendInvite: (orgId: string, data: SendInviteRequest) =>
    apiClient
      .post<OrgInvite>(`/organizations/${orgId}/invites`, data)
      .then((response) => response.data),

  listInvites: (orgId: string) =>
    apiClient.get<OrgInvite[]>(`/organizations/${orgId}/invites`).then((response) => response.data),

  revokeInvite: (orgId: string, inviteId: string) =>
    apiClient
      .delete<OrgInvite>(`/organizations/${orgId}/invites/${inviteId}`)
      .then((response) => response.data),
};
