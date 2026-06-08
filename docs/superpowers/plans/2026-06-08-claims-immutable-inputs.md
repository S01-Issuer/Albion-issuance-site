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

- [ ] **Step 3: Delete the now-dead `validateCSVIntegrity`** from `claims.ts`. After Step 2 it has zero callers on the load path, and the claim-time root check (Task 5) uses a small pure helper, not this function. First confirm nothing else uses it:

Run: `grep -rn "validateCSVIntegrity" src/`
Expected: only its own definition (and a doc-comment mention in `scripts/v6-float-roots.mjs`, which mirrors logic, not imports). Delete the function. Keep `getMerkleTree` and `getProofForLeaf` (used at claim time).

- [ ] **Step 4: Update `ClaimsService.fetchCsv`** (`ClaimsService.ts:100-121`) to call `fetchAndVerifyCSV(csvLink, expectedContentHash)` — drop the `expectedMerkleRoot`/`encoding` params. Keep the `csvCache` Map wrapper. **Also update the call site at `ClaimsService.ts:387`** (inside `processClaimForWallet`) from the 4-arg form to `this.fetchCsv(claim.csvLink, claim.expectedContentHash)`.

- [ ] **Step 5: Fix imports** in `ClaimsService.ts:15` (`fetchAndValidateCSV` → `fetchAndVerifyCSV`; remove `validateCSVIntegrity` if imported). Search the repo for other importers:

Run: `grep -rn "fetchAndValidateCSV\|validateIPFSContent\|validateCSVIntegrity" src/`
Expected: no remaining references outside the two files; update any others.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors. (Note: `vitest run` is deferred to the end of Chunk 3 — the e2e suite depends on subgraph mocks updated in Task 10. Run unit specs only here: `npx vitest run src/lib/utils/cidVerify.test.ts`.)

- [ ] **Step 7: Commit**

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

### Task 4: Extract a pure root-assert helper (test-env safe)

> **Why a pure helper + zero-root skip:** `getMerkleTree` uses `SimpleMerkleTree.of()` from `@openzeppelin/merkle-tree`, which is **not** shimmed in tests (only `ethers.keccak256` is), so the built root is always a full 66-char value — even under vitest it won't equal a mocked root. The codebase's existing convention (the soon-deleted zero-root escape hatch in `fetchAndValidateCSV`) treats an **all-zeros `expectedMerkleRoot` as "not independently verifiable — skip."** We reuse that: the assert skips when `expectedRoot` is all-zeros. Real on-chain roots are never zero, so production claims are always checked; e2e fixtures keep their zero root and are skipped. The helper is also unit-tested as a pure string function (no crypto).

**Files:**
- Modify: `src/lib/utils/claims.ts` (add `assertMerkleRootMatches`)
- Test: `src/lib/utils/claims.assertRoot.test.ts` (new)

- [ ] **Step 1: Write failing test** (pure, no crypto):

```ts
import { describe, it, expect } from "vitest";
import { assertMerkleRootMatches } from "./claims";

describe("assertMerkleRootMatches", () => {
  it("passes on case-insensitive match", () => {
    expect(() => assertMerkleRootMatches("0xABC", "0xabc", "h")).not.toThrow();
  });
  it("throws on mismatch", () => {
    expect(() => assertMerkleRootMatches("0xabc", "0xdef", "h")).toThrow(/root mismatch/i);
  });
  it("skips the all-zeros sentinel (unverifiable fixture/order)", () => {
    // a real 66-char built root vs the zero sentinel must NOT throw
    expect(() =>
      assertMerkleRootMatches("0xed428e1c" + "0".repeat(56) + "abcd", "0x" + "0".repeat(64), "h"),
    ).not.toThrow();
  });
});
```

Run: `npx vitest run src/lib/utils/claims.assertRoot.test.ts`
Expected: FAIL (not defined).

- [ ] **Step 2: Implement helper** in `claims.ts`:

