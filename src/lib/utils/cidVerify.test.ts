import { describe, it, expect } from "vitest";
import { verifyCid } from "./cidVerify";

const HELLO = new TextEncoder().encode("hello\n");
const HELLO_CID = "bafkreicysg23kiwv34eg2d7qweipxwosdo2py4ldv42nbauguluen5v6am";

describe("verifyCid", () => {
  it("accepts bytes whose CIDv1 matches", async () => {
    expect(await verifyCid(HELLO, HELLO_CID)).toBe(true);
  });
  it("rejects tampered bytes", async () => {
    const bad = new TextEncoder().encode("hellp\n");
    expect(await verifyCid(bad, HELLO_CID)).toBe(false);
  });
  it("re-hashes every call — a known CID does not trust unmatched bytes", async () => {
    // Verifying once must not make a later mismatched response pass: the bytes
    // a gateway returns are not guaranteed to match the (immutable) CID.
    expect(await verifyCid(HELLO, HELLO_CID)).toBe(true);
    expect(await verifyCid(new Uint8Array(), HELLO_CID)).toBe(false);
  });
});
