import { z } from "zod";

/** Form schema for the onboarding choose-plan step. */
export const choosePlanSchema = z.object({
  billingPlan: z.enum(["BASIC", "GROWTH", "ADVANCE"]),
  billingInterval: z.enum(["MONTHLY", "YEARLY"]),
});

export type ChoosePlanFormValues = z.infer<typeof choosePlanSchema>;
