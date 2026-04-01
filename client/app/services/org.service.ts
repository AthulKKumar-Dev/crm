import { apiClient } from "~/lib/api-client";
import type { Organization, OrganizationMembership } from "~/types/api";

export interface CreateOrganizationPayload {
  name: string;
  slug?: string;
  timezone?: string;
  currency?: string;
  industry?: string;
  website?: string;
}

export const orgService = {
  createOrganization: (data: CreateOrganizationPayload) =>
    apiClient
      .post<Organization>("/organizations", data)
      .then((r) => r.data),

  createPersonal: () =>
    apiClient
      .post<Organization>("/organizations/personal")
      .then((r) => r.data),

  listOrganizations: () =>
    apiClient
      .get<OrganizationMembership[]>("/organizations")
      .then((r) => r.data),

  getOrganization: (orgId: string) =>
    apiClient
      .get<Organization>(`/organizations/${orgId}`)
      .then((r) => r.data),
};
