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
