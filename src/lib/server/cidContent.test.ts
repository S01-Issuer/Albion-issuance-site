import { describe, it, expect } from "vitest";
import { verifyCidBytes } from "./cidContent";

const HELLO = new TextEncoder().encode("hello\n");
const HELLO_CID = "bafkreicysg23kiwv34eg2d7qweipxwosdo2py4ldv42nbauguluen5v6am";
// A CIDv0 (dag-pb, base58) — valid CID but not the raw+sha256 form we can verify.
const CIDV0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

describe("verifyCidBytes (server-side cache poison guard)", () => {
  it("accepts bytes that hash to the raw CIDv1", async () => {
    expect(await verifyCidBytes(HELLO_CID, HELLO)).toBe("ok");
  });
  it("rejects bytes that do not match the CID", async () => {
    const tampered = new TextEncoder().encode("hellp\n");
    expect(await verifyCidBytes(HELLO_CID, tampered)).toBe("mismatch");
  });
  it("rejects empty bytes for a known CID", async () => {
    expect(await verifyCidBytes(HELLO_CID, new Uint8Array())).toBe("mismatch");
  });
  it("treats a non-CID path as unverifiable", async () => {
    expect(await verifyCidBytes("not-a-cid", HELLO)).toBe("unverifiable");
  });
  it("treats a CIDv0 (dag-pb) path as unverifiable", async () => {
    expect(await verifyCidBytes(CIDV0, HELLO)).toBe("unverifiable");
  });
});
