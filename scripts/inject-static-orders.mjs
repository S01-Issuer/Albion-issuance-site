// One-off codemod: bake static orderbook/deployBlock/orderBytes into network.ts
// for the 16 currently-subgraph-resolved PROD claim entries.
//
// Reads scripts/static-orders.json (already verified, committed) and inserts the
// three fields immediately after each matching claim entry's expectedContentHash
// value line. Idempotent: skips entries that already have orderBytes.
import { readFileSync, writeFileSync } from "node:fs";

const orders = JSON.parse(readFileSync("scripts/static-orders.json", "utf8"));
let net = readFileSync("src/lib/network.ts", "utf8");

const INDENT = "            "; // 12 spaces, matching existing claim fields

let injected = 0;
for (const o of orders) {
  // Locate the claim entry by orderHash (verified unique).
  const lc = net.toLowerCase();
  const hashIdx = lc.indexOf(o.orderHash.toLowerCase());
  if (hashIdx === -1) {
    throw new Error(`orderHash not found: ${o.orderHash}`);
  }
  // Ensure uniqueness.
  if (lc.indexOf(o.orderHash.toLowerCase(), hashIdx + 1) !== -1) {
    throw new Error(`orderHash appears more than once: ${o.orderHash}`);
  }

  // From the hash, find the expectedContentHash key, then the end of its
  // quoted value line (the line ending in `",`).
  const echKey = net.indexOf("expectedContentHash:", hashIdx);
  if (echKey === -1) {
    throw new Error(`expectedContentHash not found after ${o.orderHash}`);
  }
  // Find the closing `",` of the expectedContentHash value (it's on the next line).
  const valEnd = net.indexOf('",', echKey);
  if (valEnd === -1) {
    throw new Error(`expectedContentHash value end not found for ${o.orderHash}`);
  }
  const insertAt = valEnd + 2; // just after `",`

  // Idempotency / safety: don't double-inject. Check the immediate following
  // window doesn't already declare orderBytes.
  const following = net.slice(insertAt, insertAt + 200);
  if (following.includes("orderBytes:")) {
    continue;
  }

  const block =
    "\n" +
    `${INDENT}orderbook: "${o.orderbook}",\n` +
    `${INDENT}deployBlock: ${o.deployBlock},\n` +
    `${INDENT}orderBytes:\n` +
    `${INDENT}  "${o.orderBytes}",`;

  net = net.slice(0, insertAt) + block + net.slice(insertAt);
  injected++;
}

writeFileSync("src/lib/network.ts", net);
console.log(`injected ${injected}/${orders.length}`);
