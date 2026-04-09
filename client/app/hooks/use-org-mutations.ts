import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { orgService } from "~/services/org.service";
import { useAuthStore } from "~/stores/auth.store";
import { orgKeys } from "~/hooks/use-org-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  UpdateMemberRoleRequest,
  SendInviteRequest,
} from "~/types/api";

// ─── Organization Mutations ─────────────────────────────────────────────────

/** Mutation hook for creating a new organization. Sets it as active and navigates to dashboard. */
export function useCreateOrganizationMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg);

  return useMutation({
    mutationFn: (data: CreateOrganizationRequest) => orgService.create(data),
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.list() });
      setCurrentOrg(org.id);
      toast.success(`${org.name} created successfully!`);
      navigate("/dashboard");
    },
    onError: (error) => handleMutationError(error, "Failed to create organization."),
  });
}

/** Mutation hook for creating a personal workspace. */
export function useCreatePersonalMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg);
  const setOrganizations = useAuthStore((s) => s.setOrganizations);
  const existingOrgs = useAuthStore((s) => s.organizations);

  return useMutation({
    mutationFn: () => orgService.createPersonal(),
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.list() });

      // Add the new personal workspace to auth store so AuthGuard allows dashboard access
      const newMembership = {
        id: crypto.randomUUID(),
        organizationId: org.id,
        role: "OWNER" as const,
        isActive: true,
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          type: org.type || ("PERSONAL" as const),
          logo: org.logo || null,
          timezone: org.timezone || "UTC",
          currency: org.currency || "USD",
          industry: org.industry || null,
          website: org.website || null,
          billingPlan: "FREE" as const,
          onboardingStatus: "COMPLETED" as const,
          createdAt: org.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      setOrganizations([...existingOrgs, newMembership]);
      setCurrentOrg(org.id);
      navigate("/dashboard");
    },
    onError: (error) => handleMutationError(error, "Failed to create workspace."),
  });
}

/** Mutation hook for updating an existing organization's settings. */
export function useUpdateOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationRequest) => orgService.update(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
      queryClient.invalidateQueries({ queryKey: orgKeys.list() });
      toast.success("Organization updated successfully.");
    },
    onError: (error) => handleMutationError(error, "Failed to update organization."),
  });
}

/** Mutation hook for deleting an organization. Navigates to dashboard on success. */
export function useDeleteOrganizationMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orgId: string) => orgService.delete(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.list() });
      toast.success("Organization deleted.");
      navigate("/dashboard");
    },
    onError: (error) => handleMutationError(error, "Failed to delete organization."),
  });
}

// ─── Member Mutations ───────────────────────────────────────────────────────

/** Mutation hook for changing a member's role within an organization. */
export function useUpdateMemberRoleMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: UpdateMemberRoleRequest }) =>
      orgService.updateMemberRole(orgId, memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) });
      toast.success("Member role updated.");
    },
    onError: (error) => handleMutationError(error, "Failed to update member role."),
  });
}

/** Mutation hook for removing a member from an organization. */
export function useRemoveMemberMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => orgService.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) });
      toast.success("Member removed.");
    },
    onError: (error) => handleMutationError(error, "Failed to remove member."),
  });
}

// ─── Invite Mutations ───────────────────────────────────────────────────────

/** Mutation hook for sending a team invitation email. */
export function useSendInviteMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendInviteRequest) => orgService.sendInvite(orgId, data),
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.invites(orgId) });
      toast.success(`Invitation sent to ${invite.email}`);
    },
    onError: (error) => handleMutationError(error, "Failed to send invitation."),
  });
}

/** Mutation hook for revoking a pending team invitation. */
export function useRevokeInviteMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => orgService.revokeInvite(orgId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.invites(orgId) });
      toast.success("Invitation revoked.");
    },
    onError: (error) => handleMutationError(error, "Failed to revoke invitation."),
  });
}
