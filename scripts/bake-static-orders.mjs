/**
 * One-off generator: bake static order data for the subgraph-resolved claim orders.
 *
 * Background (v4 -> v6 migration): most PROD claim entries in network.ts already
 * carry static `orderBytes` + `deployBlock`. The remaining 16 (the v4 + April
 * orders) are still resolved at runtime via the OrderBook subgraph(s). This script
 * fetches the static order data for those 16 so a later task can bake them into
 * network.ts and delete the runtime lookup.
 *
 * For each of the 16 orders that LACK `orderBytes` in PROD, this:
 *   1. queries EVERY ORDERBOOK_SOURCES subgraph (v4 + v6, like the app does) for
 *      the order's `orderBytes` and `addEvents[0].transaction.blockNumber`,
 *   2. picks the best result (longest non-empty orderBytes) and records WHICH
 *      orderbook contract address returned it -> the `orderbook` value,
 *   3. HARD cross-check: verifies the fetched `orderBytes` embeds the
 *      `expectedMerkleRoot` from network.ts (proving the on-chain order commits to
 *      the root we claim). PASS/FAIL per order; non-zero exit if any FAIL.
 *
 * Output: per-order orderHash / orderbook / deployBlock / orderBytes + PASS/FAIL,
 * a summary `N/M passed`, and (on full pass) scripts/static-orders.json for the
 * next task to consume.
 *
 * Run from the issuance-site dir:  node scripts/bake-static-orders.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import axios from "axios";

// ---------------------------------------------------------------------------
// 1. Parse PROD claim entries out of network.ts.
//    Select the 16 that LACK `orderBytes`. DEV entries are out of scope.
// ---------------------------------------------------------------------------
const netUrl = new URL("../src/lib/network.ts", import.meta.url);
const src = readFileSync(netUrl, "utf8");

const prodStart = src.indexOf("const PROD_ENERGY_FIELDS");
const prodEnd = src.indexOf("export function getEnergyFields");
if (prodStart === -1 || prodEnd === -1) {
  throw new Error("Could not locate PROD_ENERGY_FIELDS block in network.ts");
}
const prod = src.slice(prodStart, prodEnd);

// Split into per-claim objects on the `orderHash:` anchor so each chunk holds
// exactly one claim's fields (orderHash, expectedMerkleRoot, optional orderBytes).
const hashRe = /orderHash:\s*\n?\s*"(0x[0-9a-fA-F]{64})"/g;
const anchors = [];
let hm;
while ((hm = hashRe.exec(prod)) !== null) {
  anchors.push({ orderHash: hm[1].toLowerCase(), start: hm.index });
}

const entries = [];
for (let i = 0; i < anchors.length; i++) {
  const chunk = prod.slice(
    anchors[i].start,
    i + 1 < anchors.length ? anchors[i + 1].start : prod.length,
  );
  const rootM = chunk.match(/expectedMerkleRoot:\s*\n?\s*"(0x[0-9a-fA-F]+)"/);
  const bytesM = chunk.match(/orderBytes:\s*\n?\s*"(0x[0-9a-fA-F]+)"/);
  if (!rootM) {
    throw new Error(`No expectedMerkleRoot for order ${anchors[i].orderHash}`);
  }
  entries.push({
    orderHash: anchors[i].orderHash,
    expectedMerkleRoot: rootM[1].toLowerCase(),
    hasOrderBytes: Boolean(bytesM),
  });
}

const targets = entries.filter((e) => !e.hasOrderBytes);
console.log(
  `Parsed ${entries.length} PROD claim entries; ` +
    `${entries.length - targets.length} already have orderBytes, ` +
    `${targets.length} lack it (targets).\n`,
);
if (targets.length !== 16) {
  throw new Error(
    `Expected exactly 16 PROD orders lacking orderBytes, found ${targets.length}. Aborting.`,
  );
}

// ---------------------------------------------------------------------------
// 2. Build the ORDERBOOK_SOURCES list (address + subgraph URLs) from network.ts.
//    The orderbook addresses are inlined constants; the subgraph URLs come from
//    the BASE_ORDERBOOK*_SUBGRAPH_URL string literals (fallbacks are env-driven
//    and unavailable in a plain node run, so we use the hardcoded primaries).
// ---------------------------------------------------------------------------
function constVal(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*\\n?\\s*"([^"]+)"`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not read const ${name} from network.ts`);
  return m[1];
}

const SOURCES = [
  {
    address: constVal("ORDERBOOK_CONTRACT_ADDRESS"),
    version: "v4",
    subgraphUrls: [constVal("BASE_ORDERBOOK_SUBGRAPH_URL")],
  },
  {
    address: constVal("ORDERBOOK_V6_CONTRACT_ADDRESS"),
    version: "v6",
    subgraphUrls: [constVal("BASE_ORDERBOOK_V6_SUBGRAPH_URL")],
  },
];
console.log("OrderBook sources:");
for (const s of SOURCES) console.log(`  ${s.version}  ${s.address}  ${s.subgraphUrls[0]}`);
console.log("");

// ---------------------------------------------------------------------------
// 3. Query each subgraph for all 16 order hashes (batched, like getOrdersByHashes).
//    Tag every returned order with its source orderbook address.
// ---------------------------------------------------------------------------
const ORDERS_QUERY = `
  query GetOrdersByHashes($orderHashes: [String!]!) {
    orders(where: { orderHash_in: $orderHashes }) {
      orderBytes
      orderHash
      addEvents { transaction { id timestamp blockNumber } }
    }
  }
`;

async function gqlFirstAvailable(urls, query, variables) {
  let lastErr;
  for (const url of urls) {
    try {
      const r = await axios.post(
        url,
        { query, variables },
        { timeout: 30000, headers: { "content-type": "application/json" } },
      );
      if (r.data?.errors) {
        lastErr = new Error(JSON.stringify(r.data.errors));
        continue;
      }
      return r.data?.data ?? null;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error(`all subgraph URLs failed: ${urls.join(", ")}`);
}

const hashes = targets.map((t) => t.orderHash);
// orderHash -> list of { orderbook, orderBytes, deployBlock }
const found = new Map();
for (const h of hashes) found.set(h, []);

for (const source of SOURCES) {
  let data;
  try {
    data = await gqlFirstAvailable(source.subgraphUrls, ORDERS_QUERY, {
      orderHashes: hashes,
    });
  } catch (e) {
    console.warn(`!! source ${source.version} (${source.address}) query failed: ${e.message}`);
    continue;
  }
  const orders = data?.orders ?? [];
  console.log(`Source ${source.version} ${source.address}: returned ${orders.length} orders`);
  for (const o of orders) {
    const key = o.orderHash?.toLowerCase();
    if (!key || !found.has(key)) continue;
    const deployBlock = o.addEvents?.[0]?.transaction?.blockNumber ?? null;
    found.get(key).push({
      orderbook: source.address,
      version: source.version,
      orderBytes: o.orderBytes ?? "",
      deployBlock: deployBlock !== null ? parseInt(deployBlock, 10) : null,
    });
  }
}
console.log("");

// Prefer the candidate carrying the longest non-empty orderBytes (mirrors
// pickBestOrderForHash in claimsRepository.ts).
function pickBest(candidates) {
  if (candidates.length === 0) return undefined;
  const scored = [...candidates].sort(
    (a, b) => (b.orderBytes?.length ?? 0) - (a.orderBytes?.length ?? 0),
  );
  return scored.find((c) => c.orderBytes && c.orderBytes.length > 2) ?? scored[0];
}

// ---------------------------------------------------------------------------
// 4. Per-order: resolve best candidate, hard cross-check root embedding, report.
// ---------------------------------------------------------------------------
const results = [];
let fail = 0;
for (const t of targets) {
  const candidates = found.get(t.orderHash) ?? [];
  const best = pickBest(candidates);

  let pass = false;
  let reason = "";
  let orderbook = null;
  let deployBlock = null;
  let orderBytes = "";

  if (!best) {
    reason = "NOT FOUND on any subgraph";
  } else {
    orderbook = best.orderbook;
    deployBlock = best.deployBlock;
    orderBytes = best.orderBytes ?? "";
    const hasBytes = orderBytes && orderBytes.length > 2;
    const rootNoPrefix = t.expectedMerkleRoot.slice(2).toLowerCase();
    const embedded = hasBytes && orderBytes.toLowerCase().includes(rootNoPrefix);
    const hasBlock = deployBlock !== null && Number.isFinite(deployBlock);
    if (!hasBytes) reason = "empty orderBytes";
    else if (!embedded) reason = "expectedMerkleRoot NOT embedded in orderBytes";
    else if (!hasBlock) reason = "missing deployBlock";
    else pass = true;
  }

  if (!pass) fail++;
  results.push({
    orderHash: t.orderHash,
    orderbook,
    deployBlock,
    orderBytes,
    expectedMerkleRoot: t.expectedMerkleRoot,
    sourcesReturning: candidates.map((c) => `${c.version}:${c.orderbook}`),
    pass,
    reason,
  });

  console.log(`${pass ? "PASS" : "FAIL"} ${t.orderHash}`);
  console.log(`   orderbook:          ${orderbook ?? "(none)"}`);
  console.log(`   deployBlock:        ${deployBlock ?? "(none)"}`);
  console.log(`   expectedMerkleRoot: ${t.expectedMerkleRoot}`);
  console.log(
    `   sourcesReturning:   ${
      candidates.length ? candidates.map((c) => c.version).join(", ") : "(none)"
    }`,
  );
  if (!pass) console.log(`   reason:             ${reason}`);
  console.log(`   orderBytes:         ${orderBytes || "(empty)"}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// 5. Summary + json output (only when everything passes).
// ---------------------------------------------------------------------------
const passCount = results.length - fail;
console.log(`\n${passCount}/${results.length} passed cross-check.`);

if (fail === 0) {
  const patch = results.map((r) => ({
    orderHash: r.orderHash,
    orderbook: r.orderbook,
    deployBlock: r.deployBlock,
    orderBytes: r.orderBytes,
  }));
  const outUrl = new URL("./static-orders.json", import.meta.url);
  writeFileSync(outUrl, JSON.stringify(patch, null, 2) + "\n");
  console.log(`Wrote ${patch.length} entries to scripts/static-orders.json`);
} else {
  console.log("FAILs present -> not writing static-orders.json. Investigate before baking.");
  process.exitCode = 1;
}
