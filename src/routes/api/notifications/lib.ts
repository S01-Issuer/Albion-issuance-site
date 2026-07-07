/**
 * Pure helpers for the payout-alerts notification routes.
 *
 * Split out from the +server.ts files (same pattern as ../context-events/cache.ts)
 * so the state-transition logic — how the wallet→subscriber link map changes on
 * subscribe/unsubscribe, wallet-list merging, email masking — is unit-testable
 * without MailerLite / Vercel Blob / $env.
 *
 * Design note: MailerLite is the system of record for emails (the only place a
 * raw address is stored). The Blob-side link map deliberately holds NO PII —
 * wallet → { MailerLite subscriber id, masked email } — because the existing
 * Blob store is public-access; a subscriber id is useless without the API key,
 * and the masked email exists only so the UI can show "linked as a•••@g•••.com".
 */

export interface WalletLink {
  /** MailerLite subscriber id — the key we use to update/unlink later. */
  subscriberId: string;
  /** Display-only masked email; never the raw address. */
  emailMasked: string;
  updatedAt: number;
}

export interface LinkMap {
  version: 1;
  /** Keyed by lowercase wallet address. */
  links: Record<string, WalletLink>;
}

export function emptyLinkMap(): LinkMap {
  return { version: 1, links: {} };
}

/** a•••@g•••.com — first char of local part + domain, TLD kept. */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "•••";
  const lastDot = domain.lastIndexOf(".");
  const host = lastDot > 0 ? domain.slice(0, lastDot) : domain;
  const tld = lastDot > 0 ? domain.slice(lastDot) : "";
  return `${local[0]}•••@${host[0]}•••${tld}`;
}

/**
 * Merge a wallet into a MailerLite `wallet_addresses` field value
 * (comma-separated, lowercase, de-duplicated, order-preserving).
 */
export function mergeWalletIntoField(
  fieldValue: string | null | undefined,
  wallet: string,
): string {
  const w = wallet.toLowerCase();
  const existing = parseWalletsField(fieldValue);
  if (existing.includes(w)) return existing.join(",");
  return [...existing, w].join(",");
}

/** Remove a wallet from a `wallet_addresses` field value. */
export function removeWalletFromField(
  fieldValue: string | null | undefined,
  wallet: string,
): string {
  const w = wallet.toLowerCase();
  return parseWalletsField(fieldValue)
    .filter((x) => x !== w)
    .join(",");
}

export function parseWalletsField(
  fieldValue: string | null | undefined,
): string[] {
  if (!fieldValue) return [];
  return [
    ...new Set(
      fieldValue
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.startsWith("0x")),
    ),
  ];
}

/**
 * Link-map transition for a successful subscribe. Returns the previous link
 * (if the wallet was linked to a DIFFERENT subscriber) so the caller can strip
 * the wallet from the old subscriber's field — the change-email flow.
 */
export function applyLink(
  map: LinkMap,
  wallet: string,
  link: WalletLink,
): { map: LinkMap; previous: WalletLink | null } {
  const key = wallet.toLowerCase();
  const existing = map.links[key] ?? null;
  const previous =
    existing && existing.subscriberId !== link.subscriberId ? existing : null;
  return {
    map: { ...map, links: { ...map.links, [key]: link } },
    previous,
  };
}

/** Link-map transition for a successful unsubscribe. */
export function applyUnlink(
  map: LinkMap,
  wallet: string,
): { map: LinkMap; removed: WalletLink | null } {
  const key = wallet.toLowerCase();
  const removed = map.links[key] ?? null;
  if (!removed) return { map, removed: null };
  const links = { ...map.links };
  delete links[key];
  return { map: { ...map, links }, removed };
}

/** Normalise an unknown blob payload into a LinkMap (tolerates missing/corrupt). */
export function coerceLinkMap(data: unknown): LinkMap {
  if (
    data &&
    typeof data === "object" &&
    (data as LinkMap).version === 1 &&
    typeof (data as LinkMap).links === "object" &&
    (data as LinkMap).links !== null
  ) {
    return data as LinkMap;
  }
  return emptyLinkMap();
}
