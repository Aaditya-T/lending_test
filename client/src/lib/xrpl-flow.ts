import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

import * as xrpl from "xrpl";
import type { FlowStep, Party, ScenarioId } from "./types";

type EmitFn = (event: { type: string; data: any }) => void;

interface WalletInfo {
  wallet: xrpl.Wallet;
  address: string;
  seed: string;
}

interface FlowContext {
  client: xrpl.Client;
  issuer: WalletInfo;
  lender: WalletInfo;
  borrower: WalletInfo;
  broker: WalletInfo;
  vaultId?: string;
  loanBrokerId?: string;
  loanId?: string;
  report: string[];
}

function toHex(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function addReport(ctx: FlowContext, ...lines: string[]) {
  for (const line of lines) {
    ctx.report.push(line);
  }
}

function emitStep(emit: EmitFn, step: FlowStep) {
  emit({ type: "step_update", data: step });
}

function emitParty(emit: EmitFn, party: Partial<Party> & { role: string }) {
  emit({ type: "party_update", data: party });
}

async function fundWallet(client: xrpl.Client): Promise<WalletInfo> {
  const fundResult = await client.fundWallet();
  const wallet = fundResult.wallet;
  return { wallet, address: wallet.address, seed: wallet.seed! };
}

async function step_fundWallets(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "fund-wallets";
  emitStep(emit, { id: stepId, title: "Fund All Wallets", description: "Creating and funding 4 wallets on XRPL Devnet via faucet", status: "running", transactionType: "Faucet" });

  try {
    const [issuer, lender, borrower, broker] = await Promise.all([
      fundWallet(ctx.client),
      fundWallet(ctx.client),
      fundWallet(ctx.client),
      fundWallet(ctx.client),
    ]);

    ctx.issuer = issuer;
    ctx.lender = lender;
    ctx.borrower = borrower;
    ctx.broker = broker;

    emitParty(emit, { role: "issuer", label: "USD Issuer", address: issuer.address, seed: issuer.seed, balance: "100 XRP" });
    emitParty(emit, { role: "lender", label: "Lender", address: lender.address, seed: lender.seed, balance: "100 XRP" });
    emitParty(emit, { role: "borrower", label: "Borrower", address: borrower.address, seed: borrower.seed, balance: "100 XRP" });
    emitParty(emit, { role: "broker", label: "Broker", address: broker.address, seed: broker.seed, balance: "100 XRP" });

    addReport(ctx,
      "=".repeat(70), "FUND WALLETS", "=".repeat(70),
      `Issuer:   ${issuer.address} (seed: ${issuer.seed})`,
      `Lender:   ${lender.address} (seed: ${lender.seed})`,
      `Borrower: ${borrower.address} (seed: ${borrower.seed})`,
      `Broker:   ${broker.address} (seed: ${broker.seed})`, ""
    );

    emitStep(emit, { id: stepId, title: "Fund All Wallets", description: "All 4 wallets funded successfully on XRPL Devnet", status: "success", transactionType: "Faucet", details: { "Issuer": issuer.address, "Lender": lender.address, "Borrower": borrower.address, "Broker": broker.address } });
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Fund All Wallets", description: "Failed to fund wallets", status: "error", error: err.message });
    throw err;
  }
}

async function step_issuerSetup(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "issuer-setup";
  emitStep(emit, { id: stepId, title: "Enable Issuer Settings", description: "Setting DefaultRipple on Issuer account for IOU issuance", status: "running", transactionType: "AccountSet" });

  try {
    const accountSetTx: xrpl.AccountSet = {
      TransactionType: "AccountSet",
      Account: ctx.issuer.address,
      SetFlag: xrpl.AccountSetAsfFlags.asfDefaultRipple,
    };

    const prepared = await ctx.client.autofill(accountSetTx);
    const signed = ctx.issuer.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "ISSUER ACCOUNT SETUP (DefaultRipple)", "=".repeat(70),
      `TX Hash: ${signed.hash}`, `Result:  ${txResult}`, ""
    );

    emitStep(emit, { id: stepId, title: "Enable Issuer Settings", description: "DefaultRipple enabled on Issuer account", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "AccountSet", details: { "Result": txResult, "Flag": "asfDefaultRipple" }, error: txResult !== "tesSUCCESS" ? `Transaction failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`AccountSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Enable Issuer Settings", description: "Failed to set up issuer", status: "error", error: err.message });
    throw err;
  }
}

async function step_lenderTrustline(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "lender-trustline";
  emitStep(emit, { id: stepId, title: "Lender Creates USD Trustline", description: "Lender creates a trustline to the Issuer for USD", status: "running", transactionType: "TrustSet" });

  try {
    const trustSetTx: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: ctx.lender.address,
      LimitAmount: { currency: "USD", issuer: ctx.issuer.address, value: "100000" },
    };

    const prepared = await ctx.client.autofill(trustSetTx);
    const signed = ctx.lender.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "LENDER CREATES USD TRUSTLINE", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, ""
    );

    emitStep(emit, { id: stepId, title: "Lender Creates USD Trustline", description: "Lender can now hold USD issued by the Issuer", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "TrustSet", details: { "Result": txResult, "Currency": "USD", "Limit": "100,000" }, error: txResult !== "tesSUCCESS" ? `TrustSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`TrustSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Lender Creates USD Trustline", description: "Failed to create trustline", status: "error", error: err.message });
    throw err;
  }
}

async function step_issuerSendsUSDLender(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "issuer-sends-usd-lender";
  emitStep(emit, { id: stepId, title: "Issuer Sends USD to Lender", description: "Issuer sends 10,000 USD to the Lender's wallet", status: "running", transactionType: "Payment" });

  try {
    const paymentTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: ctx.issuer.address,
      Destination: ctx.lender.address,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: "10000" },
    };

    const prepared = await ctx.client.autofill(paymentTx);
    const signed = ctx.issuer.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    emitParty(emit, { role: "lender", usdBalance: "10,000 USD" });

    addReport(ctx,
      "=".repeat(70), "ISSUER SENDS USD TO LENDER", "=".repeat(70),
      `TX Hash: ${signed.hash}`, `Result:  ${txResult}`, `Amount:  10,000 USD`, ""
    );

    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Lender", description: "10,000 USD sent to Lender", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "Payment", details: { "Result": txResult, "Amount": "10,000 USD" }, error: txResult !== "tesSUCCESS" ? `Payment failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`Payment failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Lender", description: "Failed to send USD", status: "error", error: err.message });
    throw err;
  }
}

