# Claims CSV Bundle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One content-addressed `/api/claims-bundle/<setHash>` request replaces ~30 per-CSV IPFS fetches on /claims and /portfolio, carrying raw CSV bytes so client-side CID verification is fully preserved.

**Architecture:** Server route aggregates raw CSVs (fetched via internal `event.fetch('/api/ipfs/<cid>')`, verified post-round-trip with `verifyCidBytes`) into a JSON envelope persisted in Vercel Blob, keyed by `setHash = sha256(schemaVersion + sorted CIDs)`. Client computes the same `setHash` from its baked `ENERGY_FIELDS` manifest, fetches once at page init (parallel with wallet autoconnect), re-verifies every file with the existing `verifyCid`, and falls back to today's per-CSV path on any failure. Spec: `docs/superpowers/specs/2026-06-09-claims-bundle-design.md` (reviewed + approved).

**Tech stack:** SvelteKit 2 (`+server.ts` routes), `@vercel/blob`, `multiformats` (sha256), vitest (jsdom env).

**Branch:** `perf/claims-immutable-inputs` (depends on this branch's Blob-cached `/api/ipfs` + `verifyCidBytes`).

**Verified codebase facts (do not re-derive):**
- `Claim.expectedContentHash` = bare CIDv1 raw+sha256 strings; `csvLink` = `/api/ipfs/<cid>` (`PINATA_GATEWAY = "/api/ipfs"`, `src/lib/network.ts:47`); `ENERGY_FIELDS: EnergyField[]` exported at `network.ts:639`.
- `fetchAndVerifyCSV(csvLink, expectedContentHash)` at `src/lib/utils/claims.ts:254`; private `parseCSVData` at `:275`; `validateIPFSContent(bytes, hash)` at `:232`.
- `ClaimsService.fetchCsv(csvLink, expectedContentHash)` (private, `csvCache` Map) at `src/lib/services/ClaimsService.ts:103`; singleton `claimsService` exported at `:576`; `withProofs` claim path reuses `fetchCsv` at `:367-393` (no separate integration needed).
- Claims page: `src/routes/(main)/claims/+page.svelte` — `onMount` (line ~102) → wallet subscribe → `loadClaimsData(address)` gated on `connected && address`. Portfolio: `src/routes/(main)/portfolio/+page.svelte` — `$: if ($connected && $signerAddress) loadSftData()` (~line 276).
- Server CID verifier: `verifyCidBytes(path, bytes): Promise<"ok"|"mismatch"|"unverifiable">` in `src/lib/server/cidContent.ts`; test fixtures pattern in `src/lib/server/cidContent.test.ts` (`HELLO = "hello\n"`, `HELLO_CID = bafkreicysg23kiwv34eg2d7qweipxwosdo2py4ldv42nbauguluen5v6am`).
- Reference Blob route pattern: `src/routes/api/ipfs/[...path]/+server.ts` (`head()`+fetch read, `put(..., {access:"public", addRandomSuffix:false, allowOverwrite:true})` write wrapped in try/catch, `CACHE_HEADERS` shape).
- Tests: vitest, jsdom, config in `vite.config.ts`; run one file: `npx vitest run <path>`. Unit tests that need a deterministic manifest `vi.mock("$lib/network", ...)` (pattern in `src/e2e/claims.e2e.spec.ts:76`).
- Quality gates: `npm run lint`, `npm run check` (= `svelte-kit sync && svelte-check` — REQUIRED over bare `tsc --noEmit`, which skips `.svelte` files; `sync` also generates `./$types` for new routes), `npx vitest run`.

---

## Chunk 1: All tasks

### Task 1: Shared bundle module (`claimsBundle.ts`)

**Files:**
- Create: `src/lib/utils/claimsBundle.ts`
- Test: `src/lib/utils/claimsBundle.test.ts`

This module is imported by BOTH client and server (must stay free of browser-only and server-only imports; `multiformats` + `$lib/network` only).

- [ ] **Step 1.1: Write failing tests**

```ts
// src/lib/utils/claimsBundle.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/network", () => ({
  ENERGY_FIELDS: [
    {
      name: "F1",
      sftTokens: [
        {
          address: "0xa",
          symbol: "A",
          claims: [
            { orderHash: "0x1", csvLink: "/api/ipfs/cidB", expectedMerkleRoot: "0x", expectedContentHash: "cidB" },
            { orderHash: "0x2", csvLink: "/api/ipfs/cidA", expectedMerkleRoot: "0x", expectedContentHash: "cidA" },
          ],
        },
      ],
    },
    {
      name: "F2",
      sftTokens: [
        {
          address: "0xb",
          symbol: "B",
          claims: [
            // duplicate CID across tokens — must dedupe
            { orderHash: "0x3", csvLink: "/api/ipfs/cidA", expectedMerkleRoot: "0x", expectedContentHash: "cidA" },
          ],
        },
      ],
    },
  ],
}));

import {
  collectClaimCids,
  computeSetHash,
  getClaimsBundle,
  __resetClaimsBundleForTest,
  BUNDLE_SCHEMA_VERSION,
} from "./claimsBundle";

beforeEach(() => __resetClaimsBundleForTest());

describe("collectClaimCids", () => {
  it("dedupes and sorts CIDs from ENERGY_FIELDS", () => {
    expect(collectClaimCids()).toEqual(["cidA", "cidB"]);
  });
});

describe("computeSetHash", () => {
  it("is deterministic and order-insensitive (sorts internally)", async () => {
    const a = await computeSetHash(["cidB", "cidA"]);
    const b = await computeSetHash(["cidA", "cidB"]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes when the CID set changes", async () => {
    expect(await computeSetHash(["cidA"])).not.toBe(await computeSetHash(["cidA", "cidB"]));
  });
});

describe("getClaimsBundle", () => {
  const envelope = (files: Record<string, string>, schema = BUNDLE_SCHEMA_VERSION) =>
    new Response(JSON.stringify({ schema, setHash: "x", files }), { status: 200 });

  it("fetches /api/claims-bundle/<setHash> and decodes files to bytes", async () => {
    const expected = await computeSetHash(["cidA", "cidB"]);
    const fetchFn = vi.fn(async (url: string) => {
      expect(url).toBe(`/api/claims-bundle/${expected}`);
      return envelope({ cidA: "a,b\n1,2\n", cidB: "x\n" });
    });
    const map = await getClaimsBundle(fetchFn as unknown as typeof fetch);
    expect(new TextDecoder().decode(map.get("cidA"))).toBe("a,b\n1,2\n");
    expect(map.size).toBe(2);
  });

  it("returns empty map on 404 (stale-deploy skew → caller falls back)", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 404 }));
    expect((await getClaimsBundle(fetchFn as unknown as typeof fetch)).size).toBe(0);
  });

  it("returns empty map on wrong schema version", async () => {
    const fetchFn = vi.fn(async () => envelope({ cidA: "x" }, 999));
    expect((await getClaimsBundle(fetchFn as unknown as typeof fetch)).size).toBe(0);
  });

  it("shares one in-flight promise per session", async () => {
    const fetchFn = vi.fn(async () => envelope({ cidA: "x", cidB: "y" }));
    await Promise.all([getClaimsBundle(fetchFn as unknown as typeof fetch), getClaimsBundle(fetchFn as unknown as typeof fetch)]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("never throws — network error yields empty map", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("boom"); });
    expect((await getClaimsBundle(fetchFn as unknown as typeof fetch)).size).toBe(0);
  });
});
```

- [ ] **Step 1.2: Run, verify FAIL** — `npx vitest run src/lib/utils/claimsBundle.test.ts` → module not found.

- [ ] **Step 1.3: Implement**

```ts
// src/lib/utils/claimsBundle.ts
import { sha256 } from "multiformats/hashes/sha2";
import { ENERGY_FIELDS } from "$lib/network";

/** Bump when the envelope shape or hashing scheme changes. Shared by client and server. */
export const BUNDLE_SCHEMA_VERSION = 1;

export type ClaimsBundleEnvelope = {
  schema: number;
  setHash: string;
  /** cid → raw CSV text (ASCII; JSON round-trips the bytes faithfully for re-hashing) */
  files: Record<string, string>;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Unique, sorted rewards-CSV CIDs from the baked manifest. */
export function collectClaimCids(fields = ENERGY_FIELDS): string[] {
  const cids = new Set<string>();
  for (const field of fields)
    for (const token of field.sftTokens)
      for (const claim of token.claims)
        if (claim.expectedContentHash) cids.add(claim.expectedContentHash);
  return [...cids].sort();
}

/**
 * Bundle identity: sha256(schemaVersion + sorted CIDs), hex. The server route
 * imports THIS function — a second implementation could silently diverge
 * (separator, sort, casing) and 404 every request straight into the fallback.
 */
export async function computeSetHash(cids: string[]): Promise<string> {
  const input = new TextEncoder().encode(
    `v${BUNDLE_SCHEMA_VERSION}:${[...cids].sort().join(",")}`,
  );
  const digest = await sha256.digest(input);
  return toHex(digest.digest);
}

let bundlePromise: Promise<Map<string, Uint8Array>> | null = null;

/**
 * Fetch the claims bundle once per session (shared promise). Returns a map of
 * cid → raw CSV bytes. NEVER throws and never returns partial trust: callers
 * re-verify every entry with verifyCid before use, and any miss/failure lands
 * on the existing per-CSV fetch path.
 */
export function getClaimsBundle(
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, Uint8Array>> {
  if (!bundlePromise) {
    bundlePromise = loadBundle(fetchFn).catch(() => new Map<string, Uint8Array>());
  }
  return bundlePromise;
}

async function loadBundle(fetchFn: typeof fetch): Promise<Map<string, Uint8Array>> {
  const cids = collectClaimCids();
  if (cids.length === 0) return new Map();
  const setHash = await computeSetHash(cids);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchFn(`/api/claims-bundle/${setHash}`, {
      signal: controller.signal,
    });
    if (!response.ok) return new Map();
    const envelope = (await response.json()) as ClaimsBundleEnvelope;
    if (
      envelope?.schema !== BUNDLE_SCHEMA_VERSION ||
      typeof envelope.files !== "object" ||
      envelope.files === null
    ) {
      return new Map();
    }
    const encoder = new TextEncoder();
    const map = new Map<string, Uint8Array>();
    for (const [cid, text] of Object.entries(envelope.files)) {
      if (typeof text === "string") map.set(cid, encoder.encode(text));
    }
    return map;
  } finally {
    clearTimeout(timeout);
  }
}

export function __resetClaimsBundleForTest(): void {
  bundlePromise = null;
}
```

- [ ] **Step 1.4: Run tests, verify PASS** — `npx vitest run src/lib/utils/claimsBundle.test.ts`
- [ ] **Step 1.5: Commit** — `git add src/lib/utils/claimsBundle.ts src/lib/utils/claimsBundle.test.ts && git commit -m "feat(claims): shared claims-bundle module (setHash + session-cached fetch)"`

### Task 2: Export `verifyAndParseCsvBytes` from claims.ts

**Files:**
- Modify: `src/lib/utils/claims.ts:254-268` (refactor `fetchAndVerifyCSV` tail into new export)
- Test: `src/lib/utils/claims.bundleBytes.test.ts` (new file; claims.ts has no dedicated unit test file for this area)

- [ ] **Step 2.1: Write failing test**

```ts
// src/lib/utils/claims.bundleBytes.test.ts
import { describe, it, expect } from "vitest";
import { verifyAndParseCsvBytes } from "./claims";

// CSV whose CID we compute inline (raw + sha256, CIDv1) — same scheme as fixtures
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const CSV_TEXT = "index,address,amount\n0,0x0000000000000000000000000000000000000001,1000\n";

async function cidOf(text: string): Promise<string> {
  const digest = await sha256.digest(new TextEncoder().encode(text));
  return CID.create(1, raw.code, digest).toString();
}

describe("verifyAndParseCsvBytes", () => {
  it("parses rows when bytes hash to the expected CID", async () => {
    const cid = await cidOf(CSV_TEXT);
    const rows = await verifyAndParseCsvBytes(new TextEncoder().encode(CSV_TEXT), cid);
    expect(rows).not.toBeNull();
    expect(rows![0].address).toBe("0x0000000000000000000000000000000000000001");
    expect(rows![0].amount).toBe("1000");
  });

  it("returns null on hash mismatch (tampered bytes are never parsed)", async () => {
    const cid = await cidOf(CSV_TEXT);
    const tampered = new TextEncoder().encode(CSV_TEXT.replace("1000", "9999"));
    expect(await verifyAndParseCsvBytes(tampered, cid)).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run, verify FAIL** — `npx vitest run src/lib/utils/claims.bundleBytes.test.ts` (no export).
- [ ] **Step 2.3: Implement** — in `src/lib/utils/claims.ts`, add below `validateIPFSContent` and refactor `fetchAndVerifyCSV` to use it:

```ts
/**
 * Verify already-fetched CSV bytes against the pinned CID, then parse.
 * One verification path for both transports: per-CSV fetch and claims bundle.
 */
export async function verifyAndParseCsvBytes(
  bytes: Uint8Array,
  expectedContentHash: string,
): Promise<CsvClaimRow[] | null> {
  const check = await validateIPFSContent(bytes, expectedContentHash);
  if (!check.isValid) return null;
  return parseCSVData(new TextDecoder().decode(bytes));
}
```

and `fetchAndVerifyCSV`'s body becomes:

```ts
  try {
    const response = await fetchWithRetry(csvLink);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return await verifyAndParseCsvBytes(bytes, expectedContentHash);
  } catch {
    return null;
  }
```

- [ ] **Step 2.4: Run new test + existing claims tests, verify PASS** — `npx vitest run src/lib/utils/claims.bundleBytes.test.ts src/lib/utils/cidVerify.test.ts src/lib/services/ClaimsService.withProofs.test.ts`
- [ ] **Step 2.5: Commit** — `git commit -am "refactor(claims): extract verifyAndParseCsvBytes (shared verify+parse tail)"`

### Task 3: Server routes (`[setHash]` + bare redirect)

**Files:**
- Create: `src/routes/api/claims-bundle/[setHash]/+server.ts`
- Create: `src/routes/api/claims-bundle/+server.ts`
- Test: `src/routes/api/claims-bundle/claimsBundle.server.test.ts`

Spec requirements to honor exactly: immutable headers ONLY on 200; 404/503/307 carry `Cache-Control: no-store`; verify the RE-ENCODED text (what is persisted), not fetched bytes; whole-build failure on any fetch/verify failure (nothing persisted); per-setHash in-flight coalescing; Blob key `claims-bundle/<setHash>.json`.

- [ ] **Step 3.1: Write failing tests**

```ts
// src/routes/api/claims-bundle/claimsBundle.server.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const putMock = vi.fn(async () => ({}));
const headMock = vi.fn(async (): Promise<{ url: string } | null> => {
  throw new Error("not found");
});
vi.mock("@vercel/blob", () => ({
  put: (...a: unknown[]) => putMock(...a),
  head: (...a: unknown[]) => headMock(...a),
}));

async function cidOf(text: string): Promise<string> {
  const digest = await sha256.digest(new TextEncoder().encode(text));
  return CID.create(1, raw.code, digest).toString();
}

// Hoisted network mock reads this holder at call time (vite-node rewrites
// named-import use sites to live property accesses, so the getter works).
const manifest: { cids: string[] } = { cids: [] };
vi.mock("$lib/network", () => ({
  get ENERGY_FIELDS() {
    return [
      {
        name: "F",
        sftTokens: [
          {
            address: "0x1",
            symbol: "S",
            claims: manifest.cids.map((cid, i) => ({
              orderHash: `0x${i}`,
              csvLink: `/api/ipfs/${cid}`,
              expectedMerkleRoot: "0x",
              expectedContentHash: cid,
            })),
          },
        ],
      },
    ];
  },
}));

import { GET } from "./[setHash]/+server";
import { GET as GET_BARE } from "./+server";
import { computeSetHash } from "$lib/utils/claimsBundle";

type Handler = (event: {
  params: { setHash?: string };
  fetch: typeof fetch;
}) => Promise<Response>;

const bytesByCid = new Map<string, string>();
const innerFetch = vi.fn(async (url: string) => {
  const cid = url.replace("/api/ipfs/", "");
  const text = bytesByCid.get(cid);
  if (!text) return new Response("nope", { status: 404 });
  return new Response(new TextEncoder().encode(text), { status: 200 });
});

const invoke = (setHash: string) =>
  (GET as unknown as Handler)({
    params: { setHash },
    fetch: innerFetch as unknown as typeof fetch,
  });

// CRITICAL DETERMINISM RULE: the route's module-level memory/inFlight maps
// survive across tests in this file. Every test therefore gets a UNIQUE
// manifest (suffix → unique CSV text → unique CIDs → unique setHash), so no
// test can ever hit another test's cached envelope. Do NOT share fixtures.
async function seedManifest(suffix: string): Promise<{ cids: string[]; csvs: string[] }> {
  const csvs = [
    `index,address,amount\n0,0xaaa,1\n#${suffix}-a\n`,
    `index,address,amount\n0,0xbbb,2\n#${suffix}-b\n`,
  ];
  const cids = await Promise.all(csvs.map(cidOf));
  manifest.cids = cids;
  bytesByCid.clear();
  cids.forEach((cid, i) => bytesByCid.set(cid, csvs[i]));
  return { cids, csvs };
}

beforeEach(() => {
  vi.clearAllMocks(); // keeps vi.fn(impl) implementations, clears call counts
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/claims-bundle/[setHash]", () => {
  it("404s an unknown setHash with no-store (rollback safety)", async () => {
    await seedManifest("t404");
    const r = await invoke("deadbeef");
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("builds, persists, and serves the envelope with immutable headers on 200", async () => {
    const { cids, csvs } = await seedManifest("tbuild");
    const setHash = await computeSetHash(cids);
    const r = await invoke(setHash);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.schema).toBe(1);
    expect(body.setHash).toBe(setHash);
    expect(Object.keys(body.files).sort()).toEqual([...cids].sort());
    expect(body.files[cids[0]]).toBe(csvs[0]);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(String(putMock.mock.calls[0][0])).toBe(`claims-bundle/${setHash}.json`);
    expect(r.headers.get("cache-control")).toContain("immutable");
  });

  it("serves from Blob without building (X-Store: blob, no inner fetch, no put)", async () => {
    const { cids } = await seedManifest("tblob");
    const setHash = await computeSetHash(cids);
    const envelope = JSON.stringify({ schema: 1, setHash, files: {} });
    headMock.mockResolvedValueOnce({ url: "https://blob.test/x" });
    // readFromBlob uses the GLOBAL fetch (not event.fetch) for the blob URL
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(envelope, { status: 200 })),
    );
    const r = await invoke(setHash);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-store")).toBe("blob");
    expect(await r.text()).toBe(envelope);
    expect(innerFetch).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it("fails the whole build (503, nothing persisted, no-store) when any CSV mismatches its CID", async () => {
    const { cids, csvs } = await seedManifest("tmismatch");
    bytesByCid.set(cids[0], csvs[0].replace("1", "7")); // corrupt one file
    const setHash = await computeSetHash(cids);
    const r = await invoke(setHash);
    expect(r.status).toBe(503);
    expect(putMock).not.toHaveBeenCalled();
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("coalesces concurrent cold builds (per-CID inner fetch called once)", async () => {
    const { cids } = await seedManifest("tcoalesce");
    const setHash = await computeSetHash(cids);
    const [r1, r2] = await Promise.all([invoke(setHash), invoke(setHash)]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(innerFetch).toHaveBeenCalledTimes(cids.length);
  });
});

describe("GET /api/claims-bundle (bare)", () => {
  it("307-redirects to the current setHash URL with no-store", async () => {
    const { cids } = await seedManifest("tbare");
    const setHash = await computeSetHash(cids);
    const r = await (GET_BARE as unknown as () => Promise<Response>)();
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(`/api/claims-bundle/${setHash}`);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
```

- [ ] **Step 3.2: Run, verify FAIL** — `npx vitest run src/routes/api/claims-bundle/claimsBundle.server.test.ts`
- [ ] **Step 3.3: Implement the routes**

```ts
// src/routes/api/claims-bundle/[setHash]/+server.ts
import type { RequestHandler } from "./$types";
import { put, head, type HeadBlobResult } from "@vercel/blob";
import { verifyCidBytes } from "$lib/server/cidContent";
import {
  BUNDLE_SCHEMA_VERSION,
  collectClaimCids,
  computeSetHash,
} from "$lib/utils/claimsBundle";

// Immutable is safe ONLY because the URL is content-addressed by setHash —
// a new release means new CIDs → new deployment → new setHash → new URL.
// Errors must NOT be long-cached: a rollback makes an old setHash current
// again, and an edge-cached immutable 404 would pin the fallback for a year.
const IMMUTABLE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=31536000, immutable",
  "CDN-Cache-Control": "public, s-maxage=31536000, immutable",
  "Access-Control-Allow-Origin": "*",
} as const;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const memory = new Map<string, string>(); // setHash → envelope JSON
const inFlight = new Map<string, Promise<string>>(); // cold-build stampede coalescing

const blobKey = (setHash: string) => `claims-bundle/${setHash}.json`;

async function readFromBlob(setHash: string): Promise<string | null> {
  try {
    const meta: HeadBlobResult | null = await head(blobKey(setHash)).catch(() => null);
    if (!meta?.url) return null;
    const response = await fetch(meta.url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function writeToBlob(setHash: string, json: string): Promise<void> {
  try {
    await put(blobKey(setHash), json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true, // content-addressed — idempotent re-writes are fine
      contentType: "application/json",
    });
  } catch (err) {
    // Blob is an optimization; memory + edge still serve this deployment.
    console.warn("claims-bundle: failed to persist to Blob:", err);
  }
}

async function buildEnvelope(
  setHash: string,
  cids: string[],
  fetchFn: typeof fetch,
): Promise<string> {
  const entries = await Promise.all(
    cids.map(async (cid) => {
      const response = await fetchFn(`/api/ipfs/${cid}`);
      if (!response.ok) {
        throw new Error(`claims-bundle: fetch ${cid} failed (${response.status})`);
      }
      const text = new TextDecoder().decode(
        new Uint8Array(await response.arrayBuffer()),
      );
      // Verify what we PERSIST (post text round-trip), not what we fetched —
      // proves the JSON envelope will re-hash correctly on the client.
      const verdict = await verifyCidBytes(cid, new TextEncoder().encode(text));
      if (verdict !== "ok") {
        throw new Error(`claims-bundle: CID verification ${verdict} for ${cid}`);
      }
      return [cid, text] as const;
    }),
  );
  const files: Record<string, string> = {};
  for (const [cid, text] of entries) files[cid] = text;
  return JSON.stringify({ schema: BUNDLE_SCHEMA_VERSION, setHash, files });
}

export const GET: RequestHandler = async ({ params, fetch }) => {
  const requested = params.setHash;
  const cids = collectClaimCids();
  const current = cids.length > 0 ? await computeSetHash(cids) : null;

  if (!requested || !current || requested !== current) {
    return new Response(JSON.stringify({ error: "unknown bundle" }), {
      status: 404,
      headers: NO_STORE_HEADERS,
    });
  }

  const cached = memory.get(current);
  if (cached) {
    return new Response(cached, { headers: { ...IMMUTABLE_HEADERS, "X-Cache": "HIT" } });
  }

  const fromBlob = await readFromBlob(current);
  if (fromBlob) {
    memory.set(current, fromBlob);
    return new Response(fromBlob, {
      headers: { ...IMMUTABLE_HEADERS, "X-Cache": "HIT", "X-Store": "blob" },
    });
  }

  let pending = inFlight.get(current);
  if (!pending) {
    pending = buildEnvelope(current, cids, fetch)
      .then(async (json) => {
        memory.set(current, json);
        await writeToBlob(current, json);
        return json;
      })
      .finally(() => inFlight.delete(current));
    inFlight.set(current, pending);
  }

  try {
    const json = await pending;
    return new Response(json, { headers: { ...IMMUTABLE_HEADERS, "X-Cache": "MISS" } });
  } catch (err) {
    console.error("claims-bundle build failed:", err);
    return new Response(JSON.stringify({ error: "bundle build failed" }), {
      status: 503,
      headers: NO_STORE_HEADERS,
    });
  }
};
```

```ts
// src/routes/api/claims-bundle/+server.ts
import type { RequestHandler } from "./$types";
import { collectClaimCids, computeSetHash } from "$lib/utils/claimsBundle";

/**
 * Discovery endpoint for the publish pipeline and external consumers: the
 * redirect target changes per release, so it must never be cached — only the
 * content-addressed [setHash] URL is immutable.
 */
export const GET: RequestHandler = async () => {
  const cids = collectClaimCids();
  if (cids.length === 0) {
    return new Response(JSON.stringify({ error: "no claims manifest" }), {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const setHash = await computeSetHash(cids);
  return new Response(null, {
    status: 307,
    headers: {
      Location: `/api/claims-bundle/${setHash}`,
      "Cache-Control": "no-store",
    },
  });
};
```

Note: handler returns `Response` objects directly with explicit headers (instead of `setHeaders`) so error responses can't inherit immutable headers — this is the spec's "immutable only on 200" requirement made structural. The test's `setHeaders` stub stays unused; assert headers off the `Response`.

- [ ] **Step 3.4: Run, verify PASS** — `npx vitest run src/routes/api/claims-bundle/claimsBundle.server.test.ts`
- [ ] **Step 3.5: Typecheck** — `npm run check` (runs `svelte-kit sync` first, which generates `./$types` for the new routes)
- [ ] **Step 3.6: Commit** — `git add src/routes/api/claims-bundle && git commit -m "feat(claims): content-addressed claims-bundle endpoint (raw CSVs, Blob-backed)"`

### Task 4: Client integration (ClaimsService + page kickoff)

**Files:**
- Modify: `src/lib/services/ClaimsService.ts:103-117` (`fetchCsv` bundle-first)
- Modify: `src/routes/(main)/claims/+page.svelte` (onMount kickoff)
- Modify: `src/routes/(main)/portfolio/+page.svelte` (onMount kickoff)
- Test: `src/lib/services/ClaimsService.bundle.test.ts`

- [ ] **Step 4.1: Write failing tests**

```ts
// src/lib/services/ClaimsService.bundle.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const CSV_TEXT = "index,address,amount\n0,0xaaa,42\n";
async function cidOf(text: string): Promise<string> {
  const digest = await sha256.digest(new TextEncoder().encode(text));
  return CID.create(1, raw.code, digest).toString();
}

const bundleMap = new Map<string, Uint8Array>();
vi.mock("$lib/utils/claimsBundle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/utils/claimsBundle")>();
  return { ...actual, getClaimsBundle: vi.fn(async () => bundleMap) };
});

const fetchAndVerifyCSVMock = vi.fn(async () => null);
vi.mock("$lib/utils/claims", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/utils/claims")>();
  return {
    ...actual,
    fetchAndVerifyCSV: (...a: unknown[]) => fetchAndVerifyCSVMock(...a),
  };
});

import { ClaimsService } from "./ClaimsService";

beforeEach(() => {
  vi.clearAllMocks();
  bundleMap.clear();
});

// fetchCsv is private — exercise via a thin test seam: cast to access it.
// (Matches existing test style of priming private csvCache in withProofs test.)
type FetchCsv = (csvLink: string, hash: string) => Promise<unknown>;
const callFetchCsv = (svc: ClaimsService, link: string, hash: string) =>
  (svc as unknown as { fetchCsv: FetchCsv }).fetchCsv.call(svc, link, hash);

describe("ClaimsService bundle-first fetchCsv", () => {
  it("serves from the bundle without touching the per-CSV path", async () => {
    const cid = await cidOf(CSV_TEXT);
    bundleMap.set(cid, new TextEncoder().encode(CSV_TEXT));
    const rows = (await callFetchCsv(new ClaimsService(), `/api/ipfs/${cid}`, cid)) as Array<{ amount: string }>;
    expect(rows[0].amount).toBe("42");
    expect(fetchAndVerifyCSVMock).not.toHaveBeenCalled();
  });

  it("falls back to fetchAndVerifyCSV when the bundle entry is tampered", async () => {
    const cid = await cidOf(CSV_TEXT);
    bundleMap.set(cid, new TextEncoder().encode(CSV_TEXT.replace("42", "43")));
    await callFetchCsv(new ClaimsService(), `/api/ipfs/${cid}`, cid);
    expect(fetchAndVerifyCSVMock).toHaveBeenCalledTimes(1);
  });

  it("falls back when the bundle is empty (fetch failure / 404 skew)", async () => {
    const cid = await cidOf(CSV_TEXT);
    await callFetchCsv(new ClaimsService(), `/api/ipfs/${cid}`, cid);
    expect(fetchAndVerifyCSVMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4.2: Run, verify FAIL** — `npx vitest run src/lib/services/ClaimsService.bundle.test.ts`
- [ ] **Step 4.3: Implement `fetchCsv` bundle-first** (ClaimsService.ts; add imports `getClaimsBundle` from `$lib/utils/claimsBundle`, `verifyAndParseCsvBytes` from `$lib/utils/claims`):

```ts
  private async fetchCsv(
    csvLink: string,
    expectedContentHash: string,
  ): Promise<CsvClaimRow[] | null> {
    const cached = this.csvCache.get(csvLink);
    if (cached) {
      return cached;
    }

    // Bundle-first: one bulk request replaces ~30 per-CSV fetches. Bytes are
    // re-verified against the pinned CID here, so the bundle server is an
    // untrusted transport; any miss or verification failure falls back to the
    // unchanged per-CSV path.
    const bundle = await getClaimsBundle();
    const bundled = bundle.get(expectedContentHash);
    if (bundled) {
      const data = await verifyAndParseCsvBytes(bundled, expectedContentHash);
      if (data) {
        this.csvCache.set(csvLink, data);
        return data;
      }
    }

    const data = await fetchAndVerifyCSV(csvLink, expectedContentHash);
    if (data) {
      this.csvCache.set(csvLink, data);
    }
    return data;
  }
```

- [ ] **Step 4.4: Page kickoff**
  - `src/routes/(main)/claims/+page.svelte`: already imports `onMount` (line ~4) with the hook at ~line 102 — add `void getClaimsBundle();` as its first statement (before the wallet subscription).
  - `src/routes/(main)/portfolio/+page.svelte`: has NO `onMount` today (loading is a `$:` reactive on `$connected && $signerAddress`, ~line 276) — add `import { onMount } from "svelte";` and a new `onMount(() => { void getClaimsBundle(); });` block.
  - Both: `import { getClaimsBundle } from "$lib/utils/claimsBundle";` — the call is wallet-independent and runs parallel with autoconnect.

- [ ] **Step 4.5: Run all related tests, verify PASS** — `npx vitest run src/lib/services/ src/lib/utils/`
- [ ] **Step 4.6: Full gates** — `npx vitest run && npm run lint && npm run check`
- [ ] **Step 4.7: Commit** — `git commit -am "perf(claims): bundle-first CSV loading on claims + portfolio"`

### Task 5: Warm script + integration verification

**Files:**
- Create: `scripts/warm-claims-bundle.sh`
- No src changes.

- [ ] **Step 5.1: Write the script**

```bash
#!/usr/bin/env bash
# Publish-time warmer: builds + persists the claims bundle on the target after
# a rewards release deploys. Called by the albion.rewards admin pipeline.
# Usage: scripts/warm-claims-bundle.sh https://platform.albionlabs.org
set -euo pipefail

BASE="${1:?usage: warm-claims-bundle.sh <base-url>}"

body=$(curl -fsSL --max-time 180 "$BASE/api/claims-bundle")
files=$(printf '%s' "$body" | grep -o '"bafkrei[a-z2-7]\{52\}"' | sort -u | wc -l | tr -d ' ')

if [ "$files" -lt 1 ]; then
  echo "FAIL: bundle has no files" >&2
  exit 1
fi
echo "OK: claims bundle warm ($files files) at $BASE"
```

- [ ] **Step 5.2: chmod + smoke locally** — `chmod +x scripts/warm-claims-bundle.sh`. Start the dev server on an explicit port with env sourced (REQUIRED for Blob + prod fields): `set -a; . ./.env.local; set +a; npx vite dev --port 5190` (5190 is not a repo default — pass it explicitly, or substitute whatever port vite reports). Then `scripts/warm-claims-bundle.sh http://localhost:5190` → expect `OK ... (N files)` where N ≈ 30.
- [ ] **Step 5.3: End-to-end verification on local dev:**
  - `curl -sI http://localhost:5190/api/claims-bundle` → 307 + `cache-control: no-store` + Location header.
  - `curl -sL -D - -o /dev/null http://localhost:5190/api/claims-bundle | grep -iE 'HTTP|x-cache|x-store'` → 200; re-run → `X-Cache: HIT` (first `-D -` shows headers; plain `-w '%{http_code}'` cannot show them).
  - `vercel blob list | grep claims-bundle` → one `claims-bundle/<setHash>.json` entry.
  - Load `http://localhost:5190/claims` in the perf harness or browser: network tab shows ONE `/api/claims-bundle/...` request and (after first load) zero–few `/api/ipfs/<csv-cid>` requests for rewards CSVs; "Available to Claim" value unchanged vs. pre-change (US$61.43 for test wallet `0x0782ea8e5491da625672bd28248557b1237dd6ea`).
  - Optional: re-run `node scripts/perf-ab-local.mjs` for before/after timing.
- [ ] **Step 5.4: Commit** — `git add scripts/warm-claims-bundle.sh && git commit -m "feat(claims): publish-time bundle warmer script"`

---

## Final acceptance (from spec)

- [ ] /claims and /portfolio issue 1 bundle request instead of ~30 CSV requests.
- [ ] Tampered bundle content cannot render (unit-tested fallback).
- [ ] All existing tests pass; lint + tsc clean.
- [ ] Time-to-data improvement measured (perf harness re-run).
