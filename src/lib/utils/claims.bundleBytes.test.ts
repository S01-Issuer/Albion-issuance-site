// src/lib/utils/claims.bundleBytes.test.ts
import { describe, it, expect } from "vitest";
import { verifyAndParseCsvBytes } from "./claims";

// CSV whose CID we compute inline (raw + sha256, CIDv1) — same scheme as fixtures
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const CSV_TEXT = "index,address,amount\n0,0x0000000000000000000000000000000000000001,1000\n";

async function cidOf(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const input = new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const digest = await sha256.digest(input);
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
