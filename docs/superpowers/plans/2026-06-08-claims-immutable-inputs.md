# Claims/Portfolio Load Perf — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claims/Portfolio first-load fast by doing immutable work once (or never on the load path): real CID integrity, merkle proofs deferred to claim time, and static v4/April orders with no subgraph lookup.

**Architecture:** Three independent workstreams in one PR. (A) Replace the no-op content-hash check with a real `multiformats` CID verification, cached forever. (B) Gate merkle-tree/proof generation behind a `withProofs` flag set only by the pre-claim `refreshClaimableHoldings`; the display load does zero merkle work. (C) Bake `orderBytes`+`deployBlock`+`orderbook` into `network.ts` for the 16 subgraph-resolved orders and delete the subgraph order lookup.

**Tech Stack:** SvelteKit, TypeScript, vitest, `@openzeppelin/merkle-tree`, `multiformats` (new), Base/Raindex orderbook.

**Spec:** `docs/superpowers/specs/2026-06-08-claims-load-perf-design.md`

**Branch:** `perf/claims-immutable-inputs` (off `main`, already created).

---

## File Structure

- `src/lib/utils/cidVerify.ts` — **new.** `verifyCid(bytes, expectedCid)` + a `localStorage`-backed verified-CID set. One responsibility: prove fetched bytes match a CIDv1.
- `src/lib/utils/cidVerify.test.ts` — **new.** Unit tests for CID verify (valid / tampered / cached).
- `src/lib/utils/claims.ts` — modify. `validateIPFSContent`→real check; `fetchAndValidateCSV`→`fetchAndVerifyCSV` (CID only, no merkle on load). Keep `validateCSVIntegrity`/`getMerkleTree` for claim time.
- `src/lib/services/ClaimsService.ts` — modify. `withProofs` flag on `loadClaimsForWallet`/`processClaimForWallet`; gate tree+proof block; generalize static-order resolution to use `claim.orderbook`; claim-time root assert; delete `getOrdersByHashes` call.
- `src/lib/network.ts` — modify. Add `orderbook?: string` to `Claim`; bake static data into 16 entries.
- `src/lib/data/repositories/claimsRepository.ts` + `repositories/index.ts` — modify. Delete `getOrdersByHashes`, `getOrderByHash`, and the re-export.
- `src/routes/(main)/claims/+page.svelte` — modify. `refreshClaimableHoldings` passes `withProofs:true`, skips display-cache write; `OrderEntry` `order`/`signedContext` optional.
- `scripts/bake-static-orders.mjs` — **new.** One-off generator: fetch `orderBytes`+`deployBlock`+`orderbook` per order, cross-check embedded root vs `expectedMerkleRoot`, emit patch.

---

## Chunk 1: Real CID integrity (Change A)

### Task 1: CID verification utility + verified-cache

**Files:**
- Create: `src/lib/utils/cidVerify.ts`
- Test: `src/lib/utils/cidVerify.test.ts`

- [ ] **Step 1: Add dependency**

Run: `npm i multiformats`
Expected: `multiformats` added to `package.json` dependencies.

- [ ] **Step 2: Write failing test**

```ts
// src/lib/utils/cidVerify.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { verifyCid, __resetVerifiedCidCacheForTest } from "./cidVerify";

// "hello\n" pinned as a CIDv1 raw sha256 (precomputed):
const HELLO = new TextEncoder().encode("hello\n");
const HELLO_CID = "bafkre id..."; // REPLACE in Step 3 with the real CID printed by the helper below

describe("verifyCid", () => {
  beforeEach(() => __resetVerifiedCidCacheForTest());

  it("accepts bytes whose CIDv1 matches", async () => {
    expect(await verifyCid(HELLO, HELLO_CID)).toBe(true);
  });

  it("rejects tampered bytes", async () => {
    const bad = new TextEncoder().encode("hellp\n");
    expect(await verifyCid(bad, HELLO_CID)).toBe(false);
  });

  it("short-circuits a previously-verified CID without re-hashing", async () => {
    expect(await verifyCid(HELLO, HELLO_CID)).toBe(true);
    // second call returns true even if given wrong bytes, because CID is cached-verified
    expect(await verifyCid(new Uint8Array(), HELLO_CID)).toBe(true);
  });
});
```

- [ ] **Step 3: Print the real CID for the fixture, paste into test**

Run:
```bash
node --input-type=module -e '
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";
const b = new TextEncoder().encode("hello\n");
const h = await sha256.digest(b);
console.log(CID.create(1, raw.code, h).toString());'
```
Replace `HELLO_CID` in the test with the printed value (a `bafkrei…`).

