# XRPL Lending Protocol Demo

## Overview
End-to-end demo of the XRPL Lending Protocol (XLS-66) with Single Asset Vaults (XLS-65). The app creates 4 parties (Issuer, Lender, Borrower, Broker) and executes a complete lending flow on the XRPL Devnet, using the CounterpartySignature co-signing pattern for LoanSet transactions. XLS-66 is an uncollateralized lending protocol with first-loss capital protection.

## Architecture
- **Frontend**: React + Vite dashboard at port 5000 - entire XRPL flow runs client-side in the browser
- **Backend**: Express server (minimal - serves static files only for Replit dev, no API endpoints)
- **XRPL**: Uses xrpl.js v4.6.0 client-side with Buffer polyfill for browser compatibility
- **Deployment**: Pure static site - deployable to Vercel/Netlify/any static host via vercel.json

## Key Files
- `client/src/pages/dashboard.tsx` - Main dashboard UI with real-time step tracking
- `client/src/lib/xrpl-flow.ts` - Client-side XRPL transaction flow logic (all 12 steps)
- `client/src/lib/types.ts` - TypeScript types (FlowStep, Party, FlowState)
- `server/` - Minimal Express server for Replit dev only (no XRPL logic)
- `vercel.json` - Vercel deployment configuration

## Flow Steps
1. Fund 4 wallets via faucet
2. Issuer enables DefaultRipple
3. Lender creates USD trustline
4. Issuer sends USD to Lender (10,000 USD)
5. Broker creates USD trustline
4b. Issuer sends USD to Broker (1,000 USD for first-loss capital)
6. Broker creates Vault (VaultCreate)
7. Broker creates LoanBroker (LoanBrokerSet)
8. Lender deposits USD in Vault (VaultDeposit - 5,000 USD)
9. Borrower creates USD trustline
10. Broker deposits first-loss capital (LoanBrokerCoverDeposit - 500 USD)
11. Create Loan (LoanSet with CounterpartySignature co-signing)
12. Verify final states (query balances and ledger objects)

## Co-Signing Pattern
Uses CounterpartySignature (not multi-sign/SignerList):
- Broker creates and signs LoanSet transaction
- Borrower co-signs using `xrpl.signLoanSetByCounterparty(wallet, brokerSignedTxBlob)`
- Final transaction contains CounterpartySignature field

## First-Loss Capital (Cover)
- Broker must deposit first-loss capital via LoanBrokerCoverDeposit before issuing loans
- Protocol enforces: CoverAvailable >= DebtTotal * CoverRateMinimum
- Without sufficient cover, new loans are blocked (tecINSUFFICIENT_FUNDS)
- Cover protects vault depositors from loan defaults

## Pre-flight Diagnostics
- Before LoanSet, the flow queries Vault and LoanBroker ledger objects
- Reports AssetsAvailable, DebtTotal, CoverAvailable etc.
- Helps diagnose tecINSUFFICIENT_FUNDS errors

## Network
- Devnet: wss://s.devnet.rippletest.net:51233

## User Preferences
- Browser-based execution preferred over server-side
- No unnecessary backend complexity
- Must be deployable to static hosting (Vercel, Netlify, etc.)
