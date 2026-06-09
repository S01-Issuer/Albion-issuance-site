# Claims CSV Bundle Endpoint — Design

**Date:** 2026-06-09
**Status:** Approved (user-validated in session)
**Depends on:** Blob-cached IPFS proxy + server-side CID verification (branch `perf/claims-immutable-inputs`), Blob store `albion-ipfs-cache` connected to `s1-issuer/albion-issuance-site`.

## Problem

First load of /claims and /portfolio takes ~16–19s. A dominant cost is ~30
separate rewards-CSV fetches through `/api/ipfs/<cid>`: page speed is set by
the *slowest* of 30 draws (any cold edge/gateway miss adds seconds), and the
fetches start only after wallet autoconnect resolves.

## Trust model (the design's anchor)

Two parallel paths, both preserved:

- **Trustless path (unchanged):** anyone can fetch `rewards.csv` by CID from
  any gateway, build the merkle tree, generate a proof, and claim on-chain
  without our UI or server. The on-chain merkle root is the money-path guard —
  a tampered CSV can only mislead a display, never move funds.
- **UI path (this feature):** one bundle request, but carrying **raw CSV
  bytes**, so the client still re-hashes every file against its
  `expectedContentHash` from `network.ts`. The server is a pure untrusted
  transport, equivalent to a gateway. No trust moves server-side.

This is why the bundle ships raw CSVs rather than parsed rows: parsed rows
would break client-side CID verification; raw bytes keep it intact and keep
claim-time merkle-proof generation on the trustless path with zero extra
fetches (bytes already in hand).

## Server: `GET /api/claims-bundle/[setHash]`

New route `src/routes/api/claims-bundle/[setHash]/+server.ts`.

1. **Manifest:** collect unique `expectedContentHash` CIDs from all `Claim`
   entries in `ENERGY_FIELDS` (server-side import of `$lib/network`; PROD vs
   DEV fields resolve identically to the client because both read
   `PUBLIC_METABOARD_ADMIN`).
2. **Identity:** `setHash = sha256(schemaVersion + sorted CIDs)` (hex), in the
   **URL path** — content-addressed like `/api/ipfs/<cid>`, so full immutable
   caching is safe at both browser and edge. The server computes its own
   `setHash` from `network.ts`; a request for any other value is a 404 (client
   falls back to per-CSV). The client computes the same hash from the same
   manifest, so on any given deployment client and server always agree; a 404
   only occurs under stale-HTML version skew, where the fallback covers it.
   New monthly release ⇒ new CIDs ⇒ new deployment ⇒ new `setHash` ⇒ new URL —
   no invalidation logic anywhere, and returning browsers can never pin a
   stale bundle (a stale URL is simply never requested again).
3. **Layers:** module-level in-memory cache → Vercel Blob at
   `claims-bundle/<setHash>.json` → **build**.
4. **Build:** fetch each CID via SvelteKit's internal `event.fetch('/api/ipfs/<cid>')`
   (reuses gateway fallback, Blob L2, and warms per-file caches). Then verify
   **what will be persisted, not what was fetched**: decode to text, re-encode,
   and `verifyCidBytes(cid, reEncodedBytes)` — this also proves the
   text→JSON→text round trip is byte-faithful for this file (guards against
   any future non-UTF-8-clean CSV being silently corrupted into a
   permanently-failing Blob entry). A `"mismatch"` or any fetch failure
   **fails the whole build** (HTTP 503; no partial bundles, nothing
   persisted). **Stampede control:** a module-level in-flight promise per
   `setHash` coalesces concurrent cold builds within an instance;
   cross-instance overlap is tolerated (Blob writes are idempotent,
   `allowOverwrite: true`).
