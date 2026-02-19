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
The app supports 5 scenarios, all sharing a common setup phase (11 steps):
1. **Loan Creation** - Setup + LoanSet + verify (base scenario)
2. **Loan Payment** - Setup + LoanSet + LoanPay + verify
3. **Loan Default** - Setup + LoanSet + LoanManage (default) + LoanDelete + verify
4. **Early Repayment** - Setup + LoanSet + LoanPay (full early) + LoanDelete + verify
5. **Full Lifecycle** - Setup + LoanSet + LoanPay + LoanManage + LoanDelete + CoverWithdraw + BrokerDelete + VaultWithdraw + VaultDelete

## Shared Setup Steps (all scenarios)
1. Fund 4 wallets via faucet
2. Issuer enables DefaultRipple
3. Lender creates USD trustline
4. Issuer sends USD to Lender (10,000 USD)
5. Broker creates USD trustline
6. Issuer sends USD to Broker (1,000 USD for first-loss capital)
7. Broker creates Vault (VaultCreate)
8. Broker creates LoanBroker (LoanBrokerSet)
9. Lender deposits USD in Vault (VaultDeposit - 5,000 USD)
10. Borrower creates USD trustline
11. Broker deposits first-loss capital (LoanBrokerCoverDeposit - 500 USD)

## Transaction Types Implemented
- AccountSet, TrustSet, Payment (standard XRPL)
- VaultCreate, VaultDeposit, VaultWithdraw, VaultDelete (XLS-65)
- LoanBrokerSet, LoanBrokerCoverDeposit, LoanBrokerCoverWithdraw, LoanBrokerDelete (XLS-66)
- LoanSet (with CounterpartySignature), LoanPay, LoanManage, LoanDelete (XLS-66)

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

## Features
- Dark mode with localStorage persistence
- Devnet explorer links for all addresses and transaction hashes
- Session warning banner (data is temporary)
- Export/Import flow results as JSON
- Scenario selector with visual flow diagrams
- Real-time step tracking with progress bar
- Detailed report with copy functionality

## Network
- Devnet: wss://s.devnet.rippletest.net:51233

## User Preferences
- Browser-based execution preferred over server-side
- No unnecessary backend complexity
- Must be deployable to static hosting (Vercel, Netlify, etc.)
