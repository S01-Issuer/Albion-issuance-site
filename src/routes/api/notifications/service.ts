/**
 * IO layer for the payout-alerts notification routes: MailerLite API client,
 * Blob-backed wallet→subscriber link map, and wallet-signature verification.
 *
 * MailerLite is the system of record (email, opt-in state, unsubscribes — its
 * unsubscribe links keep working regardless of anything stored here). The Blob
 * link map only exists because MailerLite can't be queried by custom field, so
 * "which subscriber is linked to wallet 0xabc?" needs a local index. It holds
 * no raw emails — see ./lib.ts.
 */
import { put, head, type HeadBlobResult } from "@vercel/blob";
import { env } from "$env/dynamic/private";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
  buildPayoutAlertsMessage,
  type PayoutAlertsMessageFields,
} from "$lib/utils/payoutAlertsMessage";
import { coerceLinkMap, type LinkMap } from "./lib";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Dynamic (runtime) env so builds don't require the vars and the feature can
 *  report "not configured" cleanly instead of failing the whole deploy. */
export function mailerliteConfig(): { apiKey: string; groupId: string } | null {
  const apiKey = env.PRIVATE_MAILERLITE_API_KEY;
  const groupId = env.PRIVATE_MAILERLITE_GROUP_ID;
  if (!apiKey || !groupId) return null;
  return { apiKey, groupId };
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * viem's client-backed verifyMessage handles EOAs AND smart wallets
 * (ERC-1271 / ERC-6492) — important on Base where Coinbase Smart Wallet is
 * common. Plain signature-recovery would reject every smart-wallet user.
 */
export async function verifyWalletSignature(
  fields: PayoutAlertsMessageFields,
  signature: string,
): Promise<boolean> {
  const rpcUrl =
    env.PRIVATE_BASE_RPC_URL ||
    (env.PUBLIC_ALCHEMY_API_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${env.PUBLIC_ALCHEMY_API_KEY}`
      : undefined);
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  try {
    return await client.verifyMessage({
      address: fields.walletAddress as `0x${string}`,
      message: buildPayoutAlertsMessage(fields),
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Blob-backed link map (wallet -> { subscriberId, emailMasked })
// ---------------------------------------------------------------------------

const LINK_MAP_BLOB_KEY = "payout-alerts-links.json";

let linkMapMem: LinkMap | null = null;

// Serialise read-modify-write cycles per instance so two overlapping subscribes
// can't clobber each other's map update. (Cross-instance races remain possible
// but harmless at this traffic level: the map self-heals on the next write, and
// MailerLite — the system of record — is updated independently of the map.)
let writeQueue: Promise<unknown> = Promise.resolve();

export async function loadLinkMap(): Promise<LinkMap> {
  if (linkMapMem) return linkMapMem;
  try {
    const meta: HeadBlobResult | null = await head(LINK_MAP_BLOB_KEY).catch(
      () => null,
    );
    if (meta?.url) {
      const res = await fetch(meta.url);
      if (res.ok) {
        linkMapMem = coerceLinkMap(await res.json());
        return linkMapMem;
      }
    }
  } catch {
    // fall through to empty
  }
  linkMapMem = coerceLinkMap(null);
  return linkMapMem;
}

/** Apply a transition to the freshest map state and persist the result. */
export async function updateLinkMap(
  transition: (map: LinkMap) => LinkMap,
): Promise<LinkMap> {
  const run = writeQueue.then(async () => {
    const current = await loadLinkMap();
    const next = transition(current);
    linkMapMem = next;
    try {
      await put(LINK_MAP_BLOB_KEY, JSON.stringify(next), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
      });
    } catch (error) {
      console.warn("payout-alerts: failed to persist link map:", error);
      // In-memory state still serves this instance.
    }
    return next;
  });
  writeQueue = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------------------
// MailerLite client (connect.mailerlite.com "new" API)
// ---------------------------------------------------------------------------

const ML_BASE = "https://connect.mailerlite.com/api";

/** Custom field (type: text) that must exist in the MailerLite account. */
export const WALLETS_FIELD = "wallet_addresses";

export interface MlSubscriber {
  id: string;
  email: string;
  fields?: Record<string, string | null>;
}

async function mlRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${ML_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // 204s and some errors have no body
  }
  return { status: res.status, json };
}

function subscriberFrom(json: unknown): MlSubscriber | null {
  const data = (json as { data?: MlSubscriber } | null)?.data;
  if (!data?.id || !data?.email) return null;
  return data;
}

/** Fetch by email or id; null when not found. */
export async function getSubscriber(
  apiKey: string,
  emailOrId: string,
): Promise<MlSubscriber | null> {
  const { status, json } = await mlRequest(
    apiKey,
    "GET",
    `/subscribers/${encodeURIComponent(emailOrId)}`,
  );
  if (status === 404) return null;
  if (status >= 400) throw new Error(`MailerLite GET subscriber ${status}`);
  return subscriberFrom(json);
}

/**
 * Create-or-update a subscriber (the endpoint upserts on existing email),
 * setting the wallets field and attaching the payout-alerts group.
 */
export async function upsertSubscriber(
  apiKey: string,
  groupId: string,
  email: string,
  walletsFieldValue: string,
): Promise<MlSubscriber> {
  const { status, json } = await mlRequest(apiKey, "POST", "/subscribers", {
    email,
    fields: { [WALLETS_FIELD]: walletsFieldValue },
    groups: [groupId],
  });
  if (status >= 400) throw new Error(`MailerLite upsert ${status}`);
  const sub = subscriberFrom(json);
  if (!sub) throw new Error("MailerLite upsert: malformed response");
  return sub;
}

/** Rewrite a subscriber's wallets field (used by unlink / change-email). */
export async function setSubscriberWallets(
  apiKey: string,
  subscriberId: string,
  walletsFieldValue: string,
): Promise<void> {
  const { status } = await mlRequest(
    apiKey,
    "PUT",
    `/subscribers/${encodeURIComponent(subscriberId)}`,
    { fields: { [WALLETS_FIELD]: walletsFieldValue } },
  );
  if (status >= 400) throw new Error(`MailerLite update ${status}`);
}

/** Detach a subscriber from the payout-alerts group (no wallets left). */
export async function removeFromGroup(
  apiKey: string,
  groupId: string,
  subscriberId: string,
): Promise<void> {
  const { status } = await mlRequest(
    apiKey,
    "DELETE",
    `/subscribers/${encodeURIComponent(subscriberId)}/groups/${encodeURIComponent(groupId)}`,
  );
  // 404 = already detached; treat as success.
  if (status >= 400 && status !== 404) {
    throw new Error(`MailerLite group detach ${status}`);
  }
}