5. **Headers:** same immutable cache headers as `/api/ipfs` (`Cache-Control`
   + `CDN-Cache-Control`, 1y immutable) — safe because the URL is
   content-addressed by `setHash` (see #2). Immutable headers are set **only
   on 200 responses**; 404/503 carry `Cache-Control: no-store` (a deployment
   rollback makes an old `setHash` current again — an edge-cached immutable
   404 for it would pin the degraded fallback path for up to a year).

### Envelope

```jsonc
{
  "schema": 1,
  "setHash": "<hex>",
  "files": { "<cid>": "<raw csv text>", ... }
}
```

CSV text is ASCII; JSON round-trips bytes faithfully for client re-hashing.
No zip — Vercel edge compression (gzip/br) over one stream beats 30
independently-compressed small files (shared dictionary across repeating hex
addresses). Measured corpus: ~30 CSVs, ~12–15KB typical (one ~143KB outlier);
bundle ≈ ~100KB over the wire.

## Client

New module `src/lib/utils/claimsBundle.ts`:

- `computeSetHash(cids: string[]): Promise<string>` —
  `sha256(schemaVersion + sorted CIDs)`, hex. **The server imports this same
  function** (it is pure; `claimsBundle.ts` must stay server-importable) — two
  implementations would risk silent divergence (separator, sort order, hex
  casing) producing a permanent 404 → fallback, invisible except in perf
  numbers. Client has `multiformats/hashes/sha2` already (browser build,
  WebCrypto).
- `getClaimsBundle(): Promise<Map<string /*cid*/, Uint8Array>>` — derives the
  CID list from `ENERGY_FIELDS`, computes `setHash`, fetches
  `/api/claims-bundle/<setHash>` once per session (module-level shared
  promise), decodes `files` values to bytes (`TextEncoder`). Returns empty
  map on any failure, including 404 (never throws).
- Kicked off **at claims/portfolio page init, in parallel with wallet
  autoconnect** (bundle is wallet-independent).

`src/lib/utils/claims.ts` exports a new bytes-accepting variant (today
`parseCSVData` is private and only reachable through `fetchAndVerifyCSV`):

- `verifyAndParseCsvBytes(bytes, expectedContentHash): Promise<CsvClaimRow[] | null>`
  — the verify+parse tail of `fetchAndVerifyCSV`, which is refactored to call
  it. One verification code path for both transports.

`ClaimsService.fetchCsv(csvLink, expectedContentHash)` becomes bundle-first:

1. `csvCache` hit → return (unchanged).
2. Bundle has `expectedContentHash` →
   `verifyAndParseCsvBytes(bytes, expectedContentHash)` → on pass, cache.
3. Bundle miss **or hash-check fail** → existing `fetchAndVerifyCSV(csvLink,
   expectedContentHash)` per-CSV path, unchanged.

Failure can never be worse than the status quo: every degradation lands on
today's exact code path.

Claim-time proofs need no separate integration: the `withProofs` path already
flows through the same `fetchCsv`/`csvCache`
(`ClaimsService.ts:367-393`), so bundle-sourced, client-verified rows feed
merkle-tree construction automatically.

## Publish step ("deploying the data")

A bare `GET /api/claims-bundle` (no `setHash`) responds **307 → the current
setHash URL**, with `Cache-Control: no-store` (the redirect target changes
per release; only the content-addressed URL is immutable). This gives the
publish pipeline and any external consumer a stable discovery point without
computing the hash.

After a monthly rewards release deploys (admin repo auto-PRs `network.ts`),
the pipeline curls `GET /api/claims-bundle` (following the redirect) once
against production. First request builds + persists the new bundle; every
user thereafter hits Blob/edge. Self-healing: if the curl is skipped, the
first visitor pays one build (~the cost of today's normal load) and heals it
for everyone.

Add `scripts/warm-claims-bundle.sh` here (`curl -L` + assert HTTP 200 +
non-empty `files`) for the admin repo to call; the admin-repo wiring itself
is out of scope for this repo.

## Out of scope / v2

- Claimed-state (context-events, trades) stays client-side — mutable per-user
  data with a different freshness problem.
- Per-address server filtering (`?address=`) — rejected: kills shared edge
  cache, introduces wallet↔IP visibility our server doesn't currently have,
  saves only ~0.1–0.2s of transfer.
- Parsed-row payloads — rejected: breaks client-side CID verification.

## Testing

- **Server unit (vitest):** envelope build from mocked internal fetch; CID
  mismatch ⇒ 503 + nothing persisted; Blob hit skips build; wrong `setHash`
  ⇒ 404; bare route ⇒ 307 with `no-store`; concurrent cold requests share one
  build (in-flight coalescing). Reuse `HELLO_CID`-style fixtures from
  `cidContent.test.ts`.
- **Client unit:** `computeSetHash` matches the server's for the same CID
  list; bundle-first path verifies-then-parses; tampered bundle entry falls
  back to per-CSV fetch; bundle fetch failure/404 falls back wholesale.
- **Integration (manual/scripted):** local dev with sourced env → one
  `/api/claims-bundle` request replaces ~30 CSV requests on /claims;
  `x-cache`/Blob-landing checks as done for `/api/ipfs`; re-run
  `scripts/perf-ab-local.mjs` to quantify.

## Success criteria

- /claims and /portfolio issue 1 bundle request instead of ~30 CSV requests
  (verified in the perf harness request counts).
- Time-to-data improves measurably (target: several seconds off the ~16.5s
  median; exact number from `perf-ab-local.mjs` re-run).
- Tampered bundle content cannot render: client hash check rejects and falls
  back (unit-tested).
- All existing claims tests pass unchanged.
