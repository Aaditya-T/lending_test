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

export type ScenarioId = "loan-creation" | "loan-default" | "loan-payment" | "early-repayment" | "full-lifecycle" | "signerlist-loan";

export interface ScenarioConfig {
  id: ScenarioId;
  name: string;
  description: string;
  diagramSteps: { label: string; actor: string }[];
}

export const SCENARIOS: ScenarioConfig[] = [
  {
    id: "loan-creation",
    name: "Loan Creation",
    description: "Set up all parties, create vault, deposit funds, and create a loan with CounterpartySignature co-signing",
    diagramSteps: [
      { label: "Fund Wallets", actor: "All" },
      { label: "Issue USD", actor: "Issuer" },
      { label: "Create Vault", actor: "Broker" },
      { label: "Deposit USD", actor: "Lender" },
      { label: "Cover Deposit", actor: "Broker" },
      { label: "Co-sign Loan", actor: "Both" },
      { label: "Verify", actor: "System" },
    ],
  },
  {
    id: "loan-payment",
    name: "Loan Payment",
    description: "Create a loan then make a scheduled payment via LoanPay transaction",
    diagramSteps: [
      { label: "Setup", actor: "All" },
      { label: "Create Loan", actor: "Both" },
      { label: "LoanPay", actor: "Borrower" },
      { label: "Verify", actor: "System" },
    ],
  },
  {
    id: "loan-default",
    name: "Loan Default",
    description: "Create a loan, broker impairs it, waits for grace period, then defaults via LoanManage. Demonstrates first-loss capital protection",
    diagramSteps: [
      { label: "Setup", actor: "All" },
      { label: "Create Loan", actor: "Both" },
      { label: "Impair Loan", actor: "Broker" },
      { label: "Grace Period", actor: "System" },
      { label: "Default Loan", actor: "Broker" },
      { label: "Delete Loan", actor: "Broker" },
      { label: "Verify", actor: "System" },
    ],
  },
  {
    id: "early-repayment",
    name: "Early Repayment",
    description: "Create a loan, fund borrower with extra USD for interest, then repay the full outstanding balance early",
    diagramSteps: [
      { label: "Setup", actor: "All" },
      { label: "Create Loan", actor: "Both" },
      { label: "Fund Borrower", actor: "Issuer" },
      { label: "Early Repay", actor: "Borrower" },
      { label: "Delete Loan", actor: "Broker" },
      { label: "Verify", actor: "System" },
    ],
  },
  {
    id: "full-lifecycle",
    name: "Full Lifecycle",
    description: "Complete lending lifecycle: create loan, make payment, delete loan, withdraw cover, delete broker, withdraw vault, delete vault",
    diagramSteps: [
      { label: "Setup", actor: "All" },
      { label: "Create Loan", actor: "Both" },
      { label: "LoanPay", actor: "Borrower" },
      { label: "Delete Loan", actor: "Broker" },
      { label: "Withdraw Cover", actor: "Broker" },
      { label: "Delete Broker", actor: "Broker" },
      { label: "Vault Withdraw", actor: "Lender" },
      { label: "Delete Vault", actor: "Broker" },
    ],
  },
  {
    id: "signerlist-loan",
    name: "SignerList Loan",
    description: "Create a loan combining SignerList multi-sig (Lender as broker delegate) with CounterpartySignature (Borrower) - two XRPL auth mechanisms in one transaction",
    diagramSteps: [
      { label: "Setup", actor: "All" },
      { label: "SignerListSet", actor: "Broker" },
      { label: "Multi-Sig + CounterpartySig Loan", actor: "Lender+Borrower" },
      { label: "Verify", actor: "System" },
    ],
  },
];

export const flowStateSchema = z.object({
  status: z.enum(["idle", "running", "completed", "error"]),
  parties: z.array(partySchema),
  steps: z.array(flowStepSchema),
  vaultId: z.string().optional(),
  loanBrokerId: z.string().optional(),
  loanId: z.string().optional(),
  network: z.string(),
  scenarioId: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  errorMessage: z.string().optional(),
  loanStats: z.object({
    principalPaid: z.string(),
    principalRemaining: z.string(),
    interestPaid: z.string(),
    nextPaymentAmount: z.string(),
    nextPaymentDueDate: z.string(),
    totalPaymentsMade: z.number(),
    totalPaymentsRemaining: z.number(),
    totalPayments: z.number(),
    status: z.string(),
  }).optional(),
});

export type FlowState = z.infer<typeof flowStateSchema>;
