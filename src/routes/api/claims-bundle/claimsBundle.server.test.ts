import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const putMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({}));
const headMock = vi.fn(
  async (..._a: unknown[]): Promise<{ url: string } | null> => {
    throw new Error("not found");
  },
);
vi.mock("@vercel/blob", () => ({
  put: (...a: unknown[]) => putMock(...a),
  head: (...a: unknown[]) => headMock(...a),
}));

async function cidOf(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const input = new Uint8Array(
    encoded.buffer,
    encoded.byteOffset,
    encoded.byteLength,
  );
  const digest = await sha256.digest(input);
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
async function seedManifest(
  suffix: string,
): Promise<{ cids: string[]; csvs: string[] }> {
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
    expect(String(putMock.mock.calls[0][0])).toBe(
      `claims-bundle/${setHash}.json`,
    );
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
