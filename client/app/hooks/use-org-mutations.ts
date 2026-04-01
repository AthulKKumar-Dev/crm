import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { orgService } from "~/services/org.service";
import { useAuthStore } from "~/stores/auth.store";
import { orgKeys } from "~/hooks/use-org-queries";
import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  UpdateMemberRoleRequest,
  SendInviteRequest,
} from "~/types/api";

// ─── Organization Mutations ───

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
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to create organization.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useCreatePersonalMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg);

  return useMutation({
    mutationFn: () => orgService.createPersonal(),
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.list() });
      setCurrentOrg(org.id);
      navigate("/dashboard");
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to create workspace.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useUpdateOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationRequest) => orgService.update(orgId, data),
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
      queryClient.invalidateQueries({ queryKey: orgKeys.list() });
      toast.success("Organization updated successfully.");
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to update organization.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

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
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to delete organization.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

// ─── Member Mutations ───

export function useUpdateMemberRoleMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: UpdateMemberRoleRequest }) =>
      orgService.updateMemberRole(orgId, memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) });
      toast.success("Member role updated.");
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to update member role.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useRemoveMemberMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => orgService.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) });
      toast.success("Member removed.");
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to remove member.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

// ─── Invite Mutations ───

export function useSendInviteMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendInviteRequest) => orgService.sendInvite(orgId, data),
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.invites(orgId) });
      toast.success(`Invitation sent to ${invite.email}`);
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to send invitation.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useRevokeInviteMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => orgService.revokeInvite(orgId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.invites(orgId) });
      toast.success("Invitation revoked.");
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to revoke invitation.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}
