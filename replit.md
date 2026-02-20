# XRPL Lending Protocol Demo

## Overview
End-to-end demo of the XRPL Lending Protocol (XLS-66) with Single Asset Vaults (XLS-65). The app creates 4 parties (Issuer, Lender, Borrower, Broker) and executes complete lending scenarios on the XRPL Devnet, using the CounterpartySignature co-signing pattern for LoanSet transactions. XLS-66 is an uncollateralized lending protocol with first-loss capital protection.

## Architecture
- **Frontend**: React + Vite dashboard at port 5000 - entire XRPL flow runs client-side in the browser
- **Backend**: Express server (minimal - serves static files only for Replit dev, no API endpoints)
- **XRPL**: Uses xrpl.js v4.6.0 client-side with Buffer polyfill for browser compatibility
- **Deployment**: Pure static site - deployable to Vercel/Netlify/any static host via vercel.json
- **Dark Mode**: ThemeProvider with class-based toggle, localStorage persistence

## Key Files
- `client/src/pages/dashboard.tsx` - Main dashboard UI with scenario selector, real-time step tracking, party cards, export/import
- `client/src/lib/xrpl-flow.ts` - Client-side XRPL transaction flow logic with all transaction types and scenario engine
- `client/src/lib/types.ts` - TypeScript types (FlowStep, Party, FlowState, ScenarioId, ScenarioConfig, SCENARIOS)
- `client/src/components/theme-provider.tsx` - ThemeProvider context with dark/light toggle
- `client/src/components/theme-toggle.tsx` - Theme toggle button component
- `server/` - Minimal Express server for Replit dev only (no XRPL logic)
- `vercel.json` - Vercel deployment configuration

## Scenarios
The app supports 6 scenarios, all sharing a common setup phase (11 steps):
1. **Loan Creation** - Setup + LoanSet (CounterpartySignature) + verify (base scenario)
2. **Loan Payment** - Setup + LoanSet + LoanPay + verify
3. **Loan Default** - Setup + LoanSet + LoanManage (default) + LoanDelete + verify
4. **Early Repayment** - Setup + LoanSet + LoanPay (full early) + LoanDelete + verify
5. **Full Lifecycle** - Setup + LoanSet + LoanPay + LoanManage + LoanDelete + CoverWithdraw + BrokerDelete + VaultWithdraw + VaultDelete
6. **SignerList Loan** - Setup + SignerListSet (multi-sig config) + LoanSet (via Signers array multi-sig) + verify

## Shared Setup Steps (all scenarios) — Parallelized
Setup uses 6 phases with parallel execution and XLS-56 Batch transactions:
- **Phase 1**: Fund 4 wallets via faucet (parallel faucet calls)
- **Phase 2**: Issuer enables DefaultRipple
- **Phase 3** (parallel): Lender TrustSet || Broker TrustSet || Borrower TrustSet
- **Phase 4** (parallel): Batch Issuer Payments (XLS-56: 10,000 USD→Lender + 1,000 USD→Broker in one atomic tx) || VaultCreate
- **Phase 5** (parallel): LoanBrokerSet || VaultDeposit (5,000 USD)
- **Phase 6**: Broker deposits first-loss capital (LoanBrokerCoverDeposit - 500 USD)

Wall-clock time reduced from 11 sequential transactions to ~6 parallel phases.

## Transaction Types Implemented
- AccountSet, TrustSet, Payment, SignerListSet (standard XRPL)
- Batch (XLS-56 — single-account Batch for Issuer payments, ALLORNOTHING mode)
- VaultCreate, VaultDeposit, VaultWithdraw, VaultDelete (XLS-65)
- LoanBrokerSet, LoanBrokerCoverDeposit, LoanBrokerCoverWithdraw, LoanBrokerDelete (XLS-66)
- LoanSet (with CounterpartySignature OR multi-sig Signers), LoanPay, LoanManage, LoanDelete (XLS-66)

## Co-Signing Patterns (Two Approaches)
### 1. CounterpartySignature (XLS-66 specific)
- Broker creates and signs LoanSet transaction
- Borrower co-signs using `xrpl.signLoanSetByCounterparty(wallet, brokerSignedTxBlob)`
- Final transaction contains CounterpartySignature field

### 2. SignerList Multi-Sig (Standard XRPL)
- Broker sets up SignerListSet with Lender as delegate signer (quorum=1)
- Note: XRPL prohibits accounts from being in their own SignerList
- Note: Counterparty (Borrower) cannot also be a multi-sig signer (temBAD_SIGNER)
- LoanSet is built with `SigningPubKey: ""` for multi-sig
- Lender signs with `wallet.sign(tx, true)` (multi-sign mode, as broker delegate)
- Signature assembled via `xrpl.multisign([lenderBlob])`
- CounterpartySignature manually computed (can't use `signLoanSetByCounterparty` since it requires TxnSignature which multi-sig doesn't have)
  - Decode multisigned blob → `encodeForSigning()` → `keypairSign()` → add CounterpartySignature → re-encode
- Combines BOTH authorization mechanisms: multi-sig (Account) + CounterpartySignature (Counterparty)
- Fee adjusted to `(signers + 1) * baseFee` per XRPL multi-sig rules

## First-Loss Capital (Cover)
- Broker must deposit first-loss capital via LoanBrokerCoverDeposit before issuing loans
- Protocol enforces: CoverAvailable >= DebtTotal * CoverRateMinimum
- Without sufficient cover, new loans are blocked (tecINSUFFICIENT_FUNDS)
- Cover protects vault depositors from loan defaults

## Features
- Dark mode with localStorage persistence
- Devnet explorer links for all addresses and transaction hashes
- Session warning banner (data is temporary)
- Export/Import flow results as JSON
- Scenario selector with visual flow diagrams
- Real-time step tracking with progress bar
- Detailed report with copy functionality
- Batch/Normal transaction toggle (XLS-56 Batch ON/OFF)

## Network
- Devnet: wss://s.devnet.rippletest.net:51233

## User Preferences
- Browser-based execution preferred over server-side
- No unnecessary backend complexity
- Must be deployable to static hosting (Vercel, Netlify, etc.)
