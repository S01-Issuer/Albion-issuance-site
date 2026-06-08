import { describe, it, expect, beforeEach } from "vitest";
import { verifyCid, __resetVerifiedCidCacheForTest } from "./cidVerify";

const HELLO = new TextEncoder().encode("hello\n");
const HELLO_CID = "bafkreicysg23kiwv34eg2d7qweipxwosdo2py4ldv42nbauguluen5v6am";

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
    expect(await verifyCid(new Uint8Array(), HELLO_CID)).toBe(true);
  });
});