async function step_brokerTrustline(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "broker-trustline";
  emitStep(emit, { id: stepId, title: "Broker Creates USD Trustline", description: "Broker creates a trustline to the Issuer for USD", status: "running", transactionType: "TrustSet" });

  try {
    const trustSetTx: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: ctx.broker.address,
      LimitAmount: { currency: "USD", issuer: ctx.issuer.address, value: "100000" },
    };

    const prepared = await ctx.client.autofill(trustSetTx);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "BROKER CREATES USD TRUSTLINE", "=".repeat(70),
      `TX Hash: ${signed.hash}`, `Result:  ${txResult}`, ""
    );

    emitStep(emit, { id: stepId, title: "Broker Creates USD Trustline", description: "Broker can now interact with USD", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "TrustSet", details: { "Result": txResult }, error: txResult !== "tesSUCCESS" ? `TrustSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`TrustSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Creates USD Trustline", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_issuerSendsUSDBroker(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "issuer-sends-usd-broker";
  emitStep(emit, { id: stepId, title: "Issuer Sends USD to Broker", description: "Issuer sends 1,000 USD to Broker for first-loss capital", status: "running", transactionType: "Payment" });

  try {
    const paymentTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: ctx.issuer.address,
      Destination: ctx.broker.address,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: "1000" },
    };

    const prepared = await ctx.client.autofill(paymentTx);
    const signed = ctx.issuer.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    emitParty(emit, { role: "broker", usdBalance: "1,000 USD" });

    addReport(ctx,
      "=".repeat(70), "ISSUER SENDS USD TO BROKER (for cover)", "=".repeat(70),
      `TX Hash: ${signed.hash}`, `Result:  ${txResult}`, `Amount:  1,000 USD`, ""
    );

    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Broker", description: "1,000 USD sent to Broker for cover", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "Payment", details: { "Result": txResult, "Amount": "1,000 USD" }, error: txResult !== "tesSUCCESS" ? `Payment failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`Payment to Broker failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Broker", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_createVault(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "create-vault";
  emitStep(emit, { id: stepId, title: "Broker Creates USD Vault", description: "Broker creates a Single Asset Vault (XLS-65) for USD", status: "running", transactionType: "VaultCreate" });

  try {
    const vaultCreateTx = {
      TransactionType: "VaultCreate",
      Account: ctx.broker.address,
      Asset: { currency: "USD", issuer: ctx.issuer.address },
      AssetsMaximum: "100000",
      Data: toHex("USD Lending Vault"),
    };

    const prepared = await ctx.client.autofill(vaultCreateTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    let vaultId = "";
    const affectedNodes = (result.result.meta as any)?.AffectedNodes || [];
    for (const node of affectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === "Vault") {
        vaultId = node.CreatedNode.LedgerIndex;
        break;
      }
    }

    ctx.vaultId = vaultId;
    emit({ type: "state_update", data: { vaultId } });

    addReport(ctx,
      "=".repeat(70), "BROKER CREATES USD VAULT (XLS-65 VaultCreate)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Vault ID: ${vaultId || "N/A"}`, ""
    );

    emitStep(emit, { id: stepId, title: "Broker Creates USD Vault", description: vaultId ? `Vault created: ${vaultId.slice(0, 12)}...` : "Vault creation submitted", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "VaultCreate", details: { "Result": txResult, "Vault ID": vaultId || "N/A", "Asset": "USD", "Max Capacity": "100,000" }, error: txResult !== "tesSUCCESS" ? `VaultCreate failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`VaultCreate failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Creates USD Vault", description: "Failed to create vault", status: "error", error: err.message });
    throw err;
  }
}

async function step_createLoanBroker(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "create-loan-broker";
  emitStep(emit, { id: stepId, title: "Broker Creates LoanBroker", description: "Broker creates the LoanBroker entry (XLS-66 LoanBrokerSet)", status: "running", transactionType: "LoanBrokerSet" });

  try {
    const loanBrokerSetTx = {
      TransactionType: "LoanBrokerSet",
      Account: ctx.broker.address,
      VaultID: ctx.vaultId,
    };

    const prepared = await ctx.client.autofill(loanBrokerSetTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    let loanBrokerId = "";
    const affectedNodes = (result.result.meta as any)?.AffectedNodes || [];
    for (const node of affectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === "LoanBroker") {
        loanBrokerId = node.CreatedNode.LedgerIndex;
        break;
      }
    }

    ctx.loanBrokerId = loanBrokerId;
    emit({ type: "state_update", data: { loanBrokerId } });

    addReport(ctx,
      "=".repeat(70), "BROKER CREATES LOANBROKER (XLS-66 LoanBrokerSet)", "=".repeat(70),
      `TX Hash:        ${signed.hash}`, `Result:         ${txResult}`, `LoanBroker ID:  ${loanBrokerId || "N/A"}`, `Vault ID:       ${ctx.vaultId}`, ""
    );

    emitStep(emit, { id: stepId, title: "Broker Creates LoanBroker", description: loanBrokerId ? `LoanBroker: ${loanBrokerId.slice(0, 12)}...` : "LoanBrokerSet submitted", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanBrokerSet", details: { "Result": txResult, "LoanBroker ID": loanBrokerId || "N/A", "Vault ID": ctx.vaultId }, error: txResult !== "tesSUCCESS" ? `LoanBrokerSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanBrokerSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Creates LoanBroker", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_lenderDeposits(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "lender-deposits";
  emitStep(emit, { id: stepId, title: "Lender Deposits USD in Vault", description: "Lender deposits 5,000 USD into the Vault (XLS-65 VaultDeposit)", status: "running", transactionType: "VaultDeposit" });

  try {
    const vaultDepositTx = {
      TransactionType: "VaultDeposit",
      Account: ctx.lender.address,
      VaultID: ctx.vaultId,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: "5000" },
    };

    const prepared = await ctx.client.autofill(vaultDepositTx as any);
    const signed = ctx.lender.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    emitParty(emit, { role: "lender", usdBalance: "5,000 USD (5,000 in Vault)" });

    addReport(ctx,
      "=".repeat(70), "LENDER DEPOSITS USD INTO VAULT (XLS-65 VaultDeposit)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Amount:   5,000 USD`, `Vault ID: ${ctx.vaultId}`, ""
    );

    emitStep(emit, { id: stepId, title: "Lender Deposits USD in Vault", description: "5,000 USD deposited into the Vault", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "VaultDeposit", details: { "Result": txResult, "Amount": "5,000 USD", "Vault ID": ctx.vaultId }, error: txResult !== "tesSUCCESS" ? `VaultDeposit failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`VaultDeposit failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Lender Deposits USD in Vault", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_borrowerTrustline(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "borrower-trustline";
  emitStep(emit, { id: stepId, title: "Borrower Creates USD Trustline", description: "Borrower creates a trustline to Issuer for USD so they can receive the loan", status: "running", transactionType: "TrustSet" });

  try {
    const trustSetTx: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: ctx.borrower.address,
      LimitAmount: { currency: "USD", issuer: ctx.issuer.address, value: "100000" },
    };

    const prepared = await ctx.client.autofill(trustSetTx);
    const signed = ctx.borrower.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "BORROWER CREATES USD TRUSTLINE", "=".repeat(70),
      `TX Hash: ${signed.hash}`, `Result:  ${txResult}`, ""
    );

    emitStep(emit, { id: stepId, title: "Borrower Creates USD Trustline", description: "Borrower can now receive USD", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "TrustSet", details: { "Result": txResult }, error: txResult !== "tesSUCCESS" ? `TrustSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`TrustSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Borrower Creates USD Trustline", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_brokerCoverDeposit(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "broker-cover-deposit";
  emitStep(emit, { id: stepId, title: "Broker Deposits First-Loss Capital", description: "Broker deposits first-loss capital to enable loan issuance (LoanBrokerCoverDeposit)", status: "running", transactionType: "LoanBrokerCoverDeposit" });

  try {
    const coverDepositTx = {
      TransactionType: "LoanBrokerCoverDeposit",
      Account: ctx.broker.address,
      LoanBrokerID: ctx.loanBrokerId,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: "500" },
    };

    const prepared = await ctx.client.autofill(coverDepositTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "BROKER DEPOSITS FIRST-LOSS CAPITAL (LoanBrokerCoverDeposit)", "=".repeat(70),
      `TX Hash:       ${signed.hash}`, `Result:        ${txResult}`, `Cover Amount:  500 USD`, ""
    );

    emitStep(emit, { id: stepId, title: "Broker Deposits First-Loss Capital", description: "500 USD deposited as first-loss capital", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanBrokerCoverDeposit", details: { "Result": txResult, "Cover Amount": "500 USD", "LoanBroker ID": ctx.loanBrokerId }, error: txResult !== "tesSUCCESS" ? `LoanBrokerCoverDeposit failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanBrokerCoverDeposit failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Deposits First-Loss Capital", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_loanSet(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "loan-set-countersign";
  emitStep(emit, { id: stepId, title: "Create Loan with CounterpartySignature", description: "Broker creates LoanSet; Borrower co-signs via CounterpartySignature field", status: "running", transactionType: "LoanSet" });

  try {
    addReport(ctx,
      "=".repeat(70), "CREATE LOAN WITH COUNTERPARTY SIGNATURE (XLS-66 LoanSet)", "=".repeat(70), ""
    );

    try {
      const vaultObj = await ctx.client.request({ command: "ledger_entry", index: ctx.vaultId } as any);
      addReport(ctx, "Pre-flight Vault State:", JSON.stringify(vaultObj.result?.node || vaultObj.result, null, 2), "");
    } catch (e: any) {
      addReport(ctx, `Vault query failed: ${e.message}`, "");
    }

    try {
      const loanBrokerObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanBrokerId } as any);
      addReport(ctx, "Pre-flight LoanBroker State:", JSON.stringify(loanBrokerObj.result?.node || loanBrokerObj.result, null, 2), "");
    } catch (e: any) {
      addReport(ctx, `LoanBroker query failed: ${e.message}`, "");
    }

    const loanSetTx: Record<string, any> = {
      TransactionType: "LoanSet",
      Account: ctx.broker.address,
      LoanBrokerID: ctx.loanBrokerId,
      PrincipalRequested: "1000",
      Counterparty: ctx.borrower.address,
      InterestRate: 500,
      PaymentInterval: 3600,
      PaymentTotal: 12,
    };

    const prepared = await ctx.client.autofill(loanSetTx as any);

    addReport(ctx, "LoanSet Transaction (autofilled):", JSON.stringify(prepared, null, 2), "");

    const brokerSigned = ctx.broker.wallet.sign(prepared);
    addReport(ctx, `Broker signed TX hash: ${brokerSigned.hash}`, "");

    const counterpartySigned = (xrpl as any).signLoanSetByCounterparty(
      ctx.borrower.wallet,
      brokerSigned.tx_blob
    );
    addReport(ctx, `Counterparty signed TX hash: ${counterpartySigned.hash}`, "");

    const result = await ctx.client.submitAndWait(counterpartySigned.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";
    const txHash = result.result.hash;

    let loanId = "";
    const affectedNodes = (result.result.meta as any)?.AffectedNodes || [];
    for (const node of affectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === "Loan") {
        loanId = node.CreatedNode.LedgerIndex;
        break;
      }
    }

    ctx.loanId = loanId;

    addReport(ctx,
      `TX Hash:  ${txHash}`, `Result:   ${txResult}`, `Loan ID:  ${loanId || "N/A"}`, "",
      "Co-signing: Broker signs first, then Borrower co-signs via signLoanSetByCounterparty", ""
    );

    if (txResult === "tesSUCCESS") {
      emitParty(emit, { role: "borrower", usdBalance: "1,000 USD (loan)" });
    }

    emitStep(emit, { id: stepId, title: "Create Loan with CounterpartySignature", description: loanId ? `Loan created: ${loanId.slice(0, 12)}... | Borrower receives 1,000 USD` : `LoanSet submitted: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: txHash, transactionType: "LoanSet", details: { "Result": txResult, "Loan ID": loanId || "N/A", "Principal Requested": "1,000 USD", "Interest Rate": "5% (500 basis points)", "Payment Interval": "3600s (1 hour)", "Payment Total": "12 payments", "Co-Sign Method": "signLoanSetByCounterparty", "Counterparty": ctx.borrower.address }, error: txResult !== "tesSUCCESS" ? `LoanSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanSet failed: ${txResult}`);
  } catch (err: any) {
    addReport(ctx, `ERROR: ${err.message}`, "");
    emitStep(emit, { id: stepId, title: "Create Loan with CounterpartySignature", description: "Failed - see error details", status: "error", transactionType: "LoanSet", error: err.message });
    throw err;
  }
}

async function step_signerListSet(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "signerlist-set";
  emitStep(emit, { id: stepId, title: "Set Up SignerList on Broker", description: "Broker configures SignerListSet adding Lender as delegate signer (quorum=1) for multi-sig authorization", status: "running", transactionType: "SignerListSet" });

  try {
    const signerListTx: Record<string, any> = {
      TransactionType: "SignerListSet",
      Account: ctx.broker.address,
      SignerQuorum: 1,
      SignerEntries: [
        { SignerEntry: { Account: ctx.lender.address, SignerWeight: 1 } },
      ],
    };

    const prepared = await ctx.client.autofill(signerListTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "SIGNERLIST SET (Multi-Sig Setup)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`,
      `Account:  ${ctx.broker.address}`,
      `Quorum:   1`,
      `Delegate: ${ctx.lender.address} (Lender, weight: 1)`, "",
      "This configures the broker account so that transactions can be",
      "authorized via standard XRPL multi-signature (Signers array).",
      "The Lender is added as a delegate signer for the broker.",
      "Note: XRPL prohibits accounts from being in their own SignerList.", "",
      "For LoanSet, the broker's Account authorization comes via the Lender's",
      "multi-sig, while the Borrower provides CounterpartySignature separately.", ""
    );

    emitStep(emit, { id: stepId, title: "Set Up SignerList on Broker", description: `SignerList configured: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "SignerListSet", details: { "Result": txResult, "Quorum": "1", "Delegate Signer": `${ctx.lender.address} (Lender, weight: 1)`, "Purpose": "Enable Lender to authorize broker transactions via multi-sig", "Note": "Broker cannot be in its own SignerList; Lender acts as delegate" }, error: txResult !== "tesSUCCESS" ? `SignerListSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`SignerListSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Set Up SignerList on Broker", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_loanSetMultiSig(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "loan-set-multisig";
  emitStep(emit, { id: stepId, title: "Create Loan with Multi-Sig + CounterpartySignature", description: "Lender signs via multi-sig (as broker delegate) + Borrower provides CounterpartySignature", status: "running", transactionType: "LoanSet" });

  try {
    addReport(ctx,
      "=".repeat(70), "CREATE LOAN WITH SIGNERLIST MULTI-SIG + COUNTERPARTYSIGNATURE", "=".repeat(70), "",
      "This demonstrates combining TWO XRPL authorization mechanisms:",
      "1. SignerList multi-sig: Lender signs on behalf of Broker (Account)",
      "2. CounterpartySignature: Borrower co-signs as Counterparty", "",
      "The Broker delegated signing authority to the Lender via SignerListSet.", ""
    );

    try {
      const vaultObj = await ctx.client.request({ command: "ledger_entry", index: ctx.vaultId } as any);
      addReport(ctx, "Pre-flight Vault State:", JSON.stringify(vaultObj.result?.node || vaultObj.result, null, 2), "");
    } catch (e: any) {
      addReport(ctx, `Vault query failed: ${e.message}`, "");
    }

    try {
      const loanBrokerObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanBrokerId } as any);
      addReport(ctx, "Pre-flight LoanBroker State:", JSON.stringify(loanBrokerObj.result?.node || loanBrokerObj.result, null, 2), "");
    } catch (e: any) {
      addReport(ctx, `LoanBroker query failed: ${e.message}`, "");
    }

    const loanSetTx: Record<string, any> = {
      TransactionType: "LoanSet",
      Account: ctx.broker.address,
      LoanBrokerID: ctx.loanBrokerId,
      PrincipalRequested: "1000",
      Counterparty: ctx.borrower.address,
      InterestRate: 500,
      PaymentInterval: 3600,
      PaymentTotal: 12,
      SigningPubKey: "",
    };

    const prepared = await ctx.client.autofill(loanSetTx as any);

    const signerCount = 1;
    const baseFee = parseInt(prepared.Fee || "12", 10);
    prepared.Fee = String(baseFee * (signerCount + 1));

    addReport(ctx,
      "LoanSet Transaction (autofilled for multi-sig):", JSON.stringify(prepared, null, 2), "",
      `Fee adjusted to ${prepared.Fee} drops (${signerCount + 1}x base fee for ${signerCount} signer)`, ""
    );

    addReport(ctx, "Step 1: Lender signs via multi-sig (as broker's delegate from SignerList)...", "");
    const lenderSigned = ctx.lender.wallet.sign(prepared, true);
    addReport(ctx, `Lender multi-sig signature added (delegate signer for broker account)`, "");

    const combinedBlob = (xrpl as any).multisign([lenderSigned.tx_blob]);
    addReport(ctx, "Multi-sig transaction assembled with xrpl.multisign()", "");

    addReport(ctx, "Step 2: Borrower adds CounterpartySignature (dual authorization)...", "");
    const finalBlob = (xrpl as any).signLoanSetByCounterparty(ctx.borrower.wallet, combinedBlob);
    addReport(ctx, "CounterpartySignature added by Borrower", "");

    const result = await ctx.client.submitAndWait(finalBlob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";
    const txHash = result.result.hash;

    let loanId = "";
    const affectedNodes = (result.result.meta as any)?.AffectedNodes || [];
    for (const node of affectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === "Loan") {
        loanId = node.CreatedNode.LedgerIndex;
        break;
      }
    }

    ctx.loanId = loanId;

    addReport(ctx,
      `TX Hash:  ${txHash}`, `Result:   ${txResult}`, `Loan ID:  ${loanId || "N/A"}`, "",
      "Authorization summary:",
      `  Account (Broker): ${ctx.broker.address}`,
      `    -> Delegated to Lender via SignerList multi-sig`,
      `  Counterparty (Borrower): ${ctx.borrower.address}`,
      `    -> Authorized via CounterpartySignature`, "",
      "This shows both XRPL authorization mechanisms working together:", 
      "  - Standard multi-sig (Signers array) for Account authorization",
      "  - CounterpartySignature (XLS-66) for Counterparty authorization", ""
    );

    if (txResult === "tesSUCCESS") {
      emitParty(emit, { role: "borrower", usdBalance: "1,000 USD (loan)" });
    }

    emitStep(emit, { id: stepId, title: "Create Loan with Multi-Sig + CounterpartySignature", description: loanId ? `Loan created: ${loanId.slice(0, 12)}... | Dual-mechanism auth` : `LoanSet submitted: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: txHash, transactionType: "LoanSet", details: { "Result": txResult, "Loan ID": loanId || "N/A", "Principal Requested": "1,000 USD", "Interest Rate": "5% (500 basis points)", "Payment Interval": "3600s (1 hour)", "Payment Total": "12 payments", "Account Auth": "Multi-sig (Lender as broker delegate)", "Counterparty Auth": "CounterpartySignature (Borrower)", "Delegate Signer": ctx.lender.address, "Note": "Combines SignerList multi-sig + CounterpartySignature" }, error: txResult !== "tesSUCCESS" ? `LoanSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanSet multi-sig failed: ${txResult}`);
  } catch (err: any) {
    addReport(ctx, `ERROR: ${err.message}`, "");
    emitStep(emit, { id: stepId, title: "Create Loan with Multi-Sig + CounterpartySignature", description: "Failed - see error details", status: "error", transactionType: "LoanSet", error: err.message });
    throw err;
  }
}

async function step_fundBorrowerForRepayment(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "fund-borrower-repayment";
  emitStep(emit, { id: stepId, title: "Fund Borrower for Repayment", description: "Issuer sends additional USD to Borrower so they can repay principal + interest", status: "running", transactionType: "Payment" });

  try {
    const paymentTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: ctx.issuer.address,
      Destination: ctx.borrower.address,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: "500" },
    };

    const prepared = await ctx.client.autofill(paymentTx);
    const signed = ctx.issuer.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "FUND BORROWER FOR REPAYMENT", "=".repeat(70),
      `TX Hash: ${signed.hash}`, `Result:  ${txResult}`, `Amount:  500 USD (to cover interest on repayment)`, ""
    );

    emitStep(emit, { id: stepId, title: "Fund Borrower for Repayment", description: "500 USD sent to Borrower for interest coverage", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "Payment", details: { "Result": txResult, "Amount": "500 USD", "Purpose": "Cover interest on loan repayment" }, error: txResult !== "tesSUCCESS" ? `Payment failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`Borrower funding failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Fund Borrower for Repayment", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_loanPay(ctx: FlowContext, emit: EmitFn, opts?: { earlyFull?: boolean }): Promise<void> {
  const isEarly = opts?.earlyFull;
  const stepId = isEarly ? "loan-pay-early" : "loan-pay";
  const title = isEarly ? "Borrower Repays Loan Early (Full)" : "Borrower Makes Loan Payment";
  const desc = isEarly
    ? "Borrower repays the full outstanding balance early via LoanPay"
    : "Borrower makes a scheduled payment on the loan via LoanPay";

  emitStep(emit, { id: stepId, title, description: desc, status: "running", transactionType: "LoanPay" });

  try {
    let payAmount = "100";

    if (isEarly) {
      try {
        const loanObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanId } as any);
        const loanNode = loanObj.result?.node as any;
        if (loanNode?.OutstandingPrincipal) {
          const outstanding = typeof loanNode.OutstandingPrincipal === "object"
            ? loanNode.OutstandingPrincipal.value
            : loanNode.OutstandingPrincipal;
          payAmount = String(Math.ceil(parseFloat(outstanding) * 1.1));
          addReport(ctx, `Outstanding principal: ${outstanding}`, `Paying: ${payAmount} (includes closing interest)`, "");
        }
      } catch (e: any) {
        payAmount = "1100";
        addReport(ctx, `Could not query loan state: ${e.message}. Using estimated amount: ${payAmount}`, "");
      }
    }

    const loanPayTx = {
      TransactionType: "LoanPay",
      Account: ctx.borrower.address,
      LoanID: ctx.loanId,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: payAmount },
    };

    const prepared = await ctx.client.autofill(loanPayTx as any);
    const signed = ctx.borrower.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), isEarly ? "BORROWER REPAYS LOAN EARLY (LoanPay)" : "BORROWER MAKES LOAN PAYMENT (LoanPay)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Amount:   ${payAmount} USD`, `Loan ID:  ${ctx.loanId}`, ""
    );

    emitStep(emit, { id: stepId, title, description: `${payAmount} USD payment ${txResult === "tesSUCCESS" ? "succeeded" : "failed"}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanPay", details: { "Result": txResult, "Amount": `${payAmount} USD`, "Loan ID": ctx.loanId, "Type": isEarly ? "Early Full Repayment" : "Scheduled Payment" }, error: txResult !== "tesSUCCESS" ? `LoanPay failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanPay failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title, description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_loanManageDefault(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "loan-manage-default";
  emitStep(emit, { id: stepId, title: "Broker Defaults the Loan", description: "Broker marks the loan as defaulted via LoanManage (borrower failed to pay)", status: "running", transactionType: "LoanManage" });

  try {
    const loanManageTx = {
      TransactionType: "LoanManage",
      Account: ctx.broker.address,
      LoanID: ctx.loanId,
      Flags: 1,
    };

    const prepared = await ctx.client.autofill(loanManageTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "BROKER DEFAULTS THE LOAN (LoanManage)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Loan ID:  ${ctx.loanId}`,
      "The broker marks the loan as defaulted. First-loss capital may be liquidated", "to protect vault depositors from losses.", ""
    );

    emitStep(emit, { id: stepId, title: "Broker Defaults the Loan", description: `Loan defaulted: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanManage", details: { "Result": txResult, "Loan ID": ctx.loanId, "Action": "Default (Flags: 1)", "Impact": "First-loss capital may be liquidated to cover losses" }, error: txResult !== "tesSUCCESS" ? `LoanManage failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanManage failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Defaults the Loan", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_loanDelete(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "loan-delete";
  emitStep(emit, { id: stepId, title: "Delete Loan", description: "Deleting the matured/defaulted loan object from the ledger (LoanDelete)", status: "running", transactionType: "LoanDelete" });

  try {
    const loanDeleteTx = {
      TransactionType: "LoanDelete",
      Account: ctx.broker.address,
      LoanID: ctx.loanId,
    };

    const prepared = await ctx.client.autofill(loanDeleteTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "DELETE LOAN (LoanDelete)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Loan ID:  ${ctx.loanId}`, ""
    );

    emitStep(emit, { id: stepId, title: "Delete Loan", description: `Loan deleted: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanDelete", details: { "Result": txResult, "Loan ID": ctx.loanId }, error: txResult !== "tesSUCCESS" ? `LoanDelete failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanDelete failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Delete Loan", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_brokerCoverWithdraw(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "broker-cover-withdraw";
  emitStep(emit, { id: stepId, title: "Broker Withdraws First-Loss Capital", description: "Broker withdraws remaining first-loss capital (LoanBrokerCoverWithdraw)", status: "running", transactionType: "LoanBrokerCoverWithdraw" });

  try {
    let withdrawAmount = "500";
    try {
      const lbObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanBrokerId } as any);
      const lbNode = lbObj.result?.node as any;
      if (lbNode?.CoverAvailable) {
        const cover = typeof lbNode.CoverAvailable === "object" ? lbNode.CoverAvailable.value : lbNode.CoverAvailable;
        withdrawAmount = cover;
        addReport(ctx, `CoverAvailable: ${cover}`, "");
      }
    } catch {}

    const coverWithdrawTx = {
      TransactionType: "LoanBrokerCoverWithdraw",
      Account: ctx.broker.address,
      LoanBrokerID: ctx.loanBrokerId,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: withdrawAmount },
    };

    const prepared = await ctx.client.autofill(coverWithdrawTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "BROKER WITHDRAWS FIRST-LOSS CAPITAL (LoanBrokerCoverWithdraw)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Amount:   ${withdrawAmount} USD`, ""
    );

    emitStep(emit, { id: stepId, title: "Broker Withdraws First-Loss Capital", description: `${withdrawAmount} USD withdrawn: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanBrokerCoverWithdraw", details: { "Result": txResult, "Amount": `${withdrawAmount} USD`, "LoanBroker ID": ctx.loanBrokerId }, error: txResult !== "tesSUCCESS" ? `LoanBrokerCoverWithdraw failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanBrokerCoverWithdraw failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Withdraws First-Loss Capital", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_loanBrokerDelete(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "loan-broker-delete";
  emitStep(emit, { id: stepId, title: "Delete LoanBroker", description: "Deleting the LoanBroker object after all loans are cleared (LoanBrokerDelete)", status: "running", transactionType: "LoanBrokerDelete" });

  try {
    const loanBrokerDeleteTx = {
      TransactionType: "LoanBrokerDelete",
      Account: ctx.broker.address,
      LoanBrokerID: ctx.loanBrokerId,
    };

    const prepared = await ctx.client.autofill(loanBrokerDeleteTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "DELETE LOANBROKER (LoanBrokerDelete)", "=".repeat(70),
      `TX Hash:        ${signed.hash}`, `Result:         ${txResult}`, `LoanBroker ID:  ${ctx.loanBrokerId}`, ""
    );

    emitStep(emit, { id: stepId, title: "Delete LoanBroker", description: `LoanBroker deleted: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanBrokerDelete", details: { "Result": txResult, "LoanBroker ID": ctx.loanBrokerId }, error: txResult !== "tesSUCCESS" ? `LoanBrokerDelete failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanBrokerDelete failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Delete LoanBroker", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_vaultWithdraw(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "vault-withdraw";
  emitStep(emit, { id: stepId, title: "Lender Withdraws from Vault", description: "Lender withdraws their deposited funds from the Vault (VaultWithdraw)", status: "running", transactionType: "VaultWithdraw" });

  try {
    let withdrawAmount = "5000";
    try {
      const vaultObj = await ctx.client.request({ command: "ledger_entry", index: ctx.vaultId } as any);
      const vaultNode = vaultObj.result?.node as any;
      if (vaultNode?.AssetsAvailable) {
        const avail = typeof vaultNode.AssetsAvailable === "object" ? vaultNode.AssetsAvailable.value : vaultNode.AssetsAvailable;
        withdrawAmount = avail;
        addReport(ctx, `Vault AssetsAvailable: ${avail}`, "");
      }
    } catch {}

    const vaultWithdrawTx = {
      TransactionType: "VaultWithdraw",
      Account: ctx.lender.address,
      VaultID: ctx.vaultId,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: withdrawAmount },
    };

    const prepared = await ctx.client.autofill(vaultWithdrawTx as any);
    const signed = ctx.lender.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "LENDER WITHDRAWS FROM VAULT (VaultWithdraw)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Amount:   ${withdrawAmount} USD`, `Vault ID: ${ctx.vaultId}`, ""
    );

    emitStep(emit, { id: stepId, title: "Lender Withdraws from Vault", description: `${withdrawAmount} USD withdrawn: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "VaultWithdraw", details: { "Result": txResult, "Amount": `${withdrawAmount} USD`, "Vault ID": ctx.vaultId }, error: txResult !== "tesSUCCESS" ? `VaultWithdraw failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`VaultWithdraw failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Lender Withdraws from Vault", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_vaultDelete(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "vault-delete";
  emitStep(emit, { id: stepId, title: "Delete Vault", description: "Deleting the Vault object after all funds withdrawn (VaultDelete)", status: "running", transactionType: "VaultDelete" });

  try {
    const vaultDeleteTx = {
      TransactionType: "VaultDelete",
      Account: ctx.broker.address,
      VaultID: ctx.vaultId,
    };

    const prepared = await ctx.client.autofill(vaultDeleteTx as any);
    const signed = ctx.broker.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    addReport(ctx,
      "=".repeat(70), "DELETE VAULT (VaultDelete)", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Vault ID: ${ctx.vaultId}`, ""
    );

    emitStep(emit, { id: stepId, title: "Delete Vault", description: `Vault deleted: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "VaultDelete", details: { "Result": txResult, "Vault ID": ctx.vaultId }, error: txResult !== "tesSUCCESS" ? `VaultDelete failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`VaultDelete failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Delete Vault", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step_verifyStates(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "verify-states";
  emitStep(emit, { id: stepId, title: "Verify Final States", description: "Querying account balances and ledger objects to verify the flow", status: "running", transactionType: "Verification" });

  try {
    const details: Record<string, any> = {};

    for (const [label, info] of [
      ["Issuer", ctx.issuer],
      ["Lender", ctx.lender],
      ["Borrower", ctx.borrower],
      ["Broker", ctx.broker],
    ] as const) {
      try {
        const accInfo = await ctx.client.request({ command: "account_info", account: info.address, ledger_index: "validated" });
        details[`${label} XRP Balance`] = xrpl.dropsToXrp(accInfo.result.account_data.Balance);
      } catch {
        details[`${label} XRP Balance`] = "Error fetching";
      }

      try {
        const lines = await ctx.client.request({ command: "account_lines", account: info.address, ledger_index: "validated" });
        const usdLine = (lines.result as any).lines?.find((l: any) => l.currency === "USD");
        if (usdLine) {
          details[`${label} USD Balance`] = usdLine.balance;
        }
      } catch {}
    }

    if (ctx.vaultId) {
      try {
        const vaultObj = await ctx.client.request({ command: "ledger_entry", index: ctx.vaultId, ledger_index: "validated" });
        details["Vault Object"] = JSON.stringify(vaultObj.result.node, null, 2);
      } catch {
        details["Vault Object"] = "Deleted or not found";
      }
    }

    if (ctx.loanBrokerId) {
      try {
        const lbObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanBrokerId, ledger_index: "validated" });
        details["LoanBroker Object"] = JSON.stringify(lbObj.result.node, null, 2);
      } catch {
        details["LoanBroker Object"] = "Deleted or not found";
      }
    }

    if (ctx.loanId) {
      try {
        const loanObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanId, ledger_index: "validated" });
        details["Loan Object"] = JSON.stringify(loanObj.result.node, null, 2);
      } catch {
        details["Loan Object"] = "Deleted or not found";
      }
    }

    addReport(ctx, "=".repeat(70), "FINAL STATE VERIFICATION", "=".repeat(70), "");
    for (const [key, val] of Object.entries(details)) {
      addReport(ctx, `${key}: ${val}`);
    }
    addReport(ctx, "");

    emitStep(emit, { id: stepId, title: "Verify Final States", description: "All account balances and ledger objects verified", status: "success", transactionType: "Verification", details });
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Verify Final States", description: "Verification failed", status: "error", error: err.message });
  }
}

async function step_batchIssuerPayments(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "batch-issuer-payments";
  emitStep(emit, { id: stepId, title: "Batch: Issuer USD Payments", description: "Sending USD to Lender (10,000) and Broker (1,000) in a single Batch transaction (XLS-56)", status: "running", transactionType: "Batch (2× Payment)" });

  try {
    const payLender: Record<string, any> = {
      TransactionType: "Payment",
      Account: ctx.issuer.address,
      Destination: ctx.lender.address,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: "10000" },
      Fee: "0",
      SigningPubKey: "",
      Flags: 1073741824,
    };

    const payBroker: Record<string, any> = {
      TransactionType: "Payment",
      Account: ctx.issuer.address,
      Destination: ctx.broker.address,
      Amount: { currency: "USD", issuer: ctx.issuer.address, value: "1000" },
      Fee: "0",
      SigningPubKey: "",
      Flags: 1073741824,
    };

    const batchTx: Record<string, any> = {
      TransactionType: "Batch",
      Account: ctx.issuer.address,
      Flags: 65536,
      RawTransactions: [
        { RawTransaction: payLender },
        { RawTransaction: payBroker },
      ],
    };

    await (xrpl as any).autofillBatchTxn(ctx.client, batchTx);
    const prepared = await ctx.client.autofill(batchTx as any);
    const signed = ctx.issuer.wallet.sign(prepared);
    const result = await ctx.client.submitAndWait(signed.tx_blob);
    const txResult = (result.result.meta as any)?.TransactionResult || "unknown";

    emitParty(emit, { role: "lender", usdBalance: "10,000 USD" });
    emitParty(emit, { role: "broker", usdBalance: "1,000 USD" });

    addReport(ctx,
      "=".repeat(70), "BATCH ISSUER PAYMENTS (XLS-56 Batch — 2× Payment)", "=".repeat(70),
      `TX Hash:  ${result.result.hash}`, `Result:   ${txResult}`,
      `Mode:     ALLORNOTHING`,
      `Inner 1:  Payment 10,000 USD → Lender`,
      `Inner 2:  Payment 1,000 USD → Broker (for first-loss capital)`,
      `Benefit:  Single-account Batch — no BatchSigners needed, one signature`, ""
    );

    emitStep(emit, { id: stepId, title: "Batch: Issuer USD Payments", description: `Both payments sent atomically: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: result.result.hash, transactionType: "Batch (2× Payment)", details: { "Result": txResult, "Mode": "ALLORNOTHING", "Payment 1": "10,000 USD → Lender", "Payment 2": "1,000 USD → Broker", "XLS-56": "Single-account Batch (no BatchSigners needed)" }, error: txResult !== "tesSUCCESS" ? `Batch payments failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`Batch payments failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Batch: Issuer USD Payments", description: `Batch failed: ${err.message}`, status: "error", transactionType: "Batch (2× Payment)", error: err.message });
    throw err;
  }
}

async function runSharedSetup(ctx: FlowContext, emit: EmitFn): Promise<void> {
  // Phase 1: Fund all 4 wallets (parallel faucet calls internally)
  await step_fundWallets(ctx, emit);

  // Phase 2: Issuer enables DefaultRipple (must complete before trustlines)
  await step_issuerSetup(ctx, emit);

  // Phase 3: All 3 trustlines in parallel (different accounts, no sequence conflicts)
  await Promise.all([
    step_lenderTrustline(ctx, emit),
    step_brokerTrustline(ctx, emit),
    step_borrowerTrustline(ctx, emit),
  ]);

  // Phase 4: Batch both Issuer payments (XLS-56 ALLORNOTHING) + VaultCreate in parallel
  // Batch sends USD to Lender AND Broker in one atomic tx (same account, auto-sequenced)
  // VaultCreate runs alongside on a different account (Broker)
  // If Batch is unavailable, falls back to sequential individual payments
  const vaultPromise = step_createVault(ctx, emit);
  let paymentsDone = false;
  try {
    await step_batchIssuerPayments(ctx, emit);
    paymentsDone = true;
  } catch (batchErr: any) {
    addReport(ctx, `Batch payments unavailable (${batchErr.message}), using sequential fallback...`, "");
    await step_issuerSendsUSDLender(ctx, emit);
    await step_issuerSendsUSDBroker(ctx, emit);
    paymentsDone = true;
  }
  await vaultPromise;

  // Phase 5: LoanBrokerSet + VaultDeposit in parallel (Broker & Lender — different accounts)
  // Both deps satisfied: vaultId from Phase 4, Lender has USD, Broker has USD
  await Promise.all([
    step_createLoanBroker(ctx, emit),
    step_lenderDeposits(ctx, emit),
  ]);

  // Phase 6: Broker deposits first-loss capital (depends on LoanBroker existing + Broker having USD)
  await step_brokerCoverDeposit(ctx, emit);
}

function getScenarioStepCount(scenarioId: ScenarioId): number {
  switch (scenarioId) {
    case "loan-creation": return 12;
    case "loan-payment": return 13;
    case "loan-default": return 14;
    case "early-repayment": return 15;
    case "full-lifecycle": return 18;
    case "signerlist-loan": return 13;
    default: return 12;
  }
}

export async function runLendingFlow(emit: EmitFn, scenarioId: ScenarioId = "loan-creation"): Promise<string> {
  const ctx: FlowContext = {
    client: null as any,
    issuer: null as any,
    lender: null as any,
    borrower: null as any,
    broker: null as any,
    report: [],
  };

  const network = "wss://s.devnet.rippletest.net:51233";

  addReport(ctx,
    "=".repeat(70), `XRPL LENDING PROTOCOL - ${scenarioId.toUpperCase()} SCENARIO`, "=".repeat(70),
    `Network:  ${network}`, `Scenario: ${scenarioId}`, `Started:  ${new Date().toISOString()}`, ""
  );

  emit({ type: "state_update", data: { scenarioId, totalSteps: getScenarioStepCount(scenarioId) } });

  try {
    ctx.client = new xrpl.Client(network);
    await ctx.client.connect();
    addReport(ctx, `Connected to ${network}`, "");

    await runSharedSetup(ctx, emit);

    if (scenarioId === "signerlist-loan") {
      await step_signerListSet(ctx, emit);
      await step_loanSetMultiSig(ctx, emit);
      await step_verifyStates(ctx, emit);
    } else {
      await step_loanSet(ctx, emit);

      switch (scenarioId) {
        case "loan-creation":
          await step_verifyStates(ctx, emit);
          break;

        case "loan-payment":
          await step_loanPay(ctx, emit);
          await step_verifyStates(ctx, emit);
          break;

        case "loan-default":
          await step_loanManageDefault(ctx, emit);
          await step_loanDelete(ctx, emit);
          await step_verifyStates(ctx, emit);
          break;

        case "early-repayment":
          await step_fundBorrowerForRepayment(ctx, emit);
          await step_loanPay(ctx, emit, { earlyFull: true });
          await step_loanDelete(ctx, emit);
          await step_verifyStates(ctx, emit);
          break;

        case "full-lifecycle":
          await step_loanPay(ctx, emit);
          await step_loanManageDefault(ctx, emit);
          await step_loanDelete(ctx, emit);
          await step_brokerCoverWithdraw(ctx, emit);
          await step_loanBrokerDelete(ctx, emit);
          await step_vaultWithdraw(ctx, emit);
          await step_vaultDelete(ctx, emit);
          break;
      }
    }

    addReport(ctx,
      "=".repeat(70), "FLOW COMPLETED SUCCESSFULLY", "=".repeat(70),
      `Completed: ${new Date().toISOString()}`, "",
      "Summary:",
      `- Scenario:   ${scenarioId}`,
      `- Issuer:     ${ctx.issuer.address}`,
      `- Lender:     ${ctx.lender.address}`,
      `- Borrower:   ${ctx.borrower.address}`,
      `- Broker:     ${ctx.broker.address}`,
      `- Vault ID:   ${ctx.vaultId || "N/A"}`,
      `- LoanBroker: ${ctx.loanBrokerId || "N/A"}`,
      `- Loan ID:    ${ctx.loanId || "N/A"}`, ""
    );

    emit({ type: "flow_complete", data: { report: ctx.report.join("\n") } });
    return ctx.report.join("\n");
  } catch (err: any) {
    addReport(ctx,
      "=".repeat(70), "FLOW FAILED", "=".repeat(70),
      `Error: ${err.message}`, `Failed at: ${new Date().toISOString()}`, ""
    );

    emit({ type: "flow_error", data: { message: err.message, report: ctx.report.join("\n") } });
    return ctx.report.join("\n");
  } finally {
    try {
      if (ctx.client?.isConnected()) {
        await ctx.client.disconnect();
      }
    } catch {}
  }
}
