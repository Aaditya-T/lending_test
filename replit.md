# XRPL Lending Protocol Demo

## Overview
End-to-end demo of the XRPL Lending Protocol (XLS-66) with Single Asset Vaults (XLS-65). The app creates 4 parties (Issuer, Lender, Borrower, Broker) and executes a complete lending flow on the XRPL Devnet, using the CounterpartySignature co-signing pattern for LoanSet transactions.

## Architecture
- **Frontend**: React + Vite dashboard at port 5000 - entire XRPL flow runs client-side in the browser
- **Backend**: Express server (minimal - serves static files only, no API endpoints)
- **XRPL**: Uses xrpl.js v4.6.0 client-side with Buffer polyfill for browser compatibility

## Key Files
- `client/src/pages/dashboard.tsx` - Main dashboard UI with real-time step tracking
- `client/src/lib/xrpl-flow.ts` - Client-side XRPL transaction flow logic (all 12 steps)
- `server/routes.ts` - Minimal server routes (no XRPL logic)
- `shared/schema.ts` - Shared types (FlowStep, Party, etc.)

## Flow Steps
1. Fund 4 wallets via faucet
2. Issuer enables DefaultRipple
3. Lender creates USD trustline
4. Issuer sends USD to Lender
5. Broker creates USD trustline
6. Broker creates Vault (VaultCreate)
7. Broker creates LoanBroker (LoanBrokerSet)
8. Lender deposits USD in Vault (VaultDeposit)
9. Borrower creates USD trustline
10. Borrower requests loan (LoanSet with CounterpartySignature)
11. Co-signed LoanSet (Broker signs first, Borrower co-signs via signLoanSetByCounterparty)
12. Verify final states

## Co-Signing Pattern
Uses CounterpartySignature (not multi-sign/SignerList):
- Broker creates and signs LoanSet transaction
- Borrower co-signs using `xrpl.signLoanSetByCounterparty(wallet, brokerSignedTxBlob)`
- Final transaction contains CounterpartySignature field

## Network
- Devnet: wss://s.devnet.rippletest.net:51233

## User Preferences
- Browser-based execution preferred over server-side
- No unnecessary backend complexity
