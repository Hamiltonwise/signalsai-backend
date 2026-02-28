import { z } from "zod";

export const ProposalSchema = z
  .object({
    type: z.enum(["NEW", "UPDATE", "CONFLICT"]),
    summary: z.string().min(1),
    target_excerpt: z.string().nullable().optional(),
    proposed_text: z.string().min(1),
    reason: z.string().min(1),
  })
  .superRefine((val, ctx) => {
    if (
      (val.type === "UPDATE" || val.type === "CONFLICT") &&
      !val.target_excerpt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "target_excerpt is required for UPDATE/CONFLICT proposals",
      });
    }
  });

export const ProposalsSchema = z.array(ProposalSchema).max(50);

export type ProposalInput = z.infer<typeof ProposalSchema>;
