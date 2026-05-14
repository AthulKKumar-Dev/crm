import { useQuery } from "@tanstack/react-query";
import { organizationSettingsService } from "~/services/organization-settings.service";

/** React Query key factory for organization-settings queries. */
export const settingsKeys = {
  all: ["organization-settings"] as const,
};

/** Fetch all domain settings for the current org. */
export function useOrganizationSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => organizationSettingsService.get(),
  });
}
