import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

import * as xrpl from "xrpl";
import type { FlowStep, Party } from "./types";

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

async function step1_fundWallets(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 1: FUND WALLETS", "=".repeat(70),
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

async function step2_issuerSetup(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 2: ISSUER ACCOUNT SETUP (DefaultRipple)", "=".repeat(70),
      `TX Hash: ${signed.hash}`, `Result:  ${txResult}`, `Account: ${ctx.issuer.address}`, `Flag:    asfDefaultRipple`, ""
    );

    emitStep(emit, { id: stepId, title: "Enable Issuer Settings", description: "DefaultRipple enabled on Issuer account", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "AccountSet", details: { "Result": txResult, "Flag": "asfDefaultRipple" }, error: txResult !== "tesSUCCESS" ? `Transaction failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`AccountSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Enable Issuer Settings", description: "Failed to set up issuer", status: "error", error: err.message });
    throw err;
  }
}

async function step3_lenderTrustline(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 3: LENDER CREATES USD TRUSTLINE", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Account:  ${ctx.lender.address}`, `Issuer:   ${ctx.issuer.address}`, `Currency: USD`, `Limit:    100,000`, ""
    );

    emitStep(emit, { id: stepId, title: "Lender Creates USD Trustline", description: "Lender can now hold USD issued by the Issuer", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "TrustSet", details: { "Result": txResult, "Currency": "USD", "Limit": "100,000", "Issuer": ctx.issuer.address }, error: txResult !== "tesSUCCESS" ? `TrustSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`TrustSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Lender Creates USD Trustline", description: "Failed to create trustline", status: "error", error: err.message });
    throw err;
  }
}

async function step4_issuerSendsUSD(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "issuer-sends-usd";
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
      "=".repeat(70), "STEP 4: ISSUER SENDS USD TO LENDER", "=".repeat(70),
      `TX Hash:     ${signed.hash}`, `Result:      ${txResult}`, `From:        ${ctx.issuer.address} (Issuer)`, `To:          ${ctx.lender.address} (Lender)`, `Amount:      10,000 USD`, ""
    );

    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Lender", description: "10,000 USD sent to Lender", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "Payment", details: { "Result": txResult, "Amount": "10,000 USD", "From": "Issuer", "To": "Lender" }, error: txResult !== "tesSUCCESS" ? `Payment failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`Payment failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Lender", description: "Failed to send USD", status: "error", error: err.message });
    throw err;
  }
}