- [ ] **Step 4: Run test, verify it fails**

Run: `npx vitest run src/lib/utils/cidVerify.test.ts`
Expected: FAIL ("verifyCid is not a function" / module not found).

- [ ] **Step 5: Implement**

```ts
// src/lib/utils/cidVerify.ts
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const STORAGE_KEY = "albion-verified-cids";

function loadVerified(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}
let verified: Set<string> = loadVerified();

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...verified]));
  } catch {
    /* quota/private mode — in-memory set still works */
  }
}

/** Verify bytes hash to expectedCid (CIDv1, raw codec, sha-256). Verify-once-trust-forever. */
export async function verifyCid(
  bytes: Uint8Array,
  expectedCid: string,
): Promise<boolean> {
  if (verified.has(expectedCid)) return true;
  try {
    const digest = await sha256.digest(bytes);
    const cid = CID.create(1, raw.code, digest).toString();
    if (cid === expectedCid) {
      verified.add(expectedCid);
      persist();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** test-only */
export function __resetVerifiedCidCacheForTest() {
  verified = new Set();
}
```

- [ ] **Step 6: Run test, verify pass**

Run: `npx vitest run src/lib/utils/cidVerify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/utils/cidVerify.ts src/lib/utils/cidVerify.test.ts
git commit -m "feat(claims): real CIDv1 content-hash verification util with verify-once cache"
```

### Task 2: Use real CID check on the load path; stop rebuilding merkle to validate

**Files:**
- Modify: `src/lib/utils/claims.ts` (`validateIPFSContent` ~321, `fetchAndValidateCSV` ~369)
- Modify: `src/lib/services/ClaimsService.ts` (`fetchCsv` ~100, call site ~114)

- [ ] **Step 1: Replace `validateIPFSContent` body** (`claims.ts:321`) with a real check that fetches+hashes via `verifyCid`. New signature takes the fetched `bytes`:

```ts
import { verifyCid } from "./cidVerify";

// Validates that already-fetched CSV bytes match the pinned CID.
export async function validateIPFSContent(
  bytes: Uint8Array,
  expectedContentHash: string,
): Promise<IPFSValidationResult> {
  const ok = await verifyCid(bytes, expectedContentHash);
  return ok
    ? { isValid: true, expectedHash: expectedContentHash }
    : { isValid: false, error: "IPFS content hash mismatch", expectedHash: expectedContentHash };
}
```

- [ ] **Step 2: Rename/rewrite `fetchAndValidateCSV` → `fetchAndVerifyCSV`** (`claims.ts:369`): fetch bytes once, `verifyCid` them, parse — **no `validateCSVIntegrity` / no `getMerkleTree` on load**:

```ts
export async function fetchAndVerifyCSV(
  csvLink: string,
  expectedContentHash: string,
): Promise<CsvClaimRow[] | null> {
  try {
    const response = await fetchWithRetry(csvLink);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const check = await validateIPFSContent(bytes, expectedContentHash);
    if (!check.isValid) return null;
    return parseCSVData(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
```

Keep `validateCSVIntegrity` and `getMerkleTree` exactly as-is (reused at claim time, Task 5).

- [ ] **Step 3: Update `ClaimsService.fetchCsv`** (`ClaimsService.ts:100-121`) to call `fetchAndVerifyCSV(csvLink, expectedContentHash)` and drop the `expectedMerkleRoot`/`encoding` args from this path. Keep the `csvCache` Map wrapper.

- [ ] **Step 4: Fix imports** in `ClaimsService.ts:15` (`fetchAndValidateCSV` → `fetchAndVerifyCSV`). Search the repo for other `fetchAndValidateCSV` importers:

Run: `grep -rn "fetchAndValidateCSV\|validateIPFSContent" src/`
Expected: only the two files above; update any others.

- [ ] **Step 5: Typecheck + existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS / no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/claims.ts src/lib/services/ClaimsService.ts
git commit -m "perf(claims): verify CSV by content-hash on load; stop rebuilding merkle to validate"
```

---

## Chunk 2: Defer merkle proofs to claim time (Change B)

### Task 3: Make holding proof-fields optional; thread `withProofs`

**Files:**
- Modify: `src/lib/services/ClaimsService.ts` (`HoldingWithProof`/`ClaimsHoldingsGroup` types; `loadClaimsForWallet` ~150; `processClaimForWallet` ~360)

- [ ] **Step 1:** In `ClaimsService.ts`, make `signedContext`, `order`, `orderBookAddress`, `orderHash` **optional** on `HoldingWithProof` (~62-67) and on the holding shape inside `ClaimsHoldingsGroup` (~77-83).

- [ ] **Step 2:** Add `withProofs?: boolean` to the `loadClaimsForWallet` options object (~158) and pass it through to `processClaimForWallet` (the `claimProcessors` map at ~313 / call at ~267) as a new trailing param `withProofs = false`.

- [ ] **Step 3:** Typecheck (consumers will error — that's expected, fixed in Task 4):

Run: `npx tsc --noEmit`
Expected: errors only in `claims/+page.svelte` (consuming optional fields) — note them for Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/ClaimsService.ts
git commit -m "refactor(claims): make holding proof fields optional; add withProofs option"
```

