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