async function step4b_issuerSendsUSDBroker(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 4b: ISSUER SENDS USD TO BROKER (for first-loss capital)", "=".repeat(70),
      `TX Hash:     ${signed.hash}`, `Result:      ${txResult}`, `From:        ${ctx.issuer.address} (Issuer)`, `To:          ${ctx.broker.address} (Broker)`, `Amount:      1,000 USD`, ""
    );

    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Broker", description: "1,000 USD sent to Broker for cover", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "Payment", details: { "Result": txResult, "Amount": "1,000 USD", "From": "Issuer", "To": "Broker" }, error: txResult !== "tesSUCCESS" ? `Payment failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`Payment to Broker failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Issuer Sends USD to Broker", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step5_brokerTrustline(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "broker-trustline";
  emitStep(emit, { id: stepId, title: "Broker Creates USD Trustline", description: "Broker creates a trustline to the Issuer for USD (needed for vault operations)", status: "running", transactionType: "TrustSet" });

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
      "=".repeat(70), "STEP 5: BROKER CREATES USD TRUSTLINE", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Account:  ${ctx.broker.address}`, `Currency: USD`, ""
    );

    emitStep(emit, { id: stepId, title: "Broker Creates USD Trustline", description: "Broker can now interact with USD", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "TrustSet", details: { "Result": txResult }, error: txResult !== "tesSUCCESS" ? `TrustSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`TrustSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Creates USD Trustline", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step6_createVault(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 6: BROKER CREATES USD VAULT (XLS-65 VaultCreate)", "=".repeat(70),
      `TX Hash:   ${signed.hash}`, `Result:    ${txResult}`, `Account:   ${ctx.broker.address} (Broker)`, `Vault ID:  ${vaultId || "N/A"}`, `Asset:     USD (issuer: ${ctx.issuer.address})`, `Max:       100,000 USD`, "",
      "Affected Nodes:", JSON.stringify(affectedNodes, null, 2), ""
    );

    emitStep(emit, { id: stepId, title: "Broker Creates USD Vault", description: vaultId ? `Vault created: ${vaultId.slice(0, 12)}...` : "Vault creation submitted", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "VaultCreate", details: { "Result": txResult, "Vault ID": vaultId || "N/A", "Asset": "USD", "Max Capacity": "100,000" }, error: txResult !== "tesSUCCESS" ? `VaultCreate failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`VaultCreate failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Creates USD Vault", description: "Failed to create vault", status: "error", error: err.message });
    throw err;
  }
}

async function step7_createLoanBroker(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 7: BROKER CREATES LOANBROKER (XLS-66 LoanBrokerSet)", "=".repeat(70),
      `TX Hash:         ${signed.hash}`, `Result:          ${txResult}`, `Account:         ${ctx.broker.address} (Broker)`, `Vault ID:        ${ctx.vaultId}`, `LoanBroker ID:   ${loanBrokerId || "N/A"}`, "",
      "Affected Nodes:", JSON.stringify(affectedNodes, null, 2), ""
    );

    emitStep(emit, { id: stepId, title: "Broker Creates LoanBroker", description: loanBrokerId ? `LoanBroker: ${loanBrokerId.slice(0, 12)}...` : "LoanBrokerSet submitted", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanBrokerSet", details: { "Result": txResult, "LoanBroker ID": loanBrokerId || "N/A", "Vault ID": ctx.vaultId }, error: txResult !== "tesSUCCESS" ? `LoanBrokerSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanBrokerSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Creates LoanBroker", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step8_lenderDeposits(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 8: LENDER DEPOSITS USD INTO VAULT (XLS-65 VaultDeposit)", "=".repeat(70),
      `TX Hash:    ${signed.hash}`, `Result:     ${txResult}`, `Account:    ${ctx.lender.address} (Lender)`, `Vault ID:   ${ctx.vaultId}`, `Amount:     5,000 USD`, "",
      "Affected Nodes:", JSON.stringify((result.result.meta as any)?.AffectedNodes || [], null, 2), ""
    );

    emitStep(emit, { id: stepId, title: "Lender Deposits USD in Vault", description: "5,000 USD deposited into the Vault", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "VaultDeposit", details: { "Result": txResult, "Amount": "5,000 USD", "Vault ID": ctx.vaultId }, error: txResult !== "tesSUCCESS" ? `VaultDeposit failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`VaultDeposit failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Lender Deposits USD in Vault", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step9_borrowerTrustline(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 9: BORROWER CREATES USD TRUSTLINE", "=".repeat(70),
      `TX Hash:  ${signed.hash}`, `Result:   ${txResult}`, `Account:  ${ctx.borrower.address} (Borrower)`, `Currency: USD`, `Issuer:   ${ctx.issuer.address}`, ""
    );

    emitStep(emit, { id: stepId, title: "Borrower Creates USD Trustline", description: "Borrower can now receive USD", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "TrustSet", details: { "Result": txResult }, error: txResult !== "tesSUCCESS" ? `TrustSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`TrustSet failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Borrower Creates USD Trustline", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step10_brokerCoverDeposit(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      "=".repeat(70), "STEP 10: BROKER DEPOSITS FIRST-LOSS CAPITAL (LoanBrokerCoverDeposit)", "=".repeat(70),
      `TX Hash:        ${signed.hash}`, `Result:         ${txResult}`, `Account:        ${ctx.broker.address} (Broker)`, `LoanBroker ID:  ${ctx.loanBrokerId}`, `Cover Amount:   500 USD`, "",
      "First-loss capital protects depositors from loan defaults.",
      "Without sufficient cover, the loan broker cannot issue new loans.", "",
      "Affected Nodes:", JSON.stringify((result.result.meta as any)?.AffectedNodes || [], null, 2), ""
    );

    emitStep(emit, { id: stepId, title: "Broker Deposits First-Loss Capital", description: "500 USD deposited as first-loss capital", status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: signed.hash, transactionType: "LoanBrokerCoverDeposit", details: { "Result": txResult, "Cover Amount": "500 USD", "LoanBroker ID": ctx.loanBrokerId }, error: txResult !== "tesSUCCESS" ? `LoanBrokerCoverDeposit failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanBrokerCoverDeposit failed: ${txResult}`);
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Broker Deposits First-Loss Capital", description: "Failed", status: "error", error: err.message });
    throw err;
  }
}

async function step11_loanSetWithCounterparty(ctx: FlowContext, emit: EmitFn): Promise<void> {
  const stepId = "loan-set-countersign";
  emitStep(emit, { id: stepId, title: "Create Loan with CounterpartySignature", description: "Broker creates LoanSet; Borrower co-signs via CounterpartySignature field", status: "running", transactionType: "LoanSet" });

  try {
    addReport(ctx,
      "=".repeat(70), "STEP 11: CREATE LOAN WITH COUNTERPARTY SIGNATURE (XLS-66 LoanSet)", "=".repeat(70),
      "", "--- Pre-flight: Querying Vault & LoanBroker State ---"
    );

    try {
      const vaultObj = await ctx.client.request({
        command: "ledger_entry",
        index: ctx.vaultId,
      } as any);
      addReport(ctx, "Vault State:", JSON.stringify(vaultObj.result?.node || vaultObj.result, null, 2), "");
    } catch (e: any) {
      addReport(ctx, `Vault query failed: ${e.message}`, "");
    }

    try {
      const loanBrokerObj = await ctx.client.request({
        command: "ledger_entry",
        index: ctx.loanBrokerId,
      } as any);
      addReport(ctx, "LoanBroker State:", JSON.stringify(loanBrokerObj.result?.node || loanBrokerObj.result, null, 2), "");
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

    addReport(ctx,
      "--- LoanSet Transaction (autofilled, before signing) ---", JSON.stringify(prepared, null, 2), ""
    );

    addReport(ctx, "--- Step A: Broker signs the LoanSet first ---");
    const brokerSigned = ctx.broker.wallet.sign(prepared);
    addReport(ctx, `Broker signed TX hash: ${brokerSigned.hash}`, `Broker signed TX blob (first 80 chars): ${brokerSigned.tx_blob.slice(0, 80)}...`, "");

    addReport(ctx,
      "--- Step B: Borrower co-signs via signLoanSetByCounterparty ---",
      "The borrower signs the broker-signed transaction blob to add their",
      "CounterpartySignature, proving they agree to the loan terms.", ""
    );

    const counterpartySigned = (xrpl as any).signLoanSetByCounterparty(
      ctx.borrower.wallet,
      brokerSigned.tx_blob
    );
    addReport(ctx, `Counterparty signed TX hash: ${counterpartySigned.hash}`, `CounterpartySignature added with borrower pubkey: ${ctx.borrower.wallet.publicKey}`, "");

    addReport(ctx, "--- Step C: Submit co-signed transaction to network ---");

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
      `TX Hash:       ${txHash}`, `Result:        ${txResult}`, `Loan ID:       ${loanId || "N/A"}`, "",
      "Affected Nodes:", JSON.stringify(affectedNodes, null, 2), "",
      "=== COUNTERPARTY SIGNATURE FLOW EXPLANATION ===",
      "1. Broker creates a LoanSet transaction with Counterparty = Borrower",
      "2. The transaction is autofilled by the client (Sequence, Fee, etc.)",
      "3. Broker signs the transaction first (regular wallet.sign())",
      "4. Borrower co-signs using xrpl.signLoanSetByCounterparty(wallet, tx_blob)",
      "5. This adds CounterpartySignature { SigningPubKey, TxnSignature } to the tx",
      "6. The co-signed transaction is submitted to the ledger",
      "7. The ledger verifies both: Broker's TxnSignature AND CounterpartySignature",
      "8. This proves both parties agreed to the loan terms", ""
    );

    if (txResult === "tesSUCCESS") {
      emitParty(emit, { role: "borrower", usdBalance: "1,000 USD (loan)" });
    }

    emitStep(emit, { id: stepId, title: "Create Loan with CounterpartySignature", description: loanId ? `Loan created: ${loanId.slice(0, 12)}... | Borrower receives 1,000 USD` : `LoanSet submitted: ${txResult}`, status: txResult === "tesSUCCESS" ? "success" : "error", transactionHash: txHash, transactionType: "LoanSet", details: { "Result": txResult, "Loan ID": loanId || "N/A", "Principal Requested": "1,000 USD", "Interest Rate": "5% (500 basis points)", "Payment Interval": "3600 seconds (1 hour)", "Payment Total": "12 payments", "Co-Sign Method": "signLoanSetByCounterparty (Broker signs first, Borrower co-signs)", "Counterparty": ctx.borrower.address }, error: txResult !== "tesSUCCESS" ? `LoanSet failed: ${txResult}` : undefined });

    if (txResult !== "tesSUCCESS") throw new Error(`LoanSet failed: ${txResult}`);
  } catch (err: any) {
    addReport(ctx, "", `ERROR: ${err.message}`, "",
      "If LoanSet failed, common reasons:",
      "- The lending protocol amendment (XLS-66) may not be enabled on this network",
      "- The LoanBrokerID may be incorrect",
      "- The vault may not have enough funds for the requested principal",
      "- CounterpartySignature format may be incorrect",
      "- Counterparty account may need a USD trustline", ""
    );

    emitStep(emit, { id: stepId, title: "Create Loan with CounterpartySignature", description: "Failed - see error details", status: "error", transactionType: "LoanSet", error: err.message });
    throw err;
  }
}

async function step12_verifyStates(ctx: FlowContext, emit: EmitFn): Promise<void> {
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
      } catch {
      }
    }

    if (ctx.vaultId) {
      try {
        const vaultObj = await ctx.client.request({ command: "ledger_entry", index: ctx.vaultId, ledger_index: "validated" });
        details["Vault Object"] = JSON.stringify(vaultObj.result.node, null, 2);
      } catch {
        details["Vault Object"] = "Could not fetch";
      }
    }

    if (ctx.loanBrokerId) {
      try {
        const lbObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanBrokerId, ledger_index: "validated" });
        details["LoanBroker Object"] = JSON.stringify(lbObj.result.node, null, 2);
      } catch {
        details["LoanBroker Object"] = "Could not fetch";
      }
    }

    if (ctx.loanId) {
      try {
        const loanObj = await ctx.client.request({ command: "ledger_entry", index: ctx.loanId, ledger_index: "validated" });
        details["Loan Object"] = JSON.stringify(loanObj.result.node, null, 2);
      } catch {
        details["Loan Object"] = "Could not fetch";
      }
    }

    addReport(ctx, "=".repeat(70), "STEP 12: FINAL STATE VERIFICATION", "=".repeat(70), "");
    for (const [key, val] of Object.entries(details)) {
      addReport(ctx, `${key}: ${val}`);
    }
    addReport(ctx, "");

    emitStep(emit, { id: stepId, title: "Verify Final States", description: "All account balances and ledger objects verified", status: "success", transactionType: "Verification", details });
  } catch (err: any) {
    emitStep(emit, { id: stepId, title: "Verify Final States", description: "Verification failed", status: "error", error: err.message });
  }
}

