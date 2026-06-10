import { describe, it, expect } from "vitest";
import { allCidsBundled } from "./ClaimsService";

const mapOf = (...cids: string[]) => new Map(cids.map((c) => [c, new Uint8Array()]));

describe("allCidsBundled (skip IPFS throttle when bundle is complete)", () => {
  it("true when every needed CID is in the bundle", () => {
    const bundle = mapOf("cidA", "cidB", "cidC");
    expect(allCidsBundled(bundle, ["cidA", "cidB"])).toBe(true);
  });

  it("false when any needed CID is missing (one will hit IPFS)", () => {
    const bundle = mapOf("cidA");
    expect(allCidsBundled(bundle, ["cidA", "cidB"])).toBe(false);
  });

  it("false when the bundle is empty (failed/404 → full per-CSV fallback)", () => {
    expect(allCidsBundled(new Map(), ["cidA"])).toBe(false);
  });

  it("true for an empty need-set only if the bundle is non-empty", () => {
    // No CSVs to load → nothing to throttle. Guard on size keeps a failed
    // empty bundle from being treated as 'complete'.
    expect(allCidsBundled(mapOf("cidA"), [])).toBe(true);
    expect(allCidsBundled(new Map(), [])).toBe(false);
  });
});
