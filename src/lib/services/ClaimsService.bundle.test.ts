import { describe, it, expect, vi, beforeEach } from "vitest";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const CSV_TEXT = "index,address,amount\n0,0xaaa,42\n";
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

const bundleMap = new Map<string, Uint8Array>();
vi.mock("$lib/utils/claimsBundle", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/utils/claimsBundle")>();
  return { ...actual, getClaimsBundle: vi.fn(async () => bundleMap) };
});

const fetchAndVerifyCSVMock = vi.fn(async (..._a: unknown[]) => null);
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
    const rows = (await callFetchCsv(
      new ClaimsService(),
      `/api/ipfs/${cid}`,
      cid,
    )) as Array<{ amount: string }>;
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
