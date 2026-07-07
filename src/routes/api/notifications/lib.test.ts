import { describe, it, expect } from "vitest";
import {
  applyLink,
  applyUnlink,
  coerceLinkMap,
  emptyLinkMap,
  maskEmail,
  mergeWalletIntoField,
  parseWalletsField,
  removeWalletFromField,
  type LinkMap,
} from "./lib";

const W1 = "0xAAAA000000000000000000000000000000000001";
const W2 = "0xbbbb000000000000000000000000000000000002";

describe("maskEmail (link map must hold no raw PII)", () => {
  it("masks local part and host, keeps TLD", () => {
    expect(maskEmail("alice@gmail.com")).toBe("a•••@g•••.com");
    expect(maskEmail("Bob.Smith@sub.example.co.uk")).toBe("b•••@s•••.uk");
  });

  it("never returns the input on malformed values", () => {
    expect(maskEmail("garbage")).toBe("•••");
  });
});

describe("wallet_addresses field merge/remove (one email, many wallets)", () => {
  it("merges a wallet, lowercased and de-duplicated", () => {
    expect(mergeWalletIntoField(null, W1)).toBe(W1.toLowerCase());
    expect(mergeWalletIntoField(W1.toLowerCase(), W1.toUpperCase().replace("0X", "0x"))).toBe(
      W1.toLowerCase(),
    );
    expect(mergeWalletIntoField(W1.toLowerCase(), W2)).toBe(
      `${W1.toLowerCase()},${W2}`,
    );
  });

  it("removes a wallet and leaves the rest", () => {
    const field = `${W1.toLowerCase()},${W2}`;
    expect(removeWalletFromField(field, W1)).toBe(W2);
    expect(removeWalletFromField(field, "0xdead")).toBe(field);
    expect(removeWalletFromField(W2, W2)).toBe("");
  });

  it("parses messy field values defensively", () => {
    expect(parseWalletsField(` ${W1} , ${W1.toLowerCase()},junk,,${W2} `)).toEqual([
      W1.toLowerCase(),
      W2,
    ]);
    expect(parseWalletsField(null)).toEqual([]);
  });
});

describe("link map transitions", () => {
  const link1 = { subscriberId: "sub-1", emailMasked: "a•••@b•••.co", updatedAt: 1 };
  const link2 = { subscriberId: "sub-2", emailMasked: "c•••@d•••.co", updatedAt: 2 };

  it("applyLink adds a wallet keyed lowercase and reports no previous on first link", () => {
    const { map, previous } = applyLink(emptyLinkMap(), W1, link1);
    expect(map.links[W1.toLowerCase()]).toEqual(link1);
    expect(previous).toBeNull();
  });

  it("applyLink surfaces the previous link ONLY when the subscriber changed (change-email flow)", () => {
    const { map: withLink } = applyLink(emptyLinkMap(), W1, link1);
    // Re-link to the same subscriber: no cleanup needed.
    expect(applyLink(withLink, W1, { ...link1, updatedAt: 9 }).previous).toBeNull();
    // Link to a different subscriber: caller must strip the wallet from sub-1.
    const { map, previous } = applyLink(withLink, W1, link2);
    expect(previous).toEqual(link1);
    expect(map.links[W1.toLowerCase()]).toEqual(link2);
  });

  it("applyUnlink removes the wallet and returns what was removed", () => {
    const { map: withLink } = applyLink(emptyLinkMap(), W1, link1);
    const { map, removed } = applyUnlink(withLink, W1.toUpperCase().replace("0X", "0x"));
    expect(removed).toEqual(link1);
    expect(map.links).toEqual({});
    expect(applyUnlink(map, W1).removed).toBeNull();
  });

  it("transitions never mutate the input map", () => {
    const original = emptyLinkMap();
    applyLink(original, W1, link1);
    expect(original.links).toEqual({});
    const withLink: LinkMap = { version: 1, links: { [W1.toLowerCase()]: link1 } };
    applyUnlink(withLink, W1);
    expect(withLink.links[W1.toLowerCase()]).toEqual(link1);
  });
});

describe("coerceLinkMap (corrupt blob never breaks the feature)", () => {
  it("passes a valid map through and replaces junk with empty", () => {
    const valid = { version: 1, links: {} };
    expect(coerceLinkMap(valid)).toBe(valid);
    expect(coerceLinkMap(null)).toEqual(emptyLinkMap());
    expect(coerceLinkMap("junk")).toEqual(emptyLinkMap());
    expect(coerceLinkMap({ version: 99 })).toEqual(emptyLinkMap());
  });
});