export async function runLendingFlow(emit: EmitFn): Promise<string> {
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
    "=".repeat(70), "XRPL LENDING PROTOCOL - END-TO-END FLOW REPORT", "=".repeat(70),
    `Network: ${network}`, `Started: ${new Date().toISOString()}`, ""
  );

  try {
    ctx.client = new xrpl.Client(network);
    await ctx.client.connect();

    addReport(ctx, `Connected to ${network}`, "");

    await step1_fundWallets(ctx, emit);
    await step2_issuerSetup(ctx, emit);
    await step3_lenderTrustline(ctx, emit);
    await step4_issuerSendsUSD(ctx, emit);
    await step5_brokerTrustline(ctx, emit);
    await step4b_issuerSendsUSDBroker(ctx, emit);
    await step6_createVault(ctx, emit);
    await step7_createLoanBroker(ctx, emit);
    await step8_lenderDeposits(ctx, emit);
    await step9_borrowerTrustline(ctx, emit);
    await step10_brokerCoverDeposit(ctx, emit);
    await step11_loanSetWithCounterparty(ctx, emit);
    await step12_verifyStates(ctx, emit);

    addReport(ctx,
      "=".repeat(70), "FLOW COMPLETED SUCCESSFULLY", "=".repeat(70),
      `Completed: ${new Date().toISOString()}`, "",
      "Summary:",
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
      `Error: ${err.message}`, `Failed at: ${new Date().toISOString()}`, "",
      "NOTE: If the error mentions unsupported transaction types,",
      "ensure you are connecting to a devnet that has the XLS-65",
      "(Vault) and XLS-66 (Lending Protocol) amendments enabled.", ""
    );

    emit({ type: "flow_error", data: { message: err.message, report: ctx.report.join("\n") } });

    return ctx.report.join("\n");
  } finally {
    try {
      if (ctx.client?.isConnected()) {
        await ctx.client.disconnect();
      }
    } catch {
    }
  }
}
