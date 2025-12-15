# FAQ Links Implementation To-Do List

This document tracks the implementation of FAQ links throughout the Albion platform to improve user-friendliness.

---

## Priority 1: High-Impact Areas

### Claiming USDC Funds
- [ ] Add FAQ link in "Claims & Payouts" hero section (`claims/+page.svelte:419-456`)
  - Explain "Available to Claim" vs "Total Earned" vs "Total Claimed"
- [ ] Add gas reminder near "Claim All" button (`claims/+page.svelte:446-456`)
- [ ] Add troubleshooting link to data load error state (`claims/+page.svelte:379-407`)
- [ ] Add FAQ link in Claim History section (`claims/+page.svelte:562-649`)
  - Explain transaction status vs actual fund arrival
- [ ] Add explanation for "PRODUCING" status on asset claim cards (`claims/+page.svelte:471-520`)

### Buying Tokens with USDC on Base
- [ ] Add "Need USDC on Base?" link near balance display (`TokenPurchaseWidget.svelte:217-241`)
- [ ] Add "What is approval?" link at approval step (`TokenPurchaseWidget.svelte:277-310`)
- [ ] Add timing expectations to status messages (`TokenPurchaseWidget.svelte:365-378`)
- [ ] Add "What happens next?" link in success modal (`TokenPurchaseWidget.svelte:691-741`)
- [ ] Add "Why did this fail?" link in error state (`TokenPurchaseWidget.svelte:742-752`)

### Getting Gas
- [ ] Add "Need ETH for gas?" link in purchase widget (`TokenPurchaseWidget.svelte:563-572`)
- [ ] Add gas requirement note before claim buttons (`claims/+page.svelte:452`)
- [ ] Add gas troubleshooting to transaction error states

### Tracking/Finding Tokens
- [ ] Add "Can't find token in wallet?" link in purchase success modal (`TokenPurchaseWidget.svelte:691-741`)
- [ ] Add token tracking help in portfolio view (`portfolio/+page.svelte:1074-1080`)

---

## Priority 2: Portfolio Metrics Explanations

- [ ] Add detailed FAQ link for "Capital Returned" (`portfolio/+page.svelte:1114-1134`)
- [ ] Add FAQ link for "Asset Depletion" percentage (`portfolio/+page.svelte:1137-1158`)
- [ ] Add FAQ link for "Capital To be Recovered" vs "Lifetime Profit" (`portfolio/+page.svelte:1160-1171`)
- [ ] Add explanation for editing "Total Invested" (`portfolio/+page.svelte:1084-1101`)

---

## Priority 3: Asset Detail Page

- [ ] Add FAQ for "Implied Barrels/Token" metric (`assets/[id]/+page.svelte:1368-1387`)
- [ ] Add FAQ for "Breakeven Oil Price" calculation (`assets/[id]/+page.svelte:1389-1405`)
- [ ] Add FAQ for "Returns @$65 Oil Price" assumptions (`assets/[id]/+page.svelte:1430-1432`)

---

## Priority 4: Wallet & Network Help

- [ ] Add supported wallets FAQ link in header/connection area
- [ ] Add network switching help (Base vs Ethereum) in purchase flows
- [ ] Add "Wallet prompt disappeared?" help in transaction flows

---

## New FAQ Content to Write

Before implementing links, these FAQ entries need to be added to `/routes/(main)/support/+page.svelte`:

### Must Have
- [ ] "What does 'approval' mean?" - ERC20 approval pattern explanation
- [ ] "How long do transactions take?" - Block confirmation timing
- [ ] "Why is my USDC balance showing 0?" - Network selection, bridging
- [ ] "How do I add Base network to my wallet?" - Network setup guide

### Nice to Have
- [ ] "What is asset depletion and how does it affect returns?"
- [ ] "How is 'Capital Returned' calculated?"
- [ ] "What happens after I reach breakeven?"
- [ ] "Why did my transaction fail?" - Common failure reasons & solutions
- [ ] "What does PRODUCING status mean?"
- [ ] "How do payouts work?"

---

## Implementation Notes

### Link Style
Consider using a consistent pattern like:
- Inline text links: "Learn more about claiming"
- Help icons (?) with tooltips linking to FAQ
- Contextual banners for complex flows

### Existing FAQ Location
Current FAQ content is in `/routes/(main)/support/+page.svelte`
- Q1 (lines 25-37): Gas fees guide
- Q2 (lines 40-51): USDC payment on Base
- Q3 (lines 54-66): Yield claiming process
- Q4 (lines 69-95): Finding tokens in wallet

### Anchor Links
Consider adding anchor IDs to FAQ sections for direct linking:
- `#gas-fees`
- `#usdc-payment`
- `#claiming`
- `#find-tokens`
- `#approval`
- `#transaction-time`

---

## Progress Tracking

| Area | Items | Completed |
|------|-------|-----------|
| Claiming USDC | 5 | 0 |
| Buying Tokens | 5 | 0 |
| Getting Gas | 3 | 0 |
| Token Tracking | 2 | 0 |
| Portfolio Metrics | 4 | 0 |
| Asset Details | 3 | 0 |
| Wallet/Network | 3 | 0 |
| New FAQ Content | 8 | 0 |
| **Total** | **33** | **0** |
