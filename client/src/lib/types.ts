import { z } from "zod";

export const flowStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["pending", "running", "success", "error"]),
  transactionHash: z.string().optional(),
  transactionType: z.string().optional(),
  result: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.string().optional(),
  details: z.record(z.any()).optional(),
});

export type FlowStep = z.infer<typeof flowStepSchema>;

export const partySchema = z.object({
  role: z.enum(["issuer", "lender", "borrower", "broker"]),
  label: z.string(),
  address: z.string().optional(),
  seed: z.string().optional(),
  balance: z.string().optional(),
  usdBalance: z.string().optional(),
});

export type Party = z.infer<typeof partySchema>;

export const flowStateSchema = z.object({
  status: z.enum(["idle", "running", "completed", "error"]),
  parties: z.array(partySchema),
  steps: z.array(flowStepSchema),
  vaultId: z.string().optional(),
  loanBrokerId: z.string().optional(),
  loanId: z.string().optional(),
  network: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type FlowState = z.infer<typeof flowStateSchema>;

