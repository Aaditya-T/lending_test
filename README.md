# XRPL Lending Protocol Demo

A full-stack web application that demonstrates the end-to-end flow of the XRPL Lending Protocol (XLS-66) combined with Single Asset Vaults (XLS-65) on the XRPL Devnet.

## Overview

This demo creates **4 parties** and executes a complete lending lifecycle in 12 automated steps, streaming real-time progress to a React dashboard via Server-Sent Events (SSE).

### Parties

| Party | Role |
|-------|------|
| **Currency Issuer** | Issues USD tokens on the XRPL |
| **Lender** | Receives USD from Issuer and deposits into a Vault |
| **Borrower** | Requests a loan and co-signs the LoanSet transaction |
| **Broker** | Creates the Vault, LoanBroker, and orchestrates the loan |

## The 12-Step Flow

| Step | Transaction Type | Description |
|------|-----------------|-------------|
| 1 | Faucet | Fund all 4 wallets on XRPL Devnet |
| 2 | AccountSet | Enable DefaultRipple on the Issuer account |
| 3 | TrustSet | Lender creates a USD trustline to the Issuer |
| 4 | Payment | Issuer sends 10,000 USD to the Lender |
| 5 | TrustSet | Broker creates a USD trustline to the Issuer |
| 6 | VaultCreate (XLS-65) | Broker creates a Single Asset Vault for USD |
| 7 | LoanBrokerSet (XLS-66) | Broker creates a LoanBroker entry linked to the Vault |
| 8 | VaultDeposit (XLS-65) | Lender deposits 5,000 USD into the Vault |
| 9 | TrustSet | Borrower creates a USD trustline to receive the loan |
| 10 | Preparation | Borrower confirms XRP collateral readiness |
| 11 | LoanSet (XLS-66) | Broker creates the loan; Borrower co-signs via CounterpartySignature |
| 12 | Verification | Query final account balances and ledger objects |

## CounterpartySignature Co-Signing Flow

The LoanSet transaction uses the **CounterpartySignature** pattern (not standard XRPL multi-sign):

1. Broker creates and autofills the LoanSet transaction with `Counterparty` set to the Borrower's address
2. Broker signs the transaction first using `wallet.sign()`
3. Borrower co-signs the broker-signed transaction using `xrpl.signLoanSetByCounterparty(borrowerWallet, brokerSignedTxBlob)`
4. This embeds a `CounterpartySignature` object (containing `SigningPubKey` and `TxnSignature`) into the transaction
5. The co-signed transaction is submitted to the ledger
6. The ledger verifies both the Broker's signature and the Borrower's CounterpartySignature

This proves both parties agreed to the loan terms without requiring a SignerList or traditional multi-sign setup.

## Key LoanSet Fields

| Field | Description |
|-------|-------------|
| `PrincipalRequested` | The amount of USD the borrower is requesting |
| `Counterparty` | The borrower's XRPL address |
| `CounterpartySignature` | The borrower's co-signature proving agreement |
| `InterestRate` | Interest rate in basis points (e.g., 500 = 5%) |
| `PaymentInterval` | Time between payments in seconds |
| `PaymentTotal` | Total number of payments |
| `LoanBrokerID` | Reference to the LoanBroker ledger object |

## Tech Stack

- **Frontend**: React, TailwindCSS, shadcn/ui
- **Backend**: Express.js with SSE streaming
- **XRPL**: xrpl.js v4.6.0 (native support for VaultCreate, LoanBrokerSet, LoanSet)
- **Network**: XRPL Devnet (`wss://s.devnet.rippletest.net:51233`)

## Running

Click **Run Full Flow** in the dashboard to execute all 12 steps. The UI displays:

- Real-time step progress with a progress bar (0/12 through 12/12)
- Party cards showing wallet addresses and balances
- Expandable step details with transaction hashes and results
- A detailed report with full transaction data and affected nodes

## XRPL Amendments Used

- **XLS-65 (Single Asset Vault)**: `VaultCreate`, `VaultDeposit` — creates a vault to pool lender funds
- **XLS-66 (Lending Protocol)**: `LoanBrokerSet`, `LoanSet` — creates a loan broker and issues loans with counterparty co-signing

Both amendments are enabled on the standard XRPL Devnet.