```ts
/**
 * Assert a freshly-built merkle root matches the order's committed root.
 * Skips when `expectedRoot` is the all-zeros sentinel — the codebase's
 * convention for roots that are not independently verifiable (mirrors the
 * legacy zero-root escape hatch, and used by e2e fixtures). Real on-chain
 * roots are never zero, so production claims are always checked.
 */
export function assertMerkleRootMatches(
  builtRoot: string,
  expectedRoot: string,
  orderHash: string,
): void {
  if (/^0x0+$/i.test(expectedRoot)) return; // unverifiable sentinel — skip
  if (builtRoot.toLowerCase() !== expectedRoot.toLowerCase()) {
    throw new Error(
      `Merkle root mismatch for ${orderHash}: built ${builtRoot} != expected ${expectedRoot}`,
    );
  }
}
```

- [ ] **Step 3:** Run test, verify PASS.

Run: `npx vitest run src/lib/utils/claims.assertRoot.test.ts`
Expected: PASS (3).

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/claims.ts src/lib/utils/claims.assertRoot.test.ts
git commit -m "feat(claims): pure merkle-root assert helper (test-env safe)"
```

### Task 5: Gate the merkle/proof block behind `withProofs`; assert root; skip display cache

**Files:**
- Modify: `src/lib/services/ClaimsService.ts` (`processClaimForWallet`: `getMerkleTree` at 407, `if (!isClaimable)` early-return at 431, proof block at 442-463)
- Modify: `src/routes/(main)/claims/+page.svelte` (`refreshClaimableHoldings` at 282, `loadClaimsForWallet` call at 287, `claimsCache.set` at 295)
- Test: `src/lib/services/ClaimsService.withProofs.test.ts` (new)

> **Line numbers are for the `main` version of `+page.svelte`** (this branch is off main; it does NOT contain PR#176's SWR edits). Confirm with `grep -n "refreshClaimableHoldings\|claimsCache.set" "src/routes/(main)/claims/+page.svelte"` before editing.

- [ ] **Step 1: Write failing test — proof-field PRESENCE only** (not root value, which is meaningless under the shim). Call `loadClaimsForWallet` with a minimal mocked field/CSV (reuse the e2e http-mock helpers) once with `withProofs:false` and once `true`:

```ts
// withProofs:false → every holding's signedContext === undefined
// withProofs:true  → every claimable holding's signedContext is defined (an array)
```

Run: `npx vitest run src/lib/services/ClaimsService.withProofs.test.ts`
Expected: FAIL.

- [ ] **Step 2: Gate the proof work.** In `processClaimForWallet`:
  - Wrap `const merkleTree = getMerkleTree(csvData, encoding);` (line 407) and the "Generate proofs for holdings" block (lines 442-463) in `if (withProofs) { … }`.
  - The `if (!isClaimable)` early-return (line 431) sits between them and returns `holdings: []` — unaffected; `merkleTree` is only consumed at 446, inside the gated block.
  - When `!withProofs`, return `sortedClaimsData.holdings` mapped **without** `order`/`signedContext`/`orderBookAddress`.
  - Immediately after the gated `getMerkleTree`, call `assertMerkleRootMatches(merkleTree.root, claim.expectedMerkleRoot, claim.orderHash)` before generating proofs.

- [ ] **Step 3: Claim page — set `withProofs:true` + skip cache.** In `refreshClaimableHoldings` (`+page.svelte:282`):
  - Add `withProofs: true` to the `loadClaimsForWallet` options (line 287).
  - Delete the `claimsCache.set(address, result)` (line 295) with a comment: "proof-carrying holdings must not enter the display cache."
  - `OrderEntry` (`:239`) derives `order`/`signedContext` via indexed access from `ClaimsHoldingsGroup['holdings'][number]`, so making them optional on the service type (Task 3) auto-propagates — **no edit needed here** unless `tsc` says otherwise.

- [ ] **Step 4: Typecheck + unit tests** (full `vitest run` waits for Task 10):

Run: `npx tsc --noEmit && npx vitest run src/lib/services/ClaimsService.withProofs.test.ts src/lib/utils/claims.assertRoot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/ClaimsService.ts "src/routes/(main)/claims/+page.svelte" src/lib/services/ClaimsService.withProofs.test.ts
git commit -m "perf(claims): build merkle tree + proofs only on the pre-claim refresh"
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