### Task 4: Gate the merkle/proof block behind `withProofs`

**Files:**
- Modify: `src/lib/services/ClaimsService.ts` (`processClaimForWallet`, merkle build ~407, proof block ~477-499)
- Test: `src/lib/services/ClaimsService.withProofs.test.ts` (new)

- [ ] **Step 1: Write failing test** — display load builds no proofs, claim load does. Use a minimal fake: stub `fetchAndVerifyCSV` and `sortClaimsData` via dependency seam, OR assert at a higher level that `processClaimForWallet(..., withProofs=false)` returns holdings with `signedContext === undefined` and `withProofs=true` returns defined. (Prefer the higher-level call with a small fixture CSV + empty logs.)

```ts
// asserts withProofs=false → holdings[].signedContext is undefined
// asserts withProofs=true  → holdings[].signedContext is defined and root matches
```

Run: `npx vitest run src/lib/services/ClaimsService.withProofs.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement the gate.** In `processClaimForWallet`:
  - Move `const merkleTree = getMerkleTree(csvData, encoding);` (~407) and the entire "Generate proofs for holdings" block (~477-499) inside `if (withProofs) { … }`.
  - When `!withProofs`, return `sortedClaimsData.holdings` mapped **without** `order`/`signedContext`/`orderBookAddress` (display fields only).
  - `sortClaimsData` call is unchanged (no tree dependency).

- [ ] **Step 3:** Run the new test + full suite.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/ClaimsService.ts src/lib/services/ClaimsService.withProofs.test.ts
git commit -m "perf(claims): build merkle tree + proofs only when withProofs (claim path)"
```

### Task 5: Claim path sets `withProofs:true`, asserts root, skips display cache

**Files:**
- Modify: `src/routes/(main)/claims/+page.svelte` (`refreshClaimableHoldings` ~326; `OrderEntry` ~285)
- Modify: `src/lib/services/ClaimsService.ts` (claim-time root assert inside the `withProofs` block)

- [ ] **Step 1:** In `refreshClaimableHoldings` (`+page.svelte:332`), pass `withProofs: true`:

```ts
const result = await claimsService.loadClaimsForWallet(address, {
  refreshContextEvents: true,
  withProofs: true,
});
```

- [ ] **Step 2:** Remove the `claimsCache.set(address, result)` line in `refreshClaimableHoldings` (`:340`) so proof-carrying holdings never enter the display cache. Add a one-line comment explaining why.

- [ ] **Step 3:** In `OrderEntry` (`+page.svelte:285`) make `order` and `signedContext` optional to match the service types; the existing `groupEntriesByOrderbook` guard (`:424`) already drops entries missing them.

- [ ] **Step 4: Claim-time root assert.** Inside the `withProofs` block in `processClaimForWallet`, after building `merkleTree`, assert it matches the committed root before generating proofs:

```ts
if (merkleTree.root.toLowerCase() !== claim.expectedMerkleRoot.toLowerCase()) {
  throw new Error(
    `Merkle root mismatch for ${claim.orderHash}: built ${merkleTree.root} != expected ${claim.expectedMerkleRoot}`,
  );
}
```

- [ ] **Step 5: Typecheck + tests + lint**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual smoke (dev server already on :5180).** Load `/claims` and `/portfolio` with a funded wallet → totals correct, no console proof errors. Click Claim on one holding → proof builds, tx simulates/submits.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(main)/claims/+page.svelte" src/lib/services/ClaimsService.ts
git commit -m "perf(claims): generate proofs in pre-claim refresh; assert root before submit"
```

---

## Chunk 3: Static v4 + April orders (Change C)

### Task 6: `orderbook` field + generalized static resolution

**Files:**
- Modify: `src/lib/network.ts` (`Claim` type ~129)
- Modify: `src/lib/services/ClaimsService.ts` (static resolution ~211-216)

- [ ] **Step 1:** Add `orderbook?: string;` (OB contract address) to the `Claim` type with a comment: "explicit era marker for static orders; resolution falls back to v6 when absent."

- [ ] **Step 2:** In the static-resolution branch (`ClaimsService.ts:213-216`), replace the hardcoded `orderbook: { id: ORDERBOOK_V6_CONTRACT_ADDRESS.toLowerCase() }` with:

```ts
orderbook: { id: (claim.orderbook ?? ORDERBOOK_V6_CONTRACT_ADDRESS).toLowerCase() },
```

Update the comment (it currently asserts "Static orders are v6-era").

- [ ] **Step 3:** Typecheck.

Run: `npx tsc --noEmit`
Expected: PASS (field optional, existing v6 entries unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/lib/network.ts src/lib/services/ClaimsService.ts
git commit -m "feat(claims): explicit per-order orderbook field for static era resolution"
```

