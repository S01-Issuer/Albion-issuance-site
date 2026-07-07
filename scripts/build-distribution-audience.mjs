#!/usr/bin/env node
/**
 * Build the MailerLite audience for a rewards distribution.
 *
 * Takes the distribution CSV(s) (the same wallet,amount files the claims
 * pipeline publishes), intersects their wallets with the payout-alerts group
 * subscribers (matched via the `wallet_addresses` custom field), and puts the
 * matches in a fresh per-distribution group. You then send the campaign to
 * that group from the MailerLite dashboard — targeting is automated, the send
 * stays human-in-the-loop.
 *
 * Usage:
 *   node scripts/build-distribution-audience.mjs \
 *     --group-name "Distribution 2026-07" \
 *     [--dry-run] \
 *     path/to/rewards-a.csv [path/to/rewards-b.csv ...]
 *
 * Env (same values the app uses):
 *   PRIVATE_MAILERLITE_API_KEY   MailerLite API token
 *   PRIVATE_MAILERLITE_GROUP_ID  id of the standing "Payout Alerts" group
 */
import { readFileSync } from "node:fs";

const ML_BASE = "https://connect.mailerlite.com/api";
const WALLETS_FIELD = "wallet_addresses";

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
let groupName = null;
let dryRun = false;
const csvPaths = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--group-name") groupName = args[++i];
  else if (args[i] === "--dry-run") dryRun = true;
  else csvPaths.push(args[i]);
}
if (!groupName) fail("--group-name is required (e.g. \"Distribution 2026-07\")");
if (csvPaths.length === 0) fail("pass at least one distribution CSV path");

const apiKey = process.env.PRIVATE_MAILERLITE_API_KEY;
const sourceGroupId = process.env.PRIVATE_MAILERLITE_GROUP_ID;
if (!apiKey) fail("PRIVATE_MAILERLITE_API_KEY is not set");
if (!sourceGroupId) fail("PRIVATE_MAILERLITE_GROUP_ID is not set");

// --- distribution wallets ---------------------------------------------------
// CSVs are tiny (hundreds of rows); tolerate header/headerless by keeping any
// field that looks like an address.
const distributionWallets = new Set();
for (const path of csvPaths) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    for (const cell of line.split(",")) {
      const v = cell.trim().toLowerCase();
      if (/^0x[0-9a-f]{40}$/.test(v)) distributionWallets.add(v);
    }
  }
}
if (distributionWallets.size === 0) fail("no wallet addresses found in the CSVs");
console.log(
  `${distributionWallets.size} distinct wallets across ${csvPaths.length} CSV(s)`,
);

// --- MailerLite -------------------------------------------------------------
async function ml(method, path, body) {
  const res = await fetch(`${ML_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`MailerLite ${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function listGroupSubscribers(groupId) {
  const subscribers = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const page = await ml("GET", `/groups/${groupId}/subscribers?${qs}`);
    subscribers.push(...(page?.data ?? []));
    cursor = page?.meta?.next_cursor ?? null;
  } while (cursor);
  return subscribers;
}

const subscribers = await listGroupSubscribers(sourceGroupId);
console.log(`${subscribers.length} subscribers in the payout-alerts group`);

const matched = subscribers.filter((sub) => {
  const field = sub.fields?.[WALLETS_FIELD] ?? "";
  return String(field)
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .some((w) => distributionWallets.has(w));
});

console.log(`${matched.length} subscribers hold a wallet in this distribution:`);
for (const sub of matched) {
  console.log(`  ${sub.email}  (${sub.fields?.[WALLETS_FIELD] ?? ""})`);
}

if (dryRun) {
  console.log("\n--dry-run: no group created, no subscribers assigned.");
  process.exit(0);
}
if (matched.length === 0) {
  console.log("\nNothing to do — no group created.");
  process.exit(0);
}

const created = await ml("POST", "/groups", { name: groupName });
const targetGroupId = created?.data?.id;
if (!targetGroupId) fail("group creation returned no id");
console.log(`\nCreated group "${groupName}" (id ${targetGroupId})`);

for (const sub of matched) {
  await ml("POST", `/subscribers/${sub.id}/groups/${targetGroupId}`);
}
console.log(
  `Assigned ${matched.length} subscribers. Send your campaign to "${groupName}" from the MailerLite dashboard.`,
);