- [ ] **Step 1: Implement** a script that: parses PROD entries from `network.ts`; selects the 16 subgraph-resolved orders (no `orderBytes`); for each, queries each `ORDERBOOK_SOURCES` subgraph for `orderBytes` + `addEvents[0].transaction.blockNumber` + records which source (orderbook address) returned it; **asserts the order's embedded merkle root contains the `expectedMerkleRoot`** already in `network.ts` (same cross-check pattern as `v6-float-roots.mjs:131-138`); prints, per order: `orderHash`, `orderbook`, `deployBlock`, `orderBytes`, and PASS/FAIL.

  **DEV entries (`BHF`/`GOM4` in `DEV_ENERGY_FIELDS`):** these are development-only placeholders, not part of production (`PROD_ENERGY_FIELDS`). Decision: do **not** bake them. After the subgraph deletion (Task 10) they will no longer resolve in DEV runtime — acceptable because production uses `PROD_ENERGY_FIELDS` and automated tests mock their own `ENERGY_FIELDS` (Task 9). Add a code comment on `DEV_ENERGY_FIELDS` noting that DEV-mode claim resolution requires static order data and is currently inert. (If a maintainer later needs DEV claims, point the generator at those hashes and bake them too.)

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

### Task 9: Update e2e mocks to static orders (before deleting the subgraph path)

The e2e suite mocks `ENERGY_FIELDS` with claims that have **no** `orderBytes`/`deployBlock` and relies on the subgraph mock resolving them — that path is deleted in Task 10. Also: the load path now does a **real CID check**, so each mocked CSV's bytes must hash to its declared `expectedContentHash`.

**Files:**
- Modify: `src/e2e/claims.e2e.spec.ts` (mocked `ENERGY_FIELDS`, ~85-114)
- Modify: `src/e2e/http-mock.ts` (the `getOrdersByHashes` mock branch, ~592-604)
- Possibly: `src/e2e/portfolio.e2e.spec.ts` (if it mocks claims similarly)

- [ ] **Step 1:** Add `orderBytes`, `deployBlock`, and `orderbook` to each mocked claim in `claims.e2e.spec.ts` so they resolve statically (use any syntactically-valid `orderBytes` the mock decoder accepts; copy the shape the real v6 entries use). Grep first to find every mocked claim fixture: `grep -rn "expectedMerkleRoot\|csvLink\|orderHash" src/e2e/`.

- [ ] **Step 2:** Make each mocked CSV's served bytes hash to its `expectedContentHash`. Easiest: compute the CID of the mock CSV content with the Task-1 helper and set the fixture's `expectedContentHash` to it. (Or, if the mock CSV content is generated, derive the CID in the test setup.) Confirm `verifyCid` will pass for the mocked content. **Leave each fixture's `expectedMerkleRoot` as the all-zeros sentinel** — `assertMerkleRootMatches` (Task 4) skips zero roots, so the `withProofs:true` proof path runs without a real-root match. (The CID check is the real integrity gate; the root is unverifiable for synthetic fixtures.)

- [ ] **Step 3:** Remove the `getOrdersByHashes` mock branch in `http-mock.ts` (it backs a path being deleted). Ensure no test still depends on it.

- [ ] **Step 4: Run the e2e suite** (still has the subgraph path until Task 10, but mocks are now static-ready and CID-valid):

Run: `npx vitest run src/e2e/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/e2e/
git commit -m "test(claims): static-order + real-CID e2e fixtures"
```

### Task 10: Delete the subgraph order lookup + full verification

**Files:**
- Modify: `src/lib/services/ClaimsService.ts` (`hashesNeedingSubgraph` path ~209-238)
- Modify: `src/lib/data/repositories/claimsRepository.ts` (`getOrdersByHashes` ~174; `getOrderByHash` ~143/213)
- Modify: `src/lib/data/repositories/index.ts` (re-export ~9)

- [ ] **Step 1:** Every PROD claim now has `orderBytes`+`deployBlock` (Task 8) and every e2e mock is static (Task 9). In `loadClaimsForWallet`, delete the `hashesNeedingSubgraph` array, the `if (hashesNeedingSubgraph.length) { … getOrdersByHashes … }` block, and the merge loop.

- [ ] **Step 2:** Delete `getOrdersByHashes` (method + standalone export) and `getOrderByHash` (method, standalone export `claimsRepository.ts:213`, and the `repositories/index.ts:9` re-export). Verify no remaining callers:

Run: `grep -rn "getOrdersByHashes\|getOrderByHash" src/`
Expected: no matches.

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke** on `/claims` + `/portfolio` (:5180): all months display, claim still works (orders resolved entirely from static data; proofs built on click).

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
