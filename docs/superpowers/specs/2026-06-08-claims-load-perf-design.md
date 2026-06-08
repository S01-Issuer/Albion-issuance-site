# Claims & Portfolio load perf — deferred proofs, real CID integrity, static orders

**Date:** 2026-06-08
**Status:** Approved (design)
**Scope:** one PR

## Problem

Cold loads of Claims and Portfolio do redundant, immutable work on every visit.
The server already caches the expensive parts (Hypersync context-event scan in
Vercel Blob; CSV bytes via `Cache-Control: immutable`). The remaining cost is
client-side and re-done every load:

1. Each CSV's merkle tree is rebuilt **twice** — once to re-validate the root,
   once to pre-generate claim proofs (`ClaimsService.processClaimForWallet`,
   `claims.ts:287` + `ClaimsService.ts:443`). ~30 CSVs × O(n log n) × 2.
2. v4 orders resolve their `orderBytes` + deploy block from the orderbook
   subgraph on every load (`getOrdersByHashes`) — a network round-trip and a
   live dependency, for data that is immutable.
3. The "content-hash" integrity check is a **no-op**: `validateIPFSContent`
   (`claims.ts:321`) compares the CID in the URL to itself; it never hashes the
   returned bytes. So the merkle rebuild is, today, the *only* real integrity
   gate on CSV bytes.

## Why this departs from PR #176

PR #176 (SWR + sessionStorage) makes **repeat** loads instant by caching the
whole per-wallet result. It does not touch **first**-load cost, and its
streaming partials produce misleading aggregates mid-load (totals dip below
true, Portfolio briefly shows $0 earned). It caches the per-user *output* but
leaves the immutable *inputs* (CSVs, trees, proofs, order bytes) re-computed
every time.

This work attacks the inputs instead: do immutable work **once** (or never, on
the load path). It is complementary to caching, not a replacement — but it fixes
the first-load case PR #176 can't, and removes the partial-aggregate footgun by
not needing to stream the load at all.

## Changes

### A. Real content-hash integrity (replaces the no-op)
Replace `validateIPFSContent`'s string compare with genuine verification via
`multiformats`: `sha256(bytes)` → `CID.create(1, raw.code, hash)` → assert
`=== expectedContentHash`. Cache verified CIDs in `localStorage`
(`albion-verified-cids`); CIDs are immutable, so verify-once-trust-forever.
**Why:** the current check proves nothing; this proves the bytes are the pinned
content, and is cheaper than the merkle rebuild it replaces.

### B. Defer merkle tree + proofs to claim time
- Load (`processClaimForWallet`): remove `getMerkleTree` (`:443`) and the proof
  block (`:477-499`). Keep `sortClaimsData` — it derives claimed/unclaimed from
  Context logs, no tree needed. Holdings return without `signedContext`.
- `fetchAndValidateCSV` → `fetchAndVerifyCSV`: CID check only, no merkle on load.
- Claim (`executeClaimsForOrderbook`, `claims/+page.svelte:348`): on click, for
  the targeted order, fetch CSV (browser-cached), build the tree **once**,
  generate proof + `signedContext`, **assert computed root === expectedMerkleRoot**
  (hard gate), submit.
**Why:** the tree/proofs are only needed to *execute* a claim, not to *display*
one. Building them on the load path costs every visitor; building on click costs
only the one order being claimed. The contract re-verifies the proof regardless,
so the claim-time assert is belt-and-suspenders.

### C. Static v4 + April orders (drop the subgraph)
A one-off script queries the existing `ORDERBOOK_SOURCES` subgraphs for each
subgraph-resolved order (9 v4 R1 + 5 v4 R2 + 2 April), cross-checks the order's
embedded merkle root against the `expectedMerkleRoot` already in `network.ts`,
then bakes `orderBytes` + `deployBlock` into those entries (as v6 already does).
Then delete `getOrdersByHashes` and the `hashesNeedingSubgraph` path outright.
**Why:** order bytes/blocks are immutable once deployed; resolving them at
runtime buys nothing and adds a network dependency that can be slow or down.

## Data flow (cold load)

```
BEFORE  fetch CSV → rebuild tree (root check) → sortClaims → rebuild tree → gen proofs   ×30
        + v4 subgraph getOrdersByHashes
AFTER   fetch CSV → verify CID (once, cached)  → sortClaims                               ×30
        (no subgraph, no tree, no proofs)
CLAIM   fetch CSV (cached) → build tree once → proof → assert root==expected → submit
```

## Risk & testing

- **C is highest risk** (wrong `orderBytes` → broken claim). The generator
  script gates each write on the root cross-check; verify on preview deploy
  before merge. No runtime fallback after deletion — correctness is proven at
  build time, not papered over at runtime.
- **B** claim-time root assertion guarantees a wrong/tampered CSV throws before
  signing — never a submitted tx.
- Tests: CID verify (valid / tampered / cached); claim-time proof + root assert;
  regression that load path no longer calls `getMerkleTree`; e2e claim on
  preview before merge.

## PR description (dev-facing, short)

> **perf(claims): do immutable work once, not every load**
>
> Claims/Portfolio re-did immutable work on every visit. This stops that.
>
> - **Defer merkle proofs to claim time.** Load was building each CSV's merkle
>   tree twice (root check + proof gen) for ~30 CSVs. Proofs are only needed to
>   *submit* a claim, so build the tree on click, for the one order claimed.
>   Load now does zero merkle work.
> - **Real CSV integrity.** The old content-hash check compared the CID to
>   itself (a no-op). Now we sha256 the bytes and rebuild the CID
>   (`multiformats`), and assert the merkle root at claim time. Strictly more
>   secure than before, and cheaper.
> - **Static v4 orders.** v4 order bytes/blocks are immutable but were fetched
>   from the subgraph every load. Baked into `network.ts` (as v6 already is);
>   subgraph lookup deleted.
>
> **Why not just extend #176's caching?** #176 caches the per-wallet *output*,
> so repeat loads are instant but the *first* load is unchanged (and its
> streaming partials show misleading totals mid-load). This caches/eliminates
> the immutable *inputs*, which fixes first load too. Complementary, not a
> revert.
>
> Funds were never at risk either way — the orderbook contract verifies every
> proof on-chain at claim time.
