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

export const orgService = {
  // ─── Organizations ───

  create: (data: CreateOrganizationRequest) =>
    apiClient.post<OrgResponse>("/organizations", data).then((r) => r.data),

  createPersonal: () =>
    apiClient.post<OrgResponse>("/organizations/personal").then((r) => r.data),

  list: () =>
    apiClient.get<OrgResponse[]>("/organizations").then((r) => r.data),

  get: (orgId: string) =>
    apiClient.get<OrgResponse>(`/organizations/${orgId}`).then((r) => r.data),

  update: (orgId: string, data: UpdateOrganizationRequest) =>
    apiClient.patch<OrgResponse>(`/organizations/${orgId}`, data).then((r) => r.data),

  delete: (orgId: string) =>
    apiClient.delete<{ message: string }>(`/organizations/${orgId}`).then((r) => r.data),

  // ─── Members ───

  listMembers: (orgId: string) =>
    apiClient.get<OrgMember[]>(`/organizations/${orgId}/members`).then((r) => r.data),

  updateMemberRole: (orgId: string, memberId: string, data: UpdateMemberRoleRequest) =>
    apiClient
      .patch<OrgMember>(`/organizations/${orgId}/members/${memberId}`, data)
      .then((r) => r.data),

  removeMember: (orgId: string, memberId: string) =>
    apiClient
      .delete<OrgMember>(`/organizations/${orgId}/members/${memberId}`)
      .then((r) => r.data),

  // ─── Invites ───

  sendInvite: (orgId: string, data: SendInviteRequest) =>
    apiClient
      .post<OrgInvite>(`/organizations/${orgId}/invites`, data)
      .then((r) => r.data),

  listInvites: (orgId: string) =>
    apiClient.get<OrgInvite[]>(`/organizations/${orgId}/invites`).then((r) => r.data),

  revokeInvite: (orgId: string, inviteId: string) =>
    apiClient
      .delete<OrgInvite>(`/organizations/${orgId}/invites/${inviteId}`)
      .then((r) => r.data),
};
