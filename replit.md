# XRPL Lending Protocol Demo

## Overview
End-to-end demo of the XRPL Lending Protocol (XLS-66) with Single Asset Vaults (XLS-65). The app creates 4 parties (Issuer, Lender, Borrower, Broker) and executes a complete lending flow on the XRPL Devnet, including multi-signed LoanSet transactions.

## Architecture
- **Frontend**: React + Vite dashboard at port 5000
- **Backend**: Express server with SSE streaming for real-time flow updates
- **XRPL**: Uses xrpl.js to interact with XRPL Devnet

## Key Files
- `client/src/pages/dashboard.tsx` - Main dashboard UI
- `server/xrpl-flow.ts` - XRPL transaction flow logic
- `server/routes.ts` - SSE endpoint for flow execution
- `shared/schema.ts` - Shared types

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
10. Broker sets up SignerList (for multi-sign)
11. Co-signed LoanSet (Borrower signs first, then Broker)
12. Verify final states

## Network
- Devnet: wss://s.devnet.rippletest.net:51233