### Task 7: Generator script (fetch + cross-check static data)

**Files:**
- Create: `scripts/bake-static-orders.mjs` (model on `scripts/v6-float-roots.mjs`)

- [ ] **Step 1: Implement** a script that: parses PROD entries from `network.ts`; selects the 16 subgraph-resolved orders (no `orderBytes`, excluding the 2 `claimable:false` dev entries `BHF`/`GOM4`); for each, queries each `ORDERBOOK_SOURCES` subgraph for `orderBytes` + `addEvents[0].transaction.blockNumber` + records which source (orderbook address) returned it; **asserts the order's embedded merkle root contains the `expectedMerkleRoot`** already in `network.ts` (same cross-check pattern as `v6-float-roots.mjs:131-138`); prints, per order: `orderHash`, `orderbook`, `deployBlock`, `orderBytes`, and PASS/FAIL.

- [ ] **Step 2: Run it.**

Run: `node scripts/bake-static-orders.mjs`
Expected: 16/16 PASS with a printed patch block. If any FAIL → stop, do not bake (investigate before proceeding).

- [ ] **Step 3: Commit**

```bash
git add scripts/bake-static-orders.mjs
git commit -m "chore(claims): generator to bake static v4/April order data with root cross-check"
```

### Task 8: Bake static data into `network.ts`

**Files:**
- Modify: `src/lib/network.ts` (16 order entries)

- [ ] **Step 1:** For each of the 16 orders, add `orderBytes`, `deployBlock`, and `orderbook` (the v4 OB address for the 14 v4 orders; the v6 OB address for the 2 April orders) using the verified values from Task 7's output.

- [ ] **Step 2: Re-run the generator as a verifier** (its cross-check now also confirms the baked values match):

Run: `node scripts/bake-static-orders.mjs && npx tsc --noEmit`
Expected: 16/16 PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/network.ts
git commit -m "feat(claims): bake static orderBytes/deployBlock/orderbook for v4 + April orders"
```

### Task 9: Delete the subgraph order lookup

**Files:**
- Modify: `src/lib/services/ClaimsService.ts` (`hashesNeedingSubgraph` path ~209-238)
- Modify: `src/lib/data/repositories/claimsRepository.ts` (`getOrdersByHashes` ~174; `getOrderByHash` ~143/213)
- Modify: `src/lib/data/repositories/index.ts` (re-export ~9)

- [ ] **Step 1:** Confirm zero subgraph-resolved orders remain — every PROD claim now has `orderBytes`+`deployBlock`. In `processClaimForWallet`/`loadClaimsForWallet`, delete the `hashesNeedingSubgraph` array, the `if (hashesNeedingSubgraph.length) { … getOrdersByHashes … }` block, and the merge loop.

- [ ] **Step 2:** Delete `getOrdersByHashes` (method + any standalone export) and `getOrderByHash` (method, standalone export `claimsRepository.ts:213`, and the `repositories/index.ts:9` re-export). Verify no remaining callers:

Run: `grep -rn "getOrdersByHashes\|getOrderByHash" src/`
Expected: no matches.

- [ ] **Step 3: Typecheck + tests + lint + build**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke** on `/claims` + `/portfolio` (:5180): all months display, claim still works (it now resolves orders entirely from static data + builds proofs on click).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/ClaimsService.ts src/lib/data/repositories/claimsRepository.ts src/lib/data/repositories/index.ts
git commit -m "perf(claims): drop subgraph order lookup; all orders resolved statically"
```

---

## Done criteria
- Display load (`/claims`, `/portfolio`) calls no `getMerkleTree` and no subgraph order query.
- CSV bytes verified by real CIDv1 hash, cached per CID.
- Claim still works end-to-end: proofs built on the pre-claim refresh, root asserted before submit, contract verifies on-chain.
- `npx tsc --noEmit && npx vitest run && npm run lint && npm run build` all pass.
- Preview deploy: e2e claim on one holding succeeds before merge.
